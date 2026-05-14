interface Props {
  eventCount: number;
  totalDuration: number;
  toolSpanCount: number;
  viewMode: 'timeline' | 'tokens';
  onViewModeChange: (m: 'timeline' | 'tokens') => void;
  isZoomed: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  onClose: () => void;
  formatDelta: (ms: number) => string;
}

export function TimelineHeader(props: Props) {
  const { eventCount, totalDuration, toolSpanCount, viewMode, onViewModeChange,
    isZoomed, onZoomIn, onZoomOut, onZoomReset, onClose, formatDelta } = props;

  return (
    <div className="fst-header">
      <div className="fst-header__left">
        <span className="fst-title">Event Timeline</span>
        <span className="fst-meta">
          {eventCount} events | {formatDelta(totalDuration)} total
          {toolSpanCount > 0 && ` | ${toolSpanCount} API calls`}
        </span>
      </div>
      <div className="fst-header__center">
        <div className="fst-view-tabs">
          <button
            className={`fst-view-tab${viewMode === 'timeline' ? ' fst-view-tab--active' : ''}`}
            onClick={() => onViewModeChange('timeline')}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="15" y2="18" />
            </svg>
            Timeline
          </button>
          <button
            className={`fst-view-tab${viewMode === 'tokens' ? ' fst-view-tab--active' : ''}`}
            onClick={() => onViewModeChange('tokens')}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
            Tokens
          </button>
        </div>
      </div>
      <div className="fst-header__right">
        {viewMode === 'timeline' && (
          <div className="fst-zoom-controls">
            <button className="fst-btn" onClick={onZoomIn} title="Zoom in">+</button>
            <button className="fst-btn" onClick={onZoomOut} title="Zoom out" disabled={!isZoomed}>−</button>
            <button className="fst-btn" onClick={onZoomReset} title="Reset zoom" disabled={!isZoomed}>⟲</button>
          </div>
        )}
        <button className="fst-btn fst-btn--close" onClick={onClose} title="Close (Esc)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  );
}
