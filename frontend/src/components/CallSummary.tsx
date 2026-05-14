import type { TranscriptMessage, SemanticEvent } from '../types';

interface ClaimResult {
  claim_number: string;
  claim_type: string;
  data_points_collected: number;
  status: string;
}

interface CallSummaryProps {
  claim: ClaimResult;
  messages: TranscriptMessage[];
  events: SemanticEvent[];
  onDismiss: () => void;
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

function ClaimTypeSvg({ type }: { type: string }) {
  switch (type) {
    case 'auto':
      return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 17h14M5 17a2 2 0 01-2-2V9a2 2 0 012-2h1l2-3h8l2 3h1a2 2 0 012 2v6a2 2 0 01-2 2M5 17v1a1 1 0 001 1h1a1 1 0 001-1v-1m10 0v1a1 1 0 001 1h1a1 1 0 001-1v-1"/>
          <circle cx="8.5" cy="14" r="1.5"/><circle cx="15.5" cy="14" r="1.5"/>
        </svg>
      );
    case 'property':
      return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6"/>
        </svg>
      );
    case 'health':
      return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 6v12M6 12h12"/>
          <rect x="3" y="3" width="18" height="18" rx="3"/>
        </svg>
      );
    default:
      return null;
  }
}

function CheckSvg() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="var(--color-success)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 10 8 14 16 6"/>
    </svg>
  );
}

export function CallSummary({ claim, messages, events, onDismiss }: CallSummaryProps) {
  const agentMessages = messages.filter(m => m.role === 'agent' && !m.isPartial);
  const userMessages = messages.filter(m => m.role === 'user' && !m.isPartial);
  const handoffs = events.filter(e => e.type === 'agent.handoff');
  const toolCalls = events.filter(e => e.type === 'tool.called' || e.type === 'tool.result');
  const supervisorExchanges = events.filter(e => e.type === 'supervisor.exchange');

  const firstEvent = events.length > 0 ? events[0].timestamp : Date.now();
  const lastEvent = events.length > 0 ? events[events.length - 1].timestamp : Date.now();
  const duration = lastEvent - firstEvent;

  const agentsUsed = new Set<string>();
  for (const h of handoffs) {
    const d = h.details as Record<string, unknown> | undefined;
    if (d?.from) agentsUsed.add(d.from as string);
    if (d?.to) agentsUsed.add(d.to as string);
  }

  return (
    <div className="call-summary-overlay">
      <div className="call-summary">
        <div className="call-summary__header">
          <div className="call-summary__icon">
            <CheckSvg />
          </div>
          <h2>Claim Submitted Successfully</h2>
          <span className="call-summary__claim-number">{claim.claim_number}</span>
        </div>

        <div className="call-summary__details">
          <div className="call-summary__card">
            <div className="call-summary__card-icon">
              <ClaimTypeSvg type={claim.claim_type} />
            </div>
            <div>
              <div className="call-summary__label">Claim Type</div>
              <div className="call-summary__value">{claim.claim_type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</div>
            </div>
          </div>

          <div className="call-summary__card">
            <div className="call-summary__card-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
              </svg>
            </div>
            <div>
              <div className="call-summary__label">Call Duration</div>
              <div className="call-summary__value">{formatDuration(duration)}</div>
            </div>
          </div>

          <div className="call-summary__card">
            <div className="call-summary__card-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/>
                <rect x="9" y="3" width="6" height="4" rx="1"/>
                <path d="M9 12h6M9 16h4"/>
              </svg>
            </div>
            <div>
              <div className="call-summary__label">Data Points</div>
              <div className="call-summary__value">{claim.data_points_collected} collected</div>
            </div>
          </div>
        </div>

        <div className="call-summary__stats">
          <h3>Call Overview</h3>
          <div className="call-summary__stat-grid">
            <div className="call-summary__stat">
              <span className="call-summary__stat-num">{userMessages.length}</span>
              <span className="call-summary__stat-label">User Turns</span>
            </div>
            <div className="call-summary__stat">
              <span className="call-summary__stat-num">{agentMessages.length}</span>
              <span className="call-summary__stat-label">Agent Responses</span>
            </div>
            <div className="call-summary__stat">
              <span className="call-summary__stat-num">{handoffs.length}</span>
              <span className="call-summary__stat-label">Agent Handoffs</span>
            </div>
            <div className="call-summary__stat">
              <span className="call-summary__stat-num">{toolCalls.length}</span>
              <span className="call-summary__stat-label">Tool Calls</span>
            </div>
            {supervisorExchanges.length > 0 && (
              <div className="call-summary__stat">
                <span className="call-summary__stat-num">{supervisorExchanges.length}</span>
                <span className="call-summary__stat-label">Supervisor Checks</span>
              </div>
            )}
            {agentsUsed.size > 0 && (
              <div className="call-summary__stat">
                <span className="call-summary__stat-num">{agentsUsed.size}</span>
                <span className="call-summary__stat-label">Agents Used</span>
              </div>
            )}
          </div>
        </div>

        {handoffs.length > 0 && (
          <div className="call-summary__journey">
            <h3>Agent Journey</h3>
            <div className="call-summary__journey-steps">
              {handoffs.map((h, i) => {
                const d = h.details as Record<string, unknown> | undefined;
                return (
                  <div key={h.id} className="call-summary__journey-step">
                    {i === 0 && (
                      <span className="call-summary__journey-agent">{(d?.from as string)?.replace(/_/g, ' ')}</span>
                    )}
                    <span className="call-summary__journey-arrow">
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="var(--color-text-tertiary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 8h10M9 4l4 4-4 4"/>
                      </svg>
                    </span>
                    <span className="call-summary__journey-agent">{(d?.to as string)?.replace(/_/g, ' ')}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="call-summary__next-steps">
          <h3>Next Steps</h3>
          <ul>
            <li>An adjuster will be assigned within 24-48 hours</li>
            <li>Confirmation email will be sent shortly</li>
            <li>Keep documentation and photos for the adjuster</li>
            <li>Call back with claim number <strong>{claim.claim_number}</strong> for updates</li>
          </ul>
        </div>

        <button className="call-summary__dismiss" onClick={onDismiss}>
          Close Summary
        </button>
      </div>
    </div>
  );
}
