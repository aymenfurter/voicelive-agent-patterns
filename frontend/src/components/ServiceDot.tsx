import type { ServiceStatus } from '../hooks/useHealthCheck';

interface Props {
  label: string;
  status: ServiceStatus;
}

export function ServiceDot({ label, status }: Props) {
  const color = status === 'up' ? 'var(--ok)' : status === 'down' ? 'var(--err)' : 'var(--text-3)';
  return (
    <span className="service-dot" title={`${label}: ${status}`}>
      <span className="service-dot__indicator" style={{ background: color }} />
      <span className="service-dot__label">{label}</span>
    </span>
  );
}
