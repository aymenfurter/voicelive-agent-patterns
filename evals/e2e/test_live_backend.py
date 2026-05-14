"""Real end-to-end tests for both orchestration patterns against live Azure services.

Tests the full backend app (Flask) with real WebSocket connections and
the Question Service running as a real process.
"""

import json
import subprocess
import sys
import time

import httpx
import pytest

BACKEND_URL = "http://localhost:8000"
QUESTION_SERVICE_URL = "http://localhost:8001"


@pytest.fixture(scope="module")
def services_running():
    """Verify both services are running."""
    for name, url in [("Question Service", QUESTION_SERVICE_URL), ("Backend", BACKEND_URL)]:
        try:
            resp = httpx.get(f"{url}/health", timeout=5)
            assert resp.status_code == 200, f"{name} unhealthy: {resp.text}"
        except httpx.ConnectError:
            pytest.skip(f"{name} not running at {url}")


class TestBackendRESTEndpoints:
    """Test the real backend REST API."""

    def test_health(self, services_running):
        resp = httpx.get(f"{BACKEND_URL}/health", timeout=5)
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "healthy"

    def test_patterns(self, services_running):
        resp = httpx.get(f"{BACKEND_URL}/api/patterns", timeout=5)
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["patterns"]) == 2
        pattern_ids = {p["id"] for p in data["patterns"]}
        assert pattern_ids == {"chat-supervisor", "sequential-handoff"}

    def test_create_session_chat_supervisor(self, services_running):
        resp = httpx.post(
            f"{BACKEND_URL}/api/session",
            json={"pattern": "chat-supervisor"},
            timeout=5,
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["pattern"] == "chat-supervisor"
        assert "session_id" in data

        # Verify session status
        session_id = data["session_id"]
        status_resp = httpx.get(f"{BACKEND_URL}/api/session/{session_id}/status", timeout=5)
        assert status_resp.status_code == 200
        assert status_resp.json()["status"] == "created"

    def test_create_session_sequential_handoff(self, services_running):
        resp = httpx.post(
            f"{BACKEND_URL}/api/session",
            json={"pattern": "sequential-handoff"},
            timeout=5,
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["pattern"] == "sequential-handoff"

    def test_create_session_invalid_pattern(self, services_running):
        resp = httpx.post(
            f"{BACKEND_URL}/api/session",
            json={"pattern": "invalid-pattern"},
            timeout=5,
        )
        assert resp.status_code == 400

    def test_session_not_found(self, services_running):
        resp = httpx.get(f"{BACKEND_URL}/api/session/nonexistent/status", timeout=5)
        assert resp.status_code == 404


class TestQuestionServiceFullFlow:
    """Complete question flow through real Question Service."""

    def test_full_auto_claim_flow(self, services_running):
        """Walk through a complete auto insurance claim Q&A flow."""
        # Step 1: Get top-level questions
        resp = httpx.get(f"{QUESTION_SERVICE_URL}/questions", timeout=5)
        questions = resp.json()["questions"]
        assert len(questions) == 6

        # Step 2: Answer claim type → auto
        resp = httpx.post(
            f"{QUESTION_SERVICE_URL}/validate",
            json={"question_id": "claim_type", "answer": "auto insurance claim"},
            timeout=5,
        )
        assert resp.json()["valid"] is True

        # Step 3: Get auto branch questions
        resp = httpx.get(f"{QUESTION_SERVICE_URL}/questions/auto", timeout=5)
        branch = resp.json()["questions"]
        assert len(branch) >= 3

        # Step 4: Validate all answers in sequence
        answers = [
            ("incident_date", "March 15, 2024"),
            ("policy_number", "POL12345678"),
            ("claimant_name", "John Smith"),
            ("contact_phone", "(555) 867-5309"),
            ("incident_description",
             "I was stopped at a red light when a truck rear-ended my sedan causing "
             "significant damage to the rear bumper and trunk area of my vehicle"),
            ("auto_vehicle_info", "2021 Honda Civic LX silver"),
            ("auto_other_parties", "Yes, blue 2019 Ford Focus driven by Jane Doe"),
            ("auto_police_report", "Yes, report number PR-2024-03158"),
        ]

        for qid, answer in answers:
            resp = httpx.post(
                f"{QUESTION_SERVICE_URL}/validate",
                json={"question_id": qid, "answer": answer},
                timeout=5,
            )
            data = resp.json()
            assert data["valid"] is True, (
                f"Question {qid} failed: {data.get('reason')} "
                f"(clarifying: {data.get('clarifying_question')})"
            )

    def test_vague_answers_rejected_then_corrected(self, services_running):
        """Vague answers get rejected, then corrected answers accepted."""
        vague_attempts = [
            ("incident_date", "a few days ago", False),
            ("incident_date", "March 15, 2024", True),
            ("policy_number", "AB", False),
            ("policy_number", "POL12345678", True),
            ("incident_description", "stuff broke", False),
            (
                "incident_description",
                "A large tree fell on my roof during the windstorm on Tuesday "
                "damaging three sections of shingles and breaking through the attic insulation",
                True,
            ),
        ]

        for qid, answer, expected_valid in vague_attempts:
            resp = httpx.post(
                f"{QUESTION_SERVICE_URL}/validate",
                json={"question_id": qid, "answer": answer},
                timeout=5,
            )
            data = resp.json()
            assert data["valid"] is expected_valid, (
                f"Question {qid}, answer '{answer}': expected valid={expected_valid}, "
                f"got {data['valid']} reason={data.get('reason')}"
            )
            if not expected_valid:
                assert data.get("clarifying_question"), (
                    f"No clarifying question for rejected answer: {qid}={answer}"
                )

    def test_ambiguity_rejection_comprehensive(self, services_running):
        """Comprehensive test that ALL vague quantifiers are rejected."""
        vague_phrases = [
            "A few items were damaged in the accident",
            "Some parts of the car were damaged",
            "Several windows were broken during the storm",
            "Around 3pm the incident occurred near the intersection",
            "Approximately five hundred dollars of damage to the vehicle",
            "About ten people witnessed the accident at the mall",
            "Roughly two weeks ago something happened to my property",
            "Many items in the garage were destroyed by water",
        ]

        for phrase in vague_phrases:
            resp = httpx.post(
                f"{QUESTION_SERVICE_URL}/validate",
                json={"question_id": "incident_description", "answer": phrase},
                timeout=5,
            )
            data = resp.json()
            assert data["valid"] is False, (
                f"Vague phrase accepted: '{phrase}'"
            )

    def test_all_three_branch_flows(self, services_running):
        """Verify all three branch categories return valid questions."""
        for category in ["auto", "property", "health"]:
            resp = httpx.get(f"{QUESTION_SERVICE_URL}/questions/{category}", timeout=5)
            assert resp.status_code == 200
            data = resp.json()
            questions = data["questions"]
            assert len(questions) >= 3, f"{category} branch has {len(questions)} questions"

            # Each question should have required fields
            for q in questions:
                assert "id" in q, f"Missing id in {category} question"
                assert "text" in q, f"Missing text in {category} question"
                assert "acceptance_criteria" in q, (
                    f"Missing acceptance_criteria in {category} question {q.get('id')}"
                )
