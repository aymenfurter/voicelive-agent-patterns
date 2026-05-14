import { createContext, useContext } from 'react';
import type { Pattern, TokenUsage } from '../types';
import type { AppMode } from '../components/ModeSwitcher';

export interface UiModeContextValue {
  pattern: Pattern;
  appMode: AppMode;
  textMode: boolean;
  tokenUsage: TokenUsage;
  setAppMode: (m: AppMode) => void;
  setTextMode: (v: boolean) => void;
  setPattern: (p: Pattern) => void;
}

export const UiModeContext = createContext<UiModeContextValue | null>(null);

export function useUiMode(): UiModeContextValue {
  const ctx = useContext(UiModeContext);
  if (!ctx) throw new Error('useUiMode must be used within UiModeContext.Provider');
  return ctx;
}
