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

  // Mỗi dòng nhật ký = 1 lượt chạy Apps Script (logActivity; tối đa 30 lượt chạy cùng lúc
  // cho cả hệ thống). Ghi lặp không thêm thông tin nên gộp lại:
  // - "login": 1 lần / LOGIN_EVERY_MS / tài khoản / máy (trước: mỗi tab mới 1 lần).
  // - cùng hành động + cùng đối tượng (vd mở lại chi tiết 1 học sinh): 1 lần / REPEAT_MS.
  const LOGIN_EVERY_MS = 6 * 60 * 60 * 1000;
  const REPEAT_MS = 30 * 60 * 1000;
  const SEEN_KEY = 'eduActivitySeen';

  /** true nếu `key` đã ghi trong `windowMs` gần đây (và đánh dấu lần này). Chung mọi tab (localStorage). */
  let seenMem = {};
  function seenRecently(key, windowMs) {
    const now = Date.now();
    let seen = seenMem;
    try { seen = JSON.parse(localStorage.getItem(SEEN_KEY)) || {}; } catch (e) { /* dùng bộ nhớ tab */ }
    Object.keys(seen).forEach((k) => { if (now - seen[k] > LOGIN_EVERY_MS) delete seen[k]; });
    if (seen[key] && now - seen[key] < windowMs) return true;
    seen[key] = now;
    seenMem = seen;
    try { localStorage.setItem(SEEN_KEY, JSON.stringify(seen)); } catch (e) { /* bỏ qua */ }
    return false;
  }

  window.addEventListener('edu:ready', ({ detail }) => {
    try {
      const { user, profile } = detail;
      if (!global.EduRepositories || !global.EduRepositories.activityLog) return; // repo chưa được nạp trên trang này
      // 1 dòng "login" mỗi LOGIN_EVERY_MS trên máy này (không phải mỗi tab / F5 / chuyển trang quản trị).
      if (seenRecently('login:' + user.uid, LOGIN_EVERY_MS)) return;
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
      // Chỉ gộp hành động XEM (mở lại chi tiết cùng 1 học sinh trong REPEAT_MS). Hành động ghi
      // dữ liệu (roster-manager: thêm/sửa/xoá, xuất file...) luôn ghi đủ.
      if (action === global.EduModels.ActivityLog.ACTIONS.VIEW_STUDENT_DETAIL &&
        seenRecently((user ? user.uid : '') + '|' + action + '|' + targetId, REPEAT_MS)) return;
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
