/**
 * Tier 1 — Mock UI: events panel rendering.
 */
import { test, expect } from '../fixtures';
import { events } from '../builders/events';

test.describe('Events Panel', () => {
  test.beforeEach(async ({ app, mock }) => {
    await app.goto();
    await mock.start();
  });

  test('session.created event appears', async ({ app, mock }) => {
    mock.send(events.sessionCreated());
    await expect(app.events.text('Session started')).toBeVisible({ timeout: 5000 });
  });

  test('tool.called event renders', async ({ app, mock }) => {
    mock.send(events.sessionCreated());
    mock.send(events.toolCalled('get_next_questions', { claim_type: 'auto' }));
    await expect(app.events.text('get_next_questions')).toBeVisible({ timeout: 5000 });
  });

  test('error event renders', async ({ app, mock }) => {
    mock.send(events.error('Connection timeout'));
    await expect(app.events.text('Connection timeout')).toBeVisible({ timeout: 5000 });
  });

  test('supervisor.exchange event renders', async ({ app, mock }) => {
    mock.send(events.sessionCreated());
    mock.send(
      events.supervisorExchange({
        model: 'gpt-4.1',
        tool_context: 'validate_answer',
        prompt_preview: 'Check if the answer is complete',
        response: 'The answer is valid',
        usage: { prompt_tokens: 100, completion_tokens: 50 },
      }),
    );
    await expect(app.events.text(/Supervisor.*gpt-4\.1/)).toBeVisible({ timeout: 5000 });
  });

  test('response.created shows "Agent thinking"', async ({ app, mock }) => {
    mock.send(events.responseCreated());
    await expect(app.events.text(/thinking/i)).toBeVisible({ timeout: 5000 });
  });

  test('response.done shows "Agent finished"', async ({ app, mock }) => {
    mock.send(events.responseDone());
    await expect(app.events.text(/finished/i)).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Timing', () => {
  test('events show timestamps', async ({ app, mock }) => {
    await app.goto();
    await mock.start();
    mock.send(events.sessionCreated());
    await expect(app.events.text('Session started')).toBeVisible({ timeout: 5000 });
    await expect(app.events.firstTime()).toBeVisible({ timeout: 5000 });
  });
});
