import { useState, useCallback } from 'react';
import type { Pattern, SessionState, SessionConfig } from '../types';

export function useSession(
  pattern: Pattern,
  connectWs: (sessionId: string) => void,
  disconnectWs: () => void,
  sessionConfig?: SessionConfig,
) {
  const [session, setSession] = useState<SessionState>({
    status: 'idle',
    sessionId: null,
    pattern,
    activeAgent: null,
  });

  const startSession = useCallback(async () => {
    setSession((s) => ({ ...s, status: 'connecting', pattern }));

    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pattern, config: sessionConfig }),
      });

      if (!res.ok) throw new Error(`Failed to create session: ${res.status}`);

      const data = await res.json();
      const sessionId = data.session_id as string;

      setSession({
        status: 'active',
        sessionId,
        pattern,
        activeAgent: data.active_agent as string ?? null,
      });

      connectWs(sessionId);
    } catch (err) {
      console.error('Failed to start session:', err);
      setSession((s) => ({ ...s, status: 'idle' }));
    }
  }, [pattern, connectWs, sessionConfig]);

  const endSession = useCallback(async () => {
    disconnectWs();

    if (session.sessionId) {
      try {
        await fetch(`/api/sessions/${session.sessionId}`, { method: 'DELETE' });
      } catch {
        // Best effort
      }
    }

    setSession({
      status: 'ended',
      sessionId: null,
      pattern,
      activeAgent: null,
    });
  }, [session.sessionId, pattern, disconnectWs]);

  return { session, startSession, endSession };
}
