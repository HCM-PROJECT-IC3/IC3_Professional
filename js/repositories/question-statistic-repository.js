/* ============================================================
   js/repositories/question-statistic-repository.js
   CRUD cho collection MỚI "question_statistics".
   ============================================================ */
(function (global) {
  'use strict';

  const { COLLECTION_NAME } = global.EduModels.QuestionStatistic;

  class QuestionStatisticRepository extends global.EduBaseRepository {
    constructor() { super(COLLECTION_NAME); }

    /** Top N câu hỏi có tỉ lệ trả lời đúng thấp nhất (khó nhất / hay sai nhất). */
    async topWrong(testName, topN = 10) {
      const rows = await this.list({ where: [['testName', '==', testName]] });
      return rows
        .filter((r) => r.timesAnswered > 0)
        .sort((a, b) => (a.timesCorrect / a.timesAnswered) - (b.timesCorrect / b.timesAnswered))
        .slice(0, topN);
    }
  }

  global.EduRepositories = global.EduRepositories || {};
  global.EduRepositories.questionStatistic = new QuestionStatisticRepository();
})(window);
