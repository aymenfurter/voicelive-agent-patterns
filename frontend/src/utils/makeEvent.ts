import type { SemanticEvent, EventCategory } from '../types';

export function makeEvent(
  type: string,
  category: EventCategory,
  description: string,
  details?: Record<string, unknown>,
): SemanticEvent {
  return {
    id: crypto.randomUUID(),
    type,
    category,
    description,
    timestamp: Date.now(),
    details,
  };
}
