import { useMemo } from 'react';
import type { SemanticEvent, TranscriptMessage } from '../types';
import { extractCollectedData } from '../utils/eventParser';
import { categorizeFields } from '../utils/fieldCategorization';
import { AppModeChat } from './appMode/AppModeChat';
import { AppModeDataGrid } from './appMode/AppModeDataGrid';

interface Props {
  events: SemanticEvent[];
  messages: TranscriptMessage[];
  isActive: boolean;
  onStart: () => void;
  onEnd: () => void;
  sessionStatus: string;
  onTextSend: (text: string) => void;
  textMode: boolean;
}

export function AppModeView({ events, messages, isActive, onStart, onEnd, onTextSend, textMode }: Props) {
  const { claimType, fields, location, progress } = useMemo(() => extractCollectedData(events), [events]);
  const categorized = useMemo(() => categorizeFields(fields), [fields]);
  const hasAnyData = fields.some((f) => f.value);

  return (
    <div className="app-mode">
      <div className="app-mode__header">
        <div className="app-mode__brand">
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
            <rect width="28" height="28" rx="6" fill="var(--gold)" />
            <path d="M7 14L12 19L21 9" stroke="var(--text-inv)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div>
            <div className="app-mode__brand-name">Contoso Insurance</div>
            <div className="app-mode__brand-sub">Claims Intake</div>
          </div>
        </div>
        {hasAnyData && (
          <div className="app-mode__progress-bar">
            <div className="app-mode__progress-fill" style={{ width: `${progress}%` }} />
            <span className="app-mode__progress-label">{progress}% complete</span>
          </div>
        )}
      </div>

      <div className="app-mode__body">
        <div className="app-mode__left">
          <AppModeChat
            messages={messages}
            isActive={isActive}
            textMode={textMode}
            onStart={onStart}
            onEnd={onEnd}
            onTextSend={onTextSend}
          />
        </div>

        <div className="app-mode__right">
          {!hasAnyData ? (
            <div className="app-mode__empty-state">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
                <rect x="9" y="3" width="6" height="4" rx="1" />
                <path d="M9 12h6M9 16h4" />
              </svg>
              <p>Your claim data will appear here as you provide information to the assistant.</p>
            </div>
          ) : (
            <AppModeDataGrid categorized={categorized} claimType={claimType} location={location} />
          )}
        </div>
      </div>
    </div>
  );
}
