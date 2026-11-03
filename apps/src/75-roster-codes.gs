// ====== DANH SÁCH LỚP THEO MÃ (chế độ EduBackend.roster.mode = 'class-code') ======
// Router: publishRosterCodes (Admin), rosterByCode (công khai — học sinh không đăng nhập).
// Thay cho file công khai data/roster/students-active.json (ai có URL cũng tải được tên MỌI học
// sinh — docs/architecture/AUDIT-2.0.md §5.1): mỗi lớp 1 mã 6 ký tự ngẫu nhiên, giáo viên phát cho
// lớp; nhập đúng mã mới thấy tên của ĐÚNG lớp đó. 32^6 ≈ 1 tỉ mã → không dò được.
// Tab MaLop (file SPREADSHEET_ID_DATA): 1 dòng/lớp. Đẩy lại roster giữ nguyên mã lớp cũ.

const SHEET_ROSTER_CODES = 'MaLop';
const ROSTER_CODE_HEADERS = ['MaLop', 'Truong', 'Lop', 'SoHocSinh', 'DanhSach', 'CapNhat'];
const ROSTER_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 ký tự, bỏ I O 0 1 (dễ đọc nhầm)
const ROSTER_CODE_LEN = 6;
// Dữ liệu chỉ đổi khi Admin đẩy roster (lúc đó xoá + nạp lại) → giữ tối đa của CacheService (6 giờ)
const ROSTER_CODE_CACHE_SEC = 6 * 60 * 60;
const ROSTER_CODE_MISS_SEC = 10 * 60;

function normalizeRosterCode_(s) {
  return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Mã mới chưa dùng — lấy từ Utilities.getUuid() (ngẫu nhiên v4), 256 % 32 = 0 nên phân bố đều. */
function newRosterCode_(taken) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const hex = Utilities.getUuid().replace(/-/g, '');
    let code = '';
    for (let i = 0; i < ROSTER_CODE_LEN; i++) code += ROSTER_CODE_ALPHABET.charAt(parseInt(hex.substr(i * 2, 2), 16) % 32);
    if (!taken.has(code)) return code;
  }
  throw appError_('internal', 'Không tạo được mã lớp mới.');
}

function rosterCodeKey_(school, className) {
  return schoolIdOf_(school) + '|' + String(className || '').trim().toLowerCase();
}

/**
 * Admin đẩy roster (cùng nội dung với publishRoster_) → cấp/giữ mã từng lớp, ghi tab MaLop.
 * p: { content: chuỗi JSON { students:[{school, className, name}] } }
 * @returns {{ classes: Array<{code, school, className, count}>, students: number }}
 */
function publishRosterCodes_(p, who) {
  const content = String(p.content || '');
  if (!content || content.length > 5 * 1024 * 1024) throw appError_('invalid-argument', 'Roster rỗng hoặc quá lớn (tối đa 5 MB).');
  let data;
  try { data = JSON.parse(content); } catch (e) { throw appError_('invalid-argument', 'Roster không phải JSON hợp lệ.'); }
  const students = data && data.students;
  const ok = Array.isArray(students) && students.length > 0 && students.every(function (s) {
    return s && typeof s.name === 'string' && typeof s.className === 'string' && typeof s.school === 'string';
  });
  if (!ok) throw appError_('invalid-argument', 'Roster sai cấu trúc (cần students: [{school, className, name}]).');

  const groups = {};
  students.forEach(function (s) {
    const name = s.name.trim();
    if (!name || !s.className.trim() || !s.school.trim()) return;
    const key = rosterCodeKey_(s.school, s.className);
    const g = groups[key] = groups[key] || { school: s.school.trim(), className: s.className.trim(), names: {} };
    g.names[name] = true;
  });

  return withRareLock_(function () {
    const sheet = ensureTab_(SPREADSHEET_ID_DATA, SHEET_ROSTER_CODES, ROSTER_CODE_HEADERS);
    const last = sheet.getLastRow();
    const old = last > 1 ? sheet.getRange(2, 1, last - 1, 3).getDisplayValues() : [];
    const codeByKey = {};
    const taken = new Set();
    old.forEach(function (r) {
      const code = normalizeRosterCode_(r[0]);
      if (!code) return;
      taken.add(code);
      codeByKey[rosterCodeKey_(r[1], r[2])] = code;
    });

    const now = new Date();
    const rows = Object.keys(groups).sort().map(function (key) {
      const g = groups[key];
      const code = codeByKey[key] || newRosterCode_(taken);
      taken.add(code);
      const names = Object.keys(g.names).sort(function (a, b) { return a.localeCompare(b, 'vi'); });
      return [code, noFormula_(g.school), noFormula_(g.className), names.length, JSON.stringify(names), now];
    });

    if (last > 1) sheet.getRange(2, 1, last - 1, ROSTER_CODE_HEADERS.length).clearContent();
    if (rows.length) sheet.getRange(2, 1, rows.length, ROSTER_CODE_HEADERS.length).setValues(rows);
    // Bỏ bản đệm của mọi mã cũ + mới (lớp đổi danh sách / bị bỏ), rồi nạp sẵn mã đang dùng
    const cache = CacheService.getScriptCache();
    cache.removeAll([].concat.apply([], Array.from(taken).map(function (code) { return ['rc:' + code, 'rcx:' + code]; })));
    warmRosterCodes_(rows.map(function (r) {
      return [r[0], String(r[1]).replace(/^'/, ''), String(r[2]).replace(/^'/, ''), r[3], r[4]];
    }));

    const total = rows.reduce(function (n, r) { return n + r[3]; }, 0);
    auditServer_('publish_roster', who, { mode: 'class-code', classes: rows.length, students: total });
    return {
      students: total,
      classes: rows.map(function (r) { return { code: r[0], school: String(r[1]).replace(/^'/, ''), className: String(r[2]).replace(/^'/, ''), count: r[3] }; }),
    };
  });
}

/**
 * Nạp bản đệm cho MỌI lớp cùng lúc. Đầu giờ cả lớp (hoặc nhiều lớp) cùng nhập mã: nếu mỗi lượt
 * trượt bản đệm tự mở Sheet (~1–2 giây) thì vài chục lượt có thể chiếm hết 30 lượt chạy song song
 * của Apps Script — bài nộp của lớp khác bị từ chối đúng lúc đó. Nay 1 lượt đọc nạp cả bảng.
 * rows: [[mã, trường, lớp, số HS, danh sách JSON], ...] (giá trị hiển thị).
 * @returns {Object} { mã: {school, className, names} }
 */
function warmRosterCodes_(rows) {
  const byCode = {};
  const put = {};
  rows.forEach(function (r) {
    const code = normalizeRosterCode_(r[0]);
    if (!code) return;
    let names = [];
    try { names = JSON.parse(r[4]); } catch (e) { names = []; }
    byCode[code] = { school: r[1], className: r[2], names: Array.isArray(names) ? names : [] };
    put['rc:' + code] = JSON.stringify(byCode[code]);
  });
  const keys = Object.keys(put);
  for (let i = 0; i < keys.length; i += 500) { // putAll tối đa ~1.000 khoá / lần
    const chunk = {};
    keys.slice(i, i + 500).forEach(function (k) { chunk[k] = put[k]; });
    CacheService.getScriptCache().putAll(chunk, ROSTER_CODE_CACHE_SEC);
  }
  return byCode;
}

/** Công khai: mã lớp → { school, className, names }. Mã sai → not-found (không lộ mã nào tồn tại). */
function rosterByCode_(p) {
  const code = normalizeRosterCode_(p.code);
  if (code.length !== ROSTER_CODE_LEN || /[^A-Z2-9]|[IO]/.test(code)) throw appError_('invalid-argument', 'Mã lớp gồm 6 chữ/số, ví dụ K7P2QX.');
  const cache = CacheService.getScriptCache();
  const hit = cache.get('rc:' + code);
  if (hit) return JSON.parse(hit);
  // Mã gõ sai vừa tra → không mở Sheet lại (đẩy roster mới xoá dấu này)
  if (cache.get('rcx:' + code)) throw appError_('not-found', 'Không tìm thấy lớp với mã này.');

  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID_DATA).getSheetByName(SHEET_ROSTER_CODES);
  const last = sheet ? sheet.getLastRow() : 0;
  const all = last < 2 ? {} : warmRosterCodes_(sheet.getRange(2, 1, last - 1, 5).getDisplayValues());
  if (all[code]) return all[code];
  cache.put('rcx:' + code, '1', ROSTER_CODE_MISS_SEC);
  throw appError_('not-found', 'Không tìm thấy lớp với mã này.');
}
