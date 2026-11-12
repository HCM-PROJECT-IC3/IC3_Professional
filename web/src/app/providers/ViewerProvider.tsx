import { createContext, useContext, useState, type ReactNode } from 'react';
import { ROLE_LABEL, type ViewerRole } from '@/app/navigation';

/* Người đang xem app.
   Phase 3: CHƯA đăng nhập thật (Phase 4 nối Firebase Auth qua profile-cache-service).
   Vai trò ở đây chỉ để XEM THỬ menu theo vai trò — không mở dữ liệu nào: dữ liệu thật
   vẫn do auth-guard.js của trang cũ + firestore.rules quyết định. 0 lượt Firebase. */

interface Viewer {
  role: ViewerRole;
  preview: boolean;
  setPreviewRole(role: ViewerRole): void;
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
  const [role, setRole] = useState<ViewerRole>(readRole);
  const setPreviewRole = (r: ViewerRole) => {
    setRole(r);
    try { localStorage.setItem(KEY, r); } catch { /* bỏ qua */ }
  };
  return <ViewerContext.Provider value={{ role, preview: true, setPreviewRole }}>{children}</ViewerContext.Provider>;
}

export function useViewer(): Viewer {
  const v = useContext(ViewerContext);
  if (!v) throw new Error('useViewer phải nằm trong <ViewerProvider>');
  return v;
}
