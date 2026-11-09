/* ============================================================
   js/ui-date.js — lịch chọn ngày tiếng Việt (thay lịch của trình duyệt: tiếng Anh theo Windows, bật ra sai chỗ,
   định dạng mm/dd/yyyy). Dùng chung khung bảng chọn của js/ui-select.js (css/ui-select.css): mở ngay dưới nút bấm,
   điện thoại là tấm trượt từ dưới lên.
   EduDatePicker.open({ anchor, value: 'YYYY-MM-DD', min, max, title, clearLabel, countdown, onPick(value | '') })
     countdown: true → dòng dưới lịch "Thứ Sáu, 20/11/2026 · còn 11 ngày" (đặt ngày thi).
   Tuần bắt đầu Thứ Hai như lịch Việt Nam. Bàn phím: mũi tên đổi ngày, PageUp/PageDown đổi tháng, Enter chọn, Esc đóng.
   Hàm thuần (test: js/services/__tests__/ui-date.test.js): iso · parseIso · monthGrid · daysBetween · vnLong · vnShort. 0 mạng.
   ============================================================ */
(function (global) {
  'use strict';

  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  function parseIso(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
    if (!m) return null;
    const d = new Date(+m[1], +m[2] - 1, +m[3]);
    return d.getMonth() === +m[2] - 1 ? d : null;
  }
  const day0 = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  /** Số ngày từ a tới b (theo lịch, không lệch giờ mùa hè). */
  const daysBetween = (a, b) => Math.round((day0(b) - day0(a)) / 864e5);
  /** 6 tuần × 7 ngày của tháng (month 0–11), bắt đầu Thứ Hai → ['YYYY-MM-DD', …] (42 ô). */
  function monthGrid(year, month) {
    const first = new Date(year, month, 1);
    const shift = (first.getDay() + 6) % 7; // Thứ Hai = 0
    return Array.from({ length: 42 }, (_, i) => iso(new Date(year, month, 1 - shift + i)));
  }
  const THU = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
  const vnShort = (d) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  const vnLong = (d) => `${THU[d.getDay()]}, ${vnShort(d)}`;

  const pure = { iso, parseIso, monthGrid, daysBetween, vnLong, vnShort };
  if (typeof document === 'undefined') { global.EduDatePicker = pure; return; }

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MOBILE = () => global.matchMedia && global.matchMedia('(max-width: 640px)').matches;
  const REDUCED = () => global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let cur = null;

  function open(o) {
    if (cur) close();
    const anchor = o.anchor;
    const today = day0(new Date());
    const sel = parseIso(o.value);
    const min = parseIso(o.min), max = parseIso(o.max);
    const st = { o, anchor, sel, min, max, focus: sel || (min && min > today ? min : today) };
    st.view = new Date(st.focus.getFullYear(), st.focus.getMonth(), 1);
    const mobile = MOBILE();
    const panel = document.createElement('div');
    panel.className = 'ss-panel dp-panel' + (mobile ? ' is-sheet' : '');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', o.title || 'Chọn ngày');
    if (anchor) panel.style.setProperty('--ss-step', getComputedStyle(anchor).getPropertyValue('--step') || '');
    panel.innerHTML = `${mobile ? `<div class="ss-sheet-head"><b>${esc(o.title || 'Chọn ngày')}</b><button type="button" class="ss-x" data-dp="close" aria-label="Đóng">✕</button></div>` : ''}
      <div class="dp-head">
        <button type="button" class="dp-nav" data-dp="prev" aria-label="Tháng trước"><i class="dp-arrow is-left" aria-hidden="true"></i></button>
        <b class="dp-title" aria-live="polite"></b>
        <button type="button" class="dp-nav" data-dp="next" aria-label="Tháng sau"><i class="dp-arrow" aria-hidden="true"></i></button>
      </div>
      <div class="dp-week" aria-hidden="true">${['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map((d, i) => `<span${i > 4 ? ' class="is-weekend"' : ''}>${d}</span>`).join('')}</div>
      <div class="dp-grid" role="grid" tabindex="0"></div>
      <div class="dp-foot"><span class="dp-info"></span>
        <span class="dp-acts">${o.clearLabel && sel ? `<button type="button" class="dp-btn" data-dp="clear">${esc(o.clearLabel)}</button>` : ''}
        <button type="button" class="dp-btn is-main" data-dp="ok" disabled>Chọn</button></span></div>`;
    if (mobile) {
      const back = document.createElement('div');
      back.className = 'ss-backdrop';
      back.addEventListener('click', close);
      document.body.appendChild(back);
      st.backdrop = back;
      document.documentElement.classList.add('ss-lock');
    }
    document.body.appendChild(panel);
    st.panel = panel;
    cur = st;
    draw();
    placeIt();
    if (!REDUCED()) requestAnimationFrame(() => panel.classList.add('is-in')); else panel.classList.add('is-in');
    panel.querySelector('.dp-grid').focus({ preventScroll: true });

    panel.addEventListener('click', (e) => {
      const b = e.target.closest('[data-dp], [data-day]');
      if (!b || b.disabled) return;
      if (b.dataset.day) { st.focus = parseIso(b.dataset.day); st.pending = true; draw(); if (!o.confirm) pick(b.dataset.day); return; }
      const a = b.dataset.dp;
      if (a === 'prev' || a === 'next') { st.view = new Date(st.view.getFullYear(), st.view.getMonth() + (a === 'next' ? 1 : -1), 1); draw(); }
      else if (a === 'clear') pick('');
      else if (a === 'ok') pick(iso(st.focus));
      else if (a === 'close') close();
    });
    panel.querySelector('.dp-grid').addEventListener('keydown', keys);
    st.onDoc = (e) => { if (!panel.contains(e.target) && !(anchor && anchor.contains(e.target))) close(false); };
    st.onMove = () => placeIt();
    document.addEventListener('pointerdown', st.onDoc, true);
    global.addEventListener('resize', st.onMove);
    global.addEventListener('scroll', st.onMove, true);
  }

  const allowed = (d) => !(cur.min && d < cur.min) && !(cur.max && d > cur.max);

  function draw() {
    const { panel, view, sel, focus, o } = cur;
    const today = day0(new Date());
    panel.querySelector('.dp-title').textContent = `Tháng ${view.getMonth() + 1}, ${view.getFullYear()}`;
    const prevEnd = new Date(view.getFullYear(), view.getMonth(), 0), nextStart = new Date(view.getFullYear(), view.getMonth() + 1, 1);
    panel.querySelector('[data-dp="prev"]').disabled = !!(cur.min && prevEnd < cur.min);
    panel.querySelector('[data-dp="next"]').disabled = !!(cur.max && nextStart > cur.max);
    const cells = monthGrid(view.getFullYear(), view.getMonth());
    const grid = panel.querySelector('.dp-grid');
    grid.innerHTML = cells.map((k) => {
      const d = parseIso(k);
      const cls = ['dp-day'];
      if (d.getMonth() !== view.getMonth()) cls.push('is-out');
      if (k === iso(today)) cls.push('is-today');
      if (sel && k === iso(sel)) cls.push('is-selected');
      if (k === iso(focus)) cls.push('is-focus');
      if ((d.getDay() + 6) % 7 > 4) cls.push('is-weekend');
      const ok = allowed(d);
      return `<button type="button" class="${cls.join(' ')}" data-day="${k}" tabindex="-1"${ok ? '' : ' disabled'}
        aria-label="${esc(vnLong(d))}${k === iso(today) ? ' (hôm nay)' : ''}"${sel && k === iso(sel) ? ' aria-selected="true"' : ''}>${d.getDate()}</button>`;
    }).join('');
    const f = grid.querySelector('.is-focus');
    if (f) { f.id = 'dp-focus'; grid.setAttribute('aria-activedescendant', 'dp-focus'); }
    const n = daysBetween(today, focus);
    const showInfo = cur.pending || sel;
    panel.querySelector('.dp-info').innerHTML = showInfo
      ? `<b>${esc(vnLong(focus))}</b>${o.countdown ? `<small>${n === 0 ? 'Hôm nay' : n > 0 ? `còn ${n} ngày` : `${-n} ngày trước`}</small>` : ''}`
      : '<small>Bấm vào 1 ngày</small>';
    const ok = panel.querySelector('[data-dp="ok"]');
    ok.disabled = !allowed(focus);
    ok.hidden = !o.confirm;
  }

  function keys(e) {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (step || e.key === 'PageUp' || e.key === 'PageDown') {
      e.preventDefault();
      const f = cur.focus;
      const next = step ? new Date(f.getFullYear(), f.getMonth(), f.getDate() + step)
        : new Date(f.getFullYear(), f.getMonth() + (e.key === 'PageDown' ? 1 : -1), Math.min(f.getDate(), 28));
      if (!allowed(next)) return;
      cur.focus = next; cur.pending = true;
      if (next.getMonth() !== cur.view.getMonth() || next.getFullYear() !== cur.view.getFullYear()) cur.view = new Date(next.getFullYear(), next.getMonth(), 1);
      draw();
    } else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (allowed(cur.focus)) pick(iso(cur.focus)); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'Tab') close(false);
  }

  function placeIt() {
    const { panel, anchor } = cur || {};
    if (!panel || panel.classList.contains('is-sheet') || !anchor) return;
    const r = anchor.getBoundingClientRect(), vh = global.innerHeight, vw = global.innerWidth;
    const w = Math.min(320, vw - 16), h = panel.offsetHeight || 380;
    const up = vh - r.bottom < h + 12 && r.top > vh - r.bottom;
    panel.style.width = w + 'px';
    panel.style.left = Math.min(Math.max(8, r.right - w), vw - w - 8) + 'px';
    panel.style.top = up ? '' : (r.bottom + 6) + 'px';
    panel.style.bottom = up ? (vh - r.top + 6) + 'px' : '';
    panel.classList.toggle('is-up', up);
  }

  function pick(v) {
    const fn = cur && cur.o.onPick;
    close();
    if (fn) fn(v);
  }

  function close(refocus = true) {
    if (!cur) return;
    const st = cur;
    cur = null;
    document.removeEventListener('pointerdown', st.onDoc, true);
    global.removeEventListener('resize', st.onMove);
    global.removeEventListener('scroll', st.onMove, true);
    if (st.backdrop) { st.backdrop.remove(); document.documentElement.classList.remove('ss-lock'); }
    st.panel.classList.remove('is-in');
    setTimeout(() => st.panel.remove(), REDUCED() ? 0 : 140);
    if (refocus && st.anchor && st.anchor.focus) st.anchor.focus({ preventScroll: true });
  }

  global.EduDatePicker = Object.assign({ open, close }, pure);
})(typeof window !== 'undefined' ? window : globalThis);
