import { useState } from 'react';
import { Award, Backpack, Check, GitBranch, History, Lock, Pencil, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AVATARS, type AvatarId } from '../assets';
import { useBlock } from '../demo/DemoState';
import { ACHIEVEMENTS, ITEMS, ME, SKILLS } from '../demo/data';
import { ACTOR_NAME, DEMO_PROFILE, MY_REALM } from '../demo/engineDemo';
import type { HistoryEntry } from '../engine';
import { ELEMENTS, REALMS, TX_STATUS } from '../model';
import { DataBlock, Segmented } from '../ui/controls';
import { historyLabel, vnTime } from '../ui/labels';
import { Modal } from '../ui/overlay';
import { ElementBars, Panel, RarityTag, RealmSeal, TrAvatar, TrLink, TrPageHeader } from '../ui/primitives';

/* Hồ sơ nhân vật: chân dung, danh hiệu, cảnh giới, năm linh căn, bộ kỹ năng, vật phẩm, thành tựu, lịch sử tu luyện.
   Học viên chỉ được đổi chân dung và danh hiệu (trong số đã đạt) — đúng quyền ở FIREBASE_SECURITY.md §2. */

function RealmLadder() {
  return (
    <ol className="grid grid-cols-7 gap-1" aria-label="Bảy cảnh giới">
      {REALMS.map((r) => {
        const passed = r.id < MY_REALM;
        const cur = r.id === MY_REALM;
        return (
          <li key={r.id} className="flex flex-col items-center gap-1 text-center" aria-current={cur ? 'step' : undefined}>
            <RealmSeal realm={r.id} size={36} className={cn(!passed && !cur && 'opacity-35 grayscale')} />
            <span className={cn('text-[10px] leading-tight sm:text-xs', cur ? 'font-semibold text-foreground' : 'text-muted-foreground')}>{r.name}</span>
            <span className={cn('h-1 w-full rounded-full', passed ? 'bg-el-moc' : cur ? 'bg-gold' : 'bg-muted')} />
          </li>
        );
      })}
    </ol>
  );
}

const NODE = {
  learned: { cls: 'border-transparent bg-primary/12 text-foreground', icon: Check, label: 'Đã học' },
  available: { cls: 'border-primary border-dashed', icon: Sparkles, label: 'Có thể học' },
  locked: { cls: 'border-dashed text-muted-foreground', icon: Lock, label: 'Chưa mở' },
} as const;

export function CharacterPage() {
  const [avatar, setAvatar] = useState<AvatarId>(ME.avatar);
  const [title, setTitle] = useState(ME.title);
  const [editing, setEditing] = useState(false);
  const titles = ITEMS.filter((i) => i.kind === 'danh-hieu' && i.owned > 0);
  const equippedItems = useBlock(ITEMS.filter((i) => ['i1', 'i5', 'i10'].includes(i.id)));
  const [kind, setKind] = useState<'all' | HistoryEntry['kind']>('all');
  const ledger = useBlock(DEMO_PROFILE.history.filter((h) => kind === 'all' || h.kind === kind));
  const E = DEMO_PROFILE.elements;
  const skills = useBlock(SKILLS);
  const achievements = useBlock(ACHIEVEMENTS.filter((a) => a.earned && a.tier === 'chinh-thuc'));

  return (
    <div className="space-y-5">
      <TrPageHeader title="Hồ sơ nhân vật" plain="Thông tin cá nhân" description="Con đường tu luyện của em: cảnh giới, năng lực, vật phẩm và mọi lần nhận công huân." />

      <section className="grid gap-5 rounded-2xl border bg-card p-5 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
        <div className="flex items-center gap-4 lg:flex-col lg:items-start">
          <TrAvatar id={avatar} size={88} framed />
          <div className="min-w-0">
            <p className="text-xl font-semibold">{ME.name}</p>
            <p className="text-sm text-gold">{title}</p>
            <p className="text-sm text-muted-foreground">{ME.sect} · {ME.className}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => setEditing(true)}><Pencil /> Đổi chân dung, danh hiệu</Button>
          </div>
        </div>
        <div className="min-w-0 space-y-4">
          <RealmLadder />
          <p className="text-sm">
            <span className="font-semibold">{DEMO_PROFILE.realm.name} · {DEMO_PROFILE.stage.stage}</span>
            {DEMO_PROFILE.stage.peak && <span className="text-gold"> · đỉnh phong (đủ công huân, còn chờ điều kiện đột phá)</span>}
          </p>
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div className="rounded-lg bg-muted p-3"><dt className="text-xs text-muted-foreground">Công huân</dt><dd className="font-mono text-lg font-semibold tabular-nums">{DEMO_PROFILE.exp.toLocaleString('vi-VN')}</dd></div>
            <div className="rounded-lg bg-muted p-3"><dt className="text-xs text-muted-foreground">Tu vi luyện tập</dt><dd className="font-mono text-lg font-semibold tabular-nums">{ME.tuVi.toLocaleString('vi-VN')}</dd></div>
            <div className="rounded-lg bg-muted p-3"><dt className="text-xs text-muted-foreground">Thời gian tu luyện</dt><dd className="font-mono text-lg font-semibold tabular-nums">{DEMO_PROFILE.activityMinutes} phút</dd></div>
            <div className="rounded-lg bg-muted p-3"><dt className="text-xs text-muted-foreground">Mã học viên</dt><dd className="truncate font-mono text-sm font-semibold">{ME.learnerId}</dd></div>
          </dl>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        <Panel title="Năm linh căn" description="Điểm mạnh hiện tại, tính từ bài đánh giá có xác thực (bài gần đây nặng hơn). Chỉ để gợi ý — không khoá lộ trình nào.">
          <ElementBars values={{ kim: E.kim?.score ?? null, moc: E.moc?.score ?? null, thuy: E.thuy?.score ?? null, hoa: E.hoa?.score ?? null, tho: E.tho?.score ?? null }} />
        </Panel>
        <Panel title="Bộ kỹ năng" icon={GitBranch} description="Kỹ năng mở theo thứ tự trong từng linh căn.">
          <DataBlock state={skills} empty={{ title: 'Chưa có kỹ năng' }}>
            {(groups) => (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {groups.map((g) => {
                  const e = ELEMENTS.find((x) => x.id === g.element)!;
                  return (
                    <div key={g.element}>
                      <p className={cn('mb-2 text-sm font-semibold', e.text)}>{e.name} <span className="font-normal text-muted-foreground">· {e.plain}</span></p>
                      <ol className="relative space-y-1.5 border-l pl-3">
                        {g.nodes.map((n) => {
                          const s = NODE[n.state];
                          return (
                            <li key={n.name} className={cn('flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs', s.cls)}>
                              <s.icon className="size-3.5 shrink-0" aria-label={s.label} />
                              <span className="min-w-0">{n.name}</span>
                            </li>
                          );
                        })}
                      </ol>
                    </div>
                  );
                })}
              </div>
            )}
          </DataBlock>
        </Panel>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Vật phẩm đang dùng" icon={Backpack} action={<TrLink to="tui-can-khon" className="text-sm text-primary hover:underline">Túi Càn Khôn</TrLink>}>
          <DataBlock state={equippedItems} empty={{ title: 'Chưa dùng vật phẩm nào' }}>
            {(list) => (
              <ul className="space-y-2">
                {list.map((i) => <li key={i.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">{i.name}<RarityTag rarity={i.rarity} /></li>)}
              </ul>
            )}
          </DataBlock>
        </Panel>
        <Panel title="Thành tựu chính thức" icon={Award} action={<TrLink to="thanh-tuu" className="text-sm text-primary hover:underline">Tất cả</TrLink>}>
          <DataBlock state={achievements} empty={{ title: 'Chưa có thành tựu chính thức' }}>
            {(list) => (
              <ul className="space-y-2">
                {list.map((a) => <li key={a.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"><span className="min-w-0 truncate">{a.name}</span><span className="text-xs text-muted-foreground">{a.earned}</span></li>)}
              </ul>
            )}
          </DataBlock>
        </Panel>
      </div>

      <Panel title="Lịch sử tu luyện" icon={History} description="Sổ cái chỉ thêm, không sửa: công huân, đột phá, vật phẩm, thành tựu — kèm thời điểm và người xác nhận.">
        <Segmented
          label="Lọc lịch sử"
          value={kind}
          onChange={setKind}
          items={[{ id: 'all', label: 'Tất cả' }, { id: 'exp', label: 'Công huân' }, { id: 'realm', label: 'Cảnh giới' }, { id: 'item', label: 'Vật phẩm' }, { id: 'achievement', label: 'Thành tựu' }]}
        />
        <div className="mt-3">
          <DataBlock state={ledger} empty={{ title: 'Chưa có dòng nào', description: 'Qua khảo hạch, bài kiểm tra có xác thực hoặc nộp sản phẩm để bắt đầu lịch sử tu luyện.' }}>
            {(rows) => (
              <>
                <table className="hidden w-full text-sm md:table">
                  <thead className="text-left text-xs text-muted-foreground">
                    <tr className="border-b">
                      <th className="py-2 font-medium">Thời gian</th><th className="py-2 font-medium">Loại</th><th className="py-2 font-medium">Chi tiết</th>
                      <th className="py-2 text-right font-medium">Công huân</th><th className="py-2 pl-4 font-medium">Trạng thái</th><th className="py-2 font-medium">Xác nhận</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((h) => {
                      const l = historyLabel(h);
                      return (
                        <tr key={h.txId} className="border-b last:border-0">
                          <td className="py-2 font-mono text-xs tabular-nums">{vnTime(h.at)}</td>
                          <td className="py-2">{l.kind}</td>
                          <td className="py-2 text-muted-foreground">{l.detail}</td>
                          <td className={cn('py-2 text-right font-mono tabular-nums', h.status === 'confirmed' && 'text-gold', h.status === 'pending' && 'text-muted-foreground', (h.status === 'rejected' || h.status === 'reversed') && 'text-muted-foreground line-through')}>
                            {h.amount === undefined ? '—' : `+${h.amount}`}
                          </td>
                          <td className="py-2 pl-4">{h.status ? <Badge tone={TX_STATUS[h.status].tone}>{TX_STATUS[h.status].label}</Badge> : <Badge>Ghi nhận</Badge>}</td>
                          <td className="py-2 text-muted-foreground">{ACTOR_NAME[h.by] ?? h.by}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <ul className="divide-y md:hidden">
                  {rows.map((h) => {
                    const l = historyLabel(h);
                    return (
                      <li key={h.txId} className="flex items-start justify-between gap-3 py-2.5 text-sm">
                        <div className="min-w-0">
                          <p className="font-medium">{l.kind} · <span className="font-normal text-muted-foreground">{l.detail}</span></p>
                          <p className="font-mono text-xs text-muted-foreground">{vnTime(h.at)} · {ACTOR_NAME[h.by] ?? h.by}</p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          {h.amount !== undefined && <span className="font-mono tabular-nums">+{h.amount}</span>}
                          {h.status ? <Badge tone={TX_STATUS[h.status].tone}>{TX_STATUS[h.status].label}</Badge> : <Badge>Ghi nhận</Badge>}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </DataBlock>
        </div>
      </Panel>

      <Modal
        open={editing}
        onClose={() => setEditing(false)}
        title="Đổi chân dung, danh hiệu"
        description="Chỉ chọn được danh hiệu em đã đạt."
        footer={<Button onClick={() => setEditing(false)}>Xong</Button>}
      >
        <fieldset>
          <legend className="text-sm font-medium">Chân dung</legend>
          <div className="mt-2 grid grid-cols-6 gap-2">
            {(Object.keys(AVATARS) as AvatarId[]).map((id) => (
              <button key={id} type="button" onClick={() => setAvatar(id)} aria-pressed={avatar === id} aria-label={AVATARS[id].label} className={cn('rounded-full p-0.5', avatar === id && 'ring-2 ring-primary')}>
                <TrAvatar id={id} size={44} />
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset className="mt-5">
          <legend className="text-sm font-medium">Danh hiệu</legend>
          <div className="mt-2 space-y-1.5">
            {titles.map((t) => (
              <label key={t.id} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                <input type="radio" name="tr-title" checked={title === t.name} onChange={() => setTitle(t.name)} className="accent-[var(--primary)]" />
                {t.name} <RarityTag rarity={t.rarity} />
              </label>
            ))}
          </div>
        </fieldset>
      </Modal>
    </div>
  );
}
