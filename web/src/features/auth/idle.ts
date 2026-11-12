import { useEffect, useRef, useState } from 'react';

/* Tự đăng xuất khi không thao tác — CÙNG luật với js/idle-logout.js để tab cũ và tab 2.0
   đếm chung 1 đồng hồ (signOut của Firebase đăng xuất MỌI tab):
     • khoá chung 'edu_idle_last_activity' (localStorage), ghi tối đa 1 lần/5 giây
     • 'edu_idle_remember' = '0' (máy dùng chung) → 15 phút, còn lại → 60 phút
     • cảnh báo trước 60 giây; trình chiếu toàn màn hình / video đang phát = vẫn đang dùng
     • tính theo giờ thật (Date.now), không dựa setTimeout */

const ACTIVITY_KEY = 'edu_idle_last_activity';
const REMEMBER_KEY = 'edu_idle_remember';
const WARNING_MS = 60_000;
const CHECK_MS = 5_000;
const WRITE_GAP_MS = 5_000;

function read(k: string) {
  try { return localStorage.getItem(k); } catch { return null; }
}
function write(k: string, v: string) {
  try { localStorage.setItem(k, v); } catch { /* bị chặn: vẫn đếm trong tab */ }
}

export function idleLimitMin() {
  return read(REMEMBER_KEY) === '0' ? 15 : 60;
}

/** Trả về số giây còn lại khi đang trong 60 giây cảnh báo (null = không cảnh báo). */
export function useIdleLogout(active: boolean, onTimeout: () => void) {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const lastLocal = useRef(Date.now());
  const lastWrite = useRef(0);
  const fired = useRef(false);
  const cb = useRef(onTimeout);
  cb.current = onTimeout;

  useEffect(() => {
    if (!active) return;
    const limitMs = idleLimitMin() * 60_000;
    const mark = () => {
      const now = Date.now();
      lastLocal.current = now;
      if (now - lastWrite.current >= WRITE_GAP_MS) {
        lastWrite.current = now;
        write(ACTIVITY_KEY, String(now));
      }
      setSecondsLeft(null);
    };
    const busy = () =>
      !!document.fullscreenElement ||
      [...document.querySelectorAll('video, audio')].some((m) => !(m as HTMLMediaElement).paused && !(m as HTMLMediaElement).ended);
    const tick = () => {
      if (busy()) return mark();
      const last = Math.max(lastLocal.current, Number(read(ACTIVITY_KEY)) || 0);
      const left = limitMs - (Date.now() - last);
      if (left <= 0) {
        if (!fired.current) {
          fired.current = true;
          cb.current();
        }
      } else setSecondsLeft(left <= WARNING_MS ? Math.ceil(left / 1000) : null);
    };
    const events = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'scroll'] as const;
    events.forEach((e) => window.addEventListener(e, mark, { passive: true }));
    mark();
    const id = window.setInterval(tick, CHECK_MS);
    return () => {
      events.forEach((e) => window.removeEventListener(e, mark));
      window.clearInterval(id);
    };
  }, [active]);

  return secondsLeft;
}
