"""Mutation tests: the offline canned mutator must advance failing problems monotonically."""

from darwin.config import load_config
from darwin.core.genome import Genome
from darwin.core.mutate import Mutator
from darwin.core.population import PerCase, Variant
from darwin.eval.task import Task


def _parent(task: Task, failing="two_sum") -> Variant:
    g = Genome.seed(task)
    per_case = []
    for p in task.problems:
        for i in range(len(p.cases)):
            per_case.append(
                PerCase(case_id=f"{p.case_id}#{i}", score=0.0 if p.case_id == failing else 1.0)
            )
    return Variant(genome=g, fitness=0.5, per_case=per_case, status="evaluated")


def test_mutate_produces_n_children_tagged_to_parent():
    task = Task.load()
    m = Mutator(load_config(), task)
    kids = m.mutate_offspring([_parent(task)], [], n=3, generation=1)
    assert len(kids) == 3
    assert all(k.generation == 1 for k in kids)
    assert all(k.parent_ids == ["gen0-seed"] for k in kids)


def test_canned_mutator_advances_the_failing_problem():
    task = Task.load()
    m = Mutator(load_config(), task)
    two_sum = next(p for p in task.problems if p.case_id == "two_sum")
    child = m.mutate_offspring([_parent(task, failing="two_sum")], [], n=1, generation=1)[0]
    # ladder[0] (broken) -> ladder[1] (correct)
    assert child.tools["two_sum"] == two_sum.ladder[1]
    assert "two_sum" in child.lineage_note


def test_nothing_to_improve_carries_forward_unchanged():
    task = Task.load()
    m = Mutator(load_config(), task)
    g = Genome.seed(task)
    per_case = [
        PerCase(case_id=f"{p.case_id}#{i}", score=1.0)
        for p in task.problems
        for i in range(len(p.cases))
    ]
    parent = Variant(genome=g, fitness=1.0, per_case=per_case, status="evaluated")
    child = m.mutate_offspring([parent], [], n=1, generation=1)[0]
    assert child.tools == g.tools
