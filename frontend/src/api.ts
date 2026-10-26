// Typed client for the WindScope API. All times are ISO-8601 UTC strings; MW unless noted.

export interface Meta {
  delivery_days: string[];
  default_cutoff: string;
  auction_gates: Record<string, string>;
  default_lookback_days: number;
  max_lookback_days: number;
  max_horizon_h: number;
  publish_times_utc: string[];
  data: { source: string; fetched_at: string; forecast_runs: number; actual_points: number };
}

export interface Summary {
  n: number;
  mae?: number;
  rmse?: number;
  bias?: number;
  nmae_pct?: number | null;
  p10?: number;
  p50?: number;
  p90?: number;
  abs_p90?: number;
  abs_max?: number;
}

export interface Band {
  p10: number;
  p50: number;
  p90: number;
  n: number;
}

export interface DayView {
  date: string;
  cutoff_local: string;
  cutoff_utc: string;
  runs_used: string[];
  complete: boolean;
  forecast: { t: string; forecast: number; lead_h: number; p10?: number; p90?: number }[];
  actual: { t: string; actual: number }[];
  band: Band | null;
  summary: {
    forecast_mwh: number;
    firm_mwh: number | null;
    buffer_mwh: number | null;
    actual_mwh: number | null;
    realised: Summary;
    lead_h_min: number | null;
    lead_h_max: number | null;
  };
}

export interface Accuracy {
  cutoff_local: string;
  lookback_days: number;
  overall: Summary;
  lead_h_range: [number, number] | null;
  band_backtest: {
    hourly_coverage: number | null;
    target_coverage: number;
    days_firm_met: number;
    days_evaluated: number;
  };
  daily: {
    date: string;
    mae: number | null;
    bias: number | null;
    forecast_mwh: number;
    firm_mwh: number | null;
    actual_mwh: number | null;
  }[];
  by_hour: { hour: number; n: number; mae?: number; bias?: number; p10?: number; p90?: number }[];
  histogram: { from: number; to: number; count: number }[];
}

export interface HorizonRow {
  horizon_h: number;
  n: number;
  mae?: number;
  rmse?: number;
  bias?: number;
  p10?: number;
  p90?: number;
  nmae_pct?: number | null;
}

async function get<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
  const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
  const res = await fetch(`/api/${path}${qs.size ? `?${qs}` : ""}`);
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

export const api = {
  meta: () => get<Meta>("meta"),
  day: (date: string, cutoff: string, lookback: number) => get<DayView>("day", { date, cutoff, lookback }),
  accuracy: (cutoff: string, lookback: number) => get<Accuracy>("accuracy", { cutoff, lookback }),
  horizons: (maxH: number) => get<{ horizons: HorizonRow[] }>("horizons", { max_h: maxH }),
};
