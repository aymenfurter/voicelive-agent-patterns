"""Pattern catalog endpoint."""

from __future__ import annotations

from flask import Blueprint, jsonify

patterns_bp = Blueprint("patterns", __name__)

AVAILABLE_PATTERNS = [
    {
        "id": "chat-supervisor",
        "name": "Chat-Supervisor",
        "description": (
            "Realtime voice model handles conversation flow while deferring "
            "business logic decisions to a text-based supervisor model (gpt-4.1)."
        ),
    },
    {
        "id": "sequential-handoff",
        "name": "Sequential Handoff",
        "description": (
            "Multiple specialized agents hand off to each other based on "
            "conversation context. Each agent has focused instructions and tools."
        ),
    },
]

PATTERN_IDS = {p["id"] for p in AVAILABLE_PATTERNS}


@patterns_bp.route("/api/patterns")
def get_patterns():
    return jsonify({"patterns": AVAILABLE_PATTERNS}), 200
