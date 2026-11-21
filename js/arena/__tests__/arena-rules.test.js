/* Test js/arena/arena-rules.js — thẻ Luật chơi + màn mở trận của Đấu trường.
   Chạy: node js/arena/__tests__/arena-rules.test.js — dữ liệu thuần, không mạng. */
var path = require('path');
var fs = require('fs');

var failures = 0;
function assertEq(label, actual, expected) {
  var pass = JSON.stringify(actual) === JSON.stringify(expected);
  console.log((pass ? 'PASS' : 'FAIL') + '  ' + label + '  =>  ' + JSON.stringify(actual) + (pass ? '' : '  (expected ' + JSON.stringify(expected) + ')'));
  if (!pass) failures++;
}

var ROOT = path.join(__dirname, '..', '..', '..');
require(path.join(__dirname, '..', 'arena-core.js'));
require(path.join(__dirname, '..', 'arena-rules.js'));
var C = globalThis.EduArenaCore, R = globalThis.EduArenaRules;
var html = fs.readFileSync(path.join(ROOT, 'arena.html'), 'utf8');
var modes = []; html.replace(/data-mode="([a-z]+)"/g, function (_, m) { if (modes.indexOf(m) < 0) modes.push(m); });

assertEq('arena.html có 13 chế độ', modes.length, 13);
assertEq('mọi chế độ trên trang đều có Luật chơi', modes.filter(function (m) { return !R.RULES[m]; }), []);
assertEq('không thừa luật cho chế độ không có', Object.keys(R.RULES).filter(function (m) { return modes.indexOf(m) < 0; }), []);
assertEq('mỗi chế độ: 2–3 nhãn hợp lệ, không trùng', Object.keys(R.RULES).filter(function (m) {
  var t = R.RULES[m].tags; return t.length < 2 || t.length > 3 || t.some(function (x) { return !R.TAGS[x]; }) || new Set(t).size !== t.length;
}), []);
assertEq('mỗi chế độ: đúng 3 bước, đủ icon/tiêu đề/câu', Object.keys(R.RULES).filter(function (m) {
  var s = R.RULES[m].steps; return s.length !== 3 || s.some(function (x) { return x.length !== 3 || !x[1] || !x[2]; });
}), []);
assertEq('mỗi chế độ có điều kiện thắng + cao trào', Object.keys(R.RULES).filter(function (m) { return !R.RULES[m].win || !R.RULES[m].twist; }), []);

// Chữ hiện cho học sinh: không nhắc tên sản phẩm khác, không hô hào chấm than (giọng "mẫu AI")
var all = JSON.stringify(R.RULES) + JSON.stringify(R.TAGS);
assertEq('không nhắc tên sản phẩm khác', (all.match(/kahoot|blooket|wayarena|wayground|quizizz|gimkit|battle royale/gi) || []), []);
assertEq('không có dấu chấm than', all.indexOf('!') < 0, true);

// Icon: tên đầy đủ 'fa-…' (build-fa-subset.py dò được) và có trong bộ Font Awesome rút gọn
var faCss = fs.readFileSync(path.join(ROOT, 'lib', 'fontawesome', 'css', 'fa.min.css'), 'utf8');
var icons = ['fa-bolt-lightning'];
Object.keys(R.TAGS).forEach(function (k) { icons.push(R.TAGS[k].fa); });
Object.keys(R.RULES).forEach(function (m) { R.RULES[m].steps.forEach(function (s) { icons.push(s[0]); }); });
assertEq('mọi icon có trong bộ Font Awesome rút gọn', icons.filter(function (i) { return !/^fa-[a-z0-9-]+$/.test(i) || faCss.indexOf('.' + i + ':') < 0; }), []);

// Số liệu lấy từ arena-core → đổi luật là thẻ tự đúng
assertEq('Sinh tồn: số tim = LIVES', R.RULES.survival.steps[0][1], C.LIVES + ' tim');
assertEq('Lên Mặt Trăng: đích = MOON_KM', R.RULES.moon.win.indexOf(String(C.MOON_KM)) >= 0, true);
assertEq('Kéo co: số vạch = TUG_GOAL', R.RULES.tug.win.indexOf(String(C.TUG_GOAL)) >= 0, true);
assertEq('Đào hoá thạch: phạt = DINO_FINE', R.RULES.dino.steps[1][2].indexOf(Math.round(C.DINO_FINE * 100) + '%') >= 0, true);

var h = R.card('speed', 'Tốc độ <b>');
assertEq('card: thoát HTML tên chế độ', h.indexOf('Tốc độ &lt;b&gt;') >= 0, true);
assertEq('card: 3 bước + nhãn + cao trào', [(h.match(/<li>/g) || []).length, (h.match(/ar-rules-tag"/g) || []).length, h.indexOf('Gay cấn nhất') >= 0], [3, 2, true]);
assertEq('card: chế độ lạ → rỗng', R.card('khong-co', 'x'), '');

console.log(failures ? '\n' + failures + ' FAIL' : '\nTất cả PASS');
process.exit(failures ? 1 : 0);
