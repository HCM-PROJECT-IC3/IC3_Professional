/* Test js/teacher/teacher-insights-core.js — Tổng quan lớp của dashboard giáo viên (năng lực, tiến độ,
   bài đã giao, so sánh 2 đợt, chuyên cần). Chạy: node js/teacher/__tests__/teacher-insights-core.test.js */
var path = require('path');

var failures = 0;
function assertEq(label, actual, expected) {
  var pass = JSON.stringify(actual) === JSON.stringify(expected);
  console.log((pass ? 'PASS' : 'FAIL') + '  ' + label + (pass ? '' : '  =>  ' + JSON.stringify(actual) + '  (expected ' + JSON.stringify(expected) + ')'));
  if (!pass) failures++;
}
var T = require(path.join(__dirname, '..', 'teacher-insights-core.js'));
var key = function (s) { return T.keyNC(s.name, s.className); };
var H = function (name, cls, avg, n) { return { studentKey: T.keyNC(name, cls), studentName: name, studentClass: cls, avgScore: avg, attemptsCount: n || 1 }; };

// ── Năng lực ──
var hs = [H('An', '8A1', 95), H('Bình', '8A1', 72), H('Chi', '8A1', 55), H('Dũng', '8A1', 30), H('Em', '8A2', 85), H('Giang', '8A2', null)];
assertEq('proficiency: Giỏi ≥85 · Khá ≥70 · TB ≥50 · Yếu, bỏ em chưa có điểm', T.proficiency(hs), { total: 5, bands: { gioi: 2, kha: 1, tb: 1, yeu: 1 }, pct: { gioi: 40, kha: 20, tb: 20, yeu: 20 } });
assertEq('bandOf: ranh giới', [T.bandOf(85), T.bandOf(84), T.bandOf(70), T.bandOf(50), T.bandOf(49), T.bandOf(undefined)], ['gioi', 'kha', 'kha', 'tb', 'yeu', null]);

// ── Đồng hồ tiến độ ──
var roster = [{ name: 'An', className: '8A1' }, { name: 'Bình', className: '8A1' }, { name: 'Chi', className: '8A1' }, { name: 'Dũng', className: '8A1' }, { name: 'Hà', className: '8A1' }, { name: 'an ', className: '8a1' }];
var g = T.progressGauge(roster, hs.slice(0, 4).concat([H('Khách', '9A', 91)]), key);
assertEq('progressGauge: chưa làm / chưa đạt (<70) / đạt / vượt trội (≥90); trùng tên không đếm 2 lần; em ngoài danh sách vẫn tính',
  [g.total, g.notStarted, g.below, g.pass, g.excel, g.passPct, g.donePct], [6, 1, 2, 1, 2, 50, 83]);

// ── Cần hỗ trợ / xuất sắc ──
var sp = T.spotlight(hs.concat([H('Hùng', '8A2', 30, 4)]), 2);
assertEq('spotlight: thấp nhất (bằng điểm → làm nhiều bài hơn trước) / cao nhất', [sp.bottom.map(function (h) { return h.studentName; }), sp.top.map(function (h) { return h.studentName; })], [['Hùng', 'Dũng'], ['An', 'Em']]);
assertEq('trendLabel', [...T.trendLabel({ improving: [{ studentName: 'An', studentClass: '8A1' }], declining: [{ studentName: 'Chi', studentClass: '8A1' }] })], [['an__8a1', 'up'], ['chi__8a1', 'down']]);

// ── Bài đã giao ──
var DAY = 86400000, t0 = Date.UTC(2026, 10, 1);
var a = { title: 'Ôn tập Bài 3', classes: ['8A1', '8A2'], deadline: t0 + 3 * DAY, createdAt: t0 };
var stu = [{ name: 'An', className: '8A1' }, { name: 'Bình', className: '8A1' }, { name: 'Chi', className: '8A1' }, { name: 'Em', className: '8A2' }];
var res = [
  { testName: 'IC3 › LV2 › Ôn tập Bài 3', studentName: 'An', studentClass: '8A1', score: 60, submittedAtMs: t0 + DAY },
  { testName: 'IC3 › LV2 › Ôn tập Bài 3', studentName: 'An', studentClass: '8A1', score: 90, submittedAtMs: t0 + 5 * DAY },
  { testName: 'IC3 › LV2 › Ôn tập Bài 3 (nộp muộn)', studentName: 'Bình', studentClass: '8A1', score: 70, submittedAtMs: t0 + 4 * DAY },
  { testName: 'IC3 › LV2 › Ôn tập bài 3', studentName: 'Em', studentClass: '8A2', score: 80, submittedAtMs: t0 + 2 * DAY },
  { testName: 'IC3 › LV2 › Ôn tập Bài 3', studentName: 'Lạ', studentClass: '9B', score: 50, submittedAtMs: t0 + 2 * DAY },
  { testName: 'IC3 › LV2 › Ôn tập Bài 3', studentName: 'Chi', studentClass: '8A1', score: 99, submittedAtMs: t0 - 3 * DAY },
  { testName: 'IC3 › LV2 › Bài khác', studentName: 'Chi', studentClass: '8A1', score: 99, submittedAtMs: t0 + DAY },
];
var ap = T.assignmentProgress(a, res, stu, key);
assertEq('bài đã giao: khớp tên đề (kể cả "(nộp muộn)", hoa thường), điểm cao nhất, muộn chỉ khi không có bài đúng hạn, bỏ bài trước lúc giao',
  ap.classes, [{ className: '8A1', roster: 3, submitted: 2, late: 1, missing: ['Chi'], avg: 80 }, { className: '8A2', roster: 1, submitted: 1, late: 0, missing: [], avg: 80 }]);
assertEq('bài đã giao: tổng + em lớp khác làm thử', [ap.total, ap.extra], [{ roster: 4, submitted: 3, pct: 75 }, 1]);
assertEq('matchesTitle', [T.matchesTitle('A › B › Đề 1 (nộp muộn)', 'đề 1'), T.matchesTitle('Đề 1', 'Đề 1'), T.matchesTitle('A › Đề 10', 'Đề 1'), T.matchesTitle('x', '')], [true, true, false, false]);

// ── So sánh 2 đợt ──
var R = function (t, n, c, s) { return { testName: t, studentName: n, studentClass: c, score: s }; };
var cr = T.compareRounds([R('GK', 'An', '8A1', 60), R('GK', 'An', '8A1', 70), R('CK', 'An', '8A1', 90), R('GK', 'Bình', '8A1', 80), R('CK', 'Bình', '8A1', 70),
  R('GK', 'Em', '8A2', 50), R('CK', 'Em', '8A2', 52), R('CK', 'Mới', '8A2', 100)], 'GK', 'CK');
assertEq('compareRounds: theo lớp (mỗi em lấy điểm cao nhất mỗi đợt)', cr.classes, [{ className: '8A1', avgA: 75, avgB: 80, nA: 2, nB: 2, delta: 5 }, { className: '8A2', avgA: 50, avgB: 76, nA: 1, nB: 2, delta: 26 }]);
assertEq('compareRounds: tổng + em làm cả 2 đợt (±5 điểm mới tính tiến bộ/sa sút)', [cr.overall, cr.students], [{ avgA: 67, avgB: 78, nA: 3, nB: 4, delta: 11 }, { both: 3, up: 1, down: 1, same: 1 }]);
assertEq('compareRounds: đợt không có bài → null, không lỗi', T.compareRounds([], 'X', 'Y').overall, { avgA: null, avgB: null, nA: 0, nB: 0, delta: null });

// ── Chuyên cần ──
var at = T.attendanceSummary([
  { className: '8A2', at: 5, stats: { students: [{ name: 'Lan', vang: 3, lien: 1, nl: false }, { name: 'Nghỉ', vang: 9, lien: 9, nl: true }], sessions: [{ col: 4, comat: 18, vang: 2 }, { col: 5, comat: 15, vang: 5 }] } },
  { className: '8A1', at: 6, stats: { students: [{ name: 'Minh', vang: 2, lien: 2, nl: false }, { name: 'Ổn', vang: 1, lien: 0, nl: false }], sessions: [{ col: 4, comat: 20, vang: 0 }] } },
  { className: '8A3', at: 7, stats: { students: [], sessions: [] } },
]);
assertEq('chuyên cần: tỉ lệ có mặt theo lớp, em vắng ≥3 hoặc vắng liền ≥2 (bỏ em nghỉ luôn), TB các lớp có số liệu',
  [at.classes.map(function (c) { return [c.className, c.rate, c.sessions, c.watch.map(function (w) { return w.name; })]; }), at.rate, at.watch],
  [[['8A1', 100, 1, ['Minh']], ['8A2', 83, 2, ['Lan']], ['8A3', null, 0, []]], 92, 2]);

console.log(failures ? '\n' + failures + ' test FAIL' : '\nTất cả test PASS');
process.exit(failures ? 1 : 0);
