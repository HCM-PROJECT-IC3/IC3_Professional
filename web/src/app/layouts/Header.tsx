import { useCallback, useRef, useState, type ReactNode } from 'react';
import { Bell, LogIn, Menu, Moon, Sun } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { EmptyState } from '@/components/shared/States';
import { ROLE_LABEL, type ViewerRole } from '@/app/navigation';
import { useViewer } from '@/app/providers/ViewerProvider';
import { LegacyLink } from '@/features/legacy/LegacyLink';
import { useDismiss } from '@/hooks/useDismiss';
import { getTheme, setTheme, type Theme } from '@/lib/theme';
import { cn } from '@/lib/utils';

const PREVIEW_ROLES: ViewerRole[] = ['guest', 'teacher', 'teaching_coordinator', 'coordinator', 'school_admin', 'admin'];

function initials(label: string) {
  return label.split(/\s+/).filter(Boolean).slice(-2).map((w) => w[0]).join('').toUpperCase();
}

function Popover({ label, icon, children }: { label: string; icon: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, ref, close);
  return (
    <div ref={ref} className="relative">
      <Button variant="ghost" size="icon" aria-label={label} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {icon}
      </Button>
      {open && (
        <div className="absolute right-0 top-11 z-30 w-72 max-w-[calc(100vw-2rem)] rounded-xl border bg-card p-3 shadow-lg">
          {children}
        </div>
      )}
    </div>
  );
}

export function Header({ onMenu }: { onMenu: () => void }) {
  const { role, setPreviewRole } = useViewer();
  const [theme, setThemeState] = useState<Theme>(getTheme);
  const toggleTheme = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    setThemeState(next);
  };

  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b bg-background/85 px-4 backdrop-blur">
      <Button variant="ghost" size="icon" className="-ml-2 lg:hidden" onClick={onMenu} aria-label="Mở menu">
        <Menu />
      </Button>

      <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
        <span className="hidden md:inline">Xem thử với vai trò</span>
        <select
          value={role}
          onChange={(e) => setPreviewRole(e.target.value as ViewerRole)}
          className="h-8 rounded-md border bg-card px-2 text-sm text-foreground"
          aria-label="Xem thử với vai trò"
        >
          {PREVIEW_ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </select>
      </label>

      <Popover label="Thông báo" icon={<Bell />}>
        <p className="px-1 pb-1 text-sm font-medium">Thông báo</p>
        <EmptyState compact title="Chưa có thông báo" description="Thông báo lớp học sẽ hiện ở đây." />
      </Popover>

      <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label={theme === 'dark' ? 'Chuyển sang nền sáng' : 'Chuyển sang nền tối'}>
        {theme === 'dark' ? <Sun /> : <Moon />}
      </Button>

      <Popover
        label="Hồ sơ"
        icon={
          <span className="grid size-8 place-items-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">
            {initials(ROLE_LABEL[role])}
          </span>
        }
      >
        <div className="px-1">
          <p className="text-sm font-medium">{ROLE_LABEL[role]}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {role === 'guest' ? 'Học sinh không cần đăng nhập — chọn tên ở sảnh.' : 'Bản xem trước — chưa đăng nhập thật.'}
          </p>
        </div>
        {role !== 'guest' && (
          <LegacyLink page="login.html" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'mt-3 w-full')}>
            <LogIn /> Đăng nhập thầy cô
          </LegacyLink>
        )}
      </Popover>
    </header>
  );
}
