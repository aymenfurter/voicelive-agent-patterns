import { useMemo } from 'react';
import type { SemanticEvent } from '../types';
import { MSG_TOOL_CALLED, MSG_TOOL_RESULT, TOOL_GET_NEXT_QUESTIONS, TOOL_VALIDATE_ANSWER, TOOL_SUBMIT_CLAIM } from '../constants';

interface Props {
  events: SemanticEvent[];
}

interface ApiCall {
  name: string;
  calledAt: number;
  resultAt: number | null;
  duration: number | null;
  success: boolean | null;
}

const QUESTION_SERVICE_TOOLS = new Set([
  TOOL_GET_NEXT_QUESTIONS,
  TOOL_VALIDATE_ANSWER,
  TOOL_SUBMIT_CLAIM,
]);

function extractApiCalls(events: SemanticEvent[]): ApiCall[] {
  const calls: ApiCall[] = [];
  const pending = new Map<string, { name: string; calledAt: number }>();

  for (const evt of events) {
    const d = (evt.details?.data as Record<string, unknown>) ?? evt.details ?? {};
    const name = (d.name as string) ?? '';

    if (evt.type === MSG_TOOL_CALLED && QUESTION_SERVICE_TOOLS.has(name)) {
      pending.set(name + '_' + evt.timestamp, { name, calledAt: evt.timestamp });
    }

    if (evt.type === MSG_TOOL_RESULT && QUESTION_SERVICE_TOOLS.has(name)) {
      // Find matching pending call
      let matched = false;
      for (const [key, call] of pending) {
        if (key.startsWith(name + '_')) {
          const result = (d.result as Record<string, unknown>) ?? {};
          const success = result.valid !== false && result.status !== 'error';
          calls.push({
            name: call.name,
            calledAt: call.calledAt,
            resultAt: evt.timestamp,
            duration: evt.timestamp - call.calledAt,
            success,
          });
          pending.delete(key);
          matched = true;
          break;
        }
      }
      if (!matched) {
        calls.push({ name, calledAt: evt.timestamp, resultAt: evt.timestamp, duration: 0, success: true });
      }
    }
  }

  // Add pending (no result yet) calls
  for (const [, call] of pending) {
    calls.push({ name: call.name, calledAt: call.calledAt, resultAt: null, duration: null, success: null });
  }

  return calls;
}

const TOOL_LABELS: Record<string, string> = {
  [TOOL_GET_NEXT_QUESTIONS]: 'get_next_questions',
  [TOOL_VALIDATE_ANSWER]: 'validate_answer',
  [TOOL_SUBMIT_CLAIM]: 'submit_claim',
};

const TOOL_COLORS: Record<string, string> = {
  [TOOL_GET_NEXT_QUESTIONS]: '#6BAFFF',
  [TOOL_VALIDATE_ANSWER]: '#47D05A',
  [TOOL_SUBMIT_CLAIM]: '#E5A922',
};

export function ApiHistogram({ events }: Props) {
  const calls = useMemo(() => extractApiCalls(events), [events]);

  const stats = useMemo(() => {
    const byTool = new Map<string, { count: number; totalMs: number; failures: number }>();
    for (const c of calls) {
      const key = c.name;
      if (!byTool.has(key)) byTool.set(key, { count: 0, totalMs: 0, failures: 0 });
      const s = byTool.get(key)!;
      s.count++;
      if (c.duration !== null) s.totalMs += c.duration;
      if (c.success === false) s.failures++;
    }
    return byTool;
  }, [calls]);

  const maxDuration = useMemo(() => {
    let max = 100;
    for (const c of calls) {
      if (c.duration && c.duration > max) max = c.duration;
    }
    return max;
  }, [calls]);

  const sessionStart = calls.length > 0 ? calls[0].calledAt : 0;

  if (calls.length === 0) {
    return (
      <div className="api-histogram">
        <div className="api-histogram__empty">
          No question service API calls yet. Start a session to see API activity.
        </div>
      </div>
    );
  }

  return (
    <div className="api-histogram">
      <div className="api-histogram__summary">
        {[...stats.entries()].map(([tool, s]) => (
          <div key={tool} className="api-histogram__stat">
            <span className="api-histogram__stat-dot" style={{ background: TOOL_COLORS[tool] ?? 'var(--text-3)' }} />
            <span className="api-histogram__stat-name">{TOOL_LABELS[tool] ?? tool}</span>
            <span className="api-histogram__stat-count">{s.count}x</span>
            {s.totalMs > 0 && (
              <span className="api-histogram__stat-avg">avg {Math.round(s.totalMs / s.count)}ms</span>
            )}
            {s.failures > 0 && (
              <span className="api-histogram__stat-fail">{s.failures} failed</span>
            )}
          </div>
        ))}
      </div>

      <div className="api-histogram__chart">
        <div className="api-histogram__header-row">
          <span className="api-histogram__col-name">API Call</span>
          <span className="api-histogram__col-time">Time</span>
          <span className="api-histogram__col-bar">Duration</span>
        </div>
        {calls.map((call, i) => {
          const barWidth = call.duration !== null ? Math.max((call.duration / maxDuration) * 100, 4) : 0;
          const color = TOOL_COLORS[call.name] ?? 'var(--text-3)';
          return (
            <div key={i} className="api-histogram__row">
              <span className="api-histogram__col-name">
                <span className="api-histogram__call-dot" style={{ background: color }} />
                {TOOL_LABELS[call.name] ?? call.name}
              </span>
              <span className="api-histogram__col-time">
                {sessionStart > 0 ? `+${((call.calledAt - sessionStart) / 1000).toFixed(1)}s` : ''}
              </span>
              <span className="api-histogram__col-bar">
                {call.duration !== null ? (
                  <div className="api-histogram__bar-track">
                    <div
                      className={`api-histogram__bar ${call.success === false ? 'api-histogram__bar--fail' : ''}`}
                      style={{ width: `${barWidth}%`, background: call.success === false ? 'var(--err)' : color }}
                    />
                    <span className="api-histogram__bar-label">{call.duration}ms</span>
                  </div>
                ) : (
                  <span className="api-histogram__pending">pending...</span>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
