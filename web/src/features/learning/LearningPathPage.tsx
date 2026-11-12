import { useMemo, useState } from 'react';
import { ArrowRight, CheckCircle2, Circle, Route } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatCard } from '@/components/shared/StatCard';
import { EmptyState, ErrorState, LoadingState } from '@/components/shared/States';
import { useMeta } from '@/features/learning/meta';
import { LegacyLink } from '@/features/legacy/LegacyLink';
import { StudentPicker } from '@/features/student/StudentPicker';
import { useStudent } from '@/features/student/useStudent';
import { PASS, STEP_LABEL, buildPath, pathLevels, studentRecords, type MasteryState, type PathStep } from '@/features/student/progress';
import { cn } from '@/lib/utils';

/* Lộ trình học — theo mạch "Bài N" của cấp độ (PPCT), mức nắm vững từ lịch sử TRÊN MÁY.
   Công thức chép đúng js/learning-hub.js § buildPath. 0 Firebase: mục lục = data/ic3/meta.json (tĩnh).
   Làm bài vẫn ở trang cũ (chấm điểm, tự lưu, nộp bài). */

const LEVEL_KEY = 'ic3v2.pathLevel';

const STATE_TONE: Record<MasteryState, 'neutral' | 'red' | 'orange' | 'green' | 'blue'> = {
  new: 'neutral',
  bad: 'red',
  warn: 'orange',
  good: 'green',
  great: 'blue',
};

function readLevel() {
  try {
    return localStorage.getItem(LEVEL_KEY);
  } catch {
    return null;
  }
}

function StepRow({ s, isNext }: { s: PathStep; isNext: boolean }) {
  const Icon = s.state === 'good' || s.state === 'great' ? CheckCircle2 : Circle;
  return (
    <li className={cn('flex items-center gap-3 px-5 py-3', isNext && 'bg-secondary/50')}>
      <Icon
        className={cn('size-5 shrink-0', s.state === 'good' || s.state === 'great' ? 'text-step-2' : 'text-muted-foreground/60')}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{s.name}</p>
        <p className="text-xs text-muted-foreground">
          {s.attempts ? `TB ${s.avg}% · cao nhất ${s.best}% · ${s.attempts} lần` : 'Chưa làm'}
          {isNext && <span className="font-medium text-foreground"> · nên làm tiếp</span>}
        </p>
      </div>
      <Badge tone={STATE_TONE[s.state]}>{STEP_LABEL[s.state]}</Badge>
    </li>
  );
}

export function LearningPathPage() {
  const { students, student, pick, version } = useStudent();
  const meta = useMeta();
  const [levelKey, setLevelKey] = useState<string | null>(readLevel);

  const data = useMemo(() => {
    if (!meta.cats) return null;
    const recs = student ? studentRecords(student.key) : [];
    const levels = pathLevels(recs, meta.cats);
    if (!levels.length) return { levels, path: null };
    const cur = levels.find((l) => `${l.catId}|${l.levelId}` === levelKey) ?? levels[0];
    return { levels, cur, path: buildPath(recs, meta.cats, cur.catId, cur.levelId) };
    // version: tab sảnh ghi bài mới → tính lại
  }, [meta.cats, student, levelKey, version]);

  const chooseLevel = (k: string) => {
    setLevelKey(k);
    try {
      localStorage.setItem(LEVEL_KEY, k);
    } catch {
      /* bỏ qua */
    }
  };

  const header = (
    <PageHeader
      title="Lộ trình học"
      description={student ? `${student.name}${student.cls ? ' · Lớp ' + student.cls : ''} — theo kết quả làm bài trên máy này.` : 'Đi theo mạch bài của chương trình, ôn chỗ còn yếu trước.'}
      actions={student ? <StudentPicker students={students} value={student.key} onPick={pick} /> : undefined}
    />
  );

  if (meta.error) {
    return (
      <div className="space-y-6">
        {header}
        <Card>
          <ErrorState title="Chưa tải được mục lục đề" description={meta.error} onRetry={meta.retry} />
        </Card>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="space-y-6">
        {header}
        <Card className="p-5">
          <LoadingState rows={5} />
        </Card>
      </div>
    );
  }
  if (!data.path || !data.cur) {
    return (
      <div className="space-y-6">
        {header}
        <Card>
          <EmptyState title="Chưa có lộ trình" description="Mục lục đề chưa có cấp độ nào chia theo bài." />
        </Card>
      </div>
    );
  }

  const P = data.path;
  const pct = P.steps.length ? (P.passed / P.steps.length) * 100 : 0;

  return (
    <div className="space-y-6">
      {header}

      <Card className="flex flex-wrap items-center gap-3 p-3">
        <label className="flex min-w-0 flex-1 items-center gap-2 text-sm">
          <Route className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="sr-only">Cấp độ</span>
          <select
            value={`${data.cur.catId}|${data.cur.levelId}`}
            onChange={(e) => chooseLevel(e.target.value)}
            className="h-9 w-full min-w-0 rounded-md border bg-card px-2 text-sm sm:w-72"
          >
            {data.levels.map((l) => (
              <option key={`${l.catId}|${l.levelId}`} value={`${l.catId}|${l.levelId}`}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        <span className="text-sm tabular-nums text-muted-foreground">
          Đạt {P.passed}/{P.steps.length} bài
        </span>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Đã đạt" value={`${P.passed}/${P.steps.length}`} hint={`Điểm TB 3 lần gần nhất ≥ ${PASS}%`} tone="green" />
        <StatCard label="Vững" value={P.great} hint="≥ 90%, ít nhất 2 lần" tone="blue" />
        <StatCard label="Điểm TB các bài đã làm" value={P.avg === null ? '–' : `${P.avg}%`} tone="neutral" />
        <StatCard label="Chưa làm" value={P.steps.filter((s) => s.state === 'new').length} tone="orange" />
      </div>

      <Card className="p-5">
        <Progress value={pct} label="Tiến độ lộ trình" />
        {P.complete ? (
          <p className="mt-3 text-sm">
            Em đã đạt mọi bài của <b>{P.levelName}</b>. Giấy chứng nhận nhận ở Góc học tập trong trang luyện tập.
          </p>
        ) : (
          P.next && (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1 basis-60">
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Nên làm tiếp</p>
                <p className="mt-0.5 font-semibold">{P.next.name}</p>
                <p className="text-sm text-muted-foreground">{P.reason}</p>
              </div>
              <LegacyLink page="index.html" className={buttonVariants({ className: 'w-full sm:w-auto' })}>
                Vào luyện tập <ArrowRight />
              </LegacyLink>
            </div>
          )
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Các bài trong {P.levelName}</CardTitle>
          <CardDescription>
            Theo thứ tự chương trình. Ở trang luyện tập, chọn {data.cur.levelId} rồi chọn đúng tên bài để làm.
          </CardDescription>
        </CardHeader>
        <ul className="divide-y border-t">
          {P.steps.map((s) => (
            <StepRow key={s.name} s={s} isNext={P.next?.name === s.name} />
          ))}
        </ul>
      </Card>
    </div>
  );
}
