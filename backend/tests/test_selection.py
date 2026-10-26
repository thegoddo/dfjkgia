from datetime import date, time

from app.selection import (
    decision_cutoff,
    forecast_at_decision,
    forecast_at_horizon,
    hourly_targets,
    latest_forecast,
)

from .conftest import ts


def test_cutoff_is_local_time_on_previous_day_in_winter():
    assert decision_cutoff(date(2026, 1, 10), time(11, 0)) == ts("2026-01-09T11:00")


def test_cutoff_respects_british_summer_time():
    # 11:00 BST == 10:00 UTC
    assert decision_cutoff(date(2026, 7, 10), time(11, 0)) == ts("2026-07-09T10:00")


def test_hourly_targets_handle_dst_days():
    assert len(hourly_targets(date(2026, 1, 10))) == 24
    assert len(hourly_targets(date(2026, 3, 29))) == 23  # clocks go forward
    assert len(hourly_targets(date(2026, 10, 25))) == 25  # clocks go back


def test_forecast_at_decision_ignores_runs_published_after_cutoff(tiny_dataset):
    picks = forecast_at_decision(tiny_dataset, date(2026, 1, 10), time(11, 0))
    assert len(picks) == 24
    assert {p.value for p in picks} == {1000.0}
    assert {p.publish_time for p in picks} == {ts("2026-01-09T09:30")}
    assert picks[0].lead_hours == 14.5


def test_later_cutoff_picks_newer_run(tiny_dataset):
    picks = forecast_at_decision(tiny_dataset, date(2026, 1, 10), time(12, 0))
    assert {p.value for p in picks} == {9999.0}


def test_run_published_exactly_at_cutoff_is_included(tiny_dataset):
    picks = forecast_at_decision(tiny_dataset, date(2026, 1, 10), time(11, 30))
    assert {p.value for p in picks} == {9999.0}


def test_no_forecast_before_first_run(tiny_dataset):
    assert forecast_at_decision(tiny_dataset, date(2026, 1, 10), time(8, 0)) == []


def test_latest_forecast_walks_back_when_newest_run_lacks_target(tiny_dataset):
    target = ts("2026-01-10T05:00")
    del tiny_dataset.runs[ts("2026-01-09T11:30")][target]
    pick = latest_forecast(tiny_dataset, target, ts("2026-01-09T12:00"))
    assert pick.value == 1000.0


def test_forecast_at_horizon_requires_minimum_lead(tiny_dataset):
    target = ts("2026-01-10T12:00")
    assert forecast_at_horizon(tiny_dataset, target, 24).value == 9999.0  # 11:30 run, lead 24.5 h
    assert forecast_at_horizon(tiny_dataset, target, 25).value == 1000.0  # only 09:30 run qualifies
    assert forecast_at_horizon(tiny_dataset, target, 27) is None
