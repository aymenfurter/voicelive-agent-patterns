"""Centralized factories for Azure credentials and OpenAI clients."""

from __future__ import annotations

from typing import TYPE_CHECKING

from azure.core.credentials import AzureKeyCredential
from azure.identity.aio import DefaultAzureCredential, get_bearer_token_provider
from config import Config

if TYPE_CHECKING:
    from openai import AsyncAzureOpenAI

_OPENAI_API_VERSION = "2025-04-01-preview"
_COGNITIVE_SCOPE = "https://cognitiveservices.azure.com/.default"


def voice_credential():
    """Return a credential for the Voice Live API connection."""
    if Config.USE_DEFAULT_CREDENTIAL:
        return DefaultAzureCredential()
    return AzureKeyCredential(Config.VOICE_LIVE_API_KEY)


def openai_client() -> "AsyncAzureOpenAI":
    """Return an AsyncAzureOpenAI client configured for the supervisor model."""
    from openai import AsyncAzureOpenAI

    if Config.USE_DEFAULT_CREDENTIAL:
        token_provider = get_bearer_token_provider(DefaultAzureCredential(), _COGNITIVE_SCOPE)
        return AsyncAzureOpenAI(
            azure_endpoint=Config.OPENAI_ENDPOINT,
            azure_ad_token_provider=token_provider,
            api_version=_OPENAI_API_VERSION,
        )
    return AsyncAzureOpenAI(
        azure_endpoint=Config.OPENAI_ENDPOINT,
        api_key=Config.OPENAI_API_KEY,
        api_version=_OPENAI_API_VERSION,
    )
