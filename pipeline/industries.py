"""Canned industries: the offline fallback + honest demo library for the decompose/synth
pipeline. Each industry decomposes into real, deterministic tasks whose genome tool code is a
transform (input -> output), scored by exact match. Every task ships a `ladder`
(broken -> correct) so the offline canned mutator makes the score climb with all flags off, and
a handful of synthetic `cases` with grader-side expected answers.

The Fireworks path (pipeline/decompose.py + synth.py) generates the same shape live; this module
is what runs when no key is present, and what the demo library replays.
"""

from __future__ import annotations

# ---- reference solutions (the correct ladder rung) ------------------------------------------ #

REDACT_EMAILS_OK = (
    "import re\n"
    "def redact_emails(text):\n"
    "    return re.sub(r'[\\w.+-]+@[\\w-]+\\.[\\w.-]+', '[REDACTED]', text)\n"
)
EXTRACT_AMOUNTS_OK = (
    "import re\n"
    "def extract_amounts(text):\n"
    "    return [int(x.replace(',', '')) for x in re.findall(r'\\$([0-9,]+)', text)]\n"
)
COUNT_SECTIONS_OK = (
    "import re\n"
    "def count_sections(text):\n"
    "    return len(re.findall(r'Section\\s+\\d+', text))\n"
)

CLASSIFY_PRIORITY_OK = (
    "def classify_priority(text):\n"
    "    t = text.lower()\n"
    "    return 'high' if ('urgent' in t or 'asap' in t or 'immediately' in t) else 'low'\n"
)
EXTRACT_ORDER_ID_OK = (
    "import re\n"
    "def extract_order_id(text):\n"
    "    m = re.search(r'#(\\d{4,})', text)\n"
    "    return m.group(1) if m else ''\n"
)
IS_REFUND_OK = (
    "def is_refund_request(text):\n"
    "    return 'refund' in text.lower() or 'money back' in text.lower()\n"
)

# ---- the canned industries ------------------------------------------------------------------ #
# Each problem: entrypoint, prompt, task_type, cases[{args, expected}], ladder[broken, correct].

INDUSTRIES: dict[str, dict] = {
    "legal": {
        "description": "Contract and legal-document processing tasks.",
        "problems": [
            {
                "case_id": "redact_emails",
                "entrypoint": "redact_emails",
                "prompt": "Redact every email address in the text, replacing it with '[REDACTED]'.",
                "task_type": "text",
                "cases": [
                    {"args": ["Contact jane@acme.com for terms."], "expected": "Contact [REDACTED] for terms."},
                    {"args": ["No email here."], "expected": "No email here."},
                ],
                "ladder": ["def redact_emails(text):\n    return text\n", REDACT_EMAILS_OK],
            },
            {
                "case_id": "extract_amounts",
                "entrypoint": "extract_amounts",
                "prompt": "Return every dollar amount in the text as a list of ints (no commas, no $).",
                "task_type": "structured",
                "cases": [
                    {"args": ["Fee is $1,200 plus $300 filing."], "expected": [1200, 300]},
                    {"args": ["No fees apply."], "expected": []},
                ],
                "ladder": ["def extract_amounts(text):\n    return []\n", EXTRACT_AMOUNTS_OK],
            },
            {
                "case_id": "count_sections",
                "entrypoint": "count_sections",
                "prompt": "Count how many 'Section N' headings appear in the text.",
                "task_type": "structured",
                "cases": [
                    {"args": ["Section 1 ... Section 2 ... Section 3"], "expected": 3},
                    {"args": ["No headings."], "expected": 0},
                ],
                "ladder": ["def count_sections(text):\n    return 0\n", COUNT_SECTIONS_OK],
            },
        ],
    },
    "support": {
        "description": "Customer-support ticket triage tasks.",
        "problems": [
            {
                "case_id": "classify_priority",
                "entrypoint": "classify_priority",
                "prompt": "Return 'high' if the ticket is urgent (urgent/asap/immediately), else 'low'.",
                "task_type": "structured",
                "cases": [
                    {"args": ["Need this fixed ASAP, site is down!"], "expected": "high"},
                    {"args": ["Just a small question about billing."], "expected": "low"},
                ],
                "ladder": ["def classify_priority(text):\n    return 'low'\n", CLASSIFY_PRIORITY_OK],
            },
            {
                "case_id": "extract_order_id",
                "entrypoint": "extract_order_id",
                "prompt": "Extract the order id (the digits after '#') from the ticket, else ''.",
                "task_type": "structured",
                "cases": [
                    {"args": ["Where is order #48213?"], "expected": "48213"},
                    {"args": ["I have a general question."], "expected": ""},
                ],
                "ladder": ["def extract_order_id(text):\n    return ''\n", EXTRACT_ORDER_ID_OK],
            },
            {
                "case_id": "is_refund_request",
                "entrypoint": "is_refund_request",
                "prompt": "Return True if the ticket is asking for a refund / money back.",
                "task_type": "structured",
                "cases": [
                    {"args": ["I want a refund for this order."], "expected": True},
                    {"args": ["How do I change my password?"], "expected": False},
                ],
                "ladder": ["def is_refund_request(text):\n    return False\n", IS_REFUND_OK],
            },
        ],
    },
}


def known_industries() -> list[str]:
    return list(INDUSTRIES)
