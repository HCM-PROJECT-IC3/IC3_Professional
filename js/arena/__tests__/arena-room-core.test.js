/* Test js/arena/arena-room-core.js — Phòng cả lớp của Đấu trường (vào phòng, nhận câu trả lời,
   chấm điểm Kahoot/Đua, bảng xếp hạng, CSV, khôi phục khi người dẫn tải lại trang).
   Chạy: node js/arena/__tests__/arena-room-core.test.js — hàm thuần, không gọi mạng. */
var path = require('path');

var failures = 0;
function assertEq(label, actual, expected) {
  var pass = JSON.stringify(actual) === JSON.stringify(expected);
  console.log((pass ? 'PASS' : 'FAIL') + '  ' + label + '  =>  ' + JSON.stringify(actual) + (pass ? '' : '  (expected ' + JSON.stringify(expected) + ')'));
  if (!pass) failures++;
}

require(path.join(__dirname, '..', 'arena-core.js'));
require(path.join(__dirname, '..', 'arena-room-core.js'));
var R = globalThis.EduArenaRoomCore;

var deck = [
  { text: 'Q1', options: ['a', 'b', 'c', 'd'], correctIdx: 0, img: '', uid: 'u1', expl: 'vì a' },
  { text: '=Q2', options: ['x', 'y'], correctIdx: 1, img: '', uid: 'u2', expl: '' },
  { text: 'Q3', options: ['m', 'n', 'o'], correctIdx: 2, img: '', uid: 'u3', expl: '' },
];

// ── Mã phòng ──
var code = R.makeCode(globalThis.EduArenaCore.rngFrom(7));
assertEq('mã phòng 6 ký tự, không có 0/O/1/I/L', /^[2-9A-HJKMNP-Z]{6}$/.test(code), true);
assertEq('chuẩn hoá mã gõ tay', R.normCode(' ab-c 1o9xyz '), 'ABC9XY');
assertEq('peer id có tiền tố riêng', R.peerId('ABC234'), 'eduquiz-arena-v1-ABC234');
assertEq('biệt danh bỏ thẻ HTML / ký tự điều khiển', R.cleanName('  <b>Lan\u0007  Anh</b> '), 'bLan Anh/b');

// ── Vào phòng ──
var room = R.createRoom({ code: 'ABC234', mode: 'speed', deck: deck, count: 10, secs: 20, maxPlayers: 3, title: 'Bộ thử', now: 0 });
assertEq('Tốc độ: số câu ≤ số câu có', room.total, 3);
assertEq('vào phòng', R.join(room, { cid: 'c1', name: 'Lan', face: '🐱' }).ok, true);
assertEq('trùng tên → thêm (2)', R.join(room, { cid: 'c2', name: 'lan' }).player.name, 'lan (2)');
assertEq('tên rỗng → từ chối', R.join(room, { cid: 'c9', name: '  ' }).reason, 'name');
assertEq('vào lại bằng cid cũ → giữ người cũ', R.join(room, { cid: 'c1', name: 'Khác' }), { ok: true, player: room.players.c1, rejoin: true });
R.join(room, { cid: 'c3', name: 'Minh' });
assertEq('đủ người → từ chối', R.join(room, { cid: 'c4', name: 'Hoa' }).reason, 'full');
R.kick(room, 'c3');
assertEq('bị mời ra → không vào lại được', R.join(room, { cid: 'c3', name: 'Minh' }).reason, 'kicked');
assertEq('mời ra 1 người → có chỗ cho người mới', R.join(room, { cid: 'c4', name: 'Hoa' }).ok, true);

var lobby = R.createRoom({ code: 'LOB234', mode: 'speed', deck: deck, count: 3, secs: 20, maxPlayers: 2 });
R.join(lobby, { cid: 'p1', name: 'P1' }); R.join(lobby, { cid: 'p2', name: 'P2' });
R.leave(lobby, 'p1');
assertEq('rời phòng ở sảnh chờ → xoá hẳn', lobby.order, ['p2']);
assertEq('… và nhường chỗ cho người mới', R.join(lobby, { cid: 'p3', name: 'P3' }).ok, true);
R.openNext(lobby, 0);
R.leave(lobby, 'p2');
assertEq('rời phòng khi đang chơi → giữ điểm, chỉ offline', [lobby.order.length, lobby.players.p2.online], [2, false]);

// ── Câu 1 ──
var q = R.openNext(room, 1000);
assertEq('câu gửi học sinh KHÔNG có đáp án đúng', Object.keys(q).indexOf('correctIdx'), -1);
assertEq('câu gửi học sinh đủ nội dung', [q.i, q.text, q.options.length, q.ms], [0, 'Q1', 4, 20000]);
assertEq('không mở câu mới khi câu đang mở', R.openNext(room, 1500), null);
assertEq('trả lời đúng lúc 0s', R.submit(room, 'c1', 0, 0, 1000), { ok: true, allIn: false });
assertEq('gửi 2 lần → bỏ', R.submit(room, 'c1', 0, 1, 1200).reason, 'dupe');
assertEq('sai số câu → bỏ', R.submit(room, 'c2', 5, 0, 1200).reason, 'phase');
assertEq('lựa chọn ngoài phạm vi → bỏ', R.submit(room, 'c2', 0, 9, 1200).reason, 'choice');
assertEq('người bị mời ra không gửi được', R.submit(room, 'c3', 0, 0, 1200).reason, 'player');
assertEq('quá giờ + dung sai → bỏ', R.submit(room, 'c2', 0, 0, 1000 + 20000 + R.ANSWER_GRACE_MS + 1).reason, 'late');
assertEq('trong dung sai vẫn nhận, đủ người → chốt sớm', R.submit(room, 'c2', 0, 0, 1000 + 20500), { ok: true, allIn: false });
R.setOnline(room, 'c4', false);
assertEq('người rớt mạng không chặn chốt sớm', R.allAnswered(room), true);
var rv = R.reveal(room);
assertEq('chấm: đúng ngay 1000đ, đúng sát giờ 500đ, không trả lời 0', [room.players.c1.score, room.players.c2.score, room.players.c4.score], [1000, 500, 0]);
assertEq('thống kê lựa chọn', rv.counts, [2, 0, 0, 0]);
assertEq('kết quả riêng có hạng', [rv.results.c1.rank, rv.results.c2.rank, rv.results.c4.rank], [1, 2, 3]);
assertEq('không trả lời ghi -1', room.players.c4.log, [-1]);
assertEq('chốt lại lần nữa không chấm 2 lần', R.reveal(room) === rv && room.players.c1.score === 1000, true);
assertEq('không nhận câu trả lời sau khi chốt', R.submit(room, 'c4', 0, 0, 2000).reason, 'phase');

// ── Câu 2: chuỗi đúng ──
R.setOnline(room, 'c4', true);
R.openNext(room, 30000);
R.submit(room, 'c1', 1, 1, 30000);
R.submit(room, 'c2', 1, 0, 31000);
assertEq('còn người chưa trả lời → chưa chốt sớm', R.allAnswered(room), false);
rv = R.reveal(room);
assertEq('chuỗi 2 câu đúng: +1000 +100 thưởng', [rv.results.c1.pts, rv.results.c1.bonus, room.players.c1.score], [1000, 100, 2100]);
assertEq('sai → mất chuỗi', room.players.c2.streak, 0);
assertEq('chưa hết câu', R.isDone(room), false);

// ── Câu 3 rồi kết thúc ──
R.openNext(room, 60000);
R.submit(room, 'c4', 2, 2, 62000);
R.reveal(room);
assertEq('hết câu', R.isDone(room), true);
assertEq('hết câu → không mở tiếp', R.openNext(room, 90000), null);
var board = R.finish(room, 99000);
assertEq('bảng xếp hạng cuối', board.map(function (r) { return [r.name, r.value]; }), [['Lan', 2100], ['Hoa', 950], ['lan (2)', 500]]);
assertEq('kết quả riêng khi kết thúc', R.personalEnd(room, 'c4'), { rank: 2, players: 3, value: 950, correct: 1, total: 3, bestStreak: 1 });
assertEq('phòng đã kết thúc → người mới không vào được', R.join(room, { cid: 'c7', name: 'Mới' }).reason, 'ended');

// ── CSV + tóm tắt ──
var csv = R.toCsv(room);
var lines = csv.replace(/^﻿/, '').split('\r\n');
assertEq('CSV có BOM', csv.charCodeAt(0), 0xFEFF);
assertEq('CSV: tiêu đề', lines[0], 'Hạng,Biệt danh,Điểm,Số câu đúng,Số câu đã hỏi,Tỉ lệ đúng (%),Chuỗi đúng dài nhất,C1,C2,C3');
assertEq('CSV: dòng hạng 1 (Đ/S/-)', lines[1], '1,Lan,2100,2,3,67,2,Đ,Đ,-');
assertEq('CSV: tỉ lệ cả lớp đúng từng câu', lines[4], ',Cả lớp đúng,,,,,,67%,33%,33%');
assertEq('CSV: chặn công thức Excel trong nội dung câu', lines.indexOf("C2,'=Q2,y") > 0, true);
var sum = R.summary(room);
assertEq('tóm tắt: không có người bị mời ra', sum.players.map(function (p) { return p.name; }), ['Lan', 'Hoa', 'lan (2)']);
assertEq('tóm tắt: thống kê từng câu', sum.perQuestion.map(function (x) { return [x.uid, x.correct, x.of]; }), [['u1', 2, 3], ['u2', 1, 3], ['u3', 1, 3]]);

// ── Đua về đích ──
var race = R.createRoom({ code: 'RACE22', mode: 'race', deck: deck, count: 2, secs: 10 });
assertEq('Đua: tối đa 2×số bước câu, đích = số bước', [race.total, race.goal], [4, 2]);
R.join(race, { cid: 'a', name: 'A' }); R.join(race, { cid: 'b', name: 'B' });
for (var r = 0; r < 2; r++) {
  var qq = R.openNext(race, r * 100);
  R.submit(race, 'a', qq.i, R.current(race).correctIdx, r * 100 + 50);
  R.reveal(race);
}
assertEq('Đua: A đúng 2 câu → về đích, phòng xong', [race.players.a.pos, race.players.b.pos, R.isDone(race)], [2, 0, true]);
assertEq('Đua: lặp lại bộ câu khi cần', R.current(race).text, '=Q2');

// ── Người dẫn tải lại trang ──
var mid = R.createRoom({ code: 'MID234', mode: 'speed', deck: deck, count: 3, secs: 20 });
R.join(mid, { cid: 'x', name: 'X' });
R.openNext(mid, 0);
R.submit(mid, 'x', 0, 0, 0);
var back = R.restore(R.snapshot(mid));
assertEq('khôi phục: câu đang dở được chốt với câu trả lời đã nhận', [back.phase, back.players.x.score, back.players.x.online], ['reveal', 1000, false]);
assertEq('khôi phục: dữ liệu hỏng → null', [R.restore('{bad'), R.restore({ v: 2 })], [null, null]);

// ── Thẻ thưởng (Tốc độ): đúng liền 3 → 🃏 x2, liền 6 → 🛡️ Khiên ──
function cardDeck(n) { var d = []; for (var i = 0; i < n; i++) d.push({ text: 'C' + i, options: ['a', 'b'], correctIdx: 0, img: '', uid: 'k' + i, expl: '' }); return d; }
function play(rm, answers) {   // answers[cid] = chỉ số đáp án, null = bỏ trống; trả kết quả riêng của từng người
  R.openNext(rm, 0);
  Object.keys(answers).forEach(function (cid) { if (answers[cid] !== null) R.submit(rm, cid, rm.i, answers[cid], 0); });
  return R.reveal(rm).results;
}
var cr = R.createRoom({ code: 'CRD234', mode: 'speed', deck: cardDeck(9), count: 9, secs: 20 });
R.join(cr, { cid: 'a', name: 'A' });
var out = [];
for (var q = 0; q < 3; q++) out.push(play(cr, { a: 0 }).a);
assertEq('câu 1-2: chưa có thẻ', [out[0].card, out[1].card], ['', '']);
assertEq('câu 3 (đúng liền 3): nhận thẻ x2, 1000 + 200', [out[2].card, out[2].pts + out[2].bonus, out[2].cards], ['x2', 1200, { x2: 1, shield: 0 }]);
var r4 = play(cr, { a: 0 }).a;
assertEq('câu 4: tự dùng x2 → nhân đôi (1000+300)×2', [r4.used, r4.pts, r4.bonus, r4.cards.x2], ['x2', 2000, 600, 0]);
play(cr, { a: 0 });
var r6 = play(cr, { a: 0 }).a;
assertEq('câu 6 (đúng liền 6): nhận thẻ Khiên', [r6.card, r6.streak, r6.cards.shield], ['shield', 6, 1]);
var r7 = play(cr, { a: 1 }).a;
assertEq('câu 7 sai + có Khiên: giữ chuỗi, dùng Khiên, 0 điểm', [r7.ok, r7.used, r7.streak, r7.pts + r7.bonus, r7.cards.shield], [false, 'shield', 6, 0, 0]);
var r8 = play(cr, { a: 1 }).a;
assertEq('câu 8 sai lần nữa (hết Khiên): mất chuỗi', [r8.used, r8.streak], ['', 0]);
assertEq('bảng xếp hạng có chuỗi hiện tại', R.leaderboard(cr)[0].streak, 0);
assertEq('chuỗi dài nhất vẫn được ghi nhận', cr.players.a.bestStreak, 6);

// Thẻ vừa nhận KHÔNG áp dụng cho chính câu vừa nhận; bỏ trống không được Khiên bảo vệ
var c2 = R.createRoom({ code: 'CRE234', mode: 'speed', deck: cardDeck(8), count: 8, secs: 20 });
R.join(c2, { cid: 'b', name: 'B' });
for (var j = 0; j < 6; j++) play(c2, { b: 0 });                       // đang giữ x2 đã dùng + 1 Khiên
var skip = play(c2, { b: null }).b;
assertEq('không trả lời: Khiên không cứu chuỗi', [skip.used, skip.streak, skip.cards.shield], ['', 0, 1]);

// Chế độ Đua: không có thẻ; người vào giữa chừng / phòng khôi phục từ bản cũ vẫn chạy
var race = R.createRoom({ code: 'RCE234', mode: 'race', deck: cardDeck(6), count: 3, secs: 20 });
R.join(race, { cid: 'r', name: 'R' });
var rr = play(race, { r: 0 }).r;
assertEq('Đua: kết quả không có trường thẻ', [rr.card, rr.used, rr.cards], [undefined, undefined, undefined]);
var legacy = R.createRoom({ code: 'OLD234', mode: 'speed', deck: cardDeck(3), count: 3, secs: 20 });
R.join(legacy, { cid: 'o', name: 'O' });
var snap = JSON.parse(R.snapshot(legacy));
delete snap.players.o.cards;                                         // bản lưu trước khi có thẻ thưởng
var old = R.restore(snap);
assertEq('khôi phục bản cũ: tự có túi thẻ rỗng', old.players.o.cards, { x2: 0, shield: 0 });
assertEq('… và chơi tiếp bình thường', play(old, { o: 0 }).o.pts, 1000);

console.log(failures ? '\n' + failures + ' test FAIL' : '\nTất cả test PASS');
process.exit(failures ? 1 : 0);
