import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../api";
import { axisGw, dayLabel, gw, gwh, pct, signedGw } from "../format";
import { ChartCard, StatTile, Tip, axisProps, gridProps, useAsync } from "./ui";

/** Ticks every `step` spanning the values and always including zero. */
function niceTicks(values: number[], step: number): number[] {
  const lo = Math.floor(Math.min(0, ...values) / step) * step;
  const hi = Math.ceil(Math.max(0, ...values) / step) * step;
  return Array.from({ length: (hi - lo) / step + 1 }, (_, i) => lo + i * step);
}

const signColor = (v: number) => (v < 0 ? "var(--neg)" : "var(--pos)");

export function AccuracyView(props: { cutoff: string; lookback: number; maxHorizon: number }) {
  const { cutoff, lookback, maxHorizon } = props;
  const acc = useAsync(() => api.accuracy(cutoff, lookback), [cutoff, lookback]);
  const hz = useAsync(() => api.horizons(maxHorizon), [maxHorizon]);

  if (acc.error || hz.error) return <div className="state">Could not load accuracy data: {acc.error ?? hz.error}</div>;
  if (!acc.data || !hz.data) return <div className="state">Loading…</div>;

  const a = acc.data;
  const o = a.overall;
  const bt = a.band_backtest;
  const horizons = hz.data.horizons.map((h) => ({ ...h, band: [h.p10, h.p90] as [number, number] }));
  const [leadLo, leadHi] = a.lead_h_range ?? [0, 0];
  const histogram = a.histogram.map((b) => ({ ...b, mid: (b.from + b.to) / 2 }));
  const biasTicks = niceTicks(a.by_hour.map((h) => h.bias ?? 0), 500);

  return (
    <div style={{ opacity: acc.loading ? 0.6 : 1, transition: "opacity .15s" }}>
      <div className="callout">
        Across all <b>{a.daily.length} January purchase decisions</b> made at <b>{cutoff} D-1</b>, the wind forecast in
        hand looked <b>{leadLo.toFixed(0)}–{leadHi.toFixed(0)} h</b> ahead. Errors are <b>actual − forecast</b>:
        negative means less wind arrived than forecast, so the desk was short.
      </div>

      <div className="tiles">
        <StatTile
          hero
          label="Typical error at decision time"
          value={gw(o.mae, 2)}
          note={<>Mean absolute error per hour · {pct(o.nmae_pct)} of average wind output</>}
        />
        <StatTile label="Systematic bias" value={signedGw(o.bias, 2)} note="Mean of actual − forecast" />
        <StatTile label="Bad-hour error (P90 |error|)" value={gw(o.abs_p90, 1)} note={`Worst hour ${gw(o.abs_max, 1)}`} />
        <StatTile
          label="P10–P90 band coverage"
          value={pct(bt.hourly_coverage == null ? null : bt.hourly_coverage * 100)}
          note={`Target ${pct(bt.target_coverage * 100)} — band is ${
            bt.hourly_coverage != null && Math.abs(bt.hourly_coverage - bt.target_coverage) < 0.05
              ? "well calibrated"
              : "miscalibrated"
          }`}
        />
        <StatTile
          label="Days P90 wind was delivered"
          value={`${bt.days_firm_met} / ${bt.days_evaluated}`}
          note="Actual daily energy ≥ the P90 figure used to buy"
        />
      </div>

      <ChartCard
        title="Daily wind energy: forecast, P90 plan and outturn"
        sub="GWh per delivery day"
        legend={[
          { label: "Actual", kind: "line", color: "var(--series-actual)" },
          { label: `Forecast at ${cutoff} D-1`, kind: "line", color: "var(--series-forecast)" },
          { label: "P90 wind (plan to rely on)", kind: "dash" },
        ]}
        table={{
          columns: ["Delivery day", "Forecast (GWh)", "P90 (GWh)", "Actual (GWh)", "MAE (MW)", "Bias (MW)"],
          rows: a.daily.map((d) => [
            dayLabel(d.date),
            (d.forecast_mwh / 1000).toFixed(0),
            d.firm_mwh == null ? "" : (d.firm_mwh / 1000).toFixed(0),
            d.actual_mwh == null ? "" : (d.actual_mwh / 1000).toFixed(0),
            d.mae?.toFixed(0) ?? "",
            d.bias?.toFixed(0) ?? "",
          ]),
        }}
      >
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={a.daily} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="date" tickFormatter={(d: string) => dayLabel(d)} {...axisProps} minTickGap={16} />
            <YAxis tickFormatter={axisGw} {...axisProps} width={48} />
            <Tooltip
              cursor={{ stroke: "var(--axis)" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload as (typeof a.daily)[number];
                return (
                  <Tip
                    title={dayLabel(d.date, { weekday: "short", day: "numeric", month: "short" })}
                    rows={[
                      ["Actual", gwh(d.actual_mwh)],
                      ["Forecast", gwh(d.forecast_mwh)],
                      ["P90 plan", gwh(d.firm_mwh)],
                      ["Hourly MAE", gw(d.mae, 2)],
                    ]}
                  />
                );
              }}
            />
            <Line dataKey="firm_mwh" stroke="var(--firm)" strokeWidth={1.5} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
            <Line dataKey="forecast_mwh" stroke="var(--series-forecast)" strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line
              dataKey="actual_mwh"
              stroke="var(--series-actual)"
              strokeWidth={2}
              dot={{ r: 3, strokeWidth: 0, fill: "var(--series-actual)" }}
              activeDot={{ r: 5, stroke: "var(--surface)", strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <div className="grid-2">
        <ChartCard
          title="Error grows with lead time"
          sub={`All January targets · forecast published ≥ H hours ahead · GW · shaded = leads used at ${cutoff} D-1`}
          legend={[
            { label: "Mean absolute error", kind: "line", color: "var(--series-forecast)" },
            { label: "Bias (actual − forecast)", kind: "line", color: "var(--neg)" },
            { label: "P10–P90 error", kind: "swatch", color: "var(--band-fill)" },
          ]}
          table={{
            columns: ["Lead (h)", "MAE (MW)", "RMSE (MW)", "Bias (MW)", "P10 (MW)", "P90 (MW)", "n"],
            rows: horizons.map((h) => [
              h.horizon_h,
              h.mae?.toFixed(0) ?? "",
              h.rmse?.toFixed(0) ?? "",
              h.bias?.toFixed(0) ?? "",
              h.p10?.toFixed(0) ?? "",
              h.p90?.toFixed(0) ?? "",
              h.n,
            ]),
          }}
        >
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={horizons} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
              <CartesianGrid {...gridProps} />
              <ReferenceArea x1={Math.ceil(leadLo)} x2={Math.floor(leadHi)} fill="var(--accent-wash)" stroke="none" />
              <XAxis dataKey="horizon_h" type="number" domain={[0, maxHorizon]} ticks={[0, 6, 12, 18, 24, 30, 36, 42, 48]} unit="h" {...axisProps} />
              <YAxis tickFormatter={axisGw} {...axisProps} width={48} />
              <ReferenceLine y={0} stroke="var(--axis)" />
              <Tooltip
                cursor={{ stroke: "var(--axis)" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const h = payload[0].payload as (typeof horizons)[number];
                  return (
                    <Tip
                      title={`≥ ${h.horizon_h} h ahead`}
                      rows={[
                        ["MAE", gw(h.mae, 2)],
                        ["Bias", signedGw(h.bias, 2)],
                        ["P10 / P90", `${signedGw(h.p10)} / ${signedGw(h.p90)}`],
                      ]}
                    />
                  );
                }}
              />
              <Area dataKey="band" stroke="none" fill="var(--band-fill)" fillOpacity={1} isAnimationActive={false} />
              <Line dataKey="bias" stroke="var(--neg)" strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line dataKey="mae" stroke="var(--series-forecast)" strokeWidth={2} dot={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Distribution of hourly errors"
          sub={`Decision forecast at ${cutoff} D-1 · hours per 0.5 GW bin · GW`}
          legend={[
            { label: "Shortfall (less wind than forecast)", kind: "swatch", color: "var(--neg)" },
            { label: "Surplus", kind: "swatch", color: "var(--pos)" },
          ]}
          table={{
            columns: ["From (MW)", "To (MW)", "Hours"],
            rows: histogram.map((b) => [b.from, b.to, b.count]),
          }}
        >
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={histogram} margin={{ top: 8, right: 12, bottom: 0, left: -12 }} barCategoryGap={2}>
              <CartesianGrid {...gridProps} />
              <XAxis
                dataKey="from"
                interval={0}
                tickFormatter={(v: number) => (v % 1000 === 0 ? `${v / 1000}` : "")}
                {...axisProps}
              />
              <YAxis allowDecimals={false} {...axisProps} width={48} />
              <Tooltip
                cursor={{ fill: "var(--accent-wash)" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const b = payload[0].payload as (typeof histogram)[number];
                  return <Tip title={`${signedGw(b.from)} to ${signedGw(b.to)}`} rows={[["Hours", b.count]]} />;
                }}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false}>
                {histogram.map((b) => (
                  <Cell key={b.from} fill={signColor(b.mid)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <ChartCard
        title="Bias by hour of day"
        sub={`Mean actual − forecast for each delivery hour (UK time) · GW · below zero = desk short`}
        legend={[
          { label: "Shortfall", kind: "swatch", color: "var(--neg)" },
          { label: "Surplus", kind: "swatch", color: "var(--pos)" },
        ]}
        table={{
          columns: ["Hour", "Bias (MW)", "MAE (MW)", "P10 (MW)", "P90 (MW)", "n"],
          rows: a.by_hour.map((h) => [
            `${String(h.hour).padStart(2, "0")}:00`,
            h.bias?.toFixed(0) ?? "",
            h.mae?.toFixed(0) ?? "",
            h.p10?.toFixed(0) ?? "",
            h.p90?.toFixed(0) ?? "",
            h.n,
          ]),
        }}
      >
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={a.by_hour} margin={{ top: 8, right: 12, bottom: 0, left: -12 }} barCategoryGap="20%">
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="hour" tickFormatter={(h: number) => `${String(h).padStart(2, "0")}`} {...axisProps} />
            <YAxis
              domain={[biasTicks[0], biasTicks[biasTicks.length - 1]]}
              ticks={biasTicks}
              tickFormatter={axisGw}
              {...axisProps}
              width={48}
            />
            <ReferenceLine y={0} stroke="var(--axis)" />
            <Tooltip
              cursor={{ fill: "var(--accent-wash)" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const h = payload[0].payload as (typeof a.by_hour)[number];
                return (
                  <Tip
                    title={`${String(h.hour).padStart(2, "0")}:00 UK`}
                    rows={[
                      ["Bias", signedGw(h.bias, 2)],
                      ["MAE", gw(h.mae, 2)],
                    ]}
                  />
                );
              }}
            />
            <Bar dataKey="bias" radius={[4, 4, 4, 4]} maxBarSize={24} isAnimationActive={false}>
              {a.by_hour.map((h) => (
                <Cell key={h.hour} fill={signColor(h.bias ?? 0)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}
