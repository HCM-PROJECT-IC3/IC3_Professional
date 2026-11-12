import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { LogIn } from 'lucide-react';
import type { Role } from '@/domain/legacy';
import type { ViewerRole } from '@/app/navigation';
import { useViewer } from '@/app/providers/ViewerProvider';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Mascot } from '@/components/shared/Mascot';
import { ErrorState, LoadingState } from '@/components/shared/States';
import { idleLimitMin, useIdleLogout } from '@/features/auth/idle';
import { loadLegacy } from '@/services/legacy/runtime';
import { need, type FirebaseUserLite, type StaffProfile } from '@/services/legacy/types';

/* Cổng nhân sự — làm lại ĐÚNG luật của js/auth-guard.js (đọc lại trước khi sửa):
     chưa đăng nhập → mời đăng nhập · không có hồ sơ → từ chối · sai vai trò → từ chối
     · giáo viên approved === false → chờ duyệt · còn lại → vào.
   Hồ sơ đọc qua EduAuth.onAuthReady (bản đệm chung: tối đa 1 lượt đọc users/{uid} / 5 phút,
   chuyển qua lại giữa trang cũ và 2.0 không đọc lại).
   Chống F5 dồn dập như auth-guard (08/11/2026): mở lại < 4 giây → hoãn tải dữ liệu 1,5 giây. */

type GateState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'signedOut' }
  | { kind: 'denied'; message: string; signOut: boolean }
  | { kind: 'ready'; user: FirebaseUserLite; profile: StaffProfile };

interface StaffCtx {
  user: FirebaseUserLite;
  profile: StaffProfile;
}
const StaffContext = createContext<StaffCtx | null>(null);

export function useStaff(): StaffCtx {
  const v = useContext(StaffContext);
  if (!v) throw new Error('useStaff phải nằm trong <StaffGate>');
  return v;
}

/** Đường quay lại sau khi đăng nhập — login.html nằm ở gốc, ?next= tương đối theo gốc. */
function loginUrl(extra = '') {
  const next = 'app/' + location.search + location.hash;
  return `../login.html?${extra}next=${encodeURIComponent(next)}`;
}

const RAPID_RELOAD_MS = 4000;
const RELOAD_SETTLE_MS = 1500;
function settleDelay() {
  const key = 'edu:guard:lastLoad:' + location.pathname + location.hash;
  try {
    const prev = Number(sessionStorage.getItem(key)) || 0;
    sessionStorage.setItem(key, String(Date.now()));
    const gap = Date.now() - prev;
    return prev && gap >= 0 && gap < RAPID_RELOAD_MS ? RELOAD_SETTLE_MS : 0;
  } catch {
    return 0;
  }
}

export function StaffGate({
  roles,
  bundle,
  children,
}: {
  roles: Role[];
  bundle: readonly string[];
  children: ReactNode;
}) {
  const [state, setState] = useState<GateState>({ kind: 'loading' });
  const { setSession, setLogout } = useViewer();
  const rolesKey = roles.join('|');
  const unlocked = useRef<string | null>(null);

  useEffect(() => {
    let alive = true;
    const allowed = rolesKey.split('|');
    (async () => {
      try {
        await loadLegacy(bundle);
      } catch (e) {
        if (alive) setState({ kind: 'error', message: (e as Error).message });
        return;
      }
      const delay = settleDelay();
      need(window.EduAuth, 'EduAuth').onAuthReady((user, profile) => {
        if (!alive) return;
        if (!user) {
          unlocked.current = null;
          setSession(null);
          return setState({ kind: 'signedOut' });
        }
        if (!profile) return setState({ kind: 'denied', message: 'Không tìm thấy hồ sơ tài khoản. Liên hệ quản trị viên.', signOut: true });
        if (!allowed.includes(profile.role)) {
          return setState({ kind: 'denied', message: 'Tài khoản của bạn không có quyền xem trang này.', signOut: true });
        }
        if (profile.role === 'teacher' && profile.approved === false) {
          return setState({ kind: 'denied', message: 'Tài khoản giáo viên của bạn đang chờ quản trị viên duyệt.', signOut: true });
        }
        const open = () => {
          if (!alive) return;
          unlocked.current = user.uid;
          setSession({ uid: user.uid, role: profile.role as ViewerRole, name: profile.name || user.email || '', email: user.email || '' });
          setState({ kind: 'ready', user, profile: { ...profile, uid: profile.uid || user.uid } });
        };
        if (unlocked.current === user.uid) return; // bắn lại cùng người dùng: không khởi tạo lại
        if (delay) window.setTimeout(open, delay);
        else open();
      });
    })();
    return () => {
      alive = false;
    };
  }, [bundle, rolesKey, setSession]);

  const signOutTo = useCallback(async (url: string) => {
    try {
      await window.EduAuth?.logoutUser();
    } catch {
      /* vẫn chuyển trang */
    }
    setSession(null);
    window.location.href = url;
  }, [setSession]);

  const ready = state.kind === 'ready';
  useEffect(() => {
    if (!ready) return;
    setLogout(() => signOutTo('../login.html'));
    return () => setLogout(null);
  }, [ready, setLogout, signOutTo]);

  const idleLeft = useIdleLogout(ready, () => signOutTo(loginUrl(`reason=idle&min=${idleLimitMin()}&`)));

  if (state.kind === 'loading') {
    return (
      <Card className="p-6">
        <p className="mb-4 text-sm text-muted-foreground">Đang kiểm tra đăng nhập…</p>
        <LoadingState />
      </Card>
    );
  }
  if (state.kind === 'error') {
    return (
      <Card>
        <ErrorState title="Không tải được thành phần đăng nhập" description={`${state.message}. Kiểm tra mạng rồi thử lại.`} onRetry={() => location.reload()} />
      </Card>
    );
  }
  if (state.kind === 'signedOut' || state.kind === 'denied') {
    const denied = state.kind === 'denied';
    return (
      <Card className="flex flex-col items-center gap-3 px-6 py-12 text-center">
        <Mascot mood={denied ? 'oops' : 'idle'} size={88} />
        <div>
          <p className="font-medium">{denied ? 'Không vào được trang này' : 'Thầy cô cần đăng nhập'}</p>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            {denied ? state.message : 'Trang này dành cho giáo viên và cán bộ quản lý. Học sinh không cần đăng nhập.'}
          </p>
        </div>
        {denied && state.signOut ? (
          <Button onClick={() => signOutTo(loginUrl())}>Đăng xuất & đăng nhập tài khoản khác</Button>
        ) : (
          <a href={loginUrl()} className={buttonVariants()}>
            <LogIn /> Đăng nhập
          </a>
        )}
      </Card>
    );
  }

  return (
    <StaffContext.Provider value={{ user: state.user, profile: state.profile }}>
      {children}
      {idleLeft !== null && (
        <div role="alertdialog" aria-live="assertive" className="fixed bottom-4 right-4 z-50 max-w-xs rounded-xl border bg-card p-4 shadow-lg">
          <p className="text-sm">
            Bạn không thao tác {idleLimitMin()} phút. Hệ thống tự đăng xuất sau <b className="tabular-nums">{idleLeft}s</b>.
          </p>
          <Button size="sm" className="mt-3 w-full" onClick={() => window.dispatchEvent(new Event('pointerdown'))}>
            Tiếp tục làm việc
          </Button>
        </div>
      )}
    </StaffContext.Provider>
  );
}
