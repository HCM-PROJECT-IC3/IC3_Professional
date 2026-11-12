import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, BookOpen, ClipboardList, ExternalLink, GraduationCap, RefreshCw, School, Target, Trophy, UserX, Users,
} from 'lucide-react';
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
import { PASS, PeopleList, RANGES, SUPPORT, errorText, resultColumns, tone } from '@/features/staff/shared';
import { cn } from '@/lib/utils';
import {
  need, type CoordinatorData, type CoordinatorFilters, type CoordinatorRoster, type QuizResult, type SchoolComparisonRow,
} from '@/services/legacy/types';

/* Dashboard điều phối 2.0 (admin, coordinator, school_admin — như coordinator-dashboard.html).
   Dữ liệu: EduCoordinatorData.loadRoster / loadResults — CHÍNH hàm của trang cũ, gọi RIÊNG 2 nguồn
   (như trang cũ từ 11/2026): 1 nguồn lỗi không làm trắng trang, "Thử lại" chỉ đọc lại nguồn lỗi.
   Bản đệm (roster 12 giờ, kết quả 3 phút, lớp/khoá học 10 phút) DÙNG CHUNG với trang cũ.
   Lọc / KPI / so sánh trường: tính trên máy (EduAnalytics) — đổi bộ lọc = 0 lượt đọc. */

type Part<T> = { data: T | null; error: string | null; loading: boolean };
const idle = <T,>(): Part<T> => ({ data: null, error: null, loading: true });

const CLASS_PREVIEW = 8;
const CLASS_MAX = 60;

const RESULT_COLUMNS = resultColumns({ school: true });

const SCHOOL_COLUMNS: Column<SchoolComparisonRow>[] = [
  { key: 'school', header: 'Trường', sortValue: (r) => r.school, cell: (r) => <span className="font-medium">{r.school}</span> },
  { key: 'roster', header: 'Sĩ số', sortValue: (r) => r.rosterSize, cell: (r) => r.rosterSize || '–', align: 'right', hideOnMobile: true },
  {
    key: 'part',
    header: 'Tham gia',
    sortValue: (r) => r.participation,
    cell: (r) => (r.participation === null ? '–' : <span className="tabular-nums">{r.participation}%</span>),
    align: 'right',
  },
  { key: 'subs', header: 'Bài nộp', sortValue: (r) => r.submissions, cell: (r) => <span className="tabular-nums">{r.submissions}</span>, align: 'right', hideOnMobile: true },
  {
    key: 'avg',
    header: 'Điểm TB',
    sortValue: (r) => r.avg,
    cell: (r) => (r.avg === null ? '–' : <Badge tone={tone(r.avg)} className="tabular-nums">{r.avg}%</Badge>),
    align: 'right',
  },
  {
    key: 'pass',
    header: 'Đạt',
    sortValue: (r) => r.passRate,
    cell: (r) => (r.passRate === null ? '–' : <span className="tabular-nums">{r.passRate}%</span>),
    align: 'right',
    hideOnMobile: true,
  },
];

export default function CoordinatorDashboard() {
  const { profile } = useStaff();
  const [roster, setRoster] = useState<Part<CoordinatorRoster>>(idle);
  const [results, setResults] = useState<Part<QuizResult[]>>(idle);
  const [refreshing, setRefreshing] = useState(false);
  const [showAllClasses, setShowAllClasses] = useState(false);
  const [filters, setFilters] = useState<CoordinatorFilters>({ courseId: '', teacherId: '', classId: '', examName: '', rangeDays: '30' });

  const C = need(window.EduCoordinatorData, 'EduCoordinatorData');
  const scope = useMemo(() => C.scopeOf(profile), [C, profile]);

  const loadRoster = useCallback(
    async (forceRefresh = false) => {
      setRoster((p) => ({ ...p, loading: true, error: null }));
      try {
        const data = await C.loadRoster(profile, { forceRefresh });
        setRoster({ data, error: null, loading: false });
      } catch (e) {
        setRoster((p) => ({ data: p.data, error: errorText(e), loading: false }));
      }
    },
    [C, profile],
  );
  const loadResults = useCallback(
    async (forceRefresh = false) => {
      setResults((p) => ({ ...p, loading: true, error: null }));
      try {
        const data = await C.loadResults(profile, { forceRefresh });
        setResults({ data, error: null, loading: false });
      } catch (e) {
        setResults((p) => ({ data: p.data, error: errorText(e), loading: false }));
      }
    },
    [C, profile],
  );

  useEffect(() => {
    if (!scope) return; // chưa gán trường: không query gì (như trang cũ)
    loadRoster();
    loadResults();
  }, [scope, loadRoster, loadResults]);

  const refreshAll = async () => {
    setRefreshing(true);
    await Promise.all([loadRoster(true), loadResults(true)]);
    setRefreshing(false);
  };

  const view = useMemo(() => {
    if (!roster.data && !results.data) return null;
    const A = need(window.EduAnalytics, 'EduAnalytics');
    const raw: CoordinatorData = {
      courses: [], classes: [], students: [], teachers: [],
      ...(roster.data || {}),
      results: results.data || [],
      schools: scope?.schools || [],
      noSchoolsAssigned: false,
    };
    const { filteredResults, filteredStudents, examHistories, allowedClasses } = C.applyFilters(raw, filters);
    const anyClassFilter = !!(filters.courseId || filters.teacherId || filters.classId);
    const keyOf = window.EduModels?.Roster?.studentKeyOf;
    const submitted = new Set(examHistories.map((e) => e.studentKey));
    const notSubmitted = keyOf ? filteredStudents.filter((s) => !submitted.has(keyOf({ name: s.name, className: s.className }))) : [];

    const schoolNames = new Set(filteredResults.map((r) => r.studentSchool).filter(Boolean));
    const multiSchool = schoolNames.size > 1 || (scope?.schools.length || 0) > 1;
    const byClass = new Map<string, { name: string; sub?: string; s: number[] }>();
    filteredResults.forEach((r) => {
      if (!r.studentClass || typeof r.score !== 'number') return;
      const k = `${r.studentSchool || ''}|${r.studentClass}`;
      if (!byClass.has(k)) byClass.set(k, { name: r.studentClass, sub: multiSchool ? r.studentSchool : undefined, s: [] });
      byClass.get(k)!.s.push(r.score);
    });
    // Điều phối có thể có hàng trăm lớp → xếp lớp điểm THẤP trước (cần chú ý), xem thêm tối đa CLASS_MAX.
    const classAvg: ClassAvg[] = [...byClass.entries()]
      .map(([key, g]) => ({ key, name: g.name, sub: g.sub, avg: Math.round(g.s.reduce((a, b) => a + b, 0) / g.s.length), count: g.s.length }))
      .sort((a, b) => a.avg - b.avg || A.compareNatural(a.name, b.name));

    return {
      raw,
      results: [...filteredResults].sort((a, b) => (b.submittedAtMs || 0) - (a.submittedAtMs || 0)),
      students: filteredStudents,
      teacherCount: anyClassFilter ? new Set(allowedClasses.map((c) => c.teacherId).filter(Boolean)).size : raw.teachers.length,
      examCount: new Set(filteredResults.map((r) => r.testName).filter(Boolean)).size,
      avg: A.avgScore(filteredResults),
      pass: A.passRate(filteredResults),
      notSubmitted,
      support: A.studentsNeedingSupport(examHistories, SUPPORT),
      top: A.topStudents(examHistories, 20),
      classAvg,
      // Thiếu kết quả (lỗi tải) → KHÔNG so sánh: "Tham gia 0%" sẽ bị hiểu nhầm là không em nào làm bài.
      schools: multiSchool && results.data ? A.schoolComparison(filteredResults, filteredStudents, PASS) : [],
      exams: [...new Set(raw.results.map((r) => r.testName).filter(Boolean) as string[])].sort(A.compareNatural),
    };
  }, [roster.data, results.data, filters, scope, C]);

  const header = (
    <PageHeader
      title="Tổng quan điều phối"
      description={`${profile.name || profile.email || ''}${scope && !scope.isAdmin ? ' · ' + scope.schools.join(', ') : scope?.isAdmin ? ' · Tất cả trường' : ''}`}
      actions={
        <>
          <Button variant="outline" size="sm" onClick={refreshAll} disabled={!view || refreshing}>
            <RefreshCw className={cn(refreshing && 'animate-spin')} /> Làm mới
          </Button>
          <LegacyLink page="coordinator-dashboard.html" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
            Bản đầy đủ <ExternalLink />
          </LegacyLink>
        </>
      }
    />
  );

  if (!scope) {
    return (
      <div className="space-y-6">
        {header}
        <Card>
          <EmptyState title="Tài khoản chưa được gán trường" description="Nhờ quản trị viên gán trường ở trang Tài khoản & phân quyền, rồi tải lại trang." />
        </Card>
      </div>
    );
  }

  if (!view) {
    const err = roster.error && results.error;
    return (
      <div className="space-y-6">
        {header}
        {err ? (
          <Card>
            <ErrorState description={roster.error || results.error} onRetry={() => { loadRoster(); loadResults(); }} />
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
              {Array.from({ length: 4 }, (_, i) => (
                <StatCard key={i} label="Đang tải" value="" loading />
              ))}
            </div>
            <Card className="p-5">
              <LoadingState rows={4} />
            </Card>
          </>
        )}
      </div>
    );
  }

  const set = (patch: Partial<CoordinatorFilters>) => setFilters((f) => ({ ...f, ...patch }));
  const selectCls = 'h-9 min-w-0 rounded-md border bg-card px-2 text-sm';
  const noR = !roster.data;
  const noS = !results.data;
  const dash = (v: string | number, missing: boolean) => (missing ? '–' : v);
  const classes = view.raw.classes;
  const classRows = showAllClasses ? view.classAvg.slice(0, CLASS_MAX) : view.classAvg.slice(0, CLASS_PREVIEW);

  return (
    <div className="space-y-6">
      {header}

      {(roster.error || results.error) && (
        <div role="status" className="flex flex-wrap items-center gap-2 rounded-lg border border-step-3/40 bg-step-3/10 px-3 py-2 text-sm">
          <span className="flex-1">
            Chưa tải được {roster.error ? 'danh sách học sinh' : 'kết quả bài thi'}: {roster.error || results.error}
            {(roster.error ? roster.data : results.data) ? ' Đang hiện dữ liệu đã lưu.' : ''}
          </span>
          <Button size="sm" variant="outline" onClick={() => (roster.error ? loadRoster() : loadResults())}>
            Thử lại
          </Button>
        </div>
      )}

      <Card className="flex flex-wrap items-center gap-2 p-3">
        <select aria-label="Khoá học" className={cn(selectCls, 'w-36')} value={filters.courseId} onChange={(e) => set({ courseId: e.target.value })}>
          <option value="">Tất cả khoá</option>
          {view.raw.courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select aria-label="Giáo viên" className={cn(selectCls, 'w-40')} value={filters.teacherId} onChange={(e) => set({ teacherId: e.target.value })}>
          <option value="">Tất cả giáo viên</option>
          {view.raw.teachers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name || t.email}
            </option>
          ))}
        </select>
        <select aria-label="Lớp" className={cn(selectCls, 'w-32')} value={filters.classId} onChange={(e) => set({ classId: e.target.value })}>
          <option value="">Tất cả lớp</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.school && (scope.schools.length > 1 || scope.isAdmin) ? ` · ${c.school}` : ''}
            </option>
          ))}
        </select>
        <select aria-label="Bài" className={cn(selectCls, 'w-full flex-1 sm:w-56 sm:flex-none')} value={filters.examName} onChange={(e) => set({ examName: e.target.value })}>
          <option value="">Tất cả bài</option>
          {view.exams.map((x) => (
            <option key={x} value={x}>
              {x.split(' › ').slice(-2).join(' › ')}
            </option>
          ))}
        </select>
        <div className="flex gap-1 xl:ml-auto" role="group" aria-label="Khoảng thời gian">
          {RANGES.map((r) => (
            <Button key={r.id} size="sm" variant={filters.rangeDays === r.id ? 'secondary' : 'ghost'} aria-pressed={filters.rangeDays === r.id} onClick={() => set({ rangeDays: r.id })}>
              {r.label}
            </Button>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Học sinh" value={dash(view.students.length.toLocaleString('vi-VN'), noR)} icon={Users} tone="blue" />
        <StatCard label="Giáo viên" value={dash(view.teacherCount, noR)} icon={GraduationCap} tone="neutral" />
        <StatCard label="Số bài thi" value={dash(view.examCount, noS)} hint={noS ? undefined : `${view.results.length.toLocaleString('vi-VN')} bài nộp`} icon={BookOpen} tone="neutral" />
        <StatCard label="Điểm TB" value={noS || view.avg === null ? '–' : `${view.avg}%`} icon={ClipboardList} tone="blue" />
        <StatCard label="Tỉ lệ đạt" value={noS || view.pass === null ? '–' : `${view.pass}%`} hint={`Điểm ≥ ${PASS}%`} icon={Target} tone="green" />
        <StatCard
          label="Chưa làm bài"
          value={dash(view.notSubmitted.length.toLocaleString('vi-VN'), noR || noS)}
          hint={
            noR || noS || !view.students.length
              ? undefined
              : `${Math.round((view.notSubmitted.length / view.students.length) * 100)}% sĩ số`
          }
          icon={UserX}
          tone="orange"
        />
        <StatCard label="Cần hỗ trợ" value={dash(view.support.length, noS)} hint={`TB dưới ${SUPPORT}%`} icon={AlertTriangle} tone="orange" />
        <StatCard label="Trường" value={scope.isAdmin ? new Set(view.raw.students.map((s) => s.school).filter(Boolean)).size : scope.schools.length} icon={School} tone="neutral" />
      </div>

      {view.schools.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>So sánh giữa các trường</CardTitle>
            <CardDescription>Tham gia = học sinh có trong danh sách đã nộp ít nhất 1 bài, theo bộ lọc.</CardDescription>
          </CardHeader>
          <div className="px-2 pb-3">
            <DataTable caption="So sánh giữa các trường" columns={SCHOOL_COLUMNS} rows={view.schools} rowKey={(r) => r.schoolId} pageSize={10} />
          </div>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Lớp cần chú ý</CardTitle>
            <CardDescription>Điểm TB theo lớp, thấp nhất trước.</CardDescription>
          </CardHeader>
          <div className="px-5 pb-5">
            {view.classAvg.length ? (
              <>
                <ClassAverageBars rows={classRows} pass={PASS} />
                {view.classAvg.length > CLASS_PREVIEW && (
                  <Button variant="ghost" size="sm" className="mt-2 w-full" onClick={() => setShowAllClasses((v) => !v)}>
                    {showAllClasses
                      ? 'Thu gọn'
                      : `Xem thêm ${Math.min(view.classAvg.length, CLASS_MAX) - CLASS_PREVIEW} lớp${view.classAvg.length > CLASS_MAX ? ` (trong ${view.classAvg.length})` : ''}`}
                  </Button>
                )}
              </>
            ) : (
              <EmptyState compact title={noS ? 'Chưa tải được kết quả' : 'Chưa có bài nộp'} />
            )}
          </div>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Bài nộp gần đây</CardTitle>
            <CardDescription>Bấm tiêu đề cột để sắp xếp. Xuất Excel/PDF, chi tiết học sinh: mở bản đầy đủ.</CardDescription>
          </CardHeader>
          <div className="px-2 pb-3">
            <DataTable
              caption="Bài nộp gần đây"
              columns={RESULT_COLUMNS}
              rows={view.results}
              rowKey={(r) => r.id || `${r.studentName}|${r.studentSchool}|${r.testName}|${r.submittedAtMs}`}
              pageSize={8}
              loading={results.loading && !results.data}
              error={!!results.error && !results.data}
              onRetry={() => loadResults()}
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
          items={view.notSubmitted.map((s, i) => ({ key: `${s.id || i}|${s.name}`, name: s.name, meta: [s.className, s.school].filter(Boolean).join(' · ') || '–' }))}
          empty={noR || noS ? 'Chưa đủ dữ liệu' : 'Mọi học sinh đã làm bài'}
        />
        <PeopleList
          title="Cần hỗ trợ"
          description={`Điểm TB dưới ${SUPPORT}%.`}
          icon={AlertTriangle}
          items={view.support.map((e) => ({ key: e.studentKey, name: e.studentName, meta: e.studentClass || '–', score: e.avgScore }))}
          empty={`Không có học sinh dưới ${SUPPORT}%`}
        />
        <PeopleList
          title="Học sinh tiêu biểu"
          description="Điểm TB cao nhất."
          icon={Trophy}
          items={view.top.map((e) => ({ key: e.studentKey, name: e.studentName, meta: e.studentClass || '–', score: e.avgScore }))}
          empty="Chưa có dữ liệu"
        />
      </div>
    </div>
  );
}
