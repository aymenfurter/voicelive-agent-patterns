/**
 * Pure message → effect transforms. Handlers return effects; an applier writes
 * them through the dependency surface. This keeps handlers free of React state
 * setters and makes them unit-testable in isolation.
 */
import type {
  WebSocketMessage,
  TypedMessage,
  SemanticEvent,
  TranscriptMessage,
  ClaimResult,
  TokenUsage,
  TranscriptDeltaMessage,
  TranscriptDoneMessage,
  AgentHandoffMessage,
  SupervisorExchangeMessage,
  ToolCalledMessage,
  ToolResultMessage,
  ResponseDoneMessage,
  ErrorMessage,
  TextSentMessage,
  PromptUpdatedMessage,
  SessionLifecycleMessage,
  AudioStartedMessage,
  AudioDeltaMessage,
  ResponseCreatedMessage,
} from '../types';
import { makeEvent } from './makeEvent';
import {
  PARTIAL_RESPONSE_ID,
  MSG_TRANSCRIPT_DELTA,
  MSG_TRANSCRIPT_DONE,
  MSG_SESSION_CREATED,
  MSG_SESSION_ENDED,
  MSG_AGENT_SWITCH,
  MSG_AGENT_HANDOFF,
  MSG_SUPERVISOR_EXCHANGE,
  MSG_TOOL_CALLED,
  MSG_TOOL_RESULT,
  MSG_AUDIO_STARTED,
  MSG_AUDIO_STOPPED,
  MSG_AUDIO_DELTA,
  MSG_RESPONSE_CREATED,
  MSG_RESPONSE_DONE,
  MSG_ERROR,
  MSG_TEXT_SENT,
  MSG_PROMPT_UPDATED,
  MSG_SESSION_PROMPT_UPDATED,
  SUPPRESSED_EVENT_TYPES,
  TOOL_SUBMIT_CLAIM,
} from '../constants';

export interface MessageHandlerDeps {
  addMessage: (msg: TranscriptMessage) => void;
  updatePartialMessage: (id: string, delta: string, role: 'user' | 'agent', agentName?: string) => void;
  addEvent: (event: SemanticEvent) => void;
  playChunk: (b64: string) => void;
  flushAudio: () => void;
  setClaimResult: (result: ClaimResult) => void;
  setTokenUsage: (updater: (prev: TokenUsage) => TokenUsage) => void;
}

export type Effect =
  | { kind: 'event'; event: SemanticEvent }
  | { kind: 'addMessage'; message: TranscriptMessage }
  | { kind: 'updatePartial'; id: string; delta: string; role: 'user' | 'agent'; agentName?: string }
  | { kind: 'play'; audio: string }
  | { kind: 'flush' }
  | { kind: 'claim'; claim: ClaimResult }
  | { kind: 'tokens'; usage: { input: number; output: number; total: number } };

// ── Handlers (pure) ────────────────────────────────────────────────────────

function onTranscriptDelta(msg: TranscriptDeltaMessage): Effect[] {
  return [{
    kind: 'updatePartial',
    id: PARTIAL_RESPONSE_ID,
    delta: msg.data.delta ?? '',
    role: 'agent',
    agentName: msg.data.agentName,
  }];
}

function onTranscriptDone(msg: TranscriptDoneMessage): Effect[] {
  return [{
    kind: 'addMessage',
    message: {
      id: crypto.randomUUID(),
      role: 'agent',
      text: msg.data.transcript ?? '',
      timestamp: Date.now(),
      isPartial: false,
      agentName: msg.data.agentName,
    },
  }];
}

function onSessionLifecycle(msg: SessionLifecycleMessage): Effect[] {
  const description = msg.type === MSG_SESSION_CREATED ? 'Session started' : 'Session ended';
  return [{ kind: 'event', event: makeEvent(msg.type, 'session', description) }];
}

function onAgentHandoff(msg: AgentHandoffMessage): Effect[] {
  const { from, to, reason, new_tools, new_instructions_preview } = msg.data;
  const toolsPreview = Array.isArray(new_tools) ? new_tools.join(', ') : '';
  let desc = `Agent handoff: ${from ?? '?'} → ${to ?? '?'}`;
  if (reason) desc += ` — "${reason}"`;
  return [{
    kind: 'event',
    event: makeEvent(msg.type, 'agent', desc, {
      from,
      to,
      reason: reason ?? '',
      new_instructions_preview,
      new_tools: toolsPreview || undefined,
    }),
  }];
}

function onSupervisorExchange(msg: SupervisorExchangeMessage): Effect[] {
  const model = msg.data.model || 'gpt-4.1';
  const toolCtx = msg.data.tool_context || '';
  const promptPreview = msg.data.prompt_preview || '';
  let desc = `Supervisor (${model})`;
  if (toolCtx) desc += `\nfor ${toolCtx}`;
  if (promptPreview) desc += `: ${promptPreview.slice(0, 80)}`;
  return [{
    kind: 'event',
    event: makeEvent(MSG_SUPERVISOR_EXCHANGE, 'llm', desc, {
      model,
      tool_context: toolCtx,
      prompt_preview: promptPreview,
      response: msg.data.response,
      usage: msg.data.usage,
    }),
  }];
}

function onToolCalled(msg: ToolCalledMessage): Effect[] {
  const { name, arguments: args } = msg.data;
  let desc = `Tool: ${name ?? 'unknown'}`;
  if (args) {
    const parts: string[] = [];
    if (args.question_id) parts.push(`question_id="${args.question_id}"`);
    if (args.answer) parts.push(`answer="${String(args.answer).slice(0, 40)}"`);
    if (args.agent_name) parts.push(`→ ${args.agent_name}`);
    if (parts.length) desc += `\n${parts.join(', ')}`;
  }
  return [{ kind: 'event', event: makeEvent(MSG_TOOL_CALLED, 'tool', desc, msg as unknown as Record<string, unknown>) }];
}

function onToolResult(msg: ToolResultMessage): Effect[] {
  const { name, result } = msg.data;
  let desc: string;
  if (result && typeof result.valid === 'boolean') {
    desc = `Result: ${name}\nvalid: ${result.valid}`;
  } else if (result?.status) {
    desc = `Result: ${name}\nstatus: ${result.status}`;
  } else {
    desc = `Result: ${name}`;
  }

  const effects: Effect[] = [{
    kind: 'event',
    event: makeEvent(MSG_TOOL_RESULT, 'tool', desc, msg as unknown as Record<string, unknown>),
  }];

  if (name === TOOL_SUBMIT_CLAIM && result?.status === 'submitted' && result?.claim_number) {
    effects.push({
      kind: 'claim',
      claim: {
        claim_number: result.claim_number as string,
        claim_type: (result.claim_type as string) ?? 'unknown',
        data_points_collected: (result.data_points_collected as number) ?? 0,
        status: 'submitted',
      },
    });
  }
  return effects;
}

function onAudioStarted(_msg: AudioStartedMessage): Effect[] {
  return [
    { kind: 'flush' },
    { kind: 'event', event: makeEvent('user.turn', 'audio', 'User speaking') },
  ];
}

function onResponseCreated(_msg: ResponseCreatedMessage): Effect[] {
  return [{ kind: 'event', event: makeEvent(MSG_RESPONSE_CREATED, 'session', 'Agent thinking…') }];
}

function onResponseDone(msg: ResponseDoneMessage): Effect[] {
  const usage = msg.data.usage ?? {};
  const total = usage.total_tokens ?? 0;
  const input = usage.input_tokens ?? 0;
  const output = usage.output_tokens ?? 0;

  const description = total
    ? `[${total} tokens] (${input} in / ${output} out)\nAgent finished responding`
    : 'Agent finished responding';

  const effects: Effect[] = [{
    kind: 'event',
    event: makeEvent(MSG_RESPONSE_DONE, 'session', description, total ? { usage } : undefined),
  }];
  if (total) effects.push({ kind: 'tokens', usage: { input, output, total } });
  return effects;
}

function onError(msg: ErrorMessage): Effect[] {
  const message = msg.data?.message ?? msg.message ?? 'Unknown error';
  return [{ kind: 'event', event: makeEvent(MSG_ERROR, 'error', message, msg as unknown as Record<string, unknown>) }];
}

function onTextSent(msg: TextSentMessage): Effect[] {
  return [{
    kind: 'addMessage',
    message: {
      id: crypto.randomUUID(),
      role: 'user',
      text: msg.data.text ?? '',
      timestamp: Date.now(),
      isPartial: false,
    },
  }];
}

function onPromptUpdated(msg: PromptUpdatedMessage): Effect[] {
  const agent = msg.data.agent;
  return [{
    kind: 'event',
    event: makeEvent(msg.type, 'session', `Prompt updated${agent ? ` (${agent})` : ''}`, msg.data),
  }];
}

function onAudioDelta(msg: AudioDeltaMessage): Effect[] {
  return msg.audio ? [{ kind: 'play', audio: msg.audio }] : [];
}

function onUnknown(msg: WebSocketMessage): Effect[] {
  return [{
    kind: 'event',
    event: makeEvent(msg.type, 'session', msg.type, msg as unknown as Record<string, unknown>),
  }];
}

// ── Dispatch ──────────────────────────────────────────────────────────────

export function toEffects(raw: WebSocketMessage): Effect[] {
  if (raw.type === MSG_AUDIO_DELTA) return onAudioDelta(raw as AudioDeltaMessage);

  if (SUPPRESSED_EVENT_TYPES.has(raw.type) && raw.type !== MSG_AUDIO_STARTED) return [];
  if (raw.type === MSG_AUDIO_STOPPED) return [];

  const msg = raw as TypedMessage;
  switch (msg.type) {
    case MSG_TRANSCRIPT_DELTA: return onTranscriptDelta(msg);
    case MSG_TRANSCRIPT_DONE: return onTranscriptDone(msg);
    case MSG_SESSION_CREATED:
    case MSG_SESSION_ENDED: return onSessionLifecycle(msg);
    case MSG_AGENT_SWITCH:
    case MSG_AGENT_HANDOFF: return onAgentHandoff(msg);
    case MSG_SUPERVISOR_EXCHANGE: return onSupervisorExchange(msg);
    case MSG_TOOL_CALLED: return onToolCalled(msg);
    case MSG_TOOL_RESULT: return onToolResult(msg);
    case MSG_AUDIO_STARTED: return onAudioStarted(msg);
    case MSG_RESPONSE_CREATED: return onResponseCreated(msg);
    case MSG_RESPONSE_DONE: return onResponseDone(msg);
    case MSG_ERROR: return onError(msg);
    case MSG_TEXT_SENT: return onTextSent(msg);
    case MSG_PROMPT_UPDATED:
    case MSG_SESSION_PROMPT_UPDATED: return onPromptUpdated(msg);
    default: return onUnknown(raw);
  }
}

export function applyEffects(effects: Effect[], deps: MessageHandlerDeps): void {
  for (const eff of effects) {
    switch (eff.kind) {
      case 'event': deps.addEvent(eff.event); break;
      case 'addMessage': deps.addMessage(eff.message); break;
      case 'updatePartial':
        deps.updatePartialMessage(eff.id, eff.delta, eff.role, eff.agentName);
        break;
      case 'play': deps.playChunk(eff.audio); break;
      case 'flush': deps.flushAudio(); break;
      case 'claim': deps.setClaimResult(eff.claim); break;
      case 'tokens':
        deps.setTokenUsage((prev) => ({
          inputTokens: prev.inputTokens + eff.usage.input,
          outputTokens: prev.outputTokens + eff.usage.output,
          totalTokens: prev.totalTokens + eff.usage.total,
        }));
        break;
    }
  }
}

export function dispatchMessage(msg: WebSocketMessage, deps: MessageHandlerDeps): void {
  applyEffects(toEffects(msg), deps);
}
