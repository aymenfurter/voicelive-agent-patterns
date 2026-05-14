import { createContext, useContext } from 'react';
import type { SemanticEvent } from '../types';

export interface EventsContextValue {
  events: SemanticEvent[];
}

export const EventsContext = createContext<EventsContextValue | null>(null);

export function useEventsContext(): EventsContextValue {
  const ctx = useContext(EventsContext);
  if (!ctx) throw new Error('useEventsContext must be used within EventsContext.Provider');
  return ctx;
}
