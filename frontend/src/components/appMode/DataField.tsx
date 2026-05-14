import type { FieldState } from '../../types';

interface Props {
  field: FieldState;
  multiline?: boolean;
}

export function DataField({ field, multiline }: Props) {
  return (
    <div className={`data-cell__field ${multiline ? 'data-cell__field--multi' : ''}`}>
      <span className="data-cell__field-label">{field.label}</span>
      <span className="data-cell__field-value">{field.value}</span>
      {field.status === 'validated' && (
        <svg className="data-cell__field-check" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="var(--ok)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="3 8 7 12 13 4" />
        </svg>
      )}
    </div>
  );
}
