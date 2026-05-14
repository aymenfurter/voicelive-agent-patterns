---
title: "Integration guide"
eyebrow: "Make it yours"
lead: "How to swap the bundled question service for your own backend (CRM, policy admin system, EHR) and how to add a new orchestration pattern alongside the two shipped ones."
---

The bundled question service is a placeholder. It hosts the intake
catalog and an answer validator so the demo runs out of the box, but in
your build it will be replaced by whatever already owns your business
data: a CRM, a policy admin system, an EHR, an internal microservice,
or a stack of them. This page walks you through the two seams the
sample is designed around.

## Seam 1: replace the question service

The backend talks to the question service through a single thin module:
three async functions, one HTTP base URL.

{{< coderef path="backend/question_client.py" start=28 end=73 lang="python" title="The entire backend → question-service contract" >}}

To swap it out, you have two choices.

### Option A: keep the same HTTP shape

The minimal-change path. Stand up your own service that exposes:

| Method | Path | Body | Response |
| --- | --- | --- | --- |
| `GET` | `/questions` | — | `{"questions": [...]}` (top-level intake) |
| `GET` | `/questions/<category>` | — | `{"category": "...", "questions": [...]}` |
| `POST` | `/validate` | `{"question_id": "...", "answer": "..."}` | `{"valid": bool, "reason": "...", "clarifying_question": "..."}` |

Point `Config.QUESTION_SERVICE_URL` at it and you are done. No backend
code changes. Use this when you can put a thin adapter in front of your
real system.

### Option B: replace the client

Rewrite `question_client.py` to talk to your real system directly: gRPC,
SDK, message bus, whatever. The function signatures the patterns import
(`get_questions_by_category`, `validate_answer`, `submit_claim_data`)
are the contract you must preserve. Return shape matters.

{{< callout type="warn" >}}
Both patterns assume `validate_answer` returns at least `{"valid": bool}`.
The Chat-Supervisor pattern additionally consumes the entire validator
response as context for its supervisor escalation, so passing through
a `reason` field will produce noticeably better LLM judgments.
{{< /callout >}}

## Seam 2: add a new orchestration pattern

Patterns are registered by name. Drop a new module under
`backend/patterns/` that subclasses `OrchestrationPattern`, decorate
it, and the frontend pattern picker (and the `?pattern=` query string)
discover it automatically.

{{< coderef path="backend/patterns/chat_supervisor.py" start=83 end=120 lang="python" title="The pattern interface, in practice" >}}

Your subclass owns four things.

1. `get_session_config()` returns the dict that goes into the first
   `session.update`: voice, modality, system prompt, tools.
2. `get_system_prompt()` and `get_tools()` are the active prompt and
   tool list. These can change over time. Sequential Handoff is exactly
   that.
3. `handle_tool_call(name, args)` is your business logic. Return a dict.
   Setting `requires_session_update: True` triggers a handoff.
4. `on_event(event_type, data)` and `emit(OutboundEvent)` are your
   hooks into the lifecycle. Use `emit` to surface custom events to the
   UI.

## Surfacing your own data in App mode

Every event you `emit` reaches the frontend through the same WebSocket.
To show a custom card in App mode, emit a `tool.result` (or your own
event type) and add a renderer to `AppModeDataGrid.tsx`.

{{< coderef path="frontend/src/components/appMode/AppModeDataGrid.tsx" start=1 end=71 lang="tsx" title="The data grid is the App-mode rendering of tool results" >}}

In Developer mode the same event automatically appears in the events
rail and the timeline. No extra work.

## Architecture you should preserve

The decisions worth keeping when you fork this sample:

- One Voice Live API session per call. Don't open a new connection per
  agent. Use `session.update` for handoffs.
- One asyncio loop on a native thread. Gevent + asyncio is workable but
  only if you keep them in their own threads. See [Architecture](/architecture/#why-a-shared-asyncio-loop).
- Events are the public API. Everything the UI shows is reconstructible
  from the event stream. Keep that property and you get debuggability
  for free.
- Two tiers of validation. Deterministic first, LLM judge second. Cheap
  rules for everything you can predict, an LLM for everything you cannot.
  See [Validation flow](/validation/).
- Two views of the same data. App mode and Developer mode are layout
  variants over the same WebSocket, not separate apps. See
  [App vs Developer mode](/app-mode/).

## Where to look when something breaks

| Symptom | Look here |
| --- | --- |
| WS opens then closes immediately | `backend/websocket_handler.py` `azure_ready` timeout |
| Caller hears silence after a handoff | `_apply_handoff` — confirm `ClientEventResponseCreate` is sent |
| Validator always rejects | Question service `/validate` payload — is your `acceptance_criteria` correct? |
| Token usage explodes on long calls | Switch compaction to `token_budget_4k`, watch for `compaction.applied` events |
| New pattern not in the picker | Confirm `@register_pattern("name")` decorator and that the module is imported |

That is the whole sample. Lift the seams, keep the architecture, swap
in your own domain, and you have a voice-first agentic product on top
of your own data.
