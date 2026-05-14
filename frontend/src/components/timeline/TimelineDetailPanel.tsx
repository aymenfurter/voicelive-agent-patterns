import type { SemanticEvent } from '../../types';
import { CATEGORY_COLORS, formatDelta, formatTs, type ToolSpan } from '../../utils/timelineSpans';
import { JsonView } from './JsonView';

interface Props {
  selectedEvent: SemanticEvent | null;
  toolSpans: ToolSpan[];
  sessionStart: number;
  onClose: () => void;
}

export function TimelineDetailPanel({ selectedEvent, toolSpans, sessionStart, onClose }: Props) {
  const matchedSpan =
    selectedEvent?.type === 'tool.called'
      ? toolSpans.find((s) => s.id === selectedEvent.id)
      : undefined;

  return (
    <div className={`fst-detail${selectedEvent ? ' fst-detail--open' : ''}`}>
      {selectedEvent ? (
        <>
          <div className="fst-detail__header">
            <span
              className="fst-detail__cat"
              style={{ backgroundColor: CATEGORY_COLORS[selectedEvent.category] }}
            />
            <span className="fst-detail__type">{selectedEvent.type}</span>
            <button className="fst-btn fst-btn--sm" onClick={onClose}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <div className="fst-detail__body">
            <div className="fst-detail__row">
              <span className="fst-detail__label">Timestamp</span>
              <span className="fst-detail__value">{formatTs(selectedEvent.timestamp)}</span>
            </div>
            <div className="fst-detail__row">
              <span className="fst-detail__label">Offset</span>
              <span className="fst-detail__value">{formatDelta(selectedEvent.timestamp - sessionStart)}</span>
            </div>
            <div className="fst-detail__row">
              <span className="fst-detail__label">Category</span>
              <span className="fst-detail__value">{selectedEvent.category}</span>
            </div>
            <div className="fst-detail__row">
              <span className="fst-detail__label">Description</span>
              <span className="fst-detail__value fst-detail__value--pre">{selectedEvent.description}</span>
            </div>
            {selectedEvent.details && (
              <div className="fst-detail__json">
                <span className="fst-detail__label">Details</span>
                <div className="fst-detail__tree">
                  <JsonView data={selectedEvent.details} />
                </div>
              </div>
            )}
            {matchedSpan && (
              <div className="fst-detail__span-info">
                <div className="fst-detail__row">
                  <span className="fst-detail__label">Duration</span>
                  <span className="fst-detail__value">
                    {matchedSpan.resultAt ? `${matchedSpan.resultAt - matchedSpan.calledAt}ms` : 'pending…'}
                  </span>
                </div>
                {matchedSpan.args && (
                  <div className="fst-detail__json">
                    <span className="fst-detail__label">Arguments</span>
                    <div className="fst-detail__tree"><JsonView data={matchedSpan.args} /></div>
                  </div>
                )}
                {matchedSpan.result && (
                  <div className="fst-detail__json">
                    <span className="fst-detail__label">Result</span>
                    <div className="fst-detail__tree"><JsonView data={matchedSpan.result} /></div>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="fst-detail__empty">
          <p>Select an event to inspect</p>
          <p className="fst-detail__hint">Click any row in the waterfall to see full details</p>
        </div>
      )}
    </div>
  );
}
