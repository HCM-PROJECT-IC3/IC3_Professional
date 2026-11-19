import { useState } from 'react';
import { BookOpen, Compass, MapPin } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ART } from '../assets';
import { useBlock } from '../demo/DemoState';
import { CHALLENGES, REGIONS } from '../demo/data';
import { MY_REALM } from '../demo/engineDemo';
import { ELEMENTS, realmOf } from '../model';
import { DataBlock } from '../ui/controls';
import { LockNote, Meter, Panel, TrLink, TrPageHeader, lessonHref } from '../ui/primitives';

/* Thế giới tu luyện: 7 vùng đất = 7 chủ đề IC3. Bản đồ là ảnh (assets/world-map.svg); điểm đánh dấu là nút HTML đặt
   theo % nên co giãn theo màn hình và bấm được bằng bàn phím. */

const el = (id: string) => ELEMENTS.find((e) => e.id === id)!;

export function WorldPage() {
  const [sel, setSel] = useState(REGIONS[3].id);
  const state = useBlock(REGIONS);
  const region = REGIONS.find((r) => r.id === sel)!;
  const locked = MY_REALM < region.minRealm;
  const e = el(region.element);

  return (
    <div className="space-y-5">
      <TrPageHeader
        title="Thế giới tu luyện"
        plain="Bản đồ chủ đề"
        description="Bảy vùng đất ứng với bảy chủ đề IC3. Vùng càng sáng là em càng nắm vững; chọn một vùng để xem bài học và bí cảnh ở đó."
      />
      <DataBlock state={state} empty={{ title: 'Chưa mở vùng đất nào' }} loadingRows={5}>
        {(regions) => (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="overflow-hidden rounded-2xl border bg-card p-2 sm:p-3">
              <div className="relative aspect-[5/3] w-full">
                <img src={ART.worldMap} alt="" className="absolute inset-0 size-full select-none" draggable={false} />
                {regions.map((r) => {
                  const on = r.id === sel;
                  const lk = MY_REALM < r.minRealm;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setSel(r.id)}
                      aria-pressed={on}
                      aria-label={`${r.name} — ${r.plain}${lk ? ' (chưa mở)' : `, nắm vững ${r.mastery}%`}`}
                      className="group absolute -translate-x-1/2 -translate-y-1/2"
                      style={{ left: `${r.x}%`, top: `${r.y}%` }}
                    >
                      <span
                        className={cn(
                          'mx-auto grid size-7 place-items-center rounded-full border-2 bg-card text-[11px] font-semibold transition-transform sm:size-9 sm:text-xs',
                          on ? 'scale-110 border-gold' : 'border-current',
                          lk ? 'text-muted-foreground opacity-70' : el(r.element).text,
                        )}
                      >
                        {r.id}
                      </span>
                      <span className={cn('mt-1 hidden whitespace-nowrap rounded bg-card/90 px-1.5 text-[11px] font-medium sm:block', on && 'text-foreground')}>{r.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <Panel variant="feature" title={region.name} description={region.plain} icon={MapPin}>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">Linh căn</dt>
                  <dd className={cn('font-semibold', e.text)}>{e.name}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Mở từ</dt>
                  <dd className="font-semibold">{realmOf(region.minRealm).name}</dd>
                </div>
              </dl>
              {locked ? (
                <p className="mt-4"><LockNote>Đạt {realmOf(region.minRealm).name} để vào vùng này.</LockNote></p>
              ) : (
                <>
                  <Meter className="mt-4" label="Nắm vững" value={region.mastery} showValue={`${region.mastery}%`} tone={region.element} />
                  <h3 className="mt-5 text-xs font-medium text-muted-foreground uppercase">Bài học trong vùng</h3>
                  <ul className="mt-2 space-y-1.5">
                    {['LV1', 'LV2'].map((cap) => {
                      const bai = `${region.id}. ${region.plain}`;
                      return (
                        <li key={cap}>
                          <a href={lessonHref({ ct: 'IC3', cap, bai })} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
                            <BookOpen className="size-4 text-muted-foreground" aria-hidden />
                            <span className="min-w-0 flex-1 truncate">{bai}</span>
                            <span className="text-xs text-muted-foreground">IC3 {cap.replace('LV', 'cấp ')}</span>
                          </a>
                        </li>
                      );
                    })}
                  </ul>
                  <TrLink to="bi-canh" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'mt-4 w-full')}>
                    <Compass /> Bí cảnh gần đây ({CHALLENGES.filter((c) => c.state === 'open').length})
                  </TrLink>
                </>
              )}
            </Panel>

            <ul className="grid gap-2 sm:grid-cols-2 lg:col-span-2 lg:grid-cols-4" aria-label="Danh sách vùng đất">
              {regions.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => setSel(r.id)}
                    className={cn('w-full rounded-lg border bg-card p-3 text-left transition-colors hover:bg-muted', r.id === sel && 'border-primary')}
                  >
                    <span className="flex items-center justify-between gap-2 text-sm font-medium">
                      {r.id}. {r.name}
                      <span className={cn('text-xs', el(r.element).text)}>{el(r.element).name}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">{r.plain}</span>
                    {MY_REALM >= r.minRealm ? (
                      <Meter className="mt-2" label="" value={r.mastery} showValue={false} size="sm" tone={r.element} />
                    ) : (
                      <span className="mt-2 block"><LockNote>{realmOf(r.minRealm).name}</LockNote></span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </DataBlock>
    </div>
  );
}
