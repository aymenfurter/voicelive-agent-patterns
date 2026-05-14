/** Centralized constants — avoids magic strings scattered across the codebase. */

// Well-known partial message ID used during streaming
export const PARTIAL_RESPONSE_ID = 'current-response';

// Tool names referenced by multiple components
export const TOOL_GET_NEXT_QUESTIONS = 'get_next_questions';
export const TOOL_VALIDATE_ANSWER = 'validate_answer';
export const TOOL_SUBMIT_CLAIM = 'submit_claim_data';

// Message types
export const MSG_TRANSCRIPT_DELTA = 'transcript.delta';
export const MSG_TRANSCRIPT_DONE = 'transcript.done';
export const MSG_SESSION_CREATED = 'session.created';
export const MSG_SESSION_ENDED = 'session.ended';
export const MSG_AGENT_SWITCH = 'agent.switch';
export const MSG_AGENT_HANDOFF = 'agent.handoff';
export const MSG_SUPERVISOR_EXCHANGE = 'supervisor.exchange';
export const MSG_TOOL_CALLED = 'tool.called';
export const MSG_TOOL_RESULT = 'tool.result';
export const MSG_AUDIO_STARTED = 'audio.started';
export const MSG_AUDIO_STOPPED = 'audio.stopped';
export const MSG_AUDIO_DELTA = 'audio.delta';
export const MSG_AUDIO_DONE = 'audio.done';
export const MSG_RESPONSE_CREATED = 'response.created';
export const MSG_RESPONSE_DONE = 'response.done';
export const MSG_ERROR = 'error';
export const MSG_TEXT_SENT = 'text.sent';
export const MSG_PROMPT_UPDATED = 'prompt.updated';
export const MSG_SESSION_PROMPT_UPDATED = 'session.prompt_updated';

// Suppressed streaming event types (handled elsewhere)
export const SUPPRESSED_EVENT_TYPES = new Set([
  MSG_AUDIO_DELTA,
  MSG_AUDIO_DONE,
  MSG_TRANSCRIPT_DELTA,
  'response.content_part.added',
  'response.content_part.done',
  'response.output_item.added',
  'response.output_item.done',
  'conversation.item.created',
  'input_audio_buffer.committed',
  'tool.arguments.delta',
  'response.function_call_arguments.delta',
  'response.function_call_arguments.done',
]);

// Location-relevant question IDs (for map geocoding)
export const LOCATION_QUESTION_IDS = new Set([
  'auto_incident_location',
  'property_address',
]);
