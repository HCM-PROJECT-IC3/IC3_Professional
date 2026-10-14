/* ============================================================
   js/lobby-form-ux.js — form chọn bài ở sảnh (index.html) dễ dùng hơn:
     • dấu ✓ trên từng bước (1 Em là ai? · 2 Chọn bài · 3 Cách làm bài)
       khi học sinh đã chọn xong bước đó;
     • dòng nhắc dưới nút "Bắt đầu" cho biết CÒN THIẾU gì khi nút đang khoá
       (thay vì chỉ thấy nút mờ mà không biết vì sao).
   Chỉ ĐỌC trạng thái form — quy tắc bật nút vẫn nằm ở quiz-engine.js
   § refreshMeta() (count && name && cls && school && pledged). 0 mạng.
   ============================================================ */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const visible = (el) => !!el && !el.closest('[hidden]');

  function missing() {
    if (!$('studentSchool')?.value) return 'Chọn Trường của em';
    if (!$('studentClass')?.value) return 'Chọn Lớp';
    if (!$('studentName')?.value) return 'Chọn Họ và tên';
    if (visible($('minitestSelect')) && !$('minitestSelect').value) return 'Chọn bài luyện tập';
    if (visible($('antiCheatPledge')) && !$('antiCheatPledge').checked) return 'Tick ô cam kết làm bài nghiêm túc';
    return '';
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
      const raw = selText('minitestSelect');
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
        <span class="${test ? 'is-test' : ''}"><i class="fa-solid ${test ? 'fa-stopwatch' : 'fa-dove'}" aria-hidden="true"></i> ${test ? 'Kiểm tra · ' + esc(minutes) : 'Ôn luyện · không giới hạn giờ'}</span>
      </div>
      <div class="ls-who ${name ? '' : 'is-missing'}"><i class="fa-solid fa-user" aria-hidden="true"></i> ${name ? esc(name) + (cls ? ' · Lớp ' + esc(cls) : '') : 'Chưa chọn tên'}</div>`;
  }

  function update() {
    const btn = $('btnStart');
    if (!btn) return;
    renderSummary();
    const need = missing();
    $('lobbyStep1')?.classList.toggle('is-done', !!$('studentName')?.value);
    $('lobbyStep2')?.classList.toggle('is-done', !visible($('minitestSelect')) || !!$('minitestSelect').value);
    $('lobbyStep3')?.classList.toggle('is-done', !visible($('antiCheatPledge')) || $('antiCheatPledge').checked);
    const hint = $('startHint');
    if (!hint) return;
    // Nút khoá vì lý do khác (vd bài 0 câu, đang tải) → không đoán bừa.
    hint.textContent = btn.disabled ? (need ? '👉 ' + need + ' để bắt đầu' : '') : '✅ Sẵn sàng — bấm Bắt đầu!';
    hint.classList.toggle('is-ready', !btn.disabled);
  }

  function init() {
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
