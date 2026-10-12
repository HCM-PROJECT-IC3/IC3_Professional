/* ============================================================
   js/repositories/activity-log-repository.js
   Nhật ký hoạt động: ghi Google Sheet qua Apps Script khi js/backend-config.js đặt
   activityLog = 'sheet' (mặc định); nhánh Firestore "activity_logs" cũ vẫn TẮT (ENABLED).
   ============================================================ */
(function (global) {
  'use strict';

  const { COLLECTION_NAME, build } = global.EduModels.ActivityLog;

  class ActivityLogRepository extends global.EduBaseRepository {
    constructor() { super(COLLECTION_NAME); }

    async record(entry) {
      // Ghi vào Google Sheet qua Apps Script (tab NhatKyHoatDong) — 0 lượt Firebase. Apps
      // Script tự lấy uid/vai trò từ tài khoản đăng nhập, không tin uid/role gửi lên.
      const mode = global.EduBackend && global.EduBackend.activityLog;
      if (mode === 'sheet' && global.EduAppsScript) {
        try {
          const page = (location.pathname.split('/').pop() || '').replace(/\.html$/, '');
          await global.EduAppsScript.call('logActivity',
            { activity: entry.action, targetId: entry.targetId || '', meta: entry.meta || {}, page }, { timeoutMs: 20 * 1000 });
        } catch (err) {
          console.warn('[EduActivityLog] Không ghi được nhật ký:', err.message);
        }
        return;
      }
      // Nhánh Firestore cũ: TẮT cho tới khi firestore.rules có rule cho "activity_logs": hiện mọi lần
      // ghi đều bị từ chối (Missing or insufficient permissions) — chỉ tốn request
      // và gây cảnh báo console. Bật lại = đổi cờ này + thêm rule (admin đọc, user đã đăng nhập tạo).
      if (!ActivityLogRepository.ENABLED) return;
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

  ActivityLogRepository.ENABLED = false;

  global.EduRepositories = global.EduRepositories || {};
  global.EduRepositories.activityLog = new ActivityLogRepository();
})(window);
