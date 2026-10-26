/* Test js/arena/arena-hype.js — mục tiêu trước mắt, lời bình viên, cao trào theo từng trò.
   Chạy: node js/arena/__tests__/arena-hype.test.js — hàm thuần, không gọi mạng. */
var path = require('path');

var failures = 0;
function assertEq(label, actual, expected) {
  var pass = JSON.stringify(actual) === JSON.stringify(expected);
  console.log((pass ? 'PASS' : 'FAIL') + '  ' + label + '  =>  ' + JSON.stringify(actual) + (pass ? '' : '  (expected ' + JSON.stringify(expected) + ')'));
  if (!pass) failures++;
}
function has(label, text, part) { assertEq(label + ' (chứa "' + part + '")', String(text).indexOf(part) >= 0, true); }

require(path.join(__dirname, '..', 'arena-core.js'));
require(path.join(__dirname, '..', 'arena-hype.js'));
var C = globalThis.EduArenaCore;
var H = globalThis.EduArenaHype;

function pl(id, name, extra) { return Object.assign({ id: id, name: name, face: '🙂', bot: id !== 'me', me: id === 'me', score: 0, pos: 0, hp: 3, km: 0 }, extra); }
function byScore(list, key) { return list.slice().sort(function (a, b) { return (b[key] || 0) - (a[key] || 0); }); }

// ── Tốc độ: mục tiêu là người ngay trên em ──
(function () {
  var me = pl('me', 'Em', { score: 1200 }), a = pl('b0', 'Mèo Wifi', { score: 1637 }), b = pl('b1', 'Cú Bit', { score: 700 });
  var G = { mode: 'speed', me: me, players: [me, a, b], i: 2, maxRounds: 10, log: [{}] };
  var order = byScore(G.players, 'score');
  has('Tốc độ hạng 2: còn N điểm để dẫn đầu', H.rivalLine(G, order), 'Còn 437 điểm nữa là vượt 🙂 Mèo Wifi để dẫn đầu');
  me.score = 2000;
  has('Tốc độ hạng 1: dẫn trước người thứ 2', H.rivalLine(G, byScore(G.players, 'score')), 'hơn 🙂 Mèo Wifi 363 điểm');
})();

// ── Chưa trả lời câu nào → chưa hiện mục tiêu ──
(function () {
  var me = pl('me', 'Em'), a = pl('b0', 'Mèo Wifi');
  assertEq('Câu 1 chưa trả lời: không có dòng mục tiêu', H.rivalLine({ mode: 'speed', me: me, players: [me, a], i: 0, maxRounds: 10, log: [] }, [me, a]), '');
})();

// ── Đấu phép: xếp theo máu → nói "nhiều hơn em N máu" ──
(function () {
  var me = pl('me', 'Em', { hp: 60 }), a = pl('b0', 'Cáo Pixel', { hp: 75 });
  has('Đấu phép: bạn trên nhiều máu hơn', H.rivalLine({ mode: 'spell', me: me, players: [me, a], i: 3, maxRounds: 10, log: [{}] }, [a, me]), 'nhiều hơn em 15 máu');
})();

// ── Đua về đích: nước rút + sát nút ──
(function () {
  var me = pl('me', 'Em', { pos: 9 }), a = pl('b0', 'Mèo Wifi', { pos: 9 }), b = pl('b1', 'Cú Bit', { pos: 3 });
  var G = { mode: 'race', me: me, players: [me, a, b], i: 9, goal: 10, maxRounds: 30, log: [{}] };
  var order = byScore(G.players, 'pos');
  var c = H.commentary(G, H.before(G, order), order);
  assertEq('Đua: có người còn 1 bước → cao trào race', c.climax, 'race');
  has('Đua: em và bạn cùng sắp về đích', c.text, 'Sát nút');
  has('Đua: mục tiêu ghi số bước về đích', H.rivalLine(G, order), 'còn 1 bước về đích');
})();

// ── Kéo co: dây lệch ≥ 70% ──
(function () {
  var me = pl('me', 'Em', { team: 'red' });
  var G = { mode: 'tug', me: me, players: [me], i: 3, maxRounds: 10, rope: -75 };
  var c = H.commentary(G, H.before(G, [me]), [me]);
  assertEq('Kéo co: dây −75 → cao trào tug', c.climax, 'tug');
  has('Kéo co: báo Đội Xanh sắp thắng', c.text, 'còn 25 vạch');
  G.rope = 10;
  assertEq('Kéo co: dây +10 → chưa cao trào', H.commentary(G, H.before(G, [me]), [me]).climax, '');
})();

// ── Sinh tồn: còn 2 người → đấu tay đôi ──
(function () {
  var me = pl('me', 'Em', { hp: 2 }), a = pl('b0', 'Mèo Wifi', { hp: 1 }), b = pl('b1', 'Cú Bit', { hp: 0 });
  var G = { mode: 'survival', me: me, players: [me, a, b], i: 4, maxRounds: 15 };
  var order = G.players.slice().sort(C.survivalOrder);
  var c = H.commentary(G, H.before(G, order), order);
  assertEq('Sinh tồn: còn 2 người → duel', c.climax, 'duel');
  has('Sinh tồn: nêu tên đối thủ còn lại', c.text, 'Mèo Wifi');
})();

// ── Diệt Virus: còn ≤ 25% máu ──
(function () {
  var me = pl('me', 'Em', { hp: 3 });
  var G = { mode: 'boss', me: me, players: [me], i: 5, maxRounds: 15, boss: { hp: 20, max: 100 } };
  var c = H.commentary(G, H.before(G, [me]), [me]);
  assertEq('Diệt Virus: 20% máu → cao trào boss', c.climax, 'boss');
  has('Diệt Virus: mục tiêu ghi % máu', H.rivalLine(G, [me]), '20% máu');
})();

// ── 3 câu cuối · bạn máy vượt em thì trêu ──
(function () {
  var me = pl('me', 'Em', { score: 900 }), a = pl('b0', 'Mèo Wifi', { score: 500 });
  var G = { mode: 'speed', me: me, players: [me, a], i: 6, maxRounds: 10 };
  var b4 = H.before(G, byScore(G.players, 'score'));
  a.score = 1500;
  var order = byScore(G.players, 'score');
  var c = H.commentary(G, b4, order);
  assertEq('Còn 3 câu sau câu này → final3', c.climax, 'final3');
  assertEq('Bạn máy vừa vượt em → trêu', c.taunt && c.taunt.id, 'b0');
  G.i = 2;
  assertEq('Giữa trận → không có final3', H.commentary(G, b4, order).climax, '');
})();

// ── Mọi chữ cao trào đều có tiêu đề ──
(function () {
  var ok = ['race', 'moon', 'tug', 'duel', 'boss', 'final3'].every(function (k) { return H.CLIMAX[k] && H.CLIMAX[k].title; });
  assertEq('CLIMAX đủ 6 loại', ok, true);
})();

console.log(failures ? '\n' + failures + ' FAIL' : '\nTất cả PASS');
process.exit(failures ? 1 : 0);
