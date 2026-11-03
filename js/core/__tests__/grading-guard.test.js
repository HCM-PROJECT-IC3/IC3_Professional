/* Nộp bài khi thiếu bộ chấm js/core/grading.js (HTML cũ trong bản lưu Service Worker + quiz-engine mới):
   không được khoá "đã nộp", phải tự nạp lại bộ chấm và báo nộp lại. Lỗi dựng câu trả lời cho máy chủ
   (serverGrading 'verify') không được làm hỏng lượt nộp.
   Chạy: node js/core/__tests__/grading-guard.test.js */
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var failures = 0;
function assertEq(label, actual, expected) {
  var pass = JSON.stringify(actual) === JSON.stringify(expected);
  console.log((pass ? 'PASS' : 'FAIL') + '  ' + label + '  =>  ' + JSON.stringify(actual) + (pass ? '' : '  (expected ' + JSON.stringify(expected) + ')'));
  if (!pass) failures++;
}

var src = fs.readFileSync(path.join(__dirname, '..', '..', 'quiz-engine.js'), 'utf8').replace(/\r\n/g, '\n');
function grab(sig) { var s = src.indexOf(sig); return src.slice(s, src.indexOf('\n}\n', s) + 3); }

function makeCtx() {
  var appended = [];
  var calls = [];
  var ctx = {
    console: { warn: function () {}, log: function () {} },
    window: { dispatchEvent: function () {} },
    CustomEvent: function () {},
    document: {
      querySelector: function () { return appended.length ? {} : null; },
      createElement: function () { return { dataset: {} }; },
      head: { appendChild: function (el) { appended.push(el); } },
    },
    State: { submitted: false, timer: 1, session: { startTime: 0, catId: 'IC3', levelId: 'LV1' }, questions: [{ uid: 'a' }] },
    clearInterval: function () { calls.push('clearInterval'); },
    clearInProgress: function () { calls.push('clearInProgress'); },
    flushQTime: function () {}, acStopGuard: function () {},
    gradeExam: function () { calls.push('gradeExam'); return { correct: 1, incorrect: 0, skipped: 0, total: 1, details: [] }; },
    computeIntegrity: function () { return { valid: true, flags: [] }; },
    saveRecord: function () { return null; }, showResult: function () {},
    showNotification: function (m) { calls.push('notify:' + m); },
    _findMetaLevel: function () { return { file: 'IC3__LV1.json' }; },
    wireAnswerOf: function () { throw new Error('dữ liệu lạ'); },
    Date: Date,
  };
  ctx.appended = appended;
  ctx.calls = calls;
  vm.createContext(ctx);
  vm.runInContext(grab('function _wireForServer() {') + grab('function _ensureGrading() {') + grab('function submitExam() {'), ctx);
  return ctx;
}

// 1. Thiếu bộ chấm
var c = makeCtx();
c.submitExam();
assertEq('thiếu bộ chấm: CHƯA đánh dấu đã nộp (nộp lại được)', c.State.submitted, false);
assertEq('thiếu bộ chấm: không dừng đồng hồ / không xoá bài đang làm / không chấm', c.calls.filter(function (x) { return !/^notify:/.test(x); }), []);
assertEq('thiếu bộ chấm: báo học sinh nộp lại', c.calls.some(function (x) { return /Nộp bài/.test(x); }), true);
assertEq('thiếu bộ chấm: tự nạp js/core/grading.js (1 lần dù bấm nhiều lần)', (c.submitExam(), c.appended.map(function (e) { return e.src; })), ['js/core/grading.js']);

// 2. Có bộ chấm → nộp bình thường; serverGrading 'verify' + wireAnswerOf lỗi → vẫn nộp, wire = null
var c2 = makeCtx();
var submitted = null;
c2.window.EduGrading = {};
c2.window.EduBackend = { serverGrading: { mode: 'verify' } };
c2.window.EduResultSubmitter = { submitQuiz: function (a) { submitted = a; } };
c2.submitExam();
assertEq('có bộ chấm: chấm + đánh dấu đã nộp', [c2.State.submitted, c2.calls.indexOf('gradeExam') !== -1], [true, true]);
assertEq("'verify' + lỗi dựng câu trả lời: vẫn gửi bài, không kèm câu trả lời", [!!submitted, submitted && submitted.wire], [true, null]);

// 3. serverGrading tắt → không dựng câu trả lời
var c3 = makeCtx();
var sub3 = null;
c3.window.EduGrading = {};
c3.window.EduResultSubmitter = { submitQuiz: function (a) { sub3 = a; } };
c3.submitExam();
assertEq("serverGrading tắt: wire = null", sub3 && sub3.wire, null);

console.log(failures ? '\n' + failures + ' FAIL' : '\nTất cả PASS');
process.exit(failures ? 1 : 0);
