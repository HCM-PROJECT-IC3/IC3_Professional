/* ============================================================
   js/models/exam-history.model.js
   Model ExamHistory — KHÔNG phải collection Firestore riêng.
   Đây là một "view" được tính toán từ nhiều StudentResult (quiz_results)
   của cùng 1 học sinh (nhóm theo studentName + studentClass, hoặc theo
   mssv nếu học sinh đã có trong roster — xem roster.model.js).

   Lý do không tạo collection riêng: dữ liệu nguồn (quiz_results) đã
   đủ để dựng lại lịch sử này bất kỳ lúc nào, tạo thêm collection sẽ
   phát sinh rủi ro lệch dữ liệu (phải đồng bộ 2 nơi). Nếu sau này cần
   tăng tốc độ đọc, có thể "vật chất hoá" (materialize) view này vào
   Firestore bằng 1 batch job định kỳ mà không đổi lại API phía trên.

   @typedef {Object} ExamHistory
   @property {string} studentKey     "{studentName}__{studentClass}" hoặc mssv
   @property {string} studentName
   @property {string} studentClass
   @property {number} attemptsCount
   @property {number} avgScore
   @property {number} bestScore
   @property {number} latestScore
   @property {number} latestSubmittedAtMs
   @property {StudentResult[]} attempts   sắp xếp mới nhất trước
   ============================================================ */
(function (global) {
  'use strict';

  /** Sinh key định danh học sinh khi chưa có MSSV (khớp cách quiz_results đang lưu). */
  function keyOf(result) {
    return `${(result.studentName || '').trim().toLowerCase()}__${(result.studentClass || '').trim().toLowerCase()}`;
  }

  /**
   * Gom danh sách StudentResult (đã normalize, có submittedAtMs) thành
   * danh sách ExamHistory theo từng học sinh.
   * @param {Array} results
   * @returns {ExamHistory[]}
   */
  function buildFromResults(results) {
    const byStudent = new Map();
    for (const r of results) {
      const key = keyOf(r);
      if (!byStudent.has(key)) {
        byStudent.set(key, {
          studentKey: key,
          studentName: r.studentName || 'Ẩn danh',
          studentClass: r.studentClass || '',
          attempts: [],
        });
      }
      byStudent.get(key).attempts.push(r);
    }

    return Array.from(byStudent.values()).map((entry) => {
      const attempts = entry.attempts.sort((a, b) => (b.submittedAtMs || 0) - (a.submittedAtMs || 0));
      const scores = attempts.map((a) => a.score).filter((s) => typeof s === 'number');
      return Object.assign(entry, {
        attempts,
        attemptsCount: attempts.length,
        avgScore: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
        bestScore: scores.length ? Math.max(...scores) : null,
        latestScore: attempts[0] ? attempts[0].score : null,
        latestSubmittedAtMs: attempts[0] ? attempts[0].submittedAtMs : null,
      });
    });
  }

  global.EduModels = global.EduModels || {};
  global.EduModels.ExamHistory = { keyOf, buildFromResults };
})(window);
