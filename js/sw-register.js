/* ============================================================
   js/sw-register.js — đăng ký sw.js (lưu đệm file tĩnh, chống lag khi
   mạng trường chập chờn — xem chú thích đầu sw.js). Đăng ký SAU khi trang
   tải xong để không tranh băng thông lúc mở trang. Trình duyệt không hỗ
   trợ / mở bằng file:// → bỏ qua, trang vẫn chạy bình thường.
   ============================================================ */
(function () {
  'use strict';
  if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('sw.js', { scope: './' }).catch(function (err) {
      console.warn('[EduQuiz] Không đăng ký được Service Worker (trang vẫn chạy bình thường):', err && err.message);
    });
  });
})();
