import { useState, useMemo, useCallback, useEffect } from 'react';
import type { SemanticEvent, EventCategory } from '../types';
import { computeSpans, formatDelta } from '../utils/timelineSpans';
import { useTimelineViewport } from '../hooks/useTimelineViewport';
import { TimelineHeader } from './timeline/TimelineHeader';
import { TimelineToolbar } from './timeline/TimelineToolbar';
import { TimelineWaterfall } from './timeline/TimelineWaterfall';
import { TimelineDetailPanel } from './timeline/TimelineDetailPanel';
import { TokenConsumptionView } from './timeline/TokenConsumptionView';

interface Props {
  events: SemanticEvent[];
  onClose: () => void;
  model?: string;
}

const DEFAULT_FILTERS: Record<EventCategory, boolean> = {
  session: true, audio: true, agent: true, tool: true, error: true, llm: true,
};

export function FullscreenTimeline({ events, onClose, model }: Props) {
  const [viewMode, setViewMode] = useState<'timeline' | 'tokens'>('timeline');
  const [filters, setFilters] = useState<Record<EventCategory, boolean>>(DEFAULT_FILTERS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const sessionStart = events.length > 0 ? events[0].timestamp : 0;
  const sessionEnd = events.length > 0 ? events[events.length - 1].timestamp : 0;

  const viewport = useTimelineViewport(sessionStart, sessionEnd);

  const toggleFilter = useCallback(
    (cat: EventCategory) => setFilters((f) => ({ ...f, [cat]: !f[cat] })),
    [],
  );

  const filtered = useMemo(
    () => events.filter((e) => filters[e.category]),
    [events, filters],
  );

  const toolSpans = useMemo(() => computeSpans(events), [events]);

  const selectedEvent = useMemo(
    () => events.find((e) => e.id === selectedId) ?? null,
    [events, selectedId],
  );

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of events) counts[e.category] = (counts[e.category] || 0) + 1;
    return counts;
  }, [events]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="fst-overlay">
      <TimelineHeader
        eventCount={events.length}
        totalDuration={viewport.totalDuration}
        toolSpanCount={toolSpans.length}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        isZoomed={viewport.isZoomed}
        onZoomIn={viewport.zoomIn}
        onZoomOut={viewport.zoomOut}
        onZoomReset={viewport.reset}
        onClose={onClose}
        formatDelta={formatDelta}
      />

      {viewMode === 'tokens' && <TokenConsumptionView events={events} model={model} />}

      {viewMode === 'timeline' && (
        <>
          <TimelineToolbar
            filters={filters}
            categoryCounts={categoryCounts}
            onToggleFilter={toggleFilter}
            isZoomed={viewport.isZoomed}
            viewStart={viewport.viewStart}
            viewEnd={viewport.viewEnd}
            sessionStart={sessionStart}
          />

          <div className="fst-body">
            <TimelineWaterfall
              events={filtered}
              toolSpans={toolSpans}
              viewStart={viewport.viewStart}
              viewEnd={viewport.viewEnd}
              viewDuration={viewport.viewDuration}
              sessionStart={sessionStart}
              selectedId={selectedId}
              hoveredId={hoveredId}
              onSelect={setSelectedId}
              onHover={setHoveredId}
            />

            <TimelineDetailPanel
              selectedEvent={selectedEvent}
              toolSpans={toolSpans}
              sessionStart={sessionStart}
              onClose={() => setSelectedId(null)}
            />
          </div>
        </>
      )}
    </div>
  );
}
