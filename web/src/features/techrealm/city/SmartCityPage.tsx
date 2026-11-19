import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowLeft, BrainCircuit, CalendarClock, CheckCircle2, Circle, Coins, Factory, Flame, FlaskConical, Hammer, Home, Hospital, Lock,
  RotateCcw, School, Sun, Trash2, Trees, Users, Zap,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Modal } from '../ui/overlay';
import { Panel, TrPageHeader, trPath } from '../ui/primitives';
import { SmartCity, loadCity, saveCity, useEvidence, type BuildingType, type City, type IndexKey } from './cityEngine';

/* Thành phố thông minh — mô hình tương tác. Luật: js/techrealm/smart-city-core.js (thuần, có test).
   Công trình mở khoá bằng bằng chứng học tập trên máy. Sân tập: không sinh EXP. 0 lượt mạng. */

const ICON: Record<BuildingType, LucideIcon> = {
  'khu-dan-cu': Home, 'truong-hoc': School, 'benh-vien': Hospital, 'cong-vien': Trees, 'nha-may': Factory,
  'phong-thi-nghiem': FlaskConical, 'trung-tam-ai': BrainCircuit, 'dien-mat-troi': Sun, 'nhiet-dien': Flame,
};
const ORDER: BuildingType[] = ['khu-dan-cu', 'truong-hoc', 'benh-vien', 'cong-vien', 'dien-mat-troi', 'nhiet-dien', 'nha-may', 'phong-thi-nghiem', 'trung-tam-ai'];
const INDEX: { k: IndexKey; name: string; formula: string }[] = [
  { k: 'energy', name: 'Năng lượng', formula: '100 × điện cấp ÷ điện cần (tối đa 100). Thiếu điện thì công trình ưu tiên thấp bị tắt trước, bệnh viện giữ lại sau cùng.' },
  { k: 'economy', name: 'Kinh tế', formula: '50 + 2 × (thu − bảo trì mỗi năm). Công trình mất điện không thu được tiền nhưng vẫn tốn bảo trì.' },
  { k: 'environment', name: 'Môi trường', formula: '70 + tác động của các công trình đang chạy: nhiệt điện −18, nhà máy −12, công viên +8…' },
  { k: 'science', name: 'Khoa học', formula: 'Tổng điểm của trường học, phòng thí nghiệm, bệnh viện, trung tâm AI đang chạy.' },
  { k: 'technology', name: 'Công nghệ', formula: 'Tổng điểm công nghệ: trung tâm AI +25, phòng thí nghiệm +6, nhà máy +4…' },
  { k: 'life', name: 'Chất lượng cuộc sống', formula: 'Trung bình các khu dân cư: 40 + trường trong 2 ô (+15) + bệnh viện trong 2 ô (+15) + công viên sát bên (+10) − sát nhà máy/nhiệt điện (−15) − mất điện (−30), nhân hệ số môi trường (0,5 + môi trường ÷ 200).' },
];
/** Tên ngắn trên ô bản đồ: bỏ chữ "Trạm", viết hoa chữ đầu. */
const short = (n: string) => { const t = n.replace('Trạm ', ''); return t.charAt(0).toUpperCase() + t.slice(1); };
const sign = (n: number) => (n > 0 ? `+${n}` : String(n));

export default function SmartCityPage() {
  const { evidence } = useEvidence();
  const [city, setCity] = useState<City>(loadCity);
  const [tool, setTool] = useState<BuildingType | 'pha' | null>(null);
  const [focus, setFocus] = useState<IndexKey>('life');
  const [msg, setMsg] = useState<string | null>(null);
  const [reset, setReset] = useState(false);
  useEffect(() => { saveCity(city); }, [city]);
  const sim = useMemo(() => SmartCity.simulate(city), [city]);
  const goals = useMemo(() => SmartCity.goals(city), [city]);
  const unlocks = useMemo(() => SmartCity.unlockStatus(evidence, city), [evidence, city]);
  const T = SmartCity.TYPES;

  const act = (a: Record<string, unknown>, okMsg?: string) => {
    const r = SmartCity.apply(city, a, evidence);
    if (r.ok) { setCity(r.state); setMsg(okMsg ?? null); } else setMsg(r.reason ?? 'Không làm được.');
  };
  const onTile = (x: number, y: number) => {
    const k = `${x},${y}`;
    if (SmartCity.WATER.includes(k)) return setMsg('Đây là sông — không xây được.');
    if (city.tiles[k]) {
      if (tool === 'pha') act({ type: 'demolish', x, y }, `Đã phá ${T[city.tiles[k]].name}.`);
      else setMsg(`${T[city.tiles[k]].name} ở ô ${x + 1}-${y + 1}${sim.powered[k] ? '' : ' — đang MẤT ĐIỆN'}. Chọn "Phá" để dỡ (hoàn 50% tiền).`);
      return;
    }
    if (!tool || tool === 'pha') return setMsg('Chọn một công trình bên dưới rồi bấm vào ô trống.');
    act({ type: 'build', build: tool, x, y }, `Đã xây ${T[tool].name}.`);
  };
  const cells = Array.from({ length: SmartCity.SIZE * SmartCity.SIZE }, (_, i) => [i % SmartCity.SIZE, Math.floor(i / SmartCity.SIZE)] as const);
  const met = goals.filter((g) => g.met).length;
  const info = INDEX.find((i) => i.k === focus)!;

  return (
    <div className="space-y-5">
      <Link to={trPath('van-tuong-gioi')} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" aria-hidden /> Vạn Tượng Giới</Link>
      <TrPageHeader title="Thành phố thông minh" plain="Mô hình tương tác" description="Xây thành phố của em trên một vùng đất nhỏ. Mỗi công trình mở khoá bằng kiến thức em đã học. Mọi quyết định — đặt gì, ở đâu, dùng điện mặt trời hay than — đều làm 6 chỉ số thay đổi." />

      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6" aria-label="Chỉ số thành phố">
        {INDEX.map((i) => {
          const v = sim.indices[i.k];
          return (
            <li key={i.k}>
              <button type="button" onClick={() => setFocus(i.k)} aria-pressed={focus === i.k} className={cn('w-full rounded-xl border bg-card p-3 text-left transition-colors hover:bg-muted', focus === i.k && 'border-primary')}>
                <span className="block text-xs text-muted-foreground">{i.name}</span>
                <span className="block font-mono text-xl font-semibold tabular-nums">{v}</span>
                <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-muted"><span className={cn('block h-full rounded-full', v >= 60 ? 'bg-el-moc' : v >= 35 ? 'bg-gold' : 'bg-destructive')} style={{ width: `${v}%` }} /></span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-5">
          <Panel title={`Năm ${city.year}`} description="Bấm vào ô trống để xây công trình đang chọn. Ô viền đỏ là công trình mất điện.">
            <div className="mx-auto grid max-w-md grid-cols-6 gap-1" role="grid" aria-label="Bản đồ thành phố 6 × 6">
              {cells.map(([x, y]) => {
                const k = `${x},${y}`;
                const water = SmartCity.WATER.includes(k);
                const b = city.tiles[k];
                const Icon = b ? ICON[b] : null;
                const off = b && !sim.powered[k];
                return (
                  <button key={k} type="button" role="gridcell" onClick={() => onTile(x, y)}
                    aria-label={water ? `Ô ${x + 1}-${y + 1}: sông` : b ? `Ô ${x + 1}-${y + 1}: ${T[b].name}${off ? ', mất điện' : ''}` : `Ô ${x + 1}-${y + 1}: trống`}
                    className={cn('grid aspect-square place-items-center rounded-md border text-[10px] leading-tight transition-colors',
                      water ? 'cursor-not-allowed border-transparent bg-el-thuy/20' : b ? 'bg-card hover:bg-muted' : 'border-dashed bg-muted/40 hover:bg-accent',
                      off && 'border-2 border-destructive', tool === 'pha' && b && 'hover:border-destructive')}>
                    {Icon && <span className="flex flex-col items-center gap-0.5"><Icon className={cn('size-5', off ? 'text-destructive' : b === 'nhiet-dien' || b === 'nha-may' ? 'text-el-hoa' : b === 'cong-vien' ? 'text-el-moc' : 'text-primary')} aria-hidden /><span className="hidden px-0.5 text-center sm:block">{short(T[b].name)}</span></span>}
                  </button>
                );
              })}
            </div>
            {msg && <p className="mt-3 rounded-lg bg-muted p-2 text-sm" role="status">{msg}</p>}
          </Panel>

          <Panel title="Công trình" icon={Hammer} description="Giá · điện (MW, + là cấp, − là dùng) · tác động môi trường. Công trình khoá ghi rõ cần học gì để mở.">
            <ul className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Chọn công trình">
              {ORDER.map((t) => {
                const d = T[t];
                const u = unlocks[t];
                const Icon = ICON[t];
                return (
                  <li key={t}>
                    <button type="button" role="radio" aria-checked={tool === t} disabled={!u.unlocked} onClick={() => setTool(tool === t ? null : t)}
                      className={cn('flex w-full items-start gap-3 rounded-lg border bg-card p-2.5 text-left text-sm transition-colors enabled:hover:bg-muted', tool === t && 'border-primary bg-primary/10', !u.unlocked && 'bg-muted/40 text-muted-foreground')}>
                      {u.unlocked ? <Icon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden /> : <Lock className="mt-0.5 size-5 shrink-0" aria-hidden />}
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{d.name}</span>
                        <span className="block font-mono text-[11px] tabular-nums">{d.cost} xu · {sign(d.energy)} MW · MT {sign(d.env)}</span>
                        {!u.unlocked && <span className="mt-0.5 block text-[11px]">Mở khi: {u.label}{u.progress ? ` (${u.progress[0]}/${u.progress[1]})` : ''}</span>}
                      </span>
                    </button>
                  </li>
                );
              })}
              <li>
                <button type="button" role="radio" aria-checked={tool === 'pha'} onClick={() => setTool(tool === 'pha' ? null : 'pha')}
                  className={cn('flex w-full items-center gap-3 rounded-lg border bg-card p-2.5 text-left text-sm hover:bg-muted', tool === 'pha' && 'border-destructive bg-destructive/10')}>
                  <Trash2 className="size-5 text-destructive" aria-hidden /> Phá công trình (hoàn 50%)
                </button>
              </li>
            </ul>
          </Panel>
        </div>

        <div className="min-w-0 space-y-5">
          <Panel variant="feature" title="Ngân sách" icon={Coins}>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-md bg-muted p-2"><dt className="text-[11px] text-muted-foreground">Tiền</dt><dd className="font-mono font-semibold tabular-nums">{city.money}</dd></div>
              <div className="rounded-md bg-muted p-2"><dt className="text-[11px] text-muted-foreground">Mỗi năm</dt><dd className={cn('font-mono font-semibold tabular-nums', sim.net < 0 && 'text-destructive')}>{sign(sim.net)}</dd></div>
              <div className="rounded-md bg-muted p-2"><dt className="text-[11px] text-muted-foreground"><Users className="inline size-3" aria-hidden /> Dân số</dt><dd className="font-mono font-semibold tabular-nums">{sim.population}</dd></div>
              <div className="rounded-md bg-muted p-2"><dt className="text-[11px] text-muted-foreground"><Zap className="inline size-3" aria-hidden /> Điện</dt><dd className="font-mono font-semibold tabular-nums">{sim.supply}/{sim.demand} MW</dd></div>
            </dl>
            <Button className="mt-3 w-full" onClick={() => act({ type: 'next-year' }, `Sang năm ${city.year + 1}: ${sign(sim.net)} xu.`)}><CalendarClock /> Qua một năm</Button>
          </Panel>

          <Panel title={`Vì sao ${info.name} = ${sim.indices[focus]}?`} description={info.formula}>
            <ul className="space-y-1 text-sm">
              {sim.why[focus].length ? sim.why[focus].map((w) => (
                <li key={w.label} className="flex justify-between gap-2"><span className="min-w-0">{w.label}</span><span className={cn('font-mono tabular-nums', w.value < 0 && 'text-destructive')}>{focus === 'life' && w.label === 'Hệ số môi trường' ? `× ${w.value}` : sign(w.value)}</span></li>
              )) : <li className="text-muted-foreground">Chưa có công trình nào tác động.</li>}
            </ul>
          </Panel>

          <Panel title="Mục tiêu: thành phố xanh" description={`Đạt ${met}/${goals.length}`}>
            <ul className="space-y-1.5 text-sm">
              {goals.map((g) => <li key={g.id} className="flex items-start gap-2">{g.met ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-el-moc" aria-label="Đạt" /> : <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-label="Chưa đạt" />}<span>{g.label}</span></li>)}
            </ul>
            {met === goals.length && <Badge tone="green" className="mt-3">Thành phố xanh hoàn thành</Badge>}
          </Panel>

          {city.history.length > 0 && (
            <Panel title="Các năm trước">
              <table className="w-full text-xs">
                <thead><tr className="text-left text-muted-foreground"><th className="py-1">Năm</th><th className="py-1 text-right">Tiền</th><th className="py-1 text-right">MT</th><th className="py-1 text-right">Sống</th></tr></thead>
                <tbody>{city.history.slice(-5).reverse().map((h) => <tr key={h.year} className="border-t"><td className="py-1">{h.year}</td><td className="py-1 text-right font-mono">{h.money}</td><td className="py-1 text-right font-mono">{h.indices.environment}</td><td className="py-1 text-right font-mono">{h.indices.life}</td></tr>)}</tbody>
              </table>
            </Panel>
          )}
          <Button variant="ghost" size="sm" onClick={() => setReset(true)}><RotateCcw /> Xây lại từ đầu</Button>
        </div>
      </div>

      <Modal open={reset} onClose={() => setReset(false)} title="Xây lại thành phố?" description="Thành phố hiện tại sẽ bị xoá khỏi máy này."
        footer={<><Button variant="outline" onClick={() => setReset(false)}>Huỷ</Button><Button onClick={() => { setCity(SmartCity.newCity()); setReset(false); setMsg('Thành phố mới — bắt đầu với 300 xu.'); }}>Xây lại</Button></>}>
        <p className="text-sm text-muted-foreground">Công trình đã mở khoá vẫn giữ nguyên vì nó dựa trên kiến thức em đã học.</p>
      </Modal>
    </div>
  );
}
