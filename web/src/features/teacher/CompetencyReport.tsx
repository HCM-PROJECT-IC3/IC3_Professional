import '@legacy/techrealm/learning-core.js';
import '@legacy/techrealm/analytics-core.js';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { AlertTriangle, ArrowLeft, Download, Printer, RefreshCw, Target, Users, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatCard } from '@/components/shared/StatCard';
import { EmptyState, ErrorState, LoadingState } from '@/components/shared/States';
import { useStaff } from '@/features/auth/StaffGate';
import { ColdStart, hasLocalRoster, teacherRosterKeys } from '@/features/staff/ColdStart';
import { errorText, fmtTime } from '@/features/staff/shared';
import { useCatalog, type Catalog } from '@/features/techrealm/learning/learning';
import { cn, legacyUrl } from '@/lib/utils';
import { need, type TeacherData } from '@/services/legacy/types';

/* Báo cáo năng lực học viên & lớp học (Prompt 07 §2, §5).
   Dữ liệu: EduTeacherData.loadAll() — CÙNG hàm, CÙNG bản đệm với "Lớp học của tôi" và teacher-dashboard.html
   (đã mở trang kia thì 0 lượt đọc thêm). Tính toán: js/techrealm/analytics-core.js trên máy. */

const ELEMENT = { kim: 'Kim · Công nghệ', moc: 'Mộc · Sáng tạo', thuy: 'Thủy · Giao tiếp', hoa: 'Hỏa · An toàn', tho: 'Thổ · Công dân số' } as const;
type ElementKey = keyof typeof ELEMENT;
interface CourseRow { id: string; name: string; plain: string; domain: string; pct: number; lessonsDone: number; lessons: number; tests: { id: string; title: string; best: number; passed: boolean }[]; gaps: { id: string; title: string; best: number | null }[]; next: { id: string; title: string } | null }
interface StudentRow { key: string; name: string; cls: string; school: string; attempts: number; avg: number | null; best: number | null; lastAt: number | null; idleDays: number | null; courses: CourseRow[]; domainPct: Record<string, number>; topics: { topic: number; name: string; avg: number; n: number }[]; elements: Partial<Record<ElementKey, number>>; risk: string[]; history: { at: number; testName: string; score: number }[] }
interface Report { students: StudentRow[]; courses: { id: string; name: string; plain: string; students: number; avgPct: number }[]; hardest: { id: string; title: string; avg: number; students: number; below: number }[]; domains: { id: string; name: string; students: number; avgPct: number }[]; elements: { element: ElementKey; students: number; avg: number | null }[]; summary: { students: number; withResults: number; active7: number; avg: number | null; atRisk: number } }
interface AnalyticsApi { classReport(i: { results: unknown[]; students: unknown[]; catalog: Catalog; meta: unknown; now: number }): Report; toCsv(r: Report): string }
const Analytics = (window as unknown as { EduClassAnalytics: AnalyticsApi }).EduClassAnalytics;

let metaCache: Promise<unknown> | null = null;
const loadMeta = () => (metaCache ??= fetch(legacyUrl('data/ic3/meta.json')).then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).catch((e) => { metaCache = null; throw e; }));

function Bar({ value, label }: { value: number | null; label: string }) {
  const v = value ?? 0;
  return (
    <div className="grid grid-cols-[9rem_minmax(0,1fr)_2.5rem] items-center gap-2 text-sm">
      <span className="truncate">{label}</span>
      <span className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={label} aria-valuenow={v} aria-valuemin={0} aria-valuemax={100}><span className={cn('block h-full rounded-full', v >= 70 ? 'bg-step-2' : v >= 50 ? 'bg-primary' : 'bg-destructive')} style={{ width: `${v}%` }} /></span>
      <span className="text-right font-mono text-xs tabular-nums">{value ?? '—'}</span>
    </div>
  );
}

function StudentPanel({ s, catalog, onClose }: { s: StudentRow; catalog: Catalog; onClose: () => void }) {
  const domainName = (id: string) => catalog.domains.find((d) => d.id === id)?.name ?? id;
  const missing = s.courses.flatMap((c) => c.gaps.map((g) => `${c.plain}: ${g.title}`).concat(c.next ? [`${c.plain}: học tiếp ${c.next.title}`] : []));
  return (
    <Card className="space-y-5 p-5" role="region" aria-label={`Hồ sơ năng lực ${s.name}`}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold">{s.name}</h2>
          <p className="text-sm text-muted-foreground">{s.cls}{s.school ? ` · ${s.school}` : ''} · {s.attempts} bài nộp{s.lastAt ? ` · lần cuối ${fmtTime(s.lastAt)}` : ''}</p>
          {s.risk.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{s.risk.map((r) => <Badge key={r} tone="red">{r}</Badge>)}</div>}
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Đóng hồ sơ"><X /></Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="rounded-md bg-muted p-3"><p className="text-xs text-muted-foreground">Điểm trung bình</p><p className="font-mono text-lg font-semibold">{s.avg ?? '—'}</p></div>
        <div className="rounded-md bg-muted p-3"><p className="text-xs text-muted-foreground">Cao nhất</p><p className="font-mono text-lg font-semibold">{s.best ?? '—'}</p></div>
        <div className="rounded-md bg-muted p-3"><p className="text-xs text-muted-foreground">Tổng EXP · Cảnh giới</p><p className="text-sm">Chưa bật</p><p className="text-[11px] text-muted-foreground">Cần mã học tập (GĐ4)</p></div>
        <div className="rounded-md bg-muted p-3"><p className="text-xs text-muted-foreground">Sản phẩm đã tạo</p><p className="text-sm">Chưa có dữ liệu</p><p className="text-[11px] text-muted-foreground">Bách Công Phường (GĐ7)</p></div>
      </div>
      <section>
        <h3 className="text-sm font-semibold">Tỷ lệ hoàn thành bài học</h3>
        <div className="mt-2 space-y-1.5">{s.courses.length ? s.courses.map((c) => <Bar key={c.id} label={`${c.plain} (${c.lessonsDone}/${c.lessons})`} value={c.pct} />) : <p className="text-sm text-muted-foreground">Chưa làm bài nào thuộc công pháp.</p>}</div>
      </section>
      <section>
        <h3 className="text-sm font-semibold">Kết quả kiểm tra</h3>
        {s.courses.some((c) => c.tests.length) ? (
          <ul className="mt-2 space-y-1 text-sm">{s.courses.flatMap((c) => c.tests.map((t) => <li key={t.id} className="flex justify-between gap-2"><span className="min-w-0 truncate">{c.plain} · {t.title}</span><Badge tone={t.passed ? 'green' : 'red'}>{t.best}</Badge></li>))}</ul>
        ) : <p className="mt-1 text-sm text-muted-foreground">Chưa làm bài kiểm tra định kỳ nào.</p>}
      </section>
      <section className="grid gap-5 md:grid-cols-2">
        <div>
          <h3 className="text-sm font-semibold">Năng lực theo lĩnh vực</h3>
          <div className="mt-2 space-y-1.5">{Object.keys(s.domainPct).length ? Object.entries(s.domainPct).map(([d, v]) => <Bar key={d} label={domainName(d)} value={v} />) : <p className="text-sm text-muted-foreground">Chưa có.</p>}</div>
        </div>
        <div>
          <h3 className="text-sm font-semibold">Năng lực theo chủ đề IC3 (linh căn)</h3>
          <div className="mt-2 space-y-1.5">{s.topics.length ? (Object.keys(ELEMENT) as ElementKey[]).map((e) => <Bar key={e} label={ELEMENT[e]} value={s.elements[e] ?? null} />) : <p className="text-sm text-muted-foreground">Chưa làm bài theo chủ đề (1.–7.).</p>}</div>
        </div>
      </section>
      <section>
        <h3 className="flex items-center gap-1.5 text-sm font-semibold"><Target className="size-4" aria-hidden /> Nhiệm vụ còn thiếu</h3>
        {missing.length ? <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm">{missing.slice(0, 12).map((m) => <li key={m}>{m}</li>)}</ul> : <p className="mt-1 text-sm text-muted-foreground">Không có lỗ hổng.</p>}
      </section>
      <section>
        <h3 className="text-sm font-semibold">Lịch sử hoạt động (20 bài gần nhất)</h3>
        {s.history.length ? <ul className="mt-2 divide-y text-sm">{s.history.map((h, i) => <li key={i} className="flex items-center justify-between gap-2 py-1.5"><span className="min-w-0 truncate">{h.testName}</span><span className="shrink-0 text-xs text-muted-foreground">{fmtTime(h.at)}</span><span className="w-10 shrink-0 text-right font-mono">{h.score}</span></li>)}</ul> : <p className="mt-1 text-sm text-muted-foreground">Chưa có bài nộp.</p>}
      </section>
    </Card>
  );
}

export default function CompetencyReport() {
  const { profile } = useStaff();
  const catalog = useCatalog();
  const [data, setData] = useState<TeacherData | null>(null);
  const [meta, setMeta] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [cls, setCls] = useState('');
  const [pick, setPick] = useState<string | null>(null);
  const [onlyRisk, setOnlyRisk] = useState(false);
  const load = useCallback(async (forceRefresh = false) => {
    setError(null);
    try {
      const [d, m] = await Promise.all([need(window.EduTeacherData, 'EduTeacherData').loadAll(profile, { forceRefresh }), loadMeta()]);
      setData(d); setMeta(m);
    } catch (e) { setError(errorText(e)); }
  }, [profile]);
  const [gate, setGate] = useState<'checking' | 'cold' | 'go'>('checking');
  useEffect(() => {
    let alive = true;
    const noSchools = profile.role !== 'admin' && !(profile.schools || []).filter(Boolean).length;
    (noSchools ? Promise.resolve(true) : hasLocalRoster(teacherRosterKeys(profile))).then((warm) => { if (!alive) return; setGate(warm ? 'go' : 'cold'); if (warm) load(); });
    return () => { alive = false; };
  }, [load, profile]);

  const report = useMemo(() => {
    if (!data || !meta || catalog.status !== 'ready') return null;
    const results = data.results.filter((r) => !cls || r.studentClass === cls);
    const students = data.students.filter((s) => !cls || s.className === cls);
    return Analytics.classReport({ results, students, catalog: catalog.data, meta, now: Date.now() });
  }, [data, meta, catalog, cls]);
  const classes = useMemo(() => [...new Set((data?.students ?? []).map((s) => s.className).filter(Boolean) as string[])].sort(), [data]);

  const header = (
    <PageHeader
      title="Năng lực học viên"
      description="Hồ sơ năng lực từng học sinh và báo cáo lớp, tính từ bài các em đã nộp — cùng dữ liệu với Lớp học của tôi."
      actions={<>
        <Link to="/giao-vien" className={buttonVariants({ variant: 'outline', size: 'sm' })}><ArrowLeft /> Lớp học của tôi</Link>
        {report && <Button variant="outline" size="sm" onClick={() => load(true)}><RefreshCw /> Làm mới</Button>}
      </>}
    />
  );
  if (gate === 'cold') return <div className="space-y-6">{header}<ColdStart kind={profile.role === 'admin' ? 'admin' : 'teacher'} fullPage="teacher-dashboard.html" onLoad={() => { setGate('go'); load(); }} /></div>;
  if (error && !report) return <div className="space-y-6">{header}<Card><ErrorState description={error} onRetry={() => load()} /></Card></div>;
  if (catalog.status === 'error') return <div className="space-y-6">{header}<Card><ErrorState onRetry={catalog.retry} /></Card></div>;
  if (!report || catalog.status !== 'ready') return <div className="space-y-6">{header}<Card className="p-5"><LoadingState rows={5} /></Card></div>;

  const shown = report.students.filter((s) => !onlyRisk || s.risk.length);
  const picked = report.students.find((s) => s.key === pick);
  const download = () => {
    const url = URL.createObjectURL(new Blob([Analytics.toCsv(report)], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `bao-cao-nang-luc${cls ? '-' + cls : ''}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="space-y-6">
      {header}
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <label className="flex items-center gap-2 text-sm">Lớp
          <select value={cls} onChange={(e) => { setCls(e.target.value); setPick(null); }} className="h-9 rounded-md border bg-card px-2"><option value="">Tất cả lớp</option>{classes.map((c) => <option key={c} value={c}>{c}</option>)}</select>
        </label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={onlyRisk} onChange={(e) => setOnlyRisk(e.target.checked)} /> Chỉ học sinh cần chú ý</label>
        <span className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={download}><Download /> Xuất CSV</Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}><Printer /> In báo cáo</Button>
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-5">
        <StatCard label="Học sinh" value={report.summary.students} />
        <StatCard label="Đã nộp bài" value={report.summary.withResults} />
        <StatCard label="Hoạt động 7 ngày" value={report.summary.active7} />
        <StatCard label="Điểm TB lớp" value={report.summary.avg ?? '—'} />
        <StatCard label="Cần chú ý" value={report.summary.atRisk} />
      </div>
      {report.summary.students === 0 ? <Card><EmptyState title="Chưa có học sinh" description="Danh sách học sinh theo lớp anh/chị dạy sẽ hiện ở đây." /></Card> : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="min-w-0 space-y-6">
            {picked && <StudentPanel s={picked} catalog={catalog.data} onClose={() => setPick(null)} />}
            <Card className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead className="border-b text-left text-xs text-muted-foreground"><tr><th className="p-3">Học sinh</th><th className="p-3">Lớp</th><th className="p-3 text-right">Bài nộp</th><th className="p-3 text-right">Điểm TB</th><th className="p-3">Công pháp chính</th><th className="p-3 text-right">Còn thiếu</th><th className="p-3">Cần chú ý</th></tr></thead>
                <tbody>
                  {shown.map((s) => {
                    const main = s.courses.slice().sort((a, b) => b.lessonsDone - a.lessonsDone)[0];
                    return (
                      <tr key={s.key} className={cn('cursor-pointer border-b last:border-0 hover:bg-muted', pick === s.key && 'bg-accent')} onClick={() => setPick(s.key)}>
                        <td className="p-3"><button type="button" className="text-left font-medium hover:underline" onClick={() => setPick(s.key)}>{s.name}</button></td>
                        <td className="p-3">{s.cls}</td>
                        <td className="p-3 text-right font-mono">{s.attempts}</td>
                        <td className="p-3 text-right font-mono">{s.avg ?? '—'}</td>
                        <td className="p-3">{main ? `${main.plain} · ${main.pct}%` : '—'}</td>
                        <td className="p-3 text-right font-mono">{main ? main.gaps.length : '—'}</td>
                        <td className="p-3">{s.risk.length ? <span className="inline-flex items-center gap-1 text-destructive"><AlertTriangle className="size-3.5" aria-hidden />{s.risk[0]}</span> : <span className="text-muted-foreground">—</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          </div>
          <div className="min-w-0 space-y-6">
            <Card className="p-5">
              <h2 className="font-semibold">Bài khó nhất của lớp</h2>
              <p className="text-xs text-muted-foreground">Điểm cao nhất trung bình thấp nhất (ít nhất 3 em đã làm).</p>
              {report.hardest.length ? <ul className="mt-3 space-y-2 text-sm">{report.hardest.map((h) => <li key={h.id}><div className="flex justify-between gap-2"><span className="min-w-0">{h.title}</span><span className="font-mono">{h.avg}</span></div><p className="text-xs text-muted-foreground">{h.below}/{h.students} em chưa đạt 70</p></li>)}</ul> : <p className="mt-2 text-sm text-muted-foreground">Chưa đủ dữ liệu.</p>}
            </Card>
            <Card className="p-5"><h2 className="font-semibold">Năng lực theo lĩnh vực</h2><div className="mt-3 space-y-1.5">{report.domains.length ? report.domains.map((d) => <Bar key={d.id} label={`${d.name} (${d.students} em)`} value={d.avgPct} />) : <p className="text-sm text-muted-foreground">Chưa có.</p>}</div></Card>
            <Card className="p-5"><h2 className="font-semibold">Năng lực theo chủ đề IC3</h2><div className="mt-3 space-y-1.5">{report.elements.map((e) => <Bar key={e.element} label={`${ELEMENT[e.element]} (${e.students})`} value={e.avg} />)}</div></Card>
            <Card className="p-5"><h2 className="flex items-center gap-1.5 font-semibold"><Users className="size-4" aria-hidden /> Theo công pháp</h2><div className="mt-3 space-y-1.5">{report.courses.map((c) => <Bar key={c.id} label={`${c.plain} (${c.students} em)`} value={c.avgPct} />)}</div></Card>
          </div>
        </div>
      )}
    </div>
  );
}
