"""Conversation-item compaction strategies (Strategy pattern, Open/Closed)."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable, Protocol


class CompactionStrategy(Protocol):
    name: str

    def select(self, items: list[str], input_tokens_this_turn: int) -> list[str]:
        """Mutate `items` in place, returning the list of item_ids to delete."""
        ...


@dataclass
class NoCompaction:
    name: str = "off"

    def select(self, items: list[str], input_tokens_this_turn: int) -> list[str]:
        return []


@dataclass
class RollingWindow:
    """Keep at most `max_items` recent items (pairs * 2)."""

    max_items: int
    name: str = "rolling"

    def select(self, items: list[str], input_tokens_this_turn: int) -> list[str]:
        deleted: list[str] = []
        while len(items) > self.max_items:
            deleted.append(items.pop(0))
        return deleted


@dataclass
class TokenBudget:
    """Delete oldest 25% of items when cumulative input crosses `budget`."""

    budget: int
    name: str = "token_budget"
    _cumulative: int = field(default=0, init=False)

    def select(self, items: list[str], input_tokens_this_turn: int) -> list[str]:
        self._cumulative += input_tokens_this_turn
        if self._cumulative <= self.budget or len(items) <= 2:
            return []
        n_delete = max(1, len(items) // 4)
        deleted = [items.pop(0) for _ in range(min(n_delete, len(items)))]
        self._cumulative = max(0, self._cumulative - input_tokens_this_turn)
        return deleted


_STRATEGIES: dict[str, Callable[[], CompactionStrategy]] = {
    "off": NoCompaction,
    "rolling_5": lambda: RollingWindow(max_items=10, name="rolling_5"),
    "rolling_10": lambda: RollingWindow(max_items=20, name="rolling_10"),
    "token_budget_4k": lambda: TokenBudget(budget=4000, name="token_budget_4k"),
}


def make_strategy(name: str | None) -> CompactionStrategy:
    factory = _STRATEGIES.get(name or "off", NoCompaction)
    return factory()
