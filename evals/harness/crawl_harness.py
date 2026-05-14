"""Crawl harness: synthetic TTS audio + single-turn replay.

Implements the guide's Crawl tier:
- Generate deterministic TTS audio for known utterances
- Stream into Voice Live API with VAD off
- Grade: tool selection, tool arguments, instruction following
"""

import json
import logging
from dataclasses import dataclass
from typing import Any

import httpx
from azure.ai.voicelive.models import FunctionTool

from evals.harness.base import (
    QUESTION_SERVICE,
    SessionResult,
    generate_tts_audio,
    run_single_turn,
)
from evals.harness.graders import (
    GradeResult,
    grade_instruction_following,
    grade_tool_call,
    grade_transcript_contains,
)

logger = logging.getLogger(__name__)

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


@dataclass
class CrawlResult:
    """Result from a crawl-tier evaluation scenario."""

    scenario_id: str
    session_result: SessionResult | None = None
    tool_call_grade: GradeResult | None = None
    transcript_grade: GradeResult | None = None
    instruction_grade: GradeResult | None = None
    overall_passed: bool = False
    error: str = ""


async def handle_tool_call(tool_name: str, arguments: dict) -> str:
    """Execute tool calls against live Question Service."""
    async with httpx.AsyncClient(base_url=QUESTION_SERVICE, timeout=10) as client:
        if tool_name == "get_next_questions":
            claim_type = arguments.get("claim_type", "auto")
            resp = await client.get(f"/questions/{claim_type}")
            return resp.text
        elif tool_name == "validate_answer":
            resp = await client.post("/validate", json=arguments)
            return resp.text
        else:
            return json.dumps({"error": f"Unknown tool: {tool_name}"})


async def run_crawl_scenario(scenario: dict[str, Any]) -> CrawlResult:
    """Run a single crawl-tier evaluation scenario.

    Args:
        scenario: Dict with keys:
            - id: Scenario identifier
            - text: User utterance to synthesize
            - system_prompt: System instructions for the agent
            - expected_tool: Expected tool name (optional)
            - expected_args_subset: Expected tool arguments subset (optional)
            - grading: Dict with optional 'transcript_contains' list
    """
    scenario_id = scenario.get("id", "unknown")
    result = CrawlResult(scenario_id=scenario_id)

    try:
        # Generate TTS audio
        text = scenario["text"]
        logger.info("[%s] Generating TTS for: %s", scenario_id, text)
        audio_bytes = await generate_tts_audio(text)
        logger.info("[%s] Generated %d bytes of audio", scenario_id, len(audio_bytes))

        # Run single turn against Voice API
        system_prompt = scenario["system_prompt"]
        session_result = await run_single_turn(
            audio_bytes=audio_bytes,
            system_prompt=system_prompt,
            tools=TOOLS,
            handle_tool_call_fn=handle_tool_call,
            timeout_s=30.0,
        )
        result.session_result = session_result

        transcript = "".join(session_result.transcript_parts)
        logger.info("[%s] Transcript: %s", scenario_id, transcript[:200])
        logger.info("[%s] Tool calls: %s", scenario_id, session_result.tool_calls)

        # Grade tool call if expected
        expected_tool = scenario.get("expected_tool")
        expected_args = scenario.get("expected_args_subset", {})
        if expected_tool:
            result.tool_call_grade = grade_tool_call(
                expected_tool=expected_tool,
                expected_args=expected_args,
                actual_calls=session_result.tool_calls,
            )

        # Grade transcript keywords
        grading_config = scenario.get("grading", {})
        must_contain = grading_config.get("transcript_contains")
        if must_contain:
            result.transcript_grade = grade_transcript_contains(
                transcript=transcript,
                must_contain=must_contain,
            )

        # LLM instruction-following grade
        result.instruction_grade = await grade_instruction_following(
            system_prompt=system_prompt,
            agent_response=transcript,
        )

        # Overall pass: tool call grade (if present) AND instruction grade must pass
        tool_ok = result.tool_call_grade.passed if result.tool_call_grade else True
        instruction_ok = result.instruction_grade.passed if result.instruction_grade else True
        result.overall_passed = tool_ok and instruction_ok

    except Exception as e:
        logger.error("[%s] Scenario failed: %s", scenario_id, e, exc_info=True)
        result.error = str(e)
        result.overall_passed = False

    return result
