import type { EventCategory } from '../../types';
import { CATEGORY_COLORS, formatDelta } from '../../utils/timelineSpans';

interface Props {
  filters: Record<EventCategory, boolean>;
  categoryCounts: Record<string, number>;
  onToggleFilter: (cat: EventCategory) => void;
  isZoomed: boolean;
  viewStart: number;
  viewEnd: number;
  sessionStart: number;
}

export function TimelineToolbar({
  filters, categoryCounts, onToggleFilter,
  isZoomed, viewStart, viewEnd, sessionStart,
}: Props) {
  return (
    <div className="fst-toolbar">
      <div className="fst-filters">
        {(Object.keys(filters) as EventCategory[]).map((cat) => (
          <button
            key={cat}
            className={`fst-filter${filters[cat] ? ' fst-filter--active' : ''}`}
            onClick={() => onToggleFilter(cat)}
          >
            <span className="fst-filter__dot" style={{ backgroundColor: CATEGORY_COLORS[cat] }} />
            {cat}
            <span className="fst-filter__count">{categoryCounts[cat] || 0}</span>
          </button>
        ))}
      </div>
      {isZoomed && (
        <span className="fst-zoom-info">
          Viewing {formatDelta(viewStart - sessionStart)} — {formatDelta(viewEnd - sessionStart)}
        </span>
      )}
    </div>
  );
}
