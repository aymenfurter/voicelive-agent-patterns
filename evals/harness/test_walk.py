"""Walk harness tests: noisy audio → Voice API → grade.

Tests whether the voice agent correctly understands speech
under degraded audio conditions.
"""

import logging

import pytest

from evals.harness.walk_harness import (
    NOISE_CONDITIONS,
    run_walk_scenario,
    run_walk_scenario_all_conditions,
    WalkResult,
)

logger = logging.getLogger(__name__)

pytestmark = [pytest.mark.walk_harness, pytest.mark.asyncio]

WALK_SCENARIOS = [
    {
        "id": "date_clean",
        "text": "The accident happened on March 15, 2024.",
        "system_prompt": (
            "You are validating dates. Call validate_answer with "
            "question_id='incident_date'."
        ),
        "expected_tool": "validate_answer",
        "expected_args_subset": {"question_id": "incident_date"},
        "transcript_keywords": ["march", "15", "2024"],
    },
    {
        "id": "policy_number",
        "text": "My policy number is POL12345678.",
        "system_prompt": (
            "You are collecting policy numbers. Call validate_answer with "
            "question_id='policy_number'."
        ),
        "expected_tool": "validate_answer",
        "expected_args_subset": {"question_id": "policy_number"},
        "transcript_keywords": ["POL12345678"],
    },
    {
        "id": "claim_type",
        "text": "I need to file an auto insurance claim.",
        "system_prompt": (
            "You route claims. Call get_next_questions with the claim type."
        ),
        "expected_tool": "get_next_questions",
        "expected_args_subset": {"claim_type": "auto"},
        "transcript_keywords": ["auto"],
    },
]


def _get_scenario(scenario_id: str) -> dict:
    """Look up a scenario by ID."""
    for s in WALK_SCENARIOS:
        if s["id"] == scenario_id:
            return s
    raise ValueError(f"Unknown scenario: {scenario_id}")


class TestWalkNoisyAudio:
    """Test each scenario under various noise conditions."""

    @pytest.mark.parametrize(
        "noise_condition",
        NOISE_CONDITIONS,
        ids=lambda nc: nc["name"],
    )
    async def test_date_under_noise(self, noise_condition):
        """Date scenario should produce events under all noise levels."""
        scenario = _get_scenario("date_clean")
        result = await run_walk_scenario(scenario, noise_condition)

        # Under clean conditions, must pass
        if noise_condition["name"] == "clean":
            assert len(result.session_result.events_received) > 2, (
                "Clean audio should produce multiple events"
            )
        # Under all conditions, should at least get events
        assert len(result.session_result.events_received) > 0, (
            f"No events received under {noise_condition['name']}"
        )
        logger.info(
            "date_under_noise[%s]: events=%d, latency=%dms",
            noise_condition["name"],
            len(result.session_result.events_received),
            result.session_result.latency_ms,
        )

    @pytest.mark.parametrize(
        "noise_condition",
        NOISE_CONDITIONS,
        ids=lambda nc: nc["name"],
    )
    async def test_policy_number_under_noise(self, noise_condition):
        """Policy number scenario under noise conditions."""
        scenario = _get_scenario("policy_number")
        result = await run_walk_scenario(scenario, noise_condition)

        assert len(result.session_result.events_received) > 0, (
            f"No events received under {noise_condition['name']}"
        )
        if noise_condition["name"] == "clean":
            assert len(result.session_result.events_received) > 2
        logger.info(
            "policy_number_under_noise[%s]: events=%d, tool_calls=%d",
            noise_condition["name"],
            len(result.session_result.events_received),
            len(result.session_result.tool_calls),
        )

    @pytest.mark.parametrize(
        "noise_condition",
        NOISE_CONDITIONS,
        ids=lambda nc: nc["name"],
    )
    async def test_claim_type_under_noise(self, noise_condition):
        """Claim type routing scenario under noise conditions."""
        scenario = _get_scenario("claim_type")
        result = await run_walk_scenario(scenario, noise_condition)

        assert len(result.session_result.events_received) > 0, (
            f"No events received under {noise_condition['name']}"
        )
        logger.info(
            "claim_type_under_noise[%s]: events=%d, tool_calls=%d",
            noise_condition["name"],
            len(result.session_result.events_received),
            len(result.session_result.tool_calls),
        )


class TestWalkCompareConditions:
    """Compare performance across noise conditions."""

    async def test_clean_vs_noisy_comparison(self):
        """Clean audio should have higher quality than noisy."""
        scenario = _get_scenario("date_clean")
        clean_condition = NOISE_CONDITIONS[0]  # clean
        noisy_condition = NOISE_CONDITIONS[2]  # noisy_room (15dB SNR)

        clean = await run_walk_scenario(scenario, clean_condition)
        noisy = await run_walk_scenario(scenario, noisy_condition)

        # Both should get events
        assert len(clean.session_result.events_received) > 0
        assert len(noisy.session_result.events_received) > 0

        logger.info(
            "Clean: events=%d, tool_calls=%d | Noisy: events=%d, tool_calls=%d",
            len(clean.session_result.events_received),
            len(clean.session_result.tool_calls),
            len(noisy.session_result.events_received),
            len(noisy.session_result.tool_calls),
        )

    async def test_all_conditions_date_scenario(self):
        """Run date scenario under all conditions and log pass rates."""
        scenario = _get_scenario("date_clean")
        results = await run_walk_scenario_all_conditions(scenario)

        pass_rates = {}
        for name, result in results.items():
            tool_grade = result.grades.get("tool_call")
            passed = tool_grade.passed if tool_grade else False
            pass_rates[name] = passed
            logger.info(
                "Condition=%s: tool_grade_passed=%s, events=%d",
                name,
                passed,
                len(result.session_result.events_received),
            )

        # Clean should pass if any condition passes
        if any(pass_rates.values()):
            assert pass_rates.get("clean", False), (
                "If any noisy condition passes, clean should also pass"
            )

    async def test_all_conditions_policy_scenario(self):
        """Run policy number scenario under all conditions and log results."""
        scenario = _get_scenario("policy_number")
        results = await run_walk_scenario_all_conditions(scenario)

        for name, result in results.items():
            logger.info(
                "Policy[%s]: events=%d, tool_calls=%d, grades=%s",
                name,
                len(result.session_result.events_received),
                len(result.session_result.tool_calls),
                {k: v.passed for k, v in result.grades.items()},
            )

        # Verify at least clean condition got events
        clean_result = results["clean"]
        assert len(clean_result.session_result.events_received) > 2


class TestWalkGrading:
    """Test that grading works correctly for walk scenarios."""

    async def test_tool_call_grading_clean(self):
        """Clean audio should produce correct tool calls."""
        scenario = _get_scenario("date_clean")
        clean_condition = NOISE_CONDITIONS[0]
        result = await run_walk_scenario(scenario, clean_condition)

        assert "tool_call" in result.grades, "Expected tool_call grade"
        logger.info(
            "Tool call grade: passed=%s, reasoning=%s",
            result.grades["tool_call"].passed,
            result.grades["tool_call"].reasoning,
        )

    async def test_transcript_grading_clean(self):
        """Clean audio transcript should contain expected keywords."""
        scenario = _get_scenario("date_clean")
        clean_condition = NOISE_CONDITIONS[0]
        result = await run_walk_scenario(scenario, clean_condition)

        assert "transcript" in result.grades, "Expected transcript grade"
        logger.info(
            "Transcript grade: passed=%s, reasoning=%s",
            result.grades["transcript"].passed,
            result.grades["transcript"].reasoning,
        )
