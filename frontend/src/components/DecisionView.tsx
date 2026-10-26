import { useMemo } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api, type DayView } from "../api";
import { axisGw, gw, gwh, longDay, signedGw, ukDateTime, ukTime } from "../format";
import { ChartCard, StatTile, Tip, axisProps, gridProps, useAsync } from "./ui";

interface Row {
  t: number;
  iso: string;
  actual?: number;
  forecast?: number;
  band?: [number, number];
  lead_h?: number;
}

/** Merge half-hourly actuals with hourly forecasts onto one time axis. */
function toRows(day: DayView): Row[] {
  const rows = new Map<string, Row>();
  const row = (iso: string) => {
    if (!rows.has(iso)) rows.set(iso, { t: Date.parse(iso), iso });
    return rows.get(iso)!;
  };
  for (const a of day.actual) row(a.t).actual = a.actual;
  for (const f of day.forecast) {
    const r = row(f.t);
    r.forecast = f.forecast;
    r.lead_h = f.lead_h;
    if (f.p10 != null && f.p90 != null) r.band = [f.p10, f.p90];
  }
  return [...rows.values()].sort((a, b) => a.t - b.t);
}

export function DecisionView(props: { date: string; cutoff: string; lookback: number }) {
  const { date, cutoff, lookback } = props;
  const { data, error, loading } = useAsync(() => api.day(date, cutoff, lookback), [date, cutoff, lookback]);
  const rows = useMemo(() => (data ? toRows(data) : []), [data]);
  // Tick every 3 hours on the hour, aligned to the forecast points.
  const ticks = useMemo(() => (data ? data.forecast.filter((_, i) => i % 3 === 0).map((f) => Date.parse(f.t)) : []), [data]);

  if (error) return <div className="state">Could not load {date}: {error}</div>;
  if (!data) return <div className="state">Loading…</div>;

  const s = data.summary;
  const r = s.realised;
  const firmMet = s.actual_mwh != null && s.firm_mwh != null ? s.actual_mwh >= s.firm_mwh : null;
  const runLabel = data.runs_used.map(ukDateTime).join(", ");

  return (
    <div style={{ opacity: loading ? 0.6 : 1, transition: "opacity .15s" }}>
      <div className="callout">
        For <b>{longDay(date)}</b>, the desk commits at <b>{cutoff} on the day before</b>. The newest wind
        forecast available then was published <b>{runLabel}</b> (UK time), so it looks{" "}
        <b>
          {s.lead_h_min?.toFixed(0)}–{s.lead_h_max?.toFixed(0)} h
        </b>{" "}
        ahead. The shaded band shows how wrong this kind of forecast has been over the previous {lookback} days
        that were already known at decision time.
      </div>

      <div className="tiles">
        <StatTile
          hero
          label="Wind to rely on (P90 confidence)"
          value={gwh(s.firm_mwh)}
          note={
            s.buffer_mwh != null ? (
              <>
                Forecast says {gwh(s.forecast_mwh)} — hold back <b>{gwh(s.buffer_mwh)}</b> as shortfall buffer
              </>
            ) : (
              "Not enough history to size a buffer"
            )
          }
        />
        <StatTile label="Forecast energy at decision" value={gwh(s.forecast_mwh)} note="Sum of hourly MW × 1 h" />
        <StatTile
          label="What actually blew"
          value={gwh(s.actual_mwh)}
          note={
            firmMet == null ? (
              "Actuals incomplete"
            ) : firmMet ? (
              <span className="status-good">✓ Above the P90 figure</span>
            ) : (
              <span className="status-bad">✕ Below the P90 figure</span>
            )
          }
        />
        <StatTile
          label="Realised forecast error"
          value={gw(r.mae)}
          note={<>Mean absolute · bias {signedGw(r.bias)} (actual − forecast)</>}
        />
      </div>

      <ChartCard
        title="Wind generation — forecast at decision vs actual"
        sub={`${longDay(date)} · GW · UK local time`}
        legend={[
          { label: "Actual (half-hourly)", kind: "line", color: "var(--series-actual)" },
          { label: `Forecast at ${cutoff} D-1`, kind: "line", color: "var(--series-forecast)" },
          ...(data.band
            ? [{ label: "P10–P90 error band", kind: "swatch" as const, color: "var(--band-fill)" }]
            : []),
        ]}
        table={{
          columns: ["Time", "Actual (MW)", "Forecast (MW)", "P10 (MW)", "P90 (MW)", "Lead (h)"],
          rows: rows.map((x) => [
            ukTime(x.iso),
            x.actual?.toFixed(0) ?? "",
            x.forecast?.toFixed(0) ?? "",
            x.band?.[0].toFixed(0) ?? "",
            x.band?.[1].toFixed(0) ?? "",
            x.lead_h?.toFixed(1) ?? "",
          ]),
        }}
      >
        <ResponsiveContainer width="100%" height={360}>
          <ComposedChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
            <CartesianGrid {...gridProps} />
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={["dataMin", "dataMax"]}
              ticks={ticks}
              tickFormatter={(t: number) => ukTime(new Date(t).toISOString())}
              {...axisProps}
            />
            <YAxis tickFormatter={axisGw} {...axisProps} width={48} />
            <Tooltip
              cursor={{ stroke: "var(--axis)" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const x = payload[0].payload as Row;
                return (
                  <Tip
                    title={ukTime(x.iso)}
                    rows={[
                      ["Actual", gw(x.actual, 2)],
                      ["Forecast", gw(x.forecast, 2)],
                      ...(x.band ? ([["P10–P90", `${gw(x.band[0])} – ${gw(x.band[1])}`]] as [string, string][]) : []),
                      ...(x.lead_h != null ? ([["Lead time", `${x.lead_h.toFixed(1)} h`]] as [string, string][]) : []),
                    ]}
                  />
                );
              }}
            />
            {data.band && (
              <Area dataKey="band" stroke="none" fill="var(--band-fill)" fillOpacity={1} connectNulls isAnimationActive={false} />
            )}
            <Line
              dataKey="forecast"
              stroke="var(--series-forecast)"
              strokeWidth={2}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
            <Line
              dataKey="actual"
              stroke="var(--series-actual)"
              strokeWidth={2}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
            <ReferenceLine y={0} stroke="var(--axis)" />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>

      {data.band && (
        <p className="muted" style={{ margin: "0 4px" }}>
          Band = forecast + P10 / P90 of {data.band.n} hourly errors observed on the {lookback} delivery days ending
          two days before {longDay(date)} (P10 {signedGw(data.band.p10)}, median {signedGw(data.band.p50)}, P90{" "}
          {signedGw(data.band.p90)}).
        </p>
      )}
    </div>
  );
}
