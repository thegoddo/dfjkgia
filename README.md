# WindScope

**GB wind forecasts for day-ahead power purchase decisions — January 2026 pilot.**

A trading desk buys the power it needs on the day-ahead market the day before delivery (D-1). How much
it has to buy depends on how much wind will turn up — which it only knows as a forecast. WindScope answers
the desk's two questions:

1. **What did the latest wind forecast say when we had to decide?** — the exact Elexon `WINDFOR` run that was
   available at the auction gate, for every hour of the delivery day.
2. **How wrong is that forecast, in numbers?** — error metrics over all January decisions, error vs lead
   time, by hour of day, and an uncertainty band / "wind you can rely on at P90" figure built only from
   information available at decision time.

**Live app:** _<add Vercel URL after deploy>_

> **AI usage:** This project was built with the help of an AI coding assistant (Claude Code, Anthropic),
> used for domain research, code generation, tests, and documentation. All logic, numbers and design
> decisions were reviewed and verified by running the code against the real Elexon data.

---

## Pilot findings (January 2026, decision at the 09:20 EPEX gate)

| Metric | Value |
|---|---|
| Forecast lead time at decision | 16.5 – 39.5 h |
| Mean absolute error (hourly) | **2.02 GW** (17.9 % of mean wind output, ~11.3 GW) |
| Bias (actual − forecast) | **−1.75 GW** — the forecast over-states wind almost every hour |
| P90 of absolute error | 4.2 GW |
| P10–P90 band coverage (back-tested) | **81.6 %** vs 80 % target — well calibrated |
| Days actual wind ≥ "P90 wind" figure | **28 / 31** |
| Error vs lead time (MAE) | 1.68 GW at 0 h → 1.93 GW at 24 h → 2.30 GW at 48 h |

Observations:
- The shortfall is **systematic** (bias ≈ −1.7 GW), worst overnight (≈ −2.3 GW at 03:00–06:00 UK) and smallest
  mid-afternoon (≈ −1.3 GW). A plausible driver is curtailment of transmission-connected wind during
  low-demand hours (the outturn is metered output after balancing actions) — worth confirming with
  balancing data before acting on it.
- A desk trading in the **N2EX auction (09:50 gate)** gets the 09:30 UTC forecast run; the EPEX (09:20) desk
  does not. Moving the decision time is a control in the app.
- Buying against the **P90 wind figure** instead of the raw forecast would have meant holding back on
  average ~96 GWh/day of wind, and wind still delivered that much on 28 of 31 days.

## How the analysis works

- **Data:** Elexon BMRS `FUELHH` (`fuelType=WIND`, half-hourly outturn) and `WINDFOR` (hourly forecast, ~8 runs a
  day, each spanning ~−25 h…+60 h).
- **Delivery window:** decisions made in January 2026 on D-1 → delivery days **2 Jan – 1 Feb 2026**.
- **Forecast at decision:** for each hourly target on day D, the value from the newest `WINDFOR` run with
  `publishTime ≤ cutoff on D-1` (UK local time, DST-aware). Default cutoff **09:20** (EPEX day-ahead gate);
  09:50 (N2EX) and hourly 06:00–17:00 are selectable.
- **Error** = actual − forecast, matched on the same `startTime` (forecasts are hourly; actuals half-hourly).
- **Error vs lead time:** for each target, the newest run published at least *H* hours earlier, H = 0…48.
- **Uncertainty band (no look-ahead):** P10/P50/P90 of the same rule's errors on delivery days D-15…D-2 (D-1's
  outturn is incomplete at decision time). Band = forecast + P10 … forecast + P90.
  **P90 wind** = Σ max(0, forecast + P10) over the day; **shortfall buffer** = forecast − P90 wind.

Full design notes: [`docs/spec.md`](docs/spec.md).

## Repository layout

```
.
├── api/index.py              # Vercel serverless entrypoint (wraps the FastAPI app)
├── backend/
│   ├── app/
│   │   ├── config.py         # analysis window, defaults, data-source switch
│   │   ├── elexon.py         # HTTP client for BMRS stream endpoints
│   │   ├── dataset.py        # normalisation, de-dup, indexing, snapshot load/save
│   │   ├── selection.py      # pure rules: cutoff → forecast in hand; forecast at horizon H
│   │   ├── metrics.py        # pure stats: MAE/RMSE/bias/quantiles/histogram/coverage
│   │   ├── service.py        # composes the above into API payloads
│   │   └── main.py           # FastAPI routes + validation
│   ├── data/                 # bundled snapshot of the Elexon data used (Dec 2025 – Feb 2026)
│   ├── scripts/fetch_snapshot.py  # refreshes data/ from Elexon
│   ├── tests/                # pytest: selection rules, metrics, API end-to-end
│   ├── Dockerfile
│   └── requirements*.txt, pyproject.toml
├── frontend/
│   ├── src/
│   │   ├── App.tsx           # shell, tabs, global controls
│   │   ├── api.ts            # typed API client
│   │   ├── format.ts         # units and UK-time formatting
│   │   ├── components/DecisionView.tsx  # one delivery day: forecast vs actual + band + KPIs
│   │   ├── components/AccuracyView.tsx  # January-wide accuracy analysis
│   │   ├── components/ui.tsx # stat tile, chart card (with table view), tooltip, fetch hook
│   │   └── styles.css        # design tokens (light/dark)
│   ├── Dockerfile, nginx.conf
│   └── vite.config.ts
├── docs/spec.md              # design spec
├── docs/video-script.md      # outline for the demo video
├── docker-compose.yml
├── vercel.json, requirements.txt   # Vercel deployment
└── .github/workflows/ci.yml  # lint + tests + frontend build
```

## API

| Route | Description |
|---|---|
| `GET /api/health` | liveness |
| `GET /api/meta` | delivery days, defaults, auction gates, data provenance |
| `GET /api/day?date=2026-01-15&cutoff=09:20&lookback=14` | decision view for one delivery day |
| `GET /api/accuracy?cutoff=09:20&lookback=14` | accuracy of the decision rule over January |
| `GET /api/horizons?max_h=48` | error metrics vs forecast lead time |

Interactive docs at `/docs` when running the backend locally.

## Running it

### Docker (recommended)

```bash
docker compose up --build
# open http://localhost:8080
```

Set `DATA_SOURCE=live` to fetch fresh data from Elexon at startup instead of the bundled snapshot
(it falls back to the snapshot if Elexon is unreachable): `DATA_SOURCE=live docker compose up --build`.

### Local development

```bash
# backend (Python 3.12+)
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
uvicorn app.main:app --reload --port 8000

# frontend (Node 20+), in a second terminal
cd frontend
npm install
npm run dev          # http://localhost:5173, proxies /api to :8000
```

### Tests and checks

```bash
cd backend && pytest -q && ruff check . && ruff format --check .
cd frontend && npm run build      # type-check + production build
```

### Refresh the data snapshot

```bash
cd backend && python -m scripts.fetch_snapshot
```

### Deploy to Vercel

The repo root is a Vercel project: the frontend is built to static files and `api/index.py` serves the FastAPI
app as a Python function (`vercel.json` routes `/api/*` to it).

```bash
npx vercel          # preview
npx vercel --prod   # production
```

## Key decisions and trade-offs

- **Bundled snapshot by default.** January 2026 is history and does not change; serving it from a snapshot makes
  the app fast and independent of Elexon uptime. The live path is the same code (`DATA_SOURCE=live`).
- **Pure functions for the domain logic** (`selection.py`, `metrics.py`) so the trading rules are unit-testable
  without HTTP or fixtures from the network; the API layer only validates and routes.
- **No look-ahead.** Everything shown "at decision time" uses only data published before the cutoff — the band
  uses errors from D-15…D-2.
- **No pandas/numpy.** ~30k rows fit comfortably in plain Python; dropping heavy deps keeps the serverless bundle
  small and cold starts quick.
- **Charts are accessible**: every chart has a table view, colours come from a colour-blind-validated palette, and
  dark mode is designed rather than inverted.

## Limitations / next steps

- National wind only (per the brief); solar and embedded generation would be the next datasets.
- Forecast is compared with the on-the-hour half-hour actual; an hourly-mean comparison is a one-line change.
- Bias root cause (curtailment hypothesis) not yet verified against BOALF/constraint data.
- A bias-corrected forecast (subtracting trailing bias) is an easy, high-value next feature.
