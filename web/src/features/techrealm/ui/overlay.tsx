import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/* Modal (giữa màn hình; điện thoại: trượt từ dưới) và Drawer (bên phải). Cả hai:
   Esc / bấm nền để đóng, giữ Tab trong hộp, trả focus về nút đã mở, khoá cuộn trang.
   Vẽ vào #tr-layer (bên trong phần tử .tr) để giữ đúng token màu TechRealm. */

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

function useOverlay(open: boolean, box: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const first = box.current?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? box.current)?.focus();
    return () => {
      document.body.style.overflow = overflow;
      prev?.focus?.();
    };
  }, [open, box]);
}

function trapKeys(e: KeyboardEvent<HTMLDivElement>, onClose: () => void) {
  if (e.key === 'Escape') {
    e.stopPropagation();
    onClose();
    return;
  }
  if (e.key !== 'Tab') return;
  const items = [...e.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE)];
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

const layer = () => document.getElementById('tr-layer') ?? document.body;

interface OverlayProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}

export function Modal({ open, onClose, title, description, children, footer, className }: OverlayProps) {
  const box = useRef<HTMLDivElement>(null);
  const id = useId();
  useOverlay(open, box);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 sm:items-center sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-t`}
        tabIndex={-1}
        onKeyDown={(e) => trapKeys(e, onClose)}
        className={cn('flex max-h-[90dvh] w-full flex-col rounded-t-2xl border bg-card text-card-foreground shadow-xl animate-tr-in outline-none sm:max-w-lg sm:rounded-2xl', className)}
      >
        <div className="flex items-start gap-3 border-b p-4 sm:p-5">
          <div className="min-w-0 flex-1">
            <h2 id={`${id}-t`} className="text-base font-semibold">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
          </div>
          <Button variant="ghost" size="icon" className="-mr-2 -mt-1" onClick={onClose} aria-label="Đóng">
            <X />
          </Button>
        </div>
        <div className="overflow-y-auto p-4 sm:p-5">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t p-4 sm:px-5">{footer}</div>}
      </div>
    </div>,
    layer(),
  );
}

export function Drawer({ open, onClose, title, description, children, footer, className }: OverlayProps) {
  const box = useRef<HTMLDivElement>(null);
  const id = useId();
  useOverlay(open, box);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end bg-black/45" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-t`}
        tabIndex={-1}
        onKeyDown={(e) => trapKeys(e, onClose)}
        className={cn('flex h-full w-full max-w-md flex-col border-l bg-card text-card-foreground shadow-xl animate-tr-panel outline-none', className)}
      >
        <div className="flex items-start gap-3 border-b p-4">
          <div className="min-w-0 flex-1">
            <h2 id={`${id}-t`} className="text-base font-semibold">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
          </div>
          <Button variant="ghost" size="icon" className="-mr-2 -mt-1" onClick={onClose} aria-label="Đóng">
            <X />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t p-4">{footer}</div>}
      </div>
    </div>,
    layer(),
  );
}
