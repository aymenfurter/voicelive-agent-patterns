"""Application configuration — loaded from environment variables."""

import os
from dataclasses import dataclass, field


def _bool_env(key: str, default: str = "true") -> bool:
    return os.getenv(key, default).lower() == "true"


@dataclass(frozen=True)
class Settings:
    """Immutable application settings populated from environment variables."""

    VOICE_LIVE_API_ENDPOINT: str = field(
        default_factory=lambda: os.getenv("AZURE_VOICE_ENDPOINT", "")
    )
    VOICE_LIVE_API_KEY: str = field(default_factory=lambda: os.getenv("AZURE_VOICE_API_KEY", ""))
    USE_DEFAULT_CREDENTIAL: bool = field(default_factory=lambda: _bool_env("USE_DEFAULT_CREDENTIAL"))
    OPENAI_ENDPOINT: str = field(
        default_factory=lambda: os.getenv("AZURE_OPENAI_ENDPOINT", "")
    )
    OPENAI_API_KEY: str = field(default_factory=lambda: os.getenv("AZURE_OPENAI_API_KEY", ""))
    OPENAI_DEPLOYMENT: str = field(default_factory=lambda: os.getenv("AZURE_OPENAI_DEPLOYMENT", "gpt-realtime"))
    OPENAI_TEXT_DEPLOYMENT: str = field(
        default_factory=lambda: os.getenv("AZURE_OPENAI_TEXT_DEPLOYMENT", "gpt-4.1")
    )
    QUESTION_SERVICE_URL: str = field(
        default_factory=lambda: os.getenv("QUESTION_SERVICE_URL", "http://localhost:8001")
    )
    VOICE_NAME: str = field(
        default_factory=lambda: os.getenv("VOICE_NAME", "en-US-Aria:DragonHDLatestNeural")
    )


# Module-level singleton — importable everywhere, replaceable in tests.
Config = Settings()
