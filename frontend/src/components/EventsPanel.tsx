import { useState, useMemo, useCallback } from 'react';
import type { SemanticEvent, EventCategory } from '../types';
import { FullscreenTimeline } from './FullscreenTimeline';
import { EventsList } from './events/EventsList';
import { EventsTimeline } from './events/EventsTimeline';
import { DetailDrawer } from './events/DetailDrawer';
import { categoryDotColors, computeToolSpans, formatDelta } from './events';

interface Props {
  events: SemanticEvent[];
  onClear: () => void;
  model?: string;
}

type ViewMode = 'list' | 'timeline';

function ToolSpansView({ events, sessionStart, onSelect }: {
  events: SemanticEvent[];
  sessionStart: number;
  onSelect: (e: SemanticEvent) => void;
}) {
  const spans = useMemo(() => computeToolSpans(events), [events]);
  if (spans.length === 0) return null;

  return (
    <div className="tool-spans">
      <div className="tool-spans__title">Tool Calls</div>
      {spans.map((span, i) => {
        const duration = span.resultAt ? span.resultAt - span.calledAt : null;
        return (
          <div key={i} className="tool-span" onClick={() => onSelect(span.calledEvent)}>
            <span className={`tool-span__dot ${span.resultAt ? 'tool-span__dot--done' : 'tool-span__dot--pending'}`} />
            <span className="tool-span__name">{span.name}</span>
            <span className="tool-span__timing">
              {formatDelta(span.calledAt - sessionStart)}
              {duration !== null && (
                <> → <strong className="tool-span__dur">{duration}ms</strong></>
              )}
              {duration === null && <span className="tool-span__waiting"> ⏳</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function EventsPanel({ events, onClear, model }: Props) {
  const [filters, setFilters] = useState<Record<EventCategory, boolean>>({
    session: true, audio: true, agent: true, tool: true, error: true, llm: true,
  });
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedEvent, setSelectedEvent] = useState<SemanticEvent | null>(null);
  const [fullscreenOpen, setFullscreenOpen] = useState(false);

  const toggleFilter = useCallback((cat: EventCategory) => {
    setFilters((f) => ({ ...f, [cat]: !f[cat] }));
  }, []);

  const filtered = useMemo(
    () => events.filter((e) => filters[e.category]),
    [events, filters],
  );

  const grouped = useMemo(() => {
    const result: Array<{ event: SemanticEvent; count: number }> = [];
    for (const e of filtered) {
      const last = result[result.length - 1];
      if (last && last.event.type === e.type && last.event.description === e.description) {
        last.count++;
      } else {
        result.push({ event: e, count: 1 });
      }
    }
    return result;
  }, [filtered]);

  const sessionStart = events.length > 0 ? events[0].timestamp : 0;
  const totalDuration = events.length > 1
    ? Math.max(events[events.length - 1].timestamp - sessionStart, 100)
    : 1;

  return (
    <div className="panel events-panel" data-testid="events-panel">
      <div className="panel-header">
        <span className="panel-header__title">Events</span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            className={`btn btn--ghost btn--sm${viewMode === 'list' ? ' btn--active' : ''}`}
            onClick={() => { setViewMode('list'); setSelectedEvent(null); }}
            title="List view"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <button
            className={`btn btn--ghost btn--sm${viewMode === 'timeline' ? ' btn--active' : ''}`}
            onClick={() => { setViewMode('timeline'); setSelectedEvent(null); }}
            title="Timeline view"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
            </svg>
          </button>
          <button className="btn btn--ghost btn--sm" onClick={() => setFullscreenOpen(true)} title="Fullscreen timeline">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" /><line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" />
            </svg>
          </button>
          <button className="btn btn--ghost btn--sm" onClick={onClear} title="Clear">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
      </div>

      {fullscreenOpen && (
        <FullscreenTimeline events={events} onClose={() => setFullscreenOpen(false)} model={model} />
      )}

      <div className="event-filters">
        {(Object.keys(filters) as EventCategory[]).map((cat) => (
          <button
            key={cat}
            className={`filter-chip${filters[cat] ? ' filter-chip--active' : ''}`}
            onClick={() => toggleFilter(cat)}
          >
            <span className="filter-chip__dot" style={{ backgroundColor: categoryDotColors[cat] }} />
            {cat}
          </button>
        ))}
      </div>

      {selectedEvent && (
        <DetailDrawer event={selectedEvent} onClose={() => setSelectedEvent(null)} />
      )}

      <div className="panel-content">
        {viewMode === 'list' && (
          <EventsList
            grouped={grouped}
            sessionStart={sessionStart}
            selectedId={selectedEvent?.id ?? null}
            onSelect={setSelectedEvent}
          />
        )}

        {viewMode === 'timeline' && (
          <div className="timeline-split">
            <EventsTimeline
              events={filtered}
              sessionStart={sessionStart}
              totalDuration={totalDuration}
              onSelect={setSelectedEvent}
              selectedId={selectedEvent?.id ?? null}
            />
            <ToolSpansView events={events} sessionStart={sessionStart} onSelect={setSelectedEvent} />
          </div>
        )}
      </div>
    </div>
  );
}
