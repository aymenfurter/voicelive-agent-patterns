"""Translate raw Azure Voice Live API events into client-friendly events."""

from __future__ import annotations

import base64
import json
from typing import Any

_TYPE_MAP = {
    "session.created": "session.created",
    "session.updated": "session.updated",
    "input_audio_buffer.speech_started": "audio.started",
    "input_audio_buffer.speech_stopped": "audio.stopped",
    "response.created": "response.created",
    "response.audio.delta": "audio.delta",
    "response.audio.done": "audio.done",
    "response.audio_transcript.delta": "transcript.delta",
    "response.audio_transcript.done": "transcript.done",
    "response.text.delta": "text.delta",
    "response.text.done": "text.done",
    "response.function_call_arguments.delta": "tool.arguments.delta",
    "response.function_call_arguments.done": "tool.called",
    "response.done": "response.done",
    "error": "error",
}


def map_event_type(event: Any) -> str:
    raw = str(getattr(event, "type", "unknown"))
    return _TYPE_MAP.get(raw, raw)


def extract_event_data(event: Any) -> dict[str, Any]:
    data: dict[str, Any] = {}

    audio = getattr(event, "audio", None)
    if audio:
        data["audio"] = base64.b64encode(audio).decode("utf-8")

    transcript = getattr(event, "transcript", None)
    if transcript:
        data["transcript"] = transcript

    text = getattr(event, "text", None)
    if text:
        data["text"] = text

    delta = getattr(event, "delta", None)
    if delta:
        data["delta"] = base64.b64encode(delta).decode("utf-8") if isinstance(delta, bytes) else delta

    name = getattr(event, "name", None)
    if name:
        data["name"] = name

    arguments = getattr(event, "arguments", None)
    if arguments:
        try:
            data["arguments"] = json.loads(arguments)
        except (json.JSONDecodeError, TypeError):
            data["arguments"] = {}

    call_id = getattr(event, "call_id", None)
    if call_id:
        data["call_id"] = call_id

    error = getattr(event, "error", None)
    if error:
        data["error"] = str(error)

    response = getattr(event, "response", None)
    usage = getattr(response, "usage", None) if response else None
    if usage:
        data["usage"] = {
            "input_tokens": getattr(usage, "input_tokens", 0) or 0,
            "output_tokens": getattr(usage, "output_tokens", 0) or 0,
            "total_tokens": getattr(usage, "total_tokens", 0) or 0,
        }

    return data
