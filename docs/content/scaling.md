---
title: "Tracking answers & scaling"
eyebrow: "What grows, what stays flat"
lead: "How both patterns track which questions have been answered, and which design choices keep prompt size flat as you add more questions."
---

The two patterns differ in conversation flow but they track collected
answers the same way. This page explains the shared bookkeeping, then
calls out the choices that decide whether your prompts grow with the
catalog or stay flat as you add more questions.

## Where answered state lives

Each pattern instance owns a `ClaimSession`. It is a plain dataclass with
two fields: the chosen `claim_type` and a `collected_data` dict keyed by
`question_id`. There is no per-question scaffolding, no schema beyond the
key name. One claim session lives for the duration of one WebSocket call.

{{< coderef path="backend/patterns/models.py" start=10 end=21 lang="python" title="The whole answered-state model is a dict and two helpers" >}}

The catalog itself (questions, acceptance criteria, clarifying prompts)
is **not** in `collected_data` and not in any prompt. It lives in the
question service and is fetched on demand.

## Only validated answers are recorded

The model never writes to `collected_data` directly. The only path in is
the `validate_answer` tool, and only after the validator (or the
supervisor, in chat-supervisor) accepts the answer.

{{< coderef path="backend/patterns/sequential_handoff.py" start=324 end=332 lang="python" title="Sequential handoff: write only on a passing validation" >}}

{{< coderef path="backend/patterns/chat_supervisor.py" start=134 end=154 lang="python" title="Chat-supervisor: same gate, plus a supervisor second-opinion before recording" >}}

The consequence: the server-side state is the source of truth. The
realtime model can hallucinate, lose track, repeat itself, or get
interrupted — none of that corrupts what the system has actually
collected.

## How the agent discovers what is left

The model is never handed the catalog. It calls `get_next_questions`,
which fetches the catalog from the question service, diffs against
`collected_data`, and returns a small slice of what is still missing
plus a `total_remaining` count.

{{< coderef path="backend/patterns/sequential_handoff.py" start=313 end=322 lang="python" title="Catalog stays out of the prompt — the tool returns the diff" >}}

The slice size is a deliberate scaling lever:

- Sequential handoff returns **2** unanswered at a time.
- Chat-supervisor returns **3** unanswered at a time.

The `total_remaining` field lets the model pace the conversation
("a few more questions" vs "almost done") without ever seeing the
full list.

## What changes when the catalog grows

Adding more questions per branch only changes the question service.
Neither pattern's prompt grows. The realtime model's per-turn token cost
is bounded by the slice size, not by the catalog size.

| Concern | Scales with | Notes |
| --- | --- | --- |
| Realtime prompt size | Number of agents (handoff) / single prompt (supervisor) | Catalog growth does **not** inflate the prompt in either pattern. |
| Per-turn tool payload | Slice size (2 or 3) | Constant. `get_next_questions` always returns at most N. |
| Validation latency | One HTTPS round-trip per answer | Independent of catalog size. |
| Conversation history | Number of turns | Mitigated by [event compaction](/events-compaction/). Becomes the dominant cost on long calls. |
| Question-service payload | Total catalog size per category | Server-side only; never reaches the model. |

## Which pattern scales better with what

Both patterns share the bookkeeping, so they scale identically along
the "more fact-collection questions per branch" axis. They diverge on
the other two axes:

**More divergent workflows (more claim types, different intake flows).**
Sequential handoff scales better. Each new flow is a new agent with its
own prompt and its own scoped tool set. The greeter and `top_level_qa`
agents stay unchanged. The realtime model sees one agent's prompt at a
time, so adding a tenth claim type does not enlarge the prompt for an
auto-claim caller.

**More nuanced judgment per answer (richer validation, soft rules,
escalation policies).** Chat-supervisor scales better. The voice prompt
stays as it is; the supervisor system prompt and the consult prompts
absorb the new logic. You can also swap or upgrade the supervisor model
(`gpt-4.1` → something stronger) without touching the realtime side.

## Things to watch as you add questions

- **Don't put the catalog in the prompt.** Keep it in the service. Let
  the model query it. Both patterns model this correctly; copying
  questions into the system prompt is the most common regression.
- **Always slice the unanswered list.** Returning every missing question
  to the model defeats the bound. The constants live in
  `_handle_get_next_questions` for both patterns.
- **Server holds the truth.** `collected_data` lives in
  `ClaimSession`, not in the conversation transcript. Reconstructing
  state from transcripts at scale is brittle.
- **`record_answer` overwrites.** A second valid answer for the same
  `question_id` replaces the first. If you need correction history,
  change the dict to a list and adjust `unanswered`.
- **Compaction is required at the long end.** The realtime conversation
  grows linearly with turns and is independent of how cleanly you track
  state. See [Events & Compaction](/events-compaction/).
- **Per-question metadata belongs in the service.** Acceptance criteria,
  clarifying prompts, and required types live next to the questions in
  `question-service/questions_data.py`. They are returned alongside each
  question so the model can phrase the next ask without needing them
  in its system prompt.
- **Submission is a single call with the whole dict.** `submit_claim_data`
  receives `collected_data` as one argument. As the catalog grows the
  payload grows linearly here — fine for an intake form, worth revisiting
  if a single submission would exceed a reasonable function-call payload.

## Where to go next

- [Validation flow](/validation/). The contract `validate_answer` enforces before anything is recorded.
- [Events & Compaction](/events-compaction/). The other axis of scale: long calls, not big catalogs.
- [Sequential handoff](/sequential-handoff/) and [Chat-supervisor](/chat-supervisor/). The two flows side by side.
