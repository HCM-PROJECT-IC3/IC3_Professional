/* ============================================================
   js/arena/arena-fx.js — hiệu ứng chuyển động nhỏ cho các chế độ Đấu trường.
     float(el, html, tone)    số/chữ bay lên từ 1 phần tử ("+850", "−25", "+20 💎")
     fly(from, to, emoji)     vật bay theo đường cong từ phần tử này sang phần tử kia (phép, đá quý)
     burst(el, emojis, n)     bùng vài hạt quanh 1 phần tử (đá quý, bọt nước, tia lửa)
     flash(el, cls)           gắn 1 lớp CSS chạy animation rồi tự gỡ (fx-bump, fx-hit, fx-heal...)
     flip(box, render)        bảng xếp hạng: vẽ lại rồi trượt mỗi dòng từ chỗ cũ sang chỗ mới (FLIP); dòng .is-me lên hạng thì sáng
     settle(root)             kim/nhân vật vẽ ở vị trí cũ (data-to) → trượt tới vị trí mới
   Web Animations API + CSS (css/arena.css, khối "HIỆU ỨNG"), không thư viện ngoài.
   Máy đặt "giảm chuyển động": bỏ hết chuyển động, chỉ còn đổi màu.
   ============================================================ */
(function (global) {
  'use strict';

  function reduced() {
    try { return global.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; }
  }
  function center(el) {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
  }
  const visible = (el) => el && el.isConnected && el.getClientRects().length > 0;
  function layer(cls, html, x, y) {
    const s = document.createElement('span');
    s.className = cls;
    s.setAttribute('aria-hidden', 'true');
    s.innerHTML = html;
    s.style.left = x + 'px';
    s.style.top = y + 'px';
    document.body.appendChild(s);
    return s;
  }

  /** tone: 'up' (xanh) | 'down' (đỏ) | 'gold' | 'gem' | 'heal' | 'info'. */
  function float(el, html, tone) {
    if (!visible(el) || reduced()) return;
    const c = center(el);
    const s = layer('fx-float fx-' + (tone || 'up'), html, c.x, c.y - c.h / 4);
    s.animate([
      { transform: 'translate(-50%, -50%) scale(.6)', opacity: 0 },
      { transform: 'translate(-50%, -110%) scale(1.15)', opacity: 1, offset: 0.25 },
      { transform: 'translate(-50%, -260%) scale(1)', opacity: 0 },
    ], { duration: 1100, easing: 'cubic-bezier(.2,.7,.3,1)' }).onfinish = () => s.remove();
  }

  /** Bay theo đường cong; trả Promise xong khi tới nơi (giảm chuyển động: xong ngay). */
  function fly(from, to, emoji, opts) {
    const o = opts || {};
    if (!visible(from) || !visible(to) || reduced()) return Promise.resolve();
    const a = center(from), b = center(to);
    const s = layer('fx-fly', emoji, a.x, a.y);
    const lift = Math.min(160, Math.abs(b.x - a.x) * 0.35 + 50);
    const mx = (b.x - a.x) / 2, my = Math.min(0, b.y - a.y) / 2 - lift;
    return new Promise((done) => {
      const an = s.animate([
        { transform: 'translate(-50%, -50%) scale(.7) rotate(0)', opacity: 0.2 },
        { transform: `translate(calc(-50% + ${mx}px), calc(-50% + ${my}px)) scale(1.5) rotate(${o.spin ? 200 : 0}deg)`, opacity: 1, offset: 0.5 },
        { transform: `translate(calc(-50% + ${b.x - a.x}px), calc(-50% + ${b.y - a.y}px)) scale(1) rotate(${o.spin ? 360 : 0}deg)`, opacity: 1 },
      ], { duration: o.ms || 650, delay: o.delay || 0, easing: 'cubic-bezier(.45,0,.55,1)', fill: 'backwards' });
      an.onfinish = () => { s.remove(); done(); };
    });
  }

  function burst(el, emojis, n) {
    if (!visible(el) || reduced()) return;
    const c = center(el);
    const list = [].concat(emojis);
    for (let i = 0; i < (n || 8); i++) {
      const ang = (Math.PI * 2 * i) / (n || 8) + Math.random() * 0.5;
      const dist = 50 + Math.random() * 45;
      const s = layer('fx-particle', list[i % list.length], c.x, c.y);
      s.animate([
        { transform: 'translate(-50%, -50%) scale(.4)', opacity: 1 },
        { transform: `translate(calc(-50% + ${Math.cos(ang) * dist}px), calc(-50% + ${Math.sin(ang) * dist + 25}px)) scale(1)`, opacity: 0 },
      ], { duration: 700 + Math.random() * 300, easing: 'cubic-bezier(.1,.8,.3,1)' }).onfinish = () => s.remove();
    }
  }

  /** Gắn lớp chạy animation (chạy lại được nếu đang chạy dở), tự gỡ sau khi xong. */
  function flash(el, cls) {
    if (!el) return;
    el.classList.remove(cls);
    void el.offsetWidth; // ép trình duyệt tính lại để animation chạy lại từ đầu
    el.classList.add(cls);
    clearTimeout(el['fxT_' + cls]);
    el['fxT_' + cls] = setTimeout(() => el.classList.remove(cls), 1200);
  }

  /** FLIP: ghi vị trí các dòng [data-key] → render() → trượt dòng từ chỗ cũ tới chỗ mới. */
  function flip(box, render) {
    if (!box || reduced()) { render(); return; }
    const before = {};
    box.querySelectorAll('[data-key]').forEach((el) => { before[el.dataset.key] = el.getBoundingClientRect().top; });
    render();
    box.querySelectorAll('[data-key]').forEach((el) => {
      const old = before[el.dataset.key];
      if (old === undefined) return;
      const dy = old - el.getBoundingClientRect().top;
      if (Math.abs(dy) < 2) return;
      el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 450, easing: 'cubic-bezier(.3,1.3,.5,1)' });
      if (dy > 0 && el.classList.contains('is-me')) flash(el, 'fx-rankup'); // chỉ dòng của em sáng khi lên hạng
    });
  }

  /** Phần tử vẽ ở vị trí cũ với data-to="…%" → khung hình sau đặt left mới để CSS transition trượt tới. */
  function settle(root) {
    const els = (root || document).querySelectorAll('[data-to]');
    if (!els.length) return;
    requestAnimationFrame(() => requestAnimationFrame(() => els.forEach((el) => { el.style.left = el.dataset.to; el.removeAttribute('data-to'); })));
  }

  global.EduArenaFX = { reduced, float, fly, burst, flash, flip, settle };
})(window);
