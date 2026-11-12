import { useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/shared/States';
import { cn } from '@/lib/utils';

/* Bảng dữ liệu dùng chung: sắp xếp + phân trang PHÍA MÁY (dữ liệu đã tải 1 lần, có limit) —
   đổi trang/sắp xếp KHÔNG gọi lại Firestore/Apps Script. Bảng rộng cuộn ngang trong khung,
   trang không bao giờ cuộn ngang. Có sẵn 3 trạng thái tải / trống / lỗi. */

export interface Column<T> {
  key: string;
  header: string;
  /** Giá trị dùng để sắp xếp (bỏ trống → cột không sắp xếp được). */
  sortValue?: (row: T) => string | number | null | undefined;
  cell: (row: T) => ReactNode;
  align?: 'left' | 'right' | 'center';
  /** Ẩn cột trên màn hình hẹp (< 640px) để bảng gọn trên điện thoại. */
  hideOnMobile?: boolean;
  className?: string;
}

type SortDir = 'asc' | 'desc';
const collator = new Intl.Collator('vi', { numeric: true, sensitivity: 'base' });

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading,
  error,
  onRetry,
  pageSize = 10,
  empty,
  caption,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
  pageSize?: number;
  empty?: { title: string; description?: ReactNode };
  caption?: string;
}) {
  const [sort, setSort] = useState<{ key: string; dir: SortDir } | null>(null);
  const [page, setPage] = useState(0);

  const sorted = useMemo(() => {
    const col = sort && columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return rows;
    const get = col.sortValue;
    const out = [...rows].sort((a, b) => {
      const x = get(a), y = get(b);
      if (x == null || x === '') return 1;
      if (y == null || y === '') return -1;
      return typeof x === 'number' && typeof y === 'number' ? x - y : collator.compare(String(x), String(y));
    });
    return sort!.dir === 'desc' ? out.reverse() : out;
  }, [rows, columns, sort]);

  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const current = Math.min(page, pages - 1);
  const visible = sorted.slice(current * pageSize, current * pageSize + pageSize);

  const toggleSort = (key: string) => {
    setPage(0);
    setSort((s) => (s?.key !== key ? { key, dir: 'asc' } : s.dir === 'asc' ? { key, dir: 'desc' } : null));
  };

  if (error) return <ErrorState onRetry={onRetry} />;
  if (!loading && rows.length === 0) {
    return <EmptyState title={empty?.title ?? 'Chưa có dữ liệu'} description={empty?.description} />;
  }

  const alignCls = (a?: Column<T>['align']) => (a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left');

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead>
            <tr className="border-b text-xs text-muted-foreground">
              {columns.map((c) => {
                const active = sort?.key === c.key;
                const Icon = !active ? ArrowUpDown : sort!.dir === 'asc' ? ArrowUp : ArrowDown;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                    className={cn('px-3 py-2.5 font-medium whitespace-nowrap', alignCls(c.align), c.hideOnMobile && 'hidden sm:table-cell')}
                  >
                    {c.sortValue ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(c.key)}
                        className={cn('inline-flex items-center gap-1 rounded hover:text-foreground', active && 'text-foreground')}
                      >
                        {c.header}
                        <Icon className={cn('size-3.5', !active && 'opacity-50')} aria-hidden />
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: Math.min(pageSize, 5) }, (_, i) => (
                  <tr key={i} className="border-b last:border-0">
                    {columns.map((c) => (
                      <td key={c.key} className={cn('px-3 py-3', c.hideOnMobile && 'hidden sm:table-cell')}>
                        <Skeleton className="h-4 w-full max-w-32" />
                      </td>
                    ))}
                  </tr>
                ))
              : visible.map((row) => (
                  <tr key={rowKey(row)} className="border-b last:border-0 hover:bg-muted/50">
                    {columns.map((c) => (
                      <td
                        key={c.key}
                        className={cn('px-3 py-2.5', alignCls(c.align), c.hideOnMobile && 'hidden sm:table-cell', c.className)}
                      >
                        {c.cell(row)}
                      </td>
                    ))}
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
      {loading && <span className="sr-only" role="status">Đang tải…</span>}
      {!loading && pages > 1 && (
        <div className="flex items-center justify-between gap-2 border-t px-3 pt-3 text-xs text-muted-foreground">
          <span className="tabular-nums">
            {current * pageSize + 1}–{Math.min(sorted.length, (current + 1) * pageSize)} / {sorted.length}
          </span>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" disabled={current === 0} onClick={() => setPage(current - 1)} aria-label="Trang trước">
              <ChevronLeft />
            </Button>
            <span className="tabular-nums">
              {current + 1}/{pages}
            </span>
            <Button variant="ghost" size="icon" disabled={current >= pages - 1} onClick={() => setPage(current + 1)} aria-label="Trang sau">
              <ChevronRight />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
