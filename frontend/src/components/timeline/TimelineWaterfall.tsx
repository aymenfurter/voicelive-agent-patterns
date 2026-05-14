import { useMemo } from 'react';
import type { SemanticEvent } from '../../types';
import { CATEGORY_COLORS, formatDelta, type ToolSpan } from '../../utils/timelineSpans';

interface Props {
  events: SemanticEvent[];
  toolSpans: ToolSpan[];
  viewStart: number;
  viewEnd: number;
  viewDuration: number;
  sessionStart: number;
  selectedId: string | null;
  hoveredId: string | null;
  onSelect: (id: string | null) => void;
  onHover: (id: string | null) => void;
}

export function TimelineWaterfall({
  events, toolSpans, viewStart, viewEnd, viewDuration, sessionStart,
  selectedId, hoveredId, onSelect, onHover,
}: Props) {
  const rulerMarks = useMemo(() => {
    const marks: number[] = [];
    const step = viewDuration / 10;
    for (let i = 0; i <= 10; i++) marks.push(viewStart + i * step);
    return marks;
  }, [viewStart, viewDuration]);

  return (
    <div className="fst-waterfall">
      <div className="fst-ruler">
        <div className="fst-ruler__track">
          {rulerMarks.map((ts, i) => (
            <span
              key={i}
              className="fst-ruler__mark"
              style={{ left: `${((ts - viewStart) / viewDuration) * 100}%` }}
            >
              {formatDelta(ts - sessionStart)}
            </span>
          ))}
        </div>
      </div>

      {toolSpans.length > 0 && (
        <div className="fst-section">
          <div className="fst-section__title">API Calls / Tool Spans</div>
          {toolSpans.map((span) => {
            const startPct = Math.max(0, ((span.calledAt - viewStart) / viewDuration) * 100);
            const duration = span.resultAt ? span.resultAt - span.calledAt : viewEnd - span.calledAt;
            const widthPct = Math.max(0.3, (duration / viewDuration) * 100);
            const isSelected = selectedId === span.id;
            return (
              <div
                key={span.id}
                className={`fst-row${isSelected ? ' fst-row--selected' : ''}`}
                onClick={() => onSelect(isSelected ? null : span.id)}
                onMouseEnter={() => onHover(span.id)}
                onMouseLeave={() => onHover(null)}
              >
                <div className="fst-row__label">
                  <span className="fst-row__icon">⚙</span>
                  <span className="fst-row__name">{span.name}</span>
                  {span.resultAt && (
                    <span className="fst-row__dur">{span.resultAt - span.calledAt}ms</span>
                  )}
                  {!span.resultAt && <span className="fst-row__pending">pending…</span>}
                </div>
                <div className="fst-row__track">
                  <div
                    className={`fst-bar fst-bar--tool${!span.resultAt ? ' fst-bar--pending' : ''}`}
                    style={{ left: `${startPct}%`, width: `${widthPct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="fst-section">
        <div className="fst-section__title">All Events</div>
        {events.map((evt) => {
          const offsetPct = ((evt.timestamp - viewStart) / viewDuration) * 100;
          if (offsetPct < -5 || offsetPct > 105) return null;
          const isSelected = selectedId === evt.id;
          const isHovered = hoveredId === evt.id;
          const [headline] = evt.description.split('\n');
          return (
            <div
              key={evt.id}
              className={`fst-row${isSelected ? ' fst-row--selected' : ''}${isHovered ? ' fst-row--hovered' : ''}`}
              onClick={() => onSelect(isSelected ? null : evt.id)}
              onMouseEnter={() => onHover(evt.id)}
              onMouseLeave={() => onHover(null)}
            >
              <div className="fst-row__label">
                <span
                  className="fst-row__cat"
                  style={{ backgroundColor: CATEGORY_COLORS[evt.category] }}
                />
                <span className="fst-row__type">{evt.type}</span>
                <span className="fst-row__desc">{headline}</span>
              </div>
              <div className="fst-row__track">
                <div
                  className="fst-bar fst-bar--event"
                  style={{
                    left: `${Math.max(0, offsetPct)}%`,
                    backgroundColor: CATEGORY_COLORS[evt.category],
                  }}
                />
              </div>
              <span className="fst-row__time">{formatDelta(evt.timestamp - sessionStart)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
