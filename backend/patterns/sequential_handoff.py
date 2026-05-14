"""Sequential Handoff orchestration pattern.

Defines multiple specialized agents that hand off to each other based on
the conversation context. Each agent has its own instructions and tools.
"""

import logging
from dataclasses import dataclass, field
from typing import Any

import question_client
from patterns.base import OrchestrationPattern
from patterns.models import ClaimSession
from patterns.registry import register_pattern
from patterns.tool_definitions import make_get_next_questions_tool, make_submit_claim_tool, make_validate_answer_tool

logger = logging.getLogger(__name__)


@dataclass
class AgentConfig:
    """Configuration for a single agent in the handoff chain."""

    name: str
    instructions: str
    tools: list[dict[str, Any]] = field(default_factory=list)
    handoffs: list[str] = field(default_factory=list)


# --- Agent Definitions ---

GREETER_AGENT = AgentConfig(
    name="greeter",
    instructions="""\
You are the Greeter Agent for SecureLife Insurance. Your ONLY job is to:

1. Welcome the caller warmly and introduce yourself.
2. Ask how you can help them today.
3. Once you understand they need to file a claim or have questions, hand off to the \
appropriate agent.

Keep your greeting brief (2-3 sentences max). Example:
"Hello! Welcome to SecureLife Insurance. I'm here to help you today. \
Are you looking to file a claim, or do you have questions about your policy?"

IMPORTANT: You do NOT handle claims or answer policy questions yourself. \
Transfer immediately once you understand the caller's intent.\
""",
    tools=[],
    handoffs=["transfer_to_top_level_qa"],
)

TOP_LEVEL_QA_AGENT = AgentConfig(
    name="top_level_qa",
    instructions="""\
You are the Top-Level Q&A Agent. Your job is to determine what type of claim the \
caller needs and route them to the correct specialist.

## Your Responsibilities
1. Ask the caller what type of claim they need to file.
2. Clarify if their description is ambiguous (e.g., "my car hit my garage" could be \
auto OR property).
3. Once the claim type is clear, hand off to the appropriate specialist agent.

## Claim Types
- **Auto Claims**: Vehicle accidents, theft, vandalism, windshield damage, collision
- **Property Claims**: Home damage, fire, flooding, theft from residence, storm damage
- **Health Claims**: Medical bills, hospital stays, prescriptions, procedures

## Guidelines
- Ask ONE clarifying question at most before routing.
- If the caller mentions multiple claim types, handle the first one and mention you'll \
help with the others after.
- Be conversational and brief—this is a voice call.\
""",
    tools=[],
    handoffs=[
        "transfer_to_auto_claims",
        "transfer_to_property_claims",
        "transfer_to_health_claims",
    ],
)

AUTO_CLAIMS_AGENT = AgentConfig(
    name="auto_claims",
    instructions="""\
You are the Auto Claims Specialist Agent. You handle all vehicle-related insurance claims.

## Required Information to Collect (ask ONE at a time)
1. **Date of incident** — When did the accident/incident occur?
2. **Location** — Where did it happen? (city, state, intersection if applicable)
3. **Vehicle information** — Year, make, model of the insured vehicle
4. **Description of incident** — Brief description of what happened
5. **Other parties involved** — Were other vehicles/people involved? Get their info if so.
6. **Police report** — Was a police report filed? If yes, get the report number.
7. **Injuries** — Were there any injuries?
8. **Photos/documentation** — Does the caller have photos or documentation?

## Guidelines
- Ask questions ONE AT A TIME. Wait for each answer before moving on.
- Show empathy—auto accidents are stressful.
- If the caller provides multiple pieces of info at once, acknowledge them all.
- Use validate_answer to confirm each piece of information. Pass the caller's answer \
exactly as spoken — never ask the caller to reformat dates, numbers, or other details. Pass the caller's answer \
exactly as spoken — never ask the caller to reformat dates, numbers, or other details.
- Once all required fields are collected, transfer to the Summary Agent.
- If the caller has questions outside your scope, transfer back to Top-Level Q&A.\
""",
    tools=[
        make_get_next_questions_tool("auto"),
        make_validate_answer_tool("auto_vehicle_info"),
    ],
    handoffs=["transfer_to_summary", "transfer_to_top_level_qa"],
)

PROPERTY_CLAIMS_AGENT = AgentConfig(
    name="property_claims",
    instructions="""\
You are the Property Claims Specialist Agent. You handle home and property damage claims.

## Required Information to Collect (ask ONE at a time)
1. **Date of incident** — When did the damage occur or when was it discovered?
2. **Property address** — Full address of the damaged property
3. **Type of damage** — What caused the damage? (fire, water, storm, theft, etc.)
4. **Description** — Detailed description of the damage
5. **Affected areas** — Which parts of the property are affected? (roof, basement, etc.)
6. **Temporary repairs** — Has the caller made any temporary repairs to prevent further damage?
7. **Estimated value** — Rough estimate of the damage cost if known
8. **Documentation** — Does the caller have photos, receipts, or contractor estimates?

## Guidelines
- Ask questions ONE AT A TIME.
- For water/storm damage, ask if the damage is ongoing or contained.
- Remind callers to take photos before cleaning up if they haven't already.
- Use validate_answer to confirm each piece of information.
- Once all required fields are collected, transfer to the Summary Agent.\
""",
    tools=[
        make_get_next_questions_tool("property"),
        make_validate_answer_tool("property_address"),
    ],
    handoffs=["transfer_to_summary", "transfer_to_top_level_qa"],
)

HEALTH_CLAIMS_AGENT = AgentConfig(
    name="health_claims",
    instructions="""\
You are the Health Claims Specialist Agent. You handle medical and health insurance claims.

## Required Information to Collect (ask ONE at a time)
1. **Date of service** — When did the medical service occur?
2. **Provider information** — Name of doctor, hospital, or clinic
3. **Type of service** — What type of care was received? (ER visit, surgery, checkup, etc.)
4. **Diagnosis** — What condition was treated? (caller's description is fine)
5. **Treatment received** — What procedures or treatments were performed?
6. **Bills received** — Has the caller received bills? What is the total amount?
7. **Other insurance** — Is there any other insurance that may cover this?
8. **Pre-authorization** — Was pre-authorization obtained if required?

## Guidelines
- Be especially empathetic—health issues are personal and stressful.
- Don't ask for overly specific medical details; the caller's general description is fine.
- Ask questions ONE AT A TIME.
- Use validate_answer to confirm each piece of information. Pass the caller's answer \
exactly as spoken — never ask the caller to reformat dates, numbers, or other details.
- Once all required fields are collected, transfer to the Summary Agent.
- Remind callers that they may need to submit itemized bills later.\
""",
    tools=[
        make_get_next_questions_tool("health"),
        make_validate_answer_tool("health_provider_name"),
    ],
    handoffs=["transfer_to_summary", "transfer_to_top_level_qa"],
)

SUMMARY_AGENT = AgentConfig(
    name="summary",
    instructions="""\
You are the Summary Agent. Your job is to review collected claim data and finalize submission.

## Your Responsibilities
1. Read back a summary of all collected information to the caller.
2. Ask the caller to confirm everything is correct.
3. If corrections are needed, transfer back to the appropriate specialist.
4. Once confirmed, submit the claim using submit_claim_data.
5. Provide the caller with their claim number and next steps.

## Next Steps to Communicate
- An adjuster will be assigned within 24-48 hours.
- The caller will receive an email confirmation.
- They should keep any documentation/photos for the adjuster.
- They can call back with their claim number for status updates.

## Guidelines
- Read the summary clearly and concisely.
- If the caller wants to change something, transfer to the correct specialist agent.
- Be positive and reassuring—the hard part is done!\
""",
    tools=[
        make_submit_claim_tool(),
    ],
    handoffs=[
        "transfer_to_auto_claims",
        "transfer_to_property_claims",
        "transfer_to_health_claims",
    ],
)

AGENTS: dict[str, AgentConfig] = {
    "greeter": GREETER_AGENT,
    "top_level_qa": TOP_LEVEL_QA_AGENT,
    "auto_claims": AUTO_CLAIMS_AGENT,
    "property_claims": PROPERTY_CLAIMS_AGENT,
    "health_claims": HEALTH_CLAIMS_AGENT,
    "summary": SUMMARY_AGENT,
}


def _build_handoff_tools(agent: AgentConfig) -> list[dict[str, Any]]:
    """Build transfer tool definitions from agent handoff list."""
    handoff_tools: list[dict[str, Any]] = []
    for handoff in agent.handoffs:
        target_name = handoff.replace("transfer_to_", "").replace("_", " ").title()
        handoff_tools.append({
            "type": "function",
            "name": handoff,
            "description": f"Transfer the conversation to the {target_name} agent.",
            "parameters": {
                "type": "object",
                "properties": {
                    "reason": {
                        "type": "string",
                        "description": "Brief reason for the transfer.",
                    },
                },
                "required": ["reason"],
            },
        })
    return handoff_tools


@register_pattern("sequential-handoff")
class SequentialHandoffPattern(OrchestrationPattern):
    """Pattern with multiple specialized agents that hand off to each other."""

    def __init__(self) -> None:
        super().__init__()
        self._current_agent_name: str = "greeter"
        self._session = ClaimSession()
        self.register_tool("get_next_questions", self._handle_get_next_questions)
        self.register_tool("validate_answer", self._handle_validate_answer)
        self.register_tool("submit_claim_data", self._handle_submit_claim_data)

    @property
    def current_agent(self) -> AgentConfig:
        return AGENTS[self._current_agent_name]

    @property
    def current_agent_name(self) -> str:
        return self._current_agent_name

    def get_session_config(self) -> dict[str, Any]:
        return {
            "system_prompt": self.get_system_prompt(),
            "tools": self.get_tools(),
            "voice": "en-US-Aria:DragonHDLatestNeural",
            "modality": "audio",
            "current_agent": self._current_agent_name,
        }

    def get_system_prompt(self) -> str:
        return self.current_agent.instructions

    def get_tools(self) -> list[dict[str, Any]]:
        agent = self.current_agent
        all_tools = list(agent.tools)
        all_tools.extend(_build_handoff_tools(agent))
        return all_tools

    async def handle_tool_call(self, tool_name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        logger.info("Tool call: %s (agent: %s)", tool_name, self._current_agent_name)
        if tool_name.startswith("transfer_to_"):
            return self._handle_transfer(tool_name, arguments)
        return await super().handle_tool_call(tool_name, arguments)

    async def on_event(self, event_type: str, event_data: dict[str, Any]) -> None:
        if event_type == "session.created":
            logger.info("Sequential-Handoff session started with agent: %s", self._current_agent_name)

    def _handle_transfer(self, tool_name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        """Transfer conversation to a different agent."""
        target = tool_name.replace("transfer_to_", "")
        reason = arguments.get("reason", "")

        if target not in AGENTS:
            return {"error": f"Unknown agent: {target}"}

        previous_agent = self._current_agent_name
        self._current_agent_name = target

        logger.info("Handoff: %s -> %s (reason: %s)", previous_agent, target, reason)

        return {
            "status": "transferred",
            "from_agent": previous_agent,
            "to_agent": target,
            "reason": reason,
            "new_instructions": self.get_system_prompt(),
            "new_tools": self.get_tools(),
            "requires_session_update": True,
        }

    async def _handle_get_next_questions(self, arguments: dict[str, Any]) -> dict[str, Any]:
        claim_type = arguments.get("claim_type", "auto")
        self._session.claim_type = claim_type

        questions = await question_client.get_questions_by_category(claim_type)
        if not questions:
            return {"questions": [], "message": "No questions available. Ask general intake questions."}

        unanswered = self._session.unanswered(questions)
        return {"questions": unanswered[:2], "total_remaining": len(unanswered)}

    async def _handle_validate_answer(self, arguments: dict[str, Any]) -> dict[str, Any]:
        question_id = arguments.get("question_id", "")
        answer = arguments.get("answer", "")

        result = await question_client.validate_answer(question_id, answer)
        if result.get("valid", False):
            self._session.record_answer(question_id, answer)
        return result

    async def _handle_submit_claim_data(self, arguments: dict[str, Any]) -> dict[str, Any]:
        import uuid
        claim_type = arguments.get("claim_type", self._session.claim_type or "auto")
        collected_data = arguments.get("collected_data", self._session.collected_data)
        claim_number = f"CLM-{uuid.uuid4().hex[:8].upper()}"

        return {
            "status": "submitted",
            "claim_number": claim_number,
            "claim_type": claim_type,
            "data_points_collected": len(collected_data),
            "message": f"Claim {claim_number} has been submitted successfully.",
        }
