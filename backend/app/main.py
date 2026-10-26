"""FastAPI entrypoint: request validation and routing only; logic lives in service.py."""

from __future__ import annotations

import logging
from datetime import date, time
from functools import lru_cache
from pathlib import Path
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles

from . import config
from .dataset import load_dataset
from .service import WindService, delivery_days

logging.basicConfig(level=logging.INFO)

app = FastAPI(
    title="WindScope API",
    description="Day-ahead wind forecast vs actuals for GB, January 2026 purchase decisions.",
    version="1.0.0",
)
app.add_middleware(GZipMiddleware, minimum_size=1024)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET"], allow_headers=["*"])


@lru_cache(maxsize=1)
def get_service() -> WindService:
    return WindService(load_dataset())


Service = Annotated[WindService, Depends(get_service)]
CutoffParam = Annotated[
    str, Query(pattern=r"^([01]\d|2[0-3]):[0-5]\d$", description="Local UK time on D-1, HH:MM")
]
LookbackParam = Annotated[int, Query(ge=3, le=config.MAX_LOOKBACK_DAYS)]
DEFAULT_CUTOFF = config.DEFAULT_CUTOFF.strftime("%H:%M")


def parse_cutoff(value: str) -> time:
    hours, minutes = map(int, value.split(":"))
    return time(hours, minutes)


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/api/meta")
def meta(svc: Service) -> dict:
    return svc.meta()


@app.get("/api/day")
def day(
    svc: Service,
    date_: Annotated[date, Query(alias="date")],
    cutoff: CutoffParam = DEFAULT_CUTOFF,
    lookback: LookbackParam = config.DEFAULT_LOOKBACK_DAYS,
) -> dict:
    if date_ not in delivery_days():
        raise HTTPException(
            422,
            f"date must be a delivery day between {config.FIRST_DELIVERY_DAY} and {config.LAST_DELIVERY_DAY}",
        )
    return svc.day_view(date_, parse_cutoff(cutoff), lookback)


@app.get("/api/accuracy")
def accuracy(
    svc: Service,
    cutoff: CutoffParam = DEFAULT_CUTOFF,
    lookback: LookbackParam = config.DEFAULT_LOOKBACK_DAYS,
) -> dict:
    return svc.accuracy(parse_cutoff(cutoff), lookback)


@app.get("/api/horizons")
def horizons(
    svc: Service,
    max_h: Annotated[int, Query(ge=1, le=config.MAX_HORIZON_H)] = config.MAX_HORIZON_H,
) -> dict:
    return svc.horizons(max_h)


# Serve the built frontend from the same origin when it is present (Vercel, or a local `npm run build`).
# Mounted last so the /api routes and /docs take precedence.
FRONTEND_DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"

if FRONTEND_DIST.is_dir():
    app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")
else:

    @app.api_route("/", methods=["GET", "HEAD"], include_in_schema=False)
    def root() -> RedirectResponse:
        # API-only deploy (e.g. Render): send visitors and platform probes to the API docs.
        return RedirectResponse("/docs")
