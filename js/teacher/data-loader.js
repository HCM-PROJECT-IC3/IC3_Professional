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

  // Cache 3 phút cho quiz_results (CẦN TƯƠI — giáo viên theo dõi liên tục
  // lúc học sinh đang làm bài, xem js/services/data-cache-service.js).
  const RESULTS_CACHE_TTL_MS = 3 * 60 * 1000;

  // Cache 30 phút cho roster — chỉ đổi khi Admin import/sửa roster, không
  // cần tươi từng phút. persist=true (localStorage): sống qua nhiều lần
  // mở tab, quan trọng nhất ở nhánh admin (tải TOÀN BỘ roster, không giới
  // hạn) khi trường có hàng chục nghìn học sinh — mỗi lần KHÔNG cache sẽ
  // tốn lại toàn bộ số lượt đọc đó, dễ chạm trần 50.000 đọc/ngày (Spark).
  const ROSTER_CACHE_TTL_MS = 30 * 60 * 1000;

  /**
   * Tải dữ liệu cho 1 giáo viên, giới hạn đúng các trường trong profile.schools.
   *
   * NGOẠI LỆ: Admin cũng được phép mở trang này (EDU_ALLOWED_ROLES ở
   * teacher-dashboard.html gồm cả 'admin', vd để kiểm tra dashboard 1 giáo
   * viên nhìn thấy gì) — nhưng Admin thì KHÔNG có/KHÔNG CẦN field "schools"
   * (đó là khái niệm riêng của role teacher, gán ở admin-users.html), nên
   * trước đây admin mở trang này luôn dính "chưa được gán Trường được xem"
   * dù chính họ là người đi gán quyền đó cho người khác — vô lý. Admin đọc
   * KHÔNG giới hạn theo trường (đúng quyền isAdmin() trong firestore.rules,
   * giống hệt cách js/coordinator/data-loader.js đang tải), rồi tự suy ra
   * danh sách trường từ dữ liệu tải được để 3 dropdown lọc vẫn có nghĩa.
   * @param {Object} profile Hồ sơ Firestore users/{uid} của người đang đăng nhập.
   * @param {Object} [opts]
   * @param {boolean} [opts.forceRefresh] Bỏ qua cache, luôn đọc lại từ Firestore
   *   (dùng khi bấm nút "🔄 Làm mới dữ liệu").
   */
  async function loadAll(profile, { forceRefresh = false } = {}) {
    const isAdmin = profile.role === 'admin';
    const schools = Array.isArray(profile.schools) ? profile.schools.filter(Boolean) : [];
    if (!isAdmin && !schools.length) {
      // Chưa được Admin gán trường nào — không query gì cả (tránh query rỗng
      // vô nghĩa), trả về rỗng kèm cờ báo để UI hiện đúng thông báo.
      return { schools, students: [], results: [], noSchoolsAssigned: true };
    }

    const uid = profile.uid || profile.id;
    const scopeKey = isAdmin ? 'admin-all-schools' : (uid || 'unknown') + ':' + schools.slice().sort().join('|');
    const rosterCacheKey = 'teacher:roster:' + scopeKey;
    const resultsCacheKey = 'teacher:results:' + scopeKey;

    // Roster: lọc theo ĐÚNG teacherId (uid) của giáo viên đang đăng nhập —
    // KHÔNG còn theo "schools" (cả trường) như trước, vì 2 giáo viên có thể
    // dạy chung 1 trường và trước đây mỗi người nhìn thấy CẢ học sinh của
    // người kia (lỗi người dùng phản hồi, xem listByTeacher() + rule
    // canAccessRosterStudent() trong firestore.rules). "schools" vẫn cần
    // giữ lại cho quiz_results bên dưới (collection đó không có teacherId).
    //
    // Cache TÁCH RIÊNG roster (persist=true, 30 phút) và quiz_results
    // (sessionStorage, 3 phút) — xem ROSTER_CACHE_TTL_MS ở trên. Quan
    // trọng nhất ở nhánh isAdmin (tải TOÀN BỘ roster không giới hạn).
    let students = !forceRefresh && global.EduDataCache
      ? global.EduDataCache.get(rosterCacheKey, /* persist */ true)
      : null;
    if (!students) {
      students = isAdmin
        ? await global.EduRepositories.studentRoster.list({ where: [['status', '==', 'active']] })
        : await global.EduRepositories.studentRoster.listByTeacher(uid);
      if (global.EduDataCache) global.EduDataCache.set(rosterCacheKey, students, ROSTER_CACHE_TTL_MS, /* persist */ true);
    }

    let resultsRaw = !forceRefresh && global.EduDataCache ? global.EduDataCache.get(resultsCacheKey) : null;
    if (!resultsRaw) {
      resultsRaw = await global.EduRepositories.studentResult.listRecent(isAdmin ? { limit: 1000 } : { schools, limit: 1000 });
      if (global.EduDataCache) global.EduDataCache.set(resultsCacheKey, resultsRaw, RESULTS_CACHE_TTL_MS);
    }

    // quiz_results không có field teacherId (chỉ có studentSchool) nên
    // firestore.rules chỉ siết được theo "schools" — nếu dừng ở đó, 1 giáo
    // viên sẽ thấy LẪN kết quả của các lớp đồng nghiệp khác dạy chung
    // trường (bug người dùng báo: thấy lớp lạ, không thấy đủ lớp mình dạy
    // vì bị trộn/che khuất bởi dữ liệu ngoài lớp). Lọc tiếp ở client theo
    // đúng tập className mà giáo viên này thực sự phụ trách (suy từ
    // "students" vừa lọc theo teacherId ở trên) — không lộ thêm dữ liệu gì
    // (đã tải về theo rule cho phép), chỉ ẩn bớt cho khớp đúng lớp thật.
    const results = isAdmin
      ? resultsRaw
      : (() => {
          const ownClassNames = new Set(students.map((s) => s.className).filter(Boolean));
          return resultsRaw.filter((r) => ownClassNames.has(r.studentClass));
        })();
    const effectiveSchools = isAdmin
      ? [...new Set(students.map((s) => s.school).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi'))
      : schools;
    return { schools: effectiveSchools, students, results, noSchoolsAssigned: false };
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
