"""Crawl-tier harness tests: real TTS audio → Voice Live API → grade.

These tests talk to REAL Azure services (Voice Live API + Azure OpenAI).
They require:
  - Azure credentials (az login / DefaultAzureCredential)
  - Question Service running on localhost:8001
  - ffmpeg installed for TTS audio conversion
"""

import logging

import httpx
import pytest

from evals.harness.crawl_harness import run_crawl_scenario

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """\
You are a friendly insurance claims intake agent named Aria.
Ask questions ONE AT A TIME and validate each answer before proceeding.
You have tools to get questions and validate answers.
Start by greeting the caller and asking what type of claim they need to file.
Keep responses concise (1-2 sentences) as this is a voice conversation.
Use the validate_answer tool after each answer to check completeness.
Use get_next_questions to retrieve branch-specific questions after claim type is known.
"""

CRAWL_SCENARIOS = [
    {
        "id": "claim_type_auto",
        "text": "I need to file an auto insurance claim.",
        "system_prompt": SYSTEM_PROMPT,
        "expected_tool": "get_next_questions",
        "expected_args_subset": {"claim_type": "auto"},
        "grading": {"transcript_contains": ["auto", "claim"]},
    },
    {
        "id": "incident_date_valid",
        "text": "The accident happened on March 15, 2024.",
        "system_prompt": (
            "You are validating insurance claim answers. "
            "Call validate_answer with question_id='incident_date' and the user's answer."
        ),
        "expected_tool": "validate_answer",
        "expected_args_subset": {"question_id": "incident_date"},
    },
    {
        "id": "policy_number",
        "text": "My policy number is POL12345678.",
        "system_prompt": (
            "You are collecting insurance policy numbers. "
            "Call validate_answer with question_id='policy_number' and the user's answer."
        ),
        "expected_tool": "validate_answer",
        "expected_args_subset": {"question_id": "policy_number"},
    },
    {
        "id": "vague_date_rejected",
        "text": "It happened a few days ago.",
        "system_prompt": (
            "You are validating insurance dates. "
            "Call validate_answer with question_id='incident_date' and the user's answer. "
            "Then respond based on the validation result."
        ),
        "expected_tool": "validate_answer",
        "expected_args_subset": {"question_id": "incident_date"},
    },
]


@pytest.fixture(scope="module")
def question_service_ready():
    """Verify Question Service is running before tests."""
    try:
        resp = httpx.get("http://localhost:8001/health", timeout=5)
        if resp.status_code != 200:
            pytest.skip("Question Service unhealthy")
    except (httpx.ConnectError, httpx.TimeoutException):
        pytest.skip("Question Service not running on localhost:8001")


@pytest.mark.crawl_harness
@pytest.mark.asyncio
@pytest.mark.parametrize(
    "scenario",
    CRAWL_SCENARIOS,
    ids=[s["id"] for s in CRAWL_SCENARIOS],
)
async def test_crawl_scenario(scenario, question_service_ready):
    """Run a crawl-tier scenario: TTS → Voice API → grade."""
    result = await run_crawl_scenario(scenario)

    # Log detailed results for debugging
    logger.info("Scenario %s: overall=%s", result.scenario_id, result.overall_passed)
    if result.session_result:
        logger.info("  Tool calls: %s", result.session_result.tool_calls)
        logger.info("  Transcript: %s", "".join(result.session_result.transcript_parts)[:300])
        logger.info("  Latency: %.0fms", result.session_result.latency_ms)
    if result.tool_call_grade:
        logger.info("  Tool grade: %s - %s", result.tool_call_grade.passed, result.tool_call_grade.reasoning)
    if result.instruction_grade:
        logger.info("  Instruction grade: %s - %s", result.instruction_grade.passed, result.instruction_grade.reasoning)
    if result.error:
        logger.error("  Error: %s", result.error)

    # Assertions
    assert result.error == "", f"Scenario {result.scenario_id} errored: {result.error}"

    # Tool call assertions (non-deterministic, so we log but soft-assert)
    if result.tool_call_grade:
        if not result.tool_call_grade.passed:
            logger.warning(
                "  [SOFT FAIL] Tool call grade failed for %s: %s",
                result.scenario_id,
                result.tool_call_grade.reasoning,
            )
        # Hard assert on tool name when tool was called
        if result.session_result and result.session_result.tool_calls:
            expected_tool = scenario.get("expected_tool")
            actual_tools = [c["name"] for c in result.session_result.tool_calls]
            assert expected_tool in actual_tools, (
                f"Expected tool '{expected_tool}' not in actual calls: {actual_tools}"
            )

    # Transcript keyword check (soft - LLM responses vary)
    if result.transcript_grade and not result.transcript_grade.passed:
        logger.warning(
            "  [SOFT FAIL] Transcript keywords missing for %s: %s",
            result.scenario_id,
            result.transcript_grade.reasoning,
        )

    # Instruction following must pass when we have a transcript
    if result.instruction_grade and result.session_result and result.session_result.transcript_parts:
        assert result.instruction_grade.passed, (
            f"Instruction following failed for {result.scenario_id}: {result.instruction_grade.reasoning}"
        )
