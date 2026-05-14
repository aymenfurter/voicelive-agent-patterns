/**
 * Tier 1 — Mock UI: prompt diff panel.
 */
import { test, expect } from '../fixtures';
import { events } from '../builders/events';

test.describe('Prompt Diff Panel', () => {
  test.beforeEach(async ({ app, mock }) => {
    await app.goto();
    await app.openStateTab();
    await mock.start();
    mock.send(events.sessionCreated());
  });

  test('prompt diff panel toggle is visible', async ({ app, mock }) => {
    mock.send(
      events.promptUpdated({
        agent: 'greeter',
        prompt: 'You are the Greeter Agent.',
        reason: 'Session started',
      }),
    );
    await expect(app.promptDiff.toggle).toBeVisible({ timeout: 5000 });
  });

  test('expanding shows prompt content', async ({ app, mock }) => {
    mock.send(
      events.promptUpdated({
        agent: 'greeter',
        prompt: 'You are the Greeter Agent.',
        reason: 'Session started',
      }),
    );
    await app.promptDiff.expand();
    await expect(app.promptDiff.content).toBeVisible({ timeout: 5000 });
    await expect(app.promptDiff.content).toContainText('Greeter Agent');
  });

  test('shows diff on prompt change', async ({ app, mock }) => {
    mock.send(
      events.promptUpdated({
        agent: 'greeter',
        prompt: 'You are the Greeter Agent.',
        reason: 'Session started',
      }),
    );
    mock.send(
      events.promptUpdated({
        agent: 'auto_claims',
        prompt: 'You are the Auto Claims Agent.',
        reason: 'Handoff to auto_claims',
      }),
    );
    await app.promptDiff.expand();
    await expect(app.promptDiff.firstTimelineItem).toBeVisible({ timeout: 5000 });
    await expect(app.promptDiff.count).toContainText('2 updates');
  });
});
