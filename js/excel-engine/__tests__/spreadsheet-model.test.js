var SM = require('../spreadsheet-model.js');

var failures = 0;
function assertEq(label, actual, expected) {
  var pass = JSON.stringify(actual) === JSON.stringify(expected);
  console.log((pass ? 'PASS' : 'FAIL') + '  ' + label + '  =>  ' + JSON.stringify(actual) + (pass ? '' : '  (expected ' + JSON.stringify(expected) + ')'));
  if (!pass) failures++;
}

var engine = new SM.SpreadsheetEngine();
engine.setCellValue('Sheet1', 'B2', 100);
engine.setCellValue('Sheet1', 'B3', 200);
engine.setCellValue('Sheet1', 'B4', 300);
engine.setCellFormula('Sheet1', 'B5', '=SUM(B2:B4)');
engine.setCellStyle('Sheet1', 'B5', { bold: true });
engine.setCellNumberFormat('Sheet1', 'B5', 'Currency');

assertEq('B5 formula recalculated', engine.getCell('Sheet1', 'B5').value, 600);
assertEq('B5 style bold', engine.getCell('Sheet1', 'B5').style.bold, true);
assertEq('B5 numberFormat', engine.getCell('Sheet1', 'B5').numberFormat, 'Currency');

// Dependent formula re-recalculates when a precedent changes
engine.setCellValue('Sheet1', 'B2', 1000);
assertEq('B5 recalculates after B2 changes', engine.getCell('Sheet1', 'B5').value, 1500);

// Circular reference detection
engine.setCellFormula('Sheet1', 'C1', '=C2+1');
engine.setCellFormula('Sheet1', 'C2', '=C1+1');
assertEq('circular ref C1 error', engine.getCell('Sheet1', 'C1').error, '#CIRCULAR!');
assertEq('circular ref C2 error', engine.getCell('Sheet1', 'C2').error, '#CIRCULAR!');

// Multiple worksheets + cross-sheet formula
var wb2 = new SM.SpreadsheetEngine();
wb2.workbook.addSheet('Sheet2');
wb2.setCellValue('Sheet1', 'A1', 42);
wb2.setCellFormula('Sheet2', 'A1', '=Sheet1!A1*2');
assertEq('cross-sheet formula', wb2.getCell('Sheet2', 'A1').value, 84);

// Sort range (2 columns, sort by 2nd column descending, row order should follow)
var s = new SM.SpreadsheetEngine();
s.setCellValue('Sheet1', 'A1', 'Cam'); s.setCellValue('Sheet1', 'B1', 30);
s.setCellValue('Sheet1', 'A2', 'Tao'); s.setCellValue('Sheet1', 'B2', 10);
s.setCellValue('Sheet1', 'A3', 'Le');  s.setCellValue('Sheet1', 'B3', 20);
s.sortRange('Sheet1', { start: 'A1', end: 'B3' }, 1, true); // sort by column B ascending
assertEq('sort row1 A', s.getCell('Sheet1', 'A1').value, 'Tao');
assertEq('sort row2 A', s.getCell('Sheet1', 'A2').value, 'Le');
assertEq('sort row3 A', s.getCell('Sheet1', 'A3').value, 'Cam');

// Conditional formatting
var cf = new SM.SpreadsheetEngine();
cf.setCellValue('Sheet1', 'A1', 50);
cf.addConditionalFormat('Sheet1', { start: 'A1', end: 'A1' }, { type: 'greaterThan', value: 30 }, { fillColor: 'red' });
var effStyle = cf.getEffectiveStyle('Sheet1', 'A1');
assertEq('conditional format applied', effStyle.fillColor, 'red');

// Filter
var f = new SM.SpreadsheetEngine();
f.setCellValue('Sheet1', 'A1', 5);
f.setCellValue('Sheet1', 'A2', 15);
f.setCellValue('Sheet1', 'A3', 25);
var visible = f.filterRange('Sheet1', { start: 'A1', end: 'A3' }, 0, function (v) { return v > 10; });
assertEq('filter rows > 10', visible, [2, 3]);

console.log('\n' + (failures === 0 ? 'ALL PASSED' : failures + ' FAILURE(S)'));
process.exit(failures === 0 ? 0 : 1);
