import { useRef } from 'react';

interface Props {
  onSend: (text: string) => void;
}

export function AppModeTextInput({ onSend }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const val = inputRef.current?.value.trim();
    if (val) {
      onSend(val);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <form className="app-mode__text-input" onSubmit={handleSubmit}>
      <input
        ref={inputRef}
        type="text"
        placeholder="Type your answer..."
        className="app-mode__text-field"
      />
      <button type="submit" className="btn btn--primary btn--sm">Send</button>
    </form>
  );
}
