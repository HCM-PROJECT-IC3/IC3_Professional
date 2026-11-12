import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router';
import { ArrowUpRight, Award, CheckCircle2, Target } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { PageHeader } from '@/components/shared/PageHeader';
import { ARENA, DAILY_BONUS_XP, DAILY_GAME_GOAL, MINIGAMES, SIMULATORS, readGame, type GameEntry } from '@/features/play/games';
import { WATCH_KEYS } from '@/features/student/progress';
import { useStorageVersion } from '@/hooks/useStorageVersion';
import { legacyUrl } from '@/lib/utils';

/* Khu vui chơi — gom Đấu trường, mini-game, mô phỏng. Mỗi thẻ MỞ TRANG CŨ (game chạy, ghi XP như trước).
   Số liệu (nhiệm vụ hôm nay, số lượt) đọc eduquiz_gamestate trên máy — 0 Firebase. */

function GameCard({ g, plays }: { g: GameEntry; plays?: number }) {
  const Icon = g.icon;
  return (
    <a
      href={legacyUrl(g.page)}
      className="group flex items-start gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-primary/50 hover:bg-accent focus-visible:border-primary"
    >
      <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-secondary text-secondary-foreground">
        <Icon className="size-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 font-medium">
          {g.title}
          <ArrowUpRight className="size-3.5 opacity-0 transition-opacity group-hover:opacity-60" aria-hidden />
        </span>
        <span className="mt-0.5 line-clamp-2 block text-sm text-muted-foreground">{g.desc}</span>
        <span className="mt-2 flex flex-wrap items-center gap-1.5">
          {g.skill && <Badge>{g.skill}</Badge>}
          {plays !== undefined && plays > 0 && <Badge tone="blue">Đã chơi {plays} lượt</Badge>}
        </span>
      </span>
    </a>
  );
}

function Section({ title, desc, children }: { title: string; desc: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{desc}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{children}</div>
    </section>
  );
}

export function GameHubPage() {
  const version = useStorageVersion(WATCH_KEYS);
  const { daily, counts, s } = useMemo(() => readGame(), [version]);
  const done = daily.done || daily.games >= DAILY_GAME_GOAL;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Khu vui chơi"
        description="Ôn bài bằng trò chơi — kết quả và XP lưu ngay trên máy em."
        actions={
          <Link to="/thanh-tich" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
            <Award /> Thành tích · {s.xp.toLocaleString('vi-VN')} XP
          </Link>
        }
      />

      <Card className="flex flex-wrap items-center gap-4 p-4 sm:p-5">
        <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-step-3/12 text-step-3">
          {done ? <CheckCircle2 className="size-5" aria-hidden /> : <Target className="size-5" aria-hidden />}
        </span>
        <div className="min-w-0 flex-1 basis-56">
          <p className="font-semibold">{done ? 'Đã xong nhiệm vụ hôm nay' : `Nhiệm vụ hôm nay: chơi ${DAILY_GAME_GOAL} ván mini-game`}</p>
          <p className="text-sm text-muted-foreground">
            {done ? `Đã nhận +${DAILY_BONUS_XP} XP. Mai quay lại nhé!` : `Còn ${DAILY_GAME_GOAL - daily.games} ván — nhận +${DAILY_BONUS_XP} XP.`}
          </p>
        </div>
        <div className="w-full sm:w-48">
          <Progress value={(Math.min(daily.games, DAILY_GAME_GOAL) / DAILY_GAME_GOAL) * 100} label="Tiến độ nhiệm vụ hôm nay" />
          <p className="mt-1 text-right text-xs tabular-nums text-muted-foreground">
            {Math.min(daily.games, DAILY_GAME_GOAL)}/{DAILY_GAME_GOAL} ván
          </p>
        </div>
      </Card>

      <Section title="Đấu trường" desc="Chơi bộ câu hỏi theo kiểu game — một mình hoặc cùng cả lớp.">
        {ARENA.map((g) => (
          <GameCard key={g.id} g={g} />
        ))}
      </Section>

      <Section title="Mini-game" desc="Mỗi ván tính vào nhiệm vụ hôm nay.">
        {MINIGAMES.map((g) => (
          <GameCard key={g.id} g={g} plays={g.gameId ? counts[g.gameId] || 0 : undefined} />
        ))}
      </Section>

      <Section title="Mô phỏng & thư viện" desc="Thực hành như trên máy thật.">
        {SIMULATORS.map((g) => (
          <GameCard key={g.id} g={g} plays={g.gameId ? counts[g.gameId] || 0 : undefined} />
        ))}
      </Section>
    </div>
  );
}
