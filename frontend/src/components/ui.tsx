import { useEffect, useState, type ReactNode } from "react";

export function StatTile(props: { label: string; value: ReactNode; note?: ReactNode; hero?: boolean }) {
  return (
    <div className={`tile${props.hero ? " hero" : ""}`}>
      <div className="label">{props.label}</div>
      <div className="value">{props.value}</div>
      {props.note && <div className="note">{props.note}</div>}
    </div>
  );
}

export interface LegendItem {
  label: string;
  kind: "line" | "swatch" | "dash";
  color?: string;
}

export function Legend({ items }: { items: LegendItem[] }) {
  return (
    <div className="legend">
      {items.map((i) => (
        <span key={i.label}>
          <i
            className={i.kind === "line" ? "key-line" : i.kind === "swatch" ? "key-swatch" : "key-dash"}
            style={i.kind === "dash" ? undefined : { background: i.color }}
          />
          {i.label}
        </span>
      ))}
    </div>
  );
}

/** A chart card with an accessible table view alternative. */
export function ChartCard(props: {
  title: string;
  sub?: ReactNode;
  legend?: LegendItem[];
  table: { columns: string[]; rows: (string | number)[][] };
  children: ReactNode;
}) {
  const [showTable, setShowTable] = useState(false);
  return (
    <section className="card">
      <div className="card-head">
        <div>
          <h2>{props.title}</h2>
          {props.sub && <p className="sub">{props.sub}</p>}
        </div>
        <button className="link-btn" onClick={() => setShowTable((s) => !s)}>
          {showTable ? "Show chart" : "Show table"}
        </button>
      </div>
      {showTable ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {props.table.columns.map((c) => (
                  <th key={c}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {props.table.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((c, j) => (
                    <td key={j}>{c}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          {props.legend && <Legend items={props.legend} />}
          {props.children}
        </>
      )}
    </section>
  );
}

export function Tip(props: { title: ReactNode; rows: [string, ReactNode][] }) {
  return (
    <div className="tip">
      <div className="tip-title">{props.title}</div>
      {props.rows.map(([k, v]) => (
        <div className="row" key={k}>
          <span>{k}</span>
          <b>{v}</b>
        </div>
      ))}
    </div>
  );
}

/** Minimal data-fetching hook: re-runs when deps change and ignores stale responses. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: true });
  useEffect(() => {
    let live = true;
    setState((s) => ({ ...s, loading: true }));
    fn().then(
      (data) => live && setState({ data, loading: false }),
      (e: unknown) => live && setState({ error: String(e), loading: false }),
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

export const axisProps = {
  stroke: "var(--axis)",
  tickLine: false,
  tick: { fill: "var(--text-muted)", fontSize: 11 },
} as const;

export const gridProps = { stroke: "var(--grid)", vertical: false } as const;
