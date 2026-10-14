/* ============================================================
   js/arena/arena-entry.js — nút "🏟️ Đấu trường" ở sảnh index.html.
   Mở arena.html với ĐÚNG bộ câu đang chọn ở sảnh (Chương trình / Cấp độ /
   Bài), hoặc đề giáo viên nếu trang đang mở bằng link ?de=. Chỉ dựng link —
   không tải gì thêm, 0 Firebase.
   ============================================================ */
(function (global) {
  'use strict';

  const MIX = /^__RANDOM_MIX/; // "Tổng hợp" ở sảnh → Đấu trường trộn mọi chủ đề
  function arenaUrl() {
    const de = new URLSearchParams(location.search).get('de');
    if (de) return 'arena.html?de=' + encodeURIComponent(de);
    const v = (id) => (document.getElementById(id)?.value || '');
    const p = new URLSearchParams();
    if (v('categorySelect')) p.set('cat', v('categorySelect'));
    if (v('levelSelect')) p.set('lvl', v('levelSelect'));
    const mt = v('minitestSelect');
    if (mt) p.set('mt', MIX.test(mt) ? '__ALL__' : mt);
    const q = p.toString();
    return 'arena.html' + (q ? '?' + q : '');
  }
  function mount() {
    const hist = document.querySelector('.lobby-card button[onclick="showRecords()"]');
    if (!hist || document.getElementById('arenaBtn')) return;
    const a = document.createElement('a');
    a.id = 'arenaBtn';
    a.className = 'btn-secondary arena-open';
    a.href = 'arena.html';
    a.innerHTML = '<span aria-hidden="true">🏟️</span> Đấu trường <small>Kahoot · Blooket</small>';
    a.title = 'Chơi bài đang chọn theo kiểu game: Tốc độ, Săn vàng, Đua về đích — sưu tập Linh vật';
    // Cập nhật href ngay lúc bấm/trỏ chuột → luôn đúng bài đang chọn (mở tab mới bằng chuột giữa cũng đúng).
    const sync = () => { a.href = arenaUrl(); };
    ['pointerdown', 'focus', 'mouseenter'].forEach((ev) => a.addEventListener(ev, sync));
    a.addEventListener('click', sync);
    hist.before(a);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
  global.EduArenaEntry = { arenaUrl };
})(window);
