---
title: "Pattern 1 — Chat-Supervisor"
eyebrow: "One voice agent, one text supervisor"
lead: "A single realtime voice agent (Aria) handles the entire conversation. Hard calls are deferred to a separate text-only supervisor model that returns structured JSON."
---

Chat-Supervisor is the simpler of the two patterns. It keeps the voice
contract small (one agent, one persona, one system prompt) and shoves
all the "should I accept this answer?" and "is this claim complete?"
decisions out to a text model that the user never hears.

{{< shot src="img/03-chat-supervisor-conversation.png" alt="Chat-Supervisor mid-conversation: Aria has greeted the caller, asked about the incident date, and is asking for the location." caption="Aria, the realtime voice agent, drives the entire conversation." >}}

## The voice agent

There is exactly one prompt. It tells Aria how to behave, when to call
tools, and (this part matters) that she must never invent claim numbers
or policy details on her own.

{{< coderef path="backend/patterns/chat_supervisor.py" start=28 end=66 lang="python" title="Aria's full system prompt" >}}

Aria has three tools: `get_next_questions`, `validate_answer`, and
`submit_claim_data`. Each one routes through the question service for the
deterministic part of the work and may then escalate to the supervisor.

## When the supervisor gets called

The supervisor is consulted in three places.

1. Validation escalation. When the question service rejects an answer,
   the supervisor decides whether the rejection is fair or the answer
   is actually fine in context.
2. Open-ended question generation. When no canned questions remain for
   a claim type, the supervisor invents the next one.
3. Completeness check. Before submitting a claim, the supervisor inspects
   the collected data and judges whether all required fields are present.

The validation escalation is the most interesting case.

{{< coderef path="backend/patterns/chat_supervisor.py" start=137 end=160 lang="python" title="validate_answer: deterministic check first, supervisor second" >}}

Every supervisor consultation emits a `supervisor.exchange` event so the
developer view can show what was sent and what came back.

{{< coderef path="backend/patterns/chat_supervisor.py" start=188 end=202 lang="python" title="Supervisor exchanges are first-class events" >}}

{{< shot src="img/04-chat-supervisor-tool-call.png" alt="Events panel showing tool.validate_answer, then Supervisor (gpt-4.1) for validate_answer, then Result with valid: false." caption="The events rail makes the two-tier validation visible. The orange Supervisor pill expands to show the exact prompt and JSON response." >}}

## End-to-end flow for one validated answer

{{< mermaid >}}
sequenceDiagram
  autonumber
  participant U as Caller
  participant V as Aria (voice / gpt-realtime)
  participant B as Backend
  participant Q as Question Service
  participant S as Supervisor (gpt-4.1)

  U->>V: "It happened a few days ago."
  V->>B: function_call validate_answer{question_id, answer}
  B->>Q: POST /validate
  Q-->>B: {valid: false, reason: "vague"}
  B->>S: complete_json(prompt with service result)
  S-->>B: {valid: false, message, suggestion}
  B-->>F: supervisor.exchange event
  B->>V: function_call_output(JSON)
  V->>U: "Could you give me the exact calendar date?"
{{< /mermaid >}}

The realtime model is kept lightweight here on purpose. It plays the
voice, manages turn-taking, and decides which tool to call. Every
business decision is deterministic plus an LLM judge, both observable
from the events panel.

## Why this pattern

Use Chat-Supervisor when:

- You want one consistent voice persona across the entire call.
- Your business rules are mostly deterministic, with a few judgment calls.
- You can tolerate roughly 300 to 500 ms of extra latency on the
  validation hops. The supervisor call is text-only and on a faster
  model than the realtime one.

If your call instead has clearly distinct phases that each want their own
prompt and tool set (greeting, triage, specialist intake, summary), see
the [Sequential Handoff](/sequential-handoff/) pattern.
