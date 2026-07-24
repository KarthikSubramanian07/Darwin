"""Generate data/task/coding_bench.json, the Darwin evolution benchmark.

The genome's tool code IS the candidate solution for each problem. Fitness = fraction of
hidden test cases whose returned value matches `expected`. `expected` lives only here (the
grader side) and is never placed in a sandbox or a genome, preserving the immutable-grader
property.

Each problem carries a `ladder`: an ordered list of source versions from broken to correct.
Generation zero seeds `ladder[0]`. The OFFLINE canned mutator advances a problem one rung at a
time, which guarantees a monotonic climb with all feature flags off (the demo floor). The
Fireworks mutator ignores the ladder and writes real fixes from the failure trace.

Run:  python scripts/build_task.py
"""

from __future__ import annotations

import json
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "data" / "task" / "coding_bench.json"

# ---- correct reference solutions -------------------------------------------------------- #

IS_PALINDROME = "def is_palindrome(s):\n    return s == s[::-1]\n"

FIZZBUZZ = (
    "def fizzbuzz(n):\n"
    "    out = []\n"
    "    for i in range(1, n + 1):\n"
    "        if i % 15 == 0:\n"
    "            out.append('FizzBuzz')\n"
    "        elif i % 3 == 0:\n"
    "            out.append('Fizz')\n"
    "        elif i % 5 == 0:\n"
    "            out.append('Buzz')\n"
    "        else:\n"
    "            out.append(str(i))\n"
    "    return out\n"
)

REVERSE_STRING = "def reverse_string(s):\n    return s[::-1]\n"

TWO_SUM_OK = (
    "def two_sum(nums, target):\n"
    "    seen = {}\n"
    "    for i, x in enumerate(nums):\n"
    "        if target - x in seen:\n"
    "            return [seen[target - x], i]\n"
    "        seen[x] = i\n"
    "    return []\n"
)

ROMAN_OK = (
    "def roman_to_int(s):\n"
    "    vals = {'I': 1, 'V': 5, 'X': 10, 'L': 50, 'C': 100, 'D': 500, 'M': 1000}\n"
    "    total, prev = 0, 0\n"
    "    for ch in reversed(s):\n"
    "        v = vals[ch]\n"
    "        if v < prev:\n"
    "            total -= v\n"
    "        else:\n"
    "            total += v\n"
    "            prev = v\n"
    "    return total\n"
)

FLATTEN_OK = (
    "def flatten(nested):\n"
    "    out = []\n"
    "    for x in nested:\n"
    "        if isinstance(x, list):\n"
    "            out.extend(flatten(x))\n"
    "        else:\n"
    "            out.append(x)\n"
    "    return out\n"
)

COUNT_VOWELS_OK = "def count_vowels(s):\n    return sum(1 for c in s.lower() if c in 'aeiou')\n"

FIB_OK = (
    "def fibonacci(n):\n"
    "    a, b = 0, 1\n"
    "    for _ in range(n):\n"
    "        a, b = b, a + b\n"
    "    return a\n"
)

# ---- the benchmark ---------------------------------------------------------------------- #
# 8 problems x 2 cases = 16 hidden cases. Gen 0 has 3 problems correct (6/16 = 37.5%, "~40%")
# and 5 problems broken; the ladders climb the rest to 16/16.

PROBLEMS = [
    # already-correct at gen 0
    {
        "case_id": "is_palindrome",
        "entrypoint": "is_palindrome",
        "prompt": "Return True if string s reads the same forwards and backwards.",
        "cases": [{"args": ["racecar"], "expected": True}, {"args": ["hello"], "expected": False}],
        "ladder": [IS_PALINDROME],
    },
    {
        "case_id": "fizzbuzz",
        "entrypoint": "fizzbuzz",
        "prompt": "Return the FizzBuzz sequence 1..n as a list of strings.",
        "cases": [
            {"args": [3], "expected": ["1", "2", "Fizz"]},
            {"args": [5], "expected": ["1", "2", "Fizz", "4", "Buzz"]},
        ],
        "ladder": [FIZZBUZZ],
    },
    {
        "case_id": "reverse_string",
        "entrypoint": "reverse_string",
        "prompt": "Return string s reversed.",
        "cases": [{"args": ["abc"], "expected": "cba"}, {"args": ["hello"], "expected": "olleh"}],
        "ladder": [REVERSE_STRING],
    },
    # broken at gen 0, single-rung ladder (broken -> correct)
    {
        "case_id": "two_sum",
        "entrypoint": "two_sum",
        "prompt": "Return indices [i, j] of the two numbers in nums that add to target.",
        "cases": [
            {"args": [[2, 7, 11, 15], 9], "expected": [0, 1]},
            {"args": [[3, 2, 4], 6], "expected": [1, 2]},
        ],
        "ladder": ["def two_sum(nums, target):\n    return []\n", TWO_SUM_OK],
    },
    {
        "case_id": "roman_to_int",
        "entrypoint": "roman_to_int",
        "prompt": "Convert a Roman numeral string to an integer.",
        "cases": [
            {"args": ["III"], "expected": 3},
            {"args": ["MCMXCIV"], "expected": 1994},
        ],
        "ladder": ["def roman_to_int(s):\n    return 0\n", ROMAN_OK],
    },
    {
        "case_id": "flatten",
        "entrypoint": "flatten",
        "prompt": "Deep-flatten a nested list of ints into a flat list.",
        "cases": [
            {"args": [[1, [2, 3]]], "expected": [1, 2, 3]},
            {"args": [[1, [2, [3, 4]]]], "expected": [1, 2, 3, 4]},
        ],
        "ladder": ["def flatten(nested):\n    return nested\n", FLATTEN_OK],
    },
    {
        "case_id": "count_vowels",
        "entrypoint": "count_vowels",
        "prompt": "Count the vowels (a, e, i, o, u) in s, case-insensitive.",
        "cases": [
            {"args": ["hello"], "expected": 2},
            {"args": ["AEIOU"], "expected": 5},
        ],
        "ladder": ["def count_vowels(s):\n    return 0\n", COUNT_VOWELS_OK],
    },
    {
        "case_id": "fibonacci",
        "entrypoint": "fibonacci",
        "prompt": "Return the n-th Fibonacci number (fibonacci(0) = 0, fibonacci(1) = 1).",
        "cases": [
            {"args": [7], "expected": 13},
            {"args": [10], "expected": 55},
        ],
        "ladder": ["def fibonacci(n):\n    return n\n", FIB_OK],
    },
]

TASK = {
    "task_id": "coding_bench",
    "description": (
        "Evolve an agent that solves a suite of small Python coding problems. The genome's "
        "tool code is the candidate solution; fitness is the fraction of hidden test cases it "
        "passes. Gen 0 is deliberately mediocre."
    ),
    "problems": PROBLEMS,
}


def main() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(TASK, indent=2) + "\n")
    total_cases = sum(len(p["cases"]) for p in PROBLEMS)
    print(f"wrote {OUT} ({len(PROBLEMS)} problems, {total_cases} cases)")


if __name__ == "__main__":
    main()
