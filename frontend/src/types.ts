export type Pattern = 'chat-supervisor' | 'sequential-handoff';

export type SessionStatus = 'idle' | 'connecting' | 'active' | 'ended';

export type TurnDetectionMode = 'semantic_vad' | 'server_vad' | 'none';
export type NoiseReductionType = 'near_field' | 'far_field' | 'off';
export type CompactionStrategy = 'off' | 'rolling_5' | 'rolling_10' | 'token_budget_4k';

export interface SessionConfig {
  model: string;
  temperature: number;
  voice: string;
  turnDetection: TurnDetectionMode;
  noiseReduction: NoiseReductionType;
  echoCancellation: boolean;
  vadThreshold: number;
  silenceDurationMs: number;
  maxOutputTokens: number | 'inf';
  compactionStrategy: CompactionStrategy;
}

export const DEFAULT_SESSION_CONFIG: SessionConfig = {
  model: 'gpt-realtime',
  temperature: 0.8,
  voice: 'en-US-Aria:DragonHDLatestNeural',
  turnDetection: 'semantic_vad',
  noiseReduction: 'far_field',
  echoCancellation: true,
  vadThreshold: 0.5,
  silenceDurationMs: 500,
  maxOutputTokens: 'inf',
  compactionStrategy: 'off',
};

export interface TranscriptMessage {
  id: string;
  role: 'user' | 'agent' | 'system';
  text: string;
  timestamp: number;
  isPartial: boolean;
  agentName?: string;
}

export type EventCategory = 'session' | 'audio' | 'agent' | 'tool' | 'error' | 'llm';

export interface SemanticEvent {
  id: string;
  type: string;
  category: EventCategory;
  description: string;
  timestamp: number;
  details?: Record<string, unknown>;
}

export interface SessionState {
  status: SessionStatus;
  sessionId: string | null;
  pattern: Pattern;
  activeAgent: string | null;
}

export interface WebSocketMessage {
  type: string;
  [key: string]: unknown;
}

// ── Discriminated union for typed message handling ──

export interface TranscriptDeltaMessage {
  type: 'transcript.delta';
  data: { delta: string; agentName?: string };
}

export interface TranscriptDoneMessage {
  type: 'transcript.done';
  data: { transcript: string; agentName?: string };
}

export interface AgentHandoffMessage {
  type: 'agent.switch' | 'agent.handoff';
  data: { from?: string; to?: string; reason?: string; new_tools?: string[]; new_instructions_preview?: string };
}

export interface SupervisorExchangeMessage {
  type: 'supervisor.exchange';
  data: { model?: string; tool_context?: string; prompt_preview?: string; response?: unknown; usage?: Record<string, number> };
}

export interface ToolCalledMessage {
  type: 'tool.called';
  data: { name: string; arguments?: Record<string, unknown> };
}

export interface ToolResultMessage {
  type: 'tool.result';
  data: { name: string; result?: Record<string, unknown> };
}

export interface ResponseDoneMessage {
  type: 'response.done';
  data: { usage?: Record<string, number> };
}

export interface ErrorMessage {
  type: 'error';
  data?: { message?: string };
  message?: string;
}

export interface TextSentMessage {
  type: 'text.sent';
  data: { text: string };
}

export interface PromptUpdatedMessage {
  type: 'prompt.updated' | 'session.prompt_updated';
  data: { agent?: string; [key: string]: unknown };
}

export interface SessionLifecycleMessage {
  type: 'session.created' | 'session.ended';
  data?: Record<string, unknown>;
}

export interface AudioStartedMessage {
  type: 'audio.started';
  data?: Record<string, unknown>;
}

export interface AudioDeltaMessage {
  type: 'audio.delta';
  audio?: string;
}

export interface ResponseCreatedMessage {
  type: 'response.created';
  data?: Record<string, unknown>;
}

export interface UnknownMessage {
  type: string;
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

export type TypedMessage =
  | TranscriptDeltaMessage
  | TranscriptDoneMessage
  | AgentHandoffMessage
  | SupervisorExchangeMessage
  | ToolCalledMessage
  | ToolResultMessage
  | ResponseDoneMessage
  | ErrorMessage
  | TextSentMessage
  | PromptUpdatedMessage
  | SessionLifecycleMessage
  | AudioStartedMessage
  | AudioDeltaMessage
  | ResponseCreatedMessage;

// ── Shared domain types ──

export interface ClaimResult {
  claim_number: string;
  claim_type: string;
  data_points_collected: number;
  status: string;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export type FieldStatus = 'not-asked' | 'asked' | 'answered' | 'validated';

export interface FieldState {
  id: string;
  label: string;
  status: FieldStatus;
  value?: string;
}

export interface CollectedData {
  claimType: string | null;
  fields: FieldState[];
  location: string | null;
  progress: number;
}
