import { useState, useMemo, useRef, useEffect } from 'react';
import type { SemanticEvent } from '../types';

interface PromptSnapshot {
  timestamp: number;
  prompt: string;
  agent?: string;
  reason?: string;
}

interface Props {
  events: SemanticEvent[];
  isActive: boolean;
}

/** Extract prompt history from events. */
function buildPromptHistory(events: SemanticEvent[]): PromptSnapshot[] {
  const history: PromptSnapshot[] = [];

  for (const e of events) {
    if (e.type === 'session.prompt_updated' || e.type === 'prompt.updated') {
      const data = e.details ?? {};
      history.push({
        timestamp: e.timestamp,
        prompt: (data.prompt as string) ?? (data.instructions as string) ?? '',
        agent: (data.agent as string) ?? undefined,
        reason: (data.reason as string) ?? undefined,
      });
    }
  }

  return history;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function PromptDiffPanel({ events, isActive }: Props) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const history = useMemo(() => buildPromptHistory(events), [events]);

  // Auto-select latest
  useEffect(() => {
    if (history.length > 0 && selectedIdx === null) {
      setSelectedIdx(history.length - 1);
    }
  }, [history.length, selectedIdx]);

  const currentIdx = selectedIdx ?? history.length - 1;
  const currentSnapshot = history[currentIdx] ?? null;

  if (!isActive && history.length === 0) {
    return null;
  }

  const updateCount = history.length;

  return (
    <div className="prompt-diff-panel">
      <button
        className="prompt-diff-header"
        onClick={() => setIsExpanded(!isExpanded)}
        data-testid="prompt-diff-toggle"
      >
        <span className="prompt-diff-title">
          System Prompt
          {updateCount > 0 && (
            <span className="prompt-diff-count">{updateCount} update{updateCount !== 1 ? 's' : ''}</span>
          )}
        </span>
        <span className={`prompt-diff-chevron${isExpanded ? ' expanded' : ''}`}>
          <ChevronIcon />
        </span>
      </button>

      {isExpanded && (
        <div className="prompt-diff-body">
          {history.length === 0 ? (
            <p className="prompt-diff-empty">No prompt updates yet</p>
          ) : (
            <>
              {/* Timeline list */}
              <div className="prompt-timeline" ref={listRef}>
                {history.map((snap, i) => (
                  <button
                    key={i}
                    className={`prompt-timeline-item${i === currentIdx ? ' active' : ''}`}
                    onClick={() => setSelectedIdx(i)}
                  >
                    <span className="prompt-timeline-time">{formatTime(snap.timestamp)}</span>
                    <span className="prompt-timeline-agent">{snap.agent ?? `update ${i + 1}`}</span>
                    {snap.reason && <span className="prompt-timeline-reason">{snap.reason}</span>}
                  </button>
                ))}
              </div>

              {/* Full prompt display */}
              {currentSnapshot && (
                <pre className="prompt-diff-pre">
                  {currentSnapshot.prompt}
                </pre>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ChevronIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}
