/**
 * Tier 1 — Mock UI: session lifecycle.
 */
import { test, expect } from '../fixtures';
import { events } from '../builders/events';

test.describe('Session Lifecycle', () => {
  test('shows Start Session button on load', async ({ app }) => {
    await app.goto();
    await expect(app.startSession).toBeVisible();
    await expect(app.startSession).toContainText('Start Session');
  });

  test('status shows Disconnected initially', async ({ app }) => {
    await app.goto();
    await expect(app.connectionStatus).toHaveAttribute('data-status', 'disconnected');
  });

  test('clicking Start Session connects and shows End Session', async ({ app, mock }) => {
    await app.goto();
    await mock.start();
    mock.send(events.sessionCreated());
    await expect(app.endSession).toBeVisible({ timeout: 5000 });
  });

  test('clicking End Session returns to idle', async ({ app, mock }) => {
    await app.goto();
    await mock.start();
    mock.send(events.sessionCreated());
    await expect(app.endSession).toBeVisible({ timeout: 5000 });
    await app.endSession.click();
    await expect(app.startSession).toBeVisible({ timeout: 5000 });
  });
});
