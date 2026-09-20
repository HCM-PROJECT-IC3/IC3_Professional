/* Kiểm chứng TOÀN BỘ pipeline bắt buộc trong goal:
   Initial Document → Simulator → User Actions → Application State →
   Validation Engine → Partial Scoring → Task Result
   bằng task mẫu Excel (js/excel-engine/excel-tasks-sample.js), tái hiện
   đúng ví dụ scoring của đề bài (Formula ✓, Number format ✓, Bold ✗ =
   7/10 nếu chỉ có 2/3 requirement — ở đây trọng số 4/3/3 nên bài toán
   tương đương "9/10" của đề chỉ là ví dụ minh hoạ hình dạng, ta test
   đúng cơ chế partial scoring, không khớp số tuyệt đối). */
var TaskSchema = require('../task-schema.js');
var Validator = require('../validation-engine.js');
var ExcelTask = require('../../excel-engine/excel-tasks-sample.js');

var failures = 0;
function assertEq(label, actual, expected) {
  var pass = JSON.stringify(actual) === JSON.stringify(expected);
  console.log((pass ? 'PASS' : 'FAIL') + '  ' + label + '  =>  ' + JSON.stringify(actual) + (pass ? '' : '  (expected ' + JSON.stringify(expected) + ')'));
  if (!pass) failures++;
}

var task = ExcelTask.task;

// 1) Initial Document — instantiate a fresh, independent copy
var initialState = TaskSchema.instantiateInitialState(task);
assertEq('initial B5 empty', (function () {
  var e = ExcelTask.hydrate(initialState);
  var c = e.getCell('Sheet1', 'B5');
  return c ? c.value : null;
})(), null);

// 2) Simulator + User Actions — học viên gõ công thức, định dạng, in đậm
//    (ĐÚNG cả 3 yêu cầu)
var engineFull = ExcelTask.hydrate(initialState);
engineFull.setCellFormula('Sheet1', 'B5', '=SUM(B2:B4)');
engineFull.setCellNumberFormat('Sheet1', 'B5', 'Currency');
engineFull.setCellStyle('Sheet1', 'B5', { bold: true });

// 3) Application State -> 4) Validation Engine -> 5) Partial Scoring -> 6) Task Result
var resultFull = Validator.validateTask(task, { engine: engineFull });
assertEq('full: completed', resultFull.completed, true);
assertEq('full: score', resultFull.score, 10);
assertEq('full: maxScore', resultFull.maxScore, 10);
assertEq('full: value computed via formula', engineFull.getCell('Sheet1', 'B5').value, 37300000);

// Học viên chỉ làm ĐÚNG formula + numberFormat, QUÊN bold -> partial scoring
var enginePartial = ExcelTask.hydrate(initialState);
enginePartial.setCellFormula('Sheet1', 'B5', '=SUM(B2:B4)');
enginePartial.setCellNumberFormat('Sheet1', 'B5', 'Currency');
// (không bold)
var resultPartial = Validator.validateTask(task, { engine: enginePartial });
assertEq('partial: completed', resultPartial.completed, false);
assertEq('partial: score', resultPartial.score, 7);
assertEq('partial: maxScore', resultPartial.maxScore, 10);
assertEq('partial: details shape', resultPartial.details.map(function (d) { return { requirement: d.requirement, passed: d.passed, points: d.points }; }), [
  { requirement: 'Formula', passed: true, points: 4 },
  { requirement: 'Number format', passed: true, points: 3 },
  { requirement: 'Bold', passed: false, points: 0 }
]);

// Học viên KHÔNG làm gì -> score 0, không completed, không văng lỗi
var engineEmpty = ExcelTask.hydrate(initialState);
var resultEmpty = Validator.validateTask(task, { engine: engineEmpty });
assertEq('empty: score', resultEmpty.score, 0);
assertEq('empty: completed', resultEmpty.completed, false);

// 7) Exam Result — validateExam gộp nhiều task + skill report
var examResult = Validator.validateExam([task], { 'excel-sum-b5': { engine: enginePartial } });
assertEq('exam score', examResult.score, 7);
assertEq('exam maxScore', examResult.maxScore, 10);
assertEq('exam percent', examResult.percent, 70);
assertEq('skill report by application', examResult.skillReport.byApplication.excel.score, 7);

console.log('\n' + (failures === 0 ? 'ALL PASSED' : failures + ' FAILURE(S)'));
process.exit(failures === 0 ? 0 : 1);
