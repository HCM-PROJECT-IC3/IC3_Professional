import { Gift } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { realmOf, type RealmId } from '../model';
import { itemName } from './labels';
import { Modal } from './overlay';
import { RealmSeal } from './primitives';

/* Hiệu ứng đột phá — PHẲNG, ~1,3 giây, chỉ chạy 1 lần:
   ấn cảnh giới cũ mờ đi → vòng ấn tự vẽ quanh tâm → ấn mới hiện → tên cảnh giới + vật phẩm thưởng.
   Không hạt bay, không lấp lánh, không phát sáng. Máy bật "giảm chuyển động": globals.css tắt animation,
   ấn cũ bị ẩn (motion-reduce:hidden) → thấy ngay khung cuối. Nội dung đọc từ kết quả breakthrough() của máy chủ. */
export function BreakthroughDialog({ result, onClose }: { result: { to?: RealmId; items?: { itemId: string; qty: number }[] } | null; onClose: () => void }) {
  const to = result?.to;
  return (
    <Modal open={!!to} onClose={onClose} title="Đột phá thành công" footer={<Button onClick={onClose}>Tiếp tục tu luyện</Button>}>
      {to && (
        <div className="flex flex-col items-center text-center" role="status" aria-live="polite">
          <div className="relative grid size-32 place-items-center">
            {to > 1 && (
              <RealmSeal realm={(to - 1) as RealmId} size={64} className="absolute animate-tr-seal-out motion-reduce:hidden" />
            )}
            <svg viewBox="0 0 104 104" className="absolute inset-0 size-full -rotate-90" aria-hidden>
              <circle cx="52" cy="52" r="48" fill="none" className="stroke-gold animate-tr-ring" strokeWidth="2" strokeDasharray="302" strokeLinecap="round" />
            </svg>
            <RealmSeal realm={to} size={72} className="animate-tr-seal-in" />
          </div>
          <p className="mt-4 text-xs font-medium tracking-wide text-muted-foreground uppercase animate-tr-rise">
            {to > 1 ? `${realmOf((to - 1) as RealmId).name} → ` : ''}cảnh giới mới
          </p>
          <p className="text-2xl font-semibold text-gold animate-tr-rise">{realmOf(to).name}</p>
          <p className="text-sm text-muted-foreground animate-tr-rise">{realmOf(to).plain} · Sơ kỳ</p>
          {!!result?.items?.length && (
            <ul className="mt-4 w-full space-y-1.5 animate-tr-rise-late" aria-label="Vật phẩm nhận được">
              {result.items.map((it) => (
                <li key={it.itemId} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm">
                  <Gift className="size-4 shrink-0 text-violet" aria-hidden />
                  <span className="min-w-0 flex-1">{itemName(it.itemId)}</span>
                  {it.qty > 1 && <span className="font-mono text-xs tabular-nums">×{it.qty}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Modal>
  );
}
