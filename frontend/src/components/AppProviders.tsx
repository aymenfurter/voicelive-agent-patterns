import type { ReactNode } from 'react';
import { useMemo } from 'react';
import type { RealtimeSession } from '../hooks/useRealtimeSession';
import { SessionStateContext } from '../context/SessionStateContext';
import { TranscriptContext } from '../context/TranscriptContext';
import { EventsContext } from '../context/EventsContext';
import { UiModeContext } from '../context/UiModeContext';
import { SessionActionsContext } from '../context/SessionActionsContext';
import type { AppMode } from './ModeSwitcher';

interface Props {
  rt: RealtimeSession;
  appMode: AppMode;
  setAppMode: (m: AppMode) => void;
  children: ReactNode;
}

/**
 * Wires the realtime session into focused, narrow contexts so consumers only
 * subscribe to the slice of state they care about.
 */
export function AppProviders({ rt, appMode, setAppMode, children }: Props) {
  const sessionState = useMemo(
    () => ({ session: rt.session, isConnected: rt.isConnected }),
    [rt.session, rt.isConnected],
  );

  const transcript = useMemo(() => ({ messages: rt.messages }), [rt.messages]);
  const events = useMemo(() => ({ events: rt.events }), [rt.events]);

  const uiMode = useMemo(() => ({
    pattern: rt.pattern,
    appMode,
    textMode: rt.textMode,
    tokenUsage: rt.tokenUsage,
    setAppMode,
    setTextMode: rt.setTextMode,
    setPattern: rt.setPattern,
  }), [rt.pattern, appMode, rt.textMode, rt.tokenUsage, setAppMode, rt.setTextMode, rt.setPattern]);

  const actions = useMemo(() => ({
    startSession: rt.startSession,
    endSession: rt.endSession,
    sendMessage: rt.sendMessage,
    clearEvents: rt.clearEvents,
    clearMessages: rt.clearMessages,
  }), [rt.startSession, rt.endSession, rt.sendMessage, rt.clearEvents, rt.clearMessages]);

  return (
    <SessionStateContext.Provider value={sessionState}>
      <TranscriptContext.Provider value={transcript}>
        <EventsContext.Provider value={events}>
          <UiModeContext.Provider value={uiMode}>
            <SessionActionsContext.Provider value={actions}>
              {children}
            </SessionActionsContext.Provider>
          </UiModeContext.Provider>
        </EventsContext.Provider>
      </TranscriptContext.Provider>
    </SessionStateContext.Provider>
  );
}
