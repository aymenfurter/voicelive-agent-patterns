import { createContext, useContext } from 'react';
import type { WebSocketMessage } from '../types';

export interface SessionActionsContextValue {
  startSession: () => void;
  endSession: () => void;
  sendMessage: (msg: WebSocketMessage) => void;
  clearEvents: () => void;
  clearMessages: () => void;
}

export const SessionActionsContext = createContext<SessionActionsContextValue | null>(null);

export function useSessionActions(): SessionActionsContextValue {
  const ctx = useContext(SessionActionsContext);
  if (!ctx) throw new Error('useSessionActions must be used within SessionActionsContext.Provider');
  return ctx;
}
