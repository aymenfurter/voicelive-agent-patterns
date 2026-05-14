"""Base class for orchestration patterns.

Patterns expose:
- session config & system prompt & tools (for the Voice Live API session)
- async tool dispatch (via a registered handler map)
- side-channel events (drained by the session loop and forwarded to the client)
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, Awaitable, Callable

from outbound_event import OutboundEvent

ToolHandler = Callable[[dict[str, Any]], Awaitable[dict[str, Any]]]


class OrchestrationPattern(ABC):
    """Abstract base class for voice orchestration patterns."""

    def __init__(self) -> None:
        self._tool_handlers: dict[str, ToolHandler] = {}
        self._pending_events: list[OutboundEvent] = []

    @abstractmethod
    def get_session_config(self) -> dict[str, Any]:
        """Return the full session configuration for the Voice Live API."""

    @abstractmethod
    def get_system_prompt(self) -> str:
        """Return the system prompt for the current agent."""

    @abstractmethod
    def get_tools(self) -> list[dict[str, Any]]:
        """Return the tool definitions available to the current agent."""

    @property
    def current_agent_name(self) -> str:
        """Name of the currently-active agent (for prompt-update events)."""
        return "initial"

    def register_tool(self, name: str, handler: ToolHandler) -> None:
        self._tool_handlers[name] = handler

    async def handle_tool_call(self, tool_name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        handler = self._tool_handlers.get(tool_name)
        if handler is None:
            return {"error": f"Unknown tool: {tool_name}"}
        return await handler(arguments)

    async def on_event(self, event_type: str, event_data: dict[str, Any]) -> None:
        """Hook for patterns that need to track session events. Default no-op."""

    def emit(self, event: OutboundEvent) -> None:
        """Queue an event to be forwarded to the client by the session loop."""
        self._pending_events.append(event)

    def drain_events(self) -> list[OutboundEvent]:
        events = self._pending_events
        self._pending_events = []
        return events
