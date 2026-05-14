---
title: "Pattern 2 — Sequential Handoff"
eyebrow: "A graph of specialist agents"
lead: "Six agents take turns owning the call. Each has its own prompt and tool set. Transfers happen via tool calls and update the live Voice Live API session in place."
---

Sequential Handoff shows a workflow where the caller is explicitly
moved between specialists (`greeter`, `top_level_qa`, `auto_claims`,
`property_claims`, `health_claims`, and `summary`), but where each
"agent" is just a different prompt and tool list applied to the same
Voice Live API session.

{{< shot src="img/11-sequential-handoff-initial.png" alt="Sequential handoff initial state. Greeter is the active agent and the agent progress list shows all six agents." caption="Every call starts with the greeter. The Agent Progress list previews the chain to come." >}}

## Agents are just configs

An agent is a small dataclass with three things: a name, a system prompt,
and a list of allowed handoff targets. Specialists also carry the business
tools (`validate_answer`, `get_next_questions`, `submit_claim_data`).

{{< coderef path="backend/patterns/sequential_handoff.py" start=21 end=51 lang="python" title="An agent is just a name + prompt + handoff list" >}}

The full registry maps agent names to configs:

{{< coderef path="backend/patterns/sequential_handoff.py" start=209 end=217 lang="python" title="Six agents, accessed by name" >}}

## How transfers become tool calls

The pattern generates a `transfer_to_<target>` function tool for every
allowed handoff target. The realtime model sees these tools alongside the
domain tools and decides when to call them.

{{< coderef path="backend/patterns/sequential_handoff.py" start=219 end=241 lang="python" title="Handoff tools are generated from each agent's `handoffs` list" >}}

When the model calls `transfer_to_auto_claims`, the pattern swaps
`_current_agent_name` and returns a result that includes the new agent's
prompt and tools, plus a `requires_session_update: True` flag that tells
the session loop to push a `session.update` to Azure.

{{< coderef path="backend/patterns/sequential_handoff.py" start=295 end=318 lang="python" title="A transfer is a tool call that returns the new prompt and tools" >}}

The session loop reads that flag in `_handle_tool_call` and dispatches
to `_apply_handoff` (covered in [Session lifecycle](/session-lifecycle/#the-session-is-updated-not-replaced-rule)),
which updates the same Voice Live API connection. It never opens a new
one.

## Watching the handoff happen

Once the caller has spoken enough for the greeter to triage them, two
transfers fire in quick succession: `greeter` to `top_level_qa` to
`auto_claims`. The events rail records each step.

{{< shot src="img/12-sequential-handoff-in-conversation.png" alt="Sequential handoff after two transfers. The handoff history panel shows Greeter → Top Level Qa → Auto Claims and the events rail shows three prompt updates and two transfer_to_* tool calls." caption="Three prompt updates, two handoffs, one session." >}}

## End-to-end flow

{{< mermaid >}}
sequenceDiagram
  autonumber
  participant U as Caller
  participant V as Realtime model (gpt-realtime)
  participant B as Backend
  participant A as Azure Voice Live API

  Note over V: Active prompt: greeter
  U->>V: "I need to file a claim."
  V->>B: function_call transfer_to_top_level_qa{reason}
  B->>A: ClientEventConversationItemCreate(FunctionCallOutputItem)
  B->>A: ClientEventSessionUpdate(top_level_qa prompt + tools)
  B->>A: ClientEventResponseCreate(additional_instructions=handoff_prompt)
  A-->>B: response.audio.delta (now speaking as top_level_qa)
  B-->>F: agent.handoff, session.prompt_updated

  Note over V: Active prompt: top_level_qa
  U->>V: "It's an auto accident."
  V->>B: function_call transfer_to_auto_claims{reason}
  B->>A: same dance, with auto_claims prompt + tools
  Note over V: Active prompt: auto_claims
{{< /mermaid >}}

## Why this pattern

Use Sequential Handoff when:

- Your call has clearly distinct phases that each want their own prompt
  (different vocabulary, different tools, different temperature).
- You want to keep each agent's prompt small and focused, so it is
  easier to evaluate and iterate on individually.
- You want a visible "where are we in the workflow" signal in the UI.
  The handoff history is the workflow.

If you want one consistent voice persona for the whole call and only
need help with a few business decisions, see
[Chat-Supervisor](/chat-supervisor/).

## See the prompt diff

Open the **Prompt Updates** panel after a few handoffs and you can step
through every prompt the realtime model has been given on this session.
Every update is timestamped and labeled with the new agent name.

{{< shot src="img/13-prompt-diff-handoffs.png" alt="Prompt Updates panel showing three entries: greeter, top_level_qa, auto_claims, each with their full system prompt." caption="The prompt diff panel doubles as an audit log of every persona the model has worn." >}}
