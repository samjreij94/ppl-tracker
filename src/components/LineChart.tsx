/**
 * Hand-rolled responsive SVG line chart (zero deps). The viewBox tracks the rendered CSS width
 * (ResizeObserver), so 1 SVG unit = 1 CSS px: labels render at their true size and strokes stay
 * hairline-exact at any DPR (3x on iPhone Pro); `vector-effect: non-scaling-stroke` guards against
 * any residual scaling.
 */
import { useLayoutEffect, useRef, useState } from 'react';
export interface Point { x: number; y: number }

const DEFAULT_W = 340, PL = 42, PR = 12, PT = 12, PB = 28;

function niceTicks(min: number, max: number, count = 4): number[] {
  if (min === max) { min -= 1; max += 1; }
  const raw = (max - min) / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const start = Math.floor(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + step * 0.001; v += step) ticks.push(Number(v.toFixed(6)));
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step);
  return ticks;
}

const fmtDate = (t: number) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const fmtVal = (v: number) => (Math.abs(v) >= 10000 ? `${Math.round(v / 1000)}k` : Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : Number.isInteger(v) ? `${v}` : v.toFixed(1));

/**
 * `points` = the series. If `trend` is given (e.g. 7-day average), raw points render as faint dots
 * and the trend renders as the main line.
 */
function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(DEFAULT_W);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => { const cw = Math.round(el.clientWidth); if (cw > 0) setW(cw); };
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

export function LineChart({ points, label, trend, empty }: { points: Point[]; label: string; trend?: Point[]; empty?: string }) {
  const [ref, W] = useWidth();
  const H = Math.round(Math.min(240, Math.max(180, W * 0.56)));
  if (points.length === 0) return <div className="empty" ref={ref}>{empty ?? 'No data yet. Log this exercise to see a trend.'}</div>;
  const all = trend ? [...points, ...trend] : points;
  const xs = all.map((p) => p.x), ys = all.map((p) => p.y);
  const ticks = niceTicks(Math.min(...ys), Math.max(...ys));
  const y0 = ticks[0], y1 = ticks[ticks.length - 1];
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const sx = (x: number) => (x1 === x0 ? PL + (W - PL - PR) / 2 : PL + ((x - x0) / (x1 - x0)) * (W - PL - PR));
  const sy = (y: number) => PT + (1 - (y - y0) / (y1 - y0 || 1)) * (H - PT - PB);
  const main = trend ?? points;
  const d = main.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join('');
  const area = `${d}L${sx(main[main.length - 1].x).toFixed(1)},${H - PB}L${sx(main[0].x).toFixed(1)},${H - PB}Z`;
  const xLabels = points.length === 1 ? [points[0].x] : [x0, x0 + (x1 - x0) / 2, x1];
  return (
    <div className="chart" ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={label}>
        {ticks.map((t) => (
          <g key={t}>
            <line className="axis" x1={PL} x2={W - PR} y1={Math.round(sy(t)) + 0.5} y2={Math.round(sy(t)) + 0.5} strokeDasharray="2 4" shapeRendering="crispEdges" />
            <text className="lbl" x={PL - 8} y={sy(t) + 4} textAnchor="end">{fmtVal(t)}</text>
          </g>
        ))}
        {xLabels.map((x, i) => (
          <text key={i} className="lbl" x={sx(x)} y={H - 6} textAnchor={points.length === 1 ? 'middle' : i === 0 ? 'start' : i === 2 ? 'end' : 'middle'}>{fmtDate(x)}</text>
        ))}
        <path className="area" d={area} />
        <path className="line" d={d} shapeRendering="geometricPrecision" />
        {trend
          ? points.map((p, i) => <circle key={i} className="dot raw" cx={sx(p.x)} cy={sy(p.y)} r={3} />)
          : points.map((p, i) => <circle key={i} className={i === points.length - 1 ? 'dot last' : 'dot'} cx={sx(p.x)} cy={sy(p.y)} r={4} />)}
      </svg>
    </div>
  );
}
