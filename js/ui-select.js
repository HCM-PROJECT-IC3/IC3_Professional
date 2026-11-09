/* ============================================================
   js/ui-select.js — ô chọn đẹp cho sảnh (index.html): Trường · Lớp · Họ và tên · Chương trình · Cấp độ · Bài luyện tập.
   Danh sách thả xuống của <select> do hệ điều hành vẽ (không chỉnh được bằng CSS) → bọc mỗi <select> bằng 1 nút + bảng chọn
   tự vẽ. <select> gốc VẪN là nơi giữ giá trị: code cũ (lobby-roster.js, quiz-engine.js, main.js) vẫn đổ option, gán .value,
   nghe "change" như trước — không phải sửa gì. Bảng chọn tự cập nhật khi option/disabled/class đổi (MutationObserver) và
   khi code gán .value / .selectedIndex.
   Có: tìm không dấu ("nguyen van an", chữ đầu "nva"), tô chữ khớp, ảnh chữ cái đầu cho tên học sinh, nhóm (optgroup),
   bàn phím (↑ ↓ Enter Esc Home End, gõ chữ để tìm), tấm trượt từ dưới trên điện thoại, chọn xong tự mở ô kế tiếp
   (Trường → Lớp → Họ và tên). Thiếu JS / trình duyệt cũ → <select> gốc vẫn dùng được. 0 mạng.
   Hàm thuần (test: js/services/__tests__/ui-select.test.js): plain · initials · matches · highlight · cleanPlaceholder.
   ============================================================ */
(function (global) {
  'use strict';

  // ── Hàm thuần ──
  const plain = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase().replace(/\s+/g, ' ').trim();
  /** "Nguyễn Văn An" → "NA" (họ + tên — như ảnh đại diện danh bạ). Bỏ phần kèm theo: "Đào Ngọc Hiếu · 3A1" → "ĐH". */
  function initials(name) {
    const w = String(name || '').split(/\s+[·•|–—-]\s+|\s*\(/)[0].trim().split(/\s+/).filter(Boolean);
    if (!w.length) return '?';
    const a = w[0][0] || '', b = w.length > 1 ? w[w.length - 1][0] : (w[0][1] || '');
    return (a + b).toLocaleUpperCase('vi');
  }
  /** Khớp tìm kiếm: chuỗi con không dấu, hoặc chữ đầu các từ ("nva" ↔ Nguyễn Văn An), hoặc mọi từ gõ đều có trong tên. */
  function matches(text, query) {
    const q = plain(query);
    if (!q) return true;
    const t = plain(text);
    if (t.includes(q)) return true;
    const words = t.split(' ');
    if (!q.includes(' ') && q.length >= 2 && words.map((w) => w[0] || '').join('').startsWith(q)) return true;
    return q.split(' ').every((part) => words.some((w) => w.startsWith(part)));
  }
  /** Tô chữ khớp (bỏ dấu khi so, giữ dấu khi hiện) → HTML an toàn. */
  function highlight(text, query) {
    // NFC: tên nhập từ Excel đôi khi ở dạng dấu tách rời (NFD) — 1 chữ = 1 ký tự thì vị trí khớp mới đúng
    const s = String(text == null ? '' : s0(text)).normalize('NFC'), q = plain(query);
    if (!q) return esc(s);
    // Bản không dấu cùng độ dài với bản gốc (mỗi ký tự 1-1) → vị trí khớp dùng lại được
    const p = Array.from(s).map((ch) => plain(ch) || ch.toLowerCase()).join('');
    const ranges = [];
    let i = p.indexOf(q);
    if (i >= 0) ranges.push([i, i + q.length]);
    else q.split(' ').filter(Boolean).forEach((part) => {
      const re = new RegExp('(^|\\s)' + part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      let m;
      while ((m = re.exec(p))) { const st = m.index + m[1].length; ranges.push([st, st + part.length]); }
    });
    if (!ranges.length || p.length !== Array.from(s).length) return esc(s);
    ranges.sort((a, b) => a[0] - b[0]);
    const chars = Array.from(s);
    let out = '', pos = 0;
    ranges.forEach(([a, b]) => { if (a < pos) return; out += esc(chars.slice(pos, a).join('')) + '<mark>' + esc(chars.slice(a, b).join('')) + '</mark>'; pos = b; });
    return out + esc(chars.slice(pos).join(''));
  }
  const s0 = (x) => String(x);
  /** "-- Chọn lớp trước --" → "Chọn lớp trước" */
  const cleanPlaceholder = (s) => String(s || '').replace(/^[\s\-–—•]+|[\s\-–—•]+$/g, '').trim();
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  /** Màu ảnh đại diện ổn định theo tên (8 sắc độ dịu). */
  const HUES = [205, 145, 28, 265, 340, 175, 50, 0];
  const hueOf = (s) => { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.codePointAt(0)) >>> 0; return HUES[h % HUES.length]; };

  if (typeof document === 'undefined') {
    global.EduSmartSelect = { plain, initials, matches, highlight, cleanPlaceholder };
    return;
  }

  // ── Thành phần ──
  let uid = 0;
  let openInst = null;
  const MOBILE = () => global.matchMedia && global.matchMedia('(max-width: 640px)').matches;
  const REDUCED = () => global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const desc = (o, k) => Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, k);

  /**
   * opts: { avatar: bool (ảnh chữ cái đầu), unit: 'học sinh' (đếm ở chân bảng), next: id ô mở tiếp sau khi chọn,
   *         searchMin: số mục tối thiểu để hiện ô tìm (mặc định 7), title: tiêu đề tấm trượt điện thoại }
   */
  function enhance(sel, opts = {}) {
    if (!sel || sel.__smart) return sel && sel.__smart;
    const id = ++uid;
    const label = (sel.id && document.querySelector(`label[for="${sel.id}"]`)) || sel.closest('label');
    const pageClasses = [...sel.classList].filter((c) => !/^ss-/.test(c));
    const wrap = document.createElement('div');
    // keep (trang khác sảnh): khung bọc "trong suốt" với bố cục (display: contents) → nút đứng đúng chỗ <select> cũ,
    // các luật kiểu ".td-classbar .td-select { flex: 1 }" áp lên nút vì nút mang class của <select>.
    wrap.className = 'ss' + (opts.keep ? ' ss-keep-wrap' : '');
    sel.parentNode.insertBefore(wrap, sel);
    wrap.appendChild(sel);
    sel.classList.add('ss-native');
    sel.tabIndex = -1;
    sel.setAttribute('aria-hidden', 'true');

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ss-trigger' + (opts.keep ? ' ss-keep ' + pageClasses.join(' ') : '');
    btn.id = `ss-btn-${id}`;
    btn.setAttribute('role', 'combobox');
    btn.setAttribute('aria-haspopup', 'listbox');
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-controls', `ss-list-${id}`);
    if (label) { if (!label.id) label.id = `ss-lbl-${id}`; btn.setAttribute('aria-labelledby', `${label.id} ${btn.id}`); }
    else if (sel.getAttribute('aria-label')) btn.setAttribute('aria-label', sel.getAttribute('aria-label'));
    btn.innerHTML = '<span class="ss-face"></span><span class="ss-value"></span><i class="ss-chev" aria-hidden="true"></i>';
    wrap.appendChild(btn);

    const inst = { sel, btn, wrap, opts, label, panel: null, query: '', active: -1, items: [] };
    sel.__smart = inst;

    // Code cũ gán .value / .selectedIndex không phát "change" → bọc lại để nút luôn hiện đúng lựa chọn
    ['value', 'selectedIndex'].forEach((k) => {
      const d = desc(sel, k);
      if (!d) return;
      Object.defineProperty(sel, k, { configurable: true, get() { return d.get.call(this); }, set(v) { d.set.call(this, v); paint(inst); } });
    });
    sel.focus = () => btn.focus(); // nơi khác gọi select.focus() (vd tô ô còn thiếu) → focus vào nút
    sel.addEventListener('change', () => paint(inst));
    new MutationObserver(() => { paint(inst); if (inst.panel) renderList(inst); })
      .observe(sel, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['disabled', 'class', 'label'] });

    btn.addEventListener('click', () => (inst.panel ? close(inst) : open(inst)));
    btn.addEventListener('keydown', (e) => {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); open(inst); return; }
      if (e.key.length === 1 && /\S/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); open(inst, e.key); }
    });
    if (label) label.addEventListener('click', (e) => { e.preventDefault(); if (!sel.disabled) btn.focus(); });
    paint(inst);
    return inst;
  }

  /** Chữ của nhãn, bỏ phần ô chọn nằm trong nhãn (<label>Lớp <select>…</select></label>). */
  function labelText(label) {
    if (!label) return '';
    const c = label.cloneNode(true);
    c.querySelectorAll('select, .ss, button, input').forEach((x) => x.remove());
    return c.textContent.replace(/\s+/g, ' ').trim();
  }
  const realOptions = (sel) => Array.from(sel.options);
  const placeholderOf = (sel) => { const o = realOptions(sel).find((x) => x.value === ''); return o ? cleanPlaceholder(o.text) : 'Chọn'; };
  const choiceCount = (sel) => realOptions(sel).filter((o) => o.value !== '' && !o.disabled).length;

  /** Vẽ lại nút (giá trị đang chọn, trạng thái khoá, ô cần chọn tiếp). */
  function paint(inst) {
    const { sel, btn, opts, wrap } = inst;
    const o = sel.selectedIndex >= 0 ? sel.options[sel.selectedIndex] : null;
    const has = !!(o && o.value !== '');
    const val = btn.querySelector('.ss-value'), face = btn.querySelector('.ss-face');
    val.textContent = has ? o.text.trim() : placeholderOf(sel);
    btn.title = has ? o.text.trim() : '';
    btn.classList.toggle('is-empty', !has);
    btn.disabled = sel.disabled;
    wrap.classList.toggle('is-disabled', sel.disabled);
    btn.classList.toggle('is-next-field', sel.classList.contains('is-next-field'));
    if (opts.avatar && has) {
      face.hidden = false;
      face.textContent = initials(o.text);
      face.style.setProperty('--ss-h', hueOf(o.text));
    } else face.hidden = true;
    const n = choiceCount(sel);
    btn.dataset.count = !has && n && !sel.disabled && opts.unit ? `${n} ${opts.unit}` : '';
  }

  function open(inst, typed) {
    if (inst.sel.disabled || !inst.sel.options.length) return;
    if (openInst && openInst !== inst) close(openInst);
    openInst = inst;
    const { sel, btn, opts } = inst;
    const mobile = MOBILE();
    const panel = document.createElement('div');
    panel.className = 'ss-panel' + (mobile ? ' is-sheet' : '') + (opts.keep ? ' is-keep' : '');
    panel.style.setProperty('--ss-step', getComputedStyle(btn).getPropertyValue('--step') || '');
    const withSearch = choiceCount(sel) >= (opts.searchMin || 7) || typed;
    const title = opts.title || labelText(inst.label) || sel.getAttribute('aria-label') || '';
    panel.innerHTML = `${mobile ? `<div class="ss-sheet-head"><b>${esc(title)}</b><button type="button" class="ss-x" aria-label="Đóng">✕</button></div>` : ''}
      ${withSearch ? `<div class="ss-search"><i class="ss-mag" aria-hidden="true"></i><input type="search" autocomplete="off" spellcheck="false"
        placeholder="Gõ để tìm${opts.avatar ? ' — vd: an, nva' : ''}" aria-label="Tìm trong ${esc(title)}" aria-controls="ss-list-${inst.btn.id.slice(7)}"></div>` : ''}
      <div class="ss-list" role="listbox" id="ss-list-${inst.btn.id.slice(7)}" tabindex="-1" aria-label="${esc(title)}"></div>
      <div class="ss-foot"></div>`;
    if (mobile) {
      const back = document.createElement('div');
      back.className = 'ss-backdrop';
      back.addEventListener('click', () => close(inst));
      document.body.appendChild(back);
      inst.backdrop = back;
      document.documentElement.classList.add('ss-lock');
    }
    document.body.appendChild(panel);
    inst.panel = panel;
    inst.query = typed || '';
    btn.setAttribute('aria-expanded', 'true');
    btn.classList.add('is-open');

    const input = panel.querySelector('input');
    if (input) {
      input.value = inst.query;
      input.addEventListener('input', () => { inst.query = input.value; inst.active = -1; renderList(inst, true); });
      input.addEventListener('keydown', (e) => keyNav(inst, e));
    }
    const list = panel.querySelector('.ss-list');
    list.addEventListener('keydown', (e) => keyNav(inst, e));
    list.addEventListener('mousemove', (e) => { const it = e.target.closest('.ss-opt'); if (it && !it.classList.contains('is-active')) setActive(inst, +it.dataset.i, false); });
    list.addEventListener('click', (e) => { const it = e.target.closest('.ss-opt'); if (it) choose(inst, +it.dataset.i); });
    const x = panel.querySelector('.ss-x'); if (x) x.addEventListener('click', () => close(inst));

    renderList(inst, true);
    place(inst);
    if (!REDUCED()) requestAnimationFrame(() => panel.classList.add('is-in')); else panel.classList.add('is-in');
    (input || list).focus({ preventScroll: true });
    if (input && typed) input.setSelectionRange(typed.length, typed.length);
    inst.onDoc = (e) => { if (!panel.contains(e.target) && !inst.wrap.contains(e.target)) close(inst, false); };
    inst.onMove = () => place(inst);
    document.addEventListener('pointerdown', inst.onDoc, true);
    global.addEventListener('resize', inst.onMove);
    global.addEventListener('scroll', inst.onMove, true);
  }

  function close(inst, refocus = true) {
    if (!inst.panel) return;
    const { panel, btn } = inst;
    inst.panel = null;
    if (openInst === inst) openInst = null;
    btn.setAttribute('aria-expanded', 'false');
    btn.classList.remove('is-open');
    document.removeEventListener('pointerdown', inst.onDoc, true);
    global.removeEventListener('resize', inst.onMove);
    global.removeEventListener('scroll', inst.onMove, true);
    if (inst.backdrop) { inst.backdrop.remove(); inst.backdrop = null; document.documentElement.classList.remove('ss-lock'); }
    panel.classList.remove('is-in');
    setTimeout(() => panel.remove(), REDUCED() ? 0 : 140);
    if (refocus) btn.focus({ preventScroll: true });
  }

  /** Đặt bảng chọn ngay dưới (hoặc trên, nếu thiếu chỗ) nút — position: fixed nên không bị thẻ cha cắt mất. */
  function place(inst) {
    const { panel, btn } = inst;
    if (!panel || panel.classList.contains('is-sheet')) return;
    const r = btn.getBoundingClientRect(), vh = global.innerHeight, vw = global.innerWidth;
    const below = vh - r.bottom - 12, above = r.top - 12;
    const up = below < 260 && above > below;
    const maxH = Math.max(180, Math.min(440, (up ? above : below) - 6));
    const w = Math.min(Math.max(r.width, 260), vw - 16);
    panel.style.width = w + 'px';
    panel.style.left = Math.min(Math.max(8, r.left), vw - w - 8) + 'px';
    panel.style.maxHeight = maxH + 'px';
    panel.style.top = up ? '' : (r.bottom + 6) + 'px';
    panel.style.bottom = up ? (vh - r.top + 6) + 'px' : '';
    panel.classList.toggle('is-up', up);
  }

  /** Vẽ danh sách theo ô tìm; giữ nhóm (optgroup) nếu có. */
  function renderList(inst, keepScroll) {
    const { sel, panel, opts } = inst;
    if (!panel) return;
    const list = panel.querySelector('.ss-list');
    const q = inst.query;
    const items = [];
    let html = '', lastGroup = null, shown = 0;
    realOptions(sel).forEach((o, idx) => {
      if (o.value === '' || o.hidden) return;
      const text = o.text.trim();
      if (!matches(text, q)) return;
      const g = o.parentNode && o.parentNode.tagName === 'OPTGROUP' ? o.parentNode.label : null;
      if (g !== lastGroup) { if (g) html += `<div class="ss-group" role="presentation">${esc(g)}</div>`; lastGroup = g; }
      const i = items.length;
      items.push(idx);
      const on = idx === sel.selectedIndex;
      const face = opts.avatar ? `<span class="ss-face" style="--ss-h:${hueOf(text)}" aria-hidden="true">${esc(initials(text))}</span>` : '';
      html += `<div class="ss-opt${on ? ' is-selected' : ''}${o.disabled ? ' is-disabled' : ''}" role="option" id="ss-o-${inst.btn.id.slice(7)}-${i}"
        data-i="${i}" aria-selected="${on}"${o.disabled ? ' aria-disabled="true"' : ''}>${face}<span class="ss-text">${highlight(text, q)}</span>${on ? '<i class="ss-check" aria-hidden="true"></i>' : ''}</div>`;
      shown++;
    });
    inst.items = items;
    list.innerHTML = html || `<div class="ss-empty">Không thấy “${esc(q)}”.<small>Thử gõ ít chữ hơn, hoặc không dấu.</small></div>`;
    const total = choiceCount(sel);
    const foot = panel.querySelector('.ss-foot');
    foot.textContent = q ? `${shown}/${total} ${opts.unit || 'mục'}` : (opts.unit && total > 7 ? `${total} ${opts.unit}` : '');
    foot.hidden = !foot.textContent;
    const cur = items.indexOf(sel.selectedIndex);
    setActive(inst, inst.active >= 0 && inst.active < items.length ? inst.active : (cur >= 0 && !q ? cur : (items.length ? 0 : -1)), true, !keepScroll || cur >= 0);
  }

  function setActive(inst, i, scroll, center) {
    const list = inst.panel && inst.panel.querySelector('.ss-list');
    if (!list) return;
    list.querySelectorAll('.ss-opt.is-active').forEach((x) => x.classList.remove('is-active'));
    inst.active = i;
    const el = i >= 0 ? list.querySelector(`.ss-opt[data-i="${i}"]`) : null;
    const owner = inst.panel.querySelector('input') || list;
    if (!el) { owner.removeAttribute('aria-activedescendant'); return; }
    el.classList.add('is-active');
    owner.setAttribute('aria-activedescendant', el.id);
    if (scroll) {
      if (center) list.scrollTop = el.offsetTop - list.clientHeight / 2 + el.offsetHeight / 2;
      else el.scrollIntoView({ block: 'nearest' });
    }
  }

  function keyNav(inst, e) {
    const n = inst.items.length, k = e.key;
    const step = (d) => { e.preventDefault(); if (n) setActive(inst, (Math.max(inst.active, d > 0 ? -1 : 0) + d + n) % n, true); };
    if (k === 'ArrowDown') step(1);
    else if (k === 'ArrowUp') step(-1);
    else if (k === 'PageDown') { e.preventDefault(); if (n) setActive(inst, Math.min(n - 1, inst.active + 8), true); }
    else if (k === 'PageUp') { e.preventDefault(); if (n) setActive(inst, Math.max(0, inst.active - 8), true); }
    else if (k === 'Home' && e.target.tagName !== 'INPUT') { e.preventDefault(); setActive(inst, 0, true); }
    else if (k === 'End' && e.target.tagName !== 'INPUT') { e.preventDefault(); setActive(inst, n - 1, true); }
    else if (k === 'Enter') { e.preventDefault(); if (inst.active >= 0) choose(inst, inst.active); }
    else if (k === 'Escape') { e.preventDefault(); e.stopPropagation(); close(inst); }
    else if (k === 'Tab') close(inst, false);
  }

  function choose(inst, i) {
    const { sel, opts } = inst;
    const idx = inst.items[i];
    const o = sel.options[idx];
    if (!o || o.disabled) return;
    const changed = sel.selectedIndex !== idx;
    sel.selectedIndex = idx;
    close(inst);
    if (changed) {
      sel.dispatchEvent(new Event('input', { bubbles: true }));
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      inst.btn.classList.remove('is-picked'); void inst.btn.offsetWidth; inst.btn.classList.add('is-picked');
    }
    // Trường → Lớp → Họ và tên: ô kế tiếp vừa được mở khoá và chưa chọn thì mở luôn
    const next = opts.next && document.getElementById(opts.next);
    if (changed && next && next.__smart) {
      setTimeout(() => { if (!next.disabled && !next.value && choiceCount(next) > 0) open(next.__smart); }, 90);
    }
  }

  /** Bọc mọi <select> trong root theo cấu hình { id: opts }; id không có trong cấu hình dùng opts mặc định. */
  function enhanceAll(root, config = {}) {
    if (!root) return [];
    return Array.from(root.querySelectorAll('select')).filter((s) => !s.closest('[data-ss-off]') && !s.multiple && !(s.size > 1))
      .map((s) => enhance(s, config[s.id] || {}));
  }

  global.EduSmartSelect = { enhance, enhanceAll, open: (s) => s && s.__smart && open(s.__smart), close: (s) => s && s.__smart && close(s.__smart),
    plain, initials, matches, highlight, cleanPlaceholder };

  /**
   * Tự bọc <select> khớp `selector` — cả ô vẽ thêm sau này (Góc học tập, Thi đua vẽ lại danh sách…). Chế độ keep:
   * nút giữ class của trang. Trang bật bằng <script src="js/ui-select.js" data-auto="select.ar-input, select.td-select">.
   */
  function autoEnhance(selector, config = {}) {
    const run = (root) => {
      if (root.nodeType !== 1) return;
      const list = root.matches && root.matches(selector) ? [root] : root.querySelectorAll(selector);
      list.forEach((s) => { if (!s.__smart && !s.multiple && !(s.size > 1) && !s.closest('[data-ss-off]')) enhance(s, Object.assign({ keep: true }, config[s.id] || {})); });
    };
    run(document.body);
    new MutationObserver((muts) => muts.forEach((m) => m.addedNodes.forEach(run))).observe(document.body, { childList: true, subtree: true });
  }
  global.EduSmartSelect.autoEnhance = autoEnhance;

  const AUTO = (document.currentScript && document.currentScript.dataset.auto) || '';
  const boot = () => {
    // Sảnh học sinh: bọc ngay khi trang dựng xong (option đổ sau vẫn tự cập nhật)
    const lobby = document.querySelector('#lobby .lobby-card') || document.getElementById('lobby');
    if (lobby) enhanceAll(lobby, {
      studentSchool: { next: 'studentClass', unit: 'trường', title: 'Chọn trường' },
      studentClass: { next: 'studentName', unit: 'lớp', title: 'Chọn lớp', searchMin: 9 },
      studentName: { avatar: true, unit: 'học sinh', title: 'Chọn họ và tên', searchMin: 6 },
      categorySelect: { title: 'Chương trình' },
      levelSelect: { title: 'Cấp độ' },
      minitestSelect: { unit: 'bài', title: 'Bài luyện tập', searchMin: 8 },
    });
    if (AUTO) autoEnhance(AUTO, {
      lhStudent: { avatar: true, unit: 'học sinh', searchMin: 6 },
      tdShopStudent: { avatar: true, unit: 'học sinh', searchMin: 6 },
      tdRosterSchool: { next: 'tdRosterClass', unit: 'trường' },
      tdRosterClass: { unit: 'lớp' },
      arMt: { unit: 'bài', searchMin: 8 },
    });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})(typeof window !== 'undefined' ? window : globalThis);
