---
title: "Voice Live API — Orchestration Patterns"
---

This site is a code-driven walkthrough of `voicelive-agent-patterns`, a sample
that shows two ways to build agentic voice applications on top of the
[Azure Voice Live API](https://learn.microsoft.com/azure/ai-services/openai/voice-live)
using the `gpt-realtime` model. The reference scenario is a stressful one:
a caller who has just had a car accident, filing an insurance claim by
speaking to an AI agent.

The claims domain is not the point. The point is to show, end to end,
what an event-driven agentic pattern actually looks like over the wire:
the session updates, the tool calls, the handoffs, the supervisor
consultations, the compaction, the validation rejections. Every one of
those moments is inspectable in the UI so you can lift the techniques
into your own product.

## What the two patterns demonstrate

<div class="cards">

<a class="card" href="/chat-supervisor/">
  <div class="card__eyebrow">Pattern 1</div>
  <div class="card__title">Chat-Supervisor</div>
  <p>One realtime voice agent (Aria) handles the conversation. A separate
  text model (gpt-4.1) is consulted as a "supervisor" for business logic
  decisions like validating an ambiguous answer or judging completeness
  of collected data.</p>
</a>

<a class="card" href="/sequential-handoff/">
  <div class="card__eyebrow">Pattern 2</div>
  <div class="card__title">Sequential Handoff</div>
  <p>A graph of six specialist agents (greeter, top-level Q&amp;A, auto/property/health
  claims, summary). Each agent owns its own prompt and tools and transfers
  control to the next via tool calls, all on the <em>same</em> Voice Live API
  session.</p>
</a>

</div>

## How to read this site

Every page follows the same structure: a screenshot of the running app
showing the moment being discussed, a sequence diagram of the events,
and direct references to the source code. Code is linked, not copied.
Every snippet shows the path and line range and links back to the file
on GitHub, so you always see the current version.

<div class="cards">

<a class="card" href="/origins/">
  <div class="card__eyebrow">Read first</div>
  <div class="card__title">Origins &amp; lineage</div>
  <p>The patterns come from <code>openai/openai-realtime-agents</code>.
  This page lists what is the same, what is different, and what each
  repo covers that the other does not.</p>
</a>

<a class="card" href="/architecture/">
  <div class="card__eyebrow">Start here</div>
  <div class="card__title">Architecture</div>
  <p>The three processes (frontend, backend, question service), how they
  connect, and the gevent + asyncio bridge that makes the realtime stream
  work inside a synchronous WSGI worker.</p>
</a>

<a class="card" href="/session-lifecycle/">
  <div class="card__eyebrow">Core concept</div>
  <div class="card__title">Session lifecycle</div>
  <p>What a Voice Live API session is, how it is opened, and the detail
  worth internalising: a handoff <strong>updates the existing session</strong>
  instead of closing and reopening one.</p>
</a>

<a class="card" href="/validation/">
  <div class="card__eyebrow">Showcase</div>
  <div class="card__title">Validation flow</div>
  <p>What happens when the caller is too vague. The two-tier validation:
  question service first, supervisor escalation second.</p>
</a>

<a class="card" href="/events-compaction/">
  <div class="card__eyebrow">Observability</div>
  <div class="card__title">Events &amp; compaction</div>
  <p>The event taxonomy the backend emits, how the frontend renders it as
  a timeline, and the three compaction strategies that keep long calls
  inside the model's context window.</p>
</a>

<a class="card" href="/app-mode/">
  <div class="card__eyebrow">Two views, one session</div>
  <div class="card__title">App vs Developer mode</div>
  <p>Developer mode for understanding what is happening, App mode for
  showing what an end user would see. Both render from the same
  WebSocket event stream.</p>
</a>

<a class="card" href="/evals/">
  <div class="card__eyebrow">Crawl, Walk, Run</div>
  <div class="card__title">Evals</div>
  <p>Component tests plus three audio-driven harness tiers: clean TTS,
  noisy/phone-bandwidth audio, and multi-turn episodes driven by a
  GPT-4.1 user simulator. Graded by deterministic, keyword, and LLM
  layers.</p>
</a>

<a class="card" href="/integration/">
  <div class="card__eyebrow">Make it yours</div>
  <div class="card__title">Integration guide</div>
  <p>How to swap the bundled question service for your own backend (CRM,
  policy admin system, EHR), and how to add a new orchestration pattern
  alongside the two shipped ones.</p>
</a>

</div>
