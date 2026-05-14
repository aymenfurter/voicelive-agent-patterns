/**
 * Typed builders for WebSocket frames sent from the mocked backend.
 * Keeps payload shape in one place so a schema change is a one-line fix.
 */

export type WsEvent = { type: string; data: Record<string, unknown> };

export const events = {
  sessionCreated: (): WsEvent => ({ type: 'session.created', data: {} }),
  sessionUpdated: (): WsEvent => ({ type: 'session.updated', data: {} }),
  responseCreated: (): WsEvent => ({ type: 'response.created', data: {} }),
  responseDone: (): WsEvent => ({ type: 'response.done', data: {} }),

  transcriptDelta: (delta: string): WsEvent => ({
    type: 'transcript.delta',
    data: { delta },
  }),
  transcriptDone: (transcript: string, agentName?: string): WsEvent => ({
    type: 'transcript.done',
    data: agentName ? { transcript, agentName } : { transcript },
  }),

  toolCalled: (name: string, args: Record<string, unknown> = {}): WsEvent => ({
    type: 'tool.called',
    data: { name, arguments: args },
  }),
  toolResult: (name: string, result: unknown): WsEvent => ({
    type: 'tool.result',
    data: { name, result },
  }),

  supervisorExchange: (data: {
    model: string;
    tool_context?: string;
    prompt_preview?: string;
    response: string;
    usage?: { prompt_tokens: number; completion_tokens: number };
  }): WsEvent => ({ type: 'supervisor.exchange', data }),

  agentHandoff: (data: {
    from: string;
    to: string;
    reason?: string;
    new_tools?: string[];
  }): WsEvent => ({ type: 'agent.handoff', data }),

  error: (message: string): WsEvent => ({
    type: 'error',
    data: { message },
  }),

  textSent: (text: string): WsEvent => ({
    type: 'text.sent',
    data: { text },
  }),

  promptUpdated: (data: {
    agent: string;
    prompt: string;
    reason: string;
  }): WsEvent => ({ type: 'session.prompt_updated', data }),
};
