/* ============================================================
   ic3-dashboard.html — page-specific init (tách ra khỏi HTML)
   ============================================================ */

window.EDU_ALLOWED_ROLES = ['admin', 'teacher', 'coordinator'];

window.addEventListener('edu:ready', ({ detail }) => {
  const { user, profile } = detail;
  document.getElementById('userChipName').textContent = profile.name || user.email;
  document.getElementById('userChipRole').textContent = EduAuth.ROLE_LABEL[profile.role] || profile.role;

  const role = profile.role;

  // ============================================================
  // Ma trận hiển thị menu theo role (đúng yêu cầu: mỗi role chỉ thấy
  // ĐÚNG các mục thuộc về mình — ẩn/hiện ở đây chỉ là lớp UX; quyền
  // thật sự vẫn do EDU_ALLOWED_ROLES của từng trang đích + firestore.rules
  // thực thi, xem js/core/rbac.js để biết thêm chi tiết nguyên tắc này).
  //
  //   admin       : toàn quyền — thấy tất cả các mục.
  //   teacher     : CHỈ "Bộ đề của tôi" + "Dashboard của tôi".
  //   coordinator : CHỈ "Báo cáo kết quả" + "Danh sách học sinh" + "Dashboard".
  // ============================================================
  const show = (id, visible) => {
    const el = document.getElementById(id);
    if (el) el.style.display = visible ? 'flex' : 'none';
  };

  show('adminUsersLink', role === 'admin');
  show('imageManagerLink', role === 'admin');
  show('teacherDashboardLink', role === 'admin' || role === 'teacher');
  show('rosterManagerLink', role === 'admin' || role === 'coordinator');
  show('coordinatorDashboardLink', role === 'admin' || role === 'coordinator');

  // 3 mục trong chính trang này (SPA, không phải link riêng): Bộ đề của tôi
  // / Báo cáo kết quả / Cài đặt hệ thống.
  show('navMySets', role === 'admin' || role === 'teacher');
  show('navReports', role === 'admin' || role === 'coordinator');
  show('navSettings', role === 'admin');

  // Giáo viên: mặc định vào thẳng "Bộ đề của tôi" (đã active sẵn trong HTML) —
  // không cần làm gì thêm vì đây cũng là mục duy nhất giáo viên còn thấy
  // cùng "Dashboard của tôi" (link riêng, không phải section trong trang này).

  // Điều phối đào tạo: không có "Bộ đề của tôi"/"Cài đặt hệ thống" → mở
  // thẳng vào tab Báo cáo kết quả.
  if (role === 'coordinator') {
    document.getElementById('navReports')?.click();
  }

  document.getElementById('userChip').addEventListener('click', async () => {
    if (confirm('Đăng xuất khỏi EduQuiz?')) {
      await EduAuth.logoutUser();
      window.location.href = 'login.html';
    }
  });
});
