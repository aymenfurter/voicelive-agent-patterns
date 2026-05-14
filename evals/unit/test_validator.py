"""Unit tests for answer validation logic."""

import pytest

from validator import ValidationResult, validate_answer
from questions_data import TOP_LEVEL_QUESTIONS, BRANCH_QUESTIONS


pytestmark = pytest.mark.crawl


def _get_criteria(question_id: str) -> dict:
    """Helper to look up acceptance criteria by question ID."""
    for q in TOP_LEVEL_QUESTIONS:
        if q["id"] == question_id:
            return q["acceptance_criteria"]
    for questions in BRANCH_QUESTIONS.values():
        for q in questions:
            if q["id"] == question_id:
                return q["acceptance_criteria"]
    raise ValueError(f"Unknown question_id: {question_id}")


class TestVagueQuantifierRejection:
    """Vague quantifiers must be rejected regardless of question type."""

    @pytest.mark.parametrize("vague_answer", [
        "a few days ago",
        "some damage to the car",
        "several items were broken",
        "around 3pm",
        "approximately $500 worth of damage",
        "about 10 people were involved",
        "roughly 2 weeks ago it happened",
        "many people saw the accident",
    ])
    def test_vague_quantifiers_rejected(self, vague_answer):
        criteria = _get_criteria("incident_description")
        result = validate_answer(vague_answer, criteria)
        assert result.valid is False
        assert "vague" in result.reason.lower()

    @pytest.mark.parametrize("vague_answer", [
        "a few days ago",
        "some damage",
        "several items",
        "around 3pm",
        "approximately $500",
        "about 10",
        "roughly 2 weeks",
        "many people",
    ])
    def test_vague_quantifiers_rejected_on_date_field(self, vague_answer):
        criteria = _get_criteria("incident_date")
        result = validate_answer(vague_answer, criteria)
        assert result.valid is False


class TestDateValidation:
    """Date answers must be specific dates, not vague references."""

    @pytest.mark.parametrize("valid_date", [
        "March 15, 2024",
        "03/15/2024",
        "2024-03-15",
        "December 1, 2023",
        "01/01/2025",
        "Jan 5, 2024",
    ])
    def test_specific_dates_accepted(self, valid_date):
        criteria = _get_criteria("incident_date")
        result = validate_answer(valid_date, criteria)
        assert result.valid is True

    @pytest.mark.parametrize("vague_date", [
        "recently",
        "the other day",
        "a while ago",
        "last week sometime",
        "not sure when exactly",
        "sometime last month",
    ])
    def test_vague_date_references_rejected(self, vague_date):
        criteria = _get_criteria("incident_date")
        result = validate_answer(vague_date, criteria)
        assert result.valid is False
        assert result.clarifying_question is not None


class TestPolicyNumberValidation:
    """Policy numbers must match the expected alphanumeric format."""

    @pytest.mark.parametrize("valid_policy", [
        "POL12345678",
        "ABCD1234EF",
        "12345678",
        "ABC123456789",
    ])
    def test_valid_policy_numbers_accepted(self, valid_policy):
        criteria = _get_criteria("policy_number")
        result = validate_answer(valid_policy, criteria)
        assert result.valid is True

    @pytest.mark.parametrize("invalid_policy", [
        "ABC",
        "12",
        "A",
        "!@#$%^&*()",
        "1234567890ABCDE",
    ])
    def test_invalid_policy_numbers_rejected(self, invalid_policy):
        criteria = _get_criteria("policy_number")
        result = validate_answer(invalid_policy, criteria)
        assert result.valid is False
        assert result.clarifying_question is not None


class TestPhoneValidation:
    """Phone numbers must be in a recognizable format."""

    @pytest.mark.parametrize("valid_phone", [
        "(555) 123-4567",
        "555-123-4567",
        "5551234567",
        "+1 555 123 4567",
        "555.123.4567",
    ])
    def test_valid_phone_numbers_accepted(self, valid_phone):
        criteria = _get_criteria("contact_phone")
        result = validate_answer(valid_phone, criteria)
        assert result.valid is True

    @pytest.mark.parametrize("invalid_phone", [
        "123",
        "phone",
        "55512",
    ])
    def test_invalid_phone_numbers_rejected(self, invalid_phone):
        criteria = _get_criteria("contact_phone")
        result = validate_answer(invalid_phone, criteria)
        assert result.valid is False


class TestDescriptionValidation:
    """Descriptions must meet minimum word count requirements."""

    def test_sufficient_description_accepted(self):
        criteria = _get_criteria("incident_description")
        long_answer = (
            "I was driving on Main Street when another vehicle ran a red light "
            "and struck the passenger side of my car causing significant damage "
            "to the door and fender"
        )
        result = validate_answer(long_answer, criteria)
        assert result.valid is True

    def test_too_short_description_rejected(self):
        criteria = _get_criteria("incident_description")
        result = validate_answer("car crash", criteria)
        assert result.valid is False
        assert "words" in result.reason.lower() or "vague" in result.reason.lower()

    def test_vague_description_rejected(self):
        criteria = _get_criteria("incident_description")
        result = validate_answer("stuff happened", criteria)
        assert result.valid is False


class TestClaimTypeValidation:
    """Claim type must be exactly one of: auto, property, health."""

    @pytest.mark.parametrize("valid_type", [
        "auto",
        "property",
        "health",
        "I need to file an auto insurance claim",
        "This is a property claim",
        "health insurance claim",
    ])
    def test_valid_claim_types_accepted(self, valid_type):
        criteria = _get_criteria("claim_type")
        result = validate_answer(valid_type, criteria)
        assert result.valid is True

    @pytest.mark.parametrize("invalid_type", [
        "fire",
        "dental",
        "life",
        "I'm not sure what kind",
        "insurance",
    ])
    def test_invalid_claim_types_rejected(self, invalid_type):
        criteria = _get_criteria("claim_type")
        result = validate_answer(invalid_type, criteria)
        assert result.valid is False
        assert result.clarifying_question is not None


class TestFullNameValidation:
    """Full name requires at least first and last name."""

    @pytest.mark.parametrize("valid_name", [
        "John Smith",
        "Mary Jane Watson",
        "Jean-Pierre Dupont",
        "O'Brien Connor",
    ])
    def test_valid_full_names_accepted(self, valid_name):
        criteria = _get_criteria("claimant_name")
        result = validate_answer(valid_name, criteria)
        assert result.valid is True

    @pytest.mark.parametrize("invalid_name", [
        "John",
        "X",
    ])
    def test_single_name_rejected(self, invalid_name):
        criteria = _get_criteria("claimant_name")
        result = validate_answer(invalid_name, criteria)
        assert result.valid is False
        assert result.clarifying_question is not None


class TestValidationReturnsClarifyingQuestions:
    """All failed validations should include a clarifying question."""

    def test_failed_date_has_clarifying_question(self):
        criteria = _get_criteria("incident_date")
        result = validate_answer("recently", criteria)
        assert result.valid is False
        assert result.clarifying_question is not None
        assert len(result.clarifying_question) > 10

    def test_failed_policy_has_clarifying_question(self):
        criteria = _get_criteria("policy_number")
        result = validate_answer("ABC", criteria)
        assert result.valid is False
        assert result.clarifying_question is not None

    def test_failed_claim_type_has_clarifying_question(self):
        criteria = _get_criteria("claim_type")
        result = validate_answer("dental", criteria)
        assert result.valid is False
        assert result.clarifying_question is not None

    def test_empty_answer_has_clarifying_question(self):
        criteria = _get_criteria("incident_date")
        result = validate_answer("", criteria)
        assert result.valid is False
        assert result.clarifying_question is not None
