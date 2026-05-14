"""Small I/O helpers for the WebSocket bridge."""

from __future__ import annotations

import base64
import json
import logging
from typing import Any

logger = logging.getLogger(__name__)


def safe_ws_send(ws: Any, payload: str) -> bool:
    try:
        ws.send(payload)
        return True
    except Exception as exc:
        logger.debug("ws.send failed: %s", exc)
        return False


def parse_client_message(raw: Any) -> tuple[str, Any] | None:
    """Decode a browser→backend message into ('audio_bytes', bytes) or
    ('json', dict). Returns None when the message is unparseable."""
    if isinstance(raw, bytes):
        return ("audio_bytes", raw)
    try:
        data = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return None
    if data.get("type") == "audio":
        try:
            return ("audio_bytes", base64.b64decode(data.get("audio", "")))
        except Exception:
            return None
    return ("json", data)
