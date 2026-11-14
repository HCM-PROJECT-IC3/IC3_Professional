import { useMemo } from 'react';
import { Link } from 'react-router';
import { Award, Flame, Gamepad2, Lock, Star, Zap } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Mascot } from '@/components/shared/Mascot';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatCard } from '@/components/shared/StatCard';
import { gamification } from '@/domain/legacy';
import { BADGE_HOW, DAILY_GAME_GOAL, MINIGAMES, SIMULATORS, readGame } from '@/features/play/games';
import { WATCH_KEYS } from '@/features/student/progress';
import { useStorageVersion } from '@/hooks/useStorageVersion';
import { cn } from '@/lib/utils';

/* Thành tích — XP, cấp, huy hiệu, nhiệm vụ ngày: ĐỌC eduquiz_gamestate qua js/gamification.js (getState,
   levelForXp, xpToNextLevel, BADGE_DEFS). Ghi XP vẫn là việc của trang làm bài / game cũ. 0 Firebase.
   Lưu ý: gamification cũ tính CHUNG cho máy (không tách theo học sinh) — trang nói rõ điều đó. */

function xpIntoLevel(xp: number, level: number) {
  let lo = 0;
  let hi = xp;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (gamification.levelForXp(mid) >= level) hi = mid;
    else lo = mid + 1;
  }
  return xp - lo;
}

export function AchievementsPage() {
  const version = useStorageVersion(WATCH_KEYS);
  const { s, daily, counts } = useMemo(() => readGame(), [version]);
  const level = gamification.levelForXp(s.xp);
  const toNext = gamification.xpToNextLevel(s.xp);
  const into = xpIntoLevel(s.xp, level);
  const earned = new Set(s.badges || []);
  const names = new Map([...MINIGAMES, ...SIMULATORS].filter((g) => g.gameId).map((g) => [g.gameId!, g.title]));
  names.set('daily-challenge', 'Thử thách hôm nay');
  const played = Object.entries(counts)
    .map(([id, n]) => ({ id, n, name: names.get(id) || (id.startsWith('arena-room-') ? 'Đấu trường cả lớp' : id) }))
    .reduce<{ id: string; n: number; name: string }[]>((acc, x) => {
      const same = acc.find((a) => a.name === x.name);
      if (same) same.n += x.n;
      else acc.push({ ...x });
      return acc;
    }, [])
    .sort((a, b) => b.n - a.n);
  const maxPlays = Math.max(1, ...played.map((p) => p.n));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Thành tích"
        description="XP, cấp độ và huy hiệu — tính chung cho máy này (máy dùng chung thì cả nhóm cùng góp)."
        actions={
          <Link to="/tro-choi" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
            <Gamepad2 /> Khu vui chơi
          </Link>
        }
      />

      <Card className="flex flex-wrap items-center gap-x-5 gap-y-3 p-4 sm:p-5">
        <Mascot mood="happy" size={64} />
        <div className="min-w-0 flex-1 basis-56">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-lg font-semibold">Cấp {level}</p>
            <p className="text-sm tabular-nums text-muted-foreground">{s.xp.toLocaleString('vi-VN')} XP</p>
          </div>
          <Progress value={toNext === null ? 100 : (into / (into + toNext)) * 100} label="Tiến độ lên cấp" className="mt-2" />
          <p className="mt-1.5 text-sm text-muted-foreground">
            {toNext === null ? 'Đã đạt cấp cao nhất.' : `Còn ${toNext} XP để lên cấp ${level + 1}.`}
          </p>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Huy hiệu" value={`${earned.size}/${gamification.BADGE_DEFS.length}`} icon={Award} tone="blue" />
        <StatCard label="Chuỗi ngày làm bài" value={`${s.streak} ngày`} icon={Flame} tone="orange" />
        <StatCard label="Bài đã nộp" value={s.totalQuizzes} hint={`${s.perfectScores} bài điểm tuyệt đối`} icon={Star} tone="green" />
        <StatCard
          label="Nhiệm vụ hôm nay"
          value={daily.done ? 'Xong' : `${Math.min(daily.games, DAILY_GAME_GOAL)}/${DAILY_GAME_GOAL}`}
          hint={`Đã xong ${s.dailyQuestsDone} lần`}
          icon={Zap}
          tone="neutral"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Huy hiệu</CardTitle>
          <CardDescription>Huy hiệu khoá hiện cách đạt.</CardDescription>
        </CardHeader>
        {/* grid-cols-1 = minmax(0,1fr): thiếu nó, cột ngầm định rộng theo chữ `truncate` dài nhất → tràn ngang ở 375px. */}
        <ul className="grid grid-cols-1 gap-2 px-5 pb-5 sm:grid-cols-2 lg:grid-cols-3">
          {gamification.BADGE_DEFS.map((b) => {
            const got = earned.has(b.id);
            return (
              <li key={b.id} title={`${b.label} — ${got ? 'đã đạt' : BADGE_HOW[b.id] || 'chưa đạt'}`} className={cn('flex min-w-0 items-center gap-3 rounded-lg border p-3', !got && 'bg-muted/40')}>
                <span
                  className={cn(
                    'grid size-10 shrink-0 place-items-center rounded-full',
                    got ? 'bg-step-2/15 text-step-2' : 'bg-muted text-muted-foreground',
                  )}
                >
                  {got ? <Award className="size-5" aria-hidden /> : <Lock className="size-4" aria-hidden />}
                </span>
                <span className="min-w-0">
                  <span className={cn('block truncate text-sm font-medium', !got && 'text-muted-foreground')}>{b.label}</span>
                  <span className="block truncate text-xs text-muted-foreground">{got ? 'Đã đạt' : BADGE_HOW[b.id] || 'Chưa đạt'}</span>
                </span>
                <span className="sr-only">{got ? '(đã đạt)' : '(chưa đạt)'}</span>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Đã chơi</CardTitle>
          <CardDescription>
            {s.totalGameSessions ? `${s.totalGameSessions} lượt mini-game trên máy này.` : 'Chưa chơi lượt mini-game nào.'}
          </CardDescription>
        </CardHeader>
        {played.length ? (
          <ul className="space-y-2.5 px-5 pb-5" aria-label="Số lượt theo trò chơi">
            {played.map((p) => (
              <li key={p.id} className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_2.5rem] items-center gap-3">
                <span className="truncate text-sm">{p.name}</span>
                <span className="h-2.5 rounded-r-[4px] bg-muted">
                  <span className="block h-full rounded-r-[4px] bg-chart-1" style={{ width: `${(p.n / maxPlays) * 100}%` }} />
                </span>
                <span className="text-right text-sm tabular-nums">{p.n}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="px-5 pb-5">
            <Link to="/tro-choi" className={buttonVariants({ variant: 'outline' })}>
              <Gamepad2 /> Chọn trò chơi
            </Link>
          </div>
        )}
      </Card>
    </div>
  );
}
