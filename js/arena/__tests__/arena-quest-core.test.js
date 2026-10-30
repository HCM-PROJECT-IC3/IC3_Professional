/* Test: js/arena/arena-quest-core.js — bản đồ Hành trình IC3 (sao, rương, danh hiệu, nhiệm vụ ngày).
   Chạy: node js/arena/__tests__/arena-quest-core.test.js */
var path = require('path');
require(path.join(__dirname, '..', 'arena-quest-core.js'));
var Q = globalThis.EduArenaQuestCore;

var failures = 0;
function eq(label, actual, expected) {
  var pass = JSON.stringify(actual) === JSON.stringify(expected);
  console.log((pass ? 'PASS' : 'FAIL') + '  ' + label + '  =>  ' + JSON.stringify(actual) + (pass ? '' : '  (expected ' + JSON.stringify(expected) + ')'));
  if (!pass) failures++;
}

eq('7 vùng chủ đề + Trùm cuối', Q.REGIONS.map(function (r) { return r.mt; }), ['1.', '2.', '3.', '4.', '5.', '6.', '7.', Q.ALL]);
eq('mỗi vùng 1 chế độ quiz khác nhau', new Set(Q.REGIONS.map(function (r) { return r.mode; })).size, Q.REGIONS.length);
eq('13 chặng (8 quiz + 5 mini-game), tối đa 39 sao', [Q.NODES.length, Q.MAX_STARS], [13, 39]);

eq('sao quiz theo tỉ lệ đúng', [
  Q.quizStars({ correct: 4, total: 10, win: true }),
  Q.quizStars({ correct: 5, total: 10 }),
  Q.quizStars({ correct: 8, total: 10 }),
  Q.quizStars({ correct: 10, total: 10, win: false }),
  Q.quizStars({ correct: 9, total: 10, win: true }),
  Q.quizStars({ correct: 0, total: 0, win: true }),
], [0, 1, 2, 2, 3, 0]);
var lad = [100, 200, 300, 400, 500];
eq('sao mini-game theo mốc Đồng / Vàng / Huyền thoại', [Q.miniStars(lad, 99), Q.miniStars(lad, 100), Q.miniStars(lad, 300), Q.miniStars(lad, 499), Q.miniStars(lad, 500), Q.miniStars(null, 999)], [0, 1, 2, 2, 3, 0]);

var KEY = 'Spark|LV1', DAY = '2026-10-30';
var qp = {};
var r = Q.settle(qp, KEY, 'r2-quiz', 2, DAY, { correct: 8 });
eq('chặng đầu: +2 sao, chưa đủ vùng', [r.before, r.stars, r.gained], [0, 2, 2]);
eq('vùng 2 chỉ có 1 chặng → mở rương vùng ngay', r.chest, 'normal');
r = Q.settle(qp, KEY, 'r2-quiz', 1, DAY, { correct: 5 });
eq('chơi lại kém hơn: giữ sao cao nhất, không nhận rương lần 2', [Q.starsOf(qp, KEY, 'r2-quiz'), r.gained, r.chest], [2, 0, null]);
r = Q.settle(qp, KEY, 'r2-quiz', 3, DAY, { correct: 10 });
eq('3 sao cả vùng → rương vàng', [r.gained, r.chest, r.parts.some(function (p) { return p.xu === Q.GOLD_CHEST_XU; })], [1, 'gold', true]);

r = Q.settle(qp, KEY, 'r1-memory-game', 1, DAY);
eq('sao mini-game dùng chung mọi bản đồ', [Q.starsOf(qp, 'IC3|LV2', 'r1-memory-game'), Q.starsOf(qp, 'IC3|LV2', 'r2-quiz')], [1, 0]);
eq('vùng 1 còn thiếu chặng → chưa có rương', r.chest, null);
eq('chặng gợi ý: chặng đầu chưa có sao', Q.nextNode(qp, KEY).id, 'r1-quiz');

// Nhiệm vụ ngày: 3 nhiệm vụ khác nhau, cố định theo ngày, mỗi cái nhận 1 lần
var qs = Q.questsOf(DAY);
eq('3 nhiệm vụ khác nhau', new Set(qs.map(function (x) { return x.id; })).size, 3);
eq('cùng ngày cùng nhiệm vụ', Q.questsOf(DAY).map(function (x) { return x.id; }), qs.map(function (x) { return x.id; }));
var all = {};
var got = [];
for (var i = 0; i < 6; i++) {
  var x = Q.settle(all, KEY, i % 2 ? 'r1-memory-game' : 'r' + (i + 1) + '-quiz', 3, DAY, { correct: 10 });
  got = got.concat(x.quests.map(function (q) { return q.id; }));
}
eq('chơi đủ: hoàn thành cả 3 nhiệm vụ, mỗi cái 1 lần', got.slice().sort(), qs.map(function (x) { return x.id; }).sort());
eq('sang ngày mới: bộ đếm làm lại', Q.dayOf(all, '2026-10-31').nodes, 0);

// Danh hiệu theo tổng sao
var t = {};
var up = null;
['r1-quiz', 'r2-quiz'].forEach(function (id) { var y = Q.settle(t, KEY, id, 3, DAY, {}); if (y.titleUp) up = y.titleUp.name; });
eq('6 sao → lên danh hiệu Nhà thám hiểm', [Q.totalStars(t, KEY), up], [6, 'Nhà thám hiểm']);
eq('danh hiệu kế tiếp', Q.nextTitle(6).name, 'Hiệp sĩ mạng');
eq('chặng không tồn tại: bỏ qua', Q.settle({}, KEY, 'r9-quiz', 3, DAY).gained, 0);

console.log(failures ? '\n' + failures + ' FAIL' : '\nTất cả PASS');
process.exit(failures ? 1 : 0);
