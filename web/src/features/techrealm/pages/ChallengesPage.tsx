import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { BookOpenText, CheckCircle2, Compass, Skull, Star } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn, legacyUrl } from '@/lib/utils';
import { useBlock } from '../demo/DemoState';
import { CHALLENGES, CHALLENGE_KIND, type Challenge, type ChallengeKind } from '../demo/data';
import { MY_REALM } from '../demo/engineDemo';
import { realmOf } from '../model';
import { DataBlock, Segmented } from '../ui/controls';
import { Modal } from '../ui/overlay';
import { LockNote, Panel, TrPageHeader, trPath } from '../ui/primitives';

/* 5 bí cảnh cốt truyện (Prompt 05). Làm từng cái một: hiện chỉ Bí cảnh 1 chơi được; còn lại đã có thiết kế
   (docs/techrealm/GAME_DESIGN.md §3). Tiến độ đọc thẳng localStorage để KHÔNG kéo mã trò chơi vào gói này. */
const STORY = [
  { id: 'thanh-pho-mat-dien', n: 1, name: 'Thành phố mất điện', know: 'Vật lý · năng lượng · toán · dữ liệu', ready: true, levels: 4 },
  { id: 'hacker-xam-nhap', n: 2, name: 'Hacker xâm nhập', know: 'An toàn thông tin · mật khẩu · Internet', ready: false, levels: 4 },
  { id: 'giai-ma-co-thu', n: 3, name: 'Giải mã cổ thư', know: 'Logic · thuật toán · mật mã', ready: false, levels: 4 },
  { id: 'thanh-pho-thong-minh', n: 4, name: 'Kiến tạo thành phố thông minh', know: 'Robotics · IoT · lập trình', ready: false, levels: 4 },
  { id: 'phong-thi-nghiem', n: 5, name: 'Phòng thí nghiệm thất lạc', know: 'Khoa học · thí nghiệm · phân tích dữ liệu', ready: false, levels: 4 },
];
function storyProgress(id: string) {
  try {
    const all = JSON.parse(localStorage.getItem('tr.challenges.v1') || '{}') as Record<string, Record<string, { stars: number }>>;
    const lv = Object.values(all[id] ?? {});
    return { cleared: lv.filter((l) => l.stars > 0).length, stars: lv.reduce((t, l) => t + l.stars, 0) };
  } catch { return { cleared: 0, stars: 0 }; }
}
function StoryChallenges() {
  return (
    <Panel title="Bí cảnh cốt truyện" icon={BookOpenText} description="Mỗi bí cảnh có cốt truyện, nhân vật, bản đồ, các màn chơi, Boss và phần thưởng. Vượt đủ các màn để hoàn thành.">
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {STORY.map((b) => {
          const p = storyProgress(b.id);
          const body = (
            <>
              <span className="text-xs font-medium text-muted-foreground">Bí cảnh {b.n}</span>
              <span className="mt-1 block font-semibold leading-tight">{b.name}</span>
              <span className="mt-1 block text-xs text-muted-foreground">{b.know}</span>
              <span className="mt-auto flex items-center justify-between gap-2 pt-3 text-xs">
                {b.ready ? (p.cleared ? <span className="inline-flex items-center gap-1"><Star className="size-3.5 fill-gold text-gold" aria-hidden />{p.stars}/{b.levels * 3} · {p.cleared}/{b.levels} màn</span> : <span className="text-primary">Chơi ngay</span>) : <Badge>Đang thiết kế</Badge>}
                {b.ready && p.cleared === b.levels && <Badge tone="green">Hoàn thành</Badge>}
              </span>
            </>
          );
          return (
            <li key={b.id}>
              {b.ready
                ? <Link to={trPath(`bi-canh/${b.id}`)} className="flex h-full flex-col rounded-xl border border-t-2 border-t-gold bg-card p-3 transition-colors hover:bg-accent">{body}</Link>
                : <div className="flex h-full flex-col rounded-xl border border-dashed bg-muted/40 p-3 text-muted-foreground">{body}</div>}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

/* Bí Cảnh: thử thách theo loại. Bí cảnh "mở" dẫn sang trò chơi/mô phỏng ĐANG CÓ (trang cũ, 0 Firebase). */

type Filter = 'all' | ChallengeKind;
const FILTERS: { id: Filter; label: string }[] = [{ id: 'all', label: 'Tất cả' }, ...(Object.entries(CHALLENGE_KIND) as [ChallengeKind, string][]).map(([id, label]) => ({ id, label }))];

function Level({ n }: { n: 1 | 2 | 3 }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`Độ khó ${n}/3`}>
      {[1, 2, 3].map((i) => (
        <span key={i} className={cn('h-1.5 w-3 rounded-full', i <= n ? 'bg-violet' : 'bg-muted')} />
      ))}
    </span>
  );
}

function stateOf(c: Challenge): Challenge['state'] {
  return c.state === 'open' && MY_REALM < c.minRealm ? 'locked' : c.state;
}

export function ChallengesPage() {
  const [filter, setFilter] = useState<Filter>('all');
  const [open, setOpen] = useState<Challenge | null>(null);
  const list = useMemo(() => CHALLENGES.filter((c) => filter === 'all' || c.kind === filter), [filter]);
  const state = useBlock(list);
  const st = open ? stateOf(open) : null;

  return (
    <div className="space-y-5">
      <TrPageHeader
        title="Bí Cảnh"
        plain="Thử thách"
        description="Câu đố, logic, lập trình, khoa học, tình huống thực tế và Boss. Qua bí cảnh để nhận tu vi; Boss lần đầu còn được công huân."
      />
      <StoryChallenges />
      <h2 className="text-base font-semibold">Thử thách nhanh</h2>
      <Segmented label="Loại bí cảnh" items={FILTERS} value={filter} onChange={setFilter} />
      <DataBlock state={state} loadingRows={4} empty={{ title: 'Chưa có bí cảnh loại này', description: 'Bí cảnh mới được mở theo mùa.' }}>
        {(items) => (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((c) => {
              const s = stateOf(c);
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setOpen(c)}
                    className={cn('flex h-full w-full flex-col rounded-xl border bg-card p-4 text-left transition-colors hover:bg-accent', c.kind === 'boss' && 'border-violet/50')}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <Badge tone={c.kind === 'boss' ? 'red' : 'neutral'}>{c.kind === 'boss' && <Skull className="size-3" aria-hidden />}{CHALLENGE_KIND[c.kind]}</Badge>
                      <Level n={c.level} />
                    </span>
                    <span className="mt-3 font-semibold">{c.name}</span>
                    <span className="text-sm text-muted-foreground">{c.plain}</span>
                    <span className="mt-auto flex items-center justify-between gap-2 pt-4 text-xs">
                      <span className="text-gold">{c.reward}</span>
                      {s === 'cleared' && <span className="inline-flex items-center gap-1 text-el-moc"><CheckCircle2 className="size-3.5" aria-hidden /> Đã qua</span>}
                      {s === 'locked' && <LockNote>{realmOf(c.minRealm).name}</LockNote>}
                      {s === 'soon' && <span className="text-muted-foreground">Sắp mở</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </DataBlock>

      <Modal
        open={!!open}
        onClose={() => setOpen(null)}
        title={open?.name}
        description={open ? `${CHALLENGE_KIND[open.kind]} · ${open.plain}` : undefined}
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(null)}>Đóng</Button>
            {open?.page && (st === 'open' || st === 'cleared') && (
              <a href={legacyUrl(open.page)} className={buttonVariants()}>
                <Compass /> {st === 'cleared' ? 'Vào lại' : 'Vào bí cảnh'}
              </a>
            )}
          </>
        }
      >
        {open && (
          <div className="space-y-4 text-sm">
            <dl className="grid grid-cols-3 gap-3">
              <div><dt className="text-xs text-muted-foreground">Độ khó</dt><dd className="mt-1"><Level n={open.level} /></dd></div>
              <div><dt className="text-xs text-muted-foreground">Mở từ</dt><dd className="font-medium">{realmOf(open.minRealm).name}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Phần thưởng</dt><dd className="font-medium text-gold">{open.reward}</dd></div>
            </dl>
            <div>
              <h3 className="text-xs font-medium text-muted-foreground uppercase">Luật</h3>
              <ul className="mt-1.5 list-disc space-y-1 pl-5">{open.rules.map((r) => <li key={r}>{r}</li>)}</ul>
            </div>
            {st === 'locked' && <LockNote>Đạt {realmOf(open.minRealm).name} để vào bí cảnh này.</LockNote>}
            {st === 'soon' && <p className="text-muted-foreground">Bí cảnh đang được xây. Khi mở, em sẽ nhận thông báo.</p>}
          </div>
        )}
      </Modal>
    </div>
  );
}
