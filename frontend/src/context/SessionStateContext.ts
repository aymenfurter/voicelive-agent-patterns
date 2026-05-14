import { createContext, useContext } from 'react';
import type { SessionState } from '../types';

export interface SessionStateContextValue {
  session: SessionState;
  isConnected: boolean;
}

export const SessionStateContext = createContext<SessionStateContextValue | null>(null);

export function useSessionState(): SessionStateContextValue {
  const ctx = useContext(SessionStateContext);
  if (!ctx) throw new Error('useSessionState must be used within SessionStateContext.Provider');
  return ctx;
}
