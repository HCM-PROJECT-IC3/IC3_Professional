import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ExternalLink, GraduationCap, Hourglass, School, ShieldCheck, UserCog, UserPlus, Users } from 'lucide-react';
import { ROLE_LABEL, type ViewerRole } from '@/app/navigation';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatCard } from '@/components/shared/StatCard';
import { EmptyState, ErrorState, LoadingState } from '@/components/shared/States';
import { LegacyLink } from '@/features/legacy/LegacyLink';
import { cn } from '@/lib/utils';
import { need, type TsLike, type UserDoc } from '@/services/legacy/types';

/* ============================================================
   Quản trị 2.0 — CHỈ XEM, 0 lượt đọc / 0 lượt ghi Firebase.

   Không gọi Firestore: chỉ đọc 2 BẢN ĐỆM mà trang Quản lý tài khoản cũ (js/admin-users.js) đã lưu
   trên máy (IndexedDB qua EduDataCache):
     'admin-users:delta'    { users: [{ id, u }], fullAt, checkedAt }       — lưu bền 30 ngày
     'admin-users:lookups'  { allSchools, allClasses, allTeachingTeachers } — lưu bền 12 giờ
   Chưa có bản đệm → hướng dẫn mở trang cũ 1 lần (trang cũ mới là nơi đọc/ghi).
   Mọi thao tác GHI (duyệt, đổi vai trò, gán trường) vẫn ở admin-users.html.

   Luật "Chờ duyệt" / "Cần xử lý": CHÉP ĐÚNG admin-users.js § isPending, issuesOf — sửa bên đó thì sửa cả đây.
   ============================================================ */

const DELTA_KEY = 'admin-users:delta';
const LOOKUPS_KEY = 'admin-users:lookups';

interface Row {
  id: string;
  u: UserDoc;
}
interface Lookups {
  allSchools?: string[];
  allClasses?: { teacherId?: string; school?: string; name?: string }[];
  allTeachingTeachers?: unknown[];
}
interface Snapshot {
  rows: Row[];
  checkedAt: number;
  lookups: Lookups | null;
}

const msOf = (v?: TsLike | null) => (v && typeof v.seconds === 'number' ? v.seconds * 1e3 + Math.floor((Number(v.nanoseconds) || 0) / 1e6) : 0);
const isPending = (u: UserDoc) => u.role === 'teacher' && u.approved === false;
const vi = (a?: string, b?: string) => String(a || '').localeCompare(String(b || ''), 'vi');
const roleLabel = (r?: string) => ROLE_LABEL[r as ViewerRole] || r || '?';
const fmtDate = (t: number) => {
  const d = new Date(t);
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
};
const fmtDateTime = (t: number) => {
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())} ${d.getDate()}/${d.getMonth() + 1}`;
};

function issuesOf(row: Row, classesByTeacher: Map<string, { school?: string }[]>, lk: Lookups | null): string[] {
  const { id, u } = row;
  const out: string[] = [];
  if (isPending(u)) out.push('Chờ duyệt');
  const sch = Array.isArray(u.schools) ? u.schools : [];
  if ((u.role === 'coordinator' || u.role === 'school_admin') && !sch.length) out.push('Chưa gán trường');
  if (u.role === 'teacher' && !isPending(u)) {
    const mine = classesByTeacher.get(id) || [];
    const allClasses = lk?.allClasses || [];
    if (!mine.length && allClasses.length) out.push('Chưa gán lớp');
    else if ([...new Set(mine.map((c) => c.school).filter(Boolean) as string[])].some((s) => !sch.includes(s))) out.push('Thiếu trường của lớp đang dạy');
    if (!u.teacherCode && (lk?.allTeachingTeachers || []).length) out.push('Chưa liên kết Mã NV');
  }
  return out;
}

const ROLE_TONE: Record<string, 'blue' | 'green' | 'orange' | 'neutral' | 'red'> = {
  admin: 'red',
  coordinator: 'orange',
  school_admin: 'orange',
  teaching_coordinator: 'orange',
  teacher: 'blue',
  student: 'neutral',
};

type Tab = 'all' | 'issues' | 'pending' | 'teacher' | 'staff' | 'admin';
const TABS: { id: Tab; label: string; test: (r: Row, iss: string[]) => boolean }[] = [
  { id: 'all', label: 'Tất cả', test: () => true },
  { id: 'issues', label: 'Cần xử lý', test: (_r, iss) => iss.length > 0 },
  { id: 'pending', label: 'Chờ duyệt', test: (r) => isPending(r.u) },
  { id: 'teacher', label: 'Giáo viên', test: (r) => r.u.role === 'teacher' },
  { id: 'staff', label: 'Điều phối · QT trường', test: (r) => ['coordinator', 'teaching_coordinator', 'school_admin'].includes(String(r.u.role)) },
  { id: 'admin', label: 'Quản trị viên', test: (r) => r.u.role === 'admin' },
];

const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'd').toLowerCase();

export default function AdminOverview() {
  const [snap, setSnap] = useState<Snapshot | null | undefined>(undefined); // undefined = đang đọc bản đệm
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('issues');
  const [q, setQ] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const C = need(window.EduDataCache, 'EduDataCache');
        // allowStale=true: chỉ XEM bản đã lưu, kể cả quá hạn — tuyệt đối không tự hỏi máy chủ.
        const [delta, lookups] = await Promise.all([
          C.getAsync<{ users?: Row[]; checkedAt?: number; fullAt?: number }>(DELTA_KEY, true, true),
          C.getAsync<Lookups>(LOOKUPS_KEY, true, true),
        ]);
        if (!alive) return;
        if (!delta || !Array.isArray(delta.users)) return setSnap(null);
        setSnap({ rows: delta.users, checkedAt: delta.checkedAt || delta.fullAt || 0, lookups: lookups || null });
      } catch (e) {
        if (alive) setError((e as Error).message);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const view = useMemo(() => {
    if (!snap) return null;
    const classesByTeacher = new Map<string, { school?: string }[]>();
    (snap.lookups?.allClasses || []).forEach((c) => {
      if (!c.teacherId) return;
      if (!classesByTeacher.has(c.teacherId)) classesByTeacher.set(c.teacherId, []);
      classesByTeacher.get(c.teacherId)!.push(c);
    });
    const rows = snap.rows
      .filter((r) => r.u.role !== 'student') // tài khoản học sinh (nếu có) không phải việc quản trị ở đây
      .map((r) => ({ ...r, issues: issuesOf(r, classesByTeacher, snap.lookups) }));
    const schools = new Set<string>(snap.lookups?.allSchools || []);
    rows.forEach((r) => (r.u.schools || []).forEach((s) => schools.add(s)));
    return {
      rows,
      total: rows.length,
      pending: rows.filter((r) => isPending(r.u)).length,
      issues: rows.filter((r) => r.issues.length).length,
      teachers: rows.filter((r) => r.u.role === 'teacher').length,
      staff: rows.filter((r) => ['coordinator', 'teaching_coordinator', 'school_admin'].includes(String(r.u.role))).length,
      admins: rows.filter((r) => r.u.role === 'admin').length,
      schools: schools.size,
      recent: rows.filter((r) => msOf(r.u.createdAt) >= Date.now() - 30 * 864e5).length,
    };
  }, [snap]);

  const visible = useMemo(() => {
    if (!view) return [];
    const t = TABS.find((x) => x.id === tab)!;
    const words = plain(q).trim().split(/\s+/).filter(Boolean);
    return view.rows
      .filter((r) => t.test(r, r.issues))
      .filter((r) => !words.length || words.every((w) => plain([r.u.name, r.u.email, r.u.teacherCode, roleLabel(String(r.u.role)), ...(r.u.schools || [])].join(' ')).includes(w)))
      .sort((a, b) => msOf(b.u.createdAt) - msOf(a.u.createdAt) || vi(a.u.name, b.u.name));
  }, [view, tab, q]);

  type VRow = (typeof visible)[number];
  const columns: Column<VRow>[] = [
    {
      key: 'name',
      header: 'Tài khoản',
      sortValue: (r) => r.u.name || r.u.email,
      cell: (r) => (
        <div className="min-w-0 max-w-64">
          <p className="truncate font-medium">{r.u.name || '(chưa có tên)'}</p>
          <p className="truncate text-xs text-muted-foreground">{r.u.email}</p>
          <p className="mt-1 truncate text-xs sm:hidden">
            {roleLabel(String(r.u.role))}
            {isPending(r.u) ? ' · chờ duyệt' : ''}
          </p>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Vai trò',
      sortValue: (r) => roleLabel(String(r.u.role)),
      cell: (r) => (
        <div className="flex flex-wrap gap-1">
          <Badge tone={ROLE_TONE[String(r.u.role)] || 'neutral'}>{roleLabel(String(r.u.role))}</Badge>
          {isPending(r.u) && (
            <Badge tone="orange">
              {r.u.requestedRole && r.u.requestedRole !== 'teacher' ? `Chờ duyệt · muốn làm ${roleLabel(r.u.requestedRole)}` : 'Chờ duyệt'}
            </Badge>
          )}
        </div>
      ),
      hideOnMobile: true,
    },
    {
      key: 'schools',
      header: 'Trường',
      cell: (r) => {
        const s = r.u.schools || [];
        return s.length ? (
          <span className="block max-w-56 truncate text-sm" title={s.join(', ')}>
            {s[0]}
            {s.length > 1 && <span className="text-muted-foreground"> +{s.length - 1}</span>}
          </span>
        ) : (
          <span className="text-muted-foreground">–</span>
        );
      },
      hideOnMobile: true,
    },
    {
      key: 'issues',
      header: 'Cần xử lý',
      sortValue: (r) => r.issues.length,
      cell: (r) =>
        r.issues.length ? (
          <span className="inline-flex items-center gap-1 text-sm text-step-3" title={r.issues.join(' · ')}>
            <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
            <span className="max-w-28 truncate sm:max-w-44">{r.issues[0]}</span>
            {r.issues.length > 1 && <b>+{r.issues.length - 1}</b>}
          </span>
        ) : (
          <span className="text-muted-foreground">–</span>
        ),
    },
    {
      key: 'created',
      header: 'Tạo ngày',
      sortValue: (r) => msOf(r.u.createdAt) || null,
      cell: (r) => <span className="whitespace-nowrap text-muted-foreground tabular-nums">{msOf(r.u.createdAt) ? fmtDate(msOf(r.u.createdAt)) : '–'}</span>,
      align: 'right',
      hideOnMobile: true,
    },
  ];

  const header = (
    <PageHeader
      title="Quản trị hệ thống"
      description={
        snap ? (
          <>
            Chỉ xem · bản lưu trên máy lúc {fmtDateTime(snap.checkedAt)}. Duyệt, sửa, gán trường: mở Quản lý tài khoản.
          </>
        ) : (
          'Chỉ xem — không đọc, không ghi dữ liệu.'
        )
      }
      actions={
        <>
          <Badge tone="blue">Chỉ xem · 0 lượt Firebase</Badge>
          <LegacyLink page="admin-users.html" className={buttonVariants({ size: 'sm' })}>
            Quản lý tài khoản <ExternalLink />
          </LegacyLink>
        </>
      }
    />
  );

  if (error) {
    return (
      <div className="space-y-6">
        {header}
        <Card>
          <ErrorState title="Không đọc được bản lưu trên máy" description={error} onRetry={() => location.reload()} />
        </Card>
      </div>
    );
  }
  if (snap === undefined) {
    return (
      <div className="space-y-6">
        {header}
        <Card className="p-5">
          <LoadingState rows={4} />
        </Card>
      </div>
    );
  }
  if (!snap || !view) {
    return (
      <div className="space-y-6">
        {header}
        <Card>
          <EmptyState
            title="Máy này chưa có bản lưu danh sách tài khoản"
            description="Trang 2.0 không tự đọc dữ liệu để khỏi tốn lượt Firebase. Mở Quản lý tài khoản một lần, rồi quay lại đây là xem được (bản lưu giữ 30 ngày)."
            action={
              <LegacyLink page="admin-users.html" className={buttonVariants()}>
                Mở Quản lý tài khoản <ExternalLink />
              </LegacyLink>
            }
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {header}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Tài khoản nhân sự" value={view.total} icon={Users} tone="blue" />
        <StatCard label="Chờ duyệt" value={view.pending} hint="Giáo viên mới đăng ký" icon={Hourglass} tone="orange" />
        <StatCard label="Cần xử lý" value={view.issues} hint="Chờ duyệt, chưa gán trường/lớp…" icon={AlertTriangle} tone="orange" />
        <StatCard label="Trường" value={view.schools} icon={School} tone="neutral" />
        <StatCard label="Giáo viên" value={view.teachers} icon={GraduationCap} tone="blue" />
        <StatCard label="Điều phối · QT trường" value={view.staff} icon={UserCog} tone="neutral" />
        <StatCard label="Quản trị viên" value={view.admins} icon={ShieldCheck} tone="neutral" />
        <StatCard label="Tài khoản mới" value={view.recent} hint="Tạo trong 30 ngày" icon={UserPlus} tone="green" />
      </div>

      {!snap.lookups && (
        <p role="status" className="rounded-lg border border-step-3/40 bg-step-3/10 px-3 py-2 text-sm">
          Bản lưu danh mục lớp đã hết hoặc chưa có — mục "Chưa gán lớp", "Chưa liên kết Mã NV" có thể thiếu. Mở Quản lý tài khoản để cập nhật.
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Tài khoản</CardTitle>
          <CardDescription>Lọc và tìm ngay trên máy. Bấm "Quản lý tài khoản" để duyệt hoặc sửa.</CardDescription>
        </CardHeader>
        <div className="flex flex-wrap items-center gap-2 border-y px-3 py-2">
          <div className="flex flex-wrap gap-1" role="group" aria-label="Nhóm tài khoản">
            {TABS.map((t) => {
              const n = view.rows.filter((r) => t.test(r, r.issues)).length;
              return (
                <Button key={t.id} size="sm" variant={tab === t.id ? 'secondary' : 'ghost'} aria-pressed={tab === t.id} onClick={() => setTab(t.id)}>
                  {t.label}
                  <span className={cn('tabular-nums text-xs', tab === t.id ? '' : 'text-muted-foreground')}>{n}</span>
                </Button>
              );
            })}
          </div>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm tên, email, mã NV, trường…"
            aria-label="Tìm tài khoản"
            className="h-9 w-full rounded-md border bg-card px-3 text-sm sm:ml-auto sm:w-64"
          />
        </div>
        <div className="px-2 py-3">
          <DataTable
            caption="Danh sách tài khoản"
            columns={columns}
            rows={visible}
            rowKey={(r) => r.id}
            pageSize={10}
            empty={{ title: tab === 'issues' ? 'Không còn việc cần xử lý' : 'Không có tài khoản phù hợp', description: q ? 'Thử từ khoá khác.' : undefined }}
          />
        </div>
      </Card>
    </div>
  );
}
