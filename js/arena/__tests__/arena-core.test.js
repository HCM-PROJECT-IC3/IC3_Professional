/* Test js/arena/arena-core.js — logic Đấu trường (đổi câu, điểm Kahoot, rương, đua, linh vật).
   Chạy: node js/arena/__tests__/arena-core.test.js — hàm thuần, không gọi mạng. */
var path = require('path');
var fs = require('fs');

var failures = 0;
function assertEq(label, actual, expected) {
  var pass = JSON.stringify(actual) === JSON.stringify(expected);
  console.log((pass ? 'PASS' : 'FAIL') + '  ' + label + '  =>  ' + JSON.stringify(actual) + (pass ? '' : '  (expected ' + JSON.stringify(expected) + ')'));
  if (!pass) failures++;
}

require(path.join(__dirname, '..', 'arena-core.js'));
var A = globalThis.EduArenaCore;
var rng = A.rngFrom(42);

// ── Đổi câu ──
var single = { uid: 'u1', type: 'single', question: '<b>RAM</b> là gì?', options: ['Bộ nhớ tạm', 'Ổ cứng', 'Chuột'], correct: ['Bộ nhớ tạm'], explanation: 'RAM &amp; ROM', image_file: 'a/b.png' };
assertEq('single → 1 câu, bỏ thẻ HTML, giữ ảnh/giải thích', A.convert(single), [{ text: 'RAM là gì?', options: ['Bộ nhớ tạm', 'Ổ cứng', 'Chuột'], answer: 'Bộ nhớ tạm', img: 'img/a/b.png', uid: 'u1', expl: 'RAM & ROM' }]);
assertEq('multi 1 đáp án đúng → dùng được', A.convert({ type: 'multi', question: 'Q', options: ['a', 'b'], correct: ['b'] }).length, 1);
assertEq('multi 2 đáp án đúng → bỏ', A.convert({ type: 'multi', question: 'Q', options: ['a', 'b', 'c'], correct: ['a', 'b'] }), []);
assertEq('đáp án đúng không có trong lựa chọn → bỏ', A.convert({ type: 'single', question: 'Q', options: ['a', 'b'], correct: ['z'] }), []);
assertEq('quá 6 lựa chọn → bỏ', A.convert({ type: 'single', question: 'Q', options: '1234567'.split(''), correct: ['1'] }), []);
var tf = A.convert({ type: 'truefalse', question: 'Chọn Đúng/Sai', statements: [{ text: 'A', answer: 'true' }, { text: 'B', answer: 'false' }, { text: '', answer: 'true' }] });
assertEq('Đúng/Sai: mỗi mệnh đề 1 câu, bỏ mệnh đề rỗng', tf.map(function (c) { return [c.text, c.answer, c.keepOrder]; }), [['Chọn Đúng/Sai — A', 'Đúng', true], ['Chọn Đúng/Sai — B', 'Sai', true]]);
assertEq('dạng khác (hotspot, matching) → bỏ', A.convert({ type: 'hotspot' }).concat(A.convert({ type: 'matching' })), []);
assertEq('ảnh lạ (javascript:) bị bỏ', A.convert({ type: 'single', question: 'Q', options: ['a', 'b'], correct: ['a'], imageUrl: 'javascript:alert(1)' })[0].img, '');

var deck = A.buildDeck([single, single, { type: 'truefalse', question: 'X', statements: [{ text: 'A', answer: 'true' }] }], A.rngFrom(1));
assertEq('bộ câu: bỏ câu trùng', deck.length, 2);
assertEq('bộ câu: correctIdx trỏ đúng đáp án sau khi trộn', deck.every(function (c) { return c.correctIdx >= 0 && (c.options[c.correctIdx] === 'Bộ nhớ tạm' || c.options[c.correctIdx] === 'Đúng'); }), true);
assertEq('bộ câu: Đúng/Sai giữ thứ tự', deck.filter(function (c) { return c.options.length === 2; })[0].options, ['Đúng', 'Sai']);
assertEq('bộ câu: giới hạn số câu', A.buildDeck([single, { type: 'single', question: 'Q2', options: ['a', 'b'], correct: ['a'] }], A.rngFrom(1), 1).length, 1);

// ── Điểm Kahoot ──
assertEq('trả lời ngay → 1000', A.speedPoints(true, 0, 20000), 1000);
assertEq('hết giờ vẫn đúng → 500', A.speedPoints(true, 20000, 20000), 500);
assertEq('nửa thời gian → 750', A.speedPoints(true, 10000, 20000), 750);
assertEq('sai → 0', A.speedPoints(false, 1000, 20000), 0);
assertEq('chuỗi đúng 1/2/4/9', [1, 2, 4, 9].map(A.streakBonus), [0, 100, 300, 500]);

// ── Bot ──
var bots = A.makeBots(4, A.rngFrom(7), 'hard');
assertEq('4 bot khác tên, độ chính xác mức khó', [new Set(bots.map(function (b) { return b.name; })).size, bots.every(function (b) { return b.accuracy >= 0.75 && b.accuracy <= 0.92; })], [4, true]);
var ans = A.botAnswer(bots[0], 20000, A.rngFrom(3));
assertEq('bot trả lời trong giới hạn giờ', ans.ms > 0 && ans.ms <= 20000, true);

// ── Rương ──
var r = A.rngFrom(99), allOk = true;
for (var i = 0; i < 300; i++) { var cs = A.rollChests(r); if (cs.length !== 3 || !cs.some(function (c) { return c.kind === 'gain' || c.kind === 'mult'; })) allOk = false; }
assertEq('luôn 3 rương, ít nhất 1 rương được vàng', allOk, true);
var me = { gold: 100 }, b1 = { gold: 300, name: 'B1' }, b2 = { gold: 50, name: 'B2' };
assertEq('+50', A.applyChest({ kind: 'gain', amount: 50 }, me, [me, b1, b2]).delta, 50);
assertEq('x2', [A.applyChest({ kind: 'mult', factor: 2 }, me, [me, b1, b2]).delta, me.gold], [150, 300]);
assertEq('x3 khi 0 vàng → 30', A.applyChest({ kind: 'mult', factor: 3 }, { gold: 0 }, []).delta, 30);
assertEq('mất 50%', A.applyChest({ kind: 'lose', pct: 50 }, me, [me, b1, b2]).delta, -150);
me.gold = 100; b1.gold = 300;
var st = A.applyChest({ kind: 'steal', pct: 25 }, me, [me, b1, b2]);
assertEq('lấy 25% của người giàu nhất', [st.delta, st.target.name, b1.gold], [75, 'B1', 225]);
var sw = A.applyChest({ kind: 'swap' }, me, [me, b1, b2]);
assertEq('đổi với người giàu hơn', [me.gold, b1.gold, sw.target.name], [225, 175, 'B1']);
assertEq('đang giàu nhất → không đổi', A.applyChest({ kind: 'swap' }, me, [me, b1, b2]).target, null);
assertEq('nhãn rương', A.chestLabel({ kind: 'steal', pct: 10 }).title, 'Lấy 10% của 1 bạn');

// ── Đua ──
var racer = { pos: 0, streak: 0 };
var steps = [true, true, true, false, true].map(function (c) { return A.raceStep(racer, c, 10); });
assertEq('đúng +1, chuỗi 3 → +2, sai đứng yên', [steps, racer.pos], [[1, 1, 2, 0, 1], 5]);
racer.pos = 9; racer.streak = 2;
assertEq('không vượt đích', [A.raceStep(racer, true, 10), racer.pos], [1, 10]);

// ── Xếp hạng ──
assertEq('hoà điểm → người chơi thật đứng trước bot', A.rank([{ id: 'b', bot: true, score: 5 }, { id: 'me', score: 5 }, { id: 'c', bot: true, score: 9 }], 'score').map(function (p) { return p.id; }), ['c', 'me', 'b']);

// ── Xu + linh vật ──
assertEq('xu: 0 câu đúng → 0', A.coinsFor({ correct: 0, place: 1, players: 5 }), 0);
assertEq('xu: 10 đúng, hạng 1 → 35', A.coinsFor({ correct: 10, place: 1, players: 5 }), 35);
assertEq('xu: tối đa 60', A.coinsFor({ correct: 100, place: 1, players: 5 }), 60);
var ids = []; A.PACKS.forEach(function (p) { p.blooks.forEach(function (b) { ids.push(b.id); }); });
assertEq('mã linh vật không trùng', new Set(ids).size, ids.length);
assertEq('mỗi hộp đủ 5 độ hiếm', A.PACKS.every(function (p) { return Object.keys(A.RARITY).every(function (k) { return p.blooks.some(function (b) { return b.rarity === k; }); }); }), true);
var counts = {}, rr = A.rngFrom(5);
for (var k = 0; k < 20000; k++) { var bl = A.openPack('pets', rr); counts[bl.rarity] = (counts[bl.rarity] || 0) + 1; }
assertEq('tỉ lệ hiếm ~ đúng trọng số (Thường ~60%, Bí ẩn < 1%)', [Math.round(counts.common / 200), counts.mystery < 200], [60, true]);
var prof = A.newProfile(); assertEq('hồ sơ mới 0 xu', prof.coins, 0); prof.coins = 30;
var b = A.buyPack(prof, 'pets', A.rngFrom(11));
assertEq('mua hộp: trừ 25 xu, có linh vật, đặt làm ảnh đại diện', [b.ok, prof.coins, !!prof.owned[b.blook.id], prof.avatar === b.blook.id], [true, 5, true, true]);
assertEq('không đủ xu → từ chối', A.buyPack(prof, 'pets', A.rngFrom(11)).reason, 'coins');
prof.coins = 25;
var d = A.buyPack(prof, 'pets', A.rngFrom(11));
assertEq('trùng → hoàn xu theo độ hiếm', [d.dupe, prof.coins], [true, A.RARITY[d.blook.rarity].refund]);
assertEq('tra linh vật theo mã', A.blookById('security:dragon').emoji, '🐉');
assertEq('bóng ma kỷ lục', [A.ghostScoreAt({ trail: [500, 1400] }, 0), A.ghostScoreAt({ trail: [500, 1400] }, 5), A.ghostScoreAt(null, 0)], [500, 1400, null]);

// ── Toàn bộ ngân hàng: bao nhiêu câu chơi được ──
var bank = 0, playable = 0;
['IC3__LV1.json', 'Spark__LV2.json', 'MOS__Word.json'].forEach(function (f) {
  var d2 = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', '..', 'data', 'ic3', f), 'utf8'));
  Object.values(d2.minitests).forEach(function (qs) { qs.forEach(function (q) { bank++; playable += A.convert(q).length ? 1 : 0; }); });
});
console.log('      (ngân hàng mẫu: ' + playable + '/' + bank + ' câu chơi được trong Đấu trường)');
assertEq('đa số câu ngân hàng chơi được (> 60%)', playable / bank > 0.6, true);

console.log(failures ? '\n' + failures + ' FAIL' : '\nTất cả PASS');
process.exit(failures ? 1 : 0);
