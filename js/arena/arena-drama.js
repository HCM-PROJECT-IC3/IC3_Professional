/* ============================================================
   js/arena/arena-drama.js — hiệu ứng "kịch tính" dùng chung cho trận Đấu trường (Chơi một mình).
     banner(title, opt)      chữ lớn đập vào giữa màn hình: CÂU CUỐI · CÂU HỎI VÀNG · EM DẪN ĐẦU · CHUỖI 5 CÂU...
                             opt: { sub, tone: 'gold'|'speed'|'final'|'up'|'down'|'fire', icon (Font Awesome), ms }
     coinFly(fromEl, toEl, n) đồng xu bay theo đường cong từ ô câu hỏi lên ví xu
     countUp(root)           số trong các thẻ <b> đếm dần từ 0 (màn kết quả)
   Máy đặt "giảm chuyển động": vẫn hiện chữ/số, bỏ bay/đếm. Không mạng, không lưu gì.
   ============================================================ */
(function (global) {
  'use strict';

  const reduced = () => { try { return global.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let box = null, hideT = 0;

  function banner(title, opt) {
    const o = opt || {};
    if (!box) {
      box = document.createElement('div');
      box.className = 'ar-drama';
      box.setAttribute('role', 'status');
      box.setAttribute('aria-live', 'polite');
      document.body.appendChild(box);
    }
    clearTimeout(hideT);
    box.className = 'ar-drama t-' + (o.tone || 'up');
    box.innerHTML = `<div class="ar-drama-in">${o.icon ? `<i class="fa-solid ${o.icon}" aria-hidden="true"></i>` : ''}<b>${esc(title)}</b>${o.sub ? `<small>${esc(o.sub)}</small>` : ''}</div>`;
    const P = global.EduParty; // tia sáng + chữ nảy (js/fx-party.js)
    if (P) { P.rays(box); P.letters(box.querySelector('.ar-drama-in b'), { step: 38, delay: 90 }); }
    void box.offsetWidth;
    box.classList.add('is-on');
    hideT = setTimeout(() => box.classList.remove('is-on'), o.ms || 1300);
  }
  function hide() { if (box) { clearTimeout(hideT); box.classList.remove('is-on'); } }

  function coinFly(fromEl, toEl, n) {
    if (!fromEl || !toEl || reduced() || !Element.prototype.animate) return;
    const a = fromEl.getBoundingClientRect(), b = toEl.getBoundingClientRect();
    const x0 = a.left + a.width / 2, y0 = a.top + a.height / 2, x1 = b.left + b.width / 2, y1 = b.top + b.height / 2;
    for (let k = 0; k < (n || 6); k++) {
      const c = document.createElement('span');
      c.className = 'ar-coin-fly';
      c.textContent = '🪙';
      document.body.appendChild(c);
      const dx = (Math.random() - .5) * 120, lift = 80 + Math.random() * 80;
      const anim = c.animate([
        { transform: `translate(${x0}px, ${y0}px) scale(.4)`, opacity: 0 },
        { transform: `translate(${x0 + dx}px, ${y0 - lift}px) scale(1.15)`, opacity: 1, offset: .35 },
        { transform: `translate(${x1}px, ${y1}px) scale(.6)`, opacity: .9 },
      ], { duration: 850 + k * 70, easing: 'cubic-bezier(.4,0,.3,1)', delay: k * 55 });
      anim.onfinish = () => {
        c.remove();
        if (k === 0) { toEl.classList.remove('fx-bump'); void toEl.offsetWidth; toEl.classList.add('fx-bump'); }
      };
    }
  }

  /** "1.234 điểm" → đếm 0 → 1.234 (giữ nguyên phần chữ phía sau); bỏ qua dạng "8/10", "75%". */
  function countUp(root) {
    if (!root || reduced()) return;
    root.querySelectorAll('b').forEach((el, i) => {
      const m = el.textContent.match(/^(\+?)(\d{1,3}(?:\.\d{3})+|\d+)(\s.*)?$/);
      if (!m) return;
      const to = parseInt(m[2].replace(/\./g, ''), 10);
      if (!to) return;
      const t0 = performance.now() + i * 120, dur = 900;
      const step = (now) => {
        const f = Math.max(0, Math.min(1, (now - t0) / dur)), e = 1 - Math.pow(1 - f, 3);
        el.textContent = m[1] + Math.round(to * e).toLocaleString('vi-VN') + (m[3] || '');
        if (f < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }

  global.EduArenaDrama = { banner, hide, coinFly, countUp };
})(typeof window !== 'undefined' ? window : globalThis);
