---
title: "App vs Developer mode"
eyebrow: "Two views of the same WebSocket"
lead: "Developer mode shows the machinery. App mode shows what an end user would actually see. Both are projections of the same event stream."
---

The same call, in real time, can be rendered in two completely different
ways. The mode toggle in the top bar swaps the layout. It does not open
a new session, restart the WebSocket, or change anything on the backend.

## Developer mode

The default view. Three columns: transcript on the left, state /
flow / system prompt in the middle, events on the right. This is the view
you build the patterns with.

{{< shot src="img/01-developer-mode-initial.png" alt="Developer mode landing screen with empty transcript, data collection placeholder, call state, and an empty events rail." caption="Developer mode: every panel is wired but empty before the call starts." >}}

## App mode

What a customer-facing deployment of this experience would look like.
The transcript stays, but the middle pane becomes a structured data
collection card with claim fields, a progress meter, and a map for the
incident location. There is no system prompt, no events list, no
supervisor pill. Just the user-facing artifact.

{{< shot src="img/14-app-mode-with-data.png" alt="App mode mid-call: branded Contoso Insurance header with a 100% complete progress bar, structured cards for incident date, vehicle, details, and a map for the location." caption="App mode: same WebSocket, same events, very different surface." >}}

## The toggle is one component

The mode switch is a tiny component in the top bar. It writes to a
context that the layout consumes, so every panel knows whether to render
its developer or app variant.

{{< coderef path="frontend/src/components/ModeSwitcher.tsx" start=1 end=50 lang="tsx" title="ModeSwitcher.tsx — a single source of truth for layout mode" >}}

## App mode renders the same events differently

App mode subscribes to the same `tool.result` stream as developer mode
but maps each `validate_answer` success into a structured field. The
data grid writes one card per known field id.

{{< coderef path="frontend/src/components/appMode/AppModeDataGrid.tsx" start=1 end=71 lang="tsx" title="AppModeDataGrid.tsx — events become structured form cards" >}}

The chat list shows only the assistant's transcripts and a single
text-input box for the user. No tool pills, no JSON, no exchange traces.
{{< coderef path="frontend/src/components/appMode/AppModeChat.tsx" start=1 end=67 lang="tsx" title="AppModeChat.tsx — minimal user-facing chat UI" >}}

## Why this matters for your build

When you ship a real product, the people you demo it to are not your
operators. The two-mode split in this sample is the design move worth
keeping.

- One backend, one event protocol. Don't fork the wire format for an
  "end user" build vs an "ops" build.
- Two layouts, both consuming the same context. Whatever you would
  have built as separate apps becomes two views of one app.
- Reuse the developer view as your debugger. When something looks wrong
  in production, switching to developer mode in the same browser tab
  gives you the full timeline without redeploying anything.

{{< callout type="tip" >}}
Pair this with the [Events &amp; compaction](/events-compaction/) page.
The events list and the data grid in app mode are reading the same
`tool.result` events. Add a new tool, surface a new card in app mode,
and the developer view picks it up automatically.
{{< /callout >}}
