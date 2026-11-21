/* ============================================================
   js/teaching-schedule-leave.js — tab "Nghỉ phép" của Lịch giảng dạy.

   0 lượt Firebase / Apps Script:
   - Đơn + hồ sơ (bộ phận, chữ ký, số ngày phép/năm, ngày lễ) lưu localStorage
     "nghiphep_v1:<uid>" trên máy này. Sao lưu/khôi phục bằng file .json.
   - Tên GV lấy từ sự kiện edu:ready (hồ sơ trang đã đọc sẵn).
   - "Buổi dạy bị ảnh hưởng" chỉ đọc lịch TUẦN ĐANG MỞ đã nạp ở tab Lịch tuần
     (window.EduTeachingScheduleState), không tự đọc thêm tuần khác.
   - PDF vẽ bằng jsPDF + font Tinos + logo IIG có sẵn (lazy, giống Phiếu công tác),
     bố cục theo mẫu "Đơn xin nghỉ phép" của công ty.
   ============================================================ */
(function (global) {
  'use strict';

  const TYPES = ['Phép năm', 'Bệnh', 'Cưới', 'Thai sản', 'Tang lễ', 'Nghỉ an dưỡng', 'Các loại khác'];
  const STATUS = { draft: 'Nháp', sent: 'Đã nộp', ok: 'Đã duyệt', no: 'Không duyệt' };
  // Lễ dương lịch cố định (dd-mm). Tết âm lịch/giỗ Tổ đổi theo năm → GV tự thêm ở "Ngày lễ khác".
  const FIXED_HOLIDAYS = ['01-01', '30-04', '01-05', '02-09'];
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
  const pad = (n) => (n < 10 ? '0' : '') + n;
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = (s) => { if (!s) return null; const p = s.split('-'); return new Date(+p[0], p[1] - 1, +p[2]); };
  const vn = (d) => (d ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}` : '');
  const fmt = (n) => `${(Math.round(n * 10) / 10).toFixed(1)} ngày`;

  let KEY = 'nghiphep_v1';
  let st = { profile: {}, list: [] };
  let editingId = null;
  let me = { name: '', code: '' };

  function toast(msg) {
    const el = $('toast'); if (!el) return;
    el.textContent = msg; el.classList.add('show');
    clearTimeout(el._lv); el._lv = setTimeout(() => el.classList.remove('show'), 2600);
  }
  function load() {
    try { st = JSON.parse(localStorage.getItem(KEY)) || null; } catch (e) { st = null; }
    if (!st) { // chuyển dữ liệu từ bản nghi-phep.html cũ (nếu có)
      try { const old = JSON.parse(localStorage.getItem('nghiphep_v1')); if (old) st = { profile: old.profile || {}, list: [] }; } catch (e) { /* bỏ qua */ }
    }
    st = st || {}; st.profile = st.profile || {}; st.list = Array.isArray(st.list) ? st.list : [];
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(st)); return true; }
    catch (e) { toast('Bộ nhớ máy đầy — xoá bớt đơn cũ hoặc chữ ký'); return false; }
  }

  // ---------------- Tính ngày ----------------
  function holidaySet() {
    const set = new Set();
    String(st.profile.holidays || '').split(/[\s,;]+/).forEach((t) => {
      const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (m) set.add(`${m[3]}-${pad(+m[2])}-${pad(+m[1])}`);
    });
    return set;
  }
  function isWork(d, hs) {
    const w = d.getDay();
    if (w === 0 || (w === 6 && !st.profile.sat)) return false;
    if (FIXED_HOLIDAYS.includes(`${pad(d.getDate())}-${pad(d.getMonth() + 1)}`)) return false;
    return !hs.has(iso(d));
  }
  function lineDays(l, hs) {
    const a = parse(l.from), b = parse(l.to);
    if (!a || !b || b < a) return null;
    let n = 0;
    for (const x = new Date(a); x <= b; x.setDate(x.getDate() + 1)) if (isWork(x, hs)) n += 1;
    if (isWork(a, hs) && l.fromS === 'pm') n -= 0.5;
    if (isWork(b, hs) && l.toS === 'am') n -= 0.5;
    return n > 0 ? n : null;
  }
  function calc(f) {
    const hs = holidaySet();
    let total = 0, ok = f.lines.length > 0, last = null;
    const per = f.lines.map((l) => {
      const n = lineDays(l, hs); if (n == null) ok = false; else total += n;
      const b = parse(l.to);
      if (b && (!last || b > last.d || (+b === +last.d && l.toS === 'pm'))) last = { d: b, s: l.toS };
      return n;
    });
    let back = null;
    if (last) {
      if (last.s === 'am') back = { d: last.d, pm: true };
      else { const x = new Date(last.d); do { x.setDate(x.getDate() + 1); } while (!isWork(x, hs)); back = { d: x, pm: false }; }
    }
    return { ok, per, total, back };
  }
  /** Ngày "Phép năm" đã dùng trong năm (các đơn đã lưu, trừ đơn bị từ chối và đơn đang sửa). */
  function annualUsed(year, exceptId) {
    const hs = holidaySet(); let used = 0;
    st.list.forEach((f) => {
      if (f.id === exceptId || f.status === 'no') return;
      f.lines.forEach((l) => { if (l.type === 0 && l.from.slice(0, 4) === String(year)) used += lineDays(l, hs) || 0; });
    });
    return used;
  }
  function remaining(f, c) {
    if (String(f.left || '').trim()) return String(f.left).trim();
    const pl = f.lines.find((l) => l.type === 0); if (!pl) return '';
    const quota = parseFloat(st.profile.quota); if (!(quota >= 0)) return '';
    const thisAnnual = f.lines.reduce((s, l, i) => s + (l.type === 0 ? c.per[i] || 0 : 0), 0);
    return fmt(quota - annualUsed(pl.from.slice(0, 4), f.id) - thisAnnual);
  }

  // ---------------- Buổi dạy trùng ngày nghỉ (chỉ tuần đang mở) ----------------
  function affected(f) {
    const S = global.EduTeachingScheduleState;
    if (!S || !S.currentWeekKey) return { inWeek: false, rows: [] };
    const code = S.myTeacherCode || me.code;
    const days = code && S.schedulesByTeacher && S.schedulesByTeacher[code] && S.schedulesByTeacher[code].days;
    const mon = parse(S.currentWeekKey); const rows = []; let inWeek = false;
    if (!mon) return { inWeek: false, rows };
    for (let i = 0; i < 6; i++) {
      const d = new Date(mon); d.setDate(mon.getDate() + i); const k = iso(d);
      ['morning', 'afternoon'].forEach((s) => {
        const hit = f.lines.some((l) => l.from && l.to && k >= l.from && k <= l.to
          && !(k === l.from && l.fromS === 'pm' && s === 'morning') && !(k === l.to && l.toS === 'am' && s === 'afternoon'));
        if (!hit) return; inWeek = true;
        const sess = days && days[i + 2] && days[i + 2][s];
        if (sess && sess.type && !/nghỉ/i.test(sess.type)) {
          const cls = (sess.periods || []).filter(Boolean).join(', ');
          rows.push(`${['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'][i]} ${vn(d)} · ${s === 'morning' ? 'Sáng' : 'Chiều'}: ${sess.type}${sess.location ? ' — ' + sess.location : ''}${cls ? ' (' + cls + ')' : ''}`);
        }
      });
    }
    return { inWeek, rows, week: vn(mon) };
  }

  // ---------------- Form ----------------
  function buildRows() {
    $('lvTypes').innerHTML = TYPES.map((t, i) => `
      <div class="lv-trow" data-i="${i}">
        <label class="lv-tname"><input type="checkbox" class="lv-on"> ${t}</label>
        <input type="date" class="form-input lv-from" aria-label="${t}: từ ngày">
        <select class="form-input lv-fromS" aria-label="${t}: từ buổi"><option value="am">8h00</option><option value="pm">13h30</option></select>
        <span class="lv-arrow">→</span>
        <input type="date" class="form-input lv-to" aria-label="${t}: đến ngày">
        <select class="form-input lv-toS" aria-label="${t}: đến buổi"><option value="pm">17h30</option><option value="am">12h00</option></select>
        <span class="lv-tot"></span>
      </div>`).join('');
  }
  function rowEls() { return Array.from(document.querySelectorAll('#lvTypes .lv-trow')); }
  function read() {
    const lines = [];
    rowEls().forEach((r) => {
      if (!r.querySelector('.lv-on').checked) return;
      lines.push({ type: +r.dataset.i, from: r.querySelector('.lv-from').value, fromS: r.querySelector('.lv-fromS').value, to: r.querySelector('.lv-to').value, toS: r.querySelector('.lv-toS').value });
    });
    return {
      id: editingId, name: $('lvName').value.trim(), dept: $('lvDept').value.trim(), date: $('lvDate').value,
      lines, reason: $('lvReason').value.trim(), handover: $('lvHandover').value.trim(), left: $('lvLeft').value.trim(),
      status: $('lvStatus').value,
    };
  }
  function fill(f) {
    editingId = f.id || null;
    $('lvName').value = f.name || ''; $('lvDept').value = f.dept || ''; $('lvDate').value = f.date || iso(new Date());
    $('lvReason').value = f.reason || ''; $('lvHandover').value = f.handover || ''; $('lvLeft').value = f.left || '';
    $('lvStatus').value = f.status || 'draft';
    const today = iso(new Date());
    rowEls().forEach((r) => {
      const l = (f.lines || []).find((x) => x.type === +r.dataset.i);
      r.querySelector('.lv-on').checked = !!l;
      r.querySelector('.lv-from').value = l ? l.from : today; r.querySelector('.lv-fromS').value = l ? l.fromS : 'am';
      r.querySelector('.lv-to').value = l ? l.to : today; r.querySelector('.lv-toS').value = l ? l.toS : 'pm';
    });
    $('lvEditing').textContent = editingId ? 'Đang sửa đơn đã lưu' : 'Đơn mới';
    refresh();
  }
  function newForm() {
    fill({ name: st.profile.name || me.name, dept: st.profile.dept || 'Dự Án / GVTH', lines: [{ type: 0, from: iso(new Date()), fromS: 'am', to: iso(new Date()), toS: 'pm' }] });
  }

  function refresh() {
    const f = read(), c = calc(f);
    rowEls().forEach((r) => {
      const on = r.querySelector('.lv-on').checked; r.classList.toggle('on', on);
      const idx = f.lines.findIndex((l) => l.type === +r.dataset.i);
      r.querySelector('.lv-tot').textContent = on ? (c.per[idx] != null ? fmt(c.per[idx]) : 'Sai ngày') : '';
      r.querySelector('.lv-tot').classList.toggle('bad', on && c.per[idx] == null);
    });
    const left = c.ok ? remaining(f, c) : '';
    const af = c.ok ? affected(f) : { inWeek: false, rows: [] };
    $('lvSummary').innerHTML = !f.lines.length ? '<p class="lv-muted">Tích ít nhất 1 loại nghỉ.</p>' : !c.ok ? '<p class="lv-bad">Kiểm tra lại ngày: “đến” phải sau “từ” và có ít nhất nửa ngày làm việc.</p>' : `
      <div class="lv-stats">
        <div><span>Tổng số ngày vắng</span><b>${fmt(c.total)}</b></div>
        <div><span>Ngày trở lại làm việc</span><b>${c.back ? (c.back.pm ? 'Chiều ' : '') + vn(c.back.d) : ''}</b></div>
        <div><span>Phép năm còn</span><b>${esc(left || '—')}</b></div>
      </div>
      ${af.rows.length ? `<div class="lv-affect"><b><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> Buổi dạy trùng ngày nghỉ (tuần ${af.week}) — nhớ sắp người dạy thay:</b><ul>${af.rows.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>`
        : af.inWeek ? '<p class="lv-muted">Tuần đang mở ở Lịch tuần không có buổi dạy nào trùng ngày nghỉ.</p>'
          : '<p class="lv-muted">Muốn xem buổi dạy bị ảnh hưởng: mở đúng tuần đó ở tab Lịch tuần rồi quay lại đây.</p>'}`;
    drawStats();
  }

  // ---------------- Lịch sử + thống kê ----------------
  function drawHistory() {
    const ul = $('lvHistory');
    const q = $('lvHistYear').value;
    const list = st.list.filter((f) => !q || (f.lines[0] && f.lines[0].from.slice(0, 4) === q))
      .sort((a, b) => ((b.lines[0] || {}).from || '').localeCompare((a.lines[0] || {}).from || ''));
    if (!list.length) { ul.innerHTML = '<li class="lv-muted">Chưa có đơn nào.</li>'; return; }
    ul.innerHTML = list.map((f) => {
      const c = calc(f); const l0 = f.lines[0] || {};
      const lastTo = f.lines.reduce((m, l) => (l.to > m ? l.to : m), '');
      return `<li data-id="${esc(f.id)}">
        <div><b>${esc(f.lines.map((l) => TYPES[l.type]).join(' + '))}</b> · ${vn(parse(l0.from))}${lastTo !== l0.from ? ' → ' + vn(parse(lastTo)) : ''} · ${c.ok ? fmt(c.total) : '?'}
          <div class="lv-muted">${esc(f.reason || '')}</div></div>
        <select class="form-input lv-st" aria-label="Trạng thái">${Object.keys(STATUS).map((k) => `<option value="${k}"${k === f.status ? ' selected' : ''}>${STATUS[k]}</option>`).join('')}</select>
        <span class="lv-acts">
          <button type="button" class="btn btn-ghost lv-open" title="Mở để sửa"><i class="fa-solid fa-pen" aria-hidden="true"></i></button>
          <button type="button" class="btn btn-ghost lv-copy" title="Nhân bản thành đơn mới"><i class="fa-solid fa-copy" aria-hidden="true"></i></button>
          <button type="button" class="btn btn-ghost lv-pdf" title="Tải PDF"><i class="fa-solid fa-file-export" aria-hidden="true"></i></button>
          <button type="button" class="btn btn-ghost lv-del" title="Xoá"><i class="fa-solid fa-trash" aria-hidden="true"></i></button>
        </span></li>`;
    }).join('');
  }
  function drawStats() {
    const year = $('lvHistYear').value || String(new Date().getFullYear());
    const hs = holidaySet(); const by = TYPES.map(() => 0);
    st.list.forEach((f) => { if (f.status === 'no') return; f.lines.forEach((l) => { if (l.from.slice(0, 4) === year) by[l.type] += lineDays(l, hs) || 0; }); });
    const quota = parseFloat(st.profile.quota);
    const chips = by.map((n, i) => (n ? `<span class="lv-chip">${TYPES[i]}: <b>${fmt(n)}</b></span>` : '')).join('');
    $('lvStats').innerHTML = `<span class="lv-chip strong">Năm ${year} · Phép năm còn: <b>${quota >= 0 ? fmt(quota - by[0]) : '—'}</b>${quota >= 0 ? ` / ${quota}` : ''}</span>${chips}`;
  }
  function yearOptions() {
    const ys = new Set([String(new Date().getFullYear())]);
    st.list.forEach((f) => f.lines.forEach((l) => l.from && ys.add(l.from.slice(0, 4))));
    const cur = $('lvHistYear').value;
    $('lvHistYear').innerHTML = '<option value="">Tất cả năm</option>' + Array.from(ys).sort().reverse().map((y) => `<option${y === cur ? ' selected' : ''}>${y}</option>`).join('');
    if (!cur) $('lvHistYear').value = String(new Date().getFullYear());
  }

  function keepProfile() {
    st.profile.name = $('lvName').value.trim(); st.profile.dept = $('lvDept').value.trim();
    st.profile.quota = $('lvQuota').value.trim(); st.profile.sat = $('lvSat').checked; st.profile.holidays = $('lvHolidays').value;
    save();
  }
  function validate() {
    const f = read(), c = calc(f);
    if (!f.name) { toast('Nhập họ tên'); $('lvName').focus(); return null; }
    if (!c.ok) { toast('Kiểm tra lại ngày nghỉ'); return null; }
    return f;
  }
  function overlaps(f) {
    return st.list.find((o) => o.id !== f.id && o.status !== 'no' && o.lines.some((a) => f.lines.some((b) => a.from <= b.to && b.from <= a.to)));
  }
  function saveForm(silent) {
    const f = validate(); if (!f) return null;
    const dup = overlaps(f);
    if (dup && !silent && !confirm(`Đơn này trùng ngày với đơn đã lưu (${vn(parse(dup.lines[0].from))}). Vẫn lưu?`)) return null;
    if (!f.id) f.id = 'lv' + Date.now().toString(36);
    f.savedAt = new Date().toISOString();
    st.list = st.list.filter((x) => x.id !== f.id); st.list.push(f);
    editingId = f.id; keepProfile();
    if (save() && !silent) toast('Đã lưu đơn');
    $('lvEditing').textContent = 'Đang sửa đơn đã lưu';
    yearOptions(); drawHistory(); refresh();
    return f;
  }

  // ---------------- PDF ----------------
  function slug(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, ''); }
  function buildDoc(f) {
    const { jsPDF } = global.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' });
    const c = calc(f); const L = 60, R = 535, F = 'Tinos';
    const line = (x1, x2, y) => { doc.setDrawColor(190); doc.setLineWidth(0.5); doc.line(x1, y + 3, x2, y + 3); doc.setDrawColor(0); };
    const txt = (s, x, y, style, size, opt) => { doc.setFont(F, style || 'normal'); doc.setFontSize(size || 11.5); doc.text(String(s || ''), x, y, opt || {}); };
    const fitTxt = (s, x, y, w, style) => { doc.setFont(F, style || 'normal'); doc.setFontSize(11.5); doc.text(doc.splitTextToSize(String(s || ''), w)[0] || '', x, y); };

    if (global.EduIigLogo) { const w = 64; doc.addImage('data:image/png;base64,' + global.EduIigLogo.base64, 'PNG', L + 6, 42, w, w * global.EduIigLogo.aspect); }
    txt('ĐƠN XIN NGHỈ PHÉP', 297.5, 78, 'bold', 15, { align: 'center' });

    // Khung thông tin
    doc.setLineWidth(0.8); doc.rect(L, 108, R - L, 66);
    txt('Tên nhân viên:', L + 4, 130); fitTxt((f.name || '').toUpperCase(), 190, 130, 150); line(188, 345, 130);
    txt('Ngày:', 352, 130); fitTxt(vn(parse(f.date)), 392, 130, 140); line(390, R, 130);
    txt('Bộ phận/ chức vụ:', L + 4, 160); fitTxt(f.dept, 190, 160, 150); line(188, 345, 160);

    // Loại nghỉ — mỗi loại 1 dòng Từ / Đến / Tổng
    let y = 200;
    txt('Từ ngày:', 190, y, 'italic'); txt('Đến', 320, y, 'italic'); txt('Tổng:', 455, y, 'italic');
    y += 24;
    TYPES.forEach((t, i) => {
      const idx = f.lines.findIndex((l) => l.type === i); const l = f.lines[idx];
      doc.setLineWidth(0.8); doc.rect(L + 22, y - 13, 46, 17);
      if (l) txt('x', L + 45, y, 'italic', 11.5, { align: 'center' });
      txt(t, L + 76, y, 'italic');
      if (l) {
        txt(`${l.fromS === 'pm' ? '13h30' : '8h00'} ngày ${vn(parse(l.from))}`, 190, y, 'italic', 11);
        txt(`${l.toS === 'am' ? '12h00' : '17h30'} ${vn(parse(l.to))}`, 320, y, 'italic', 11);
        txt(c.per[idx] != null ? fmt(c.per[idx]) : '', 470, y, 'normal', 11);
      }
      line(188, 300, y); line(318, 440, y); line(468, R, y);
      y += 27;
    });
    // Lý do + bàn giao
    y += 4;
    txt('Lý do cụ thể:', 183, y, 'italic', 11.5, { align: 'right' });
    doc.splitTextToSize(f.reason || '', R - 192).slice(0, 2).forEach((s, k) => { txt(s, 190, y + k * 16, 'italic'); line(188, R, y + k * 16); if (k) y += 16; });
    if (!f.reason) line(188, R, y);
    if (f.handover) {
      y += 20; txt('Bàn giao / dạy thay:', 183, y, 'italic', 11.5, { align: 'right' });
      doc.splitTextToSize(f.handover, R - 192).slice(0, 2).forEach((s, k) => { txt(s, 190, y + k * 16, 'italic'); line(188, R, y + k * 16); if (k) y += 16; });
    }
    // Khung trở lại / chữ ký
    y += 22; doc.setLineWidth(0.8); doc.rect(L, y, R - L, 70);
    const r1 = y + 22, r2 = y + 55;
    txt('Ngày trở lại làm việc:', L + 4, r1); txt(c.back ? `${c.back.pm ? 'Chiều' : 'Ngày'} ${vn(c.back.d)}` : '', 192, r1); line(188, 345, r1);
    txt('Tổng số ngày vắng:', 352, r1); txt(c.ok ? fmt(c.total) : '', 462, r1, 'italic'); line(460, R, r1);
    txt('Chữ ký nhân viên', L + 4, r2);
    // Có chữ ký tay: ảnh nằm bên phải tên, trên đường kẻ; không có: chỉ in tên (như mẫu).
    if (st.profile.sign) { try { doc.addImage(st.profile.sign, 'PNG', 282, r2 - 22, 62, 21); } catch (e) { /* ảnh lỗi: bỏ qua */ } }
    fitTxt(f.name, 192, r2, st.profile.sign ? 88 : 150); line(188, 345, r2);
    txt('Tổng số ngày phép còn:', 352, r2); txt(c.ok ? remaining(f, c) : '', 470, r2); line(468, R, r2);
    // Ký duyệt
    y += 86; doc.rect(L, y, (R - L) / 2, 100); doc.rect(L + (R - L) / 2, y, (R - L) / 2, 100);
    txt('Trưởng phòng', L + (R - L) / 4, y + 18, 'bold', 12.5, { align: 'center' });
    txt('Hành chính NS', L + 3 * (R - L) / 4, y + 18, 'bold', 12.5, { align: 'center' });
    y += 114; doc.rect(L, y, R - L, 100);
    txt('Duyệt bởi Giám đốc', 297.5, y + 18, 'bold', 12.5, { align: 'center' });
    return doc;
  }
  function libsOk() { if (global.jspdf && global.jspdf.jsPDF) return true; toast('Không tải được thư viện PDF. Kiểm tra mạng rồi thử lại.'); return false; }
  const lazy = (fn) => (global.EduLazyLoad ? global.EduLazyLoad.lazyCall(global.EduPdfVendorScripts || [], fn) : fn);
  const downloadPdf = lazy((f) => {
    if (!libsOk()) return;
    buildDoc(f).save(`Don_nghi_phep_${slug(f.name)}_${(f.lines[0] || {}).from || ''}.pdf`);
  });
  const previewPdf = lazy((f) => {
    if (!libsOk()) return;
    const fr = $('lvPreview'); if (fr.dataset.url) URL.revokeObjectURL(fr.dataset.url);
    const url = URL.createObjectURL(buildDoc(f).output('blob'));
    fr.dataset.url = url; fr.src = url; $('lvPreviewWrap').classList.remove('force-hide');
    fr.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  // ---------------- Chữ ký tay (canvas) ----------------
  function initSignPad() {
    const cv = $('lvSignPad'), ctx = cv.getContext('2d'); let drawing = false, dirty = false;
    const pos = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * cv.width / r.width, (e.clientY - r.top) * cv.height / r.height]; };
    const show = () => { ctx.clearRect(0, 0, cv.width, cv.height); if (st.profile.sign) { const im = new Image(); im.onload = () => ctx.drawImage(im, 0, 0, cv.width, cv.height); im.src = st.profile.sign; } };
    cv.addEventListener('pointerdown', (e) => { drawing = true; dirty = true; cv.setPointerCapture(e.pointerId); ctx.beginPath(); ctx.moveTo(...pos(e)); });
    cv.addEventListener('pointermove', (e) => { if (!drawing) return; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.strokeStyle = '#1a2a6c'; ctx.lineTo(...pos(e)); ctx.stroke(); });
    const end = () => { if (!drawing) return; drawing = false; if (dirty) { st.profile.sign = cv.toDataURL('image/png'); save(); } };
    cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
    $('lvSignClear').addEventListener('click', () => { delete st.profile.sign; save(); show(); });
    show();
  }

  // ---------------- Sao lưu ----------------
  function exportJson() {
    const blob = new Blob([JSON.stringify(st, null, 1)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `don-nghi-phep_${slug(st.profile.name || me.name)}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function importJson(file) {
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const d = JSON.parse(rd.result); if (!d || !Array.isArray(d.list)) throw new Error('x');
        const ids = new Set(st.list.map((f) => f.id)); let n = 0;
        d.list.forEach((f) => { if (f && f.id && Array.isArray(f.lines) && !ids.has(f.id)) { st.list.push(f); n++; } });
        st.profile = Object.assign({}, d.profile || {}, st.profile);
        save(); yearOptions(); drawHistory(); refresh(); toast(`Đã khôi phục ${n} đơn`);
      } catch (e) { toast('File sao lưu không hợp lệ'); }
    };
    rd.readAsText(file);
  }

  // ---------------- Khởi động ----------------
  function init(detail) {
    const uid = detail && detail.user && detail.user.uid;
    if (uid) KEY = 'nghiphep_v1:' + uid;
    me = { name: (detail && detail.profile && detail.profile.name) || '', code: (detail && detail.profile && detail.profile.teacherCode) || '' };
    load();
    if (!st.profile.quota && st.profile.quota !== '0') st.profile.quota = '12';
    $('lvQuota').value = st.profile.quota; $('lvSat').checked = !!st.profile.sat; $('lvHolidays').value = st.profile.holidays || '';
    buildRows(); yearOptions(); newForm(); drawHistory(); initSignPad();

    const panel = $('panel-leave');
    panel.addEventListener('input', (e) => { if (e.target.closest('#lvForm')) refresh(); });
    panel.addEventListener('change', (e) => {
      if (e.target.classList.contains('lv-from')) { const to = e.target.closest('.lv-trow').querySelector('.lv-to'); if (to.value < e.target.value) to.value = e.target.value; }
      if (e.target.closest('#lvForm')) { keepProfile(); refresh(); }
    });
    $('lvHistYear').addEventListener('change', () => { drawHistory(); drawStats(); });
    $('lvNew').addEventListener('click', newForm);
    $('lvSave').addEventListener('click', () => saveForm(false));
    $('lvPdf').addEventListener('click', () => { const f = editingId ? saveForm(true) : validate(); if (f) downloadPdf(f); });
    $('lvPreviewBtn').addEventListener('click', () => { const f = validate(); if (f) previewPdf(f); });
    $('lvExport').addEventListener('click', exportJson);
    $('lvImport').addEventListener('change', (e) => { if (e.target.files[0]) importJson(e.target.files[0]); e.target.value = ''; });
    $('lvHistory').addEventListener('change', (e) => {
      if (!e.target.classList.contains('lv-st')) return;
      const f = st.list.find((x) => x.id === e.target.closest('li').dataset.id); if (!f) return;
      f.status = e.target.value; save(); drawStats(); if (f.id === editingId) $('lvStatus').value = f.status; toast(`Trạng thái: ${STATUS[f.status]}`);
    });
    $('lvHistory').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      const f = st.list.find((x) => x.id === b.closest('li').dataset.id); if (!f) return;
      if (b.classList.contains('lv-open')) { fill(f); $('lvForm').scrollIntoView({ behavior: 'smooth' }); }
      else if (b.classList.contains('lv-copy')) { const g = JSON.parse(JSON.stringify(f)); delete g.id; g.status = 'draft'; g.date = iso(new Date()); fill(g); toast('Đã nhân bản — sửa ngày rồi lưu'); }
      else if (b.classList.contains('lv-pdf')) downloadPdf(f);
      else if (b.classList.contains('lv-del') && confirm('Xoá đơn này?')) {
        st.list = st.list.filter((x) => x.id !== f.id); if (editingId === f.id) editingId = null; save(); yearOptions(); drawHistory(); refresh();
      }
    });
    // Mở tab lại → tính lại "buổi dạy bị ảnh hưởng" theo tuần đang mở.
    document.querySelectorAll('[data-tab="leave"]').forEach((b) => b.addEventListener('click', refresh));
    if (location.hash === '#nghi-phep') { const b = document.querySelector('.tab-btn[data-tab="leave"]'); if (b) b.click(); }
  }
  let started = false;
  global.addEventListener('edu:ready', (e) => { if (started) return; started = true; init(e.detail); });
})(window);
