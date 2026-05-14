---
title: "Session lifecycle"
eyebrow: "Voice Live API"
lead: "What a session is, how it starts, how it ends, and the detail worth internalising: handoffs do not open a new session."
---

A Voice Live API session is a single bidirectional WebSocket between the
backend and Azure. It is opened once per call, configured once with a
`session.update`, and then carries audio in both directions plus a stream
of event messages until the user hangs up.

The sample uses the official `azure.ai.voicelive.aio` SDK. Opening a
session is one async context manager.

{{< coderef path="backend/azure_session.py" start=48 end=98 lang="python" title="One Voice Live API session per call, configured by the active pattern" >}}

Once `connect()` returns, two coroutines run concurrently for the
lifetime of the call. `_read_from_browser` pulls inbound audio bytes
or control JSON off the thread-safe queue and forwards them to Azure.
`_read_from_azure` consumes events from Azure, maps them to client event
types, and pushes them onto the outbound queue.

## The "session is updated, not replaced" rule

This is the one thing about agentic patterns on the Voice Live API that
is worth fully internalising. When the active agent changes, whether
because the supervisor consulted a different specialist or because the
sequential pattern transferred from `greeter` to `top_level_qa`, the
backend does not open a new WebSocket and it does not call `connect()`
again. It sends a `session.update` over the existing connection with the
new instructions and tools, then asks the model to respond.

{{< coderef path="backend/azure_session.py" start=301 end=336 lang="python" title="Handoff = ClientEventSessionUpdate on the same connection" >}}

Practically, this means:

- Audio buffer state is preserved.
- The conversation history (`item_id` list) is preserved.
- The browser sees an `agent.handoff` event followed by a
  `session.prompt_updated` event, but the underlying socket and session
  ID never change.

The screenshot below makes that concrete. After two transfers
(`greeter` to `top_level_qa` to `auto_claims`) the right rail shows
three prompt updates and two handoffs, but the bottom status bar still
shows the same `Session: …` ID.

{{< shot src="img/12-sequential-handoff-in-conversation.png" alt="Sequential handoff conversation showing handoff history Greeter → Top Level Qa → Auto Claims and three prompt updates in the events rail." caption="Three agents have been active in this call. The session ID at the bottom of the screen never changed." >}}

## Lifecycle, end to end

{{< mermaid >}}
sequenceDiagram
  autonumber
  participant F as Frontend
  participant B as Backend WS handler
  participant A as Azure Voice Live API

  F->>B: WS open (?pattern=...)
  B->>A: connect(endpoint, credential, model)
  A-->>B: session.created
  B->>A: ClientEventSessionUpdate(instructions, tools, voice, vad)
  A-->>B: session.updated
  B-->>F: pattern.selected, session.created

  loop conversation
    F->>B: audio bytes
    B->>A: ClientEventInputAudioBufferAppend
    A-->>B: response.audio.delta, transcript.done, function_call_arguments.done
    B-->>F: audio.delta, transcript.done, tool.called

    opt tool requires handoff
      B->>A: ClientEventConversationItemCreate(FunctionCallOutputItem)
      B->>A: ClientEventSessionUpdate(NEW instructions, NEW tools)
      B->>A: ClientEventResponseCreate(additional_instructions=handoff_prompt)
      B-->>F: agent.handoff, session.prompt_updated
    end
  end

  F->>B: WS close
  B->>A: __aexit__ (closes connection)
  B-->>F: session.closed
{{< /mermaid >}}

## What "session config" actually contains

The first `session.update` is built by `session_builder.py`. It composes
the active pattern's prompt and tools with runtime overrides for VAD
mode, noise suppression, echo cancellation, voice, and temperature.
Everything the user can twist in the **Session Config** panel routes
through here.

{{< coderef path="backend/session_builder.py" start=22 end=80 lang="python" title="How runtime config layers on top of pattern defaults" >}}

{{< shot src="img/16-session-config-open.png" alt="Expanded Session Config panel showing dropdowns for VAD mode, voice, temperature and toggles for noise reduction and echo cancellation." caption="The Session Config panel exposes the same knobs that session_builder.py interprets." >}}

{{< callout type="tip" >}}
If you only remember one thing from this page: a session is the WebSocket,
not the agent. Patterns juggle agents on top of one session. That is what
makes voice handoffs feel instant.
{{< /callout >}}
