"""Run harness: model-simulated multi-turn conversations.

Uses GPT-4.1 as a user simulator to generate realistic user turns,
converts them to TTS audio, streams into Voice API, and grades
full episode outcomes.
"""

import asyncio
import json
import logging
import os
import time
from dataclasses import dataclass, field

import httpx
from azure.ai.voicelive.aio import connect
from azure.ai.voicelive.models import (
    AzureSemanticVad,
    AzureStandardVoice,
    ClientEventConversationItemCreate,
    ClientEventInputAudioBufferAppend,
    ClientEventInputAudioBufferCommit,
    ClientEventResponseCreate,
    ClientEventSessionUpdate,
    FunctionCallOutputItem,
    FunctionTool,
    Modality,
    RequestSession,
)
from azure.identity import DefaultAzureCredential, get_bearer_token_provider
from azure.identity.aio import DefaultAzureCredential as AsyncDefaultAzureCredential
from openai import AsyncAzureOpenAI

from evals.harness.base import (
    chunk_audio,
    generate_tts_audio,
)
from evals.harness.graders import (
    GradeResult,
    grade_instruction_following,
)

logger = logging.getLogger(__name__)

ENDPOINT = os.environ.get("AZURE_VOICE_ENDPOINT", "")
DEPLOYMENT = os.environ.get("AZURE_OPENAI_DEPLOYMENT", "gpt-realtime")
GPT41_DEPLOYMENT = os.environ.get("AZURE_OPENAI_TEXT_DEPLOYMENT", "gpt-4.1")
QUESTION_SERVICE = os.environ.get("QUESTION_SERVICE_URL", "http://localhost:8001")

TURN_TIMEOUT_S = 30
EPISODE_TIMEOUT_S = 300
CHUNK_MS = 100
SAMPLE_RATE = 24000

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

USER_SIMULATOR_PROMPT = """\
You are simulating a real caller filing an {claim_type} insurance claim.
Your persona: {persona}

Rules:
- Respond naturally as a real caller would
- Provide the information asked for
- Stay in character
- Keep responses brief (1-2 sentences, as in a phone call)
- Do NOT mention tools, APIs, or that you're an AI

Current conversation so far:
{conversation_history}

The agent just said: "{agent_response}"

Respond as the caller would. Just give your response, nothing else."""

PERSONAS = [
    {
        "name": "cooperative",
        "desc": "Helpful caller with all info ready",
        "claim_type": "auto",
        "expected_turns": (8, 15),
    },
    {
        "name": "confused",
        "desc": "Elderly caller who is confused and gives vague answers initially",
        "claim_type": "property",
        "expected_turns": (12, 20),
    },
    {
        "name": "rushed",
        "desc": "Busy professional who gives brief answers",
        "claim_type": "health",
        "expected_turns": (8, 15),
    },
]


@dataclass
class TurnResult:
    """Result of a single turn in a multi-turn episode."""

    turn_number: int
    user_text: str
    agent_transcript: str
    tool_calls: list[dict] = field(default_factory=list)
    latency_ms: int = 0
    events_received: int = 0


@dataclass
class EpisodeResult:
    """Result of a full multi-turn conversation episode."""

    persona: str
    claim_type: str
    turns: list[TurnResult] = field(default_factory=list)
    total_turns: int = 0
    claim_complete: bool = False
    tool_calls_made: list[dict] = field(default_factory=list)
    questions_answered: list[str] = field(default_factory=list)
    clarifications_triggered: int = 0
    total_latency_s: float = 0.0


@dataclass
class EpisodeGrade:
    """Grading result for a full episode."""

    grades: dict[str, bool | GradeResult] = field(default_factory=dict)
    passed: bool = False
    reasoning: str = ""


def _create_user_simulator_client() -> AsyncAzureOpenAI:
    """Create an Azure OpenAI client for user simulation."""
    credential = DefaultAzureCredential()
    token_provider = get_bearer_token_provider(
        credential, "https://cognitiveservices.azure.com/.default"
    )
    return AsyncAzureOpenAI(
        azure_endpoint=ENDPOINT,
        azure_ad_token_provider=token_provider,
        api_version="2025-04-01-preview",
    )


async def _generate_user_response(
    client: AsyncAzureOpenAI,
    persona: dict,
    conversation_history: str,
    agent_response: str,
) -> str:
    """Generate a simulated user response using GPT-4.1."""
    prompt = USER_SIMULATOR_PROMPT.format(
        claim_type=persona["claim_type"],
        persona=persona["desc"],
        conversation_history=conversation_history,
        agent_response=agent_response,
    )

    response = await client.chat.completions.create(
        model=GPT41_DEPLOYMENT,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.7,
        seed=42,
        max_tokens=150,
    )
    return response.choices[0].message.content.strip()


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


def _format_conversation(turns: list[TurnResult]) -> str:
    """Format conversation turns into readable text."""
    lines = []
    for turn in turns:
        lines.append(f"User: {turn.user_text}")
        lines.append(f"Agent: {turn.agent_transcript}")
    return "\n".join(lines)


def _check_completion_signal(agent_transcript: str) -> bool:
    """Check if the agent has signaled conversation completion."""
    completion_keywords = ["summary", "summarize", "that's everything", "all set",
                           "anything else", "is there anything else"]
    transcript_lower = agent_transcript.lower()
    return any(kw in transcript_lower for kw in completion_keywords)


async def _run_voice_turn(
    audio_bytes: bytes,
    system_prompt: str,
) -> tuple[str, list[dict], int, int]:
    """Stream audio into Voice API and collect response.

    Returns:
        Tuple of (agent_transcript, tool_calls, latency_ms, events_count)
    """
    credential = AsyncDefaultAzureCredential()
    transcript_parts: list[str] = []
    tool_calls: list[dict] = []
    events_received: list = []
    start_time = time.monotonic()

    try:
        async with connect(
            endpoint=ENDPOINT,
            credential=credential,
            model=DEPLOYMENT,
        ) as session:
            # Configure session
            await session.send(
                ClientEventSessionUpdate(
                    session=RequestSession(
                        modalities=[Modality.AUDIO, Modality.TEXT],
                        instructions=system_prompt,
                        voice=AzureStandardVoice(name="en-US-Aria:DragonHDLatestNeural"),
                        turn_detection=AzureSemanticVad(),
                        tools=TOOLS,
                    )
                )
            )

            # Stream audio in chunks
            chunks = chunk_audio(audio_bytes, CHUNK_MS, SAMPLE_RATE)
            for chunk in chunks:
                await session.send(
                    ClientEventInputAudioBufferAppend(audio=chunk)
                )
                await asyncio.sleep(CHUNK_MS / 1000.0)

            await session.send(ClientEventInputAudioBufferCommit())
            await session.send(ClientEventResponseCreate())

            # Collect response events
            async for event in session:
                events_received.append(event)
                event_type = getattr(event, "type", "")

                if event_type == "response.audio_transcript.delta":
                    delta = getattr(event, "delta", "")
                    if delta:
                        transcript_parts.append(delta)

                elif event_type == "response.function_call_arguments.done":
                    call_id = getattr(event, "call_id", "")
                    fn_name = getattr(event, "name", "")
                    fn_args_str = getattr(event, "arguments", "{}")
                    try:
                        fn_args = json.loads(fn_args_str)
                    except json.JSONDecodeError:
                        fn_args = {}

                    tool_calls.append({
                        "call_id": call_id,
                        "name": fn_name,
                        "arguments": fn_args,
                    })

                    # Execute tool call
                    tool_result = await handle_tool_call(fn_name, fn_args)

                    # Send result back
                    await session.send(
                        ClientEventConversationItemCreate(
                            item=FunctionCallOutputItem(
                                call_id=call_id,
                                output=tool_result,
                            )
                        )
                    )
                    await session.send(ClientEventResponseCreate())

                elif event_type == "response.done":
                    break

                # Timeout guard
                elapsed = time.monotonic() - start_time
                if elapsed > TURN_TIMEOUT_S:
                    logger.warning("Turn timeout reached after %.1fs", elapsed)
                    break

    finally:
        await credential.close()

    latency_ms = int((time.monotonic() - start_time) * 1000)
    agent_transcript = "".join(transcript_parts)
    return agent_transcript, tool_calls, latency_ms, len(events_received)


async def run_multi_turn_episode(
    persona: dict,
    max_turns: int = 20,
    system_prompt: str | None = None,
) -> EpisodeResult:
    """Run a full multi-turn conversation episode.

    1. Start Voice API session with agent greeting
    2. Loop:
       a. LLM generates user response text
       b. TTS converts to audio
       c. Stream audio to Voice API
       d. Collect agent response (tool calls + transcript)
       e. Handle any tool calls against real Question Service
       f. Repeat until agent signals completion or max_turns
    3. Return episode result for grading

    Args:
        persona: dict with name, desc, claim_type, expected_turns
        max_turns: maximum number of conversation turns
        system_prompt: optional override for agent system prompt

    Returns:
        EpisodeResult with full conversation details
    """
    if system_prompt is None:
        system_prompt = (
            "You are an insurance claims intake agent. Greet the caller, "
            "ask about their claim type, then use get_next_questions to get "
            "the relevant questions. Ask each question one by one and validate "
            "answers using validate_answer. If an answer is unclear, ask for "
            "clarification. Once all questions are answered, provide a summary "
            "of the claim details collected."
        )

    episode_start = time.monotonic()
    simulator_client = _create_user_simulator_client()

    result = EpisodeResult(
        persona=persona["name"],
        claim_type=persona["claim_type"],
    )

    # Get initial agent greeting by sending a brief silence/trigger
    initial_audio = await generate_tts_audio("Hello, I need to file a claim.")
    agent_transcript, tool_calls, latency_ms, events_count = await _run_voice_turn(
        initial_audio, system_prompt
    )

    initial_turn = TurnResult(
        turn_number=0,
        user_text="Hello, I need to file a claim.",
        agent_transcript=agent_transcript,
        tool_calls=tool_calls,
        latency_ms=latency_ms,
        events_received=events_count,
    )
    result.turns.append(initial_turn)
    result.tool_calls_made.extend(tool_calls)

    # Track questions answered from tool calls
    for tc in tool_calls:
        if tc["name"] == "validate_answer":
            qid = tc["arguments"].get("question_id", "")
            if qid:
                result.questions_answered.append(qid)

    logger.info(
        "Turn 0 (initial): agent=%r, tools=%d",
        agent_transcript[:80],
        len(tool_calls),
    )

    # Multi-turn loop
    conversation_history = _format_conversation(result.turns)

    for turn_num in range(1, max_turns):
        # Check episode timeout
        elapsed = time.monotonic() - episode_start
        if elapsed > EPISODE_TIMEOUT_S:
            logger.warning("Episode timeout reached after %.1fs", elapsed)
            break

        # Check if agent signaled completion
        if _check_completion_signal(agent_transcript):
            logger.info("Agent signaled completion at turn %d", turn_num)
            result.claim_complete = True
            break

        # Generate user response
        try:
            user_text = await _generate_user_response(
                simulator_client,
                persona,
                conversation_history,
                agent_transcript,
            )
        except Exception as e:
            logger.error("User simulator failed at turn %d: %s", turn_num, e)
            break

        logger.info("Turn %d user: %r", turn_num, user_text[:80])

        # Convert to audio
        try:
            user_audio = await generate_tts_audio(user_text)
        except Exception as e:
            logger.error("TTS failed at turn %d: %s", turn_num, e)
            break

        # Stream to Voice API
        try:
            agent_transcript, tool_calls, latency_ms, events_count = (
                await _run_voice_turn(user_audio, system_prompt)
            )
        except Exception as e:
            logger.error("Voice API failed at turn %d: %s", turn_num, e)
            break

        turn_result = TurnResult(
            turn_number=turn_num,
            user_text=user_text,
            agent_transcript=agent_transcript,
            tool_calls=tool_calls,
            latency_ms=latency_ms,
            events_received=events_count,
        )
        result.turns.append(turn_result)
        result.tool_calls_made.extend(tool_calls)

        # Track questions answered
        for tc in tool_calls:
            if tc["name"] == "validate_answer":
                qid = tc["arguments"].get("question_id", "")
                if qid:
                    result.questions_answered.append(qid)

        # Detect clarification requests
        clarification_keywords = ["could you repeat", "didn't catch", "clarify",
                                  "one more time", "say that again", "sorry"]
        if any(kw in agent_transcript.lower() for kw in clarification_keywords):
            result.clarifications_triggered += 1

        conversation_history = _format_conversation(result.turns)
        logger.info(
            "Turn %d agent: %r, tools=%d, latency=%dms",
            turn_num,
            agent_transcript[:80],
            len(tool_calls),
            latency_ms,
        )

    result.total_turns = len(result.turns)
    result.total_latency_s = time.monotonic() - episode_start

    logger.info(
        "Episode complete: persona=%s, turns=%d, tools=%d, questions=%s, "
        "complete=%s, latency=%.1fs",
        result.persona,
        result.total_turns,
        len(result.tool_calls_made),
        result.questions_answered,
        result.claim_complete,
        result.total_latency_s,
    )

    return result


async def grade_episode(result: EpisodeResult, persona: dict) -> EpisodeGrade:
    """Grade a completed episode on multiple dimensions.

    Deterministic checks:
    - completed: did the claim complete?
    - reasonable_turns: within expected turn range?
    - used_tools: did the agent call tools?

    LLM-based check:
    - instruction_following: overall episode quality
    """
    grades: dict[str, bool | GradeResult] = {}

    # Deterministic grades
    grades["completed"] = result.claim_complete
    grades["reasonable_turns"] = result.total_turns <= persona["expected_turns"][1]
    grades["used_tools"] = len(result.tool_calls_made) > 0
    grades["multi_turn"] = result.total_turns >= 3

    # LLM-based grading
    conversation_text = _format_conversation(result.turns)
    agent_system_prompt = (
        "You are an insurance claims intake agent. Collect all required "
        "information for a {claim_type} claim through natural conversation."
    ).format(claim_type=result.claim_type)

    criteria = [
        "Agent asked relevant questions for the claim type",
        "Agent used tools appropriately to validate answers",
        "Agent maintained professional and helpful tone",
        "Agent handled the conversation naturally",
    ]

    try:
        instruction_grade = await grade_instruction_following(
            system_prompt=agent_system_prompt,
            agent_response=conversation_text,
            criteria=criteria,
        )
        grades["instruction_following"] = instruction_grade
    except Exception as e:
        logger.error("LLM grading failed: %s", e)
        grades["instruction_following"] = GradeResult(
            passed=False,
            criteria_results={},
            reasoning=f"Grading failed: {e}",
        )

    # Overall pass: all bool grades pass, and instruction_following passes
    bool_grades_pass = all(
        g for g in grades.values() if isinstance(g, bool)
    )
    llm_grade = grades.get("instruction_following")
    llm_pass = llm_grade.passed if isinstance(llm_grade, GradeResult) else False

    overall_pass = bool_grades_pass and llm_pass
    reasoning_parts = [
        f"completed={grades['completed']}",
        f"reasonable_turns={grades['reasonable_turns']} ({result.total_turns} turns)",
        f"used_tools={grades['used_tools']} ({len(result.tool_calls_made)} calls)",
        f"instruction_following={llm_pass}",
    ]

    return EpisodeGrade(
        grades=grades,
        passed=overall_pass,
        reasoning="; ".join(reasoning_parts),
    )
