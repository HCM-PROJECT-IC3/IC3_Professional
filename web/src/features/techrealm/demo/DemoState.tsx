import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

/* Công tắc "Trạng thái dữ liệu" ở chân trang — chỉ có trong bản xem thử, để nghiệm thu đủ 4 trạng thái của mọi
   khối dữ liệu mà không cần mạng. Lưu sessionStorage (mất khi đóng tab). Khi tích hợp, `useBlock` nhận trạng thái
   thật từ service thay vì từ công tắc này; component trình bày không đổi. */
export type DemoMode = 'data' | 'loading' | 'empty' | 'error';
export const DEMO_MODES: { id: DemoMode; label: string }[] = [
  { id: 'data', label: 'Có dữ liệu' },
  { id: 'loading', label: 'Đang tải' },
  { id: 'empty', label: 'Trống' },
  { id: 'error', label: 'Lỗi mạng' },
];
const KEY = 'tr.demoMode';

const Ctx = createContext<{ mode: DemoMode; setMode: (m: DemoMode) => void }>({ mode: 'data', setMode: () => {} });

export function DemoStateProvider({ children }: { children: ReactNode }) {
  const [mode, set] = useState<DemoMode>(() => {
    try {
      const v = sessionStorage.getItem(KEY) as DemoMode | null;
      return v && DEMO_MODES.some((m) => m.id === v) ? v : 'data';
    } catch {
      return 'data';
    }
  });
  const setMode = useCallback((m: DemoMode) => {
    set(m);
    try { sessionStorage.setItem(KEY, m); } catch { /* bị chặn: vẫn đổi trong phiên */ }
  }, []);
  return <Ctx.Provider value={{ mode, setMode }}>{children}</Ctx.Provider>;
}

export const useDemoMode = () => useContext(Ctx);

export type BlockState<T> =
  | { status: 'loading' }
  | { status: 'error'; retry: () => void }
  | { status: 'empty' }
  | { status: 'ready'; data: T };

/** Dữ liệu THẬT (tải mạng / đọc máy) — công tắc xem thử vẫn ép được trạng thái tải / trống / lỗi để nghiệm thu. */
export function useLive<T>(real: { status: 'loading' } | { status: 'error'; retry: () => void } | { status: 'ready'; data: T }, isEmpty: (d: T) => boolean = (d) => Array.isArray(d) && d.length === 0): BlockState<T> {
  const { mode, setMode } = useDemoMode();
  if (mode === 'loading' || real.status === 'loading') return { status: 'loading' };
  if (mode === 'error') return { status: 'error', retry: () => setMode('data') };
  if (real.status === 'error') return real;
  if (mode === 'empty' || isEmpty(real.data)) return { status: 'empty' };
  return { status: 'ready', data: real.data };
}

/** Trạng thái 1 khối dữ liệu. `isEmpty` mặc định: mảng rỗng. */
export function useBlock<T>(data: T, isEmpty: (d: T) => boolean = (d) => Array.isArray(d) && d.length === 0): BlockState<T> {
  const { mode, setMode } = useDemoMode();
  if (mode === 'loading') return { status: 'loading' };
  if (mode === 'error') return { status: 'error', retry: () => setMode('data') };
  if (mode === 'empty' || isEmpty(data)) return { status: 'empty' };
  return { status: 'ready', data };
}
