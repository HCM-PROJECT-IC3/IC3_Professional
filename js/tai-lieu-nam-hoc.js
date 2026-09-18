/* ============================================================
   js/tai-lieu-nam-hoc.js
   tai-lieu-nam-hoc.html — trang chỉ có 1 link mở thẳng thư mục SharePoint
   "Tài liệu bàn giao NH 2026-2027" ở tab mới (link tĩnh, đặt ngay trong
   HTML) — CỐ TÌNH không dùng MSAL/Graph API để liệt kê thư mục con như
   bản trước đó, vì cần thêm 1 bước đăng nhập Microsoft riêng gây khó chịu
   không cần thiết; SharePoint tự xử lý đăng nhập/phân quyền khi mở link.
   ============================================================ */
(function () {
  'use strict';

  // ---- Nút chuyển sáng/tối (đồng hồ mặt trời neumorphism, xem
  // .theme-toggle trong css/roster-manager.css). ----
  (function initThemeToggle() {
    const saved = localStorage.getItem('ic3_theme');
    if (saved) document.documentElement.setAttribute('data-theme', saved);
    const btn = document.getElementById('themeToggle');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      const next = isDark ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('ic3_theme', next);
    });
  })();

  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await EduAuth.logoutUser();
    window.location.href = 'login.html';
  });

  window.addEventListener('edu:ready', ({ detail }) => {
    const { user, profile } = detail;
    document.getElementById('whoami').textContent = `${profile.name || user.email} · ${EduAuth.ROLE_LABEL[profile.role]}`;
  });
})();
