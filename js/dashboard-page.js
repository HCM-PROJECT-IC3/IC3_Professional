/* ============================================================
   ic3-dashboard.html — page-specific init (tách ra khỏi HTML)
   ============================================================ */

window.EDU_ALLOWED_ROLES = ['admin', 'teacher', 'coordinator', 'teaching_coordinator'];

window.addEventListener('edu:ready', ({ detail }) => {
  const { user, profile } = detail;
  document.getElementById('userChipName').textContent = profile.name || user.email;
  document.getElementById('userChipRole').textContent = EduAuth.ROLE_LABEL[profile.role] || profile.role;

  // Ảnh đại diện đã tải lên ở "Trang Social Media" (portfolio.html § PfProfile) lưu
  // trong collection RIÊNG "gvlab_profiles" (KHÔNG phải "users" — cố
  // tình tách để không đụng hồ sơ gốc dùng chung toàn nền tảng), nên
  // trước đây avatar chip ở đây luôn là icon mặc định dù đã đổi ảnh bên
  // Trang Social Media. Đọc thêm 1 lần đúng document của user hiện tại (1 lượt đọc,
  // không phải listener sống) để hiện ảnh thật nếu có; còn không thì
  // giữ nguyên icon mặc định như cũ.
  if (window.EduFirebase && window.EduFirebase.db) {
    window.EduFirebase.db.collection('gvlab_profiles').doc(user.uid).get()
      .then((snap) => {
        const avatar = snap.exists ? snap.data().avatar : null;
        if (!avatar) return;
        const avatarBox = document.querySelector('#userChip .user-avatar');
        if (avatarBox) avatarBox.innerHTML = `<img src="${avatar}" alt="">`;
      })
      .catch((err) => console.warn('[IC3 Dashboard] Không tải được ảnh đại diện Trang Social Media:', err.message));
  }

  const role = profile.role;

  // ============================================================
  // Ma trận hiển thị menu theo role (đúng yêu cầu: mỗi role chỉ thấy
  // ĐÚNG các mục thuộc về mình — ẩn/hiện ở đây chỉ là lớp UX; quyền
  // thật sự vẫn do EDU_ALLOWED_ROLES của từng trang đích + firestore.rules
  // thực thi, xem js/core/rbac.js để biết thêm chi tiết nguyên tắc này).
  //
  //   admin                : toàn quyền — thấy tất cả các mục.
  //   teacher              : CHỈ "Bộ đề của tôi" + "Dashboard của tôi".
  //   coordinator          : "🧭 Điều phối đào tạo" — CHỈ "Báo cáo kết quả" +
  //                          "Danh sách học sinh" + "Dashboard" (roster/điểm
  //                          số/điểm danh học sinh) — KHÔNG thấy "Lịch giảng
  //                          dạy" (đó là việc của teaching_coordinator).
  //   teaching_coordinator : "🚗 Điều phối giáo viên" — CHỈ "Lịch giảng dạy"
  //                          (xem TKB/báo cáo/hỗ trợ xăng xe của giáo viên,
  //                          teaching-schedule.html) — KHÔNG đụng gì tới
  //                          roster/điểm số/báo cáo kết quả học sinh, 2 role
  //                          điều phối tách biệt hoàn toàn.
  // ============================================================
  const show = (id, visible) => {
    const el = document.getElementById(id);
    if (el) el.style.display = visible ? 'flex' : 'none';
  };

  show('adminUsersLink', role === 'admin');
  show('imageManagerLink', role === 'admin');
  show('teacherDashboardLink', role === 'admin' || role === 'teacher');
  show('docsSchoolYearLink', role === 'admin' || role === 'teacher');
  show('rosterManagerLink', role === 'admin' || role === 'coordinator');
  // "🚗 Điều phối giáo viên" (teaching_coordinator) được XEM (không sửa)
  // Lịch tuần + TKB lớp + tab "📊 Báo cáo"/"🚗 Hỗ trợ xăng xe" ở
  // teaching-schedule.html — khớp EDU_ALLOWED_ROLES + firestore.rules (chỉ
  // đọc lịch, riêng khoảng cách xăng xe thì được ghi) của trang đó.
  // "🧭 Điều phối đào tạo" (coordinator) CỐ TÌNH không có trong điều kiện
  // này nữa — 2 role điều phối tách biệt hoàn toàn (xem chú thích ở trên).
  show('teachingScheduleLink', role === 'admin' || role === 'teacher' || role === 'teaching_coordinator');
  show('coordinatorDashboardLink', role === 'admin' || role === 'coordinator');
  // Trang Social Media — hiện cho mọi role đăng nhập hợp lệ được vào trang này
  // (không lọc riêng theo role, khác các mục còn lại).
  show('gvLabLink', true);

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

  // "🚗 Điều phối giáo viên": KHÔNG có mục nào trong chính trang SPA này
  // (không navMySets/navReports/navSettings) — toàn bộ việc của role này
  // nằm ở teaching-schedule.html. Mặc định "my-sets" vẫn active sẵn trong
  // HTML (dành cho giáo viên) nên nếu để nguyên, teaching_coordinator sẽ
  // thấy 1 khung trang trống/lỗi vì không có quyền + không có dữ liệu phù
  // hợp — điều hướng thẳng sang trang đích duy nhất họ cần luôn cho gọn.
  if (role === 'teaching_coordinator') {
    window.location.href = 'teaching-schedule.html';
    return;
  }

  document.getElementById('userChip').addEventListener('click', async () => {
    if (confirm('Đăng xuất khỏi EduQuiz?')) {
      await EduAuth.logoutUser();
      window.location.href = 'login.html';
    }
  });
});
