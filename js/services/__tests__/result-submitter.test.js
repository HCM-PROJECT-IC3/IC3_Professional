/* Test định tuyến bài nộp (js/services/result-submitter.js) + mã bài (firebase-loader.js).
   Chạy: node js/services/__tests__/result-submitter.test.js — không gọi mạng thật. */
var path = require('path');
var crypto = require('crypto');

var failures = 0;
function assertEq(label, actual, expected) {
  var pass = JSON.stringify(actual) === JSON.stringify(expected);
  console.log((pass ? 'PASS' : 'FAIL') + '  ' + label + '  =>  ' + JSON.stringify(actual) + (pass ? '' : '  (expected ' + JSON.stringify(expected) + ')'));
  if (!pass) failures++;
}

// Môi trường trình duyệt tối thiểu: window = globalThis, setTimeout chạy ngay.
var calls = [];
var queued = [];
globalThis.window = globalThis;
globalThis.crypto = globalThis.crypto || crypto.webcrypto;
var realSetTimeout = setTimeout;
globalThis.setTimeout = function (fn) { fn(); return 0; };
globalThis.EduPendingSync = { enqueue: function (type, p) { queued.push(type + ':' + (p.submissionId || p.resultId)); } };
globalThis.saveToGoogleSheet = function (p) { calls.push('sheet:' + p.submissionId); return Promise.resolve({ success: true }); };
globalThis.saveResultToFirestore = function (p) { calls.push('firestore:' + p.resultId); return Promise.resolve({ success: false, pending: true }); };

require(path.join(__dirname, '..', 'firebase-loader.js'));
require(path.join(__dirname, '..', 'result-submitter.js'));
var S = globalThis.EduResultSubmitter;

// ── Mã bài ──
var id = globalThis.EduFirebaseLoader.newDocId();
assertEq('newDocId: 20 ký tự chữ/số', /^[A-Za-z0-9]{20}$/.test(id), true);
assertEq('newDocId: không lặp', id === globalThis.EduFirebaseLoader.newDocId(), false);

// ── Chính sách ──
assertEq("'all' ghi Firestore bài ôn luyện", S.wantsFirestore('practice', { firestore: 'all' }), true);
assertEq("'test-only' bỏ bài ôn luyện", S.wantsFirestore('practice', { firestore: 'test-only' }), false);
assertEq("'test-only' giữ bài kiểm tra", S.wantsFirestore('test', { firestore: 'test-only' }), true);
assertEq("'off' không ghi Firestore", S.wantsFirestore('test', { firestore: 'off' }), false);
assertEq('tắt Sheet nhưng tắt cả Firestore → vẫn gửi Sheet', S.wantsSheet('test', { firestore: 'off', sheet: false }), true);
assertEq('tắt Sheet, Firestore bật → không gửi Sheet', S.wantsSheet('test', { firestore: 'all', sheet: false }), false);

// ── Payload ──
var session = { studentName: 'HS', studentClass: '7A1', studentSchool: 'THCS A', category: 'IC3', level: 'LV1', minitest: 'Test 1', examMode: 'practice', timedOut: true };
var result = { correct: 7, incorrect: 2, skipped: 1, total: 10 };
var integrity = { valid: false, flags: ['Chuyển tab', 'Thoát toàn màn hình'], tabSwitches: 3, clicks: 40 };
var p = S.buildPayloads({ session: session, result: result, integrity: integrity, elapsed: 125, id: 'ABC' });
assertEq('Sheet + Firestore cùng mã bài', [p.sheet.submissionId, p.firestore.resultId], ['ABC', 'ABC']);
assertEq('tên bài', p.sheet.testName, 'IC3 › LV1 › Test 1');
assertEq('điểm %', [p.sheet.score, p.firestore.score], [70, 70]);
assertEq('thời gian mm:ss', p.sheet.time, '02:05');
assertEq('trạng thái nghi vấn', p.sheet.status, '⚠️ Chuyển tab');
assertEq('ghi chú = cờ còn lại', p.sheet.note, 'Thoát toàn màn hình');
assertEq('examMode giữ nguyên', p.firestore.examMode, 'practice');
assertEq('bài 0 câu không chia 0', S.buildPayloads({ session: session, result: { correct: 0, total: 0 }, integrity: { valid: true, flags: [] }, elapsed: 0, id: 'X' }).sheet.score, 0);

// ── Gửi theo chính sách ──
function run(mode, examMode) {
  calls = []; queued = [];
  globalThis.EduBackend = { quizResults: { firestore: mode, sheet: true, sheetJitterMs: 0 } };
  var s = Object.assign({}, session, { examMode: examMode });
  var out = S.submitQuiz({ session: s, result: result, integrity: integrity, elapsed: 60 });
  return new Promise(function (r) { realSetTimeout(function () { r(out); }, 10); });
}

run('test-only', 'practice').then(function (out) {
  assertEq("test-only + ôn luyện: chỉ Sheet", [out.firestore, out.sheet, calls.length, calls[0].indexOf('sheet:')], [false, true, 1, 0]);
  return run('all', 'test');
}).then(function (out) {
  assertEq("all: gửi cả 2 đích cùng mã", calls.slice().sort().map(function (c) { return c.split(':')[1] === out.id; }), [true, true]);
  assertEq('Firestore chưa phản hồi → vào hàng đợi', queued, ['firestore_quiz_result:' + out.id]);
  return run('off', 'test');
}).then(function (out) {
  assertEq("off: không gọi Firestore", calls.filter(function (c) { return c.indexOf('firestore') === 0; }).length, 0);
  console.log(failures ? '\n' + failures + ' test FAIL' : '\nTất cả PASS');
  process.exit(failures ? 1 : 0);
});
