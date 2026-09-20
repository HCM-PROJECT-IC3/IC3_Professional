var ExamRunner = require('../exam-runner.js');
var WordTask = require('../../word-engine/word-tasks-sample.js');
var PptTask = require('../../ppt-engine/ppt-tasks-sample.js');
var ExcelTask = require('../../excel-engine/excel-tasks-sample.js');
var WD = require('../../word-engine/document-model.js');
var PM = require('../../ppt-engine/slide-model.js');

var failures = 0;
function assertEq(label, actual, expected) {
  var pass = JSON.stringify(actual) === JSON.stringify(expected);
  console.log((pass ? 'PASS' : 'FAIL') + '  ' + label + '  =>  ' + JSON.stringify(actual) + (pass ? '' : '  (expected ' + JSON.stringify(expected) + ')'));
  if (!pass) failures++;
}

var tasks = [WordTask.task, PptTask.task, ExcelTask.task];
var session = new ExamRunner.ExamSession({ tasks: tasks, durationSeconds: 5 });

// ── Navigation ──
assertEq('starts at task 0', session.currentIndex, 0);
session.next();
assertEq('next moves to task 1', session.currentIndex, 1);
session.next(); session.next(); // đã ở task cuối, next() thêm nữa không vượt biên
assertEq('next stays clamped at last task', session.currentIndex, 2);
session.prev();
assertEq('prev moves back', session.currentIndex, 1);
session.goTo(0);
assertEq('goTo jumps directly', session.currentIndex, 0);

// ── Public task hides requirements/hints (Exam Mode: ẩn đáp án/hint) ──
var pub = session.getPublicTask('excel-sum-b5');
assertEq('public task has no requirements field', pub.requirements, undefined);
assertEq('public task has no hints field', pub.hints, undefined);
assertEq('public task keeps instruction', typeof pub.instruction, 'string');

// ── Flag ──
session.toggleFlag('word-heading-bold-header');
assertEq('flagged after toggle', session.isFlagged('word-heading-bold-header'), true);
assertEq('flaggedTaskIds lists it', session.flaggedTaskIds(), ['word-heading-bold-header']);
session.toggleFlag('word-heading-bold-header');
assertEq('unflagged after 2nd toggle', session.isFlagged('word-heading-bold-header'), false);

// ── Timer: đếm ngược tick-by-tick, tự nộp bài khi hết giờ ──
var ticks = [];
var timeUpFired = false;
var session2 = new ExamRunner.ExamSession({
  tasks: tasks, durationSeconds: 3,
  onTick: function (s) { ticks.push(s); },
  onTimeUp: function () { timeUpFired = true; }
});
session2.tick(); session2.tick(); session2.tick();
assertEq('tick sequence', ticks, [2, 1, 0]);
assertEq('onTimeUp fired exactly at 0', timeUpFired, true);
assertEq('auto-submitted when time is up', session2.submitted, true);
assertEq('result exists after auto-submit', session2.result != null, true);

// ── Manual submit: học viên làm đúng Excel task, sai Word/PPT ──
// (Excel state LUÔN ở dạng { workbookSnapshot } JSON-serializable trong
// suốt lúc làm bài — giống hệt controller UI thật (exam-simulator-excel.js)
// — session.submit() TỰ hydrate lại { engine } sống qua
// task.prepareForValidation() lúc nộp bài, xem excel-tasks-sample.js.)
var session3 = new ExamRunner.ExamSession({ tasks: tasks, durationSeconds: 0 });
var excelState = session3.getTaskState('excel-sum-b5');
var excelEngine = ExcelTask.hydrate(excelState);
excelEngine.setCellFormula('Sheet1', 'B5', '=SUM(B2:B4)');
excelEngine.setCellNumberFormat('Sheet1', 'B5', 'Currency');
excelEngine.setCellStyle('Sheet1', 'B5', { bold: true });
session3.setTaskState('excel-sum-b5', { workbookSnapshot: ExcelTask.serializeWorkbook(excelEngine.workbook) });

var result = session3.submit();
assertEq('submit returns aggregate score', result.score, 10); // chỉ Excel đúng, Word/PPT chưa đụng tới = 0
assertEq('submit returns maxScore', result.maxScore, 30);
assertEq('second submit() is idempotent (does not re-grade)', session3.submit().score, 10);

// ── Navigation state cho sidebar (đã làm/gắn cờ) ──
var navState = session3.getNavigationState();
var excelNav = navState.filter(function (n) { return n.taskId === 'excel-sum-b5'; })[0];
assertEq('excel task marked touched', excelNav.touched, true);
var wordNav = navState.filter(function (n) { return n.taskId === 'word-heading-bold-header'; })[0];
assertEq('untouched word task not marked touched', wordNav.touched, false);

// ── Autosave snapshot round-trip ──
var snap = session3.toSnapshot();
var restored = new ExamRunner.ExamSession({ tasks: tasks, durationSeconds: 0 });
restored.restoreSnapshot(snap);
assertEq('restored submitted flag', restored.submitted, true);
assertEq('restored result score', restored.result.score, 10);
assertEq('restored currentIndex', restored.currentIndex, snap.currentIndex);

// ── Regression: khôi phục 1 snapshot THIẾU state của 1 task (vd snapshot
// cũ chụp lúc bộ task khác) KHÔNG được xoá mất initial state đã dựng sẵn
// cho task đó — bản cũ `this.states = snap.states` thay thế NGUYÊN CỤM,
// khiến getTaskState(task thiếu) trả về undefined. ──
var partialSnap = session3.toSnapshot();
delete partialSnap.states['ppt-align-front-title']; // giả lập snapshot cũ thiếu 1 task
var restored2 = new ExamRunner.ExamSession({ tasks: tasks, durationSeconds: 0 });
var pptInitialStateBefore = restored2.getTaskState('ppt-align-front-title');
restored2.restoreSnapshot(partialSnap);
assertEq('task missing from snapshot keeps its freshly-instantiated initial state', restored2.getTaskState('ppt-align-front-title'), pptInitialStateBefore);
assertEq('task PRESENT in snapshot still gets restored correctly', restored2.getTaskState('excel-sum-b5').workbookSnapshot != null, true);

console.log('\n' + (failures === 0 ? 'ALL PASSED' : failures + ' FAILURE(S)'));
process.exit(failures === 0 ? 0 : 1);
