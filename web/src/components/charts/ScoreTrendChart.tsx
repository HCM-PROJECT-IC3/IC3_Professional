import { useEffect, useId, useRef, useState } from 'react';

/* Đường điểm các bài gần nhất (1 chuỗi → không cần chú thích; tiêu đề thẻ gọi tên).
   • Trục y cố định 0–100% + đường "Mức đạt" — so được giữa các học sinh/lần xem.
   • Đường 2px, điểm ≥ 8px, lưới mờ; màu --chart-1 (đã kiểm tra tương phản sáng/tối).
   • Rê chuột/chạm: vạch dọc + tooltip (bài, điểm, ngày). Bàn phím: ←/→ khi biểu đồ có focus.
   • Bảng "Lịch sử bài làm" ngay dưới là bản số liệu cho người không xem được biểu đồ. */

export interface TrendPoint {
  label: string;
  score: number;
  at: number;
}

const H = 200;
const PAD = { l: 34, r: 12, t: 12, b: 22 };
const fmtDate = (t: number) => {
  const d = new Date(t);
  return `${d.getDate()}/${d.getMonth() + 1}`;
};

export function ScoreTrendChart({ points, pass }: { points: TrendPoint[]; pass: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  // Vẽ theo bề rộng THẬT của khung (không co SVG) → chữ trục luôn đúng 11px, kể cả trên điện thoại.
  const [W, setW] = useState(640);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const n = points.length;
  const x = (i: number) => (n === 1 ? (PAD.l + W - PAD.r) / 2 : PAD.l + (i * (W - PAD.l - PAD.r)) / (n - 1));
  const y = (v: number) => PAD.t + ((100 - v) * (H - PAD.t - PAD.b)) / 100;
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.score).toFixed(1)}`).join(' ');

  const pick = (clientX: number) => {
    const svg = svgRef.current;
    if (!svg || !n) return;
    const r = svg.getBoundingClientRect();
    const sx = ((clientX - r.left) / r.width) * W;
    let best = 0;
    for (let i = 1; i < n; i++) if (Math.abs(x(i) - sx) < Math.abs(x(best) - sx)) best = i;
    setHover(best);
  };

  const h = hover !== null ? points[hover] : null;
  const summary = `Điểm ${n} bài gần nhất: ${points.map((p) => p.score + '%').join(', ')}. Mức đạt ${pass}%.`;

  return (
    <div ref={boxRef} className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        className="block max-w-full touch-pan-y select-none outline-none"
        role="img"
        aria-labelledby={titleId}
        tabIndex={0}
        onPointerMove={(e) => pick(e.clientX)}
        onPointerDown={(e) => pick(e.clientX)}
        onPointerLeave={() => setHover(null)}
        onBlur={() => setHover(null)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') setHover((v) => Math.min(n - 1, v === null ? 0 : v + 1));
          if (e.key === 'ArrowLeft') setHover((v) => Math.max(0, v === null ? n - 1 : v - 1));
          if (e.key === 'Escape') setHover(null);
        }}
      >
        <title id={titleId}>{summary}</title>
        {/* lưới + trục y */}
        {[0, 50, 100].map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="var(--border)" strokeWidth="1" />
            <text x={PAD.l - 6} y={y(v) + 4} textAnchor="end" fontSize="11" fill="var(--muted-foreground)">
              {v}%
            </text>
          </g>
        ))}
        {/* mức đạt */}
        <line x1={PAD.l} x2={W - PAD.r} y1={y(pass)} y2={y(pass)} stroke="var(--muted-foreground)" strokeWidth="1" strokeDasharray="4 4" />
        {/* nhãn mức đạt nằm ở lề trục y (không chồng lên đường/điểm) */}
        <text x={PAD.l - 6} y={y(pass) + 4} textAnchor="end" fontSize="11" fontWeight="600" fill="var(--foreground)">
          {pass}%
        </text>
        {/* trục x: bài đầu & cuối */}
        {n > 1 && (
          <>
            <text x={x(0)} y={H - 5} fontSize="11" fill="var(--muted-foreground)">
              {fmtDate(points[0].at)}
            </text>
            <text x={x(n - 1)} y={H - 5} textAnchor="end" fontSize="11" fill="var(--muted-foreground)">
              {fmtDate(points[n - 1].at)}
            </text>
          </>
        )}
        {h && <line x1={x(hover!)} x2={x(hover!)} y1={PAD.t} y2={H - PAD.b} stroke="var(--muted-foreground)" strokeWidth="1" />}
        <path d={path} fill="none" stroke="var(--chart-1)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => (
          <circle
            key={i}
            cx={x(i)}
            cy={y(p.score)}
            r={hover === i ? 5.5 : 4}
            fill={p.score >= pass ? 'var(--chart-1)' : 'var(--card)'}
            stroke="var(--chart-1)"
            strokeWidth="2"
          />
        ))}
      </svg>
      {h && (
        <div
          className="pointer-events-none absolute z-10 w-max max-w-56 -translate-x-1/2 rounded-lg border bg-card px-2.5 py-1.5 text-xs shadow-md"
          style={{
            left: `${Math.min(85, Math.max(15, (x(hover!) / W) * 100))}%`,
            top: h.score >= 55 ? y(h.score) + 14 : Math.max(0, y(h.score) - 58),
          }}
        >
          <p className="truncate font-medium">{h.label}</p>
          <p className="text-muted-foreground">
            <span className="font-semibold text-foreground tabular-nums">{h.score}%</span> · {fmtDate(h.at)}
            {h.score >= pass ? ' · Đạt' : ' · Chưa đạt'}
          </p>
        </div>
      )}
    </div>
  );
}
