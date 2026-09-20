/* Chứng minh 1 exam có thể trộn task của cả 3 môn, chấm bằng CHUNG 1
   Validation Engine, và Skill Mapping gộp đúng theo application/skill. */
var TaskSchema = require('../task-schema.js');
var Validator = require('../validation-engine.js');
var WD = require('../../word-engine/document-model.js');
var WordTask = require('../../word-engine/word-tasks-sample.js');
var PM = require('../../ppt-engine/slide-model.js');
var PptTask = require('../../ppt-engine/ppt-tasks-sample.js');
var ExcelTask = require('../../excel-engine/excel-tasks-sample.js');

var failures = 0;
function assertEq(label, actual, expected) {
  var pass = JSON.stringify(actual) === JSON.stringify(expected);
  console.log((pass ? 'PASS' : 'FAIL') + '  ' + label + '  =>  ' + JSON.stringify(actual) + (pass ? '' : '  (expected ' + JSON.stringify(expected) + ')'));
  if (!pass) failures++;
}

// ── Word task: học viên làm ĐÚNG heading+bold nhưng QUÊN header ──
var wordInit = TaskSchema.instantiateInitialState(WordTask.task);
var wordDoc = wordInit.doc;
WD.setSelection(wordDoc, 0, 0, 0, WD.paragraphText(wordDoc.paragraphs[0]).length);
WD.setParagraphStyle(wordDoc, 'Heading1');
WD.applyCharacterFormat(wordDoc, { bold: true });
var wordResult = Validator.validateTask(WordTask.task, { doc: wordDoc });
assertEq('word: score (heading+bold ok, header missing)', wordResult.score, 7);
assertEq('word: maxScore', wordResult.maxScore, 10);

// ── PowerPoint task: học viên làm ĐÚNG cả 3 requirement ──
var pptInit = TaskSchema.instantiateInitialState(PptTask.task);
var pres = pptInit.pres;
var slide = pres.slides[0];
PM.setPosition(slide, 'titleBox', 50, PM.getObject(slide, 'titleBox').position.y);
PM.bringToFront(slide, 'titleBox');
PM.setText(slide, 'titleBox', 'Chào mừng');
var pptResult = Validator.validateTask(PptTask.task, { pres: pres });
assertEq('ppt: fully completed', pptResult.completed, true);
assertEq('ppt: score', pptResult.score, 10);

// ── Excel task: học viên không làm gì ──
var excelInit = TaskSchema.instantiateInitialState(ExcelTask.task);
var excelEngine = ExcelTask.hydrate(excelInit);
var excelResult = Validator.validateTask(ExcelTask.task, { engine: excelEngine });
assertEq('excel: score 0 when untouched', excelResult.score, 0);

// ── Trộn cả 3 vào 1 kỳ thi, kiểm tra validateExam + skillReport ──
var exam = Validator.validateExam(
  [WordTask.task, PptTask.task, ExcelTask.task],
  {
    'word-heading-bold-header': { doc: wordDoc },
    'ppt-align-front-title': { pres: pres },
    'excel-sum-b5': { engine: excelEngine }
  }
);
assertEq('exam total score', exam.score, 7 + 10 + 0);
assertEq('exam total maxScore', exam.maxScore, 10 + 10 + 10);
assertEq('exam percent', exam.percent, Math.round((17 / 30) * 1000) / 10);
assertEq('skill report has all 3 applications', Object.keys(exam.skillReport.byApplication).sort(), ['excel', 'powerpoint', 'word']);
assertEq('skill report word score', exam.skillReport.byApplication.word.score, 7);
assertEq('skill report ppt completedCount', exam.skillReport.byApplication.powerpoint.completedCount, 1);
assertEq('skill report excel completedCount', exam.skillReport.byApplication.excel.completedCount, 0);

console.log('\n' + (failures === 0 ? 'ALL PASSED' : failures + ' FAILURE(S)'));
process.exit(failures === 0 ? 0 : 1);
