"""Selection tests: elitism only carries evaluated variants, ranked by fitness."""

from darwin.core.genome import Genome
from darwin.core.population import Variant, rank, select


def _v(gid: str, fit: float, status: str = "evaluated") -> Variant:
    return Variant(genome=Genome(genome_id=gid), fitness=fit, status=status)


def test_rank_orders_by_fitness_desc():
    ranked = rank([_v("a", 0.4), _v("b", 0.9), _v("c", 0.6)])
    assert [v.genome.genome_id for v in ranked] == ["b", "c", "a"]


def test_select_takes_top_k_evaluated_only():
    vs = [_v("a", 0.95, "rejected"), _v("b", 0.8), _v("c", 0.7), _v("d", 0.6)]
    elite = select(vs, 2)
    # 'a' is excluded despite the highest fitness because it was rejected
    assert [v.genome.genome_id for v in elite] == ["b", "c"]


def test_select_returns_at_least_one():
    assert len(select([_v("b", 0.8)], 0)) >= 1
