
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
  trimColumnsOnce_(sheet, headers.length);
  return sheet;
}

// ====== TRẦN 10 TRIỆU Ô / FILE ======
// Google Sheet tính CẢ Ô TRỐNG vào trần 10 triệu ô mỗi file. Tab mới mặc định 26 cột →
// tab nhật ký 300.000 dòng thật ra chiếm 7,8 triệu ô (không phải 300.000 × 16), và các tab
// nhật ký khác (MOS, hoạt động, Đấu trường) cùng nằm trong file chính → file đầy trước khi
// kịp xoay vòng, mọi lần ghi sau đó báo lỗi. Nay: cắt cột trống thừa + xoay vòng theo TỔNG
// số ô của cả file (FILE_CELL_BUDGET), áp dụng cho mọi tab nhật ký.
const FILE_CELL_BUDGET = 8000000; // chừa 2 triệu ô cho tab khác + phần tăng giữa 2 lần đo

/** Xoá cột trống phía sau `n` cột dữ liệu (tối đa 1 lần/6 giờ mỗi tab — cờ trong cache). */
function trimColumnsOnce_(sheet, n) {
  const cache = CacheService.getScriptCache();
  const flag = 'trim:' + sheet.getParent().getId() + ':' + sheet.getName();
  if (cache.get(flag)) return;
  const max = sheet.getMaxColumns();
  if (max > n) sheet.deleteColumns(n + 1, max - n);
  cache.put(flag, '1', DEDUPE_TTL_SEC);
}

/** Tổng số ô (kể cả trống) của file — đo lại tối đa 15 phút/lần (getSheets tốn thời gian). */
function fileCells_(ss) {
  const cache = CacheService.getScriptCache();
  const key = 'cells:' + ss.getId();
  const hit = cache.get(key);
  if (hit) return Number(hit);
  const n = ss.getSheets().reduce(function (sum, sh) { return sum + sh.getMaxRows() * sh.getMaxColumns(); }, 0);
  cache.put(key, String(n), 900);
  return n;
}

/** Tab nhật ký đầy (quá MAX_LOG_ROWS dòng) hoặc file chứa nó sắp chạm trần ô → cần file mới. */
function logTabFull_(sheet) {
  return sheet.getLastRow() >= MAX_LOG_ROWS || fileCells_(sheet.getParent()) >= FILE_CELL_BUDGET;
}

/** Tạo file mới chỉ có 1 tab `name` (đúng số cột), ghi vào DanhMucNhatKy của file chính. */
function newLogFile_(name, headers) {
  const stamp = Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd HH:mm');
  const file = SpreadsheetApp.create(name + ' ' + stamp);
  const fresh = file.getSheets()[0].setName(name);
  fresh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
  fresh.setFrozenRows(1);
  const max = fresh.getMaxColumns();
  if (max > headers.length) fresh.deleteColumns(headers.length + 1, max - headers.length);
  const main = SpreadsheetApp.openById(SPREADSHEET_ID_REPORT);
  const catalog = main.getSheetByName(SHEET_LOG_CATALOG) || main.insertSheet(SHEET_LOG_CATALOG);
  if (catalog.getLastRow() === 0) catalog.appendRow(['TaoLuc', 'TenFile', 'DuongDan']);
  catalog.appendRow([new Date(), file.getName(), file.getUrl()]);
  return { file: file, sheet: fresh };
}

/**
 * Tab nhật ký phụ (NhatKyMOS, NhatKyHoatDong, NhatKyDauTruong...) để appendRow: nằm ở file
 * chính cho tới khi đầy, rồi tự chuyển sang file riêng "<tên tab> <ngày giờ>" (Script
 * Property LOGFILE_<tên tab>, đọc qua cache). Bài nộp IC3 có hàm riêng getSubmissionLogSheet_.
 */
function logTab_(name, headers) {
  const key = 'LOGFILE_' + name;
  const sheet = ensureTab_(cachedProp_(key) || SPREADSHEET_ID_REPORT, name, headers);
  if (!logTabFull_(sheet)) return sheet;
  const made = newLogFile_(name, headers);
  setCachedProp_(key, made.file.getId());
  return made.sheet;
}

/**
 * Script Property đọc qua CacheService. PropertiesService của tài khoản Gmail thường chỉ
 * cho 50.000 lượt đọc/ghi MỖI NGÀY — trước đây MỖI bài nộp đọc LOG_SPREADSHEET_ID (và mỗi
 * lần dashboard tải đọc lịch sử file nhật ký) → mùa thi 100.000 bài/ngày vượt trần, Apps
 * Script báo lỗi quota cho mọi bài nộp sau đó. CacheService không giới hạn lượt; hết hạn /
 * bị dọn thì đọc lại Properties 1 lần. Giá trị null lưu thành '\u0000'.
 */
function cachedProp_(key) {
  const cache = CacheService.getScriptCache();
  const hit = cache.get('prop:' + key);
  if (hit !== null && hit !== undefined) return hit === '\u0000' ? null : hit;
  const v = PropertiesService.getScriptProperties().getProperty(key);
  cache.put('prop:' + key, v === null || v === undefined ? '\u0000' : v, DEDUPE_TTL_SEC);
  return v === undefined ? null : v;
}

/** Ghi Script Property + cập nhật luôn bản trong cache (các lượt chạy khác thấy ngay). */
function setCachedProp_(key, value) {
  PropertiesService.getScriptProperties().setProperty(key, value);
  CacheService.getScriptCache().put('prop:' + key, value, DEDUPE_TTL_SEC);
}
