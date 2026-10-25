// ====== ĐỌC / XOÁ KẾT QUẢ CHO DASHBOARD (thay Firestore quiz_results) ======
// Router: 'listResults' (admin / điều phối / giáo viên đã duyệt), 'deleteResults'
// (admin / điều phối). Người gọi đã được xác thực ở 10-router.gs → tham số `who`.

/** Các file nhật ký, MỚI NHẤT trước (file chính là cũ nhất). */
function logSpreadsheetIds_() {
  const history = JSON.parse(cachedProp_(LOG_HISTORY_PROP) || '[]');
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
  const out = {
    id: r[0], studentName: r[1], studentClass: r[2], studentSchool: r[3], testName: r[4],
    category: parts[0] || '', level: parts[1] || '', minitest: parts.slice(2).join(' › '),
    score: Number(r[5]) || 0, correct: correct, total: total,
    incorrect: Math.max(0, total - correct), skipped: 0,
    // Cột H ghi "mm:ss"; bản cũ bị Sheet đổi thành giờ ("68:08:00") — chỉ lấy 2 phần đầu.
    elapsedSec: (Number(t[0]) || 0) * 60 + (Number(t[1]) || 0),
    tabSwitches: Number(r[8]) || 0, clicks: Number(r[9]) || 0,
    integrityOk: integrityOk, flags: flags, timedOut: note.indexOf('Hết giờ') !== -1,
    // O — CauSai: "a,b" | "-" (không sai câu nào) | trống (bài do web cũ gửi, không có dữ liệu).
    examMode: r[13] || '', wrong: r[14] && r[14] !== '-' ? String(r[14]).split(',') : [], wrongTracked: !!r[14],
    submittedAtMs: ms, source: 'sheet'
  };
  return applyDetail_(out, r[15]);
}

/** Cột P ChiTiet (bài nộp từ 10/2026): ghi đè các trường ở trên bằng số liệu chính xác. */
function applyDetail_(out, raw) {
  if (!raw) return out;
  let d;
  try { d = JSON.parse(raw); } catch (e) { return out; }
  if (!d || typeof d !== 'object') return out;
  out.incorrect = Number(d.i) || 0;
  out.skipped = Number(d.s) || 0;
  if (Number(d.e) > 0) out.elapsedSec = Number(d.e);
  if (d.c || d.l || d.m) { out.category = String(d.c || ''); out.level = String(d.l || ''); out.minitest = String(d.m || ''); }
  out.timedOut = !!d.to;
  const v = Array.isArray(d.v) ? d.v : [];
  ['multiTabHits', 'fullscreenExits', 'appSwitches', 'devtoolsHits', 'shortcutBlocks', 'printAttempts']
    .forEach(function (k, i) { out[k] = Number(v[i]) || 0; });
  return out;
}

/**
 * "Câu cả lớp hay sai" — tổng hợp cột O (CauSai) NGAY TRÊN SERVER rồi trả về bảng gọn
 * (≤ WRONG_STATS_TOP câu), thay vì gửi hàng nghìn bài về trình duyệt. Dùng chung bộ
 * lọc/quyền với listResults_. Không đụng Firestore (chỉ xác thực người gọi như mọi API).
 * p: { schools?, classes?, sinceMs?, testName? }
 * @returns {{ submissions, withData, truncated, items: [{uid, count, students, tests}] }}
 *   submissions = số bài trong phạm vi; withData = số bài có dữ liệu cột CauSai (mẫu số để
 *   tính % sai — bài cũ trước khi có cột O không tính); students = số HS khác nhau làm sai.
 */
function wrongStats_(p, who) {
  const res = listResults_({ schools: p.schools, classes: p.classes, sinceMs: p.sinceMs, limit: READ_MAX_ROWS }, who);
  const wantTest = p.testName ? String(p.testName) : '';
  const byUid = {};
  let submissions = 0;
  let withData = 0;
  res.rows.forEach(function (r) {
    if (wantTest && r.testName !== wantTest) return;
    submissions++;
    if (!r.wrongTracked) return;
    withData++;
    const student = nameKey_(r.studentName) + '|' + String(r.studentClass || '').toLowerCase();
    r.wrong.forEach(function (uid) {
      const e = byUid[uid] || (byUid[uid] = { uid: uid, count: 0, students: {}, tests: {} });
      e.count++;
      e.students[student] = 1;
      e.tests[r.testName] = (e.tests[r.testName] || 0) + 1;
    });
  });
  const items = Object.keys(byUid).map(function (k) {
    const e = byUid[k];
    const tests = Object.keys(e.tests).sort(function (a, b) { return e.tests[b] - e.tests[a]; });
    return { uid: e.uid, count: e.count, students: Object.keys(e.students).length, tests: tests.slice(0, 3) };
  }).sort(function (a, b) { return (b.count - a.count) || (b.students - a.students) || (a.uid < b.uid ? -1 : 1); });
  return { submissions: submissions, withData: withData, truncated: res.truncated, items: items.slice(0, WRONG_STATS_TOP) };
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
  // Bài nộp ghi song song không khoá (30-submissions.gs) → rất hiếm khi 1 mã có 2 dòng; giữ dòng mới nhất
  const seenIds = new Set();
  let scanned = 0;
  let done = false;
  let truncated = false;
  const ids = logSpreadsheetIds_();
  for (let f = 0; f < ids.length && !done; f++) {
    const sheet = SpreadsheetApp.openById(ids[f]).getSheetByName(SHEET_SUBMISSION_LOG);
    if (!sheet) continue;
    let end = sheet.getLastRow();
    // Dashboard làm mới (sinceMs) thường chỉ có vài chục bài mới: đọc khối nhỏ trước rồi
    // tăng ×4 — trước đây luôn đọc 5.000 dòng × 16 cột (~1–2 giây Apps Script/lần làm mới,
    // chiếm 1 trong 30 lượt chạy song song mà học sinh nộp bài cũng cần).
    let chunk = sinceMs ? 200 : READ_CHUNK_ROWS;
    while (end >= 2 && !done) {
      const start = Math.max(2, end - chunk + 1);
      chunk = Math.min(READ_CHUNK_ROWS, chunk * 4);
      const n = end - start + 1;
      const shown = sheet.getRange(start, 1, n, LOG_HEADERS.length).getDisplayValues();
      const times = sheet.getRange(start, 12, n, 1).getValues();
      for (let i = n - 1; i >= 0; i--) {
        const r = shown[i];
        const ms = submittedMs_(times[i][0]);
        if (sinceMs && ms && ms < sinceMs) { done = true; break; }
        if (!r[0] || seenIds.has(r[0])) continue;
        seenIds.add(r[0]);
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
