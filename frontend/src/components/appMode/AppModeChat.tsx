import type { TranscriptMessage } from '../../types';
import { AppModeTextInput } from './AppModeTextInput';

interface Props {
  messages: TranscriptMessage[];
  isActive: boolean;
  textMode: boolean;
  onStart: () => void;
  onEnd: () => void;
  onTextSend: (text: string) => void;
}

export function AppModeChat({ messages, isActive, textMode, onStart, onEnd, onTextSend }: Props) {
  return (
    <div className="app-mode__chat">
      <div className="app-mode__chat-header">
        <span className="app-mode__chat-title">Claims Assistant</span>
        {isActive && <span className="app-mode__chat-live">Live</span>}
      </div>
      <div className="app-mode__chat-messages">
        {messages.length === 0 && !isActive && (
          <div className="app-mode__chat-welcome">
            <h3>Welcome to Contoso Claims</h3>
            <p>Start a conversation to file your insurance claim. Our AI assistant will guide you through the process.</p>
          </div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className={`app-mode__msg app-mode__msg--${msg.role}`}>
            {msg.role === 'agent' && (
              <div className="app-mode__msg-avatar">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="8" fill="var(--gold)" />
                  <path d="M5 8L7 10L11 6" stroke="var(--text-inv)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            )}
            <div className={`app-mode__msg-bubble app-mode__msg-bubble--${msg.role}`}>
              {msg.text}
            </div>
          </div>
        ))}
      </div>
      <div className="app-mode__chat-controls">
        {!isActive ? (
          <button className="btn btn--primary btn--lg app-mode__start-btn" onClick={onStart}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <circle cx="9" cy="9" r="7" stroke="currentColor" strokeWidth="1.5" />
              <circle cx="9" cy="9" r="3" fill="currentColor" />
            </svg>
            Start Claim
          </button>
        ) : (
          <div className="app-mode__active-controls">
            {textMode && <AppModeTextInput onSend={onTextSend} />}
            {!textMode && (
              <div className="app-mode__listening">
                <div className="app-mode__pulse" />
                <span>Listening...</span>
              </div>
            )}
            <button className="btn btn--danger btn--sm" onClick={onEnd}>End Call</button>
          </div>
        )}
      </div>
    </div>
  );
}
