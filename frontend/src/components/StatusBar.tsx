import { ServiceDot } from './ServiceDot';
import { useHealthCheck } from '../hooks/useHealthCheck';
import { estimateCost, formatCost } from '../utils/costEstimator';
import type { SessionState, TokenUsage } from '../types';

interface Props {
  isConnected: boolean;
  session: SessionState;
  tokenUsage: TokenUsage;
  model: string;
}

export function StatusBar({ isConnected, session, tokenUsage, model }: Props) {
  const health = useHealthCheck();
  const connectionLabel = isConnected ? 'Connected'
    : session.status === 'connecting' ? 'Connecting…'
    : 'Disconnected';
  const connectionStatus = isConnected ? 'connected'
    : session.status === 'connecting' ? 'connecting'
    : 'disconnected';
  const badgeClass = isConnected ? 'badge--ok'
    : session.status === 'connecting' ? 'badge--warn'
    : 'badge--err';
  const dotColor = isConnected ? 'var(--ok)'
    : session.status === 'connecting' ? 'var(--gold)'
    : 'var(--err)';

  return (
    <footer className="app-footer">
      <div className="status-bar" data-testid="status-bar">
        <span
          className={`badge ${badgeClass}`}
          data-testid="connection-status"
          data-status={connectionStatus}
        >
          <span
            className="status-dot__indicator"
            style={{
              width: 7, height: 7, borderRadius: '50%', display: 'inline-block',
              background: dotColor,
              boxShadow: isConnected ? '0 0 4px var(--ok)' : undefined,
            }}
          />
          {connectionLabel}
        </span>

        <span className="service-health" data-testid="service-health">
          <ServiceDot label="Frontend" status={health.frontend} />
          <ServiceDot label="Backend" status={health.backend} />
          <ServiceDot label="Q-Service" status={health.questionService} />
        </span>

        {tokenUsage.totalTokens > 0 && (
          <span className="token-counter" data-testid="token-counter">
            <span className="token-counter__label">Tokens:</span>
            <span className="token-counter__value">{tokenUsage.totalTokens.toLocaleString()}</span>
            <span className="token-counter__detail">
              ({tokenUsage.inputTokens.toLocaleString()} in / {tokenUsage.outputTokens.toLocaleString()} out)
            </span>
            <span className="token-counter__cost">{formatCost(estimateCost(tokenUsage, model))}</span>
          </span>
        )}
        {session.sessionId && (
          <span className="session-id">Session: {session.sessionId}</span>
        )}
        {session.activeAgent && (
          <span className="badge badge--blue">Agent: {session.activeAgent}</span>
        )}
      </div>
    </footer>
  );
}
