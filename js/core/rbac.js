/* ============================================================
   js/core/rbac.js
   Bảng phân quyền (RBAC) tập trung cho hệ thống LMAP.

   KHÔNG thay thế js/auth-guard.js (vẫn dùng để chặn truy cập trang
   theo EDU_ALLOWED_ROLES như cũ). File này bổ sung một tầng phân quyền
   CHI TIẾT HƠN theo từng HÀNH ĐỘNG (permission), dùng để:
     - Ẩn/hiện nút bấm, cột dữ liệu theo quyền.
     - Kiểm tra phía client trước khi gọi repository/service (UX).
     - Dùng chung 1 nguồn "sự thật" giữa mọi module mới (coordinator,
       teacher-analytics, export...) thay vì rải if/else role khắp nơi.

   LƯU Ý BẢO MẬT: đây chỉ là lớp kiểm tra ở CLIENT để có UX tốt.
   Quyền thật sự vẫn phải được Firestore Security Rules (firestore.rules)
   thực thi ở server — client-side RBAC không bao giờ được xem là đủ.

   Cách dùng:
     <script src="js/core/rbac.js"></script>   (nạp sau js/auth.js)
     ...
     if (EduRBAC.can(profile.role, 'coordinator.viewDashboard')) { ... }
   ============================================================ */
(function (global) {
  'use strict';

  const ROLES = Object.freeze({
    ADMIN: 'admin',
    COORDINATOR: 'coordinator',
    TEACHER: 'teacher',
    STUDENT: 'student',
  });

  /**
   * Ma trận quyền: permission -> danh sách role được phép.
   * Đặt tên permission theo dạng "module.action" cho dễ tra cứu.
   */
  const PERMISSIONS = {
    // ---- Admin: toàn quyền hệ thống ----
    'admin.manageUsers':        [ROLES.ADMIN],
    'admin.manageQuestionBank': [ROLES.ADMIN],
    'admin.manageExams':        [ROLES.ADMIN],
    'admin.manageClasses':      [ROLES.ADMIN],
    'admin.viewAuditLog':       [ROLES.ADMIN],
    'admin.systemConfig':       [ROLES.ADMIN],
    'admin.viewGlobalDashboard':[ROLES.ADMIN],

    // ---- Điều phối đào tạo (coordinator) ----
    'coordinator.viewDashboard':     [ROLES.ADMIN, ROLES.COORDINATOR],
    'coordinator.viewStudentList':   [ROLES.ADMIN, ROLES.COORDINATOR],
    'coordinator.viewStudentDetail': [ROLES.ADMIN, ROLES.COORDINATOR],
    'coordinator.manageRoster':      [ROLES.ADMIN, ROLES.COORDINATOR],
    'coordinator.exportExcel':       [ROLES.ADMIN, ROLES.COORDINATOR],
    'coordinator.exportPdf':         [ROLES.ADMIN, ROLES.COORDINATOR],

    // ---- Giáo viên ----
    'teacher.viewOwnDashboard':   [ROLES.ADMIN, ROLES.TEACHER],
    'teacher.manageOwnClass':     [ROLES.ADMIN, ROLES.TEACHER],
    'teacher.createExam':         [ROLES.ADMIN, ROLES.TEACHER],
    'teacher.assignExam':         [ROLES.ADMIN, ROLES.TEACHER],
    'teacher.viewStudentAnswers': [ROLES.ADMIN, ROLES.TEACHER],
    'teacher.viewCorrectAnswers': [ROLES.ADMIN, ROLES.TEACHER],
    'teacher.exportExcel':        [ROLES.ADMIN, ROLES.TEACHER],
    'teacher.exportPdf':          [ROLES.ADMIN, ROLES.TEACHER],
    'teacher.printScoreSheet':    [ROLES.ADMIN, ROLES.TEACHER],

    // ---- Học sinh ----
    'student.viewOwnDashboard':  [ROLES.ADMIN, ROLES.TEACHER, ROLES.COORDINATOR, ROLES.STUDENT],
    'student.viewOwnHistory':    [ROLES.ADMIN, ROLES.TEACHER, ROLES.COORDINATOR, ROLES.STUDENT],

    // ---- Báo cáo chung (đã có trong firestore.rules hiện tại: canViewReports) ----
    'reports.view': [ROLES.ADMIN, ROLES.TEACHER, ROLES.COORDINATOR],
  };

  /** Kiểm tra role có quyền thực hiện permission hay không. */
  function can(role, permission) {
    const allowed = PERMISSIONS[permission];
    if (!allowed) {
      console.warn('[EduRBAC] Permission không tồn tại trong ma trận:', permission);
      return false;
    }
    return allowed.includes(role);
  }

  /** Trả về danh sách permission mà 1 role đang có (phục vụ debug/UI). */
  function permissionsOf(role) {
    return Object.keys(PERMISSIONS).filter((p) => PERMISSIONS[p].includes(role));
  }

  /** Helper: ẩn/hiện 1 phần tử DOM theo quyền (thêm/xoá thuộc tính hidden). */
  function guardElement(el, role, permission) {
    if (!el) return;
    el.hidden = !can(role, permission);
  }

  global.EduRBAC = { ROLES, PERMISSIONS, can, permissionsOf, guardElement };
})(window);
