// Board: a 2D map of chunk vectors, the question as a star, and retrieval lines.
// Reusable for any lesson that places text in an embedding space.
import { useMemo, useRef, useState } from "react";
import { useT } from "../i18n.js";

export const SECTION_COLORS = ["#3b7fc4", "#c2557a", "#3a9a68", "#b8862b", "#7a5cc2", "#d0663f", "#2aa1a8", "#6f7f91"];
const W = 640, H = 400, PAD = 34;

function starPath(cx, cy, r) {
  let d = "";
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r;
    d += (i ? "L" : "M") + (cx + rr * Math.cos(a)).toFixed(1) + " " + (cy + rr * Math.sin(a)).toFixed(1);
  }
  return d + "Z";
}

/**
 * props:
 *  points: [[x,y]] | null      chunk positions in vector space
 *  labels: [{sec, text}]       for colour + tooltip
 *  sections: [name]
 *  query: {xy:[x,y]|null, show:bool}
 *  links: [{i, s}] | null      retrieved chunks with score
 *  threshold: number
 *  anim: stage id that just ran ("embed" | "query" | "retrieve")
 *  runKey: changes on each animated step (restarts CSS animations)
 *  hover / onHover: shared highlight with the chunk list
 */
export default function DocumentSpace({ points, labels, sections, query, links, threshold, anim, runKey, hover, onHover, text, dimmed = null }) {
  const { tr } = useT();
  const [tip, setTip] = useState(null);
  const wrap = useRef(null);

  const scale = useMemo(() => {
    if (!points || !points.length) return null;
    const xs = points.map((c) => c[0]), ys = points.map((c) => c[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const sx = (W - 2 * PAD) / (x1 - x0 || 1), sy = (H - 2 * PAD) / (y1 - y0 || 1);
    return ([x, y]) => [
      Math.min(W - PAD, Math.max(PAD, PAD + (x - x0) * sx)),
      Math.min(H - PAD, Math.max(PAD, H - PAD - (y - y0) * sy)),
    ];
  }, [points]);

  const pos = scale ? points.map(scale) : [];
  const hasQ = query?.show && query.xy && scale;
  const [qx, qy] = hasQ ? scale(query.xy) : [0, 0];
  const grid = [];
  for (let x = 0; x <= W; x += 40) grid.push(<line key={"x" + x} className="gridl" x1={x} y1={0} x2={x} y2={H} />);
  for (let y = 0; y <= H; y += 40) grid.push(<line key={"y" + y} className="gridl" x1={0} y1={y} x2={W} y2={y} />);

  const showTip = (e, i) => {
    onHover?.(i);
    const br = wrap.current.getBoundingClientRect(), r = e.target.getBoundingClientRect();
    let left = r.left - br.left + 14;
    if (left > br.width - 300) left = r.left - br.left - 300;
    setTip({ i, left: Math.max(4, left), top: r.top - br.top + 14 });
  };

  return (
    <div className="board" ref={wrap}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={tr(text.aria)}>
        {grid}
        <text className="axis" x={W - 8} y={H - 8} textAnchor="end">PCA 1 →</text>
        <text className="axis" x={8} y={16}>↑ PCA 2</text>
        {!scale && <text className="hint" x={W / 2} y={H / 2} textAnchor="middle">{tr(text.empty)}</text>}

        {hasQ && links && links.map((t) => {
          const [x, y] = pos[t.i], weak = t.s < threshold;
          return <line key={`l${runKey}-${t.i}`} className={`link${weak ? " weak" : ""}${anim === "retrieve" ? " fade" : ""}`}
            x1={qx} y1={qy} x2={x} y2={y} strokeWidth={weak ? 1.5 : 1.5 + t.s * 6} />;
        })}

        {pos.map(([x, y], i) => (
          <circle key={`d${anim === "embed" ? runKey : 0}-${i}`} data-i={i}
            className={`dot${anim === "embed" ? " pop" : ""}${hover === i ? " hl" : ""}`}
            style={anim === "embed" ? { animationDelay: `${Math.min(i * 25, 900)}ms` } : undefined}
            cx={x.toFixed(1)} cy={y.toFixed(1)} r={7}
            fill={SECTION_COLORS[labels[i].sec % SECTION_COLORS.length]}
            opacity={dimmed && dimmed.has(i) ? 0.15 : 1}
            onMouseEnter={(e) => showTip(e, i)} onMouseLeave={() => { onHover?.(null); setTip(null); }} />
        ))}

        {hasQ && links && links.map((t, r) => {
          const [x, y] = pos[t.i];
          // Short line: the star would cover the label, so put it below the dot instead.
          const short = Math.hypot(x - qx, y - qy) < 60;
          const mx = short ? x : qx + (x - qx) * 0.55, my = short ? Math.min(H - 12, y + 26) : qy + (y - qy) * 0.55;
          return (
            <g key={`r${runKey}-${t.i}`} className={anim === "retrieve" ? "fade" : ""} pointerEvents="none">
              <circle className="ring" cx={x} cy={y} r={11} />
              <text className="rank" x={x} y={y + 3.3} textAnchor="middle">{r + 1}</text>
              <rect className="scorebg" x={mx - 17} y={my - 9} width={34} height={17} rx={4} />
              <text className="score" x={mx} y={my + 4} textAnchor="middle">{t.s.toFixed(2)}</text>
            </g>
          );
        })}

        {query?.show && (hasQ ? (
          <g key={`q${anim === "query" ? runKey : 0}`}>
            <path className={`star${anim === "query" ? " pop" : ""}`} d={starPath(qx, qy, 13)} />
            <text className="qlabel" x={qx} y={qy < 40 ? qy + 28 : qy - 18} textAnchor="middle">{tr(text.question)}</text>
          </g>
        ) : (
          <g>
            <path className="star" d={starPath(W - 48, 44, 13)} />
            <text className="hint" x={W - 68} y={48} textAnchor="end">{tr(text.noMatch)}</text>
          </g>
        ))}
      </svg>
      {tip && labels[tip.i] && (
        <div className="tip" style={{ left: tip.left, top: tip.top }}>
          <b>#{String(tip.i + 1).padStart(2, "0")} · {sections[labels[tip.i].sec]}</b><br />
          {labels[tip.i].text.slice(0, 150)}{labels[tip.i].text.length > 150 ? "…" : ""}
        </div>
      )}
      <div className="legend">
        {sections.map((s, i) => <span key={i}><i style={{ background: SECTION_COLORS[i % SECTION_COLORS.length] }} />{s}</span>)}
        <span><i className="q" />{tr(text.question)}</span>
      </div>
    </div>
  );
}
