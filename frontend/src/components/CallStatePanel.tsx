import { useMemo } from 'react';
import type { Pattern, SemanticEvent, TranscriptMessage } from '../types';

interface CallStatePanelProps {
  pattern: Pattern;
  events: SemanticEvent[];
  messages: TranscriptMessage[];
  isActive: boolean;
}

/* ── SVG Icons ── */
function AgentSvg() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0112 0v1"/>
    </svg>
  );
}

function CheckCircleSvg() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--ok)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><polyline points="8 12 11 15 16 9"/>
    </svg>
  );
}

function WarnSvg() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
    </svg>
  );
}

function ClipboardSvg() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/>
      <rect x="9" y="3" width="6" height="4" rx="1"/>
    </svg>
  );
}

function ArrowRightSvg() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="var(--text-dim)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 8h10M9 4l4 4-4 4"/>
    </svg>
  );
}

function SpinnerSvg() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="2" strokeLinecap="round">
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83">
        <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/>
      </path>
    </svg>
  );
}

interface CollectedField {
  questionId: string;
  answer: string;
  valid: boolean;
  timestamp: number;
}

interface HandoffEntry {
  from: string;
  to: string;
  reason: string;
  timestamp: number;
}

function deriveCallState(events: SemanticEvent[]) {
  const collectedFields: CollectedField[] = [];
  const handoffs: HandoffEntry[] = [];
  let currentAgent = 'greeter';
  let supervisorCount = 0;
  let toolCallCount = 0;

  for (const ev of events) {
    if (ev.type === 'agent.handoff' || ev.type === 'agent.switch') {
      const d = ev.details as Record<string, unknown> | undefined;
      const from = (d?.from as string) ?? '';
      const to = (d?.to as string) ?? '';
      handoffs.push({
        from,
        to,
        reason: (d?.reason as string) ?? '',
        timestamp: ev.timestamp,
      });
      currentAgent = to || currentAgent;
    }

    if (ev.type === 'tool.result') {
      toolCallCount++;
      const d = ev.details as Record<string, unknown> | undefined;
      const innerData = (d?.data as Record<string, unknown>) ?? d ?? {};
      const toolName = (innerData.name as string) ?? '';
      const result = innerData.result as Record<string, unknown> | undefined;

      if (toolName === 'validate_answer' && result) {
        // Find matching tool.called to get the answer text
        const matchingCall = collectedFields.find(f => !f.valid && f.questionId);
        if (matchingCall) {
          matchingCall.valid = !!(result.valid);
        } else {
          collectedFields.push({
            questionId: `field_${collectedFields.length + 1}`,
            answer: '',
            valid: !!(result.valid),
            timestamp: ev.timestamp,
          });
        }
      }
    }

    if (ev.type === 'tool.called') {
      const d = ev.details as Record<string, unknown> | undefined;
      const innerData = (d?.data as Record<string, unknown>) ?? d ?? {};
      const toolName = (innerData.name as string) ?? '';
      if (toolName === 'validate_answer') {
        const argsStr = (innerData.arguments as string) ?? '';
        let args: Record<string, unknown> = {};
        try { args = JSON.parse(argsStr); } catch { /* not JSON */ }
        if (typeof innerData.arguments === 'object' && innerData.arguments) {
          args = innerData.arguments as Record<string, unknown>;
        }
        const qId = (args.question_id as string) ?? '';
        const ans = (args.answer as string) ?? '';
        if (qId) {
          const existing = collectedFields.find(f => f.questionId === qId);
          if (!existing) {
            collectedFields.push({
              questionId: qId,
              answer: ans,
              valid: false,
              timestamp: ev.timestamp,
            });
          } else {
            existing.answer = ans;
          }
        }
      }
    }

    if (ev.type === 'supervisor.exchange') {
      supervisorCount++;
    }
  }

  return { collectedFields, handoffs, currentAgent, supervisorCount, toolCallCount };
}

// Sequential handoff agent order for progress visualization
const AGENT_ORDER = ['greeter', 'top_level_qa', 'auto_claims', 'property_claims', 'health_claims', 'summary'];

function formatAgentName(name: string): string {
  return name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export function CallStatePanel({ pattern, events, messages, isActive }: CallStatePanelProps) {
  const state = useMemo(() => deriveCallState(events), [events]);
  const startTime = events.length > 0 ? events[0].timestamp : null;
  const elapsed = startTime ? Math.floor((Date.now() - startTime) / 1000) : 0;
  const userTurns = messages.filter(m => m.role === 'user' && !m.isPartial).length;
  const agentTurns = messages.filter(m => m.role === 'agent' && !m.isPartial).length;

  if (!isActive && events.length === 0) {
    return (
      <div className="call-state-panel">
        <div className="call-state-panel__header">
          <ClipboardSvg />
          <span>Call State</span>
        </div>
        <div className="call-state-panel__empty">Start a session to see call state</div>
      </div>
    );
  }

  return (
    <div className="call-state-panel">
      <div className="call-state-panel__header">
        <ClipboardSvg />
        <span>Call State</span>
        {isActive && <SpinnerSvg />}
      </div>

      {/* Quick stats bar */}
      <div className="call-state__stats-bar">
        <span title="Elapsed time">{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}</span>
        <span title="User turns">{userTurns} user</span>
        <span title="Agent turns">{agentTurns} agent</span>
        {state.toolCallCount > 0 && <span title="Tool calls">{state.toolCallCount} tools</span>}
      </div>

      {/* Current agent indicator */}
      <div className="call-state__current-agent">
        <AgentSvg />
        <span className="call-state__agent-label">Active Agent</span>
        <span className="call-state__agent-name">{formatAgentName(state.currentAgent)}</span>
      </div>

      {/* Agent progress (sequential handoff) */}
      {pattern === 'sequential-handoff' && (
        <div className="call-state__progress">
          <div className="call-state__section-title">Agent Progress</div>
          <div className="call-state__agent-chain">
            {AGENT_ORDER.map((agent) => {
              const visited = state.handoffs.some(h => h.from === agent || h.to === agent) || agent === 'greeter';
              const isCurrent = agent === state.currentAgent;
              const clsName = `call-state__agent-node ${isCurrent ? 'call-state__agent-node--active' : visited ? 'call-state__agent-node--visited' : ''}`;
              return (
                <div key={agent} className={clsName}>
                  <div className="call-state__agent-dot" />
                  <span>{formatAgentName(agent)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Supervisor activity (chat-supervisor) */}
      {pattern === 'chat-supervisor' && state.supervisorCount > 0 && (
        <div className="call-state__supervisor">
          <div className="call-state__section-title">Supervisor Activity</div>
          <div className="call-state__supervisor-count">
            <span className="call-state__stat-num">{state.supervisorCount}</span>
            <span>validations performed</span>
          </div>
        </div>
      )}

      {/* Collected data */}
      {state.collectedFields.length > 0 && (
        <div className="call-state__collected">
          <div className="call-state__section-title">
            Data Collected ({state.collectedFields.length})
          </div>
          <div className="call-state__field-list">
            {state.collectedFields.map((field, i) => (
              <div key={i} className="call-state__field">
                {field.valid ? <CheckCircleSvg /> : <WarnSvg />}
                <span className="call-state__field-id">{field.questionId.replace(/_/g, ' ')}</span>
                {field.answer && (
                  <span className="call-state__field-answer" title={field.answer}>
                    {field.answer.length > 30 ? field.answer.slice(0, 30) + '...' : field.answer}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Handoff history */}
      {state.handoffs.length > 0 && (
        <div className="call-state__handoffs">
          <div className="call-state__section-title">
            Handoff History ({state.handoffs.length})
          </div>
          <div className="call-state__handoff-list">
            {state.handoffs.map((h, i) => (
              <div key={i} className="call-state__handoff-entry">
                <span className="call-state__handoff-agents">
                  {formatAgentName(h.from)} <ArrowRightSvg /> {formatAgentName(h.to)}
                </span>
                {h.reason && (
                  <span className="call-state__handoff-reason" title={h.reason}>
                    {h.reason.length > 50 ? h.reason.slice(0, 50) + '...' : h.reason}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
