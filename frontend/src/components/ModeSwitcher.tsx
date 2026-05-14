import { useState } from 'react';

export type AppMode = 'developer' | 'app';

interface Props {
  mode: AppMode;
  onChange: (mode: AppMode) => void;
}

export function ModeSwitcher({ mode, onChange }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mode-switcher">
      <button
        className="mode-switcher__toggle"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <span className={`mode-switcher__dot mode-switcher__dot--${mode}`} />
        <span className="mode-switcher__label">
          {mode === 'developer' ? 'Developer Mode' : 'App Mode'}
        </span>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ transform: open ? 'rotate(180deg)' : undefined }}>
          <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      {open && (
        <div className="mode-switcher__dropdown">
          <button
            className={`mode-switcher__option ${mode === 'developer' ? 'mode-switcher__option--active' : ''}`}
            onClick={() => { onChange('developer'); setOpen(false); }}
          >
            <span className="mode-switcher__dot mode-switcher__dot--developer" />
            <span>Developer Mode</span>
            <span className="mode-switcher__desc">Orchestration, events, debugging</span>
          </button>
          <button
            className={`mode-switcher__option ${mode === 'app' ? 'mode-switcher__option--active' : ''}`}
            onClick={() => { onChange('app'); setOpen(false); }}
          >
            <span className="mode-switcher__dot mode-switcher__dot--app" />
            <span>App Mode</span>
            <span className="mode-switcher__desc">Customer experience view</span>
          </button>
        </div>
      )}
    </div>
  );
}
