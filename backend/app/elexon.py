"""Thin client for the Elexon BMRS dataset stream endpoints."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

import httpx

BASE_URL = "https://data.elexon.co.uk/bmrs/api/v1/datasets"
CHUNK_DAYS = 14
TIMEOUT_S = 60.0


def _iso(dt: datetime) -> str:
    return dt.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def _get(client: httpx.Client, path: str, params: dict) -> list[dict]:
    resp = client.get(f"{BASE_URL}/{path}", params=params)
    resp.raise_for_status()
    return resp.json()


def fetch_windfor(publish_from: datetime, publish_to: datetime) -> list[dict]:
    """Wind forecasts whose publishTime falls in [publish_from, publish_to)."""
    rows: list[dict] = []
    with httpx.Client(timeout=TIMEOUT_S) as client:
        start = publish_from
        while start < publish_to:
            end = min(start + timedelta(days=CHUNK_DAYS), publish_to)
            rows += _get(
                client,
                "WINDFOR/stream",
                {"publishDateTimeFrom": _iso(start), "publishDateTimeTo": _iso(end)},
            )
            start = end
    return rows


def fetch_fuelhh_wind(settlement_from: date, settlement_to: date) -> list[dict]:
    """Half-hourly wind outturn for settlement dates in [settlement_from, settlement_to]."""
    rows: list[dict] = []
    with httpx.Client(timeout=TIMEOUT_S) as client:
        start = settlement_from
        while start <= settlement_to:
            end = min(start + timedelta(days=CHUNK_DAYS - 1), settlement_to)
            rows += _get(
                client,
                "FUELHH/stream",
                {
                    "settlementDateFrom": start.isoformat(),
                    "settlementDateTo": end.isoformat(),
                    "fuelType": "WIND",
                },
            )
            start = end + timedelta(days=1)
    return rows
