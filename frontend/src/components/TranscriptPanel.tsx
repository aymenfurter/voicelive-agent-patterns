import { useRef, useEffect } from 'react';
import type { TranscriptMessage } from '../types';

interface Props {
  messages: TranscriptMessage[];
}

export function TranscriptPanel({ messages }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <div className="panel transcript-panel" data-testid="transcript-panel">
      <div className="panel-header">
        <span className="panel-header__title">Transcript</span>
      </div>
      <div className="panel-content transcript-messages" data-testid="transcript-messages">
        {messages.length === 0 && (
          <div className="empty-state">Start a session to begin the conversation.</div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className={`message message-${msg.role}`} data-testid={`message-${msg.role}`}>
            <div className="message-bubble">
              {msg.agentName && (
                <span className="agent-label">{msg.agentName}</span>
              )}
              <span>
                {msg.text}
                {msg.isPartial && <span className="typing-indicator">●</span>}
              </span>
            </div>
            <span className="message-time">{formatTime(msg.timestamp)}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
