import type { SemanticEvent } from '../../types';
import { categoryBadgeClass } from './constants';
import { formatTime } from './utils';
import { JsonTree } from './JsonTree';

interface Props {
  event: SemanticEvent;
  onClose: () => void;
}

export function DetailDrawer({ event, onClose }: Props) {
  return (
    <div className="detail-drawer">
      <div className="detail-drawer__header">
        <div className="detail-drawer__meta">
          <span className={`event-badge ${categoryBadgeClass[event.category]}`}>{event.type}</span>
          <span className="detail-drawer__time">{formatTime(event.timestamp)}</span>
        </div>
        <button className="btn btn--ghost btn--sm" onClick={onClose}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
      </div>
      <div className="detail-drawer__desc">{event.description}</div>
      {event.details ? (
        <div className="detail-drawer__json">
          <JsonTree data={event.details} />
        </div>
      ) : (
        <div className="detail-drawer__empty">No additional details.</div>
      )}
    </div>
  );
}
