"""Exercise the Braintrust logging path with a fake SDK, so we know the wiring is correct
without needing a live key in CI."""

import sys
import types

import pytest

from darwin.config import load_config
from darwin.core.genome import Genome
from darwin.eval.fitness import Fitness
from darwin.eval.task import Task


class _FakeExperiment:
    def __init__(self, recorder):
        self.recorder = recorder

    def log(self, **row):
        self.recorder["rows"].append(row)

    def summarize(self, **_):
        return types.SimpleNamespace(experiment_url="https://braintrust.dev/app/Darwin/exp/fake")


@pytest.fixture
def fake_braintrust(monkeypatch):
    recorder = {"init": [], "rows": []}

    def init(**kwargs):
        recorder["init"].append(kwargs)
        return _FakeExperiment(recorder)

    fake = types.ModuleType("braintrust")
    fake.init = init
    monkeypatch.setitem(sys.modules, "braintrust", fake)
    monkeypatch.setenv("FEATURE_BRAINTRUST", "1")
    monkeypatch.setenv("BRAINTRUST_API_KEY", "sk-test")
    return recorder


def test_variant_is_logged_as_experiment_with_url(fake_braintrust):
    task = Task.load("coding_bench")
    fit = Fitness(load_config(), task)
    assert fit.logger.enabled is True

    genome = Genome.seed(task)
    outputs = {p.case_id: [{"got": c.expected, "error": None} for c in p.cases] for p in task.problems}
    result = fit.score(outputs, genome=genome, generation=2)

    assert result.experiment_url == "https://braintrust.dev/app/Darwin/exp/fake"
    # one experiment created, tagged by task/model/generation
    assert len(fake_braintrust["init"]) == 1
    init_kwargs = fake_braintrust["init"][0]
    assert init_kwargs["metadata"]["generation"] == 2
    assert init_kwargs["metadata"]["model"] == genome.model
    assert "gen2" in init_kwargs["tags"]
    # one logged row per case, each with exactly one named score
    assert len(fake_braintrust["rows"]) == task.total_cases
    assert all(len(r["scores"]) == 1 for r in fake_braintrust["rows"])
