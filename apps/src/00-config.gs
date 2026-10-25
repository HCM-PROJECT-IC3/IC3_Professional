/**
 * IC3_Professional — Backend Apps Script (Google Sheet + Firebase Auth)
 *
 * Backend của dự án chỉ gồm 2 phần: Firebase (tài khoản, roster, lịch dạy) và Apps Script này (bài nộp, kết quả cho dashboard, bản đồ, đẩy dữ liệu
 * lên GitHub). Mọi API đi qua doPost — xem routes_() trong 10-router.gs.
 *
 * MÃ NGUỒN: apps/src/*.gs (mỗi file 1 nhiệm vụ). apps/Code.gs là bản GỘP để dán vào
 * Apps Script editor — tạo bằng `node scripts/build-apps-script.js`, đừng sửa tay.
 *
 * CÁCH DEPLOY:
 *  1. script.google.com → project → dán toàn bộ apps/Code.gs vào Code.gs → Save.
 *  2. Lần đầu (hoặc khi thêm dịch vụ mới): chọn hàm `doGet` → Run → cấp quyền.
 *  3. Deploy → Manage deployments → ✏️ → Version: New version → Deploy (giữ URL).
 *     Tạo mới: Deploy → New deployment → Web app, Execute as: Me, Who has access: Anyone.
 *  4. Project Settings → Script Properties (tuỳ chọn):
 *     - GITHUB_TOKEN: fine-grained token, quyền "Contents: Read and write" trên đúng repo
 *       (dùng cho nút đẩy câu hỏi ở image-manager.html — token chỉ nằm ở đây, không ở
 *       trình duyệt của ai).
 */

// ====== CẤU HÌNH - THAY BẰNG ID THẬT CỦA BẠN ======
const BACKEND_VERSION = '2026-10-26';
const SPREADSHEET_ID_DATA = '16ty8LB6pnk5Xai1VauUAKfMbIaT88ewfNUAhWM0z5ck';      // Sheet chứa HocSinh + KetQua
const SPREADSHEET_ID_REPORT = '16ty8LB6pnk5Xai1VauUAKfMbIaT88ewfNUAhWM0z5ck';    // Sheet chứa báo cáo tổng hợp (có thể trùng với ID trên nếu để chung 1 file, khác tab)

const SHEET_ROSTER = 'HocSinh';   // cột: MSHS | HoTen | Lop | Truong | Email
const SHEET_SCORES = 'KetQua';    // cột: Timestamp | MSHS | HoTen | Lop | BaiThi | DiemSo | ThoiGianLamPhut | TrangThai | ChiTietLoaiCauHoi(JSON)
const SHEET_REPORT_SUMMARY = 'TongHop'; // nơi ghi báo cáo tổng hợp do dashboard yêu cầu xuất

// Tab nhật ký nộp bài (js/googleSheet.js gửi lên) — nguồn kết quả cho dashboard khi
// js/backend-config.js chọn đọc từ Sheet. Cột: xem LOG_HEADERS.
const SHEET_SUBMISSION_LOG = 'NhatKyNopBai';

// Xoay vòng file nhật ký khi quá lớn — xem getSubmissionLogSheet_() / logTab_(). 300.000
// dòng × 16 cột ≈ 4,8 triệu ô (sau khi cắt cột trống — tab mới mặc định 26 cột). Ngoài ra
// còn xoay khi CẢ FILE vượt FILE_CELL_BUDGET (90-utils.gs) vì các tab nhật ký khác ở chung file.
const MAX_LOG_ROWS = 300000;
const LOG_SPREADSHEET_PROP = 'LOG_SPREADSHEET_ID'; // Script Properties: ID file nhật ký đang ghi
const SHEET_LOG_CATALOG = 'DanhMucNhatKy';          // tab ở file chính: danh sách các file nhật ký
const DEDUPE_TTL_SEC = 6 * 60 * 60;                   // CacheService giữ tối đa 6 giờ
const LOG_HISTORY_PROP = 'LOG_SPREADSHEET_HISTORY';  // Script Properties: ID các file nhật ký đã tạo (cũ → mới)
// Cột A..P của tab nhật ký. N (CheDo), O (CauSai — uid câu sai "a,b,c"), P (ChiTiet — JSON
// gọn: sai/bỏ qua, giây làm bài, chương trình/cấp/bài, hết giờ, vi phạm nâng cao) thêm 10/2026 —
// tự ghi tiêu đề nếu tab cũ chưa có. Có P thì Sheet đủ mọi trường của quiz_results.
const LOG_HEADERS = ['SubmissionId', 'HoTen', 'Lop', 'Truong', 'BaiThi', 'Diem', 'SoCauDung',
  'ThoiGianLam', 'SoLanChuyenTab', 'SoLanClick', 'TrangThai', 'ThoiGianNop', 'GhiChu', 'CheDo', 'CauSai', 'ChiTiet'];
const WRONG_MAX_UIDS = 30;     // tối đa số câu sai lưu mỗi bài (khớp js/services/result-submitter.js)
const WRONG_STATS_TOP = 60;    // số câu hay sai nhất trả về cho dashboard

// Xác thực người gọi bằng Firebase ID token (xem 20-auth.gs).
const FIREBASE_PROJECT_ID = 'data-ic3';

// Đọc kết quả cho dashboard (40-results.gs).
const READ_CHUNK_ROWS = 5000;      // đọc Sheet theo khối từ cuối lên
const READ_MAX_SCAN_ROWS = 60000;  // trần số dòng quét mỗi lượt (giữ thời gian chạy vài giây)
const READ_MAX_ROWS = 10000;       // trần số bài trả về mỗi lượt

// Bản đồ (60-maps.gs) — dịch vụ Maps có sẵn của Apps Script, không cần API key/thẻ.
// Tài khoản Gmail thường: ~1.000 lượt geocode/ngày cho CẢ project → giới hạn theo người.
const MAPS_MAX_PER_USER_PER_DAY = 150;

// Đẩy dữ liệu tĩnh lên GitHub (70-github.gs).
const GITHUB_OWNER = 'HCM-PROJECT-IC3';
const GITHUB_REPO = 'IC3_Professional';
const GITHUB_BRANCH = 'main';
const GITHUB_ALLOWED_PREFIXES = ['data/', 'img/']; // chỉ cho ghi dữ liệu tĩnh, không ghi code
const ROSTER_STATIC_PATH = 'data/roster/students-active.json'; // danh sách học sinh ở trang làm bài

// Email nhận cảnh báo khi phát hiện nghi vấn gian lận (status chứa ⚠️) —
// điền email thật của giáo viên/điều phối vào đây (có thể để nhiều email,
// cách nhau bằng dấu phẩy). Để mảng rỗng thì tắt tính năng gửi email,
// dữ liệu vẫn được ghi vào NhatKyNopBai như cũ, chỉ là không có email.
const ALERT_EMAILS = []; // vd: ['giaovien@example.com', 'dieuphoi@example.com']

// Giới hạn số email cảnh báo gửi tối đa trong 1 giờ, để không bao giờ
// chạm quota MailApp miễn phí (100/ngày với Gmail cá nhân) dù có sự cố
// khiến hàng loạt học sinh bị gắn cờ nghi vấn cùng lúc (vd. bug ở
// integrity-check phía client). Dùng CacheService (miễn phí, có sẵn
// trong mọi project Apps Script) để đếm, không cần thêm Sheet/DB nào.
const ALERT_EMAIL_MAX_PER_HOUR = 15;
