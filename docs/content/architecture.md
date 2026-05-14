---
title: "Architecture"
eyebrow: "Component layout"
lead: "Three processes, one WebSocket, one shared asyncio loop, and one Voice Live API session per call."
---

The sample splits into three independent processes so each concern can
be deployed on its own. The frontend talks WebSocket to the backend.
The backend talks WebSocket to Azure and HTTPS to the question service.

{{< shot src="img/01-developer-mode-initial.png" alt="Developer mode landing screen with the three status pills (Frontend, Backend, Q-Service) all green." caption="Developer mode shows process health for all three components in the bottom status bar." >}}

## The three processes

| Process | Tech | Responsibility |
| --- | --- | --- |
| Frontend | Vite + React + TypeScript | Captures microphone audio, plays back assistant audio, renders the timeline / data / flow views. |
| Backend | Flask + flask-sock + gevent | One WebSocket per call. Bridges browser audio to the Voice Live API and emits structured events. |
| Question service | Flask | Owns the intake catalog and answer validation. Stateless HTTPS API. |

## Why a shared asyncio loop

Gunicorn with gevent workers cannot directly host an asyncio session. The
backend solves this with one shared event loop running on a native
(non-monkey-patched) thread. Every WebSocket handler schedules its
`run_azure_session` coroutine onto that loop with `asyncio.run_coroutine_threadsafe`.

{{< coderef path="backend/event_loop.py" start=24 end=47 lang="python" title="A single asyncio loop, started lazily on a native thread" >}}

The handler then bridges the gevent WebSocket and the asyncio session
with two thread-safe queues: `inbound` for browser to Azure, `outbound`
for Azure to browser.

{{< coderef path="backend/websocket_handler.py" start=25 end=80 lang="python" title="One WebSocket call → one Voice Live API session" >}}

## End-to-end data flow

{{< mermaid >}}
sequenceDiagram
  autonumber
  participant U as User (mic + speakers)
  participant F as Frontend (React)
  participant B as Backend (Flask + gevent)
  participant L as Asyncio loop (native thread)
  participant A as Azure Voice Live API
  participant Q as Question Service

  U->>F: speaks
  F->>B: audio frames over WebSocket
  B->>L: enqueue inbound bytes
  L->>A: input_audio_buffer.append
  A-->>L: response.audio.delta, transcript.delta, function_call_arguments.done
  L->>Q: validate_answer / get_questions (HTTPS)
  Q-->>L: validation result
  L->>A: function_call_output + response.create
  A-->>L: response.audio.delta (assistant reply)
  L->>B: enqueue outbound OutboundEvent
  B-->>F: JSON events + audio frames
  F-->>U: plays audio, renders timeline
{{< /mermaid >}}

## What the backend exposes to the browser

Every event the backend sends to the browser is an `OutboundEvent`: a
small typed envelope with a `type` (`transcript.done`, `tool.called`,
`agent.handoff`, `compaction.applied`, and so on) and a `data` payload.
The full mapping from raw Azure event types to client types lives in
`event_mapper.py`.

{{< coderef path="backend/event_mapper.py" start=9 end=25 lang="python" title="Azure event names → friendly client event types" >}}

That envelope is what the timeline view, the prompt diff panel, the
data grid, and the API calls tab all consume. There is no second
channel. Everything the UI shows is reconstructed from this stream,
which is what makes the sample easy to extend: emit a new event type,
render it.

## Where to go next

- [Session lifecycle](/session-lifecycle/). What one call looks like over the wire.
- [Chat-Supervisor](/chat-supervisor/). One voice agent plus a text supervisor.
- [Sequential Handoff](/sequential-handoff/). Six agents on a single Voice Live API session.
