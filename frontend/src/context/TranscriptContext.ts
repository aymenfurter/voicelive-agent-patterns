import { createContext, useContext } from 'react';
import type { TranscriptMessage } from '../types';

export interface TranscriptContextValue {
  messages: TranscriptMessage[];
}

export const TranscriptContext = createContext<TranscriptContextValue | null>(null);

export function useTranscriptContext(): TranscriptContextValue {
  const ctx = useContext(TranscriptContext);
  if (!ctx) throw new Error('useTranscriptContext must be used within TranscriptContext.Provider');
  return ctx;
}
