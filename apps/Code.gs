// ⚠️ FILE TẠO TỰ ĐỘNG từ apps/src/*.gs — đừng sửa tay ở đây.
// Sửa file nguồn tương ứng rồi chạy: node scripts/build-apps-script.js
// Thứ tự: 00-config.gs, 10-router.gs, 20-auth.gs, 30-submissions.gs, 35-mos.gs, 40-results.gs, 45-activity.gs, 50-reports.gs, 60-maps.gs, 70-github.gs, 80-sheet-setup.gs, 90-utils.gs

// ──────────────── 00-config.gs ────────────────
/**
 * IC3_Professional — Backend Apps Script (Google Sheet + Firebase Auth)
 *
 * Backend của dự án chỉ gồm 2 phần: Firebase (tài khoản, roster, lịch dạy, phòng thi
 * trực tiếp) và Apps Script này (bài nộp, kết quả cho dashboard, bản đồ, đẩy dữ liệu
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
const BACKEND_VERSION = '2026-10-12';
const SPREADSHEET_ID_DATA = '16ty8LB6pnk5Xai1VauUAKfMbIaT88ewfNUAhWM0z5ck';      // Sheet chứa HocSinh + KetQua
const SPREADSHEET_ID_REPORT = '16ty8LB6pnk5Xai1VauUAKfMbIaT88ewfNUAhWM0z5ck';    // Sheet chứa báo cáo tổng hợp (có thể trùng với ID trên nếu để chung 1 file, khác tab)

const SHEET_ROSTER = 'HocSinh';   // cột: MSHS | HoTen | Lop | Truong | Email
const SHEET_SCORES = 'KetQua';    // cột: Timestamp | MSHS | HoTen | Lop | BaiThi | DiemSo | ThoiGianLamPhut | TrangThai | ChiTietLoaiCauHoi(JSON)
const SHEET_REPORT_SUMMARY = 'TongHop'; // nơi ghi báo cáo tổng hợp do dashboard yêu cầu xuất

// Tab nhật ký nộp bài (js/googleSheet.js gửi lên) — nguồn kết quả cho dashboard khi
// js/backend-config.js chọn đọc từ Sheet. Cột: xem LOG_HEADERS.
const SHEET_SUBMISSION_LOG = 'NhatKyNopBai';

// Xoay vòng file nhật ký khi quá lớn — xem getSubmissionLogSheet_(). 300.000 dòng × 14
// cột ≈ 4,2 triệu ô: còn xa trần 10 triệu ô/file, và file nhỏ thì appendRow vẫn nhanh.
const MAX_LOG_ROWS = 300000;
const LOG_SPREADSHEET_PROP = 'LOG_SPREADSHEET_ID'; // Script Properties: ID file nhật ký đang ghi
const SHEET_LOG_CATALOG = 'DanhMucNhatKy';          // tab ở file chính: danh sách các file nhật ký
const DEDUPE_TTL_SEC = 6 * 60 * 60;                   // CacheService giữ tối đa 6 giờ
const LOG_HISTORY_PROP = 'LOG_SPREADSHEET_HISTORY';  // Script Properties: ID các file nhật ký đã tạo (cũ → mới)
// Cột A..N của tab nhật ký. N (CheDo) thêm 10/2026 — tự ghi tiêu đề nếu tab cũ chưa có.
const LOG_HEADERS = ['SubmissionId', 'HoTen', 'Lop', 'Truong', 'BaiThi', 'Diem', 'SoCauDung',
  'ThoiGianLam', 'SoLanChuyenTab', 'SoLanClick', 'TrangThai', 'ThoiGianNop', 'GhiChu', 'CheDo'];

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

// ──────────────── 10-router.gs ────────────────
// ====== ROUTER ======
// Mọi API đi qua doPost với body JSON { action, idToken?, ... } (Content-Type text/plain
// để trình duyệt không gửi preflight — Apps Script không xử lý OPTIONS).
// roles = null: công khai (chỉ submitExam / mosSubmit — học sinh không đăng nhập). Còn lại bắt buộc
// Firebase ID token và vai trò nằm trong danh sách (xem requireRole_ trong 20-auth.gs).

const ROLES_RESULTS = ['admin', 'coordinator', 'teacher'];             // giống quyền đọc quiz_results
const ROLES_MANAGE = ['admin', 'coordinator'];                         // xoá bài, roster, báo cáo
const ROLES_MAPS = ['admin', 'teaching_coordinator', 'teacher', 'coordinator'];
const ROLES_ADMIN = ['admin'];
const ROLES_STAFF = ['admin', 'coordinator', 'teaching_coordinator', 'teacher']; // mọi tài khoản quản trị

// Hàm (không phải hằng) để không phụ thuộc thứ tự nạp file khi dán thành nhiều file .gs.
function routes_() {
  return {
    ping:          { roles: null,          handler: function () { return { version: BACKEND_VERSION }; } },
    submitExam:    { roles: null,          handler: function (p) { return writeSubmissionLog_(p.payload); } },
    mosSubmit:     { roles: null,          handler: function (p) { return writeMosLog_(p.payload); } },
    listResults:   { roles: ROLES_RESULTS, handler: listResults_ },
    deleteResults: { roles: ROLES_MANAGE,  handler: deleteResults_ },
    getRoster:     { roles: ROLES_MANAGE,  handler: function (p, who) { return getRoster_(p.lop, who); } },
    getScores:     { roles: ROLES_MANAGE,  handler: function (p, who) { return getScores_(p.lop, p.baiThi, who); } },
    getDashboard:  { roles: ROLES_MANAGE,  handler: function (p, who) { return buildDashboardPayload_(p.lop, who); } },
    writeReport:   { roles: ROLES_MANAGE,  handler: function (p) { return writeSummaryReport_(p.report); } },
    mapDistance:   { roles: ROLES_MAPS,    handler: mapDistance_ },
    githubReadFile:{ roles: ROLES_ADMIN,   handler: githubReadFile_ },
    githubPublish: { roles: ROLES_ADMIN,   handler: githubPublish_ },
    publishRoster: { roles: ROLES_ADMIN,   handler: publishRoster_ },
    logActivity:   { roles: ROLES_STAFF,   handler: logActivity_ },
  };
}

/**
 * GET chỉ còn kiểm tra sống (mở URL Web App trên trình duyệt). Trước đây getRoster /
 * getScores / getDashboard chạy bằng GET KHÔNG cần đăng nhập — ai có URL đều đọc được
 * danh sách học sinh (kể cả email) và điểm. Nay chuyển sang doPost + đăng nhập.
 */
function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || '';
  if (action && action !== 'ping') {
    return jsonOutput_({ ok: false, code: 'moved', error: 'API "' + action + '" chỉ nhận POST kèm đăng nhập.' });
  }
  return jsonOutput_({ ok: true, data: { service: 'IC3 Apps Script', version: BACKEND_VERSION } });
}

function doPost(e) {
  let payload;
  try {
    payload = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonOutput_({ ok: false, code: 'invalid-argument', error: 'Payload không hợp lệ: ' + err });
  }
  return jsonOutput_(handleRequest_(payload || {}));
}

/** Tách khỏi doPost để chạy thử trong editor/test mà không cần Web App. */
function handleRequest_(payload) {
  const route = routes_()[payload.action || ''];
  if (!route) return { ok: false, code: 'not-found', error: 'Không rõ action: ' + payload.action };
  try {
    const who = route.roles ? requireRole_(authenticate_(payload.idToken), route.roles) : null;
    return { ok: true, data: route.handler(payload, who) };
  } catch (err) {
    // err.code (nếu có) giúp web phân biệt lỗi "gửi lại vô ích" với lỗi tạm thời.
    return { ok: false, code: (err && err.code) || 'internal', error: String((err && err.message) || err) };
  }
}

/** Lỗi kèm mã cho web (vd 'permission-denied', 'invalid-argument', 'conflict'). */
function appError_(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

// ──────────────── 20-auth.gs ────────────────
// ====== XÁC THỰC + PHÂN QUYỀN (Firebase ID token) ======
//
// Web gửi kèm Firebase ID token của người đang đăng nhập. Script dùng CHÍNH token đó đọc
// hồ sơ users/{uid} qua Firestore REST: Firestore chỉ trả về khi token thật, còn hạn và
// đúng chủ hồ sơ (firestore.rules) → vừa xác thực vừa biết vai trò/trường. Kết quả giữ
// trong CacheService tới khi token hết hạn (≤ 1 giờ) → ~1 lượt đọc Firebase/giờ/người.
// Lưu ý: nếu bật Enforce App Check cho Firestore, lượt đọc REST này bị chặn.

/**
 * @returns {{uid:string, role:string, approved:boolean, schools:(string[]|null)}}
 *   schools = null: xem mọi trường (admin).
 */
function authenticate_(idToken) {
  if (!idToken || typeof idToken !== 'string') throw appError_('unauthenticated', 'Chưa đăng nhập.');
  const cache = CacheService.getScriptCache();
  const key = 'auth2:' + Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, idToken));
  const hit = cache.get(key);
  if (hit) return JSON.parse(hit);

  // Đọc nhanh phần thân token (CHƯA tin) chỉ để lấy uid/hạn — Firestore xác thực thật ở dưới.
  let claims;
  try {
    claims = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(idToken.split('.')[1])).getDataAsString());
  } catch (e) {
    throw appError_('unauthenticated', 'Phiên đăng nhập không hợp lệ.');
  }
  const uid = claims.user_id || claims.sub;
  const expSec = Number(claims.exp) || 0;
  if (!uid || claims.aud !== FIREBASE_PROJECT_ID || expSec * 1000 < Date.now()) {
    throw appError_('unauthenticated', 'Phiên đăng nhập đã hết hạn — tải lại trang.');
  }

  const res = UrlFetchApp.fetch(
    'https://firestore.googleapis.com/v1/projects/' + FIREBASE_PROJECT_ID +
    '/databases/(default)/documents/users/' + encodeURIComponent(uid),
    { headers: { Authorization: 'Bearer ' + idToken }, muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) {
    throw appError_('unauthenticated', 'Không xác thực được tài khoản (mã ' + res.getResponseCode() + ').');
  }
  const f = (JSON.parse(res.getContentText()).fields) || {};
  const role = (f.role && f.role.stringValue) || '';
  const schools = ((f.schools && f.schools.arrayValue && f.schools.arrayValue.values) || [])
    .map(function (v) { return v.stringValue; }).filter(Boolean);
  const who = {
    uid: uid,
    role: role,
    approved: !!(f.approved && f.approved.booleanValue),
    schools: role === 'admin' ? null : schools,
  };

  const ttl = Math.min(3600, Math.floor(expSec - Date.now() / 1000) - 60);
  if (ttl > 60) cache.put(key, JSON.stringify(who), ttl);
  return who;
}

/** Chặn nếu vai trò không nằm trong danh sách; giáo viên phải được admin duyệt. */
function requireRole_(who, roles) {
  if (roles.indexOf(who.role) === -1 || (who.role === 'teacher' && !who.approved)) {
    throw appError_('permission-denied', 'Tài khoản không có quyền dùng chức năng này.');
  }
  return who;
}

// ──────────────── 30-submissions.gs ────────────────
// ====== GHI BÀI NỘP (công khai — học sinh không đăng nhập) ======
// Router: action 'submitExam'. Xem js/googleSheet.js (phía web).

/**
 * API này công khai (học sinh không đăng nhập) → chặn dữ liệu rác/quá khổ trước khi
 * ghi. Lỗi mã 'invalid-argument': web bỏ bài khỏi hàng đợi thay vì gửi lại mãi.
 */
function validateSubmission_(p) {
  const bad = function (msg) { throw appError_('invalid-argument', 'Bài nộp không hợp lệ: ' + msg); };
  if (!p || typeof p !== 'object') bad('thiếu dữ liệu');
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(String(p.submissionId || ''))) bad('submissionId');
  [['studentName', 120], ['studentClass', 40], ['studentSchool', 160], ['testName', 300],
    ['correct', 20], ['time', 20], ['status', 300], ['note', 500], ['timestamp', 60]].forEach(function (f) {
    const v = p[f[0]];
    if (v !== undefined && v !== null && (typeof v !== 'string' || v.length > f[1])) bad(f[0]);
  });
  if (!String(p.studentName || '').trim()) bad('studentName');
  const score = Number(p.score);
  if (p.score !== undefined && p.score !== '' && !(score >= 0 && score <= 100)) bad('score');
  ['tabSwitch', 'clickCount'].forEach(function (k) {
    if (p[k] !== undefined && p[k] !== '' && !(Number(p[k]) >= 0 && Number(p[k]) < 1e6)) bad(k);
  });
  if (p.examMode && ['practice', 'test'].indexOf(p.examMode) === -1) bad('examMode');
}

/**
 * Ghi 1 dòng log nộp bài (đối chiếu/dự phòng) — tương đương vai trò của
 * Apps Script cũ mà js/googleSheet.js từng gọi, nhưng chuẩn hoá lại theo
 * router chung của file này. Chống ghi trùng bằng submissionId (khoá lock
 * để tránh 2 request cùng lúc ghi trùng khi mạng chập chờn gửi lại).
 *
 * payload khớp với payload gửi từ js/googleSheet.js:
 * { submissionId, studentName, studentClass, studentSchool, testName,
 *   score, correct, time, tabSwitch, clickCount, status, timestamp, note, examMode }
 */
function writeSubmissionLog_(payload) {
  validateSubmission_(payload);

  // Chống trùng bằng CacheService (giữ mã đã ghi 6 giờ — DEDUPE_TTL_SEC) thay cho đọc
  // lại TOÀN BỘ cột SubmissionId mỗi lượt nộp: cách cũ chậm dần theo số dòng (100.000
  // dòng = đọc 100.000 ô mỗi bài, trong lúc giữ khoá chung) → mùa ôn thi các lượt nộp
  // xếp hàng chờ khoá rồi hết giờ. Gửi lại từ hàng đợi phía học sinh dùng cùng mã
  // (js/services/result-submitter.js) và thường diễn ra trong vài phút - vài giờ.
  const cache = CacheService.getScriptCache();
  const dedupeKey = 'sub:' + String(payload.submissionId).slice(0, 200);
  if (cache.get(dedupeKey)) return { written: false, duplicate: true };

  const lock = LockService.getScriptLock();
  lock.waitLock(20000); // chỉ giữ khoá trong lúc chọn file + appendRow (rất ngắn)

  try {
    if (cache.get(dedupeKey)) return { written: false, duplicate: true }; // request song song vừa ghi xong
    const sheet = getSubmissionLogSheet_();
    // asText_(): giữ NGUYÊN chữ — trước đây Sheet tự đổi "7/24" (số câu đúng), lớp
    // "3/12", thời gian "5:05" thành ngày/giờ, và tên bắt đầu bằng "=" thành công thức.
    sheet.appendRow([
      asText_(payload.submissionId),
      asText_(payload.studentName),
      asText_(payload.studentClass),
      asText_(payload.studentSchool),
      asText_(payload.testName),
      payload.score         ?? '',
      asText_(payload.correct),
      asText_(payload.time),
      payload.tabSwitch     ?? '',
      payload.clickCount    ?? '',
      asText_(payload.status),
      new Date(), // Dùng giờ server (đáng tin cậy hơn giờ máy học sinh) - lưu dạng Date thật để sort/lọc được
      asText_(payload.note),
      asText_(payload.examMode) // N — CheDo: 'practice' (Ôn luyện) | 'test' (Kiểm tra); bài cũ để trống
    ]);
    cache.put(dedupeKey, '1', DEDUPE_TTL_SEC);
  } finally {
    lock.releaseLock();
  }

  // Cảnh báo gian lận qua email — CHỈ khi có dấu ⚠️ trong status (do
  // js/googleSheet.js gắn khi integrity.valid == false), và chỉ với
  // dòng MỚI ghi (bản trùng đã return ở trên). Ngoài khoá để không giữ
  // khoá trong lúc gửi mail; lỗi gửi mail không làm mất dòng log đã ghi.
  if (payload.status && String(payload.status).indexOf('⚠️') !== -1) {
    sendCheatAlertEmail_(payload);
  }

  return { written: true, duplicate: false };
}

/**
 * Tab nhật ký đang nhận bài nộp. Mỗi file Google Sheet tối đa 10 triệu ô (mọi tab
 * cộng lại); 13 cột × 100.000 bài/ngày đầy 1 file sau ~1 tuần. Khi tab hiện tại
 * vượt MAX_LOG_ROWS dòng, tự tạo FILE MỚI "NhatKyNopBai <ngày>" (cùng dòng tiêu đề),
 * ghi tiếp vào đó và thêm 1 dòng vào tab DanhMucNhatKy của file chính để tra cứu.
 * Chưa có file mới nào thì dùng tab NhatKyNopBai của file chính như trước.
 * Gọi BÊN TRONG khoá của writeSubmissionLog_().
 */
function getSubmissionLogSheet_() {
  const props = PropertiesService.getScriptProperties();
  const currentId = props.getProperty(LOG_SPREADSHEET_PROP);
  const sheet = currentId
    ? SpreadsheetApp.openById(currentId).getSheetByName(SHEET_SUBMISSION_LOG)
    : SpreadsheetApp.openById(SPREADSHEET_ID_REPORT).getSheetByName(SHEET_SUBMISSION_LOG);
  if (!sheet) {
    throw new Error('Chưa có tab "' + SHEET_SUBMISSION_LOG + '" trong Sheet báo cáo — xem HUONG_DAN.md để tạo.');
  }
  if (sheet.getLastRow() < MAX_LOG_ROWS) {
    ensureLogSheetLayout_(sheet);
    return sheet;
  }

  const stamp = Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd HH:mm');
  const file = SpreadsheetApp.create(SHEET_SUBMISSION_LOG + ' ' + stamp);
  const fresh = file.getSheets()[0].setName(SHEET_SUBMISSION_LOG);
  fresh.getRange(1, 1, 1, LOG_HEADERS.length).setValues([LOG_HEADERS]).setFontWeight('bold');
  fresh.setFrozenRows(1);
  props.setProperty(LOG_SPREADSHEET_PROP, file.getId());
  const history = JSON.parse(props.getProperty(LOG_HISTORY_PROP) || '[]');
  history.push(file.getId());
  props.setProperty(LOG_HISTORY_PROP, JSON.stringify(history));

  const main = SpreadsheetApp.openById(SPREADSHEET_ID_REPORT);
  const catalog = main.getSheetByName(SHEET_LOG_CATALOG) || main.insertSheet(SHEET_LOG_CATALOG);
  if (catalog.getLastRow() === 0) catalog.appendRow(['TaoLuc', 'TenFile', 'DuongDan']);
  catalog.appendRow([new Date(), file.getName(), file.getUrl()]);
  ensureLogSheetLayout_(fresh);
  return fresh;
}

/**
 * Tiêu đề cột N (CheDo) + định dạng giờ nộp (L) kiểu Việt Nam. Chạy tối đa 1 lần/6 giờ
 * cho mỗi tab (cờ trong CacheService) — không tốn thêm thời gian cho từng bài nộp.
 */
function ensureLogSheetLayout_(sheet) {
  const cache = CacheService.getScriptCache();
  const flag = 'layout:' + sheet.getParent().getId();
  if (cache.get(flag)) return;
  if (sheet.getRange(1, LOG_HEADERS.length).getValue() === '') {
    sheet.getRange(1, LOG_HEADERS.length).setValue(LOG_HEADERS[LOG_HEADERS.length - 1]);
  }
  sheet.getRange('L2:L').setNumberFormat('HH:mm:ss d/M/yyyy');
  cache.put(flag, '1', DEDUPE_TTL_SEC);
}

/**
 * Giữ nguyên chữ khi ghi vào Sheet: thêm dấu ' trước giá trị mà Sheet sẽ tự đổi
 * (dạng số/ngày/giờ như "7/24", "3/12", "5:05") hoặc hiểu thành công thức (bắt đầu
 * bằng = + - @). Dấu ' không hiện trong ô và không có trong giá trị đọc ra.
 */
function asText_(value) {
  if (value === null || value === undefined) return '';
  const s = String(value);
  return /^[=+\-@]/.test(s) || /^[\d\s\/.:,-]+$/.test(s) ? "'" + s : s;
}

/**
 * Gửi email cảnh báo 1 lượt nộp bài bị nghi vấn gian lận, có throttle
 * (ALERT_EMAIL_MAX_PER_HOUR) để không bao giờ vượt quota MailApp free.
 * Lỗi ở đây (mail quota hết, ALERT_EMAILS rỗng...) chỉ log, KHÔNG throw —
 * đây là tính năng "thêm", không được phép làm hỏng luồng ghi log chính.
 */
function sendCheatAlertEmail_(payload) {
  try {
    if (!ALERT_EMAILS || ALERT_EMAILS.length === 0) return;

    const cache = CacheService.getScriptCache();
    const bucketKey = 'cheatAlertCount_' + Math.floor(Date.now() / (60 * 60 * 1000)); // 1 khoá/giờ
    const sentThisHour = Number(cache.get(bucketKey) || 0);
    if (sentThisHour >= ALERT_EMAIL_MAX_PER_HOUR) {
      console.warn('Đã đạt giới hạn ' + ALERT_EMAIL_MAX_PER_HOUR + ' email cảnh báo/giờ — bỏ qua để giữ quota MailApp.');
      return;
    }

    const subject = '⚠️ Nghi vấn gian lận: ' + (payload.studentName || 'Ẩn danh') + ' — ' + (payload.testName || '');
    const body = [
      'Học sinh: ' + (payload.studentName || ''),
      'Lớp: ' + (payload.studentClass || ''),
      'Trường: ' + (payload.studentSchool || ''),
      'Bài thi: ' + (payload.testName || ''),
      'Điểm: ' + (payload.score ?? ''),
      'Trạng thái: ' + (payload.status || ''),
      'Ghi chú: ' + (payload.note || ''),
      'Số lần chuyển tab: ' + (payload.tabSwitch ?? ''),
      '',
      '(Email tự động từ apps/Code.gs — xem chi tiết đầy đủ ở sheet "' + SHEET_SUBMISSION_LOG + '")'
    ].join('\n');

    MailApp.sendEmail(ALERT_EMAILS.join(','), subject, body);
    cache.put(bucketKey, String(sentThisHour + 1), 3600); // hết hạn sau 1 giờ, tự dọn
  } catch (e) {
    console.error('Lỗi gửi email cảnh báo gian lận (không ảnh hưởng việc ghi log):', e);
  }
}

// ──────────────── 35-mos.gs ────────────────
// ====== KẾT QUẢ MOS PRACTICE (công khai — học sinh không đăng nhập) ======
// Router: mosSubmit. Xem js/mos-submissions.js (phía web). Trước đây mỗi bài MOS ghi 1
// lượt Firestore (mos_submissions) mà không trang nào đọc lại — nay vào tab NhatKyMOS
// để giáo viên mở Sheet là xem/lọc được, 0 lượt Firebase.

const SHEET_MOS_LOG = 'NhatKyMOS';
const MOS_HEADERS = ['SubmissionId', 'HoTen', 'Lop', 'Truong', 'DuAn', 'MaDuAn', 'Diem',
  'TaskDung', 'TaskTuCham', 'TaskThuCong', 'ThoiGianNop', 'ChiTiet'];

function validateMosSubmission_(p) {
  const bad = function (msg) { throw appError_('invalid-argument', 'Bài MOS không hợp lệ: ' + msg); };
  if (!p || typeof p !== 'object') bad('thiếu dữ liệu');
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(String(p.submissionId || ''))) bad('submissionId');
  [['studentName', 120], ['studentClass', 40], ['studentSchool', 160], ['projectId', 120], ['projectTitle', 300]]
    .forEach(function (f) {
      const v = p[f[0]];
      if (v !== undefined && v !== null && (typeof v !== 'string' || v.length > f[1])) bad(f[0]);
    });
  if (!String(p.studentName || '').trim()) bad('studentName');
  if (p.score !== null && p.score !== undefined && !(Number(p.score) >= 0 && Number(p.score) <= 100)) bad('score');
  if (p.results !== undefined && (!Array.isArray(p.results) || p.results.length > 200)) bad('results');
}

/** p: payload như js/mos-submissions.js dựng (studentName, ..., score, results[]). */
function writeMosLog_(p) {
  validateMosSubmission_(p);
  const cache = CacheService.getScriptCache();
  const dedupeKey = 'mos:' + p.submissionId;
  if (cache.get(dedupeKey)) return { written: false, duplicate: true };

  // Chỉ giữ phần cần cho giáo viên xem lại, cắt ngắn để 1 ô không vượt 50.000 ký tự.
  const detail = JSON.stringify((p.results || []).map(function (r) {
    return { id: r.id, label: String(r.label || '').slice(0, 200), passed: r.passed, manual: !!r.manual,
      note: String(r.note || '').slice(0, 200) };
  })).slice(0, 45000);

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    if (cache.get(dedupeKey)) return { written: false, duplicate: true };
    const sheet = ensureTab_(SPREADSHEET_ID_REPORT, SHEET_MOS_LOG, MOS_HEADERS);
    sheet.appendRow([
      asText_(p.submissionId), asText_(p.studentName), asText_(p.studentClass), asText_(p.studentSchool),
      asText_(p.projectTitle), asText_(p.projectId),
      // score null = không có task tự chấm (toàn thủ công) — để trống thay vì 0.
      p.score === null || p.score === undefined ? '' : Number(p.score),
      Number(p.passedCount) || 0, Number(p.autoTotal) || 0, Number(p.manualCount) || 0,
      new Date(), asText_(detail),
    ]);
    cache.put(dedupeKey, '1', DEDUPE_TTL_SEC);
  } finally {
    lock.releaseLock();
  }
  return { written: true, duplicate: false };
}

// ──────────────── 40-results.gs ────────────────
// ====== ĐỌC / XOÁ KẾT QUẢ CHO DASHBOARD (thay Firestore quiz_results) ======
// Router: 'listResults' (admin / điều phối / giáo viên đã duyệt), 'deleteResults'
// (admin / điều phối). Người gọi đã được xác thực ở 10-router.gs → tham số `who`.

/** Các file nhật ký, MỚI NHẤT trước (file chính là cũ nhất). */
function logSpreadsheetIds_() {
  const history = JSON.parse(PropertiesService.getScriptProperties().getProperty(LOG_HISTORY_PROP) || '[]');
  return history.slice().reverse().concat([SPREADSHEET_ID_REPORT]);
}

/** Thời điểm nộp (ms) từ cột L: Date thật (bản mới) hoặc chuỗi giờ VN "16:59:17 5/10/2026" (bản cũ). */
function submittedMs_(raw) {
  if (raw instanceof Date) return raw.getTime();
  const s = String(raw || '');
  let m = s.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return Date.UTC(+m[6], +m[5] - 1, +m[4], +m[1] - 7, +m[2], +(m[3] || 0));
  m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (m) return Date.UTC(+m[3], +m[2] - 1, +m[1], +m[4] - 7, +m[5], +(m[6] || 0));
  return null;
}

/** 1 dòng nhật ký (giá trị HIỂN THỊ) → cùng dạng bản ghi quiz_results mà dashboard đang dùng. */
function logRowToResult_(r, ms) {
  const parts = String(r[4]).split(' › ');
  const cd = String(r[6]).split('/');
  const correct = Number(cd[0]) || 0;
  const total = Number(cd[1]) || 0;
  const t = String(r[7]).split(':');
  const status = String(r[10] || '');
  const note = String(r[12] || '');
  const integrityOk = status === '' || status === 'OK';
  const flags = [];
  if (!integrityOk) flags.push(status.replace(/^⚠️\s*/, ''));
  if (note && note !== 'Hết giờ') note.split('; ').forEach(function (x) { if (x) flags.push(x); });
  return {
    id: r[0], studentName: r[1], studentClass: r[2], studentSchool: r[3], testName: r[4],
    category: parts[0] || '', level: parts[1] || '', minitest: parts.slice(2).join(' › '),
    score: Number(r[5]) || 0, correct: correct, total: total,
    incorrect: Math.max(0, total - correct), skipped: 0,
    // Cột H ghi "mm:ss"; bản cũ bị Sheet đổi thành giờ ("68:08:00") — chỉ lấy 2 phần đầu.
    elapsedSec: (Number(t[0]) || 0) * 60 + (Number(t[1]) || 0),
    tabSwitches: Number(r[8]) || 0, clicks: Number(r[9]) || 0,
    integrityOk: integrityOk, flags: flags, timedOut: note.indexOf('Hết giờ') !== -1,
    examMode: r[13] || '', submittedAtMs: ms, source: 'sheet'
  };
}

/**
 * Danh sách bài nộp mới nhất trước, đã lọc theo quyền.
 * p: { schools?, classes?, sinceMs?, limit?, studentName? }; who: người gọi (đã xác thực).
 * Quét từ CUỐI tab ngược lên theo khối (bài nộp được ghi theo thứ tự thời gian) và
 * dừng ngay khi gặp bài cũ hơn sinceMs → lần làm mới của dashboard chỉ đọc phần đuôi.
 */
function listResults_(p, who) {
  let schools = Array.isArray(p.schools) && p.schools.length ? p.schools.map(String) : null;
  if (who.schools) {
    schools = (schools || who.schools).filter(function (s) { return who.schools.indexOf(s) !== -1; });
    if (!schools.length) return { rows: [], truncated: false };
  }
  const schoolSet = schools ? new Set(schools) : null;
  const classSet = Array.isArray(p.classes) && p.classes.length ? new Set(p.classes.map(String)) : null;
  const wantName = p.studentName ? nameKey_(p.studentName) : '';
  const sinceMs = Number(p.sinceMs) || 0;
  const limit = Math.max(1, Math.min(Number(p.limit) || 1000, READ_MAX_ROWS));

  const rows = [];
  let scanned = 0;
  let done = false;
  let truncated = false;
  const ids = logSpreadsheetIds_();
  for (let f = 0; f < ids.length && !done; f++) {
    const sheet = SpreadsheetApp.openById(ids[f]).getSheetByName(SHEET_SUBMISSION_LOG);
    if (!sheet) continue;
    let end = sheet.getLastRow();
    while (end >= 2 && !done) {
      const start = Math.max(2, end - READ_CHUNK_ROWS + 1);
      const n = end - start + 1;
      const shown = sheet.getRange(start, 1, n, LOG_HEADERS.length).getDisplayValues();
      const times = sheet.getRange(start, 12, n, 1).getValues();
      for (let i = n - 1; i >= 0; i--) {
        const r = shown[i];
        const ms = submittedMs_(times[i][0]);
        if (sinceMs && ms && ms < sinceMs) { done = true; break; }
        if (!r[0]) continue;
        if (schoolSet && !schoolSet.has(r[3])) continue;
        if (classSet && !classSet.has(r[2])) continue;
        if (wantName && nameKey_(r[1]) !== wantName) continue;
        rows.push(logRowToResult_(r, ms));
        if (rows.length >= limit) { done = true; break; }
      }
      scanned += n;
      end = start - 1;
      if (!done && scanned >= READ_MAX_SCAN_ROWS) { done = true; truncated = true; }
    }
  }
  return { rows: rows, truncated: truncated };
}

/**
 * Xoá bài nộp theo mã (nút xoá ở Báo cáo kết quả). Chỉ admin, hoặc điều phối đào tạo
 * với bài thuộc trường của mình — giống quyền xoá quiz_results trong firestore.rules.
 * p: { ids: string[] (≤ 500) }; quyền admin/điều phối đã kiểm ở router.
 */
function deleteResults_(p, who) {
  const wanted = new Set((Array.isArray(p.ids) ? p.ids : []).slice(0, 500).map(String));
  if (!wanted.size) return { deleted: 0 };

  // Khoá riêng (không chặn bài nộp đang ghi): appendRow chỉ thêm dòng cuối, không làm lệch
  // số dòng đã tìm thấy ở đây; khoá này chỉ để 2 lượt xoá không chạy chồng nhau.
  const lock = LockService.getUserLock();
  lock.waitLock(30000);
  try {
    let deleted = 0;
    const ids = logSpreadsheetIds_();
    for (let f = 0; f < ids.length && wanted.size; f++) {
      const sheet = SpreadsheetApp.openById(ids[f]).getSheetByName(SHEET_SUBMISSION_LOG);
      if (!sheet || sheet.getLastRow() < 2) continue;
      const rowNums = [];
      wanted.forEach(function (id) {
        const cell = sheet.getRange('A:A').createTextFinder(id).matchEntireCell(true).findNext();
        if (!cell || cell.getRow() < 2) return;
        if (who.schools && who.schools.indexOf(String(sheet.getRange(cell.getRow(), 4).getDisplayValue())) === -1) return;
        rowNums.push(cell.getRow());
      });
      rowNums.sort(function (a, b) { return b - a; }).forEach(function (row) {
        wanted.delete(String(sheet.getRange(row, 1).getDisplayValue()));
        sheet.deleteRow(row);
        deleted++;
      });
    }
    if (deleted) auditServer_('delete_results', who, { deleted: deleted, ids: Array.from(new Set(p.ids)).slice(0, 50) });
    return { deleted: deleted };
  } finally {
    lock.releaseLock();
  }
}

// ──────────────── 45-activity.gs ────────────────
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

// ──────────────── 50-reports.gs ────────────────
// ====== ROSTER / ĐIỂM / BÁO CÁO TỔNG HỢP (tab HocSinh, KetQua, TongHop) ======
// Router: getRoster, getScores, getDashboard, writeReport — chỉ admin / điều phối đào tạo.
// Điều phối chỉ thấy học sinh của các trường mình phụ trách (who.schools), giống
// firestore.rules. Trước đây các API này chạy bằng GET công khai, không cần đăng nhập.

/** Roster (tab HocSinh), lọc theo lớp và theo trường được phép xem. */
function getRoster_(lopFilter, who) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID_DATA).getSheetByName(SHEET_ROSTER);
  let rows = sheetToObjects_(sheet);
  if (who && who.schools) {
    const allowed = new Set(who.schools);
    rows = rows.filter(function (r) { return allowed.has(String(r.Truong)); });
  }
  if (lopFilter) rows = rows.filter(function (r) { return r.Lop === lopFilter; });
  return rows;
}

/**
 * Điểm (tab KetQua). Tab này không có cột trường → điều phối chỉ thấy điểm của học sinh
 * có MSHS nằm trong roster các trường mình phụ trách.
 */
function getScores_(lopFilter, baiThiFilter, who) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID_DATA).getSheetByName(SHEET_SCORES);
  let rows = sheetToObjects_(sheet);
  if (who && who.schools) {
    const ids = new Set(getRoster_(null, who).map(function (r) { return String(r.MSHS); }));
    rows = rows.filter(function (r) { return ids.has(String(r.MSHS)); });
  }
  if (lopFilter) rows = rows.filter(function (r) { return r.Lop === lopFilter; });
  if (baiThiFilter) rows = rows.filter(function (r) { return r.BaiThi === baiThiFilter; });
  return rows;
}

/**
 * Số liệu tổng hợp tính sẵn trên server. Vai trò lấy từ tài khoản đã xác thực (trước
 * đây lấy từ tham số "role" web tự khai — ai cũng tự xưng admin được).
 */
function buildDashboardPayload_(lopFilter, who) {
  const role = who ? who.role : '';
  const scores = getScores_(lopFilter, null, who);
  const roster = getRoster_(lopFilter, who);

  const totalStudents = roster.length;
  const submitted = scores.filter(function (s) { return s.TrangThai === 'Đã nộp' || s.TrangThai === 'Hoàn thành'; });
  const completionRate = totalStudents > 0 ? submitted.length / totalStudents : 0;

  const avgScore = submitted.length > 0
    ? submitted.reduce(function (sum, s) { return sum + (Number(s.DiemSo) || 0); }, 0) / submitted.length
    : 0;

  // Phân bố điểm theo khoảng (để vẽ biểu đồ histogram/pie)
  const distribution = { '0-4': 0, '5-6': 0, '7-8': 0, '9-10': 0 };
  submitted.forEach(function (s) {
    const d = Number(s.DiemSo) || 0;
    if (d < 5) distribution['0-4']++;
    else if (d < 7) distribution['5-6']++;
    else if (d < 9) distribution['7-8']++;
    else distribution['9-10']++;
  });

  // Tỷ lệ đúng/sai theo loại câu hỏi (yêu cầu cột ChiTietLoaiCauHoi lưu JSON dạng
  // {"MultipleChoice":{"dung":8,"sai":2}, "Matching":{"dung":5,"sai":3}, ...})
  const byQuestionType = {};
  submitted.forEach(function (s) {
    if (!s.ChiTietLoaiCauHoi) return;
    let detail;
    try { detail = JSON.parse(s.ChiTietLoaiCauHoi); } catch (e) { return; }
    Object.keys(detail).forEach(function (type) {
      if (!byQuestionType[type]) byQuestionType[type] = { dung: 0, sai: 0 };
      byQuestionType[type].dung += detail[type].dung || 0;
      byQuestionType[type].sai += detail[type].sai || 0;
    });
  });

  const base = {
    totalStudents: totalStudents,
    totalSubmitted: submitted.length,
    completionRate: completionRate,
    avgScore: avgScore,
    distribution: distribution,
    byQuestionType: byQuestionType,
    byClass: groupByClass_(submitted),
  };
  if (role === 'admin') base.roster = roster; // admin cần xem/chỉnh toàn bộ danh sách
  return base;
}

function groupByClass_(submitted) {
  const map = {};
  submitted.forEach(function (s) {
    if (!map[s.Lop]) map[s.Lop] = { count: 0, totalScore: 0 };
    map[s.Lop].count++;
    map[s.Lop].totalScore += Number(s.DiemSo) || 0;
  });
  return Object.keys(map).map(function (lop) {
    return { lop: lop, soLuong: map[lop].count, diemTB: map[lop].totalScore / map[lop].count };
  });
}

/**
 * report: mảng các object (mỗi object = 1 dòng báo cáo), ví dụ:
 * [{ ngayXuat: '2026-08-13', lop: '6A1', soHS: 32, tyLeHoanThanh: 0.9, diemTB: 7.5 }, ...]
 */
function writeSummaryReport_(report) {
  if (!Array.isArray(report) || report.length === 0 || report.length > 5000) {
    throw appError_('invalid-argument', 'report rỗng, quá lớn hoặc sai định dạng');
  }
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID_REPORT).getSheetByName(SHEET_REPORT_SUMMARY);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

  const rows = report.map(function (item) {
    return headers.map(function (h) { return item[h] !== undefined ? noFormula_(item[h]) : ''; });
  });
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, headers.length).setValues(rows);

  return { rowsWritten: rows.length };
}

// ──────────────── 60-maps.gs ────────────────
// ====== KHOẢNG CÁCH ĐƯỜNG BỘ (tab "🚗 Hỗ trợ xăng xe" — teaching-schedule.html) ======
// Router: mapDistance. Dùng dịch vụ Maps có sẵn của Apps Script (dữ liệu Google Maps, có
// số nhà/hẻm ở Việt Nam, không cần API key hay thẻ ngân hàng) thay cho máy chủ demo
// OpenStreetMap trước đây (giới hạn 1 lượt/giây, thiếu số nhà trong hẻm).
// Hạn mức: tài khoản Gmail thường ~1.000 lượt geocode/ngày cho cả project → mỗi người
// tối đa MAPS_MAX_PER_USER_PER_DAY lượt; kết quả giữ 6 giờ trong CacheService.

/**
 * p: { origin: địa chỉ nhà giáo viên, destination: tên trường (kèm thành phố) }
 * @returns {{km:number, matchedSchoolAddress:string, approximateHome:boolean}|null}
 *   null = không định vị được nhà hoặc trường.
 */
function mapDistance_(p, who) {
  const origin = String(p.origin || '').trim();
  const destination = String(p.destination || '').trim();
  if (!origin || !destination || origin.length > 300 || destination.length > 300) {
    throw appError_('invalid-argument', 'Thiếu hoặc quá dài: địa chỉ nhà / tên trường.');
  }

  const cache = CacheService.getScriptCache();
  const key = 'dist:' + Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, origin + '\n' + destination));
  const hit = cache.get(key);
  if (hit) return JSON.parse(hit);

  const day = Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyyMMdd');
  const quotaKey = 'mapsq:' + who.uid + ':' + day;
  const used = Number(cache.get(quotaKey) || 0);
  if (used >= MAPS_MAX_PER_USER_PER_DAY) {
    throw appError_('resource-exhausted', 'Đã tính ' + used + ' khoảng cách hôm nay — giới hạn ' +
      MAPS_MAX_PER_USER_PER_DAY + '/ngày/người để giữ hạn mức bản đồ chung. Điền tay hoặc thử lại ngày mai.');
  }
  cache.put(quotaKey, String(used + 1), 24 * 60 * 60);

  const home = geocodeVn_(origin, null);
  if (!home) return remember_(cache, key, null);
  // Tìm trường QUANH nhà giáo viên (±0,3° ≈ 33 km) — trùng tên trường giữa các quận là chuyện thường.
  const school = geocodeVn_(destination, home);
  if (!school) return remember_(cache, key, null);

  const dir = Maps.newDirectionFinder()
    .setOrigin(home.lat, home.lng)
    .setDestination(school.lat, school.lng)
    .setMode(Maps.DirectionFinder.Mode.DRIVING)
    .setLanguage('vi')
    .getDirections();
  if (!dir || dir.status !== 'OK' || !dir.routes.length) return remember_(cache, key, null);
  const meters = dir.routes[0].legs.reduce(function (m, leg) { return m + leg.distance.value; }, 0);

  return remember_(cache, key, {
    km: Math.round(meters / 100) / 10,
    matchedSchoolAddress: school.address,
    approximateHome: home.approximate,
  });
}

/** Geocode trong Việt Nam; `near` (toạ độ) → ưu tiên kết quả quanh điểm đó. */
function geocodeVn_(address, near) {
  const geocoder = Maps.newGeocoder().setRegion('vn').setLanguage('vi');
  if (near) geocoder.setBounds(near.lat - 0.3, near.lng - 0.3, near.lat + 0.3, near.lng + 0.3);
  const res = geocoder.geocode(address);
  if (!res || res.status !== 'OK' || !res.results.length) return null;
  const r = res.results[0];
  return {
    lat: r.geometry.location.lat,
    lng: r.geometry.location.lng,
    address: r.formatted_address,
    // Không khớp tới số nhà (chỉ tới đường/phường) → báo "xấp xỉ" như bản cũ.
    approximate: !!r.partial_match || r.geometry.location_type === 'APPROXIMATE' ||
      r.geometry.location_type === 'GEOMETRIC_CENTER',
  };
}

function remember_(cache, key, value) {
  cache.put(key, JSON.stringify(value), DEDUPE_TTL_SEC);
  return value;
}

// ──────────────── 70-github.gs ────────────────
// ====== ĐẨY DỮ LIỆU TĨNH LÊN GITHUB (image-manager.html — chỉ admin) ======
// Router: githubReadFile, githubPublish. Token GitHub nằm ở Script Properties
// (GITHUB_TOKEN) — trước đây mỗi admin dán token vào trình duyệt (localStorage), ai mở
// được máy đó là lấy được quyền ghi repo. Chỉ cho ghi dưới GITHUB_ALLOWED_PREFIXES
// (dữ liệu/ảnh), không ghi được code.

function githubToken_() {
  const token = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  if (!token) {
    throw appError_('failed-precondition',
      'Apps Script chưa có GITHUB_TOKEN (Project Settings → Script Properties).');
  }
  return token;
}

function githubRequest_(method, path, body, accept) {
  const res = UrlFetchApp.fetch('https://api.github.com/repos/' + GITHUB_OWNER + '/' + GITHUB_REPO + '/' + path, {
    method: method,
    contentType: 'application/json',
    payload: body ? JSON.stringify(body) : undefined,
    headers: { Authorization: 'Bearer ' + githubToken_(), Accept: accept || 'application/vnd.github+json' },
    muteHttpExceptions: true,
  });
  const code = res.getResponseCode();
  if (code === 401 || code === 403) throw appError_('failed-precondition', 'GITHUB_TOKEN không hợp lệ/hết quyền (' + code + ').');
  if (code >= 300) throw appError_('internal', 'GitHub API lỗi ' + code + ': ' + res.getContentText().slice(0, 200));
  return res;
}

function checkGithubPath_(path) {
  const p = String(path || '');
  const allowed = GITHUB_ALLOWED_PREFIXES.some(function (prefix) { return p.indexOf(prefix) === 0; });
  if (!allowed || p.indexOf('..') !== -1 || p.length > 300) {
    throw appError_('invalid-argument', 'Không được ghi/đọc đường dẫn: ' + p);
  }
  return p;
}

/** Nội dung MỚI NHẤT của 1 file trên nhánh (không qua cache GitHub Pages ~10 phút). p: { path } */
function githubReadFile_(p) {
  const path = checkGithubPath_(p.path);
  const res = githubRequest_('get', 'contents/' + path.split('/').map(encodeURIComponent).join('/') +
    '?ref=' + GITHUB_BRANCH, null, 'application/vnd.github.raw+json');
  return { text: res.getContentText('UTF-8') };
}

/**
 * Đẩy nhiều file trong ĐÚNG 1 commit.
 * p: { files: [{path, content?|base64?}], message, expectedShas?: {path: sha git bản đã mở} }
 * expectedShas: file trên nhánh đã khác (người khác vừa đẩy) → dừng, mã 'conflict'.
 */
function githubPublish_(p, who) {
  const files = Array.isArray(p.files) ? p.files : [];
  if (!files.length || files.length > 200) throw appError_('invalid-argument', 'Danh sách file rỗng hoặc quá nhiều (tối đa 200).');
  files.forEach(function (f) { checkGithubPath_(f.path); });
  const out = commitFiles_(files, p.message, p.expectedShas, who);
  auditServer_('publish_questions', who, { files: files.length, sha: out.sha });
  return out;
}

/**
 * Cập nhật danh sách học sinh cho trang làm bài (data/roster/students-active.json) —
 * nút "🚀 Cập nhật cho học sinh" ở roster-manager.html. Chỉ ADMIN: file dùng chung cho mọi
 * trường, điều phối chỉ thấy học sinh trường mình → đẩy lên sẽ làm mất học sinh trường khác.
 * Chỉ ghi ĐÚNG file này và chỉ nhận nội dung đúng dạng roster.
 * p: { content: chuỗi JSON { version, generatedAt, count, students:[{school, className, name}] } }
 */
function publishRoster_(p, who) {
  const content = String(p.content || '');
  if (!content || content.length > 5 * 1024 * 1024) throw appError_('invalid-argument', 'Roster rỗng hoặc quá lớn (tối đa 5 MB).');
  let data;
  try { data = JSON.parse(content); } catch (e) { throw appError_('invalid-argument', 'Roster không phải JSON hợp lệ.'); }
  const students = data && data.students;
  const ok = Array.isArray(students) && students.length > 0 && students.every(function (s) {
    return s && typeof s.name === 'string' && typeof s.className === 'string' && typeof s.school === 'string';
  });
  if (!ok) throw appError_('invalid-argument', 'Roster sai cấu trúc (cần students: [{school, className, name}]).');
  const out = commitFiles_([{ path: ROSTER_STATIC_PATH, content: content }],
    'chore(roster): cập nhật danh sách học sinh (' + students.length + ' em)', null, who);
  auditServer_('publish_roster', who, { students: students.length, sha: out.sha });
  return out;
}

/** Ghi nhiều file trong ĐÚNG 1 commit (dùng chung cho câu hỏi + roster). */
function commitFiles_(files, messageText, expectedShas, who) {
  // Khoá RIÊNG (user lock — Web App chạy dưới 1 tài khoản nên dùng chung cho mọi lượt gọi),
  // không dùng script lock của bài nộp: đẩy GitHub mất vài chục giây, học sinh nộp bài
  // lúc đó không được phải chờ. 2 admin bấm đẩy cùng lúc → lần lượt, không ghi đè nhau.
  const lock = LockService.getUserLock();
  lock.waitLock(30000);
  try {
    const ref = JSON.parse(githubRequest_('get', 'git/ref/heads/' + GITHUB_BRANCH).getContentText());
    const baseCommitSha = ref.object.sha;
    const baseTreeSha = JSON.parse(githubRequest_('get', 'git/commits/' + baseCommitSha).getContentText()).tree.sha;

    const expected = expectedShas || {};
    const expectedPaths = Object.keys(expected).filter(function (k) { return expected[k]; });
    if (expectedPaths.length) {
      const tree = JSON.parse(githubRequest_('get', 'git/trees/' + baseTreeSha + '?recursive=1').getContentText());
      const current = {};
      (tree.tree || []).forEach(function (t) { current[t.path] = t.sha; });
      const changed = expectedPaths.filter(function (k) { return current[k] && current[k] !== expected[k]; });
      if (changed.length) throw appError_('conflict', 'Dữ liệu trên GitHub đã thay đổi sau khi bạn mở trang: ' + changed.join(', '));
    }

    const treeItems = files.map(function (f) {
      const blob = f.base64 != null
        ? { content: String(f.base64), encoding: 'base64' }
        : { content: String(f.content || ''), encoding: 'utf-8' };
      const sha = JSON.parse(githubRequest_('post', 'git/blobs', blob).getContentText()).sha;
      return { path: f.path, mode: '100644', type: 'blob', sha: sha };
    });
    const newTree = JSON.parse(githubRequest_('post', 'git/trees', { base_tree: baseTreeSha, tree: treeItems }).getContentText());
    const message = String(messageText || 'chore(data): cập nhật từ trang quản lý').slice(0, 500) +
      '\n\nĐẩy qua Apps Script bởi tài khoản ' + who.uid;
    const commit = JSON.parse(githubRequest_('post', 'git/commits',
      { message: message, tree: newTree.sha, parents: [baseCommitSha] }).getContentText());
    githubRequest_('patch', 'git/refs/heads/' + GITHUB_BRANCH, { sha: commit.sha });
    return { sha: commit.sha };
  } finally {
    lock.releaseLock();
  }
}

// ──────────────── 80-sheet-setup.gs ────────────────

// ====== MENU TÙY CHỈNH TRÊN GOOGLE SHEET ======
// Tự động thêm menu "🎯 Công cụ IC3" mỗi khi mở file Sheet.
// Chỉ cần bấm menu, không cần vào Apps Script editor.
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🎯 Công cụ IC3')
    .addItem('🎨 Định dạng HocSinh', 'setupHocSinhFormatting_')
    .addItem('🎨 Định dạng KetQua', 'setupKetQuaFormatting_')
    .addItem('🎨 Định dạng NhatKyNopBai', 'setupNhatKyNopBaiFormatting_')
    .addItem('🎨 Định dạng TongHop', 'setupTongHopFormatting_')
    .addItem('📊 Cập nhật bảng Thống Kê + biểu đồ', 'setupThongKeSheet_')
    .addSeparator()
    .addItem('🚀 Chạy tất cả', 'runAllSetup_')
    .addToUi();
}

function runAllSetup_() {
  setupHocSinhFormatting_();
  setupKetQuaFormatting_();
  setupNhatKyNopBaiFormatting_();
  setupTongHopFormatting_();
  setupThongKeSheet_();
  SpreadsheetApp.getUi().alert('✅ Đã định dạng toàn bộ 4 sheet và cập nhật ThongKe + biểu đồ.');
}

// ====== ĐỊNH DẠNG SHEET HOC SINH ======
// Cột: A MSHS | B HoTen | C Lop | D Truong | E Email
function setupHocSinhFormatting_() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID_DATA).getSheetByName(SHEET_ROSTER);
  if (!sheet) throw new Error('Không tìm thấy tab "' + SHEET_ROSTER + '"');

  const lastCol = 5; // A..E
  const maxRows = 2000;

  const headerRange = sheet.getRange(1, 1, 1, lastCol);
  headerRange.setBackground('#1a73e8').setFontColor('#ffffff').setFontWeight('bold')
    .setHorizontalAlignment('center').setVerticalAlignment('middle');
  sheet.setFrozenRows(1);

  const dataRange = sheet.getRange(2, 1, maxRows - 1, lastCol);
  sheet.getBandings().forEach(b => b.remove());
  dataRange.applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, false, false);

  sheet.autoResizeColumns(1, lastCol);

  // Cảnh báo trùng MSHS (mã học sinh không được trùng nhau)
  const idRange = sheet.getRange(2, 1, maxRows - 1, 1);
  const rules = [];
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=AND($A2<>"", COUNTIF($A$2:$A,$A2)>1)')
    .setBackground('#f4cccc').setFontColor('#990000').setBold(true)
    .setRanges([idRange]).build());
  sheet.setConditionalFormatRules(rules);

  const existingFilter = sheet.getFilter();
  if (existingFilter) existingFilter.remove();
  sheet.getRange(1, 1, Math.max(sheet.getLastRow(), 2), lastCol).createFilter();

  if (sheet.getLastRow() > 1) {
    sheet.getRange(1, 1, sheet.getLastRow(), lastCol).setBorder(true, true, true, true, true, true, '#cccccc', SpreadsheetApp.BorderStyle.SOLID);
  }
}

// ====== ĐỊNH DẠNG SHEET KET QUA ======
// Cột: A Timestamp | B MSHS | C HoTen | D Lop | E BaiThi | F DiemSo |
//      G ThoiGianLamPhut | H TrangThai | I ChiTietLoaiCauHoi(JSON)
function setupKetQuaFormatting_() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID_DATA).getSheetByName(SHEET_SCORES);
  if (!sheet) throw new Error('Không tìm thấy tab "' + SHEET_SCORES + '"');

  const lastCol = 9; // A..I
  const maxRows = 3000;

  const headerRange = sheet.getRange(1, 1, 1, lastCol);
  headerRange.setBackground('#1a73e8').setFontColor('#ffffff').setFontWeight('bold')
    .setHorizontalAlignment('center').setVerticalAlignment('middle');
  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(3); // luôn thấy Timestamp, MSHS, HoTen khi cuộn ngang

  const dataRange = sheet.getRange(2, 1, maxRows - 1, lastCol);
  sheet.getBandings().forEach(b => b.remove());
  dataRange.applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, false, false);

  sheet.autoResizeColumns(1, lastCol);

  // Timestamp (A) hiển thị ngày giờ
  sheet.getRange(2, 1, maxRows - 1, 1).setNumberFormat('dd/mm/yyyy hh:mm:ss');
  // DiemSo (F) căn giữa
  sheet.getRange(2, 6, maxRows - 1, 1).setHorizontalAlignment('center');

  const rules = [];

  // Thang màu điểm số theo min/max thực tế trong dữ liệu (không cố định 0-10 hay 0-100)
  const diemRange = sheet.getRange(2, 6, maxRows - 1, 1);
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .setGradientMaxpointWithValue('#57bb8a', SpreadsheetApp.InterpolationType.MAX, '')
    .setGradientMidpointWithValue('#ffd666', SpreadsheetApp.InterpolationType.PERCENT, '50')
    .setGradientMinpointWithValue('#e06666', SpreadsheetApp.InterpolationType.MIN, '')
    .setRanges([diemRange]).build());

  // TrangThai (H): Đã nộp/Hoàn thành → xanh, còn lại (Chưa nộp...) → xám nhạt
  const statusRange = sheet.getRange(2, 8, maxRows - 1, 1);
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('Hoàn thành')
    .setBackground('#d9ead3').setFontColor('#274e13')
    .setRanges([statusRange]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('Đã nộp')
    .setBackground('#d9ead3').setFontColor('#274e13')
    .setRanges([statusRange]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('Chưa nộp')
    .setBackground('#f3f3f3').setFontColor('#666666')
    .setRanges([statusRange]).build());

  sheet.setConditionalFormatRules(rules);

  const existingFilter = sheet.getFilter();
  if (existingFilter) existingFilter.remove();
  sheet.getRange(1, 1, Math.max(sheet.getLastRow(), 2), lastCol).createFilter();

  if (sheet.getLastRow() > 1) {
    sheet.getRange(1, 1, sheet.getLastRow(), lastCol).setBorder(true, true, true, true, true, true, '#cccccc', SpreadsheetApp.BorderStyle.SOLID);
  }
}

// ====== ĐỊNH DẠNG SHEET TONG HOP ======
// Cột: A NgayXuat | B Lop | C SoHocSinh | D TyLeHoanThanh | E DiemTB
function setupTongHopFormatting_() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID_REPORT).getSheetByName(SHEET_REPORT_SUMMARY);
  if (!sheet) throw new Error('Không tìm thấy tab "' + SHEET_REPORT_SUMMARY + '"');

  const lastCol = 5; // A..E
  const maxRows = 2000;

  const headerRange = sheet.getRange(1, 1, 1, lastCol);
  headerRange.setBackground('#1a73e8').setFontColor('#ffffff').setFontWeight('bold')
    .setHorizontalAlignment('center').setVerticalAlignment('middle');
  sheet.setFrozenRows(1);

  const dataRange = sheet.getRange(2, 1, maxRows - 1, lastCol);
  sheet.getBandings().forEach(b => b.remove());
  dataRange.applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, false, false);

  sheet.autoResizeColumns(1, lastCol);

  // NgayXuat (A) dạng ngày, TyLeHoanThanh (D) dạng %, DiemTB (E) 1 số thập phân
  sheet.getRange(2, 1, maxRows - 1, 1).setNumberFormat('dd/mm/yyyy');
  sheet.getRange(2, 4, maxRows - 1, 1).setNumberFormat('0%').setHorizontalAlignment('center');
  sheet.getRange(2, 5, maxRows - 1, 1).setNumberFormat('0.0').setHorizontalAlignment('center');

  const rules = [];
  const tyLeRange = sheet.getRange(2, 4, maxRows - 1, 1);
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .setGradientMaxpointWithValue('#57bb8a', SpreadsheetApp.InterpolationType.MAX, '')
    .setGradientMidpointWithValue('#ffd666', SpreadsheetApp.InterpolationType.PERCENT, '50')
    .setGradientMinpointWithValue('#e06666', SpreadsheetApp.InterpolationType.MIN, '')
    .setRanges([tyLeRange]).build());

  const diemTbRange = sheet.getRange(2, 5, maxRows - 1, 1);
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .setGradientMaxpointWithValue('#57bb8a', SpreadsheetApp.InterpolationType.MAX, '')
    .setGradientMidpointWithValue('#ffd666', SpreadsheetApp.InterpolationType.PERCENT, '50')
    .setGradientMinpointWithValue('#e06666', SpreadsheetApp.InterpolationType.MIN, '')
    .setRanges([diemTbRange]).build());

  sheet.setConditionalFormatRules(rules);

  const existingFilter = sheet.getFilter();
  if (existingFilter) existingFilter.remove();
  sheet.getRange(1, 1, Math.max(sheet.getLastRow(), 2), lastCol).createFilter();

  if (sheet.getLastRow() > 1) {
    sheet.getRange(1, 1, sheet.getLastRow(), lastCol).setBorder(true, true, true, true, true, true, '#cccccc', SpreadsheetApp.BorderStyle.SOLID);
  }
}

// ====== ĐỊNH DẠNG SHEET NHẬT KÝ NỘP BÀI ======
// Cột: A SubmissionId | B HoTen | C Lop | D Truong | E BaiThi | F Diem |
//      G SoCauDung | H ThoiGianLam | I SoLanChuyenTab | J SoLanClick |
//      K TrangThai | L ThoiDiemNop | M GhiChu
function setupNhatKyNopBaiFormatting_() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID_REPORT).getSheetByName(SHEET_SUBMISSION_LOG);
  if (!sheet) throw new Error('Không tìm thấy tab "' + SHEET_SUBMISSION_LOG + '"');

  const lastCol = LOG_HEADERS.length; // A..N
  const maxRows = 2000; // đủ dùng lâu dài, chỉnh nếu cần nhiều hơn

  // --- Header: bold, nền màu, chữ trắng, freeze ---
  const headerRange = sheet.getRange(1, 1, 1, lastCol);
  headerRange.setBackground('#1a73e8').setFontColor('#ffffff').setFontWeight('bold')
    .setHorizontalAlignment('center').setVerticalAlignment('middle');
  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(2); // luôn thấy SubmissionId + HoTen khi cuộn ngang

  // --- Băng màu xen kẽ cho dễ đọc ---
  const dataRange = sheet.getRange(2, 1, maxRows - 1, lastCol);
  const existingBandings = sheet.getBandings();
  existingBandings.forEach(b => b.remove());
  dataRange.applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, false, false);

  // --- Autosize cột ---
  sheet.autoResizeColumns(1, lastCol);

  // --- Format cột Điểm (F) là số nguyên căn giữa ---
  sheet.getRange(2, 6, maxRows - 1, 1).setNumberFormat('0').setHorizontalAlignment('center');

  // --- Format cột ThoiGianNop (L): giờ trước, ngày/tháng kiểu Việt Nam (khớp các dòng cũ) ---
  sheet.getRange('L2:L').setNumberFormat('HH:mm:ss d/M/yyyy');
  if (sheet.getRange(1, lastCol).getValue() === '') sheet.getRange(1, lastCol).setValue(LOG_HEADERS[lastCol - 1]);

  // --- Xoá rule cũ, thêm Conditional Formatting mới ---
  const rules = [];

  // 1) Cột TrangThai (K): "OK" → xanh lá, còn lại (gian lận/nghi vấn) → đỏ cam
  const statusRange = sheet.getRange(2, 11, maxRows - 1, 1);
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('OK')
    .setBackground('#d9ead3').setFontColor('#274e13')
    .setRanges([statusRange]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextContains('⚠️')
    .setBackground('#f4cccc').setFontColor('#990000').setBold(true)
    .setRanges([statusRange]).build());

  // 2) Cột Điểm (F): thang màu đỏ→vàng→xanh theo điểm 0-100
  const diemRange = sheet.getRange(2, 6, maxRows - 1, 1);
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .setGradientMaxpointWithValue('#57bb8a', SpreadsheetApp.InterpolationType.NUMBER, '100')
    .setGradientMidpointWithValue('#ffd666', SpreadsheetApp.InterpolationType.NUMBER, '50')
    .setGradientMinpointWithValue('#e06666', SpreadsheetApp.InterpolationType.NUMBER, '0')
    .setRanges([diemRange]).build());

  // 3) Cột SoLanChuyenTab (I): >3 lần chuyển tab → tô cam cảnh báo khả nghi
  const tabSwitchRange = sheet.getRange(2, 9, maxRows - 1, 1);
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenNumberGreaterThan(3)
    .setBackground('#fce5cd').setFontColor('#b45f06').setBold(true)
    .setRanges([tabSwitchRange]).build());

  sheet.setConditionalFormatRules(rules);

  // --- Bật bộ lọc trên hàng tiêu đề ---
  const existingFilter = sheet.getFilter();
  if (existingFilter) existingFilter.remove();
  sheet.getRange(1, 1, Math.max(sheet.getLastRow(), 2), lastCol).createFilter();

  // --- Kẻ viền nhẹ toàn bộ vùng dữ liệu đang có ---
  if (sheet.getLastRow() > 1) {
    sheet.getRange(1, 1, sheet.getLastRow(), lastCol).setBorder(true, true, true, true, true, true, '#cccccc', SpreadsheetApp.BorderStyle.SOLID);
  }
}

// ====== SHEET THỐNG KÊ + BIỂU ĐỒ (tự cập nhật bằng công thức sống) ======
function setupThongKeSheet_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID_REPORT);
  let sheet = ss.getSheetByName('ThongKe');
  if (!sheet) {
    sheet = ss.insertSheet('ThongKe');
  } else {
    sheet.getCharts().forEach(c => sheet.removeChart(c));
    sheet.clear();
  }

  const src = SHEET_SUBMISSION_LOG; // 'NhatKyNopBai'

  // --- Tiêu đề ---
  sheet.getRange('A1').setValue('📊 THỐNG KÊ THEO LỚP (tự động cập nhật)')
    .setFontWeight('bold').setFontSize(14);

  // --- Bảng tổng hợp theo lớp bằng QUERY, tự cập nhật khi NhatKyNopBai có dữ liệu mới ---
  sheet.getRange('A3').setFormula(
    '=IFERROR(QUERY(' + src + '!C2:F,' +
    '"select C, count(F), avg(F) where C is not null group by C label count(F) \'SoLuotNop\', avg(F) \'DiemTB\'"),' +
    '"Chưa có dữ liệu")'
  );
  sheet.getRange('A3').setFontWeight('bold');

  // --- Số lượt nghi vấn gian lận theo lớp (TrangThai chứa ⚠️) ---
  sheet.getRange('F3').setValue('Lớp');
  sheet.getRange('G3').setValue('Số lượt nghi vấn');
  sheet.getRange('F3:G3').setFontWeight('bold').setBackground('#f4cccc');
  sheet.getRange('F4').setFormula(
    '=IFERROR(QUERY(' + src + '!C2:K,' +
    '"select C, count(K) where K contains \'⚠️\' group by C label count(K) \'\'"),"")'
  );

  // --- Tổng quan toàn trường ---
  sheet.getRange('A20').setValue('Tổng số bài đã nộp:').setFontWeight('bold');
  sheet.getRange('B20').setFormula('=COUNTA(' + src + '!A2:A)-COUNTBLANK(' + src + '!A2:A)');
  sheet.getRange('A21').setValue('Điểm trung bình toàn trường:').setFontWeight('bold');
  sheet.getRange('B21').setFormula('=IFERROR(AVERAGE(' + src + '!F2:F),0)');
  sheet.getRange('A22').setValue('Tổng số lượt nghi vấn gian lận:').setFontWeight('bold');
  sheet.getRange('B22').setFormula('=IFERROR(COUNTIF(' + src + '!K2:K,"*⚠️*"),0)');

  sheet.autoResizeColumns(1, 8);

  // --- Biểu đồ cột: điểm TB theo lớp ---
  SpreadsheetApp.flush(); // đảm bảo QUERY đã tính xong trước khi vẽ chart
  const chart1 = sheet.newChart()
    .setChartType(Charts.ChartType.COLUMN)
    .addRange(sheet.getRange('A3:A100'))
    .addRange(sheet.getRange('C3:C100'))
    .setPosition(5, 1, 0, 0)
    .setOption('title', 'Điểm trung bình theo lớp')
    .setOption('legend', { position: 'none' })
    .setOption('colors', ['#1a73e8'])
    .build();
  sheet.insertChart(chart1);

  // --- Biểu đồ tròn: số lượt nghi vấn theo lớp ---
  const chart2 = sheet.newChart()
    .setChartType(Charts.ChartType.PIE)
    .addRange(sheet.getRange('F4:G20'))
    .setPosition(5, 10, 0, 0)
    .setOption('title', 'Tỷ lệ nghi vấn gian lận theo lớp')
    .build();
  sheet.insertChart(chart2);
}

// ──────────────── 90-utils.gs ────────────────

// ====== TIỆN ÍCH ======

function sheetToObjects_(sheet) {
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  return values.slice(1)
    .filter(row => row.some(cell => cell !== ''))
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => obj[h] = row[i]);
      return obj;
    });
}

function jsonOutput_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function nameKey_(s) { return String(s || '').trim().toLowerCase(); }

/** Chặn chuỗi bị Sheet hiểu thành công thức (= + - @) nhưng giữ số/ngày như cũ. */
function noFormula_(value) {
  return typeof value === 'string' && /^[=+\-@]/.test(value) ? "'" + value : value;
}

/** Tab `name` trong file `spreadsheetId`; chưa có thì tạo kèm dòng tiêu đề (in đậm, cố định). */
function ensureTab_(spreadsheetId, name, headers) {
  const ss = SpreadsheetApp.openById(spreadsheetId);
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}
