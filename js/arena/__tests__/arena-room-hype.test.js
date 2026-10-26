/* Test js/arena/arena-room-hype.js — không khí gameshow của Phòng cả lớp (vinh danh, lời bình, câu trend, danh hiệu).
   Chạy: node js/arena/__tests__/arena-room-hype.test.js — hàm thuần, không gọi mạng. */
var path = require('path');

var failures = 0;
function assertEq(label, actual, expected) {
  var pass = JSON.stringify(actual) === JSON.stringify(expected);
  console.log((pass ? 'PASS' : 'FAIL') + '  ' + label + '  =>  ' + JSON.stringify(actual) + (pass ? '' : '  (expected ' + JSON.stringify(expected) + ')'));
  if (!pass) failures++;
}
function has(label, text, part) { assertEq(label + ' (chứa "' + part + '")', String(text).indexOf(part) >= 0, true); }

require(path.join(__dirname, '..', 'arena-core.js'));
require(path.join(__dirname, '..', 'arena-room-core.js'));
require(path.join(__dirname, '..', 'arena-hype.js'));
require(path.join(__dirname, '..', 'arena-room-hype.js'));
var C = globalThis.EduArenaCore, R = globalThis.EduArenaRoomCore, HY = globalThis.EduArenaHype, RH = globalThis.EduArenaRoomHype;

function deckOf(n) { var d = []; for (var i = 0; i < n; i++) d.push({ text: 'Q' + i, options: ['a', 'b', 'c', 'd'], correctIdx: 0, img: '', uid: 'u' + i, expl: '' }); return d; }
function makeRoom(mode, n, names) {
  var room = R.createRoom({ code: 'HYP234', mode: mode, deck: deckOf(n), count: n, secs: 20, maxPlayers: 30, now: 0 });
  names.forEach(function (nm, k) { R.join(room, { cid: 'c' + k, name: nm, face: '🙂' }); });
  return room;
}
/** 1 câu: answers = { cid: [đáp án, ms] } */
function play(room, answers) {
  R.openNext(room, 1000);
  Object.keys(answers).forEach(function (cid) { R.submit(room, cid, room.i, answers[cid][0], 1000 + answers[cid][1]); });
  var prev = RH.snap(room);
  R.reveal(room);
  return RH.revealStory(room, prev);
}

// ── Tốc độ: Tia chớp, Chuỗi nóng, mood theo tỉ lệ đúng ──
(function () {
  var room = makeRoom('speed', 10, ['An', 'Bình', 'Chi']);
  var st = play(room, { c0: [0, 3000], c1: [0, 1200], c2: [0, 8000] });
  has('Tia chớp = đúng nhanh nhất', JSON.stringify(st.shouts), 'Bình · 1,2 giây');
  assertEq('cả lớp đúng hết → câu khen cả lớp', HY.TREND.classGreat.indexOf(st.mood) >= 0, true);
  play(room, { c0: [0, 1000], c1: [1, 1000], c2: [0, 2000] });
  st = play(room, { c0: [0, 1000], c1: [1, 1000], c2: [1, 2000] });
  has('đúng liền 3 câu → Chuỗi nóng', JSON.stringify(st.shouts), 'An · 3 câu liền');
  assertEq('đa số sai → câu khó, nhắc xem giải thích', HY.TREND.classHard.indexOf(st.mood) >= 0, true);
  var empty = (function () { R.openNext(room, 1000); var p = RH.snap(room); R.reveal(room); return RH.revealStory(room, p); })();
  has('không ai trả lời', empty.mood, 'Chưa ai kịp trả lời');
  assertEq('không ai trả lời → không có Tia chớp', JSON.stringify(empty.shouts).indexOf('Tia chớp'), -1);
})();

// ── Sinh tồn: còn 2 người → đấu tay đôi; báo số bị loại ──
(function () {
  var room = makeRoom('survival', 10, ['An', 'Bình', 'Chi']);
  room.players.c2.hp = 1; room.players.c1.hp = 3; room.players.c0.hp = 3;
  var st = play(room, { c0: [0, 1000], c1: [0, 2000], c2: [1, 3000] });
  assertEq('Sinh tồn: Chi hết tim → còn 2 → duel', st.climax, 'duel');
  has('Sinh tồn: vinh danh số bị loại', JSON.stringify(st.shouts), 'còn 2 chiến binh');
})();

// ── Kéo co: dây lệch ≥ 70% → cao trào ──
(function () {
  var room = makeRoom('tug', 10, ['An', 'Bình']);
  room.rope = 75;
  var st = play(room, { c0: [1, 1000], c1: [1, 1000] }); // cả 2 sai → dây đứng yên ở 75/100
  assertEq('Kéo co: dây gần vạch → tug', st.climax, 'tug');
})();

// ── Đua: còn ≤ 2 bước → nước rút ──
(function () {
  var room = makeRoom('race', 5, ['An', 'Bình']);
  room.players.c0.pos = 2;
  var st = play(room, { c0: [0, 1000], c1: [1, 1000] });
  assertEq('Đua: An còn 2 bước → race', st.climax, 'race');
  has('Đua: nêu tên người sắp về đích', st.mc, 'An');
})();

// ── Mở câu: BẮT ĐẦU / CÂU CUỐI / cao trào ──
(function () {
  var room = makeRoom('speed', 4, ['An', 'Bình']);
  R.openNext(room, 0);
  assertEq('câu 1 → BẮT ĐẦU!', RH.openBanner(room, '').title, 'BẮT ĐẦU!');
  room.i = 2;
  assertEq('giữa trận + có cao trào chờ → chữ cao trào', RH.openBanner(room, 'final3').title, '3 CÂU CUỐI!');
  room.i = 3;
  assertEq('câu cuối → CÂU CUỐI!', RH.openBanner(room, '').title, 'CÂU CUỐI!');
  room.i = 1;
  assertEq('câu thường → không có chữ lớn', RH.openBanner(room, ''), null);
})();

// ── Danh hiệu cuối trận ──
(function () {
  var room = makeRoom('speed', 6, ['An', 'Bình', 'Chi']);
  for (var k = 0; k < 4; k++) play(room, { c0: [0, 5000], c1: [0, 900], c2: [k < 3 ? 1 : 0, 1000] });
  var aw = RH.endAwards(room);
  var by = {}; aw.forEach(function (a) { by[a.label] = a.name; });
  assertEq('Chính xác nhất = đúng nhiều nhất (người vào trước khi bằng)', by['Chính xác nhất'], 'An');
  assertEq('Tia chớp = nhanh nhất trung bình', by['Tia chớp'], 'Bình');
  assertEq('Chuỗi dài nhất có trong danh hiệu', !!by['Chuỗi dài nhất'], true);
  assertEq('Chi chỉ đúng 1/4 → không đủ điều kiện Tia chớp', aw.some(function (a) { return a.label === 'Tia chớp' && a.name === 'Chi'; }), false);
})();

// ── Máy học sinh: mục tiêu + câu trend ──
(function () {
  var top = [{ name: 'An', face: '🐱', value: 3000 }, { name: 'Bình', face: '🦊', value: 2500 }, { name: 'Chi', face: '🐻', value: 2000 }];
  has('hạng 2: còn N để dẫn đầu', RH.studentRival({ mode: 'speed', top: top }, { rank: 2, value: 2500 }), 'Còn 500 điểm nữa là vượt 🐱 An để dẫn đầu');
  has('hạng 1: dẫn trước người thứ 2', RH.studentRival({ mode: 'speed', top: top }, { rank: 1, value: 3000 }), 'hơn 🦊 Bình 500 điểm');
  has('ngoài Top: còn N để vào Top', RH.studentRival({ mode: 'speed', top: top }, { rank: 7, value: 1200 }), 'vào Top 3');
  has('Kéo co Đội Xanh, dây +20 → đội em kém', RH.studentRival({ mode: 'tug', rope: 20, top: [] }, { rank: 1, team: 'blue' }), 'kém 20 vạch');
  has('Kéo co: đội bạn chạm vạch → hẹn phục thù, không giục kéo', RH.studentRival({ mode: 'tug', rope: -100, top: [] }, { rank: 2, team: 'red' }), 'phục thù');
  assertEq('sai → câu động viên', HY.TREND.wrong.indexOf(RH.studentCheer({ i: 1 }, { ok: false, k: 2, rank: 3 }).text) >= 0, true);
  assertEq('hết giờ → nhắc canh giờ', HY.TREND.timeout.indexOf(RH.studentCheer({ i: 1 }, { ok: false, k: null, rank: 3 }).text) >= 0, true);
  assertEq('chuỗi 5 → câu cháy', RH.studentCheer({ i: 4 }, { ok: true, streak: 5, rank: 2 }).tone, 'fire');
  assertEq('đúng nhanh → câu tốc độ', HY.TREND.fast.indexOf(RH.studentCheer({ i: 2 }, { ok: true, streak: 1, rank: 4 }, true).text) >= 0, true);
  var ec = RH.endCheer('speed', { rank: 1, correct: 10, total: 10, bestStreak: 10 });
  assertEq('vô địch, không sai câu nào → 3 huy hiệu trở lên', ec.badges.length >= 3, true);
  assertEq('Sinh tồn bị loại → không gọi là vô địch', HY.TREND.endWin.indexOf(RH.endCheer('survival', { rank: 1, correct: 2, total: 10, hp: 0 }).text), -1);
})();

// ── Câu trend: lành mạnh (không có từ thô tục / chê bai trong danh sách cấm) ──
(function () {
  var badWords = ['ngu', 'dốt', 'óc', 'vãi', 'vl', 'đm', 'cc', 'chết', 'trôn', 'gà', 'đần', 'cút'];
  var badPhrases = ['báo thủ', 'hết cứu', 'non quá'];
  var all = [];
  Object.keys(HY.TREND).forEach(function (k) { all = all.concat(HY.TREND[k]); });
  var hits = all.filter(function (t) {
    var low = t.toLowerCase();
    var words = low.split(/[^a-zà-ỹđ]+/i);
    return words.some(function (w) { return badWords.indexOf(w) >= 0; }) || badPhrases.some(function (ph) { return low.indexOf(ph) >= 0; });
  });
  assertEq('kho câu trend không chứa từ cấm', hits, []);
  assertEq('câu cho trường hợp sai/hết giờ luôn có', HY.TREND.wrong.length >= 3 && HY.TREND.timeout.length >= 2, true);
})();

console.log(failures ? '\n' + failures + ' FAIL' : '\nTất cả PASS');
process.exit(failures ? 1 : 0);
