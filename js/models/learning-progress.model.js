/* ============================================================
   js/models/learning-progress.model.js
   Model LearningProgress — collection MỚI "learning_progress".
   1 document = tiến trình học TÍCH LUỸ của 1 học sinh (id = mssv nếu có
   trong roster, hoặc studentKey = "{name}__{class}" nếu chưa có roster).

   Khác với ExamHistory (view tính lại mỗi lần đọc), LearningProgress
   là dữ liệu được VẬT CHẤT HOÁ (materialized) để:
     - Dashboard học sinh cá nhân load nhanh (1 read thay vì quét toàn
       bộ quiz_results).
     - Tính "học sinh chưa làm bài" / "học sinh cần hỗ trợ" cho
       Điều phối đào tạo mà không phải quét lại toàn bộ lịch sử mỗi lần.

   @typedef {Object} LearningProgress
   @property {string} studentKey
   @property {string} mssv
   @property {string} studentName
   @property {string} studentClass
   @property {number} testsCompleted
   @property {number} avgScore
   @property {number} bestScore
   @property {number} currentStreakDays
   @property {number} totalXp            liên kết với js/gamification.js đã có sẵn
   @property {string} status             "on_track" | "needs_support" | "not_started"
   @property {firebase.firestore.Timestamp} lastActivityAt
   ============================================================ */
(function (global) {
  'use strict';

  const COLLECTION_NAME = 'learning_progress';

  const STATUS = Object.freeze({
    ON_TRACK: 'on_track',
    NEEDS_SUPPORT: 'needs_support',
    NOT_STARTED: 'not_started',
  });

  /**
   * Suy ra trạng thái học sinh — dùng cho mục "Học sinh cần hỗ trợ" của
   * Điều phối đào tạo. Ngưỡng có thể chỉnh trong system-config sau này.
   */
  function deriveStatus({ testsCompleted, avgScore }, { supportThreshold = 60 } = {}) {
    if (!testsCompleted) return STATUS.NOT_STARTED;
    if (typeof avgScore === 'number' && avgScore < supportThreshold) return STATUS.NEEDS_SUPPORT;
    return STATUS.ON_TRACK;
  }

  global.EduModels = global.EduModels || {};
  global.EduModels.LearningProgress = { COLLECTION_NAME, STATUS, deriveStatus };
})(window);
