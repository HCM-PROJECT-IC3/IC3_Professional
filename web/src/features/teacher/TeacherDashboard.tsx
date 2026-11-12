import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BookOpen, ClipboardList, ExternalLink, RefreshCw, Target, Trophy, UserX, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ClassAverageBars, type ClassAvg } from '@/components/charts/ClassAverageBars';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatCard } from '@/components/shared/StatCard';
import { EmptyState, ErrorState, LoadingState } from '@/components/shared/States';
import { useStaff } from '@/features/auth/StaffGate';
import { LegacyLink } from '@/features/legacy/LegacyLink';
import { cn } from '@/lib/utils';
import {
  need, type ExamHistory, type QuizResult, type RosterStudent, type TeacherData, type TeacherFilters,
} from '@/services/legacy/types';

/* Dashboard giáo viên 2.0.
   Dữ liệu: EduTeacherData.loadAll() — CHÍNH hàm của teacher-dashboard.html (roster theo teacherId,
   bài nộp theo lớp mình dạy, bản đệm 12 giờ / 3 phút DÙNG CHUNG với trang cũ). Lọc, KPI, danh sách:
   tính trên máy bằng EduAnalytics/applyFilters — đổi bộ lọc = 0 lượt đọc.
   "Làm mới" = loadAll({forceRefresh}) như nút cũ: chỉ đọc bài MỚI nộp. */

const PASS = 70; // EduModels.StudentResult.isPassing / EduAnalytics.passRate
const SUPPORT = 60; // ngưỡng "Cần hỗ trợ" của trang cũ
const pad = (n: number) => String(n).padStart(2, '0');
const fmtTime = (t: number) => {
  const d = new Date(t);
  return `${pad(d.getHours())}:${pad(d.getMinutes())} ${d.getDate()}/${d.getMonth() + 1}`;
};

const RANGES: { id: NonNullable<TeacherFilters['rangeDays']>; label: string }[] = [
  { id: '7', label: '7 ngày' },
  { id: '30', label: '30 ngày' },
  { id: '90', label: '90 ngày' },
  { id: '', label: 'Tất cả' },
];

function tone(score: number) {
  return score >= PASS ? 'green' : score >= 50 ? 'orange' : 'red';
}

const RESULT_COLUMNS: Column<QuizResult>[] = [
  { key: 'name', header: 'Học sinh', sortValue: (r) => r.studentName, cell: (r) => <span className="font-medium">{r.studentName || 'Ẩn danh'}</span> },
  { key: 'class', header: 'Lớp', sortValue: (r) => r.studentClass, cell: (r) => r.studentClass || '–', hideOnMobile: true },
  {
    key: 'test',
    header: 'Bài',
    sortValue: (r) => r.testName,
    cell: (r) => <span className="block max-w-72 truncate" title={r.testName}>{(r.testName || '').split(' › ').pop() || '–'}</span>,
  },
  {
    key: 'score',
    header: 'Điểm',
    sortValue: (r) => r.score ?? null,
    cell: (r) => (typeof r.score === 'number' ? <Badge tone={tone(r.score)} className="tabular-nums">{r.score}%</Badge> : '–'),
    align: 'right',
  },
  {
    key: 'at',
    header: 'Nộp lúc',
    sortValue: (r) => r.submittedAtMs ?? null,
    cell: (r) => <span className="whitespace-nowrap text-muted-foreground tabular-nums">{r.submittedAtMs ? fmtTime(r.submittedAtMs) : '–'}</span>,
    align: 'right',
    hideOnMobile: true,
  },
];

function PeopleList({
  title,
  description,
  icon: Icon,
  items,
  empty,
}: {
  title: string;
  description: string;
  icon: typeof Users;
  items: { key: string; name: string; meta: string; score?: number | null }[];
  empty: string;
}) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, 6);
  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className="size-4 text-muted-foreground" aria-hidden /> {title}
          <span className="ml-auto text-sm font-normal tabular-nums text-muted-foreground">{items.length}</span>
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      {items.length ? (
        <ul className="divide-y px-5 pb-3">
          {shown.map((p) => (
            <li key={p.key} className="flex items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{p.name}</p>
                <p className="truncate text-xs text-muted-foreground">{p.meta}</p>
              </div>
              {typeof p.score === 'number' && <Badge tone={tone(p.score)} className="tabular-nums">{p.score}%</Badge>}
            </li>
          ))}
          {items.length > 6 && (
            <li className="pt-2">
              <Button variant="ghost" size="sm" className="w-full" onClick={() => setAll((v) => !v)}>
                {all ? 'Thu gọn' : `Xem thêm ${items.length - 6}`}
              </Button>
            </li>
          )}
        </ul>
      ) : (
        <EmptyState compact title={empty} />
      )}
    </Card>
  );
}

export default function TeacherDashboard() {
  const { profile } = useStaff();
  const [data, setData] = useState<TeacherData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [filters, setFilters] = useState<TeacherFilters>({ classId: '', examName: '', rangeDays: '30' });

  const load = useCallback(
    async (forceRefresh = false) => {
      setError(null);
      if (forceRefresh) setRefreshing(true);
      try {
        setData(await need(window.EduTeacherData, 'EduTeacherData').loadAll(profile, { forceRefresh }));
      } catch (e) {
        const F = window.EduFirebase;
        setError(F?.isQuotaOrOffline?.(e) ? F.QUOTA_HINT || 'Hết lượt đọc hôm nay hoặc mất mạng.' : (e as Error).message);
      } finally {
        setRefreshing(false);
      }
    },
    [profile],
  );

  useEffect(() => {
    load();
  }, [load]);

  const view = useMemo(() => {
    if (!data) return null;
    const A = need(window.EduAnalytics, 'EduAnalytics');
    const scoped = need(window.EduTeacherData, 'EduTeacherData').applyFilters(data, filters);
    const { filteredResults: results, filteredStudents: students, examHistories } = scoped;
    const keyOf = window.EduModels?.Roster?.studentKeyOf;
    const submitted = new Set(examHistories.map((e) => e.studentKey));
    const notSubmitted: RosterStudent[] = keyOf
      ? students.filter((s) => !submitted.has(keyOf({ name: s.name, className: s.className })))
      : [];
    const byClass = new Map<string, number[]>();
    results.forEach((r) => {
      if (!r.studentClass || typeof r.score !== 'number') return;
      if (!byClass.has(r.studentClass)) byClass.set(r.studentClass, []);
      byClass.get(r.studentClass)!.push(r.score);
    });
    const classAvg: ClassAvg[] = [...byClass.entries()]
      .map(([name, s]) => ({ name, avg: Math.round(s.reduce((a, b) => a + b, 0) / s.length), count: s.length }))
      .sort((a, b) => A.compareNatural(a.name, b.name));
    const classes = [...new Set(data.students.map((s) => s.className).filter(Boolean) as string[])].sort(A.compareNatural);
    const exams = [...new Set(data.results.map((r) => r.testName).filter(Boolean) as string[])].sort(A.compareNatural);
    return {
      results: [...results].sort((a, b) => (b.submittedAtMs || 0) - (a.submittedAtMs || 0)),
      students,
      examCount: new Set(results.map((r) => r.testName).filter(Boolean)).size,
      avg: A.avgScore(results),
      pass: A.passRate(results),
      notSubmitted,
      support: A.studentsNeedingSupport(examHistories, SUPPORT),
      top: A.topStudents(examHistories, 20),
      classAvg,
      classes,
      exams,
    };
  }, [data, filters]);

  const header = (
    <PageHeader
      title="Tổng quan lớp học"
      description={`${profile.name || profile.email || 'Giáo viên'}${data?.schools?.length ? ' · ' + data.schools.join(', ') : ''}`}
      actions={
        <>
          <Button variant="outline" size="sm" onClick={() => load(true)} disabled={!data || refreshing}>
            <RefreshCw className={cn(refreshing && 'animate-spin')} /> Làm mới
          </Button>
          <LegacyLink page="teacher-dashboard.html" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
            Bản đầy đủ <ExternalLink />
          </LegacyLink>
        </>
      }
    />
  );

  if (error && !data) {
    return (
      <div className="space-y-6">
        {header}
        <Card>
          <ErrorState description={error} onRetry={() => load()} />
        </Card>
      </div>
    );
  }

  if (!view || !data) {
    return (
      <div className="space-y-6">
        {header}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-6">
          {Array.from({ length: 6 }, (_, i) => (
            <StatCard key={i} label="Đang tải" value="" loading />
          ))}
        </div>
        <Card className="p-5">
          <LoadingState rows={4} />
        </Card>
      </div>
    );
  }

  if (data.noSchoolsAssigned) {
    return (
      <div className="space-y-6">
        {header}
        <Card>
          <EmptyState
            title="Tài khoản chưa được gán trường"
            description="Nhờ quản trị viên gán trường cho thầy cô ở trang Tài khoản & phân quyền, rồi tải lại trang."
          />
        </Card>
      </div>
    );
  }

  const set = (patch: Partial<TeacherFilters>) => setFilters((f) => ({ ...f, ...patch }));
  const selectCls = 'h-9 min-w-0 rounded-md border bg-card px-2 text-sm';

  return (
    <div className="space-y-6">
      {header}
      {error && (
        <p role="status" className="rounded-lg border border-step-3/40 bg-step-3/10 px-3 py-2 text-sm">
          Chưa làm mới được: {error} Đang hiện dữ liệu đã lưu.
        </p>
      )}

      <Card className="flex flex-wrap items-center gap-2 p-3">
        <select aria-label="Lớp" className={cn(selectCls, 'w-32')} value={filters.classId} onChange={(e) => set({ classId: e.target.value })}>
          <option value="">Tất cả lớp</option>
          {view.classes.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select aria-label="Bài" className={cn(selectCls, 'w-full flex-1 sm:w-64 sm:flex-none')} value={filters.examName} onChange={(e) => set({ examName: e.target.value })}>
          <option value="">Tất cả bài</option>
          {view.exams.map((x) => (
            <option key={x} value={x}>
              {x.split(' › ').slice(-2).join(' › ')}
            </option>
          ))}
        </select>
        <div className="flex gap-1 sm:ml-auto" role="group" aria-label="Khoảng thời gian">
          {RANGES.map((r) => (
            <Button key={r.id} size="sm" variant={filters.rangeDays === r.id ? 'secondary' : 'ghost'} aria-pressed={filters.rangeDays === r.id} onClick={() => set({ rangeDays: r.id })}>
              {r.label}
            </Button>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 2xl:grid-cols-6">
        <StatCard label="Học sinh" value={view.students.length} hint={`${data.students.length} trong danh sách lớp`} icon={Users} tone="blue" />
        <StatCard label="Số bài thi" value={view.examCount} hint={`${view.results.length} bài nộp`} icon={BookOpen} tone="neutral" />
        <StatCard label="Điểm TB" value={view.avg === null ? '–' : `${view.avg}%`} icon={ClipboardList} tone="blue" />
        <StatCard label="Tỉ lệ đạt" value={view.pass === null ? '–' : `${view.pass}%`} hint={`Điểm ≥ ${PASS}%`} icon={Target} tone="green" />
        <StatCard label="Chưa làm bài" value={view.notSubmitted.length} hint="Trong khoảng đã lọc" icon={UserX} tone="orange" />
        <StatCard label="Cần hỗ trợ" value={view.support.length} hint={`TB dưới ${SUPPORT}%`} icon={AlertTriangle} tone="orange" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Điểm trung bình theo lớp</CardTitle>
            <CardDescription>Theo bộ lọc đang chọn.</CardDescription>
          </CardHeader>
          <div className="px-5 pb-5">
            {view.classAvg.length ? <ClassAverageBars rows={view.classAvg} pass={PASS} /> : <EmptyState compact title="Chưa có bài nộp" />}
          </div>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Bài nộp gần đây</CardTitle>
            <CardDescription>Bấm tiêu đề cột để sắp xếp. Xuất Excel/PDF, câu hay sai: mở bản đầy đủ.</CardDescription>
          </CardHeader>
          <div className="px-2 pb-3">
            <DataTable
              caption="Bài nộp gần đây"
              columns={RESULT_COLUMNS}
              rows={view.results}
              rowKey={(r) => r.id || `${r.studentName}|${r.testName}|${r.submittedAtMs}`}
              pageSize={8}
              empty={{ title: 'Chưa có bài nộp trong khoảng này', description: 'Thử chọn "Tất cả" ở khoảng thời gian.' }}
            />
          </div>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <PeopleList
          title="Chưa làm bài"
          description="Có trong danh sách lớp, chưa nộp bài nào."
          icon={UserX}
          items={view.notSubmitted.map((s) => ({ key: `${s.name}|${s.className}`, name: s.name, meta: [s.className, s.mssv].filter(Boolean).join(' · ') || '–' }))}
          empty="Mọi học sinh đã làm bài"
        />
        <PeopleList
          title="Cần hỗ trợ"
          description={`Điểm TB dưới ${SUPPORT}%.`}
          icon={AlertTriangle}
          items={view.support.map((e: ExamHistory) => ({ key: e.studentKey, name: e.studentName, meta: e.studentClass || '–', score: e.avgScore }))}
          empty={`Không có học sinh dưới ${SUPPORT}%`}
        />
        <PeopleList
          title="Học sinh tiêu biểu"
          description="Điểm TB cao nhất."
          icon={Trophy}
          items={view.top.map((e: ExamHistory) => ({ key: e.studentKey, name: e.studentName, meta: e.studentClass || '–', score: e.avgScore }))}
          empty="Chưa có dữ liệu"
        />
      </div>
    </div>
  );
}
