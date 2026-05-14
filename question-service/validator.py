"""Answer validation logic for insurance claims intake questions."""

import re
from dataclasses import dataclass

VAGUE_QUANTIFIERS: list[str] = [
    "a few",
    "some",
    "several",
    "around",
    "approximately",
    "about",
    "roughly",
    "many",
]


@dataclass
class ValidationResult:
    """Result of validating an answer against acceptance criteria."""

    valid: bool
    reason: str
    clarifying_question: str | None = None

    def to_dict(self) -> dict:
        return {
            "valid": self.valid,
            "reason": self.reason,
            "clarifying_question": self.clarifying_question,
        }


def validate_answer(answer: str, acceptance_criteria: dict) -> ValidationResult:
    """Validate an answer against the acceptance criteria for a question."""
    if not answer or not answer.strip():
        return ValidationResult(
            valid=False,
            reason="No answer provided.",
            clarifying_question=acceptance_criteria.get("clarifying_prompt"),
        )

    answer = answer.strip()
    required_type = acceptance_criteria.get("required_type", "text")

    # Check for vague quantifiers in all answer types
    vague_check = _check_vague_quantifiers(answer)
    if vague_check:
        return ValidationResult(
            valid=False,
            reason=vague_check,
            clarifying_question=acceptance_criteria.get("clarifying_prompt"),
        )

    validators = {
        "choice": _validate_choice,
        "date": _validate_date,
        "policy_number": _validate_policy_number,
        "full_name": _validate_full_name,
        "phone": _validate_phone,
        "description": _validate_description,
        "vehicle_info": _validate_vehicle_info,
        "address": _validate_address,
        "name": _validate_name,
        "yes_no_detail": _validate_yes_no_detail,
    }

    validator_fn = validators.get(required_type, _validate_generic)
    return validator_fn(answer, acceptance_criteria)


def _check_vague_quantifiers(answer: str) -> str | None:
    """Check if the answer contains vague quantifiers."""
    answer_lower = answer.lower()
    for vague in VAGUE_QUANTIFIERS:
        if vague in answer_lower:
            return (
                f"Answer contains vague language ('{vague}'). "
                "Please provide a specific and precise response."
            )
    return None


def _validate_choice(answer: str, criteria: dict) -> ValidationResult:
    """Validate that the answer is one of the valid choices."""
    valid_choices = criteria.get("valid_choices", [])
    answer_lower = answer.lower().strip()

    for choice in valid_choices:
        if choice in answer_lower:
            return ValidationResult(valid=True, reason="Valid claim type provided.")

    return ValidationResult(
        valid=False,
        reason=f"Answer must be one of: {', '.join(valid_choices)}.",
        clarifying_question=criteria.get("clarifying_prompt"),
    )


def _validate_date(answer: str, criteria: dict) -> ValidationResult:
    """Validate that the answer contains a specific date."""
    # Check reject patterns first
    reject_patterns = criteria.get("reject_patterns", [])
    answer_lower = answer.lower()
    for pattern in reject_patterns:
        if pattern in answer_lower:
            return ValidationResult(
                valid=False,
                reason=f"Answer is too vague ('{pattern}'). A specific date is required.",
                clarifying_question=criteria.get("clarifying_prompt"),
            )

    # Check for date-like patterns
    date_patterns = [
        r"\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4}",  # MM/DD/YYYY, D.M.YYYY, etc.
        r"(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}(st|nd|rd|th)?,?\s*\d{2,4}",
        r"\d{1,2}(st|nd|rd|th)?\s+(of\s+)?(january|february|march|april|may|june|july|august|september|october|november|december),?\s*\d{2,4}",
        r"(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\.?\s+\d{1,2}(st|nd|rd|th)?,?\s*\d{2,4}",
        r"\d{4}[/\-\.]\d{1,2}[/\-\.]\d{1,2}",  # YYYY-MM-DD, YYYY.MM.DD
        r"(january|february|march|april|may|june|july|august|september|october|november|december)"
        r"\s+\d{4}",  # Month YYYY
    ]

    for pattern in date_patterns:
        if re.search(pattern, answer_lower):
            return ValidationResult(valid=True, reason="Valid date provided.")

    return ValidationResult(
        valid=False,
        reason="Could not identify a specific date in the answer.",
        clarifying_question=criteria.get("clarifying_prompt"),
    )


def _validate_policy_number(answer: str, criteria: dict) -> ValidationResult:
    """Validate that the answer matches the policy number format."""
    pattern = criteria.get("pattern", r"^[A-Za-z0-9]{8,12}$")
    # Extract potential policy number (strip whitespace and common prefixes)
    cleaned = re.sub(r"(?i)(policy\s*(number|#|num)?:?\s*)", "", answer).strip()
    cleaned = re.sub(r"[^A-Za-z0-9]", "", cleaned)

    if re.match(pattern, cleaned):
        return ValidationResult(valid=True, reason="Valid policy number format.")

    return ValidationResult(
        valid=False,
        reason="Policy number must be 8-12 alphanumeric characters.",
        clarifying_question=criteria.get("clarifying_prompt"),
    )


def _validate_full_name(answer: str, criteria: dict) -> ValidationResult:
    """Validate that the answer contains a first and last name."""
    min_parts = criteria.get("min_parts", 2)
    name_parts = [p for p in answer.strip().split() if len(p) > 0]

    if len(name_parts) < min_parts:
        return ValidationResult(
            valid=False,
            reason="A full name with at least first and last name is required.",
            clarifying_question=criteria.get("clarifying_prompt"),
        )

    # Check that name parts look reasonable (not just numbers or symbols)
    alpha_parts = [p for p in name_parts if re.match(r"^[A-Za-z\-'.]+$", p)]
    if len(alpha_parts) < min_parts:
        return ValidationResult(
            valid=False,
            reason="Name should contain alphabetic characters.",
            clarifying_question=criteria.get("clarifying_prompt"),
        )

    return ValidationResult(valid=True, reason="Valid full name provided.")


def _validate_phone(answer: str, criteria: dict) -> ValidationResult:
    """Validate that the answer contains a valid phone number."""
    # Strip common non-digit chars and check digit count
    digits = re.sub(r"[^\d]", "", answer)

    if len(digits) < 10 or len(digits) > 15:
        return ValidationResult(
            valid=False,
            reason="Phone number must contain 10-15 digits.",
            clarifying_question=criteria.get("clarifying_prompt"),
        )

    # Check for phone-like patterns
    phone_patterns = [
        r"\(?\d{3}\)?[\s\-.]?\d{3}[\s\-.]?\d{4}",  # US format
        r"\+?\d{1,3}[\s\-.]?\d{3,4}[\s\-.]?\d{3,4}[\s\-.]?\d{0,4}",  # International
    ]

    for pattern in phone_patterns:
        if re.search(pattern, answer):
            return ValidationResult(valid=True, reason="Valid phone number provided.")

    # If we have enough digits, accept it
    if len(digits) >= 10:
        return ValidationResult(valid=True, reason="Valid phone number provided.")

    return ValidationResult(
        valid=False,
        reason="Could not identify a valid phone number format.",
        clarifying_question=criteria.get("clarifying_prompt"),
    )


def _validate_description(answer: str, criteria: dict) -> ValidationResult:
    """Validate that the answer meets minimum word count and specificity."""
    min_length = criteria.get("min_length", 10)

    # Check reject patterns
    reject_patterns = criteria.get("reject_patterns", [])
    answer_lower = answer.lower()
    for pattern in reject_patterns:
        if pattern in answer_lower:
            return ValidationResult(
                valid=False,
                reason=f"Answer is too vague ('{pattern}'). Please provide specific details.",
                clarifying_question=criteria.get("clarifying_prompt"),
            )

    word_count = len(answer.split())
    if word_count < min_length:
        return ValidationResult(
            valid=False,
            reason=f"Answer must be at least {min_length} words (got {word_count}).",
            clarifying_question=criteria.get("clarifying_prompt"),
        )

    return ValidationResult(valid=True, reason="Valid description provided.")


def _validate_vehicle_info(answer: str, criteria: dict) -> ValidationResult:
    """Validate that the answer contains vehicle make/model/year info."""
    min_parts = criteria.get("min_parts", 2)
    parts = [p for p in answer.strip().split() if len(p) > 1]

    if len(parts) < min_parts:
        return ValidationResult(
            valid=False,
            reason="Please provide at least the make and model of the vehicle.",
            clarifying_question=criteria.get("clarifying_prompt"),
        )

    return ValidationResult(valid=True, reason="Valid vehicle information provided.")


def _validate_address(answer: str, criteria: dict) -> ValidationResult:
    """Validate that the answer contains a reasonable address."""
    min_length = criteria.get("min_length", 10)

    if len(answer.strip()) < min_length:
        return ValidationResult(
            valid=False,
            reason="Address appears incomplete. Please provide a full street address.",
            clarifying_question=criteria.get("clarifying_prompt"),
        )

    # Check for at least a number and some text (basic address heuristic)
    has_number = bool(re.search(r"\d+", answer))
    has_text = bool(re.search(r"[A-Za-z]{3,}", answer))

    if not (has_number and has_text):
        return ValidationResult(
            valid=False,
            reason="A valid address should include a street number and street name.",
            clarifying_question=criteria.get("clarifying_prompt"),
        )

    return ValidationResult(valid=True, reason="Valid address provided.")


def _validate_name(answer: str, criteria: dict) -> ValidationResult:
    """Validate that the answer contains a name (provider, facility, etc.)."""
    min_length = criteria.get("min_length", 3)

    if len(answer.strip()) < min_length:
        return ValidationResult(
            valid=False,
            reason="Please provide a complete name.",
            clarifying_question=criteria.get("clarifying_prompt"),
        )

    return ValidationResult(valid=True, reason="Valid name provided.")


def _validate_yes_no_detail(answer: str, criteria: dict) -> ValidationResult:
    """Validate yes/no questions that may require additional detail."""
    answer_lower = answer.lower().strip()

    # Accept clear no responses
    no_indicators = ["no", "nope", "negative", "n/a", "none", "did not", "didn't"]
    for indicator in no_indicators:
        if answer_lower.startswith(indicator) or answer_lower == indicator:
            return ValidationResult(valid=True, reason="Valid response provided.")

    # Accept yes responses with some detail
    yes_indicators = ["yes", "yep", "yeah", "affirmative"]
    for indicator in yes_indicators:
        if answer_lower.startswith(indicator):
            # If just "yes" with no detail, ask for more
            if len(answer.split()) <= 1:
                return ValidationResult(
                    valid=False,
                    reason="Please provide additional details along with your 'yes' answer.",
                    clarifying_question=criteria.get("clarifying_prompt"),
                )
            return ValidationResult(valid=True, reason="Valid response with details provided.")

    # If the response is detailed enough, accept it
    if len(answer.split()) >= 3:
        return ValidationResult(valid=True, reason="Valid response provided.")

    return ValidationResult(
        valid=False,
        reason="Please answer yes or no, and provide details if applicable.",
        clarifying_question=criteria.get("clarifying_prompt"),
    )


def _validate_generic(answer: str, criteria: dict) -> ValidationResult:
    """Generic validation for unspecified types."""
    if len(answer.strip()) < 2:
        return ValidationResult(
            valid=False,
            reason="Answer is too short.",
            clarifying_question=criteria.get("clarifying_prompt"),
        )
    return ValidationResult(valid=True, reason="Answer accepted.")
