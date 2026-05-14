/**
 * Tier 1 — Mock UI: progress board state transitions.
 */
import { test, expect } from '../fixtures';
import { events } from '../builders/events';

test.describe('Progress Board', () => {
  test('shows empty state before session', async ({ app }) => {
    await app.goto();
    await app.openStateTab();
    await expect(app.progressBoard.root).toBeVisible();
    await expect(app.progressBoard.emptyMsg).toBeVisible();
  });

  test('shows fields after get_next_questions result', async ({ app, mock }) => {
    await app.goto();
    await app.openStateTab();
    await mock.start();
    mock.send(events.sessionCreated());
    mock.send(events.toolCalled('get_next_questions', { claim_type: 'auto' }));
    mock.send(
      events.toolResult('get_next_questions', {
        questions: [
          { id: 'incident_date', text: 'When did the incident occur?' },
          { id: 'location', text: 'Where did it happen?' },
        ],
      }),
    );

    await expect(app.progressBoard.claimType).toContainText('auto', { timeout: 5000 });
    await expect(app.progressBoard.firstField).toBeVisible({ timeout: 5000 });
  });

  test('field moves to answered after validate_answer call', async ({ app, mock }) => {
    await app.goto();
    await app.openStateTab();
    await mock.start();
    mock.send(events.sessionCreated());
    mock.send(events.toolCalled('get_next_questions', { claim_type: 'auto' }));
    mock.send(
      events.toolResult('get_next_questions', {
        questions: [{ id: 'incident_date', text: 'When did the incident occur?' }],
      }),
    );
    mock.send(
      events.toolCalled('validate_answer', { question_id: 'incident_date', answer: 'March 15, 2024' }),
    );

    await expect(app.progressBoard.answeredField).toBeVisible({ timeout: 5000 });
  });

  test('field moves to validated on valid result', async ({ app, mock }) => {
    await app.goto();
    await app.openStateTab();
    await mock.start();
    mock.send(events.sessionCreated());
    mock.send(events.toolCalled('get_next_questions', { claim_type: 'auto' }));
    mock.send(
      events.toolResult('get_next_questions', {
        questions: [{ id: 'incident_date', text: 'When did the incident occur?' }],
      }),
    );
    mock.send(
      events.toolCalled('validate_answer', { question_id: 'incident_date', answer: 'March 15, 2024' }),
    );
    mock.send(events.toolResult('validate_answer', { valid: true }));

    await expect(app.progressBoard.validatedField).toBeVisible({ timeout: 5000 });
  });
});
