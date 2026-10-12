// ====== NHẬT KÝ HOẠT ĐỘNG (Audit log của Admin) ======
// Router: logActivity (mọi tài khoản quản trị đã đăng nhập). Ghi vào tab NhatKyHoatDong.
// Trước đây thiết kế ghi Firestore activity_logs nhưng phải TẮT vì mỗi lần giáo viên mở
// dashboard = 1 lượt ghi Firebase. Ở Sheet: 0 lượt Firebase, admin lọc/xem ngay trong Sheet.
// Ai làm gì lấy từ tài khoản đã xác thực (who), không tin tên/vai trò web gửi lên.

const SHEET_ACTIVITY_LOG = 'NhatKyHoatDong';
const ACTIVITY_HEADERS = ['ThoiGian', 'Uid', 'VaiTro', 'HanhDong', 'DoiTuong', 'ChiTiet', 'Trang'];
const ACTIVITY_ACTIONS = ['login', 'logout', 'view_student_detail', 'export_excel', 'export_pdf',
  'create_exam', 'assign_exam', 'update_roster', 'publish_roster', 'publish_questions', 'delete_results'];

/** p: { activity, targetId?, meta?, page? } */
function logActivity_(p, who) {
  const activity = String(p.activity || '');
  if (ACTIVITY_ACTIONS.indexOf(activity) === -1) throw appError_('invalid-argument', 'Hành động không hợp lệ: ' + activity);
  const sheet = ensureTab_(SPREADSHEET_ID_REPORT, SHEET_ACTIVITY_LOG, ACTIVITY_HEADERS);
  // appendRow tự an toàn khi nhiều lượt gọi cùng lúc; không cần khoá (không chống trùng).
  sheet.appendRow([
    new Date(), who.uid, who.role, activity,
    asText_(String(p.targetId || '').slice(0, 200)),
    asText_(JSON.stringify(p.meta || {}).slice(0, 2000)),
    asText_(String(p.page || '').slice(0, 100)),
  ]);
  return { logged: true };
}

/** Ghi nhật ký từ PHÍA SERVER cho thao tác nhạy cảm (đẩy GitHub, xoá bài) — web không bỏ qua được.
 *  Lỗi ghi nhật ký không được làm hỏng thao tác chính. */
function auditServer_(activity, who, meta) {
  try {
    logActivity_({ activity: activity, meta: meta, page: 'apps-script' }, who);
  } catch (e) {
    console.warn('Không ghi được nhật ký ' + activity + ': ' + e);
  }
}
