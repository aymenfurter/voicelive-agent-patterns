import { useState, useCallback } from 'react';
import type { TranscriptMessage } from '../types';

export function useTranscript() {
  const [messages, setMessages] = useState<TranscriptMessage[]>([]);

  const addMessage = useCallback((msg: TranscriptMessage) => {
    setMessages((prev) => {
      // Remove any partial message with the well-known 'current-response' id
      const filtered = prev.filter((m) => !(m.isPartial && m.id === 'current-response'));
      return [...filtered, msg];
    });
  }, []);

  const updatePartialMessage = useCallback(
    (id: string, deltaText: string, role: 'user' | 'agent', agentName?: string) => {
      setMessages((prev) => {
        const idx = prev.findIndex((m) => m.id === id);
        if (idx >= 0) {
          const updated = [...prev];
          // Append delta to existing partial text
          updated[idx] = { ...updated[idx], text: updated[idx].text + deltaText, isPartial: true };
          return updated;
        }
        return [...prev, { id, role, text: deltaText, timestamp: Date.now(), isPartial: true, agentName }];
      });
    },
    [],
  );

  const clearMessages = useCallback(() => setMessages([]), []);

  return { messages, addMessage, updatePartialMessage, clearMessages };
}
