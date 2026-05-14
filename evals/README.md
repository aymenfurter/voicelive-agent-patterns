# Evaluation Framework

This evaluation framework implements the **Crawl / Walk / Run** methodology for testing voice AI systems, as described in the [Realtime Eval Guide](https://developers.openai.com/cookbook/examples/realtime_eval_guide).

## The 2×2 Evaluation Quadrant

```
                    ┌─────────────────────────────────────────┐
                    │                                         │
    Multi-turn      │   Run Harness        Manual Testing     │
    (episode)       │   (model-simulated   (real users in     │
                    │    user + TTS +       production)        │
                    │    Voice API)                            │
                    │                                         │
                    ├─────────────────────────────────────────┤
                    │                                         │
    Single-turn     │   Crawl Harness      Walk Harness       │
    (one request)   │   (synthetic TTS     (noisy/degraded    │
                    │    + Voice API)       audio + Voice API) │
                    │                                         │
                    └─────────────────────────────────────────┘
                         Synthetic/Clean      Real/Noisy
                              Input Conditions →
```

## Test Suites

### Prerequisites (Component Tests)

Before running harness-based tests, ensure component correctness:

| Suite | Dir | Tests | What's Tested | Command |
|-------|-----|-------|---------------|---------|
| Unit | `evals/unit/` | 118 | Question data, validator logic, pattern configs | `pytest evals/unit/ -m crawl` |
| Integration | `evals/integration/` | 77 | Golden dataset validation, conversation flow | `pytest evals/integration/ -m walk` |
| Simulation | `evals/simulation/` | 26 | Text-simulated conversations, bad audio proxy | `pytest evals/simulation/ -m run` |
| E2E | `evals/e2e/` | 26 | Live Azure Voice API, real backend HTTP | `pytest evals/e2e/` |

### Harness-Based Tests (Guide Methodology)

| Tier | Dir | What It Does | Command |
|------|-----|-------------|---------|
| **Crawl** | `evals/harness/test_crawl.py` | TTS audio → stream to Voice API → grade tool calls | `pytest evals/harness/test_crawl.py -m crawl_harness` |
| **Walk** | `evals/harness/test_walk.py` | Noisy/degraded audio → Voice API → grade perception | `pytest evals/harness/test_walk.py -m walk_harness` |
| **Run** | `evals/harness/test_run.py` | LLM user simulator → TTS → Voice API multi-turn loop | `pytest evals/harness/test_run.py -m run_harness` |

## Harness Pipeline

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐     ┌──────────┐
│ Golden Text  │────▸│ TTS (edge)   │────▸│ Audio Degrader  │────▸│ PCM16    │
│ "March 15.."│     │ → MP3 → PCM  │     │ (Walk: noise,   │     │ 24kHz    │
└─────────────┘     └──────────────┘     │  phone BW)       │     │ mono     │
                                          └─────────────────┘     └────┬─────┘
                                                                       │
                                                              20ms chunks
                                                                       │
                                                                       ▼
┌──────────────┐     ┌──────────────┐     ┌─────────────────┐     ┌────┴─────┐
│ Grade Result │◂────│ Graders      │◂────│ Session Result   │◂────│ Voice    │
│ pass/fail    │     │ • Deterministic│   │ • tool_calls     │     │ Live API │
│ + reasoning  │     │ • LLM rubric │     │ • transcript     │     │ (Azure)  │
└──────────────┘     │ • Audio      │     │ • latency        │     └──────────┘
                     └──────────────┘     │ • events         │
                                          └─────────────────┘
```

## Grading Stack

### Deterministic Graders
- **Tool call grading**: Did the agent call the right tool with correct arguments?
- **Transcript keyword check**: Does the response contain expected keywords?
- **JSON/schema validity**: Are tool arguments valid JSON matching the schema?

### LLM Graders (GPT-4.1)
- **Instruction following**: One question at a time? Concise? No hallucinated data?
- **Correctness**: Did the agent interpret the user's answer correctly?
- **Professional tone**: Appropriate for insurance claims context?

### Audio Graders
- **Silence detection**: Did the agent produce audio output?
- **Response presence**: Were audio deltas received in the response?

## Running Tests

```bash
# Prerequisites
az login
pip install -r evals/requirements.txt

# Start services (needed for all tests)
cd question-service && python -m flask run -p 8001 &
cd backend && python -m flask run -p 8000 &

# Run component tests (fast, no Azure needed for unit/integration)
pytest evals/unit/ evals/integration/ -v

# Run harness tests (requires live Azure)
pytest evals/harness/test_crawl.py -v --timeout=120
pytest evals/harness/test_walk.py -v --timeout=300
pytest evals/harness/test_run.py -v --timeout=600

# Run everything
pytest evals/ -v --timeout=600
```

## Golden Dataset

Located at `evals/fixtures/golden_dataset.json`. Contains 8 scenarios:
- 3 happy paths (auto, property, health claims)
- 5 edge cases (vague answers, ambiguous quantities, incomplete descriptions, invalid policy, multiple clarifications)

Each scenario includes conversation turns, expected outputs, and validation metadata.

## Adding New Test Cases

The recommended loop from the guide:
1. **Production failure** → reproduce with text
2. **Add to golden dataset** with expected output
3. **Unit test** (`evals/unit/`) validates component logic
4. **Crawl test** (harness) validates Voice API behavior
5. **Walk test** (harness) validates under noise
6. Promote to regression suite
