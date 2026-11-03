/* Chạy apps/Code.gs trong Node với SpreadsheetApp / UrlFetchApp / Maps... GIẢ LẬP —
   không gọi Google/Firebase/GitHub thật. Chạy: node apps/__tests__/code-gs.test.js */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

let fails = 0;
const eq = (label, a, b) => {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  if (!ok) fails++;
  console.log((ok ? 'PASS  ' : 'FAIL  ') + label + (ok ? '' : '  got ' + JSON.stringify(a) + ' want ' + JSON.stringify(b)));
};

// ── Sheet giả: mỗi dòng { disp: [14 chuỗi hiển thị], L: Date | chuỗi giờ cũ } ──
function mkSheet(rows) {
  const data = [{ disp: ['SubmissionId', 'HoTen', 'Lop', 'Truong', 'BaiThi', 'Diem', 'SoCauDung', 'ThoiGianLam',
    'SoLanChuyenTab', 'SoLanClick', 'TrangThai', 'ThoiGianNop', 'GhiChu', ''], L: 'ThoiGianNop' }].concat(rows);
  const sheet = {
    data,
    getLastRow: () => data.length,
    getLastColumn: () => 14,
    getParent: () => mainFile,
    getName: () => 'NhatKyNopBai',
    maxCols: 26, // tab thật mặc định 26 cột
    getMaxColumns: () => sheet.maxCols,
    getMaxRows: () => data.length,
    deleteColumns: (from, n) => { sheet.maxCols -= n; sheet.deletedCols = [from, n]; },
    appendRow: (v) => data.push({ disp: v.map((x) => (x instanceof Date ? 'DATE' : String(x).replace(/^'/, ''))), L: v[11], rawIn: v }),
    deleteRow: (r) => data.splice(r - 1, 1),
    getRange(a, b, n, c) {
      if (a === 'L2:L') return { setNumberFormat: () => {} };
      if (a === 'A:A') {
        return { createTextFinder: (id) => ({ matchEntireCell: () => ({ findNext: () => {
          const i = data.findIndex((d) => d.disp[0] === id);
          return i < 0 ? null : { getRow: () => i + 1 };
        } }) }) };
      }
      if (n === undefined) {
        return {
          getValue: () => data[a - 1].disp[b - 1],
          setValue: (v) => { data[a - 1].disp[b - 1] = v; },
          getDisplayValue: () => data[a - 1].disp[b - 1],
        };
      }
      const slice = data.slice(a - 1, a - 1 + n);
      return {
        getDisplayValues: () => slice.map((d) => d.disp.slice(b - 1, b - 1 + c)),
        getValues: () => slice.map((d) => [d.L]),
      };
    },
  };
  return sheet;
}
function row(id, name, cls, school, test, score, cd, time, status, L, note, mode) {
  return { disp: [id, name, cls, school, test, String(score), cd, time, '0', '10', status, typeof L === 'string' ? L : 'x', note || '', mode || ''], L };
}
const sheet = mkSheet([
  row('old1', 'Nguyễn A', '4A6', 'TH X', 'Spark (GS6) › Spark LV2 › 1. Căn bản', 54, '13/24', '5:05', 'OK', '16:59:17 5/10/2026'),
  row('old2', 'Trần B', '3/12', 'TH Y', 'Spark (GS6) › Spark LV1 › Bài 1', 25, '3/12', '0:45', 'OK', '19:19:12 6/10/2026'),
  row('old3', 'Lê C', '4/2', 'TH Y', 'Spark (GS6) › Spark LV2 › Tổng hợp', 11, '4/36', '68:08:00', '⚠️ Rời khỏi tab 5 lần', '22:22:39 6/10/2026', 'Thoát toàn màn hình'),
  row('new1', 'Hà Mai Phương', '4A6', 'TH X', 'Spark (GS6) › Spark LV2 › Bài 9', 100, '14/14', '2:06', 'OK', new Date('2026-10-12T12:45:38Z'), '', 'test'),
  row('new2', 'nguyễn a ', '4A6', 'TH X', 'Spark (GS6) › Spark LV2 › Bài 9', 70, '7/10', '1:00', 'OK', new Date('2026-10-12T13:00:00Z'), 'Hết giờ', 'practice'),
]);
// Tab HocSinh / KetQua cho API cũ
const tableSheet = (rows) => ({ getDataRange: () => ({ getValues: () => rows }) });
const rosterSheet = tableSheet([['MSHS', 'HoTen', 'Lop', 'Truong', 'Email'],
  ['1', 'A', '4A6', 'TH X', 'a@x'], ['2', 'B', '5A1', 'TH Y', 'b@y']]);
const scoresSheet = tableSheet([['Timestamp', 'MSHS', 'HoTen', 'Lop', 'BaiThi', 'DiemSo', 'ThoiGianLamPhut', 'TrangThai', 'ChiTietLoaiCauHoi'],
  ['t', '1', 'A', '4A6', 'B1', 8, 5, 'Đã nộp', ''], ['t', '2', 'B', '5A1', 'B1', 6, 5, 'Đã nộp', '']]);

// Tab tạo mới bằng ensureTab_ (NhatKyMOS, NhatKyHoatDong...)
function plainTab(name, file) {
  const t = { rows: [], header: null, maxCols: 26, name: name || 'Sheet1' };
  t.appendRow = (v) => t.rows.push(v);
  t.setFrozenRows = () => {};
  // Dòng 1 = tiêu đề, dòng 2.. = t.rows. Đủ cho ensureLogSheetLayout_ + listResults_ đọc lại.
  const cell = (r, c) => (r === 1 ? (t.header || [])[c - 1] : (t.rows[r - 2] || [])[c - 1]);
  t.getRange = (a, b, n, c) => ({
    setValues: (v) => { t.header = v[0]; return { setFontWeight: () => {} }; },
    setValue: (v) => { if (a === 1) { t.header = t.header || []; t.header[b - 1] = v; } },
    setNumberFormat: () => {},
    getDisplayValues: () => Array.from({ length: n || 1 }, (_, i) => Array.from({ length: c || 1 }, (_, j) => {
      const v = cell(a + i, (b || 1) + j);
      return v === undefined || v === null ? '' : v instanceof Date ? 'DATE' : String(v).replace(/^'/, '');
    })),
    getValues: () => Array.from({ length: n || 1 }, (_, i) => [cell(a + i, b || 1)]),
  });
  t.getLastRow = () => t.rows.length + (t.header ? 1 : 0);
  t.getMaxColumns = () => t.maxCols;
  t.getMaxRows = () => Math.max(1000, t.rows.length + 1);
  t.deleteColumns = (from, n) => { t.maxCols -= n; };
  t.getName = () => t.name;
  t.setName = (n) => { t.name = n; return t; };
  t.getParent = () => file || mainFile;
  return t;
}
const tabs = { NhatKyNopBai: sheet, HocSinh: rosterSheet, KetQua: scoresSheet };
// File chính + các file nhật ký mới tạo khi xoay vòng (SpreadsheetApp.create).
const mainFile = { getId: () => 'MAIN', getSheetByName: (n) => tabs[n] || null, insertSheet: (n) => (tabs[n] = plainTab(n)),
  getSheets: () => Object.values(tabs).filter((t) => t.getMaxColumns), getName: () => 'MAIN', getUrl: () => 'url:MAIN' };
const createdFiles = {};
function newFile(name) {
  const id = 'F' + (Object.keys(createdFiles).length + 1);
  const f = { id, name, tabs: {} };
  const first = plainTab('Sheet1', null);
  Object.assign(f, {
    getId: () => id, getName: () => name, getUrl: () => 'url:' + id,
    getSheets: () => [first].concat(Object.values(f.tabs)),
    getSheetByName: (n) => (first.name === n ? first : f.tabs[n] || null),
    insertSheet: (n) => (f.tabs[n] = plainTab(n, f)),
  });
  first.getParent = () => f;
  createdFiles[id] = f;
  return f;
}

// ── Dịch vụ Apps Script giả ──
const cacheStore = new Map();
const props = new Map();
let propReads = 0;
let firestoreCalls = 0;
let rawFetches = 0;
let rawFail = false;
const github = { calls: [], files: {}, headSha: 'c0', treeShas: { 'data/ic3/meta.json': 'sha-meta' } };
let users = {};
let geocodeCalls = 0;
let lockWaits = 0;
let onLock = null;
// Gemini giả (78-ai.gs): gemini.mode 'ok' | 429 | 403 | 404; đếm lượt gọi, nhớ key + thân yêu cầu cuối
const gemini = { mode: 'ok', calls: 0, lastKey: '', lastBody: null, lastUrl: '' };
const ctx = {
  console, Date, JSON, Math, Set, Map, String, Number, Array, Object, encodeURIComponent, Error,
  SpreadsheetApp: { openById: (id) => createdFiles[id] || mainFile, create: (name) => newFile(name) },
  CacheService: { getScriptCache: () => ({ get: (k) => cacheStore.get(k) || null, put: (k, v) => cacheStore.set(k, v), remove: (k) => cacheStore.delete(k),
    getAll: (ks) => Object.fromEntries(ks.filter((k) => cacheStore.has(k)).map((k) => [k, cacheStore.get(k)])),
    putAll: (o) => Object.entries(o).forEach(([k, v]) => cacheStore.set(k, v)), removeAll: (ks) => ks.forEach((k) => cacheStore.delete(k)) }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => { propReads++; return props.get(k) || null; }, setProperty: (k, v) => props.set(k, v),
    getKeys: () => [...props.keys()], deleteProperty: (k) => props.delete(k) }) },
  // lockWaits đếm lượt chờ khoá chung; onLock giả lập 1 lượt chạy KHÁC làm gì đó trong lúc mình chờ khoá.
  LockService: { getScriptLock: () => ({ waitLock() { lockWaits++; if (onLock) { const f = onLock; onLock = null; f(); } }, tryLock() { return true; }, releaseLock() {} }),
    getUserLock: () => ({ waitLock() {}, releaseLock() {} }) },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ setMimeType: () => ({ text: t }) }) },
  Utilities: {
    DigestAlgorithm: { SHA_256: 'sha256' },
    computeDigest: (alg, s) => [...crypto.createHash('sha256').update(s).digest()],
    base64EncodeWebSafe: (b) => Buffer.from(b).toString('base64url'),
    base64DecodeWebSafe: (s) => [...Buffer.from(s, 'base64url')],
    newBlob: (bytes) => ({ getDataAsString: () => Buffer.from(bytes).toString('utf8') }),
    formatDate: () => '20261012',
    getUuid: () => crypto.randomUUID(),
  },
  UrlFetchApp: {
    fetch(url, opt) {
      if (url.startsWith('https://generativelanguage.googleapis.com/')) {
        gemini.calls++; gemini.lastKey = opt.headers['x-goog-api-key']; gemini.lastBody = JSON.parse(opt.payload); gemini.lastUrl = url;
        if (gemini.mode !== 'ok') return { getResponseCode: () => gemini.mode, getContentText: () => (gemini.mode === 403 ? '{"error":{"status":"PERMISSION_DENIED"}}' : '{}') };
        return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ candidates: [{ content: { parts: [{ text: 'nghĩ', thought: true }, { text: 'Lời giải #' + gemini.calls }] }, finishReason: 'STOP' }] }) };
      }
      if (url.startsWith('https://firestore.googleapis.com/')) {
        firestoreCalls++;
        const tok = opt.headers.Authorization.replace('Bearer ', '');
        const u = users[decodeURIComponent(url.split('/users/')[1])];
        const ok = tok.endsWith('.sig-ok') && u;
        return { getResponseCode: () => (ok ? 200 : 403), getContentText: () => JSON.stringify(ok ? { fields: u } : {}) };
      }
      // File đề trên raw.githubusercontent.com (chấm lại bài Kiểm tra) → đọc data/ic3 trên máy
      if (url.startsWith('https://raw.githubusercontent.com/HCM-PROJECT-IC3/IC3_Professional/main/data/ic3/')) {
        rawFetches++;
        if (rawFail) return { getResponseCode: () => 503, getContentText: () => '' };
        const f = path.join(__dirname, '..', '..', 'data', 'ic3', url.split('/data/ic3/')[1]);
        return { getResponseCode: () => 200, getContentText: () => fs.readFileSync(f, 'utf8') };
      }
      // GitHub giả
      const p = url.replace('https://api.github.com/repos/HCM-PROJECT-IC3/IC3_Professional/', '');
      const body = opt.payload ? JSON.parse(opt.payload) : null;
      github.calls.push(opt.method.toUpperCase() + ' ' + p.split('?')[0]);
      const json = (o) => ({ getResponseCode: () => 200, getContentText: () => JSON.stringify(o) });
      if (p.startsWith('contents/')) return { getResponseCode: () => 200, getContentText: () => '{"raw":true}' };
      if (p === 'git/ref/heads/main') return json({ object: { sha: github.headSha } });
      if (p.startsWith('git/commits/')) return json({ tree: { sha: 't0' } });
      if (p.startsWith('git/trees/t0')) return json({ tree: Object.entries(github.treeShas).map(([k, v]) => ({ path: k, sha: v })) });
      if (p === 'git/blobs') return json({ sha: 'blob-' + github.calls.length });
      if (p === 'git/trees') { github.lastTree = body; return json({ sha: 't1' }); }
      if (p === 'git/commits') { github.lastCommit = body; return json({ sha: 'c1' }); }
      if (p === 'git/refs/heads/main') { github.headSha = body.sha; return json({}); }
      return { getResponseCode: () => 404, getContentText: () => 'not found' };
    },
  },
  Maps: {
    newGeocoder: () => {
      const g = { bounds: null, setRegion: () => g, setLanguage: () => g, setBounds: (...b) => { g.bounds = b; return g; },
        geocode: (addr) => {
          geocodeCalls++;
          if (/không tồn tại/.test(addr)) return { status: 'ZERO_RESULTS', results: [] };
          const school = /Trường/.test(addr);
          return { status: 'OK', results: [{ formatted_address: school ? 'Trường ABC, Q.1' : 'Nhà, Q.3',
            partial_match: /hẻm/.test(addr), geometry: { location: school ? { lat: 10.78, lng: 106.70 } : { lat: 10.77, lng: 106.68 }, location_type: 'ROOFTOP' } }] };
        } };
      return g;
    },
    newDirectionFinder: () => {
      const d = { setOrigin: () => d, setDestination: () => d, setMode: () => d, setLanguage: () => d,
        getDirections: () => ({ status: 'OK', routes: [{ legs: [{ distance: { value: 4567 } }] }] }) };
      return d;
    },
    DirectionFinder: { Mode: { DRIVING: 'driving' } },
  },
  MailApp: { sendEmail() {} },
};
vm.createContext(ctx);
const src = fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8');
vm.runInContext(src + '\n;this.__api = { handleRequest_, asText_, submittedMs_, doGet, noFormula_, kiemTraSauDeploy, schoolIdOf_, questionStatus_, answerKeyOf_, aiBuild_ };', ctx);
const api = ctx.__api;
const call = (action, p) => JSON.parse(JSON.stringify(api.handleRequest_(Object.assign({ action }, p || {}))));

function token(uid, o = {}) {
  const body = Buffer.from(JSON.stringify({ user_id: uid, aud: o.aud || 'data-ic3',
    exp: Math.floor(Date.now() / 1000) + (o.expIn || 3600) })).toString('base64url');
  return 'h.' + body + '.' + (o.bad ? 'sig-bad' : 'sig-ok');
}
const S = (v) => ({ stringValue: v });
users = {
  admin1: { role: S('admin') },
  teachX: { role: S('teacher'), approved: { booleanValue: true }, schools: { arrayValue: { values: [S('TH X')] } } },
  teachPending: { role: S('teacher'), approved: { booleanValue: false } },
  coordY: { role: S('coordinator'), schools: { arrayValue: { values: [S('TH Y')] } } },
  // Tên gán khác hoa/thường + dấu cách so với cột Trường trên Sheet ("TH Y") — vẫn cùng schoolId.
  coordYvariant: { role: S('coordinator'), schools: { arrayValue: { values: [S('  th   y ')] } } },
  // Chỉ có schoolIds (hồ sơ chuyển hẳn sang schoolId), không có schools tên.
  schoolAdminY: { role: S('school_admin'), schools: { arrayValue: { values: [] } }, schoolIds: { arrayValue: { values: [S('th-y')] } } },
  tcoord: { role: S('teaching_coordinator') },
  student: { role: S('student') },
};
const as = (uid, o) => ({ idToken: token(uid, o) });

// ── Tiện ích ──
eq('asText_ "7/24" thành chữ', api.asText_('7/24'), "'7/24");
eq('asText_ công thức bị vô hiệu', api.asText_('=HYPERLINK("x")'), "'=HYPERLINK(\"x\")");
eq('asText_ tên thường giữ nguyên', api.asText_('Hà Mai Phương'), 'Hà Mai Phương');
eq('noFormula_ giữ số và ngày', [api.noFormula_(0.9), api.noFormula_('2026-08-13'), api.noFormula_('=1+1')], [0.9, '2026-08-13', "'=1+1"]);
eq('giờ VN chuỗi cũ → UTC', new Date(api.submittedMs_('16:59:17 5/10/2026')).toISOString(), '2026-10-05T09:59:17.000Z');

// ── Router / API cũ không còn công khai ──
eq('GET getRoster bị chặn', JSON.parse(api.doGet({ parameter: { action: 'getRoster' } }).text).code, 'moved');
eq('GET không action = kiểm tra sống', JSON.parse(api.doGet({ parameter: {} }).text).ok, true);
eq('POST getRoster không đăng nhập bị chặn', call('getRoster').code, 'unauthenticated');
eq('giáo viên không gọi được getRoster', call('getRoster', as('teachX')).code, 'permission-denied');
eq('điều phối Y chỉ thấy roster trường Y', call('getRoster', as('coordY')).data.map((r) => r.MSHS), ['2']);
eq('điều phối Y chỉ thấy điểm học sinh trường Y', call('getScores', as('coordY')).data.map((r) => r.MSHS), ['2']);
eq('getDashboard dùng vai trò thật (không có roster cho điều phối)', call('getDashboard', as('coordY')).data.roster, undefined);
eq('admin có roster trong getDashboard', call('getDashboard', as('admin1')).data.roster.length, 2);
eq('action lạ', call('hack').code, 'not-found');

// ── Quyền đọc kết quả ──
const ids = (r) => (r.ok ? r.data.rows.map((x) => x.id) : r.code);
eq('admin thấy mọi bài, mới nhất trước', ids(call('listResults', as('admin1'))), ['new2', 'new1', 'old3', 'old2', 'old1']);
eq('giáo viên chỉ thấy trường mình', ids(call('listResults', as('teachX'))), ['new2', 'new1', 'old1']);
eq('giáo viên xin trường khác → rỗng', ids(call('listResults', Object.assign(as('teachX'), { schools: ['TH Y'] }))), []);
eq('điều phối trường Y', ids(call('listResults', as('coordY'))), ['old3', 'old2']);
eq('tên trường khác hoa/thường/dấu cách vẫn khớp (schoolId)', ids(call('listResults', as('coordYvariant'))), ['old3', 'old2']);
eq('quản trị trường chỉ có schoolIds', ids(call('listResults', as('schoolAdminY'))), ['old3', 'old2']);
eq('quản trị trường xin trường khác → rỗng', ids(call('listResults', Object.assign(as('schoolAdminY'), { schools: ['TH X'] }))), []);
eq('quản trị trường xem roster trường mình', call('getRoster', as('schoolAdminY')).data.map((r) => r.MSHS), ['2']);
{
  // schoolIdOf_ (Apps Script) PHẢI giống js/models/school.model.js — lệch thì rules và Sheet lọc khác nhau
  const jsCtx = { window: {} };
  vm.createContext(jsCtx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'models', 'school.model.js'), 'utf8'), jsCtx);
  const names = ['THCS Huỳnh Tấn Phát', 'Tiểu học Đinh Bộ Lĩnh', '  THCS  Lê Lợi (Q.3) ', 'Nguyễn Du'.normalize('NFD'), 'TH Y', '', 'Trường 19/5'];
  eq('schoolIdOf_ giống bản JS', names.map(api.schoolIdOf_), names.map(jsCtx.window.EduModels.School.schoolIdOf));
}
eq('giáo viên chưa duyệt bị từ chối', call('listResults', as('teachPending')).code, 'permission-denied');
eq('điều phối giáo viên không xem điểm', call('listResults', as('tcoord')).code, 'permission-denied');
eq('học sinh bị từ chối', call('listResults', as('student')).code, 'permission-denied');
eq('token giả mạo bị từ chối', call('listResults', as('admin1', { bad: true })).code, 'unauthenticated');
eq('token project khác bị từ chối', call('listResults', as('admin1', { aud: 'other' })).code, 'unauthenticated');
eq('token hết hạn bị từ chối', call('listResults', as('admin1', { expIn: -10 })).code, 'unauthenticated');
const before = firestoreCalls; call('listResults', as('admin1')); call('listResults', as('admin1'));
eq('xác thực được nhớ: không đọc Firestore lại', firestoreCalls - before, 0);

// ── Lọc + tải tăng dần + phục hồi dữ liệu cũ ──
eq('lọc lớp', ids(call('listResults', Object.assign(as('admin1'), { classes: ['3/12'] }))), ['old2']);
eq('lọc 1 học sinh', ids(call('listResults', Object.assign(as('teachX'), { studentName: 'Nguyễn A' }))), ['new2', 'old1']);
eq('sinceMs chỉ lấy bài mới', ids(call('listResults', Object.assign(as('admin1'), { sinceMs: Date.parse('2026-10-12T12:50:00Z') }))), ['new2']);
eq('limit', call('listResults', Object.assign(as('admin1'), { limit: 2 })).data.rows.length, 2);
const all = Object.fromEntries(call('listResults', as('admin1')).data.rows.map((r) => [r.id, r]));
eq('SoCauDung "13/24"', [all.old1.correct, all.old1.total, all.old1.incorrect], [13, 24, 11]);
eq('"68:08:00" (bị đổi thành giờ) → 68 phút 8 giây', all.old3.elapsedSec, 68 * 60 + 8);
eq('tách tên bài', [all.new1.category, all.new1.level, all.new1.minitest], ['Spark (GS6)', 'Spark LV2', 'Bài 9']);
eq('nghi vấn → flags', [all.old3.integrityOk, all.old3.flags], [false, ['Rời khỏi tab 5 lần', 'Thoát toàn màn hình']]);
eq('Hết giờ → timedOut', [all.new2.timedOut, all.new2.flags], [true, []]);
eq('chế độ', [all.new1.examMode, all.new2.examMode], ['test', 'practice']);

// ── Nộp bài (công khai) ──
const sub = (p) => call('submitExam', { payload: Object.assign({ submissionId: 'abcdef123', studentName: 'A', studentClass: '3/12',
  studentSchool: 'TH X', testName: 'T', score: 50, correct: '7/24', time: '5:05', tabSwitch: 0, clickCount: 1, status: 'OK', note: '', examMode: 'practice' }, p) });
eq('nộp bài hợp lệ', sub({}).data, { written: true, duplicate: false });
const w = sheet.data[sheet.data.length - 1].rawIn;
eq('lớp/số câu/thời gian ghi thành chữ + cột CheDo', [w[2], w[6], w[7], w[13], w.length], ["'3/12", "'7/24", "'5:05", 'practice', 16]);
eq('web cũ không gửi ChiTiet → cột P trống', w[15], '');
eq('web cũ không gửi câu sai → cột CauSai trống', w[14], '');
eq('gửi lại cùng mã → trùng, không ghi thêm', sub({}).data.duplicate, true);
eq('tab cũ được thêm tiêu đề CheDo', sheet.data[0].disp[13], 'CheDo');
eq('điểm ngoài 0-100 bị từ chối', sub({ submissionId: 'zz1234567', score: 500 }).code, 'invalid-argument');
eq('tên quá dài bị từ chối', sub({ submissionId: 'zz1234568', studentName: 'x'.repeat(500) }).code, 'invalid-argument');
eq('mã bài lạ bị từ chối', sub({ submissionId: '../../etc' }).code, 'invalid-argument');
// ── Quota PropertiesService (50.000 lượt/ngày): bài nộp đọc qua cache ──
const readsBefore = propReads;
for (let k = 0; k < 20; k++) sub({ submissionId: 'quota' + String(k).padStart(5, '0'), testName: 'QuotaTest' });
call('listResults', as('teachX')); call('listResults', as('teachX'));
eq('20 bài nộp + 2 lần tải dashboard → ≤ 2 lượt đọc Properties', propReads - readsBefore <= 2, true);

// ── Cột P ChiTiet: Sheet đủ dữ liệu như quiz_results ──
const det = { i: 5, s: 2, e: 754, c: 'IC3 (GS6)', l: 'IC3 LV1', m: 'Bài 1. A › B', to: 1, v: [3, 1, 0, 2, 4, 0], hack: '<x>' };
eq('ChiTiet hợp lệ được ghi', sub({ submissionId: 'det1234567', studentSchool: 'TH X', testName: 'DetTest', detail: det }).data.written, true);
eq('ChiTiet chỉ giữ khoá biết trước (bỏ khoá lạ)', JSON.parse(sheet.data[sheet.data.length - 1].rawIn[15]).hack, undefined);
eq('ChiTiet sai kiểu bị từ chối', sub({ submissionId: 'det1234568', detail: { i: -1 } }).code, 'invalid-argument');
eq('ChiTiet chữ thay object bị từ chối', sub({ submissionId: 'det1234569', detail: 'x' }).code, 'invalid-argument');
eq('tab cũ được thêm tiêu đề ChiTiet', sheet.data[0].disp[15], 'ChiTiet');
const dr = call('listResults', as('teachX')).data.rows.find((r) => r.id === 'det1234567');
eq('listResults dùng ChiTiet: sai/bỏ qua/giây/bài/hết giờ/vi phạm',
  [dr.incorrect, dr.skipped, dr.elapsedSec, dr.category, dr.level, dr.minitest, dr.timedOut, dr.multiTabHits, dr.devtoolsHits, dr.shortcutBlocks],
  [5, 2, 754, 'IC3 (GS6)', 'IC3 LV1', 'Bài 1. A › B', true, 3, 2, 4]);
eq('mã cũ dạng sub_… vẫn nhận', sub({ submissionId: 'sub_123_1791194357301' }).ok, true);
// ── Nhiều lớp nộp cùng lúc: không còn khoá chung quanh appendRow ──
const lw0 = lockWaits;
for (let k = 0; k < 5; k++) sub({ submissionId: 'nolock' + String(k).padStart(4, '0'), testName: 'NoLock' });
eq('nộp bài không chờ khoá chung (ghi song song)', lockWaits - lw0, 0);
// Không khoá → hiếm khi 2 request cùng mã cùng lúc ghi 2 dòng: listResults chỉ trả 1
sheet.data.push(row('dup0000001', 'Dup', '4A6', 'TH X', 'DupTest', 10, '1/10', '1:00', 'OK', new Date('2026-10-20T01:00:00Z')));
sheet.data.push(row('dup0000001', 'Dup', '4A6', 'TH X', 'DupTest', 10, '1/10', '1:00', 'OK', new Date('2026-10-20T01:00:01Z')));
eq('listResults bỏ dòng trùng mã', call('listResults', as('admin1')).data.rows.filter((r) => r.id === 'dup0000001').length, 1);

// ── Xoá ──
const del = (uid, list) => call('deleteResults', Object.assign(as(uid), { ids: list }));
eq('giáo viên không được xoá', del('teachX', ['new1']).code, 'permission-denied');
eq('điều phối Y không xoá bài trường X', del('coordY', ['new1']).data.deleted, 0);
eq('điều phối Y xoá bài trường Y', del('coordY', ['old2']).data.deleted, 1);
eq('admin xoá nhiều bài', del('admin1', ['new1', 'abcdef123', 'khong-co']).data.deleted, 2);

// ── Bản đồ ──
const dist = (uid, o, d) => call('mapDistance', Object.assign(as(uid), { origin: o, destination: d }));
eq('tính km (làm tròn 0,1)', dist('tcoord', '12 Lê Lợi, Q.3', 'Trường ABC, TP.HCM').data, { km: 4.6, matchedSchoolAddress: 'Trường ABC, Q.1', approximateHome: false });
const g0 = geocodeCalls; dist('tcoord', '12 Lê Lợi, Q.3', 'Trường ABC, TP.HCM');
eq('kết quả được nhớ: không geocode lại', geocodeCalls - g0, 0);
eq('địa chỉ hẻm → xấp xỉ', dist('tcoord', 'hẻm 5, Q.3', 'Trường ABC').data.approximateHome, true);
eq('không định vị được → null', dist('tcoord', 'nơi không tồn tại', 'Trường ABC').data, null);
eq('học sinh không dùng được bản đồ', dist('student', 'a', 'b').code, 'permission-denied');
cacheStore.set('mapsq:tcoord:20261012', '150');
eq('vượt giới hạn/ngày/người', dist('tcoord', 'địa chỉ mới', 'Trường XYZ').code, 'resource-exhausted');

// ── GitHub ──
eq('chưa có GITHUB_TOKEN → báo cấu hình', call('githubReadFile', Object.assign(as('admin1'), { path: 'data/ic3/meta.json' })).code, 'failed-precondition');
props.set('GITHUB_TOKEN', 'ghp_test');
eq('đọc file data/', call('githubReadFile', Object.assign(as('admin1'), { path: 'data/ic3/meta.json' })).data.text, '{"raw":true}');
eq('không đọc/ghi ngoài data/ img/', call('githubReadFile', Object.assign(as('admin1'), { path: 'js/auth.js' })).code, 'invalid-argument');
eq('chặn ../', call('githubPublish', Object.assign(as('admin1'), { files: [{ path: 'data/../js/x.js', content: 'x' }] })).code, 'invalid-argument');
eq('điều phối không đẩy GitHub', call('githubPublish', Object.assign(as('coordY'), { files: [{ path: 'data/a.json', content: '{}' }] })).code, 'permission-denied');
eq('xung đột (file đã đổi trên GitHub) → dừng', call('githubPublish', Object.assign(as('admin1'), {
  files: [{ path: 'data/ic3/meta.json', content: '{}' }], expectedShas: { 'data/ic3/meta.json': 'sha-cu' } })).code, 'conflict');
const pub = call('githubPublish', Object.assign(as('admin1'), { message: 'cập nhật',
  files: [{ path: 'data/ic3/meta.json', content: '{"a":1}' }, { path: 'img/x.png', base64: 'iVBORw0=' }],
  expectedShas: { 'data/ic3/meta.json': 'sha-meta' } }));
eq('đẩy 2 file trong 1 commit', [pub.data && pub.data.sha, github.lastTree.tree.map((t) => t.path), github.headSha], ['c1', ['data/ic3/meta.json', 'img/x.png'], 'c1']);
eq('commit ghi người đẩy', /admin1/.test(github.lastCommit.message), true);

// ── Kết quả MOS (công khai) ──
const mos = (p) => call('mosSubmit', { payload: Object.assign({ submissionId: 'mos1234567', studentName: 'A', studentClass: '7A1',
  studentSchool: 'TH X', projectId: 'tiet3-project1', projectTitle: 'Dự án 1', score: 80, autoTotal: 5, passedCount: 4, manualCount: 1,
  results: [{ id: 1, label: 'Task 1', passed: true, manual: false, note: '' }] }, p) });
eq('MOS: ghi vào tab NhatKyMOS (tự tạo kèm tiêu đề)', [mos({}).data.written, tabs.NhatKyMOS.header[0], tabs.NhatKyMOS.rows.length], [true, 'SubmissionId', 1]);
eq('MOS: điểm + task', tabs.NhatKyMOS.rows[0].slice(6, 10), [80, 4, 5, 1]);
eq('MOS: gửi lại cùng mã → trùng', [mos({}).data.duplicate, tabs.NhatKyMOS.rows.length], [true, 1]);
mos({ submissionId: 'mos7654321', score: null });
eq('MOS: toàn task thủ công → điểm để trống', tabs.NhatKyMOS.rows[1][6], '');
eq('MOS: dữ liệu sai bị từ chối', mos({ submissionId: 'mos0000001', score: 999 }).code, 'invalid-argument');

// ── Bài nộp theo lô từ máy chủ trường (server/relay.js) ──
const exam = (id) => ({ action: 'submitExam', payload: { submissionId: id, studentName: 'Lô', studentClass: '6A1', studentSchool: 'TH X',
  testName: 'BatchTest', score: 60, correct: '6/10', time: '3:00', status: 'OK', examMode: 'test' } });
const batchItems = [exam('batch000001'), exam('batch000002'), exam('batch000001'), exam('../bad'),
  { action: 'mosSubmit', payload: { submissionId: 'mosbatch01', studentName: 'Lô', score: 50, results: [] } }, { action: 'githubPublish', payload: {} }];
eq('lô: chưa đặt RELAY_TOKEN → tắt', call('submitBatch', { token: 'x', items: batchItems }).code, 'failed-precondition');
props.set('RELAY_TOKEN', 'tok-123');
eq('lô: sai mã → từ chối', call('submitBatch', { token: 'nope', items: batchItems }).code, 'permission-denied');
eq('lô: quá BATCH_MAX bài → từ chối', call('submitBatch', { token: 'tok-123', items: new Array(101).fill(exam('batch000009')) }).code, 'invalid-argument');
const rowsBefore = sheet.data.length;
const br = call('submitBatch', { token: 'tok-123', items: batchItems }).data.results;
eq('lô: từng bài có kết quả riêng (trùng mã / sai dữ liệu / action lạ không làm hỏng cả lô)',
  br.map((r) => (r.ok ? (r.data.duplicate ? 'dup' : 'ok') : r.code)), ['ok', 'ok', 'dup', 'invalid-argument', 'ok', 'invalid-argument']);
eq('lô: 2 bài IC3 vào NhatKyNopBai', sheet.data.length - rowsBefore, 2);
eq('lô: bài MOS vào NhatKyMOS', tabs.NhatKyMOS.rows.some((r) => r[0] === 'mosbatch01'), true);
{
  const realOpen = ctx.SpreadsheetApp.openById;
  let opens = 0;
  ctx.SpreadsheetApp.openById = (id) => { opens++; return realOpen(id); };
  const many = Array.from({ length: 20 }, (_, k) => exam('memo' + String(k).padStart(6, '0')));
  call('submitBatch', { token: 'tok-123', items: many });
  const batchOpens = opens;
  opens = 0;
  for (let k = 0; k < 20; k++) call('submitExam', exam('memx' + String(k).padStart(6, '0')));
  eq('lô 20 bài: mở Sheet 1 lần (bài lẻ: mỗi bài 1 lần)', [batchOpens, opens], [1, 20]);
  ctx.SpreadsheetApp.openById = realOpen;
  call('submitExam', exam('afterbatch1'));
  eq('hết lô → bài lẻ không dùng lại tab đã nhớ', sheet.data[sheet.data.length - 1].disp[0], 'afterbatch1');
}

// ── Nhật ký hoạt động ──
eq('nhật ký: không đăng nhập thì không ghi được', call('logActivity', { activity: 'login' }).code, 'unauthenticated');
eq('nhật ký: hành động lạ bị từ chối', call('logActivity', Object.assign(as('teachX'), { activity: 'drop_db' })).code, 'invalid-argument');
call('logActivity', Object.assign(as('teachX'), { activity: 'login', page: 'teacher-dashboard', meta: { a: 1 } }));
const logRow = tabs.NhatKyHoatDong.rows.find((r) => r[3] === 'login');
eq('nhật ký: uid/vai trò lấy từ tài khoản thật', [logRow[1], logRow[2], logRow[3], logRow[6]], ['teachX', 'teacher', 'login', 'teacher-dashboard']);

// ── Đấu trường: kết quả phòng cả lớp (1 lượt gọi/phòng) ──
const arenaSum = { code: 'ABC234', mode: 'speed', title: '=Bộ 1', startedAt: 1760500000000, endedAt: 1760500600000, questions: 10,
  players: [{ rank: 1, name: 'Lan', value: 8200, correct: 9, bestStreak: 6 }, { rank: 2, name: '+Minh', value: 5100, correct: 6, bestStreak: 3 }] };
eq('đấu trường: cần đăng nhập', call('arenaRoomLog', { summary: arenaSum }).code, 'unauthenticated');
eq('đấu trường: học sinh không ghi được', call('arenaRoomLog', Object.assign(as('student'), { summary: arenaSum })).code, 'permission-denied');
eq('đấu trường: mã phòng lạ bị từ chối', call('arenaRoomLog', Object.assign(as('teachX'), { summary: Object.assign({}, arenaSum, { code: 'x' }) })).code, 'invalid-argument');
eq('đấu trường: ghi mỗi người 1 dòng', call('arenaRoomLog', Object.assign(as('teachX'), { summary: arenaSum })).data, { written: 2 });
eq('đấu trường: gửi lại cùng phòng không ghi trùng', call('arenaRoomLog', Object.assign(as('teachX'), { summary: arenaSum })).data.duplicate, true);
// ── Đường dự phòng: trần chung mỗi ngày ──
eq('xin chỗ dự phòng: cần đăng nhập', call('arenaRelayTicket', { slots: 5 }).code, 'unauthenticated');
props.set('RELAY_DAILY_SLOTS', '12');
props.set('RELAY_USED_20000101', '99'); // bộ đếm ngày cũ phải bị dọn
const tk = (n) => call('arenaRelayTicket', Object.assign(as('teachX'), { slots: n })).data;
eq('xin chỗ: cấp theo gói, cộng dồn trong ngày', [tk(5), tk(5)], [{ granted: 5, used: 5, cap: 12 }, { granted: 5, used: 10, cap: 12 }]);
eq('xin chỗ: gần hết trần chỉ cấp phần còn lại, hết thì 0', [tk(5).granted, tk(5).granted], [2, 0]);
eq('xin chỗ: dọn bộ đếm ngày cũ', props.has('RELAY_USED_20000101'), false);
eq('xin chỗ: tối đa 10/lần', tk(50).granted <= 10, true);
const ar = tabs.NhatKyDauTruong.rows;
eq('đấu trường: tiêu đề + nội dung dòng (chặn công thức)', [tabs.NhatKyDauTruong.header[5], ar.length, ar[1][1], ar[1][2], ar[1][3], ar[1][5], ar[1][6], ar[1][10]],
  ['BietDanh', 2, 'ABC234', 'Tốc độ', "'=Bộ 1", "'+Minh", 5100, 'teachX']);
eq('đấu trường: chế độ Sinh tồn/Kéo co/Đấu phép/Giải mã lưu được (trước đây bị từ chối)',
  ['survival', 'tug', 'spell', 'heist'].map((m, i) => call('arenaRoomLog', Object.assign(as('teachX'), { summary: Object.assign({}, arenaSum, { mode: m, endedAt: arenaSum.endedAt + i + 1 }) })).ok), [true, true, true, true]);

// ── Cập nhật roster cho trang học sinh ──
const roster = JSON.stringify({ count: 1, students: [{ school: 'TH X', className: '4A6', name: 'A' }] });
eq('roster: điều phối không đẩy được', call('publishRoster', Object.assign(as('coordY'), { content: roster })).code, 'permission-denied');
eq('roster: sai cấu trúc bị từ chối', call('publishRoster', Object.assign(as('admin1'), { content: '{"students":[{"name":1}]}' })).code, 'invalid-argument');
const rp = call('publishRoster', Object.assign(as('admin1'), { content: roster }));
eq('roster: admin đẩy đúng 1 file data/roster/students-active.json', [rp.ok, github.lastTree.tree.map((t) => t.path)], [true, ['data/roster/students-active.json']]);
eq('nhật ký server: đẩy roster/câu hỏi + xoá bài đều được ghi', ['publish_roster', 'publish_questions', 'delete_results'].every((a) => tabs.NhatKyHoatDong.rows.some((r) => r[3] === a)), true);

// ── Câu cả lớp hay sai (cột O CauSai + API wrongStats) ──
eq('tab cũ được thêm tiêu đề CauSai', sheet.data[0].disp[14], 'CauSai');
eq('CauSai: ký tự lạ bị từ chối', sub({ submissionId: 'wr9999991', wrong: 'ic3__lv1__q1,<script>' }).code, 'invalid-argument');
eq('CauSai: uid MOS có dấu/khoảng trắng hợp lệ', sub({ submissionId: 'wr9999990', testName: 'MOS', wrong: 'mos_word__bài1,Bài 2: Xây dựng dữ liệu trong ô_3__v3' }).data.written, true);
eq('CauSai: quá 30 câu bị từ chối', sub({ submissionId: 'wr9999992', wrong: Array.from({ length: 31 }, (_, i) => 'u' + i).join(',') }).code, 'invalid-argument');
eq('CauSai: không phải chuỗi bị từ chối', sub({ submissionId: 'wr9999993', wrong: ['a'] }).code, 'invalid-argument');
sub({ submissionId: 'wr0000001', studentName: 'Ann', wrong: 'ic3__lv1__t1__q1,ic3__lv1__t1__q2' });
eq('CauSai ghi đúng uid', sheet.data[sheet.data.length - 1].rawIn[14], 'ic3__lv1__t1__q1,ic3__lv1__t1__q2');
sub({ submissionId: 'wr0000002', studentName: 'Bob', wrong: 'ic3__lv1__t1__q1' });
sub({ submissionId: 'wr0000003', studentName: 'Ann', wrong: '' });
eq('không sai câu nào → ghi "-"', sheet.data[sheet.data.length - 1].rawIn[14], '-');
sub({ submissionId: 'wr0000004', studentName: 'ann ', wrong: 'ic3__lv1__t1__q1' });
sub({ submissionId: 'wr0000005', studentName: 'Cy', testName: 'Khác', wrong: 'ic3__lv1__t1__q9' });
const ws = call('wrongStats', Object.assign(as('teachX'), { testName: 'T' })).data;
eq('wrongStats: mẫu số chỉ gồm bài có dữ liệu', [ws.submissions, ws.withData], [5, 4]);
eq('wrongStats: câu sai nhiều nhất trước, đếm HS khác nhau', ws.items, [
  { uid: 'ic3__lv1__t1__q1', count: 3, students: 2, tests: ['T'] },
  { uid: 'ic3__lv1__t1__q2', count: 1, students: 1, tests: ['T'] }]);
eq('wrongStats: không lọc bài → gồm cả bài khác', call('wrongStats', as('teachX')).data.items.map((x) => x.uid).includes('ic3__lv1__t1__q9'), true);
eq('wrongStats: trường khác không thấy', call('wrongStats', as('coordY')).data.withData, 0);
eq('wrongStats: cần đăng nhập', call('wrongStats').code, 'unauthenticated');
eq('listResults trả câu sai', call('listResults', as('teachX')).data.rows.find((r) => r.id === 'wr0000001').wrong, ['ic3__lv1__t1__q1', 'ic3__lv1__t1__q2']);

// ── Hàm kiểm tra sau deploy (người dùng chạy tay trên Apps Script thật) ──
const rowsBeforeSelf = sheet.data.length;
const selfOut = api.kiemTraSauDeploy();
eq('kiemTraSauDeploy: mọi mục ✅', selfOut.filter((x) => x.indexOf('❌') === 0), []);
eq('kiemTraSauDeploy: tự xoá bài mẫu', [sheet.data.length, sheet.data.some((d) => /^SELFTEST/.test(d.disp[0]))], [rowsBeforeSelf, false]);

// ── Trần 10 triệu ô/file (tính cả ô trống) ──
eq('tab nhật ký bài nộp: cắt cột trống 26 → 16', [sheet.maxCols, sheet.deletedCols], [16, [17, 10]]);
eq('tab nhật ký phụ (Đấu trường) cũng được cắt cột', tabs.NhatKyDauTruong.maxCols, 13);
// File chính "đầy" (giả lập 9 triệu ô) → MOS chuyển sang file riêng, bài nộp cũng vậy.
const realCells = mainFile.getSheets;
mainFile.getSheets = () => [{ getMaxRows: () => 1000000, getMaxColumns: () => 9 }];
cacheStore.forEach((v, k) => { if (String(k).indexOf('cells:') === 0) cacheStore.delete(k); });
mos({ submissionId: 'mosRot0001', score: 50 });
const mosFile = Object.values(createdFiles).find((f) => /^NhatKyMOS /.test(f.name));
eq('MOS: file chính sắp đầy → tạo file riêng NhatKyMOS <ngày>, ghi dòng vào đó', [!!mosFile, mosFile && mosFile.getSheets()[0].rows.length], [true, 1]);
eq('MOS: file mới chỉ giữ đúng số cột', mosFile.getSheets()[0].maxCols, mosFile.getSheets()[0].header.length);
eq('danh mục file nhật ký có thêm file MOS', tabs.DanhMucNhatKy.rows.some((r) => /^NhatKyMOS /.test(r[1])), true);
sub({ submissionId: 'rot0000001', testName: 'RotTest' });
const subFile = Object.values(createdFiles).find((f) => /^NhatKyNopBai /.test(f.name));
eq('bài nộp: file chính sắp đầy → sang file mới', [!!subFile, subFile && subFile.getSheets()[0].rows.length], [true, 1]);
// 2 lượt cùng thấy file đầy: lượt chờ khoá thấy lượt kia đã xoay file → ghi vào đó, không tạo thêm file
cacheStore.set('cells:' + subFile.getId(), '9000000');
const filesBefore = Object.keys(createdFiles).length;
let other = null;
onLock = () => {
  other = ctx.SpreadsheetApp.create('NhatKyNopBai lượt khác');
  other.getSheets()[0].setName('NhatKyNopBai');
  cacheStore.set('prop:LOG_SPREADSHEET_ID', other.getId());
};
sub({ submissionId: 'race000001', testName: 'RaceTest' });
eq('xoay file đồng thời: chỉ 1 file mới, bài ghi vào file lượt kia vừa tạo',
  [Object.keys(createdFiles).length - filesBefore, other && other.getSheets()[0].rows.length], [1, 1]);
mainFile.getSheets = realCells;
eq('listResults đọc được cả file mới', call('listResults', as('admin1')).data.rows.some((r) => r.id === 'rot0000001'), true);

// ── Ghi điểm danh vào sổ lớp của điều phối (classSheetWrite) ──
{
  const pad = (n) => String(n).padStart(2, '0');
  const show = (v) => (v instanceof Date ? pad(v.getDate()) + '.' + pad(v.getMonth() + 1) : v === true ? 'TRUE' : v === false ? 'FALSE' : String(v));
  const rows = [
    ['TRƯỜNG', 'TH X', '', '', '', '', '', '', ''],
    ['LỚP:', '3A1', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', ''],
    ['MÃ SỐ HS', 'HỌ & TÊN ', '', '', 'TIẾT', '1', '2', '3', ''],
    ['', '', '', '', 'THỨ', 'Thứ 3', 'Thứ 4', '', ''],
    ['', '', '', '', 'NGÀY', new Date(2026, 9, 6), new Date(2026, 9, 7), '', ''],
    ['', '', '', '', 'TÊN GV Bảo', '', '', '', ''],
    ['', '', '', '', 'BÀI DẠY', 'Bài 1', 'Bài 2', 'Bài 3', 'Bài 4'],
    ['', '', '', '', 'ĐÃ HOÀN THÀNH', true, true, false, false],
    ['HS1', 'Nguyễn An', '', '', '', 'x', 'x', '', ''],
    ['HS2', 'Trần  Bình', '', '', '', 'x', 'v', '', ''],
  ].map((r) => r.map((v) => ({ v, f: v instanceof Date ? 'dd.mm' : '' })));
  const tab = {
    getSheetId: () => 777, getLastRow: () => rows.length, getLastColumn: () => rows[0].length,
    getRange(r, c, nr, nc) {
      if (nr) return { getDisplayValues: () => rows.slice(r - 1, r - 1 + nr).map((x) => x.slice(c - 1, c - 1 + nc).map((y) => show(y.v))) };
      const cell = rows[r - 1][c - 1];
      const rg = { getValue: () => cell.v, getNumberFormat: () => cell.f, setValue: (v) => { cell.v = v; return rg; }, setNumberFormat: (f) => { cell.f = f; return rg; } };
      return rg;
    },
  };
  const CS = 'CLASSFORM_abcdefghijklmnop';
  createdFiles[CS] = { getSheets: () => [tab] };
  ctx.SpreadsheetApp.flush = () => {};
  const w = (who, o) => call('classSheetWrite', Object.assign(as(who), { sheetId: CS, gid: 777, cols: [{ col: 7, tiet: 3 }],
    marks: [{ row: 10, name: 'Nguyễn An', m: 'v' }, { row: 11, name: 'Trần Bình', m: 'x' }], ngay: '2026-10-13', done: true }, o));
  eq('sổ lớp: học sinh/điều phối không ghi được', [w('student').code, w('coordY').code], ['permission-denied', 'permission-denied']);
  eq('sổ lớp: tên trên Sheet đã đổi → từ chối, không ghi lệch', [w('teachX', { marks: [{ row: 10, name: 'Lê Chi', m: 'v' }] }).code, rows[10][7].v], ['conflict', '']);
  eq('sổ lớp: cột không còn là tiết đó → từ chối', w('teachX', { cols: [{ col: 6, tiet: 3 }] }).code, 'conflict');
  eq('sổ lớp: ký hiệu lạ / cột ngoài vùng', [w('teachX', { marks: [{ row: 10, name: 'Nguyễn An', m: '=HACK()' }] }).code, w('teachX', { cols: [{ col: 3, tiet: 3 }] }).code], ['invalid-argument', 'invalid-argument']);
  const ok = w('teachX');
  eq('sổ lớp: giáo viên ghi điểm danh + ngày (kiểu ngày như ô bên) + tick hoàn thành',
    [ok.data, rows[10][7].v, rows[11][7].v, show(rows[6][7].v), rows[6][7].f, rows[9][7].v], [{ written: 2, ngay: true, done: true }, 'v', 'x', '13.10', 'dd.mm', true]);
  eq('sổ lớp: ghi lại y hệt → không ghi gì, không đè ngày đã có', w('teachX', { ngay: '2026-10-20' }).data, { written: 0, ngay: false, done: false });
  eq('sổ lớp: tiết chưa hiện số (ô TIẾT trống) vẫn ghi được, ký hiệu Mới/NL',
    [w('teachX', { cols: [{ col: 8, tiet: 4 }], marks: [{ row: 10, name: 'Nguyễn An', m: 'nl' }, { row: 11, name: 'Trần Bình', m: 'moi' }], done: false }).data.written, rows[10][8].v, rows[11][8].v], [2, 'NL', 'Mới']);
}


// ── Danh sách lớp theo mã (75-roster-codes.gs) ──
{
  // Tab MaLop giả: ô lưu giá trị, getDisplayValues trả chuỗi như Sheet hiển thị
  const cells = [['MaLop', 'Truong', 'Lop', 'SoHocSinh', 'DanhSach', 'CapNhat']];
  const disp = (v) => (v instanceof Date ? 'DATE' : String(v).replace(/^'/, ''));
  tabs.MaLop = {
    getName: () => 'MaLop', getParent: () => mainFile, getMaxColumns: () => 6, deleteColumns() {},
    getLastRow: () => cells.length,
    getRange: (r, c, n, m) => ({
      getDisplayValues: () => cells.slice(r - 1, r - 1 + n).map((row) => row.slice(c - 1, c - 1 + m).map(disp)),
      clearContent: () => { cells.splice(r - 1, n); },
      setValues: (v) => { v.forEach((row, i) => { cells[r - 1 + i] = row.slice(); }); return { setFontWeight() {} }; },
    }),
  };
  const roster = (list) => ({ content: JSON.stringify({ students: list }) });
  const st = (school, className, name) => ({ school, className, name });
  const pub = (uid, list) => call('publishRosterCodes', Object.assign(as(uid), roster(list)));
  eq('mã lớp: chỉ Admin đẩy được', [pub('coordY', [st('TH Y', '5A1', 'B')]).code, call('publishRosterCodes', roster([st('TH Y', '5A1', 'B')])).code], ['permission-denied', 'unauthenticated']);
  const r1 = pub('admin1', [st('TH X', '4A6', 'Nguyễn A'), st('TH X', '4A6', 'An'), st('TH X', '4A6', 'An'), st('TH Y', '5A1', 'B'), st(' th x ', '4A6', 'Chi'), st('TH X', '', 'Thiếu lớp')]);
  eq('mã lớp: gộp theo trường + lớp (tên gõ lệch cùng 1 lớp), bỏ dòng thiếu lớp, bỏ tên trùng', [r1.data.classes.length, r1.data.students], [2, 4]);
  const codeX = r1.data.classes.find((c) => c.school === 'TH X').code;
  const codeY = r1.data.classes.find((c) => c.school === 'TH Y').code;
  eq('mã lớp: 6 ký tự, không có I O 0 1, 2 lớp 2 mã khác nhau', [/^[A-HJ-NP-Z2-9]{6}$/.test(codeX), /^[A-HJ-NP-Z2-9]{6}$/.test(codeY), codeX !== codeY], [true, true, true]);
  const get = (code) => call('rosterByCode', { code });
  eq('mã lớp: không cần đăng nhập, trả đúng 1 lớp, tên sắp xếp', get(codeX).data, { school: 'TH X', className: '4A6', names: ['An', 'Chi', 'Nguyễn A'] });
  eq('mã lớp: nhập thường/khoảng trắng/gạch vẫn nhận', get(' ' + codeY.slice(0, 3).toLowerCase() + '-' + codeY.slice(3) + ' ').data.names, ['B']);
  eq('mã lớp: mã sai định dạng / không tồn tại', [get('ABC').code, get('IIIIII').code, get(codeX === 'ZZZZZZ' ? 'YYYYYY' : 'ZZZZZZ').code], ['invalid-argument', 'invalid-argument', 'not-found']);
  // Đẩy lại: lớp cũ giữ mã, lớp bị bỏ mất mã, danh sách mới thay bản đệm cũ
  const r2 = pub('admin1', [st('TH X', '4A6', 'An'), st('TH X', '4A6', 'Dũng'), st('TH Z', '1A', 'E')]);
  eq('mã lớp: đẩy lại giữ nguyên mã lớp cũ', r2.data.classes.find((c) => c.school === 'TH X').code, codeX);
  eq('mã lớp: danh sách mới (không dùng bản đệm cũ)', get(codeX).data.names, ['An', 'Dũng']);
  eq('mã lớp: lớp không còn trong roster → mã hết hiệu lực', get(codeY).code, 'not-found');
  {
    // Đầu giờ nhiều lớp cùng nhập mã: không mở Sheet cho từng lượt
    const realOpen = ctx.SpreadsheetApp.openById;
    let opens = 0;
    ctx.SpreadsheetApp.openById = (id) => { opens++; return realOpen(id); };
    const r3 = pub('admin1', [st('TH X', '4A6', 'An'), st('TH Z', '1A', 'E'), st('TH Q', '2B', 'G')]);
    opens = 0;
    r3.data.classes.forEach((c) => { for (let k = 0; k < 15; k++) get(c.code); });
    eq('mã lớp: vừa đẩy roster → 45 lượt nhập mã, 0 lần mở Sheet', opens, 0);
    [...cacheStore.keys()].filter((k) => k.startsWith('rc:')).forEach((k) => cacheStore.delete(k)); // bản đệm hết hạn
    r3.data.classes.forEach((c) => { for (let k = 0; k < 15; k++) get(c.code); });
    eq('mã lớp: bản đệm hết hạn → 1 lượt đọc Sheet nạp lại MỌI lớp', [opens, get(r3.data.classes.find((c) => c.school === 'TH Q').code).data.names], [1, ['G']]);
    opens = 0;
    const wrong = r3.data.classes.some((c) => c.code === 'WWWWWW') ? 'XXXXXX' : 'WWWWWW';
    const wrongTries = [get(wrong).code, get(wrong).code, get(wrong).code];
    eq('mã lớp: gõ sai nhiều lần chỉ mở Sheet 1 lần', [wrongTries, opens], [['not-found', 'not-found', 'not-found'], 1]);
    ctx.SpreadsheetApp.openById = realOpen;
  }
  eq('mã lớp: tên lớp dạng công thức bị vô hiệu khi ghi Sheet', pub('admin1', [st('TH X', '=HACK()', 'A')]).ok && cells.slice(1).every((r) => !/^=/.test(String(r[2]))), true);
}


// ── Luật chấm Apps Script (77-grading.gs) giống hệt js/core/grading.js trên TOÀN BỘ data/ic3 ──
{
  const G = require(path.join(__dirname, '..', '..', 'js', 'core', 'grading.js'));
  const wrongAnswersOf = require(path.join(__dirname, '..', '..', 'js', 'core', '__tests__', 'grading-perturb.js')).wrongAnswersOf;
  const bank = require(path.join(__dirname, '..', '..', 'js', 'core', '__tests__', 'grading-bank.js')).loadBank(path.join(__dirname, '..', '..'));
  let cases = 0;
  const diffs = [];
  bank.forEach((q) => {
    [undefined, G.correctAnswerOf(q)].concat(wrongAnswersOf(q)).forEach((ans) => {
      // Qua JSON như khi web gửi lên (Set → mảng, khoá số → chuỗi)
      const wire = ans === undefined ? undefined : JSON.parse(JSON.stringify(ans));
      cases++;
      const js = G.questionStatus(q, wire);
      const gs = api.questionStatus_(q, wire);
      if (js !== gs && diffs.length < 5) diffs.push({ uid: q.uid, type: q.type, js, gs });
    });
  });
  eq('chấm điểm: Apps Script = web trên ' + bank.length + ' câu / ' + cases + ' trường hợp', diffs, []);
}


// ── Chấm lại bài Kiểm tra (77-grading.gs § applyServerGrading_) ──
{
  const G = require(path.join(__dirname, '..', '..', 'js', 'core', 'grading.js'));
  const wrongAnswersOf = require(path.join(__dirname, '..', '..', 'js', 'core', '__tests__', 'grading-perturb.js')).wrongAnswersOf;
  const bank = require(path.join(__dirname, '..', '..', 'js', 'core', '__tests__', 'grading-bank.js')).loadBank(path.join(__dirname, '..', '..'));
  // Khoá đáp án rút gọn (thứ được cache) chấm y như câu đầy đủ — trên toàn bộ ngân hàng
  const keyDiffs = [];
  bank.forEach((q) => {
    const k = JSON.parse(JSON.stringify(api.answerKeyOf_(q)));
    [undefined, G.correctAnswerOf(q)].concat(wrongAnswersOf(q)).forEach((ans) => {
      const wire = ans === undefined ? undefined : JSON.parse(JSON.stringify(ans));
      if (api.questionStatus_(k, wire) !== G.questionStatus(q, wire) && keyDiffs.length < 5) keyDiffs.push(q.uid);
    });
  });
  eq('chấm lại: khoá đáp án rút gọn chấm như câu đầy đủ (toàn bộ ngân hàng)', keyDiffs, []);

  const lv1 = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'data', 'ic3', 'IC3__LV1.json'), 'utf8'));
  const qs = [];
  (function collect(n) { if (Array.isArray(n)) n.forEach((x) => (x && x.uid && x.type ? qs.push(x) : collect(x))); else if (n && typeof n === 'object') Object.values(n).forEach(collect); })(lv1);
  const ten = qs.filter((q) => wrongAnswersOf(q).length).slice(0, 10);
  const right = ten.map((q) => [q.uid, JSON.parse(JSON.stringify(G.correctAnswerOf(q)))]);
  const halfWrong = ten.map((q, i) => [q.uid, JSON.parse(JSON.stringify(i < 5 ? wrongAnswersOf(q)[0] : G.correctAnswerOf(q)))]);
  const before = rawFetches;
  // Bài nộp có thể nằm ở file nhật ký đã xoay vòng (test phía trên) → tìm theo mã trên mọi tab
  const rowOf = (id) => {
    const all = sheet.data.map((d) => d.rawIn).filter(Boolean)
      .concat(...Object.values(createdFiles).map((f) => Object.values(f.tabs || {}).concat(f.getSheets ? f.getSheets() : []).flatMap((t) => (t && t.rows) || [])));
    return all.filter((r) => String(r[0]).replace(/^'/, '') === id).pop() || [];
  };
  const vsub = (id, p) => { const r = sub(Object.assign({ submissionId: id, examMode: 'test', bank: 'IC3__LV1.json', status: 'OK' }, p)); return [r, rowOf(id)]; };
  let [r, row] = vsub('verify0001', { answers: right, score: 100 });
  if (!r.ok) console.log('DEBUG verify0001', JSON.stringify(r));
  eq('chấm lại: điểm khớp → OK, ghi điểm máy chủ', [r.data.written, row[10], JSON.parse(row[15]).sv, JSON.parse(row[15]).sk], [true, 'OK', 100, 'ok']);
  eq('chấm lại: tải file khối 1 lần', rawFetches - before, 1);
  [r, row] = vsub('verify0002', { answers: halfWrong, score: 100 });
  eq('chấm lại: sửa điểm gửi lên → ⚠️ + điểm máy chủ', [row[10].startsWith('⚠️ Điểm gửi lên 100% khác điểm máy chủ chấm 50%'), JSON.parse(row[15]).sv, JSON.parse(row[15]).sk], [true, 50, 'lech']);
  eq('chấm lại: lần sau dùng bản đệm (không tải lại)', rawFetches - before, 1);
  [r, row] = vsub('verify0003', { answers: right.concat([['de_tu_soan__q1', 'A']]), score: 91 });
  eq('chấm lại: có câu ngoài ngân hàng → không kết luận, không ⚠️', [row[10], JSON.parse(row[15]).sk, JSON.parse(row[15]).sv], ['OK', 'thieu', undefined]);
  [r, row] = vsub('verify0008', { answers: right.concat([['de_tu_soan__q2', 'A']]), score: 91 });
  eq('chấm lại: câu ngoài ngân hàng không làm tải lại file khối mỗi bài', [JSON.parse(row[15]).sk, rawFetches - before], ['thieu', 1]);
  [r, row] = vsub('verify0004', { answers: halfWrong, score: 100, examMode: 'practice' });
  eq('chấm lại: bài Ôn luyện không chấm lại', [row[10], row[15]], ['OK', '']);
  eq('chấm lại: file khối ngoài danh sách bị từ chối', vsub('verify0005', { answers: right, bank: '../../secret.json' })[0].code, 'invalid-argument');
  eq('chấm lại: câu trả lời sai dạng bị từ chối', vsub('verify0006', { answers: [['<x>', 'A']] })[0].code, 'invalid-argument');
  rawFail = true;
  cacheStore.forEach((v, k) => { if (k.startsWith('ak:IC3__LV2.json')) cacheStore.delete(k); });
  [r, row] = vsub('verify0007', { answers: [['ic3__lv2__t1__q1', 'A']], bank: 'IC3__LV2.json', score: 0 });
  rawFail = false;
  eq('chấm lại: tải đề lỗi → VẪN ghi bài, đánh dấu chưa chấm', [r.data.written, row[10], JSON.parse(row[15]).sk], [true, 'OK', 'loi']);
}


// ── Trợ lý AI (78-ai.gs): proxy key giáo viên — lượt học sinh 0 Firestore ──
{
  const AIC = require(path.join(__dirname, '..', '..', 'js', 'services', 'ai-core.js'));
  const samples = [
    ['explain', { question: ' RAM là gì?\u0007', type: 'single', options: ['Bộ nhớ tạm', 'Ổ cứng', { a: 1 }], correct: ['Bộ nhớ tạm'], chosen: ['Ổ cứng'], explanation: 'x', grade: 7 }],
    ['explain', { question: 'Nối', correct: { CPU: 'xử lý' }, grade: 99 }],
    ['genQuiz', { topic: 'Phần cứng', source: 'a\n\n\n\nb  c', count: 40, level: 'khó', grade: 8, mix: true }],
    ['genQuiz', { source: 'Bài học', level: 'lạ' }],
    ['reteach', { question: 'Q', options: ['a', 'b'], correct: 'a', explanation: 'e', wrong: 12, students: 9, scope: '8A1', grade: 6 }],
    ['quickQ', { topic: 'Bài 3. Thư mục', grade: 4, count: 0 }],
  ];
  const diff = samples.filter(([t, p]) => JSON.stringify(AIC.build(t, p)) !== JSON.stringify(JSON.parse(JSON.stringify(api.aiBuild_(t, p))))).map(([t]) => t);
  eq('AI: câu lệnh Apps Script = web (ai-core.js build) trên ' + samples.length + ' mẫu', diff, []);

  const ask = (task, payload, cid) => call('aiAsk', { task, payload, cid: cid || 'may-hoc-sinh-01' });
  const exP = { question: 'RAM là gì?', options: ['Bộ nhớ tạm', 'Ổ cứng'], correct: ['Bộ nhớ tạm'], chosen: 'Ổ cứng' };
  eq('AI: chưa cài key hệ thống → ai-no-key, không gọi Gemini', [ask('explain', exP).code, gemini.calls], ['ai-no-key', 0]);
  eq('AI: học sinh không gọi được việc của giáo viên', ask('genQuiz', { topic: 'x' }).code, 'permission-denied');
  eq('AI: thiếu mã máy → invalid-argument', call('aiAsk', { task: 'explain', payload: exP }).code, 'invalid-argument');
  eq('AI: chỉ admin cài key (giáo viên bị chặn)', call('aiConfig', Object.assign({ key: 'AIzaTEST_teacher_key_0123456789' }, as('teachX'))).code, 'permission-denied');
  gemini.mode = 403;
  const bad = call('aiConfig', Object.assign({ key: 'AIzaWRONG_key_0123456789abcdef' }, as('admin1')));
  eq('AI: admin cài key sai → gọi thử báo lỗi, KHÔNG lưu', [bad.code, props.has('GEMINI_API_KEY')], ['ai-key', false]);
  gemini.mode = 'ok';
  const cfg = call('aiConfig', Object.assign({ key: 'AIzaGOOD_key_0123456789abcdef', model: 'gemini-flash-lite-latest' }, as('admin1')));
  eq('AI: admin cài key đúng → lưu, trả tình trạng KHÔNG kèm key', [cfg.ok, props.get('GEMINI_API_KEY'), cfg.data.model, JSON.stringify(cfg).indexOf('AIzaGOOD') < 0],
    [true, 'AIzaGOOD_key_0123456789abcdef', 'gemini-flash-lite-latest', true]);
  eq('AI: key sai dạng bị từ chối trước khi gọi Gemini', call('aiConfig', Object.assign({ key: 'x y' }, as('admin1'))).code, 'invalid-argument');

  const g0 = gemini.calls, fs0 = firestoreCalls;
  const r1 = ask('explain', exP);
  eq('AI: học sinh hỏi → Gemini bằng key hệ thống (header, không nằm trên URL), bỏ phần suy nghĩ',
    [r1.ok, r1.data.text, r1.data.cached, gemini.lastKey, gemini.lastUrl.indexOf('key=') < 0, /gemini-flash-lite-latest:generateContent$/.test(gemini.lastUrl)],
    [true, 'Lời giải #' + (g0 + 1), false, 'AIzaGOOD_key_0123456789abcdef', true, true]);
  eq('AI: thân yêu cầu = requestBody của web', JSON.stringify(gemini.lastBody), JSON.stringify(AIC.requestBody(AIC.build('explain', exP))));
  const r2 = ask('explain', Object.assign({}, exP), 'may-hoc-sinh-02');
  eq('AI: em khác hỏi đúng câu đó → dùng bản đệm, không gọi Gemini lần 2', [r2.data.text, r2.data.cached, gemini.calls - g0], [r1.data.text, true, 1]);
  eq('AI: lượt hỏi của học sinh không đọc Firestore', firestoreCalls - fs0, 0);

  // Trần mỗi máy: 30 lượt Gemini thật/ngày
  let lastCode = '';
  for (let k = 0; k < 31; k++) { const r = ask('explain', Object.assign({}, exP, { chosen: 'lần ' + k }), 'may-hoc-sinh-04'); lastCode = r.ok ? 'ok' : r.code; }
  eq('AI: quá 30 lượt/máy/ngày → ai-limit', lastCode, 'ai-limit');
  props.set('AI_DAILY_MAX', '1');
  eq('AI: quá trần cả trường → ai-limit (máy khác cũng bị)', ask('explain', Object.assign({}, exP, { chosen: 'mới' }), 'may-hoc-sinh-05').code, 'ai-limit');
  props.delete('AI_DAILY_MAX');

  const st = call('aiAskStaff', Object.assign({ task: 'genQuiz', payload: { topic: 'Phần cứng', count: 3 } }, as('teachX')));
  eq('AI: giáo viên soạn đề qua aiAskStaff (JSON mode)', [st.ok, gemini.lastBody.generationConfig.responseMimeType], [true, 'application/json']);
  eq('AI: tài khoản học sinh không dùng được aiAskStaff', call('aiAskStaff', Object.assign({ task: 'reteach', payload: exP }, as('student'))).code, 'permission-denied');
  gemini.mode = 429;
  eq('AI: key hệ thống hết hạn mức → ai-quota (web mời nhập key cá nhân)', ask('explain', Object.assign({}, exP, { chosen: 'z' }), 'may-hoc-sinh-06').code, 'ai-quota');
  gemini.mode = 'ok';
  const stat = call('aiStatus', as('teachX'));
  eq('AI: tình trạng cho giáo viên — có key, số lượt hôm nay, không lộ key', [stat.data.configured, stat.data.usedToday > 0, JSON.stringify(stat).indexOf('AIza') < 0], [true, true, true]);
  eq('AI: gỡ key hệ thống', [call('aiConfig', Object.assign({ remove: true }, as('admin1'))).data.configured, props.has('GEMINI_API_KEY')], [false, false]);
}

console.log(fails ? `\n${fails} FAIL` : '\nTất cả PASS');
process.exit(fails ? 1 : 0);
