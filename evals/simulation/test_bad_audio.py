"""Tests for handling bad audio conditions.

These tests verify the system's behavior when receiving
poor quality audio input (silent, noisy, partial).
Uses text transcript simulation as a proxy for actual audio.
"""

import pytest
from questions_data import TOP_LEVEL_QUESTIONS
from validator import validate_answer

pytestmark = [pytest.mark.run, pytest.mark.azure]


# Simulated transcription outputs from bad audio conditions
SILENT_AUDIO_TRANSCRIPTS = ["", "   ", None]
NOISY_AUDIO_TRANSCRIPTS = [
    "I... *static*... the... *noise*",
    "bzzzz crackle",
    "[unintelligible]",
    "mmm... uh...",
]
PARTIAL_WORD_TRANSCRIPTS = [
    "Mar fif twen",
    "pol num is tw",
    "my na is Jo",
    "acc hap on",
]
BACKGROUND_NOISE_TRANSCRIPTS = [
    "March 15, 2024 [background chatter]",
    "My policy number is POL12345678 [dog barking]",
    "John Smith [car honking in background]",
    "(555) 123-4567 [music playing]",
]


@pytest.fixture
def date_criteria():
    return next(q for q in TOP_LEVEL_QUESTIONS if q["id"] == "incident_date")["acceptance_criteria"]


@pytest.fixture
def policy_criteria():
    return next(q for q in TOP_LEVEL_QUESTIONS if q["id"] == "policy_number")["acceptance_criteria"]


@pytest.fixture
def name_criteria():
    return next(q for q in TOP_LEVEL_QUESTIONS if q["id"] == "claimant_name")["acceptance_criteria"]


@pytest.fixture
def phone_criteria():
    return next(q for q in TOP_LEVEL_QUESTIONS if q["id"] == "contact_phone")["acceptance_criteria"]


class TestSilentAudio:
    """When no audio/speech is detected, agent should prompt user after timeout."""

    @pytest.mark.parametrize("silent_transcript", SILENT_AUDIO_TRANSCRIPTS)
    def test_silent_audio_fails_validation(self, silent_transcript, date_criteria):
        if silent_transcript is None:
            silent_transcript = ""
        result = validate_answer(silent_transcript, date_criteria)
        assert result.valid is False
        assert result.clarifying_question is not None

    def test_empty_answer_provides_helpful_prompt(self, date_criteria):
        result = validate_answer("", date_criteria)
        assert result.valid is False
        assert "date" in result.clarifying_question.lower() or "when" in result.clarifying_question.lower()

    def test_whitespace_only_treated_as_empty(self, policy_criteria):
        result = validate_answer("   ", policy_criteria)
        assert result.valid is False
        assert result.reason == "No answer provided."


class TestNoisyAudio:
    """When audio is too noisy to transcribe clearly, agent asks to repeat."""

    @pytest.mark.parametrize("noisy_transcript", NOISY_AUDIO_TRANSCRIPTS)
    def test_noisy_transcription_fails_validation(self, noisy_transcript, date_criteria):
        result = validate_answer(noisy_transcript, date_criteria)
        assert result.valid is False

    @pytest.mark.parametrize("noisy_transcript", NOISY_AUDIO_TRANSCRIPTS)
    def test_noisy_transcription_returns_clarification(self, noisy_transcript, date_criteria):
        result = validate_answer(noisy_transcript, date_criteria)
        assert result.clarifying_question is not None

    def test_noisy_policy_number_rejected(self, policy_criteria):
        result = validate_answer("bzz crackle pop", policy_criteria)
        assert result.valid is False

    def test_noisy_name_rejected(self, name_criteria):
        result = validate_answer("*static* mmm", name_criteria)
        assert result.valid is False


class TestPartialWords:
    """When transcription captures only partial words, agent asks for clarification."""

    @pytest.mark.parametrize("partial_transcript", PARTIAL_WORD_TRANSCRIPTS)
    def test_partial_words_fail_validation(self, partial_transcript, date_criteria):
        result = validate_answer(partial_transcript, date_criteria)
        assert result.valid is False

    def test_partial_policy_number_rejected(self, policy_criteria):
        result = validate_answer("tw", policy_criteria)
        assert result.valid is False

    def test_partial_name_rejected(self, name_criteria):
        # Single partial word shouldn't pass full name validation
        result = validate_answer("Jo", name_criteria)
        assert result.valid is False

    def test_partial_phone_rejected(self, phone_criteria):
        result = validate_answer("five five", phone_criteria)
        assert result.valid is False


class TestBackgroundNoise:
    """When background noise is present but speech is captured, agent still processes."""

    def test_date_with_background_noise_accepted(self, date_criteria):
        # The date is clearly present despite notation of background noise
        answer = "March 15, 2024"
        result = validate_answer(answer, date_criteria)
        assert result.valid is True

    def test_policy_with_background_noise_accepted(self, policy_criteria):
        answer = "POL12345678"
        result = validate_answer(answer, policy_criteria)
        assert result.valid is True

    def test_name_with_background_noise_accepted(self, name_criteria):
        answer = "John Smith"
        result = validate_answer(answer, name_criteria)
        assert result.valid is True

    def test_phone_with_background_noise_accepted(self, phone_criteria):
        answer = "(555) 123-4567"
        result = validate_answer(answer, phone_criteria)
        assert result.valid is True

    @pytest.mark.parametrize("answer,criteria_fixture", [
        ("The accident was on March 15, 2024", "date_criteria"),
        ("POL12345678", "policy_criteria"),
        ("My name is John Smith", "name_criteria"),
        ("Call me at 555-123-4567", "phone_criteria"),
    ])
    def test_clear_speech_with_noise_notation_still_valid(
        self, answer, criteria_fixture, request
    ):
        criteria = request.getfixturevalue(criteria_fixture)
        result = validate_answer(answer, criteria)
        assert result.valid is True
