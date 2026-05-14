"""Chat-Supervisor orchestration pattern.

The realtime voice model handles conversational flow while deferring business
logic decisions to a text-based supervisor model (gpt-4.1).
"""

from __future__ import annotations

import json
import logging
import uuid
from typing import Any

import question_client
from outbound_event import OutboundEvent
from patterns.base import OrchestrationPattern
from patterns.models import ClaimSession, SupervisorResult
from patterns.registry import register_pattern
from patterns.tool_definitions import (
    make_get_next_questions_tool,
    make_submit_claim_tool,
    make_validate_answer_tool,
)
from supervisor_client import AzureOpenAISupervisorClient, SupervisorClient, SupervisorExchange

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """\
You are a friendly, professional insurance claims intake agent named Aria. Your role \
is to guide callers through the insurance claims process using a warm, conversational tone.

## Conversation Flow

1. **Greeting**: Welcome the caller and ask how you can help today.
2. **Claim Type Identification**: Determine what type of claim they need to file \
(auto, property, or health). Ask clarifying questions if unclear.
3. **Information Gathering**: Ask questions ONE AT A TIME. Wait for each answer before \
proceeding. Never overwhelm the caller with multiple questions at once.
4. **Validation**: After each answer, use validate_answer to confirm the information \
is complete and well-formed. If not, politely ask for clarification.
5. **Completeness Check**: Periodically call get_next_questions to check what \
information is still needed.
6. **Submission**: Once all required data is gathered, call submit_claim_data to \
finalize the claim. Confirm the submission with the caller.

## Behavioral Guidelines

- Speak naturally and conversationally—avoid sounding robotic or reading from a script.
- Show empathy: acknowledge that filing a claim can be stressful.
- If the caller seems confused, offer simple explanations.
- If the caller provides multiple pieces of information at once, acknowledge all of them \
but verify each one.
- Keep responses concise (1-3 sentences typically) since this is a voice conversation.
- Use transitional phrases like "Great, thank you" or "Got it" between questions.
- If there's an error or the system can't process something, apologize and try again.

## Tool Usage

- Call `get_next_questions` to retrieve the next set of questions for the claim type.
- Call `validate_answer` when the caller provides an answer, to check correctness. \
Pass the caller's answer exactly as spoken — do NOT ask the caller to reformat dates, \
numbers, or other details. The validation service handles all formats (e.g. "1.1.1999", \
"January 1, 1999", "01/01/1999" are all valid).
- Call `submit_claim_data` when all required information has been collected.

Never fabricate claim numbers or policy details. Always use the tools for business logic.\
"""

TOOLS = [
    make_get_next_questions_tool(),
    make_validate_answer_tool(example_id="incident_date"),
    make_submit_claim_tool(),
]

_SUPERVISOR_SYSTEM = (
    "You are a supervisor AI for an insurance claims intake system. "
    "You make business logic decisions and return structured JSON responses. "
    "Always respond with valid JSON only, no markdown formatting."
)


@register_pattern("chat-supervisor")
class ChatSupervisorPattern(OrchestrationPattern):
    """Pattern where realtime voice defers business logic to a text supervisor."""

    def __init__(self, supervisor: SupervisorClient | None = None) -> None:
        super().__init__()
        self._supervisor: SupervisorClient = supervisor or AzureOpenAISupervisorClient()
        self._session = ClaimSession()
        self._tool_context: str | None = None
        self.register_tool("get_next_questions", self._handle_get_next_questions)
        self.register_tool("validate_answer", self._handle_validate_answer)
        self.register_tool("submit_claim_data", self._handle_submit_claim_data)

    async def handle_tool_call(self, tool_name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        self._tool_context = tool_name
        try:
            return await super().handle_tool_call(tool_name, arguments)
        finally:
            self._tool_context = None

    def get_session_config(self) -> dict[str, Any]:
        return {
            "system_prompt": self.get_system_prompt(),
            "tools": self.get_tools(),
            "modality": "audio",
        }

    def get_system_prompt(self) -> str:
        return SYSTEM_PROMPT

    def get_tools(self) -> list[dict[str, Any]]:
        return TOOLS

    async def on_event(self, event_type: str, event_data: dict[str, Any]) -> None:
        if event_type == "session.created":
            logger.info("Chat-Supervisor session established")

    async def _handle_get_next_questions(self, arguments: dict[str, Any]) -> dict[str, Any]:
        claim_type = arguments.get("claim_type", "auto")
        self._session.claim_type = claim_type

        questions = await question_client.get_questions_by_category(claim_type)
        if not questions:
            return await self._consult_dict(
                f"Generate the next intake question for a {claim_type} insurance claim. "
                f"Already collected: {json.dumps(self._session.collected_data)}. "
                "Return a JSON object with fields: question_id, question_text, required (bool)."
            )

        unanswered = self._session.unanswered(questions)
        return {"questions": unanswered[:3], "total_remaining": len(unanswered)}

    async def _handle_validate_answer(self, arguments: dict[str, Any]) -> dict[str, Any]:
        question_id = arguments.get("question_id", "")
        answer = arguments.get("answer", "")

        result = await question_client.validate_answer(question_id, answer)
        if result.get("valid"):
            self._session.record_answer(question_id, answer)
            return {"valid": True, "message": "Answer accepted."}

        supervisor = await self._consult(
            f"Validate this answer for an insurance claim intake question.\n"
            f"Question ID: {question_id}\n"
            f"Answer: {answer}\n"
            f"Service validation result: {json.dumps(result)}\n\n"
            "Determine if the answer is acceptable or needs clarification. "
            'Return JSON: {"valid": bool, "message": str, "suggestion": str|null}'
        )
        response = supervisor.to_dict()
        if response.get("valid"):
            self._session.record_answer(question_id, answer)
        return response

    async def _handle_submit_claim_data(self, arguments: dict[str, Any]) -> dict[str, Any]:
        claim_type = arguments.get("claim_type", self._session.claim_type or "auto")
        collected_data = arguments.get("collected_data", self._session.collected_data)

        completeness = await self._consult(
            f"Review this {claim_type} insurance claim data for completeness:\n"
            f"{json.dumps(collected_data, indent=2)}\n\n"
            "The ONLY required fields for an auto claim are: incident date, location, "
            "vehicle info, and incident description. Other parties, police report, and "
            "injuries are optional. A claim number is NEVER required from the caller — "
            "it is generated by the system after submission.\n\n"
            "Determine if all required fields are present. Return JSON:\n"
            '{"complete": bool, "missing_fields": list[str]}'
        )
        response = completeness.to_dict()
        if response.get("complete", False):
            claim_number = f"CLM-{uuid.uuid4().hex[:8].upper()}"
            return {
                "status": "submitted",
                "claim_number": claim_number,
                "message": f"Claim {claim_number} submitted successfully.",
            }
        return {
            "status": "incomplete",
            "missing_fields": response.get("missing_fields", []),
            "message": "Some required information is still missing.",
        }

    async def _consult(self, prompt: str) -> SupervisorResult:
        result, exchange = await self._supervisor.complete_json(_SUPERVISOR_SYSTEM, prompt)
        if exchange is not None:
            self._emit_supervisor_exchange(exchange, self._tool_context)
        return result

    async def _consult_dict(self, prompt: str) -> dict[str, Any]:
        return (await self._consult(prompt)).to_dict()

    def _emit_supervisor_exchange(
        self, exchange: SupervisorExchange, tool_context: str | None
    ) -> None:
        self.emit(OutboundEvent(type="supervisor.exchange", data={
            "model": exchange.model,
            "prompt_preview": exchange.prompt[:300],
            "response": exchange.response,
            "usage": exchange.usage,
            "tool_context": tool_context,
        }))
