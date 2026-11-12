import { useCallback, useEffect, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Header } from '@/app/layouts/Header';
import { Sidebar } from '@/app/layouts/Sidebar';
import { useDismiss } from '@/hooks/useDismiss';

/* Khung chung: sidebar cố định từ 1024px; dưới đó sidebar thành ngăn kéo mở bằng nút menu. */
export function AppShell() {
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const { pathname } = useLocation();

  useDismiss(open, panel, close);
  useEffect(close, [pathname, close]);
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    if (open) panel.current?.querySelector<HTMLElement>('a,button')?.focus();
  }, [open]);

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[256px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-dvh border-r bg-card lg:block">
        <Sidebar />
      </aside>

      {open && (
        <div className="fixed inset-0 z-40 bg-black/40 lg:hidden">
          <div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            className="relative h-full w-72 max-w-[85vw] border-r bg-card shadow-xl"
          >
            <Button variant="ghost" size="icon" className="absolute right-2 top-2.5" onClick={close} aria-label="Đóng menu">
              <X />
            </Button>
            <Sidebar onNavigate={close} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-col">
        <Header onMenu={() => setOpen(true)} />
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
