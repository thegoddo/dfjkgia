from datetime import UTC, datetime, timedelta

import pytest

from app.dataset import Dataset

UTC = UTC


def ts(s: str) -> datetime:
    return datetime.fromisoformat(s).replace(tzinfo=UTC)


@pytest.fixture
def tiny_dataset() -> Dataset:
    """Two forecast runs either side of the 11:00 D-1 cutoff for delivery day 2026-01-10."""
    hours = [ts("2026-01-10T00:00") + timedelta(hours=h) for h in range(24)]
    early = {t: 1000.0 for t in hours}  # published 09:30 on D-1: before cutoff
    late = {t: 9999.0 for t in hours}  # published 11:30 on D-1: after cutoff, must be ignored
    actuals = {}
    for t in hours:
        actuals[t] = 900.0
        actuals[t + timedelta(minutes=30)] = 900.0
    return Dataset(
        actuals=actuals,
        runs={ts("2026-01-09T09:30"): early, ts("2026-01-09T11:30"): late},
        source="test",
        fetched_at="2026-01-01T00:00:00Z",
    )
