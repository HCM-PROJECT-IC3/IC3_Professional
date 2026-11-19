import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { ArrowLeft, CheckCircle2, Clock, Lock, Map as MapIcon, Play, RotateCcw, Star, Table2, X, Zap } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { POWER_CITY_ART } from '../assets/power-city';
import { Meter, Panel, TrPageHeader, trPath } from '../ui/primitives';
import { Challenge, bestOf, saveBest, useLevelRun, type Action, type Answer, type Question, type Replay } from './challengeEngine';

/* BÍ CẢNH 1 — THÀNH PHỐ MẤT ĐIỆN. Giao diện thuần trình bày: mọi thay đổi trạng thái đi qua level.apply của
   js/techrealm/thanh-pho-mat-dien-core.js (cùng mã máy chủ dùng để chạy lại nhật ký). Gói lười riêng, 0 mạng.
   Thiết kế: docs/techrealm/GAME_DESIGN.md §2. */

const CID = 'thanh-pho-mat-dien';
type Screen = 'intro' | 'map' | 'mach-dien' | 'phan-phoi' | 'du-lieu' | 'bao-qua-tai';
const LEVELS: { id: Exclude<Screen, 'intro' | 'map'>; place: string; x: number; y: number; npc: string; done: string }[] = [
  { id: 'mach-dien', place: 'Trạm biến áp', x: 15, y: 70, npc: 'Dây ở trạm biến áp bị đứt. Em chọn đúng vật liệu để nối lại mạch, cho đèn sáng trở lại nhé!', done: 'Mạch điện chạy lại rồi! Nhờ em chọn đúng vật dẫn điện.' },
  { id: 'phan-phoi', place: 'Nhà máy điện', x: 15, y: 33, npc: 'Máy phát chỉ chạy được một phần công suất. Mình phải chia điện thật khéo: nơi nào cần trước?', done: 'Điện đã được chia hợp lý — bệnh viện và trạm nước đều có điện.' },
  { id: 'du-lieu', place: 'Phòng điều khiển', x: 52, y: 33, npc: 'Hoá đơn điện tăng vọt. Chắc có chỗ rò điện. Em xem số liệu các khu để tìm ra nhé.', done: 'Tìm ra chỗ rò rồi! Đội sửa chữa đang tới.' },
  { id: 'bao-qua-tai', place: 'Tâm bão', x: 85, y: 28, npc: 'Cơn bão quá tải đang tới! Giữ cho thành phố không sập điện qua 5 đợt tấn công.', done: 'Thành phố đã an toàn qua cơn bão. Cảm ơn em, kỹ sư nhỏ!' },
];
const MAT_COLOR: Record<string, string> = { dong: '#b8732e', sat: '#6b7280', nhom: '#9aa7ba', chi: '#3a3f4a', nhua: '#2563c9', go: '#a0703c', len: '#c2452a', thuytinh: '#5cb8c9', caosu: '#d65d8f' };
const MATERIALS = Challenge.get(CID)!.data.MATERIALS as Record<string, { name: string; conductor: boolean }>;

/* ── Dùng chung ── */
function Npc({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border bg-card p-3" role="status">
      <img src={POWER_CITY_ART.npcLam} alt="Kỹ sư Lam" width={52} height={52} className="shrink-0 rounded-full" />
      <div className="min-w-0 text-sm"><p className="text-xs font-semibold text-primary">Kỹ sư Lam</p><p className="mt-0.5">{children}</p></div>
    </div>
  );
}
function Stars({ n, size = 16 }: { n: number; size?: number }) {
  return (
    <span className="inline-flex" aria-label={`${n}/3 sao`}>
      {[1, 2, 3].map((i) => <Star key={i} style={{ width: size, height: size }} className={i <= n ? 'fill-gold text-gold' : 'text-muted-foreground/40'} aria-hidden />)}
    </span>
  );
}
function Quiz({ qs, answers, onAnswer }: { qs: Question[]; answers: Record<string, Answer>; onAnswer: (q: string, o: number) => void }) {
  return (
    <Panel title="Vận dụng kiến thức" description="Trả lời để hoàn thành màn. Lần chọn đầu tiên được tính điểm; chọn sai thì thử lại.">
      <ol className="space-y-4" aria-label="Câu hỏi vận dụng">
        {qs.map((q, qi) => {
          const a = answers[q.id];
          return (
            <li key={q.id}>
              <p className="text-sm font-medium">{qi + 1}. {q.text}</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {q.options.map((o, oi) => {
                  const right = a?.solved && oi === q.correct;
                  const wrongFirst = a && a.first === oi && oi !== q.correct;
                  return (
                    <button key={oi} type="button" disabled={a?.solved} onClick={() => onAnswer(q.id, oi)}
                      className={cn('rounded-lg border px-3 py-2 text-left text-sm transition-colors enabled:hover:bg-muted', right && 'border-el-moc bg-el-moc/10', wrongFirst && 'border-destructive/50 text-muted-foreground line-through')}>
                      {o}
                    </button>
                  );
                })}
              </div>
              {a && !a.solved && <p className="mt-1 text-xs text-destructive" role="status">Chưa đúng — thử phương án khác.</p>}
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}

/* ═════ Màn 1: mạch điện ═════ */
interface Round { kind: 'loop' | 'parallel'; title: string; slots?: string[]; switch?: boolean; lamps?: string[]; main?: string[]; branches?: { lamp: string; name: string; slots: string[] }[] }
interface S1 { palette: string[]; round: number; rounds: Round[]; placed: Record<string, string>; sw: boolean; tests: number; lastLit: Record<string, boolean> | null; qs: Question[]; answers: Record<string, Answer>; done: boolean }
const POS: Record<string, [number, number]> = { a: [150, 190], b: [360, 115], m: [120, 40], h: [250, 40], p: [250, 180] };
function Lamp({ x, y, on, label }: { x: number; y: number; on: boolean; label?: string }) {
  return (
    <g>
      <circle cx={x} cy={y} r={16} className={on ? 'fill-gold stroke-gold' : 'fill-card stroke-muted-foreground'} strokeWidth={2} />
      <path d={`M${x - 7} ${y - 7}l14 14M${x + 7} ${y - 7}l-14 14`} className="stroke-muted-foreground" strokeWidth={1.5} opacity={on ? 0 : 1} />
      {label && <text x={x} y={y + 32} textAnchor="middle" className="fill-foreground text-[11px]">{label}</text>}
    </g>
  );
}
function CircuitLevel({ onDone }: { onDone: (r: Replay, seed: number, log: Action[]) => void }) {
  const run = useLevelRun<S1>(CID, 'mach-dien');
  const s = run.state;
  const [sel, setSel] = useState<string | null>(null);
  const [msg, setMsg] = useState<string>(LEVELS[0].npc);
  const prev = useRef({ round: 0, tests: 0 });
  useEffect(() => {
    if (s.round > prev.current.round) setMsg(s.round < s.rounds.length ? 'Đèn sáng rồi! Sang mạch tiếp theo nhé.' : 'Cả 3 mạch đều chạy! Giờ em trả lời vài câu để chắc mình hiểu vì sao.');
    else if (s.tests > prev.current.tests) setMsg('Đèn chưa đúng như yêu cầu. Gợi ý: vật liệu nào cho dòng điện đi qua? Công tắc đã đóng chưa?');
    prev.current = { round: s.round, tests: s.tests };
  }, [s.round, s.tests, s.rounds.length]);
  useEffect(() => { if (s.done) onDone(Challenge.replay(CID, 'mach-dien', run.seed, run.log), run.seed, run.log); }, [s.done]); // eslint-disable-line react-hooks/exhaustive-deps
  const rd = s.rounds[s.round];
  const lit = s.lastLit ?? {};
  const anyLit = Object.values(lit).some(Boolean);
  const slots = rd ? (rd.kind === 'loop' ? rd.slots! : rd.main!.concat(rd.branches![0].slots, rd.branches![1].slots)) : [];
  const slotPos = (id: string): [number, number] => (rd?.kind === 'loop' && rd.slots!.length === 1 && id === 'a' ? [150, 190] : POS[id]);
  return (
    <div className="space-y-4">
      <Npc>{msg}</Npc>
      {rd ? (
        <Panel title={`Mạch ${s.round + 1}/3: ${rd.title}`} description="Chọn vật liệu trong túi, rồi bấm vào chỗ đứt để đặt. Xong bấm Thử mạch.">
          <div className="relative mx-auto aspect-[400/230] w-full max-w-xl">
            <svg viewBox="0 0 400 230" className="absolute inset-0 size-full" aria-hidden>
              <g fill="none" className={cn('stroke-foreground/70', anyLit && 'stroke-gold')} strokeWidth={3} strokeLinecap="round" strokeDasharray={anyLit ? '8 6' : undefined} style={anyLit ? { animation: 'tr-flow 0.6s linear infinite' } : undefined}>
                {rd.kind === 'loop' ? <path d="M40 40H360V190H40Z" /> : <path d="M40 40H200M200 40H360V180H200V40M200 180V180M360 180V215H40V40" />}
              </g>
              <g className="stroke-foreground" strokeWidth={3}><path d="M28 105h24M34 118h12" /></g>
              <text x={58} y={116} className="fill-muted-foreground text-[11px]">Pin</text>
              {rd.kind === 'loop' ? <Lamp x={200} y={40} on={!!lit.den} /> : (<><Lamp x={320} y={40} on={!!lit['benh-vien']} label="Bệnh viện" /><Lamp x={320} y={180} on={!!lit['vui-choi']} label="Khu vui chơi" /></>)}
              {rd.switch && <g className="stroke-foreground" strokeWidth={3}><circle cx={250} cy={190} r={3} /><circle cx={290} cy={190} r={3} /><path d={s.sw ? 'M250 190H290' : 'M250 190L286 172'} /></g>}
            </svg>
            {slots.map((id) => {
              const [x, y] = slotPos(id);
              const m = s.placed[id];
              return (
                <button key={id} type="button"
                  onClick={() => (sel ? run.dispatch({ type: 'place', slot: id, m: sel }) : m && run.dispatch({ type: 'clear', slot: id }))}
                  aria-label={m ? `Chỗ nối: ${MATERIALS[m].name}. Bấm để gỡ` : 'Chỗ đứt: bấm để đặt vật liệu đang chọn'}
                  className={cn('absolute -translate-x-1/2 -translate-y-1/2 rounded-md border-2 px-2 py-1 text-[11px] font-medium shadow-sm', m ? 'border-transparent text-white' : 'border-dashed border-destructive bg-card text-destructive')}
                  style={{ left: `${(x / 400) * 100}%`, top: `${(y / 230) * 100}%`, background: m ? MAT_COLOR[m] : undefined }}>
                  {m ? MATERIALS[m].name : 'Chỗ đứt'}
                </button>
              );
            })}
            {rd.switch && (
              <button type="button" onClick={() => run.dispatch({ type: 'toggle' })} className="absolute -translate-x-1/2 rounded-md border bg-card px-2 py-0.5 text-[11px]" style={{ left: '67.5%', top: '87%' }}>
                Công tắc: {s.sw ? 'đóng' : 'mở'}
              </button>
            )}
          </div>
          <p className="mt-4 text-xs font-medium text-muted-foreground uppercase">Túi vật liệu</p>
          <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Túi vật liệu">
            {s.palette.map((m) => (
              <button key={m} type="button" role="radio" aria-checked={sel === m} onClick={() => setSel(sel === m ? null : m)}
                className={cn('flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm', sel === m && 'border-primary bg-primary/10')}>
                <span className="size-3 rounded-sm" style={{ background: MAT_COLOR[m] }} aria-hidden />{MATERIALS[m].name}
              </button>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button onClick={() => run.dispatch({ type: 'test' })}><Zap /> Thử mạch</Button>
            <span className="text-sm text-muted-foreground">Số lần thử: <span className="font-mono">{s.tests}</span></span>
          </div>
        </Panel>
      ) : (
        <Quiz qs={s.qs} answers={s.answers} onAnswer={(q, o) => run.dispatch({ type: 'answer', q, o })} />
      )}
    </div>
  );
}

/* ═════ Màn 2: chia điện ═════ */
interface B { id: string; name: string; demand: number; essential: boolean }
interface S2 { buildings: B[]; cap: number; on: Record<string, boolean>; submits: number; passedAt: number; lastCheck?: { total: number; overload: boolean; essentials: boolean }; qs: Question[]; answers: Record<string, Answer>; done: boolean }
function LoadBoard({ bs, on, cap, onToggle, disabled }: { bs: B[]; on: Record<string, boolean>; cap: number; onToggle: (id: string) => void; disabled?: boolean }) {
  const total = bs.filter((b) => on[b.id]).reduce((t, b) => t + b.demand, 0);
  return (
    <div className="space-y-3">
      <div>
        <div className="mb-1 flex justify-between text-sm"><span>Đang dùng</span><span className={cn('font-mono tabular-nums', total > cap && 'font-semibold text-destructive')}>{total}/{cap} kW</span></div>
        <div className="h-3 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Công suất đang dùng" aria-valuemin={0} aria-valuemax={cap} aria-valuenow={total}>
          <div className={cn('h-full rounded-full transition-[width] duration-300', total > cap ? 'bg-destructive' : 'bg-primary')} style={{ width: `${Math.min(100, (total / cap) * 100)}%` }} />
        </div>
        {total > cap && <p className="mt-1 text-xs text-destructive" role="status">Quá tải {total - cap} kW!</p>}
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {bs.map((b) => (
          <li key={b.id}>
            <button type="button" disabled={disabled} aria-pressed={!!on[b.id]} onClick={() => onToggle(b.id)}
              className={cn('flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-colors enabled:hover:bg-muted', on[b.id] && 'border-primary bg-primary/10')}>
              <Zap className={cn('size-4 shrink-0', on[b.id] ? 'text-gold' : 'text-muted-foreground')} aria-hidden />
              <span className="min-w-0 flex-1">{b.name}{b.essential && <Badge tone="orange" className="ml-2">Thiết yếu</Badge>}</span>
              <span className="font-mono tabular-nums">{b.demand} kW</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
function PowerLevel({ onDone }: { onDone: (r: Replay, seed: number, log: Action[]) => void }) {
  const run = useLevelRun<S2>(CID, 'phan-phoi');
  const s = run.state;
  useEffect(() => { if (s.done) onDone(Challenge.replay(CID, 'phan-phoi', run.seed, run.log), run.seed, run.log); }, [s.done]); // eslint-disable-line react-hooks/exhaustive-deps
  const c = s.lastCheck;
  const msg = s.passedAt ? 'Chia điện hợp lý! Trả lời 2 câu để chốt kế hoạch.' : !c ? LEVELS[1].npc + ` Máy phát hôm nay có ${s.cap} kW.` : c.overload ? `Quá tải rồi: ${c.total} kW mà máy chỉ có ${s.cap} kW. Tắt bớt nơi chưa cần.` : 'Chưa có điện cho nơi thiết yếu! Bệnh viện và trạm nước phải luôn có điện.';
  return (
    <div className="space-y-4">
      <Npc>{msg}</Npc>
      {!s.passedAt ? (
        <Panel title={`Máy phát: ${s.cap} kW`} description="Bật/tắt từng khu. Dùng càng sát công suất càng tốt, nhưng không được vượt và không bỏ nơi thiết yếu.">
          <LoadBoard bs={s.buildings} on={s.on} cap={s.cap} onToggle={(id) => run.dispatch({ type: 'toggle', id })} />
          <Button className="mt-4" onClick={() => run.dispatch({ type: 'submit' })}><Zap /> Cấp điện</Button>
        </Panel>
      ) : (
        <Quiz qs={s.qs} answers={s.answers} onAnswer={(q, o) => run.dispatch({ type: 'answer', q, o })} />
      )}
    </div>
  );
}

/* ═════ Màn 3: dữ liệu ═════ */
interface S3 { data: number[][]; districts: string[]; hours: number[]; qs: Question[]; answers: Record<string, Answer>; done: boolean }
function DataLevel({ onDone }: { onDone: (r: Replay, seed: number, log: Action[]) => void }) {
  const run = useLevelRun<S3>(CID, 'du-lieu');
  const s = run.state;
  const [table, setTable] = useState(false);
  useEffect(() => { if (s.done) onDone(Challenge.replay(CID, 'du-lieu', run.seed, run.log), run.seed, run.log); }, [s.done]); // eslint-disable-line react-hooks/exhaustive-deps
  const max = Math.max(...s.data.flat());
  return (
    <div className="space-y-4">
      <Npc>{LEVELS[2].npc}</Npc>
      <Panel title="Điện năng tiêu thụ theo giờ (kWh)" description="Mỗi khung là 1 khu, cùng thang đo. Điểm nào cao bất thường so với chính khu đó và các khu khác cùng giờ?"
        action={<Button size="sm" variant="outline" onClick={() => setTable(!table)}><Table2 /> {table ? 'Xem biểu đồ' : 'Xem bảng số'}</Button>}>
        {table ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="py-1.5">Khu</th>{s.hours.map((h) => <th key={h} className="py-1.5 text-right">{h}h</th>)}</tr></thead>
              <tbody>{s.data.map((row, d) => <tr key={d} className="border-b last:border-0"><td className="py-1.5">{s.districts[d]}</td>{row.map((v, h) => <td key={h} className="py-1.5 text-right font-mono tabular-nums">{v}</td>)}</tr>)}</tbody>
            </table>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {s.data.map((row, d) => (
              <figure key={d}>
                <figcaption className="mb-1 text-xs font-medium">{s.districts[d]}</figcaption>
                <svg viewBox="0 0 240 120" className="w-full" role="img" aria-label={`${s.districts[d]}: ${row.map((v, h) => `${s.hours[h]} giờ ${v}`).join(', ')}`}>
                  <line x1={0} x2={240} y1={100} y2={100} className="stroke-border" />
                  {row.map((v, h) => {
                    const bh = (v / max) * 82;
                    return (
                      <g key={h}>
                        <rect x={h * 40 + 8} y={100 - bh} width={24} height={bh} rx={2} className="fill-primary/70" />
                        <text x={h * 40 + 20} y={96 - bh} textAnchor="middle" className="fill-foreground text-[10px]">{v}</text>
                        <text x={h * 40 + 20} y={114} textAnchor="middle" className="fill-muted-foreground text-[10px]">{s.hours[h]}h</text>
                      </g>
                    );
                  })}
                </svg>
              </figure>
            ))}
          </div>
        )}
      </Panel>
      <Quiz qs={s.qs} answers={s.answers} onAnswer={(q, o) => run.dispatch({ type: 'answer', q, o })} />
    </div>
  );
}

/* ═════ Boss: cơn bão quá tải ═════ */
interface Ev { id: string; text: string; cap?: number; demand?: Record<string, number>; must?: string[] }
interface S4 { cap0: number; base: B[]; events: Ev[]; turn: number; on: Record<string, boolean>; hp: number; log: { event: string; cap: number; total: number; overload: boolean; essentials: boolean; must: boolean; score: number; dmg: number }[]; qs: Question[]; answers: Record<string, Answer>; done: boolean }
function BossLevel({ onDone }: { onDone: (r: Replay, seed: number, log: Action[]) => void }) {
  const run = useLevelRun<S4>(CID, 'bao-qua-tai');
  const s = run.state;
  useEffect(() => { if (s.done) onDone(Challenge.replay(CID, 'bao-qua-tai', run.seed, run.log), run.seed, run.log); }, [s.done]); // eslint-disable-line react-hooks/exhaustive-deps
  const ev = s.events[s.turn];
  const bs = ev ? s.base.map((b) => ({ ...b, demand: b.demand + (ev.demand?.[b.id] ?? 0) })) : s.base;
  const cap = s.cap0 + (ev?.cap ?? 0);
  const last = s.log[s.log.length - 1];
  return (
    <div className="space-y-4">
      <Npc>{!last ? LEVELS[3].npc : last.overload ? 'Quá tải! Thành phố chập điện một lúc. Lượt sau tắt bớt nơi chưa cần nhé.' : !last.essentials || !last.must ? 'Không quá tải, nhưng còn nơi cần điện bị tắt. Nhớ ưu tiên nơi thiết yếu.' : `Giữ vững! Cơn bão mất ${last.dmg} máu.`}</Npc>
      <Panel title="Cơn bão quá tải" variant="feature">
        <Meter label="Sức mạnh cơn bão" value={s.hp} max={100} tone="violet" showValue={`${s.hp}/100`} />
        <ol className="mt-3 flex flex-wrap gap-1.5" aria-label="Các đợt">
          {s.events.map((e, i) => {
            const l = s.log[i];
            return <li key={e.id}><Badge tone={!l ? (i === s.turn ? 'blue' : 'neutral') : l.overload ? 'red' : 'green'}>Đợt {i + 1}{l ? (l.overload ? ': quá tải' : `: −${l.dmg}`) : ''}</Badge></li>;
          })}
        </ol>
      </Panel>
      {ev ? (
        <Panel title={`Đợt ${s.turn + 1}/5`} description={ev.text}>
          <LoadBoard bs={bs} on={s.on} cap={cap} onToggle={(id) => run.dispatch({ type: 'toggle', id })} />
          {ev.must?.length ? <p className="mt-2 text-xs text-muted-foreground">Bắt buộc bật: {ev.must.map((id) => s.base.find((b) => b.id === id)?.name).join(', ')}.</p> : null}
          <Button className="mt-4" onClick={() => run.dispatch({ type: 'end-turn' })}>Chống đỡ đợt này</Button>
        </Panel>
      ) : (
        <Quiz qs={s.qs} answers={s.answers} onAnswer={(q, o) => run.dispatch({ type: 'answer', q, o })} />
      )}
    </div>
  );
}

/* ═════ Kết quả ═════ */
const CRITERIA: { k: keyof Replay['result']['parts']; label: string; max: number }[] = [
  { k: 'accuracy', label: 'Độ chính xác', max: 40 },
  { k: 'solving', label: 'Giải quyết vấn đề', max: 25 },
  { k: 'application', label: 'Vận dụng kiến thức', max: 20 },
  { k: 'time', label: 'Thời gian', max: 10 },
  { k: 'attempts', label: 'Số lần thử', max: 5 },
];
function ResultView({ levelId, r, tuVi, onAgain, onMap, onNext }: { levelId: string; r: Replay; tuVi: number; onAgain: () => void; onMap: () => void; onNext?: () => void }) {
  const lv = LEVELS.find((l) => l.id === levelId)!;
  const boss = levelId === 'bao-qua-tai';
  return (
    <div className="space-y-4">
      <Npc>{r.result.completed ? lv.done : 'Chưa xong nhiệm vụ của màn này. Em thử lại nhé — lần sau sẽ tốt hơn!'}</Npc>
      <Panel variant="feature" title={r.result.completed ? 'Hoàn thành!' : 'Chưa hoàn thành'} description={`${lv.place} · ${Math.floor(r.durationSec / 60)} phút ${r.durationSec % 60} giây`} action={<Stars n={r.result.stars} size={22} />}>
        <p className="text-3xl font-semibold tabular-nums">{r.result.score}<span className="text-base font-normal text-muted-foreground">/100</span></p>
        <ul className="mt-4 space-y-2 text-sm">
          <li className="flex items-center gap-2">{r.result.completed ? <CheckCircle2 className="size-4 text-el-moc" aria-hidden /> : <X className="size-4 text-destructive" aria-hidden />} Hoàn thành nhiệm vụ {!r.result.completed && <span className="text-xs text-muted-foreground">(chưa xong: tối đa 40 điểm)</span>}</li>
          {CRITERIA.map((c) => (
            <li key={c.k} className="grid grid-cols-[9rem_minmax(0,1fr)_3rem] items-center gap-2">
              <span>{c.label}</span>
              <span className="h-2 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-primary" style={{ width: `${(r.result.parts[c.k] / c.max) * 100}%` }} /></span>
              <span className="text-right font-mono text-xs tabular-nums">{r.result.parts[c.k]}/{c.max}</span>
            </li>
          ))}
        </ul>
        <div className="mt-4 rounded-lg bg-muted p-3 text-sm">
          {tuVi > 0 ? <p>+{tuVi} tu vi luyện tập (kỷ lục mới, lưu trên máy).</p> : <p>Chưa vượt kỷ lục cũ của em.</p>}
          {r.result.completed && (
            <p className="mt-1 text-muted-foreground">
              Công huân: khi lớp em bật, máy chủ chạy lại đúng các bước em vừa chơi để chấm — ≥ 85 điểm: +30, ≥ 65: +20, ≥ 50: +10{boss ? ', màn Boss thêm +40' : ''}.
            </p>
          )}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="outline" onClick={onAgain}><RotateCcw /> Chơi lại</Button>
          <Button variant="outline" onClick={onMap}><MapIcon /> Bản đồ</Button>
          {onNext && r.result.completed && <Button onClick={onNext}><Play /> Màn tiếp</Button>}
        </div>
      </Panel>
    </div>
  );
}

/* ═════ Khung bí cảnh: cốt truyện → bản đồ → màn → kết quả ═════ */
export default function PowerCityGame() {
  const [screen, setScreen] = useState<Screen>(() => (Object.keys(bestOf(CID)).length ? 'map' : 'intro'));
  const [result, setResult] = useState<{ levelId: string; r: Replay; tuVi: number } | null>(null);
  const [runKey, setRunKey] = useState(0);
  const [best, setBest] = useState(() => bestOf(CID));
  const unlocked = useMemo(() => LEVELS.map((_, i) => i === 0 || (best[LEVELS[i - 1].id]?.stars ?? 0) > 0), [best]);
  const cleared = LEVELS.every((l) => (best[l.id]?.stars ?? 0) > 0);
  const finish = (levelId: string) => (r: Replay, seed: number, log: Action[]) => {
    const saved = r.result.completed ? saveBest(CID, levelId, { score: r.result.score, stars: r.result.stars, at: Date.now(), seed, actions: log }) : { tuVi: 0 };
    setBest(bestOf(CID));
    setResult({ levelId, r, tuVi: saved.tuVi });
  };
  const go = (s: Screen) => { setResult(null); setRunKey((k) => k + 1); setScreen(s); window.scrollTo(0, 0); };
  const idx = LEVELS.findIndex((l) => l.id === screen);

  return (
    <div className="space-y-5">
      <Link to={trPath('bi-canh')} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" aria-hidden /> Bí Cảnh</Link>
      <TrPageHeader title="Thành phố mất điện" plain="Bí cảnh 1 · Vật lý, năng lượng, toán, dữ liệu" description="Cả thành phố chìm trong bóng tối sau sự cố ở trạm biến áp. Cùng Kỹ sư Lam khôi phục điện, chia điện công bằng, tìm chỗ rò và vượt qua cơn bão quá tải." />

      {screen === 'intro' && (
        <div className="space-y-4">
          <Npc>Chào em! Mình là Lam, kỹ sư điện của thành phố. Tối qua một sự cố làm mất điện toàn thành phố: bệnh viện chạy máy phát dự phòng, trạm bơm nước ngừng chạy, đèn đường tắt hết. Mình cần một trợ thủ biết khoa học. Em giúp mình chứ?</Npc>
          <Panel title="Nhiệm vụ">
            <ol className="list-decimal space-y-1.5 pl-5 text-sm">
              <li><b>Trạm biến áp</b> — nối lại mạch điện bằng đúng vật liệu dẫn điện.</li>
              <li><b>Nhà máy điện</b> — chia điện có hạn cho các khu, ưu tiên nơi thiết yếu.</li>
              <li><b>Phòng điều khiển</b> — đọc số liệu, tìm khu bị rò điện.</li>
              <li><b>Tâm bão</b> (Boss) — giữ thành phố không quá tải qua 5 đợt.</li>
            </ol>
            <p className="mt-3 text-sm text-muted-foreground">Hoàn thành bí cảnh: vượt cả 4 màn (mỗi màn từ 1 sao). Mỗi màn được chấm theo 6 tiêu chí; kết quả lưu trên máy em.</p>
            <Button className="mt-4" onClick={() => setScreen('map')}><MapIcon /> Vào thành phố</Button>
          </Panel>
        </div>
      )}

      {screen === 'map' && (
        <div className="space-y-4">
          {cleared ? <Npc>Thành phố đã sáng đèn trở lại nhờ em! Em có thể chơi lại để lấy thêm sao.</Npc> : <Npc>Chọn một địa điểm trên bản đồ. Xong địa điểm trước thì mở địa điểm sau.</Npc>}
          <div className="overflow-hidden rounded-2xl border bg-card p-2">
            <div className="relative aspect-[800/420] w-full">
              <img src={POWER_CITY_ART.map} alt="" className="absolute inset-0 size-full" draggable={false} />
              {LEVELS.map((l, i) => {
                const b = best[l.id];
                return (
                  <button key={l.id} type="button" disabled={!unlocked[i]} onClick={() => go(l.id)}
                    aria-label={`${l.place}${!unlocked[i] ? ' (chưa mở)' : b ? `, ${b.stars} sao, ${b.score} điểm` : ''}`}
                    className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1 disabled:opacity-60"
                    style={{ left: `${l.x}%`, top: `${l.y}%` }}>
                    <span className={cn('grid size-10 place-items-center rounded-full border-2 bg-card text-sm font-semibold sm:size-12', b ? 'border-gold text-gold' : unlocked[i] ? 'border-primary text-primary' : 'border-border text-muted-foreground')}>
                      {unlocked[i] ? (l.id === 'bao-qua-tai' ? <Zap className="size-5" aria-hidden /> : i + 1) : <Lock className="size-4" aria-hidden />}
                    </span>
                    <span className="hidden rounded border bg-card px-1.5 text-xs font-medium sm:block">{l.place}</span>
                    {b && <Stars n={b.stars} size={12} />}
                  </button>
                );
              })}
            </div>
          </div>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {LEVELS.map((l, i) => (
              <li key={l.id} className="flex items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2 text-sm">
                <span className="min-w-0 truncate">{i + 1}. {l.place}</span>
                {best[l.id] ? <span className="flex items-center gap-1.5"><Stars n={best[l.id].stars} size={12} /><span className="font-mono text-xs">{best[l.id].score}</span></span> : <span className="text-xs text-muted-foreground">{unlocked[i] ? 'Chưa chơi' : 'Chưa mở'}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {idx >= 0 && !result && (
        <div key={runKey}>
          <p className="mb-3 flex items-center gap-2 text-sm text-muted-foreground"><Clock className="size-4" aria-hidden /> {LEVELS[idx].place} — đồng hồ đã chạy, nhưng em cứ bình tĩnh: thời gian chỉ chiếm 10 điểm.</p>
          {screen === 'mach-dien' && <CircuitLevel onDone={finish('mach-dien')} />}
          {screen === 'phan-phoi' && <PowerLevel onDone={finish('phan-phoi')} />}
          {screen === 'du-lieu' && <DataLevel onDone={finish('du-lieu')} />}
          {screen === 'bao-qua-tai' && <BossLevel onDone={finish('bao-qua-tai')} />}
        </div>
      )}
      {result && (
        <ResultView levelId={result.levelId} r={result.r} tuVi={result.tuVi}
          onAgain={() => go(result.levelId as Screen)} onMap={() => go('map')}
          onNext={idx >= 0 && idx < LEVELS.length - 1 ? () => go(LEVELS[idx + 1].id) : undefined} />
      )}
    </div>
  );
}
