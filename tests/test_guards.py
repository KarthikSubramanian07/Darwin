"""Safety guard tests: the four pillars must behave, or the whole safety story is a lie."""

import pytest

from darwin.config import load_config
from darwin.core.genome import Genome
from darwin.core.population import Variant
from darwin.safety.guards import GraderTamperError, Guards


class _Handle:
    def __init__(self, in_sandbox=True):
        self.in_sandbox = in_sandbox


@pytest.fixture
def guards():
    return Guards(load_config())


def test_assert_sandboxed_requires_a_sandbox(guards):
    guards.assert_sandboxed(_Handle(in_sandbox=True))  # ok
    with pytest.raises(RuntimeError):
        guards.assert_sandboxed(None)
    with pytest.raises(RuntimeError):
        guards.assert_sandboxed(_Handle(in_sandbox=False))


def test_clean_genome_passes_grader_check(guards):
    g = Genome(genome_id="ok", tools={"t": "def t(x):\n    return x + 1\n"})
    guards.assert_grader_untouched(g)  # no raise
    assert guards.screen(g) is None


@pytest.mark.parametrize(
    "src",
    [
        "from darwin.eval.fitness import Fitness\n",
        "open('darwin/eval/fitness.py').read()\n",
        "import x; x.load('coding_bench.json')\n",
    ],
)
def test_grader_tamper_is_caught(guards, src):
    g = Genome(genome_id="bad", tools={"t": src})
    with pytest.raises(GraderTamperError):
        guards.assert_grader_untouched(g)
    reason = guards.screen(g)
    assert reason is not None
    assert guards.rejected_count == 1


def test_regression_is_rejected_and_below_parent(guards):
    parent = Genome(genome_id="p", generation=0)
    child = Genome(genome_id="c", generation=1, parent_ids=["p"])
    variants = [
        Variant(genome=parent, fitness=0.8, status="evaluated"),
        Variant(genome=child, fitness=0.5, status="evaluated"),  # worse than parent
    ]
    out = guards.filter(variants, {"p": 0.8})
    statuses = {v.genome.genome_id: v.status for v in out}
    assert statuses["c"] in ("rejected", "rolled_back")
    assert statuses["p"] == "evaluated"


def test_non_regression_survives(guards):
    child = Genome(genome_id="c", generation=1, parent_ids=["p"])
    variants = [Variant(genome=child, fitness=0.9, status="evaluated")]
    out = guards.filter(variants, {"p": 0.8})
    assert out[0].status == "evaluated"


def test_promote_auto_approves_by_default(guards):
    assert guards.promote(Genome(genome_id="champ")) is True


def test_promote_blocked_by_review():
    guards = Guards(load_config())

    class _Review:
        blocks_promotion = True

    assert guards.promote(Genome(genome_id="champ"), review=_Review()) is False


def test_compute_caps(guards):
    cfg = load_config()
    assert guards.within_caps(1, 1.0) is True
    assert guards.within_caps(cfg.max_total_sandboxes + 1, 1.0) is False
    assert guards.within_caps(1, cfg.max_wall_clock_s + 1) is False
