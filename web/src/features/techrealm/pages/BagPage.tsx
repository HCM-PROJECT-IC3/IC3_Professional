import { useMemo, useState } from 'react';
import { BadgeCheck, Frame, Gem, PawPrint, ShoppingBag, Sword } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useBlock } from '../demo/DemoState';
import { ITEMS, ITEM_KIND, type Item, type ItemKind } from '../demo/data';
import { MY_STONES } from '../demo/engineDemo';
import { DataBlock, Tabs } from '../ui/controls';
import { Modal } from '../ui/overlay';
import { RarityTag, TrPageHeader } from '../ui/primitives';

/* Túi Càn Khôn: vật phẩm TRANG TRÍ (không đổi điểm, không đổi cảnh giới) — nên chỉ cần lưu trên máy
   (DATABASE_SCHEMA §3.13). Bản xem thử: mua/trang bị chỉ đổi trạng thái trong trang. */

const KIND_ICON: Record<ItemKind, LucideIcon> = { 'phap-bao': Sword, 'linh-vat': PawPrint, 'danh-hieu': BadgeCheck, khung: Frame };
type Tab = ItemKind | 'shop';
// Tên class viết đủ (không ghép chuỗi) để Tailwind quét thấy.
const RARITY_TILE = { 1: 'border-rar-1 text-rar-1', 2: 'border-rar-2 text-rar-2', 3: 'border-rar-3 text-rar-3', 4: 'border-rar-4 text-rar-4', 5: 'border-rar-5 text-rar-5' } as const;

function ItemTile({ item, equipped, onOpen }: { item: Item; equipped: boolean; onOpen: () => void }) {
  const Icon = KIND_ICON[item.kind];
  return (
    <button type="button" onClick={onOpen} className={cn('flex h-full w-full flex-col rounded-xl border bg-card p-3 text-left transition-colors hover:bg-accent', equipped && 'border-primary')}>
      <span className="flex items-start justify-between gap-2">
        <span className={cn('grid size-11 place-items-center rounded-lg border-2 bg-muted', RARITY_TILE[item.rarity])}>
          <Icon className="size-5" aria-hidden />
        </span>
        <RarityTag rarity={item.rarity} />
      </span>
      <span className="mt-2.5 text-sm font-medium leading-tight">{item.name}</span>
      <span className="mt-auto flex items-center gap-1.5 pt-2 text-xs text-muted-foreground">
        {equipped ? <Badge tone="blue">Đang dùng</Badge> : item.owned > 0 ? `Có ${item.owned}` : item.price ? <><Gem className="size-3 text-violet" aria-hidden /><span className="font-mono">{item.price}</span></> : 'Chưa có'}
      </span>
    </button>
  );
}

export function BagPage() {
  const [tab, setTab] = useState<Tab>('phap-bao');
  const [items, setItems] = useState(ITEMS);
  const [stones, setStones] = useState(MY_STONES);
  const [equipped, setEquipped] = useState<Record<string, string>>({ 'phap-bao': 'i1', 'danh-hieu': 'i8', khung: 'i10' });
  const [open, setOpen] = useState<Item | null>(null);
  const shown = useMemo(() => (tab === 'shop' ? items.filter((i) => i.price && i.owned === 0) : items.filter((i) => i.kind === tab && i.owned > 0)), [items, tab]);
  const state = useBlock(shown);
  const cur = open ? items.find((i) => i.id === open.id)! : null;
  const canEquip = cur && cur.owned > 0 && cur.kind !== 'linh-vat';
  const isEquipped = cur ? equipped[cur.kind] === cur.id : false;

  const buy = () => {
    if (!cur?.price || stones < cur.price) return;
    setStones(stones - cur.price);
    setItems(items.map((i) => (i.id === cur.id ? { ...i, owned: 1 } : i)));
  };

  return (
    <div className="space-y-5">
      <TrPageHeader
        title="Túi Càn Khôn"
        plain="Vật phẩm"
        description="Pháp bảo, linh vật, danh hiệu và khung chân dung. Tất cả để trang trí hồ sơ — không đổi điểm số hay cảnh giới."
        actions={
          <span className="flex items-center gap-2 rounded-lg border bg-card px-3 py-1.5 text-sm">
            <Gem className="size-4 text-violet" aria-hidden /> <span className="font-mono font-semibold tabular-nums">{stones}</span> linh thạch
          </span>
        }
      />
      <Tabs
        label="Loại vật phẩm"
        value={tab}
        onChange={setTab}
        items={[
          ...(Object.keys(ITEM_KIND) as ItemKind[]).map((k) => ({ id: k as Tab, label: ITEM_KIND[k], count: items.filter((i) => i.kind === k && i.owned > 0).length })),
          { id: 'shop', label: 'Cửa hàng' },
        ]}
      />
      <DataBlock state={state} loadingRows={4} empty={{ title: tab === 'shop' ? 'Cửa hàng đã bán hết' : 'Chưa có vật phẩm loại này', description: 'Qua bí cảnh, đạt thành tựu hoặc lên cảnh giới để nhận thêm.' }}>
        {(list) => (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {list.map((i) => (
              <li key={i.id}><ItemTile item={i} equipped={equipped[i.kind] === i.id} onOpen={() => setOpen(i)} /></li>
            ))}
          </ul>
        )}
      </DataBlock>

      <Modal
        open={!!cur}
        onClose={() => setOpen(null)}
        title={cur?.name}
        description={cur ? ITEM_KIND[cur.kind] : undefined}
        footer={
          cur && (
            <>
              <Button variant="outline" onClick={() => setOpen(null)}>Đóng</Button>
              {cur.owned === 0 && cur.price && (
                <Button onClick={buy} disabled={stones < cur.price}>
                  <ShoppingBag /> Đổi {cur.price} linh thạch
                </Button>
              )}
              {canEquip && (
                <Button variant={isEquipped ? 'outline' : 'default'} onClick={() => setEquipped({ ...equipped, [cur.kind]: isEquipped ? '' : cur.id })}>
                  {isEquipped ? 'Tháo ra' : 'Dùng'}
                </Button>
              )}
            </>
          )
        }
      >
        {cur && (
          <div className="space-y-3 text-sm">
            <p className="flex items-center gap-2"><RarityTag rarity={cur.rarity} /> {cur.desc}</p>
            <p className="text-muted-foreground">Nguồn: {cur.source}</p>
            {cur.owned === 0 && cur.price && stones < cur.price && <p role="status" className="text-destructive">Chưa đủ linh thạch — cần thêm {cur.price - stones}.</p>}
          </div>
        )}
      </Modal>
    </div>
  );
}
