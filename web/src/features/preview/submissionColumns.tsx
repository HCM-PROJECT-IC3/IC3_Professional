import { Badge } from '@/components/ui/badge';
import type { Column } from '@/components/shared/DataTable';
import type { SampleRow } from '@/features/preview/sample';

const fmtTime = new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

function ScoreBadge({ score }: { score: number }) {
  const tone = score >= 700 ? 'green' : score >= 500 ? 'orange' : 'red';
  return <Badge tone={tone} className="tabular-nums">{score}</Badge>;
}

export function submissionColumns(showStudent: boolean): Column<SampleRow>[] {
  const cols: Column<SampleRow>[] = [
    { key: 'student', header: 'Học sinh', sortValue: (r) => r.student, cell: (r) => <span className="font-medium">{r.student}</span> },
    { key: 'class', header: 'Lớp', sortValue: (r) => r.className, cell: (r) => r.className, hideOnMobile: true },
    { key: 'exam', header: 'Đề', sortValue: (r) => r.exam, cell: (r) => r.exam, className: 'max-w-56 truncate' },
    { key: 'score', header: 'Điểm', sortValue: (r) => r.score, cell: (r) => <ScoreBadge score={r.score} />, align: 'right' },
    {
      key: 'at',
      header: 'Thời gian',
      sortValue: (r) => r.at,
      cell: (r) => <span className="text-muted-foreground tabular-nums">{fmtTime.format(new Date(r.at))}</span>,
      align: 'right',
      hideOnMobile: true,
    },
  ];
  return showStudent ? cols : cols.filter((c) => c.key !== 'student' && c.key !== 'class');
}
