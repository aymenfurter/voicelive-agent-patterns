---
title: "Events & compaction"
eyebrow: "Observability and context-window care"
lead: "Every interesting moment in the call is a typed event. Long calls would otherwise blow the model's context window, so three pluggable compaction strategies keep that under control."
---

The backend never sends raw Azure events to the browser. It maps them
through `event_mapper.py` into a small friendly vocabulary, attaches
domain events of its own (handoffs, supervisor consultations, prompt
updates, compaction), and ships the lot as `OutboundEvent`s.

## The event vocabulary

The Azure-to-client translation is a flat dictionary.

{{< coderef path="backend/event_mapper.py" start=9 end=25 lang="python" title="From Azure event names to client event types" >}}

On top of that, the patterns and the session loop emit:

| Event type | Source | When |
| --- | --- | --- |
| `pattern.selected` | websocket handler | Right after WS open. |
| `session.created` | event mapper | Voice Live API session is live. |
| `session.prompt_updated` | `_apply_handoff` | The model just received a new system prompt. |
| `tool.called` / `tool.result` | `_handle_tool_call` | Function tool dispatched and resolved. |
| `agent.handoff` | `_apply_handoff` | An agent transferred control to another. |
| `supervisor.exchange` | chat-supervisor pattern | A supervisor consultation completed. |
| `compaction.applied` | `_apply_compaction` | One or more conversation items were deleted. |
| `error` | event mapper / session loop | Anything Azure or the pattern surfaced. |

## Voice Live API protocol: what the sample extends

The Voice Live API speaks a fixed protocol over WebSocket
([`2026-01-01-preview` reference](https://learn.microsoft.com/azure/ai-services/speech-service/voice-live-api-reference-2026-01-01-preview)).
The sample uses a strict subset of those events, then adds a small
domain vocabulary of its own that only flows between the backend and
the browser. Nothing the sample invents is ever sent up to Azure.

### Pipe 1: Browser to Backend (frontend control plane)

Plain JSON over the `/ws?pattern=…` socket. Defined in
[frontend/src/types.ts](frontend/src/types.ts).

| Type | Payload | Purpose |
| --- | --- | --- |
| `audio` | `{ audio: base64(PCM16) }` | Microphone chunk to forward to Azure. |
| `text.message` | `{ text }` | Text-mode user turn. |
| `session.config` | `{ voice, vad, compaction, … }` | Live config update before/after handoffs. |
| `pattern.switch` | `{ pattern }` | Tear down the current pattern and rebuild. |

### Pipe 2: Backend to/from Azure Voice Live API (server-to-server)

The backend uses the [`azure-ai-voicelive`](https://learn.microsoft.com/azure/ai-services/speech-service/voice-live)
SDK, so the wire format is the official Voice Live event schema. The
sample only consumes a subset of [server events](https://learn.microsoft.com/azure/ai-services/speech-service/voice-live-api-reference-2026-01-01-preview#server-events)
and only sends a subset of [client events](https://learn.microsoft.com/azure/ai-services/speech-service/voice-live-api-reference-2026-01-01-preview#client-events).

| Direction | Event | Used for |
| --- | --- | --- |
| Client → Server | `session.update` | Initial config and every prompt/tool swap on handoff. |
| Client → Server | `input_audio_buffer.append` | Microphone PCM16 frames. |
| Client → Server | `conversation.item.create` (`function_call_output`) | Returning a tool result. |
| Client → Server | `conversation.item.delete` | Compaction deletes individual items. |
| Client → Server | `response.create` | Force a turn after a handoff (with `additional_instructions`). |
| Server → Client | `session.created` / `session.updated` | Confirm config landed. |
| Server → Client | `response.audio.delta` / `response.audio.done` | Streamed model audio. |
| Server → Client | `response.audio_transcript.delta` / `.done` | Streamed assistant transcript. |
| Server → Client | `response.text.delta` / `.done` | Text-mode streamed output. |
| Server → Client | `response.function_call_arguments.delta` / `.done` | Tool calls. The `.done` event triggers dispatch. |
| Server → Client | `input_audio_buffer.speech_started` / `.stopped` | VAD signals (used for UI activity). |
| Server → Client | `response.done` | Carries `usage.input_tokens`, used by token-budget compaction. |
| Server → Client | `error` | Surfaces protocol or server errors. |

The translation from those names to the friendlier client-facing types
is one dictionary.

{{< coderef path="backend/event_mapper.py" start=9 end=25 lang="python" title="Voice Live API event types → client event types" >}}

### Pipe 3: Backend to Browser (added events)

These types are not part of the Voice Live protocol. The backend
synthesises them so the browser can render the orchestration story.
Each one is a normal `OutboundEvent` JSON message on the same WS.

| Sample-only event | Emitted by | Carries |
| --- | --- | --- |
| `pattern.selected` | `websocket_handler.py` | Confirms the pattern the WS opened with. |
| `session.prompt_updated` | `azure_session._apply_handoff` | The new active prompt + `reason` for the change. |
| `agent.handoff` | `azure_session._apply_handoff` | `from`, `to`, `reason`, `new_tools`. |
| `tool.called` / `tool.result` | `azure_session._handle_tool_call` | Tool name, arguments, returned payload. |
| `supervisor.exchange` | `chat_supervisor.escalate_to_supervisor` | Question the realtime model asked, supervisor's answer. |
| `compaction.applied` | `azure_session._apply_compaction` | Strategy name, deleted item ids, remaining count. |
| `pattern.switching` | `azure_session._handle_pattern_switch` | Sent right before tearing down a pattern at runtime. |
| `text.sent` | `azure_session.send_text` | Echo of a text-mode user turn for the transcript. |
| `session.closed` | `websocket_handler.py` | Final event before the browser WS closes. |

The handler that injects the first sample-only event right after WS
open:

{{< coderef path="backend/websocket_handler.py" start=22 end=35 lang="python" title="pattern.selected is synthesised by the backend, not Azure" >}}

And the one the patterns reach for whenever they swap prompts or tools
at runtime, the source of `session.prompt_updated` and `agent.handoff`:

{{< coderef path="backend/azure_session.py" start=301 end=338 lang="python" title="Handoff = ClientEventSessionUpdate + ResponseCreate + two synthetic events" >}}

### Which event flows through which pipe

{{< mermaid >}}
flowchart LR
  subgraph BR[Browser]
    UI[App / Dev UI]
  end
  subgraph BE[Backend session loop]
    WS[WS handler]
    AS[AzureSession]
    PT[Pattern]
  end
  subgraph AZ[Azure Voice Live API]
    VL[Voice Live WS]
  end

  UI -- audio / text.message / session.config / pattern.switch --> WS
  WS -- input_audio_buffer.append / conversation.item.create / session.update --> VL
  VL -- response.audio.* / response.audio_transcript.* / function_call_arguments.done / response.done --> AS
  AS -- audio.delta / transcript.* / tool.called / response.done --> UI
  AS -- agent.handoff / session.prompt_updated / supervisor.exchange / compaction.applied --> UI
  PT -. emits .-> AS
{{< /mermaid >}}

The right column (events that reach the browser) is the union of
mapped Voice Live events and the sample-only events. Everything
sample-specific stays on the backend-to-browser pipe. Azure never sees
it.

## Three views of the same stream

The right rail can render the events as a list or a timeline, and a
fullscreen mode is available for long calls. All three modes are
re-derived from the same in-memory event log. They are formatting,
not separate pipelines.

{{< shot src="img/07-events-list-rich.png" alt="Events list showing categorized pills (session, audio, agent, tool, error, llm) and the chronological list of events." caption="Default view: filterable list with category pills." >}}

{{< shot src="img/08-events-timeline-view.png" alt="Events rendered as a swimlane timeline, grouped by category." caption="Timeline view: same events, grouped by category for at-a-glance flow." >}}

{{< shot src="img/09-fullscreen-timeline.png" alt="Fullscreen timeline modal with a wider canvas and richer event detail tooltips." caption="Fullscreen mode for long calls, useful when you need to see the entire shape of the conversation at once." >}}

## Compaction: keeping the context window healthy

Every time the realtime model responds, the input window grows by all
prior conversation items the SDK still has registered. On a long call
that wins you nothing and costs you tokens. The sample ships three
opt-in strategies (and an `off` default) selected from the Session
Config panel.

{{< coderef path="backend/compaction.py" start=18 end=55 lang="python" title="NoCompaction, RollingWindow, and TokenBudget" >}}

The factory just maps a config key to a strategy.

{{< coderef path="backend/compaction.py" start=58 end=67 lang="python" title="Strategies are referenced by string name in the Session Config payload" >}}

When a strategy returns item IDs to delete, `_apply_compaction` issues a
`ClientEventConversationItemDelete` for each one and emits a
`compaction.applied` event so the developer view can show what happened.

{{< coderef path="backend/azure_session.py" start=240 end=263 lang="python" title="Compaction = item deletes + an event for the UI" >}}

## How a compaction event looks end to end

{{< mermaid >}}
sequenceDiagram
  autonumber
  participant V as Realtime model
  participant B as Backend session loop
  participant A as Azure Voice Live API
  participant F as Frontend events panel

  V->>A: response.done {usage: {input_tokens: 4123}}
  A-->>B: response.done event
  B->>B: strategy.select(item_ids, 4123)
  Note over B: TokenBudget(4000) → over budget,<br/>delete oldest 25%
  loop deleted items
    B->>A: ClientEventConversationItemDelete(item_id)
  end
  B-->>F: compaction.applied {strategy, deleted_count, remaining_items}
{{< /mermaid >}}

## Picking a strategy

| Strategy | When to use |
| --- | --- |
| `off` | Short calls, debugging, golden-path eval runs. |
| `rolling_5` / `rolling_10` | Predictable cap on items, regardless of token cost. Good for chatty domains where each turn is small. |
| `token_budget_4k` | Best when answers vary wildly in size — only acts when you actually approach the budget. |

{{< callout type="tip" >}}
Compaction events are renderable in the timeline alongside everything else.
A call that suddenly stops working can often be diagnosed by looking for an
unexpected `compaction.applied` followed by an LLM that "forgot" something
critical. Build that signal into your evals.
{{< /callout >}}
