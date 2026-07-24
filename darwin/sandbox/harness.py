"""The in-sandbox harness. This source is dropped into every sandbox and executed there; it
has NO Darwin imports so it runs identically under Daytona or the local subprocess fallback.

It reads `inputs.json` (entrypoints + argument lists, never the expected answers) and the
`tools/` directory (the genome's candidate solutions), runs each candidate on each case, and
prints a JSON result to stdout:

    {problem_id: [{"got": <value|null>, "error": <str|null>}, ...], ...}

The expected answers never enter the sandbox, so the agent's code cannot read the grader.
"""

from __future__ import annotations

HARNESS_SRC = r'''
import json, os, sys, traceback

WORKDIR = os.path.dirname(os.path.abspath(__file__))

with open(os.path.join(WORKDIR, "inputs.json")) as f:
    spec = json.load(f)

results = {}
for problem_id, info in spec.items():
    entry = info["entrypoint"]
    cases = info["cases"]
    src_path = os.path.join(WORKDIR, "tools", problem_id + ".py")
    fn = None
    load_err = None
    try:
        with open(src_path) as sf:
            src = sf.read()
        ns = {}
        exec(compile(src, src_path, "exec"), ns)
        fn = ns.get(entry)
        if fn is None:
            load_err = "entrypoint '%s' not defined" % entry
    except Exception as e:  # noqa: BLE001
        load_err = "".join(traceback.format_exception_only(type(e), e)).strip()

    per_case = []
    for args in cases:
        if fn is None:
            per_case.append({"got": None, "error": load_err or "no entrypoint"})
            continue
        try:
            got = fn(*args)
            json.dumps(got)  # ensure serializable; non-serializable output is a failure
            per_case.append({"got": got, "error": None})
        except Exception as e:  # noqa: BLE001
            per_case.append(
                {"got": None, "error": "".join(traceback.format_exception_only(type(e), e)).strip()}
            )
    results[problem_id] = per_case

sys.stdout.write("DARWIN_RESULT:" + json.dumps(results))
'''

RESULT_PREFIX = "DARWIN_RESULT:"


def parse_result(stdout: str) -> dict:
    """Pull the JSON result line out of harness stdout (tolerant of extra prints/warnings)."""
    for line in stdout.splitlines():
        idx = line.find(RESULT_PREFIX)
        if idx != -1:
            return __import__("json").loads(line[idx + len(RESULT_PREFIX) :])
    raise ValueError("harness produced no DARWIN_RESULT line")
