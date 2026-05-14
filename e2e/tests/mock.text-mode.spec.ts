/**
 * Tier 1 — Mock UI: text mode toggle and message sending.
 */
import { test, expect } from '../fixtures';
import { events } from '../builders/events';

test.describe('Text Mode', () => {
  test('text mode toggle is visible', async ({ app }) => {
    await app.goto();
    await expect(app.textMode.toggle).toBeVisible();
  });

  test('text input appears when text mode enabled and session active', async ({ app, mock }) => {
    await app.goto();
    await mock.start();
    mock.send(events.sessionCreated());
    await app.textMode.enable();
    await expect(app.textMode.input).toBeVisible({ timeout: 5000 });
  });

  test('text input not visible when text mode disabled', async ({ app, mock }) => {
    await app.goto();
    await mock.start();
    mock.send(events.sessionCreated());
    await expect(app.textMode.input).not.toBeVisible();
  });

  test('sending text adds user message to transcript', async ({ app, mock }) => {
    await app.goto();
    await mock.start();
    mock.send(events.sessionCreated());
    await app.textMode.enable();
    await expect(app.textMode.input).toBeVisible({ timeout: 5000 });

    await app.textMode.sendMessage('I need to file a claim');
    mock.send(events.textSent('I need to file a claim'));

    await expect(app.transcript.text('I need to file a claim')).toBeVisible({ timeout: 5000 });
  });
});
