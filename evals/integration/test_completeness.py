"""Integration tests for session completeness checking."""

import pytest

from validator import validate_answer
from questions_data import TOP_LEVEL_QUESTIONS, BRANCH_QUESTIONS


pytestmark = pytest.mark.walk


class CompletenessChecker:
    """Checks whether a claims intake session has collected all required data."""

    def __init__(self):
        self.answers = {}
        self.claim_type = None

    def record_answer(self, question_id: str, answer: str, valid: bool):
        if valid:
            self.answers[question_id] = answer
            if question_id == "claim_type":
                self.claim_type = self._extract_claim_type(answer)

    def _extract_claim_type(self, answer: str) -> str | None:
        answer_lower = answer.lower()
        for claim_type in ["auto", "property", "health"]:
            if claim_type in answer_lower:
                return claim_type
        return None

    def get_top_level_status(self) -> dict[str, bool]:
        return {q["id"]: q["id"] in self.answers for q in TOP_LEVEL_QUESTIONS}

    def get_branch_status(self) -> dict[str, bool]:
        if not self.claim_type or self.claim_type not in BRANCH_QUESTIONS:
            return {}
        return {
            q["id"]: q["id"] in self.answers
            for q in BRANCH_QUESTIONS[self.claim_type]
        }

    def all_top_level_answered(self) -> bool:
        return all(self.get_top_level_status().values())

    def all_branch_answered(self) -> bool:
        status = self.get_branch_status()
        if not status:
            return False
        return all(status.values())

    def is_complete(self) -> bool:
        return self.all_top_level_answered() and self.all_branch_answered()

    def get_missing_questions(self) -> list[str]:
        missing = []
        for qid, answered in self.get_top_level_status().items():
            if not answered:
                missing.append(qid)
        for qid, answered in self.get_branch_status().items():
            if not answered:
                missing.append(qid)
        return missing

    def get_summary(self) -> dict[str, str]:
        return dict(self.answers)


@pytest.fixture
def checker():
    return CompletenessChecker()


class TestAllTopLevelQuestionsRequired:
    """All 6 top-level questions must be answered for a complete session."""

    def test_empty_session_not_complete(self, checker):
        assert checker.all_top_level_answered() is False
        assert checker.is_complete() is False

    def test_partial_answers_not_complete(self, checker):
        checker.record_answer("claim_type", "auto", True)
        checker.record_answer("incident_date", "March 15, 2024", True)
        assert checker.all_top_level_answered() is False

    def test_all_top_level_answered(self, checker):
        answers = {
            "claim_type": "auto",
            "incident_date": "March 15, 2024",
            "policy_number": "POL12345678",
            "claimant_name": "John Smith",
            "contact_phone": "(555) 123-4567",
            "incident_description": "Car accident on highway causing damage to front bumper and hood",
        }
        for qid, answer in answers.items():
            checker.record_answer(qid, answer, True)
        assert checker.all_top_level_answered() is True

    def test_invalid_answers_not_counted(self, checker):
        checker.record_answer("claim_type", "auto", True)
        checker.record_answer("incident_date", "recently", False)  # Invalid
        assert "incident_date" not in checker.answers


class TestBranchQuestionsTriggered:
    """Branch questions must be triggered based on claim type."""

    @pytest.mark.parametrize("claim_type,expected_questions", [
        ("auto", ["auto_vehicle_info", "auto_other_parties", "auto_police_report"]),
        ("property", ["property_address", "property_damage_list", "property_temp_repairs"]),
        ("health", ["health_provider", "health_diagnosis", "health_other_insurance"]),
    ])
    def test_correct_branch_questions_for_type(self, checker, claim_type, expected_questions):
        checker.record_answer("claim_type", f"I need a {claim_type} claim", True)
        branch_status = checker.get_branch_status()
        assert set(branch_status.keys()) == set(expected_questions)

    def test_no_branch_questions_without_claim_type(self, checker):
        assert checker.get_branch_status() == {}

    def test_branch_questions_not_triggered_for_invalid_type(self, checker):
        checker.record_answer("claim_type", "dental", False)
        assert checker.get_branch_status() == {}


class TestAllBranchQuestionsRequired:
    """All branch questions must be answered for completeness."""

    def test_top_level_only_not_complete(self, checker):
        answers = {
            "claim_type": "auto",
            "incident_date": "March 15, 2024",
            "policy_number": "POL12345678",
            "claimant_name": "John Smith",
            "contact_phone": "(555) 123-4567",
            "incident_description": "Rear-ended at a red light causing bumper damage to my sedan",
        }
        for qid, answer in answers.items():
            checker.record_answer(qid, answer, True)
        assert checker.all_top_level_answered() is True
        assert checker.all_branch_answered() is False
        assert checker.is_complete() is False

    def test_all_auto_branch_answered(self, checker):
        # Set up top-level
        checker.record_answer("claim_type", "auto", True)
        # Answer branch questions
        checker.record_answer("auto_vehicle_info", "2021 Honda Civic", True)
        checker.record_answer("auto_other_parties", "No other parties involved", True)
        checker.record_answer("auto_police_report", "No police report filed", True)
        assert checker.all_branch_answered() is True

    def test_partial_branch_not_complete(self, checker):
        checker.record_answer("claim_type", "property", True)
        checker.record_answer("property_address", "123 Main St, Springfield, IL", True)
        # Only 1 of 3 branch questions answered
        assert checker.all_branch_answered() is False


class TestClarifyingQuestionsAndCompleteness:
    """Clarifying questions count toward completeness once resolved."""

    def test_clarified_answer_counts(self, checker):
        # First attempt fails
        checker.record_answer("incident_date", "recently", False)
        assert "incident_date" not in checker.answers
        # Second attempt succeeds
        checker.record_answer("incident_date", "March 15, 2024", True)
        assert "incident_date" in checker.answers

    def test_multiple_clarifications_still_complete(self, checker):
        # Simulate multiple failed attempts followed by success
        checker.record_answer("policy_number", "ABC", False)
        checker.record_answer("policy_number", "12", False)
        checker.record_answer("policy_number", "POL12345678", True)
        assert checker.answers["policy_number"] == "POL12345678"


class TestFinalSummary:
    """Final summary should include all collected data."""

    def test_summary_includes_all_answers(self, checker):
        answers = {
            "claim_type": "auto",
            "incident_date": "March 15, 2024",
            "policy_number": "POL12345678",
            "claimant_name": "John Smith",
            "contact_phone": "(555) 123-4567",
            "incident_description": "Rear-ended at a red light causing significant damage",
        }
        for qid, answer in answers.items():
            checker.record_answer(qid, answer, True)

        summary = checker.get_summary()
        for qid, answer in answers.items():
            assert qid in summary
            assert summary[qid] == answer

    def test_summary_only_includes_valid_answers(self, checker):
        checker.record_answer("claim_type", "auto", True)
        checker.record_answer("incident_date", "recently", False)
        checker.record_answer("incident_date", "March 15, 2024", True)

        summary = checker.get_summary()
        assert summary["incident_date"] == "March 15, 2024"
        assert "recently" not in summary.values()


class TestMissingAnswersReported:
    """Missing answers should be identified and reported."""

    def test_all_missing_initially(self, checker):
        missing = checker.get_missing_questions()
        top_level_ids = [q["id"] for q in TOP_LEVEL_QUESTIONS]
        for qid in top_level_ids:
            assert qid in missing

    def test_missing_decreases_as_answers_provided(self, checker):
        initial_missing = len(checker.get_missing_questions())
        checker.record_answer("claim_type", "health", True)
        new_missing = checker.get_missing_questions()
        # Now includes branch questions too
        assert "claim_type" not in new_missing

    def test_complete_session_has_no_missing(self, checker):
        all_answers = {
            "claim_type": "auto",
            "incident_date": "March 15, 2024",
            "policy_number": "POL12345678",
            "claimant_name": "John Smith",
            "contact_phone": "(555) 123-4567",
            "incident_description": "Rear-ended at a red light causing bumper and trunk damage to my car",
            "auto_vehicle_info": "2021 Honda Civic LX",
            "auto_other_parties": "Blue Ford Focus, exchanged info",
            "auto_police_report": "Yes, report number PR-2024-001",
        }
        for qid, answer in all_answers.items():
            checker.record_answer(qid, answer, True)

        assert checker.is_complete() is True
        assert checker.get_missing_questions() == []
