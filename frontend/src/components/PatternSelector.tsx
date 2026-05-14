import type { Pattern } from '../types';

interface Props {
  pattern: Pattern;
  onChange: (pattern: Pattern) => void;
}

const descriptions: Record<Pattern, string> = {
  'chat-supervisor': 'A supervisor agent routes questions to specialized sub-agents in parallel.',
  'sequential-handoff': 'Agents hand off to each other sequentially, each handling a specific phase.',
};

const patterns: { value: Pattern; label: string }[] = [
  { value: 'chat-supervisor', label: 'Chat-Supervisor' },
  { value: 'sequential-handoff', label: 'Sequential Handoff' },
];

export function PatternSelector({ pattern, onChange }: Props) {
  return (
    <div className="pattern-selector">
      <div className="tabs">
        {patterns.map((p) => (
          <button
            key={p.value}
            className={`tab${pattern === p.value ? ' tab--active' : ''}`}
            onClick={() => onChange(p.value)}
            data-testid={`tab-${p.value}`}
          >
            {p.label}
          </button>
        ))}
      </div>
      <span className="pattern-description">{descriptions[pattern]}</span>
    </div>
  );
}
