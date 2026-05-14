import { useState } from 'react';
import type { SessionConfig, TurnDetectionMode, NoiseReductionType, CompactionStrategy } from '../types';
import { DEFAULT_SESSION_CONFIG } from '../types';

interface Props {
  config: SessionConfig;
  onChange: (config: SessionConfig) => void;
  disabled: boolean;
}

const MODELS = [
  { value: 'gpt-realtime', label: 'gpt-realtime', version: '2025-08-28', tier: 'GA' },
  { value: 'gpt-realtime-mini', label: 'gpt-realtime-mini', version: '2025-12-15', tier: 'GA' },
  { value: 'gpt-realtime-1.5', label: 'gpt-realtime-1.5', version: '2026-02-23', tier: 'GA' },
  { value: 'gpt-4o-realtime-preview', label: 'gpt-4o-realtime-preview', version: '2024-12-17', tier: 'Preview' },
  { value: 'gpt-4o-mini-realtime-preview', label: 'gpt-4o-mini-realtime-preview', version: '2024-12-17', tier: 'Preview' },
  { value: 'phi4-mm-realtime', label: 'phi4-mm-realtime', version: '', tier: 'Phi' },
];

const VOICES = [
  { value: 'en-US-Aria:DragonHDLatestNeural', label: 'Aria', engine: 'Dragon HD' },
  { value: 'en-US-Ava:DragonHDLatestNeural', label: 'Ava', engine: 'Dragon HD' },
  { value: 'en-US-Andrew:DragonHDLatestNeural', label: 'Andrew', engine: 'Dragon HD' },
  { value: 'en-US-Emma:DragonHDLatestNeural', label: 'Emma', engine: 'Dragon HD' },
  { value: 'en-US-Brian:DragonHDLatestNeural', label: 'Brian', engine: 'Dragon HD' },
  { value: 'alloy', label: 'Alloy', engine: 'OpenAI' },
  { value: 'echo', label: 'Echo', engine: 'OpenAI' },
  { value: 'shimmer', label: 'Shimmer', engine: 'OpenAI' },
];

const TURN_DETECTION_MODES: { value: TurnDetectionMode; label: string; desc: string }[] = [
  { value: 'semantic_vad', label: 'Semantic VAD', desc: 'AI-based turn detection' },
  { value: 'server_vad', label: 'Server VAD', desc: 'Volume-based detection' },
  { value: 'none', label: 'Manual', desc: 'No auto-detection' },
];

const NOISE_REDUCTION_MODES: { value: NoiseReductionType; label: string }[] = [
  { value: 'far_field', label: 'Far-field' },
  { value: 'near_field', label: 'Near-field' },
  { value: 'off', label: 'Off' },
];

const COMPACTION_STRATEGIES: { value: CompactionStrategy; label: string; desc: string }[] = [
  { value: 'off', label: 'Off', desc: 'Keep full conversation history in context (no pruning)' },
  { value: 'rolling_5', label: 'Rolling 5', desc: 'Keep last 5 conversation turns, delete older items' },
  { value: 'rolling_10', label: 'Rolling 10', desc: 'Keep last 10 conversation turns, delete older items' },
  { value: 'token_budget_4k', label: 'Budget 4K', desc: 'Delete oldest items when context exceeds 4,000 input tokens' },
];

export function SessionConfigPanel({ config, onChange, disabled }: Props) {
  const [expanded, setExpanded] = useState(false);

  const update = <K extends keyof SessionConfig>(key: K, value: SessionConfig[K]) => {
    onChange({ ...config, [key]: value });
  };

  const reset = () => onChange({ ...DEFAULT_SESSION_CONFIG });

  return (
    <div className="session-config-panel" data-testid="session-config-panel">
      <button
        className="session-config-toggle"
        onClick={() => setExpanded(!expanded)}
        data-testid="config-toggle"
      >
        <span className="config-toggle-icon">{expanded ? '▾' : '▸'}</span>
        <span>Session Config</span>
        {!expanded && (
          <span className="config-summary">
            {MODELS.find((m) => m.value === config.model)?.label} &middot; {config.temperature} &middot; {VOICES.find((v) => v.value === config.voice)?.label}
          </span>
        )}
      </button>

      {expanded && (
        <div className="session-config-body">
          {/* Section: Model & Generation */}
          <div className="config-section">
            <div className="config-section__title">Model &amp; Generation</div>
            <div className="config-section__content">
              <div className="config-field">
                <label className="config-field__label">Model</label>
                <select
                  value={config.model}
                  onChange={(e) => update('model', e.target.value)}
                  disabled={disabled}
                  data-testid="config-model"
                  className="config-field__select"
                >
                  <optgroup label="GA Models">
                    {MODELS.filter((m) => m.tier === 'GA').map((m) => (
                      <option key={m.value} value={m.value}>{m.label} ({m.version})</option>
                    ))}
                  </optgroup>
                  <optgroup label="Preview Models">
                    {MODELS.filter((m) => m.tier === 'Preview').map((m) => (
                      <option key={m.value} value={m.value}>{m.label} ({m.version})</option>
                    ))}
                  </optgroup>
                  <optgroup label="Phi Models">
                    {MODELS.filter((m) => m.tier === 'Phi').map((m) => (
                      <option key={m.value} value={m.value}>{m.label}{m.version ? ` (${m.version})` : ''}</option>
                    ))}
                  </optgroup>
                </select>
              </div>

              <div className="config-field">
                <label className="config-field__label">
                  Temperature
                  <span className="config-field__value">{config.temperature.toFixed(1)}</span>
                </label>
                <input
                  type="range"
                  min="0.6"
                  max="1.2"
                  step="0.1"
                  value={config.temperature}
                  onChange={(e) => update('temperature', parseFloat(e.target.value))}
                  disabled={disabled}
                  data-testid="config-temperature"
                  className="config-field__range"
                />
                <div className="config-field__range-labels">
                  <span>0.6</span><span>1.2</span>
                </div>
              </div>

              <div className="config-field">
                <label className="config-field__label">Max Output Tokens</label>
                <select
                  value={config.maxOutputTokens === 'inf' ? 'inf' : String(config.maxOutputTokens)}
                  onChange={(e) => {
                    const v = e.target.value;
                    update('maxOutputTokens', v === 'inf' ? 'inf' : parseInt(v));
                  }}
                  disabled={disabled}
                  data-testid="config-max-tokens"
                  className="config-field__select"
                >
                  <option value="inf">Unlimited</option>
                  <option value="256">256</option>
                  <option value="512">512</option>
                  <option value="1024">1024</option>
                  <option value="2048">2048</option>
                  <option value="4096">4096</option>
                </select>
              </div>
            </div>
          </div>

          {/* Section: Voice & Audio */}
          <div className="config-section">
            <div className="config-section__title">Voice &amp; Audio</div>
            <div className="config-section__content">
              <div className="config-field">
                <label className="config-field__label">Voice</label>
                <select
                  value={config.voice}
                  onChange={(e) => update('voice', e.target.value)}
                  disabled={disabled}
                  data-testid="config-voice"
                  className="config-field__select"
                >
                  <optgroup label="Azure Dragon HD">
                    {VOICES.filter((v) => v.engine === 'Dragon HD').map((v) => (
                      <option key={v.value} value={v.value}>{v.label}</option>
                    ))}
                  </optgroup>
                  <optgroup label="OpenAI">
                    {VOICES.filter((v) => v.engine === 'OpenAI').map((v) => (
                      <option key={v.value} value={v.value}>{v.label}</option>
                    ))}
                  </optgroup>
                </select>
              </div>

              <div className="config-field">
                <label className="config-field__label">Noise Reduction</label>
                <div className="config-field__chips">
                  {NOISE_REDUCTION_MODES.map((n) => (
                    <button
                      key={n.value}
                      className={`config-chip${config.noiseReduction === n.value ? ' config-chip--active' : ''}`}
                      onClick={() => update('noiseReduction', n.value)}
                      disabled={disabled}
                    >
                      {n.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="config-field config-field--inline">
                <label className="config-field__checkbox">
                  <input
                    type="checkbox"
                    checked={config.echoCancellation}
                    onChange={(e) => update('echoCancellation', e.target.checked)}
                    disabled={disabled}
                  />
                  <span>Echo Cancellation</span>
                </label>
              </div>
            </div>
          </div>

          {/* Section: Turn Detection + Context Compaction (stacked) */}
          <div className="config-column">
            <div className="config-section config-section--nested">
              <div className="config-section__title">Turn Detection</div>
              <div className="config-section__content">
                <div className="config-field">
                  <div className="config-field__chips">
                    {TURN_DETECTION_MODES.map((t) => (
                      <button
                        key={t.value}
                        className={`config-chip${config.turnDetection === t.value ? ' config-chip--active' : ''}`}
                        onClick={() => update('turnDetection', t.value)}
                        disabled={disabled}
                        data-testid={`config-td-${t.value}`}
                        title={t.desc}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                {config.turnDetection === 'server_vad' && (
                  <>
                    <div className="config-field">
                      <label className="config-field__label">
                        Threshold
                        <span className="config-field__value">{config.vadThreshold.toFixed(2)}</span>
                      </label>
                      <input
                        type="range"
                        min="0.1"
                        max="0.9"
                        step="0.05"
                        value={config.vadThreshold}
                        onChange={(e) => update('vadThreshold', parseFloat(e.target.value))}
                        disabled={disabled}
                        className="config-field__range"
                      />
                    </div>
                    <div className="config-field">
                      <label className="config-field__label">
                        Silence Duration
                        <span className="config-field__value">{config.silenceDurationMs}ms</span>
                      </label>
                      <input
                        type="range"
                        min="200"
                        max="2000"
                        step="100"
                        value={config.silenceDurationMs}
                        onChange={(e) => update('silenceDurationMs', parseInt(e.target.value))}
                        disabled={disabled}
                        className="config-field__range"
                      />
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="config-section config-section--nested">
              <div className="config-section__title">Context Compaction</div>
              <div className="config-section__content">
                <div className="config-field">
                  <div className="config-field__chips config-field__chips--wrap">
                    {COMPACTION_STRATEGIES.map((s) => (
                      <button
                        key={s.value}
                        className={`config-chip${config.compactionStrategy === s.value ? ' config-chip--active' : ''}`}
                        onClick={() => update('compactionStrategy', s.value)}
                        disabled={disabled}
                        title={s.desc}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                  <div className="config-field__hint">
                    {COMPACTION_STRATEGIES.find((s) => s.value === config.compactionStrategy)?.desc}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="config-footer">
            <button onClick={reset} disabled={disabled} className="config-reset-btn">
              Reset Defaults
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
