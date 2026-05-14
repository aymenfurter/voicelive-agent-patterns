import type { SemanticEvent } from '../../types';
import { categoryBadgeClass, categoryBarColor } from './constants';
import { formatDelta } from './utils';

interface Props {
  events: SemanticEvent[];
  sessionStart: number;
  totalDuration: number;
  onSelect: (e: SemanticEvent) => void;
  selectedId: string | null;
}

export function EventsTimeline({ events, sessionStart, totalDuration, onSelect, selectedId }: Props) {
  if (events.length === 0) {
    return <div className="empty-state">No events yet.</div>;
  }

  const rulerMarks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div className="timeline-container">
      <div className="timeline-ruler">
        {rulerMarks.map((pct) => (
          <span key={pct} className="ruler-mark" style={{ left: `${pct * 100}%` }}>
            {formatDelta(Math.round(pct * totalDuration))}
          </span>
        ))}
      </div>
      <div className="timeline-rows">
        {events.map((evt) => {
          const offset = totalDuration > 0
            ? ((evt.timestamp - sessionStart) / totalDuration) * 100
            : 0;
          const isSelected = selectedId === evt.id;
          return (
            <div
              key={evt.id}
              className={`timeline-row${isSelected ? ' timeline-row--selected' : ''}`}
              onClick={() => onSelect(evt)}
              title={`${evt.type}: ${evt.description}`}
            >
              <span className={`timeline-row__badge ${categoryBadgeClass[evt.category]}`}>
                {evt.type.replace(/^(response|session|audio|agent|tool)\./, '')}
              </span>
              <div className="timeline-row__track">
                <div className="timeline-bar" style={{
                  left: `${offset}%`,
                  backgroundColor: categoryBarColor[evt.category],
                }} />
              </div>
              <span className="timeline-row__delta">{formatDelta(evt.timestamp - sessionStart)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
