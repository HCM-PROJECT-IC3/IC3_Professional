/* ============================================================
   js/services/activity-log-service.js
   Tự động ghi nhận "login" vào activity_logs mỗi khi 1 trang có
   auth-guard.js xác thực xong (sự kiện "edu:ready" ĐÃ tồn tại sẵn
   trong js/auth-guard.js — file này chỉ LẮNG NGHE, không sửa gì cả).

   AN TOÀN TUYỆT ĐỐI: mọi lỗi đều bị nuốt (try/catch) — nếu
   activity_logs chưa được tạo quyền trong firestore.rules, tính năng
   ghi log sẽ âm thầm bỏ qua, KHÔNG làm hỏng luồng đăng nhập/hiển thị
   trang hiện tại.

   CÁCH BẬT: thêm 1 dòng <script src="js/services/activity-log-service.js">
   vào các trang quản trị, SAU js/auth-guard.js. Trang index.html (học
   sinh làm bài, không có auth-guard) không cần và không nên nạp file
   này ở bước hiện tại.
   ============================================================ */
(function (global) {
  'use strict';

  window.addEventListener('edu:ready', ({ detail }) => {
    try {
      const { user, profile } = detail;
      if (!global.EduRepositories || !global.EduRepositories.activityLog) return; // repo chưa được nạp trên trang này
      global.EduRepositories.activityLog.record({
        uid: user.uid,
        role: profile.role,
        actorName: profile.name || user.email,
        action: global.EduModels.ActivityLog.ACTIONS.LOGIN,
      });
    } catch (err) {
      console.warn('[EduActivityLog] Bỏ qua ghi log đăng nhập:', err.message);
    }
  });

  /** Gọi thủ công cho các hành động khác (export, xem chi tiết học sinh...). */
  function log(action, { targetId, meta } = {}) {
    try {
      const profile = global.EduCurrentProfile;
      const user = global.EduCurrentUser;
      if (!global.EduRepositories || !global.EduRepositories.activityLog || !profile) return;
      global.EduRepositories.activityLog.record({
        uid: user ? user.uid : null,
        role: profile.role,
        actorName: profile.name || (user && user.email),
        action, targetId, meta,
      });
    } catch (err) {
      console.warn('[EduActivityLog] Bỏ qua ghi log:', err.message);
    }
  }

  global.EduActivityLog = { log };
})(window);
