/* ============================================================
   js/coordinator/data-loader.js
   Tầng tải + lọc dữ liệu cho Coordinator Dashboard (Commit #4).

   Nguồn dữ liệu:
   - Roster thật (courses/classes/students_roster) — Commit #1/#3.
   - quiz_results (đã có sẵn, chỉ ĐỌC qua studentResultRepository).

   Đối chiếu roster ↔ quiz_results qua TÊN LỚP (class.name ==
   studentClass trong quiz_results) — đúng nguyên tắc đã ghi trong
   docs/architecture/LMAP-ARCHITECTURE.md (chưa có mssv bắt buộc lúc
   làm bài nên phải đối chiếu qua tên).

   Nạp SAU: roster-repository.js, student-result-repository.js,
            exam-history.model.js, analytics-service.js.
   ============================================================ */
(function (global) {
  'use strict';

  /** Tải toàn bộ dữ liệu nền cần cho dashboard — gọi 1 lần lúc khởi động trang. */
  async function loadAll() {
    const [courses, classes, students, teacherSnap, results] = await Promise.all([
      global.EduRepositories.course.list(),
      global.EduRepositories.class.list(),
      global.EduRepositories.studentRoster.list({ where: [['status', '==', 'active']] }),
      global.EduFirebase.db.collection('users').where('role', '==', 'teacher').where('approved', '==', true).get(),
      global.EduRepositories.studentResult.listRecent({ limit: 1000 }),
    ]);
    const teachers = teacherSnap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
    return { courses, classes, students, teachers, results };
  }

  /** Đổ các option vào 5 dropdown lọc (chỉ chạy 1 lần sau khi có dữ liệu). */
  function buildFilterOptions(data) {
    const courseSel = document.getElementById('f-course');
    const teacherSel = document.getElementById('f-teacher');
    const classSel = document.getElementById('f-class');
    const examSel = document.getElementById('f-exam');

    data.courses.forEach((c) => courseSel.insertAdjacentHTML('beforeend', `<option value="${esc(c.id)}">${esc(c.name)}</option>`));
    data.teachers.forEach((t) => teacherSel.insertAdjacentHTML('beforeend', `<option value="${esc(t.id)}">${esc(t.name || t.email)}</option>`));
    data.classes.forEach((c) => classSel.insertAdjacentHTML('beforeend', `<option value="${esc(c.id)}">${esc(c.name)}</option>`));

    const examNames = [...new Set(data.results.map((r) => r.testName).filter(Boolean))].sort();
    examNames.forEach((name) => examSel.insertAdjacentHTML('beforeend', `<option value="${esc(name)}">${esc(name)}</option>`));
  }

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /**
   * Áp bộ lọc 5 chiều (khoá học / giáo viên / lớp / bài thi / khoảng thời gian)
   * lên dữ liệu gốc, trả về { filteredResults, filteredStudents, examHistories }.
   */
  function applyFilters(data, filters) {
    const { courseId, teacherId, classId, examName, rangeDays } = filters;

    // 1) Xác định tập LỚP hợp lệ theo bộ lọc course/teacher/class.
    let allowedClasses = data.classes;
    if (courseId) allowedClasses = allowedClasses.filter((c) => c.courseId === courseId);
    if (teacherId) allowedClasses = allowedClasses.filter((c) => c.teacherId === teacherId);
    if (classId) allowedClasses = allowedClasses.filter((c) => c.id === classId);
    const allowedClassNames = new Set(allowedClasses.map((c) => c.name));
    const anyClassFilterActive = !!(courseId || teacherId || classId);

    // 2) Lọc roster học sinh theo cùng tập lớp.
    const filteredStudents = anyClassFilterActive
      ? data.students.filter((s) => allowedClassNames.has(s.className))
      : data.students;

    // 3) Lọc quiz_results: theo lớp (nếu có lọc), theo bài thi, theo khoảng thời gian.
    const now = Date.now();
    const rangeMs = { '7': 7, '30': 30, '90': 90 }[rangeDays];
    const cutoff = rangeMs ? now - rangeMs * 86400000 : null;

    const filteredResults = data.results.filter((r) => {
      if (anyClassFilterActive && !allowedClassNames.has(r.studentClass)) return false;
      if (examName && r.testName !== examName) return false;
      if (cutoff && (r.submittedAtMs || 0) < cutoff) return false;
      return true;
    });

    const examHistories = global.EduModels.ExamHistory.buildFromResults(filteredResults);

    return { filteredResults, filteredStudents, examHistories, allowedClasses };
  }

  global.EduCoordinatorData = { loadAll, buildFilterOptions, applyFilters };
})(window);
