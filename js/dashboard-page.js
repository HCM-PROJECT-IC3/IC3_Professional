/* ============================================================
   ic3-dashboard.html — page-specific init (tách ra khỏi HTML)
   ============================================================ */

window.EDU_ALLOWED_ROLES = ['admin', 'teacher', 'coordinator'];

window.addEventListener('edu:ready', ({ detail }) => {
  const { user, profile } = detail;
  document.getElementById('userChipName').textContent = profile.name || user.email;
  document.getElementById('userChipRole').textContent = EduAuth.ROLE_LABEL[profile.role] || profile.role;
  if (profile.role === 'admin') {
    document.getElementById('adminUsersLink').style.display = 'flex';
  }

  // Trang quản lý danh sách học sinh (roster) — Admin và Điều phối đào
  // tạo (xem js/roster-manager.js, Commit #3 lộ trình LMAP).
  if (profile.role === 'admin' || profile.role === 'coordinator') {
    document.getElementById('rosterManagerLink').style.display = 'flex';
  }

  // Dashboard riêng cho Điều phối đào tạo — 7 KPI, 6 loại biểu đồ, bộ lọc
  // 5 chiều (xem js/coordinator/*.js, Commit #4 lộ trình LMAP).
  if (profile.role === 'admin' || profile.role === 'coordinator') {
    document.getElementById('coordinatorDashboardLink').style.display = 'flex';
  }

  // Điều phối đào tạo (coordinator): chỉ xem Báo cáo kết quả, không có
  // quyền quản lý bộ đề / cài đặt hệ thống → ẩn các mục còn lại và mở
  // thẳng vào tab Báo cáo.
  if (profile.role === 'coordinator') {
    document.querySelector('.nav-item[data-section="my-sets"]')?.style.setProperty('display', 'none');
    document.querySelector('.nav-item[data-section="settings"]')?.style.setProperty('display', 'none');
    document.querySelector('.nav-item[data-section="reports"]')?.click();
  }

  document.getElementById('userChip').addEventListener('click', async () => {
    if (confirm('Đăng xuất khỏi EduQuiz?')) {
      await EduAuth.logoutUser();
      window.location.href = 'login.html';
    }
  });
});
