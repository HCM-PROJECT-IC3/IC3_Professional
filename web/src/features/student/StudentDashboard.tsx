import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { ArrowDown, ArrowRight, ArrowUp, BookCheck, BookX, CalendarCheck, Flame, Minus, Route, Target } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { ScoreTrendChart } from '@/components/charts/ScoreTrendChart';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { Mascot } from '@/components/shared/Mascot';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatCard } from '@/components/shared/StatCard';
import { EmptyState } from '@/components/shared/States';
import { gamification } from '@/domain/legacy';
import { LegacyLink } from '@/features/legacy/LegacyLink';
import { StudentPicker } from '@/features/student/StudentPicker';
import { useStudent } from '@/features/student/useStudent';
import { cn } from '@/lib/utils';
import {
  GOAL_CHOICES, PASS, dueItems, goalOf, recTime,
  setGoal, streakOf, studentBook, studentRecords, topicStats, weekDone, type ExamRecord,
} from '@/features/student/progress';

/* Dashboard học sinh — KHÔNG đăng nhập, dữ liệu là lịch sử làm bài TRÊN MÁY NÀY.
   0 lượt Firebase, 0 Apps Script. Máy trường dùng chung → chọn đúng tên em. */

const fmtTime = new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

function scoreTone(score: number) {
  return score >= PASS ? 'green' : score >= 50 ? 'orange' : 'red';
}

const HISTORY_COLUMNS: Column<ExamRecord>[] = [
  {
    key: 'exam',
    header: 'Bài',
    sortValue: (r) => r.minitest || r.level || '',
    cell: (r) => (
      <div className="min-w-0 max-w-64">
        <p className="truncate font-medium">{r.minitest || 'Bài làm'}</p>
        <p className="truncate text-xs text-muted-foreground">{r.level || r.category}</p>
      </div>
    ),
  },
  {
    key: 'mode',
    header: 'Chế độ',
    cell: (r) => <Badge tone={r.examMode === 'test' ? 'blue' : 'neutral'}>{r.examMode === 'test' ? 'Kiểm tra' : 'Ôn luyện'}</Badge>,
    hideOnMobile: true,
  },
  {
    key: 'right',
    header: 'Đúng',
    cell: (r) => <span className="tabular-nums text-muted-foreground">{r.correct ?? '–'}/{r.total ?? '–'}</span>,
    align: 'right',
    hideOnMobile: true,
  },
  {
    key: 'score',
    header: 'Điểm',
    sortValue: (r) => Number(r.score) || 0,
    cell: (r) => <Badge tone={scoreTone(Number(r.score) || 0)} className="tabular-nums">{Number(r.score) || 0}%</Badge>,
    align: 'right',
  },
  {
    key: 'at',
    header: 'Thời gian',
    sortValue: (r) => recTime(r),
    cell: (r) => <span className="whitespace-nowrap text-muted-foreground tabular-nums">{fmtTime.format(recTime(r))}</span>,
    align: 'right',
    hideOnMobile: true,
  },
];

function NoData() {
  return (
    <Card>
      <EmptyState
        title="Máy này chưa có bài làm nào"
        description="Tiến độ của em lưu ngay trên máy em làm bài, không cần đăng nhập. Làm 1 bài ở sảnh là bảng này hiện số liệu."
        action={
          <LegacyLink page="index.html" className={buttonVariants()}>
            Vào luyện tập <ArrowRight />
          </LegacyLink>
        }
      />
    </Card>
  );
}

export function StudentDashboard() {
  const { students, student, pick, version } = useStudent();
  const [goalTick, setGoalTick] = useState(0);

  const data = useMemo(() => {
    if (!student) return null;
    const recs = studentRecords(student.key);
    const scores = recs.map((r) => Number(r.score) || 0);
    const recent = scores.slice(-10);
    const sb = studentBook(student.key);
    return {
      recs,
      newestFirst: [...recs].reverse(),
      avg: recent.length ? Math.round(recent.reduce((s, x) => s + x, 0) / recent.length) : null,
      streak: streakOf(recs),
      due: dueItems(sb).length,
      inBook: Object.keys(sb.items || {}).length,
      mastered: sb.mastered || 0,
      week: weekDone(recs),
      goal: goalOf(student.key),
      weak: topicStats(recs).filter((t) => t.avg < PASS).slice(0, 5),
      trend: recs.slice(-20).map((r) => ({ label: r.minitest || r.level || 'Bài làm', score: Number(r.score) || 0, at: recTime(r) })),
    };
    // goalTick: đổi mục tiêu ở trang này → tính lại (sự kiện "storage" không bắn trong chính tab ghi)
  }, [student, version, goalTick]);

  const game = useMemo(() => gamification.getState(), [version]);

  if (!student || !data) {
    return (
      <div className="space-y-6">
        <PageHeader title="Góc học tập" description="Tiến độ học IC3 & MOS của em." />
        <NoData />
      </div>
    );
  }

  const chooseGoal = (n: number) => {
    setGoal(student.key, n);
    setGoalTick((t) => t + 1);
  };

  const level = gamification.levelForXp(game.xp);
  const toNext = gamification.xpToNextLevel(game.xp);
  const into = xpIntoLevel(game.xp, level);
  const levelPct = toNext === null ? 100 : (into / (into + toNext)) * 100;
  const badgeLabels = new Map(gamification.BADGE_DEFS.map((b) => [b.id, b.label]));
  const goalPct = data.goal ? (data.week / data.goal) * 100 : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Góc học tập"
        description="Số liệu lấy từ lịch sử làm bài trên máy này — không cần đăng nhập."
        actions={
          <>
            <Link to="/lo-trinh" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
              <Route /> Lộ trình học
            </Link>
            <Link to="/so-tay" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
              <BookX /> Sổ tay câu sai
            </Link>
          </>
        }
      />

      <Card className="flex flex-wrap items-center gap-x-4 gap-y-3 p-4 sm:p-5">
        <Mascot mood="happy" size={64} />
        <div className="min-w-0 flex-1 basis-48">
          <p className="truncate text-lg font-semibold">Chào {student.name}!</p>
          <p className="truncate text-sm text-muted-foreground">
            {[student.cls && `Lớp ${student.cls}`, student.school].filter(Boolean).join(' · ') || 'Chưa có lớp/trường'}
          </p>
          <div className="mt-2">
            <StudentPicker students={students} value={student.key} onPick={pick} />
          </div>
        </div>
        <LegacyLink page="index.html" className={buttonVariants({ className: 'w-full sm:w-auto' })}>
          Vào luyện tập <ArrowRight />
        </LegacyLink>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Bài đã làm" value={data.recs.length} hint={`${data.week} bài tuần này`} icon={BookCheck} tone="blue" />
        <StatCard
          label="Điểm TB 10 bài gần nhất"
          value={data.avg === null ? '–' : `${data.avg}%`}
          hint={`Mức đạt ${PASS}%`}
          icon={Target}
          tone={data.avg !== null && data.avg >= PASS ? 'green' : 'orange'}
        />
        <StatCard label="Chuỗi ngày học" value={`${data.streak.streak} ngày`} hint={`${data.streak.days} ngày đã học`} icon={Flame} tone="orange" />
        <StatCard
          label="Câu cần ôn hôm nay"
          value={data.due}
          hint={`${data.inBook} câu trong sổ tay · ${data.mastered} đã thuộc`}
          icon={CalendarCheck}
          tone="neutral"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Điểm {data.trend.length} bài gần nhất</CardTitle>
            <CardDescription>Đường đứt = mức đạt {PASS}%. Chấm đặc = đạt, rỗng = chưa đạt. Chạm hoặc rê chuột để xem từng bài.</CardDescription>
          </CardHeader>
          <div className="px-3 pb-4 sm:px-5">
            {data.trend.length >= 2 ? (
              <ScoreTrendChart points={data.trend} pass={PASS} />
            ) : (
              <EmptyState compact title="Làm thêm bài để thấy đường tiến bộ" />
            )}
          </div>
        </Card>

        <div className="grid gap-4">
          <Card className="p-5">
            <div className="flex items-baseline justify-between gap-2">
              <p className="font-semibold">Mục tiêu tuần này</p>
              {data.goal > 0 && (
                <span className="text-sm tabular-nums text-muted-foreground">
                  {data.week}/{data.goal} bài
                </span>
              )}
            </div>
            {data.goal > 0 ? (
              <>
                <Progress value={goalPct} label="Tiến độ mục tiêu tuần" className="mt-3" />
                <p className="mt-2 text-sm text-muted-foreground">
                  {data.week >= data.goal ? 'Đã đạt mục tiêu tuần.' : `Còn ${data.goal - data.week} bài nữa.`}
                </p>
              </>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">Đặt mục tiêu nhỏ, đều đặn — em muốn làm bao nhiêu bài?</p>
            )}
            <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Chọn mục tiêu tuần">
              {GOAL_CHOICES.map((n) => (
                <Button
                  key={n}
                  size="sm"
                  variant={n === data.goal ? 'secondary' : 'outline'}
                  aria-pressed={n === data.goal}
                  onClick={() => chooseGoal(n)}
                >
                  {n} bài
                </Button>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-baseline justify-between gap-2">
              <p className="font-semibold">Cấp {level}</p>
              <span className="text-sm tabular-nums text-muted-foreground">{game.xp.toLocaleString('vi-VN')} XP</span>
            </div>
            <Progress value={levelPct} label="Tiến độ lên cấp" className="mt-3" />
            <p className="mt-2 text-sm text-muted-foreground">
              {toNext === null ? 'Đã đạt cấp cao nhất.' : `Còn ${toNext} XP để lên cấp ${level + 1}.`}
            </p>
            <p className="mt-3 text-xs text-muted-foreground">
              Huy hiệu {game.badges.length}/{gamification.BADGE_DEFS.length} · tính chung cho máy này
            </p>
            {game.badges.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {game.badges.slice(-4).map((id) => (
                  <Badge key={id} tone="blue">
                    {badgeLabels.get(id) ?? id}
                  </Badge>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Bài nên ôn lại</CardTitle>
            <CardDescription>Điểm TB 3 lần gần nhất dưới {PASS}%.</CardDescription>
          </CardHeader>
          {data.weak.length ? (
            <ul className="divide-y px-5 pb-3">
              {data.weak.map((t) => {
                const Trend = t.trend > 0 ? ArrowUp : t.trend < 0 ? ArrowDown : Minus;
                return (
                  <li key={`${t.level}|${t.label}`} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{t.label}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {t.level} · {t.attempts} lần
                      </p>
                    </div>
                    <Trend
                      className={cn('size-3.5', t.trend > 0 ? 'text-step-2' : t.trend < 0 ? 'text-destructive' : 'text-muted-foreground')}
                      aria-label={t.trend > 0 ? 'đang tăng' : t.trend < 0 ? 'đang giảm' : 'không đổi'}
                    />
                    <Badge tone={scoreTone(t.avg)} className="tabular-nums">
                      {t.avg}%
                    </Badge>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState compact title="Chưa có bài nào dưới mức đạt" description="Giữ phong độ nhé!" />
          )}
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Lịch sử bài làm</CardTitle>
            <CardDescription>Mới nhất trước. Bấm tiêu đề cột để sắp xếp.</CardDescription>
          </CardHeader>
          <div className="px-2 pb-3">
            <DataTable
              caption="Lịch sử bài làm"
              columns={HISTORY_COLUMNS}
              rows={data.newestFirst}
              rowKey={(r) => String(r.id)}
              pageSize={6}
            />
          </div>
        </Card>
      </div>
    </div>
  );
}

/** XP đã có trong cấp hiện tại — để vẽ thanh lên cấp (ngưỡng lấy gián tiếp qua xpToNextLevel). */
function xpIntoLevel(xp: number, level: number) {
  // Tìm ngưỡng của cấp hiện tại: XP nhỏ nhất vẫn cho cùng cấp.
  let lo = 0;
  let hi = xp;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (gamification.levelForXp(mid) >= level) hi = mid;
    else lo = mid + 1;
  }
  return xp - lo;
}
