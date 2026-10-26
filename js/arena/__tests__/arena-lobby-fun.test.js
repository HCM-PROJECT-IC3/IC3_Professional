/* Test js/arena/arena-lobby-fun.js — bảng "tay nhanh nhất máy này" của trò Thử phản xạ ở sảnh chờ.
   Chạy: node js/arena/__tests__/arena-lobby-fun.test.js — hàm thuần, không gọi mạng. */
var path = require('path');

var failures = 0;
function assertEq(label, actual, expected) {
  var pass = JSON.stringify(actual) === JSON.stringify(expected);
  console.log((pass ? 'PASS' : 'FAIL') + '  ' + label + '  =>  ' + JSON.stringify(actual) + (pass ? '' : '  (expected ' + JSON.stringify(expected) + ')'));
  if (!pass) failures++;
}

require(path.join(__dirname, '..', 'arena-core.js'));
require(path.join(__dirname, '..', 'arena-words.js'));
require(path.join(__dirname, '..', 'arena-lobby-fun.js'));
var LF = globalThis.EduArenaLobbyFun;
var names = function (l) { return l.map(function (r) { return r.name + ':' + r.ms; }); };

var top = LF.reflexRank([], 'An', 300, 1);
top = LF.reflexRank(top, 'Bình', 250, 2);
assertEq('xếp nhanh → chậm', names(top), ['Bình:250', 'An:300']);
top = LF.reflexRank(top, 'an', 280, 3);
assertEq('cùng tên (khác hoa/thường) → 1 dòng, giữ kỷ lục tốt hơn', names(top), ['Bình:250', 'an:280']);
top = LF.reflexRank(top, 'Bình', 400, 4);
assertEq('lần chậm hơn không đè kỷ lục cũ', names(top), ['Bình:250', 'an:280']);
['C', 'D', 'E', 'F'].forEach(function (n, i) { top = LF.reflexRank(top, n, 200 + i, 10 + i); });
assertEq('tối đa 5 dòng', top.length, 5);
assertEq('người chậm nhất bị đẩy ra', names(top).indexOf('an:280'), -1);
assertEq('6 biểu tượng cố định (máy giáo viên chỉ nhận số thứ tự)', LF.REACTS.length, 6);
assertEq('giới hạn thả cảm xúc ≥ 1 giây', LF.REACT_GAP_MS >= 1000, true);

assertEq('Nối từ: lượt đầu 7 giây, ngắn dần, tối thiểu 2,8 giây', [LF.chainMs(0), LF.chainMs(1), LF.chainMs(100)], [7000, 6650, 2800]);

// ── Kho từ (js/arena/arena-words.js) — tách khỏi ngân hàng câu hỏi ──
var WD = globalThis.EduArenaWords;
var core = globalThis.EduArenaCore;
assertEq('mọi từ Nối từ đều 2 tiếng', WD.CHAIN.filter(function (w) { return w.split(' ').length !== 2; }), []);
assertEq('không trùng từ', WD.CHAIN.length, new Set(WD.CHAIN).size);
var bad = 0, traps = 0, rng = core.rngFrom(7);
for (var k = 0; k < 300; k++) {
  var w = WD.chainStart(rng);
  var t = WD.chainTurn(w, new Set([w]), rng, 4);
  var valid = t.options.filter(function (o) { return WD.first(o) === WD.last(w); });
  if (!t.next || t.options.length !== 4 || new Set(t.options).size !== 4 || valid.length !== 1 || valid[0] !== t.next) bad++;
  var bare = function (s) { return s.normalize('NFD').replace(/[̀-ͯ]/g, ''); };
  if (t.options.some(function (o) { return o !== t.next && bare(WD.first(o)) === bare(WD.last(w)); })) traps++;
}
assertEq('Nối từ: luôn 4 lựa chọn khác nhau, đúng 1 từ nối được', bad, 0);
assertEq('Nối từ: thường có bẫy cùng chữ khác dấu', traps > 30, true);
var used = new Set(['máy tính', 'tính toán', 'tính năng', 'tính cách', 'tính từ']);
assertEq('hết từ nối được → next = null (giao diện đổi từ mới)', WD.chainTurn('máy tính', used, rng).next, null);
assertEq('Ghép chữ: thuật ngữ chỉ có chữ in hoa A–Z', WD.TERMS.filter(function (x) { return !/^[A-Z]{3,9}$/.test(x[0]); }), []);
var same = 0;
WD.TERMS.forEach(function (x) { if (WD.scramble(x[0], rng).join('') === x[0]) same++; });
assertEq('Ghép chữ: chữ xáo không trùng thứ tự gốc', same, 0);
assertEq('Ghép chữ: xáo giữ đủ chữ cái', WD.scramble('KEYBOARD', rng).slice().sort().join(''), 'KEYBOARD'.split('').sort().join(''));

// ── Chặn "làm bài trước": sảnh chờ không được đụng ngân hàng câu hỏi / Sổ tay câu sai ──
var src = require('fs').readFileSync(path.join(__dirname, '..', 'arena-lobby-fun.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
assertEq('arena-lobby-fun.js không dùng câu hỏi bài học', ['EduWrongbook', 'deckSource', 'questions', 'data/ic3', 'buildDeck'].filter(function (k) { return src.indexOf(k) >= 0; }), []);
var room = require('fs').readFileSync(path.join(__dirname, '..', 'arena-room.js'), 'utf8');
var mountCall = room.slice(room.indexOf('LF.mount('), room.indexOf('LF.mount(') + 400);
assertEq('arena-room.js không truyền bộ câu vào sảnh chờ', /questions|deckSource/.test(mountCall), false);

console.log(failures ? '\n' + failures + ' FAIL' : '\nTất cả PASS');
process.exit(failures ? 1 : 0);
