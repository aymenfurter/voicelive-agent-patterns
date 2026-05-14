---
title: "Evals"
eyebrow: "Crawl, Walk, Run"
lead: "Voice agents fail in ways text agents do not. The audio comes in noisy, the model talks at the same time as the caller, the tool call happens off the wrong syllable. The eval framework in this repo follows the Crawl / Walk / Run methodology from OpenAI's Realtime Eval Guide and grows test difficulty in two axes at once: how realistic the input is, and how much of a conversation the model has to hold together."
---

## Why a voice eval needs more than a transcript test

A text agent eval can usually get away with one prompt and one assertion: did the model call the right tool with the right arguments. That works less well once you put audio between the user and the model. The same script said with background noise, on a phone-bandwidth codec, by a caller who hesitates mid-sentence, becomes a different input. And once a turn becomes a multi-turn conversation, the model has to keep state, recover from mishearings, and avoid asking the same question twice.

The framework here grades two axes:

- **Input realism** goes from clean synthetic TTS, to noisy and bandwidth-limited audio, to a model-driven user simulator that improvises.
- **Episode length** goes from one tool call to a full claim intake call.

That gives the four quadrants below. Three of them are automated. The fourth one, real users in production, is still you.

| | Synthetic / clean input | Real / noisy input |
|---|---|---|
| **Single turn** | Crawl harness | Walk harness |
| **Multi-turn episode** | Run harness | Manual testing |

## What lives where

The eval code is under `evals/`. It splits into two layers: pure component tests (no Azure, no audio), and harness tests that hit live Voice Live API.

| Tier | Directory | Tests | What it covers | Live Azure |
|---|---|---|---|---|
| Unit | `evals/unit/` | 118 | Question data, validator logic, pattern configs | No |
| Integration | `evals/integration/` | 77 | Golden dataset validation, conversation flow completeness | No |
| Simulation | `evals/simulation/` | 39 | Text-simulated conversations, audio degradation proxies | No |
| E2E | `evals/e2e/` | 26 | Live Voice API sessions through the real backend | Yes |
| Crawl harness | `evals/harness/test_crawl.py` | 4 | One TTS turn, one tool call, deterministic + LLM grade | Yes |
| Walk harness | `evals/harness/test_walk.py` | 20 | Crawl plus five noise conditions | Yes |
| Run harness | `evals/harness/test_run.py` | 11 | Multi-turn episodes driven by a `gpt-4.1` user simulator across three personas | Yes |

The component tiers are the safety net. They run in seconds, do not need a deployed model, and catch the "you broke the question schema" or "you misnamed a tool" class of bug before any audio is involved. The harness tiers are the realism layer.

## The audio pipeline

All three harness tiers share a TTS-to-PCM pipeline. The full implementation is in {{< coderef path="evals/harness/base.py" start=54 end=100 lang="python" title="TTS to PCM16, then chunked into 20 ms frames" >}}

The flow is:

1. `edge-tts` reads the prompt as MP3.
2. `ffmpeg` converts to PCM16, 24 kHz, mono. (PCM16 = 2 bytes per sample; one 20 ms frame at 24 kHz is 960 bytes.)
3. Walk runs splice in noise (`add_noise`) or a phone-bandwidth filter (`phone_bandwidth_filter`) at this stage.
4. `chunk_audio` cuts the result into 20 ms frames and pads the tail with silence.
5. The frames stream into a Voice Live session as `input_audio_buffer.append`. VAD is disabled so the harness controls when the turn ends; it commits manually with `input_audio_buffer.commit` followed by `response.create`.
6. The session result (events, tool calls, transcript, audio deltas, latency) is collected into a `SessionResult` dataclass and handed to the graders.

Doing the chunking and the commit in the test, instead of relying on server VAD, removes a class of flakiness where the test would pass or fail based on whether silence got detected in time.

## What each harness tests

### Crawl: one clean turn, one tool call

The simplest harness. A short prompt like "I want to file an auto claim" goes through TTS, lands in Voice Live, and the grader checks two things: was `get_next_questions` called, and was `claim_type` set to `"auto"`. The transcript is checked with a keyword grader and an LLM rubric on top.

Crawl is the tier you run after touching prompts or tool definitions. It catches "I changed the function name" and "the model is now answering in chat instead of calling the tool" the fastest.

### Walk: same script, five conditions

Walk replays Crawl scenarios under five conditions defined in {{< coderef path="evals/harness/walk_harness.py" start=64 end=71 lang="python" title="The five Walk noise conditions" >}}

| Condition | What it does |
|---|---|
| `clean` | No degradation. Establishes the baseline. |
| `office_noise` | White noise overlay at SNR 25 dB. |
| `noisy_room` | White noise overlay at SNR 15 dB. |
| `phone_bandwidth` | Filter that simulates 8 kHz phone bandwidth. |
| `phone_noisy` | Phone bandwidth plus white noise at SNR 20 dB. |

For each condition the harness asserts that events still flow and, on the cleaner cases, that the right tool gets called with the right arguments. Some scenarios do not assert tool calls under the worst noise conditions because that would be testing the audio model, not the agent. The point is to catch regressions in robustness, not to prove the model is perfect.

### Run: multi-turn, model-simulated callers

Run is where it gets interesting. A `gpt-4.1` instance plays the caller. It is given a persona and a goal, then it improvises responses to whatever the agent asks. Three personas live in {{< coderef path="evals/harness/run_harness.py" start=106 end=126 lang="python" title="Three personas the user simulator can wear" >}}

| Persona | Profile | Claim |
|---|---|---|
| `cooperative` | Helpful caller with all info ready | Auto |
| `confused` | Older caller who gives vague answers and needs prompting | Property |
| `rushed` | Busy professional who gives brief answers | Health |

Each episode runs up to 20 turns. The grader does not just check the final state. It looks at how many tool calls happened, which questions got answered, whether `validate_answer` was invoked when the caller hedged, and whether the agent kept asking one question at a time. The `confused` persona is specifically designed to provoke clarifications: the agent should call `validate_answer` more often, not give up.

This is the tier that catches prompt drift. If you add a sentence to the system prompt and the agent suddenly starts asking three questions per turn, Run notices.

## How grading works

Three grader families stack on top of every result, each one looking for a different class of failure. Implementations live in {{< coderef path="evals/harness/graders.py" start=33 end=80 lang="python" title="Deterministic tool-call grader" >}}

### Metrics by grading method

The table below lists every metric the harness records, what it actually measures, and how it is graded. "Programmatic" means a Python check with no model in the loop. "LLM judge" means a `gpt-4.1` call with a rubric and JSON-mode output. "Recorded only" means the value is captured into the result dataclass and logged but no test fails on it.

| Metric | What it measures | How it is graded | Where | Tier |
|---|---|---|---|---|
| Tool name correctness | Was the expected tool (`get_next_questions`, `validate_answer`, `submit_claim_data`, `transfer_to_*`) actually called? | Programmatic. Exact string match against the call list. | `grade_tool_call` in `evals/harness/graders.py` | Crawl, Walk, Run |
| Tool argument correctness | Do the arguments include the expected key/value pairs (e.g. `claim_type="auto"`)? | Programmatic. Subset match on parsed arguments. | `grade_tool_call` | Crawl, Walk, Run |
| Tool argument JSON validity | Did the model emit parseable JSON for the arguments? | Programmatic. `json.loads` in the session loop. | `evals/harness/base.py` | Crawl, Walk, Run |
| Transcript keywords | Does the assistant transcript contain the required scenario phrases ("claim type", "policy number", a date, etc.)? | Programmatic. Case-insensitive substring scan. | `grade_transcript_contains` | Crawl, Walk |
| Event presence under noise | Did the session produce any events at all under each noise condition? | Programmatic. `len(events_received) > 0` with the condition name in the failure message. | `evals/harness/test_walk.py` | Walk |
| One-question-at-a-time | Did the agent ask at most one question per turn? | LLM judge (`gpt-4.1`, temperature 0, JSON mode). | `grade_instruction_following` criterion `one_question_at_a_time` | Crawl, Run |
| Conciseness | Is the spoken response short enough for voice (one to three sentences)? | LLM judge. | `grade_instruction_following` criterion `conciseness` | Crawl, Run |
| No hallucinated data | Did the agent invent claim numbers, policy IDs, or facts the user never gave? | LLM judge. | `grade_instruction_following` criterion `no_hallucination` | Crawl, Run |
| Professional tone | Is the tone appropriate for an insurance claims call? | LLM judge. | `grade_instruction_following` criterion `professional_tone` | Crawl, Run |
| Episode completion | Did the multi-turn episode reach a finished claim? | Programmatic. `result.claim_complete` flag. | `grade_episode` in `run_harness.py` | Run |
| Turn budget | Did the episode finish within the persona's expected turn range? | Programmatic. `total_turns <= persona.expected_turns[1]`. | `grade_episode` | Run |
| Tool usage | Did the agent call any tools across the episode? | Programmatic. `len(tool_calls_made) > 0`. | `grade_episode` | Run |
| Multi-turn coherence | Did the conversation reach at least three turns before terminating? | Programmatic. `total_turns >= 3`. | `grade_episode` | Run |
| Episode rubric | Across the whole episode: relevant questions, appropriate tool use, professional tone, natural flow. | LLM judge over the full transcript. | `grade_episode` then `grade_instruction_following` with episode-level criteria | Run |
| Audio response presence | Did Azure stream any `response.audio.delta` events back? | Programmatic. `audio_deltas_count > 0`. | `SessionResult` in `evals/harness/base.py` | Crawl, Walk, Run |
| Per-turn latency | Wall-clock time from `response.create` to `response.done` for one turn. | Recorded only. Logged at INFO. | `_run_voice_turn` in `run_harness.py` | Crawl, Walk, Run |
| Episode latency | Total wall-clock time for the full multi-turn episode. | Recorded only. Logged at INFO. | `EpisodeResult.total_latency_s` | Run |
| Validator outcomes | Are the question service's deterministic rules (vague-quantifier filter, date regex, policy-number format) applied correctly? | Programmatic. Direct calls in unit tests. | `evals/unit/test_validator.py` | Unit |
| Conversation flow completeness | Does each scripted golden conversation reach a valid end state via the right tool sequence? | Programmatic. Walk the turn list and assert against the expected schema. | `evals/integration/test_conversation_flow.py`, `test_completeness.py` | Integration |
| Golden dataset coverage | Do the eight scripted scenarios still produce the expected tool calls and field values? | Programmatic. Replay each scenario against the patterns. | `evals/integration/test_golden_dataset.py` | Integration |

### Why three methods

- **Programmatic checks** are cheap, deterministic, and unambiguous. They catch schema breakage, missing tools, and mis-parsed arguments. A tool name typo fails here loudly and immediately. They are the only checks that run in the unit and integration tiers.
- **Keyword checks** sit between programmatic and LLM grading. They confirm the agent stayed on script without forcing a specific phrasing. Strict enough to catch a missing concept, loose enough to accept paraphrasing.
- **LLM judges** catch the things tests cannot describe in code: tone, wordiness, asking three questions in one breath, inventing a policy number that "looks right". The judge runs at temperature 0 with JSON-mode output and a fixed rubric so its verdicts are reasonably stable across runs.

The latency numbers are deliberately not assertions. Voice Live latency varies enough between runs that a strict threshold would be flaky. They are recorded so you can spot a regression in trend, not in a single run.

## Running them locally

The component tiers need nothing but Python:

```bash
pip install -r evals/requirements.txt
pytest evals/unit/ evals/integration/ evals/simulation/ -v
```

The harness tiers need a live Voice Live deployment, an `az login`, and the question service running on `:8001`:

```bash
az login
cd question-service && python -m flask run -p 8001 &

pytest evals/harness/test_crawl.py -v --timeout=120   # ~2 min
pytest evals/harness/test_walk.py  -v --timeout=300   # ~11 min
pytest evals/harness/test_run.py   -v --timeout=600   # ~11 min per persona
```

E2E tests additionally need the backend on `:8000`:

```bash
cd backend && python -m flask run -p 8000 &
pytest evals/e2e/ -v
```

## Where this stops

The framework does not test latency targets, does not test interruption handling, and does not yet model network jitter. Latency is recorded, but no test fails if it goes up; that is intentional, because Voice Live latency varies enough between runs that a strict threshold would be noisy. Interruption handling (the caller talking over the agent) is genuinely hard to script and is left for manual testing. If those matter for your deployment, those are the gaps to fill in next.

The full methodology, including the rationale from the OpenAI guide, lives in [`evals/README.md`](https://github.com/Azure-Samples/voicelive-agent-patterns/blob/main/evals/README.md).
