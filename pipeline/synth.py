"""Generate synthetic, grader-side EvalCases for Lane A tasks."""

from __future__ import annotations

import json
from pathlib import Path

from darwin.config import Config, load_config
from darwin.eval.task import DATA_DIR, Case, Task

_CASES: dict[str, list[tuple[str, object]]] = {
    "legal_clause_type": [
        ("Either party may terminate this Agreement with 30 days written notice.", "termination"),
        ("Recipient shall not disclose Confidential Information to third parties.", "confidentiality"),
        ("Customer will pay invoices within 30 days of receipt.", "payment"),
        ("This Agreement is governed by the laws of California.", "governing_law"),
        ("Provider warrants the services will conform to the documentation.", "warranty"),
        ("Neither party will be liable for indirect or consequential damages.", "limitation_of_liability"),
        ("Customer owns all right, title, and interest in Customer Data.", "ownership"),
        ("Vendor shall comply with all applicable privacy laws.", "compliance"),
        ("The parties are independent contractors and not partners.", "relationship"),
        ("Any dispute shall be resolved by binding arbitration.", "dispute_resolution"),
    ],
    "legal_governing_law": [
        ("This Agreement shall be governed by the laws of the State of California.", "California"),
        ("The laws of New York govern this contract.", "New York"),
        ("This agreement is governed by Delaware law.", "Delaware"),
        ("The laws of England and Wales apply.", "England and Wales"),
        ("This Agreement is subject to the laws of Texas.", "Texas"),
        ("Washington law governs the interpretation of this Agreement.", "Washington"),
        ("The laws of Massachusetts shall control.", "Massachusetts"),
        ("This contract is governed by the laws of Illinois.", "Illinois"),
        ("Florida law applies to this Agreement.", "Florida"),
        ("The Province of Ontario's laws shall govern.", "Ontario"),
    ],
    "legal_payment_terms": [
        ("Invoices are due net 30 from receipt.", {"days": 30, "prepaid": False}),
        ("Customer must prepay annual fees before service begins.", {"days": 0, "prepaid": True}),
        ("Payment is due within 15 days after invoice date.", {"days": 15, "prepaid": False}),
        ("All monthly charges are payable in advance.", {"days": 0, "prepaid": True}),
        ("Amounts are due net 45.", {"days": 45, "prepaid": False}),
        ("Pay the setup fee immediately upon execution.", {"days": 0, "prepaid": True}),
        ("Invoices must be paid within 60 calendar days.", {"days": 60, "prepaid": False}),
        ("Subscription fees are billed and paid annually in advance.", {"days": 0, "prepaid": True}),
        ("Customer shall remit payment no later than 10 days after receipt.", {"days": 10, "prepaid": False}),
        ("Fees are payable upfront each quarter.", {"days": 0, "prepaid": True}),
    ],
    "legal_renewal": [
        ("The term renews automatically for one year unless either party gives notice.", "auto_renewal"),
        ("This agreement expires on December 31 with no renewal.", "fixed_expiry"),
        ("The parties may renew by mutual written agreement.", "mutual_renewal"),
        ("The subscription automatically renews monthly.", "auto_renewal"),
        ("The initial term ends after 12 months.", "fixed_expiry"),
        ("Renewal requires a signed extension from both parties.", "mutual_renewal"),
        ("Unless cancelled 60 days prior, the term renews for successive years.", "auto_renewal"),
        ("No party is obligated to extend this agreement.", "fixed_expiry"),
        ("The parties will negotiate a renewal in good faith.", "mutual_renewal"),
        ("The contract rolls over automatically each quarter.", "auto_renewal"),
    ],
    "legal_confidentiality": [
        ("Recipient may use confidential information only to perform this agreement.", "restricted_use"),
        ("Information already public is not confidential.", "public_information_exception"),
        ("Recipient must return or destroy confidential materials on request.", "return_or_destroy"),
        ("Disclosure is permitted when required by law.", "legal_disclosure_exception"),
        ("Confidentiality obligations survive for three years.", "survival_period"),
        ("Employees with a need to know may access the information.", "need_to_know_access"),
        ("Recipient shall protect the information using reasonable care.", "security_standard"),
        ("Independently developed information is excluded.", "independent_development_exception"),
        ("The receiving party must promptly notify the discloser of compelled disclosure.", "notice_requirement"),
        ("Trade secrets remain protected for as long as they qualify as trade secrets.", "trade_secret_survival"),
    ],
    "support_intent": [
        ("I was charged twice for my subscription.", "billing_issue"),
        ("Please cancel my account.", "cancellation"),
        ("How do I reset my password?", "account_access"),
        ("My package has not arrived yet.", "shipping_status"),
        ("I want a refund for this purchase.", "refund_request"),
        ("The app crashes when I upload a file.", "technical_issue"),
        ("Where can I download my invoices?", "billing_issue"),
        ("Change the email on my account.", "account_access"),
        ("Can I return an unopened item?", "refund_request"),
        ("Tracking has not updated in three days.", "shipping_status"),
    ],
    "support_priority": [
        ("Our entire production team cannot log in.", "urgent"),
        ("The checkout page is broken for all customers.", "urgent"),
        ("I cannot find a setting in the dashboard.", "low"),
        ("One user sees an intermittent error.", "normal"),
        ("A security incident may have exposed customer data.", "urgent"),
        ("Please add a dark mode option.", "low"),
        ("Our monthly invoice appears incorrect.", "normal"),
        ("The API is down across our account.", "urgent"),
        ("How can I update my profile photo?", "low"),
        ("A payment was declined for one order.", "normal"),
    ],
    "support_sentiment": [
        ("Thank you, the new feature is fantastic!", "positive"),
        ("This is the third time the app has failed me.", "negative"),
        ("Where can I view my plan details?", "neutral"),
        ("I am extremely disappointed with this service.", "negative"),
        ("Everything is working well now.", "positive"),
        ("Please send me the tracking number.", "neutral"),
        ("Your support team solved this quickly, thanks!", "positive"),
        ("This outage is unacceptable.", "negative"),
        ("Can I change my billing address?", "neutral"),
        ("I love how easy the update was.", "positive"),
    ],
    "support_refund_policy": [
        ("I bought this yesterday and have not used it.", "eligible"),
        ("My annual plan renewed 90 days ago.", "ineligible"),
        ("The product arrived damaged today.", "eligible"),
        ("I used the downloadable software for six months.", "ineligible"),
        ("I was billed twice this morning.", "eligible"),
        ("My order was delivered a year ago.", "ineligible"),
        ("I cancelled within the 14-day trial period.", "eligible"),
        ("The service was fully consumed last quarter.", "ineligible"),
        ("The item was never delivered.", "eligible"),
        ("I am requesting a refund after 120 days.", "ineligible"),
    ],
    "support_order_status": [
        ("Where is order 12345?", "track_order"),
        ("My package says delivered but I cannot find it.", "missing_delivery"),
        ("Can I change the shipping address before it ships?", "change_address"),
        ("Please cancel order 7788 before it is dispatched.", "cancel_order"),
        ("The tracking link is not updating.", "track_order"),
        ("My parcel was delivered to the wrong location.", "missing_delivery"),
        ("Update the recipient address for my pending order.", "change_address"),
        ("I no longer need the order I placed this morning.", "cancel_order"),
        ("Has my order left the warehouse?", "track_order"),
        ("The courier marked it delivered, but it is absent.", "missing_delivery"),
    ],
}


def _fireworks_cases(task: Task, config: Config) -> list[Case]:
    from openai import OpenAI

    problem = task.problems[0]
    client = OpenAI(api_key=config.fireworks_api_key, base_url=config.fireworks_base_url)
    response = client.chat.completions.create(
        model=config.fireworks_mutator_model,
        messages=[
            {
                "role": "user",
                "content": (
                    f"Generate 10 diverse, objectively gradeable cases for this task: {task.description} "
                    f"Prompt: {problem.prompt}. Each case must have one text input and an exact expected "
                    "structured output. Put the expected output in expected_json as valid JSON encoded inside "
                    "a string (for example, \"\\\"termination\\\"\" or \"{\\\"days\\\":30}\"). Return JSON only."
                ),
            }
        ],
        response_format={
            "type": "json_schema",
            "json_schema": {
                "name": "case_batch",
                "schema": {
                    "type": "object",
                    "properties": {
                        "cases": {
                            "type": "array",
                            "minItems": 8,
                            "maxItems": 12,
                            "items": {
                                "type": "object",
                                "properties": {
                                    "input": {"type": "string"},
                                    "expected_json": {"type": "string"},
                                },
                                "required": ["input", "expected_json"],
                                "additionalProperties": False,
                            },
                        }
                    },
                    "required": ["cases"],
                    "additionalProperties": False,
                },
            },
        },
        temperature=0,
    )
    content = response.choices[0].message.content
    if not content:
        raise ValueError("Fireworks returned an empty case batch")
    return _parse_fireworks_cases(content)


def _parse_fireworks_cases(content: str) -> list[Case]:
    """Convert Fireworks' schema-safe JSON strings into normal grader-side expected values."""
    payload = json.loads(content)
    rows = payload.get("cases")
    if not isinstance(rows, list) or not 8 <= len(rows) <= 12:
        raise ValueError("Fireworks returned an invalid case count")
    cases = []
    for row in rows:
        if not isinstance(row, dict) or not isinstance(row.get("input"), str):
            raise ValueError("Fireworks returned an invalid case input")
        expected_json = row.get("expected_json")
        if not isinstance(expected_json, str):
            raise ValueError("Fireworks returned an invalid expected_json value")
        cases.append(Case(args=[row["input"]], expected=json.loads(expected_json)))
    return cases


def generate_cases(task: Task, config: Config | None = None) -> Task:
    """Return a copy of a single-problem task with 8 to 12 grader-side cases."""
    if len(task.problems) != 1:
        raise ValueError("Synthetic case generation expects one problem per task")
    config = config or load_config()
    cases: list[Case] | None = None
    source = "canned"
    error = ""
    if config.features.fireworks and config.fireworks_api_key:
        try:
            cases = _fireworks_cases(task, config)
            source = "fireworks"
        except Exception as exc:  # noqa: BLE001 - reviewed fallback data is the demo floor
            from pipeline.decompose import _safe_error

            error = _safe_error(exc)
    if cases is None:
        cases = [Case(args=[text], expected=expected) for text, expected in _CASES[task.task_id]]
    scorer_config = dict(task.problems[0].scorer_config)
    scorer_config["case_source"] = source
    if error:
        scorer_config["case_generation_error"] = error
    problem = task.problems[0].model_copy(update={"cases": cases, "scorer_config": scorer_config})
    return task.model_copy(update={"problems": [problem]})


def write_task(task: Task, data_dir: Path = DATA_DIR) -> Path:
    """Persist a task so ``Task.load(task.task_id)`` can read it."""
    data_dir.mkdir(parents=True, exist_ok=True)
    path = data_dir / f"{task.task_id}.json"
    path.write_text(task.model_dump_json(indent=2))
    return path
