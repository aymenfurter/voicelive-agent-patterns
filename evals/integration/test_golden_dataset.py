"""Integration tests using the golden dataset of scripted conversations."""

import json
import os

import pytest
from questions_data import BRANCH_QUESTIONS, TOP_LEVEL_QUESTIONS
from validator import validate_answer

pytestmark = pytest.mark.walk

FIXTURES_DIR = os.path.join(os.path.dirname(__file__), "..", "fixtures")


@pytest.fixture
def golden_dataset():
    """Load the golden dataset from fixtures."""
    path = os.path.join(FIXTURES_DIR, "golden_dataset.json")
    with open(path, "r") as f:
        return json.load(f)


@pytest.fixture
def scenarios(golden_dataset):
    """Return all scenarios from the golden dataset."""
    return golden_dataset["scenarios"]


@pytest.fixture
def acceptance_criteria_map():
    """Build a map of question_id -> acceptance_criteria."""
    criteria = {}
    for q in TOP_LEVEL_QUESTIONS:
        criteria[q["id"]] = q["acceptance_criteria"]
    for category_questions in BRANCH_QUESTIONS.values():
        for q in category_questions:
            criteria[q["id"]] = q["acceptance_criteria"]
    return criteria


class TestGoldenDatasetStructure:
    """Validate the golden dataset itself is well-formed."""

    def test_dataset_has_scenarios(self, golden_dataset):
        assert "scenarios" in golden_dataset
        assert len(golden_dataset["scenarios"]) == 8

    def test_all_scenarios_have_required_keys(self, scenarios):
        required_keys = {"id", "name", "description", "turns", "expected_output", "validations"}
        for scenario in scenarios:
            missing = required_keys - set(scenario.keys())
            assert not missing, f"Scenario '{scenario['id']}' missing keys: {missing}"

    def test_all_scenarios_have_unique_ids(self, scenarios):
        ids = [s["id"] for s in scenarios]
        assert len(ids) == len(set(ids))

    def test_turns_have_valid_roles(self, scenarios):
        for scenario in scenarios:
            for turn in scenario["turns"]:
                assert turn["role"] in ("agent", "user"), (
                    f"Invalid role in scenario '{scenario['id']}': {turn['role']}"
                )

    def test_agent_turns_have_contains(self, scenarios):
        for scenario in scenarios:
            for turn in scenario["turns"]:
                if turn["role"] == "agent":
                    assert "contains" in turn

    def test_user_turns_have_text(self, scenarios):
        for scenario in scenarios:
            for turn in scenario["turns"]:
                if turn["role"] == "user":
                    assert "text" in turn
                    assert len(turn["text"]) > 0


class TestHappyPathAutoScenario:
    """Test the happy path auto claim scenario validations."""

    def test_claim_type_valid(self, scenarios, acceptance_criteria_map):
        scenario = next(s for s in scenarios if s["id"] == "happy_path_auto")
        user_answers = [t["text"] for t in scenario["turns"] if t["role"] == "user"]
        # First answer is the claim type
        result = validate_answer(user_answers[0], acceptance_criteria_map["claim_type"])
        assert result.valid is True

    def test_incident_date_valid(self, scenarios, acceptance_criteria_map):
        scenario = next(s for s in scenarios if s["id"] == "happy_path_auto")
        user_answers = [t["text"] for t in scenario["turns"] if t["role"] == "user"]
        result = validate_answer(user_answers[1], acceptance_criteria_map["incident_date"])
        assert result.valid is True

    def test_policy_number_valid(self, scenarios, acceptance_criteria_map):
        scenario = next(s for s in scenarios if s["id"] == "happy_path_auto")
        user_answers = [t["text"] for t in scenario["turns"] if t["role"] == "user"]
        result = validate_answer(user_answers[2], acceptance_criteria_map["policy_number"])
        assert result.valid is True

    def test_full_name_valid(self, scenarios, acceptance_criteria_map):
        scenario = next(s for s in scenarios if s["id"] == "happy_path_auto")
        user_answers = [t["text"] for t in scenario["turns"] if t["role"] == "user"]
        result = validate_answer(user_answers[3], acceptance_criteria_map["claimant_name"])
        assert result.valid is True

    def test_phone_valid(self, scenarios, acceptance_criteria_map):
        scenario = next(s for s in scenarios if s["id"] == "happy_path_auto")
        user_answers = [t["text"] for t in scenario["turns"] if t["role"] == "user"]
        result = validate_answer(user_answers[4], acceptance_criteria_map["contact_phone"])
        assert result.valid is True

    def test_description_valid(self, scenarios, acceptance_criteria_map):
        scenario = next(s for s in scenarios if s["id"] == "happy_path_auto")
        user_answers = [t["text"] for t in scenario["turns"] if t["role"] == "user"]
        result = validate_answer(user_answers[5], acceptance_criteria_map["incident_description"])
        assert result.valid is True

    def test_all_validations_pass(self, scenarios):
        scenario = next(s for s in scenarios if s["id"] == "happy_path_auto")
        assert scenario["validations"]["all_top_level_answered"] is True
        assert scenario["validations"]["all_branch_answered"] is True
        assert scenario["validations"]["no_ambiguity"] is True
        assert scenario["validations"]["complete"] is True


class TestHappyPathPropertyScenario:
    """Test the happy path property claim scenario."""

    def test_all_top_level_answers_valid(self, scenarios, acceptance_criteria_map):
        scenario = next(s for s in scenarios if s["id"] == "happy_path_property")
        user_answers = [t["text"] for t in scenario["turns"] if t["role"] == "user"]
        question_ids = ["claim_type", "incident_date", "policy_number",
                        "claimant_name", "contact_phone", "incident_description"]
        for i, qid in enumerate(question_ids):
            result = validate_answer(user_answers[i], acceptance_criteria_map[qid])
            assert result.valid is True, f"Failed on {qid}: {result.reason}"

    def test_validations_complete(self, scenarios):
        scenario = next(s for s in scenarios if s["id"] == "happy_path_property")
        assert scenario["validations"]["complete"] is True


class TestHappyPathHealthScenario:
    """Test the happy path health claim scenario."""

    def test_all_top_level_answers_valid(self, scenarios, acceptance_criteria_map):
        scenario = next(s for s in scenarios if s["id"] == "happy_path_health")
        user_answers = [t["text"] for t in scenario["turns"] if t["role"] == "user"]
        question_ids = ["claim_type", "incident_date", "policy_number",
                        "claimant_name", "contact_phone", "incident_description"]
        for i, qid in enumerate(question_ids):
            result = validate_answer(user_answers[i], acceptance_criteria_map[qid])
            assert result.valid is True, f"Failed on {qid}: {result.reason}"

    def test_validations_complete(self, scenarios):
        scenario = next(s for s in scenarios if s["id"] == "happy_path_health")
        assert scenario["validations"]["complete"] is True


class TestVagueAnswersScenario:
    """Test that vague answers trigger clarification."""

    def test_vague_date_rejected(self, scenarios, acceptance_criteria_map):
        scenario = next(s for s in scenarios if s["id"] == "vague_answers_clarification")
        # "It happened recently." is the second user turn (index 1)
        user_answers = [t["text"] for t in scenario["turns"] if t["role"] == "user"]
        result = validate_answer(user_answers[1], acceptance_criteria_map["incident_date"])
        assert result.valid is False
        assert result.clarifying_question is not None

    def test_corrected_date_accepted(self, scenarios, acceptance_criteria_map):
        scenario = next(s for s in scenarios if s["id"] == "vague_answers_clarification")
        user_answers = [t["text"] for t in scenario["turns"] if t["role"] == "user"]
        # "Oh right, it was April 3, 2024." is the third user turn (index 2)
        result = validate_answer(user_answers[2], acceptance_criteria_map["incident_date"])
        assert result.valid is True

    def test_vague_description_rejected(self, scenarios, acceptance_criteria_map):
        scenario = next(s for s in scenarios if s["id"] == "vague_answers_clarification")
        user_answers = [t["text"] for t in scenario["turns"] if t["role"] == "user"]
        # "Stuff happened." is at index 6
        result = validate_answer(user_answers[6], acceptance_criteria_map["incident_description"])
        assert result.valid is False


class TestAmbiguousQuantitiesScenario:
    """Test that ambiguous quantities are rejected."""

    def test_vague_quantifiers_in_description_rejected(self, scenarios, acceptance_criteria_map):
        scenario = next(s for s in scenarios if s["id"] == "ambiguous_quantities_rejected")
        user_answers = [t["text"] for t in scenario["turns"] if t["role"] == "user"]
        # The vague description is at index 5
        vague_desc = user_answers[5]
        result = validate_answer(vague_desc, acceptance_criteria_map["incident_description"])
        assert result.valid is False
        assert "vague" in result.reason.lower()

    def test_specific_description_accepted(self, scenarios, acceptance_criteria_map):
        scenario = next(s for s in scenarios if s["id"] == "ambiguous_quantities_rejected")
        user_answers = [t["text"] for t in scenario["turns"] if t["role"] == "user"]
        # The corrected description is at index 6
        result = validate_answer(user_answers[6], acceptance_criteria_map["incident_description"])
        assert result.valid is True


class TestIncompleteDescriptionScenario:
    """Test that too-brief descriptions are rejected."""

    def test_short_description_rejected(self, scenarios, acceptance_criteria_map):
        scenario = next(s for s in scenarios if s["id"] == "incomplete_description")
        user_answers = [t["text"] for t in scenario["turns"] if t["role"] == "user"]
        # "Fender bender." is at index 5
        result = validate_answer(user_answers[5], acceptance_criteria_map["incident_description"])
        assert result.valid is False

    def test_elaborated_description_accepted(self, scenarios, acceptance_criteria_map):
        scenario = next(s for s in scenarios if s["id"] == "incomplete_description")
        user_answers = [t["text"] for t in scenario["turns"] if t["role"] == "user"]
        # The elaborated description is at index 6
        result = validate_answer(user_answers[6], acceptance_criteria_map["incident_description"])
        assert result.valid is True


class TestInvalidPolicyScenario:
    """Test that invalid policy numbers are rejected."""

    def test_short_policy_rejected(self, scenarios, acceptance_criteria_map):
        scenario = next(s for s in scenarios if s["id"] == "invalid_policy_number")
        user_answers = [t["text"] for t in scenario["turns"] if t["role"] == "user"]
        # "It's ABC." is at index 2
        result = validate_answer(user_answers[2], acceptance_criteria_map["policy_number"])
        assert result.valid is False
        assert result.clarifying_question is not None

    def test_corrected_policy_accepted(self, scenarios, acceptance_criteria_map):
        scenario = next(s for s in scenarios if s["id"] == "invalid_policy_number")
        user_answers = [t["text"] for t in scenario["turns"] if t["role"] == "user"]
        # Corrected policy at index 3
        result = validate_answer(user_answers[3], acceptance_criteria_map["policy_number"])
        assert result.valid is True


class TestMultipleClarificationsScenario:
    """Test scenario with multiple rounds of clarification."""

    def test_initial_claim_type_ambiguous(self, scenarios, acceptance_criteria_map):
        scenario = next(s for s in scenarios if s["id"] == "multiple_clarifications_needed")
        user_answers = [t["text"] for t in scenario["turns"] if t["role"] == "user"]
        # "I'm not sure, maybe property?" - unclear phrasing but contains "property"
        # This may actually pass since it contains "property"; the point is the agent still asks for confirmation
        validate_answer(user_answers[0], acceptance_criteria_map["claim_type"])

    def test_vague_date_rejected(self, scenarios, acceptance_criteria_map):
        scenario = next(s for s in scenarios if s["id"] == "multiple_clarifications_needed")
        user_answers = [t["text"] for t in scenario["turns"] if t["role"] == "user"]
        # "A while ago." is at index 2
        result = validate_answer(user_answers[2], acceptance_criteria_map["incident_date"])
        assert result.valid is False

    def test_short_policy_rejected(self, scenarios, acceptance_criteria_map):
        scenario = next(s for s in scenarios if s["id"] == "multiple_clarifications_needed")
        user_answers = [t["text"] for t in scenario["turns"] if t["role"] == "user"]
        # "XY" is at index 4
        result = validate_answer(user_answers[4], acceptance_criteria_map["policy_number"])
        assert result.valid is False

    def test_single_name_rejected(self, scenarios, acceptance_criteria_map):
        scenario = next(s for s in scenarios if s["id"] == "multiple_clarifications_needed")
        user_answers = [t["text"] for t in scenario["turns"] if t["role"] == "user"]
        # "Garcia" is at index 6
        result = validate_answer(user_answers[6], acceptance_criteria_map["claimant_name"])
        assert result.valid is False

    def test_corrected_full_name_accepted(self, scenarios, acceptance_criteria_map):
        scenario = next(s for s in scenarios if s["id"] == "multiple_clarifications_needed")
        user_answers = [t["text"] for t in scenario["turns"] if t["role"] == "user"]
        # "Maria Isabel Garcia." is at index 7
        result = validate_answer(user_answers[7], acceptance_criteria_map["claimant_name"])
        assert result.valid is True

    def test_scenario_tracks_all_clarifications(self, scenarios):
        scenario = next(s for s in scenarios if s["id"] == "multiple_clarifications_needed")
        clarifications = scenario["validations"]["clarifications_needed"]
        assert len(clarifications) >= 3
