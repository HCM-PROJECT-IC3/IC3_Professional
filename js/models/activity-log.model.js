/* ============================================================
   js/models/activity-log.model.js
   Model ActivityLog — collection MỚI "activity_logs".
   Phục vụ mục "Nhật ký hoạt động (Audit Log)" của Admin, và "Lịch sử
   đăng nhập" trong trang chi tiết học sinh của Điều phối đào tạo.

   @typedef {Object} ActivityLog
   @property {string} id
   @property {string|null} uid       null nếu là học sinh (không đăng nhập Auth)
   @property {string} role           "admin"|"teacher"|"coordinator"|"student"|"anonymous"
   @property {string} actorName
   @property {string} action         vd. "login" | "logout" | "export_excel" | "view_student_detail"
   @property {string} [targetId]     id đối tượng bị tác động (vd. resultId, studentKey)
   @property {Object} [meta]         dữ liệu phụ tuỳ action (giữ nhỏ gọn, không lưu dữ liệu nhạy cảm)
   @property {firebase.firestore.Timestamp} createdAt
   ============================================================ */
(function (global) {
  'use strict';

  const COLLECTION_NAME = 'activity_logs';

  const ACTIONS = Object.freeze({
    LOGIN: 'login',
    LOGOUT: 'logout',
    VIEW_STUDENT_DETAIL: 'view_student_detail',
    EXPORT_EXCEL: 'export_excel',
    EXPORT_PDF: 'export_pdf',
    CREATE_EXAM: 'create_exam',
    ASSIGN_EXAM: 'assign_exam',
    UPDATE_ROSTER: 'update_roster',
  });

  function build({ uid, role, actorName, action, targetId, meta }) {
    return {
      uid: uid || null,
      role: role || 'anonymous',
      actorName: actorName || 'Ẩn danh',
      action,
      targetId: targetId || null,
      meta: meta || {},
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    };
  }

  global.EduModels = global.EduModels || {};
  global.EduModels.ActivityLog = { COLLECTION_NAME, ACTIONS, build };
})(window);
