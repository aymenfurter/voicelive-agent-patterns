"""Domain models for claim processing state."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class ClaimSession:
    """Encapsulates transactional state for a single claim intake conversation."""

    claim_type: str | None = None
    collected_data: dict[str, Any] = field(default_factory=dict)

    def record_answer(self, question_id: str, answer: str) -> None:
        self.collected_data[question_id] = answer

    def unanswered(self, questions: list[dict[str, Any]]) -> list[dict[str, Any]]:
        return [q for q in questions if q.get("id") not in self.collected_data]


@dataclass
class SupervisorResult:
    """Structured result from a supervisor LLM consultation."""

    success: bool
    payload: dict[str, Any]
    error: str | None = None

    @property
    def is_error(self) -> bool:
        return self.error is not None

    def to_dict(self) -> dict[str, Any]:
        if self.is_error:
            return {"error": self.error, "valid": False}
        return self.payload
