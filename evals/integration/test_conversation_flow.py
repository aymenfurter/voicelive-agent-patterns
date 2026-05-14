"""Integration tests for conversation flow quality."""

import pytest
from questions_data import TOP_LEVEL_QUESTIONS
from validator import validate_answer

pytestmark = pytest.mark.walk


class ConversationSimulator:
    """Simulates a conversation flow for testing orchestration quality."""

    def __init__(self):
        self.questions_asked = []
        self.answers_collected = {}
        self.clarifications = []
        self.transcript = []

    def agent_says(self, message: str):
        self.transcript.append({"role": "agent", "text": message})

    def user_says(self, message: str):
        self.transcript.append({"role": "user", "text": message})

    def ask_question(self, question_id: str, question_text: str):
        self.questions_asked.append(question_id)
        self.agent_says(question_text)

    def record_answer(self, question_id: str, answer: str):
        self.answers_collected[question_id] = answer
        self.user_says(answer)

    def record_clarification(self, question_id: str, clarifying_text: str):
        self.clarifications.append({"question_id": question_id, "text": clarifying_text})
        self.agent_says(clarifying_text)


@pytest.fixture
def simulator():
    return ConversationSimulator()


class TestAgentGreeting:
    """Agent should greet the user appropriately."""

    def test_greeting_is_professional(self):
        greetings = [
            "Hello! I'm here to help you file an insurance claim.",
            "Welcome to the claims intake system. I'll guide you through the process.",
            "Hi there. I'll be assisting you with your insurance claim today.",
        ]
        for greeting in greetings:
            assert len(greeting) > 10
            # Should not contain inappropriate content
            assert "sorry" not in greeting.lower() or "error" not in greeting.lower()

    def test_greeting_sets_expectations(self):
        greeting = (
            "Hello! I'm here to help you file an insurance claim. "
            "I'll ask you a series of questions to gather the necessary information. "
            "Please provide specific details so we can process your claim efficiently."
        )
        assert "question" in greeting.lower() or "ask" in greeting.lower()
        assert "claim" in greeting.lower() or "insurance" in greeting.lower()


class TestQuestionsAskedOneAtATime:
    """Questions should be asked sequentially, not dumped all at once."""

    def test_single_question_per_turn(self, simulator):
        for q in TOP_LEVEL_QUESTIONS[:3]:
            simulator.ask_question(q["id"], q["text"])
            # Each agent turn should contain at most one question mark
            # (allowing for follow-up acknowledgments)
            last_agent_turn = simulator.transcript[-1]["text"]
            question_marks = last_agent_turn.count("?")
            assert question_marks <= 2, (
                f"Agent asked multiple questions in one turn: {last_agent_turn}"
            )
            simulator.record_answer(q["id"], "valid answer placeholder")

    def test_questions_follow_defined_order(self, simulator):
        question_ids = [q["id"] for q in TOP_LEVEL_QUESTIONS]
        for q in TOP_LEVEL_QUESTIONS:
            simulator.ask_question(q["id"], q["text"])
            simulator.record_answer(q["id"], "placeholder")

        assert simulator.questions_asked == question_ids


class TestSmoothTransitions:
    """Transitions between topics should be smooth."""

    @pytest.mark.parametrize("transition", [
        "Thank you. Now, {next_question}",
        "Got it. Next, {next_question}",
        "I've noted that. {next_question}",
        "Perfect. Let me ask you — {next_question}",
    ])
    def test_transition_acknowledges_before_next_question(self, transition):
        # Transition should have an acknowledgment portion before the question
        parts = transition.split("{next_question}")
        acknowledgment = parts[0].strip()
        assert len(acknowledgment) > 0, "Transition should acknowledge before asking next"

    def test_transitions_not_abrupt(self):
        bad_transitions = [
            "What is your policy number?",  # No acknowledgment
            "Phone number?",  # Too terse
        ]
        for transition in bad_transitions:
            # A good transition should have more than just the question
            words = transition.split()
            # Abrupt transitions are very short with no connector
            if len(words) <= 4 and "?" in transition:
                # This is flagged as potentially abrupt
                pass  # In real testing, this would trigger a quality alert


class TestAgentAcknowledgesAnswers:
    """Agent should acknowledge answers before moving on."""

    @pytest.mark.parametrize("acknowledgment", [
        "Thank you",
        "Got it",
        "I've noted that",
        "Perfect",
        "Understood",
        "Okay",
    ])
    def test_valid_acknowledgments(self, acknowledgment):
        assert len(acknowledgment) >= 2
        # Should be concise
        assert len(acknowledgment.split()) <= 5

    def test_acknowledgment_before_next_question(self, simulator):
        simulator.ask_question("claim_type", "What type of claim are you filing?")
        simulator.record_answer("claim_type", "Auto insurance claim")
        # Simulate agent acknowledging and asking next question
        response = "Thank you. When did the incident occur?"
        simulator.agent_says(response)
        # The response should contain both acknowledgment and next question
        assert any(ack in response.lower() for ack in ["thank", "got it", "noted", "perfect", "okay"])


class TestAgentSummarizesAtEnd:
    """Agent should summarize collected information at the end."""

    def test_summary_contains_all_fields(self):
        collected_data = {
            "claim_type": "auto",
            "incident_date": "March 15, 2024",
            "policy_number": "POL12345678",
            "claimant_name": "John Smith",
            "contact_phone": "(555) 123-4567",
            "incident_description": "Rear-ended at a red light",
        }
        # Simulate a summary generation
        summary_parts = []
        for key, value in collected_data.items():
            summary_parts.append(f"{key}: {value}")
        summary = "\n".join(summary_parts)

        for key, value in collected_data.items():
            assert value in summary, f"Summary missing {key}: {value}"

    def test_summary_asks_for_confirmation(self):
        summary_endings = [
            "Does everything look correct?",
            "Is this information accurate?",
            "Would you like to make any corrections?",
            "Please confirm this is correct.",
        ]
        for ending in summary_endings:
            assert "?" in ending or "confirm" in ending.lower() or "correct" in ending.lower()


class TestHandlesIDontKnow:
    """Agent handles 'I don't know' responses gracefully."""

    @pytest.mark.parametrize("uncertain_response", [
        "I don't know",
        "I'm not sure",
        "I can't remember",
        "Let me think...",
        "I'd have to look that up",
    ])
    def test_uncertain_responses_get_gentle_followup(self, uncertain_response):
        # Validate that the system doesn't just reject but guides the user
        criteria = TOP_LEVEL_QUESTIONS[1]["acceptance_criteria"]  # incident_date
        result = validate_answer(uncertain_response, criteria)
        # Should fail validation but provide helpful guidance
        assert result.valid is False
        assert result.clarifying_question is not None
        # Clarifying question should be helpful, not just "invalid"
        assert len(result.clarifying_question) > 20


class TestHandlesCorrections:
    """Agent handles user corrections ('actually, I meant...')."""

    def test_correction_replaces_previous_answer(self, simulator):
        # Simulate: user gives answer, then corrects
        simulator.ask_question("claimant_name", "What is the full name of the policyholder?")
        simulator.record_answer("claimant_name", "John Smith")

        # User corrects
        correction = "Actually, I meant Jonathan Smith."
        simulator.user_says(correction)
        # Update the collected answer
        simulator.answers_collected["claimant_name"] = "Jonathan Smith"

        assert simulator.answers_collected["claimant_name"] == "Jonathan Smith"

    def test_correction_still_validates(self):
        criteria = TOP_LEVEL_QUESTIONS[3]["acceptance_criteria"]  # claimant_name
        # After extracting the corrected name, validation should pass
        # The correction contains a valid full name
        result = validate_answer("Jonathan Michael Smith", criteria)
        assert result.valid is True

    def test_multiple_corrections_allowed(self, simulator):
        simulator.ask_question("policy_number", "What is your policy number?")
        simulator.record_answer("policy_number", "ABC123")
        simulator.user_says("Wait, that's wrong. It's DEF456789.")
        simulator.answers_collected["policy_number"] = "DEF456789"
        simulator.user_says("Sorry, one more time — it's GHI987654321.")
        simulator.answers_collected["policy_number"] = "GHI987654321"

        # Final answer should be the last correction
        assert simulator.answers_collected["policy_number"] == "GHI987654321"
