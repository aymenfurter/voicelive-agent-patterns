"""Insurance claims intake question data for the Voice Live API Q&A service."""

TOP_LEVEL_QUESTIONS: list[dict] = [
    {
        "id": "claim_type",
        "text": "What type of insurance claim are you filing?",
        "category": "general",
        "order": 1,
        "acceptance_criteria": {
            "required_type": "choice",
            "valid_choices": ["auto", "property", "health"],
            "clarifying_prompt": (
                "I need to know the specific type of claim. "
                "Is this an auto, property, or health insurance claim?"
            ),
        },
    },
    {
        "id": "incident_date",
        "text": "When did the incident occur?",
        "category": "general",
        "order": 2,
        "acceptance_criteria": {
            "required_type": "date",
            "reject_patterns": [
                "a few days ago",
                "recently",
                "last week",
                "a while ago",
                "not sure",
                "sometime",
                "couple days",
            ],
            "clarifying_prompt": (
                "I need a specific date for the incident. "
                "Could you provide the month, day, and year? For example, March 15, 2025."
            ),
        },
    },
    {
        "id": "policy_number",
        "text": "What is your policy number?",
        "category": "general",
        "order": 3,
        "acceptance_criteria": {
            "required_type": "policy_number",
            "pattern": r"^[A-Za-z0-9]{8,12}$",
            "clarifying_prompt": (
                "The policy number should be 8 to 12 alphanumeric characters. "
                "You can find it on your insurance card or declarations page. "
                "Could you double-check and provide it again?"
            ),
        },
    },
    {
        "id": "claimant_name",
        "text": "What is the full name of the policyholder?",
        "category": "general",
        "order": 4,
        "acceptance_criteria": {
            "required_type": "full_name",
            "min_parts": 2,
            "clarifying_prompt": (
                "I need both the first and last name of the policyholder. "
                "Could you provide the full name?"
            ),
        },
    },
    {
        "id": "contact_phone",
        "text": "What is your contact phone number?",
        "category": "general",
        "order": 5,
        "acceptance_criteria": {
            "required_type": "phone",
            "clarifying_prompt": (
                "I need a valid phone number to reach you. "
                "Please provide it in a standard format, such as (555) 123-4567 or 555-123-4567."
            ),
        },
    },
    {
        "id": "incident_description",
        "text": "Please provide a brief description of what happened.",
        "category": "general",
        "order": 6,
        "acceptance_criteria": {
            "required_type": "description",
            "min_length": 20,
            "reject_patterns": [
                "stuff happened",
                "i don't know",
                "not sure",
                "it just happened",
            ],
            "clarifying_prompt": (
                "I need a more detailed description — at least 20 words explaining "
                "what happened, when, and any relevant circumstances. "
                "Could you elaborate on the incident?"
            ),
        },
    },
]

BRANCH_QUESTIONS: dict[str, list[dict]] = {
    "auto": [
        {
            "id": "auto_incident_location",
            "text": "Where did the incident occur?",
            "category": "auto",
            "order": 1,
            "acceptance_criteria": {
                "required_type": "description",
                "min_length": 1,
                "clarifying_prompt": (
                    "I need to know where the incident happened. "
                    "Could you provide a city, state, or intersection?"
                ),
            },
        },
        {
            "id": "auto_vehicle_info",
            "text": "What is the make, model, and year of the vehicle involved?",
            "category": "auto",
            "order": 2,
            "acceptance_criteria": {
                "required_type": "vehicle_info",
                "min_parts": 2,
                "clarifying_prompt": (
                    "I need at least the make and model of the vehicle. "
                    "For example, 'Toyota Camry 2021'. Could you provide those details?"
                ),
            },
        },
        {
            "id": "auto_incident_description",
            "text": "Please briefly describe what happened.",
            "category": "auto",
            "order": 3,
            "acceptance_criteria": {
                "required_type": "description",
                "min_length": 10,
                "clarifying_prompt": (
                    "I need a brief description of what happened during the incident. "
                    "Could you explain in a sentence or two?"
                ),
            },
        },
        {
            "id": "auto_other_parties",
            "text": "Were there any other vehicles or parties involved? If yes, please describe.",
            "category": "auto",
            "order": 4,
            "acceptance_criteria": {
                "required_type": "description",
                "min_length": 3,
                "clarifying_prompt": (
                    "Could you clarify whether other vehicles or people were involved? "
                    "If yes, please describe who or what was involved."
                ),
            },
        },
        {
            "id": "auto_police_report",
            "text": "Was a police report filed? If so, what is the report number?",
            "category": "auto",
            "order": 5,
            "acceptance_criteria": {
                "required_type": "yes_no_detail",
                "clarifying_prompt": (
                    "Please confirm whether a police report was filed. "
                    "If yes, I'll need the report number."
                ),
            },
        },
        {
            "id": "auto_injuries",
            "text": "Were there any injuries?",
            "category": "auto",
            "order": 6,
            "acceptance_criteria": {
                "required_type": "yes_no_detail",
                "clarifying_prompt": (
                    "Please let me know if anyone was injured in the incident."
                ),
            },
        },
    ],
    "property": [
        {
            "id": "property_address",
            "text": "What is the address of the property where the damage occurred?",
            "category": "property",
            "order": 1,
            "acceptance_criteria": {
                "required_type": "address",
                "min_length": 10,
                "clarifying_prompt": (
                    "I need a complete street address for the damaged property. "
                    "Please include the street number, street name, city, and state."
                ),
            },
        },
        {
            "id": "property_damage_list",
            "text": "What specific areas or items were damaged? Please list each one.",
            "category": "property",
            "order": 2,
            "acceptance_criteria": {
                "required_type": "description",
                "min_length": 5,
                "clarifying_prompt": (
                    "Could you be more specific about what was damaged? "
                    "For example: roof shingles, basement flooring, kitchen appliances, etc."
                ),
            },
        },
        {
            "id": "property_temp_repairs",
            "text": "Have you made any temporary repairs? If so, please describe what was done.",
            "category": "property",
            "order": 3,
            "acceptance_criteria": {
                "required_type": "yes_no_detail",
                "clarifying_prompt": (
                    "Please confirm whether any temporary repairs have been made. "
                    "If yes, describe what was done — for example, tarping the roof or boarding up windows."
                ),
            },
        },
    ],
    "health": [
        {
            "id": "health_provider",
            "text": (
                "What is the name of the healthcare provider or facility "
                "where you received treatment?"
            ),
            "category": "health",
            "order": 1,
            "acceptance_criteria": {
                "required_type": "name",
                "min_length": 3,
                "clarifying_prompt": (
                    "I need the name of the hospital, clinic, or doctor who provided treatment. "
                    "Could you provide that?"
                ),
            },
        },
        {
            "id": "health_diagnosis",
            "text": "What diagnosis or treatment did you receive?",
            "category": "health",
            "order": 2,
            "acceptance_criteria": {
                "required_type": "description",
                "min_length": 5,
                "clarifying_prompt": (
                    "Could you describe the diagnosis or treatment in more detail? "
                    "For example, 'fractured wrist — cast applied' or 'physical therapy for lower back pain'."
                ),
            },
        },
        {
            "id": "health_other_insurance",
            "text": (
                "Do you have any other active health insurance policies? "
                "If yes, provide the carrier name and policy number."
            ),
            "category": "health",
            "order": 3,
            "acceptance_criteria": {
                "required_type": "yes_no_detail",
                "clarifying_prompt": (
                    "Please confirm whether you have other health insurance. "
                    "If yes, I'll need the insurance company name and your policy number with them."
                ),
            },
        },
    ],
}

GLOSSARY: dict[str, str] = {
    "policyholder": (
        "The person or entity who owns the insurance policy and is responsible for premium payments."
    ),
    "claimant": (
        "The person filing the insurance claim, who may or may not be the policyholder."
    ),
    "deductible": (
        "The amount the policyholder must pay out of pocket before insurance coverage kicks in."
    ),
    "premium": (
        "The recurring payment made to the insurance company to maintain coverage."
    ),
    "coverage limit": (
        "The maximum amount an insurance company will pay for a covered claim."
    ),
    "liability": (
        "Legal responsibility for damages or injuries caused to another party."
    ),
    "comprehensive coverage": (
        "Auto insurance that covers damage not caused by a collision, "
        "such as theft, vandalism, or natural disasters."
    ),
    "collision coverage": (
        "Auto insurance that covers damage to your vehicle from a collision, "
        "regardless of who is at fault."
    ),
    "actual cash value": (
        "The current market value of property at the time of loss, "
        "accounting for depreciation."
    ),
    "replacement cost": (
        "The amount needed to replace damaged property with new items "
        "of similar kind and quality, without deducting for depreciation."
    ),
    "adjuster": (
        "An insurance professional who investigates and evaluates claims "
        "to determine the appropriate payout."
    ),
    "subrogation": (
        "The process by which an insurance company seeks reimbursement "
        "from the at-fault party after paying a claim."
    ),
    "exclusion": (
        "Specific conditions, situations, or circumstances that are not covered by the policy."
    ),
    "rider": (
        "An add-on to an insurance policy that provides additional coverage "
        "beyond the standard policy terms."
    ),
    "coordination of benefits": (
        "The process of determining which insurance policy pays first when a person "
        "is covered by multiple health plans."
    ),
}
