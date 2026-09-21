/* ============================================================
   js/app-version.js
   Ghi phiên bản đang chạy ra console — giúp xác định NHANH học sinh
   đang thấy bản deploy nào khi họ báo lỗi (đối chiếu với file VERSION
   ở gốc repo + lịch sử git tag), không cần đoán mò dựa trên thời điểm
   báo lỗi. Không ảnh hưởng gì tới trang nếu fetch thất bại (best-effort,
   thuần thông tin debug).
   ============================================================ */
(function () {
  'use strict';
  fetch('VERSION', { cache: 'no-store' })
    .then(function (res) { return res.ok ? res.text() : null; })
    .then(function (text) {
      if (!text) return;
      var firstLine = text.split('\n')[0].trim();
      console.info('%c[EduQuiz] Phiên bản đang chạy: ' + firstLine, 'color:#4f6bff;font-weight:bold');
      window.APP_VERSION = firstLine;
    })
    .catch(function () { /* không quan trọng — chỉ là thông tin debug */ });
})();
