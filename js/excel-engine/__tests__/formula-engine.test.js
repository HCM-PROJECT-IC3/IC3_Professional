/* Unit test thuần Node — không cần trình duyệt. Chạy:
     node js/excel-engine/__tests__/formula-engine.test.js
   Thất bại → process.exit(1) để dùng được trong CI sau này. */
var FE = require('../formula-engine.js');

var DATA = {
  Sheet1: {
    '1,1': 10, '1,2': 20, '1,3': 30, // A1,A2,A3
    '2,1': 1, '2,2': 2, '2,3': 3,     // B1,B2,B3
    '3,1': 'Táo', '3,2': 'Cam', '3,3': 'Táo', // C1..C3
    '4,1': 5000, '4,2': 7000, '4,3': 3000     // D1..D3 (giá tương ứng)
  }
};

var ctx = {
  currentSheet: 'Sheet1',
  getCellValue: function (sheet, col, row) {
    var v = (DATA[sheet] || {})[col + ',' + row];
    return v === undefined ? null : v;
  },
  getRangeValues: function (sheet, c1, r1, c2, r2) {
    var out = [];
    for (var r = r1; r <= r2; r++) {
      var row = [];
      for (var c = c1; c <= c2; c++) row.push(this.getCellValue(sheet, c, r));
      out.push(row);
    }
    return out;
  }
};

var failures = 0;
function check(label, formula, expected) {
  var result = FE.evaluate(formula, ctx);
  var actual = result.error ? result.error : result.value;
  var pass = JSON.stringify(actual) === JSON.stringify(expected);
  console.log((pass ? 'PASS' : 'FAIL') + '  ' + label + '  =>  ' + JSON.stringify(actual) + (pass ? '' : '  (expected ' + JSON.stringify(expected) + ')'));
  if (!pass) failures++;
}

check('SUM range', '=SUM(A1:A3)', 60);
check('SUM args mixed', '=SUM(A1,B1,5)', 16);
check('AVERAGE', '=AVERAGE(A1:A3)', 20);
check('MIN', '=MIN(A1:A3)', 10);
check('MAX', '=MAX(A1:A3)', 30);
check('COUNT', '=COUNT(A1:A3)', 3);
check('COUNTA text', '=COUNTA(C1:C3)', 3);
check('IF true', '=IF(A1>5,"big","small")', 'big');
check('IF false', '=IF(A1<5,"big","small")', 'small');
check('AND', '=AND(A1>5,B1<5)', true);
check('OR false', '=OR(A1<5,B1>5)', false);
check('ROUND', '=ROUND(3.14159,2)', 3.14);
check('arithmetic precedence', '=A1+B1*10', 20);
check('parentheses', '=(A1+B1)*10', 110);
check('power', '=2^3', 8);
check('concat', '=C3&"-"&B3', 'Táo-3');
check('comparison eq string', '=C1=C3', true);
check('absolute ref same as relative value', '=$A$1+A2', 30);
check('COUNTIF gt', '=COUNTIF(A1:A3,">15")', 2);
check('COUNTIF eq text', '=COUNTIF(C1:C3,"Táo")', 2);
check('SUMIF text criteria + sum range', '=SUMIF(C1:C3,"Táo",D1:D3)', 8000);
check('SUMIF numeric no sum range', '=SUMIF(A1:A3,">15")', 50);
check('VLOOKUP exact', '=VLOOKUP("Cam",C1:D3,2,FALSE)', 7000);
check('XLOOKUP', '=XLOOKUP("Táo",C1:C3,D1:D3)', 5000);
check('div by zero error', '=A1/0', '#DIV/0!');
check('unknown function error', '=FOO(1)', '#NAME?');
check('nested IF+AND', '=IF(AND(A1>5,B1<5),"ok","no")', 'ok');

// Dependency extraction — dùng cho recalc order trong spreadsheet-model
var deps = FE.extractDependencies('=SUM(A1:A2)+B1', 'Sheet1');
var depsOk = deps.length === 3 &&
  deps.some(function (d) { return d.col === 1 && d.row === 1; }) &&
  deps.some(function (d) { return d.col === 1 && d.row === 2; }) &&
  deps.some(function (d) { return d.col === 2 && d.row === 1; });
console.log((depsOk ? 'PASS' : 'FAIL') + '  extractDependencies  => ' + JSON.stringify(deps));
if (!depsOk) failures++;

console.log('\n' + (failures === 0 ? 'ALL PASSED' : failures + ' FAILURE(S)'));
process.exit(failures === 0 ? 0 : 1);
