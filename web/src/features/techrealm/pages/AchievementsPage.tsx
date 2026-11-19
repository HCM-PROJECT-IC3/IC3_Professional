import { useMemo, useState } from 'react';
import { Award, HelpCircle, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBlock } from '../demo/DemoState';
import { ACHIEVEMENTS, type Achievement } from '../demo/data';
import { DataBlock, Segmented, Tabs } from '../ui/controls';
import { Meter, TrPageHeader } from '../ui/primitives';

/* Thành tựu: 2 tầng như sổ cái — "Chính thức" (từ dữ liệu đã xác thực, có giá trị trên bảng xếp hạng) và
   "Luyện tập" (tính trên máy). Không trộn 2 tầng trong cùng một con số. */

type Tier = Achievement['tier'];
type Show = 'all' | 'earned' | 'todo';

function Tile({ a }: { a: Achievement }) {
  const earned = !!a.earned;
  const official = a.tier === 'chinh-thuc';
  return (
    <div className={cn('flex h-full gap-3 rounded-xl border bg-card p-4', !earned && 'bg-muted/40')}>
      <span
        className={cn(
          'grid size-11 shrink-0 place-items-center rounded-lg border-2',
          earned ? (official ? 'border-gold text-gold' : 'border-primary text-primary') : 'border-dashed border-muted-foreground/40 text-muted-foreground',
        )}
      >
        {a.hidden ? <HelpCircle className="size-5" aria-hidden /> : official ? <ShieldCheck className="size-5" aria-hidden /> : <Award className="size-5" aria-hidden />}
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn('text-sm font-semibold', !earned && 'text-muted-foreground')}>{a.name}</p>
        <p className="text-xs text-muted-foreground">{a.desc}</p>
        {earned ? (
          <p className="mt-1.5 text-xs">Đạt {a.earned}</p>
        ) : (
          a.progress && <Meter className="mt-2" label="" value={a.progress[0]} max={a.progress[1]} size="sm" />
        )}
      </div>
    </div>
  );
}

export function AchievementsPage() {
  const [tier, setTier] = useState<Tier>('chinh-thuc');
  const [show, setShow] = useState<Show>('all');
  const list = useMemo(
    () => ACHIEVEMENTS.filter((a) => a.tier === tier && (show === 'all' || (show === 'earned' ? !!a.earned : !a.earned))),
    [tier, show],
  );
  const state = useBlock(list);
  const count = (t: Tier) => ACHIEVEMENTS.filter((a) => a.tier === t);

  return (
    <div className="space-y-5">
      <TrPageHeader
        title="Thành tựu"
        plain="Huy hiệu"
        description="Dấu mốc trên đường tu luyện. Thành tựu chính thức được xác nhận từ bài kiểm tra, khảo hạch và sản phẩm thầy cô duyệt."
      />
      <Tabs
        label="Loại thành tựu"
        value={tier}
        onChange={setTier}
        items={[
          { id: 'chinh-thuc', label: 'Chính thức', count: count('chinh-thuc').filter((a) => a.earned).length },
          { id: 'luyen-tap', label: 'Luyện tập', count: count('luyen-tap').filter((a) => a.earned).length },
        ]}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented label="Lọc" value={show} onChange={setShow} items={[{ id: 'all', label: 'Tất cả' }, { id: 'earned', label: 'Đã đạt' }, { id: 'todo', label: 'Chưa đạt' }]} />
        <p className="text-sm text-muted-foreground">
          Đã đạt <span className="font-mono font-semibold text-foreground">{count(tier).filter((a) => a.earned).length}/{count(tier).length}</span>
        </p>
      </div>
      <DataBlock state={state} loadingRows={4} empty={{ title: show === 'earned' ? 'Chưa đạt thành tựu nào ở đây' : 'Không có thành tựu nào', description: 'Tiếp tục tu luyện để mở khóa.' }}>
        {(items) => (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((a) => <li key={a.id}><Tile a={a} /></li>)}
          </ul>
        )}
      </DataBlock>
    </div>
  );
}
