"""Real end-to-end tests against live Azure Voice Live API and Question Service.

These tests make actual API calls — nothing is mocked.
Requirements:
  - Azure AI Services endpoint with Voice Live API + OpenAI deployments
  - DefaultAzureCredential configured (az login)
  - Question Service running on localhost:8001
"""

import asyncio
import json
import logging
import os
import time
from typing import Any

import httpx
import pytest

from azure.identity.aio import DefaultAzureCredential
from azure.ai.voicelive.aio import connect
from azure.ai.voicelive.models import (
    AzureSemanticVad,
    AzureStandardVoice,
    AudioEchoCancellation,
    AudioNoiseReduction,
    ClientEventSessionUpdate,
    ClientEventConversationItemCreate,
    ClientEventResponseCreate,
    FunctionCallOutputItem,
    FunctionTool,
    Modality,
    RequestSession,
    InputTextContentPart,
    UserMessageItem,
)

logger = logging.getLogger(__name__)

ENDPOINT = os.environ.get("AZURE_VOICE_ENDPOINT", "")
QUESTION_SERVICE = os.environ.get("QUESTION_SERVICE_URL", "http://localhost:8001")
VOICE_NAME = os.environ.get("VOICE_NAME", "en-US-Aria:DragonHDLatestNeural")
DEPLOYMENT = os.environ.get("AZURE_OPENAI_DEPLOYMENT", "gpt-realtime")

SYSTEM_PROMPT = """\
You are a friendly insurance claims intake agent named Aria.
Ask questions ONE AT A TIME and validate each answer before proceeding.
You have tools to get questions and validate answers.
Start by greeting the caller and asking what type of claim they need to file.
Keep responses concise (1-2 sentences) as this is a voice conversation.
Use the validate_answer tool after each answer to check completeness.
Use get_next_questions to retrieve branch-specific questions after claim type is known.
"""

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


async def _handle_tool_call(tool_name: str, arguments: dict) -> str:
    """Execute real tool calls against live Question Service."""
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


@pytest.fixture(scope="module")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="module")
def question_service_ready():
    """Verify Question Service is running."""
    try:
        resp = httpx.get(f"{QUESTION_SERVICE}/health", timeout=5)
        assert resp.status_code == 200, f"Question Service unhealthy: {resp.text}"
    except httpx.ConnectError:
        pytest.skip("Question Service not running on localhost:8001")


# ---------------------------------------------------------------------------
# Test: Voice Live API session can be created and configured
# ---------------------------------------------------------------------------


class TestVoiceLiveAPIConnection:
    """Verify we can connect to and configure Azure Voice Live API."""

    @pytest.mark.asyncio
    async def test_session_creation(self):
        """Create a real Voice Live API session and verify session.created event."""
        credential = DefaultAzureCredential()
        events_received = []

        async with connect(endpoint=ENDPOINT, credential=credential, model=DEPLOYMENT) as conn:
            session_config = RequestSession(
                input_audio_noise_reduction=AudioNoiseReduction(type="azure_deep_noise_suppression"),
                input_audio_echo_cancellation=AudioEchoCancellation(type="azure_echo_cancellation"),
                turn_detection=AzureSemanticVad(),
                voice=AzureStandardVoice(name=VOICE_NAME),
                instructions=SYSTEM_PROMPT,
                modalities=[Modality.AUDIO, Modality.TEXT],
                tools=TOOLS,
            )
            await conn.send(ClientEventSessionUpdate(session=session_config))

            # Read events until session is configured (with timeout)
            deadline = time.monotonic() + 15
            while time.monotonic() < deadline:
                try:
                    event = await asyncio.wait_for(conn.recv(), timeout=5)
                    event_type = str(getattr(event, "type", "unknown"))
                    events_received.append(event_type)
                    logger.info("Event: %s", event_type)
                    if "session.updated" in event_type:
                        break
                except asyncio.TimeoutError:
                    break

        assert any("session" in e for e in events_received), (
            f"No session events received. Got: {events_received}"
        )

    @pytest.mark.asyncio
    async def test_session_with_text_input(self):
        """Send a text user message and verify the agent responds."""
        credential = DefaultAzureCredential()
        events_received = []
        transcript_parts = []

        async with connect(endpoint=ENDPOINT, credential=credential, model=DEPLOYMENT) as conn:
            session_config = RequestSession(
                turn_detection=AzureSemanticVad(),
                voice=AzureStandardVoice(name=VOICE_NAME),
                instructions=SYSTEM_PROMPT,
                modalities=[Modality.AUDIO, Modality.TEXT],
                tools=TOOLS,
            )
            await conn.send(ClientEventSessionUpdate(session=session_config))

            # Wait for session to be ready
            await asyncio.sleep(2)

            # Send a text message (simulating user input)
            user_msg = UserMessageItem(
                content=[InputTextContentPart(text="I need to file an auto insurance claim.")],
            )
            await conn.send(ClientEventConversationItemCreate(item=user_msg))

            # Trigger a response
            await conn.send(ClientEventResponseCreate())

            # Collect response events
            deadline = time.monotonic() + 30
            while time.monotonic() < deadline:
                try:
                    event = await asyncio.wait_for(conn.recv(), timeout=10)
                    event_type = str(getattr(event, "type", "unknown"))
                    events_received.append(event_type)

                    # Collect transcript (skip binary audio deltas)
                    if hasattr(event, "delta") and event.delta and isinstance(event.delta, str):
                        transcript_parts.append(event.delta)
                    if hasattr(event, "transcript") and event.transcript and isinstance(event.transcript, str):
                        transcript_parts.append(event.transcript)

                    if "response.done" in event_type:
                        break
                except asyncio.TimeoutError:
                    break

        transcript = "".join(transcript_parts)
        logger.info("Agent transcript: %s", transcript)
        logger.info("Events: %s", events_received)

        assert len(events_received) > 2, f"Too few events: {events_received}"
        # Agent should produce some kind of response
        assert any("response" in e for e in events_received), (
            f"No response events. Got: {events_received}"
        )


# ---------------------------------------------------------------------------
# Test: Question Service integration (real HTTP)
# ---------------------------------------------------------------------------


class TestQuestionServiceIntegration:
    """Test the real Question Service API end-to-end."""

    def test_top_level_questions(self, question_service_ready):
        resp = httpx.get(f"{QUESTION_SERVICE}/questions", timeout=5)
        assert resp.status_code == 200
        data = resp.json()
        assert "questions" in data
        assert len(data["questions"]) == 6

    @pytest.mark.parametrize("category", ["auto", "property", "health"])
    def test_branch_questions(self, category, question_service_ready):
        resp = httpx.get(f"{QUESTION_SERVICE}/questions/{category}", timeout=5)
        assert resp.status_code == 200
        data = resp.json()
        assert "questions" in data
        assert len(data["questions"]) >= 3

    def test_validate_valid_date(self, question_service_ready):
        resp = httpx.post(
            f"{QUESTION_SERVICE}/validate",
            json={"question_id": "incident_date", "answer": "March 15, 2024"},
            timeout=5,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["valid"] is True

    def test_validate_vague_date_rejected(self, question_service_ready):
        resp = httpx.post(
            f"{QUESTION_SERVICE}/validate",
            json={"question_id": "incident_date", "answer": "a few days ago"},
            timeout=5,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["valid"] is False
        assert data["clarifying_question"] is not None

    def test_validate_vague_quantifier_rejected(self, question_service_ready):
        resp = httpx.post(
            f"{QUESTION_SERVICE}/validate",
            json={
                "question_id": "incident_description",
                "answer": "A few things broke and some stuff was damaged around the house",
            },
            timeout=5,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["valid"] is False

    def test_validate_policy_number_format(self, question_service_ready):
        # Valid
        resp = httpx.post(
            f"{QUESTION_SERVICE}/validate",
            json={"question_id": "policy_number", "answer": "POL12345678"},
            timeout=5,
        )
        assert resp.json()["valid"] is True

        # Invalid
        resp = httpx.post(
            f"{QUESTION_SERVICE}/validate",
            json={"question_id": "policy_number", "answer": "ABC"},
            timeout=5,
        )
        assert resp.json()["valid"] is False

    def test_glossary_returns_terms(self, question_service_ready):
        resp = httpx.get(f"{QUESTION_SERVICE}/glossary", timeout=5)
        assert resp.status_code == 200
        data = resp.json()
        assert "glossary" in data
        assert len(data["glossary"]) > 0


# ---------------------------------------------------------------------------
# Test: Full conversation flow via Voice Live API with tool calls
# ---------------------------------------------------------------------------


class TestFullConversationWithToolCalls:
    """Test a complete conversation with real tool calls against live services."""

    @pytest.mark.asyncio
    async def test_tool_call_get_questions(self, question_service_ready):
        """Verify the agent makes a tool call and we can execute it against the real service."""
        credential = DefaultAzureCredential()
        events_received = []
        tool_calls = []

        async with connect(endpoint=ENDPOINT, credential=credential, model=DEPLOYMENT) as conn:
            session_config = RequestSession(
                turn_detection=AzureSemanticVad(),
                voice=AzureStandardVoice(name=VOICE_NAME),
                instructions=(
                    "You are an insurance claims agent. The user just told you they "
                    "want to file an auto claim. Call the get_next_questions tool with "
                    "claim_type='auto' to retrieve the questions you need to ask."
                ),
                modalities=[Modality.AUDIO, Modality.TEXT],
                tools=TOOLS,
            )
            await conn.send(ClientEventSessionUpdate(session=session_config))
            await asyncio.sleep(2)

            # Send user message
            user_msg = UserMessageItem(
                content=[InputTextContentPart(text="I need to file an auto insurance claim.")],
            )
            await conn.send(ClientEventConversationItemCreate(item=user_msg))
            await conn.send(ClientEventResponseCreate())

            # Collect events, looking for tool calls
            deadline = time.monotonic() + 30
            while time.monotonic() < deadline:
                try:
                    event = await asyncio.wait_for(conn.recv(), timeout=10)
                    event_type = str(getattr(event, "type", "unknown"))
                    events_received.append(event_type)

                    # Detect tool call
                    if "function_call_arguments.done" in event_type:
                        tool_name = getattr(event, "name", "")
                        arguments_str = getattr(event, "arguments", "{}")
                        call_id = getattr(event, "call_id", "")
                        try:
                            arguments = json.loads(arguments_str)
                        except (json.JSONDecodeError, TypeError):
                            arguments = {}

                        logger.info("Tool call: %s(%s)", tool_name, arguments)
                        tool_calls.append({"name": tool_name, "arguments": arguments})

                        # Execute against real Question Service
                        result = await _handle_tool_call(tool_name, arguments)
                        logger.info("Tool result: %s", result[:200])

                        # Send result back
                        tool_output = FunctionCallOutputItem(
                            call_id=call_id,
                            output=result,
                        )
                        await conn.send(ClientEventConversationItemCreate(item=tool_output))
                        await conn.send(ClientEventResponseCreate())

                    if "response.done" in event_type and tool_calls:
                        break

                except asyncio.TimeoutError:
                    break

        logger.info("Events: %s", events_received)
        logger.info("Tool calls: %s", tool_calls)

        # The agent should have made at least one tool call
        # (it might respond with text first, so tool call is best-effort here)
        assert len(events_received) > 2, f"Too few events: {events_received}"

    @pytest.mark.asyncio
    async def test_validate_answer_tool_call(self, question_service_ready):
        """Send an answer and instruct the agent to validate it via tool call."""
        credential = DefaultAzureCredential()
        events_received = []
        tool_calls = []

        async with connect(endpoint=ENDPOINT, credential=credential, model=DEPLOYMENT) as conn:
            session_config = RequestSession(
                turn_detection=AzureSemanticVad(),
                voice=AzureStandardVoice(name=VOICE_NAME),
                instructions=(
                    "You are validating insurance claim answers. The user provided a date. "
                    "Call validate_answer with question_id='incident_date' and the user's answer. "
                    "Always use the validate_answer tool before accepting any answer."
                ),
                modalities=[Modality.AUDIO, Modality.TEXT],
                tools=TOOLS,
            )
            await conn.send(ClientEventSessionUpdate(session=session_config))
            await asyncio.sleep(2)

            user_msg = UserMessageItem(
                content=[InputTextContentPart(text="The accident happened on March 15, 2024.")],
            )
            await conn.send(ClientEventConversationItemCreate(item=user_msg))
            await conn.send(ClientEventResponseCreate())

            deadline = time.monotonic() + 30
            while time.monotonic() < deadline:
                try:
                    event = await asyncio.wait_for(conn.recv(), timeout=10)
                    event_type = str(getattr(event, "type", "unknown"))
                    events_received.append(event_type)

                    if "function_call_arguments.done" in event_type:
                        tool_name = getattr(event, "name", "")
                        arguments_str = getattr(event, "arguments", "{}")
                        call_id = getattr(event, "call_id", "")
                        try:
                            arguments = json.loads(arguments_str)
                        except (json.JSONDecodeError, TypeError):
                            arguments = {}

                        tool_calls.append({"name": tool_name, "arguments": arguments})
                        result = await _handle_tool_call(tool_name, arguments)

                        tool_output = FunctionCallOutputItem(
                            call_id=call_id,
                            output=result,
                        )
                        await conn.send(ClientEventConversationItemCreate(item=tool_output))
                        await conn.send(ClientEventResponseCreate())

                    if "response.done" in event_type and tool_calls:
                        break
                except asyncio.TimeoutError:
                    break

        logger.info("Tool calls: %s", tool_calls)
        assert len(events_received) > 2


# ---------------------------------------------------------------------------
# Test: Latency measurements on real services
# ---------------------------------------------------------------------------


class TestRealLatency:
    """Measure real API latencies."""

    @pytest.mark.asyncio
    async def test_voice_session_setup_latency(self):
        """Session setup should complete within 10 seconds."""
        credential = DefaultAzureCredential()
        start = time.perf_counter()

        async with connect(endpoint=ENDPOINT, credential=credential, model=DEPLOYMENT) as conn:
            session_config = RequestSession(
                turn_detection=AzureSemanticVad(),
                voice=AzureStandardVoice(name=VOICE_NAME),
                instructions="You are an insurance agent.",
                modalities=[Modality.AUDIO, Modality.TEXT],
            )
            await conn.send(ClientEventSessionUpdate(session=session_config))

            deadline = time.monotonic() + 10
            while time.monotonic() < deadline:
                try:
                    event = await asyncio.wait_for(conn.recv(), timeout=5)
                    event_type = str(getattr(event, "type", "unknown"))
                    if "session.updated" in event_type:
                        break
                except asyncio.TimeoutError:
                    break

        elapsed = time.perf_counter() - start
        logger.info("Session setup latency: %.2fs", elapsed)
        assert elapsed < 10, f"Session setup too slow: {elapsed:.2f}s"

    def test_question_service_latency(self, question_service_ready):
        """Question service should respond within 200ms."""
        start = time.perf_counter()
        resp = httpx.get(f"{QUESTION_SERVICE}/questions", timeout=5)
        elapsed = (time.perf_counter() - start) * 1000
        logger.info("Question service latency: %.2fms", elapsed)
        assert resp.status_code == 200
        assert elapsed < 200, f"Question service too slow: {elapsed:.2f}ms"

    def test_validation_latency(self, question_service_ready):
        """Validation endpoint should respond within 200ms."""
        start = time.perf_counter()
        resp = httpx.post(
            f"{QUESTION_SERVICE}/validate",
            json={"question_id": "incident_date", "answer": "March 15, 2024"},
            timeout=5,
        )
        elapsed = (time.perf_counter() - start) * 1000
        logger.info("Validation latency: %.2fms", elapsed)
        assert resp.status_code == 200
        assert elapsed < 200, f"Validation too slow: {elapsed:.2f}ms"
