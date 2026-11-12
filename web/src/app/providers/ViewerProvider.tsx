import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { ROLE_LABEL, type ViewerRole } from '@/app/navigation';

/* Người đang xem app.
   • Chưa đăng nhập: vai trò XEM THỬ (chỉ đổi menu, không mở dữ liệu nào) — mặc định Học sinh.
   • Đã đăng nhập (cổng nhân sự, features/auth/StaffGate): vai trò THẬT từ hồ sơ users/{uid}.
   Quyền thật vẫn do firestore.rules quyết định — đây chỉ là lớp giao diện. */

export interface StaffIdentity {
  uid: string;
  role: ViewerRole;
  name: string;
  email: string;
}

interface Viewer {
  role: ViewerRole;
  /** true khi chưa đăng nhập (vai trò là xem thử). */
  preview: boolean;
  session: StaffIdentity | null;
  setPreviewRole(role: ViewerRole): void;
  setSession(s: StaffIdentity | null): void;
  /** Gán bởi StaffGate — đăng xuất thật (EduAuth.logoutUser) rồi về trang đăng nhập. */
  logout: (() => void) | null;
  setLogout(fn: (() => void) | null): void;
}

const KEY = 'ic3v2.previewRole';
const ViewerContext = createContext<Viewer | null>(null);

function readRole(): ViewerRole {
  try {
    const v = localStorage.getItem(KEY);
    if (v && v in ROLE_LABEL) return v as ViewerRole;
  } catch { /* localStorage bị chặn: dùng mặc định */ }
  return 'guest';
}

export function ViewerProvider({ children }: { children: ReactNode }) {
  const [previewRole, setRole] = useState<ViewerRole>(readRole);
  const [session, setSession] = useState<StaffIdentity | null>(null);
  const [logout, setLogoutState] = useState<(() => void) | null>(null);
  const setPreviewRole = useCallback((r: ViewerRole) => {
    setRole(r);
    try { localStorage.setItem(KEY, r); } catch { /* bỏ qua */ }
  }, []);
  const setLogout = useCallback((fn: (() => void) | null) => setLogoutState(() => fn), []);

  const value = useMemo<Viewer>(
    () => ({
      role: session ? session.role : previewRole,
      preview: !session,
      session,
      setPreviewRole,
      setSession,
      logout,
      setLogout,
    }),
    [previewRole, session, setPreviewRole, logout, setLogout],
  );
  return <ViewerContext.Provider value={value}>{children}</ViewerContext.Provider>;
}

export function useViewer(): Viewer {
  const v = useContext(ViewerContext);
  if (!v) throw new Error('useViewer phải nằm trong <ViewerProvider>');
  return v;
}
