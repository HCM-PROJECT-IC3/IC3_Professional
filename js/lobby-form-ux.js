/* ============================================================
   js/lobby-form-ux.js — form chọn bài ở sảnh (index.html) dễ dùng hơn:
     • dấu ✓ trên từng bước (1 Em là ai? · 2 Chọn bài · 3 Cách làm bài)
       khi học sinh đã chọn xong bước đó;
     • dòng nhắc dưới nút "Bắt đầu" cho biết CÒN THIẾU gì khi nút đang khoá
       (thay vì chỉ thấy nút mờ mà không biết vì sao);
     • nút "Thêm" mở/đóng các mục phụ của học sinh; menu "Dành cho thầy cô" tự đóng khi bấm ra ngoài;
     • thẻ "Kết quả của em" ở thanh trái: số liệu của học sinh đang chọn, đọc từ máy này.
   Chỉ ĐỌC trạng thái form — quy tắc bật nút vẫn nằm ở quiz-engine.js
   § refreshMeta() (count && name && cls && school && pledged). 0 mạng.
   ============================================================ */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const visible = (el) => !!el && !el.closest('[hidden]');

  /** Ô còn thiếu đầu tiên: { text, id } — id dùng để tô viền ô đó cho học sinh thấy phải chọn ở đâu. */
  function missing() {
    if (!$('studentSchool')?.value) return { text: 'Chọn Trường của em', id: 'studentSchool' };
    if (!$('studentClass')?.value) return { text: 'Chọn Lớp', id: 'studentClass' };
    if (!$('studentName')?.value) return { text: 'Chọn Họ và tên', id: 'studentName' };
    if (visible($('minitestSelect')) && !$('minitestSelect').value) return { text: 'Chọn bài luyện tập', id: 'minitestSelect' };
    if (visible($('antiCheatPledge')) && !$('antiCheatPledge').checked) return { text: 'Tick ô cam kết làm bài nghiêm túc', id: 'antiCheatPledge' };
    return null;
  }

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const selText = (id) => { const s = $(id); return s && s.selectedIndex >= 0 && s.value ? s.options[s.selectedIndex].text.trim() : ''; };

  /** "Bài em sắp làm" — tóm tắt lựa chọn ngay trên nút Bắt đầu (lấp chỗ trống cột phải ở màn rộng). */
  function renderSummary() {
    const box = $('lobbySummary');
    if (!box) return;
    const banner = document.querySelector('.custom-exam-banner');
    let title, count = '';
    if (banner) {
      title = banner.querySelector('b')?.textContent || 'Đề giáo viên soạn';
      count = (banner.querySelector('span')?.textContent.match(/(\d+) câu/) || [])[1] || '';
    } else {
      const opt = $('minitestSelect')?.selectedOptions?.[0];
      const grp = opt?.parentElement?.tagName === 'OPTGROUP' && /cuối khóa/.test(opt.parentElement.label) ? opt.parentElement.label + ' — ' : '';
      const raw = grp + selText('minitestSelect');
      const m = raw.match(/^(.*?)\s*\((\d+) câu\)\s*$/);
      title = m ? m[1] : raw;
      count = m ? m[2] : '';
    }
    const level = selText('levelSelect');
    const test = document.querySelector('#examModeToggle .is-active')?.dataset.examMode === 'test';
    // Kiểm tra: cột 3 đã có ô thời gian + cam kết → CSS ẩn thẻ tóm tắt cho khỏi dài lệch cột.
    document.querySelector('.lobby-card')?.classList.toggle('is-test-mode', test);
    const minutes = test ? ($('examModeTestBtn')?.querySelector('small')?.textContent || '') : '';
    const name = $('studentName')?.value || '';
    const cls = $('studentClass')?.value || '';
    box.innerHTML = `<div class="ls-head"><i class="fa-solid fa-clipboard-check" aria-hidden="true"></i> Bài em sắp làm</div>
      <b class="ls-title">${title ? esc(title) : 'Chưa chọn bài'}</b>
      <div class="ls-meta">
        ${level && !banner ? `<span><i class="fa-solid fa-layer-group" aria-hidden="true"></i> ${esc(level)}</span>` : ''}
        ${count ? `<span><i class="fa-solid fa-circle-question" aria-hidden="true"></i> ${esc(count)} câu</span>` : ''}
        <span class="${test ? 'is-test' : ''}"><i class="fa-solid ${test ? 'fa-stopwatch' : 'fa-dove'}" aria-hidden="true"></i> ${test ? 'Kiểm tra · ' + esc(minutes) : 'Ôn luyện · không tính giờ'}</span>
      </div>
      <div class="ls-who ${name ? '' : 'is-missing'}"><i class="fa-solid fa-user" aria-hidden="true"></i> ${name ? esc(name) + (cls ? ' · Lớp ' + esc(cls) : '') : 'Chưa chọn tên'}</div>`;
  }

  function update() {
    const btn = $('btnStart');
    if (!btn) return;
    renderSummary();
    const need = missing();
    // Đánh dấu xong lần lượt: bước 2, 3 có sẵn giá trị mặc định, tick từ đầu sẽ giống như học sinh đã làm xong
    const done1 = !!$('studentName')?.value;
    const done2 = done1 && (!visible($('minitestSelect')) || !!$('minitestSelect').value);
    const done3 = done2 && (!visible($('antiCheatPledge')) || $('antiCheatPledge').checked);
    $('lobbyStep1')?.classList.toggle('is-done', done1);
    $('lobbyStep2')?.classList.toggle('is-done', done2);
    $('lobbyStep3')?.classList.toggle('is-done', done3);
    renderMe();
    renderModeNote();
    document.querySelectorAll('.lobby-card .is-next-field').forEach((el) => el.classList.remove('is-next-field'));
    if (btn.disabled && need) $(need.id)?.classList.add('is-next-field');
    const hint = $('startHint');
    if (!hint) return;
    // Nút khoá vì lý do khác (vd bài 0 câu, đang tải) → không đoán bừa.
    const ready = !btn.disabled;
    hint.textContent = btn.disabled && need ? need.text : ready ? 'Cố lên nhé!' : '';
    hint.classList.toggle('is-ready', ready);
  }

  /** Bài học chỉ làm ở chế độ Ôn luyện (quiz-engine.js khoá nút Kiểm tra): ghi rõ lý do, máy cảm ứng không có tooltip. */
  function renderModeNote() {
    const b = $('examModeTestBtn'), wrap = $('examModeToggle');
    if (!b || !wrap) return;
    let note = $('lobbyModeNote');
    if (!note) { note = document.createElement('p'); note.id = 'lobbyModeNote'; note.className = 'lobby-mode-note'; wrap.after(note); }
    note.hidden = !(b.disabled && b.title);
    note.textContent = note.hidden ? '' : `${b.title}. Chọn nhóm Ôn tập, Kiểm tra hoặc Chủ đề để làm bài tính giờ.`;
  }

  // "Kết quả của em": chỉ tính lại khi đổi học sinh hoặc vừa nộp bài. Trước đây mỗi cú bấm/gõ trong form lại đọc + parse
  // toàn bộ lịch sử bài làm (kèm chi tiết từng câu) trong localStorage → máy yếu giật khi có nhiều bài.
  let meKey = null, meHtml = '';
  const fmtAgo = (t) => {
    const d = Math.floor((Date.now() - t) / 86400000);
    if (!t || d < 0) return '';
    if (d === 0) return 'hôm nay';
    if (d === 1) return 'hôm qua';
    if (d < 7) return d + ' ngày trước';
    return new Date(t).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
  };
  const shortTitle = (t) => String(t).replace(/\s*\(\d+ câu\)\s*$/, '').replace(/^Bài\s+(\d+)\.\s*/, 'Bài $1 · ');
  function meMarkup(m) {
    if (!m) return '<p>Chọn họ tên ở bước 1 để xem kết quả của em.</p>';
    if (!m.done) return '<p>Em chưa làm bài nào trên máy này. Làm xong bài đầu tiên, kết quả sẽ hiện ở đây.</p>';
    const recent = m.recent.map((r) => `<li title="${esc(r.title)}"><span class="lm-t">${esc(shortTitle(r.title))}</span>
        <span class="lm-s ${r.score >= 70 ? 'is-ok' : 'is-low'}">${r.score}%</span><small>${r.test ? 'Kiểm tra' : 'Ôn luyện'} · ${esc(fmtAgo(r.t))}</small></li>`).join('');
    return `<dl><div><dt>Bài đã làm</dt><dd>${m.done}</dd></div><div><dt>Chuỗi ngày học</dt><dd>${m.streak}</dd></div><div><dt>Câu đến hạn ôn</dt><dd>${m.due}</dd></div></dl>
      ${m.due ? `<button type="button" class="lm-due" data-me="hub"><i class="fa-solid fa-rotate" aria-hidden="true"></i> Ôn ${m.due} câu đến hạn</button>` : ''}
      <h3>Gần đây</h3><ul class="lm-recent">${recent}</ul>
      <button type="button" class="lm-all" data-me="records">Xem tất cả bài làm <i class="fa-solid fa-chevron-right" aria-hidden="true"></i></button>`;
  }
  function renderMe(force) {
    const box = $('lobbyMe');
    if (!box) return;
    const key = [$('studentSchool')?.value, $('studentClass')?.value, $('studentName')?.value].join('|');
    if (!force && key === meKey) return;
    meKey = key;
    let m = null;
    try { m = window.EduLearningHub?.studentSummary?.() || null; } catch (e) { console.warn('[lobby] Kết quả của em:', e); }
    const html = meMarkup(m);
    if (html !== meHtml) { box.innerHTML = html; meHtml = html; }
    renderHello(m);
  }

  /** Lời chào ở thanh tiêu đề: học sinh thấy ngay máy đang ghi bài cho AI (máy dùng chung: tránh làm bài dưới tên bạn khác). */
  function renderHello(m) {
    const h = $('lobbyHello'), sub = $('lobbyHelloSub');
    if (!h) return;
    const name = $('studentName')?.value || '';
    if (!name) { h.textContent = 'Chào em!'; if (sub) sub.textContent = 'Chọn trường, lớp và họ tên ở bước 1 để bắt đầu.'; return; }
    const given = name.trim().split(/\s+/).pop();
    h.textContent = 'Chào ' + given + '!';
    if (sub) {
      const cls = $('studentClass')?.value, sch = $('studentSchool')?.value;
      sub.textContent = [cls ? 'Lớp ' + cls : '', sch].filter(Boolean).join(' · ') + ' — không phải em? Đổi họ tên ở bước 1.';
    }
  }

  function init() {
    window.addEventListener('edu:record-saved', () => renderMe(true));
    window.addEventListener('edu:hub-closed', () => renderMe(true));
    // Tab khác vừa nộp bài / ôn câu (cùng máy) → số liệu mới
    window.addEventListener('storage', (e) => { if (!e.key || /^eduquiz_(records|wrongbook)|learning/i.test(e.key)) renderMe(true); });
    // Học sinh quay lại sảnh sau khi làm bài ở tab này
    document.addEventListener('visibilitychange', () => { if (!document.hidden) renderMe(true); });
    $('lobbyMe')?.addEventListener('click', (e) => {
      const b = e.target.closest('[data-me]');
      if (!b) return;
      if (b.dataset.me === 'hub') window.EduLearningHub?.open?.();
      else if (typeof window.showRecords === 'function') window.showRecords();
    });
    const more = $('lobbyMoreBtn');
    more?.addEventListener('click', () => {
      const open = more.getAttribute('aria-expanded') !== 'true';
      more.setAttribute('aria-expanded', String(open));
      $('lobbyMorePanel').hidden = !open;
    });
    const staff = $('lobbyStaff');
    document.addEventListener('click', (e) => { if (staff?.open && !staff.contains(e.target)) staff.open = false; });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && staff?.open) { staff.open = false; staff.querySelector('summary').focus(); } });
    const card = document.querySelector('.lobby-card');
    const btn = $('btnStart');
    if (!card || !btn) return;
    // quiz-engine.js bật/tắt nút sau mỗi lần đổi lựa chọn → theo dõi thuộc tính disabled
    // + các thay đổi trong form (chọn, tick, bấm nút chế độ).
    new MutationObserver(update).observe(btn, { attributes: true, attributeFilter: ['disabled'] });
    ['change', 'click', 'input'].forEach((ev) => card.addEventListener(ev, () => setTimeout(update, 0)));
    update();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
