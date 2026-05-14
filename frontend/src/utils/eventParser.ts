import type { SemanticEvent, FieldState, FieldStatus, CollectedData } from '../types';
import {
  TOOL_GET_NEXT_QUESTIONS,
  TOOL_VALIDATE_ANSWER,
  TOOL_SUBMIT_CLAIM,
  LOCATION_QUESTION_IDS,
} from '../constants';

export function formatFieldLabel(id: string): string {
  return id
    .replace(/^(auto|property|health)_/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Find the question_id associated with a validate_answer result by looking back at the call. */
function findQuestionId(resultEvent: SemanticEvent, events: SemanticEvent[]): string | null {
  const idx = events.indexOf(resultEvent);
  for (let i = idx - 1; i >= 0; i--) {
    const e = events[i];
    if (e.type === 'tool.called') {
      const data = (e.details?.data as Record<string, unknown>) ?? e.details ?? {};
      const name = (data.name as string) ?? '';
      if (name === TOOL_VALIDATE_ANSWER) {
        const args = (data.arguments as Record<string, unknown>) ?? {};
        return (args.question_id as string) ?? null;
      }
    }
  }
  return null;
}

/** Extract collected claim data from events — used by ProgressBoard and AppModeView. */
export function extractCollectedData(events: SemanticEvent[]): CollectedData {
  let claimType: string | null = null;
  let location: string | null = null;
  const fieldsMap = new Map<string, FieldState>();

  for (const e of events) {
    if (e.type === 'tool.called') {
      const data = (e.details?.data as Record<string, unknown>) ?? e.details ?? {};
      const name = (data.name as string) ?? '';
      const args = (data.arguments as Record<string, unknown>) ?? {};

      if (name === TOOL_GET_NEXT_QUESTIONS && args.claim_type) {
        claimType = args.claim_type as string;
      }
      if (name === TOOL_VALIDATE_ANSWER) {
        const qid = (args.question_id as string) ?? '';
        const answer = (args.answer as string) ?? '';
        if (qid) {
          if (!fieldsMap.has(qid)) {
            fieldsMap.set(qid, { id: qid, label: formatFieldLabel(qid), status: 'answered', value: answer });
          } else {
            fieldsMap.get(qid)!.status = 'answered';
            fieldsMap.get(qid)!.value = answer;
          }
          const qidLower = qid.toLowerCase();
          if (LOCATION_QUESTION_IDS.has(qid) || qidLower.includes('location') || qidLower.includes('address') || qidLower.includes('where')) {
            location = answer;
          }
        }
      }
    }

    if (e.type === 'tool.result') {
      const data = (e.details?.data as Record<string, unknown>) ?? e.details ?? {};
      const name = (data.name as string) ?? '';
      const result = (data.result as Record<string, unknown>) ?? {};

      if (name === TOOL_GET_NEXT_QUESTIONS) {
        const questions = (result.questions as Array<Record<string, unknown>>) ?? [];
        for (const q of questions) {
          const qid = (q.id as string) ?? (q.question_id as string) ?? '';
          const text = (q.text as string) ?? (q.question as string) ?? qid;
          if (qid && !fieldsMap.has(qid)) {
            fieldsMap.set(qid, { id: qid, label: text, status: 'asked' as FieldStatus });
          }
        }
      }

      if (name === TOOL_VALIDATE_ANSWER) {
        const qid = findQuestionId(e, events);
        const valid = result.valid ?? result.is_valid;
        if (qid && valid === true && fieldsMap.has(qid)) {
          fieldsMap.get(qid)!.status = 'validated';
        }
      }

      if (name === TOOL_SUBMIT_CLAIM) {
        for (const [, field] of fieldsMap) {
          if (field.status === 'answered') field.status = 'validated';
        }
      }
    }
  }

  const fields = Array.from(fieldsMap.values());
  const total = fields.length || 1;
  const done = fields.filter((f) => f.status === 'validated').length;
  const progress = Math.round((done / total) * 100);

  return { claimType, fields, location, progress };
}
