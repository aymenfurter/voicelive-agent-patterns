import { useMemo } from 'react';
import type { SemanticEvent, FieldStatus } from '../types';
import { extractCollectedData } from '../utils/eventParser';

interface Props {
  events: SemanticEvent[];
  isActive: boolean;
}

const STATUS_CONFIG: Record<FieldStatus, { label: string; className: string }> = {
  'not-asked': { label: 'Pending', className: 'pb-status--pending' },
  'asked': { label: 'Asked', className: 'pb-status--asked' },
  'answered': { label: 'Answered', className: 'pb-status--answered' },
  'validated': { label: 'Validated', className: 'pb-status--validated' },
};

export function ProgressBoard({ events, isActive }: Props) {
  const { fields, claimType, progress } = useMemo(() => extractCollectedData(events), [events]);

  if (!isActive && fields.length === 0) {
    return (
      <div className="progress-board progress-board--empty">
        <div className="pb-title">Data Collection</div>
        <p className="pb-empty-msg">Start a session to see claim progress</p>
      </div>
    );
  }

  return (
    <div className="progress-board">
      <div className="pb-header">
        <div className="pb-title">
          Data Collection
          {claimType && <span className="pb-claim-type">{claimType}</span>}
        </div>
        <div className="pb-progress">
          <div className="pb-progress-bar">
            <div className="pb-progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <span className="pb-progress-label">{progress}%</span>
        </div>
      </div>

      {fields.length === 0 ? (
        <p className="pb-empty-msg">Waiting for questions…</p>
      ) : (
        <div className="pb-fields">
          {fields.map((field) => {
            const config = STATUS_CONFIG[field.status];
            return (
              <div key={field.id} className={`pb-field ${config.className}`}>
                <div className="pb-field-header">
                  <span className="pb-field-label">{field.label}</span>
                  <span className={`pb-field-badge ${config.className}`}>{config.label}</span>
                </div>
                {field.value && (
                  <div className="pb-field-value">{field.value}</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
