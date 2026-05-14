"""Graders for evaluating Voice Live API responses."""

import json
import logging
import os
from dataclasses import dataclass, field

from azure.identity import AzureCliCredential, get_bearer_token_provider
from openai import AsyncAzureOpenAI

logger = logging.getLogger(__name__)

ENDPOINT = os.environ.get("AZURE_VOICE_ENDPOINT", "")
GRADER_DEPLOYMENT = os.environ.get("AZURE_OPENAI_TEXT_DEPLOYMENT", "gpt-4.1")


@dataclass
class CriterionResult:
    """Result for a single grading criterion."""

    criterion: str
    passed: bool
    reasoning: str = ""


@dataclass
class GradeResult:
    """Aggregated grading result."""

    passed: bool
    criteria_results: list[CriterionResult] = field(default_factory=list)
    reasoning: str = ""


def grade_tool_call(
    expected_tool: str,
    expected_args: dict,
    actual_calls: list[dict],
) -> GradeResult:
    """Grade whether expected tool was called with expected arguments.

    Args:
        expected_tool: Expected tool name.
        expected_args: Expected argument subset (values must match).
        actual_calls: List of actual tool call dicts with 'name' and 'parsed_arguments'.
    """
    criteria = []

    # Check if tool was called at all
    matching_calls = [c for c in actual_calls if c.get("name") == expected_tool]
    tool_called = len(matching_calls) > 0
    criteria.append(CriterionResult(
        criterion=f"Tool '{expected_tool}' was called",
        passed=tool_called,
        reasoning=(
            f"Found {len(matching_calls)} call(s)"
            if tool_called
            else f"Tool not called. Actual calls: {[c.get('name') for c in actual_calls]}"
        ),
    ))

    # Check arguments match (subset check)
    args_match = False
    args_reasoning = "Tool was not called"
    if matching_calls:
        actual_args = matching_calls[0].get("parsed_arguments", {})
        mismatches = []
        for key, expected_val in expected_args.items():
            actual_val = actual_args.get(key)
            if actual_val != expected_val:
                mismatches.append(f"{key}: expected={expected_val!r}, got={actual_val!r}")
        args_match = len(mismatches) == 0
        args_reasoning = "All arguments match" if args_match else f"Mismatches: {'; '.join(mismatches)}"

    criteria.append(CriterionResult(
        criterion="Tool arguments match expected subset",
        passed=args_match,
        reasoning=args_reasoning,
    ))

    overall = tool_called and args_match
    return GradeResult(
        passed=overall,
        criteria_results=criteria,
        reasoning=f"Tool call grade: {'PASS' if overall else 'FAIL'}",
    )


def grade_transcript_contains(
    transcript: str,
    must_contain: list[str],
) -> GradeResult:
    """Grade whether transcript contains required keywords (case-insensitive).

    Args:
        transcript: The agent's response transcript.
        must_contain: Keywords that must appear in the transcript.
    """
    transcript_lower = transcript.lower()
    criteria = []

    for keyword in must_contain:
        found = keyword.lower() in transcript_lower
        criteria.append(CriterionResult(
            criterion=f"Transcript contains '{keyword}'",
            passed=found,
            reasoning=f"{'Found' if found else 'Not found'} in transcript",
        ))

    passed_count = sum(c.passed for c in criteria)
    overall = all(c.passed for c in criteria)
    return GradeResult(
        passed=overall,
        criteria_results=criteria,
        reasoning=f"Transcript keywords: {'PASS' if overall else 'FAIL'} ({passed_count}/{len(criteria)})",
    )


async def grade_instruction_following(
    system_prompt: str,
    agent_response: str,
    criteria: list[str] | None = None,
) -> GradeResult:
    """Grade agent response for instruction following using Azure OpenAI.

    Uses gpt-4.1 deployment to evaluate:
    - One-question-at-a-time behavior
    - Conciseness
    - No hallucinated data
    - Professional tone

    Args:
        system_prompt: The system instructions given to the agent.
        agent_response: The agent's textual response.
        criteria: Custom criteria list. Defaults to standard rubric.
    """
    if not agent_response.strip():
        return GradeResult(
            passed=True,
            criteria_results=[],
            reasoning="No transcript to grade (audio-only response or empty)",
        )

    if criteria is None:
        criteria = [
            "one_question_at_a_time: The agent asks at most one question per turn",
            "conciseness: The response is concise (1-3 sentences for voice)",
            "no_hallucination: The agent does not invent or assume data not provided by the user or tools",
            "professional_tone: The agent maintains a professional, friendly tone",
        ]

    grading_prompt = f"""You are an eval grader for a voice-based insurance claims agent.

System prompt given to agent:
---
{system_prompt}
---

Agent response to evaluate:
---
{agent_response}
---

Grade the agent's response on each criterion below. For each, respond with PASS or FAIL and a brief reason.

Criteria:
{chr(10).join(f'- {c}' for c in criteria)}

Respond in JSON format:
{{
  "results": [
    {{"criterion": "<criterion_name>", "passed": true/false, "reasoning": "<brief reason>"}}
  ],
  "overall_passed": true/false,
  "overall_reasoning": "<summary>"
}}
"""

    credential = AzureCliCredential()
    token_provider = get_bearer_token_provider(credential, "https://cognitiveservices.azure.com/.default")
    client = AsyncAzureOpenAI(
        azure_endpoint=ENDPOINT,
        azure_ad_token_provider=token_provider,
        api_version="2025-04-01-preview",
    )

    try:
        response = await client.chat.completions.create(
            model=GRADER_DEPLOYMENT,
            messages=[{"role": "user", "content": grading_prompt}],
            temperature=0,
            response_format={"type": "json_object"},
        )

        content = response.choices[0].message.content or "{}"
        parsed = json.loads(content)

        criterion_results = []
        for r in parsed.get("results", []):
            criterion_results.append(CriterionResult(
                criterion=r.get("criterion", ""),
                passed=r.get("passed", False),
                reasoning=r.get("reasoning", ""),
            ))

        return GradeResult(
            passed=parsed.get("overall_passed", False),
            criteria_results=criterion_results,
            reasoning=parsed.get("overall_reasoning", ""),
        )
    except Exception as e:
        logger.error("LLM grader failed: %s", e)
        return GradeResult(
            passed=False,
            criteria_results=[],
            reasoning=f"LLM grader error: {e}",
        )
    finally:
        await client.close()
