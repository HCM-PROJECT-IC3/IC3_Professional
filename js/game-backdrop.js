/* ============================================================
   js/game-backdrop.js — nền tranh riêng cho từng mini-game.
   Trước đây 6 trò (Đấu boss, Thám tử mạng, Chim vượt ải, Trí nhớ, Phòng thủ, Phân loại)
   cùng 1 nền xanh đen trơn → nhìn như 1 trang chép lại. Giờ mỗi trò 1 cảnh SVG của
   js/name-picker/np-art.js, phủ lớp tối để chữ/thẻ vẫn đọc rõ (css/game-backdrop.css).
     <body data-backdrop="sky">  — tên cảnh: farm · track · pond · sky · jungle · space ·
                                   classroom · party · field · street · castle · island
   Cần nạp np-art.js trước. Không mạng, không lưu gì.
   ============================================================ */
(function (global) {
  'use strict';

  function mount() {
    const A = global.EduNamePickerArt;
    const name = document.body && document.body.dataset.backdrop;
    if (!A || !name || document.querySelector('.game-backdrop')) return;
    let art;
    try { art = A.scene(name); } catch (e) { return; }
    const el = document.createElement('div');
    el.className = 'game-backdrop';
    el.setAttribute('aria-hidden', 'true');
    // Id riêng (gb-…) để không đè id của tranh khác trên cùng trang; bỏ chữ vẽ trong tranh
    // (vd bảng lớp học ghi "Bạn ở đâu...?" của trò Đèn pin) — nằm sau tiêu đề trò, gây rối
    el.innerHTML = art.replace(/<text[\s\S]*?<\/text>/g, '').replace(/\bid="([^"]+)"/g, 'id="gb-$1"').replace(/url\(#([^)]+)\)/g, 'url(#gb-$1)');
    document.body.prepend(el);
    document.body.classList.add('has-game-backdrop');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})(typeof window !== 'undefined' ? window : globalThis);
