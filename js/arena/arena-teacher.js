/* ============================================================
   js/arena/arena-teacher.js — cổng "Giáo viên" của Đấu trường (arena.html).

   Chỉ tài khoản đã đăng nhập có vai trò admin / teacher (đã được duyệt) mới thấy
   các bước chọn bộ câu + tạo phòng (#arHome.is-teacher-ok, xem css/arena.css).

   Tiết kiệm hạn mức Firebase:
     • Học sinh KHÔNG bao giờ chạy file này tới Firebase — chỉ khi bấm tab Giáo viên.
     • Máy chưa từng đăng nhập (hasStoredSession = false) → hiện nút Đăng nhập ngay,
       KHÔNG tải SDK, 0 lượt Firebase.
     • Có phiên → nạp SDK (js/services/firebase-loader.js) + js/auth.js, đọc hồ sơ
       users/{uid} 1 lần (auth.js lưu đệm 5 phút trong sessionStorage).

   Lưu ý: phòng chạy ngang hàng (WebRTC) trên máy giáo viên, nên đây là cổng ở giao
   diện — đủ để học sinh không vào nhầm chỗ tạo phòng, không phải lớp bảo mật dữ liệu.
   ============================================================ */
(function (global) {
  'use strict';

  const A = global.EduArena.api;
  const $ = (id) => document.getElementById(id);
  const esc = A.esc;
  const OK_ROLES = ['admin', 'teacher'];
  const LOGIN_URL = 'login.html?next=' + encodeURIComponent('arena.html');

  // state: idle | checking | login | denied | pending | error | ok
  const T = { state: 'idle', name: '', role: '', busy: false, listening: false };

  function paint() {
    const home = $('arHome');
    home.classList.toggle('is-teacher-ok', T.state === 'ok');
    const gate = $('arTeacherGate');
    const who = $('arTeacherWho');
    who.hidden = T.state !== 'ok';
    if (T.state === 'ok') {
      gate.innerHTML = '';
      who.innerHTML = `<span class="ar-teacher-ava" aria-hidden="true">🧑‍🏫</span>
        <span><b>${esc(T.name || 'Giáo viên')}</b><small>${T.role === 'admin' ? 'Quản trị viên' : 'Giáo viên'} · đã xác minh <i class="fa-solid fa-circle-check"></i></small></span>
        <button type="button" class="ar-btn ar-btn-ghost ar-btn-sm" id="arTeacherOut"><i class="fa-solid fa-right-from-bracket"></i> Đăng xuất</button>`;
      $('arTeacherOut').addEventListener('click', logout);
      document.dispatchEvent(new CustomEvent('arena:teacher', { detail: { ok: true } }));
      return;
    }
    const views = {
      idle: ['🔐', 'Khu vực giáo viên', 'Đang chuẩn bị...', ''],
      checking: ['⏳', 'Đang kiểm tra tài khoản...', 'Chờ một chút nhé.', ''],
      login: ['🔐', 'Đăng nhập để tạo phòng', 'Chỉ <b>tài khoản giáo viên</b> mới tạo được phòng cho cả lớp. Em là học sinh? Chọn tab <b>Học sinh</b> ở trên để vào phòng.', 'login'],
      denied: ['🙅', 'Tài khoản này không tạo được phòng', 'Chỉ tài khoản <b>giáo viên</b> hoặc <b>quản trị viên</b> mới tạo phòng. Học sinh hãy chọn tab <b>Học sinh</b> để vào phòng.', 'switch'],
      pending: ['⏳', 'Tài khoản đang chờ duyệt', 'Tài khoản giáo viên của thầy/cô chưa được quản trị viên duyệt. Vui lòng thử lại sau.', 'switch'],
      error: ['📡', 'Chưa kiểm tra được tài khoản', 'Kiểm tra kết nối mạng rồi thử lại.', 'retry'],
    };
    const [ico, title, msg, act] = views[T.state] || views.idle;
    gate.innerHTML = `<div class="ar-gate-ico" aria-hidden="true">${ico}</div>
      <h2 class="ar-gate-title">${title}</h2>
      <p class="ar-gate-msg">${msg}</p>
      <div class="ar-row ar-center-row">
        ${act === 'login' ? `<a class="ar-btn ar-btn-play ar-gate-go" href="${LOGIN_URL}"><i class="fa-solid fa-right-to-bracket"></i> Đăng nhập tài khoản giáo viên</a>` : ''}
        ${act === 'switch' ? `<button type="button" class="ar-btn" id="arGateSwitch"><i class="fa-solid fa-user-gear"></i> Đăng nhập tài khoản khác</button>` : ''}
        ${act === 'retry' ? '<button type="button" class="ar-btn" id="arGateRetry"><i class="fa-solid fa-rotate-right"></i> Thử lại</button>' : ''}
        <button type="button" class="ar-btn ar-btn-ghost" id="arGateStudent">🙋 Em là học sinh</button>
      </div>
      ${T.state === 'checking' ? '<div class="waiting-dots" aria-hidden="true"><i></i><i></i><i></i></div>' : ''}
      <ul class="ar-gate-feats" aria-label="Phòng cả lớp có gì">
        <li><span aria-hidden="true">📱</span><b>Vào phòng bằng QR</b><small>Học sinh quét mã hoặc nhập 6 ký tự — không cần tài khoản.</small></li>
        <li><span aria-hidden="true">⚡🏁❤️</span><b>3 chế độ cả lớp</b><small>Tốc độ kiểu Kahoot, Đua về đích, Sinh tồn kiểu Battle Royale.</small></li>
        <li><span aria-hidden="true">🧩</span><b>Nhiều dạng câu</b><small>Chọn 1, chọn nhiều, sắp xếp, ghép đôi — lấy từ ngân hàng câu theo bài.</small></li>
        <li><span aria-hidden="true">📊</span><b>Bảng điểm tức thì</b><small>Tải CSV, xem câu cả lớp hay sai. Không tốn lượt Firebase.</small></li>
      </ul>`;
    $('arGateStudent').addEventListener('click', () => A.setRole('student', true));
    const sw = $('arGateSwitch');
    if (sw) sw.addEventListener('click', async () => { await logout(); global.location.href = LOGIN_URL; });
    const rt = $('arGateRetry');
    if (rt) rt.addEventListener('click', check);
  }

  function set(state, extra) { Object.assign(T, { state }, extra || {}); paint(); }

  async function check() {
    if (T.busy || T.state === 'ok') return;
    T.busy = true;
    set('checking');
    try {
      await global.EduLazyLoad.loadScripts(['js/services/firebase-loader.js']);
      // Chưa từng đăng nhập trên máy này → khỏi tải Firebase.
      if (!(await global.EduFirebaseLoader.hasStoredSession())) { set('login'); return; }
      await global.EduFirebaseLoader.ensure();
      await global.EduLazyLoad.loadScripts(['js/auth.js']);
      if (!T.listening) {
        T.listening = true;
        global.EduAuth.onAuthReady(onAuth);
      }
    } catch (e) {
      console.warn('[EduArenaTeacher]', e);
      set('error');
    } finally {
      T.busy = false;
    }
  }

  function onAuth(user, profile) {
    if (!user || user.isAnonymous) { set('login', { name: '', role: '' }); return; }
    if (!profile) { set('denied'); return; }
    if (!OK_ROLES.includes(profile.role)) { set('denied', { role: profile.role }); return; }
    if (profile.role === 'teacher' && profile.approved === false) { set('pending'); return; }
    set('ok', { name: profile.name || user.displayName || user.email || '', role: profile.role });
  }

  async function logout() {
    try { if (global.EduAuth) await global.EduAuth.logoutUser(); } catch (e) { /* ignore */ }
    set('login', { name: '', role: '' });
  }

  function onRole() { if (A.role() === 'teacher' && T.state !== 'ok') check(); }
  document.addEventListener('arena:role', onRole);
  paint();
  onRole(); // trang mở sẵn ở tab Giáo viên (đã chọn lần trước / vừa đăng nhập xong quay lại)

  global.EduArenaTeacher = {
    /** true khi đã xác minh tài khoản giáo viên/quản trị trên trang này. */
    ok: () => T.state === 'ok',
    check,
  };
})(window);
