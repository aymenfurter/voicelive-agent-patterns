---
title: "Validation flow"
eyebrow: "When the caller is too vague"
lead: "What happens, end to end, when an answer is rejected — and how the supervisor gets a second say."
---

The validation flow is the most concrete demo of why this sample uses
two LLMs. The realtime model is great at speaking, but it should not be
the sole judge of "is this answer specific enough to record?". That
decision belongs to a deterministic validator, with an LLM judge as a
tiebreaker.

## The trigger: a vague answer

Open the app in **Text Mode**, start a Chat-Supervisor session, and
answer the incident date with something like *"yesterday around 3pm"*.
The question service rejects it immediately.

{{< shot src="img/05-validation-rejection.png" alt="Aria asks for the incident date. The caller types 'yesterday around 3pm'. Events panel shows tool.validate_answer, a Supervisor (gpt-4.1) consultation, and a Result with valid: false." caption="The orange Supervisor pill on the right is what makes this two-tier validation visible." >}}

## Tier 1: the question service

The question service exposes a single `/validate` endpoint. Given an
`answer` and either a `question_id` or explicit `acceptance_criteria`,
it runs a small chain of typed validators. The catch-all check that
bites "yesterday around 3pm" is the vague-quantifier filter.

{{< coderef path="question-service/validator.py" start=7 end=17 lang="python" title="Words that automatically fail validation, regardless of question type" >}}

{{< coderef path="question-service/validator.py" start=73 end=83 lang="python" title="Vague-quantifier check — runs before any type-specific validator" >}}

The date-typed validator then enforces a concrete pattern.

{{< coderef path="question-service/validator.py" start=101 end=133 lang="python" title="Date validator: rejects vague phrases, requires a concrete date pattern" >}}

The validator returns a `ValidationResult` with `valid`, `reason`, and a
`clarifying_question`. The Flask route just serializes it.

{{< coderef path="question-service/app.py" start=37 end=66 lang="python" title="The /validate endpoint" >}}

## Tier 2: the supervisor

In Chat-Supervisor, a tier-1 failure is not the final word. The pattern
escalates to `gpt-4.1` with the original answer and the service's verdict
attached, and asks for a structured judgment.

{{< coderef path="backend/patterns/chat_supervisor.py" start=137 end=160 lang="python" title="validate_answer escalates failures to the supervisor" >}}

This is what gives the demo its character: an answer the deterministic
validator rejects can still be accepted by the supervisor when the
context makes it unambiguous. The reverse is also true: the supervisor
can reject an answer the validator naively accepted.

## When the answer is good

The same flow with *"May 13, 2026"* never reaches the supervisor at all.
The question service returns `valid: true`, the pattern records the
answer, and the realtime model moves on.

{{< shot src="img/06-validation-success.png" alt="Aria asks for the incident date. The caller types 'May 13, 2026'. Events panel shows tool.validate_answer and Result valid: true with no supervisor consultation." caption="No supervisor pill this time — the answer cleared tier 1 and recording happened in-process." >}}

## End-to-end

{{< mermaid >}}
sequenceDiagram
  autonumber
  participant V as Aria (voice)
  participant B as Backend (chat-supervisor pattern)
  participant Q as Question Service
  participant S as Supervisor (gpt-4.1)
  participant F as Frontend

  V->>B: validate_answer{question_id: incident_date, answer: "yesterday around 3pm"}
  B->>Q: POST /validate
  Q-->>B: {valid: false, reason: "vague language"}
  Note over B: tier-1 fail → escalate
  B->>S: complete_json(prompt with service result)
  S-->>B: {valid: false, message: "Need a calendar date.", suggestion: "..."}
  B-->>F: supervisor.exchange event (renders in events rail)
  B-->>V: function_call_output {valid: false, message, suggestion}
  V->>U: "Could you give me the exact calendar date?"
{{< /mermaid >}}

{{< callout type="note" >}}
The Sequential Handoff pattern uses the same question service but skips
the supervisor escalation — each specialist agent re-asks the caller in
its own voice when the validator says no.
{{< /callout >}}

## Why design it this way

- Determinism where you can. The vague-quantifier list, the regex date
  patterns, the policy-number formats. Cheap to maintain and impossible
  to flake.
- Judgment where you need it. Real callers say things the validator
  cannot anticipate. The supervisor is the escape hatch.
- Observability for both. Every validation hop and every supervisor
  exchange is an event, so you can debug a flaky call by replaying the
  timeline instead of digging through logs.
