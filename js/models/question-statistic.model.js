/* ============================================================
   js/models/question-statistic.model.js
   Model QuestionStatistic — collection MỚI "question_statistics".
   Mỗi document = 1 câu hỏi (id = questionUid), được CẬP NHẬT DẦN
   (increment) mỗi khi có StudentAnswer mới, thay vì tính lại từ đầu
   mỗi lần xem báo cáo — quan trọng vì student_answers có thể lên tới
   hàng chục nghìn document.

   @typedef {Object} QuestionStatistic
   @property {string} questionUid
   @property {string} testName
   @property {number} timesAnswered
   @property {number} timesCorrect
   @property {number} timesWrong
   @property {number} difficultyIndex   0-1, càng thấp càng khó (tỉ lệ trả lời đúng)
   @property {number} avgTimeSec
   @property {firebase.firestore.Timestamp} updatedAt
   ============================================================ */
(function (global) {
  'use strict';

  const COLLECTION_NAME = 'question_statistics';

  /** Tính lại difficultyIndex từ số liệu thô — dùng khi cần recompute hàng loạt. */
  function computeDifficulty(stat) {
    if (!stat.timesAnswered) return null;
    return Math.round((stat.timesCorrect / stat.timesAnswered) * 100) / 100;
  }

  /** Payload increment dùng với FieldValue.increment() khi ghi nhận 1 lượt trả lời mới. */
  function incrementPayload({ isCorrect, timeSpentSec }) {
    return {
      timesAnswered: firebase.firestore.FieldValue.increment(1),
      timesCorrect: firebase.firestore.FieldValue.increment(isCorrect ? 1 : 0),
      timesWrong: firebase.firestore.FieldValue.increment(isCorrect ? 0 : 1),
      _timeSpentSecSum: firebase.firestore.FieldValue.increment(Number(timeSpentSec) || 0),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    };
  }

  global.EduModels = global.EduModels || {};
  global.EduModels.QuestionStatistic = { COLLECTION_NAME, computeDifficulty, incrementPayload };
})(window);
