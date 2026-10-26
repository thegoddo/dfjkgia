"""Pure rules for picking which forecast a trader would have had in hand.

All datetimes are timezone-aware UTC. Delivery days and cutoffs are expressed in UK local time,
so DST transitions (23/25-hour days) are handled by zoneinfo rather than hard-coded offsets.
"""

from __future__ import annotations

from bisect import bisect_right
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta

from .config import UK_TZ
from .dataset import Dataset

HOUR = timedelta(hours=1)


@dataclass(frozen=True)
class SelectedForecast:
    target: datetime
    value: float
    publish_time: datetime

    @property
    def lead_hours(self) -> float:
        return (self.target - self.publish_time) / HOUR


def decision_cutoff(delivery_day: date, cutoff: time) -> datetime:
    """UTC instant at which the desk commits for `delivery_day` (cutoff local time on D-1)."""
    local = datetime.combine(delivery_day - timedelta(days=1), cutoff, tzinfo=UK_TZ)
    return local.astimezone(UTC)


def day_bounds(delivery_day: date) -> tuple[datetime, datetime]:
    """[start, end) of a UK-local delivery day, in UTC."""
    start = datetime.combine(delivery_day, time(0), tzinfo=UK_TZ).astimezone(UTC)
    end = datetime.combine(delivery_day + timedelta(days=1), time(0), tzinfo=UK_TZ).astimezone(UTC)
    return start, end


def hourly_targets(delivery_day: date) -> list[datetime]:
    start, end = day_bounds(delivery_day)
    n = int((end - start) / HOUR)
    return [start + i * HOUR for i in range(n)]


def latest_forecast(ds: Dataset, target: datetime, published_by: datetime) -> SelectedForecast | None:
    """Most recent forecast for `target` among runs published at or before `published_by`.

    Normally the newest run covers the target; walking back handles the odd run that does not.
    """
    i = bisect_right(ds.publish_times, published_by)
    while i > 0:
        i -= 1
        pub = ds.publish_times[i]
        value = ds.runs[pub].get(target)
        if value is not None:
            return SelectedForecast(target, value, pub)
    return None


def forecast_at_decision(ds: Dataset, delivery_day: date, cutoff: time) -> list[SelectedForecast]:
    """The forecast in hand at the decision cutoff, for every hour of the delivery day."""
    published_by = decision_cutoff(delivery_day, cutoff)
    picks = (latest_forecast(ds, t, published_by) for t in hourly_targets(delivery_day))
    return [p for p in picks if p is not None]


def forecast_at_horizon(ds: Dataset, target: datetime, horizon_h: int) -> SelectedForecast | None:
    """Latest forecast for `target` published at least `horizon_h` hours before it."""
    return latest_forecast(ds, target, target - horizon_h * HOUR)
