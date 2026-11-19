import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { BookOpen, CheckCircle2, ClipboardCheck, FileText, Lock, PlayCircle, Sparkles, Swords, Users, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { useStudent } from '@/features/student/useStudent';
import { studentRecords } from '@/features/student/progress';
import { cn, legacyUrl } from '@/lib/utils';
import { Drawer } from '../ui/overlay';
import { Meter } from '../ui/primitives';
import {
  Learning, decodeClassCfg, getClassCfg, quizHref, setClassCfg,
  type ClassCfg, type Course, type CourseStatus, type Gate, type Lesson, type NodeState, type Progress,
} from './learning';

/* ── Học sinh đang học trên máy này (máy trường dùng chung) + tiến độ của em đó ── */
export function useLearner() {
  const { students, student, pick, version } = useStudent();
  const progress = useMemo<Progress>(() => Learning.progressOf(student ? studentRecords(student.key) : []), [student, version]);
  const records = useMemo(() => (student ? studentRecords(student.key) : []), [student, version]);
  return { students, student, pick, progress, records };
}

export function LearnerBar({ students, student, pick }: ReturnType<typeof useLearner>) {
  if (!students.length) {
    return (
      <p className="rounded-lg border border-dashed bg-card px-3 py-2 text-sm text-muted-foreground">
        Máy này chưa có bài làm nào. Em vào luyện một bài ở sảnh, tiến độ sẽ hiện ở đây (lưu trên máy, không cần tài khoản).
      </p>
    );
  }
  return (
    <label className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted-foreground">Tiến độ của</span>
      <select value={student?.key} onChange={(e) => pick(e.target.value)} className="h-9 max-w-full rounded-md border bg-card px-2">
        {students.map((s) => (
          <option key={s.key} value={s.key}>{s.name}{s.cls ? ` · ${s.cls}` : ''}{s.school ? ` · ${s.school}` : ''}</option>
        ))}
      </select>
    </label>
  );
}

/* ── Cấu hình lớp: nhận từ link ?lop=…, lưu trên máy, bỏ được ── */
export function useClassConfig() {
  const [params, setParams] = useSearchParams();
  const [cfg, setCfg] = useState<ClassCfg | null>(getClassCfg);
  const [linkError, setLinkError] = useState(false);
  const code = params.get('lop');
  useEffect(() => {
    if (!code) return;
    let alive = true;
    decodeClassCfg(code).then((c) => {
      if (!alive) return;
      if (c) { setClassCfg(c); setCfg(c); setLinkError(false); } else setLinkError(true);
      params.delete('lop');
      setParams(params, { replace: true });
    });
    return () => { alive = false; };
  }, [code, params, setParams]);
  const clear = () => { setClassCfg(null); setCfg(null); };
  return { cfg, clear, linkError };
}

export function ClassBanner({ cfg, clear, linkError }: ReturnType<typeof useClassConfig>) {
  if (linkError) return <p role="alert" className="rounded-lg border border-destructive/40 bg-card px-3 py-2 text-sm text-destructive">Link lớp học bị hỏng hoặc chép thiếu. Em xin thầy cô gửi lại link.</p>;
  if (!cfg) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-accent px-3 py-2 text-sm" role="status">
      <Users className="size-4 text-primary" aria-hidden />
      <span className="min-w-0 flex-1">Đang học theo lộ trình {cfg.className ? <>của lớp <b>{cfg.className}</b></> : 'thầy cô gửi'} ({Object.keys(cfg.courses).length} công pháp).</span>
      <Button variant="ghost" size="sm" onClick={clear}><X /> Bỏ lộ trình lớp</Button>
    </div>
  );
}

/* ── Cây công pháp ──
   Khoá học là chuỗi bài; bài kiểm tra là "ải" chen vào đúng sau bài nó yêu cầu. Chia tầng 7 bài cho dễ nhìn. */
type Node = { kind: 'lesson'; node: Lesson } | { kind: 'gate'; node: Gate };
function pathOf(course: Course, cfg: ClassCfg | null): Node[] {
  const after = Learning.courseCfg(cfg, course.id).gateAfter;
  const out: Node[] = [];
  course.lessons.forEach((l) => {
    out.push({ kind: 'lesson', node: l });
    course.gates.filter((g) => (after[g.id] || g.requires[0]) === l.id).forEach((g) => out.push({ kind: 'gate', node: g }));
  });
  return out;
}

const STATE_ICON = { done: CheckCircle2, available: PlayCircle, locked: Lock } as const;
const STATE_LABEL = { done: 'Đã đạt', available: 'Đang mở', locked: 'Chưa mở' } as const;

export function CourseTree({ course, status, cfg, onPick, selected }: { course: Course; status: CourseStatus; cfg: ClassCfg | null; onPick: (n: Node) => void; selected?: string }) {
  const nodes = pathOf(course, cfg);
  const tiers: Node[][] = [];
  let lessonCount = 0;
  nodes.forEach((n) => {
    if (n.kind === 'lesson' && lessonCount % 7 === 0) tiers.push([]);
    if (n.kind === 'lesson') lessonCount++;
    tiers[tiers.length - 1].push(n);
  });
  return (
    <ol className="space-y-5" aria-label={`Cây công pháp ${course.name}`}>
      {tiers.map((tier, ti) => {
        const lessons = tier.filter((n) => n.kind === 'lesson');
        const first = (lessons[0]?.node as Lesson | undefined)?.n;
        const last = (lessons[lessons.length - 1]?.node as Lesson | undefined)?.n;
        const done = tier.filter((n) => status.states[n.node.id]?.state === 'done').length;
        return (
          <li key={ti}>
            <p className="mb-2 flex items-center justify-between text-xs font-medium text-muted-foreground">
              <span className="uppercase tracking-wide">Tầng {ti + 1}{course.source && first ? ` · bài ${first}–${last}` : ''}</span>
              <span className="font-mono tabular-nums">{done}/{tier.length}</span>
            </p>
            <ol className="relative ml-3 space-y-1.5 border-l-2 pl-4">
              {tier.map((n) => {
                const s: NodeState = status.states[n.node.id] ?? { state: 'locked' };
                const Icon = n.kind === 'gate' ? Swords : STATE_ICON[s.state];
                const label = n.kind === 'lesson' ? `${course.source ? `Bài ${(n.node as Lesson).n}. ` : ''}${n.node.title}` : n.node.title;
                return (
                  <li key={n.node.id} className="relative">
                    <span className={cn('absolute -left-[23px] top-3 size-2.5 rounded-full border-2 border-card', s.state === 'done' ? 'bg-el-moc' : s.state === 'available' ? 'bg-primary' : 'bg-muted-foreground/40')} aria-hidden />
                    <button
                      type="button"
                      onClick={() => onPick(n)}
                      aria-label={`${label} — ${STATE_LABEL[s.state]}${s.best != null ? `, điểm cao nhất ${s.best}` : ''}`}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-lg border bg-card px-3 py-2 text-left text-sm transition-colors hover:bg-muted',
                        n.kind === 'gate' && 'border-violet/50',
                        s.state === 'locked' && 'text-muted-foreground',
                        selected === n.node.id && 'border-primary',
                      )}
                    >
                      <Icon className={cn('size-4 shrink-0', s.state === 'done' ? 'text-el-moc' : n.kind === 'gate' ? 'text-violet' : s.state === 'available' ? 'text-primary' : '')} aria-hidden />
                      <span className="min-w-0 flex-1 truncate">{label}</span>
                      {n.kind === 'gate' && <Badge tone="neutral">Kiểm tra</Badge>}
                      {s.best != null && <span className="font-mono text-xs tabular-nums">{s.best}%</span>}
                      {s.reason === 'teacher' && <span className="text-[11px]">thầy cô khoá</span>}
                    </button>
                  </li>
                );
              })}
            </ol>
          </li>
        );
      })}
    </ol>
  );
}

const fmtTime = (sec: number) => (sec >= 60 ? `${Math.round(sec / 60)} phút` : `${sec} giây`);

/* ── Chi tiết 1 bài: tài liệu, video, thực hành, kiểm tra ── */
export function LessonDrawer({ course, pick, status, progress, cfg, onClose }: {
  course: Course; pick: Node | null; status: CourseStatus; progress: Progress; cfg: ClassCfg | null; onClose: () => void;
}) {
  if (!pick) return null;
  const n = pick.node;
  const s: NodeState = status.states[n.id] ?? { state: 'locked' };
  const p = progress.units[n.id];
  const ccfg = Learning.courseCfg(cfg, course.id);
  const extra = ccfg.extra[n.id] ?? { videos: [], docs: [] };
  const lesson = pick.kind === 'lesson' ? (pick.node as Lesson) : null;
  const docs = (lesson?.docs ?? []).concat(extra.docs);
  const videos = (lesson?.videos ?? []).concat(extra.videos);
  const missing = (s.missing ?? []).map((id) => course.lessons.find((l) => l.id === id)).filter(Boolean) as Lesson[];
  return (
    <Drawer
      open
      onClose={onClose}
      title={lesson ? `${course.source ? `Bài ${lesson.n}. ` : ''}${lesson.title}` : n.title}
      description={`${course.name} · ${pick.kind === 'gate' ? 'Bài kiểm tra' : 'Bài học'} · ${n.questions} câu`}
      footer={
        s.state === 'locked' ? (
          <Button disabled><Lock /> Chưa mở</Button>
        ) : (
          <a href={quizHref(n.src)} className={buttonVariants()}><BookOpen /> {pick.kind === 'gate' ? 'Vào kiểm tra' : s.state === 'done' ? 'Luyện lại' : 'Vào luyện'}</a>
        )
      }
    >
      <div className="space-y-5 text-sm">
        <section>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={s.state === 'done' ? 'green' : s.state === 'available' ? 'blue' : 'neutral'}>{STATE_LABEL[s.state]}</Badge>
            <span className="text-muted-foreground">Điểm đạt: {ccfg.minScore}</span>
          </div>
          {s.state === 'locked' && s.reason === 'teacher' && <p className="mt-2 text-muted-foreground">Thầy cô đang khoá bài này cho lớp.</p>}
          {s.state === 'locked' && missing.length > 0 && <p className="mt-2 text-muted-foreground">Cần đạt trước: {missing.map((m) => `Bài ${m.n}`).join(', ')}.</p>}
          {p ? (
            <dl className="mt-3 grid grid-cols-3 gap-2">
              <div className="rounded-md bg-muted p-2"><dt className="text-[11px] text-muted-foreground">Cao nhất</dt><dd className="font-mono font-semibold">{p.best}%</dd></div>
              <div className="rounded-md bg-muted p-2"><dt className="text-[11px] text-muted-foreground">Số lần</dt><dd className="font-mono font-semibold">{p.attempts}</dd></div>
              <div className="rounded-md bg-muted p-2"><dt className="text-[11px] text-muted-foreground">Thời gian</dt><dd className="font-mono font-semibold">{fmtTime(p.timeSec)}</dd></div>
            </dl>
          ) : (
            <p className="mt-2 text-muted-foreground">Em chưa làm bài này.</p>
          )}
          {s.state !== 'locked' && <Meter className="mt-3" label="Điểm cao nhất so với điểm đạt" value={Math.min(p?.best ?? 0, ccfg.minScore)} max={ccfg.minScore} showValue={`${p?.best ?? 0}/${ccfg.minScore}`} tone={s.state === 'done' ? 'moc' : 'primary'} size="sm" />}
        </section>

        <section>
          <h3 className="flex items-center gap-2 font-medium"><FileText className="size-4 text-muted-foreground" aria-hidden /> Tài liệu</h3>
          {docs.length ? (
            <ul className="mt-2 space-y-1">{docs.map((d) => <li key={d.url}><a href={d.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{d.title}</a>{d.kind && <span className="ml-1 text-xs text-muted-foreground">({d.kind})</span>}</li>)}</ul>
          ) : <p className="mt-1 text-muted-foreground">Chưa có tài liệu cho bài này.</p>}
        </section>
        <section>
          <h3 className="flex items-center gap-2 font-medium"><PlayCircle className="size-4 text-muted-foreground" aria-hidden /> Video</h3>
          {videos.length ? (
            <ul className="mt-2 space-y-1">{videos.map((v) => <li key={v.url}><a href={v.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{v.title}</a></li>)}</ul>
          ) : <p className="mt-1 text-muted-foreground">Chưa có video. Thầy cô có thể thêm trong Quản lý công pháp.</p>}
        </section>
        <section>
          <h3 className="flex items-center gap-2 font-medium"><Sparkles className="size-4 text-muted-foreground" aria-hidden /> Thực hành</h3>
          <ul className="mt-2 space-y-1">
            <li>Làm {n.questions} câu ở sảnh — chọn <b>Ôn luyện</b> để xem giải thích từng câu.</li>
            {(lesson?.practice ?? []).map((x) => <li key={x.page}><a href={legacyUrl(x.page)} className="text-primary hover:underline">{x.title}</a></li>)}
          </ul>
        </section>
        <section className="rounded-lg border p-3">
          <h3 className="flex items-center gap-2 font-medium"><ClipboardCheck className="size-4 text-muted-foreground" aria-hidden /> Kiểm tra và công huân</h3>
          <p className="mt-1 text-muted-foreground">
            Chọn chế độ <b>Kiểm tra</b> ở sảnh (có đếm giờ). Bài Kiểm tra được máy chủ chấm lại; khi lớp em bật công huân, đạt từ
            70 điểm sẽ được cộng công huân. Điểm luyện tập chỉ tính tu vi trên máy.
          </p>
        </section>
      </div>
    </Drawer>
  );
}

export type { Node as TreeNode };
