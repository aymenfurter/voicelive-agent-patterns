/**
 * Tier 1 — Mock UI: transcript rendering.
 */
import { test, expect } from '../fixtures';
import { events } from '../builders/events';

test.describe('Transcript', () => {
  test('agent transcript appears on transcript.done', async ({ app, mock }) => {
    await app.goto();
    await mock.start();
    mock.send(events.sessionCreated());
    mock.send(events.transcriptDone('Hello! How can I help you today?'));
    await expect(app.transcript.text('Hello! How can I help you today?')).toBeVisible({ timeout: 5000 });
  });

  test('partial transcript shows typing indicator', async ({ app, mock }) => {
    await app.goto();
    await mock.start();
    mock.send(events.sessionCreated());
    mock.send(events.transcriptDelta('Hello'));
    await expect(app.transcript.text('Hello')).toBeVisible({ timeout: 5000 });
    await expect(app.transcript.typingIndicator).toBeVisible();
  });

  test('transcript from multiple agents renders correctly', async ({ app, mock }) => {
    mock.setPattern('sequential-handoff');
    await app.goto();
    await app.selectPattern('sequential-handoff');
    await mock.start();
    mock.send(events.sessionCreated());
    mock.send(events.transcriptDone('Welcome!', 'greeter'));
    mock.send(events.transcriptDone('Let me help with auto claims.', 'auto_claims'));

    await expect(app.transcript.text('Welcome!')).toBeVisible({ timeout: 5000 });
    await expect(app.transcript.text('Let me help with auto claims.')).toBeVisible({ timeout: 5000 });
  });
});
