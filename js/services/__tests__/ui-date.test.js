/* Test hàm thuần của lịch chọn ngày (js/ui-date.js). Chạy: node js/services/__tests__/ui-date.test.js */
var path = require('path');

var failures = 0;
function assertEq(label, actual, expected) {
  var pass = JSON.stringify(actual) === JSON.stringify(expected);
  console.log((pass ? 'PASS' : 'FAIL') + '  ' + label + '  =>  ' + JSON.stringify(actual) + (pass ? '' : '  (expected ' + JSON.stringify(expected) + ')'));
  if (!pass) failures++;
}

require(path.join(__dirname, '..', '..', 'ui-date.js'));
var P = globalThis.EduDatePicker;

var g = P.monthGrid(2026, 10); // tháng 11/2026: ngày 1 là Chủ nhật
assertEq('42 ô (6 tuần)', g.length, 42);
assertEq('bắt đầu Thứ Hai: ô đầu 26/10, ngày 1/11 ở cột CN', [g[0], g[6]], ['2026-10-26', '2026-11-01']);
assertEq('ô cuối', g[41], '2026-12-06');
var g2 = P.monthGrid(2026, 5); // 1/6/2026 là Thứ Hai
assertEq('tháng bắt đầu đúng Thứ Hai: ô đầu là ngày 1', g2[0], '2026-06-01');
assertEq('đọc ngày', P.iso(P.parseIso('2026-11-20')), '2026-11-20');
assertEq('ngày không có thật → null', [P.parseIso('2026-02-30'), P.parseIso('20/11/2026'), P.parseIso('')], [null, null, null]);
assertEq('đếm ngày (qua tháng)', P.daysBetween(new Date(2026, 10, 9, 23, 0), new Date(2026, 11, 1, 1, 0)), 22);
assertEq('đếm ngày âm', P.daysBetween(new Date(2026, 10, 9), new Date(2026, 10, 1)), -8);
assertEq('chuỗi tiếng Việt', [P.vnLong(new Date(2026, 10, 20)), P.vnShort(new Date(2026, 0, 5))], ['Thứ Sáu, 20/11/2026', '05/01/2026']);

console.log(failures ? '\n' + failures + ' test FAIL' : '\nTất cả PASS');
process.exit(failures ? 1 : 0);
