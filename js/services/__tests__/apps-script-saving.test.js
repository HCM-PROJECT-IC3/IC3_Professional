/* Test các chỗ bớt lượt gọi Apps Script / lượt đọc Firestore (29/10/2026):
   - js/services/pending-sync-queue.js: cầu dao theo loại khi gửi lại
   - js/services/activity-log-service.js: gộp nhật ký "login" / xem lại cùng học sinh
   - js/repositories/student-result-repository.js: chi tiết học sinh dùng chung bài của cả lớp
   Chạy: node js/services/__tests__/apps-script-saving.test.js — không gọi mạng thật. */
var path = require('path');

var failures = 0;
function assertEq(label, actual, expected) {
  var pass = JSON.stringify(actual) === JSON.stringify(expected);
  console.log((pass ? 'PASS' : 'FAIL') + '  ' + label + '  =>  ' + JSON.stringify(actual) + (pass ? '' : '  (expected ' + JSON.stringify(expected) + ')'));
  if (!pass) failures++;
}
function load(rel) {
  var p = path.join(__dirname, '..', '..', '..', rel);
  delete require.cache[require.resolve(p)];
  require(p);
}

// ── Môi trường trình duyệt tối giản ──
globalThis.window = globalThis;
var store = {};
globalThis.localStorage = {
  getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
  setItem: function (k, v) { store[k] = String(v); },
  removeItem: function (k) { delete store[k]; },
};
var listeners = {};
globalThis.addEventListener = function (t, fn) { (listeners[t] = listeners[t] || []).push(fn); };
var realSetTimeout = setTimeout;
globalThis.setTimeout = function () { return 0; }; // init() của hàng đợi: không tự chạy
globalThis.setInterval = function () { return 0; };
var now = 1e12;
Date.now = function () { return now; };

(async function () {
  // ===== 1) Hàng đợi gửi lại: cầu dao theo loại =====
  load('js/services/pending-sync-queue.js');
  var Q = globalThis.EduPendingSync;
  var sheetCalls = 0, mosCalls = 0, sheetUp = false;
  globalThis.saveToGoogleSheet = function () { sheetCalls++; return Promise.resolve({ success: sheetUp }); };
  globalThis.saveMosSubmission = function () { mosCalls++; return Promise.resolve({ success: true }); };
  for (var i = 0; i < 20; i++) Q.enqueue('google_sheet', { submissionId: 'sub' + i });
  Q.enqueue('mos_submission', { id: 'm1' });
  now += 60 * 1000;
  await Q.flush();
  assertEq('Apps Script lỗi: 20 bài treo → chỉ 1 lượt gọi, loại khác vẫn gửi', [sheetCalls, mosCalls, Q._readQueue().length], [1, 1, 20]);
  var waits = Q._readQueue().map(function (x) { return x.nextAttemptAt > now; });
  assertEq('bài cùng loại bị hoãn (không thử lại ở vòng 20 giây kế tiếp)', waits.every(Boolean), true);
  assertEq('bài bị hoãn theo cầu dao không bị tính thêm lần thử', Q._readQueue().filter(function (x) { return x.attempts === 0; }).length, 19);
  now += 20 * 1000;
  await Q.flush();
  assertEq('vòng kế tiếp trong lúc chờ → 0 lượt gọi thêm', sheetCalls, 1);
  sheetUp = true;
  now += 60 * 60 * 1000;
  await Q.flush();
  assertEq('Apps Script hoạt động lại → gửi hết, hàng đợi trống', [sheetCalls, Q._readQueue().length], [21, 0]);

  // ===== 2) Nhật ký hoạt động =====
  var logged = [];
  globalThis.EduModels = { ActivityLog: { ACTIONS: { LOGIN: 'login', VIEW_STUDENT_DETAIL: 'view_student_detail', UPDATE_ROSTER: 'update_roster' } } };
  globalThis.EduRepositories = { activityLog: { record: function (e) { logged.push(e.action + ':' + (e.targetId || '')); } } };
  globalThis.EduCurrentProfile = { role: 'teacher', name: 'GV' };
  globalThis.EduCurrentUser = { uid: 'u1' };
  globalThis.sessionStorage = { getItem: function () { return null; }, setItem: function () {} };
  load('js/services/activity-log-service.js');
  var L = globalThis.EduActivityLog;
  var ready = function () { listeners['edu:ready'].slice(-1)[0]({ detail: { user: { uid: 'u1' }, profile: { role: 'teacher' } } }); };
  ready(); ready();
  assertEq('"login" mở 2 tab → 1 dòng', logged.filter(function (x) { return x.indexOf('login') === 0; }).length, 1);
  L.log('view_student_detail', { targetId: 'an|6a1', meta: { a: 1 } });
  L.log('view_student_detail', { targetId: 'an|6a1', meta: { a: 1 } });
  L.log('view_student_detail', { targetId: 'binh|6a1', meta: { a: 1 } });
  assertEq('xem lại cùng 1 học sinh trong 30 phút → không ghi thêm', logged.filter(function (x) { return x.indexOf('view') === 0; }), ['view_student_detail:an|6a1', 'view_student_detail:binh|6a1']);
  L.log('update_roster', { targetId: 's1', meta: { rosterAction: 'update_student' } });
  L.log('update_roster', { targetId: 's1', meta: { rosterAction: 'update_student' } });
  assertEq('hành động GHI dữ liệu luôn ghi đủ', logged.filter(function (x) { return x.indexOf('update') === 0; }).length, 2);
  now += 31 * 60 * 1000;
  L.log('view_student_detail', { targetId: 'an|6a1', meta: { a: 1 } });
  now += 6 * 60 * 60 * 1000;
  ready();
  assertEq('quá hạn → ghi lại (xem sau 30 phút, login sau 6 giờ)', [logged.filter(function (x) { return x === 'view_student_detail:an|6a1'; }).length, logged.filter(function (x) { return x.indexOf('login') === 0; }).length], [2, 2]);

  // ===== 3) Chi tiết học sinh: dùng chung bài của cả lớp =====
  globalThis.setTimeout = realSetTimeout;
  var sheetLists = [];
  var ROWS = [
    { id: 'r1', studentName: 'An', studentClass: '6A1', score: 8 },
    { id: 'r2', studentName: 'Bình', studentClass: '6A1', score: 6 },
    { id: 'r3', studentName: ' an ', studentClass: '6A1', score: 9 },
  ];
  var sheetOn = true;
  globalThis.EduSheetResults = {
    enabled: function () { return sheetOn; },
    noteError: function () { return false; },
    list: function (o) { sheetLists.push(o); return Promise.resolve(ROWS.filter(function (r) { return !o.studentName || r.studentName.trim().toLowerCase() === o.studentName.toLowerCase(); }).slice(0, o.limit)); },
  };
  var keyOf = function (r) { return String(r.studentName || '').trim().toLowerCase() + '|' + String(r.studentClass || '').trim().toLowerCase(); };
  var fsReads = 0;
  globalThis.EduModels = { StudentResult: { COLLECTION_NAME: 'quiz_results', normalize: function (r) { return r; } }, ExamHistory: { keyOf: keyOf } };
  globalThis.EduBaseRepository = function () {};
  globalThis.EduBaseRepository.prototype.list = function () { fsReads++; return Promise.resolve(ROWS.slice()); };
  load('js/repositories/student-result-repository.js');
  var R = globalThis.EduRepositories.studentResult;
  var a = await Promise.all([R.listByStudent({ studentName: 'An', studentClass: '6A1' }), R.listByStudent({ studentName: 'Bình', studentClass: '6A1' })]);
  var b = await R.listByStudent({ studentName: 'An', studentClass: '6A1' });
  assertEq('Sheet: xem 3 lượt (2 em cùng lớp) → 1 lượt Apps Script, đúng bài từng em', [sheetLists.length, a[0].map(function (r) { return r.id; }), a[1].map(function (r) { return r.id; }), b.length], [1, ['r1', 'r3'], ['r2'], 2]);
  now += 6 * 60 * 1000;
  await R.listByStudent({ studentName: 'An', studentClass: '6A1' });
  assertEq('quá 5 phút → hỏi lại lớp', sheetLists.length, 2);
  ROWS = new Array(5000).fill(0).map(function (_, k) { return { id: 'x' + k, studentName: 'HS' + k, studentClass: '7A1' }; }).concat([{ id: 'me', studentName: 'Chi', studentClass: '7A1' }]);
  var big = await R.listByStudent({ studentName: 'Chi', studentClass: '7A1' });
  assertEq('lớp chạm trần 5.000 bài → hỏi riêng đúng em đó (không thiếu lịch sử)', [sheetLists.length, sheetLists[3].studentName, big.map(function (r) { return r.id; })], [4, 'Chi', ['me']]);
  sheetOn = false;
  ROWS = [{ id: 'f1', studentName: 'An', studentClass: '8A1' }, { id: 'f2', studentName: 'Bình', studentClass: '8A1' }];
  await R.listByStudent({ studentName: 'An', studentClass: '8A1' });
  await R.listByStudent({ studentName: 'Bình', studentClass: '8A1' });
  assertEq('Firestore: 2 em cùng lớp → đọc bài của lớp 1 lần (trước: mỗi em 1 lần)', fsReads, 1);

  console.log(failures ? '\n' + failures + ' FAIL' : '\nTất cả PASS');
  process.exit(failures ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(1); });
