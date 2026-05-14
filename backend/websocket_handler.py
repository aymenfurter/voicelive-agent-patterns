"""Bridges a gevent WebSocket to the asyncio Voice Live API session."""

from __future__ import annotations

import asyncio
import logging
import queue
import threading
from typing import Any

import patterns  # noqa: F401 — triggers pattern registration
from azure_session import STOP, run_azure_session
from event_loop import get_shared_loop
from outbound_event import OutboundEvent, is_stop, stop_event
from patterns.registry import get_pattern
from safe_io import parse_client_message, safe_ws_send

logger = logging.getLogger(__name__)


def _emit_event(ws: Any, event_type: str, data: dict[str, Any] | None = None) -> None:
    safe_ws_send(ws, OutboundEvent(type=event_type, data=data or {}).to_json())


def handle_websocket(
    ws: Any, pattern_name: str = "chat-supervisor", session_config: dict | None = None,
) -> None:
    """Run a single voice session: forwards browser frames to Azure and back."""
    pattern = get_pattern(pattern_name)
    _emit_event(ws, "pattern.selected", {"pattern": pattern_name})

    inbound: queue.Queue = queue.Queue()
    outbound: queue.Queue = queue.Queue()

    azure_error: list[str] = []
    azure_ready = threading.Event()
    azure_done = threading.Event()

    loop = get_shared_loop()
    future = asyncio.run_coroutine_threadsafe(
        run_azure_session(pattern, inbound, outbound, azure_ready, azure_done, session_config),
        loop,
    )

    def _watch_future() -> None:
        try:
            future.result()
        except Exception as exc:
            logger.error("Azure session error: %s", exc)
            azure_error.append(str(exc))
            outbound.put(OutboundEvent(type="error", data={"message": str(exc)}))
        finally:
            azure_done.set()
            outbound.put(stop_event())

    watcher = threading.Thread(target=_watch_future, daemon=True)
    watcher.start()

    if not azure_ready.wait(timeout=15):
        message = azure_error[0] if azure_error else "Timeout connecting to Voice Live API"
        _emit_event(ws, "error", {"message": message})
        inbound.put(STOP)
        watcher.join(timeout=5)
        return

    if azure_error:
        _emit_event(ws, "error", {"message": azure_error[0]})
        watcher.join(timeout=5)
        return

    try:
        _bridge_loop(ws, inbound, outbound, azure_done)
    except Exception as exc:
        logger.error("WS read error: %s", exc)
    finally:
        inbound.put(STOP)
        _drain_outbound(ws, outbound)
        _emit_event(ws, "session.closed", {})
        if not future.done():
            future.cancel()
        watcher.join(timeout=5)


def _bridge_loop(
    ws: Any, inbound: queue.Queue, outbound: queue.Queue, azure_done: threading.Event,
) -> None:
    while not azure_done.is_set():
        _drain_outbound(ws, outbound)

        try:
            message = ws.receive(timeout=0.2)
        except Exception:
            logger.info("Main loop: browser WS closed")
            break

        if message is None:
            continue

        parsed = parse_client_message(message)
        if parsed is not None:
            inbound.put(parsed)


def _drain_outbound(ws: Any, outbound: queue.Queue) -> None:
    while True:
        try:
            event = outbound.get_nowait()
        except queue.Empty:
            return
        if is_stop(event):
            return
        safe_ws_send(ws, event.to_json())
