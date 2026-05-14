"""Flask REST API for the Insurance Claims Intake Question Service."""

from flask import Flask, jsonify, request
from flask_cors import CORS
from questions_data import BRANCH_QUESTIONS, GLOSSARY, TOP_LEVEL_QUESTIONS
from validator import ValidationResult, validate_answer

app = Flask(__name__)
CORS(app)


@app.route("/health", methods=["GET"])
def health_check():
    """Health check endpoint."""
    return jsonify({"status": "healthy", "service": "question-service"})


@app.route("/questions", methods=["GET"])
def get_top_level_questions():
    """Return all top-level intake questions."""
    return jsonify({"questions": TOP_LEVEL_QUESTIONS})


@app.route("/questions/<category>", methods=["GET"])
def get_branch_questions(category: str):
    """Return branch questions for a specific claim category."""
    category = category.lower()
    if category not in BRANCH_QUESTIONS:
        return jsonify({
            "error": f"Unknown category '{category}'. Valid categories: auto, property, health."
        }), 404

    return jsonify({"category": category, "questions": BRANCH_QUESTIONS[category]})


@app.route("/validate", methods=["POST"])
def validate():
    """Validate an answer against acceptance criteria."""
    data = request.get_json()

    if not data:
        return jsonify({"error": "Request body must be JSON."}), 400

    answer = data.get("answer")
    question_id = data.get("question_id")
    acceptance_criteria = data.get("acceptance_criteria")

    if answer is None:
        return jsonify({"error": "Field 'answer' is required."}), 400

    if not acceptance_criteria and not question_id:
        return jsonify({
            "error": "Either 'acceptance_criteria' or 'question_id' must be provided."
        }), 400

    # If question_id provided, look up criteria
    if question_id and not acceptance_criteria:
        acceptance_criteria = _find_criteria_by_question_id(question_id)
        if not acceptance_criteria:
            return jsonify({"error": f"Unknown question_id '{question_id}'."}), 404

    result: ValidationResult = validate_answer(answer, acceptance_criteria)
    return jsonify(result.to_dict())


@app.route("/glossary", methods=["GET"])
def get_glossary():
    """Return the insurance domain glossary."""
    return jsonify({"glossary": GLOSSARY})


def _find_criteria_by_question_id(question_id: str) -> dict | None:
    """Look up acceptance criteria by question ID, with fuzzy matching."""
    # Normalize: lowercase, strip, replace spaces/hyphens with underscores
    normalized = question_id.lower().strip().replace("-", "_").replace(" ", "_")

    # Exact match first
    for question in TOP_LEVEL_QUESTIONS:
        if question["id"] == normalized:
            return question["acceptance_criteria"]
    for questions in BRANCH_QUESTIONS.values():
        for question in questions:
            if question["id"] == normalized:
                return question["acceptance_criteria"]

    # Fuzzy: check if all words in the input appear in a question ID (any order)
    input_words = set(normalized.split("_"))
    all_questions = list(TOP_LEVEL_QUESTIONS)
    for qs in BRANCH_QUESTIONS.values():
        all_questions.extend(qs)

    for question in all_questions:
        qid_words = set(question["id"].split("_"))
        if input_words == qid_words or input_words <= qid_words or qid_words <= input_words:
            return question["acceptance_criteria"]

    return None


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8001, debug=True)
