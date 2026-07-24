"""Lane B fitness harness tests: correct scoring, tuple-compat, and safe no-op logging."""

import pytest

from darwin.config import load_config
from darwin.core.genome import Genome
from darwin.eval.fitness import Fitness, ScoreResult
from darwin.eval.task import Task


@pytest.fixture
def offline(monkeypatch):
    monkeypatch.setenv("FEATURE_BRAINTRUST", "0")
    monkeypatch.delenv("BRAINTRUST_API_KEY", raising=False)


@pytest.fixture
def task():
    return Task.load("coding_bench")


def _perfect_outputs(task: Task):
    """Outputs where every case returns its expected answer."""
    return {
        p.case_id: [{"got": c.expected, "error": None} for c in p.cases] for p in task.problems
    }


def _empty_outputs(task: Task):
    return {p.case_id: [{"got": None, "error": "missing"} for _ in p.cases] for p in task.problems}


def test_perfect_outputs_score_one(offline, task):
    fit = Fitness(load_config(), task)
    result = fit.score(_perfect_outputs(task), genome=Genome.seed(task))
    assert isinstance(result, ScoreResult)
    assert result.fitness == 1.0
    assert result.experiment_url == ""  # braintrust off -> no logging
    assert all(pc.score == 1.0 for pc in result.per_case)


def test_empty_outputs_score_zero_with_failure_traces(offline, task):
    fit = Fitness(load_config(), task)
    result = fit.score(_empty_outputs(task), genome=Genome.seed(task))
    assert result.fitness == 0.0
    assert all(pc.error for pc in result.per_case)  # every case carries a failure trace


def test_scoreresult_is_tuple_unpackable(offline, task):
    fit = Fitness(load_config(), task)
    fitness, per_case = fit.score(_perfect_outputs(task), genome=Genome.seed(task))
    assert fitness == 1.0
    assert len(per_case) == task.total_cases


def test_logger_disabled_without_key(offline, task):
    fit = Fitness(load_config(), task)
    assert fit.logger.enabled is False


def test_before_after_report(offline, task):
    fit = Fitness(load_config(), task)
    report = fit.offline_report(_empty_outputs(task), _perfect_outputs(task))
    assert report["gen0_fitness"] == 0.0
    assert report["final_fitness"] == 1.0
    assert report["delta"] == 1.0
    assert report["scored_by"] == "local"
