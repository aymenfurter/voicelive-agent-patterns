import { SessionConfigPanel } from './SessionConfigPanel';
import { TranscriptPanel } from './TranscriptPanel';
import { VoiceArea } from './VoiceArea';
import { EventsPanel } from './EventsPanel';
import { OrchestrationPanel } from './OrchestrationPanel';
import { ProgressBoard } from './ProgressBoard';
import { PromptDiffPanel } from './PromptDiffPanel';
import { TextInput } from './TextInput';
import { CallStatePanel } from './CallStatePanel';
import { ApiHistogram } from './ApiHistogram';
import { Tabs } from './Tabs';
import { useUiTabs } from '../hooks/useUiState';
import type { RealtimeSession } from '../hooks/useRealtimeSession';
import type { SessionConfig } from '../types';

interface Props {
  rt: RealtimeSession;
  onSessionConfigChange: (c: SessionConfig) => void;
}

const CENTER_TABS = [
  { id: 'state' as const, label: 'State' },
  { id: 'flow' as const, label: 'Flow' },
];

const RIGHT_TABS = [
  { id: 'events' as const, label: 'Events' },
  { id: 'api' as const, label: 'API Calls' },
];

export function DeveloperLayout({ rt, onSessionConfigChange }: Props) {
  const { centerTab, setCenterTab, rightTab, setRightTab } = useUiTabs();
  const isActive = rt.session.status === 'active';

  return (
    <>
      <SessionConfigPanel
        config={rt.sessionConfig}
        onChange={onSessionConfigChange}
        disabled={isActive}
      />

      <main className="app-main">
        <TranscriptPanel messages={rt.messages} />

        <div className="center-column">
          <Tabs items={CENTER_TABS} value={centerTab} onChange={setCenterTab} />
          <div className="center-tab-content">
            {centerTab === 'state' && (
              <>
                <ProgressBoard events={rt.events} isActive={isActive} />
                <CallStatePanel
                  pattern={rt.pattern}
                  events={rt.events}
                  messages={rt.messages}
                  isActive={isActive}
                />
                <PromptDiffPanel events={rt.events} isActive={isActive} />
              </>
            )}
            {centerTab === 'flow' && (
              <OrchestrationPanel
                pattern={rt.pattern}
                events={rt.events}
                isActive={isActive}
              />
            )}
          </div>

          <VoiceArea
            session={rt.session}
            onStart={rt.startSession}
            onEnd={rt.endSession}
            userAmplitude={rt.userAmplitude}
            aiAmplitude={rt.aiAmplitude}
          />
          {rt.textMode && isActive && (
            <TextInput onSend={rt.sendText} disabled={!isActive} />
          )}
        </div>

        <div className="panel right-panel">
          <Tabs
            items={RIGHT_TABS}
            value={rightTab}
            onChange={setRightTab}
            className="right-panel__tabs"
          />
          {rightTab === 'events' && (
            <EventsPanel events={rt.events} onClear={rt.clearEvents} model={rt.sessionConfig.model} />
          )}
          {rightTab === 'api' && <ApiHistogram events={rt.events} />}
        </div>
      </main>
    </>
  );
}
