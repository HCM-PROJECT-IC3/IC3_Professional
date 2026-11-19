import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ArrowLeft, CheckCircle2, Recycle, X, Zap } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/shared/States';
import { cn } from '@/lib/utils';
import { Panel, TrPageHeader, trPath } from '../ui/primitives';
import { Missions, saveMission } from './cityEngine';

/* Nhiệm vụ đời sống: Tính tiền điện, Phân loại rác. Luật: js/techrealm/life-missions-core.js (có test).
   Kết quả (điểm cao nhất) lưu trên máy → mở khoá công trình ở Thành phố thông minh. 0 lượt mạng. */

const vnd = (n: number) => n.toLocaleString('vi-VN') + ' đ';

function Saved({ score, unlock }: { score: number; unlock: string }) {
  return (
    <div className="rounded-lg bg-muted p-3 text-sm" role="status">
      <p className="font-semibold">Điểm: {score}/100</p>
      <p className="mt-1 text-muted-foreground">{score >= 60 ? `Đã đạt — ${unlock} ở Thành phố thông minh.` : `Cần từ 60 điểm để ${unlock.toLowerCase()}. Em thử lại nhé.`}</p>
      <Link to={trPath('van-tuong-gioi/thanh-pho')} className="mt-2 inline-block text-primary hover:underline">Tới Thành phố thông minh</Link>
    </div>
  );
}

function ElectricBill() {
  const [hours, setHours] = useState<Record<string, number>>({});
  const [first, setFirst] = useState<Record<string, number>>({});
  const [done, setDone] = useState<number | null>(null);
  const usage = Missions.usage(hours);
  const total = Math.round(usage.reduce((t, u) => t + u.kwh, 0) * 10) / 10;
  const bill = Missions.bill(total);
  const ok = bill.money <= Missions.BUDGET;
  const qs = useMemo(() => Missions.electricQuestions(), []);
  const submit = () => { const r = Missions.scoreElectric(hours, first); saveMission('tien-dien', r.score); setDone(r.score); };
  return (
    <div className="space-y-5">
      <TrPageHeader title="Tính tiền điện" plain="Nhiệm vụ đời sống · Năng lượng" description={`Nhà em muốn tiền điện tháng này không quá ${vnd(Missions.BUDGET)}. Chỉnh số giờ dùng mỗi thiết bị cho hợp lý — tủ lạnh phải chạy cả ngày, nồi cơm cần ít nhất 1 giờ.`} />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Panel title="Thiết bị trong nhà" description="Điện năng (kWh/tháng) = công suất (W) × giờ mỗi ngày × 30 ngày ÷ 1000.">
          <ul className="divide-y">
            {Missions.APPLIANCES.map((a) => {
              const u = usage.find((x) => x.id === a.id)!;
              return (
                <li key={a.id} className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_12rem_5rem] sm:items-center">
                  <div className="min-w-0"><p className="font-medium">{a.name} <span className="font-mono text-xs text-muted-foreground">{a.watt} W</span></p>{a.note && <p className="text-xs text-muted-foreground">{a.note}</p>}</div>
                  <label className="grid gap-1 text-xs">
                    <span className="flex justify-between">Giờ/ngày <span className="font-mono">{u.hours}</span></span>
                    <input type="range" min={a.min} max={a.max} value={u.hours} disabled={a.min === a.max} onChange={(e) => { setHours({ ...hours, [a.id]: Number(e.target.value) }); setDone(null); }} className="accent-[var(--primary)]" aria-label={`Số giờ dùng ${a.name} mỗi ngày`} />
                  </label>
                  <span className="text-right font-mono text-sm tabular-nums">{u.kwh} kWh</span>
                </li>
              );
            })}
          </ul>
        </Panel>
        <Panel variant="feature" title="Hoá đơn tháng" icon={Zap}>
          <p className="font-mono text-2xl font-semibold tabular-nums">{vnd(bill.money)}</p>
          <p className={cn('text-sm', ok ? 'text-el-moc' : 'text-destructive')}>{ok ? 'Trong ngân sách' : `Vượt ${vnd(bill.money - Missions.BUDGET)}`}</p>
          <table className="mt-3 w-full text-xs">
            <thead><tr className="text-left text-muted-foreground"><th className="py-1">Bậc</th><th className="py-1 text-right">kWh</th><th className="py-1 text-right">Giá</th><th className="py-1 text-right">Tiền</th></tr></thead>
            <tbody>{bill.rows.map((r) => <tr key={r.tier} className="border-t"><td className="py-1">{r.tier}</td><td className="py-1 text-right font-mono">{r.kwh}</td><td className="py-1 text-right font-mono">{r.price.toLocaleString('vi-VN')}</td><td className="py-1 text-right font-mono">{r.money.toLocaleString('vi-VN')}</td></tr>)}</tbody>
          </table>
          <p className="mt-2 text-xs text-muted-foreground">Tổng {total} kWh. <b>Giá minh hoạ</b> để học cách tính bậc thang — không phải biểu giá điện hiện hành.</p>
        </Panel>
      </div>
      <Panel title="Vận dụng" description="Lần chọn đầu tiên được tính điểm.">
        <ol className="space-y-4">
          {qs.map((q, qi) => (
            <li key={q.id}>
              <p className="text-sm font-medium">{qi + 1}. {q.text}</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {q.options.map((o, oi) => {
                  const picked = first[q.id] === oi;
                  return (
                    <button key={oi} type="button" disabled={first[q.id] !== undefined} onClick={() => setFirst({ ...first, [q.id]: oi })}
                      className={cn('rounded-lg border px-3 py-2 text-left text-sm enabled:hover:bg-muted', first[q.id] !== undefined && oi === q.correct && 'border-el-moc bg-el-moc/10', picked && oi !== q.correct && 'border-destructive/60 line-through')}>
                      {o}
                    </button>
                  );
                })}
              </div>
            </li>
          ))}
        </ol>
        <div className="mt-4 flex flex-wrap items-start gap-4">
          <Button onClick={submit} disabled={Object.keys(first).length < qs.length}>Nộp kết quả</Button>
          {done !== null && <Saved score={done} unlock="Mở Nhà máy (và Trạm điện mặt trời nếu đã qua màn Nhà máy điện)" />}
        </div>
      </Panel>
    </div>
  );
}

function WasteSorting() {
  const [sorted, setSorted] = useState<Record<string, string>>({});
  const [checked, setChecked] = useState(false);
  const res = Missions.scoreWaste(sorted);
  const bins = Object.entries(Missions.BINS);
  const check = () => { setChecked(true); saveMission('phan-loai-rac', res.score); };
  return (
    <div className="space-y-5">
      <TrPageHeader title="Phân loại rác" plain="Nhiệm vụ đời sống · Môi trường" description="Phân loại rác tại nguồn giúp tái chế được nhiều hơn và giữ chất độc khỏi đất, nước. Chọn thùng đúng cho từng món." />
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4" aria-label="Các thùng rác">
        {bins.map(([id, b]) => <li key={id} className="rounded-lg border bg-card p-3 text-sm"><p className="font-semibold">{b.name}</p><p className="text-xs text-muted-foreground">{b.hint}</p></li>)}
      </ul>
      <Panel title={`Rác cần phân loại (${Object.keys(sorted).length}/${Missions.WASTE.length})`} icon={Recycle}>
        <ul className="divide-y">
          {Missions.WASTE.map((w) => {
            const r = res.rows.find((x) => x.id === w.id)!;
            return (
              <li key={w.id} className="py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1 text-sm font-medium">{w.name}</span>
                  <div className="flex flex-wrap gap-1" role="radiogroup" aria-label={`Thùng cho ${w.name}`}>
                    {bins.map(([id, b]) => (
                      <button key={id} type="button" role="radio" aria-checked={sorted[w.id] === id} disabled={checked} onClick={() => setSorted({ ...sorted, [w.id]: id })}
                        className={cn('rounded-md border px-2 py-1 text-xs', sorted[w.id] === id && 'border-primary bg-primary/10', checked && id === w.bin && 'border-el-moc')}>
                        {b.name}
                      </button>
                    ))}
                  </div>
                </div>
                {checked && (
                  <p className={cn('mt-1 flex items-start gap-1.5 text-xs', r.ok ? 'text-el-moc' : 'text-destructive')}>
                    {r.ok ? <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" aria-hidden /> : <X className="mt-0.5 size-3.5 shrink-0" aria-hidden />}
                    <span>{r.ok ? '' : `Đúng là "${Missions.BINS[w.bin].name}". `}{w.why}</span>
                  </p>
                )}
              </li>
            );
          })}
        </ul>
        <div className="mt-4 flex flex-wrap items-start gap-4">
          {!checked ? <Button onClick={check} disabled={!res.done}>Kiểm tra</Button> : <Button variant="outline" onClick={() => { setSorted({}); setChecked(false); }}>Làm lại</Button>}
          {checked && <><Badge tone={res.score >= 60 ? 'green' : 'orange'}>{res.right}/{res.total} món đúng</Badge><Saved score={res.score} unlock="Mở Công viên" /></>}
        </div>
      </Panel>
    </div>
  );
}

export default function LifeMissionPage() {
  const { missionId } = useParams();
  return (
    <div className="space-y-5">
      <Link to={trPath('van-tuong-gioi')} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" aria-hidden /> Vạn Tượng Giới</Link>
      {missionId === 'tien-dien' ? <ElectricBill /> : missionId === 'phan-loai-rac' ? <WasteSorting /> : <EmptyState title="Không có nhiệm vụ này" />}
    </div>
  );
}
