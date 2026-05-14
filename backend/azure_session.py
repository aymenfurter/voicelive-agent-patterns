"""Asyncio coroutine that owns one Voice Live API connection per session.

Reads inbound items from a thread-safe queue (audio bytes / JSON messages),
forwards Voice API events back via another queue as `OutboundEvent`s, and
handles tool calls + handoffs + compaction.
"""

from __future__ import annotations

import asyncio
import json
import logging
import queue
import threading
from typing import Any

from auth import voice_credential
from azure.ai.voicelive.aio import connect
from azure.ai.voicelive.models import (
    ClientEventConversationItemCreate,
    ClientEventConversationItemDelete,
    ClientEventInputAudioBufferAppend,
    ClientEventResponseCreate,
    ClientEventSessionUpdate,
    FunctionCallOutputItem,
    InputTextContentPart,
    RequestSession,
    UserMessageItem,
)
from compaction import make_strategy
from config import Config
from event_mapper import extract_event_data, map_event_type
from outbound_event import OutboundEvent
from patterns.base import OrchestrationPattern
from session_builder import build_function_tools, build_session_request

logger = logging.getLogger(__name__)

# Sentinel passed on the inbound queue to signal shutdown.
STOP = object()


def _drain_pattern_events(pattern: OrchestrationPattern, out: queue.Queue) -> None:
    for event in pattern.drain_events():
        out.put(event)


async def run_azure_session(
    pattern: OrchestrationPattern,
    inbound: queue.Queue,
    outbound: queue.Queue,
    ready: threading.Event,
    done: threading.Event,
    session_config: dict | None = None,
) -> None:
    """Drive a single Voice Live API session until shutdown."""
    credential = voice_credential()
    model = (session_config or {}).get("model") or Config.OPENAI_DEPLOYMENT

    session_request = build_session_request(pattern, session_config)
    strategy = make_strategy((session_config or {}).get("compactionStrategy"))

    async with connect(
        endpoint=Config.VOICE_LIVE_API_ENDPOINT,
        credential=credential,
        model=model,
    ) as connection:
        await connection.send(ClientEventSessionUpdate(session=session_request))
        outbound.put(OutboundEvent(type="session.created", data={"pattern": "active"}))
        outbound.put(OutboundEvent(type="session.prompt_updated", data={
            "agent": pattern.current_agent_name,
            "prompt": pattern.get_system_prompt(),
            "reason": "Session started",
            "tools": [t.get("name", "") for t in pattern.get_tools()],
        }))
        await pattern.on_event("session.created", {})
        _drain_pattern_events(pattern, outbound)

        ready.set()

        shutdown = asyncio.Event()
        conversation_item_ids: list[str] = []

        await asyncio.gather(
            _read_from_browser(connection, inbound, outbound, shutdown),
            _read_from_azure(
                connection, pattern, outbound, shutdown,
                conversation_item_ids, strategy,
            ),
            return_exceptions=True,
        )


# ---------------------------------------------------------------------------
# Inbound: browser -> Azure
# ---------------------------------------------------------------------------


async def _read_from_browser(
    connection: Any,
    inbound: queue.Queue,
    outbound: queue.Queue,
    shutdown: asyncio.Event,
) -> None:
    loop = asyncio.get_event_loop()
    while not shutdown.is_set():
        try:
            item = await loop.run_in_executor(None, lambda: inbound.get(timeout=0.5))
        except queue.Empty:
            continue

        if item is STOP:
            shutdown.set()
            break

        msg_type, payload = item
        try:
            if msg_type == "audio_bytes":
                await connection.send(ClientEventInputAudioBufferAppend(audio=payload))
            elif msg_type == "json":
                await _handle_client_json(connection, payload, outbound)
        except Exception as exc:
            logger.error("send to Azure failed: %s", exc)
            shutdown.set()
            break


async def _handle_client_json(connection: Any, data: dict, outbound: queue.Queue) -> None:
    msg_type = data.get("type", "")
    if msg_type == "pattern.switch":
        outbound.put(OutboundEvent(
            type="pattern.switching",
            data={"to": data.get("pattern")},
        ))
        return
    if msg_type == "text.send":
        text = data.get("text", "")
        if not text:
            return
        user_msg = UserMessageItem(content=[InputTextContentPart(text=text)])
        try:
            await connection.send(ClientEventConversationItemCreate(item=user_msg))
            await connection.send(ClientEventResponseCreate())
            outbound.put(OutboundEvent(type="text.sent", data={"text": text}))
        except Exception as exc:
            logger.error("send text error: %s", exc)
            outbound.put(OutboundEvent(
                type="error", data={"message": f"Failed to send text: {exc}"},
            ))


# ---------------------------------------------------------------------------
# Outbound: Azure -> browser
# ---------------------------------------------------------------------------


async def _read_from_azure(
    connection: Any,
    pattern: OrchestrationPattern,
    outbound: queue.Queue,
    shutdown: asyncio.Event,
    conversation_item_ids: list[str],
    strategy,
) -> None:
    while not shutdown.is_set():
        event = await _recv_with_shutdown(connection, shutdown)
        if event is None:
            break

        event_type = map_event_type(event)
        event_data = extract_event_data(event)

        if event_type == "tool.called":
            await _handle_tool_call(connection, pattern, outbound, event_data)
        else:
            _track_conversation_item(event, event_type, conversation_item_ids, strategy.name)
            _emit_event_to_browser(event_type, event_data, outbound)
            if event_type == "response.done" and strategy.name != "off":
                await _apply_compaction(connection, outbound, conversation_item_ids, strategy, event_data)

        await pattern.on_event(event_type, event_data)
        _drain_pattern_events(pattern, outbound)


async def _recv_with_shutdown(connection: Any, shutdown: asyncio.Event) -> Any | None:
    """Race connection.recv() vs shutdown signal without cancelling recv mid-frame."""
    recv_task = asyncio.ensure_future(connection.recv())
    shutdown_task = asyncio.ensure_future(shutdown.wait())
    try:
        done, pending = await asyncio.wait(
            {recv_task, shutdown_task},
            return_when=asyncio.FIRST_COMPLETED,
        )
    except Exception as exc:
        logger.error("Azure recv wait error: %s", exc)
        return None

    for task in pending:
        task.cancel()
        try:
            await task
        except (asyncio.CancelledError, Exception):
            pass

    if shutdown_task in done:
        return None
    try:
        return recv_task.result()
    except Exception as exc:
        if not shutdown.is_set():
            logger.error("Azure recv error: %s", exc)
        return None


def _emit_event_to_browser(event_type: str, event_data: dict, outbound: queue.Queue) -> None:
    if event_type == "audio.delta":
        audio_b64 = event_data.get("audio") or event_data.get("delta")
        if audio_b64:
            outbound.put(OutboundEvent(type="audio.delta", top_level={"audio": audio_b64}))
        return
    outbound.put(OutboundEvent(type=event_type, data=event_data))


def _track_conversation_item(
    event: Any, event_type: str, conversation_item_ids: list[str], strategy_name: str,
) -> None:
    if strategy_name == "off":
        return
    if str(getattr(event, "type", "")) != "conversation.item.created":
        return
    item = getattr(event, "item", None)
    if item is None:
        return
    item_id = getattr(item, "id", None)
    item_type = str(getattr(item, "type", ""))
    if item_id and item_type == "message":
        conversation_item_ids.append(item_id)


async def _apply_compaction(
    connection: Any,
    outbound: queue.Queue,
    conversation_item_ids: list[str],
    strategy,
    event_data: dict,
) -> None:
    usage = event_data.get("usage")
    input_tokens = usage.get("input_tokens", 0) if isinstance(usage, dict) else 0
    deleted = strategy.select(conversation_item_ids, input_tokens)
    for item_id in deleted:
        try:
            await connection.send(ClientEventConversationItemDelete(item_id=item_id))
        except Exception as exc:
            logger.warning("Compaction: failed to delete %s: %s", item_id, exc)
    if deleted:
        outbound.put(OutboundEvent(type="compaction.applied", data={
            "strategy": strategy.name,
            "deleted_count": len(deleted),
            "remaining_items": len(conversation_item_ids),
        }))


# ---------------------------------------------------------------------------
# Tool calls + handoffs
# ---------------------------------------------------------------------------


async def _handle_tool_call(
    connection: Any,
    pattern: OrchestrationPattern,
    outbound: queue.Queue,
    event_data: dict,
) -> None:
    tool_name = event_data.get("name", "")
    arguments = event_data.get("arguments", {})
    call_id = event_data.get("call_id", "")

    outbound.put(OutboundEvent(type="tool.called", data={
        "name": tool_name, "arguments": arguments,
    }))

    try:
        result = await pattern.handle_tool_call(tool_name, arguments)
    except Exception as exc:
        logger.exception("Tool call %s failed", tool_name)
        result = {"error": str(exc)}

    outbound.put(OutboundEvent(type="tool.result", data={
        "name": tool_name, "result": result,
    }))

    tool_output = FunctionCallOutputItem(call_id=call_id, output=json.dumps(result))
    await connection.send(ClientEventConversationItemCreate(item=tool_output))

    if result.get("requires_session_update"):
        await _apply_handoff(connection, pattern, outbound, result)
    else:
        await connection.send(ClientEventResponseCreate())


async def _apply_handoff(
    connection: Any,
    pattern: OrchestrationPattern,
    outbound: queue.Queue,
    result: dict,
) -> None:
    new_tools_meta = result.get("new_tools") or []
    outbound.put(OutboundEvent(type="agent.handoff", data={
        "from": result.get("from_agent"),
        "to": result.get("to_agent"),
        "reason": result.get("reason", ""),
        "new_instructions_preview": (result.get("new_instructions") or "")[:200],
        "new_tools": [t.get("name", t.get("type", "?")) for t in new_tools_meta],
    }))

    new_tools = build_function_tools(pattern)
    update_session = RequestSession(
        instructions=pattern.get_system_prompt(),
        tools=new_tools if new_tools else None,
    )
    await connection.send(ClientEventSessionUpdate(session=update_session))

    outbound.put(OutboundEvent(type="session.prompt_updated", data={
        "agent": result.get("to_agent"),
        "prompt": pattern.get_system_prompt(),
        "reason": result.get("reason", f"Handoff to {result.get('to_agent')}"),
        "tools": [t.get("name", t.get("type", "?")) for t in new_tools_meta],
    }))

    handoff_prompt = (
        f"You have just been handed this conversation from the "
        f"'{result.get('from_agent', 'previous')}' agent. "
        f"Reason: {result.get('reason', '')}. "
        f"Introduce yourself briefly and continue the conversation."
    )
    await connection.send(ClientEventResponseCreate(additional_instructions=handoff_prompt))
