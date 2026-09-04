/* ============================================================
   js/lobby-roster.js
   Đổ 3 select "Trường / Lớp / Họ và tên" ở form "Bắt đầu làm bài"
   (index.html) bằng danh sách roster THẬT — cùng 1 nguồn dữ liệu (gốc)
   với trang quản trị "🎓 Quản lý danh sách học sinh"
   (roster-manager.html, collection Firestore "students_roster").

   Điều phối đào tạo nạp/chỉnh danh sách ở roster-manager.html (nút
   "📥 Nạp từ Excel" hoặc "➕ Thêm học sinh") — KHÔNG có nút nạp Excel
   nào ở trang công khai index.html nữa, để tránh lộ thao tác quản trị
   ra màn hình học sinh làm bài.

   NGUỒN DỮ LIỆU: file tĩnh data/roster/students-active.json —
   KHÔNG gọi Firestore trực tiếp nữa. Lý do (xem thêm PR mô tả): mỗi
   lần index.html được tải/tải lại trước đây tốn 1 lượt đọc Firestore
   × số học sinh "Đang học" trong roster, dễ chạm trần 50.000 lượt
   đọc/ngày của gói Spark chỉ sau ~100 lượt mở trang với roster 500 em.
   Đổi sang file JSON tĩnh loại bỏ hẳn giới hạn đọc đó (phục vụ qua CDN
   của GitHub Pages, scale vô hạn, không tốn quota).

   File data/roster/students-active.json được XUẤT THỦ CÔNG từ
   roster-manager.html (nút "🗂️ Xuất JSON") mỗi khi danh sách thay đổi
   — Điều phối đào tạo cần tải file, rồi commit + push lên GitHub thì
   học sinh mới thấy danh sách mới (xem hướng dẫn ngay trên nút đó).

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

  function fillSelect(sel, values, placeholder) {
    const current = sel.value;
    sel.innerHTML = `<option value="">${placeholder}</option>` +
      values.map((v) => `<option value="${String(v).replace(/"/g, '&quot;')}">${v}</option>`).join('');
    if (values.includes(current)) sel.value = current;
  }

  function setStatus(msg, isError) {
    const el = document.getElementById('rosterStatus');
    if (!el) return;
    el.textContent = msg;
    el.classList.toggle('is-error', !!isError);
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
      schoolSel.innerHTML = `<option value="">⚠ Chưa có danh sách — liên hệ Điều phối đào tạo</option>`;
      classSel.disabled = true;
      classSel.innerHTML = '<option value="">—</option>';
      nameSel.disabled = true;
      nameSel.innerHTML = '<option value="">—</option>';
      setStatus(errorMsg || '', !!errorMsg);
      return;
    }

    schoolSel.disabled = false;
    fillSelect(schoolSel, schools, '-- Chọn trường --');
    classSel.disabled = true;
    classSel.innerHTML = '<option value="">-- Chọn trường trước --</option>';
    nameSel.disabled = true;
    nameSel.innerHTML = '<option value="">-- Chọn lớp trước --</option>';

    setStatus(`✅ Đã nạp ${allStudents.length} học sinh`);
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

  async function init() {
    if (!document.getElementById('studentSchool')) return; // trang khác không có form này
    initCascadeListeners();
    setStatus('⏳ Đang nạp danh sách...');
    try {
      allStudents = await fetchRosterFromStaticFile();
      applyStudentsToForm(null);
    } catch (err) {
      console.error('[EduQuiz] Lỗi nạp roster từ file tĩnh:', err);
      allStudents = [];
      applyStudentsToForm('⚠ Không nạp được danh sách, thử tải lại trang.');
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();