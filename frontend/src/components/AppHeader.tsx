import { ModeSwitcher, type AppMode } from './ModeSwitcher';
import { PatternSelector } from './PatternSelector';
import type { Pattern } from '../types';

interface Props {
  appMode: AppMode;
  onAppModeChange: (m: AppMode) => void;
  textMode: boolean;
  onTextModeChange: (v: boolean) => void;
  pattern: Pattern;
  onPatternChange: (p: Pattern) => void;
}

export function AppHeader({ appMode, onAppModeChange, textMode, onTextModeChange, pattern, onPatternChange }: Props) {
  return (
    <header className="app-header">
      <div className="header-left">
        <span className="app-title">Voice Live API Q&amp;A</span>
        <span className="badge">Insurance Claims Intake</span>
      </div>
      <div className="header-right">
        <ModeSwitcher mode={appMode} onChange={onAppModeChange} />
        <label className="text-mode-toggle" data-testid="text-mode-toggle">
          <input
            type="checkbox"
            checked={textMode}
            onChange={(e) => onTextModeChange(e.target.checked)}
          />
          <span className="text-mode-label">Text Mode</span>
        </label>
        <PatternSelector pattern={pattern} onChange={onPatternChange} />
      </div>
    </header>
  );
}
