import math

import pytest

from app import metrics


def test_quantile_matches_linear_interpolation():
    values = [1, 2, 3, 4]
    assert metrics.quantile(values, 0) == 1
    assert metrics.quantile(values, 1) == 4
    assert metrics.quantile(values, 0.5) == 2.5
    assert metrics.quantile(values, 0.1) == pytest.approx(1.3)


def test_quantile_rejects_empty():
    with pytest.raises(ValueError):
        metrics.quantile([], 0.5)


def test_summarize_known_vector():
    s = metrics.summarize([-2.0, 2.0, 4.0], [10.0, 10.0, 10.0])
    assert s["n"] == 3
    assert s["mae"] == pytest.approx(8 / 3)
    assert s["rmse"] == pytest.approx(math.sqrt(8))
    assert s["bias"] == pytest.approx(4 / 3)
    assert s["nmae_pct"] == pytest.approx(100 * (8 / 3) / 10)
    assert s["abs_max"] == 4.0


def test_summarize_empty():
    assert metrics.summarize([], []) == {"n": 0}


def test_histogram_bins_and_counts():
    bins = metrics.histogram([-600, -100, 100, 1100], 500)
    assert [b["from"] for b in bins] == [-1000, -500, 0, 500, 1000]
    assert [b["count"] for b in bins] == [1, 1, 1, 0, 1]


def test_coverage():
    assert metrics.coverage([1, 5, 10], [0, 0, 0], [6, 6, 6]) == pytest.approx(2 / 3)
    assert metrics.coverage([], [], []) is None
