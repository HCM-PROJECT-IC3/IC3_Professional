import { useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { Column } from '@/components/shared/DataTable';
import { EmptyState } from '@/components/shared/States';
import type { QuizResult } from '@/services/legacy/types';

/* Dùng chung cho các dashboard nhân sự (giáo viên, điều phối…). Ngưỡng giữ ĐÚNG trang cũ. */

export const PASS = 70; // EduModels.StudentResult.isPassing / EduAnalytics.passRate
export const SUPPORT = 60; // ngưỡng "Cần hỗ trợ" của teacher/coordinator dashboard cũ

export type RangeDays = '' | '7' | '30' | '90';
export const RANGES: { id: RangeDays; label: string }[] = [
  { id: '7', label: '7 ngày' },
  { id: '30', label: '30 ngày' },
  { id: '90', label: '90 ngày' },
  { id: '', label: 'Tất cả' },
];

const pad = (n: number) => String(n).padStart(2, '0');
export const fmtTime = (t: number) => {
  const d = new Date(t);
  return `${pad(d.getHours())}:${pad(d.getMinutes())} ${d.getDate()}/${d.getMonth() + 1}`;
};

export function tone(score: number) {
  return score >= PASS ? 'green' : score >= 50 ? 'orange' : 'red';
}

/** Lỗi đọc dữ liệu → câu dễ hiểu (hết lượt đọc / mất mạng dùng thông báo chung của firebase-config.js). */
export function errorText(e: unknown) {
  const F = window.EduFirebase;
  return F?.isQuotaOrOffline?.(e) ? F.QUOTA_HINT || 'Hết lượt đọc hôm nay hoặc mất mạng.' : (e as Error)?.message || String(e);
}

export function resultColumns({ school = false } = {}): Column<QuizResult>[] {
  const cols: Column<QuizResult>[] = [
    { key: 'name', header: 'Học sinh', sortValue: (r) => r.studentName, cell: (r) => <span className="font-medium">{r.studentName || 'Ẩn danh'}</span> },
    { key: 'class', header: 'Lớp', sortValue: (r) => r.studentClass, cell: (r) => r.studentClass || '–', hideOnMobile: true },
    {
      key: 'school',
      header: 'Trường',
      sortValue: (r) => r.studentSchool,
      cell: (r) => <span className="block max-w-40 truncate" title={r.studentSchool}>{r.studentSchool || '–'}</span>,
      hideOnMobile: true,
    },
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
  return school ? cols : cols.filter((c) => c.key !== 'school');
}

export interface PersonItem {
  key: string;
  name: string;
  meta: string;
  score?: number | null;
}

const PREVIEW = 6;
const MAX_EXPANDED = 200; // danh sách "Chưa làm bài" của điều phối có thể hàng nghìn em — không vẽ hết

export function PeopleList({
  title,
  description,
  icon: Icon,
  items,
  empty,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  items: PersonItem[];
  empty: string;
}) {
  const [all, setAll] = useState(false);
  const shown = all ? items.slice(0, MAX_EXPANDED) : items.slice(0, PREVIEW);
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
          {all && items.length > MAX_EXPANDED && (
            <li className="py-2 text-xs text-muted-foreground">
              Đang hiện {MAX_EXPANDED}/{items.length}. Danh sách đầy đủ và xuất Excel: mở bản đầy đủ.
            </li>
          )}
          {items.length > PREVIEW && (
            <li className="pt-2">
              <Button variant="ghost" size="sm" className="w-full" onClick={() => setAll((v) => !v)}>
                {all ? 'Thu gọn' : `Xem thêm ${items.length - PREVIEW}`}
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
