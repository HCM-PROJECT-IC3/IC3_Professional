/* Điểm TB theo lớp — thanh ngang (nhãn dài vẫn đọc được trên điện thoại), 1 chuỗi màu --chart-1.
   Trục 0–100% cố định + vạch mức đạt; giá trị in cạnh thanh (danh sách ngắn, ≤ ~12 lớp),
   số bài nộp ở dòng phụ. Rê chuột từng hàng → title (tooltip gốc trình duyệt). */

export interface ClassAvg {
  name: string;
  avg: number;
  count: number;
}

export function ClassAverageBars({ rows, pass }: { rows: ClassAvg[]; pass: number }) {
  return (
    <div role="list" aria-label="Điểm trung bình theo lớp" className="space-y-2.5">
      {rows.map((r) => (
        <div
          role="listitem"
          key={r.name}
          className="grid grid-cols-[4.5rem_minmax(0,1fr)_3rem] items-center gap-3 rounded-md px-1 py-0.5 hover:bg-muted/50"
          title={`${r.name}: TB ${r.avg}% · ${r.count} bài nộp`}
        >
          <span className="truncate text-sm font-medium">{r.name}</span>
          <div className="relative h-5 rounded-r-[4px] bg-muted">
            <div className="absolute inset-y-0 left-0 rounded-r-[4px] bg-chart-1" style={{ width: `${Math.max(1, r.avg)}%` }} />
            <div className="absolute inset-y-[-3px] w-px bg-muted-foreground/70" style={{ left: `${pass}%` }} aria-hidden />
          </div>
          <span className="text-right text-sm tabular-nums">
            {r.avg}%<span className="block text-[11px] leading-none text-muted-foreground">{r.count} bài</span>
          </span>
        </div>
      ))}
      <p className="pt-1 text-xs text-muted-foreground">Vạch dọc = mức đạt {pass}%.</p>
    </div>
  );
}
