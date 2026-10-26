/* ============================================================
   js/idle-logout.js
   Tự động đăng xuất tài khoản (admin/teacher) sau một khoảng thời
   gian KHÔNG HOẠT ĐỘNG, để tránh quên đăng xuất trên máy dùng chung
   (phòng máy, máy tính lớp học...).

   CHỈ dùng trên các trang có đăng nhập (dashboard, admin-users,
   image-manager...) — KHÔNG dùng trên index.html vì học sinh làm
   bài không cần tài khoản.

   Cách dùng — thêm SAU auth-guard.js:
     <script src="js/firebase-config.js"></script>
     <script src="js/auth.js"></script>
     <script src="js/auth-guard.js"></script>
     <script src="js/idle-logout.js"></script>

   Thời gian (phút) — có thể ép riêng trước khi nạp file này:
     <script>window.EDU_IDLE_LIMIT_MIN = 10;</script>
   Mặc định theo ô "Ghi nhớ đăng nhập" lúc đăng nhập (EduAuth lưu IDLE_REMEMBER_KEY):
     có tích (máy cá nhân)  → REMEMBER_LIMIT_MIN
     bỏ tích (máy dùng chung) → SHARED_LIMIT_MIN

   Lỗi cũ "đang làm vẫn bị đăng xuất sau 10 phút" và cách sửa:
   - Mỗi tab đếm giờ RIÊNG, nhưng signOut() của Firebase đăng xuất MỌI tab:
     đang sửa lịch ở tab A, tab B để yên 10 phút → B đăng xuất kéo theo A.
     Giờ thời điểm hoạt động cuối dùng CHUNG mọi tab (localStorage ACTIVITY_KEY).
   - Trình chiếu toàn màn hình / video đang phát không có thao tác chuột
     nhưng vẫn là đang dùng → tính là hoạt động.
   - Tính theo giờ thật (Date.now), không dựa setTimeout — tab nền bị trình
     duyệt hãm timer hay máy ngủ dậy vẫn tính đúng.
   ============================================================ */
(function () {
  'use strict';

  const REMEMBER_LIMIT_MIN = 60;
  const SHARED_LIMIT_MIN = 15;
  const ACTIVITY_KEY = 'edu_idle_last_activity';
  const IDLE_REMEMBER_KEY = 'edu_idle_remember';
  const WARNING_MS = 60 * 1000; // cảnh báo trước 60 giây
  const CHECK_MS = 5 * 1000;
  const WRITE_GAP_MS = 5 * 1000; // ghi localStorage tối đa 1 lần/5 giây (mousemove bắn liên tục)

  function readStore(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
  function writeStore(key, v) { try { localStorage.setItem(key, v); } catch (e) { /* bị chặn: vẫn đếm trong tab */ } }

  const limitMin = window.EDU_IDLE_LIMIT_MIN
    || (readStore(IDLE_REMEMBER_KEY) === '0' ? SHARED_LIMIT_MIN : REMEMBER_LIMIT_MIN);
  const IDLE_LIMIT_MS = limitMin * 60 * 1000;

  let lastLocal = Date.now();
  let lastWrite = 0;
  let checkInterval = null;
  let warningEl = null;
  let loggingOut = false;

  function lastActivity() {
    const shared = Number(readStore(ACTIVITY_KEY)) || 0;
    return Math.max(lastLocal, shared);
  }

  function markActive() {
    const now = Date.now();
    lastLocal = now;
    if (now - lastWrite >= WRITE_GAP_MS) {
      lastWrite = now;
      writeStore(ACTIVITY_KEY, String(now));
    }
    if (warningEl && warningEl.style.display !== 'none') hideWarning();
  }

  /** Đang trình chiếu toàn màn hình hoặc có video/âm thanh đang phát = vẫn đang dùng. */
  function passivelyBusy() {
    if (document.fullscreenElement) return true;
    return Array.from(document.querySelectorAll('video, audio')).some((m) => !m.paused && !m.ended);
  }

  function buildWarningBanner() {
    const el = document.createElement('div');
    el.id = 'edu-idle-warning';
    el.setAttribute('role', 'alertdialog');
    el.innerHTML = `
      <div class="edu-idle-box">
        <div class="edu-idle-icon">⏳</div>
        <div class="edu-idle-text">
          Bạn không thao tác ${limitMin} phút rồi.<br>
          Hệ thống sẽ <b>tự đăng xuất sau <span id="edu-idle-count">60</span>s</b>.
        </div>
        <button type="button" id="edu-idle-stay">Tiếp tục làm việc</button>
      </div>`;
    const style = document.createElement('style');
    style.textContent = `
      #edu-idle-warning {
        position: fixed; bottom: 1.2rem; right: 1.2rem; z-index: 99999;
        font-family: 'Baloo 2', sans-serif;
        animation: edu-idle-in .25s ease-out;
      }
      @keyframes edu-idle-in { from { opacity:0; transform: translateY(10px); } to { opacity:1; transform: translateY(0); } }
      .edu-idle-box {
        display:flex; align-items:center; gap:.7rem;
        background:#1a1a2e; color:#fff; border-radius:14px;
        padding:.9rem 1.1rem; box-shadow:0 8px 24px rgba(0,0,0,.25); max-width: 320px;
      }
      .edu-idle-icon { font-size:1.4rem; }
      .edu-idle-text { font-size:.82rem; line-height:1.45; flex:1; }
      #edu-idle-stay {
        background:#6c63ff; color:#fff; border:none; border-radius:999px;
        padding:.5rem .9rem; font-weight:700; font-size:.78rem; cursor:pointer; white-space:nowrap;
      }
      #edu-idle-stay:hover { background:#5a52e0; }
    `;
    document.head.appendChild(style);
    document.body.appendChild(el);
    document.getElementById('edu-idle-stay').addEventListener('click', markActive);
    return el;
  }

  function showWarning(msLeft) {
    if (!warningEl) warningEl = buildWarningBanner();
    warningEl.style.display = 'block';
    const countEl = document.getElementById('edu-idle-count');
    if (countEl) countEl.textContent = Math.max(0, Math.ceil(msLeft / 1000));
  }

  function hideWarning() {
    if (warningEl) warningEl.style.display = 'none';
  }

  async function doLogout() {
    if (loggingOut) return;
    loggingOut = true;
    clearInterval(checkInterval);
    hideWarning();
    try {
      if (window.EduAuth) await EduAuth.logoutUser();
    } catch (e) {
      console.warn('[EduIdleLogout] Lỗi khi đăng xuất:', e);
    }
    // Đăng nhập lại là quay về đúng trang đang làm (login.js đọc ?next=).
    const next = location.pathname.split('/').pop() + location.search + location.hash;
    window.location.href = `login.html?reason=idle&min=${limitMin}&next=${encodeURIComponent(next)}`;
  }

  function check() {
    if (passivelyBusy()) markActive();
    const idleMs = Date.now() - lastActivity();
    const msLeft = IDLE_LIMIT_MS - idleMs;
    if (msLeft <= 0) { doLogout(); return; }
    if (msLeft <= WARNING_MS) showWarning(msLeft);
    else hideWarning();
  }

  function startTracking() {
    const activityEvents = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'scroll', 'touchstart', 'input'];
    activityEvents.forEach((evt) => document.addEventListener(evt, markActive, { passive: true, capture: true }));
    // Tab khác vừa có thao tác → cập nhật ngay (ẩn cảnh báo ở tab này luôn).
    window.addEventListener('storage', (e) => { if (e.key === ACTIVITY_KEY) check(); });
    // Quay lại tab / máy ngủ dậy → kiểm ngay, không chờ nhịp kiểm kế tiếp.
    document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
    markActive();
    checkInterval = setInterval(check, CHECK_MS);
    console.log('[EduIdleLogout] Bật tự động đăng xuất sau ' + limitMin + ' phút không hoạt động (tính chung mọi tab).');
  }

  // Chỉ bắt đầu đếm giờ SAU KHI auth-guard xác nhận đăng nhập hợp lệ,
  // để tránh đăng xuất "ma" khi trang còn đang tải / kiểm tra quyền.
  window.addEventListener('edu:ready', startTracking, { once: true });
})();
