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
const ROLES_TEACH = ['admin', 'teacher'];                              // trang Điểm danh (sổ lớp điều phối)

// Hàm (không phải hằng) để không phụ thuộc thứ tự nạp file khi dán thành nhiều file .gs.
function routes_() {
  return {
    ping:          { roles: null,          handler: function () { return { version: BACKEND_VERSION }; } },
    submitExam:    { roles: null,          handler: function (p) { return writeSubmissionLog_(p.payload); } },
    mosSubmit:     { roles: null,          handler: function (p) { return writeMosLog_(p.payload); } },
    listResults:   { roles: ROLES_RESULTS, handler: listResults_ },
    wrongStats:    { roles: ROLES_RESULTS, handler: wrongStats_ },
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
    arenaRoomLog:  { roles: ROLES_STAFF,   handler: arenaRoomLog_ },
    arenaRelayTicket: { roles: ROLES_STAFF, handler: arenaRelayTicket_ },
    classSheetWrite:  { roles: ROLES_TEACH, handler: classSheetWrite_ },
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
