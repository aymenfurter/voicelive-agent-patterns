"""Session builder — constructs Voice Live API session configuration.

Merges pattern defaults with runtime session overrides in a clean,
single-responsibility module.
"""

from typing import Any

from azure.ai.voicelive.models import (
    AudioEchoCancellation,
    AudioNoiseReduction,
    AzureSemanticVad,
    AzureStandardVoice,
    FunctionTool,
    Modality,
    RequestSession,
)
from config import Config
from patterns.base import OrchestrationPattern


def build_function_tools(pattern: OrchestrationPattern) -> list[FunctionTool]:
    """Build FunctionTool list from pattern tool definitions."""
    tools: list[FunctionTool] = []
    for tool_def in pattern.get_tools():
        tools.append(FunctionTool(
            name=tool_def["name"],
            description=tool_def.get("description", ""),
            parameters=tool_def.get("parameters", {}),
        ))
    return tools


def _resolve_turn_detection(session_config: dict | None) -> Any:
    """Resolve turn detection setting from session config."""
    if not session_config:
        return AzureSemanticVad()

    td_mode = session_config.get("turnDetection", "semantic_vad")
    if td_mode == "server_vad":
        from azure.ai.voicelive.models import ServerVad
        return ServerVad(
            threshold=session_config.get("vadThreshold", 0.5),
            silence_duration_ms=session_config.get("silenceDurationMs", 500),
            prefix_padding_ms=300,
        )
    elif td_mode == "none":
        return None
    return AzureSemanticVad()


def _resolve_noise_reduction(session_config: dict | None) -> Any:
    """Resolve noise reduction setting from session config."""
    if session_config and session_config.get("noiseReduction") == "off":
        return None
    return AudioNoiseReduction(type="azure_deep_noise_suppression")


def _resolve_echo_cancellation(session_config: dict | None) -> Any:
    """Resolve echo cancellation setting from session config."""
    if session_config and not session_config.get("echoCancellation", True):
        return None
    return AudioEchoCancellation(type="azure_echo_cancellation")


def _resolve_voice(pattern_config: dict[str, Any], session_config: dict | None) -> str:
    """Resolve voice name from pattern config and session overrides."""
    voice_name = pattern_config.get("voice", Config.VOICE_NAME)
    if session_config and session_config.get("voice"):
        voice_name = session_config["voice"]
    return voice_name


def _resolve_temperature(session_config: dict | None) -> float:
    """Resolve temperature from session config."""
    if session_config and session_config.get("temperature") is not None:
        return float(session_config["temperature"])
    return 0.8


def _resolve_max_tokens(session_config: dict | None) -> int | None:
    """Resolve max output tokens from session config."""
    if not session_config:
        return None
    max_val = session_config.get("maxOutputTokens", "inf")
    if max_val != "inf" and max_val is not None:
        return int(max_val)
    return None


def build_session_request(pattern: OrchestrationPattern, session_config: dict | None = None) -> RequestSession:
    """Build a Voice Live API session request from pattern config and runtime overrides."""
    config = pattern.get_session_config()
    tools = build_function_tools(pattern)

    return RequestSession(
        input_audio_noise_reduction=_resolve_noise_reduction(session_config),
        input_audio_echo_cancellation=_resolve_echo_cancellation(session_config),
        turn_detection=_resolve_turn_detection(session_config),
        voice=AzureStandardVoice(name=_resolve_voice(config, session_config)),
        instructions=pattern.get_system_prompt(),
        modalities=[Modality.AUDIO, Modality.TEXT],
        tools=tools if tools else None,
        temperature=_resolve_temperature(session_config),
        max_response_output_tokens=_resolve_max_tokens(session_config),
    )
