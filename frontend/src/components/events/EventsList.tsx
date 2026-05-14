import { useRef, useEffect } from 'react';
import type { SemanticEvent } from '../../types';
import { categoryBadgeClass } from './constants';
import { formatDelta, eventIconDef } from './utils';

interface GroupedEvent {
  event: SemanticEvent;
  count: number;
}

interface Props {
  grouped: GroupedEvent[];
  sessionStart: number;
  selectedId: string | null;
  onSelect: (e: SemanticEvent) => void;
}

function EventIcon({ evt }: { evt: SemanticEvent }) {
  const def = eventIconDef(evt);
  return (
    <svg width="14" height="14" viewBox={def.viewBox} fill="none" stroke={def.stroke ?? 'currentColor'} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      {def.paths.map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}

export function EventsList({ grouped, sessionStart, selectedId, onSelect }: Props) {
  const listEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [grouped]);

  return (
    <div className="events-list">
      {grouped.length === 0 && <div className="empty-state">No events yet.</div>}
      {grouped.map(({ event: evt, count }) => {
        const [headline, ...subLines] = evt.description.split('\n');
        return (
          <div
            key={evt.id}
            className={`event-item${evt.details ? ' event-item--clickable' : ''}${selectedId === evt.id ? ' event-item--selected' : ''}`}
            onClick={() => evt.details && onSelect(evt)}
          >
            <span className="event-icon"><EventIcon evt={evt} /></span>
            <div className="event-body">
              <div className="event-headline">
                <span className={`event-badge ${categoryBadgeClass[evt.category]}`}>{headline}</span>
                {count > 1 && <span className="event-count">x{count}</span>}
              </div>
              {subLines.length > 0 && (
                <span className="event-sub">{subLines.join(', ')}</span>
              )}
            </div>
            <span className="event-time">{formatDelta(evt.timestamp - sessionStart)}</span>
            {evt.details && <span className="event-chevron">›</span>}
          </div>
        );
      })}
      <div ref={listEndRef} />
    </div>
  );
}
