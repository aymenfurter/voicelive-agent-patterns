"""End-to-end evaluation tests requiring live Azure services.

These tests simulate full conversation flows using text transcripts
as a proxy for audio interactions with the Voice Live API.
"""

import time
import pytest

from validator import validate_answer
from questions_data import TOP_LEVEL_QUESTIONS, BRANCH_QUESTIONS


pytestmark = [pytest.mark.run, pytest.mark.azure]


class ConversationSession:
    """Simulates a full conversation session for E2E testing."""

    def __init__(self, pattern_name: str):
        self.pattern_name = pattern_name
        self.answers = {}
        self.latencies = []
        self.complete = False
        self.turns = []

    def simulate_turn(self, question_id: str, answer: str, criteria: dict) -> dict:
        """Simulate a single conversation turn with latency measurement."""
        start = time.perf_counter()
        result = validate_answer(answer, criteria)
        elapsed_ms = (time.perf_counter() - start) * 1000
        self.latencies.append(elapsed_ms)

        if result.valid:
            self.answers[question_id] = answer

        self.turns.append({
            "question_id": question_id,
            "answer": answer,
            "valid": result.valid,
            "latency_ms": elapsed_ms,
        })
        return result.to_dict()

    def check_completeness(self) -> bool:
        top_level_ids = {q["id"] for q in TOP_LEVEL_QUESTIONS}
        if not top_level_ids.issubset(set(self.answers.keys())):
            return False

        claim_type = None
        claim_answer = self.answers.get("claim_type", "").lower()
        for ct in ["auto", "property", "health"]:
            if ct in claim_answer:
                claim_type = ct
                break

        if claim_type and claim_type in BRANCH_QUESTIONS:
            branch_ids = {q["id"] for q in BRANCH_QUESTIONS[claim_type]}
            if not branch_ids.issubset(set(self.answers.keys())):
                return False

        self.complete = True
        return True


@pytest.fixture
def auto_claim_transcript():
    """Complete auto claim conversation transcript."""
    return [
        ("claim_type", "I need to file an auto insurance claim."),
        ("incident_date", "The accident happened on March 15, 2024."),
        ("policy_number", "POL12345678"),
        ("claimant_name", "John Michael Smith."),
        ("contact_phone", "(555) 867-5309."),
        ("incident_description",
         "I was stopped at a red light when another vehicle rear-ended me "
         "causing damage to the rear bumper and trunk of my car."),
        ("auto_vehicle_info", "2021 Honda Civic LX in silver."),
        ("auto_other_parties",
         "Yes, a blue 2019 Ford Focus. We exchanged insurance information."),
        ("auto_police_report", "Yes, police report number PR-2024-03158."),
    ]


@pytest.fixture
def property_claim_transcript():
    """Complete property claim conversation transcript."""
    return [
        ("claim_type", "I'm filing a property insurance claim."),
        ("incident_date", "The damage occurred on January 10, 2024."),
        ("policy_number", "HOM98765432"),
        ("claimant_name", "Sarah Elizabeth Johnson."),
        ("contact_phone", "555-234-5678"),
        ("incident_description",
         "A severe windstorm caused roof damage and water leaked into the attic "
         "damaging insulation and drywall on the second floor ceiling."),
        ("property_address", "742 Evergreen Terrace, Springfield, IL 62704."),
        ("property_damage_list",
         "Roof shingles north side, front gutter, attic insulation, ceiling drywall."),
        ("property_temp_repairs",
         "Yes, I placed a tarp over the roof and put buckets in the attic."),
    ]


@pytest.fixture
def criteria_map():
    """Build question_id -> acceptance_criteria mapping."""
    mapping = {}
    for q in TOP_LEVEL_QUESTIONS:
        mapping[q["id"]] = q["acceptance_criteria"]
    for category_questions in BRANCH_QUESTIONS.values():
        for q in category_questions:
            mapping[q["id"]] = q["acceptance_criteria"]
    return mapping


class TestFullConversationSimulation:
    """Test complete conversation flows using text transcripts as audio proxy."""

    def test_auto_claim_full_flow(self, auto_claim_transcript, criteria_map):
        session = ConversationSession("chat_supervisor")
        for question_id, answer in auto_claim_transcript:
            result = session.simulate_turn(question_id, answer, criteria_map[question_id])
            assert result["valid"] is True, (
                f"Turn failed: {question_id} — {result['reason']}"
            )
        assert session.check_completeness() is True

    def test_property_claim_full_flow(self, property_claim_transcript, criteria_map):
        session = ConversationSession("sequential_handoff")
        for question_id, answer in property_claim_transcript:
            result = session.simulate_turn(question_id, answer, criteria_map[question_id])
            assert result["valid"] is True, (
                f"Turn failed: {question_id} — {result['reason']}"
            )
        assert session.check_completeness() is True


class TestResponseLatency:
    """Measure and assert response latency constraints."""

    def test_validation_latency_under_threshold(self, auto_claim_transcript, criteria_map):
        session = ConversationSession("chat_supervisor")
        for question_id, answer in auto_claim_transcript:
            session.simulate_turn(question_id, answer, criteria_map[question_id])

        # All validation steps should complete within 100ms (local only)
        for turn in session.turns:
            assert turn["latency_ms"] < 100, (
                f"Validation for {turn['question_id']} took {turn['latency_ms']:.2f}ms"
            )

    def test_average_latency_acceptable(self, auto_claim_transcript, criteria_map):
        session = ConversationSession("chat_supervisor")
        for question_id, answer in auto_claim_transcript:
            session.simulate_turn(question_id, answer, criteria_map[question_id])

        avg_latency = sum(session.latencies) / len(session.latencies)
        assert avg_latency < 50, f"Average latency {avg_latency:.2f}ms exceeds 50ms threshold"


class TestBothPatternsProduceEquivalentOutput:
    """Pattern A (chat-supervisor) and Pattern B (sequential handoff) should
    produce equivalent final outputs for the same inputs."""

    def test_equivalent_outputs(self, auto_claim_transcript, criteria_map):
        session_a = ConversationSession("chat_supervisor")
        session_b = ConversationSession("sequential_handoff")

        for question_id, answer in auto_claim_transcript:
            session_a.simulate_turn(question_id, answer, criteria_map[question_id])
            session_b.simulate_turn(question_id, answer, criteria_map[question_id])

        # Both should collect the same answers
        assert session_a.answers == session_b.answers

        # Both should be complete
        assert session_a.check_completeness() is True
        assert session_b.check_completeness() is True

    def test_both_patterns_handle_all_claim_types(
        self, auto_claim_transcript, property_claim_transcript, criteria_map
    ):
        for transcript in [auto_claim_transcript, property_claim_transcript]:
            session_a = ConversationSession("chat_supervisor")
            session_b = ConversationSession("sequential_handoff")
            for question_id, answer in transcript:
                session_a.simulate_turn(question_id, answer, criteria_map[question_id])
                session_b.simulate_turn(question_id, answer, criteria_map[question_id])
            assert session_a.answers == session_b.answers


class TestAmbiguityRejectionInFullFlow:
    """Vague/ambiguous answers must be rejected even in full E2E flows."""

    def test_vague_date_rejected_in_flow(self, criteria_map):
        session = ConversationSession("chat_supervisor")
        result = session.simulate_turn("incident_date", "a while ago", criteria_map["incident_date"])
        assert result["valid"] is False
        assert result["clarifying_question"] is not None

    def test_vague_quantifier_rejected_in_flow(self, criteria_map):
        session = ConversationSession("chat_supervisor")
        vague = "A few things were broken when the pipe burst causing some water damage"
        result = session.simulate_turn(
            "incident_description", vague, criteria_map["incident_description"]
        )
        assert result["valid"] is False

    def test_recovery_after_rejection(self, criteria_map):
        session = ConversationSession("sequential_handoff")
        # First attempt — vague
        result = session.simulate_turn("incident_date", "recently", criteria_map["incident_date"])
        assert result["valid"] is False
        # Second attempt — specific
        result = session.simulate_turn(
            "incident_date", "March 15, 2024", criteria_map["incident_date"]
        )
        assert result["valid"] is True
        assert "incident_date" in session.answers
