/* Test "Nhiệm vụ mùa thi" ở sảnh (js/exam-countdown.js → missionFor).
   Chạy: node js/services/__tests__/exam-mission.test.js — thuần, không mạng, không DOM. */
var path = require('path');
var failures = 0;
function assertEq(label, actual, expected) {
  var pass = JSON.stringify(actual) === JSON.stringify(expected);
  console.log((pass ? 'PASS' : 'FAIL') + '  ' + label + (pass ? '' : '  =>  ' + JSON.stringify(actual) + '  (expected ' + JSON.stringify(expected) + ')'));
  if (!pass) failures++;
}

var M = require(path.join(__dirname, '..', '..', 'exam-countdown.js'))._missionFor;

// Lộ trình 10 bài, đạt 4, bài nên làm tiếp là Bài 5
function info(passed, today, next) {
  var steps = Array.from({ length: 10 }, function (_, i) { return { name: 'Bài ' + (i + 1) + '. X', i: i }; });
  return { path: { steps: steps, passed: passed, next: next === undefined ? steps[passed] : next }, today: today || [] };
}
var lesson = [{ catId: 'IC3', levelId: 'LV1', mtKey: 'Bài 5. X', isMix: false, score: 80 }];
var mix = [{ catId: 'IC3', levelId: 'LV1', mtKey: '', isMix: true, score: 65 }];

assertEq('ngày thi: không giao bài', [M(0, null).phase, !!M(0, null).act], ['Ngày thi', false]);
assertEq('chưa có lộ trình (ngân hàng chưa nạp) → không hiện', M(30, null), null);

var far = M(42, info(4));   // còn 42 ngày: 4 tuần học + 2 tuần nước rút, 6 bài chưa đạt → 2 bài/tuần
assertEq('xa ngày thi: học theo lộ trình, đúng bài kế tiếp', [far.phase, far.act, far.done], ['Học theo lộ trình', { type: 'lesson', mt: 'Bài 5. X' }, false]);
assertEq('xa ngày thi: nhịp bài/tuần chừa 14 ngày nước rút', /khoảng 2 bài\/tuần/.test(far.sub), true);
assertEq('làm 1 bài lộ trình hôm nay → xong (bài Tổng hợp không tính)', [M(42, info(4, lesson)).done, M(42, info(4, mix)).done], [true, false]);
assertEq('quá ít ngày cho số bài còn lại → cảnh báo tăng tốc', [M(42, info(4)).behind, M(18, info(0)).behind], [false, true]);
assertEq('đã đạt cả lộ trình → giữ phong độ bằng Tổng hợp', [M(42, info(10, [], null)).phase, M(42, info(10, [], null)).act.type], ['Giữ phong độ', 'mix']);

var sprint = M(14, info(4));
assertEq('≤ 14 ngày: nước rút bằng Tổng hợp chế độ Kiểm tra', [sprint.phase, sprint.act.type], ['Nước rút', 'mix']);
assertEq('nước rút: làm Tổng hợp hôm nay → xong; làm bài lẻ thì chưa', [M(10, info(4, mix)).done, M(10, info(4, lesson)).done], [true, false]);
assertEq('≤ 3 ngày: ôn sổ tay câu sai', [M(3, info(4)).phase, M(1, info(4)).act.type], ['Ôn cuối', 'book']);

if (failures) { console.log('\n' + failures + ' kiểm tra THẤT BẠI'); process.exit(1); }
console.log('\nTất cả kiểm tra đạt.');
