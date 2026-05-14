import { useState, useCallback } from 'react';

/** Manages timeline zoom/pan as a (start, end) timestamp range. */
export function useTimelineViewport(sessionStart: number, sessionEnd: number) {
  const [zoomRange, setZoomRange] = useState<[number, number] | null>(null);

  const totalDuration = Math.max(sessionEnd - sessionStart, 100);
  const viewStart = zoomRange ? zoomRange[0] : sessionStart;
  const viewEnd = zoomRange ? zoomRange[1] : sessionEnd;
  const viewDuration = Math.max(viewEnd - viewStart, 100);

  const zoomIn = useCallback(() => {
    const center = viewStart + viewDuration / 2;
    const newDur = viewDuration / 2;
    setZoomRange([center - newDur / 2, center + newDur / 2]);
  }, [viewStart, viewDuration]);

  const zoomOut = useCallback(() => {
    if (!zoomRange) return;
    const center = viewStart + viewDuration / 2;
    const newDur = viewDuration * 2;
    const newStart = Math.max(sessionStart, center - newDur / 2);
    const newEnd = Math.min(sessionEnd, center + newDur / 2);
    if (newEnd - newStart >= totalDuration * 0.95) setZoomRange(null);
    else setZoomRange([newStart, newEnd]);
  }, [zoomRange, viewStart, viewDuration, sessionStart, sessionEnd, totalDuration]);

  const reset = useCallback(() => setZoomRange(null), []);

  return {
    viewStart, viewEnd, viewDuration, totalDuration,
    isZoomed: zoomRange !== null,
    zoomIn, zoomOut, reset,
  };
}
