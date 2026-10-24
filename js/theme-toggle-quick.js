/* ============================================================
   js/theme-toggle-quick.js — nút chuyển sáng/tối cho trang mini-game /
   giả lập (trước chép inline vào 12 trang HTML). Đọc/ghi localStorage
   "ic3_theme" — cùng khoá với mọi trang khác (xem js/theme-inherit.js).
   Nạp NGAY SAU <button id="themeToggleQuick"> (không defer) để áp theme đã
   lưu trước khi trang vẽ xong, tránh nháy sáng→tối.
   Kiểu dáng: css/theme-toggle-quick.css.
   ============================================================ */
(function () {
  try {
    var saved = localStorage.getItem('ic3_theme');
    if (saved === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
  } catch (e) {}
  var btn = document.getElementById('themeToggleQuick');
  if (!btn) return;
  btn.addEventListener('click', function () {
    var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    var next = isDark ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('ic3_theme', next); } catch (e) {}
  });
})();
