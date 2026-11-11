/* Test EduAnalytics.trendByWeek / scoreBands / classStats / trendByDay (js/services/analytics-service.js) —
   biểu đồ Tổng quan điều phối. Chạy: node js/services/__tests__/analytics-coordinator.test.js — hàm thuần, không gọi mạng. */
var path = require('path');
var failures = 0;
function assertEq(label, actual, expected) {
  var pass = JSON.stringify(actual) === JSON.stringify(expected);
  console.log((pass ? 'PASS' : 'FAIL') + '  ' + label + (pass ? '' : '  =>  ' + JSON.stringify(actual) + '  (expected ' + JSON.stringify(expected) + ')'));
  if (!pass) failures++;
}
globalThis.window = globalThis;
require(path.join(__dirname, '..', 'analytics-service.js'));
var A = globalThis.EduAnalytics;
function at(y, m, d, h) { return new Date(y, m - 1, d, h || 9).getTime(); }
function r(name, cls, score, ms) { return { studentName: name, studentClass: cls, score: score, submittedAtMs: ms }; }

// Tuần: Thứ 2 9/11 → CN 15/11/2026; Thứ 2 16/11 là tuần sau
var rs = [r('An', '3A1', 100, at(2026, 11, 9)), r('Bình', '3A1', 20, at(2026, 11, 15, 22)), r('Chi', '3A2', 60, at(2026, 11, 16)), r('Dũng', '3A2', null, at(2026, 11, 17))];
var w = A.trendByWeek(rs);
assertEq('trendByWeek: gộp theo tuần thứ Hai (CN 22h vẫn thuộc tuần đó), bỏ bài không có điểm', w.map(function (x) { return [new Date(x.weekMs).getDate(), x.avg, x.count]; }), [[9, 60, 2], [16, 60, 1]]);
assertEq('trendByDay: ngày theo giờ máy (bài 6h sáng không lùi sang hôm trước)', A.trendByDay([r('An', '3A1', 80, at(2026, 11, 10, 6))]).map(function (x) { return x.date; }), ['2026-11-10']);

assertEq('scoreBands: 4 mức, biên 50/70/85, điểm >100 / <0 kẹp lại',
  A.scoreBands([0, 49, 49.5, 50, 69, 69.9, 70, 84, 85, 100, 120, -5, null].map(function (s) { return { score: s }; })).map(function (b) { return [b.label, b.count]; }),
  [['Dưới 50%', 4], ['50–69%', 3], ['70–84%', 2], ['85–100%', 3]]);

var students = [{ name: 'An', className: '3A1' }, { name: 'Bình', className: '3A1' }, { name: 'Cường', className: '3A1' }, { name: 'Chi', className: '3A2' }, { name: 'Em', className: '4A1' }];
var cs = A.classStats([r('An', '3A1', 100, 1), r('an ', '3A1', 80, 2), r('Bình', '3A1', 20, 3), r('Chi', '3A2', 60, 4), r('Lạ', '9A9', 50, 5)], students);
assertEq('classStats: TB, số bài, sĩ số, số HS đã làm (khớp tên không phân biệt hoa/khoảng trắng), tham gia %',
  cs.map(function (c) { return [c.cls, c.avg, c.count, c.roster, c.submitted, c.participation]; }),
  [['3A1', 66.7, 3, 3, 2, 67], ['3A2', 60, 1, 1, 1, 100], ['4A1', null, 0, 1, 0, 0], ['9A9', 50, 1, 0, 1, null]]);
assertEq('classStats: không có roster vẫn chạy', A.classStats([r('A', 'X', 50, 1)]).map(function (c) { return c.participation; }), [null]);

console.log(failures ? failures + ' FAIL' : 'Tất cả PASS');
process.exit(failures ? 1 : 0);
