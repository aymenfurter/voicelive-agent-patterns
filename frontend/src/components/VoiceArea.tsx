import { VoiceAnimation } from './VoiceAnimation';
import type { SessionState } from '../types';

interface Props {
  session: SessionState;
  onStart: () => void;
  onEnd: () => void;
  userAmplitude: number;
  aiAmplitude: number;
}

const MicIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
    <line x1="12" y1="19" x2="12" y2="23"/>
    <line x1="8" y1="23" x2="16" y2="23"/>
  </svg>
);

const MicOffIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="1" y1="1" x2="23" y2="23"/>
    <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/>
    <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .76-.13 1.49-.35 2.17"/>
    <line x1="12" y1="19" x2="12" y2="23"/>
    <line x1="8" y1="23" x2="16" y2="23"/>
  </svg>
);

export function VoiceArea({ session, onStart, onEnd, userAmplitude, aiAmplitude }: Props) {
  const isActive = session.status === 'active';
  const isConnecting = session.status === 'connecting';

  return (
    <div className="panel voice-area">
      <div className="voice-center">
        <VoiceAnimation
          userAmplitude={isActive ? userAmplitude : 0}
          aiAmplitude={isActive ? aiAmplitude : 0}
          isActive={isActive}
        />

        {session.activeAgent && isActive && (
          <span className="active-agent-label">{session.activeAgent}</span>
        )}

        <div className="voice-controls">
          {!isActive ? (
            <button
              className="btn btn--primary btn--lg"
              onClick={onStart}
              disabled={isConnecting}
              data-testid="start-session"
            >
              <MicIcon />
              {isConnecting ? 'Connecting…' : 'Start Session'}
            </button>
          ) : (
            <button className="btn btn--danger btn--lg" onClick={onEnd} data-testid="end-session">
              <MicOffIcon />
              End Session
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
