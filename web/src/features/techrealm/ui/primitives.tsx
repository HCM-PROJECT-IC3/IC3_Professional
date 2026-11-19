import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ArrowUpRight, Lock } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { AVATARS, REALM_SEAL, type AvatarId } from '../assets';
import { ELEMENTS, RARITY, realmOf, type ElementId, type Rarity, type RealmId } from '../model';
import type { LessonSrc } from '../demo/data';
import { cn, legacyUrl } from '@/lib/utils';

/* Thành phần dùng chung của TechRealm. Hướng dẫn dùng: docs/techrealm/COMPONENT_GUIDE.md. */

/* ── Ấn cảnh giới ── */
export function RealmSeal({ realm, size = 40, className }: { realm: RealmId; size?: number; className?: string }) {
  return <img src={REALM_SEAL[realm]} width={size} height={size} alt={`Ấn ${realmOf(realm).name}`} className={cn('shrink-0', className)} />;
}

export function RealmTag({ realm, className }: { realm: RealmId; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-sm font-medium', className)}>
      <RealmSeal realm={realm} size={18} />
      {realmOf(realm).name}
    </span>
  );
}

/* ── Chân dung ── */
export function TrAvatar({ id, size = 40, framed, className }: { id: AvatarId; size?: number; framed?: boolean; className?: string }) {
  return (
    <img
      src={AVATARS[id].url}
      width={size}
      height={size}
      alt={`Chân dung ${AVATARS[id].label}`}
      className={cn('shrink-0 rounded-full', framed && 'ring-2 ring-gold ring-offset-2 ring-offset-card', className)}
    />
  );
}

/* ── Thanh tiến độ có nhãn ── */
export function Meter({
  value, max = 100, label, tone = 'primary', showValue = true, size = 'md', className,
}: {
  value: number; max?: number; label: string; tone?: 'primary' | 'gold' | 'violet' | ElementId; showValue?: boolean | string; size?: 'sm' | 'md'; className?: string;
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  const fill = { primary: 'bg-primary', gold: 'bg-gold', violet: 'bg-violet', kim: 'bg-el-kim', moc: 'bg-el-moc', thuy: 'bg-el-thuy', hoa: 'bg-el-hoa', tho: 'bg-el-tho' }[tone];
  return (
    <div className={className}>
      {(label || showValue) && (
        <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
          <span className="text-muted-foreground">{label}</span>
          {showValue && (
            <span className="font-mono tabular-nums">
              {typeof showValue === 'string' ? showValue : `${value.toLocaleString('vi-VN')}/${max.toLocaleString('vi-VN')}`}
            </span>
          )}
        </div>
      )}
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        className={cn('w-full overflow-hidden rounded-full bg-muted', size === 'sm' ? 'h-1.5' : 'h-2')}
      >
        <div className={cn('h-full rounded-full transition-[width] duration-700 ease-out', fill)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/* ── Năm linh căn: thanh ngang (dễ đọc hơn biểu đồ mạng nhện) ── */
/** null = chưa có bài đánh giá cho linh căn này (hiện "chưa đánh giá", KHÔNG coi là yếu). */
export function ElementBars({ values, compact }: { values: Record<ElementId, number | null>; compact?: boolean }) {
  return (
    <ul className={cn('grid', compact ? 'gap-2' : 'gap-3')}>
      {ELEMENTS.map((e) => (
        <li key={e.id} className="grid grid-cols-[3.25rem_minmax(0,1fr)_2rem] items-center gap-2">
          <span className={cn('text-sm font-semibold', e.text)}>{e.name}</span>
          <div className="min-w-0">
            <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={`Linh căn ${e.name} — ${e.plain}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={values[e.id] ?? undefined} aria-valuetext={values[e.id] === null ? 'chưa đánh giá' : undefined}>
              <div className={cn('h-full rounded-full transition-[width] duration-700 ease-out', e.bar)} style={{ width: `${values[e.id] ?? 0}%` }} />
            </div>
            {!compact && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{e.plain}</p>}
          </div>
          <span className="text-right font-mono text-xs tabular-nums" title={values[e.id] === null ? 'Chưa đánh giá' : undefined}>{values[e.id] ?? '—'}</span>
        </li>
      ))}
    </ul>
  );
}

/* ── Ô số liệu ── */
export function StatTile({ icon: Icon, label, value, hint, tone = 'primary' }: { icon: LucideIcon; label: string; value: ReactNode; hint?: ReactNode; tone?: 'primary' | 'gold' | 'violet' }) {
  const t = { primary: 'bg-primary/10 text-primary', gold: 'bg-gold/12 text-gold', violet: 'bg-violet/12 text-violet' }[tone];
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card p-3.5">
      <span className={cn('grid size-10 shrink-0 place-items-center rounded-lg', t)}>
        <Icon className="size-5" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-mono text-lg font-semibold leading-tight tabular-nums">{value}</p>
        {hint && <p className="truncate text-[11px] text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
}

/* ── Khung khối nội dung (Card có tiêu đề) ── */
export function Panel({
  title, description, icon: Icon, action, children, variant = 'default', className, bodyClassName,
}: {
  title: ReactNode; description?: ReactNode; icon?: LucideIcon; action?: ReactNode; children: ReactNode;
  variant?: 'default' | 'feature'; className?: string; bodyClassName?: string;
}) {
  return (
    <section className={cn('min-w-0 rounded-xl border bg-card', variant === 'feature' && 'border-t-2 border-t-gold', className)}>
      <header className="flex items-start gap-3 p-4 pb-3 sm:p-5 sm:pb-3">
        {Icon && <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />}
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold leading-tight">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </header>
      <div className={cn('px-4 pb-4 sm:px-5 sm:pb-5', bodyClassName)}>{children}</div>
    </section>
  );
}

/* ── Tiêu đề trang: tên tu tiên + tên thường ── */
export function TrPageHeader({ title, plain, description, actions }: { title: string; plain: string; description: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs font-medium tracking-wide text-primary uppercase">{plain}</p>
        <h1 className="mt-0.5 text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/* ── Nhãn phẩm cấp ── */
export function RarityTag({ rarity }: { rarity: Rarity }) {
  return <span className={cn('inline-flex rounded border px-1.5 py-px text-[11px] font-medium', RARITY[rarity].cls)}>{RARITY[rarity].name}</span>;
}

/* ── Ghi chú khoá ── */
export function LockNote({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <Lock className="size-3" aria-hidden /> {children}
    </span>
  );
}

/* ── Link sang trang cũ (làm bài, game) — mở hẳn trang, không đổi logic EduQuiz ── */
export const lessonHref = (s: LessonSrc) =>
  legacyUrl(`index.html?ct=${encodeURIComponent(s.ct)}&cap=${encodeURIComponent(s.cap)}&bai=${encodeURIComponent(s.bai)}`);

export function LegacyAnchor({ page, children, className }: { page: string; children: ReactNode; className?: string }) {
  return (
    <a href={legacyUrl(page)} className={className}>
      {children}
      <ArrowUpRight className="size-3.5 opacity-60" aria-hidden />
    </a>
  );
}

/* ── Link nội bộ TechRealm ── */
export const trPath = (p = '') => `/the-gioi${p ? `/${p}` : ''}`;
export function TrLink({ to, children, className }: { to: string; children: ReactNode; className?: string }) {
  return (
    <Link to={trPath(to)} className={className}>
      {children}
    </Link>
  );
}
