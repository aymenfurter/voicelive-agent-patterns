import { useState, useCallback, useRef, useEffect } from 'react';

interface Props {
  onSend: (text: string) => void;
  disabled: boolean;
}

export function TextInput({ onSend, disabled }: Props) {
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!disabled) inputRef.current?.focus();
  }, [disabled]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = text.trim();
      if (!trimmed || disabled) return;
      onSend(trimmed);
      setText('');
    },
    [text, disabled, onSend],
  );

  return (
    <form className="text-input-form" onSubmit={handleSubmit}>
      <input
        ref={inputRef}
        type="text"
        className="text-input-field"
        placeholder="Type a message (text mode)…"
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={disabled}
        data-testid="text-input"
      />
      <button
        type="submit"
        className="btn btn--primary btn--sm"
        disabled={disabled || !text.trim()}
        data-testid="text-send"
      >
        Send
      </button>
    </form>
  );
}
