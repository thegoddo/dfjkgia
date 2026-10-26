"""End-to-end API tests against the bundled January 2026 snapshot."""

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(scope="module")
def client():
    return TestClient(app)


def test_health(client):
    assert client.get("/api/health").json() == {"status": "ok"}


def test_meta_window(client):
    meta = client.get("/api/meta").json()
    assert meta["delivery_days"][0] == "2026-01-02"
    assert meta["delivery_days"][-1] == "2026-02-01"
    assert len(meta["delivery_days"]) == 31
    assert meta["default_cutoff"] == "09:20"


def test_day_view_uses_only_pre_cutoff_runs(client):
    body = client.get("/api/day", params={"date": "2026-01-15"}).json()
    assert body["complete"] is True
    assert len(body["forecast"]) == 24
    assert len(body["actual"]) == 48
    assert all(r <= body["cutoff_utc"] for r in body["runs_used"])
    assert body["band"]["p10"] <= body["band"]["p50"] <= body["band"]["p90"]
    s = body["summary"]
    assert s["firm_mwh"] <= s["forecast_mwh"]
    assert s["buffer_mwh"] == pytest.approx(s["forecast_mwh"] - s["firm_mwh"])


@pytest.mark.parametrize(
    "params",
    [
        {"date": "2026-03-01"},
        {"date": "2026-01-15", "cutoff": "25:00"},
        {"date": "2026-01-15", "lookback": 99},
    ],
)
def test_day_view_validation(client, params):
    assert client.get("/api/day", params=params).status_code == 422


def test_accuracy_covers_whole_window(client):
    body = client.get("/api/accuracy").json()
    assert body["overall"]["n"] == 31 * 24
    assert len(body["daily"]) == 31
    assert len(body["by_hour"]) == 24
    assert 0 < body["band_backtest"]["hourly_coverage"] <= 1
    assert sum(b["count"] for b in body["histogram"]) == body["overall"]["n"]


def test_horizons_error_grows_with_lead_time(client):
    rows = client.get("/api/horizons", params={"max_h": 48}).json()["horizons"]
    assert [r["horizon_h"] for r in rows] == list(range(49))
    assert rows[48]["mae"] > rows[0]["mae"]
