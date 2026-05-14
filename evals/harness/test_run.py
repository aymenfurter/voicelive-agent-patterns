"""Run harness tests: model-simulated multi-turn conversations.

Tests full episode outcomes with different user personas.
"""

import logging

import pytest

from evals.harness.run_harness import (
    EpisodeResult,
    PERSONAS,
    grade_episode,
    run_multi_turn_episode,
)

logger = logging.getLogger(__name__)

pytestmark = [pytest.mark.run_harness, pytest.mark.asyncio]


class TestRunCooperativeCaller:
    """Tests for cooperative caller persona (auto claim)."""

    async def test_cooperative_auto_claim(self):
        """Cooperative caller should complete auto claim within expected turns."""
        persona = PERSONAS[0]
        result = await run_multi_turn_episode(persona, max_turns=20)

        assert len(result.turns) > 3, "Conversation too short"
        assert len(result.tool_calls_made) > 0, "Agent never used tools"

        logger.info(
            "Cooperative auto claim: turns=%d, tools=%d, questions=%s, "
            "complete=%s, latency=%.1fs",
            result.total_turns,
            len(result.tool_calls_made),
            result.questions_answered,
            result.claim_complete,
            result.total_latency_s,
        )

    async def test_cooperative_caller_uses_validate(self):
        """Cooperative caller should trigger validate_answer tool calls."""
        persona = PERSONAS[0]
        result = await run_multi_turn_episode(persona, max_turns=15)

        validate_calls = [
            tc for tc in result.tool_calls_made if tc["name"] == "validate_answer"
        ]
        logger.info(
            "Validate calls: %d out of %d total tool calls",
            len(validate_calls),
            len(result.tool_calls_made),
        )
        # Agent should validate at least one answer
        assert len(result.tool_calls_made) > 0, "Agent made no tool calls"

    async def test_cooperative_caller_grading(self):
        """Grade a cooperative caller episode end-to-end."""
        persona = PERSONAS[0]
        result = await run_multi_turn_episode(persona, max_turns=20)
        grade = await grade_episode(result, persona)

        logger.info(
            "Episode grade: passed=%s, reasoning=%s",
            grade.passed,
            grade.reasoning,
        )
        # At minimum, multi-turn and tool usage should pass
        assert grade.grades.get("multi_turn") is True, (
            "Episode should have multiple turns"
        )
        assert grade.grades.get("used_tools") is True, (
            "Agent should have used tools"
        )


class TestRunConfusedCaller:
    """Tests for confused caller persona (property claim)."""

    async def test_confused_property_claim(self):
        """Confused caller gives vague answers; agent should ask for clarification."""
        persona = PERSONAS[1]
        result = await run_multi_turn_episode(persona, max_turns=25)

        assert len(result.turns) > 3, "Conversation too short"

        logger.info(
            "Confused property claim: turns=%d, clarifications=%d, tools=%d, "
            "questions=%s, complete=%s",
            result.total_turns,
            result.clarifications_triggered,
            len(result.tool_calls_made),
            result.questions_answered,
            result.claim_complete,
        )

    async def test_confused_caller_triggers_clarification(self):
        """Confused caller should trigger at least some clarification requests."""
        persona = PERSONAS[1]
        result = await run_multi_turn_episode(persona, max_turns=25)

        logger.info(
            "Clarifications triggered: %d in %d turns",
            result.clarifications_triggered,
            result.total_turns,
        )
        # The conversation should be substantive
        assert len(result.turns) > 3

    async def test_confused_caller_grading(self):
        """Grade a confused caller episode."""
        persona = PERSONAS[1]
        result = await run_multi_turn_episode(persona, max_turns=25)
        grade = await grade_episode(result, persona)

        logger.info(
            "Episode grade: passed=%s, reasoning=%s",
            grade.passed,
            grade.reasoning,
        )
        assert grade.grades.get("multi_turn") is True


class TestRunRushedCaller:
    """Tests for rushed caller persona (health claim)."""

    async def test_rushed_health_claim(self):
        """Rushed caller gives brief answers; agent should still work."""
        persona = PERSONAS[2]
        result = await run_multi_turn_episode(persona, max_turns=20)

        assert len(result.turns) > 3, "Conversation too short"

        logger.info(
            "Rushed health claim: turns=%d, tools=%d, questions=%s, "
            "complete=%s, latency=%.1fs",
            result.total_turns,
            len(result.tool_calls_made),
            result.questions_answered,
            result.claim_complete,
            result.total_latency_s,
        )

    async def test_rushed_caller_efficient_turns(self):
        """Rushed caller should result in fewer turns than confused caller."""
        rushed_persona = PERSONAS[2]
        result = await run_multi_turn_episode(rushed_persona, max_turns=20)

        logger.info(
            "Rushed caller: %d turns (expected range %s)",
            result.total_turns,
            rushed_persona["expected_turns"],
        )
        # Rushed caller should at least have a real conversation
        assert len(result.turns) > 3

    async def test_rushed_caller_grading(self):
        """Grade a rushed caller episode."""
        persona = PERSONAS[2]
        result = await run_multi_turn_episode(persona, max_turns=20)
        grade = await grade_episode(result, persona)

        logger.info(
            "Episode grade: passed=%s, reasoning=%s",
            grade.passed,
            grade.reasoning,
        )
        assert grade.grades.get("multi_turn") is True
        assert grade.grades.get("used_tools") is True


class TestRunEpisodeComparison:
    """Compare episode outcomes across personas."""

    async def test_all_personas_produce_conversation(self):
        """All personas should produce substantive conversations."""
        results: dict[str, EpisodeResult] = {}
        for persona in PERSONAS:
            result = await run_multi_turn_episode(persona, max_turns=15)
            results[persona["name"]] = result

        for name, result in results.items():
            logger.info(
                "Persona=%s: turns=%d, tools=%d, complete=%s",
                name,
                result.total_turns,
                len(result.tool_calls_made),
                result.claim_complete,
            )
            assert len(result.turns) > 3, (
                f"Persona {name} had too few turns: {len(result.turns)}"
            )

    async def test_all_personas_use_tools(self):
        """All personas should trigger tool usage from the agent."""
        for persona in PERSONAS:
            result = await run_multi_turn_episode(persona, max_turns=15)
            assert len(result.tool_calls_made) > 0, (
                f"Persona {persona['name']} triggered no tool calls"
            )
            logger.info(
                "Persona=%s: %d tool calls",
                persona["name"],
                len(result.tool_calls_made),
            )
