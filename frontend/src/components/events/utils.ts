import type { SemanticEvent } from '../../types';

export function formatTime(ts: number): string {
  const d = new Date(ts);
  return (
    d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) +
    '.' +
    String(d.getMilliseconds()).padStart(3, '0')
  );
}

export function formatDelta(ms: number): string {
  if (ms < 1000) return `+${ms}ms`;
  return `+${(ms / 1000).toFixed(2)}s`;
}

export interface ToolSpan {
  name: string;
  calledAt: number;
  resultAt: number | null;
  calledEvent: SemanticEvent;
  resultEvent: SemanticEvent | null;
}

export function computeToolSpans(events: SemanticEvent[]): ToolSpan[] {
  const spans: ToolSpan[] = [];
  const pending = new Map<string, SemanticEvent>();

  for (const evt of events) {
    const d = evt.details as Record<string, unknown> | undefined;
    const inner = (d?.data as Record<string, unknown>) ?? d;
    const name = inner?.name as string | undefined;

    if (evt.type === 'tool.called' && name) {
      pending.set(name, evt);
    } else if (evt.type === 'tool.result' && name && pending.has(name)) {
      const called = pending.get(name)!;
      pending.delete(name);
      spans.push({ name, calledAt: called.timestamp, resultAt: evt.timestamp, calledEvent: called, resultEvent: evt });
    }
  }
  for (const [name, called] of pending) {
    spans.push({ name, calledAt: called.timestamp, resultAt: null, calledEvent: called, resultEvent: null });
  }
  return spans;
}

/**
 * Returns an SVG path string for event icons (rendered via inline SVG in EventsList).
 * Format: [viewBox, ...paths] where paths are d-attribute strings.
 */
export type IconDef = { viewBox: string; paths: string[]; stroke?: string };

const ICONS: Record<string, IconDef> = {
  bolt: { viewBox: '0 0 16 16', paths: ['M9 1L3 9h4l-1 6 6-8H8l1-6'] },
  stop: { viewBox: '0 0 16 16', paths: ['M4 4h8v8H4z'] },
  mic: { viewBox: '0 0 16 16', paths: ['M8 1a2 2 0 012 2v4a2 2 0 11-4 0V3a2 2 0 012-2z', 'M4 7a4 4 0 008 0', 'M8 13v2'] },
  gear: { viewBox: '0 0 16 16', paths: ['M8 10a2 2 0 100-4 2 2 0 000 4z', 'M13.5 8a5.5 5.5 0 01-.3 1.3l1.2 1-.8 1.4-1.5-.5a5.5 5.5 0 01-1.1.6l-.2 1.6h-1.6l-.2-1.6a5.5 5.5 0 01-1.1-.6l-1.5.5-.8-1.4 1.2-1A5.5 5.5 0 015.5 8c0-.5 0-.9.1-1.3l-1.2-1 .8-1.4 1.5.5a5.5 5.5 0 011.1-.6L8.1 2.6h1.6l.2 1.6c.4.1.8.3 1.1.6l1.5-.5.8 1.4-1.2 1c.2.4.3.8.3 1.3z'] },
  check: { viewBox: '0 0 16 16', paths: ['M3 8l4 4 6-7'], stroke: 'var(--ok)' },
  cross: { viewBox: '0 0 16 16', paths: ['M4 4l8 8M12 4l-8 8'], stroke: 'var(--err)' },
  reply: { viewBox: '0 0 16 16', paths: ['M6 3L2 7l4 4', 'M2 7h8a4 4 0 014 4v1'] },
  brain: { viewBox: '0 0 16 16', paths: ['M8 2a4 4 0 013.5 6 3 3 0 01-1 5.5H5.5A3 3 0 014.5 8 4 4 0 018 2z', 'M8 5v6M6 7h4'] },
  arrow: { viewBox: '0 0 16 16', paths: ['M3 8h10M9 4l4 4-4 4'] },
  clipboard: { viewBox: '0 0 16 16', paths: ['M5.5 3H4a1 1 0 00-1 1v9a1 1 0 001 1h8a1 1 0 001-1V4a1 1 0 00-1-1h-1.5', 'M6 2h4a.5.5 0 01.5.5v1a.5.5 0 01-.5.5H6a.5.5 0 01-.5-.5v-1A.5.5 0 016 2z'] },
  warn: { viewBox: '0 0 16 16', paths: ['M8 1l7 13H1L8 1z', 'M8 6v3', 'M8 11.5h.01'], stroke: 'var(--err)' },
  circle: { viewBox: '0 0 16 16', paths: ['M8 3a5 5 0 110 10 5 5 0 010-10z'] },
};

export function eventIconDef(evt: SemanticEvent): IconDef {
  switch (evt.type) {
    case 'session.created': return ICONS.bolt;
    case 'session.ended': return ICONS.stop;
    case 'user.turn': return ICONS.mic;
    case 'tool.called': return ICONS.gear;
    case 'tool.result': {
      const d = evt.details as Record<string, unknown> | undefined;
      const data = (d?.data ?? d) as Record<string, unknown> | undefined;
      const result = data?.result as Record<string, unknown> | undefined;
      if (result && typeof result.valid === 'boolean') return result.valid ? ICONS.check : ICONS.cross;
      return ICONS.reply;
    }
    case 'supervisor.exchange': return ICONS.brain;
    case 'agent.handoff':
    case 'agent.switch': return ICONS.arrow;
    case 'prompt.updated':
    case 'session.prompt_updated': return ICONS.clipboard;
    case 'error': return ICONS.warn;
    default: return ICONS.circle;
  }
}

/** @deprecated use eventIconDef for SVG rendering */
export function eventIcon(evt: SemanticEvent): string {
  switch (evt.type) {
    case 'session.created': return '⚡';
    case 'session.ended': return '⏹';
    case 'user.turn': return '🎙';
    case 'tool.called': return '⚙';
    case 'tool.result': {
      const d = evt.details as Record<string, unknown> | undefined;
      const data = (d?.data ?? d) as Record<string, unknown> | undefined;
      const result = data?.result as Record<string, unknown> | undefined;
      if (result && typeof result.valid === 'boolean') return result.valid ? '✓' : '✗';
      return '↩';
    }
    case 'supervisor.exchange': return '🧠';
    case 'agent.handoff':
    case 'agent.switch': return '→';
    case 'prompt.updated':
    case 'session.prompt_updated': return '📋';
    case 'error': return '⚠';
    default: return '○';
  }
}
