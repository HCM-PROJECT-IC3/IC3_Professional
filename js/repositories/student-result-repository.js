/* ============================================================
   js/repositories/student-result-repository.js
   Đọc dữ liệu từ collection "quiz_results" (đã tồn tại). Đây là
   repository CHỈ ĐỌC — việc GHI vẫn do js/firestore-results.js đảm
   nhiệm như cũ (đúng nguyên tắc "không đổi chức năng hiện có").

   Nạp SAU: firebase-config.js, repositories/base-repository.js,
            models/student-result.model.js, models/exam-history.model.js
            (dùng ExamHistory.keyOf() để so khớp học sinh đã chuẩn hoá).
   ============================================================ */
(function (global) {
  'use strict';

  const { COLLECTION_NAME, normalize } = global.EduModels.StudentResult;

  class StudentResultRepository extends global.EduBaseRepository {
    constructor() { super(COLLECTION_NAME); }

    /**
     * Lấy danh sách kết quả gần nhất, có thể lọc theo lớp/bài thi/khoảng thời gian.
     * Giữ giới hạn limit để tránh đọc quá nhiều doc (đúng tinh thần dashboard.js hiện tại).
     *
     * @param {string[]} [schools] Lọc theo studentSchool ('in', tối đa 10 giá trị —
     *   đủ dùng vì 1 giáo viên hiếm khi được gán quá 10 trường). BẮT BUỘC truyền cho
     *   teacher-dashboard.html (Commit #6/LMAP) — firestore.rules chỉ cho giáo viên đọc
     *   document có studentSchool nằm trong "schools" của họ, nên nếu KHÔNG lọc where
     *   ở đây, Firestore sẽ từ chối toàn bộ query (không tự lọc giúp). Coordinator/Admin
     *   không cần truyền (đọc không giới hạn theo rule).
     */
    async listRecent({ studentClass, testName, sinceMs, schools, limit = 1000 } = {}) {
      const where = [];
      if (studentClass) where.push(['studentClass', '==', studentClass]);
      if (testName) where.push(['testName', '==', testName]);
      if (schools && schools.length) where.push(['studentSchool', 'in', schools.slice(0, 10)]);
      const rows = await this.list({ where, orderBy: 'submittedAt', direction: 'desc', limit });
      const normalized = rows.map(normalize);
      return sinceMs ? normalized.filter((r) => (r.submittedAtMs || 0) >= sinceMs) : normalized;
    }

    /**
     * Lấy toàn bộ kết quả của 1 học sinh theo tên+lớp (dùng cho trang chi tiết học sinh).
     *
     * LƯU Ý: chỉ lọc "studentClass" bằng Firestore where (giữ đúng quy ước so khớp
     * lớp đang dùng ở data-loader.js), sau đó so khớp CHÍNH XÁC học sinh ở phía
     * client bằng đúng công thức chuẩn hoá (trim + lowercase) mà
     * EduModels.ExamHistory.keyOf() / EduModels.Roster.studentKeyOf() đang dùng.
     * Trước đây dùng where('studentName','==',...) trực tiếp trên Firestore —
     * so khớp tuyệt đối, phân biệt hoa/thường và khoảng trắng — nên có thể trả
     * về rỗng dù bảng học sinh (đã chuẩn hoá) đang hiện học sinh đó có điểm.
     */
    /**
     * @param {string[]} [schools] BẮT BUỘC truyền khi gọi với vai trò giáo viên
     *   (Commit #8/LMAP, teacher-dashboard.html tái dùng student-detail.js của
     *   coordinator) — nếu không, Firestore từ chối query vì không có điều kiện
     *   where khớp rule scoping theo studentSchool. Coordinator/Admin không cần
     *   truyền (rule của họ không yêu cầu).
     */
    async listByStudent({ studentName, studentClass, schools }) {
      const where = [['studentClass', '==', studentClass]];
      if (schools && schools.length) where.push(['studentSchool', 'in', schools.slice(0, 10)]);
      const rows = await this.list({
        where,
        orderBy: 'submittedAt',
        direction: 'desc',
      });
      const normalized = rows.map(normalize);
      const wantKey = global.EduModels.ExamHistory.keyOf({ studentName, studentClass });
      return normalized.filter((r) => global.EduModels.ExamHistory.keyOf(r) === wantKey);
    }
  }

  global.EduRepositories = global.EduRepositories || {};
  global.EduRepositories.studentResult = new StudentResultRepository();
})(window);
