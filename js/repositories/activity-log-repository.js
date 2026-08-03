/* ============================================================
   js/repositories/activity-log-repository.js
   Ghi/đọc collection MỚI "activity_logs".
   ============================================================ */
(function (global) {
  'use strict';

  const { COLLECTION_NAME, build } = global.EduModels.ActivityLog;

  class ActivityLogRepository extends global.EduBaseRepository {
    constructor() { super(COLLECTION_NAME); }

    async record(entry) {
      try {
        await this.create(build(entry));
      } catch (err) {
        // Không bao giờ để lỗi ghi log làm gián đoạn trải nghiệm người dùng.
        console.warn('[EduActivityLog] Không ghi được log:', err.message);
      }
    }

    async listRecent(limit = 200) {
      return this.list({ orderBy: 'createdAt', direction: 'desc', limit });
    }

    async listByUid(uid, limit = 100) {
      return this.list({ where: [['uid', '==', uid]], orderBy: 'createdAt', direction: 'desc', limit });
    }
  }

  global.EduRepositories = global.EduRepositories || {};
  global.EduRepositories.activityLog = new ActivityLogRepository();
})(window);
