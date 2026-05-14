"""Shared eval harness for Voice Live API testing.

Implements the core audio pipeline:
  TTS text → PCM16 audio → chunk into 20ms frames → stream to Voice API → collect events → grade
"""

import asyncio
import json
import logging
import os
import os
import subprocess
import tempfile
import time
from dataclasses import dataclass, field
from typing import Any, Callable, Coroutine

import edge_tts
from azure.ai.voicelive.aio import connect
from azure.ai.voicelive.models import (
    AudioEchoCancellation,
    AudioNoiseReduction,
    AzureStandardVoice,
    ClientEventConversationItemCreate,
    ClientEventInputAudioBufferAppend,
    ClientEventInputAudioBufferCommit,
    ClientEventResponseCreate,
    ClientEventSessionUpdate,
    FunctionCallOutputItem,
    FunctionTool,
    InputAudioFormat,
    Modality,
    RequestSession,
)
from azure.identity.aio import DefaultAzureCredential

logger = logging.getLogger(__name__)

ENDPOINT = os.environ.get("AZURE_VOICE_ENDPOINT", "")
DEPLOYMENT = os.environ.get("AZURE_OPENAI_DEPLOYMENT", "gpt-realtime")
VOICE_NAME = os.environ.get("VOICE_NAME", "en-US-Aria:DragonHDLatestNeural")
QUESTION_SERVICE = os.environ.get("QUESTION_SERVICE_URL", "http://localhost:8001")


@dataclass
class SessionResult:
    """Result from a single-turn Voice API interaction."""

    events_received: list[str] = field(default_factory=list)
    tool_calls: list[dict[str, Any]] = field(default_factory=list)
    transcript_parts: list[str] = field(default_factory=list)
    latency_ms: float = 0.0
    audio_deltas_count: int = 0


async def generate_tts_audio(text: str, voice: str = "en-US-AriaNeural") -> bytes:
    """Generate PCM16 24kHz mono audio from text using edge-tts."""
    mp3_tmp = tempfile.NamedTemporaryFile(suffix=".mp3", delete=False)
    pcm_path = mp3_tmp.name.replace(".mp3", ".pcm")
    try:
        mp3_tmp.close()
        communicate = edge_tts.Communicate(text, voice)
        await communicate.save(mp3_tmp.name)

        subprocess.run(
            [
                "ffmpeg", "-y", "-i", mp3_tmp.name,
                "-f", "s16le", "-ar", "24000", "-ac", "1",
                pcm_path,
            ],
            capture_output=True,
            check=True,
        )

        with open(pcm_path, "rb") as f:
            return f.read()
    finally:
        for path in (mp3_tmp.name, pcm_path):
            try:
                os.unlink(path)
            except OSError:
                pass


def chunk_audio(pcm_data: bytes, chunk_ms: int = 20, sample_rate: int = 24000) -> list[bytes]:
    """Split PCM16 mono audio into fixed-duration frames.

    PCM16 = 2 bytes per sample, so bytes_per_frame = sample_rate * chunk_ms / 1000 * 2
    """
    bytes_per_frame = int(sample_rate * chunk_ms / 1000) * 2  # 960 bytes for 20ms at 24kHz
    chunks = []
    for i in range(0, len(pcm_data), bytes_per_frame):
        chunk = pcm_data[i : i + bytes_per_frame]
        if len(chunk) == bytes_per_frame:
            chunks.append(chunk)
        else:
            # Pad the last chunk with silence
            chunks.append(chunk + b"\x00" * (bytes_per_frame - len(chunk)))
    return chunks


def add_noise(pcm_data: bytes, noise_type: str = "white", snr_db: float = 20) -> bytes:
    """Overlay noise onto PCM16 24kHz mono audio using ffmpeg.

    Args:
        pcm_data: Raw PCM16 24kHz mono audio bytes.
        noise_type: Type of noise ('white', 'pink', 'brown').
        snr_db: Signal-to-noise ratio in dB (higher = less noise).
    """
    input_tmp = tempfile.NamedTemporaryFile(suffix=".pcm", delete=False)
    output_path = input_tmp.name.replace(".pcm", "_noisy.pcm")
    try:
        input_tmp.write(pcm_data)
        input_tmp.close()

        duration = len(pcm_data) / (24000 * 2)  # seconds
        # Calculate noise volume from SNR: noise_vol = 10^(-snr_db/20)
        noise_vol = 10 ** (-snr_db / 20)

        # Map noise type to anoisesrc color
        color_map = {"white": "white", "pink": "pink", "brown": "brown"}
        color = color_map.get(noise_type, "white")

        subprocess.run(
            [
                "ffmpeg", "-y",
                "-f", "s16le", "-ar", "24000", "-ac", "1", "-i", input_tmp.name,
                "-f", "lavfi", "-i", f"anoisesrc=color={color}:duration={duration}:sample_rate=24000",
                "-filter_complex",
                f"[1:a]volume={noise_vol}[noise];[0:a][noise]amix=inputs=2:duration=first",
                "-f", "s16le", "-ar", "24000", "-ac", "1",
                output_path,
            ],
            capture_output=True,
            check=True,
        )

        with open(output_path, "rb") as f:
            return f.read()
    finally:
        for path in (input_tmp.name, output_path):
            try:
                os.unlink(path)
            except OSError:
                pass


def phone_bandwidth_filter(pcm_data: bytes) -> bytes:
    """Simulate telephone audio by applying a 300-3400Hz bandpass filter."""
    input_tmp = tempfile.NamedTemporaryFile(suffix=".pcm", delete=False)
    output_path = input_tmp.name.replace(".pcm", "_phone.pcm")
    try:
        input_tmp.write(pcm_data)
        input_tmp.close()

        subprocess.run(
            [
                "ffmpeg", "-y",
                "-f", "s16le", "-ar", "24000", "-ac", "1", "-i", input_tmp.name,
                "-af", "highpass=f=300,lowpass=f=3400",
                "-f", "s16le", "-ar", "24000", "-ac", "1",
                output_path,
            ],
            capture_output=True,
            check=True,
        )

        with open(output_path, "rb") as f:
            return f.read()
    finally:
        for path in (input_tmp.name, output_path):
            try:
                os.unlink(path)
            except OSError:
                pass


async def run_single_turn(
    audio_bytes: bytes,
    system_prompt: str,
    tools: list[FunctionTool],
    handle_tool_call_fn: Callable[[str, dict], Coroutine[Any, Any, str]],
    timeout_s: float = 30.0,
) -> SessionResult:
    """Run a single-turn Voice API interaction.

    Opens a session with VAD disabled, streams audio, triggers response,
    collects events until response.done, and handles tool calls.
    """
    result = SessionResult()
    credential = DefaultAzureCredential()
    start_time = time.monotonic()

    async with connect(endpoint=ENDPOINT, credential=credential, model=DEPLOYMENT) as conn:
        # Configure session with VAD disabled for deterministic turn boundaries
        session_config = RequestSession(
            input_audio_noise_reduction=AudioNoiseReduction(type="azure_deep_noise_suppression"),
            input_audio_echo_cancellation=AudioEchoCancellation(type="azure_echo_cancellation"),
            turn_detection=None,
            voice=AzureStandardVoice(name=VOICE_NAME),
            instructions=system_prompt,
            modalities=[Modality.AUDIO, Modality.TEXT],
            tools=tools,
            input_audio_format=InputAudioFormat.PCM16,
        )
        await conn.send(ClientEventSessionUpdate(session=session_config))

        # Wait for session.updated
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline:
            try:
                event = await asyncio.wait_for(conn.recv(), timeout=5)
                event_type = str(getattr(event, "type", "unknown"))
                result.events_received.append(event_type)
                if "session.updated" in event_type:
                    break
            except asyncio.TimeoutError:
                break

        # Stream audio in 20ms chunks
        chunks = chunk_audio(audio_bytes)
        for chunk in chunks:
            await conn.send(ClientEventInputAudioBufferAppend(audio=chunk))

        # Commit and request response
        await conn.send(ClientEventInputAudioBufferCommit())
        await conn.send(ClientEventResponseCreate())

        # Collect events until response.done
        response_deadline = time.monotonic() + timeout_s
        pending_tool_calls: list[dict] = []

        while time.monotonic() < response_deadline:
            try:
                event = await asyncio.wait_for(conn.recv(), timeout=5)
            except asyncio.TimeoutError:
                continue

            event_type = str(getattr(event, "type", "unknown"))
            result.events_received.append(event_type)
            logger.debug("Event: %s", event_type)

            # Track audio deltas
            if "audio.delta" in event_type or "audio_delta" in event_type:
                result.audio_deltas_count += 1

            # Collect transcript deltas
            if hasattr(event, "delta") and isinstance(getattr(event, "delta", None), str):
                delta_text = event.delta
                if delta_text and "audio" not in event_type:
                    result.transcript_parts.append(delta_text)

            # Collect transcript from response content
            if hasattr(event, "text") and isinstance(getattr(event, "text", None), str):
                result.transcript_parts.append(event.text)

            # Handle function calls - detect output_item.added with function_call type
            if "output_item.added" in event_type:
                item = getattr(event, "item", None)
                if item and getattr(item, "type", "") == "function_call":
                    call_info = {
                        "name": getattr(item, "name", ""),
                        "arguments": "",
                        "call_id": getattr(item, "call_id", ""),
                    }
                    pending_tool_calls.append(call_info)

            # Accumulate function call arguments
            if "function_call_arguments.delta" in event_type:
                delta = getattr(event, "delta", "")
                if pending_tool_calls and delta:
                    pending_tool_calls[-1]["arguments"] += delta

            # Function call done - execute and send result
            if "function_call_arguments.done" in event_type:
                if pending_tool_calls:
                    call = pending_tool_calls[-1]
                    # Parse and execute
                    try:
                        args = json.loads(call["arguments"]) if call["arguments"] else {}
                    except json.JSONDecodeError:
                        args = {}

                    call["parsed_arguments"] = args
                    result.tool_calls.append(call)

                    # Execute tool call
                    tool_result = await handle_tool_call_fn(call["name"], args)

                    # Send tool result back
                    call_id = call.get("call_id", "")
                    await conn.send(
                        ClientEventConversationItemCreate(
                            item=FunctionCallOutputItem(
                                call_id=call_id,
                                output=tool_result,
                            )
                        )
                    )
                    await conn.send(ClientEventResponseCreate())
                    pending_tool_calls = []

            # Check for response completion
            if "response.done" in event_type:
                # If no pending tool calls, we're done
                if not pending_tool_calls:
                    break

        result.latency_ms = (time.monotonic() - start_time) * 1000

    return result
