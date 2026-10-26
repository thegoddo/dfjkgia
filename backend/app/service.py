"""Composes dataset, selection rules and metrics into API payloads."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from functools import lru_cache

from . import config, metrics
from .dataset import Dataset, fmt_ts
from .selection import (
    day_bounds,
    decision_cutoff,
    forecast_at_decision,
    forecast_at_horizon,
    hourly_targets,
)

HALF_HOUR_H = 0.5
HISTOGRAM_BIN_MW = 500


@dataclass(frozen=True)
class Pair:
    """A forecast matched with the actual for the same target time."""

    target: datetime
    forecast: float
    actual: float
    publish_time: datetime
    lead_hours: float

    @property
    def error(self) -> float:
        return self.actual - self.forecast


def delivery_days() -> list[date]:
    n = (config.LAST_DELIVERY_DAY - config.FIRST_DELIVERY_DAY).days + 1
    return [config.FIRST_DELIVERY_DAY + timedelta(days=i) for i in range(n)]


class WindService:
    def __init__(self, ds: Dataset) -> None:
        self.ds = ds
        # Results are pure functions of immutable data, so memoise per instance.
        self.decision_pairs = lru_cache(maxsize=2048)(self._decision_pairs)

    # --- building blocks ----------------------------------------------------------------

    def _decision_pairs(self, day: date, cutoff: time) -> tuple[Pair, ...]:
        pairs = []
        for sel in forecast_at_decision(self.ds, day, cutoff):
            actual = self.ds.actuals.get(sel.target)
            if actual is not None:
                pairs.append(Pair(sel.target, sel.value, actual, sel.publish_time, sel.lead_hours))
        return tuple(pairs)

    def trailing_errors(self, day: date, cutoff: time, lookback: int) -> list[float]:
        """Errors of the same decision rule on days D-(lookback+1) .. D-2.

        D-1's actuals are not complete at the D-1 cutoff, so it is excluded: no look-ahead.
        """
        errors: list[float] = []
        for k in range(2, lookback + 2):
            errors += [p.error for p in self.decision_pairs(day - timedelta(days=k), cutoff)]
        return errors

    def band(self, day: date, cutoff: time, lookback: int) -> dict | None:
        errs = self.trailing_errors(day, cutoff, lookback)
        if len(errs) < 24:
            return None
        return {q: metrics.quantile(errs, v) for q, v in (("p10", 0.1), ("p50", 0.5), ("p90", 0.9))} | {
            "n": len(errs)
        }

    def actual_mwh(self, day: date) -> float | None:
        start, end = day_bounds(day)
        values = [v for t, v in self.ds.actuals.items() if start <= t < end]
        expected = int((end - start).total_seconds() // 1800)
        return sum(values) * HALF_HOUR_H if len(values) == expected else None

    # --- payloads -----------------------------------------------------------------------

    def meta(self) -> dict:
        return {
            "delivery_days": [d.isoformat() for d in delivery_days()],
            "default_cutoff": config.DEFAULT_CUTOFF.strftime("%H:%M"),
            "auction_gates": config.AUCTION_GATES,
            "default_lookback_days": config.DEFAULT_LOOKBACK_DAYS,
            "max_lookback_days": config.MAX_LOOKBACK_DAYS,
            "max_horizon_h": config.MAX_HORIZON_H,
            "publish_times_utc": sorted({p.strftime("%H:%M") for p in self.ds.publish_times}),
            "data": {
                "source": self.ds.source,
                "fetched_at": self.ds.fetched_at,
                "forecast_runs": len(self.ds.publish_times),
                "actual_points": len(self.ds.actuals),
            },
        }

    def day_view(self, day: date, cutoff: time, lookback: int) -> dict:
        selections = forecast_at_decision(self.ds, day, cutoff)
        band = self.band(day, cutoff, lookback)
        start, end = day_bounds(day)

        forecast_points = []
        for s in selections:
            point = {"t": fmt_ts(s.target), "forecast": s.value, "lead_h": s.lead_hours}
            if band:
                point["p10"] = max(0.0, s.value + band["p10"])
                point["p90"] = s.value + band["p90"]
            forecast_points.append(point)

        actual_points = [
            {"t": fmt_ts(t), "actual": v} for t, v in sorted(self.ds.actuals.items()) if start <= t < end
        ]

        pairs = self.decision_pairs(day, cutoff)
        forecast_mwh = sum(s.value for s in selections)  # hourly MW x 1 h
        firm_mwh = sum(p["p10"] for p in forecast_points) if band else None
        runs_used = sorted({fmt_ts(s.publish_time) for s in selections})

        return {
            "date": day.isoformat(),
            "cutoff_local": cutoff.strftime("%H:%M"),
            "cutoff_utc": fmt_ts(decision_cutoff(day, cutoff)),
            "runs_used": runs_used,
            "complete": len(selections) == len(hourly_targets(day)),
            "forecast": forecast_points,
            "actual": actual_points,
            "band": band,
            "summary": {
                "forecast_mwh": forecast_mwh,
                "firm_mwh": firm_mwh,
                "buffer_mwh": forecast_mwh - firm_mwh if firm_mwh is not None else None,
                "actual_mwh": self.actual_mwh(day),
                "realised": metrics.summarize([p.error for p in pairs], [p.actual for p in pairs]),
                "lead_h_min": min((s.lead_hours for s in selections), default=None),
                "lead_h_max": max((s.lead_hours for s in selections), default=None),
            },
        }

    def accuracy(self, cutoff: time, lookback: int) -> dict:
        all_pairs: list[Pair] = []
        daily = []
        band_actual, band_lo, band_hi = [], [], []
        days_covered = days_with_band = 0

        for day in delivery_days():
            pairs = self.decision_pairs(day, cutoff)
            all_pairs += pairs
            band = self.band(day, cutoff, lookback)
            if band:
                for p in pairs:
                    band_actual.append(p.actual)
                    band_lo.append(max(0.0, p.forecast + band["p10"]))
                    band_hi.append(p.forecast + band["p90"])
            day_errs = [p.error for p in pairs]
            actual_mwh = self.actual_mwh(day)
            view = self.day_view(day, cutoff, lookback)["summary"]
            if view["firm_mwh"] is not None and actual_mwh is not None:
                days_with_band += 1
                days_covered += actual_mwh >= view["firm_mwh"]
            daily.append(
                {
                    "date": day.isoformat(),
                    "mae": sum(map(abs, day_errs)) / len(day_errs) if day_errs else None,
                    "bias": sum(day_errs) / len(day_errs) if day_errs else None,
                    "forecast_mwh": view["forecast_mwh"],
                    "firm_mwh": view["firm_mwh"],
                    "actual_mwh": actual_mwh,
                }
            )

        errors = [p.error for p in all_pairs]
        by_hour = []
        for h in range(24):
            hp = [p for p in all_pairs if p.target.astimezone(config.UK_TZ).hour == h]
            s = metrics.summarize([p.error for p in hp], [p.actual for p in hp])
            by_hour.append({"hour": h, **{k: s.get(k) for k in ("n", "mae", "bias", "p10", "p90")}})

        return {
            "cutoff_local": cutoff.strftime("%H:%M"),
            "lookback_days": lookback,
            "overall": metrics.summarize(errors, [p.actual for p in all_pairs]),
            "lead_h_range": [min(p.lead_hours for p in all_pairs), max(p.lead_hours for p in all_pairs)]
            if all_pairs
            else None,
            "band_backtest": {
                "hourly_coverage": metrics.coverage(band_actual, band_lo, band_hi),
                "target_coverage": 0.8,
                "days_firm_met": days_covered,
                "days_evaluated": days_with_band,
            },
            "daily": daily,
            "by_hour": by_hour,
            "histogram": metrics.histogram(errors, HISTOGRAM_BIN_MW),
        }

    def horizons(self, max_h: int) -> dict:
        targets = [t for day in delivery_days() for t in hourly_targets(day)]
        rows = []
        for h in range(max_h + 1):
            errs, acts = [], []
            for t in targets:
                actual = self.ds.actuals.get(t)
                sel = forecast_at_horizon(self.ds, t, h)
                if actual is None or sel is None:
                    continue
                errs.append(actual - sel.value)
                acts.append(actual)
            s = metrics.summarize(errs, acts)
            keys = ("n", "mae", "rmse", "bias", "p10", "p90", "nmae_pct")
            rows.append({"horizon_h": h, **{k: s.get(k) for k in keys}})
        return {"horizons": rows}
