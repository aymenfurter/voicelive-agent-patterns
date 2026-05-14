---
title: "Origins & lineage"
eyebrow: "Where the patterns come from"
lead: "The two patterns shown here, chat-supervisor and sequential-handoff, were popularised by OpenAI's openai/openai-realtime-agents demo. This sample re-implements them on top of the Azure Voice Live API, in Python, with a different orchestration strategy and more attention to observability and integration."
---

## The upstream reference

The patterns are not invented here. They come straight from
[`openai/openai-realtime-agents`](https://github.com/openai/openai-realtime-agents),
a Next.js / TypeScript demo from OpenAI that introduced both:

- Chat-Supervisor. A low-latency realtime "chat" agent paired with a
  smarter text-only supervisor (`gpt-4.1`) that handles tool calls and
  high-stakes reasoning.
- Sequential Handoff. A graph of specialist agents that hand the caller
  off to one another via tool calls, all on a single realtime session.
  Inspired by [OpenAI Swarm](https://github.com/openai/swarm).

If you have not read the upstream README, do that first. The why and the
benefits of each pattern are explained there in detail. This sample
assumes you understand them and shows how to build them on Azure.

## What this sample is

A port of the same two patterns to a different stack and a different
runtime model:

| Aspect | `openai/openai-realtime-agents` | This sample |
| --- | --- | --- |
| Realtime endpoint | OpenAI Realtime API | Azure AI Voice Live API (`gpt-realtime` model) |
| Connection topology | Browser to OpenAI (ephemeral key, WebRTC) | Browser to your backend to Azure (server-mediated WS) |
| Backend language | TypeScript / Next.js | Python (Flask + flask-sock + gevent) |
| Agent framework | [OpenAI Agents SDK](https://github.com/openai/openai-agents-js) | Plain class registry, no agents framework |
| Auth model | Browser holds short-lived key | Backend holds the Azure credential, browser never sees it |
| Deployment target | Vercel or any Node host | Azure Container Apps via `azd` (`infra/main.bicep`) |

## Same: what is preserved

These are kept identical so what you learn from the OpenAI docs maps
1:1 onto this code.

| Concept | Where it lives here |
| --- | --- |
| Chat-Supervisor pattern | [`backend/patterns/chat_supervisor.py`](backend/patterns/chat_supervisor.py) |
| Sequential-handoff pattern | [`backend/patterns/sequential_handoff.py`](backend/patterns/sequential_handoff.py) |
| Realtime agent does the talking, text model does the thinking | `escalate_to_supervisor` in `chat_supervisor.py` |
| Handoffs as tool calls | `transfer_to_<agent>` tools registered per agent |
| One session, prompts/tools swapped at runtime | `ClientEventSessionUpdate` on every handoff (see [Session lifecycle](/session-lifecycle/)) |
| Specialist agent prompts (greeter, top-level Q&A, domain experts, summary) | `AGENTS` dict in `sequential_handoff.py` |
| Per-agent `handoffDescription` to brief the routing model | `AgentConfig.description` field |

## Different: what changed

Most of the differences are forced by being on Azure and a server-mediated
topology. A few are deliberate teaching choices.

| Topic | Upstream | Here | Why |
| --- | --- | --- | --- |
| Wire format | OpenAI Realtime events | Azure Voice Live events ([reference](https://learn.microsoft.com/azure/ai-services/speech-service/voice-live-api-reference-2026-01-01-preview)) | Different vendor, near-identical schema. See [Events & compaction](/events-compaction/). |
| Session bridging | Client SDK + WebRTC | `azure-ai-voicelive` Python SDK over WS, exposed to the browser via a re-broadcast WS | Lets the backend mediate auth, validation, compaction, and observability. |
| Concurrency model | Node event loop | One asyncio loop on a native thread, gevent WSGI in front | Required to make `async` Voice Live calls work inside synchronous gunicorn workers. |
| Domain logic | Inline functions in the agent config | A separate **question-service** Flask process | Models the realistic case where business rules live outside the agent runtime. See [Integration guide](/integration/). |
| Tool dispatch | Agents SDK runs tools | The pattern's `handle_tool_call` runs them; `azure_session._handle_tool_call` wires them to Voice Live | Lets you watch every tool call as a typed event without an SDK in the way. |
| Validation | Whatever the agent decides | Two-tier: deterministic question service first, supervisor (`gpt-4.1`) escalation second | A common production move: cheap rules first, model judgement only when needed. |
| Compaction | Not addressed | Three pluggable strategies (`off`, `rolling_*`, `token_budget_*`) | Long voice calls otherwise blow the context window. |
| UI | Single console | Dual-mode UI: **App** (what an end-user sees) and **Developer** (timeline, prompt diff, events, call summary) | The whole point of this repo is to make the orchestration inspectable. |
| Eval scaffolding | None | `evals/` with golden dataset, harness, simulators, and live-backend tests | Lets you regression-test prompt and tool changes. |

## Not covered here (use upstream for these)

If you specifically need any of the below, the OpenAI demo is the better
starting point.

| Capability | Why it is not in this sample |
| --- | --- |
| OpenAI Agents SDK usage (declarative agents, handoffs, tracing) | The sample stays SDK-free so the moving parts are visible. |
| Built-in guardrails (the SDK's content/safety filters) | Add Azure AI Content Safety or your own moderation layer instead. |
| Browser-native WebRTC connection | Server-mediated WS was chosen for auth and observability. |
| Avatar / blendshape / viseme features | The Voice Live API supports these (see the [API reference](https://learn.microsoft.com/azure/ai-services/speech-service/voice-live-api-reference-2026-01-01-preview#server-events)) but no UI was built for them here. |
| `o4-mini` / reasoning-model supervisor | Supervisor is fixed to `gpt-4.1`. Swap it in `chat_supervisor.py`. |
| Multi-tenant scenario configs / "scenario picker" | One backend = one scenario. The pattern is hot-swappable; the domain is not. |

## Not covered upstream (only here)

The other direction: what you get from this sample that the upstream
demo does not.

| Capability | Where |
| --- | --- |
| Server-mediated topology with credential isolation | [`backend/auth.py`](backend/auth.py), [`backend/azure_session.py`](backend/azure_session.py) |
| Decoupled domain backend with HTTP contract | [`question-service/`](question-service) + [`backend/question_client.py`](backend/question_client.py). See [Integration guide](/integration/). |
| Token-budget / rolling-window compaction with UI events | [`backend/compaction.py`](backend/compaction.py) |
| Live prompt-diff view across handoffs | Frontend prompt-diff panel + `session.prompt_updated` event |
| End-to-end event timeline + fullscreen mode | Events panel. See [Events & compaction](/events-compaction/). |
| App / Developer mode toggle | [`frontend/src/components/`](frontend/src/components) ModeSwitcher |
| Bicep / `azd` deployment to Azure Container Apps | [`infra/main.bicep`](infra/main.bicep), [`azure.yaml`](azure.yaml) |
| Eval harness (golden dataset, simulators, live tests) | [`evals/`](evals) |

## Choosing between the two repos

{{< callout type="tip" >}}
**Pick the upstream demo if** you want to ship on the OpenAI Realtime API
quickly, prefer TypeScript, and want the Agents SDK to handle handoffs,
guardrails, and tracing for you.

**Pick this sample if** you need Azure (data residency, AAD auth,
Container Apps deployment), want to keep credentials off the browser,
need server-side validation/compaction, or want a working blueprint for
plugging in your own domain backend.
{{< /callout >}}
