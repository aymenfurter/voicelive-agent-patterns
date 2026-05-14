"""Unit tests for orchestration patterns configuration."""

import json

import pytest
from patterns.base import OrchestrationPattern

pytestmark = pytest.mark.crawl


class FakePattern(OrchestrationPattern):
    """Concrete implementation for testing the base interface."""

    def __init__(self, config: dict, system_prompt: str, tools: list):
        self._config = config
        self._system_prompt = system_prompt
        self._tools = tools

    def get_session_config(self) -> dict:
        return self._config

    def get_system_prompt(self) -> str:
        return self._system_prompt

    def get_tools(self) -> list:
        return self._tools

    async def handle_tool_call(self, tool_name, arguments):
        return {"result": "ok"}

    async def on_event(self, event_type, event_data):
        pass


CHAT_SUPERVISOR_CONFIG = {
    "turn_detection": {"type": "server_vad"},
    "input_audio_format": "pcm16",
    "output_audio_format": "pcm16",
    "voice": "en-US-Aria:DragonHDLatestNeural",
    "instructions": "You are a claims intake supervisor.",
    "tools": [
        {
            "type": "function",
            "name": "validate_answer",
            "description": "Validate a user's answer against acceptance criteria.",
            "parameters": {
                "type": "object",
                "properties": {
                    "question_id": {"type": "string"},
                    "answer": {"type": "string"},
                },
                "required": ["question_id", "answer"],
            },
        },
        {
            "type": "function",
            "name": "get_next_question",
            "description": "Get the next question to ask the user.",
            "parameters": {
                "type": "object",
                "properties": {
                    "current_question_id": {"type": "string"},
                },
                "required": [],
            },
        },
    ],
}

SEQUENTIAL_HANDOFF_CONFIG = {
    "agents": [
        {
            "name": "greeter",
            "system_prompt": "You are the initial greeter for insurance claims intake.",
            "tools": ["get_next_question"],
            "handoff_to": "intake_agent",
        },
        {
            "name": "intake_agent",
            "system_prompt": "You collect insurance claim information by asking questions one at a time.",
            "tools": ["validate_answer", "get_next_question", "get_branch_questions"],
            "handoff_to": "summary_agent",
        },
        {
            "name": "summary_agent",
            "system_prompt": "You summarize all collected claim information and confirm with the user.",
            "tools": ["generate_summary"],
            "handoff_to": None,
        },
    ],
    "turn_detection": {"type": "server_vad"},
    "input_audio_format": "pcm16",
    "output_audio_format": "pcm16",
    "voice": "en-US-Aria:DragonHDLatestNeural",
}

REQUIRED_AGENT_FIELDS = {"name", "system_prompt", "tools", "handoff_to"}


class TestChatSupervisorPattern:
    """Tests for the chat-supervisor orchestration pattern."""

    def test_returns_valid_session_config(self):
        pattern = FakePattern(
            config=CHAT_SUPERVISOR_CONFIG,
            system_prompt=CHAT_SUPERVISOR_CONFIG["instructions"],
            tools=CHAT_SUPERVISOR_CONFIG["tools"],
        )
        config = pattern.get_session_config()
        assert "turn_detection" in config
        assert "voice" in config
        assert "tools" in config

    def test_system_prompt_not_empty(self):
        pattern = FakePattern(
            config=CHAT_SUPERVISOR_CONFIG,
            system_prompt=CHAT_SUPERVISOR_CONFIG["instructions"],
            tools=CHAT_SUPERVISOR_CONFIG["tools"],
        )
        prompt = pattern.get_system_prompt()
        assert len(prompt) > 0

    def test_system_prompt_contains_expected_keywords(self):
        prompt = CHAT_SUPERVISOR_CONFIG["instructions"]
        assert "claims" in prompt.lower() or "insurance" in prompt.lower()

    def test_tools_list_not_empty(self):
        pattern = FakePattern(
            config=CHAT_SUPERVISOR_CONFIG,
            system_prompt=CHAT_SUPERVISOR_CONFIG["instructions"],
            tools=CHAT_SUPERVISOR_CONFIG["tools"],
        )
        tools = pattern.get_tools()
        assert len(tools) > 0


class TestSequentialHandoffPattern:
    """Tests for the sequential handoff orchestration pattern."""

    def test_returns_valid_session_config(self):
        config = SEQUENTIAL_HANDOFF_CONFIG
        assert "agents" in config
        assert "turn_detection" in config
        assert "voice" in config

    def test_all_agents_have_required_fields(self):
        for agent in SEQUENTIAL_HANDOFF_CONFIG["agents"]:
            missing = REQUIRED_AGENT_FIELDS - set(agent.keys())
            assert not missing, f"Agent '{agent.get('name', '?')}' missing fields: {missing}"

    def test_agent_system_prompts_contain_expected_keywords(self):
        keywords = ["insurance", "claim", "question", "intake", "greeter", "summarize", "summary"]
        for agent in SEQUENTIAL_HANDOFF_CONFIG["agents"]:
            prompt_lower = agent["system_prompt"].lower()
            has_keyword = any(kw in prompt_lower for kw in keywords)
            assert has_keyword, (
                f"Agent '{agent['name']}' system prompt lacks expected keywords"
            )

    def test_handoff_graph_has_no_cycles(self):
        """Verify the handoff chain is acyclic (terminates)."""
        agents = {a["name"]: a for a in SEQUENTIAL_HANDOFF_CONFIG["agents"]}
        visited = set()
        current = SEQUENTIAL_HANDOFF_CONFIG["agents"][0]["name"]

        while current is not None:
            assert current not in visited, f"Cycle detected at agent '{current}'"
            visited.add(current)
            current = agents[current]["handoff_to"]

    def test_all_handoff_targets_are_valid_agents(self):
        agent_names = {a["name"] for a in SEQUENTIAL_HANDOFF_CONFIG["agents"]}
        for agent in SEQUENTIAL_HANDOFF_CONFIG["agents"]:
            target = agent["handoff_to"]
            if target is not None:
                assert target in agent_names, (
                    f"Agent '{agent['name']}' hands off to unknown agent '{target}'"
                )


class TestToolDefinitions:
    """Tests for tool definition validity."""

    @pytest.mark.parametrize("tool", CHAT_SUPERVISOR_CONFIG["tools"])
    def test_tool_has_valid_structure(self, tool):
        assert "type" in tool
        assert "name" in tool
        assert "description" in tool
        assert "parameters" in tool
        assert tool["type"] == "function"

    @pytest.mark.parametrize("tool", CHAT_SUPERVISOR_CONFIG["tools"])
    def test_tool_parameters_are_valid_json_schema(self, tool):
        params = tool["parameters"]
        assert params["type"] == "object"
        assert "properties" in params
        # Validate it can be serialized as JSON (valid schema)
        json_str = json.dumps(params)
        parsed = json.loads(json_str)
        assert parsed == params

    @pytest.mark.parametrize("tool", CHAT_SUPERVISOR_CONFIG["tools"])
    def test_tool_name_is_snake_case(self, tool):
        name = tool["name"]
        assert name == name.lower()
        assert " " not in name
        assert all(c.isalnum() or c == "_" for c in name)
