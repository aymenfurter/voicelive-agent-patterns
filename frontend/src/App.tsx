import { useState } from 'react';
import { AppHeader } from './components/AppHeader';
import { AppProviders } from './components/AppProviders';
import { DeveloperLayout } from './components/DeveloperLayout';
import { AppModeView } from './components/AppModeView';
import { CallSummary } from './components/CallSummary';
import { StatusBar } from './components/StatusBar';
import { useRealtimeSession } from './hooks/useRealtimeSession';
import type { AppMode } from './components/ModeSwitcher';

function App() {
  const rt = useRealtimeSession('chat-supervisor');
  const [appMode, setAppMode] = useState<AppMode>('developer');

  return (
    <AppProviders rt={rt} appMode={appMode} setAppMode={setAppMode}>
      <div className="app-container">
        <AppHeader
          appMode={appMode}
          onAppModeChange={setAppMode}
          textMode={rt.textMode}
          onTextModeChange={rt.setTextMode}
          pattern={rt.pattern}
          onPatternChange={rt.setPattern}
        />

        {appMode === 'developer' ? (
          <DeveloperLayout rt={rt} onSessionConfigChange={rt.setSessionConfig} />
        ) : (
          <AppModeView
            events={rt.events}
            messages={rt.messages}
            isActive={rt.session.status === 'active'}
            onStart={rt.startSession}
            onEnd={rt.endSession}
            sessionStatus={rt.session.status}
            onTextSend={rt.sendText}
            textMode={rt.textMode}
          />
        )}

        {appMode !== 'app' && (
          <StatusBar
            isConnected={rt.isConnected}
            session={rt.session}
            tokenUsage={rt.tokenUsage}
            model={rt.sessionConfig.model}
          />
        )}

        {rt.claimResult && (
          <CallSummary
            claim={rt.claimResult}
            messages={rt.messages}
            events={rt.events}
            onDismiss={() => rt.setClaimResult(null)}
          />
        )}
      </div>
    </AppProviders>
  );
}

export default App;
