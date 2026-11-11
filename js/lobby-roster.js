/* ============================================================
   js/lobby-roster.js
   Đổ 3 select "Trường / Lớp / Họ và tên" ở form "Bắt đầu làm bài"
   (index.html) bằng danh sách roster THẬT — cùng 1 nguồn dữ liệu (gốc)
   với trang quản trị "Quản lý danh sách học sinh"
   (roster-manager.html, collection Firestore "students_roster").

   Điều phối đào tạo nạp/chỉnh danh sách ở roster-manager.html (nút
   "Nạp từ Excel" hoặc "Thêm học sinh") — KHÔNG có nút nạp Excel
   nào ở trang công khai index.html nữa, để tránh lộ thao tác quản trị
   ra màn hình học sinh làm bài.

   NGUỒN DỮ LIỆU: file tĩnh data/roster/students-active.json —
   KHÔNG gọi Firestore trực tiếp nữa. Lý do (xem thêm PR mô tả): mỗi
   lần index.html được tải/tải lại trước đây tốn 1 lượt đọc Firestore
   × số học sinh "Đang học" trong roster, dễ chạm trần 50.000 lượt
   đọc/ngày của gói Spark chỉ sau ~100 lượt mở trang với roster 500 em.
   Đổi sang file JSON tĩnh loại bỏ hẳn giới hạn đọc đó (phục vụ qua CDN
   của GitHub Pages, scale vô hạn, không tốn quota).

   File data/roster/students-active.json được cập nhật từ
   roster-manager.html — nút "Cập nhật cho học sinh" tự đẩy file này
   lên GitHub qua API (xem js/github-publish.js), KHÔNG cần Điều phối
   đào tạo tải file/commit/push tay nữa. Nút "Xuất JSON (thủ công)"
   vẫn còn để dự phòng khi không dùng được token GitHub.

   Luồng chọn: Trường → Lớp (lọc theo Trường) → Họ và tên (lọc theo
   Trường + Lớp).
   ============================================================ */
(function () {
  'use strict';

  const ROSTER_JSON_URL = 'data/roster/students-active.json';

  let allStudents = []; // [{ school, className, name }]

  // ── Tiện ích ──────────────────────────────────────────────
  function byVietnamese(a, b) {
    return String(a).localeCompare(String(b), 'vi');
  }

  // Escape đầy đủ (không chỉ dấu ") trước khi nội suy vào innerHTML — values
  // đến từ data/roster/students-active.json, do Điều phối đào tạo NHẬP/NẠP
  // TỪ EXCEL ở roster-manager.html (tên trường/lớp/học sinh), nên vẫn là dữ
  // liệu "người dùng nhập" theo nghĩa rộng: 1 ô Excel chứa "<img
  // src=x onerror=...>" (gõ nhầm/dán nhầm, hoặc file Excel từ nguồn không
  // tin cậy) trước đây sẽ chạy thẳng trong trình duyệt của MỌI học sinh mở
  // trang chọn bài — chỉ escape dấu " là không đủ.
  function escHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function fillSelect(sel, values, placeholder) {
    const current = sel.value;
    sel.innerHTML = `<option value="">${escHtml(placeholder)}</option>` +
      values.map((v) => `<option value="${escHtml(v)}">${escHtml(v)}</option>`).join('');
    if (values.includes(current)) sel.value = current;
  }

  // 11/2026: chỉ hiện khi CẦN (lỗi / đang dùng bản lưu trên máy) — "Đã nạp N học sinh" không hiện nữa.
  // retry=true → kèm nút "Thử lại" chỉ tải lại danh sách (trước: "thử tải lại trang" = tải lại cả trang + ngân hàng câu hỏi).
  // msg luôn là chuỗi TĨNH/tự dựng trong file này; vẫn escape cho chắc.
  function setStatus(msg, isError, retry) {
    const el = document.getElementById('rosterStatus');
    if (!el) return;
    el.hidden = !msg;
    el.classList.toggle('is-error', !!isError);
    if (!msg) { el.textContent = ''; return; }
    const iconClass = isError ? 'fa-triangle-exclamation' : 'fa-circle-info';
    el.innerHTML = `<i class="fa-solid ${iconClass}" aria-hidden="true"></i> <span>${escHtml(msg)}</span>` +
      (retry ? ' <button type="button" class="roster-retry">Thử lại</button>' : '');
    const b = el.querySelector('.roster-retry');
    if (b) b.addEventListener('click', loadStatic, { once: true });
  }


  // ── Nạp roster từ file tĩnh data/roster/students-active.json ──
  // 'cache: no-cache' để trình duyệt LUÔN kiểm tra lại với server
  // (revalidate qua ETag/Last-Modified) thay vì dùng bản cache cũ vô
  // thời hạn, nhưng vẫn không tải lại toàn bộ file nếu chưa đổi
  // (khác với 'no-store' — không ép tải lại hoàn toàn không cần thiết).
  async function fetchRosterFromStaticFile() {
    const res = await fetch(ROSTER_JSON_URL, { cache: 'no-cache' });
    if (!res.ok) {
      throw new Error(`Không tải được ${ROSTER_JSON_URL} (HTTP ${res.status})`);
    }
    const payload = await res.json();
    const students = Array.isArray(payload) ? payload : payload.students;
    if (!Array.isArray(students)) {
      throw new Error(`${ROSTER_JSON_URL} sai định dạng (thiếu mảng "students").`);
    }
    return students
      .filter((s) => s && s.name)
      .map((s) => ({ school: s.school || '', className: s.className || '', name: s.name }));
  }

  // ── Cascading select: Trường → Lớp → Họ và tên ────────────
  function refreshClassOptions(schoolSel, classSel, nameSel) {
    const school = schoolSel.value;
    const classes = [...new Set(
      allStudents.filter((s) => s.school === school).map((s) => s.className).filter(Boolean)
    )].sort(byVietnamese);

    classSel.disabled = !school;
    fillSelect(classSel, classes, school ? '-- Chọn lớp --' : '-- Chọn trường trước --');
    refreshNameOptions(schoolSel, classSel, nameSel);
  }

  function refreshNameOptions(schoolSel, classSel, nameSel) {
    const school = schoolSel.value;
    const className = classSel.value;
    const names = school && className
      ? allStudents
          .filter((s) => s.school === school && s.className === className)
          .map((s) => s.name)
          .filter(Boolean)
          .sort(byVietnamese)
      : [];

    nameSel.disabled = !(school && className);
    fillSelect(nameSel, names, school && className ? '-- Chọn họ và tên --' : '-- Chọn lớp trước --');
  }

  function applyStudentsToForm(errorMsg) {
    const schoolSel = document.getElementById('studentSchool');
    const classSel  = document.getElementById('studentClass');
    const nameSel   = document.getElementById('studentName');
    if (!schoolSel || !classSel || !nameSel) return;

    const schools = [...new Set(allStudents.map((s) => s.school).filter(Boolean))].sort(byVietnamese);

    if (errorMsg || !allStudents.length || !schools.length) {
      schoolSel.disabled = true;
      // <option> chỉ render TEXT THUẦN — bỏ hẳn emoji thay vì để lọt icon "vỡ".
      schoolSel.innerHTML = errorMsg ? '<option value="">Chưa tải được danh sách</option>'
        : '<option value="">Chưa có danh sách — liên hệ Điều phối đào tạo</option>';
      classSel.disabled = true;
      classSel.innerHTML = '<option value="">—</option>';
      nameSel.disabled = true;
      nameSel.innerHTML = '<option value="">—</option>';
      return;
    }

    schoolSel.disabled = false;
    fillSelect(schoolSel, schools, '-- Chọn trường --');
    classSel.disabled = true;
    classSel.innerHTML = '<option value="">-- Chọn trường trước --</option>';
    nameSel.disabled = true;
    nameSel.innerHTML = '<option value="">-- Chọn lớp trước --</option>';

  }

  function initCascadeListeners() {
    const schoolSel = document.getElementById('studentSchool');
    const classSel  = document.getElementById('studentClass');
    const nameSel   = document.getElementById('studentName');
    if (!schoolSel || !classSel || !nameSel) return;

    schoolSel.addEventListener('change', () => {
      refreshClassOptions(schoolSel, classSel, nameSel);
    });
    classSel.addEventListener('change', () => {
      refreshNameOptions(schoolSel, classSel, nameSel);
    });
  }

  // ── Chế độ mã lớp (EduBackend.roster.mode = 'class-code', apps/src/75-roster-codes.gs) ──
  // Không tải danh sách cả hệ thống: học sinh nhập mã lớp → Apps Script trả tên ĐÚNG 1 lớp.
  // Lớp vừa mở được nhớ trên máy (mở lại trang / mất mạng vẫn chọn được tên).
  const CLASS_CODE_STORE = 'eduquiz_class_code_v1';

  function rosterMode() {
    return (window.EduBackend && window.EduBackend.roster && window.EduBackend.roster.mode) || 'public-json';
  }

  function setCodeStatus(msg, isError) {
    const el = document.getElementById('classCodeStatus');
    if (!el) return;
    el.textContent = msg || '';
    el.classList.toggle('is-error', !!isError);
  }

  function applyClass(data) {
    allStudents = (data.names || []).map((name) => ({ school: data.school, className: data.className, name }));
    applyStudentsToForm(allStudents.length ? null : 'Lớp này chưa có học sinh nào — báo thầy cô.');
    const schoolSel = document.getElementById('studentSchool');
    const classSel  = document.getElementById('studentClass');
    const nameSel   = document.getElementById('studentName');
    if (!allStudents.length) return;
    schoolSel.value = data.school;
    refreshClassOptions(schoolSel, classSel, nameSel);
    classSel.value = data.className;
    refreshNameOptions(schoolSel, classSel, nameSel);
  }

  async function openClassCode(code) {
    setCodeStatus('Đang mở lớp...');
    try {
      const data = await window.EduAppsScript.call('rosterByCode', { code }, { auth: false, timeoutMs: 20 * 1000 });
      applyClass(data);
      setCodeStatus(`${data.className} · ${data.school} — ${data.names.length} học sinh`);
      try { localStorage.setItem(CLASS_CODE_STORE, JSON.stringify({ code, data })); } catch (e) { /* chế độ riêng tư */ }
    } catch (err) {
      const msg = err.code === 'not-found' ? 'Không tìm thấy lớp với mã này — kiểm tra lại với thầy cô.'
        : err.code === 'invalid-argument' ? err.message
        : 'Không kết nối được máy chủ — kiểm tra mạng rồi nhập lại mã.';
      setCodeStatus(msg, true);
    }
  }

  function initClassCodeMode() {
    const group = document.getElementById('classCodeGroup');
    const input = document.getElementById('classCode');
    if (!group || !input) return;
    group.hidden = false;
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(CLASS_CODE_STORE)); } catch (e) { saved = null; }
    if (saved && saved.code && saved.data) {
      input.value = saved.code;
      applyClass(saved.data);
      setCodeStatus(`${saved.data.className} · ${saved.data.school} — nhập mã khác để đổi lớp`);
    } else {
      applyStudentsToForm('Nhập mã lớp thầy cô phát để chọn tên.');
    }
    let last = saved && saved.code;
    const tryOpen = () => {
      const code = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (code.length !== 6 || code === last) return;
      last = code;
      openClassCode(code);
    };
    input.addEventListener('input', () => {
      input.value = input.value.toUpperCase();
      tryOpen();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      last = null; // Enter = thử lại cả khi mã không đổi (vd vừa có mạng)
      tryOpen();
    });
  }

  // Bản danh sách tải được gần nhất (gọn: [trường, lớp, tên]) — mất mạng / máy chủ lỗi vẫn chọn được tên để làm bài.
  const ROSTER_CACHE = 'eduquiz_roster_cache_v1';
  function saveCache(list) {
    try { localStorage.setItem(ROSTER_CACHE, JSON.stringify({ at: Date.now(), s: list.map((x) => [x.school, x.className, x.name]) })); }
    catch (e) { /* đầy bộ nhớ / chế độ riêng tư: bỏ qua */ }
  }
  function readCache() {
    try {
      const c = JSON.parse(localStorage.getItem(ROSTER_CACHE) || 'null');
      if (!c || !Array.isArray(c.s) || !c.s.length) return null;
      return { at: c.at, list: c.s.map(([school, className, name]) => ({ school: school || '', className: className || '', name })).filter((x) => x.name) };
    } catch (e) { return null; }
  }

  let loading = false;
  async function loadStatic() {
    if (loading) return; // bấm Thử lại liên tục: 1 lượt tải
    loading = true;
    const keep = ['studentSchool', 'studentClass', 'studentName'].map((id) => document.getElementById(id)?.value || '');
    if (document.getElementById('rosterStatus')?.hidden === false) setStatus('Đang nạp danh sách...'); // chỉ khi bấm Thử lại (lần đầu không nháy dòng chữ)
    try {
      const list = await fetchRosterFromStaticFile();
      allStudents = list;
      applyStudentsToForm(null);
      setStatus('');
      saveCache(list);
    } catch (err) {
      console.error('[EduQuiz] Lỗi nạp roster từ file tĩnh:', err);
      const c = readCache();
      if (c && c.list.length) {
        allStudents = c.list;
        applyStudentsToForm(null);
        setStatus(`Mạng chậm — đang dùng danh sách lưu trên máy (${new Date(c.at).toLocaleDateString('vi-VN')}).`, false, true);
      } else {
        allStudents = [];
        const msg = 'Không tải được danh sách học sinh — kiểm tra mạng rồi bấm Thử lại.';
        applyStudentsToForm(msg);
        setStatus(msg, true, true);
      }
    } finally {
      loading = false;
    }
    restoreSelection(keep);
  }
  /** Sau khi tải lại (Thử lại): giữ trường/lớp/tên em đã chọn nếu vẫn còn trong danh sách. */
  function restoreSelection([school, cls, name]) {
    const s = document.getElementById('studentSchool'), c = document.getElementById('studentClass'), n = document.getElementById('studentName');
    if (!school || !s || s.disabled || ![...s.options].some((o) => o.value === school)) return;
    s.value = school; s.dispatchEvent(new Event('change', { bubbles: true }));
    if (!cls || ![...c.options].some((o) => o.value === cls)) return;
    c.value = cls; c.dispatchEvent(new Event('change', { bubbles: true }));
    if (!name || ![...n.options].some((o) => o.value === name)) return;
    n.value = name; n.dispatchEvent(new Event('change', { bubbles: true }));
  }

  async function init() {
    if (!document.getElementById('studentSchool')) return; // trang khác không có form này
    initCascadeListeners();
    if (rosterMode() === 'class-code') { initClassCodeMode(); return; }
    await loadStatic();
  }


  document.addEventListener('DOMContentLoaded', init);
})();