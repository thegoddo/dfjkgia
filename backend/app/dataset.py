"""In-memory dataset of wind actuals and forecast runs, plus snapshot persistence."""

from __future__ import annotations

import json
import logging
from bisect import bisect_right
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path

from . import config, elexon

log = logging.getLogger(__name__)


def parse_ts(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(UTC)


def fmt_ts(value: datetime) -> str:
    return value.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


@dataclass
class Dataset:
    """Actuals keyed by startTime; forecasts grouped into runs keyed by publishTime."""

    actuals: dict[datetime, float]
    runs: dict[datetime, dict[datetime, float]]
    source: str
    fetched_at: str
    publish_times: list[datetime] = field(init=False)

    def __post_init__(self) -> None:
        self.publish_times = sorted(self.runs)

    def latest_run_at_or_before(self, moment: datetime) -> datetime | None:
        """publishTime of the most recent forecast run published at or before `moment`."""
        i = bisect_right(self.publish_times, moment)
        return self.publish_times[i - 1] if i else None

    @classmethod
    def from_records(cls, fuelhh: list[dict], windfor: list[dict], source: str, fetched_at: str) -> Dataset:
        # FUELHH can be re-published for a period; keep the latest publication.
        latest_pub: dict[datetime, datetime] = {}
        actuals: dict[datetime, float] = {}
        for r in fuelhh:
            if r.get("fuelType", "WIND") != "WIND" or r.get("generation") is None:
                continue
            start, pub = parse_ts(r["startTime"]), parse_ts(r["publishTime"])
            if start not in latest_pub or pub >= latest_pub[start]:
                latest_pub[start] = pub
                actuals[start] = float(r["generation"])

        runs: dict[datetime, dict[datetime, float]] = {}
        for r in windfor:
            if r.get("generation") is None:
                continue
            runs.setdefault(parse_ts(r["publishTime"]), {})[parse_ts(r["startTime"])] = float(r["generation"])
        return cls(actuals=actuals, runs=runs, source=source, fetched_at=fetched_at)

    # --- snapshot persistence (compact: [time, value] tuples) -------------------------------

    def save(self, directory: Path) -> None:
        directory.mkdir(parents=True, exist_ok=True)
        actuals = [[fmt_ts(t), v] for t, v in sorted(self.actuals.items())]
        forecasts = [
            [fmt_ts(p), fmt_ts(t), v] for p in self.publish_times for t, v in sorted(self.runs[p].items())
        ]
        meta = {"fetched_at": self.fetched_at, "actual_rows": len(actuals), "forecast_rows": len(forecasts)}
        (directory / "fuelhh_wind.json").write_text(json.dumps(actuals, separators=(",", ":")))
        (directory / "windfor.json").write_text(json.dumps(forecasts, separators=(",", ":")))
        (directory / "meta.json").write_text(json.dumps(meta, indent=2))

    @classmethod
    def load(cls, directory: Path) -> Dataset:
        actual_rows = json.loads((directory / "fuelhh_wind.json").read_text())
        forecast_rows = json.loads((directory / "windfor.json").read_text())
        meta = json.loads((directory / "meta.json").read_text())
        runs: dict[datetime, dict[datetime, float]] = {}
        for pub, start, value in forecast_rows:
            runs.setdefault(parse_ts(pub), {})[parse_ts(start)] = float(value)
        actuals = {parse_ts(t): float(v) for t, v in actual_rows}
        return cls(actuals=actuals, runs=runs, source="snapshot", fetched_at=meta["fetched_at"])


def fetch_live() -> Dataset:
    windfor = elexon.fetch_windfor(config.DATA_PUBLISH_FROM, config.DATA_PUBLISH_TO)
    fuelhh = elexon.fetch_fuelhh_wind(config.DATA_SETTLEMENT_FROM, config.DATA_SETTLEMENT_TO)
    return Dataset.from_records(fuelhh, windfor, source="live", fetched_at=fmt_ts(datetime.now(UTC)))


def load_dataset() -> Dataset:
    if config.DATA_SOURCE == "live":
        try:
            return fetch_live()
        except Exception:  # network/API failure must not take the app down
            log.exception("Live fetch from Elexon failed; falling back to bundled snapshot")
    return Dataset.load(config.SNAPSHOT_DIR)
