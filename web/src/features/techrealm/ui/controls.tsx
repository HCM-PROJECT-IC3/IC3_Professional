import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { EmptyState, ErrorState, LoadingState } from '@/components/shared/States';
import type { BlockState } from '../demo/DemoState';
import { cn } from '@/lib/utils';

/* ── Tabs: role=tablist, phím ←/→/Home/End. Nội dung tab do trang tự vẽ theo `value`. ── */
export interface TabItem<T extends string> { id: T; label: string; count?: number }

export function Tabs<T extends string>({ items, value, onChange, label, className }: { items: TabItem<T>[]; value: T; onChange: (v: T) => void; label: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const onKey = (e: KeyboardEvent) => {
    const i = items.findIndex((t) => t.id === value);
    const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: items.length - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    const t = items[(next + items.length) % items.length];
    onChange(t.id);
    ref.current?.querySelector<HTMLElement>(`[data-tab="${t.id}"]`)?.focus();
  };
  return (
    <div ref={ref} role="tablist" aria-label={label} onKeyDown={onKey} className={cn('flex gap-1 overflow-x-auto border-b', className)}>
      {items.map((t) => {
        const on = t.id === value;
        return (
          <button
            key={t.id}
            data-tab={t.id}
            role="tab"
            type="button"
            aria-selected={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(t.id)}
            className={cn(
              '-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors',
              on ? 'border-primary font-medium text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
            {t.count !== undefined && <span className="rounded bg-muted px-1.5 font-mono text-[11px] tabular-nums">{t.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

/* ── Nhóm nút chọn (lọc) ── */
export function Segmented<T extends string>({ items, value, onChange, label }: { items: { id: T; label: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          role="radio"
          aria-checked={it.id === value}
          onClick={() => onChange(it.id)}
          className={cn(
            'rounded-full border px-3 py-1 text-xs transition-colors',
            it.id === value ? 'border-primary bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground',
          )}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

/* ── Khối dữ liệu: đủ 4 trạng thái (đang tải / lỗi / trống / có dữ liệu) ── */
export function DataBlock<T>({
  state, children, empty, loadingRows = 3,
}: {
  state: BlockState<T>;
  children: (data: T) => ReactNode;
  empty: { title: string; description?: ReactNode; action?: ReactNode };
  loadingRows?: number;
}) {
  if (state.status === 'loading') return <LoadingState rows={loadingRows} className="py-2" />;
  if (state.status === 'error') return <ErrorState onRetry={state.retry} className="py-6" />;
  if (state.status === 'empty') return <EmptyState compact {...empty} />;
  return <>{children(state.data)}</>;
}
