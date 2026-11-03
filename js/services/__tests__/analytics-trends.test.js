/* Test EduAnalytics.progressTrends + reviewFlags (js/services/analytics-service.js) — Dashboard giáo viên.
   Chạy: node js/services/__tests__/analytics-trends.test.js — hàm thuần, không gọi mạng. */
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

var t = 0;
function res(name, cls, score, extra) {
  t += 1000;
  return Object.assign({ studentName: name, studentClass: cls, score: score, submittedAtMs: t, total: 20, elapsedSec: 600, tabSwitches: 0, integrityOk: true, flags: [] }, extra || {});
}

// ── progressTrends ──
var results = [
  res('An', '6A', 40), res('Bình', '6A', 90), res('Chi', '6B', 70), res('Dũng', '6B', 80),
  res('An', '6A', 50), res('Bình', '6A', 85), res('Chi', '6B', 72), res('Dũng', '6B', 90),
  res('An', '6A', 80), res('Bình', '6A', 60), res('Chi', '6B', 75),
  res('an ', '6a', 90),                   // cùng 1 em (khác hoa/thường/khoảng trắng)
  res('Em', '6C', 30), res('Em', '6C', 90), // chỉ 2 bài → chưa đủ để kết luận
];
var tr = A.progressTrends(results);
assertEq('tiến bộ: An 40,50 → 80,90 (+40); gộp tên gõ lệch', tr.improving.map(function (e) { return [e.studentName, e.before, e.recent, e.delta, e.attempts]; }), [['An', 45, 85, 40, 4]]);
assertEq('sa sút: Bình 90 → 85,60 (−17)', tr.declining.map(function (e) { return [e.studentName, e.before, e.recent, e.delta]; }), [['Bình', 90, 73, -17]]);
assertEq('chênh dưới 10 điểm (Chi, Dũng) và < 3 bài (Em) không vào danh sách',
  [tr.improving.concat(tr.declining).some(function (e) { return /Chi|Dũng|Em/.test(e.studentName); })], [false]);
assertEq('mảng không theo thứ tự nộp → vẫn xét theo thời gian (90 rồi 30, 30 = sa sút)', A.progressTrends([res('X', '1', 90), res('X', '1', 30), res('X', '1', 30)].reverse()).declining.map(function (e) { return e.delta; }), [-60]);

assertEq('bài bị cảnh báo sửa điểm không tính vào xu hướng',
  A.progressTrends([res('Y', '1', 50), res('Y', '1', 50), res('Y', '1', 100, { integrityOk: false })]).improving.length, 0);

// ── reviewFlags ──
var flagged = A.reviewFlags([
  res('An', '6A', 100, { integrityOk: false, flags: ['Điểm gửi lên 100% khác điểm máy chủ chấm 50%'] }),
  res('Bình', '6A', 70, { tabSwitches: 5 }),
  res('Chi', '6B', 95, { elapsedSec: 40 }),        // 20 câu trong 40 giây, 95%
  res('Dũng', '6B', 40, { elapsedSec: 40 }),       // nhanh nhưng điểm thấp → bỏ qua
  res('Em', '6C', 90, { elapsedSec: 0 }),          // không có thời gian → không kết luận
  res('Giang', '6C', 80, { integrityOk: false }),  // không có lý do cụ thể
  res('Hà', '6C', 88),
]);
assertEq('bài cần xem lại: mới nhất trước, bỏ bài bình thường', flagged.map(function (f) { return f.result.studentName; }), ['Giang', 'Chi', 'Bình', 'An']);
assertEq('lý do: điểm lệch máy chủ', flagged[3].reasons, ['Điểm gửi lên 100% khác điểm máy chủ chấm 50%']);
assertEq('lý do: rời trang / làm quá nhanh / toàn vẹn chung', [flagged[2].reasons, flagged[1].reasons, flagged[0].reasons],
  [['Rời trang làm bài 5 lần'], ['Làm rất nhanh: 40 giây cho 20 câu, đạt 95%'], ['Không qua kiểm tra toàn vẹn bài làm']]);

if (failures) { console.log('\n' + failures + ' kiểm tra THẤT BẠI'); process.exit(1); }
console.log('\nTất cả kiểm tra đạt.');
