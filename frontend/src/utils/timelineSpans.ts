import type { SemanticEvent, EventCategory } from '../types';

export const CATEGORY_COLORS: Record<EventCategory, string> = {
  session: '#E5A922',
  audio: '#47D05A',
  agent: '#bc8cff',
  tool: '#6BAFFF',
  error: '#FF6363',
  llm: '#FF9F43',
};

export function formatTs(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) +
    '.' + String(d.getMilliseconds()).padStart(3, '0');
}

export function formatDelta(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
  return `${Math.floor(ms / 60000)}m ${((ms % 60000) / 1000).toFixed(1)}s`;
}

/** A `tool.called` event paired with its matching `tool.result` (if any). */
export interface ToolSpan {
  id: string;
  name: string;
  calledAt: number;
  resultAt: number | null;
  args?: Record<string, unknown>;
  result?: Record<string, unknown>;
  calledEvent: SemanticEvent;
  resultEvent: SemanticEvent | null;
}

function readInner(evt: SemanticEvent): Record<string, unknown> | undefined {
  const d = evt.details as Record<string, unknown> | undefined;
  return (d?.data as Record<string, unknown>) ?? d;
}

export function computeSpans(events: SemanticEvent[]): ToolSpan[] {
  const spans: ToolSpan[] = [];
  const pending = new Map<string, { evt: SemanticEvent; args?: Record<string, unknown> }>();

  for (const evt of events) {
    const inner = readInner(evt);
    const name = (inner?.name as string) || '';

    if (evt.type === 'tool.called' && name) {
      const args = (inner?.arguments as Record<string, unknown>) ?? undefined;
      pending.set(name + ':' + evt.id, { evt, args });
    } else if (evt.type === 'tool.result' && name) {
      let matchKey = '';
      for (const [k] of pending) if (k.startsWith(name + ':')) matchKey = k;
      if (matchKey) {
        const called = pending.get(matchKey)!;
        pending.delete(matchKey);
        const result = (inner?.result as Record<string, unknown>) ?? undefined;
        spans.push({
          id: called.evt.id,
          name,
          calledAt: called.evt.timestamp,
          resultAt: evt.timestamp,
          args: called.args,
          result,
          calledEvent: called.evt,
          resultEvent: evt,
        });
      }
    }
  }

  for (const [, { evt, args }] of pending) {
    const inner = readInner(evt);
    spans.push({
      id: evt.id,
      name: (inner?.name as string) || 'unknown',
      calledAt: evt.timestamp,
      resultAt: null,
      args,
      calledEvent: evt,
      resultEvent: null,
    });
  }
  return spans;
}
