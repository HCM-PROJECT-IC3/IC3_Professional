// ====== SỔ LỚP DÙNG CHUNG THEO TRƯỜNG (diem-danh.html) ======
// Router: classBooks, classBookSave, classBookRemove (admin + giáo viên đã duyệt).
// Trước đây mỗi giáo viên tự dán link sổ của điều phối trên máy mình và classSheetWrite ghi được mọi file.
// Nay 1 người dán, cả trường dùng chung: tab SoLopTruong (file SPREADSHEET_ID_DATA), mỗi file 1 dòng gắn 1 trường.
// Máy chủ chỉ trả sổ thuộc các trường Admin đã gán trên hồ sơ (who.schools / schoolIds) → giáo viên trường khác
// không nhận được mã file, đăng nhập máy nào cũng có đủ sổ. 0 lượt Firestore ngoài xác thực (đã nhớ 1 giờ).
//
// Sổ riêng tư (classSheetRead, classSheetInfo): Sheet có ngày sinh học sinh, điều phối có thể tắt "Bất kỳ ai có đường
// liên kết" và chỉ chia sẻ cho tài khoản deploy; trang không đọc thẳng được thì đọc qua đây. Tài khoản deploy mở được cả
// file dữ liệu của hệ thống, nên 2 route này chỉ trả tab đúng mẫu FORM QUẢN LÝ LỚP và không bao giờ mở file hệ thống.

const SHEET_CLASS_BOOKS = 'SoLopTruong';
const CLASS_BOOK_HEADERS = ['FileId', 'SchoolId', 'Truong', 'TieuDe', 'Tabs', 'NguoiThem', 'CapNhat'];
const CLASS_BOOK_CACHE_KEY = 'classbooks1';
const CLASS_BOOK_CACHE_SEC = 30 * 60; // ghi sổ là xoá bản đệm; hạn ngắn phòng lượt đọc chậm đè lại bản cũ
const CLASS_BOOK_MAX_SAVE = 20;
const CLASS_READ_MAX_TABS = 30;

function classBookTab_() {
  return ensureTab_(SPREADSHEET_ID_DATA, SHEET_CLASS_BOOKS, CLASS_BOOK_HEADERS);
}

/** Mọi sổ (qua bản đệm): [{ id, schoolId, school, title, tabs, by }]. Chỉ dùng trong máy chủ — chưa lọc theo trường. */
function classBooksAll_() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get(CLASS_BOOK_CACHE_KEY);
  if (hit) return JSON.parse(hit);
  const sheet = classBookTab_();
  const last = sheet.getLastRow();
  const rows = last < 2 ? [] : sheet.getRange(2, 1, last - 1, 6).getDisplayValues();
  const books = rows.filter(function (r) { return r[0]; }).map(function (r) {
    let tabs = [];
    try { tabs = JSON.parse(r[4]); } catch (e) { tabs = []; }
    return { id: r[0], schoolId: r[1], school: r[2], title: r[3], tabs: tabs, by: r[5] };
  });
  const text = JSON.stringify(books);
  if (text.length < 90000) cache.put(CLASS_BOOK_CACHE_KEY, text, CLASS_BOOK_CACHE_SEC);
  return books;
}

/**
 * Sổ người gọi được thấy + các trường được gán (ô chọn trường khi thêm sổ).
 * Admin (who.schools = null) thấy mọi sổ; schools = các trường đang có sổ.
 */
function classBooks_(p, who) {
  const scope = whoSchoolIdSet_(who);
  const all = classBooksAll_();
  const names = scope ? who.schools : all.map(function (b) { return b.school; });
  return {
    all: !scope,
    schools: names.filter(function (n, i) { return names.indexOf(n) === i; }),
    books: all.filter(function (b) { return !scope || scope.has(b.schoolId); }).map(function (b) {
      return { id: b.id, school: b.school, title: b.title, tabs: b.tabs, own: b.by === who.uid };
    }),
  };
}

function cleanClassBook_(b) {
  const id = String((b && b.id) || '');
  const school = String((b && b.school) || '').trim().slice(0, 160);
  const tabs = (b && Array.isArray(b.tabs) ? b.tabs : []).slice(0, 200).map(function (t) {
    return { gid: String((t && t.gid) || '0'), name: String((t && t.name) || '').trim().slice(0, 80) };
  }).filter(function (t) { return /^\d{1,12}$/.test(t.gid) && t.name; });
  if (!/^[A-Za-z0-9_-]{20,}$/.test(id) || !schoolIdOf_(school) || !tabs.length) {
    throw appError_('invalid-argument', 'Sổ lớp thiếu mã file, trường hoặc danh sách lớp.');
  }
  refuseSystemFile_(id);
  return { id: id, school: school, title: String((b && b.title) || 'Sổ lớp').slice(0, 200), tabs: tabs };
}

/** Dòng hiện có của từng file: { id: { row, schoolId, by } }. */
function classBookRows_(sheet) {
  const last = sheet.getLastRow();
  const out = {};
  (last < 2 ? [] : sheet.getRange(2, 1, last - 1, 6).getDisplayValues()).forEach(function (r, i) {
    if (r[0]) out[r[0]] = { row: i + 2, schoolId: r[1], by: r[5] };
  });
  return out;
}

/**
 * Thêm sổ / cập nhật danh sách lớp (giữ người thêm đầu tiên). Chỉ vào trường mình được gán;
 * file đã thuộc trường ngoài phạm vi thì từ chối, không nói là trường nào.
 * p: { books: [{ id, school, title, tabs: [{ gid, name }] }] }
 */
function classBookSave_(p, who) {
  const items = Array.isArray(p.books) ? p.books : [];
  if (!items.length || items.length > CLASS_BOOK_MAX_SAVE) throw appError_('invalid-argument', 'Mỗi lần thêm 1–' + CLASS_BOOK_MAX_SAVE + ' sổ.');
  const books = items.map(cleanClassBook_);
  const scope = whoSchoolIdSet_(who);
  books.forEach(function (b) {
    if (!inWhoScope_(who, b.school)) throw appError_('permission-denied', 'Tài khoản chưa được gán trường "' + b.school + '" — nhờ Admin gán trước.');
  });
  const sheet = classBookTab_(); // ngoài khoá: ensureTab_ có thể tự lấy khoá chung
  withRareLock_(function () {
    const rows = classBookRows_(sheet);
    // Kiểm hết trước khi ghi: 1 sổ bị từ chối thì cả lượt không đổi gì
    books.forEach(function (b) {
      if (rows[b.id] && scope && !scope.has(rows[b.id].schoolId)) throw appError_('conflict', 'Sổ này đã thuộc một trường khác.');
    });
    books.forEach(function (b) {
      const old = rows[b.id];
      const line = [asText_(b.id), asText_(schoolIdOf_(b.school)), asText_(b.school), asText_(b.title),
        asText_(JSON.stringify(b.tabs)), old ? old.by : who.uid, new Date()];
      if (old) sheet.getRange(old.row, 1, 1, line.length).setValues([line]);
      else sheet.appendRow(line);
    });
    CacheService.getScriptCache().remove(CLASS_BOOK_CACHE_KEY);
  });
  auditServer_('update_class_books', who, { saved: books.map(function (b) { return b.id; }) });
  return classBooks_(p, who);
}

/** Gỡ sổ khỏi trường: người đã thêm hoặc Admin. File trên Google không bị đụng tới. p: { id } */
function classBookRemove_(p, who) {
  const id = String(p.id || '');
  const sheet = classBookTab_();
  withRareLock_(function () {
    const old = classBookRows_(sheet)[id];
    if (!old) return;
    if (who.schools && old.by !== who.uid) throw appError_('permission-denied', 'Chỉ người đã thêm sổ hoặc Admin mới gỡ được.');
    sheet.deleteRow(old.row);
    CacheService.getScriptCache().remove(CLASS_BOOK_CACHE_KEY);
  });
  auditServer_('update_class_books', who, { removed: id });
  return classBooks_(p, who);
}

/** Ghi điểm danh chỉ vào sổ của trường người gọi được gán (Admin: mọi file). */
function requireClassBook_(who, sheetId) {
  const scope = whoSchoolIdSet_(who);
  if (!scope) return;
  const ok = classBooksAll_().some(function (b) { return b.id === String(sheetId) && scope.has(b.schoolId); });
  if (!ok) throw appError_('permission-denied', 'Sổ này không thuộc trường được gán cho tài khoản — nhờ Admin gán trường hoặc thêm sổ ở thẻ Cài đặt.');
}

function refuseSystemFile_(id) {
  if ([SPREADSHEET_ID_DATA, SPREADSHEET_ID_REPORT].concat(logSpreadsheetIds_()).indexOf(id) !== -1) {
    throw appError_('permission-denied', 'Đây không phải sổ lớp.');
  }
}

function openClassFile_(sheetId) {
  const id = String(sheetId || '');
  if (!/^[A-Za-z0-9_-]{20,}$/.test(id)) throw appError_('invalid-argument', 'Mã file Sheet không hợp lệ.');
  refuseSystemFile_(id);
  try { return SpreadsheetApp.openById(id); } catch (e) {
    throw appError_('permission-denied', NO_EDIT_MSG_);
  }
}

/** Bảng hiển thị của tab nếu đúng mẫu FORM QUẢN LÝ LỚP, không thì null. */
function classTabRows_(sh) {
  const nRow = sh.getLastRow(), nCol = sh.getLastColumn();
  if (!nRow || !nCol) return null;
  const disp = sh.getRange(1, 1, nRow, nCol).getDisplayValues();
  return classSheetFind_(disp, 'TIẾT') && classSheetFind_(disp, 'BÀI DẠY') ? disp : null;
}

/** Cùng dạng /export?format=csv của Google: web phân tích và ghi theo đúng vị trí dòng/cột như đọc thẳng. */
function classRowsCsv_(rows) {
  return rows.map(function (r) {
    return r.map(function (v) { return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(',');
  }).join('\n');
}

/** Đọc các tab lớp của 1 sổ trong phạm vi người gọi. p: { sheetId, gids: [...] } → { tabs: { gid: csv } } (tab sai mẫu bị bỏ). */
function classSheetRead_(p, who) {
  const gids = Array.isArray(p.gids) ? p.gids.map(String) : [];
  if (!gids.length || gids.length > CLASS_READ_MAX_TABS) throw appError_('invalid-argument', 'Mỗi lần đọc 1–' + CLASS_READ_MAX_TABS + ' lớp.');
  const ss = openClassFile_(p.sheetId);
  requireClassBook_(who, p.sheetId);
  const tabs = {};
  ss.getSheets().forEach(function (sh) {
    const gid = String(sh.getSheetId());
    if (gids.indexOf(gid) === -1) return;
    const rows = classTabRows_(sh);
    if (rows) tabs[gid] = classRowsCsv_(rows);
  });
  return { tabs: tabs };
}

/**
 * Thêm sổ riêng tư: web không đọc được tên file + danh sách tab nên hỏi ở đây. Chưa thuộc trường nào thì người có mã file
 * xem được tên tab; không trả nội dung lớp (phải thêm vào trường mình mới đọc được). p: { sheetId } → { title, school, tabs }
 */
function classSheetInfo_(p, who) {
  const ss = openClassFile_(p.sheetId);
  const scope = whoSchoolIdSet_(who);
  const book = classBooksAll_().filter(function (b) { return b.id === String(p.sheetId); })[0];
  if (book && scope && !scope.has(book.schoolId)) throw appError_('conflict', 'Sổ này đã thuộc một trường khác.');
  let school = '';
  const tabs = [];
  ss.getSheets().forEach(function (sh) {
    const rows = classTabRows_(sh);
    if (!rows) return;
    tabs.push({ gid: String(sh.getSheetId()), name: sh.getName() });
    const at = !school && classSheetFind_(rows, 'TRƯỜNG');
    if (at) school = String(rows[at.r][at.c + 1] || '').trim();
  });
  if (!tabs.length) throw appError_('failed-precondition', 'File này không có tab đúng mẫu FORM QUẢN LÝ LỚP.');
  return { title: ss.getName(), school: school, tabs: tabs };
}
