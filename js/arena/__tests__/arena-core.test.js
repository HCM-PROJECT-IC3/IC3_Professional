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
assertEq('multi 2 đáp án đúng → câu Chọn nhiều', A.convert({ type: 'multi', question: 'Q', options: ['a', 'b', 'c'], correct: ['a', 'b'] }).map(function (c) { return [c.kind, c.answers]; }), [['multi', ['a', 'b']]]);
assertEq('multi chọn tất cả / đáp án không có trong lựa chọn → bỏ', [A.convert({ type: 'multi', question: 'Q', options: ['a', 'b'], correct: ['a', 'b'] }).length, A.convert({ type: 'multi', question: 'Q', options: ['a', 'b', 'c'], correct: ['a', 'x'] }).length], [0, 0]);

// ── Dạng câu mới: chọn nhiều / sắp xếp / ghép đôi / list / selectfill ──
var kr = A.rngFrom(5);
var mq = A.buildDeck([{ type: 'multi', question: 'Chọn 2', options: ['a', 'b', 'c', 'd'], correct: ['b', 'd'] }], kr)[0];
assertEq('chọn nhiều: đáp án đúng trỏ đúng chữ', mq.correct.map(function (i) { return mq.options[i]; }).sort(), ['b', 'd']);
assertEq('chọn nhiều: chấm không phụ thuộc thứ tự bấm, thiếu/thừa là sai', [A.grade(mq, mq.correct.slice().reverse()), A.grade(mq, [mq.correct[0]]), A.grade(mq, [0, 1, 2, 3])], [true, false, false]);
var oq = A.buildDeck([{ type: 'ordering', question: 'Xếp', items: ['B1', 'B2', 'B3', 'B4'] }], kr)[0];
assertEq('sắp xếp: các bước bị xáo (không đúng sẵn)', oq.options.join() !== 'B1,B2,B3,B4', true);
assertEq('sắp xếp: thứ tự đúng ra B1..B4', oq.correct.map(function (i) { return oq.options[i]; }), ['B1', 'B2', 'B3', 'B4']);
assertEq('sắp xếp: chấm đúng/sai + đúng mấy bước', [A.grade(oq, oq.correct), A.grade(oq, oq.correct.slice().reverse()), A.partial(oq, [oq.correct[0], oq.correct[1], oq.correct[3], oq.correct[2]])], [true, false, { right: 2, of: 4 }]);
var gq = A.buildDeck([{ type: 'matching', question: 'Ghép', pairs: [{ left: 'CPU', right: 'xử lý' }, { left: 'RAM', right: 'nhớ tạm' }, { left: 'SSD', right: 'lưu trữ' }] }], kr)[0];
assertEq('ghép đôi: mỗi mục trái trỏ đúng vế phải', gq.left.map(function (l, i) { return l + '=' + gq.options[gq.correct[i]]; }).sort(), ['CPU=xử lý', 'RAM=nhớ tạm', 'SSD=lưu trữ']);
assertEq('ghép đôi: dòng đáp án', A.answerLines(gq).length, 3);
assertEq('khuôn câu trả lời sai dạng → không nhận', [A.isAnswer(gq, [0, 1]), A.isAnswer(oq, [0, 0, 1, 2]), A.isAnswer(mq, 2), A.isAnswer(mq, [9])], [false, false, false, false]);
assertEq('list: mỗi dòng 1 câu chọn 1', A.convert({ type: 'list', question: 'Chọn', items: [{ text: 'Dòng 1', options: ['Đúng', 'Sai'], correct: 'Sai' }, { text: 'Dòng 2', options: ['Đúng', 'Sai'], correct: 'Đúng' }] }).map(function (c) { return c.text + '=' + c.answer; }), ['Chọn — Dòng 1=Sai', 'Chọn — Dòng 2=Đúng']);
assertEq('selectfill: mỗi dòng 1 câu, bỏ dòng 2 chỗ trống', A.convert({ type: 'selectfill', question: 'Hỏi', segments: ['Câu A ', '\nCâu B ', ' và ', '\n'], blanks: ['CÓ', 'KHÔNG', 'CÓ'], wordBank: ['CÓ', 'KHÔNG'] }).map(function (c) { return c.text + '=' + c.answer; }), ['Hỏi — Câu A=CÓ']);
assertEq('lọc theo dạng câu', A.buildDeck([{ type: 'single', question: 'S', options: ['x', 'y'], correct: ['x'] }, { type: 'ordering', question: 'Xếp', items: ['1', '2', '3'] }], kr, 0, ['order']).map(A.kindOf), ['order']);
var pdk = A.practiceDeck([{ q: oq, ok: false }, { q: gq, ok: false }, { q: mq, ok: false }], A.rngFrom(8));
assertEq('luyện câu sai giữ được dạng sắp xếp/ghép/chọn nhiều và vẫn chấm đúng', pdk.map(function (q) { return A.kindOf(q) + ':' + A.grade(q, q.correct); }).sort(), ['match:true', 'multi:true', 'order:true']);
assertEq('50:50 không dùng cho câu không phải chọn 1', A.fiftyFifty(mq, kr), []);
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
// Bảo hiểm Sử thi: hộp thứ PITY_MAX liền không ra Sử thi+ → chắc chắn Sử thi+
var pp = A.newProfile(); pp.coins = 10000;
var low = function () { return 0.01; }; // luôn bốc Thường
for (var k = 0; k < A.PITY_MAX - 1; k++) A.buyPack(pp, 'hardware', low);
assertEq('bảo hiểm: đếm số hộp liền không ra Sử thi', pp.pity, A.PITY_MAX - 1);
var pr = A.buyPack(pp, 'hardware', low);
assertEq('bảo hiểm: hộp thứ 10 ra Sử thi trở lên, đếm lại từ 0', [pr.pity, ['epic', 'legendary', 'mystery'].indexOf(pr.blook.rarity) >= 0, pp.pity], [true, true, 0]);
assertEq('sao theo số con', [A.starsOf(1), A.starsOf(2), A.starsOf(3), A.starsOf(6)], [1, 1, 2, 3]);
// Hoàn thành hộp → thưởng 1 lần
var ps = A.newProfile(); ps.coins = 25;
var hw = A.PACKS[0].blooks;
hw.slice(0, 8).forEach(function (bk) { ps.owned[bk.id] = 1; });
var last = hw[8]; // Bí ẩn — ép bốc đúng con còn thiếu
var pick = function () { return 0.9999; };
var rs = A.buyPack(ps, 'hardware', pick);
assertEq('hoàn thành hộp: +60 xu một lần', [rs.blook.id === last.id, rs.set && rs.set.bonus, ps.coins, !!ps.sets.hardware], [true, A.SET_BONUS, A.SET_BONUS, true]);
ps.coins = 25;
assertEq('hoàn thành hộp: mở tiếp không thưởng lại', A.buyPack(ps, 'hardware', pick).set, null);
// Nhiệm vụ ngày → vé mở hộp miễn phí
var pd2 = A.newProfile();
assertEq('nhiệm vụ ngày: chưa đủ', [A.addDaily(pd2, 12, '2026-10-24'), A.dailyOf(pd2, '2026-10-24').correct, pd2.tickets || 0], [false, 12, 0]);
assertEq('nhiệm vụ ngày: đủ 20 → 1 vé, chỉ 1 lần/ngày', [A.addDaily(pd2, 10, '2026-10-24'), A.addDaily(pd2, 30, '2026-10-24'), pd2.tickets], [true, false, 1]);
assertEq('nhiệm vụ ngày: sang ngày mới đếm lại', A.dailyOf(pd2, '2026-10-25').correct, 0);
var tk = A.buyPack(pd2, 'pets', A.rngFrom(3), { ticket: true });
assertEq('vé: mở hộp không mất xu', [tk.ok, pd2.tickets, pd2.coins], [true, 0, 0]);
assertEq('vé: hết vé thì từ chối', A.buyPack(pd2, 'pets', A.rngFrom(3), { ticket: true }).reason, 'ticket');
assertEq('bóng ma kỷ lục', [A.ghostScoreAt({ trail: [500, 1400] }, 0), A.ghostScoreAt({ trail: [500, 1400] }, 5), A.ghostScoreAt(null, 0)], [500, 1400, null]);

// ── Luyện câu sai ──
var qa = { text: 'Q1', options: ['A', 'B', 'C', 'D'], correctIdx: 2, expl: 'vì C' };
var qtf = { text: 'Q2', options: ['Đúng', 'Sai'], correctIdx: 1 };
var pd = A.practiceDeck([{ q: qa, ok: false }, { q: { text: 'Q3', options: ['x', 'y'], correctIdx: 0 }, ok: true }, { q: qtf, ok: false }, { q: qa, ok: false }, null], A.rngFrom(3));
assertEq('luyện câu sai: chỉ câu sai, bỏ trùng', pd.map(function (q) { return q.text; }).sort(), ['Q1', 'Q2']);
assertEq('luyện câu sai: đáp án đúng vẫn đúng sau khi xáo', pd.every(function (q) { return q.options[q.correctIdx] === (q.text === 'Q1' ? 'C' : 'Sai'); }), true);
assertEq('luyện câu sai: Đúng/Sai giữ thứ tự, giữ giải thích', [pd.find(function (q) { return q.text === 'Q2'; }).options, pd.find(function (q) { return q.text === 'Q1'; }).expl], [['Đúng', 'Sai'], 'vì C']);
assertEq('luyện câu sai: không có câu sai → bộ rỗng', A.practiceDeck([{ q: qa, ok: true }], A.rngFrom(1)).length, 0);

// ── Sinh tồn ──
var sv = { streak: 0 };
assertEq('sinh tồn: bắt đầu 3 tim, sai mất 1', [A.survivalStep(sv, false, 0).lost, sv.hp], [true, 2]);
A.survivalStep(sv, true, 1); A.survivalStep(sv, true, 2); var heal = A.survivalStep(sv, true, 3);
assertEq('sinh tồn: đúng liền 3 câu hồi 1 tim', [heal.healed, sv.hp], [true, 3]);
assertEq('sinh tồn: không vượt quá 3 tim', [A.survivalStep(sv, true, 4).healed, A.survivalStep(sv, true, 5).healed, sv.hp], [false, false, 3]);
A.survivalStep(sv, false, 6); A.survivalStep(sv, false, 7); var dead = A.survivalStep(sv, false, 8);
assertEq('sinh tồn: hết tim → bị loại, ghi câu bị loại', [dead.out, sv.hp, sv.outAt], [true, 0, 8]);
assertEq('sinh tồn: đã loại thì không chấm nữa', [A.survivalStep(sv, true, 9).already, sv.hp], [true, 0]);
var order = [{ n: 'outEarly', hp: 0, outAt: 2, score: 9000 }, { n: 'alive1', hp: 1, score: 100 }, { n: 'outLate', hp: 0, outAt: 5, score: 10 }, { n: 'alive3', hp: 3, score: 50 }, { n: 'alive1b', hp: 1, score: 900 }];
assertEq('sinh tồn: xếp theo tim → trụ lâu → điểm', order.sort(A.survivalOrder).map(function (p) { return p.n; }), ['alive3', 'alive1b', 'alive1', 'outLate', 'outEarly']);
assertEq('sinh tồn: vẽ tim', [A.hearts(2), A.hearts(0)], ['❤️❤️🖤', '💀']);

// ── Câu cá ──
var fr = A.rngFrom(42), total = 0, sawFrenzy = false, okRange = true;
for (var c = 0; c < 2000; c++) {
  var r1 = A.castLine(fr, 0);
  total += r1.kg;
  if (r1.fish.frenzy) sawFrenzy = r1.frenzy === 3;
  if (r1.kg < r1.fish.min || r1.kg > r1.fish.max) okRange = false;
}
assertEq('câu cá: cân nặng nằm trong khoảng của từng loài', okRange, true);
assertEq('câu cá: có Mồi thần (3 lần nhân đôi)', sawFrenzy, true);
var dbl = A.castLine(A.rngFrom(7), 2);
assertEq('câu cá: đang nhân đôi → kg chẵn, trừ 1 lượt', [dbl.kg % 2, dbl.frenzy >= 1], [0, true]);

// ── Vật phẩm hỗ trợ ──
var held = [];
assertEq('vật phẩm: chưa đủ chuỗi → không nhận', A.earnPowerup(held, 2, A.rngFrom(1)), '');
assertEq('vật phẩm: chuỗi 3 → nhận 1 món hợp lệ', !!A.POWERUPS[A.earnPowerup(held, 3, A.rngFrom(1))], true);
A.earnPowerup(held, 6, A.rngFrom(2)); A.earnPowerup(held, 9, A.rngFrom(3));
assertEq('vật phẩm: giữ tối đa 3 món', [A.earnPowerup(held, 12, A.rngFrom(4)), held.length], ['', 3]);
var q4 = { options: ['a', 'b', 'c', 'd'], correctIdx: 1 };
var hid = A.fiftyFifty(q4, A.rngFrom(9));
assertEq('50:50: ẩn 2 đáp án sai, không ẩn đáp án đúng', [hid.length, hid.indexOf(1)], [2, -1]);
assertEq('50:50: câu 3 lựa chọn ẩn 1, Đúng/Sai không ẩn', [A.fiftyFifty({ options: ['a', 'b', 'c'], correctIdx: 0 }, A.rngFrom(1)).length, A.fiftyFifty({ options: ['Đúng', 'Sai'], correctIdx: 0 }, A.rngFrom(1)).length], [1, 0]);

// ── Toàn bộ ngân hàng: bao nhiêu câu chơi được ──
var bank = 0, playable = 0;
['IC3__LV1.json', 'Spark__LV2.json', 'MOS__Word.json'].forEach(function (f) {
  var d2 = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', '..', 'data', 'ic3', f), 'utf8'));
  Object.values(d2.minitests).forEach(function (qs) { qs.forEach(function (q) { bank++; playable += A.convert(q).length ? 1 : 0; }); });
});
console.log('      (ngân hàng mẫu: ' + playable + '/' + bank + ' câu chơi được trong Đấu trường)');
assertEq('đa số câu ngân hàng chơi được (> 60%)', playable / bank > 0.6, true);


// ── Kéo co / Đấu phép / Giải mã / Bảng điểm (kiểu Wayground) ──
assertEq('kéo co: lực kéo sai 0 · đúng chậm 1 · đúng nhanh 2', [A.tugPull(false, 1000, 20000), A.tugPull(true, 15000, 20000), A.tugPull(true, 5000, 20000)], [0, 1, 2]);
assertEq('kéo co: tính trung bình nên đội đông không lợi', A.tugStep(0, [2, 0, 0, 0], [1]), { rope: -15, delta: -15 });
assertEq('kéo co: dây không vượt vạch thắng', A.tugStep(90, [2, 2], [0]).rope, A.TUG_GOAL);
assertEq('kéo co: người mới vào đội ít người hơn', [A.tugTeamFor({ red: 2, blue: 1 }), A.tugTeamFor({ red: 1, blue: 1 })], ['blue', 'red']);
assertEq('kéo co: đội thắng theo phía dây', [A.tugWinner(5), A.tugWinner(-1), A.tugWinner(0)], ['red', 'blue', '']);

var sr = A.rngFrom(9);
var okRoll = true;
for (var t = 0; t < 200; t++) { var rs = A.rollSpells(sr); if (new Set(rs).size !== 3 || !rs.some(function (id) { return ['fire', 'bolt', 'drain'].indexOf(id) >= 0; })) okRoll = false; }
assertEq('đấu phép: 3 phép khác nhau, luôn có 1 phép tấn công', okRoll, true);
assertEq('đấu phép: trả lời càng nhanh phép càng mạnh', [A.spellBoost(0, 20000), A.spellBoost(20000, 20000)], [1.5, 1]);
var w1 = { id: 'a', hp: 100, dmg: 0 }, w2 = { id: 'b', hp: 20, dmg: 0, shield: true }, w3 = { id: 'c', hp: 100, dmg: 0 };
var fb = A.castSpell(w1, 'fire', w2, [w1, w2, w3], 1, 0);
assertEq('đấu phép: khiên chặn trọn 1 đòn rồi mất', [fb.hits[0].blocked, w2.hp, w2.shield], [true, 20, false]);
A.castSpell(w1, 'fire', w2, [w1, w2, w3], 1, 3);
assertEq('đấu phép: hết máu bị hạ, ghi câu bị hạ, cộng sát thương', [w2.hp, w2.outAt, w1.dmg], [0, 3, 20]);
w1.hp = 90;
var hl = A.castSpell(w1, 'heal', null, [w1, w2, w3], 1.5, 4);
assertEq('đấu phép: hồi máu không vượt tối đa', [hl.heal, w1.hp], [10, 100]);
var bo = A.castSpell(w3, 'bolt', null, [w1, w2, w3], 1, 5);
assertEq('đấu phép: sấm sét đánh mọi đối thủ còn trụ', [bo.hits.length, w1.hp], [1, 88]);
assertEq('đấu phép: còn trụ xếp trên người bị hạ', [w2, w1, w3].sort(A.spellOrder).map(function (p) { return p.id; }), ['c', 'a', 'b']);

var hr = A.rngFrom(3);
var crack = {};
var thief = { id: 'me', gems: 0 }, vic = { id: 'v', gems: 101, vault: [2, 0, 3] };
assertEq('giải mã: đoán sai ghi lại ký hiệu đã loại', [A.crackTry(crack, thief, vic, 1, hr).hit, A.crackOf(crack, 'me', 'v').wrong], [false, [1]]);
A.crackTry(crack, thief, vic, 2, hr); A.crackTry(crack, thief, vic, 0, hr);
assertEq('giải mã: đúng 2 ô → cảnh báo bị dòm 2/3', A.vaultThreat(crack, vic), 2);
var op = A.crackTry(crack, thief, vic, 3, hr);
assertEq('giải mã: mở đủ 3 ô lấy 50% đá quý, két đổi mã, tiến độ về 0', [op.opened, op.take, thief.gems, vic.gems, A.vaultThreat(crack, vic)], [true, 50, 50, 51, 0]);
A.crackTry(crack, thief, vic, vic.vault[0], hr);
A.rekey(crack, vic, hr);
assertEq('giải mã: đổi mã xoá tiến độ người khác', A.crackOf(crack, 'me', 'v').pos, 0);

// ── Đào hoá thạch ──
var dr = A.rngFrom(11);
var okRocks = true;
for (var t2 = 0; t2 < 200; t2++) { var rk = A.rollRocks(dr); if (rk.length !== 3 || !rk.some(function (v) { return v > 0; })) okRocks = false; }
assertEq('hoá thạch: 3 tảng đá, luôn có 1 tảng có hoá thạch', okRocks, true);
var d1 = { id: 'a', fossils: 0 }, d2 = { id: 'b', fossils: 0 };
assertEq('hoá thạch: đào thật / ăn gian ×3 + gắn cờ', [A.digRock(d1, 30, false), A.digRock(d2, 30, true), d1.cheat || 0, d2.cheat], [30, 90, 0, A.DINO_CHEAT_TURNS]);
assertEq('hoá thạch: kiểm tra người trung thực → không được gì', A.inspect(d2, d1), { caught: false, take: 0 });
var ins = A.inspect(d1, d2);
assertEq('hoá thạch: bắt được người ăn gian → lấy 40%, xoá cờ', [ins.caught, ins.take, d1.fossils, d2.fossils, d2.cheat], [true, 36, 66, 54, 0]);
A.digRock(d1, 10, true); A.tickCheat([d1, d2]); A.tickCheat([d1, d2]);
assertEq('hoá thạch: cờ ăn gian hết sau 2 lượt', [d1.cheat, A.inspect(d2, d1).caught], [0, false]);

// ── Lên Mặt Trăng ──
var m1 = { id: 'm', km: 0, streak: 0 };
var st1 = A.moonStep(m1, true, 0, 20000, 10, 0);
assertEq('mặt trăng: đúng tức thì bay 384/10', [st1.gain, m1.km], [38, 38]);
A.moonStep(m1, true, 20000, 20000, 10, 1);
assertEq('mặt trăng: đúng sát giờ bay một nửa', m1.km, 38 + 19);
var st3 = A.moonStep(m1, true, 0, 20000, 10, 2);
assertEq('mặt trăng: chuỗi 3 → tầng đẩy ×1.5, qua trạm 96', [st3.gain, st3.stage, A.moonBoost(5)], [58, 96, 2]);
var fl = A.moonStep(m1, false, 0, 20000, 10, 3);
assertEq('mặt trăng: sai tụt nhưng không dưới trạm đã qua', [fl.fell, m1.km, m1.streak], [19, 96, 0]);
var mp = { id: 'p', km: 0, streak: 0 }, nq = 0;
while (mp.km < A.MOON_KM && nq < 20) A.moonStep(mp, true, 0, 20000, 10, nq++);
assertEq('mặt trăng: đúng hết, thật nhanh → tới nơi ở câu 7/10', nq, 7);
var m2 = { id: 'n', km: 110, streak: 0 };
A.moonStep(m2, false, 0, 20000, 10, 0);
assertEq('mặt trăng: sai gần trạm thì dừng ở trạm', m2.km, 96);
var m3 = { id: 'o', km: 380, streak: 4 };
var ld = A.moonStep(m3, true, 0, 20000, 10, 7);
assertEq('mặt trăng: chạm Mặt Trăng → dừng ở 384, ghi câu đáp', [ld.landed, m3.km, m3.landedAt], [true, 384, 7]);
assertEq('mặt trăng: đáp trước xếp trên, rồi tới bay cao', [{ id: 'x', km: 300 }, { id: 'y', km: 384, landedAt: 9 }, { id: 'z', km: 384, landedAt: 4 }].sort(A.moonOrder).map(function (p) { return p.id; }), ['z', 'y', 'x']);

// ── Diệt Virus ──
assertEq('virus: máu = số câu × số người × hệ số, tối thiểu 40', [A.bossMaxHp(10, 4), A.bossMaxHp(1, 1)], [280, 40]);
assertEq('virus: giai đoạn theo % máu', [A.bossPhase(100, 100), A.bossPhase(60, 100), A.bossPhase(25, 100), A.bossPhase(0, 100)], [0, 1, 2, 2]);
var never = function () { return 0.99; }, always = function () { return 0; };
var b1 = { hp: 3, streak: 0, dmg: 0 };
var h1 = A.bossHit(b1, true, 0, 20000, 0, never, 0);
assertEq('virus: đúng tức thì → 16, chưa combo, không chí mạng', [h1.dmg, h1.crit, b1.dmg], [16, false, 16]);
b1.streak = 4;
var h2 = A.bossHit(b1, true, 20000, 20000, 0, always, 1);
assertEq('virus: chuỗi 5 ×1.4, chí mạng ×2', [h2.dmg, h2.crit, b1.streak], [28, true, 5]);
var h3 = A.bossHit(b1, false, 0, 20000, 0, never, 2);
assertEq('virus: sai → mất 1 tim, mất chuỗi, 0 sát thương', [h3.dmg, h3.life.lost, b1.hp, b1.streak], [0, true, 2, 0]);
var b0 = { hp: 0, streak: 0, dmg: 5 };
assertEq('virus: người đã gục không đánh được', [A.bossHit(b0, true, 0, 20000, 0, never, 3).dmg, b0.dmg], [0, 5]);
var boss = { hp: 100, max: 100, top: 0 };
var r1 = A.bossRound(boss, 45, 4, 4);
assertEq('virus: trừ máu, bước vào Nổi giận (1 lần)', [boss.hp, r1.newPhase, r1.heal], [55, 1, 0]);
var r2 = A.bossRound(boss, 5, 1, 4);
assertEq('virus: Nổi giận + đội đúng < nửa → hồi 6%', [boss.hp, r2.heal, r2.newPhase], [56, 6, 0]);
var r3 = A.bossRound(boss, 80, 4, 4);
assertEq('virus: không trừ quá 0, hạ gục', [boss.hp, r3.dealt, r3.ko], [0, 56, true]);
assertEq('virus: xếp hạng theo sát thương, hoà thì em trước', [{ id: 'b', dmg: 30, bot: true }, { id: 'me', dmg: 30 }, { id: 'c', dmg: 50, bot: true }].sort(A.bossOrder).map(function (p) { return p.id; }), ['c', 'me', 'b']);

// ── Số câu: không thiếu (báo rõ), không lặp, không trùng ──
assertEq('playCount: không vượt số câu bộ có', [A.playCount(20, 8), A.playCount(10, 35), A.playCount(0, 35), A.playCount(15, 0)], [8, 10, 35, 0]);
var dupQs = [
  { type: 'single', question: 'Thiết bị nhập là gì?', options: ['Bàn phím', 'Loa'], correct: ['Bàn phím'] },
  { type: 'single', question: '  thiết bị nhập là gì  ', options: ['Loa', 'Bàn phím', 'Màn hình'], correct: ['bàn phím'] },
  { type: 'single', question: 'Thiết bị nhập là gì?', options: ['Bàn phím', 'Chuột'], correct: ['Chuột'] },
  { type: 'single', question: 'Thiết bị nhập là gì?', options: ['Bán phím', 'Loa'], correct: ['Bán phím'] },
];
assertEq('trùng: cùng đề + cùng đáp án (khác hoa/thường, khoảng trắng, dấu câu, phương án nhiễu) → 1 câu; khác đáp án hoặc khác dấu tiếng Việt → giữ',
  A.buildDeck(dupQs, A.rngFrom(3)).length, 3);
var base10 = Array.from({ length: 10 }, function (_, i) { return { text: 'q' + i }; });
var ext = A.extendDeck(base10, 30, A.rngFrom(7));
var cnt = {}; ext.forEach(function (c) { cnt[c.text] = (cnt[c.text] || 0) + 1; });
assertEq('extendDeck: 30 lượt từ 10 câu → mỗi câu đúng 3 lần (dùng hết rồi mới lặp)', Object.keys(cnt).map(function (k) { return cnt[k]; }), [3, 3, 3, 3, 3, 3, 3, 3, 3, 3]);
assertEq('extendDeck: không bao giờ lặp liền nhau', ext.every(function (c, i) { return i === 0 || c.text !== ext[i - 1].text; }), true);
assertEq('extendDeck: đủ câu thì không lặp', A.extendDeck(base10, 6, A.rngFrom(1)).length, 6);
var smallBoard = A.makeBoard([{ text: 'a' }, { text: 'b' }, { text: 'c' }], 15, A.rngFrom(2));
assertEq('Bảng điểm: không nhiều ô hơn số câu (không 2 ô cùng 1 câu)', [smallBoard.length, new Set(smallBoard.map(function (t) { return t.q.text; })).size], [3, 3]);
assertEq('Bảng điểm "Tất cả" (0): tối đa 30 ô', A.makeBoard(Array.from({ length: 40 }, function (_, i) { return { text: 'x' + i }; }), 0, A.rngFrom(2)).length, 30);
var bd = A.makeBoard(Array.from({ length: 12 }, function (_, i) { return { text: 'q' + i }; }), 12, A.rngFrom(4));
assertEq('bảng điểm: đủ ô, mỗi ô 1 câu khác nhau, có ô x2 và ô rủi ro', [bd.length, new Set(bd.map(function (t) { return t.q.text; })).size, bd.some(function (t) { return t.special === 'x2'; }), bd.some(function (t) { return t.special === 'risk'; })], [12, 12, true, true]);
assertEq('bảng điểm: giá trị 100…500', bd.every(function (t) { return A.BOARD_VALUES.indexOf(t.value) >= 0; }), true);
assertEq('bảng điểm: ô thường / x2 / rủi ro', [
  A.boardScore({ value: 300, special: '' }, ['t0', 't1'], ['t0']),
  A.boardScore({ value: 300, special: 'x2' }, ['t0', 't1'], ['t1']),
  A.boardScore({ value: 300, special: 'risk' }, ['t0', 't1'], ['t0']),
], [{ t0: 300, t1: 0 }, { t0: 0, t1: 600 }, { t0: 300, t1: -150 }]);

// ── Thẻ bài ──
assertEq('bốc thẻ: chỉ ở mốc 3 câu và đúng ≥ 2/3', [
  A.cardCheckpoint([{ ok: true }, { ok: true }]),
  A.cardCheckpoint([{ ok: true }, { ok: false }, { ok: true }]),
  A.cardCheckpoint([{ ok: true }, { ok: false }, { ok: false }]),
  A.cardCheckpoint([{ ok: false }, { ok: false }, { ok: false }, { ok: true }, { ok: true }, { ok: false }]),
  A.cardCheckpoint([]),
], [false, true, false, true, false]);
(function () {
  var r = A.rngFrom(7), okDistinct = true, okCtx = true, seen = {};
  for (var k = 0; k < 400; k++) {
    var full = k % 3 === 0, x2 = k % 2 === 0, time = k % 5 !== 0;
    var d = A.drawCards(r, { full: full, x2: x2, time: time });
    if (d.length !== 3 || new Set(d).size !== 3) okDistinct = false;
    d.forEach(function (id) {
      seen[id] = (seen[id] || 0) + 1;
      if (!A.CARDS[id]) okCtx = false;
      if (full && (id === 'fifty' || id === 'time' || id === 'x2')) okCtx = false;
      if (!x2 && id === 'x2') okCtx = false;
      if (!time && id === 'time') okCtx = false;
    });
  }
  assertEq('bốc thẻ: luôn 3 lá khác nhau', okDistinct, true);
  assertEq('bốc thẻ: không ra lá vô dụng (đầy vật phẩm / không có giờ / chế độ không nhân điểm)', okCtx, true);
  assertEq('bốc thẻ: Kho báu hiếm hơn Túi xu', seen.jackpot < seen.coins, true);
})();

console.log(failures ? '\n' + failures + ' FAIL' : '\nTất cả PASS');
process.exit(failures ? 1 : 0);

