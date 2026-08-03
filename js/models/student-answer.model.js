/* ============================================================
   js/models/student-answer.model.js
   Model StudentAnswer — collection MỚI "student_answers".

   Hệ thống hiện tại (quiz_results) CHỈ lưu điểm tổng hợp, KHÔNG lưu
   học sinh đã chọn gì cho từng câu → không thể tính "câu hỏi sai
   nhiều nhất" hay độ khó câu hỏi. Collection này bổ sung phần đó.

   QUAN TRỌNG: việc GHI dữ liệu vào collection này đòi hỏi sửa
   js/quiz-engine.js (nơi nộp bài) — đây là điểm chạm vào luồng làm
   bài đang chạy ổn định, nên KHÔNG làm ở bước này. Model + Repository
   được chuẩn bị trước; việc wiring vào quiz-engine.js sẽ là 1 commit
   riêng, nhỏ, có thể bật/tắt qua feature flag (xem README-LMAP.md).

   @typedef {Object} StudentAnswer
   @property {string} id
   @property {string} resultId       Tham chiếu tới doc quiz_results/{id}
   @property {string} questionUid    Trùng với field "uid" của câu hỏi trong data/ic3/*.json
   @property {string} testName       Trùng testName của StudentResult (để query nhanh không cần join)
   @property {string} studentClass   Denormalized để lọc theo lớp không cần join
   @property {boolean} isCorrect
   @property {*} chosenAnswer        Cấu trúc tuỳ loại câu hỏi (giữ nguyên như quiz-engine lưu nội bộ)
   @property {*} correctAnswer
   @property {number} timeSpentSec
   @property {firebase.firestore.Timestamp} answeredAt
   ============================================================ */
(function (global) {
  'use strict';

  const COLLECTION_NAME = 'student_answers';

  /** Tạo payload chuẩn để ghi 1 câu trả lời (dùng khi wiring vào quiz-engine.js ở bước sau). */
  function build({ resultId, questionUid, testName, studentClass, isCorrect, chosenAnswer, correctAnswer, timeSpentSec }) {
    return {
      resultId: resultId || '',
      questionUid: questionUid || '',
      testName: testName || '',
      studentClass: studentClass || '',
      isCorrect: !!isCorrect,
      chosenAnswer: chosenAnswer ?? null,
      correctAnswer: correctAnswer ?? null,
      timeSpentSec: Number(timeSpentSec) || 0,
      answeredAt: firebase.firestore.FieldValue.serverTimestamp(),
    };
  }

  global.EduModels = global.EduModels || {};
  global.EduModels.StudentAnswer = { COLLECTION_NAME, build };
})(window);
