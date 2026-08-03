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
     */
    async listRecent({ studentClass, testName, sinceMs, limit = 1000 } = {}) {
      const where = [];
      if (studentClass) where.push(['studentClass', '==', studentClass]);
      if (testName) where.push(['testName', '==', testName]);
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
    async listByStudent({ studentName, studentClass }) {
      const rows = await this.list({
        where: [['studentClass', '==', studentClass]],
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
