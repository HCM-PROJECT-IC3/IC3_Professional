/* ============================================================
   js/arena/arena-kinds.js — giao diện trả lời các dạng câu KHÁC "chọn 1" trong Đấu trường:
     ☑️ Chọn nhiều (multi)  — bấm chọn đủ N ô rồi Chốt
     🔢 Sắp xếp (order)     — bấm các bước theo thứ tự 1 → n rồi Chốt (kiểu Kahoot Puzzle)
     🔗 Ghép đôi (match)    — bấm 1 mục bên trái rồi bấm ô màu bên phải, ghép đủ rồi Chốt
   Dùng chung cho Chơi một mình (js/arena/arena.js) và học sinh trong Phòng cả lớp
   (js/arena/arena-room.js). Chấm điểm ở js/arena/arena-core.js (EduArenaCore.grade).
   Chỉ thao tác bấm (không kéo-thả) → dùng tốt trên điện thoại và bảng tương tác.
   ============================================================ */
(function (global) {
  'use strict';

  const C = global.EduArenaCore;
  const SHAPES = ['▲', '◆', '●', '■', '★', '⬟'];
  const LETTERS = 'ABCDEF';
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /** Số ô cần chọn của câu Chọn nhiều (câu gửi cho học sinh trong phòng chỉ có `need`, không có đáp án). */
  const needOf = (q) => q.need || (q.correct || []).length;

  /** Dòng hướng dẫn ngắn cho từng dạng. */
  function hint(q) {
    switch (C.kindOf(q)) {
      // Câu đã ghi "(Chọn 2)" và nút Chốt đã hiện (0/2) → không lặp thêm dòng hướng dẫn.
      case 'multi': return /chọn\s*\d/i.test(q.text || '') ? '' : `☑️ Chọn <b>${needOf(q)}</b> đáp án đúng rồi bấm <b>Chốt</b>`;
      case 'order': return '🔢 Bấm các bước theo <b>đúng thứ tự</b> (bước 1 bấm trước) rồi bấm <b>Chốt</b>';
      case 'match': return '🔗 Bấm 1 mục <b>bên trái</b> rồi bấm ô màu <b>bên phải</b> để ghép — ghép đủ rồi bấm <b>Chốt</b>';
      default: return '';
    }
  }

  function tile(k, text, extra) {
    return `<button type="button" class="ar-ans c${k}" data-kk="${k}"><span class="ar-shape" aria-hidden="true">${SHAPES[k]}</span>`
      + `<span class="ar-ans-text">${esc(text)}</span>${extra || ''}<kbd>${k + 1}</kbd></button>`;
  }

  /**
   * Vẽ khung trả lời vào `box` và trả bộ điều khiển.
   * opts.onAnswer(a) — gọi khi em bấm Chốt (a đúng khuôn EduArenaCore.isAnswer).
   * @returns {{ key(n:number):void, submit():void, lock():void, result(a, q?):void }}
   */
  function mount(box, q, opts) {
    const kind = C.kindOf(q);
    const n = q.options.length;
    const S = { sel: [], seq: [], pairs: (q.left || []).map(() => null), cur: 0, locked: false };
    box.className = 'ar-kind ar-kind-' + kind;

    if (kind === 'match') {
      box.innerHTML = `<p class="ar-kind-hint">${hint(q)}</p>
        <div class="ar-match">
          <div class="ar-match-left">${q.left.map((l, i) => `<button type="button" class="ar-mrow" data-ml="${i}">
            <span class="ar-mletter">${LETTERS[i]}</span><span class="ar-mtext">${esc(l)}</span><span class="ar-mpick" aria-live="polite"></span></button>`).join('')}</div>
          <div class="ar-answers ar-match-right n${n}">${q.options.map((o, k) => tile(k, o, '<span class="ar-mbadges"></span>')).join('')}</div>
        </div>
        <div class="ar-kind-bar"><button type="button" class="ar-btn ar-btn-play ar-kind-go" disabled></button></div>`;
    } else {
      box.innerHTML = `<p class="ar-kind-hint">${hint(q)}</p>
        <div class="ar-answers n${n}">${q.options.map((o, k) => tile(k, o, kind === 'order' ? '<span class="ar-ord-badge"></span>' : '<span class="ar-sel-mark" aria-hidden="true">✓</span>')).join('')}</div>
        <div class="ar-kind-bar">${kind === 'order' ? '<button type="button" class="ar-btn ar-btn-ghost ar-kind-reset"><i class="fa-solid fa-rotate-left"></i> Làm lại</button>' : ''}
          <button type="button" class="ar-btn ar-btn-play ar-kind-go" disabled></button></div>`;
    }
    const go = box.querySelector('.ar-kind-go');
    const tiles = [...box.querySelectorAll('[data-kk]')];
    const rows = [...box.querySelectorAll('[data-ml]')];

    function answer() {
      return kind === 'multi' ? S.sel.slice() : kind === 'order' ? S.seq.slice() : S.pairs.slice();
    }
    function ready() {
      return kind === 'multi' ? S.sel.length === needOf(q) : kind === 'order' ? S.seq.length === n : S.pairs.every((v) => v !== null);
    }
    function paint() {
      if (kind === 'multi') {
        tiles.forEach((b, k) => { const on = S.sel.includes(k); b.classList.toggle('is-sel', on); b.setAttribute('aria-pressed', on); });
        go.textContent = `Chốt đáp án (${S.sel.length}/${needOf(q)})`;
      } else if (kind === 'order') {
        tiles.forEach((b, k) => {
          const pos = S.seq.indexOf(k);
          b.classList.toggle('is-sel', pos >= 0);
          b.querySelector('.ar-ord-badge').textContent = pos >= 0 ? pos + 1 : '';
        });
        go.textContent = `Chốt thứ tự (${S.seq.length}/${n})`;
      } else {
        rows.forEach((r, i) => {
          const k = S.pairs[i];
          r.classList.toggle('is-cur', i === S.cur && !S.locked);
          r.classList.toggle('is-done', k !== null);
          r.querySelector('.ar-mpick').innerHTML = k === null ? '<span class="ar-mempty">?</span>'
            : `<span class="ar-mchip c${k}">${SHAPES[k]}</span>`;
        });
        tiles.forEach((b, k) => {
          const who = S.pairs.map((v, i) => (v === k ? LETTERS[i] : '')).filter(Boolean);
          b.classList.toggle('is-sel', who.length > 0);
          b.querySelector('.ar-mbadges').textContent = who.join(' ');
        });
        go.textContent = `Chốt ghép đôi (${S.pairs.filter((v) => v !== null).length}/${S.pairs.length})`;
      }
      go.disabled = S.locked || !ready();
      go.classList.toggle('is-ready', !S.locked && ready());
    }
    function tap(k) {
      if (S.locked || k < 0 || k >= n) return;
      if (kind === 'multi') {
        const i = S.sel.indexOf(k);
        if (i >= 0) S.sel.splice(i, 1);
        else if (S.sel.length < needOf(q)) S.sel.push(k);
        else { S.sel.shift(); S.sel.push(k); } // đã đủ → thay ô chọn sớm nhất
      } else if (kind === 'order') {
        const i = S.seq.indexOf(k);
        if (i >= 0) S.seq.splice(i, 1); else S.seq.push(k);
      } else {
        const other = S.pairs.indexOf(k);
        if (other >= 0 && other !== S.cur) S.pairs[other] = null; // 1 ô phải chỉ ghép với 1 mục trái
        S.pairs[S.cur] = S.pairs[S.cur] === k ? null : k;
        const next = S.pairs.findIndex((v, i) => v === null && i > S.cur);
        const any = S.pairs.findIndex((v) => v === null);
        if (S.pairs[S.cur] !== null) S.cur = next >= 0 ? next : any >= 0 ? any : S.cur;
      }
      paint();
    }
    function submit() {
      if (S.locked || !ready()) return;
      opts.onAnswer(answer());
    }
    box.addEventListener('click', (e) => {
      const t = e.target.closest('[data-kk]');
      if (t) { tap(+t.dataset.kk); return; }
      const r = e.target.closest('[data-ml]');
      if (r && !S.locked) { S.cur = +r.dataset.ml; paint(); return; }
      if (e.target.closest('.ar-kind-reset') && !S.locked) { S.seq = []; paint(); return; }
      if (e.target.closest('.ar-kind-go')) submit();
    });
    paint();

    return {
      key(num) { tap(num - 1); },
      submit,
      ready,
      lock() {
        S.locked = true;
        box.querySelectorAll('button').forEach((b) => { b.disabled = true; });
        paint();
      },
      /** Tô kết quả sau khi chấm. q phải có đáp án (correct). a = câu trả lời của em (null = hết giờ). */
      result(a, full) {
        const Q = full || q;
        this.lock();
        const want = Q.correct || [];
        if (kind === 'multi') {
          const mine = Array.isArray(a) ? a : [];
          tiles.forEach((b, k) => {
            const right = want.includes(k), picked = mine.includes(k);
            b.classList.toggle('is-correct', right);
            b.classList.toggle('is-wrong', picked && !right);
            b.classList.toggle('is-dim', !right && !picked);
          });
        } else if (kind === 'order') {
          const mine = Array.isArray(a) ? a : [];
          tiles.forEach((b, k) => {
            const should = want.indexOf(k), got = mine.indexOf(k);
            b.classList.toggle('is-correct', got >= 0 && got === should);
            b.classList.toggle('is-wrong', got !== should);
            b.querySelector('.ar-ord-badge').innerHTML = got === should ? should + 1 : `${got >= 0 ? got + 1 : '–'}<small>→${should + 1}</small>`;
          });
        } else {
          const mine = Array.isArray(a) ? a : [];
          rows.forEach((r, i) => {
            const ok = mine[i] === want[i];
            r.classList.add(ok ? 'is-ok' : 'is-bad');
            r.querySelector('.ar-mpick').innerHTML = `<span class="ar-mchip c${want[i]}">${SHAPES[want[i]]}</span>${ok ? '' : `<small class="ar-mfix">${esc(Q.options[want[i]])}</small>`}`;
          });
          tiles.forEach((b) => b.classList.remove('is-sel'));
        }
      },
    };
  }

  /**
   * Khung xem tĩnh cho màn hình giáo viên (máy chiếu) — không bấm được.
   * opts.reveal: tô đáp án đúng; opts.counts/opts.total: thanh số em chọn từng ô (Chọn nhiều).
   */
  function viewHtml(q, opts) {
    const kind = C.kindOf(q);
    const o = opts || {};
    const want = q.correct || [];
    const bar = (k) => (o.counts && kind === 'multi'
      ? `<span class="ar-room-count"><i style="width:${o.total ? Math.round((o.counts[k] / o.total) * 100) : 0}%"></i><b>${o.counts[k]}</b></span>` : '');
    const cell = (k, text, extra) => {
      const cls = o.reveal && kind === 'multi' ? (want.includes(k) ? ' is-correct' : ' is-dim') : '';
      return `<div class="ar-ans c${k}${cls}"><span class="ar-shape" aria-hidden="true">${SHAPES[k]}</span><span class="ar-ans-text">${esc(text)}</span>${extra || ''}${bar(k)}</div>`;
    };
    const head = `<p class="ar-kind-hint">${hint(q)}</p>`;
    if (kind === 'match') {
      return `${head}<div class="ar-match">
        <div class="ar-match-left">${q.left.map((l, i) => `<div class="ar-mrow"><span class="ar-mletter">${LETTERS[i]}</span><span class="ar-mtext">${esc(l)}</span>
          <span class="ar-mpick">${o.reveal ? `<span class="ar-mchip c${want[i]}">${SHAPES[want[i]]}</span>` : ''}</span></div>`).join('')}</div>
        <div class="ar-answers ar-match-right n${q.options.length}">${q.options.map((t, k) => cell(k, t)).join('')}</div></div>`;
    }
    if (kind === 'order' && o.reveal) {
      return `${head}<div class="ar-answers n${q.options.length}">${want.map((k, pos) => cell(k, q.options[k], `<span class="ar-ord-badge">${pos + 1}</span>`)).join('')}</div>`;
    }
    return `${head}<div class="ar-answers n${q.options.length}">${q.options.map((t, k) => cell(k, t)).join('')}</div>`;
  }

  global.EduArenaKinds = { hint, mount, viewHtml };
})(window);
