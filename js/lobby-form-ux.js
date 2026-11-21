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
      <h3>Gần đây</h3><ul class="lm-recent">${recent}</ul>`;
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
    renderBadges(m);
    lastDone = m && m.recent && m.recent[0] ? m.recent[0] : null;
    renderNext();
  }

  /** Huy hiệu: mục tiêu nhỏ, rõ ràng (bài đã làm, chuỗi ngày, điểm cao, ôn câu sai). Chưa chọn tên → hiện mờ để em biết có gì. */
  const BADGES = [
    { id: 'first', fa: 'fa-flag', c: 'var(--ic-blue)', name: 'Bài đầu tiên', goal: 1, val: (m) => m.done },
    { id: 'five', fa: 'fa-book-open', c: 'var(--ic-blue)', name: 'Chăm chỉ', goal: 5, unit: 'bài', val: (m) => m.done },
    { id: 'streak', fa: 'fa-fire', c: 'var(--ic-orange)', name: 'Học 3 ngày liền', goal: 3, unit: 'ngày', val: (m) => m.streak },
    { id: 'good', fa: 'fa-star', c: 'var(--ic-green)', name: 'Đạt từ 80%', goal: 1, val: (m) => (m.recent || []).filter((r) => r.score >= 80).length },
    { id: 'full', fa: 'fa-medal', c: 'var(--ic-orange)', name: 'Điểm tuyệt đối', goal: 1, val: (m) => (m.recent || []).filter((r) => r.score >= 100).length },
    { id: 'twenty', fa: 'fa-trophy', c: 'var(--ic-green)', name: 'Siêng năng', goal: 20, unit: 'bài', val: (m) => m.done },
  ];
  let badgeKey = '';
  function renderBadges(m) {
    const ul = $('lobbyBadges');
    if (!ul) return;
    const got = BADGES.map((b) => { const v = m ? Math.max(0, Number(b.val(m)) || 0) : 0; return { b, v, ok: v >= b.goal }; });
    const key = got.map((x) => x.v).join(',') + (m ? '1' : '0');
    if (key === badgeKey) return;
    // Vừa mở khoá huy hiệu mới (cùng học sinh) → nảy nhẹ để em để ý
    const before = new Set(badgeKey ? badgeKey.split(',').map((v, i) => (+v >= BADGES[i].goal ? BADGES[i].id : '')).filter(Boolean) : []);
    const fresh = badgeKey && m ? got.filter((x) => x.ok && !before.has(x.b.id)).map((x) => x.b.id) : [];
    badgeKey = key;
    $('lobbyBadgeN').textContent = m ? `${got.filter((x) => x.ok).length}/${BADGES.length}` : '';
    // 1 hàng icon gọn (tên ở chú thích khi rê chuột / trình đọc màn hình) + 1 dòng "Mục tiêu tiếp theo" có thanh tiến độ
    ul.innerHTML = got.map(({ b, v, ok }) => {
      const label = `${b.name}${b.goal > 1 ? ` — ${Math.min(v, b.goal)}/${b.goal} ${b.unit || ''}` : ''}${ok ? ' (đã đạt)' : ' (chưa đạt)'}`;
      return `<li class="${ok ? 'is-on' : ''}${fresh.includes(b.id) ? ' is-new' : ''}" style="--bc:${b.c}" title="${esc(label)}" aria-label="${esc(label)}">
        <i class="fa-solid ${b.fa}" aria-hidden="true"></i></li>`;
    }).join('');
    const goal = $('lobbyGoal');
    if (!goal) return;
    const next = got.find((x) => !x.ok);
    if (!m) { goal.innerHTML = '<span class="lg-t">Chọn tên để mở khoá</span>'; return; }
    if (!next) { goal.innerHTML = '<span class="lg-t is-done"><i class="fa-solid fa-circle-check" aria-hidden="true"></i> Em đã có đủ huy hiệu!</span>'; return; }
    const pct = Math.round(Math.min(next.v, next.b.goal) / next.b.goal * 100);
    goal.innerHTML = `<span class="lg-t">Tiếp theo: <b>${esc(next.b.name)}</b></span>
      <span class="lg-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${next.b.goal}" aria-valuenow="${Math.min(next.v, next.b.goal)}"><i style="width:${pct}%;background:${next.b.c}"></i></span>
      <span class="lg-n">${Math.min(next.v, next.b.goal)}/${next.b.goal}</span>`;
  }

  /** Màn rộng (có thanh trái): chuyển menu thầy cô xuống đáy thanh trái — mở trong thanh, không đè lên bước 3. Màn hẹp: về lại đầu trang. */
  function placeStaff() {
    const staff = $('lobbyStaff'), foot = $('lobbySideFoot'), domains = document.querySelector('.lobby-domains');
    if (!staff || !foot || !domains) return;
    const mq = window.matchMedia('(min-width: 1100px)');
    const put = () => {
      if (mq.matches && staff.parentNode !== foot) foot.appendChild(staff);
      else if (!mq.matches && staff.parentNode === foot) domains.after(staff);
    };
    put();
    mq.addEventListener ? mq.addEventListener('change', put) : mq.addListener(put);
  }

  /** "Làm tiếp": bài ngay sau bài em làm gần nhất (cùng chương trình/cấp đang chọn) — 1 chạm chọn luôn. Chỉ đọc máy này. */
  let lastDone = null;
  const bare = (t) => String(t || '').replace(/\s*\(\d+\s*câu\)\s*$/i, '').trim().toLowerCase();
  function renderNext() {
    const sel = $('minitestSelect'), grp = $('minitestGroup');
    if (!sel || !grp) return;
    let box = $('lobbyNext');
    if (!box) {
      box = document.createElement('div'); box.id = 'lobbyNext'; box.className = 'lobby-next'; grp.appendChild(box);
      box.addEventListener('click', (e) => {
        const b = e.target.closest('[data-next]'); if (!b) return;
        sel.value = b.dataset.next;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        box.hidden = true;
        $('btnStart')?.focus();
      });
    }
    const opts = [...sel.options].filter((o) => o.value);
    const i = lastDone ? opts.findIndex((o) => bare(o.text) === bare(lastDone.title)) : -1;
    const next = i >= 0 ? (lastDone.score >= 70 ? opts[i + 1] : opts[i]) : null; // chưa đạt 70% thì gợi ý làm lại
    box.hidden = !next || next.value === sel.value || !visible(sel);
    if (box.hidden) return;
    const again = next === opts[i];
    box.innerHTML = `<button type="button" data-next="${esc(next.value)}"><i class="fa-solid ${again ? 'fa-rotate' : 'fa-forward'}" aria-hidden="true"></i>
      <span><b>${again ? 'Làm lại' : 'Làm tiếp'}:</b> ${esc(shortTitle(next.text))}</span>
      <small>${again ? `Lần trước ${lastDone.score}% — làm lại cho chắc` : `Bài sau "${esc(shortTitle(lastDone.title))}" em vừa làm`}</small></button>`;
  }

  /** Chọn xong 1 ô thì chuyển sang ô kế tiếp (Trường → Lớp → Họ tên → Bắt đầu): bớt bấm, rõ phải làm gì tiếp. */
  function autoAdvance() {
    const chain = [['studentSchool', 'studentClass'], ['studentClass', 'studentName'], ['studentName', 'btnStart']];
    chain.forEach(([from, to]) => {
      $(from)?.addEventListener('change', () => {
        if (!$(from).value) return;
        setTimeout(() => { // chờ lobby-roster.js đổ danh sách vào ô sau
          const t = $(to);
          if (!t || t.disabled) return;
          const shown = t.closest('.form-group')?.querySelector('.ui-select-btn, [role="combobox"]');
          (shown && visible(shown) ? shown : t).focus({ preventScroll: false });
        }, 60);
      });
    });
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
    autoAdvance();
    placeStaff();
    renderBadges(null);
    ['categorySelect', 'levelSelect', 'minitestSelect'].forEach((id) => $(id)?.addEventListener('change', () => setTimeout(renderNext, 0)));
    const more = $('lobbyMoreBtn');
    more?.addEventListener('click', () => {
      const open = more.getAttribute('aria-expanded') !== 'true';
      more.setAttribute('aria-expanded', String(open));
      $('lobbyMorePanel').hidden = !open;
    });
    const staff = $('lobbyStaff');
    document.addEventListener('click', (e) => { if (staff?.open && !staff.contains(e.target) && !staff.closest('#lobbySideFoot')) staff.open = false; });
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
