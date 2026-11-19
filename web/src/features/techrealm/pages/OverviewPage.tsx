import { useState } from 'react';
import { Award, BookOpen, CheckCircle2, Circle, Flame, Gem, Lightbulb, ScrollText, Sparkles, TrendingUp, Zap } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ART } from '../assets';
import { useBlock } from '../demo/DemoState';
import { ME, NEW_ACHIEVEMENTS, QUESTS, RECENT_LESSONS, SUGGESTION } from '../demo/data';
import { DEMO_PROFILE, runDemoBreakthrough } from '../demo/engineDemo';
import type { Result } from '../engine';
import { realmOf } from '../model';
import { BreakthroughDialog } from '../ui/BreakthroughDialog';
import { conditionLabel, conditionNote } from '../ui/labels';
import { DataBlock } from '../ui/controls';
import { ElementBars, Meter, Panel, RealmSeal, StatTile, TrAvatar, TrLink, lessonHref } from '../ui/primitives';

/* Tổng quan (dashboard học viên). Thứ tự đọc: mình là ai → còn bao xa tới cảnh giới sau → hôm nay làm gì. */

/** Cảnh giới + tiểu cảnh giới (Sơ / Trung / Hậu kỳ) + công huân — tính bằng luật thật (demo/engineDemo.ts). */
function Hero() {
  const p = DEMO_PROFILE;
  const next = p.next.to ? realmOf(p.next.to) : null;
  const to = p.stage.to ?? p.exp;
  return (
    <section
      className="relative overflow-hidden rounded-2xl bg-night text-night-foreground"
      style={{ backgroundImage: `url(${ART.patternNight})`, backgroundSize: '160px 120px' }}
    >
      <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-center">
        <div className="flex min-w-0 items-center gap-4">
          <TrAvatar id={ME.avatar} size={72} framed className="ring-gold-night ring-offset-night" />
          <div className="min-w-0">
            <p className="text-xs text-night-foreground/70">{ME.sect} · {ME.className}</p>
            <h1 className="truncate text-2xl font-semibold tracking-tight">{ME.name}</h1>
            <p className="mt-0.5 text-sm text-gold-night">{ME.title}</p>
          </div>
        </div>
        <div className="rounded-xl border border-white/12 bg-white/5 p-4">
          <div className="flex items-center gap-3">
            <RealmSeal realm={p.realm.id} size={44} />
            <div className="min-w-0 flex-1">
              <p className="text-xs text-night-foreground/70">Cảnh giới</p>
              <p className="text-lg font-semibold leading-tight">
                {p.realm.name} <span className="text-sm font-normal text-night-foreground/70">· {p.stage.stage}{p.stage.peak ? ' · đỉnh phong' : ''}</span>
              </p>
            </div>
          </div>
          {next && (
            <div className="mt-3">
              <div className="mb-1 flex items-baseline justify-between text-xs">
                <span className="text-night-foreground/70">Công huân tới {next.name}</span>
                <span className="font-mono tabular-nums">{p.exp.toLocaleString('vi-VN')}/{to.toLocaleString('vi-VN')}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/12" role="progressbar" aria-label={`Công huân tới ${next.name}`} aria-valuemin={0} aria-valuemax={to} aria-valuenow={p.exp}>
                <div className="h-full rounded-full bg-gold-night transition-[width] duration-700 ease-out" style={{ width: `${Math.min(100, (p.exp / to) * 100)}%` }} />
              </div>
              {p.pendingExp > 0 && <p className="mt-1.5 text-[11px] text-night-foreground/70">+{p.pendingExp} công huân đang chờ duyệt</p>}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function NextRealm() {
  const { next } = DEMO_PROFILE;
  const [result, setResult] = useState<Result | null>(null);
  const state = useBlock(next.conditions);
  if (!next.to) {
    return (
      <Panel variant="feature" icon={TrendingUp} title="Viên mãn">
        <p className="text-sm text-muted-foreground">Em đã ở cảnh giới cao nhất.</p>
      </Panel>
    );
  }
  const target = realmOf(next.to);
  const met = next.conditions.filter((c) => c.met).length;
  return (
    <Panel
      variant="feature"
      icon={TrendingUp}
      title={`Đường lên ${target.name}`}
      description="Cảnh giới chỉ tăng khi đủ cả công huân, công pháp, khảo hạch và thực hành — không chỉ dựa vào điểm luyện tập."
      action={<RealmSeal realm={next.to} size={32} />}
    >
      <DataBlock state={state} empty={{ title: 'Đã ở cảnh giới cao nhất' }}>
        {(conds) => (
          <ul className="grid gap-3 sm:grid-cols-2">
            {conds.map((c) => {
              const note = conditionNote(c);
              return (
                <li key={c.id} className="rounded-lg border p-3">
                  <p className="flex items-start gap-2 text-sm">
                    {c.met ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-el-moc" aria-label="Đã đạt" /> : <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-label="Chưa đạt" />}
                    <span className={cn(c.met && 'text-muted-foreground')}>{conditionLabel(c)}</span>
                  </p>
                  {c.target > 1 && <Meter className="mt-2 pl-6" label="" value={c.current} max={c.target} size="sm" tone={c.met ? 'moc' : 'primary'} />}
                  {note && <p className="mt-1 pl-6 text-xs text-muted-foreground">{note}</p>}
                </li>
              );
            })}
          </ul>
        )}
      </DataBlock>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <p className="text-sm text-muted-foreground">Đã đạt {met}/{next.conditions.length} điều kiện.</p>
        <Button disabled={!next.eligible} onClick={() => setResult(runDemoBreakthrough())} title={next.eligible ? undefined : 'Cần đạt đủ mọi điều kiện'}>
          <Zap /> Đột phá
        </Button>
      </div>
      <BreakthroughDialog result={result && result.to ? result : null} onClose={() => setResult(null)} />
    </Panel>
  );
}

export function OverviewPage() {
  const quests = useBlock(QUESTS);
  const lessons = useBlock(RECENT_LESSONS);
  const achievements = useBlock(NEW_ACHIEVEMENTS);
  const elements = useBlock(DEMO_PROFILE.elements, () => false);
  const suggestion = useBlock(SUGGESTION, () => false);

  return (
    <div className="space-y-5">
      <Hero />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile icon={Sparkles} label="Tu vi luyện tập" value={ME.tuVi.toLocaleString('vi-VN')} hint="Từ bài luyện và trò chơi (trên máy)" />
        <StatTile icon={Gem} label="Linh thạch" value={DEMO_PROFILE.items['linh-thach'] ?? 0} hint="Đổi vật phẩm trang trí" tone="violet" />
        <StatTile icon={Flame} label="Chuỗi ngày tu luyện" value={`${ME.streak} ngày`} hint="Học mỗi ngày để giữ chuỗi" tone="gold" />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
        <NextRealm />
        <Panel title="Linh căn" description="Năm nhóm năng lực, tính từ bài đánh giá có xác thực. Không giới hạn lộ trình của em." action={<TrLink to="nhan-vat" className="text-sm text-primary hover:underline">Chi tiết</TrLink>}>
          <DataBlock state={elements} empty={{ title: 'Chưa có dữ liệu linh căn' }}>
            {(v) => <ElementBars values={{ kim: v.kim?.score ?? null, moc: v.moc?.score ?? null, thuy: v.thuy?.score ?? null, hoa: v.hoa?.score ?? null, tho: v.tho?.score ?? null }} />}
          </DataBlock>
        </Panel>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
        <Panel title="Nhiệm vụ đang thực hiện" icon={ScrollText} action={<Badge>{QUESTS.length} nhiệm vụ</Badge>}>
          <DataBlock state={quests} empty={{ title: 'Chưa có nhiệm vụ', description: 'Nhiệm vụ thầy cô giao và nhiệm vụ ngày sẽ hiện ở đây.' }}>
            {(list) => (
              <ul className="divide-y">
                {list.map((q) => (
                  <li key={q.id} className="grid gap-2 py-3 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_10rem] sm:items-center">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{q.title}</p>
                      <p className="text-xs text-muted-foreground">{q.from} · hạn {q.due} · <span className="text-gold">{q.reward}</span></p>
                    </div>
                    <Meter label="Tiến độ" value={q.progress} max={q.target} size="sm" />
                  </li>
                ))}
              </ul>
            )}
          </DataBlock>
        </Panel>

        <Panel variant="feature" title="Nên làm tiếp" icon={Lightbulb}>
          <DataBlock state={suggestion}empty={{ title: 'Chưa có gợi ý' }}>
            {(s) => (
              <div>
                <p className="font-medium">{s.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{s.why}</p>
                <a href={lessonHref(s.src)} className={cn(buttonVariants({ size: 'sm' }), 'mt-3 w-full')}>
                  <BookOpen /> Vào luyện
                </a>
              </div>
            )}
          </DataBlock>
        </Panel>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
        <Panel title="Bài học gần đây" icon={BookOpen} action={<TrLink to="tang-kinh-cac" className="text-sm text-primary hover:underline">Tàng Kinh Các</TrLink>}>
          <DataBlock state={lessons} empty={{ title: 'Chưa học bài nào', description: 'Chọn một công pháp ở Tàng Kinh Các để bắt đầu.' }}>
            {(list) => (
              <ul className="divide-y">
                {list.map((l) => (
                  <li key={l.title + l.when} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                    <span className={cn('w-12 shrink-0 rounded-md py-1 text-center font-mono text-sm tabular-nums', l.score >= 80 ? 'bg-el-moc/12 text-el-moc' : l.score >= 65 ? 'bg-primary/10 text-primary' : 'bg-el-hoa/12 text-el-hoa')}>
                      {l.score}%
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{l.title}</p>
                      <p className="truncate text-xs text-muted-foreground">{l.course} · {l.when}</p>
                    </div>
                    <a href={lessonHref(l.src)} className={buttonVariants({ variant: 'outline', size: 'sm' })}>Luyện lại</a>
                  </li>
                ))}
              </ul>
            )}
          </DataBlock>
        </Panel>

        <Panel title="Thành tựu mới" icon={Award} action={<TrLink to="thanh-tuu" className="text-sm text-primary hover:underline">Tất cả</TrLink>}>
          <DataBlock state={achievements} empty={{ title: 'Chưa có thành tựu mới' }}>
            {(list) => (
              <ul className="space-y-3">
                {list.map((a) => (
                  <li key={a.id} className="flex gap-3">
                    <span className={cn('grid size-9 shrink-0 place-items-center rounded-lg', a.tier === 'chinh-thuc' ? 'bg-gold/12 text-gold' : 'bg-primary/10 text-primary')}>
                      <Award className="size-4" aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{a.name}</p>
                      <p className="text-xs text-muted-foreground">{a.desc} · {a.when}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </DataBlock>
        </Panel>
      </div>
    </div>
  );
}
