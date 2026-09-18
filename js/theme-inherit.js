/* ============================================================
   js/theme-inherit.js
   Dùng cho các trang MINI-GAME/GIẢ LẬP nhúng qua modal/iframe
   (js/game-modal.js) — KHÔNG có topbar/nút chuyển sáng-tối RIÊNG (bấm
   nút trong 1 khung nhúng nhỏ, tách biệt với trang cha, sẽ tạo 2 nút
   chuyển theme trùng lặp gây rối chứ không giúp gì). Thay vào đó, trang
   nhúng tự ĐỌC theme đã lưu từ trang cha (localStorage "ic3_theme", CÙNG
   key mà mọi trang khác trong app dùng — xem js/dashboard.js/js/login.js/
   ...) rồi áp data-theme cho ĐÚNG html của chính khung nhúng đó, để màu
   sắc luôn khớp với chế độ sáng/tối người dùng đang chọn ở trang cha,
   không cần thêm nút riêng.
   Nạp file này CÀNG SỚM CÀNG TỐT trong <head> (ngay sau css/theme.css) để
   tránh "nháy" 1 khung sáng rồi mới chuyển tối.
   ============================================================ */
(function () {
  'use strict';
  try {
    var saved = localStorage.getItem('ic3_theme');
    if (saved === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
  } catch (err) { /* localStorage bị chặn (chế độ ẩn danh...) — bỏ qua, giữ mặc định sáng */ }
})();
