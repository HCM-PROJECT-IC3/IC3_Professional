/* Test js/name-picker/name-picker-core.js — Gọi tên học sinh (tách tên khi dán, bốc không lặp, kịch bản hiệu ứng).
   Chạy: node js/name-picker/__tests__/name-picker-core.test.js — hàm thuần, không gọi mạng. */
var path = require('path');

var failures = 0;
function assertEq(label, actual, expected) {
  var pass = JSON.stringify(actual) === JSON.stringify(expected);
  console.log((pass ? 'PASS' : 'FAIL') + '  ' + label + '  =>  ' + JSON.stringify(actual) + (pass ? '' : '  (expected ' + JSON.stringify(expected) + ')'));
  if (!pass) failures++;
}

require(path.join(__dirname, '..', 'name-picker-core.js'));
var N = globalThis.EduNamePicker;
function rngFrom(seed) { var s = seed >>> 0; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

// ── Tách tên khi dán ──
assertEq('mỗi dòng 1 tên, bỏ dòng trống + khoảng trắng thừa', N.parseNames('  Nguyễn Văn An \n\n  Trần  Thị Bình\r\n'), ['Nguyễn Văn An', 'Trần Thị Bình']);
assertEq('bỏ số thứ tự / gạch đầu dòng', N.parseNames('1. Lê Chi\n2) Phạm Dũng\n- Võ Em\n10 Đỗ Giang'), ['Lê Chi', 'Phạm Dũng', 'Võ Em', 'Đỗ Giang']);
assertEq('dán từ Excel (STT ⇥ Họ tên ⇥ Lớp) → lấy cột họ tên', N.parseNames('1\tNguyễn Hoàng Long\t8A1\n2\tMai Lan\t8A1'), ['Nguyễn Hoàng Long', 'Mai Lan']);
assertEq('1 dòng có dấu phẩy → tách', N.parseNames('An, Bình; Chi'), ['An', 'Bình', 'Chi']);
assertEq('bỏ tên trùng (không phân biệt hoa thường)', N.parseNames('Lan\nlan\nLAN \nHoa'), ['Lan', 'Hoa']);
assertEq('chặn ký tự HTML', N.parseNames('<b>Minh</b>'), ['b Minh /b']);
assertEq('danh sách số thứ tự', N.numberList(5), ['1', '2', '3', '4', '5']);

// ── Bốc không lặp ──
var all = ['A', 'B', 'C'];
assertEq('chưa gọi ai → còn đủ', N.remaining(all, []).list, all);
assertEq('bỏ người đã gọi', N.remaining(all, ['b', 'A']).list, ['C']);
assertEq('hết người → vòng mới', N.remaining(all, ['A', 'B', 'C']), { list: all, fresh: true });
var r = rngFrom(7), called = [];
for (var k = 0; k < 3; k++) { var left = N.remaining(all, called).list; called.push(N.pick(left, r)); }
assertEq('3 lần gọi trong 3 người: không ai bị gọi 2 lần', called.slice().sort(), ['A', 'B', 'C']);
assertEq('người suýt bị gọi khác người được gọi', N.decoy(all, 'B', rngFrom(1)) !== 'B', true);
assertEq('chỉ 1 người → không có người suýt bị gọi', N.decoy(['A'], 'A', rngFrom(1)), null);
var big = N.numberList(40);
var f = N.finalists(big, '17', 6, rngFrom(3), '5');
assertEq('vòng cuối: đủ 6 người, có người được gọi + người suýt bị gọi, không trùng', [f.length, f.includes('17'), f.includes('5'), new Set(f).size], [6, true, true, 6]);
assertEq('vòng cuối khi lớp ít người', N.finalists(['A', 'B'], 'A', 6, rngFrom(3)).length, 2);

// ── Đường đua ──
var names = ['A', 'B', 'C', 'D', 'E', 'F'];
var ok = true, leadOk = 0;
for (var s = 1; s <= 30; s++) {
  var sc = N.raceScript(names, 'C', rngFrom(s), 'E');
  var endW = N.raceAt(sc.C, 1);
  names.forEach(function (n) { if (n !== 'C' && N.raceAt(sc[n], 1) >= endW) ok = false; });
  // tiến độ không bao giờ lùi
  names.forEach(function (n) { for (var i = 1; i < sc[n].length; i++) if (sc[n][i] < sc[n][i - 1]) ok = false; });
  if (N.raceAt(sc.E, 0.6) > N.raceAt(sc.C, 0.6)) leadOk++;
}
assertEq('đường đua: người được gọi luôn về đích đầu tiên, không ai chạy lùi (30 lần)', ok, true);
assertEq('đường đua lật kèo: người suýt bị gọi thường dẫn trước ở 60% thời gian', leadOk >= 24, true);
assertEq('đường đua: về đích đúng 1 ở cuối', N.raceAt(N.raceScript(names, 'A', rngFrom(2)).A, 1), 1);

// ── Bóng bay ──
var po = N.popOrder(names, 'B', rngFrom(4), 'D');
assertEq('bóng bay: nổ hết trừ người được gọi, người suýt bị gọi nổ cuối', [po.length, po.includes('B'), po[po.length - 1]], [5, false, 'D']);

// ── Vòng quay ──
var n = 12, okW = true;
for (var i = 0; i < n; i++) { if (N.wheelIndexAt(N.wheelAngle(i, n, 6, 0.9), n) !== i || N.wheelIndexAt(N.wheelAngle(i, n, 6, -0.9), n) !== i) okW = false; }
assertEq('vòng quay: dừng đúng ô đã chọn (kể cả lệch trong ô)', okW, true);

console.log(failures ? '\n' + failures + ' test FAIL' : '\nTất cả test PASS');
process.exit(failures ? 1 : 0);
