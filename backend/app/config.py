"""Static configuration: analysis window and defaults."""

from __future__ import annotations

import os
from datetime import UTC, date, datetime, time
from pathlib import Path
from zoneinfo import ZoneInfo

UK_TZ = ZoneInfo("Europe/London")

# Purchase decisions made during January 2026 (on D-1) => delivery days 2 Jan .. 1 Feb.
FIRST_DELIVERY_DAY = date(2026, 1, 2)
LAST_DELIVERY_DAY = date(2026, 2, 1)

# GB day-ahead hourly auction gate closures (UK local time on D-1): EPEX 09:20, Nord Pool N2EX 09:50.
# Default to the earlier one: the forecast the desk has when the first auction closes.
DEFAULT_CUTOFF = time(9, 20)
AUCTION_GATES = {"09:20": "EPEX day-ahead gate", "09:50": "N2EX day-ahead gate"}
DEFAULT_LOOKBACK_DAYS = 14  # trailing days of errors used to size the uncertainty band
MAX_LOOKBACK_DAYS = 14
MAX_HORIZON_H = 48

# Data needed to cover the window plus the band look-back (D-15 .. D-2) and 48 h horizons.
DATA_PUBLISH_FROM = datetime(2025, 12, 14, tzinfo=UTC)
DATA_PUBLISH_TO = datetime(2026, 2, 2, tzinfo=UTC)
DATA_SETTLEMENT_FROM = date(2025, 12, 15)
DATA_SETTLEMENT_TO = date(2026, 2, 2)

SNAPSHOT_DIR = Path(__file__).resolve().parent.parent / "data"

# "snapshot" (default): bundled data, fast and offline. "live": fetch from Elexon at startup,
# falling back to the snapshot if Elexon is unreachable.
DATA_SOURCE = os.getenv("DATA_SOURCE", "snapshot").lower()
