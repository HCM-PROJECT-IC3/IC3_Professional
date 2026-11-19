import { Swords, Users, UserRound } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { cn, legacyUrl } from '@/lib/utils';
import { useBlock } from '../demo/DemoState';
import { ARENA_MODES, ITEMS } from '../demo/data';
import { DataBlock } from '../ui/controls';
import { Panel, RarityTag, TrLink, TrPageHeader } from '../ui/primitives';

/* Đấu Trường: lối vào arena.html ĐANG CHẠY (WebRTC, 0 Firebase). Trang này không thêm luật thi đấu nào. */

const ICON = { journey: UserRound, solo: Swords, room: Users } as const;

export function ArenaPage() {
  const modes = useBlock(ARENA_MODES);
  const pets = useBlock(ITEMS.filter((i) => i.kind === 'linh-vat' && i.owned > 0));
  return (
    <div className="space-y-5">
      <TrPageHeader
        title="Đấu Trường"
        plain="Thi đấu"
        description="Luận võ bằng kiến thức: một mình với đối thủ máy, hoặc cả lớp trong phòng thầy cô mở. Thắng nhận xu mở hộp linh vật."
      />
      <DataBlock state={modes} empty={{ title: 'Đấu Trường tạm đóng' }}>
        {(list) => (
          <ul className="grid gap-3 md:grid-cols-3">
            {list.map((m) => {
              const Icon = ICON[m.id as keyof typeof ICON];
              return (
                <li key={m.id} className="flex flex-col rounded-xl border bg-card p-4">
                  <span className="grid size-10 place-items-center rounded-lg bg-violet/12 text-violet"><Icon className="size-5" aria-hidden /></span>
                  <p className="mt-3 font-semibold">{m.name}</p>
                  <p className="text-sm text-muted-foreground">{m.plain}</p>
                  <a href={legacyUrl(m.page)} className={cn(buttonVariants({ size: 'sm' }), 'mt-4 self-start')}>Vào Đấu Trường</a>
                </li>
              );
            })}
          </ul>
        )}
      </DataBlock>
      <Panel title="Linh vật đang có" action={<TrLink to="tui-can-khon" className="text-sm text-primary hover:underline">Túi Càn Khôn</TrLink>}>
        <DataBlock state={pets} empty={{ title: 'Chưa có linh vật', description: 'Thắng trận ở Đấu Trường để nhận xu mở hộp.' }}>
          {(list) => (
            <ul className="flex flex-wrap gap-2">
              {list.map((p) => (
                <li key={p.id} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                  {p.name} <RarityTag rarity={p.rarity} /> {p.owned > 1 && <span className="font-mono text-xs text-muted-foreground">×{p.owned}</span>}
                </li>
              ))}
            </ul>
          )}
        </DataBlock>
      </Panel>
    </div>
  );
}
