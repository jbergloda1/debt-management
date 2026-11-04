import { useMemo, useRef, useState, type ReactNode } from 'react';

// Màu: categorical slot 1–3 của palette tham chiếu (đã chạy validate_palette: PASS sáng/tối).
// Khai báo trong styles.css: --series-1..3, --grid, --surface-1. Chữ luôn dùng text token, không dùng màu series.

export interface Series {
  key: string;
  label: string;
  color: string; // CSS var, ví dụ 'var(--series-1)'
}

const W = 720;
const H = 240;
const PAD = { top: 16, right: 16, bottom: 28, left: 56 };

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const exp = 10 ** Math.floor(Math.log10(v));
  const f = v / exp;
  const step = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return step * exp;
}

const ticks = (max: number, n = 4) => Array.from({ length: n + 1 }, (_, i) => (max / n) * i);

/** Hình chữ nhật bo 4px ở đầu dữ liệu (trên), vuông ở baseline. */
function topRoundedRect(x: number, y: number, w: number, h: number, r = 4) {
  const rr = Math.min(r, h, w / 2);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

function Legend({ series }: { series: Series[] }) {
  return (
    <div className="legend">
      {series.map((s) => (
        <span key={s.key} className="legend-item">
          <span className="swatch" style={{ background: s.color }} />
          {s.label}
        </span>
      ))}
    </div>
  );
}

function Tooltip({ x, y, children }: { x: number; y: number; children: ReactNode }) {
  return (
    <div
      className={`viz-tooltip ${y < H * 0.45 ? 'below' : ''}`}
      style={{ left: `${(x / W) * 100}%`, top: `${(y / H) * 100}%` }}
    >
      {children}
    </div>
  );
}

/** Cột chồng theo tháng. Hover từng cột → tooltip chi tiết. */
export function StackedColumns(props: {
  title: string;
  categories: string[];
  series: Series[];
  values: Record<string, number>[]; // values[i][seriesKey]
  format: (v: number) => string;
  formatTick: (v: number) => string;
  highlight?: (i: number) => boolean;
}) {
  const { categories, series, values, format, formatTick } = props;
  const [hover, setHover] = useState<number | null>(null);
  const totals = values.map((v) => series.reduce((s, x) => s + (v[x.key] ?? 0), 0));
  const max = niceMax(Math.max(0, ...totals));
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const band = plotW / Math.max(1, categories.length);
  const barW = Math.min(24, band * 0.6);
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH;
  const GAP = 2;

  return (
    <figure className="viz">
      <figcaption>{props.title}</figcaption>
      {series.length > 1 && <Legend series={series} />}
      <div className="viz-frame">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={props.title} onMouseLeave={() => setHover(null)}>
          {ticks(max).map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} className="grid" />
              <text x={PAD.left - 8} y={y(t)} className="tick" textAnchor="end" dominantBaseline="middle">
                {formatTick(t)}
              </text>
            </g>
          ))}
          {categories.map((c, i) => {
            const cx = PAD.left + band * i + band / 2;
            let acc = 0;
            const segs = series
              .map((s) => ({ s, v: values[i][s.key] ?? 0 }))
              .filter((x) => x.v > 0);
            return (
              <g key={c} className={hover === i ? 'col hover' : 'col'}>
                {/* vùng hover rộng hơn mark */}
                <rect x={cx - band / 2} y={PAD.top} width={band} height={plotH} fill="transparent" onMouseEnter={() => setHover(i)} />
                {segs.map(({ s, v }, k) => {
                  const y0 = y(acc);
                  acc += v;
                  const y1 = y(acc);
                  const h = Math.max(0, y0 - y1 - (k > 0 ? GAP : 0));
                  const top = k === segs.length - 1;
                  return top ? (
                    <path key={s.key} d={topRoundedRect(cx - barW / 2, y1, barW, h)} fill={s.color} pointerEvents="none" />
                  ) : (
                    <rect key={s.key} x={cx - barW / 2} y={y1} width={barW} height={h} fill={s.color} pointerEvents="none" />
                  );
                })}
                <text
                  x={cx}
                  y={H - PAD.bottom + 16}
                  className={`tick ${props.highlight?.(i) ? 'strong' : ''}`}
                  textAnchor="middle"
                >
                  {c}
                </text>
              </g>
            );
          })}
          <line x1={PAD.left} x2={W - PAD.right} y1={y(0)} y2={y(0)} className="axis" />
        </svg>
        {hover !== null && (
          <Tooltip x={PAD.left + band * hover + band / 2} y={y(totals[hover])}>
            <b>{categories[hover]}</b>
            {series.map((s) =>
              values[hover][s.key] ? (
                <div key={s.key} className="tt-row">
                  <span className="swatch" style={{ background: s.color }} />
                  <span>{s.label}</span>
                  <span className="tt-val">{format(values[hover][s.key])}</span>
                </div>
              ) : null,
            )}
            <div className="tt-row total">
              <span />
              <span>Tổng</span>
              <span className="tt-val">{format(totals[hover])}</span>
            </div>
          </Tooltip>
        )}
      </div>
    </figure>
  );
}

/** Một đường (không legend — tiêu đề đã nói đường gì). Crosshair + tooltip; nhãn giá trị ở điểm cuối. */
export function LineChart(props: {
  title: string;
  categories: string[];
  values: number[];
  format: (v: number) => string;
  formatTick: (v: number) => string;
  color?: string;
}) {
  const { categories, values, format, formatTick } = props;
  const color = props.color ?? 'var(--series-1)';
  const [hover, setHover] = useState<number | null>(null);
  const ref = useRef<SVGSVGElement>(null);
  const max = niceMax(Math.max(0, ...values));
  const plotW = W - PAD.left - PAD.right - 70; // chừa chỗ cho nhãn cuối
  const plotH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (categories.length > 1 ? (plotW * i) / (categories.length - 1) : plotW / 2);
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH;
  const d = useMemo(() => values.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join(''), [values, max]);
  const last = values.length - 1;

  const onMove = (e: React.MouseEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = Math.round(((px - PAD.left) / plotW) * (categories.length - 1));
    setHover(Math.max(0, Math.min(last, i)));
  };

  return (
    <figure className="viz">
      <figcaption>{props.title}</figcaption>
      <div className="viz-frame">
        <svg ref={ref} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={props.title} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
          {ticks(max).map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={PAD.left + plotW} y1={y(t)} y2={y(t)} className="grid" />
              <text x={PAD.left - 8} y={y(t)} className="tick" textAnchor="end" dominantBaseline="middle">
                {formatTick(t)}
              </text>
            </g>
          ))}
          {categories.map((c, i) =>
            categories.length <= 12 || i % Math.ceil(categories.length / 12) === 0 ? (
              <text key={c} x={x(i)} y={H - PAD.bottom + 16} className="tick" textAnchor="middle">
                {c}
              </text>
            ) : null,
          )}
          <path d={`${d}L${x(last)},${y(0)}L${x(0)},${y(0)}Z`} fill={color} opacity={0.1} />
          <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {last >= 0 && (
            <>
              <circle cx={x(last)} cy={y(values[last])} r={4} fill={color} className="ring" />
              <text x={x(last) + 10} y={y(values[last])} className="tick strong" dominantBaseline="middle">
                {format(values[last])}
              </text>
            </>
          )}
          {hover !== null && (
            <>
              <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + plotH} className="crosshair" />
              <circle cx={x(hover)} cy={y(values[hover])} r={5} fill={color} className="ring" />
            </>
          )}
        </svg>
        {hover !== null && (
          <Tooltip x={x(hover)} y={y(values[hover])}>
            <b>{categories[hover]}</b>
            <div className="tt-val">{format(values[hover])}</div>
          </Tooltip>
        )}
      </div>
    </figure>
  );
}

/** Thanh ngang chồng: các phần đã dùng + phần khả dụng (track xám). */
export function UsageBar(props: {
  limit: number;
  parts: { key: string; label: string; value: number; color: string }[];
  format: (v: number) => string;
}) {
  const { limit, parts, format } = props;
  const [hover, setHover] = useState<string | null>(null);
  const used = parts.reduce((s, p) => s + p.value, 0);
  const total = Math.max(limit, used, 1);
  const shown = parts.filter((p) => p.value > 0);
  const available = Math.max(0, limit - used);
  const legend: Series[] = [
    ...parts.map((p) => ({ key: p.key, label: p.label, color: p.color })),
    { key: 'avail', label: 'Khả dụng', color: 'var(--track)' },
  ];
  return (
    <div className="usage">
      <div className="usage-bar" role="img" aria-label={`Đã dùng ${format(used)} / ${format(limit)}`}>
        {shown.map((p) => (
          <div
            key={p.key}
            className="usage-seg"
            style={{ flexGrow: p.value / total, background: p.color }}
            onMouseEnter={() => setHover(p.key)}
            onMouseLeave={() => setHover(null)}
          />
        ))}
        {available > 0 && (
          <div
            className="usage-seg avail"
            style={{ flexGrow: available / total }}
            onMouseEnter={() => setHover('avail')}
            onMouseLeave={() => setHover(null)}
          />
        )}
        {used > limit && <div className="usage-over" title="Vượt hạn mức" />}
      </div>
      <div className="legend">
        {legend.map((s) => {
          const v = s.key === 'avail' ? limit - used : parts.find((p) => p.key === s.key)!.value;
          return (
            <span key={s.key} className={`legend-item ${hover === s.key ? 'active' : ''}`}>
              <span className="swatch" style={{ background: s.color }} />
              {s.label}: <b>{format(v)}</b>
            </span>
          );
        })}
      </div>
    </div>
  );
}
