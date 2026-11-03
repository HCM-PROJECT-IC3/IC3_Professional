/* Test EduAnalytics.schoolComparison (js/services/analytics-service.js) — so sánh giữa các trường.
   Chạy: node js/services/__tests__/analytics-school-compare.test.js — hàm thuần, không gọi mạng. */
var path = require('path');

var failures = 0;
function assertEq(label, actual, expected) {
  var pass = JSON.stringify(actual) === JSON.stringify(expected);
  console.log((pass ? 'PASS' : 'FAIL') + '  ' + label + '  =>  ' + JSON.stringify(actual) + (pass ? '' : '  (expected ' + JSON.stringify(expected) + ')'));
  if (!pass) failures++;
}

globalThis.window = globalThis;
require(path.join(__dirname, '..', '..', 'models', 'school.model.js'));
require(path.join(__dirname, '..', 'analytics-service.js'));
var A = globalThis.EduAnalytics;

var students = [
  { school: 'THCS Lê Lợi', name: 'An', className: '6A' },
  { school: 'THCS Lê Lợi', name: 'Bình', className: '6A' },
  { school: 'THCS Lê Lợi', name: 'Chi', className: '6B' },
  { school: 'THCS Lê Lợi', name: 'Dũng', className: '6B' },
  { school: 'TH Nguyễn Du', name: 'Em', className: '3A' },
  { school: 'TH Nguyễn Du', name: 'Giang', className: '3A' },
];
var results = [
  // Lê Lợi: An làm 2 bài (1 bài tên trường gõ lệch), Chi 1 bài; 1 bài của em ngoài roster
  { studentSchool: 'THCS Lê Lợi', studentName: 'An', studentClass: '6A', score: 90 },
  { studentSchool: ' thcs  lê lợi', studentName: ' an ', studentClass: '6a', score: 70 },
  { studentSchool: 'THCS Lê Lợi', studentName: 'Chi', studentClass: '6B', score: 50 },
  { studentSchool: 'THCS Lê Lợi', studentName: 'Lạ', studentClass: '6C', score: 100 },
  // Nguyễn Du: Em 1 bài
  { studentSchool: 'TH Nguyễn Du', studentName: 'Em', studentClass: '3A', score: 60 },
  // Trường không có roster
  { studentSchool: 'THPT Mới', studentName: 'X', studentClass: '10A', score: 80 },
  { studentSchool: 'THPT Mới', studentName: 'Y', studentClass: '10A', score: 'n/a' },
];

var rows = A.schoolComparison(results, students);
var byId = {};
rows.forEach(function (r) { byId[r.schoolId] = r; });

assertEq('3 trường (tên gõ lệch gộp về 1)', rows.map(function (r) { return r.schoolId; }).sort(), ['th-nguyen-du', 'thcs-le-loi', 'thpt-moi']);
assertEq('Lê Lợi: roster 4, đã làm 2 (An + Chi; em ngoài roster không tính)', [byId['thcs-le-loi'].rosterSize, byId['thcs-le-loi'].active], [4, 2]);
assertEq('Lê Lợi: tham gia 50%, 4 lượt nộp', [byId['thcs-le-loi'].participation, byId['thcs-le-loi'].submissions], [50, 4]);
assertEq('Lê Lợi: điểm TB, tỷ lệ đạt (≥70)', [byId['thcs-le-loi'].avg, byId['thcs-le-loi'].passRate], [77.5, 75]);
assertEq('Nguyễn Du: 1/2 tham gia, chưa ai đạt', [byId['th-nguyen-du'].participation, byId['th-nguyen-du'].passRate], [50, 0]);
assertEq('trường ngoài roster: tham gia null, đếm theo bài nộp', [byId['thpt-moi'].rosterSize, byId['thpt-moi'].active, byId['thpt-moi'].participation], [0, 2, null]);
assertEq('điểm không phải số bị bỏ qua khi tính TB', byId['thpt-moi'].avg, 80);
assertEq('tên trường hiển thị lấy từ roster', byId['thcs-le-loi'].school, 'THCS Lê Lợi');
assertEq('sắp theo điểm TB giảm dần', rows.map(function (r) { return r.schoolId; }), ['thpt-moi', 'thcs-le-loi', 'th-nguyen-du']);

// Trường có roster nhưng chưa ai làm bài → vẫn hiện, avg null xếp cuối
var r2 = A.schoolComparison([], [{ school: 'TH Z', name: 'A', className: '1A' }]);
assertEq('chưa có bài nộp: avg/passRate null, tham gia 0%', [r2[0].avg, r2[0].passRate, r2[0].participation], [null, null, 0]);
assertEq('không có dữ liệu → mảng rỗng', A.schoolComparison([], []), []);

console.log(failures ? '\n' + failures + ' FAIL' : '\nTất cả PASS');
process.exit(failures ? 1 : 0);
