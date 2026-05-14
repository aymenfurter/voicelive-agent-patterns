import { useState, useMemo, useRef, useEffect } from 'react';
import type { SemanticEvent } from '../types';

interface Props {
  events: SemanticEvent[];
  isActive: boolean;
}

/* ── Step types for the timeline ── */

interface Step {
  id: string;
  kind: 'user-audio' | 'thinking' | 'tool-call' | 'tool-result' | 'supervisor' | 'response' | 'error';
  label: string;
  sublabel?: string;
  timestamp: number;
  details?: Record<string, unknown>;
  active?: boolean;
}

/* ── Build ordered steps from raw events ── */

function buildSteps(events: SemanticEvent[], isActive: boolean): { steps: Step[]; activeNode: string; phase: string } {
  const steps: Step[] = [];
  let activeNode = isActive ? 'voice' : '';
  let phase = isActive ? 'Listening' : 'Idle';

  for (const e of events) {
    switch (e.type) {
      case 'audio.started':
        steps.push({ id: e.id, kind: 'user-audio', label: 'User speaking', timestamp: e.timestamp });
        activeNode = 'user';
        phase = 'User speaking';
        break;
      case 'audio.stopped':
        if (steps.length && steps[steps.length - 1].kind === 'user-audio') {
          steps[steps.length - 1].sublabel = 'done';
        }
        phase = 'Processing';
        break;
      case 'response.created':
        steps.push({ id: e.id, kind: 'thinking', label: 'Voice model thinking', timestamp: e.timestamp, active: true });
        activeNode = 'voice';
        phase = 'Generating response';
        break;
      case 'tool.called': {
        const name = (e.details?.data as Record<string, unknown>)?.name as string
          || e.description.replace('tool.called: ', '');
        const args = (e.details?.data as Record<string, unknown>)?.arguments as Record<string, unknown> | undefined;
        steps.push({
          id: e.id, kind: 'tool-call',
          label: `Tool: ${name}`,
          sublabel: args ? Object.entries(args).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(', ').slice(0, 80) : undefined,
          timestamp: e.timestamp,
          details: e.details,
          active: true,
        });
        activeNode = 'tools';
        phase = `Calling ${name}`;
        break;
      }
      case 'tool.result': {
        const name = (e.details?.data as Record<string, unknown>)?.name as string
          || e.description.replace('tool.result: ', '');
        const result = (e.details?.data as Record<string, unknown>)?.result as Record<string, unknown> | undefined;
        let preview = '';
        if (result) {
          if (result.status) preview = `status: ${result.status}`;
          else if (result.valid !== undefined) preview = `valid: ${result.valid}`;
          else preview = JSON.stringify(result).slice(0, 80);
        }
        steps.push({
          id: e.id, kind: 'tool-result',
          label: `Result: ${name}`,
          sublabel: preview || undefined,
          timestamp: e.timestamp,
          details: e.details,
        });
        activeNode = 'voice';
        break;
      }
      case 'supervisor.exchange': {
        const d = e.details as Record<string, unknown> | undefined;
        const model = (d?.model as string) || 'gpt-4.1';
        const toolCtx = (d?.tool_context as string) || '';
        const promptPreview = ((d?.prompt_preview as string) || '').slice(0, 80);
        const resp = d?.response as Record<string, unknown> | undefined;
        steps.push({
          id: e.id, kind: 'supervisor',
          label: `Supervisor (${model})`,
          sublabel: toolCtx ? `for ${toolCtx}: ${promptPreview}` : promptPreview,
          timestamp: e.timestamp,
          details: {
            model,
            tool_context: toolCtx,
            prompt_preview: d?.prompt_preview,
            response: resp,
            usage: d?.usage,
          },
        });
        activeNode = 'supervisor';
        phase = 'Consulting Supervisor';
        break;
      }
      case 'response.done':
        steps.push({ id: e.id, kind: 'response', label: 'Response complete', timestamp: e.timestamp });
        activeNode = 'voice';
        phase = 'Agent responded';
        break;
      case 'error':
        steps.push({
          id: e.id, kind: 'error',
          label: 'Error',
          sublabel: e.description,
          timestamp: e.timestamp,
          details: e.details,
        });
        break;
    }
  }

  return { steps, activeNode, phase };
}

/* ── Step icon SVGs ── */

function StepIcon({ kind }: { kind: Step['kind'] }) {
  const s = 14;
  switch (kind) {
    case 'user-audio':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="7" y="2" width="10" height="12" rx="5" /><path d="M4 12v1a8 8 0 0 0 16 0v-1" /><line x1="12" y1="21" x2="12" y2="24" />
        </svg>
      );
    case 'thinking':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
        </svg>
      );
    case 'tool-call':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" />
        </svg>
      );
    case 'tool-result':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      );
    case 'supervisor':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" />
          <polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" />
        </svg>
      );
    case 'response':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      );
    case 'error':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
        </svg>
      );
  }
}

const STEP_COLORS: Record<Step['kind'], string> = {
  'user-audio': '#47D05A',
  'thinking': '#E5A922',
  'tool-call': '#6BAFFF',
  'tool-result': '#6BAFFF',
  'supervisor': '#FF9F43',
  'response': '#E5A922',
  'error': '#FF6363',
};

/* ── JSON detail renderer ── */

function JsonDetail({ data, depth = 0 }: { data: unknown; depth?: number }) {
  if (data === null || data === undefined) return <span className="cs-json-null">null</span>;
  if (typeof data === 'boolean') return <span className="cs-json-bool">{String(data)}</span>;
  if (typeof data === 'number') return <span className="cs-json-num">{data}</span>;
  if (typeof data === 'string') {
    if (data.length > 300) return <span className="cs-json-str">"{data.slice(0, 300)}..."</span>;
    return <span className="cs-json-str">"{data}"</span>;
  }
  if (Array.isArray(data)) {
    if (data.length === 0) return <span className="cs-json-bracket">[]</span>;
    return (
      <div className="cs-json-block" style={{ marginLeft: depth > 0 ? 12 : 0 }}>
        {data.map((item, i) => (
          <div key={i} className="cs-json-row">
            <span className="cs-json-idx">[{i}]</span> <JsonDetail data={item} depth={depth + 1} />
          </div>
        ))}
      </div>
    );
  }
  if (typeof data === 'object') {
    const entries = Object.entries(data as Record<string, unknown>).filter(([, v]) => v !== undefined && v !== null);
    if (entries.length === 0) return <span className="cs-json-bracket">{'{}'}</span>;
    return (
      <div className="cs-json-block" style={{ marginLeft: depth > 0 ? 12 : 0 }}>
        {entries.map(([key, val]) => (
          <div key={key} className="cs-json-row">
            <span className="cs-json-key">{key}:</span> <JsonDetail data={val} depth={depth + 1} />
          </div>
        ))}
      </div>
    );
  }
  return <span>{String(data)}</span>;
}

/* ── Main component ── */

export function ChatSupervisorDiagram({ events, isActive }: Props) {
  const { steps, activeNode, phase } = useMemo(() => buildSteps(events, isActive), [events, isActive]);
  const [expandedStep, setExpandedStep] = useState<string | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new steps arrive
  useEffect(() => {
    if (timelineRef.current) {
      timelineRef.current.scrollTop = timelineRef.current.scrollHeight;
    }
  }, [steps.length]);

  const sessionStart = steps.length > 0 ? steps[0].timestamp : Date.now();

  return (
    <div className="cs-diagram">
      {/* Compact architecture header */}
      <div className="cs-header">
        <div className="cs-header__title">Chat-Supervisor Pattern</div>
        <div className="cs-header__phase">{phase}</div>
      </div>

      <div className="cs-arch">
        <div className={`cs-arch-node${activeNode === 'user' ? ' cs-arch-node--active' : ''}`}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <rect x="7" y="2" width="10" height="12" rx="5" /><path d="M4 12v1a8 8 0 0 0 16 0v-1" />
          </svg>
          <span>User</span>
        </div>
        <svg className="cs-arch-arrow" width="24" height="12" viewBox="0 0 24 12">
          <path d="M0 6h20m-4-4l4 4-4 4" fill="none" stroke={activeNode === 'user' || activeNode === 'voice' ? 'var(--gold)' : 'var(--border)'} strokeWidth="1.5" />
        </svg>
        <div className={`cs-arch-node cs-arch-node--voice${activeNode === 'voice' ? ' cs-arch-node--active' : ''}`}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          </svg>
          <span>Voice</span>
          <span className="cs-arch-sub">Realtime</span>
        </div>
        <svg className="cs-arch-arrow" width="24" height="12" viewBox="0 0 24 12">
          <path d="M0 6h20m-4-4l4 4-4 4" fill="none" stroke={activeNode === 'supervisor' ? 'var(--gold)' : 'var(--border)'} strokeWidth="1.5" />
        </svg>
        <div className={`cs-arch-node cs-arch-node--sup${activeNode === 'supervisor' ? ' cs-arch-node--active' : ''}`}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="3" /><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
          </svg>
          <span>Supervisor</span>
          <span className="cs-arch-sub">GPT-4.1</span>
        </div>
        <svg className="cs-arch-arrow" width="24" height="12" viewBox="0 0 24 12">
          <path d="M0 6h20m-4-4l4 4-4 4" fill="none" stroke={activeNode === 'tools' ? 'var(--gold)' : 'var(--border)'} strokeWidth="1.5" />
        </svg>
        <div className={`cs-arch-node cs-arch-node--tools${activeNode === 'tools' ? ' cs-arch-node--active' : ''}`}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" />
          </svg>
          <span>Tools</span>
        </div>
      </div>

      {/* Step timeline */}
      <div className="cs-timeline" ref={timelineRef}>
        {steps.length === 0 && (
          <div className="cs-empty">Start a session to see the orchestration flow</div>
        )}
        {steps.map((step, i) => {
          const isExpanded = expandedStep === step.id;
          const relTime = step.timestamp - sessionStart;
          const relLabel = relTime < 1000 ? `+${relTime}ms` : `+${(relTime / 1000).toFixed(1)}s`;
          const color = STEP_COLORS[step.kind];
          const isLast = i === steps.length - 1;

          return (
            <div key={step.id} className={`cs-step${isExpanded ? ' cs-step--expanded' : ''}${isLast && step.active ? ' cs-step--active' : ''}`}>
              <button
                className="cs-step__row"
                onClick={() => step.details ? setExpandedStep(isExpanded ? null : step.id) : undefined}
                title={step.details ? 'Click for details' : step.label}
                style={{ cursor: step.details ? 'pointer' : 'default' }}
              >
                {/* Timeline connector */}
                <div className="cs-step__line">
                  <div className="cs-step__dot" style={{ borderColor: color, background: isLast ? color : 'var(--surface)' }} />
                  {i < steps.length - 1 && <div className="cs-step__connector" />}
                </div>

                {/* Content */}
                <div className="cs-step__body">
                  <div className="cs-step__header">
                    <span className="cs-step__icon" style={{ color }}><StepIcon kind={step.kind} /></span>
                    <span className="cs-step__label">{step.label}</span>
                    <span className="cs-step__time">{relLabel}</span>
                    {step.details && (
                      <svg className={`cs-step__chevron${isExpanded ? ' cs-step__chevron--open' : ''}`} width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    )}
                  </div>
                  {step.sublabel && (
                    <div className="cs-step__sublabel">{step.sublabel}</div>
                  )}
                </div>
              </button>

              {/* Expandable detail panel */}
              {isExpanded && step.details && (
                <div className="cs-step__detail">
                  <JsonDetail data={step.details} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
