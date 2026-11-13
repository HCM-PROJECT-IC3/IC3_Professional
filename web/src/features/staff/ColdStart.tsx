import { Download, ExternalLink } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Mascot } from '@/components/shared/Mascot';
import { LegacyLink } from '@/features/legacy/LegacyLink';

/* ============================================================
   Chặn lần đọc TOÀN BỘ ngoài ý muốn (13/11/2026).

   Danh sách học sinh được trang cũ lưu trên máy (IndexedDB, EduDataCache). Đã có bản lưu — kể cả quá hạn — thì lần
   mở sau chỉ hỏi PHẦN THAY ĐỔI (rất rẻ). CHƯA có (máy mới, trình duyệt mới, hoặc ĐỊA CHỈ mới như 127.0.0.1 khi
   thử trên máy) thì trang cũ đọc lại TOÀN BỘ — với Quản trị viên là vài nghìn lượt mỗi lần.
   App 2.0 kiểm tra trước (chỉ đọc IndexedDB, 0 lượt Firebase); chưa có bản lưu thì HỎI rồi mới tải.
   Khoá phải trùng khoá trang cũ dùng — xem teacher/data-loader.js, coordinator/data-loader.js, roster-cache-service.js.
   ============================================================ */

const ALL_ACTIVE = 'roster:active:all'; // roster-cache-service.js § ROSTER_KEY (Admin: toàn bộ học sinh đang học)

/** true nếu máy đã có ít nhất 1 bản lưu danh sách học sinh trong các khoá (kể cả quá hạn). */
export async function hasLocalRoster(keys: string[]): Promise<boolean> {
  const C = window.EduDataCache;
  if (!C) return true; // không có bộ đệm → không chặn, hành xử như trang cũ
  for (const k of keys) {
    try {
      if (await C.getAsync(k, true, /* allowStale */ true)) return true;
    } catch {
      /* IndexedDB bị chặn: thử khoá khác */
    }
  }
  return false;
}

const sortedSchools = (schools?: string[]) => (schools || []).filter(Boolean).slice().sort().join('|');

/** Khoá bản lưu mà teacher/data-loader.js đọc (scopeKey = uid:các trường; Admin dùng bản toàn bộ). */
export function teacherRosterKeys(p: { uid: string; role: string; schools?: string[] }) {
  return p.role === 'admin' ? [ALL_ACTIVE, 'teacher:roster:admin-all-schools'] : [`teacher:roster:${p.uid}:${sortedSchools(p.schools)}`];
}

/** Khoá bản lưu mà coordinator/data-loader.js đọc (+ bản của Quản lý lớp cùng phạm vi — trang cũ cũng dùng làm nền). */
export function coordinatorRosterKeys(scope: { isAdmin: boolean; scopeKey: string }) {
  const K = (window as unknown as { EduRosterCache?: { SCOPED_KEYS?: { dashboard: string; manager: string } } }).EduRosterCache?.SCOPED_KEYS
    ?? { dashboard: 'coordinator:roster:', manager: 'roster-manager:' };
  return scope.isAdmin ? [ALL_ACTIVE, K.dashboard + scope.scopeKey] : [K.dashboard + scope.scopeKey, K.manager + scope.scopeKey];
}

export type ColdKind = 'teacher' | 'coordinator' | 'admin';

const COPY: Record<ColdKind, string> = {
  teacher: 'Cần tải danh sách học sinh các lớp của thầy cô từ Firebase — thường vài chục đến vài trăm lượt đọc.',
  coordinator: 'Cần tải danh sách học sinh, lớp và giáo viên của các trường được giao — có thể vài trăm đến vài nghìn lượt đọc.',
  admin: 'Quản trị viên: cần tải toàn bộ học sinh đang học của mọi trường — có thể vài nghìn lượt đọc mỗi máy (hạn mức miễn phí 50.000 lượt/ngày cho cả hệ thống).',
};

export function ColdStart({ kind, onLoad, fullPage }: { kind: ColdKind; onLoad: () => void; fullPage: string }) {
  return (
    <Card className="flex flex-col items-center gap-3 px-6 py-10 text-center">
      <Mascot mood="idle" size={80} />
      <div className="max-w-lg">
        <p className="font-medium">Lần đầu mở trên máy này</p>
        <p className="mt-1 text-sm text-muted-foreground">{COPY[kind]}</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Chỉ tốn <b>1 lần</b>: các lần sau dùng bản lưu trên máy, chỉ hỏi phần thay đổi. Trang cũ dùng chung bản lưu này.
          Thử trên một <b>địa chỉ khác</b> (vd 127.0.0.1) cũng tính là máy mới.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button onClick={onLoad}>
          <Download /> Tải dữ liệu
        </Button>
        <LegacyLink page={fullPage} className={buttonVariants({ variant: 'ghost' })}>
          Mở bản đầy đủ <ExternalLink />
        </LegacyLink>
      </div>
    </Card>
  );
}
