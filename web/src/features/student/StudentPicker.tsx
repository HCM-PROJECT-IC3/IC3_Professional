import type { Student } from '@/features/student/progress';

/** "Không phải em?" — chọn học sinh khi máy dùng chung có nhiều em. Ẩn khi chỉ có 1 em. */
export function StudentPicker({ students, value, onPick }: { students: Student[]; value: string; onPick: (key: string) => void }) {
  if (students.length < 2) return null;
  return (
    <label className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
      <span className="whitespace-nowrap">Không phải em?</span>
      <select value={value} onChange={(e) => onPick(e.target.value)} className="h-8 max-w-56 rounded-md border bg-card px-2 text-sm text-foreground">
        {students.map((s) => (
          <option key={s.key} value={s.key}>
            {s.name}
            {s.cls ? ` · ${s.cls}` : ''}
          </option>
        ))}
      </select>
    </label>
  );
}
