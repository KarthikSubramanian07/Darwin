"""Data-shape tests: the types every lane shares must round-trip cleanly."""

from darwin.core.genome import Genome
from darwin.core.population import Generation, RunRecord, Variant


def _genome() -> Genome:
    return Genome(
        genome_id="g0",
        generation=0,
        system_prompt="You are a mediocre agent.",
        tools={"add": "def add(a, b):\n    return a + b\n"},
        params={"temperature": 0.7},
    )


def test_genome_json_roundtrip():
    g = _genome()
    assert Genome.from_json(g.to_json()) == g


def test_variant_defaults():
    v = Variant(genome=_genome())
    assert v.fitness == 0.0
    assert v.status == "evaluated"


def test_runrecord_holds_the_climb():
    rec = RunRecord(
        run_id="r1",
        task_id="default",
        seed=1337,
        generations=[Generation(index=0, best_fitness=0.4)],
        fitness_curve=[0.4, 0.65, 0.82, 0.91],
    )
    # the curve is the product: it only goes up (or flat)
    assert rec.fitness_curve == sorted(rec.fitness_curve)
