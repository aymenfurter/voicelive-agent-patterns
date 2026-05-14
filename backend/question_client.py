"""HTTP client for the Question Service."""

import logging
from typing import Any

import httpx
from config import Config

logger = logging.getLogger(__name__)

_TIMEOUT = httpx.Timeout(10.0, connect=5.0)

# Shared async client — reuses TCP connections across requests.
_client: httpx.AsyncClient | None = None


def _get_client() -> httpx.AsyncClient:
    """Return (and lazily create) the shared httpx client."""
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(
            base_url=Config.QUESTION_SERVICE_URL,
            timeout=_TIMEOUT,
        )
    return _client


async def get_questions() -> list[dict[str, Any]]:
    """Fetch all available questions from the question service."""
    try:
        client = _get_client()
        response = await client.get("/questions")
        response.raise_for_status()
        data = response.json()
        if isinstance(data, dict) and "questions" in data:
            return data["questions"]
        return data if isinstance(data, list) else []
    except httpx.HTTPError as exc:
        logger.error("Failed to fetch questions: %s", exc)
        return []


async def get_questions_by_category(category: str) -> list[dict[str, Any]]:
    """Fetch questions for a specific claim category."""
    try:
        client = _get_client()
        response = await client.get(f"/questions/{category}")
        response.raise_for_status()
        data = response.json()
        if isinstance(data, dict) and "questions" in data:
            return data["questions"]
        return data if isinstance(data, list) else []
    except httpx.HTTPError as exc:
        logger.error("Failed to fetch questions for category '%s': %s", category, exc)
        return []


async def validate_answer(question_id: str, answer: str) -> dict[str, Any]:
    """Validate a user's answer against the question service."""
    try:
        client = _get_client()
        response = await client.post(
            "/validate",
            json={"question_id": question_id, "answer": answer},
        )
        if response.status_code == 404:
            return {"valid": False, "unknown_question": True,
                    "message": f"Question '{question_id}' not in service."}
        response.raise_for_status()
        return response.json()
    except httpx.HTTPError as exc:
        logger.error("Failed to validate answer: %s", exc)
        return {"valid": False, "error": str(exc)}
