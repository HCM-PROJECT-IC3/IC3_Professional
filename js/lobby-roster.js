/* ============================================================
   js/lobby-roster.js
   Đổ 3 select "Trường / Lớp / Họ và tên" ở form "Bắt đầu làm bài"
   (index.html) bằng danh sách roster THẬT — cùng 1 nguồn dữ liệu với
   trang quản trị "🧑‍🎓 Quản lý danh sách học sinh" (roster-manager.html,
   collection Firestore "students_roster").

   Điều phối đào tạo nạp/chỉnh danh sách ở roster-manager.html (nút
   "📥 Nạp từ Excel" hoặc "➕ Thêm học sinh") — KHÔNG có nút nạp Excel
   nào ở trang công khai index.html nữa, để tránh lộ thao tác quản trị
   ra màn hình học sinh làm bài. Trang này chỉ ĐỌC (read-only) danh
   sách học sinh đang "Đang học" để đổ vào 3 select, học sinh chỉ chọn
   trong danh sách có sẵn (không gõ tay) để tránh sai chính tả/không
   khớp dữ liệu khi đối chiếu báo cáo.

   YÊU CẦU FIRESTORE RULES: collection "students_roster" cần cho phép
   đọc công khai (allow read: if true — chỉ đọc, không ghi) vì trang
   này KHÔNG yêu cầu đăng nhập. Xem
   docs/architecture/firestore.rules.PROPOSED-ADDITIONS.txt.

   Luồng chọn: Trường → Lớp (lọc theo Trường) → Họ và tên (lọc theo
   Trường + Lớp).
   ============================================================ */
(function () {
  'use strict';

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

  // ── Nạp roster từ Firestore (students_roster, status == active) ──
  async function fetchRosterFromFirestore() {
    if (!window.EduFirebase || !window.EduFirebase.db) {
      throw new Error('Firestore chưa sẵn sàng.');
    }
    const snap = await window.EduFirebase.db.collection('students_roster')
      .where('status', '==', 'active').get();
    return snap.docs
      .map((doc) => doc.data())
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
      allStudents = await fetchRosterFromFirestore();
      applyStudentsToForm(null);
    } catch (err) {
      console.error('[EduQuiz] Lỗi nạp roster từ Firestore:', err);
      allStudents = [];
      applyStudentsToForm('⚠ Không nạp được danh sách, thử tải lại trang.');
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();