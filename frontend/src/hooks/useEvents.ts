import { useState, useCallback } from 'react';
import type { SemanticEvent } from '../types';

export function useEvents() {
  const [events, setEvents] = useState<SemanticEvent[]>([]);

  const addEvent = useCallback((event: SemanticEvent) => {
    setEvents((prev) => [...prev, event]);
  }, []);

  const clearEvents = useCallback(() => setEvents([]), []);

  return { events, addEvent, clearEvents };
}
