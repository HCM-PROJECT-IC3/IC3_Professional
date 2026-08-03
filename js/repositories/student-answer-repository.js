/* ============================================================
   js/repositories/student-answer-repository.js
   CRUD cho collection MỚI "student_answers". Xem ghi chú quan trọng
   trong models/student-answer.model.js — việc GHI dữ liệu này vào
   luồng nộp bài thật sẽ là 1 commit riêng sau (đụng quiz-engine.js).
   ============================================================ */
(function (global) {
  'use strict';

  const { COLLECTION_NAME } = global.EduModels.StudentAnswer;

  class StudentAnswerRepository extends global.EduBaseRepository {
    constructor() { super(COLLECTION_NAME); }

    async listByResult(resultId) {
      return this.list({ where: [['resultId', '==', resultId]] });
    }

    /** Dùng cho "câu hỏi sai nhiều nhất": lấy toàn bộ câu trả lời SAI của 1 bài thi. */
    async listWrongByTest(testName, limit = 2000) {
      return this.list({
        where: [['testName', '==', testName], ['isCorrect', '==', false]],
        limit,
      });
    }
  }

  global.EduRepositories = global.EduRepositories || {};
  global.EduRepositories.studentAnswer = new StudentAnswerRepository();
})(window);
