// Small SVG charts used by several lessons. Colours come from CSS tokens.

/** Horizontal bars: items [{label, value, hl?}], value 0..max */
export function BarList({ items, max = 1, fmt = (v) => v.toFixed(2), width = 300, hlColor = "var(--query)" }) {
  const rowH = 22, labelW = 110, barW = width - labelW - 46;
  return (
    <svg viewBox={`0 0 ${width} ${items.length * rowH + 4}`} className="barlist" role="img" style={{ width: "100%", height: "auto" }}>
      {items.map((it, i) => (
        <g key={i} transform={`translate(0 ${i * rowH + 2})`}>
          <text x={labelW - 6} y={14} textAnchor="end" style={{ font: "12px var(--mono)", fill: it.hl ? "var(--ink)" : "var(--muted)", fontWeight: it.hl ? 600 : 400 }}>
            {it.label.length > 14 ? it.label.slice(0, 13) + "…" : it.label}
          </text>
          <rect x={labelW} y={3} width={barW} height={14} rx={3} fill="var(--grid)" />
          <rect x={labelW} y={3} width={Math.max(1, (it.value / max) * barW)} height={14} rx={3} fill={it.hl ? hlColor : "var(--accent)"} opacity={it.hl ? 1 : 0.75} />
          <text x={labelW + barW + 6} y={14} style={{ font: "11px var(--mono)", fill: "var(--muted)" }}>{fmt(it.value)}</text>
        </g>
      ))}
    </svg>
  );
}

/** Line chart: series [{name, points:[[x,y]], cls}], marks best point when given. */
export function LineChart({ series, xLabel, yLabel, yMax = 1, best = null, W = 640, H = 300, fmtX = (x) => x, fmtY = (y) => y.toFixed(1) }) {
  const L = 52, R = 18, T = 18, B = 42;
  const xs = series.flatMap((s) => s.points.map((p) => p[0]));
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const X = (x) => L + ((x - x0) / (x1 - x0 || 1)) * (W - L - R);
  const Y = (y) => H - B - (y / yMax) * (H - T - B);
  const ticksY = [0, 0.25, 0.5, 0.75, 1].map((f) => f * yMax);
  const ticksX = [...new Set(xs)].sort((a, b) => a - b);
  const step = Math.ceil(ticksX.length / 10);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" style={{ width: "100%", height: "auto" }}>
      {ticksY.map((v) => <g key={v}><line className="gl" x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} /><text x={L - 8} y={Y(v) + 4} textAnchor="end">{fmtY(v)}</text></g>)}
      {ticksX.filter((_, i) => i % step === 0).map((v) => <text key={v} x={X(v)} y={H - B + 16} textAnchor="middle">{fmtX(v)}</text>)}
      <line className="ax" x1={L} x2={W - R} y1={H - B} y2={H - B} />
      <text x={(L + W - R) / 2} y={H - 6} textAnchor="middle">{xLabel}</text>
      <text x={14} y={(T + H - B) / 2} textAnchor="middle" transform={`rotate(-90 14 ${(T + H - B) / 2})`}>{yLabel}</text>
      {series.map((s) => (
        <g key={s.name}>
          <path className={s.cls || "series"} d={s.points.map((p, i) => `${i ? "L" : "M"}${X(p[0])} ${Y(p[1])}`).join("")} />
          {s.points.map((p) => <circle key={p[0]} className={`pt${best && best[0] === p[0] && s === series[0] ? " best" : ""}`} cx={X(p[0])} cy={Y(p[1])} r={best && best[0] === p[0] && s === series[0] ? 6 : 3.5} />)}
        </g>
      ))}
      {best && <text className="lab" x={X(best[0])} y={Y(best[1]) - 12} textAnchor="middle">{best.label}</text>}
    </svg>
  );
}

/** Colour for token chips etc. */
export const PALETTE = ["#d9eef0", "#fbead3", "#e6e0f6", "#dff0e4", "#f6dfe6", "#e3ecf8", "#f3ecd8", "#e8e8e8"];
export const PALETTE_DARK = ["#16363a", "#3a2a12", "#2b2540", "#1d3326", "#3a2230", "#1f2c3d", "#352e1a", "#2a2f36"];
