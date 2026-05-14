"""Walk harness: real/noisy audio + single-turn replay.

Tests audio perception resilience by degrading synthetic audio
with realistic noise conditions before streaming to Voice API.
"""

import json
import logging
import os
from dataclasses import dataclass, field

import httpx

from azure.ai.voicelive.models import FunctionTool

from evals.harness.base import (
    add_noise,
    chunk_audio,
    generate_tts_audio,
    phone_bandwidth_filter,
    run_single_turn,
    SessionResult,
)
from evals.harness.graders import (
    grade_tool_call,
    grade_transcript_contains,
    GradeResult,
)

logger = logging.getLogger(__name__)

ENDPOINT = os.environ.get("AZURE_VOICE_ENDPOINT", "")
DEPLOYMENT = os.environ.get("AZURE_OPENAI_DEPLOYMENT", "gpt-realtime")
QUESTION_SERVICE = os.environ.get("QUESTION_SERVICE_URL", "http://localhost:8001")

TOOLS = [
    FunctionTool(
        name="get_next_questions",
        description="Get the next questions based on claim type",
        parameters={
            "type": "object",
            "properties": {
                "claim_type": {
                    "type": "string",
                    "enum": ["auto", "property", "health"],
                }
            },
            "required": ["claim_type"],
        },
    ),
    FunctionTool(
        name="validate_answer",
        description="Validate a caller's answer to a question",
        parameters={
            "type": "object",
            "properties": {
                "question_id": {"type": "string"},
                "answer": {"type": "string"},
            },
            "required": ["question_id", "answer"],
        },
    ),
]

NOISE_CONDITIONS = [
    {"name": "clean", "noise_type": None, "snr_db": None},
    {"name": "office_noise", "noise_type": "white", "snr_db": 25},
    {"name": "noisy_room", "noise_type": "white", "snr_db": 15},
    {"name": "phone_bandwidth", "filter": "phone_bandwidth"},
    {"name": "phone_noisy", "noise_type": "white", "snr_db": 20, "filter": "phone_bandwidth"},
]


@dataclass
class WalkResult:
    """Result of a single walk scenario execution."""

    session_result: SessionResult
    grades: dict[str, GradeResult] = field(default_factory=dict)
    noise_condition_name: str = "clean"


async def handle_tool_call(tool_name: str, arguments: dict) -> str:
    """Route tool calls to the Question Service."""
    async with httpx.AsyncClient(base_url=QUESTION_SERVICE, timeout=10) as client:
        if tool_name == "get_next_questions":
            resp = await client.get(f"/questions/{arguments.get('claim_type', 'auto')}")
            return resp.text
        elif tool_name == "validate_answer":
            resp = await client.post("/validate", json=arguments)
            return resp.text
        return json.dumps({"error": f"Unknown tool: {tool_name}"})


def _apply_degradation(audio: bytes, noise_condition: dict) -> bytes:
    """Apply noise and/or bandwidth filtering to audio."""
    degraded = audio
    noise_type = noise_condition.get("noise_type")
    snr_db = noise_condition.get("snr_db")
    if noise_type and snr_db is not None:
        degraded = add_noise(degraded, noise_type, snr_db)
    if noise_condition.get("filter") == "phone_bandwidth":
        degraded = phone_bandwidth_filter(degraded)
    return degraded


async def run_walk_scenario(scenario: dict, noise_condition: dict) -> WalkResult:
    """Run a single-turn scenario with degraded audio.

    Args:
        scenario: dict with keys:
            - text: utterance to synthesize
            - system_prompt: prompt for the voice agent
            - expected_tool: (optional) tool name the agent should call
            - expected_args_subset: (optional) subset of expected arguments
            - transcript_keywords: (optional) keywords expected in transcript
        noise_condition: dict with keys:
            - name: human-readable condition name
            - noise_type: (optional) type of noise to add
            - snr_db: (optional) signal-to-noise ratio in dB
            - filter: (optional) "phone_bandwidth" to apply bandpass

    Returns:
        WalkResult with session_result, grades, and noise_condition_name.
    """
    condition_name = noise_condition.get("name", "unknown")
    logger.info(
        "Running walk scenario text=%r under condition=%s",
        scenario["text"][:50],
        condition_name,
    )

    # 1. Generate clean TTS audio
    audio = await generate_tts_audio(scenario["text"])
    logger.debug("Generated TTS audio: %d bytes", len(audio))

    # 2. Apply degradation
    audio = _apply_degradation(audio, noise_condition)
    logger.debug("After degradation (%s): %d bytes", condition_name, len(audio))

    # 3. Run through Voice API
    result = await run_single_turn(
        audio, scenario["system_prompt"], TOOLS, handle_tool_call
    )
    logger.info(
        "Session completed: events=%d, tool_calls=%d, latency=%dms",
        len(result.events_received),
        len(result.tool_calls),
        result.latency_ms,
    )

    # 4. Grade
    grades: dict[str, GradeResult] = {}

    if scenario.get("expected_tool"):
        grades["tool_call"] = grade_tool_call(
            expected_tool=scenario["expected_tool"],
            expected_args=scenario.get("expected_args_subset", {}),
            actual_calls=result.tool_calls,
        )
        logger.info("Tool call grade: passed=%s", grades["tool_call"].passed)

    if scenario.get("transcript_keywords"):
        transcript_text = " ".join(result.transcript_parts)
        grades["transcript"] = grade_transcript_contains(
            transcript=transcript_text,
            must_contain=scenario["transcript_keywords"],
        )
        logger.info("Transcript grade: passed=%s", grades["transcript"].passed)

    return WalkResult(
        session_result=result,
        grades=grades,
        noise_condition_name=condition_name,
    )


async def run_walk_scenario_all_conditions(scenario: dict) -> dict[str, WalkResult]:
    """Run a scenario under all noise conditions and return results keyed by name."""
    results = {}
    for condition in NOISE_CONDITIONS:
        result = await run_walk_scenario(scenario, condition)
        results[condition["name"]] = result
    return results
