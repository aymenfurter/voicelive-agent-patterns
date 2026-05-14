"""Unit tests for the Question Service endpoints and data."""

import os

import pytest
from questions_data import BRANCH_QUESTIONS, GLOSSARY, TOP_LEVEL_QUESTIONS

pytestmark = pytest.mark.crawl

REQUIRED_QUESTION_FIELDS = {"id", "text", "category", "acceptance_criteria", "order"}


class TestTopLevelQuestions:
    """Tests for top-level question data."""

    def test_returns_six_top_level_questions(self):
        assert len(TOP_LEVEL_QUESTIONS) == 6

    def test_questions_have_required_fields(self):
        for question in TOP_LEVEL_QUESTIONS:
            missing = REQUIRED_QUESTION_FIELDS - set(question.keys())
            assert not missing, f"Question '{question.get('id', '?')}' missing fields: {missing}"

    def test_questions_ordered_correctly(self):
        orders = [q["order"] for q in TOP_LEVEL_QUESTIONS]
        assert orders == sorted(orders), "Questions are not in ascending order"
        assert orders == list(range(1, 7)), "Question orders should be 1 through 6"

    def test_each_question_has_unique_id(self):
        ids = [q["id"] for q in TOP_LEVEL_QUESTIONS]
        assert len(ids) == len(set(ids)), "Duplicate question IDs found"

    def test_all_questions_have_general_category(self):
        for question in TOP_LEVEL_QUESTIONS:
            assert question["category"] == "general"


class TestBranchQuestions:
    """Tests for branch (category-specific) questions."""

    @pytest.mark.parametrize("category", ["auto", "property", "health"])
    def test_branch_category_exists(self, category):
        assert category in BRANCH_QUESTIONS

    @pytest.mark.parametrize("category,expected_count", [
        ("auto", 6),
        ("property", 3),
        ("health", 3),
    ])
    def test_branch_question_count(self, category, expected_count):
        assert len(BRANCH_QUESTIONS[category]) == expected_count

    @pytest.mark.parametrize("category", ["auto", "property", "health"])
    def test_branch_questions_have_required_fields(self, category):
        for question in BRANCH_QUESTIONS[category]:
            missing = REQUIRED_QUESTION_FIELDS - set(question.keys())
            assert not missing, (
                f"Branch question '{question.get('id', '?')}' missing fields: {missing}"
            )

    @pytest.mark.parametrize("category", ["auto", "property", "health"])
    def test_branch_questions_ordered_correctly(self, category):
        orders = [q["order"] for q in BRANCH_QUESTIONS[category]]
        assert orders == sorted(orders)

    @pytest.mark.parametrize("category", ["auto", "property", "health"])
    def test_branch_questions_have_correct_category(self, category):
        for question in BRANCH_QUESTIONS[category]:
            assert question["category"] == category

    def test_invalid_category_not_in_branch_questions(self):
        assert "fire" not in BRANCH_QUESTIONS
        assert "dental" not in BRANCH_QUESTIONS
        assert "" not in BRANCH_QUESTIONS


class TestGlossary:
    """Tests for the glossary endpoint data."""

    def test_glossary_returns_terms(self):
        assert len(GLOSSARY) > 0

    def test_glossary_has_string_values(self):
        for term, definition in GLOSSARY.items():
            assert isinstance(term, str) and len(term) > 0
            assert isinstance(definition, str) and len(definition) > 0

    @pytest.mark.parametrize("term", [
        "policyholder", "claimant", "deductible", "premium",
    ])
    def test_glossary_contains_key_terms(self, term):
        assert term in GLOSSARY


class TestFlaskApp:
    """Tests for the Flask app endpoints using the test client."""

    @pytest.fixture
    def client(self):
        import sys
        # Ensure we import the question-service app, not backend app
        qs_path = os.path.join(os.path.dirname(__file__), '..', '..', 'question-service')
        sys.path.insert(0, os.path.abspath(qs_path))
        if "app" in sys.modules:
            del sys.modules["app"]
        import app as qs_app
        qs_app.app.config["TESTING"] = True
        with qs_app.app.test_client() as client:
            yield client

    def test_health_check(self, client):
        response = client.get("/health")
        assert response.status_code == 200
        data = response.get_json()
        assert data["status"] == "healthy"

    def test_get_top_level_questions(self, client):
        response = client.get("/questions")
        assert response.status_code == 200
        data = response.get_json()
        assert "questions" in data
        assert len(data["questions"]) == 6

    @pytest.mark.parametrize("category,expected_count", [
        ("auto", 6),
        ("property", 3),
        ("health", 3),
    ])
    def test_get_branch_questions(self, client, category, expected_count):
        response = client.get(f"/questions/{category}")
        assert response.status_code == 200
        data = response.get_json()
        assert data["category"] == category
        assert len(data["questions"]) == expected_count

    def test_invalid_category_returns_404(self, client):
        response = client.get("/questions/fire")
        assert response.status_code == 404
        data = response.get_json()
        assert "error" in data

    def test_glossary_endpoint(self, client):
        response = client.get("/glossary")
        assert response.status_code == 200
        data = response.get_json()
        assert "glossary" in data
        assert len(data["glossary"]) > 0
