"""Lane B scorer tests: the leaderboard is only as credible as these."""

import pytest

from darwin.eval.scorers import exact_match, score_case, similarity_ratio


def test_exact_match():
    assert exact_match([1, 2, 3], [1, 2, 3]) == 1.0
    assert exact_match([1, 2], [1, 2, 3]) == 0.0
    assert exact_match("Fizz", "Fizz") == 1.0


def test_similarity_ratio_bounds():
    assert similarity_ratio("hello", "hello") == 1.0
    assert 0.0 <= similarity_ratio("hello", "world") <= 1.0
    assert similarity_ratio("", "") == 1.0


@pytest.mark.parametrize("task_type", ["code", "structured", "unknown"])
def test_code_like_types_use_exact_match(task_type):
    assert score_case(task_type, 55, 55, None) == 1.0
    assert score_case(task_type, 54, 55, None) == 0.0


def test_text_type_is_graded_by_similarity():
    assert score_case("text", "the cat sat", "the cat sat", None) == 1.0
    assert 0.0 < score_case("text", "the cat sat", "the cat sat on the mat", None) < 1.0


def test_error_always_scores_zero():
    assert score_case("code", None, 3, "raised: ZeroDivisionError") == 0.0
    assert score_case("text", None, "x", "boom") == 0.0
