import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

type Tone = 'blue' | 'green' | 'orange' | 'neutral';

const TONE: Record<Tone, string> = {
  blue: 'bg-step-1/12 text-step-1',
  green: 'bg-step-2/12 text-step-2',
  orange: 'bg-step-3/12 text-step-3',
  neutral: 'bg-muted text-muted-foreground',
};

/** Thẻ số liệu: 1 con số chính + nhãn + dòng phụ. Số lớn, nhãn nhỏ — đọc lướt được. */
export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'blue',
  loading,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: LucideIcon;
  tone?: Tone;
  loading?: boolean;
}) {
  return (
    <Card className="flex items-start gap-3 p-3.5 sm:p-4">
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs text-muted-foreground sm:text-sm">{label}</p>
        {loading ? (
          <Skeleton className="mt-2 h-7 w-20" />
        ) : (
          <p className="mt-1 text-xl font-semibold tracking-tight tabular-nums sm:text-2xl">{value}</p>
        )}
        {hint && !loading && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{hint}</p>}
      </div>
      {Icon && (
        <span className={cn('hidden size-10 shrink-0 place-items-center rounded-lg min-[400px]:grid', TONE[tone])}>
          <Icon className="size-5" aria-hidden />
        </span>
      )}
    </Card>
  );
}
