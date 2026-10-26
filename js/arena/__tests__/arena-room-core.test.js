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

assertEq('họ tên dài 30 ký tự không bị cắt', R.cleanName('Nguyễn Thị Khánh Huyền Trang'), 'Nguyễn Thị Khánh Huyền Trang');
assertEq('cid: cùng máy + cùng tên (khác hoa/thường, dấu cách) → cùng người', R.cidFor('abc123def456', 'Nguyễn  Văn An'), R.cidFor('abc123def456', ' nguyễn văn an '));
assertEq('cid: cùng máy, khác tên → khác người (phòng máy dùng chung)', R.cidFor('abc123def456', 'An') !== R.cidFor('abc123def456', 'Bình'), true);
assertEq('cid: hợp lệ, ≤ 40 ký tự', /^[a-z0-9]{13,40}$/.test(R.cidFor('abc123def456', 'Lê Văn Tâm')), true);

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

// ── Sinh tồn (Battle Royale) ──
var sr = R.createRoom({ code: 'SRV234', mode: 'survival', deck: cardDeck(10), count: 10, secs: 20 });
assertEq('sinh tồn: số câu = số câu chọn', [sr.mode, sr.total], ['survival', 10]);
['a', 'b', 'c'].forEach(function (id) { R.join(sr, { cid: id, name: id.toUpperCase() }); });
assertEq('sinh tồn: vào phòng có 3 tim', sr.players.a.hp, 3);
var s1 = play(sr, { a: 0, b: 1, c: null });
assertEq('câu 1: đúng giữ tim + có điểm, sai/bỏ trống mất 1 tim', [s1.a.hp, s1.a.pts > 0, s1.b.hp, s1.b.lost, s1.c.hp], [3, true, 2, true, 2]);
play(sr, { a: 0, b: 1, c: 1 });
var s3 = play(sr, { a: 0, b: 1, c: 0 });
assertEq('câu 3: B hết tim → bị loại ở câu 3', [s3.b.out, s3.b.hp, sr.players.b.outAt], [true, 0, 2]);
assertEq('chưa kết thúc khi còn 2 người trụ', R.isDone(sr), false);
var s4 = play(sr, { a: 0, b: 0, c: 1 });
assertEq('đã bị loại: trả lời đúng vẫn 0 điểm, không hồi tim', [s4.b.wasOut, s4.b.pts, s4.b.hp], [true, 0, 0]);
assertEq('bảng xếp hạng: tim nhiều → bị loại muộn', R.leaderboard(sr).map(function (r) { return r.name; }), ['A', 'C', 'B']);
play(sr, { a: 0, c: 1 });
assertEq('còn 1 người trụ lại → kết thúc', R.isDone(sr), true);
assertEq('kết quả riêng có số tim', R.personalEnd(sr, 'a').hp, 3);
var srCsv = R.toCsv(sr).split('\r\n');
assertEq('CSV sinh tồn có cột tim + câu bị loại', [srCsv[0].indexOf('Tim còn lại') > 0, srCsv[3].split(',').slice(7, 9)], [true, ['0', 'C3']]);
var solo = R.createRoom({ code: 'SRW234', mode: 'survival', deck: cardDeck(5), count: 5, secs: 20 });
R.join(solo, { cid: 'x', name: 'X' });
play(solo, { x: 1 });
assertEq('phòng 1 người: chưa hết tim thì chưa kết thúc', R.isDone(solo), false);

// ── Dạng câu mới trong phòng: chọn nhiều / sắp xếp / ghép đôi ──
var kdeck = [
  { kind: 'multi', text: 'M', options: ['a', 'b', 'c', 'd'], correct: [1, 3], img: '', uid: 'm1', expl: '' },
  { kind: 'order', text: 'O', options: ['s3', 's1', 's2'], correct: [1, 2, 0], img: '', uid: 'o1', expl: '' },
  { kind: 'match', text: 'G', left: ['L1', 'L2'], options: ['R2', 'R1'], correct: [1, 0], img: '', uid: 'g1', expl: '' },
];
var kr = R.createRoom({ code: 'KND234', mode: 'speed', deck: kdeck, count: 3, secs: 20 });
R.join(kr, { cid: 'a', name: 'A' }); R.join(kr, { cid: 'b', name: 'B' });
var pq = R.openNext(kr, 0);
assertEq('câu chọn nhiều gửi đi: có kind + số ô cần chọn, KHÔNG có đáp án', [pq.kind, pq.need, pq.correct], ['multi', 2, undefined]);
assertEq('câu trả lời sai khuôn bị từ chối', R.submit(kr, 'a', 0, 1, 0).reason, 'choice');
R.submit(kr, 'a', 0, [3, 1], 0); R.submit(kr, 'b', 0, [1, 2], 0);
var kres = R.reveal(kr);
assertEq('chọn nhiều: A đúng (thứ tự bấm không quan trọng), B sai; đếm số em chọn từng ô', [kres.results.a.ok, kres.results.b.ok, kres.counts, kres.right], [true, false, [0, 2, 1, 1], 1]);
R.openNext(kr, 0);
R.submit(kr, 'a', 1, [1, 2, 0], 0); R.submit(kr, 'b', 1, [0, 1, 2], 0);
var ko = R.reveal(kr);
assertEq('sắp xếp: chấm theo thứ tự', [ko.results.a.ok, ko.results.b.ok, ko.kind], [true, false, 'order']);
var pg = R.openNext(kr, 0);
assertEq('ghép đôi gửi đi có vế trái', pg.left, ['L1', 'L2']);
R.submit(kr, 'a', 2, [1, 0], 0); R.submit(kr, 'b', 2, [0, 0], 0);
var kg = R.reveal(kr);
assertEq('ghép đôi: chấm từng cặp', [kg.results.a.ok, kg.results.b.ok], [true, false]);
var kcsv = R.toCsv(kr);
assertEq('CSV ghi đáp án đúng dạng chữ', [kcsv.indexOf('1. s1 | 2. s2 | 3. s3') > 0, kcsv.indexOf('L1 → R1 | L2 → R2') > 0], [true, true]);


// ── Kéo co trong Phòng cả lớp ──
var tdeck = [{ text: 'Q1', options: ['a', 'b'], correctIdx: 0 }, { text: 'Q2', options: ['a', 'b'], correctIdx: 1 }, { text: 'Q3', options: ['a', 'b'], correctIdx: 0 }];
var tr = R.createRoom({ code: 'TUGTUG', mode: 'tug', deck: tdeck, count: 3, secs: 20 });
['a', 'b', 'c', 'd', 'e'].forEach(function (id) { R.join(tr, { cid: id, name: 'HS ' + id }); });
assertEq('kéo co: chia đội xen kẽ, luôn cân số người', ['a', 'b', 'c', 'd', 'e'].map(function (id) { return tr.players[id].team; }), ['red', 'blue', 'red', 'blue', 'red']);
R.openNext(tr, 0);
R.submit(tr, 'a', 0, 0, 2000); R.submit(tr, 'c', 0, 0, 15000); R.submit(tr, 'b', 0, 1, 1000);
var tl = R.reveal(tr);
// Đỏ [2,1,0] tb 1 · Xanh [0,0] tb 0 → dây +30 về Đỏ
assertEq('kéo co: dây dịch theo chênh lệch trung bình', [tl.rope, tl.delta, tl.results.a.pts, tl.results.c.pts, tl.results.a.team], [30, 30, 2, 1, 'red']);
assertEq('kéo co: bảng xếp hạng theo lực kéo, có đội', [R.leaderboard(tr)[0].cid, R.leaderboard(tr)[0].value, R.leaderboard(tr)[0].team], ['a', 2, 'red']);
tr.rope = 100;
assertEq('kéo co: dây chạm vạch → kết thúc sớm', R.isDone(tr), true);
R.finish(tr, 5000);
var pe = R.personalEnd(tr, 'b');
assertEq('kéo co: kết quả riêng có đội và đội thắng', [pe.team, pe.won], ['blue', 'red']);
assertEq('kéo co: CSV có cột Đội và dòng kết quả', [R.toCsv(tr).indexOf(',Đội,') > 0, R.toCsv(tr).indexOf('Đội Đỏ thắng') > 0], [true, true]);


// ── Đấu phép trong Phòng cả lớp ──
var spr = R.createRoom({ code: 'SPELLX', mode: 'spell', deck: tdeck, count: 3, secs: 20 });
['a', 'b', 'c'].forEach(function (id) { R.join(spr, { cid: id, name: 'P ' + id }); });
assertEq('đấu phép: vào phòng đủ 100 máu', ['a', 'b', 'c'].map(function (id) { return spr.players[id].hp; }), [100, 100, 100]);
R.openNext(spr, 0);
R.submit(spr, 'a', 0, 0, 1000); R.submit(spr, 'b', 0, 0, 9000); R.submit(spr, 'c', 0, 1, 500);
var sl = R.reveal(spr);
assertEq('đấu phép: ai đúng mới nhận 3 phép', [sl.results.a.spells.length, sl.results.b.spells.length, sl.results.c.spells], [3, 3, undefined]);
var offA = sl.results.a.spells;
assertEq('đấu phép: chỉ chọn được phép đã cấp', [R.pickSpell(spr, 'a', 0, 'nope'), R.pickSpell(spr, 'c', 0, offA[0]), R.pickSpell(spr, 'a', 0, offA[1])], [false, false, true]);
assertEq('đấu phép: đếm số em đã chọn', R.pickedCount(spr), 1);
var before = ['a', 'b', 'c'].map(function (id) { return spr.players[id].hp; }).reduce(function (s, x) { return s + x; }, 0);
var log = R.resolveSpells(spr);
assertEq('đấu phép: nổ theo thứ tự nhanh trước, đúng phép đã chọn / phép đầu', [log.length, log[0].by, log[0].spell, log[1].spell], [2, 'P a', offA[1], sl.results.b.spells[0]]);
assertEq('đấu phép: gọi lần 2 trong cùng câu không nổ lại', R.resolveSpells(spr), null);
var hpSum = ['a', 'b', 'c'].map(function (id) { return spr.players[id].hp; }).reduce(function (s, x) { return s + x; }, 0);
assertEq('đấu phép: có ghi chú riêng cho từng em', ['a', 'b', 'c'].every(function (id) { return spr.players[id].note && typeof spr.players[id].note.taken === 'number'; }), true);
assertEq('đấu phép: máu thay đổi đúng bằng ghi chú (sát thương − hồi)', before - hpSum, ['a', 'b', 'c'].reduce(function (s, id) { var n = spr.players[id].note; return s + n.taken - n.healed; }, 0));
assertEq('đấu phép: bảng xếp hạng có máu (mp), không lẫn tim Sinh tồn', [R.leaderboard(spr)[0].mp !== undefined, R.leaderboard(spr)[0].hp], [true, undefined]);
spr.players.b.hp = 0; spr.players.c.hp = 0;
assertEq('đấu phép: còn 1 người trụ → kết thúc', R.isDone(spr), true);
assertEq('đấu phép: CSV có máu còn lại', R.toCsv(spr).indexOf('Máu còn lại') > 0, true);

// ── Giải mã trong Phòng cả lớp ──
var hr = R.createRoom({ code: 'HEISTX', mode: 'heist', deck: tdeck, count: 3, secs: 20 });
['a', 'b', 'c', 'd', 'e'].forEach(function (id) { R.join(hr, { cid: id, name: 'P ' + id }); });
assertEq('giải mã: mỗi em có két 3 ký hiệu, 0 đá quý', ['a', 'b'].map(function (id) { return [hr.players[id].vault.length, hr.players[id].gems]; }), [[3, 0], [3, 0]]);
R.openNext(hr, 0);
R.submit(hr, 'a', 0, 0, 1000); R.submit(hr, 'b', 0, 0, 5000); R.submit(hr, 'c', 0, 1, 500);
var hl = R.reveal(hr);
assertEq('giải mã: ai đúng mới được chọn việc, gợi ý 3 két không có chính mình', [hl.results.a.heist.targets.length, hl.results.c.heist, hl.results.a.heist.targets.some(function (t) { return t.cid === 'a'; })], [3, undefined, false]);
assertEq('giải mã: không gửi mã két cho học sinh', JSON.stringify(hl.results.a).indexOf('vault'), -1);
assertEq('giải mã: chưa ai dòm két thì không đổi mã được', R.heistAct(hr, 'a', 0, 'rekey'), null);
var tA = hl.results.a.heist.targets[0].cid;
var symOk = hr.players[tA].vault[0];
assertEq('giải mã: chỉ phá được két đã gợi ý', R.heistAct(hr, 'a', 0, 'crack', 'zz', 0), null);
var cr = R.heistAct(hr, 'a', 0, 'crack', tA, symOk);
assertEq('giải mã: đoán đúng ô 1', [cr.hit, cr.pos, cr.opened], [true, 1, false]);
assertEq('giải mã: mỗi câu chỉ 1 việc', R.heistAct(hr, 'a', 0, 'mine'), null);
assertEq('giải mã: bạn bị dòm ngó có cảnh báo', hr.players[tA].note.threat, 1);
assertEq('giải mã: đếm số em đã chọn', R.pickedCount(hr), 1);
R.resolveHeist(hr);
assertEq('giải mã: không chọn kịp thì tự đào', [hr.players.b.gems > 0, hr.players.b.note.auto, hr.players.c.gems], [true, hr.players.b.gems, 0]);
var bGems = hr.players.b.gems;
R.resolveHeist(hr);
assertEq('giải mã: gọi lần 2 không đào thêm', hr.players.b.gems, bGems);
// Câu 2: a phá tiếp két cũ (gợi ý đầu tiên), mở đủ 3 ô → lấy 50%
R.openNext(hr, 30000);
hr.players[tA].gems = 100;
R.submit(hr, 'a', 1, 1, 31000);
var hl2 = R.reveal(hr);
assertEq('giải mã: két đang phá dở được gợi ý đầu tiên', [hl2.results.a.heist.targets[0].cid, hl2.results.a.heist.targets[0].pos], [tA, 1]);
hr.crack.a[tA].pos = 2; // giả lập đã mở 2/3 ô
var cr2 = R.heistAct(hr, 'a', 1, 'crack', tA, hr.players[tA].vault[2]);
assertEq('giải mã: mở đủ 3 ô lấy 50% đá quý, ghi lên màn chiếu', [cr2.opened, cr2.take, hr.players[tA].gems, hr.players.a.opened, hr.heistLog.length, hr.players[tA].note.robbed.length], [true, 50, 50, 1, 1, 1]);
assertEq('giải mã: két bị phá được đổi mã, tiến độ về 0', globalThis.EduArenaCore.vaultThreat(hr.crack, hr.players[tA]), 0);
assertEq('giải mã: xếp hạng theo đá quý', R.leaderboard(hr)[0].value >= R.leaderboard(hr)[1].value, true);
assertEq('giải mã: kết quả riêng + CSV có số két phá', [R.personalEnd(hr, 'a').opened, R.toCsv(hr).indexOf('Két phá được') > 0], [1, true]);

// ── 🔁 Đấu lại câu sai: chỉ câu có bạn sai, khó nhất trước; cùng mã, giữ người, điểm về 0 ──
var rm = R.createRoom({ code: 'REM234', mode: 'speed', deck: deck, count: 3, secs: 20, title: 'Bộ thử', now: 0 });
['a', 'b'].forEach(function (id) { R.join(rm, { cid: id, name: 'Bạn ' + id, face: '🙂' }); });
R.join(rm, { cid: 'k', name: 'Bạn bị mời ra', face: '🙂' }); R.kick(rm, 'k');
for (var qi = 0; qi < 3; qi++) { // câu 1 cả 2 đúng; câu 2 cả 2 sai; câu 3 chỉ b sai
  R.openNext(rm, qi * 30000);
  var right = deck[qi].correctIdx, wrongK = (right + 1) % deck[qi].options.length;
  R.submit(rm, 'a', qi, qi === 1 ? wrongK : right, qi * 30000 + 1000);
  R.submit(rm, 'b', qi, qi === 0 ? right : wrongK, qi * 30000 + 1000);
  R.reveal(rm);
}
R.finish(rm, 99999);
assertEq('đấu lại: chỉ câu có bạn sai, sai nhiều nhất trước', R.missedDeck(rm).map(function (q) { return q.uid; }), ['u2', 'u3']);
var rm2 = R.rematch(rm, R.missedDeck(rm), { now: 100000 });
assertEq('đấu lại: cùng mã, về sảnh, đủ số câu', [rm2.code, rm2.phase, rm2.total, rm2.i], ['REM234', 'lobby', 2, -1]);
assertEq('đấu lại: giữ người (bỏ bạn bị mời ra), điểm về 0', [rm2.order, rm2.players.a.score, rm2.players.a.log.length, rm2.players.a.name], [['a', 'b'], 0, 0, 'Bạn a']);
assertEq('đấu lại: tên phòng không lặp hậu tố', R.rematch(rm2, deck, {}).title, 'Bộ thử · Ôn câu sai');
var perfect = R.createRoom({ code: 'PER234', mode: 'speed', deck: deck, count: 1, secs: 20 });
R.join(perfect, { cid: 'a', name: 'Bạn a', face: '🙂' });
R.openNext(perfect, 0); R.submit(perfect, 'a', 0, deck[0].correctIdx, 500); R.reveal(perfect); R.finish(perfect, 1000);
assertEq('đấu lại: cả lớp đúng hết → không có câu', R.missedDeck(perfect).length, 0);

console.log(failures ? '\n' + failures + ' test FAIL' : '\nTất cả test PASS');
process.exit(failures ? 1 : 0);
