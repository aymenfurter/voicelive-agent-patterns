"""Pattern registry — maps pattern IDs to their implementation classes.

New patterns register themselves here; no other module needs modification (Open/Closed).
"""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from patterns.base import OrchestrationPattern

_REGISTRY: dict[str, type["OrchestrationPattern"]] = {}


def register_pattern(pattern_id: str):
    """Class decorator that registers a pattern implementation."""

    def decorator(cls: type["OrchestrationPattern"]) -> type["OrchestrationPattern"]:
        _REGISTRY[pattern_id] = cls
        return cls

    return decorator


def get_pattern(pattern_name: str) -> "OrchestrationPattern":
    """Instantiate the selected orchestration pattern by name."""
    cls = _REGISTRY.get(pattern_name)
    if cls is None:
        # Fallback to chat-supervisor
        cls = _REGISTRY["chat-supervisor"]
    return cls()


def available_pattern_ids() -> list[str]:
    """Return registered pattern IDs."""
    return list(_REGISTRY.keys())
