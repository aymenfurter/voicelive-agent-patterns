/**
 * Tier 1 — Mock UI: pattern switching, agent handoff, full conversation flows.
 */
import { test, expect } from '../fixtures';
import { events } from '../builders/events';

test.describe('Pattern Switching', () => {
  test('Chat-Supervisor is active by default', async ({ app }) => {
    await app.goto();
    await expect(app.patternTab('chat-supervisor')).toHaveClass(/tab--active/);
  });

  test('switching to Sequential Handoff', async ({ app }) => {
    await app.goto();
    await app.selectPattern('sequential-handoff');
    await expect(app.patternTab('sequential-handoff')).toHaveClass(/tab--active/);
    await expect(app.patternTab('chat-supervisor')).not.toHaveClass(/tab--active/);
  });

  test('switching back to Chat-Supervisor', async ({ app }) => {
    await app.goto();
    await app.selectPattern('sequential-handoff');
    await app.selectPattern('chat-supervisor');
    await expect(app.patternTab('chat-supervisor')).toHaveClass(/tab--active/);
  });
});

test.describe('Agent Handoff', () => {
  test('agent.handoff event shows from/to', async ({ app, mock }) => {
    mock.setPattern('sequential-handoff');
    await app.goto();
    await app.selectPattern('sequential-handoff');
    await mock.start();
    mock.send(events.sessionCreated());
    mock.send(
      events.agentHandoff({
        from: 'greeter',
        to: 'auto_claims',
        reason: 'User wants auto claim',
        new_tools: ['validate_answer'],
      }),
    );
    await expect(app.events.text(/greeter.*auto_claims/)).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Full Mock Conversation', () => {
  test('Chat-Supervisor full event sequence', async ({ app, mock }) => {
    await app.goto();
    await mock.start();

    mock.send(events.sessionCreated());
    mock.send(events.sessionUpdated());
    mock.send(events.responseCreated());
    mock.send(events.transcriptDelta('Welcome! '));
    mock.send(events.transcriptDelta('What type of claim?'));
    mock.send(events.transcriptDone('Welcome! What type of claim?'));
    mock.send(events.responseDone());

    await expect(app.transcript.text('Welcome! What type of claim?')).toBeVisible({ timeout: 5000 });
    await expect(app.events.text('Session started')).toBeVisible();
    await expect(app.events.text(/thinking/i)).toBeVisible();
    await expect(app.events.text(/finished/i)).toBeVisible();
  });

  test('tool call + supervisor exchange flow', async ({ app, mock }) => {
    await app.goto();
    await mock.start();

    mock.send(events.sessionCreated());
    mock.send(events.toolCalled('validate_answer', { question_id: 'policy_number', answer: 'POL123' }));
    mock.send(events.toolResult('validate_answer', { valid: true }));
    mock.send(
      events.supervisorExchange({
        model: 'gpt-4.1',
        tool_context: 'validate_answer',
        response: 'Valid',
        usage: { prompt_tokens: 80, completion_tokens: 20 },
      }),
    );

    await expect(app.events.text('validate_answer').first()).toBeVisible({ timeout: 5000 });
    await expect(app.events.text(/Supervisor/)).toBeVisible({ timeout: 5000 });
  });

  test('Sequential Handoff multi-agent flow', async ({ app, mock }) => {
    mock.setPattern('sequential-handoff');
    await app.goto();
    await app.selectPattern('sequential-handoff');
    await mock.start();

    mock.send(events.sessionCreated());
    mock.send(events.responseCreated());
    mock.send(events.transcriptDone('Welcome to insurance claims!', 'greeter'));
    mock.send(events.responseDone());
    mock.send(events.agentHandoff({ from: 'greeter', to: 'auto_claims', reason: 'Auto claim selected' }));
    mock.send(events.responseCreated());
    mock.send(events.transcriptDone('Let me collect your auto claim details.', 'auto_claims'));
    mock.send(events.responseDone());

    await expect(app.transcript.text('Welcome to insurance claims!')).toBeVisible({ timeout: 5000 });
    await expect(app.transcript.text('Let me collect your auto claim details.')).toBeVisible({ timeout: 5000 });
    await expect(app.events.text(/greeter.*auto_claims/)).toBeVisible({ timeout: 5000 });
  });
});
