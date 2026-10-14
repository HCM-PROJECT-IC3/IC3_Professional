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
    getParent: () => ({ getId: () => 'MAIN' }),
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
function plainTab() {
  const t = { rows: [], header: null };
  t.appendRow = (v) => t.rows.push(v);
  t.setFrozenRows = () => {};
  t.getRange = () => ({ setValues: (v) => { t.header = v[0]; return { setFontWeight: () => {} }; } });
  return t;
}
const tabs = { NhatKyNopBai: sheet, HocSinh: rosterSheet, KetQua: scoresSheet };

// ── Dịch vụ Apps Script giả ──
const cacheStore = new Map();
const props = new Map();
let firestoreCalls = 0;
const github = { calls: [], files: {}, headSha: 'c0', treeShas: { 'data/ic3/meta.json': 'sha-meta' } };
let users = {};
let geocodeCalls = 0;
const ctx = {
  console, Date, JSON, Math, Set, Map, String, Number, Array, Object, encodeURIComponent, Error,
  SpreadsheetApp: { openById: () => ({ getSheetByName: (n) => tabs[n] || null, insertSheet: (n) => (tabs[n] = plainTab()) }) },
  CacheService: { getScriptCache: () => ({ get: (k) => cacheStore.get(k) || null, put: (k, v) => cacheStore.set(k, v) }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props.get(k) || null, setProperty: (k, v) => props.set(k, v) }) },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }), getUserLock: () => ({ waitLock() {}, releaseLock() {} }) },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ setMimeType: () => ({ text: t }) }) },
  Utilities: {
    DigestAlgorithm: { SHA_256: 'sha256' },
    computeDigest: (alg, s) => [...crypto.createHash('sha256').update(s).digest()],
    base64EncodeWebSafe: (b) => Buffer.from(b).toString('base64url'),
    base64DecodeWebSafe: (s) => [...Buffer.from(s, 'base64url')],
    newBlob: (bytes) => ({ getDataAsString: () => Buffer.from(bytes).toString('utf8') }),
    formatDate: () => '20261012',
  },
  UrlFetchApp: {
    fetch(url, opt) {
      if (url.startsWith('https://firestore.googleapis.com/')) {
        firestoreCalls++;
        const tok = opt.headers.Authorization.replace('Bearer ', '');
        const u = users[decodeURIComponent(url.split('/users/')[1])];
        const ok = tok.endsWith('.sig-ok') && u;
        return { getResponseCode: () => (ok ? 200 : 403), getContentText: () => JSON.stringify(ok ? { fields: u } : {}) };
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
vm.runInContext(src + '\n;this.__api = { handleRequest_, asText_, submittedMs_, doGet, noFormula_ };', ctx);
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
eq('lớp/số câu/thời gian ghi thành chữ + cột CheDo', [w[2], w[6], w[7], w[13], w.length], ["'3/12", "'7/24", "'5:05", 'practice', 15]);
eq('web cũ không gửi câu sai → cột CauSai trống', w[14], '');
eq('gửi lại cùng mã → trùng, không ghi thêm', sub({}).data.duplicate, true);
eq('tab cũ được thêm tiêu đề CheDo', sheet.data[0].disp[13], 'CheDo');
eq('điểm ngoài 0-100 bị từ chối', sub({ submissionId: 'zz1234567', score: 500 }).code, 'invalid-argument');
eq('tên quá dài bị từ chối', sub({ submissionId: 'zz1234568', studentName: 'x'.repeat(500) }).code, 'invalid-argument');
eq('mã bài lạ bị từ chối', sub({ submissionId: '../../etc' }).code, 'invalid-argument');
eq('mã cũ dạng sub_… vẫn nhận', sub({ submissionId: 'sub_123_1791194357301' }).ok, true);

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

// ── Nhật ký hoạt động ──
eq('nhật ký: không đăng nhập thì không ghi được', call('logActivity', { activity: 'login' }).code, 'unauthenticated');
eq('nhật ký: hành động lạ bị từ chối', call('logActivity', Object.assign(as('teachX'), { activity: 'drop_db' })).code, 'invalid-argument');
call('logActivity', Object.assign(as('teachX'), { activity: 'login', page: 'teacher-dashboard', meta: { a: 1 } }));
const logRow = tabs.NhatKyHoatDong.rows.find((r) => r[3] === 'login');
eq('nhật ký: uid/vai trò lấy từ tài khoản thật', [logRow[1], logRow[2], logRow[3], logRow[6]], ['teachX', 'teacher', 'login', 'teacher-dashboard']);

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

console.log(fails ? `\n${fails} FAIL` : '\nTất cả PASS');
process.exit(fails ? 1 : 0);
