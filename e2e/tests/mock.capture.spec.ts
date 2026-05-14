/**
 * Documentation screenshot capture.
 *
 * Drives the running app through deterministic scenarios using the mock
 * WebSocket fixture, then writes PNGs into docs/static/img/.
 *
 * Run with:  npx playwright test capture.spec.ts --project=mock --reporter=line
 */
import { test } from '../fixtures';
import { events } from '../builders/events';
import path from 'node:path';
import fs from 'node:fs';

const OUT = path.resolve(__dirname, '../../docs/static/img');
fs.mkdirSync(OUT, { recursive: true });

const shot = (name: string) => ({ path: path.join(OUT, `${name}.png`), fullPage: false });

test.use({ viewport: { width: 1600, height: 1000 } });

const SUPERVISOR_PROMPT = `You are a friendly, professional insurance claims intake agent named Aria. Your role is to guide callers through the insurance claims process using a warm, conversational tone.

## Conversation Flow
1. Greeting: Welcome the caller and ask how you can help today.
2. Claim Type Identification: Determine what type of claim they need to file.
3. Information Gathering: Ask questions ONE AT A TIME.
4. Validation: After each answer, use validate_answer to confirm the information.
5. Completeness Check: Periodically call get_next_questions.
6. Submission: Once all required data is gathered, call submit_claim_data.

## Tool Usage
- Call get_next_questions to retrieve the next set of questions.
- Call validate_answer when the caller provides an answer.
- Call submit_claim_data when all required information has been collected.`;

const AUTO_AGENT_PROMPT = `You are the Auto Claims Specialist Agent. You handle all vehicle-related insurance claims.

## Required Information to Collect (ask ONE at a time)
1. Date of incident — When did the accident occur?
2. Location — Where did it happen?
3. Vehicle information — Year, make, model.
4. Description of incident — Brief description.
5. Other parties involved — Were other vehicles/people involved?
6. Police report — Was a police report filed?
7. Injuries — Were there any injuries?

## Guidelines
- Ask questions ONE AT A TIME.
- Show empathy — auto accidents are stressful.
- Use validate_answer to confirm each piece of information.
- Once all required fields are collected, transfer to the Summary Agent.`;

// ─────────────────────────────────────────────────────────────────
//  01 — Developer mode populated overview
// ─────────────────────────────────────────────────────────────────
test('01 developer mode initial', async ({ app, mock }) => {
  await app.goto();
  await app.textMode.enable();
  await mock.start();
  mock.send(events.sessionCreated());
  mock.send(events.promptUpdated({ agent: 'aria', prompt: SUPERVISOR_PROMPT, reason: 'Session started' }));
  mock.send(events.transcriptDone("Hi, I'm Aria from SecureLife Insurance. How can I help you today?"));
  await app.textMode.sendMessage("I want to file a claim — someone hit my car yesterday.");
  mock.send(events.toolCalled('get_next_questions', { claim_type: 'auto' }));
  mock.send(events.toolResult('get_next_questions', {
    questions: [
      { id: 'incident_date', text: 'When did the incident occur?', required: true },
      { id: 'incident_location', text: 'Where did it happen?', required: true },
    ],
    total_remaining: 7,
  }));
  mock.send(events.transcriptDone("I'm sorry to hear that. Let's start with the date — when did it happen?"));
  await app.page.waitForTimeout(400);
  await app.page.screenshot(shot('01-developer-mode-initial'));
});

// ─────────────────────────────────────────────────────────────────
//  02 — App mode initial state (Contoso Insurance)
// ─────────────────────────────────────────────────────────────────
test('02 app mode initial', async ({ app }) => {
  await app.goto();
  await app.page.locator('.mode-switcher__toggle').click();
  await app.page.locator('.mode-switcher__option', { hasText: 'App Mode' }).click();
  await app.page.waitForTimeout(400);
  await app.page.screenshot(shot('02-app-mode-initial'));
});

// ─────────────────────────────────────────────────────────────────
//  03 — Chat-Supervisor conversation in progress
// ─────────────────────────────────────────────────────────────────
test('03 chat-supervisor conversation', async ({ app, mock }) => {
  await app.goto();
  await app.textMode.enable();
  await mock.start();
  mock.send(events.sessionCreated());
  mock.send(events.promptUpdated({ agent: 'aria', prompt: SUPERVISOR_PROMPT, reason: 'Session started' }));
  mock.send(events.transcriptDone("Hello! I'm Aria from SecureLife Insurance. How can I help you today?"));
  await app.page.waitForTimeout(150);
  await app.textMode.sendMessage("I need to file a claim — someone hit my car yesterday.");
  mock.send(events.transcriptDone("I'm sorry to hear that. Let's get the details. Could you tell me the date and approximate time of the incident?"));
  await app.page.waitForTimeout(400);
  await app.page.screenshot(shot('03-chat-supervisor-conversation'));
});

// ─────────────────────────────────────────────────────────────────
//  04 — Tool call + supervisor exchange visible in events panel
// ─────────────────────────────────────────────────────────────────
test('04 chat-supervisor tool call & supervisor exchange', async ({ app, mock }) => {
  await app.goto();
  await app.textMode.enable();
  await mock.start();
  mock.send(events.sessionCreated());
  mock.send(events.promptUpdated({ agent: 'aria', prompt: SUPERVISOR_PROMPT, reason: 'Session started' }));
  mock.send(events.transcriptDone("Hello! I'm Aria. What type of claim would you like to file?"));
  await app.textMode.sendMessage("Auto claim please.");
  mock.send(events.toolCalled('get_next_questions', { claim_type: 'auto' }));
  mock.send(events.toolResult('get_next_questions', {
    questions: [
      { id: 'incident_date', text: 'When did the incident occur?', required: true },
      { id: 'incident_location', text: 'Where did it happen?', required: true },
    ],
    total_remaining: 7,
  }));
  mock.send(events.transcriptDone("Got it. When did the incident occur?"));
  await app.textMode.sendMessage("Yesterday around 3pm.");
  mock.send(events.toolCalled('validate_answer', { question_id: 'incident_date', answer: 'Yesterday around 3pm.' }));
  mock.send(events.supervisorExchange({
    model: 'gpt-4.1',
    tool_context: 'validate_answer',
    prompt_preview: 'Validate this answer for an insurance claim intake question. Question ID: incident_date. Answer: "Yesterday around 3pm." Service result: {"valid": false, "reason": "vague date"}…',
    response: '{"valid": false, "message": "Please provide an exact date.", "suggestion": "Ask the caller for a specific calendar date such as 5/13/2026."}',
    usage: { prompt_tokens: 412, completion_tokens: 38 },
  }));
  mock.send(events.toolResult('validate_answer', { valid: false, message: 'Please provide an exact date.' }));
  mock.send(events.transcriptDone("Could you give me the exact calendar date? For example, May 13, 2026."));
  await app.page.waitForTimeout(400);
  await app.page.screenshot(shot('04-chat-supervisor-tool-call'));
});

// ─────────────────────────────────────────────────────────────────
//  05 — Validation rejection (vague-quantifier path) close-up of Events panel
// ─────────────────────────────────────────────────────────────────
test('05 validation rejection scenario', async ({ app, mock }) => {
  await app.goto();
  await app.textMode.enable();
  await mock.start();
  mock.send(events.sessionCreated());
  mock.send(events.promptUpdated({ agent: 'aria', prompt: SUPERVISOR_PROMPT, reason: 'Session started' }));
  mock.send(events.transcriptDone("Could you describe what happened?"));
  await app.textMode.sendMessage("A few minor scratches on the bumper.");
  mock.send(events.toolCalled('validate_answer', { question_id: 'incident_description', answer: 'A few minor scratches on the bumper.' }));
  mock.send(events.toolResult('validate_answer', {
    valid: false,
    reason: "Answer contains vague language ('a few'). Please provide a specific and precise response.",
    clarifying_question: 'How many scratches and on which exact panels?',
  }));
  mock.send(events.transcriptDone('Could you be more specific? About how many scratches and on which panels of the car?'));
  await app.page.waitForTimeout(400);
  await app.page.screenshot(shot('05-validation-rejection'));
});

// ─────────────────────────────────────────────────────────────────
//  06 — Validation success
// ─────────────────────────────────────────────────────────────────
test('06 validation success', async ({ app, mock }) => {
  await app.goto();
  await app.textMode.enable();
  await mock.start();
  mock.send(events.sessionCreated());
  mock.send(events.promptUpdated({ agent: 'aria', prompt: SUPERVISOR_PROMPT, reason: 'Session started' }));
  mock.send(events.transcriptDone('What is the date of the incident?'));
  await app.textMode.sendMessage('May 13, 2026');
  mock.send(events.toolCalled('validate_answer', { question_id: 'incident_date', answer: 'May 13, 2026' }));
  mock.send(events.toolResult('validate_answer', { valid: true, reason: 'Specific date detected.' }));
  mock.send(events.transcriptDone('Got it — May 13, 2026. And where did the incident happen?'));
  await app.page.waitForTimeout(400);
  await app.page.screenshot(shot('06-validation-success'));
});

// ─────────────────────────────────────────────────────────────────
//  07 — Events list with rich mix
// ─────────────────────────────────────────────────────────────────
async function seedRichConversation(app: any, mock: any) {
  await app.goto();
  await app.textMode.enable();
  await mock.start();
  mock.send(events.sessionCreated());
  mock.send(events.promptUpdated({ agent: 'aria', prompt: SUPERVISOR_PROMPT, reason: 'Session started' }));
  mock.send(events.transcriptDone('Hello! How can I help you today?'));
  await app.textMode.sendMessage('Auto claim');
  mock.send(events.toolCalled('get_next_questions', { claim_type: 'auto' }));
  mock.send(events.toolResult('get_next_questions', { questions: [{ id: 'incident_date', text: 'When?' }], total_remaining: 7 }));
  mock.send(events.transcriptDone('When did it happen?'));
  await app.textMode.sendMessage('May 13, 2026');
  mock.send(events.toolCalled('validate_answer', { question_id: 'incident_date', answer: 'May 13, 2026' }));
  mock.send(events.supervisorExchange({
    model: 'gpt-4.1', tool_context: 'validate_answer',
    prompt_preview: 'Validate the answer for incident_date…',
    response: '{"valid": true, "message": "Accepted."}',
    usage: { prompt_tokens: 312, completion_tokens: 14 },
  }));
  mock.send(events.toolResult('validate_answer', { valid: true }));
  mock.send(events.transcriptDone('Where did it happen?'));
  await app.textMode.sendMessage('Corner of 5th and Main, Seattle');
  mock.send(events.toolCalled('validate_answer', { question_id: 'incident_location', answer: 'Corner of 5th and Main, Seattle' }));
  mock.send(events.toolResult('validate_answer', { valid: true }));
  mock.send(events.responseDone());
}

test('07 events list view rich', async ({ app, mock }) => {
  await seedRichConversation(app, mock);
  await app.page.waitForTimeout(300);
  await app.page.screenshot(shot('07-events-list-rich'));
});

// ─────────────────────────────────────────────────────────────────
//  08 — Timeline view of events
// ─────────────────────────────────────────────────────────────────
test('08 events timeline view', async ({ app, mock }) => {
  await seedRichConversation(app, mock);
  await app.page.locator('button[title="Timeline view"]').click();
  await app.page.waitForTimeout(300);
  await app.page.screenshot(shot('08-events-timeline-view'));
});

// ─────────────────────────────────────────────────────────────────
//  09 — Fullscreen timeline
// ─────────────────────────────────────────────────────────────────
test('09 fullscreen timeline', async ({ app, mock }) => {
  await seedRichConversation(app, mock);
  await app.page.locator('button[title="Fullscreen timeline"]').click();
  await app.page.waitForTimeout(400);
  await app.page.screenshot(shot('09-fullscreen-timeline'));
});

// ─────────────────────────────────────────────────────────────────
//  10 — Prompt diff (one prompt)
// ─────────────────────────────────────────────────────────────────
test('10 prompt diff single', async ({ app, mock }) => {
  await app.goto();
  await app.textMode.enable();
  await mock.start();
  mock.send(events.sessionCreated());
  mock.send(events.promptUpdated({ agent: 'aria', prompt: SUPERVISOR_PROMPT, reason: 'Session started' }));
  await app.page.waitForTimeout(150);
  await app.page.locator('[data-testid="prompt-diff-toggle"]').click();
  await app.page.waitForTimeout(300);
  await app.page.screenshot(shot('10-prompt-diff-single'));
});

// ─────────────────────────────────────────────────────────────────
//  11 — Sequential-handoff initial
// ─────────────────────────────────────────────────────────────────
const GREETER_PROMPT = `You are the Greeter Agent for SecureLife Insurance. Your ONLY job is to:
1. Welcome the caller warmly and introduce yourself.
2. Ask how you can help them today.
3. Once you understand they need to file a claim, hand off to the appropriate agent.

IMPORTANT: You do NOT handle claims yourself. Transfer immediately once you understand the caller's intent.`;

const TOP_LEVEL_PROMPT = `You are the Top-Level Q&A Agent. Your job is to determine what type of claim the caller needs and route them.

## Claim Types
- Auto: Vehicle accidents, theft, vandalism, collision
- Property: Home damage, fire, flooding, storm damage
- Health: Medical bills, hospital stays, prescriptions

## Guidelines
- Ask ONE clarifying question at most before routing.
- Be conversational and brief — this is a voice call.`;

test('11 sequential handoff initial', async ({ app, mock }) => {
  mock.setPattern('sequential-handoff');
  await app.goto();
  await app.selectPattern('sequential-handoff');
  await app.textMode.enable();
  await mock.start();
  mock.send(events.sessionCreated());
  mock.send(events.promptUpdated({ agent: 'greeter', prompt: GREETER_PROMPT, reason: 'Session started' }));
  mock.send(events.transcriptDone(
    "Hi! Welcome to SecureLife Insurance. I'm here to help. Are you looking to file a claim, or do you have questions about your policy?",
    'greeter',
  ));
  await app.page.waitForTimeout(400);
  await app.page.screenshot(shot('11-sequential-handoff-initial'));
});

// ─────────────────────────────────────────────────────────────────
//  12 — Sequential-handoff: handoff event in timeline
// ─────────────────────────────────────────────────────────────────
test('12 sequential handoff in conversation', async ({ app, mock }) => {
  mock.setPattern('sequential-handoff');
  await app.goto();
  await app.selectPattern('sequential-handoff');
  await app.textMode.enable();
  await mock.start();
  mock.send(events.sessionCreated());
  mock.send(events.promptUpdated({ agent: 'greeter', prompt: GREETER_PROMPT, reason: 'Session started' }));
  mock.send(events.transcriptDone("Hi! Welcome to SecureLife Insurance. How can I help you today?", 'greeter'));
  await app.textMode.sendMessage('I need to file a claim.');
  mock.send(events.toolCalled('transfer_to_top_level_qa', { reason: 'Caller wants to file a claim' }));
  mock.send(events.agentHandoff({ from: 'greeter', to: 'top_level_qa', reason: 'Caller wants to file a claim', new_tools: [] }));
  mock.send(events.promptUpdated({ agent: 'top_level_qa', prompt: TOP_LEVEL_PROMPT, reason: 'Handoff to top_level_qa' }));
  mock.send(events.transcriptDone("I can help with that. Is this an auto, property, or health claim?", 'top_level_qa'));
  await app.textMode.sendMessage('Auto');
  mock.send(events.toolCalled('transfer_to_auto_claims', { reason: 'Caller confirmed auto claim' }));
  mock.send(events.agentHandoff({ from: 'top_level_qa', to: 'auto_claims', reason: 'Caller confirmed auto claim', new_tools: ['get_next_questions', 'validate_answer'] }));
  mock.send(events.promptUpdated({ agent: 'auto_claims', prompt: AUTO_AGENT_PROMPT, reason: 'Handoff to auto_claims' }));
  mock.send(events.transcriptDone("Got it — I'm the Auto Claims Specialist. Let's start with the date of the incident.", 'auto_claims'));
  await app.page.waitForTimeout(400);
  await app.page.screenshot(shot('12-sequential-handoff-in-conversation'));
});

// ─────────────────────────────────────────────────────────────────
//  13 — Prompt diff after handoffs (multi-snapshot)
// ─────────────────────────────────────────────────────────────────
test('13 prompt diff with handoffs', async ({ app, mock }) => {
  mock.setPattern('sequential-handoff');
  await app.goto();
  await app.selectPattern('sequential-handoff');
  await app.textMode.enable();
  await mock.start();
  mock.send(events.sessionCreated());
  mock.send(events.promptUpdated({ agent: 'greeter', prompt: GREETER_PROMPT, reason: 'Session started' }));
  mock.send(events.agentHandoff({ from: 'greeter', to: 'top_level_qa', reason: 'Caller wants to file a claim' }));
  mock.send(events.promptUpdated({ agent: 'top_level_qa', prompt: TOP_LEVEL_PROMPT, reason: 'Handoff to top_level_qa' }));
  mock.send(events.agentHandoff({ from: 'top_level_qa', to: 'auto_claims', reason: 'Caller confirmed auto claim' }));
  mock.send(events.promptUpdated({ agent: 'auto_claims', prompt: AUTO_AGENT_PROMPT, reason: 'Handoff to auto_claims' }));
  await app.page.waitForTimeout(150);
  await app.page.locator('[data-testid="prompt-diff-toggle"]').click();
  await app.page.waitForTimeout(300);
  await app.page.screenshot(shot('13-prompt-diff-handoffs'));
});

// ─────────────────────────────────────────────────────────────────
//  14 — App mode populated with claim data
// ─────────────────────────────────────────────────────────────────
test('14 app mode with data', async ({ app, mock, page }) => {
  // Start the session in developer mode (uses [data-testid=start-session]),
  // then switch to App Mode and seed claim data via mock events.
  await app.goto();
  await app.textMode.enable();
  await mock.start();
  mock.send(events.sessionCreated());
  mock.send(events.transcriptDone("Hi! How can I help you today?"));
  await page.locator('.mode-switcher__toggle').click();
  await page.locator('.mode-switcher__option', { hasText: 'App Mode' }).click();

  const fields = [
    { id: 'incident_date', label: 'Date of incident', value: 'May 13, 2026' },
    { id: 'incident_location', label: 'Location', value: 'Corner of 5th & Main, Seattle' },
    { id: 'vehicle_info', label: 'Vehicle', value: '2022 Honda Civic' },
    { id: 'incident_description', label: 'Description', value: 'Rear-ended at red light' },
    { id: 'other_parties', label: 'Other parties', value: 'One other vehicle (Toyota Camry)' },
    { id: 'police_report', label: 'Police report', value: 'Yes — report #SE-2026-1147' },
  ];
  for (const f of fields) {
    mock.send(events.toolCalled('validate_answer', { question_id: f.id, answer: f.value }));
    mock.send(events.toolResult('validate_answer', { valid: true }));
  }
  mock.send(events.transcriptDone("Thanks — I have everything I need."));
  await app.page.waitForTimeout(400);
  await app.page.screenshot(shot('14-app-mode-with-data'));
});

// ─────────────────────────────────────────────────────────────────
//  15 — Flow tab (architecture diagram in middle pane)
// ─────────────────────────────────────────────────────────────────
test('15 flow tab chat-supervisor', async ({ app, mock }) => {
  await app.goto();
  await mock.start();
  mock.send(events.sessionCreated());
  await app.page.locator('.center-tab', { hasText: 'Flow' }).click();
  await app.page.waitForTimeout(400);
  await app.page.screenshot(shot('15-flow-chat-supervisor'));
});

test('15b flow tab sequential', async ({ app, mock }) => {
  mock.setPattern('sequential-handoff');
  await app.goto();
  await app.selectPattern('sequential-handoff');
  await mock.start();
  mock.send(events.sessionCreated());
  mock.send(events.promptUpdated({ agent: 'greeter', prompt: GREETER_PROMPT, reason: 'Session started' }));
  mock.send(events.agentHandoff({ from: 'greeter', to: 'top_level_qa', reason: 'Caller wants to file a claim' }));
  mock.send(events.promptUpdated({ agent: 'top_level_qa', prompt: TOP_LEVEL_PROMPT, reason: 'Handoff' }));
  await app.page.locator('.center-tab', { hasText: 'Flow' }).click();
  await app.page.waitForTimeout(400);
  await app.page.screenshot(shot('15b-flow-sequential-handoff'));
});

// ─────────────────────────────────────────────────────────────────
//  16 — Session Config panel expanded
// ─────────────────────────────────────────────────────────────────
test('16 session config open', async ({ app }) => {
  await app.goto();
  await app.page.locator('text=Session Config').click();
  await app.page.waitForTimeout(300);
  await app.page.screenshot(shot('16-session-config-open'));
});

// ─────────────────────────────────────────────────────────────────
//  17 — Call summary modal after submit
// ─────────────────────────────────────────────────────────────────
test('17 call summary', async ({ app, mock }) => {
  await app.goto();
  await app.textMode.enable();
  await mock.start();
  mock.send(events.sessionCreated());
  mock.send(events.toolCalled('submit_claim_data', { claim_type: 'auto', collected_data: { incident_date: 'May 13, 2026', incident_location: '5th and Main' } }));
  mock.send(events.toolResult('submit_claim_data', {
    status: 'submitted',
    claim_number: 'CLM-7F3A21B9',
    claim_type: 'auto',
    data_points_collected: 7,
    message: 'Claim CLM-7F3A21B9 has been submitted successfully.',
  }));
  await app.page.waitForTimeout(500);
  await app.page.screenshot(shot('17-call-summary'));
});

// ─────────────────────────────────────────────────────────────────
//  18 — API Calls tab with histogram
// ─────────────────────────────────────────────────────────────────
test('18 api calls tab', async ({ app, mock }) => {
  await seedRichConversation(app, mock);
  // Right-pane tabs: Events / API Calls
  await app.page.locator('button[role="tab"]:has-text("API Calls"), .tab:has-text("API Calls")').first().click();
  await app.page.waitForTimeout(300);
  await app.page.screenshot(shot('18-api-calls-tab'));
});
