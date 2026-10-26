"""Refresh the bundled data snapshot from Elexon BMRS.

Usage (from backend/):  python -m scripts.fetch_snapshot
"""

from __future__ import annotations

from app import config
from app.dataset import fetch_live


def main() -> None:
    ds = fetch_live()
    ds.save(config.SNAPSHOT_DIR)
    print(
        f"Saved {len(ds.actuals)} actual points and {len(ds.publish_times)} forecast runs "
        f"to {config.SNAPSHOT_DIR}"
    )


if __name__ == "__main__":
    main()
