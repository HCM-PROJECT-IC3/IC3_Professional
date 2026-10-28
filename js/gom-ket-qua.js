/* ============================================================
   js/gom-ket-qua.js — giao diện trang gom-ket-qua.html (giáo viên).
   Toàn bộ chạy trong trình duyệt; dữ liệu học sinh chỉ nằm trên máy này.
   Mọi chữ lấy từ mã đưa lên trang đi qua textContent hoặc esc() (mã là dữ
   liệu không đáng tin) → không có đường chèn HTML.
   ============================================================ */
(function () {
  'use strict';
  const P = window.EduResultPack;
  const $ = (id) => document.getElementById(id);

  const COLS = [
    { k: 'n', t: 'Họ và tên' }, { k: 'c', t: 'Lớp' }, { k: 'p', t: 'Điểm (%)', num: true }, { k: 'k', t: 'Đúng/Tổng', num: true },
    { k: 'tm', t: 'Thời gian', num: true }, { k: 't', t: 'Bài' }, { k: 'm', t: 'Chế độ' }, { k: 'st', t: 'Trạng thái' }, { k: 'ts', t: 'Giờ nộp' },
  ];
  const state = { rows: [], codes: [], ids: new Set(), sortKey: 'n', sortDir: 1, fClass: '', fTest: '' };

  // Lưu các mã đã gom vào trình duyệt này để đóng tab / tắt máy không mất (giáo viên thường gom dần
  // qua nhiều buổi). Chỉ lưu MÃ GỐC (không lưu bản đã giải) và nạp lại qua EduResultPack.parseMany →
  // dữ liệu bị sửa tay trong localStorage cũng bị kiểm tra lại như mã mới dán vào.
  const STORE_KEY = 'eduquiz_gom_ket_qua_v1';
  const STORE_MAX = 2000;
  function persist() {
    try {
      if (!state.codes.length) { localStorage.removeItem(STORE_KEY); return true; }
      localStorage.setItem(STORE_KEY, JSON.stringify({ v: 1, at: Date.now(), codes: state.codes.slice(0, STORE_MAX) }));
      return true;
    } catch (e) { return false; }   // đầy bộ nhớ / bị chặn: vẫn dùng được trong tab này
  }
  function restore() {
    try {
      const o = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
      if (!o || o.v !== 1 || !Array.isArray(o.codes)) return 0;
      const res = P.parseMany(o.codes.filter((c) => typeof c === 'string').join('\n'));
      res.rows.forEach((r, i) => { state.ids.add(r.id); state.rows.push(r); state.codes.push(res.codes[i]); });
      return res.rows.length;
    } catch (e) { return 0; }
  }

  function msg(t) { $('gkMsg').textContent = t || ''; }
  function showErrors(list) {
    const ul = $('gkErrors');
    ul.textContent = '';
    ul.hidden = !list.length;
    list.slice(0, 20).forEach((b) => { const li = document.createElement('li'); li.textContent = b.code + ' — ' + b.error; ul.appendChild(li); });
    if (list.length > 20) { const li = document.createElement('li'); li.textContent = '… và ' + (list.length - 20) + ' mã lỗi khác'; ul.appendChild(li); }
  }

  function addTexts(texts) {
    const res = P.parseMany(texts);
    let added = 0;
    for (let i = 0; i < res.rows.length; i++) {
      const r = res.rows[i];
      if (state.ids.has(r.id)) continue;
      state.ids.add(r.id); state.rows.push(r); state.codes.push(res.codes[i]); added++;
    }
    const saved = persist();
    const dup = res.dup + (res.rows.length - added);
    const parts = ['Đã thêm ' + added + ' kết quả'];
    if (dup) parts.push('bỏ qua ' + dup + ' bài trùng');
    if (res.bad.length) parts.push(res.bad.length + ' mã lỗi (xem bên dưới)');
    if (!saved) parts.push('chưa lưu được vào trình duyệt (bộ nhớ đầy/bị chặn) — nhớ tải CSV trước khi đóng tab');
    if (state.rows.length >= STORE_MAX) parts.push('đã chạm ' + STORE_MAX + ' bài — tải CSV rồi bấm Xoá hết để gom tiếp');
    if (!added && !dup && !res.bad.length) parts.push('— không tìm thấy mã nào (mã bắt đầu bằng EQR1.)');
    msg(parts.join(', ') + '.');
    showErrors(res.bad);
    refreshFilters();
    render();
  }

  function visibleRows() {
    const rows = state.rows.filter((r) => (!state.fClass || r.c === state.fClass) && (!state.fTest || r.t === state.fTest));
    const k = state.sortKey, d = state.sortDir;
    const col = COLS.find((c) => c.k === k);
    return rows.slice().sort((a, b) => {
      if (col && col.num) {
        const x = k === 'k' ? parseInt(a.k, 10) || 0 : (k === 'tm' ? mmss(a.tm) : a[k]);
        const y = k === 'k' ? parseInt(b.k, 10) || 0 : (k === 'tm' ? mmss(b.tm) : b[k]);
        return (x - y) * d;
      }
      return String(a[k] || '').localeCompare(String(b[k] || ''), 'vi') * d;
    });
  }
  function mmss(s) { const m = /^(\d+):(\d+)$/.exec(s || ''); return m ? (+m[1]) * 60 + (+m[2]) : 0; }

  function fillSelect(sel, values, allLabel, cur) {
    sel.textContent = '';
    const first = document.createElement('option'); first.value = ''; first.textContent = allLabel; sel.appendChild(first);
    values.forEach((v) => { const o = document.createElement('option'); o.value = v; o.textContent = v; sel.appendChild(o); });
    sel.value = values.indexOf(cur) > -1 ? cur : '';
  }
  function refreshFilters() {
    const uniq = (k) => Array.from(new Set(state.rows.map((r) => r[k]).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'vi'));
    fillSelect($('gkFilterClass'), uniq('c'), 'Tất cả lớp', state.fClass);
    fillSelect($('gkFilterTest'), uniq('t'), 'Tất cả bài', state.fTest);
    state.fClass = $('gkFilterClass').value; state.fTest = $('gkFilterTest').value;
  }

  function renderStats(rows) {
    const s = P.summary(rows);
    const box = $('gkStats');
    box.textContent = '';
    [['Số bài', s.count], ['Điểm trung bình', s.count ? s.avg + '%' : '—'], ['Cao nhất', s.count ? s.max + '%' : '—'], ['Thấp nhất', s.count ? s.min + '%' : '—'], ['Dưới 50%', s.below50]]
      .forEach(([label, val]) => {
        const d = document.createElement('div'); d.className = 'gk-stat';
        const b = document.createElement('b'); b.textContent = String(val);
        const sp = document.createElement('span'); sp.textContent = label;
        d.appendChild(b); d.appendChild(sp); box.appendChild(d);
      });
  }

  function render() {
    const rows = visibleRows();
    renderStats(rows);
    const body = $('gkBody');
    body.textContent = '';
    if (!rows.length) {
      const tr = document.createElement('tr'); const td = document.createElement('td');
      td.colSpan = COLS.length; td.className = 'gk-note'; td.textContent = 'Chưa có kết quả nào.';
      tr.appendChild(td); body.appendChild(tr);
    }
    rows.forEach((r) => {
      const tr = document.createElement('tr');
      COLS.forEach((c) => {
        const td = document.createElement('td');
        let v = r[c.k];
        if (c.k === 'm') v = r.m === 'practice' ? 'Ôn luyện' : 'Kiểm tra';
        td.textContent = v == null ? '' : String(v);
        if (c.num) td.className = 'num';
        if (c.k === 'p' && r.p < 50) td.classList.add('gk-low');
        if (c.k === 'st' && r.st && r.st !== 'OK') td.classList.add('gk-warn');
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
    $('gkCsv').disabled = !rows.length;
    wqReset();
  }

  function renderHead() {
    const tr = $('gkHead');
    COLS.forEach((c) => {
      const th = document.createElement('th');
      th.textContent = c.t; th.tabIndex = 0; th.scope = 'col';
      const sort = () => {
        if (state.sortKey === c.k) state.sortDir = -state.sortDir; else { state.sortKey = c.k; state.sortDir = 1; }
        th.setAttribute('aria-sort', state.sortDir > 0 ? 'ascending' : 'descending');
        tr.querySelectorAll('th').forEach((o) => { if (o !== th) o.removeAttribute('aria-sort'); });
        render();
      };
      th.addEventListener('click', sort);
      th.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); sort(); } });
      tr.appendChild(th);
    });
  }

  // ── 4. Câu cả lớp hay sai — đếm trên máy (EduResultPack.wrongStats), tra nội dung câu từ
  // data/ic3 (EduQuestionLookup) chỉ khi bấm Phân tích (file khối ~1 MB). Đã phân tích 1 lần
  // thì đổi bộ lọc / thêm mã sẽ tự tính lại (file đã nạp nằm trong bộ nhớ). ──
  const WQ_SHOW = 15, WQ_EXAM_MAX = 20;
  const wq = { on: false, run: 0, key: '', stats: null, resolved: null, label: '' };
  const L = window.EduQuestionLookup;
  function wqScopeLabel() {
    return [state.fClass || 'Tất cả lớp', state.fTest || 'tất cả bài'].join(' · ');
  }
  const WQ_HINT = $('wqStatus').textContent;
  /** Gọi sau mỗi lần vẽ bảng: chỉ tính lại khi bộ lọc / số bài đổi (bấm sắp xếp cột thì giữ nguyên). */
  function wqReset() {
    $('wqAnalyze').disabled = !state.rows.length || !L;
    const key = [state.fClass, state.fTest, state.rows.length].join('|');
    if (key === wq.key) return;
    wq.key = key;
    if (wq.on && state.rows.length) { wqAnalyze(); return; }
    wq.on = false;
    wq.stats = null;
    $('wqStatus').textContent = WQ_HINT;
    $('wqList').textContent = '';
    $('wqMakeExam').hidden = true;
    $('wqLinkRow').hidden = true;
  }
  async function wqAnalyze() {
    const run = ++wq.run;
    wq.on = true;
    const stats = P.wrongStats(visibleRows());
    const label = wqScopeLabel();
    $('wqStatus').textContent = '⏳ Đang tra nội dung câu hỏi…';
    const resolved = await L.resolve(stats.items.slice(0, Math.max(WQ_SHOW, WQ_EXAM_MAX)));
    if (run !== wq.run) return;   // bộ lọc đổi trong lúc đang tra → lượt mới lo
    Object.assign(wq, { stats, resolved, label });
    wqRender();
  }
  function wqRender() {
    const { stats, resolved } = wq;
    const esc = L.esc, plain = L.plain;
    // Cùng số lượt sai thì câu tra được nội dung đứng trước câu đã đổi/xoá (sort ổn định).
    const items = stats.items.slice(0, Math.max(WQ_SHOW, WQ_EXAM_MAX))
      .sort((a, b) => b.count - a.count || resolved.has(b.uid) - resolved.has(a.uid)).slice(0, WQ_SHOW);
    $('wqStatus').textContent = 'Phạm vi: ' + wq.label + ' — ' + stats.submissions + ' bài, ' + stats.withWrong + ' bài có câu sai.'
      + (items.length && resolved.size < items.length ? ' Câu không tra được nội dung: chưa tải sẵn ngân hàng câu hỏi khi mất mạng, hoặc câu đã đổi/xoá.' : '');
    $('wqList').innerHTML = items.length ? items.map((it, i) => {
      const r = resolved.get(it.uid);
      const text = r ? plain(r.q.question) : '(Không tìm thấy câu ' + it.uid + ' trong ngân hàng)';
      const pct = stats.submissions ? Math.round((it.count / stats.submissions) * 100) : 0;
      return `<li class="wq-item"><details>
          <summary><span class="wq-rank">${i + 1}</span><span class="wq-q">${esc(text)}</span>
            <span class="wq-meta">${it.count} lượt sai · ${it.students} HS · ${pct}% bài${r ? ` · ${esc(r.levelName)} › ${esc(r.mt)}` : ''}</span></summary>
          ${r ? L.answerHtml(r.q) + (r.q.explanation ? `<p class="wq-expl">💡 ${esc(plain(r.q.explanation))}</p>` : '') : ''}
        </details></li>`;
    }).join('') : '<li class="gk-note">Không có câu sai nào trong phạm vi này.</li>';
    $('wqMakeExam').hidden = !items.some((it) => resolved.has(it.uid));
    $('wqLinkRow').hidden = true;
  }
  /** Đề ôn từ các câu hay sai nhất — cùng Chương trình/Cấp độ với câu sai nhiều nhất (link đề chỉ chứa 1 cấp độ). */
  async function wqMakeExam() {
    const picks = wq.stats.items.map((it) => wq.resolved.get(it.uid) && Object.assign({ uid: it.uid }, wq.resolved.get(it.uid))).filter(Boolean);
    if (!picks.length) return;
    const head = picks[0];
    const items = picks.filter((p) => p.catId === head.catId && p.levelId === head.levelId).slice(0, WQ_EXAM_MAX).map((p) => ({ mt: p.mt, uid: p.uid }));
    const btn = $('wqMakeExam');
    btn.disabled = true;
    try {
      await window.EduLazyLoad.loadScripts(['js/custom-exam-codec.js']);
      const url = new URL(await window.EduCustomExam.buildLink({
        title: ('Ôn câu hay sai — ' + wq.label).slice(0, 120),
        desc: items.length + ' câu ' + head.levelName + ' học sinh sai nhiều nhất',
        cat: head.catId, level: head.levelId, duration: 0, shuffle: true, items,
      }, 'index.html'), location.href).href;
      $('wqLink').value = url;
      $('wqLinkRow').hidden = false;
      let copied = false;
      try { await navigator.clipboard.writeText(url); copied = true; } catch (e) { /* trình duyệt chặn clipboard */ }
      $('wqLinkLabel').textContent = copied ? 'Đã chép link đề ôn ' + items.length + ' câu — gửi cho học sinh:' : 'Link đề ôn ' + items.length + ' câu — chép gửi cho học sinh:';
      if (!copied) $('wqLink').select();
    } catch (err) {
      $('wqLinkRow').hidden = false;
      $('wqLink').value = '';
      $('wqLinkLabel').textContent = 'Không tạo được đề: ' + err.message;
    } finally {
      btn.disabled = false;
    }
  }

  function readFiles(fileList) {
    const files = Array.from(fileList || []).slice(0, 300);
    if (!files.length) return;
    Promise.all(files.map((f) => (f.size > 2 * 1024 * 1024 ? Promise.resolve('') : f.text()))).then(addTexts);
  }

  function init() {
    if (!P) { msg('Không tải được bộ xử lý mã (js/services/result-pack.js).'); return; }
    renderHead();
    $('gkAddText').addEventListener('click', () => { addTexts([$('gkText').value]); $('gkText').value = ''; });
    $('gkClear').addEventListener('click', () => {
      wq.on = false;
      state.rows = []; state.codes = []; state.ids = new Set(); state.fClass = ''; state.fTest = ''; persist();
      $('gkText').value = ''; $('gkFiles').value = ''; showErrors([]); msg(''); refreshFilters(); render();
    });
    $('gkFiles').addEventListener('change', (e) => { readFiles(e.target.files); e.target.value = ''; });
    const drop = $('gkDrop');
    ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('is-over'); }));
    ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('is-over'); }));
    drop.addEventListener('drop', (e) => readFiles(e.dataTransfer && e.dataTransfer.files));
    drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('gkFiles').click(); } });
    $('gkFilterClass').addEventListener('change', (e) => { state.fClass = e.target.value; render(); });
    $('gkFilterTest').addEventListener('change', (e) => { state.fTest = e.target.value; render(); });
    $('wqAnalyze').addEventListener('click', wqAnalyze);
    $('wqMakeExam').addEventListener('click', wqMakeExam);
    $('wqLink').addEventListener('focus', (e) => e.target.select());
    $('gkCsv').addEventListener('click', () => {
      const rows = visibleRows();
      const blob = new Blob([P.toCsv(rows)], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'bang-diem-' + new Date().toISOString().slice(0, 10) + '.csv';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    });
    const back = restore();
    if (back) { msg('Đã khôi phục ' + back + ' kết quả gom từ lần trước (lưu trên trình duyệt này).'); refreshFilters(); }
    render();
  }
  init();
})();
