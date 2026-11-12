import { ArrowRight } from 'lucide-react';
import { ROLE_LABEL, type ViewerRole } from '@/app/navigation';
import { useViewer } from '@/app/providers/ViewerProvider';
import { buttonVariants } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable } from '@/components/shared/DataTable';
import { Mascot } from '@/components/shared/Mascot';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatCard } from '@/components/shared/StatCard';
import { LegacyLink } from '@/features/legacy/LegacyLink';
import { SAMPLE_ROWS, statsFor } from '@/features/preview/sample';
import { submissionColumns } from '@/features/preview/submissionColumns';
import { StudentDashboard } from '@/features/student/StudentDashboard';

const PRIMARY: Record<Exclude<ViewerRole, 'guest' | 'student'>, { label: string; page: string }> = {
  teacher: { label: 'Dashboard giáo viên', page: 'teacher-dashboard.html' },
  teaching_coordinator: { label: 'Lịch giảng dạy', page: 'teaching-schedule.html' },
  coordinator: { label: 'Dashboard điều phối', page: 'coordinator-dashboard.html' },
  school_admin: { label: 'Dashboard điều phối', page: 'coordinator-dashboard.html' },
  admin: { label: 'Tài khoản & phân quyền', page: 'admin-users.html' },
};

export function OverviewPage() {
  const { role } = useViewer();
  // Học sinh: dữ liệu THẬT trên máy (Phase 4a). Vai trò khác: vẫn dữ liệu mẫu tới Phase 4b–4d.
  if (role === 'guest' || role === 'student') return <StudentDashboard />;
  return <StaffPreview role={role} />;
}

function StaffPreview({ role }: { role: Exclude<ViewerRole, 'guest' | 'student'> }) {
  const primary = PRIMARY[role];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tổng quan"
        description={`Giao diện ${ROLE_LABEL[role].toLowerCase()} · bản xem trước`}
        actions={<Badge tone="orange">Dữ liệu mẫu</Badge>}
      />

      <Card className="flex flex-wrap items-center gap-x-4 gap-y-3 p-4 sm:p-5">
        <Mascot mood="happy" size={64} className="sm:size-[72px]" />
        <div className="min-w-0 flex-1 basis-40">
          <p className="text-lg font-semibold">Chào thầy cô!</p>
          <p className="mt-0.5 text-sm text-muted-foreground">Tóm tắt lớp học và bài nộp gần đây.</p>
        </div>
        <LegacyLink page={primary.page} className={buttonVariants({ className: 'w-full sm:w-auto' })}>
          {primary.label} <ArrowRight />
        </LegacyLink>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {statsFor(role).map((s) => (
          <StatCard key={s.label} {...s} />
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Bài nộp gần đây</CardTitle>
          <CardDescription>
            Sắp xếp và chuyển trang ngay trên máy, không tải lại.
          </CardDescription>
        </CardHeader>
        <div className="px-2 pb-3">
          <DataTable
            caption="Bài nộp gần đây"
            columns={submissionColumns(true)}
            rows={SAMPLE_ROWS}
            rowKey={(r) => r.id}
            pageSize={8}
          />
        </div>
      </Card>
    </div>
  );
}
