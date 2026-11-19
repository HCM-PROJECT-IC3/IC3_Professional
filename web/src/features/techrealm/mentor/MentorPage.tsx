import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Bot, BookOpen, Code2, Flag, KeyRound, Lightbulb, ListChecks, Lock, Send, ShieldCheck, Sparkles, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { studentBook, dueItems } from '@/features/student/progress';
import { cn, legacyUrl } from '@/lib/utils';
import { useLearner } from '../learning/components';
import { Learning, quizHref, useCatalog } from '../learning/learning';
import { Tabs } from '../ui/controls';
import { Modal } from '../ui/overlay';
import { Panel, TrPageHeader, trPath } from '../ui/primitives';
import { AI, AICore, Mentor, addLog, clearOwnKey, currentMode, errorMessage, readLog, report, saveOwnKey, type MentorTask, type RubricResult } from './mentorEngine';

/* AI SƯ PHỤ (Prompt 07 §3). Việc AI: js/techrealm/mentor-core.js (câu lệnh do code dựng, lọc thông tin cá nhân,
   gợi ý KHÔNG nêu đáp án). Chế độ kiểm tra: đang làm bài Kiểm tra ở sảnh → AI nghỉ hẳn. Gợi ý nhiệm vụ: luật trên máy,
   KHÔNG gửi dữ liệu học tập cho AI. Tài liệu: docs/techrealm/AI_MENTOR.md */

type Tab = 'kien-thuc' | 'goi-y' | 'lap-trinh' | 'nhiem-vu' | 'thay-co' | 'cai-dat';

/** Hiển thị chữ AI an toàn (không innerHTML): đoạn, gạch đầu dòng, **đậm**, khối ```code```. */
function AiText({ text }: { text: string }) {
  const bold = (s: string, k: string) => s.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith('**') && p.endsWith('**') ? <strong key={k + i}>{p.slice(2, -2)}</strong> : <span key={k + i}>{p}</span>));
  const blocks: ReactNode[] = [];
  const parts = text.split(/```[a-zA-Z]*\n?/);
  parts.forEach((part, pi) => {
    if (pi % 2 === 1) { blocks.push(<pre key={'c' + pi} className="overflow-x-auto rounded-md bg-muted p-2 font-mono text-xs">{part.replace(/\n$/, '')}</pre>); return; }
    const lines = part.split('\n').map((l) => l.trimEnd()).filter((l, i, a) => l || (i > 0 && a[i - 1]));
    let list: string[] = [];
    const flush = (k: string) => { if (list.length) { blocks.push(<ul key={k} className="list-disc space-y-0.5 pl-5">{list.map((l, i) => <li key={i}>{bold(l, k + i)}</li>)}</ul>); list = []; } };
    lines.forEach((l, li) => {
      const m = /^\s*(?:[-*•]|\d+[.)])\s+(.*)$/.exec(l);
      if (m) { list.push(m[1]); return; }
      flush(`l${pi}-${li}`);
      if (l.trim()) blocks.push(<p key={`p${pi}-${li}`}>{bold(l.replace(/^#+\s*/, ''), `p${pi}-${li}`)}</p>);
    });
    flush(`e${pi}`);
  });
  return <div className="space-y-2 text-sm leading-relaxed">{blocks}</div>;
}

function useAsk(task: MentorTask) {
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<{ text: string; via: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ask = async (payload: unknown) => {
    const mode = currentMode();
    const pol = Mentor.policy(mode, task);
    if (!pol.allowed) { setError(pol.reason ?? 'Không được phép.'); addLog({ at: Date.now(), task, ok: false, error: 'che-do-kiem-tra' }); return; }
    setBusy(true); setError(null); setAnswer(null);
    try {
      const r = await AI.ask(task, payload);
      setAnswer(r); addLog({ at: Date.now(), task, ok: true, via: r.via });
      return r;
    } catch (e) {
      setError(errorMessage(e)); addLog({ at: Date.now(), task, ok: false, error: (e as { kind?: string }).kind || 'loi' });
    } finally { setBusy(false); }
  };
  return { busy, answer, error, ask };
}

const VIA: Record<string, string> = { cache: 'đã lưu trên máy', mine: 'key cá nhân', school: 'key của trường', 'school-cache': 'đã lưu ở máy chủ trường' };

function Answer({ task, state }: { task: MentorTask; state: ReturnType<typeof useAsk> }) {
  const [rep, setRep] = useState(false);
  const [reason, setReason] = useState<'sai-kien-thuc' | 'lo-dap-an' | 'khong-phu-hop' | 'khac'>('sai-kien-thuc');
  const [note, setNote] = useState('');
  const [sent, setSent] = useState<string | null>(null);
  if (state.error) return <p role="alert" className="rounded-lg border border-destructive/40 bg-card p-3 text-sm text-destructive">{state.error}</p>;
  if (!state.answer) return null;
  return (
    <div className="rounded-xl border bg-card p-4" aria-live="polite">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-primary"><Bot className="size-4" aria-hidden /> AI Sư Phụ</p>
      <AiText text={state.answer.text} />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-2 text-xs text-muted-foreground">
        <span>Trả lời qua {VIA[state.answer.via] ?? state.answer.via}. AI có thể sai — đối chiếu với bài học.</span>
        <Button size="sm" variant="ghost" onClick={() => { setRep(true); setSent(null); }}><Flag /> Báo câu trả lời có vấn đề</Button>
      </div>
      <Modal open={rep} onClose={() => setRep(false)} title="Báo câu trả lời có vấn đề" description="Thầy cô quản trị xem các báo cáo này để chỉnh AI. Không ghi tên, số điện thoại."
        footer={<><Button variant="outline" onClick={() => setRep(false)}>Đóng</Button><Button disabled={!!sent} onClick={async () => { try { await report(task, reason, note); setSent('Đã gửi. Cảm ơn em!'); } catch (e) { setSent('Chưa gửi được: ' + errorMessage(e)); } }}>Gửi</Button></>}>
        <fieldset className="space-y-2 text-sm">
          {([['sai-kien-thuc', 'Giải thích sai kiến thức'], ['lo-dap-an', 'AI nói luôn đáp án'], ['khong-phu-hop', 'Nội dung không phù hợp'], ['khac', 'Lý do khác']] as const).map(([v, l]) => (
            <label key={v} className="flex items-center gap-2"><input type="radio" name="tr-rep" checked={reason === v} onChange={() => setReason(v)} /> {l}</label>
          ))}
          <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} rows={3} placeholder="Ghi chú thêm (không bắt buộc)" className="w-full rounded-md border bg-background p-2" />
          {sent && <p role="status">{sent}</p>}
        </fieldset>
      </Modal>
    </div>
  );
}

function PiiNote({ text }: { text: string }) {
  const n = Mentor.scrubPII(text).removed;
  return <p className={cn('text-xs', n ? 'text-gold' : 'text-muted-foreground')}>{n ? `Đã tự ẩn ${n} thông tin cá nhân trước khi gửi.` : 'Đừng nhập tên, số điện thoại, địa chỉ hay mật khẩu — AI không cần những thông tin đó.'}</p>;
}

function ConceptTab() {
  const st = useAsk('mentorConcept');
  const [topic, setTopic] = useState('');
  const [q, setQ] = useState('');
  return (
    <div className="space-y-4">
      <Panel title="Hỏi kiến thức" icon={BookOpen} description="Hỏi điều em chưa hiểu trong bài. AI Sư Phụ giải thích ngắn, có ví dụ, rồi hỏi lại 1 câu để em tự kiểm tra.">
        <div className="grid gap-3">
          <input value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={120} placeholder="Bài / chủ đề (không bắt buộc), VD: Phần cứng máy tính" className="h-10 rounded-md border bg-background px-3 text-sm" aria-label="Chủ đề" />
          <textarea value={q} onChange={(e) => setQ(e.target.value)} maxLength={300} rows={3} placeholder="VD: RAM và ROM khác nhau thế nào?" className="rounded-md border bg-background p-3 text-sm" aria-label="Câu hỏi" />
          <PiiNote text={q} />
          <Button className="justify-self-start" disabled={st.busy || q.trim().length < 5} onClick={() => st.ask({ topic, question: q })}><Send /> {st.busy ? 'Đang hỏi…' : 'Hỏi AI Sư Phụ'}</Button>
        </div>
      </Panel>
      <Answer task="mentorConcept" state={st} />
    </div>
  );
}

function HintTab() {
  const st = useAsk('mentorHint');
  const [q, setQ] = useState('');
  const [opts, setOpts] = useState('');
  const [attempt, setAttempt] = useState('');
  const [level, setLevel] = useState(1);
  const ask = (lv: number) => { setLevel(lv); st.ask({ question: q, options: opts.split('\n').map((x) => x.trim()).filter(Boolean), attempt, level: lv }); };
  return (
    <div className="space-y-4">
      <Panel title="Gợi ý bài tập" icon={Lightbulb} description="Dán câu hỏi LUYỆN TẬP em đang vướng. AI Sư Phụ chỉ gợi ý từng mức, không nói đáp án — em tự tìm ra mới nhớ lâu.">
        <div className="grid gap-3">
          <textarea value={q} onChange={(e) => setQ(e.target.value)} maxLength={900} rows={3} placeholder="Câu hỏi" className="rounded-md border bg-background p-3 text-sm" aria-label="Câu hỏi bài tập" />
          <textarea value={opts} onChange={(e) => setOpts(e.target.value)} rows={3} placeholder={'Các phương án, mỗi dòng 1 phương án (nếu có)'} className="rounded-md border bg-background p-3 text-sm" aria-label="Các phương án" />
          <input value={attempt} onChange={(e) => setAttempt(e.target.value)} maxLength={300} placeholder="Em đang nghĩ gì? (không bắt buộc)" className="h-10 rounded-md border bg-background px-3 text-sm" aria-label="Suy nghĩ của em" />
          <PiiNote text={q + ' ' + attempt} />
          <div className="flex flex-wrap gap-2">
            {[1, 2, 3].map((lv) => (
              <Button key={lv} variant={lv === 1 ? 'default' : 'outline'} disabled={st.busy || !q.trim() || (lv > 1 && level < lv - 1)} onClick={() => ask(lv)}>
                <Lightbulb /> Gợi ý mức {lv}{lv === 1 ? ' — nhắc kiến thức' : lv === 2 ? ' — cách loại trừ' : ' — phân tích phương án'}
              </Button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Mở lần lượt: dùng mức 1 rồi mới mở mức 2, 3.</p>
        </div>
      </Panel>
      <Answer task="mentorHint" state={st} />
    </div>
  );
}

function CodeTab() {
  const st = useAsk('codeHelp');
  const [lang, setLang] = useState('python');
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [goal, setGoal] = useState('');
  return (
    <div className="space-y-4">
      <Panel title="Hướng dẫn lập trình" icon={Code2} description="Dán đoạn code và thông báo lỗi. AI Sư Phụ chỉ ra chỗ sai, giải thích vì sao và gợi ý cách sửa — không viết lại cả chương trình cho em.">
        <div className="grid gap-3">
          <label className="grid gap-1 text-sm">Ngôn ngữ
            <select value={lang} onChange={(e) => setLang(e.target.value)} className="h-9 w-56 rounded-md border bg-card px-2">{Object.entries(Mentor.LANGS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          </label>
          <input value={goal} onChange={(e) => setGoal(e.target.value)} maxLength={200} placeholder="Chương trình cần làm gì? (không bắt buộc)" className="h-10 rounded-md border bg-background px-3 text-sm" aria-label="Mục tiêu" />
          <textarea value={code} onChange={(e) => setCode(e.target.value)} maxLength={1500} rows={8} spellCheck={false} placeholder="for i in range(3)&#10;    print(i)" className="rounded-md border bg-background p-3 font-mono text-xs" aria-label="Code" />
          <input value={err} onChange={(e) => setErr(e.target.value)} maxLength={300} placeholder="Thông báo lỗi hoặc điều chưa đúng" className="h-10 rounded-md border bg-background px-3 text-sm" aria-label="Thông báo lỗi" />
          <Button className="justify-self-start" disabled={st.busy || code.trim().length < 3} onClick={() => st.ask({ language: lang, code, error: err, goal })}><Send /> {st.busy ? 'Đang phân tích…' : 'Phân tích lỗi'}</Button>
        </div>
      </Panel>
      <Answer task="codeHelp" state={st} />
    </div>
  );
}

function NextTab() {
  const learner = useLearner();
  const catalog = useCatalog();
  const items = useMemo(() => {
    if (catalog.status !== 'ready') return [];
    const courses = catalog.data.courses.map((c) => {
      const s = Learning.courseStatus(c, learner.progress, null);
      const started = c.lessons.some((l) => learner.progress.units[l.id]);
      return { id: c.id, name: c.name, pct: s.pct, started, next: s.next ? { title: ('n' in s.next ? `Bài ${s.next.n}. ` : '') + s.next.title, href: quizHref(s.next.src) } : null };
    });
    let best: Record<string, Record<string, { stars: number }>> = {};
    let ms: Record<string, { score: number }> = {};
    try { best = JSON.parse(localStorage.getItem('tr.challenges.v1') || '{}'); ms = JSON.parse(localStorage.getItem('tr.missions.v1') || '{}'); } catch { /* ignore */ }
    const lv = [['mach-dien', 'Trạm biến áp'], ['phan-phoi', 'Nhà máy điện'], ['du-lieu', 'Phòng điều khiển'], ['bao-qua-tai', 'Tâm bão']];
    const tp = best['thanh-pho-mat-dien'] ?? {};
    const challengeLevels = lv.map(([id, name], i) => ({ id, name: `${name} (Bí cảnh 1)`, stars: tp[id]?.stars ?? 0, unlocked: i === 0 || (tp[lv[i - 1][0]]?.stars ?? 0) > 0, href: `#${trPath('bi-canh/thanh-pho-mat-dien')}` }));
    const missions = [{ id: 'tien-dien', name: 'Tính tiền điện', score: ms['tien-dien']?.score ?? 0, href: `#${trPath('van-tuong-gioi/tien-dien')}` }, { id: 'phan-loai-rac', name: 'Phân loại rác', score: ms['phan-loai-rac']?.score ?? 0, href: `#${trPath('van-tuong-gioi/phan-loai-rac')}` }];
    const due = learner.student ? dueItems(studentBook(learner.student.key)).length : 0;
    return Mentor.suggestNext({ courses, challengeLevels, missions, due });
  }, [catalog, learner]);
  return (
    <Panel title="Gợi ý nhiệm vụ" icon={ListChecks} description="Tính ngay trên máy từ tiến độ của em — không gửi dữ liệu học tập cho AI.">
      {items.length ? (
        <ol className="space-y-2">
          {items.map((s, i) => (
            <li key={i} className="flex items-start gap-3 rounded-lg border p-3">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary/10 font-mono text-sm text-primary">{i + 1}</span>
              <span className="min-w-0 flex-1"><span className="block font-medium">{s.title}</span><span className="block text-sm text-muted-foreground">{s.why}</span></span>
              {s.href && <a href={s.href} className="shrink-0 text-sm text-primary hover:underline">Làm ngay</a>}
            </li>
          ))}
        </ol>
      ) : <p className="text-sm text-muted-foreground">{catalog.status === 'loading' ? 'Đang tính…' : 'Em đã làm hết việc gợi ý được. Tuyệt vời!'}</p>}
      {items.some((s) => s.kind === 'on-tap') && <Link to="/so-tay" className="mt-3 inline-block text-sm text-primary hover:underline">Mở Sổ tay câu sai</Link>}
    </Panel>
  );
}

function TeacherTab() {
  const st = useAsk('rubricReview');
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [crit, setCrit] = useState('Nội dung đúng kiến thức | 4\nTrình bày rõ ràng | 3\nSáng tạo | 3');
  const criteria = crit.split('\n').map((l) => { const [n, m] = l.split('|'); return { name: (n || '').trim(), max: Math.max(1, Math.min(10, Number(m) || 4)) }; }).filter((c) => c.name).slice(0, 8);
  const parsed: RubricResult | null = st.answer ? Mentor.parseRubric(st.answer.text, criteria) : null;
  return (
    <div className="space-y-4">
      <Panel title="Đánh giá sản phẩm theo rubric" icon={ListChecks} description="AI đề xuất điểm từng tiêu chí kèm nhận xét — THẦY CÔ quyết định điểm cuối cùng. Không dán tên học sinh.">
        <div className="grid gap-3">
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="Tên dự án, VD: Áp phích mật khẩu mạnh" className="h-10 rounded-md border bg-background px-3 text-sm" aria-label="Tên dự án" />
          <textarea value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={1500} rows={5} placeholder="Mô tả / nội dung sản phẩm của học sinh" className="rounded-md border bg-background p-3 text-sm" aria-label="Mô tả sản phẩm" />
          <label className="grid gap-1 text-sm">Rubric (mỗi dòng: tiêu chí | điểm tối đa)
            <textarea value={crit} onChange={(e) => setCrit(e.target.value)} rows={4} className="rounded-md border bg-background p-3 font-mono text-xs" />
          </label>
          <PiiNote text={desc} />
          <Button className="justify-self-start" disabled={st.busy || desc.trim().length < 20 || !criteria.length} onClick={() => st.ask({ title, description: desc, criteria })}><Sparkles /> {st.busy ? 'Đang đánh giá…' : 'Gợi ý chấm điểm'}</Button>
        </div>
      </Panel>
      {st.error && <p role="alert" className="rounded-lg border border-destructive/40 bg-card p-3 text-sm text-destructive">{st.error}</p>}
      {st.answer && (parsed ? (
        <Panel title={`Gợi ý: ${parsed.total}/${parsed.max} điểm`} description="Đề xuất của AI — thầy cô xem lại và sửa trước khi ghi điểm.">
          <table className="w-full text-sm"><tbody>{parsed.rows.map((r) => <tr key={r.name} className="border-b last:border-0"><td className="py-2 pr-2">{r.name}</td><td className="py-2 pr-2 text-right font-mono">{r.score}/{r.max}</td><td className="py-2 text-muted-foreground">{r.comment}</td></tr>)}</tbody></table>
          {parsed.overall && <p className="mt-3 text-sm">{parsed.overall}</p>}
        </Panel>
      ) : <Answer task="rubricReview" state={st} />)}
      <Panel title="Hỗ trợ tạo bài tập" icon={BookOpen} description="Soạn câu hỏi trắc nghiệm bằng AI theo chủ đề hoặc đoạn bài học (đã có sẵn).">
        <a href={legacyUrl('ic3-dashboard.html')} className="text-sm text-primary hover:underline">Mở Soạn đề → "Tạo câu hỏi bằng AI"</a>
        <p className="mt-1 text-xs text-muted-foreground">Cần đăng nhập tài khoản giáo viên (dùng key của trường) hoặc key cá nhân.</p>
      </Panel>
    </div>
  );
}

function SettingsTab() {
  const [cfg, setCfg] = useState(AI.config());
  const [key, setKey] = useState('');
  const [model, setModel] = useState(cfg.model);
  const [msg, setMsg] = useState<string | null>(null);
  const [log, setLog] = useState(readLog);
  const save = async () => {
    setMsg('Đang kiểm tra key…');
    try { await AI.testKey(key.trim(), model); saveOwnKey(key.trim(), model); setCfg(AI.config()); setKey(''); setMsg('Đã lưu key trên máy này.'); } catch (e) { setMsg('Key chưa dùng được: ' + errorMessage(e)); }
  };
  return (
    <div className="space-y-4">
      <Panel title="Key AI cá nhân (không bắt buộc)" icon={KeyRound} description="Mặc định AI Sư Phụ dùng key của trường (cất trên máy chủ, không ai thấy được). Có key Gemini riêng thì nhập ở đây: key chỉ lưu trên máy này, gọi thẳng Gemini, không gửi lên máy chủ trường.">
        <p className="text-sm">Hiện tại: {cfg.key ? <Badge tone="green">Có key cá nhân ({cfg.key.slice(0, 4)}…{cfg.key.slice(-3)})</Badge> : <Badge>Dùng key của trường</Badge>}</p>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <input type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder="Dán key Gemini" className="h-10 min-w-0 flex-1 rounded-md border bg-background px-3 text-sm" aria-label="Key Gemini" />
          <select value={model} onChange={(e) => setModel(e.target.value)} className="h-10 rounded-md border bg-card px-2 text-sm" aria-label="Model">{AICore.MODELS.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
          <Button onClick={save} disabled={key.trim().length < 20}><ShieldCheck /> Kiểm tra và lưu</Button>
          {cfg.key && <Button variant="outline" onClick={() => { clearOwnKey(); setCfg(AI.config()); setMsg('Đã xoá key cá nhân.'); }}><Trash2 /> Xoá key</Button>}
        </div>
        {msg && <p className="mt-2 text-sm" role="status">{msg}</p>}
      </Panel>
      <Panel title="Nhật ký trên máy này" description="Chỉ ghi việc, thời điểm và kết quả — không lưu nội dung câu hỏi hay câu trả lời.">
        {log.length ? (
          <ul className="divide-y text-sm">{log.map((l, i) => <li key={i} className="flex justify-between gap-2 py-1.5"><span>{new Date(l.at).toLocaleString('vi-VN')}</span><span className="font-mono text-xs">{l.task}</span><Badge tone={l.ok ? 'green' : 'red'}>{l.ok ? VIA[l.via ?? ''] ?? 'OK' : l.error}</Badge></li>)}</ul>
        ) : <p className="text-sm text-muted-foreground">Chưa có lượt hỏi nào.</p>}
        <Button size="sm" variant="ghost" className="mt-2" onClick={() => setLog(readLog())}>Làm mới</Button>
      </Panel>
    </div>
  );
}

export default function MentorPage() {
  const [tab, setTab] = useState<Tab>('kien-thuc');
  const [mode, setMode] = useState(currentMode);
  useEffect(() => {
    const re = () => setMode(currentMode());
    window.addEventListener('focus', re);
    window.addEventListener('storage', re);
    return () => { window.removeEventListener('focus', re); window.removeEventListener('storage', re); };
  }, []);
  const studentTab = tab === 'kien-thuc' || tab === 'goi-y' || tab === 'lap-trinh';
  return (
    <div className="space-y-5">
      <TrPageHeader title="AI Sư Phụ" plain="Trợ lý học tập" description="Giải thích kiến thức, gợi ý bài tập theo từng bước, hướng dẫn sửa lỗi code, gợi ý việc nên làm tiếp. Sư phụ dẫn đường — em tự bước." />
      {mode === 'test' ? (
        <div role="status" className="flex items-start gap-3 rounded-xl border border-gold bg-card p-4">
          <Lock className="mt-0.5 size-5 shrink-0 text-gold" aria-hidden />
          <div><p className="font-semibold">Chế độ kiểm tra</p><p className="text-sm text-muted-foreground">Máy này đang có bài Kiểm tra chưa nộp ở sảnh. AI Sư Phụ tạm nghỉ (hỏi, gợi ý, code) tới khi em nộp bài. Gợi ý nhiệm vụ vẫn xem được.</p></div>
        </div>
      ) : (
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><Badge tone="green">Chế độ học</Badge> Gợi ý từng bước, không đưa đáp án. Đang làm bài Kiểm tra thì AI tự nghỉ.</p>
      )}
      <Tabs label="AI Sư Phụ" value={tab} onChange={setTab} items={[
        { id: 'kien-thuc', label: 'Hỏi kiến thức' }, { id: 'goi-y', label: 'Gợi ý bài tập' }, { id: 'lap-trinh', label: 'Lập trình' },
        { id: 'nhiem-vu', label: 'Gợi ý nhiệm vụ' }, { id: 'thay-co', label: 'Thầy cô' }, { id: 'cai-dat', label: 'Cài đặt & nhật ký' },
      ]} />
      {studentTab && mode === 'test' ? (
        <Panel title="AI Sư Phụ tạm nghỉ" icon={Lock}><p className="text-sm text-muted-foreground">Nộp bài Kiểm tra ở sảnh xong, quay lại đây để hỏi tiếp nhé.</p></Panel>
      ) : tab === 'kien-thuc' ? <ConceptTab /> : tab === 'goi-y' ? <HintTab /> : tab === 'lap-trinh' ? <CodeTab /> : tab === 'nhiem-vu' ? <NextTab /> : tab === 'thay-co' ? <TeacherTab /> : <SettingsTab />}
    </div>
  );
}
