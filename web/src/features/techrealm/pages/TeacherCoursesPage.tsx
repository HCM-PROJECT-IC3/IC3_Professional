import { useEffect, useMemo, useState } from 'react';
import { Check, Copy, Link2, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useLive } from '../demo/DemoState';
import { CourseTree } from '../learning/components';
import { Learning, classLink, encodeClassCfg, getDraft, setDraft, useCatalog, type ClassCfg, type Course, type CourseCfg, type Link } from '../learning/learning';
import { DataBlock, Segmented } from '../ui/controls';
import { Panel, TrPageHeader } from '../ui/primitives';

/* Quản lý công pháp (giáo viên): cấu hình điều kiện học cho lớp rồi phát LINK. Không lưu máy chủ — giống đề tự soạn
   (?de=): cấu hình nằm trong link, bản nháp giữ trên máy giáo viên. 0 lượt Firebase, không cần đăng nhập.
   Cấu hình chỉ hướng dẫn thứ tự học; EXP/cảnh giới vẫn do máy chủ xác thực nên học sinh sửa link không được lợi gì. */

const EMPTY: ClassCfg = { v: 1, className: '', issuedAt: 0, courses: {} };
type LessonRule = 'default' | 'locked' | 'unlocked';

function LinkEditor({ links, onChange, label }: { links: Link[]; onChange: (l: Link[]) => void; label: string }) {
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const ok = title.trim() && /^https:\/\/\S+$/.test(url.trim());
  return (
    <div className="space-y-1.5">
      {links.map((l, i) => (
        <div key={l.url + i} className="flex items-center gap-2 text-xs">
          <span className="min-w-0 flex-1 truncate">{l.title} — <span className="text-muted-foreground">{l.url}</span></span>
          <Button variant="ghost" size="icon" className="size-7" aria-label={`Xoá ${l.title}`} onClick={() => onChange(links.filter((_, j) => j !== i))}><Trash2 /></Button>
        </div>
      ))}
      {links.length < 5 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={`Tên ${label}`} aria-label={`Tên ${label}`} maxLength={80} className="h-8 w-36 rounded-md border bg-background px-2 text-xs" />
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" aria-label={`Link ${label}`} maxLength={300} className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-xs" />
          <Button size="sm" variant="outline" disabled={!ok} onClick={() => { onChange(links.concat({ title: title.trim(), url: url.trim() })); setTitle(''); setUrl(''); }}><Plus /> Thêm</Button>
        </div>
      )}
    </div>
  );
}

function CourseEditor({ course, cc, onChange }: { course: Course; cc: CourseCfg; onChange: (c: CourseCfg) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const ruleOf = (id: string): LessonRule => (cc.locked.includes(id) ? 'locked' : cc.unlocked.includes(id) ? 'unlocked' : 'default');
  const setRule = (id: string, r: LessonRule) => onChange({
    ...cc,
    locked: r === 'locked' ? [...new Set(cc.locked.concat(id))] : cc.locked.filter((x) => x !== id),
    unlocked: r === 'unlocked' ? [...new Set(cc.unlocked.concat(id))] : cc.unlocked.filter((x) => x !== id),
  });
  const setExtra = (id: string, key: 'videos' | 'docs', links: Link[]) => {
    const cur = cc.extra[id] ?? { videos: [], docs: [] };
    onChange({ ...cc, extra: { ...cc.extra, [id]: { ...cur, [key]: links } } });
  };
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <fieldset>
          <legend className="text-sm font-medium">Thứ tự học</legend>
          <div className="mt-2">
            <Segmented label="Thứ tự học" value={cc.mode} onChange={(m) => onChange({ ...cc, mode: m })} items={[{ id: 'sequential', label: 'Tuần tự (đạt bài trước)' }, { id: 'free', label: 'Tự do' }]} />
          </div>
        </fieldset>
        <label className="grid gap-1 text-sm">
          <span className="flex justify-between font-medium">Điểm đạt <span className="font-mono">{cc.minScore}</span></span>
          <input type="range" min={50} max={100} step={5} value={cc.minScore} onChange={(e) => onChange({ ...cc, minScore: Number(e.target.value) })} className="accent-[var(--primary)]" />
        </label>
      </div>
      {course.gates.length > 0 && (
        <fieldset>
          <legend className="text-sm font-medium">Bài kiểm tra mở sau bài</legend>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {course.gates.map((g) => (
              <li key={g.id} className="flex items-center gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{g.title}</span>
                <select aria-label={`${g.title} mở sau bài`} value={cc.gateAfter[g.id] ?? g.requires[0]} onChange={(e) => onChange({ ...cc, gateAfter: { ...cc.gateAfter, [g.id]: e.target.value } })} className="h-8 rounded-md border bg-card px-1 text-xs">
                  {course.lessons.map((l) => <option key={l.id} value={l.id}>Bài {l.n}</option>)}
                </select>
              </li>
            ))}
          </ul>
        </fieldset>
      )}
      <fieldset>
        <legend className="text-sm font-medium">Từng bài: khoá / mở sẵn, thêm video và tài liệu</legend>
        <ul className="mt-2 divide-y rounded-lg border">
          {course.lessons.map((l) => {
            const extra = cc.extra[l.id] ?? { videos: [], docs: [] };
            const n = extra.videos.length + extra.docs.length;
            return (
              <li key={l.id} className="p-2">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">{course.source ? `Bài ${l.n}. ` : ''}{l.title}</span>
                  {n > 0 && <Badge tone="blue">{n} học liệu thêm</Badge>}
                  <select aria-label={`Quy tắc ${l.title}`} value={ruleOf(l.id)} onChange={(e) => setRule(l.id, e.target.value as LessonRule)} className="h-8 rounded-md border bg-card px-1 text-xs">
                    <option value="default">Theo thứ tự</option>
                    <option value="unlocked">Mở sẵn</option>
                    <option value="locked">Khoá</option>
                  </select>
                  <Button size="sm" variant="ghost" onClick={() => setOpen(open === l.id ? null : l.id)} aria-expanded={open === l.id}>Học liệu</Button>
                </div>
                {open === l.id && (
                  <div className="mt-2 grid gap-3 rounded-md bg-muted p-2 sm:grid-cols-2">
                    <div><p className="mb-1 text-xs font-medium">Video</p><LinkEditor label="video" links={extra.videos} onChange={(v) => setExtra(l.id, 'videos', v)} /></div>
                    <div><p className="mb-1 text-xs font-medium">Tài liệu thêm</p><LinkEditor label="tài liệu" links={extra.docs} onChange={(v) => setExtra(l.id, 'docs', v)} /></div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </fieldset>
    </div>
  );
}

export function TeacherCoursesPage() {
  const catalog = useCatalog();
  const state = useLive(catalog, (d) => d.courses.length === 0);
  const [draft, setDraftState] = useState<ClassCfg>(() => getDraft() ?? EMPTY);
  const [courseId, setCourseId] = useState('ic3-1');
  const [link, setLink] = useState('');
  const [copied, setCopied] = useState(false);
  useEffect(() => { setDraft(draft); setLink(''); setCopied(false); }, [draft]);
  const update = (d: ClassCfg) => setDraftState(Learning.sanitizeClassConfig(d));
  const emptyProgress = useMemo(() => ({ units: {} }), []);

  const make = async () => {
    const code = await encodeClassCfg({ ...draft, issuedAt: Date.now() });
    setLink(classLink(code));
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); } catch { setCopied(false); }
  };

  return (
    <div className="space-y-5">
      <TrPageHeader
        title="Quản lý công pháp"
        plain="Dành cho thầy cô"
        description="Đặt điều kiện học cho lớp: thứ tự mở bài, điểm đạt, khoá bài, thêm video và tài liệu. Xong bấm Tạo link và gửi cho lớp — không cần tài khoản, không lưu lên máy chủ."
      />
      <DataBlock state={state} loadingRows={6} empty={{ title: 'Chưa có công pháp' }}>
        {(cat) => {
          const course = cat.courses.find((c) => c.id === courseId) ?? cat.courses[0];
          const cc = draft.courses[course.id] ?? Learning.DEFAULT_COURSE_CFG;
          const configured = Object.keys(draft.courses);
          const preview = Learning.courseStatus(course, emptyProgress, draft);
          return (
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
              <div className="min-w-0 space-y-5">
                <Panel title="Lớp và công pháp">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="grid gap-1 text-sm">Tên lớp
                      <input value={draft.className} maxLength={40} onChange={(e) => update({ ...draft, className: e.target.value })} placeholder="VD: 6A1" className="h-9 rounded-md border bg-background px-2" />
                    </label>
                    <label className="grid min-w-0 gap-1 text-sm">Công pháp đang chỉnh
                      <select value={course.id} onChange={(e) => setCourseId(e.target.value)} className="h-9 w-full min-w-0 rounded-md border bg-card px-2">
                        {cat.domains.filter((d) => d.courseIds.length).map((d) => (
                          <optgroup key={d.id} label={d.name}>
                            {d.courseIds.map((id) => { const c = cat.courses.find((x) => x.id === id)!; return <option key={id} value={id}>{c.plain}{configured.includes(id) ? ' ✓' : ''}</option>; })}
                          </optgroup>
                        ))}
                      </select>
                    </label>
                  </div>
                </Panel>
                <Panel title={course.name} description={`${course.plain} · ${course.lessons.length} bài · ${course.gates.length} kiểm tra`}
                  action={configured.includes(course.id) ? <Button size="sm" variant="ghost" onClick={() => { const c = { ...draft.courses }; delete c[course.id]; update({ ...draft, courses: c }); }}><RotateCcw /> Về mặc định</Button> : undefined}>
                  <CourseEditor course={course} cc={cc} onChange={(c) => update({ ...draft, courses: { ...draft.courses, [course.id]: c } })} />
                </Panel>
              </div>
              <div className="min-w-0 space-y-5">
                <Panel variant="feature" title="Link cho lớp" icon={Link2} description={configured.length ? `${configured.length} công pháp đã cấu hình.` : 'Chưa cấu hình công pháp nào — học sinh dùng thứ tự mặc định.'}>
                  <Button className="w-full" onClick={make} disabled={!configured.length}><Link2 /> Tạo link</Button>
                  {link && (
                    <div className="mt-3 space-y-2">
                      <textarea readOnly value={link} rows={3} aria-label="Link lớp học" className="w-full rounded-md border bg-background p-2 font-mono text-[11px]" onFocus={(e) => e.currentTarget.select()} />
                      <Button variant="outline" size="sm" className="w-full" onClick={copy}>{copied ? <><Check /> Đã chép</> : <><Copy /> Chép link</>}</Button>
                      <p className="text-xs text-muted-foreground">Học sinh mở link 1 lần trên máy, lộ trình được nhớ trên máy đó. Sửa cấu hình thì tạo link mới.</p>
                    </div>
                  )}
                </Panel>
                <Panel title="Xem trước (học sinh mới)">
                  <div className="max-h-[32rem] overflow-y-auto pr-1">
                    <CourseTree course={course} status={preview} cfg={draft} onPick={() => {}} />
                  </div>
                </Panel>
              </div>
            </div>
          );
        }}
      </DataBlock>
    </div>
  );
}
