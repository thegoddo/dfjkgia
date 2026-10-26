"""Pure error statistics. Errors are `actual - forecast` in MW (negative = wind shortfall)."""

from __future__ import annotations

import math
from collections.abc import Sequence


def quantile(values: Sequence[float], q: float) -> float:
    """Linear-interpolated quantile (same as numpy's default), q in [0, 1]."""
    if not values:
        raise ValueError("quantile of empty sequence")
    s = sorted(values)
    pos = (len(s) - 1) * q
    lo, hi = math.floor(pos), math.ceil(pos)
    return s[lo] + (s[hi] - s[lo]) * (pos - lo)


def summarize(errors: Sequence[float], actuals: Sequence[float]) -> dict:
    """Headline accuracy metrics for paired errors/actuals."""
    n = len(errors)
    if n == 0:
        return {"n": 0}
    abs_err = [abs(e) for e in errors]
    mae = sum(abs_err) / n
    mean_actual = sum(actuals) / n
    return {
        "n": n,
        "mae": mae,
        "rmse": math.sqrt(sum(e * e for e in errors) / n),
        "bias": sum(errors) / n,
        "nmae_pct": 100 * mae / mean_actual if mean_actual else None,
        "p10": quantile(errors, 0.10),
        "p50": quantile(errors, 0.50),
        "p90": quantile(errors, 0.90),
        "abs_p90": quantile(abs_err, 0.90),
        "abs_max": max(abs_err),
    }


def histogram(values: Sequence[float], bin_width: float) -> list[dict]:
    """Fixed-width bins aligned to multiples of `bin_width`; empty interior bins included."""
    if not values:
        return []
    lo = math.floor(min(values) / bin_width)
    hi = math.floor(max(values) / bin_width)
    counts = [0] * (hi - lo + 1)
    for v in values:
        counts[math.floor(v / bin_width) - lo] += 1
    return [
        {"from": (lo + i) * bin_width, "to": (lo + i + 1) * bin_width, "count": c}
        for i, c in enumerate(counts)
    ]


def coverage(actuals: Sequence[float], lower: Sequence[float], upper: Sequence[float]) -> float | None:
    """Share of actuals falling inside [lower, upper]."""
    if not actuals:
        return None
    inside = sum(1 for a, lo, hi in zip(actuals, lower, upper, strict=True) if lo <= a <= hi)
    return inside / len(actuals)
