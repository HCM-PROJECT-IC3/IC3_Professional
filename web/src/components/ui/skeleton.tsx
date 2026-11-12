import * as React from 'react';
import { cn } from '@/lib/utils';

/** Khối chờ tải. Nhấp nháy nhẹ; tắt hẳn khi người dùng chọn giảm chuyển động (globals.css). */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden className={cn('animate-pulse rounded-md bg-muted', className)} {...props} />;
}
