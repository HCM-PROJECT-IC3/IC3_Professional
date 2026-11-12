import { useState, type ReactNode } from 'react';
import { CheckCircle2, CircleSlash, ClipboardList, Users, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable } from '@/components/shared/DataTable';
import { Mascot } from '@/components/shared/Mascot';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatCard } from '@/components/shared/StatCard';
import { EmptyState, ErrorState, LoadingState } from '@/components/shared/States';
import { grading, rbac } from '@/domain/legacy';
import { SAMPLE_ROWS } from '@/features/preview/sample';
import { submissionColumns } from '@/features/preview/submissionColumns';
import { cn } from '@/lib/utils';

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

type TableMode = 'data' | 'loading' | 'empty' | 'error';
const MODES: { id: TableMode; label: string }[] = [
  { id: 'data', label: 'Có dữ liệu' },
  { id: 'loading', label: 'Đang tải' },
  { id: 'empty', label: 'Trống' },
  { id: 'error', label: 'Lỗi' },
];

function foundationChecks() {
  const roles = Object.values(rbac.ROLES).length;
  const perms = Object.keys(rbac.PERMISSIONS).length;
  const q = { type: 'single', correct: ['B'] };
  const gradingOk =
    grading.questionStatus(q, 'B') === 'correct' &&
    grading.questionStatus(q, 'A') === 'incorrect' &&
    grading.questionStatus(q, '') === 'skipped';
  const fb = 'firebase' in window;
  return [
    { title: 'Phân quyền (js/core/rbac.js)', detail: `${roles} vai trò · ${perms} quyền`, ok: roles >= 6 && perms > 0 },
    { title: 'Luật chấm (js/core/grading.js)', detail: gradingOk ? 'Chấm câu mẫu giống bản cũ' : 'Khác bản cũ', ok: gradingOk },
    { title: 'Firebase', detail: fb ? 'Đã nạp — không mong đợi' : 'Chưa nạp — 0 lượt đọc/ghi', ok: fb ? false : null },
  ];
}

export function UiGalleryPage() {
  const [mode, setMode] = useState<TableMode>('data');

  return (
    <div className="space-y-10">
      <PageHeader
        title="Thư viện giao diện"
        description="Thành phần dùng chung của bản 2.0 — mọi màn hình mới ghép từ đây."
      />

      <Section title="Linh vật Chip" description="Chỉ xuất hiện ở lời chào, màn hình trống và lỗi.">
        <Card className="flex flex-wrap items-end gap-8 p-6">
          {(['happy', 'idle', 'oops'] as const).map((m) => (
            <figure key={m} className="flex flex-col items-center gap-2">
              <Mascot mood={m} size={88} />
              <figcaption className="text-xs text-muted-foreground">
                {m === 'happy' ? 'Chào / hoàn thành' : m === 'idle' ? 'Trống' : 'Lỗi'}
              </figcaption>
            </figure>
          ))}
        </Card>
      </Section>

      <Section title="Nút & nhãn">
        <Card className="flex flex-wrap items-center gap-2 p-5">
          <Button>Chính</Button>
          <Button variant="secondary">Phụ</Button>
          <Button variant="outline">Viền</Button>
          <Button variant="ghost">Nhẹ</Button>
          <Button disabled>Đã tắt</Button>
          <span className="mx-2 h-6 w-px bg-border" aria-hidden />
          <Badge tone="blue">Đang học</Badge>
          <Badge tone="green">Đạt</Badge>
          <Badge tone="orange">Cần ôn</Badge>
          <Badge tone="red">Chưa đạt</Badge>
          <Badge>Nháp</Badge>
        </Card>
      </Section>

      <Section title="Thẻ số liệu" description="Có sẵn trạng thái đang tải.">
        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          <StatCard label="Học sinh" value="214" hint="198 đã làm bài tuần này" icon={Users} tone="blue" />
          <StatCard label="Bài nộp 7 ngày" value="536" hint="+12% so với tuần trước" icon={ClipboardList} tone="green" />
          <StatCard label="Đang tải" value="" icon={Users} tone="neutral" loading />
          <StatCard label="Đang tải" value="" icon={ClipboardList} tone="neutral" loading />
        </div>
      </Section>

      <Section title="Bảng dữ liệu" description="Bấm tiêu đề cột để sắp xếp. Đổi trạng thái để xem cách bảng hiển thị.">
        <Card>
          <div className="flex flex-wrap gap-1 border-b p-2" role="group" aria-label="Trạng thái bảng">
            {MODES.map((m) => (
              <Button
                key={m.id}
                size="sm"
                variant={mode === m.id ? 'secondary' : 'ghost'}
                aria-pressed={mode === m.id}
                onClick={() => setMode(m.id)}
              >
                {m.label}
              </Button>
            ))}
          </div>
          <div className="px-2 py-3">
            <DataTable
              caption="Bảng mẫu"
              columns={submissionColumns(true)}
              rows={mode === 'empty' ? [] : SAMPLE_ROWS}
              rowKey={(r) => r.id}
              loading={mode === 'loading'}
              error={mode === 'error'}
              onRetry={() => setMode('data')}
              empty={{ title: 'Chưa có bài nộp', description: 'Khi học sinh nộp bài, kết quả sẽ hiện ở đây.' }}
            />
          </div>
        </Card>
      </Section>

      <Section title="Trạng thái riêng lẻ">
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="p-5">
            <p className="mb-4 text-sm font-medium">Đang tải</p>
            <LoadingState />
          </Card>
          <Card>
            <EmptyState title="Chưa có lớp nào" description="Thêm lớp ở Danh sách học sinh." compact />
          </Card>
          <Card>
            <ErrorState onRetry={() => undefined} className="py-6" />
          </Card>
        </div>
      </Section>

      <Section title="Kiểm tra nền móng" description="Dùng chung logic với giao diện cũ, không gọi Firebase.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {foundationChecks().map((c) => (
            <Card key={c.title}>
              <CardHeader className="flex-row items-start gap-3 pb-5">
                {c.ok === true ? (
                  <CheckCircle2 className="size-5 shrink-0 text-step-2" aria-label="Đạt" />
                ) : c.ok === null ? (
                  <CircleSlash className="size-5 shrink-0 text-muted-foreground" aria-label="Chưa dùng" />
                ) : (
                  <XCircle className="size-5 shrink-0 text-destructive" aria-label="Lỗi" />
                )}
                <div className={cn('min-w-0')}>
                  <CardTitle>{c.title}</CardTitle>
                  <CardDescription className="mt-1">{c.detail}</CardDescription>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      </Section>
    </div>
  );
}
