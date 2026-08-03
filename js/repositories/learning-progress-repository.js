/* ============================================================
   js/repositories/learning-progress-repository.js
   CRUD cho collection MỚI "learning_progress".
   ============================================================ */
(function (global) {
  'use strict';

  const { COLLECTION_NAME } = global.EduModels.LearningProgress;

  class LearningProgressRepository extends global.EduBaseRepository {
    constructor() { super(COLLECTION_NAME); }

    async listByClass(className) {
      return this.list({ where: [['studentClass', '==', className]] });
    }

    async listByStatus(status) {
      return this.list({ where: [['status', '==', status]] });
    }
  }

  global.EduRepositories = global.EduRepositories || {};
  global.EduRepositories.learningProgress = new LearningProgressRepository();
})(window);
