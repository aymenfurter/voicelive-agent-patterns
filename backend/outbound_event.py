"""Typed outbound event flowing from the Azure session to the browser WS."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class OutboundEvent:
    """Event emitted toward the browser. `top_level` carries fields that must
    be hoisted out of `data` into the top of the JSON payload (e.g. `audio` for
    audio.delta playback)."""

    type: str
    data: dict[str, Any] = field(default_factory=dict)
    top_level: dict[str, Any] = field(default_factory=dict)

    def to_payload(self) -> dict[str, Any]:
        payload: dict[str, Any] = {"type": self.type, "data": self.data}
        payload.update(self.top_level)
        return payload

    def to_json(self) -> str:
        return json.dumps(self.to_payload())


_STOP_SENTINEL = OutboundEvent(type="__stop__")


def stop_event() -> OutboundEvent:
    """Sentinel event signalling the consumer to stop draining."""
    return _STOP_SENTINEL


def is_stop(event: OutboundEvent) -> bool:
    return event is _STOP_SENTINEL
