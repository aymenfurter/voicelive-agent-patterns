"""Factory functions for building tool definitions (DRY).

Eliminates duplicated JSON-schema blocks across agent configurations.
"""

from typing import Any


def make_get_next_questions_tool(claim_type: str | None = None) -> dict[str, Any]:
    """Build a get_next_questions tool definition, optionally scoped to a claim type."""
    properties: dict[str, Any] = {
        "claim_type": {
            "type": "string",
            **({"const": claim_type} if claim_type else {"enum": ["auto", "property", "health"]}),
            "description": "The type of insurance claim being filed.",
        },
    }
    return {
        "type": "function",
        "name": "get_next_questions",
        "description": "Get the next questions to ask for the claim.",
        "parameters": {
            "type": "object",
            "properties": properties,
            "required": ["claim_type"],
        },
    }


def make_validate_answer_tool(example_id: str = "question_id") -> dict[str, Any]:
    """Build a validate_answer tool definition."""
    return {
        "type": "function",
        "name": "validate_answer",
        "description": (
            "Validate the caller's answer. Use the exact question_id from get_next_questions."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "question_id": {
                    "type": "string",
                    "description": f"Exact ID from get_next_questions (e.g. '{example_id}').",
                },
                "answer": {
                    "type": "string",
                    "description": "The caller's answer to validate.",
                },
            },
            "required": ["question_id", "answer"],
        },
    }


def make_submit_claim_tool() -> dict[str, Any]:
    """Build a submit_claim_data tool definition."""
    return {
        "type": "function",
        "name": "submit_claim_data",
        "description": (
            "Submits the completed claim data for processing. Call this once all "
            "required information has been gathered and validated."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "claim_type": {
                    "type": "string",
                    "enum": ["auto", "property", "health"],
                    "description": "The type of insurance claim.",
                },
                "collected_data": {
                    "type": "object",
                    "description": "All collected claim information as key-value pairs.",
                },
            },
            "required": ["claim_type", "collected_data"],
        },
    }
