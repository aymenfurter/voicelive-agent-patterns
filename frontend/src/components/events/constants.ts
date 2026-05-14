import type { EventCategory } from '../../types';

export const categoryBadgeClass: Record<EventCategory, string> = {
  session: 'event-badge--session',
  audio: 'event-badge--audio',
  agent: 'event-badge--agent',
  tool: 'event-badge--tool',
  error: 'event-badge--error',
  llm: 'event-badge--llm',
};

export const categoryBarColor: Record<EventCategory, string> = {
  session: '#E5A922',
  audio: '#47D05A',
  agent: '#bc8cff',
  tool: '#6BAFFF',
  error: '#FF6363',
  llm: '#FF9F43',
};

export const categoryDotColors = categoryBarColor;
