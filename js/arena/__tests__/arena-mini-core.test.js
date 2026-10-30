/* Test js/arena/arena-mini-core.js — điểm Đấu trường của 7 mini-game, leo hạng, bóng ma, xu.
   Chạy: node js/arena/__tests__/arena-mini-core.test.js — hàm thuần, không gọi mạng. */
var path = require('path');

var failures = 0;
function assertEq(label, actual, expected) {
  var pass = JSON.stringify(actual) === JSON.stringify(expected);
  console.log((pass ? 'PASS' : 'FAIL') + '  ' + label + '  =>  ' + JSON.stringify(actual) + (pass ? '' : '  (expected ' + JSON.stringify(expected) + ')'));
  if (!pass) failures++;
}

require(path.join(__dirname, '..', 'arena-mini-core.js'));
var M = globalThis.EduArenaMiniCore;
var DAY = '2026-10-30';

// ── Danh mục: 7 trò, mỗi trò 5 đối thủ, mốc tăng dần, trang có thật ──
(function () {
  var fs = require('fs');
  var root = path.join(__dirname, '..', '..', '..');
  assertEq('5 trò học tập (bỏ 2 trò Giải trí)', M.GAMES.map(function (g) { return g.id; }), ['memory-game', 'computer-simulator', 'cyber-detective', 'pz-defense', 'battle-quiz']);
  assertEq('Chặng kế của Thám tử = Phòng thủ', M.nextStage('cyber-detective').id, 'pz-defense');
  assertEq('Đấu Boss là trận cuối', [M.nextStage('battle-quiz'), M.stageOf('battle-quiz')], [null, 5]);
  M.GAMES.forEach(function (g) {
    var up = g.ladder.every(function (v, i) { return i === 0 || v > g.ladder[i - 1]; });
    assertEq(g.id + ': 5 mốc tăng dần + 5 đối thủ', [g.ladder.length, up, g.rivals.length], [5, true, 5]);
    var html = fs.readFileSync(path.join(root, g.page), 'utf8');
    assertEq(g.id + ': trang nạp cầu nối Đấu trường', html.indexOf('js/minigame-arena-bridge.js') >= 0, true);
  });
})();

// ── Điểm Đấu trường từng trò ──
(function () {
  assertEq('Trí nhớ 3 sao, 60 giây', M.points('memory-game', { score: 3, durationSec: 60, arena: { stars: 3, pairs: 8, matched: 8 } }), 600 + 300 + 80);
  assertEq('Trí nhớ 1 sao, chậm (>5 phút) không âm', M.points('memory-game', { score: 1, durationSec: 400, arena: { stars: 1, pairs: 8, matched: 8 } }), 700);
  assertEq('Đấu Boss thắng: điểm + 100 + máu còn', M.points('battle-quiz', { arena: { score: 150, win: true, hp: 64 } }), 314);
  assertEq('Đấu Boss thua: chỉ điểm', M.points('battle-quiz', { arena: { score: 90, win: false, hp: 0 } }), 90);
  assertEq('Phòng thủ: 6/13 đợt', M.points('pz-defense', { arena: { win: false, waves: 6, total: 13 } }), Math.round(6 / 13 * 900));
  assertEq('Phòng thủ thắng, Server còn nửa máu', M.points('pz-defense', { arena: { win: true, waves: 13, total: 13, hp: 100, hpMax: 200 } }), 900 + 100 + 100);
  assertEq('Thám tử đúng 92%, 50 giây', M.points('cyber-detective', { score: 92, durationSec: 50 }), 920 + 150);
  assertEq('Thám tử sai: 0 (bấm nhanh không được thưởng)', M.points('cyber-detective', { score: 0, durationSec: 5 }), 0);
  assertEq('Máy tính ảo 70%, 300 giây: hết thưởng tốc độ', M.points('computer-simulator', { score: 70, durationSec: 300 }), 700);
  assertEq('Thiếu số liệu không ném lỗi', M.points('battle-quiz', null), 0);
  assertEq('Điểm trực tiếp Trí nhớ: nửa số cặp = 300', M.livePoints('memory-game', 0.5), 300);
  assertEq('Điểm trực tiếp Phòng thủ: hết đợt = 900', M.livePoints('pz-defense', 1), 900);
})();

// ── Đối thủ + leo hạng ──
(function () {
  var r = M.rivalFor('pz-defense', {});
  assertEq('Người mới: đối thủ Đồng, mốc đầu', [r.tier, r.tierInfo.name, r.target, r.champ], [0, 'Đồng', 210, false]);

  var s = M.settle({}, 'pz-defense', 230, DAY);
  assertEq('Vượt mốc → thắng, lên hạng', [s.win, s.tierUp, s.prog.g['pz-defense'].tier], [true, true, 1]);
  assertEq('Ván đầu không tính "kỷ lục mới"', s.newBest, false);
  assertEq('Đối thủ kế: Bạc 420', [M.rivalFor('pz-defense', s.prog).tierInfo.name, M.rivalFor('pz-defense', s.prog).target], ['Bạc', 420]);

  var lose = M.settle(s.prog, 'pz-defense', 390, DAY);
  assertEq('Thua sát nút (≥90% mốc): near + thiếu 30', [lose.win, lose.near, lose.gap, lose.prog.g['pz-defense'].tier], [false, true, 30, 1]);
  assertEq('Thua có điểm: 2 xu khích lệ + 5 xu kỷ lục mới', lose.parts.map(function (p) { return p.xu; }), [2, 5]);

  var far = M.settle(lose.prog, 'pz-defense', 100, DAY);
  assertEq('Thua xa: không near', far.near, false);
  assertEq('0 điểm: không xu', M.settle({}, 'pz-defense', 0, DAY).xu, 0);

  // Hạ đủ 5 → Ngai vàng: đối thủ là kỷ lục của chính mình
  var P = { g: { 'battle-quiz': { tier: 5, best: 520, plays: 9, wins: 5 } } };
  var champ = M.rivalFor('battle-quiz', P);
  assertEq('Huyền thoại: bóng ma kỷ lục, mốc = kỷ lục', [champ.champ, champ.target], [true, 520]);
  assertEq('Bằng kỷ lục chưa đủ để thắng', M.settle(P, 'battle-quiz', 520, DAY).win, false);
  var beat = M.settle(P, 'battle-quiz', 530, DAY);
  var x2 = M.featured(DAY) === 'battle-quiz' ? 2 : 1;
  assertEq('Vượt kỷ lục: thắng 15 xu (×2 nếu Trò của ngày), hạng giữ 5', [beat.win, beat.xu, beat.prog.g['battle-quiz'].tier], [true, 15 * x2, 5]);
  var low = { g: { 'battle-quiz': { tier: 5, best: 100, plays: 9 } } };
  assertEq('Kỷ lục thấp hơn mốc Huyền thoại → lấy mốc Huyền thoại', M.rivalFor('battle-quiz', low).target, 400);
})();

// ── Xu: chuỗi thắng, Trò của ngày ×2, trần mỗi ngày ──
(function () {
  var feat = M.featured(DAY);
  var other = M.GAMES.filter(function (g) { return g.id !== feat; })[0].id;
  assertEq('Trò của ngày cố định theo ngày', M.featured(DAY), feat);
  var tgt = M.byId(other).ladder[0];
  var s = M.settle({ streak: 2 }, other, tgt, DAY);
  assertEq('Thắng thứ 3 liên tiếp: 8 + chuỗi 4', [s.prog.streak, s.xu], [3, 12]);
  var f = M.settle({}, feat, M.byId(feat).ladder[0], DAY);
  assertEq('Trò của ngày: 8 ×2', f.xu, 16);
  var capped = M.settle({ day: { date: DAY, xu: M.DAILY_CAP - 3 } }, other, tgt, DAY);
  assertEq('Chạm trần ngày: chỉ còn 3 xu', [capped.xu, capped.capped, capped.prog.day.xu], [3, true, M.DAILY_CAP]);
  var nextDay = M.settle({ day: { date: DAY, xu: M.DAILY_CAP } }, other, tgt, '2026-10-31');
  assertEq('Sang ngày mới: trần đặt lại', nextDay.xu > 0, true);
  assertEq('Thua → mất chuỗi', M.settle({ streak: 4 }, other, 1, DAY).prog.streak, 0);
  assertEq('Không sửa tiến độ đầu vào', (function () { var p = { streak: 1, g: {} }; M.settle(p, other, tgt, DAY); return p; })(), { streak: 1, g: {} });
})();

// ── Bóng ma + lời bình ──
(function () {
  assertEq('Bóng ma lúc 0 giây', M.ghostAt(500, 100, 0), 0);
  assertEq('Bóng ma hết giờ = mốc', M.ghostAt(500, 100, 150), 500);
  assertEq('Bóng ma đi nhanh đầu, chậm cuối (nửa giờ > nửa mốc)', M.ghostAt(500, 100, 50) > 250, true);
  assertEq('Đang dẫn', M.raceLine(300, 200, 500, false).tone, 'up');
  assertEq('Bị dẫn', M.raceLine(100, 200, 500, false).tone, 'down');
  assertEq('Nước rút', M.raceLine(400, 500, 500, true).text, 'Nước rút! Còn thiếu 100 điểm');
  assertEq('Đã qua mốc', M.raceLine(520, 500, 500, true).tone, 'up');
  // \b của JS chỉ hiểu chữ ASCII ("gọn gàng" sẽ dính "gà") → tự tách theo dấu cách/dấu câu
  var BAD = /(^|[\s,.!?—])(gà|báo thủ|hết cứu|khum|trôn|ngu|dốt)(?=$|[\s,.!?—])/i;
  var lines = [];
  for (var seed = 0; seed < 12; seed++) {
    [{ win: true, rival: { champ: true } }, { win: true, rival: { champ: false, tier: 4 } }, { win: true, rival: { champ: false, tier: 1 } },
      { win: false, near: true, pts: 9 }, { win: false, pts: 5 }, { win: false, pts: 0 }].forEach(function (r) { lines.push(M.verdictLine(r, seed)); });
  }
  assertEq('Lời bình không có từ chê/thô', lines.filter(function (l) { return BAD.test(l) || !l; }), []);
})();

console.log(failures ? '\n' + failures + ' FAIL' : '\nTất cả PASS');
process.exit(failures ? 1 : 0);
