import { useState } from "react";
import { api } from "./api";
import { AccuracyView } from "./components/AccuracyView";
import { DecisionView } from "./components/DecisionView";
import { useAsync } from "./components/ui";
import { dayLabel, ukDateTime } from "./format";

type Tab = "decision" | "accuracy";

// Decision cutoffs offered: on the hour, 06:00–17:00 local on D-1, plus the auction gate times.
const HOURLY = Array.from({ length: 12 }, (_, i) => `${String(6 + i).padStart(2, "0")}:00`);
const cutoffOptions = (gates: Record<string, string>) => [...new Set([...HOURLY, ...Object.keys(gates)])].sort();

export default function App() {
  const meta = useAsync(() => api.meta(), []);
  const [tab, setTab] = useState<Tab>("decision");
  const [date, setDate] = useState<string>("2026-01-15");
  const [cutoff, setCutoff] = useState<string>("09:20") // EPEX day-ahead gate; matches backend default;
  const [lookback, setLookback] = useState<number>(14);

  if (meta.error) return <div className="state">Could not reach the API: {meta.error}</div>;
  if (!meta.data) return <div className="state">Loading…</div>;

  const days = meta.data.delivery_days;
  const idx = days.indexOf(date);

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <img src="/favicon.svg" width={36} height={36} alt="" />
          <div>
            <h1>WindScope</h1>
            <p>GB wind forecasts for day-ahead purchase decisions · January 2026</p>
          </div>
        </div>
        <nav className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === "decision"} onClick={() => setTab("decision")}>
            Decision day
          </button>
          <button role="tab" aria-selected={tab === "accuracy"} onClick={() => setTab("accuracy")}>
            Forecast accuracy
          </button>
        </nav>
      </header>

      <div className="controls">
        {tab === "decision" && (
          <div className="control">
            <label htmlFor="day">Delivery day</label>
            <div className="stepper">
              <button aria-label="Previous day" disabled={idx <= 0} onClick={() => setDate(days[idx - 1])}>
                ‹
              </button>
              <select id="day" value={date} onChange={(e) => setDate(e.target.value)}>
                {days.map((d) => (
                  <option key={d} value={d}>
                    {dayLabel(d, { weekday: "short", day: "numeric", month: "short" })}
                  </option>
                ))}
              </select>
              <button aria-label="Next day" disabled={idx >= days.length - 1} onClick={() => setDate(days[idx + 1])}>
                ›
              </button>
            </div>
          </div>
        )}
        <div className="control">
          <label htmlFor="cutoff">Decision time (D-1, UK)</label>
          <select id="cutoff" value={cutoff} onChange={(e) => setCutoff(e.target.value)}>
            {cutoffOptions(meta.data.auction_gates).map((c) => (
              <option key={c} value={c}>
                {c}
                {meta.data!.auction_gates[c] ? ` · ${meta.data!.auction_gates[c]}` : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="control">
          <label htmlFor="lookback">Error history for band</label>
          <select id="lookback" value={lookback} onChange={(e) => setLookback(Number(e.target.value))}>
            {[7, 10, 14].map((n) => (
              <option key={n} value={n}>
                {n} days
              </option>
            ))}
          </select>
        </div>
        <p className="hint">
          New wind forecast runs land through the day ({meta.data.publish_times_utc.join(", ")} UTC). Moving the
          decision time changes which run the desk had in hand.
        </p>
      </div>

      {tab === "decision" ? (
        <DecisionView date={date} cutoff={cutoff} lookback={lookback} />
      ) : (
        <AccuracyView cutoff={cutoff} lookback={lookback} maxHorizon={meta.data.max_horizon_h} />
      )}

      <footer>
        Source: Elexon BMRS — FUELHH (wind outturn) and WINDFOR (wind forecast). Data {meta.data.data.source},
        retrieved {ukDateTime(meta.data.data.fetched_at)}. {meta.data.data.forecast_runs} forecast runs,{" "}
        {meta.data.data.actual_points.toLocaleString("en-GB")} half-hourly actuals.
      </footer>
    </div>
  );
}
