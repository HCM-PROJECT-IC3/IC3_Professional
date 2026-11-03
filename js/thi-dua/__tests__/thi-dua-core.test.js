/* Test logic "Thi đua lớp học" (js/thi-dua/thi-dua-core.js).
   Chạy: node js/thi-dua/__tests__/thi-dua-core.test.js — thuần, không DOM, không mạng. */
var path = require('path');
var failures = 0;
function assertEq(label, actual, expected) {
  var pass = JSON.stringify(actual) === JSON.stringify(expected);
  console.log((pass ? 'PASS' : 'FAIL') + '  ' + label + (pass ? '' : '  =>  ' + JSON.stringify(actual) + '  (expected ' + JSON.stringify(expected) + ')'));
  if (!pass) failures++;
}
var T = require(path.join(__dirname, '..', 'thi-dua-core.js'));

// ── Tạo lớp, chia tổ ──
var c = T.newClass('6A1', ['Nguyễn An', 'Trần Bình', 'nguyễn an', '  Lê   Chi ', '', 'Phạm Dũng', 'Võ <b>Em</b>'], 2);
assertEq('bỏ trùng tên/dòng trống, gọn khoảng trắng, bỏ ký tự HTML', c.students.map(function (s) { return s.name; }), ['Nguyễn An', 'Trần Bình', 'Lê Chi', 'Phạm Dũng', 'Võ b Em /b']);
assertEq('chia tổ lần lượt', c.students.map(function (s) { return s.group; }), ['Tổ 1', 'Tổ 2', 'Tổ 1', 'Tổ 2', 'Tổ 1']);
var id = function (n) { return c.students.find(function (s) { return s.name === n; }).id; };
assertEq('thêm học sinh: bỏ trùng, vào tổ ít người hơn', [T.addStudents(c, ['Trần Bình', 'Đặng Hà']), c.students[5].group], [1, 'Tổ 2']);

// ── Cộng / trừ / hoàn tác ──
T.award(c, [id('Nguyễn An')], 2, 'Hoàn thành bài');
T.award(c, [id('Nguyễn An'), id('Trần Bình')], 1, 'Phát biểu');
T.award(c, [id('Trần Bình')], -1, 'Nói chuyện riêng');
var sc = T.scores(c);
assertEq('điểm tính từ nhật ký (cộng, trừ)', [sc[id('Nguyễn An')].earned, sc[id('Trần Bình')].earned, sc[id('Trần Bình')].plus, sc[id('Trần Bình')].minus], [3, 0, 1, 1]);
assertEq('bỏ qua lệnh không hợp lệ (0 điểm, em không có, > 100)', [T.award(c, [id('Lê Chi')], 0, ''), T.award(c, ['xx'], 1, ''), T.award(c, [id('Lê Chi')], 500, '')], [null, null, null]);
T.award(c, [id('Lê Chi')], 5, 'nhầm');
assertEq('hoàn tác bỏ đúng lệnh cuối', [T.undo(c).reason, T.scores(c)[id('Lê Chi')].earned], ['nhầm', 0]);

// ── Đổi quà: trừ điểm còn lại, KHÔNG trừ điểm thi đua ──
var gift = { label: 'Nhãn dán', cost: 2 };
var r1 = T.redeem(c, id('Nguyễn An'), gift);
var a = T.scores(c)[id('Nguyễn An')];
assertEq('đổi quà: còn 1, điểm thi đua giữ 3', [r1.ok, a.earned, a.spent, a.balance], [true, 3, 2, 1]);
assertEq('không đủ điểm → từ chối, báo số điểm', T.redeem(c, id('Nguyễn An'), gift), { ok: false, error: 'Cần 2 điểm, em còn 1 điểm.' });

// ── Xếp hạng em + tổ ──
var lb = T.leaderboard(c);
assertEq('xếp hạng theo điểm thi đua, bằng điểm cùng hạng', lb.map(function (s) { return s.name + ':' + s.rank; }).slice(0, 3), ['Nguyễn An:1', 'Đặng Hà:2', 'Lê Chi:2']);
assertEq('thi đua tổ theo điểm TB/em (tổ đông không tự thắng)', T.groupBoard(c).map(function (g) { return [g.group, g.members, g.total, g.avg]; }), [['Tổ 1', 3, 3, 1], ['Tổ 2', 3, 0, 0]]);
assertEq('hoạt động gần đây: mới nhất trước, có tên', T.recent(c, 2).map(function (e) { return [e.kind, e.names.join(','), e.delta]; }), [['redeem', 'Nguyễn An', -2], ['award', 'Trần Bình', -1]]);

// ── Nhật ký dài: entry cũ gộp vào carry, điểm không mất ──
var big = T.newClass('7A', ['X', 'Y'], 1);
for (var i = 0; i < T.LOG_MAX + 50; i++) T.award(big, [big.students[0].id], 1, 'x', i);
T.redeem(big, big.students[0].id, { label: 'q', cost: 10 });
var bs = T.scores(big)[big.students[0].id];
assertEq('log giữ tối đa LOG_MAX, điểm vẫn đủ', [big.log.length, bs.earned, bs.spent, bs.balance], [T.LOG_MAX, T.LOG_MAX + 50, 10, T.LOG_MAX + 40]);

// ── CSV chống công thức Excel ──
var evil = T.newClass('8A', ['=HYPERLINK("x")'], 1);
assertEq('CSV: ô bắt đầu bằng = bị vô hiệu', T.toCsv(evil).indexOf('"\'=HYPERLINK') > -1, true);

// ── Sao lưu / khôi phục ──
var st = T.emptyState();
st.classes[c.id] = c; st.cur = c.id;
var back = T.normalize(JSON.parse(JSON.stringify(st)));
assertEq('khôi phục giữ nguyên điểm', T.scores(back.classes[c.id])[id('Nguyễn An')], T.scores(c)[id('Nguyễn An')]);
assertEq('file hỏng / sai cấu trúc → null', [T.normalize(null), T.normalize({ a: 1 }), T.normalize('x')], [null, null, null]);
var dirty = JSON.parse(JSON.stringify(st));
dirty.criteria.plus.push({ label: 'Lạ', points: 999, icon: 'x" onerror="' });
dirty.classes[c.id].log.push({ ids: ['khong-co'], delta: 5 });
var cleaned = T.normalize(dirty);
var odd = cleaned.criteria.plus[cleaned.criteria.plus.length - 1];
assertEq('khôi phục: chặn điểm quá lớn, icon lạ, entry trỏ tới em không có', [odd.points, odd.icon, cleaned.classes[c.id].log.length], [20, 'fa-star', c.log.length]);

// ── Kết quả IC3 → điểm thi đua + Hoa điểm 10 ──
var k = T.newClass('6A1 – THCS Thử', ['Nguyễn An', 'Lê Chi', 'Mai Khôi'], 2);
var kid = function (n) { return k.students.find(function (s) { return s.name === n; }).id; };
var rows = [
  { id: 'r1', n: 'Nguyễn An', c: '6A1', t: 'IC3 › LV1 › Bài 1', p: 100 },
  { id: 'r2', n: 'nguyễn  an', c: '6A1', t: 'IC3 › LV1 › Bài 2', p: 92 },   // tên gõ lệch hoa/thường/khoảng trắng
  { id: 'r3', n: 'Lê Chi', c: '6A1', t: 'IC3 › LV1 › Bài 1', p: 70 },       // dưới mốc
  { id: 'r4', n: 'Mai Khôi', c: '6A2', t: 'IC3 › LV1 › Bài 1', p: 100 },    // trùng tên ở LỚP KHÁC
  { id: 'r5', n: 'Hồ Giang', c: '6A1', t: 'IC3 › LV1 › Bài 1', p: 95 },     // không có trong bảng
  { id: 'r6', n: 'Lê Chi', c: '6A1', t: 'Thử thách số 9', p: 100, pt: 4200 }, // mã Thử thách hôm nay
];
var rc = T.resultClasses(k, rows);
assertEq('đoán lớp trong mã khớp tên bảng thi đua', [rc.guess, rc.list], ['6A1', ['6A1', '6A2']]);
var imp = T.importResults(k, rows, { className: '6A1', now: 1000 });
assertEq('nhập: 100% +3, ≥90% +2, dưới mốc không cộng, bỏ lớp khác + thử thách',
  [imp.awarded, imp.points, imp.perfect, imp.low, imp.unmatched], [2, 5, 1, 1, ['Hồ Giang']]);
assertEq('điểm sau khi nhập', [T.scores(k)[kid('Nguyễn An')].earned, T.scores(k)[kid('Mai Khôi')].earned, T.scores(k)[kid('Lê Chi')].earned], [5, 0, 0]);
var again = T.importResults(k, rows, { className: '6A1', now: 2000 });
assertEq('nhập lại cùng mã: không cộng lần 2', [again.awarded, again.already, T.scores(k)[kid('Nguyễn An')].earned], [0, 3, 5]);
T.importResults(k, [{ id: 'r7', n: 'Nguyễn An', c: '6A1', t: 'IC3 › LV1 › Bài 3', p: 100 }, { id: 'r8', n: 'Lê Chi', c: '6A1', t: 'IC3 › LV1 › Bài 4', p: 100 }], { className: '6A1', now: 3000 });
assertEq('Hoa điểm 10: nhiều bài 100% trước', T.honorBoard(k).map(function (e) { return [e.name, e.count, e.tests]; }), [['Nguyễn An', 2, ['Bài 1', 'Bài 3']], ['Lê Chi', 1, ['Bài 4']]]);
var kst = T.emptyState(); kst.classes[k.id] = k;
var kback = T.normalize(JSON.parse(JSON.stringify(kst))).classes[k.id];
assertEq('sao lưu giữ mã đã nhập + vinh danh (nhập lại sau khôi phục vẫn không cộng)',
  [T.honorBoard(kback).length, T.importResults(kback, rows, { className: '6A1' }).awarded], [2, 0]);

// ── GVCN / GVBM: loại lớp, sơ kết tuần, tin nhắn, trực nhật, so sánh lớp ──
var MON = new Date(2026, 10, 2).getTime();            // thứ Hai 2/11/2026
var WED = MON + 2 * 864e5 + 9 * 3600e3;               // thứ Tư 9h
var wk = T.weekBounds(0, WED);
assertEq('tuần: thứ Hai 0h → thứ Hai sau, nhãn ngày', [wk.from === MON, T.weekLabel(wk), T.weekLabel(T.weekBounds(-1, WED))], [true, '2/11–8/11', '26/10–1/11']);
var cn = T.newClass('5A3 (chủ nhiệm)', ['An', 'Bình', 'Chi', 'Dũng'], 2, 'gvcn');
var cid = function (n) { return cn.students.find(function (s) { return s.name === n; }).id; };
var st0 = T.emptyState(); st0.classes[cn.id] = cn;
assertEq('lớp chủ nhiệm dùng bộ tiêu chí nề nếp riêng', [cn.kind, T.criteriaFor(st0, cn).minus[0].label, T.criteriaFor(st0, { kind: 'gvbm' }).plus[0].label],
  ['gvcn', 'Đi học muộn', 'Phát biểu xây dựng bài']);
T.award(cn, [cid('An')], 1, 'Hăng hái phát biểu', WED);
T.award(cn, [cid('An')], 1, 'Hăng hái phát biểu', WED + 1);
T.award(cn, [cid('An'), cid('Bình')], 2, 'Tham gia phong trào', WED + 2);
T.award(cn, [cid('Chi')], -1, 'Đi học muộn', WED + 3);
T.award(cn, [cid('Chi')], -1, 'Không làm bài tập về nhà', WED + 4);
T.award(cn, [cid('Dũng')], 5, 'tuần trước', MON - 864e5);   // chủ nhật tuần trước → không tính
var sum = T.weekSummary(cn, wk);
var an = sum.students.find(function (s) { return s.name === 'An'; });
assertEq('sơ kết: chỉ tính trong tuần, gộp lý do', [an.plus, an.reasons['Hăng hái phát biểu'].n, sum.top.map(function (s) { return s.name; }), sum.reminders.map(function (s) { return s.name; })],
  [4, 2, ['An', 'Bình'], ['Chi']]);
var cm = T.classMessage(cn, sum, wk);
assertEq('tin nhắn lớp: tuyên dương, không nêu tên em bị nhắc', [/Tuyên dương: An \(\+4\), Bình \(\+2\)/.test(cm), /Chi/.test(cm), /Cần cố gắng/.test(cm)], [true, false, true]);
var pm = T.parentMessage(cn, sum.students.find(function (s) { return s.name === 'Chi'; }), wk, { total: -2, teacher: 'GVCN: Cô Lan' });
assertEq('tin nhắn phụ huynh: lý do cụ thể, lời nhắn phù hợp, chữ ký',
  [/Cần nhắc nhở: .*Đi học muộn/.test(pm), /Mong gia đình nhắc nhở/.test(pm), /Điểm thi đua tích luỹ: -2/.test(pm), /GVCN: Cô Lan$/.test(pm)], [true, true, true, true]);
assertEq('tin nhắn phụ huynh em được khen', /Được khen: Hăng hái phát biểu ×2, Tham gia phong trào \(\+4 điểm\)/.test(T.parentMessage(cn, an, wk)), true);
var d0 = T.dutyGroup(cn, WED), d1 = T.dutyGroup(cn, WED + 7 * 864e5);
cn.dutyShift = 1;
assertEq('trực nhật: đổi tổ mỗi tuần, cả tuần cùng 1 tổ, dời lượt được', [d0 !== d1, T.dutyGroup({ groups: cn.groups, dutyShift: 0 }, MON) === d0, T.dutyGroup(cn, WED) === d1], [true, true, true]);
var bm1 = T.newClass('6A1', ['X', 'Y'], 1), bm2 = T.newClass('6A2', ['Z', 'W'], 1);
T.award(bm1, [bm1.students[0].id], 3, 'Phát biểu', WED);
T.award(bm2, bm2.students.map(function (s) { return s.id; }), 2, 'Hoàn thành bài', WED);
var st1 = T.emptyState(); [bm1, bm2, cn].forEach(function (c) { st1.classes[c.id] = c; });
assertEq('so sánh các lớp bộ môn (không lẫn lớp chủ nhiệm), xếp theo TB/em', T.compareClasses(st1, wk).map(function (r) { return [r.name, r.avg, r.active]; }), [['6A2', 2, 2], ['6A1', 1.5, 1]]);
var old = JSON.parse(JSON.stringify(st1)); delete old.criteriaCN; Object.values(old.classes).forEach(function (c) { delete c.kind; });
var mig = T.normalize(old);
assertEq('dữ liệu cũ (chưa có loại lớp): mặc định lớp bộ môn, có sẵn bộ tiêu chí chủ nhiệm', [Object.values(mig.classes).every(function (c) { return c.kind === 'gvbm'; }), mig.criteriaCN.minus.length], [true, 5]);
assertEq('sao lưu giữ loại lớp + dời lượt trực nhật', [T.normalize(JSON.parse(JSON.stringify(st1))).classes[cn.id].kind, T.normalize(JSON.parse(JSON.stringify(st1))).classes[cn.id].dutyShift], ['gvcn', 1]);

if (failures) { console.log('\n' + failures + ' kiểm tra THẤT BẠI'); process.exit(1); }
console.log('\nTất cả kiểm tra đạt.');
