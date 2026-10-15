/* Test EduAnalytics.classLeaderboard / weekStartMs (js/services/analytics-service.js) — thi đua lớp theo tuần.
   Chạy: node js/services/__tests__/analytics-class-race.test.js — hàm thuần, không gọi mạng. */
var path = require('path');

var failures = 0;
function assertEq(label, actual, expected) {
  var pass = JSON.stringify(actual) === JSON.stringify(expected);
  console.log((pass ? 'PASS' : 'FAIL') + '  ' + label + '  =>  ' + JSON.stringify(actual) + (pass ? '' : '  (expected ' + JSON.stringify(expected) + ')'));
  if (!pass) failures++;
}

globalThis.window = globalThis;
require(path.join(__dirname, '..', 'analytics-service.js'));
var A = globalThis.EduAnalytics;

// Thứ Tư 14/10/2026 10:00 → tuần bắt đầu thứ Hai 12/10/2026 0:00
var wed = new Date(2026, 9, 14, 10).getTime();
var mon = new Date(2026, 9, 12).getTime();
assertEq('weekStartMs: thứ Tư → thứ Hai cùng tuần', A.weekStartMs(wed), mon);
assertEq('weekStartMs: Chủ nhật thuộc tuần trước đó', A.weekStartMs(new Date(2026, 9, 18, 23).getTime()), mon);
assertEq('weekStartMs: đúng 0h thứ Hai', A.weekStartMs(mon), mon);

var students = [];
['7A1', '7A1', '7A1', '7A1', '7A2', '7A2'].forEach(function (c, i) { students.push({ name: 'HS' + i, className: c }); });
var t = mon + 3600e3;
var results = [
  // 7A1: 4 HS trong roster, 2 em làm (50%), TB 90 → 45 điểm
  { studentClass: '7A1', studentName: 'HS0', score: 100, submittedAtMs: t },
  { studentClass: '7A1', studentName: 'hs0 ', score: 80, submittedAtMs: t },   // cùng em (khác hoa/thường, khoảng trắng)
  { studentClass: '7A1', studentName: 'HS1', score: 90, submittedAtMs: t },
  // 7A2: 2/2 em (100%), TB 70 → 70 điểm
  { studentClass: '7A2', studentName: 'HS4', score: 60, submittedAtMs: t },
  { studentClass: '7A2', studentName: 'HS5', score: 80, submittedAtMs: t },
  // 7A3 không có roster → coi 100%, TB 50
  { studentClass: '7A3', studentName: 'X', score: 50, submittedAtMs: t },
  // Bỏ qua: bài tuần trước, không có lớp, điểm không phải số
  { studentClass: '7A3', studentName: 'Y', score: 100, submittedAtMs: mon - 1 },
  { studentClass: '', studentName: 'Z', score: 100, submittedAtMs: t },
  { studentClass: '7A1', studentName: 'HS2', score: null, submittedAtMs: t },
];
var board = A.classLeaderboard(results, students, mon);
assertEq('thứ tự theo điểm thi đua', board.map(function (c) { return c.className; }), ['7A2', '7A3', '7A1']);
assertEq('7A1: TB 90, 2/4 HS, 3 bài, 50% → 45', board[2], { className: '7A1', avg: 90, submissions: 3, active: 2, rosterSize: 4, participation: 50, points: 45 });
assertEq('7A3 không có roster → tham gia 100%', [board[1].participation, board[1].points, board[1].submissions], [100, 50, 1]);
assertEq('không có bài nào → mảng rỗng', A.classLeaderboard([], students, mon), []);

// Hoà điểm → lớp nhiều bài hơn đứng trước
var tie = A.classLeaderboard([
  { studentClass: 'B', studentName: 'a', score: 80, submittedAtMs: t },
  { studentClass: 'A', studentName: 'b', score: 80, submittedAtMs: t },
  { studentClass: 'A', studentName: 'b', score: 80, submittedAtMs: t },
], [], mon);
assertEq('hoà điểm → nhiều bài hơn đứng trước', tie.map(function (c) { return c.className; }), ['A', 'B']);

// ── Học sinh xuất sắc: chỉ em đạt ≥ 80% (không phải top N bất kể điểm) ──
var hs = [{ name: 'An', avgScore: 80 }, { name: 'Bình', avgScore: 40 }, { name: 'Chi', avgScore: 100 }, { name: 'Dũng' }];
assertEq('xuất sắc: bỏ em dưới 80% và em chưa có điểm', A.topStudents(hs, 20).map(function (e) { return e.name; }), ['Chi', 'An']);
assertEq('xuất sắc: ngưỡng tuỳ chỉnh', A.topStudents(hs, 20, 30).length, 3);

console.log(failures ? '\n' + failures + ' FAIL' : '\nTất cả PASS');
process.exit(failures ? 1 : 0);
