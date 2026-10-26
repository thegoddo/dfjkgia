// Display helpers. Market times are shown in UK local time (Europe/London).

const UK = "Europe/London";

export const gw = (mw: number | null | undefined, digits = 1) =>
  mw == null ? "–" : `${(mw / 1000).toFixed(digits)} GW`;

export const signedGw = (mw: number | null | undefined, digits = 1) =>
  mw == null ? "–" : `${mw > 0 ? "+" : mw < 0 ? "−" : ""}${Math.abs(mw / 1000).toFixed(digits)} GW`;

export const gwh = (mwh: number | null | undefined, digits = 0) =>
  mwh == null ? "–" : `${(mwh / 1000).toLocaleString("en-GB", { maximumFractionDigits: digits })} GWh`;

export const pct = (x: number | null | undefined, digits = 0) =>
  x == null ? "–" : `${x.toFixed(digits)}%`;

export const axisGw = (mw: number) => `${+(mw / 1000).toFixed(1)}`;

export const ukTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-GB", { timeZone: UK, hour: "2-digit", minute: "2-digit" });

export const ukDateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    timeZone: UK,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

// Delivery days are plain dates ("2026-01-15"); format without timezone shifting.
export const dayLabel = (d: string, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC", ...opts });

export const longDay = (d: string) =>
  dayLabel(d, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
