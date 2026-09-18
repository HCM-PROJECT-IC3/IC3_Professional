/* ============================================================
   js/auth-guard.js
   Chặn truy cập trang cho tới khi xác định được người dùng đã đăng
   nhập VÀ có vai trò phù hợp. Dùng trên các trang quản trị (dashboard,
   image-manager, admin-users...).

   Cách dùng — khai báo TRƯỚC khi nạp script này:
     <script>window.EDU_ALLOWED_ROLES = ['admin','teacher'];</script>
     <script src="js/firebase-config.js"></script>
     <script src="js/auth.js"></script>
     <script src="js/auth-guard.js"></script>

   Trang sẽ được ẩn (bằng cách thêm class "edu-guard-locked" vào <html>)
   cho tới khi guard xác nhận hợp lệ, lúc đó class được gỡ và sự kiện
   "edu:ready" được bắn ra kèm { user, profile }.

   MÀN HÌNH CHỜ/TỪ CHỐI — dùng đúng ảnh động người dùng cung cấp (img/anim/):
   loading.gif cho lúc "đang kiểm tra đăng nhập", 404.gif (nhân vật hang
   động) cho lúc "từ chối truy cập" — khung màn hình (#edu-guard-screen)
   phóng to hơn bản trước theo yêu cầu người dùng để ảnh rõ hơn.
   ============================================================ */
(function () {
  'use strict';

  const allowedRoles = window.EDU_ALLOWED_ROLES || ['admin', 'teacher', 'student'];
  document.documentElement.classList.add('edu-guard-locked');

  // CSS ẩn toàn bộ nội dung trong lúc chờ xác thực, tránh "nháy" nội dung nhạy cảm
  const style = document.createElement('style');
  style.textContent = `
    html.edu-guard-locked body { visibility: hidden !important; }
    #edu-guard-overlay {
      position: fixed; inset: 0; z-index: 9999; display: flex; align-items: center;
      justify-content: center; overflow: hidden;
      font-family: 'Baloo 2', sans-serif; visibility: visible !important;
      color: #333;
      /* Nền pastel động nhẹ, ĐỒNG BỘ cảm giác thương hiệu với login.html
         (xem body::before trong css/login.css) thay vì nền trắng phẳng
         cũ, đỡ "chết" khi người dùng phải nhìn màn hình này vài giây. */
      background: linear-gradient(135deg, #f3f4fb 0%, #eef3f2 50%, #fdf3e9 100%);
    }
    #edu-guard-overlay::before {
      content: ''; position: absolute; inset: -10%; pointer-events: none; z-index: 0;
      background:
        radial-gradient(32% 36% at 15% 20%, rgba(47,64,178,.16) 0%, transparent 70%),
        radial-gradient(30% 34% at 85% 15%, rgba(93,147,61,.16) 0%, transparent 70%),
        radial-gradient(34% 38% at 80% 88%, rgba(255,143,31,.14) 0%, transparent 70%);
      filter: blur(2px);
      animation: edu-guard-blob 9s ease-in-out infinite alternate;
    }
    @keyframes edu-guard-blob {
      from { transform: translate(0,0) scale(1) }
      to   { transform: translate(-2%, 2%) scale(1.05) }
    }
    /* Kích thước card/khung ảnh dùng clamp() để to hơn hẳn bản trước
       (theo đúng vùng khung vàng người dùng khoanh — to gần gấp đôi)
       nhưng vẫn RESPONSIVE: co giãn theo vw giữa 1 mức sàn (không nhỏ
       hơn bản gốc) và 1 mức trần (không to vượt quá trên màn hình lớn),
       + có media query riêng cho di động ở dưới để không bị to quá tay
       trên màn hình hẹp. */
    #edu-guard-card {
      position: relative; z-index: 1;
      display: flex; flex-direction: column; align-items: center; gap: .9rem;
      padding: clamp(2.1rem, 4vw, 3.1rem) clamp(2rem, 4vw, 2.9rem);
      background: #eef0f6;
      border-radius: 28px;
      box-shadow: 9px 9px 20px rgba(163,177,198,.55), -9px -9px 20px rgba(255,255,255,.85);
      animation: edu-guard-card-in .45s cubic-bezier(.16,1,.3,1) both;
      width: 100%;
      max-width: clamp(460px, 62vw, 760px);
      margin: 0 1.2rem;
      box-sizing: border-box;
    }
    @keyframes edu-guard-card-in {
      from { opacity: 0; transform: translateY(16px) scale(.96) }
      to   { opacity: 1; transform: translateY(0) scale(1) }
    }
    /* Khung "màn hình" neumorphism LÕM (giống bezel thiết bị) chứa
       ảnh/video minh họa — dùng chung cho cả 2 trạng thái chờ/từ chối,
       chỉ đổi nội dung media bên trong qua crossfade (xem #edu-guard-media
       + hàm swapMedia trong JS). */
    #edu-guard-screen {
      position: relative; width: 100%; max-width: clamp(360px, 52vw, 640px); aspect-ratio: 4 / 3;
      border-radius: 16px; overflow: hidden;
      background: #e2e5ee;
      box-shadow: inset 5px 5px 12px rgba(163,177,198,.6), inset -5px -5px 12px rgba(255,255,255,.85);
      display: flex; align-items: center; justify-content: center;
    }
    #edu-guard-media {
      width: 100%; height: 100%; object-fit: contain;
      animation: edu-guard-media-in .4s cubic-bezier(.16,1,.3,1) both;
    }
    @keyframes edu-guard-media-in {
      from { opacity: 0; transform: scale(.94) }
      to   { opacity: 1; transform: scale(1) }
    }
    #edu-guard-screen.denied-shake { animation: edu-guard-shake .5s ease; }
    @keyframes edu-guard-shake {
      0%, 100% { transform: translateX(0) }
      20%      { transform: translateX(-6px) }
      40%      { transform: translateX(5px) }
      60%      { transform: translateX(-4px) }
      80%      { transform: translateX(3px) }
    }
    /* 3 chấm loading dùng ĐÚNG bộ 3 màu thương hiệu IIG (cam/xanh lá/xanh
       dương — đồng bộ .btn-submit + .tab-indicator trong css/login.css),
       nảy lệch pha thay cho vòng xoay spinner cũ. */
    #edu-guard-dots { display: flex; gap: .4rem; }
    #edu-guard-dots span {
      width: 8px; height: 8px; border-radius: 50%;
      animation: edu-guard-dot 1.1s ease-in-out infinite both;
    }
    #edu-guard-dots span:nth-child(1) { background: #5d933d; animation-delay: 0s }
    #edu-guard-dots span:nth-child(2) { background: #ff8f1f; animation-delay: .15s }
    #edu-guard-dots span:nth-child(3) { background: #2f40b2; animation-delay: .3s }
    @keyframes edu-guard-dot {
      0%, 80%, 100% { transform: translateY(0); opacity: .5 }
      40%           { transform: translateY(-7px); opacity: 1 }
    }
    #edu-guard-overlay .msg {
      font-weight: 700; font-size: clamp(.92rem, 1.4vw, 1.08rem); color: #555; text-align: center;
      line-height: 1.45; animation: edu-guard-msg-in .4s .1s cubic-bezier(.16,1,.3,1) both;
    }
    @keyframes edu-guard-msg-in {
      from { opacity: 0; transform: translateY(6px) }
      to   { opacity: 1; transform: translateY(0) }
    }
    /* Màu thương hiệu IIG (cam/xanh lá/xanh dương — xem logo thật tại
       img/iig-logo.png), ĐỒNG BỘ với css/theme.css và css/login.css —
       file này tự viết CSS riêng (chạy trước khi trang tải xong nên
       không đợi được theme.css), không dùng var(--purple) được nên phải
       viết cứng, nhớ SỬA CẢ NHIỀU NƠI (login.css + theme.css) nếu đổi
       màu thương hiệu lần sau. */
    #edu-guard-overlay .btn {
      background: linear-gradient(100deg, #5d933d 0%, #ff8f1f 50%, #2f40b2 100%);
      color: #fff; border: none; border-radius: 999px; padding: clamp(.7rem, 1.4vw, .85rem) clamp(1.4rem, 3vw, 1.7rem);
      font-weight: 800; font-size: clamp(.88rem, 1.3vw, .98rem); cursor: pointer; font-family: inherit;
      box-shadow: 0 4px 14px rgba(47,64,178,.3);
      transition: transform .15s ease, box-shadow .15s ease;
      animation: edu-guard-msg-in .4s .2s cubic-bezier(.16,1,.3,1) both;
    }
    #edu-guard-overlay .btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 20px rgba(47,64,178,.4);
    }
    #edu-guard-overlay .btn:active { transform: translateY(0) }
    /* Di động — quay lại kích thước gốc (không dùng clamp trần lớn) để
       card/khung ảnh không choán hết màn hình nhỏ, vẫn chừa lề thoáng. */
    @media (max-width: 560px) {
      #edu-guard-card { max-width: calc(100% - 2.4rem); padding: 1.8rem 1.4rem; border-radius: 22px; }
      #edu-guard-screen { max-width: 100%; }
      #edu-guard-overlay .msg { font-size: .88rem; }
      #edu-guard-overlay .btn { font-size: .84rem; padding: .65rem 1.3rem; }
    }
    @media (prefers-reduced-motion: reduce) {
      #edu-guard-overlay::before, #edu-guard-card, #edu-guard-media, #edu-guard-screen,
      #edu-guard-dots span, #edu-guard-overlay .msg, #edu-guard-overlay .btn {
        animation: none !important; transition: none !important;
      }
    }
  `;
  document.head.appendChild(style);

  // Dựng bằng createElement + gán thuộc tính trực tiếp thay vì innerHTML
  // string (img chèn qua innerHTML ở 1 số trình duyệt/điều kiện không
  // tự hiện ngay) — cách này đáng tin cậy hơn.
  function buildImg(src) {
    const el = document.createElement('img');
    el.id = 'edu-guard-media';
    el.alt = '';
    el.src = src;
    return el;
  }

  const overlay = document.createElement('div');
  overlay.id = 'edu-guard-overlay';
  overlay.innerHTML = `
    <div id="edu-guard-card">
      <div id="edu-guard-screen"></div>
      <div id="edu-guard-dots"><span></span><span></span><span></span></div>
      <div class="msg">🔐 Đang kiểm tra đăng nhập...</div>
    </div>`;
  overlay.querySelector('#edu-guard-screen').appendChild(buildImg('img/anim/loading.gif'));
  document.addEventListener('DOMContentLoaded', () => document.body.appendChild(overlay));

  function showDenied(message, needsSignOut) {
    const btnLabel = needsSignOut ? 'Đăng xuất & về trang đăng nhập' : 'Về trang đăng nhập';
    const card = document.getElementById('edu-guard-card');
    card.innerHTML = `
      <div id="edu-guard-screen"></div>
      <div class="msg">${message}</div>
      <button class="btn" id="edu-guard-back">${btnLabel}</button>`;
    const screen = document.getElementById('edu-guard-screen');
    screen.appendChild(buildImg('img/anim/404.gif'));
    // Rung nhẹ khung màn hình 1 lần khi vừa hiện lỗi, rồi tự tắt animation
    // (khỏi lặp lại mỗi lần re-render) — báo hiệu "có gì đó sai" rõ ràng
    // hơn là đứng yên hoàn toàn.
    screen.classList.add('denied-shake');
    screen.addEventListener('animationend', () => screen.classList.remove('denied-shake'), { once: true });
    const back = async () => {
      // QUAN TRỌNG: phải đăng xuất trước khi quay về login.html — nếu không,
      // login.html sẽ thấy phiên đăng nhập cũ vẫn còn, tự động điều hướng
      // ngược lại trang này, và trang này lại từ chối → tạo vòng lặp
      // "đẩy ra đẩy vào" vô hạn, khiến người dùng không thể đổi tài khoản.
      if (needsSignOut && window.EduAuth) {
        try { await EduAuth.logoutUser(); } catch (e) { /* ignore */ }
      }
      window.location.href = 'login.html?next=' + encodeURIComponent(location.pathname + location.search);
    };
    document.getElementById('edu-guard-back')?.addEventListener('click', back);
    document.documentElement.classList.remove('edu-guard-locked');
    overlay.style.visibility = 'visible';
  }

  function unlock(user, profile) {
    document.documentElement.classList.remove('edu-guard-locked');
    overlay.remove();
    window.EduCurrentUser = user;
    window.EduCurrentProfile = profile;
    window.dispatchEvent(new CustomEvent('edu:ready', { detail: { user, profile } }));
  }

  function boot() {
    if (!window.EduFirebase || !window.EduAuth) {
      console.error('[EduGuard] Thiếu firebase-config.js / auth.js — phải nạp trước auth-guard.js');
      return;
    }
    EduAuth.onAuthReady((user, profile) => {
      if (!user) {
        setTimeout(() => showDenied('Bạn cần đăng nhập để xem trang này.', false), 300);
        return;
      }
      if (!profile) {
        setTimeout(() => showDenied('Không tìm thấy hồ sơ tài khoản. Liên hệ quản trị viên.', true), 300);
        return;
      }
      if (!allowedRoles.includes(profile.role)) {
        setTimeout(() => showDenied('Tài khoản của bạn không có quyền truy cập trang này.', true), 300);
        return;
      }
      if (profile.role === 'teacher' && profile.approved === false) {
        setTimeout(() => showDenied('Tài khoản giáo viên của bạn đang chờ quản trị viên duyệt.', true), 300);
        return;
      }
      unlock(user, profile);
    });
  }

  boot();
})();
