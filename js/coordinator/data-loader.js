/* ============================================================
   js/coordinator/data-loader.js
   Tầng tải + lọc dữ liệu cho Coordinator Dashboard (Commit #4, siết
   phạm vi trường ở Commit #7/LMAP).

   Nguồn dữ liệu:
   - Roster thật (courses/classes/students_roster) — Commit #1/#3.
   - quiz_results (đã có sẵn, chỉ ĐỌC qua studentResultRepository).

   Đối chiếu roster ↔ quiz_results qua TÊN LỚP (class.name ==
   studentClass trong quiz_results) — đúng nguyên tắc đã ghi trong
   docs/architecture/LMAP-ARCHITECTURE.md (chưa có mssv bắt buộc lúc
   làm bài nên phải đối chiếu qua tên).

   Commit #7/LMAP: students_roster + quiz_results giờ CHỈ tải trong
   (các) trường ở users/{uid}.schools của Điều phối đào tạo đang đăng
   nhập (myCoordinatorSchools() trong firestore.rules) — TRƯỚC ĐÂY tải
   TOÀN BỘ 2 collection này không lọc gì (coordinator mặc định xem hết),
   giờ firestore.rules đã siết theo trường nên 1 query không where(...,
   'in', schools) sẽ bị Firestore TỪ CHỐI HẲN, không tự lọc giúp — xem
   comment ở isOwnSchoolField()/canAccessRosterStudent() trong
   firestore.rules. "courses"/"classes" vẫn tải KHÔNG lọc (schema không
   có field trường, rule cũng không siết 2 collection này).

   Nạp SAU: roster-repository.js, student-result-repository.js,
            exam-history.model.js, analytics-service.js.
   ============================================================ */
(function (global) {
  'use strict';

  // Cache 3 phút cho quiz_results (CẦN TƯƠI — Điều phối đào tạo theo dõi
  // liên tục lúc học sinh đang làm bài): mở lại/F5 trang trong 3 phút
  // không tốn thêm lượt đọc Firestore (xem js/services/data-cache-service.js).
  const RESULTS_CACHE_TTL_MS = 3 * 60 * 1000;

  // Cache 30 phút cho roster (courses/classes/students/teachers) — dữ liệu
  // này chỉ đổi khi có người import Excel/sửa roster, KHÔNG cần tươi từng
  // phút như quiz_results. Cache riêng, dài hơn nhiều và SỐNG QUA NHIỀU
  // LẦN mở tab (persist=true, xem data-cache-service.js) — quan trọng khi
  // roster có hàng chục nghìn học sinh: tách khỏi cache quiz_results để
  // không phải đọc lại TOÀN BỘ roster mỗi 3 phút chỉ vì cần kết quả tươi.
  const ROSTER_CACHE_TTL_MS = 30 * 60 * 1000;

  /** where('in', ...) tối đa 10 giá trị — chia nhỏ "schools" thành từng
   * nhóm ≤10 rồi gộp kết quả lại, phòng khi 1 coordinator được gán > 10
   * trường (hiếm nhưng không giả định trước). */
  function chunk10(arr) {
    const out = [];
    for (let i = 0; i < arr.length; i += 10) out.push(arr.slice(i, i + 10));
    return out;
  }

  async function studentsByChunkedSchools(schools) {
    const results = await Promise.all(chunk10(schools).map((part) => global.EduRepositories.studentRoster.listBySchools(part)));
    return results.flat();
  }

  /**
   * Tải toàn bộ dữ liệu nền cần cho dashboard — gọi 1 lần lúc khởi động trang
   * (hoặc lại khi cache hết hạn / bấm "🔄 Làm mới dữ liệu").
   * @param {Object} profile Hồ sơ Firestore users/{uid} của người đang đăng nhập.
   * @param {Object} [opts]
   * @param {boolean} [opts.forceRefresh] Bỏ qua cache, luôn đọc lại từ Firestore.
   */
  async function loadAll(profile, { forceRefresh = false } = {}) {
    const isAdmin = profile.role === 'admin';
    const schools = Array.isArray(profile.schools) ? profile.schools.filter(Boolean) : [];
    if (!isAdmin && !schools.length) {
      // Chưa được Admin gán trường nào để hỗ trợ — không query gì cả (tránh
      // query rỗng vô nghĩa/bị rules từ chối), trả về rỗng kèm cờ báo để UI
      // hiện đúng thông báo (giống hệt teacher/data-loader.js).
      return { courses: [], classes: [], students: [], teachers: [], results: [], schools: [], noSchoolsAssigned: true };
    }

    const scopeKey = isAdmin ? 'admin-all-schools' : (profile.uid || profile.id || 'unknown') + ':' + schools.slice().sort().join('|');
    const rosterCacheKey = 'coordinator:roster:' + scopeKey;
    const resultsCacheKey = 'coordinator:results:' + scopeKey;

    // 2 cache TÁCH RIÊNG, đọc song song — roster (persist=true, 30 phút,
    // sống qua nhiều lần mở tab) và quiz_results (sessionStorage, 3 phút).
    // forceRefresh bỏ qua CẢ HAI (nút "🔄 Làm mới dữ liệu" phải luôn thấy
    // dữ liệu mới nhất tuyệt đối, không chỉ mỗi quiz_results).
    let rosterBundle = !forceRefresh && global.EduDataCache
      ? global.EduDataCache.get(rosterCacheKey, /* persist */ true)
      : null;
    if (!rosterBundle) {
      const [courses, classes, students, teacherSnap] = await Promise.all([
        global.EduRepositories.course.list(),
        global.EduRepositories.class.list(),
        isAdmin
          ? global.EduRepositories.studentRoster.list({ where: [['status', '==', 'active']] })
          : studentsByChunkedSchools(schools),
        global.EduFirebase.db.collection('users').where('role', '==', 'teacher').where('approved', '==', true).get(),
      ]);
      const teachers = teacherSnap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
      rosterBundle = { courses, classes, students, teachers };
      if (global.EduDataCache) global.EduDataCache.set(rosterCacheKey, rosterBundle, ROSTER_CACHE_TTL_MS, /* persist */ true);
    }

    // Tải tăng dần (xem listRecentCached): chỉ đọc bài MỚI nộp kể từ lần trước.
    const results = await global.EduRepositories.studentResult.listRecentCached({
      cacheKey: resultsCacheKey, schools: isAdmin ? undefined : schools, limit: 1000,
      freshMs: forceRefresh ? 15 * 1000 : RESULTS_CACHE_TTL_MS
    });

    return Object.assign({}, rosterBundle, { results, schools, noSchoolsAssigned: false });
  }

  /** Xoá các <option> đã thêm động trước đó (giữ lại option đầu tiên — "Tất cả"). */
  function resetDynamicOptions(sel) {
    while (sel.options.length > 1) sel.remove(1);
  }

  /**
   * Đổ các option vào 5 dropdown lọc. An toàn khi gọi lại nhiều lần (vd. sau
   * khi bấm "🔄 Làm mới dữ liệu") — luôn xoá option cũ trước, tránh nhân đôi.
   */
  function buildFilterOptions(data) {
    const courseSel = document.getElementById('f-course');
    const teacherSel = document.getElementById('f-teacher');
    const classSel = document.getElementById('f-class');
    const examSel = document.getElementById('f-exam');
    [courseSel, teacherSel, classSel, examSel].forEach(resetDynamicOptions);

    data.courses.forEach((c) => courseSel.insertAdjacentHTML('beforeend', `<option value="${esc(c.id)}">${esc(c.name)}</option>`));
    data.teachers.forEach((t) => teacherSel.insertAdjacentHTML('beforeend', `<option value="${esc(t.id)}">${esc(t.name || t.email)}</option>`));
    data.classes.forEach((c) => classSel.insertAdjacentHTML('beforeend', `<option value="${esc(c.id)}">${esc(c.name)}</option>`));

    // Sắp theo thứ tự "Bài N" hợp lý (không phải bảng chữ cái) — dùng
    // CHUNG window.EduAnalytics.compareNatural() thay vì tự định nghĩa lại
    // ở đây, để sửa 1 chỗ là áp dụng cho MỌI nơi dùng dropdown "Bài thi"
    // (coordinator/teacher/admin dashboard đều gọi cùng 1 hàm — xem
    // js/services/analytics-service.js). Nạp SAU analytics-service.js nên
    // window.EduAnalytics luôn sẵn sàng ở đây; .sort() mặc định (so chuỗi)
    // là lưới an toàn nếu vì lý do gì đó file kia chưa nạp được.
    const examNames = [...new Set(data.results.map((r) => r.testName).filter(Boolean))]
      .sort(global.EduAnalytics?.compareNatural || undefined);
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
