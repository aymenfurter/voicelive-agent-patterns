"""Abstraction over the text supervisor LLM (DIP: patterns depend on this)."""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import Any, Protocol

from auth import openai_client
from config import Config
from patterns.models import SupervisorResult

logger = logging.getLogger(__name__)


@dataclass
class SupervisorExchange:
    """Captured request/response for a single supervisor consultation."""

    model: str
    system: str
    prompt: str
    response: dict[str, Any]
    usage: dict[str, Any] | None


class SupervisorClient(Protocol):
    async def complete_json(
        self, system: str, prompt: str
    ) -> tuple[SupervisorResult, SupervisorExchange | None]:
        ...


class AzureOpenAISupervisorClient:
    """Default implementation calling Azure OpenAI chat completions in JSON mode."""

    def __init__(self, model: str | None = None, temperature: float = 0.1) -> None:
        self._model = model or Config.OPENAI_TEXT_DEPLOYMENT
        self._temperature = temperature
        self._client = None

    def _get_client(self):
        if self._client is None:
            self._client = openai_client()
        return self._client

    async def complete_json(
        self, system: str, prompt: str
    ) -> tuple[SupervisorResult, SupervisorExchange | None]:
        messages = [
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ]
        try:
            response = await self._get_client().chat.completions.create(
                model=self._model,
                messages=messages,
                temperature=self._temperature,
                response_format={"type": "json_object"},
            )
            content = response.choices[0].message.content or "{}"
            payload = json.loads(content)
            usage = None
            if response.usage:
                usage = {
                    "prompt_tokens": getattr(response.usage, "prompt_tokens", None),
                    "completion_tokens": getattr(response.usage, "completion_tokens", None),
                }
            exchange = SupervisorExchange(
                model=self._model,
                system=system,
                prompt=prompt,
                response=payload,
                usage=usage,
            )
            return SupervisorResult(success=True, payload=payload), exchange
        except Exception as exc:
            logger.error("Supervisor consultation failed: %s", exc)
            return SupervisorResult(success=False, payload={}, error=str(exc)), None
