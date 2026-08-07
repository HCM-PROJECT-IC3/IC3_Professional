/* ============================================================
   js/teacher/data-loader.js
   Tầng tải + lọc dữ liệu cho Teacher Dashboard (Commit #8/LMAP).

   KHÁC với js/coordinator/data-loader.js ở đúng 1 điểm quan trọng:
   MỌI query ở đây đều lọc theo "schools" đã được Admin gán cho giáo
   viên (users/{uid}.schools, xem admin-users.html) — không tải "hết
   rồi lọc ở JS" như coordinator, vì:
   1) firestore.rules (Commit #6/LMAP) chỉ cho giáo viên đọc document
      có studentSchool/school nằm trong "schools" của họ — query không
      lọc where sẽ bị Firestore từ chối toàn bộ, không tự lọc giúp.
   2) Kể cả khi kỹ thuật cho phép, tải dữ liệu trường khác về trình
      duyệt rồi mới ẩn ở UI vẫn coi như đã lộ dữ liệu.

   Không đọc collection "classes" (giáo viên không có quyền đọc, xem
   firestore.rules) — nhóm theo "className" lấy trực tiếp từ từng
   document students_roster (đã denormalize sẵn), không cần join.

   Nạp SAU: roster-repository.js, student-result-repository.js,
            exam-history.model.js, analytics-service.js.
   ============================================================ */
(function (global) {
  'use strict';

  // Cache 3 phút: mở lại/F5 trang trong 3 phút không tốn thêm lượt đọc
  // Firestore — quan trọng khi giáo viên theo dõi liên tục lúc học sinh
  // đang làm bài (xem js/services/data-cache-service.js để hiểu lý do).
  const CACHE_TTL_MS = 3 * 60 * 1000;

  /**
   * Tải dữ liệu cho 1 giáo viên, giới hạn đúng các trường trong profile.schools.
   * @param {Object} profile Hồ sơ Firestore users/{uid} của giáo viên đang đăng nhập.
   * @param {Object} [opts]
   * @param {boolean} [opts.forceRefresh] Bỏ qua cache, luôn đọc lại từ Firestore
   *   (dùng khi giáo viên bấm nút "🔄 Làm mới dữ liệu").
   */
  async function loadAll(profile, { forceRefresh = false } = {}) {
    const schools = Array.isArray(profile.schools) ? profile.schools.filter(Boolean) : [];
    if (!schools.length) {
      // Chưa được Admin gán trường nào — không query gì cả (tránh query rỗng
      // vô nghĩa), trả về rỗng kèm cờ báo để UI hiện đúng thông báo.
      return { schools, students: [], results: [], noSchoolsAssigned: true };
    }

    const cacheKey = 'teacher:' + (profile.uid || profile.id || 'unknown') + ':' + schools.slice().sort().join('|');
    if (!forceRefresh && global.EduDataCache) {
      const cached = global.EduDataCache.get(cacheKey);
      if (cached) return cached;
    }

    const [students, results] = await Promise.all([
      global.EduRepositories.studentRoster.listBySchools(schools),
      global.EduRepositories.studentResult.listRecent({ schools, limit: 1000 }),
    ]);
    const data = { schools, students, results, noSchoolsAssigned: false };
    if (global.EduDataCache) global.EduDataCache.set(cacheKey, data, CACHE_TTL_MS);
    return data;
  }

  /** Xoá các <option> đã thêm động trước đó (giữ lại option đầu tiên — "Tất cả"). */
  function resetDynamicOptions(sel) {
    while (sel.options.length > 1) sel.remove(1);
  }

  /**
   * Đổ option vào 2 dropdown lọc: Lớp (theo className thật, không phải classId) + Bài thi.
   * An toàn khi gọi lại nhiều lần (vd. sau khi bấm "🔄 Làm mới dữ liệu") — luôn xoá
   * option cũ trước khi đổ lại, tránh bị nhân đôi.
   */
  function buildFilterOptions(data) {
    const classSel = document.getElementById('f-class');
    const examSel = document.getElementById('f-exam');
    const schoolSel = document.getElementById('f-school');
    [classSel, examSel, schoolSel].forEach(resetDynamicOptions);

    const classNames = [...new Set(data.students.map((s) => s.className).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi'));
    classNames.forEach((name) => classSel.insertAdjacentHTML('beforeend', `<option value="${esc(name)}">${esc(name)}</option>`));

    const examNames = [...new Set(data.results.map((r) => r.testName).filter(Boolean))].sort();
    examNames.forEach((name) => examSel.insertAdjacentHTML('beforeend', `<option value="${esc(name)}">${esc(name)}</option>`));

    // Chỉ hiện bộ chọn Trường nếu giáo viên được gán > 1 trường — 1 trường
    // thì không cần chọn gì cả, đỡ rối giao diện.
    if (data.schools.length > 1) {
      document.getElementById('f-school-wrap').hidden = false;
      data.schools.forEach((s) => schoolSel.insertAdjacentHTML('beforeend', `<option value="${esc(s)}">${esc(s)}</option>`));
    }
  }

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /**
   * Áp bộ lọc (trường / lớp / bài thi / khoảng thời gian) lên dữ liệu gốc.
   * Trả về cùng shape { filteredResults, filteredStudents, examHistories } mà
   * js/coordinator/charts.js, student-table.js, student-detail.js đã hiểu sẵn
   * (dùng lại nguyên 3 file đó cho Teacher Dashboard, không viết lại).
   */
  function applyFilters(data, filters) {
    const { school, classId: className, examName, rangeDays } = filters;

    let filteredStudents = data.students;
    if (school) filteredStudents = filteredStudents.filter((s) => s.school === school);
    if (className) filteredStudents = filteredStudents.filter((s) => s.className === className);

    const now = Date.now();
    const rangeMs = { '7': 7, '30': 30, '90': 90 }[rangeDays];
    const cutoff = rangeMs ? now - rangeMs * 86400000 : null;

    const filteredResults = data.results.filter((r) => {
      if (school && r.studentSchool !== school) return false;
      if (className && r.studentClass !== className) return false;
      if (examName && r.testName !== examName) return false;
      if (cutoff && (r.submittedAtMs || 0) < cutoff) return false;
      return true;
    });

    const examHistories = global.EduModels.ExamHistory.buildFromResults(filteredResults);

    return { filteredResults, filteredStudents, examHistories };
  }

  global.EduTeacherData = { loadAll, buildFilterOptions, applyFilters };
})(window);
