// Side-by-side ranked lists with lines showing where each item moved.
// columns: [{ title, items: [{ i, s }], fmt? }]; lines connect the same item id in neighbouring columns.
import { SECTION_COLORS } from "./DocumentSpace.jsx";

const ROW = 34, HEAD = 26;
export default function RankLists({ columns, chunks, n = 8, relevant = null, hover, onHover, tr }) {
  const cols = columns.map((c) => ({ ...c, items: c.items.slice(0, n) }));
  const H = HEAD + n * ROW + 6;
  const GAP = 46;
  return (
    <div style={{ display: "grid", gridTemplateColumns: cols.map(() => "minmax(0,1fr)").join(` ${GAP}px `), padding: "10px 14px", position: "relative" }}>
      {cols.map((c, ci) => (
        <div key={ci} style={{ gridColumn: ci * 2 + 1, minWidth: 0 }}>
          <div style={{ height: HEAD, font: "600 13px var(--body)", display: "flex", gap: 6, alignItems: "center" }}>{c.title}</div>
          {c.items.map((x, r) => {
            const ch = chunks[x.i];
            const rel = relevant && relevant.has(x.i);
            return (
              <div key={x.i} onMouseEnter={() => onHover?.(x.i)} onMouseLeave={() => onHover?.(null)}
                title={ch.text}
                style={{ height: ROW - 4, marginBottom: 4, display: "flex", alignItems: "center", gap: 6, fontSize: 12, borderRadius: 6, padding: "0 6px",
                  border: `1px solid ${hover === x.i ? "var(--ink)" : rel ? "var(--good)" : "var(--line)"}`, background: rel ? "var(--accent-soft)" : "var(--panel)", borderLeft: `4px solid ${SECTION_COLORS[ch.sec % SECTION_COLORS.length]}` }}>
                <span className="mono" style={{ color: "var(--muted)", width: 16 }}>{r + 1}</span>
                <span style={{ overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", flex: 1 }}>#{x.i + 1} {ch.text}</span>
                <span className="mono" style={{ color: "var(--muted)" }}>{(c.fmt || ((v) => v.toFixed(2)))(x.s)}</span>
              </div>
            );
          })}
        </div>
      ))}
      {cols.slice(0, -1).map((c, ci) => {
        const next = cols[ci + 1];
        return (
          <svg key={"l" + ci} width={GAP} height={H} style={{ gridColumn: ci * 2 + 2, gridRow: 1 }} aria-hidden="true">
            {c.items.map((x, r) => {
              const r2 = next.items.findIndex((y) => y.i === x.i);
              if (r2 < 0) return <line key={x.i} x1={2} x2={14} y1={HEAD + r * ROW + 15} y2={HEAD + r * ROW + 15} stroke="var(--line)" strokeWidth={2} />;
              const up = r2 < r;
              return <line key={x.i} x1={2} x2={GAP - 2} y1={HEAD + r * ROW + 15} y2={HEAD + r2 * ROW + 15} stroke={hover === x.i ? "var(--ink)" : up ? "var(--good)" : r2 === r ? "var(--muted)" : "var(--warn)"} strokeWidth={hover === x.i ? 2.5 : 1.5} opacity={0.8} />;
            })}
          </svg>
        );
      })}
    </div>
  );
}
