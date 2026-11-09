/* Test js/so-dau-bai/sdb-weekly.js — đọc bảng tuần của trường, nhận xét theo bài, khối ô dán F:H.
   Chạy: node js/so-dau-bai/__tests__/sdb-weekly.test.js — dữ liệu giả (cùng mẫu tab tuần của trường), không gọi mạng. */
var path = require('path');

var failures = 0;
function assertEq(label, actual, expected) {
  var pass = JSON.stringify(actual) === JSON.stringify(expected);
  console.log((pass ? 'PASS' : 'FAIL') + '  ' + label + '  =>  ' + JSON.stringify(actual) + (pass ? '' : '  (expected ' + JSON.stringify(expected) + ')'));
  if (!pass) failures++;
}

globalThis.window = globalThis;
require(path.join(__dirname, '..', '..', 'so-lop', 'so-lop-core.js'));
require(path.join(__dirname, '..', 'sdb-weekly.js'));
require(path.join(__dirname, '..', 'nhan-xet-ic3.js'));
require(path.join(__dirname, '..', 'ppct-ic3.js'));
var L = globalThis.EduSoLop;
var W = globalThis.EduSdbWeekly;
var BANK = globalThis.SDB_COMMENT_BANK;

// Mẫu tab tuần (rút gọn): tiêu đề ghi tuần 09 nhưng ngày dạy là tuần 10; lớp 3.4 có PPCT 11 rồi 8.
var CSV = [
  'UBND XÃ A,,,,,,,CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM,,,,,',
  'TRƯỜNG TIỂU HỌC THỬ NGHIỆM,,,,,,,Độc lập - Tự do - Hạnh phúc,,,,,',
  ',,,,,,,,,,,,',
  '"BẢNG THEO DÕI, NHẬN XÉT TÌNH HÌNH GIẢNG DẠY, HỌC TẬP MÔN TIN HỌC QUỐC TẾ IC3",,,,,,,,,,,,',
  'NĂM HỌC 2026-2027,,,,,,,,,,,,',
  'Tuần: 09 (Từ ngày 02/11/2026 đến ngày 06/11/2026),,,,,,,,,,,,',
  '"Thứ, ngày",Lớp dạy,"Tiết dạy\ntheo TKB","Tiết dạy\ntheo PPCT","Tên bài dạy, nội dung công việc",Học sinh vắng,,"Nhận xét (Ưu điểm, hạn chế) và đánh giá","Giáo viên dạy ký tên\n(ký, ghi rõ họ và tên)",Ghi chú,,,',
  ',,,,,Số lượng,Tên,,,,9/11/2026,11,',
  '9/11/2026,3.1,2 (Sáng),11,Ôn tập 1,,,,Giáo Viên Một,,Lớp,Bài dạy,x',
  '11/11/2026,3.1,2 (Sáng),12,Bài 9: Bắt nạt trực tuyến và ứng xử có trách nhiệm,,,,Giáo Viên Một,,3,x,y',
  '10/11/2026,3.3,4 (Sáng),11,Ôn tập 1,1,Đã Có,Bạn khác đã ghi,Giáo Viên Hai,,,,',
  '10/11/2026,3.4,3 (Sáng),11,Ôn tập 1,,,,Giáo Viên Một,,,,',
  '12/11/2026,3.4,1 (Chiều),8,Bài 9: Bắt nạt trực tuyến và ứng xử có trách nhiệm,,,,Giáo Viên Một,,,,',
  '10/11/2026,4.1,3 (Sáng),11,Bài 9: Các khái niệm cơ bản của trình duyệt Web,,,,Giáo Viên Hai,,,,',
  '10/11/2026,4.1,3 (Chiều),12,Bài 10: Đánh dấu trang,,,,Giáo Viên Hai,,,,',
  'Số tiết thầy Một dạy: 4 tiết.,,,,,,,,,,,,',
  'GVBM,,,,TỔ TRƯỞNG,,,,PHÓ HIỆU TRƯỞNG,,,,',
  ',,,,,,,,,,,,',
  ',,,,,,,,,,,,',
  'Giáo Viên Một,,,,Tổ Trưởng Ba,,,,Phó Hiệu Trưởng Bốn,,,,',
].join('\n');
var raw = L.parseCSV(CSV);
var S = W.parseWeekSheet(raw);

// ── Đọc bảng ──
assertEq('nhận bảng tuần', !!S, true);
assertEq('tên trường', S.school, 'TRƯỜNG TIỂU HỌC THỬ NGHIỆM');
assertEq('dòng UBND', S.ubnd, 'UBND XÃ A');
assertEq('cột F, G, H, I', [S.cols.absN, S.cols.absNames, S.cols.cmt, S.cols.teacher], [5, 6, 7, 8]);
assertEq('7 dòng tiết, bỏ dòng tổng kết', S.rows.length, 7);
assertEq('sáng rồi chiều cùng ngày không bị báo PPCT', /4.1/.test(S.warnings.join(' ')), false);
assertEq('dòng đầu ở hàng 9 (0-based 8)', S.rows[0].r, 8);
assertEq('ngày, lớp, tiết, buổi', [S.rows[0].date, S.rows[0].cls, S.rows[0].tiet, S.rows[0].buoi], ['2026-11-09', '3.1', 2, 'Sáng']);
assertEq('tiết chiều', [S.rows[4].tiet, S.rows[4].buoi], [1, 'Chiều']);
assertEq('ô đã có của GV khác', S.rows[2].cur, ['1', 'Đã Có', 'Bạn khác đã ghi']);
assertEq('danh sách GV', S.teachers, ['Giáo Viên Một', 'Giáo Viên Hai']);
assertEq('tên ký cuối bảng', S.signers, { gvbm: 'Giáo Viên Một', toTruong: 'Tổ Trưởng Ba', pht: 'Phó Hiệu Trưởng Bốn' });
assertEq('tên lệch cột do ô gộp', W.signBlock([['GVBM', '', '', '', 'TỔ TRƯỞNG', '', '', '', 'PHÓ HIỆU TRƯỞNG'], [], [], ['', 'Người A', '', '', '', 'Người B', '', '', '', 'Người C']]), { gvbm: 'Người A', toTruong: 'Người B', pht: 'Người C' });
assertEq('chưa có tên → để trống', W.signBlock([['GVBM', '', 'TỔ TRƯỞNG', '', 'PHÓ HIỆU TRƯỞNG']]), { gvbm: '', toTruong: '', pht: '' });
assertEq('không có khối ký', W.signBlock([['a', 'b']]), null);
assertEq('cảnh báo tiêu đề sai tuần', /Tuần: 09/.test(S.warnings[0] || ''), true);
assertEq('cảnh báo PPCT giảm ở 3.4', /3\.4 \(12\/11: 8 sau 11\)/.test(S.warnings[1] || ''), true);
assertEq('không phải bảng tuần → null', W.parseWeekSheet([['a', 'b'], ['c']]), null);

// ── Nguồn nhập ──
assertEq('link có gid', W.readSource('https://docs.google.com/spreadsheets/d/19sAa9HbXB30OxQzVl45xzdIxWAV-k5Feicc02dl6Hvg/edit?gid=1115394324#gid=1115394324'),
  { kind: 'link', id: '19sAa9HbXB30OxQzVl45xzdIxWAV-k5Feicc02dl6Hvg', gid: '1115394324', noGid: false });
assertEq('link thiếu gid', W.readSource('https://docs.google.com/spreadsheets/d/19sAa9HbXB30OxQzVl45xzdIxWAV-k5Feicc02dl6Hvg/edit').noGid, true);
assertEq('bảng dán (có Tab)', W.readSource('a\tb\nc\td').kind, 'paste');
assertEq('chữ linh tinh', W.readSource('xin chào'), null);
assertEq('TSV ô nhiều dòng', W.parseTSV('"Thứ, ngày"\t"Tiết dạy\ntheo TKB"\tx\n1\t2\t3'), [['Thứ, ngày', 'Tiết dạy\ntheo TKB', 'x'], ['1', '2', '3']]);
assertEq('TSV ngoặc giữa ô giữ nguyên', W.parseTSV('Bài "A"\tb'), [['Bài "A"', 'b']]);
var pasted = W.parseWeekSheet(W.parseTSV(raw.map(function (r) { return r.map(function (c) { return /[\t\n"]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; }).join('\t'); }).join('\n')));
assertEq('dán từ Sheet đọc giống CSV', pasted.rows.map(function (x) { return x.r + x.cls; }), S.rows.map(function (x) { return x.r + x.cls; }));
assertEq('ngày kiểu Thứ 2 xuống dòng', W.dateISO('Thứ 2\n09/11/2026'), '2026-11-09');

// ── GV ──
assertEq('cùng GV có dấu/không dấu', W.sameTeacher('Nguyễn Văn Hùng', 'nguyen van hung'), true);
assertEq('chỉ tên', W.sameTeacher('Hùng', 'Nguyễn Văn Hùng'), true);
assertEq('Thầy + tên', W.sameTeacher('Thầy Hùng', 'Nguyễn Văn Hùng'), true);
assertEq('khác GV', W.sameTeacher('Nguyễn Hoài Bảo', 'Nguyễn Văn Hùng'), false);
assertEq('tên rỗng', W.sameTeacher('', 'Hùng'), false);

// ── Nhận xét ──
assertEq('loại tiết', ['Ôn tập 1', 'Làm Test 01, Test 02', 'Giới thiệu chương trình', 'Bài 9: Mật khẩu'].map(W.kindOf), ['review', 'test', 'intro', 'lesson']);
var K3 = globalThis.PPCT_SEED.IC3_K3.map(function (x) { return { t: x[0], topic: x[1], name: x[2] }; });
assertEq('chủ đề theo số bài', W.topicOf(K3, 'Bài 9: Bắt nạt trực tuyến', L.lessonOf), 'an toàn và bảo mật');
var c1 = W.pickComment(BANK, { lesson: 'Bài 9: Bắt nạt trực tuyến và ứng xử có trách nhiệm', topic: 'An Toàn Và Bảo Mật', cls: '3.1', date: '2026-11-11', tiet: 2 });
assertEq('có Ưu và Hạn chế', !!(c1.uu && c1.hc), true);
assertEq('câu Ưu lấy từ chủ đề + thái độ', BANK.topics['an toan va bao mat'].uu.map(function (s) { return s.replace('{bai}', 'Bắt nạt trực tuyến và ứng xử có trách nhiệm'); }).some(function (s) { return c1.uu.indexOf(s) === 0; }), true);
assertEq('không còn {bai}', /\{bai\}|\{n\}/.test(c1.uu + c1.hc), false);
var c1b = W.pickComment(BANK, { lesson: 'Bài 9: Bắt nạt trực tuyến và ứng xử có trách nhiệm', topic: 'An Toàn Và Bảo Mật', cls: '3.1', date: '2026-11-11', tiet: 2 });
assertEq('mở lại ra đúng câu cũ', c1b, c1);
var many = {};
['3.1', '3.2', '3.3', '3.4', '3.5', '3.6'].forEach(function (c) { many[W.pickComment(BANK, { lesson: 'Ôn tập 1', cls: c, date: '2026-11-10', tiet: 3 }).uu] = 1; });
assertEq('các lớp không trùng hết nguyên văn', Object.keys(many).length > 1, true);
var turned = W.pickComment(BANK, { lesson: 'Ôn tập 1', cls: '3.1', date: '2026-11-10', tiet: 3, turn: 1 });
var base = W.pickComment(BANK, { lesson: 'Ôn tập 1', cls: '3.1', date: '2026-11-10', tiet: 3 });
assertEq('Đổi câu ra câu khác', JSON.stringify(turned) !== JSON.stringify(base) || JSON.stringify(W.pickComment(BANK, { lesson: 'Ôn tập 1', cls: '3.1', date: '2026-11-10', tiet: 3, turn: 2 })) !== JSON.stringify(base), true);
assertEq('vắng nhiều thêm câu sĩ số', /vắng 4 HS/i.test(W.pickComment(BANK, { lesson: 'Ôn tập 1', cls: '3.1', date: '2026-11-10', tiet: 3, absent: 4 }).hc), true);
assertEq('vắng 1 không thêm', /vắng 1 HS/i.test(W.pickComment(BANK, { lesson: 'Ôn tập 1', cls: '3.1', date: '2026-11-10', tiet: 3, absent: 1 }).hc), false);
assertEq('bài lạ vẫn có câu chung', !!W.pickComment(BANK, { lesson: 'Hoạt động trải nghiệm', cls: '3.1', date: '2026-11-10', tiet: 3 }).uu, true);

// ── Vắng ──
assertEq('tách tên', W.splitNames('An, Bình (K); Chi'), [{ name: 'An', type: 'P' }, { name: 'Bình', type: 'K' }, { name: 'Chi', type: 'P' }]);
assertEq('ô vắng', W.absentCells([{ name: 'An', type: 'P' }, { name: 'Bình', type: 'K' }], true, true), ['2', 'An, Bình (K)']);
assertEq('đủ, ghi 0', W.absentCells([], true, true), ['0', '']);
assertEq('đủ, để trống', W.absentCells([], true, false), ['', '']);
assertEq('chưa điểm danh để trống', W.absentCells([], false, true), ['', '']);

// ── Khối dán ──
var fills = new Map();
S.rows.filter(function (x) { return W.sameTeacher(x.teacher, 'Giáo Viên Một'); }).forEach(function (x, i) { fills.set(x.r, [String(i), 'HS ' + i, 'Ưu: tốt\nHạn chế: "ít"']); });
var blk = W.clipBlock(S, fills, raw);
assertEq('vùng dán F9:H13', [blk.a1, blk.range, blk.rows, blk.mine], ['F9', 'F9:H13', 5, 4]);
var lines = W.parseTSV(blk.tsv);
assertEq('TSV đọc lại đủ 5 dòng × 3 ô', lines.map(function (l) { return l.length; }), [3, 3, 3, 3, 3]);
assertEq('dòng của GV khác giữ nguyên', lines[2], ['1', 'Đã Có', 'Bạn khác đã ghi']);
assertEq('ô nhiều dòng + ngoặc kép', lines[0][2], 'Ưu: tốt\nHạn chế: "ít"');
assertEq('HTML xuống dòng bằng <br>', /Ưu: tốt<br>Hạn chế: &quot;ít&quot;/.test(blk.html), true);
assertEq('không có dòng của tôi → null', W.clipBlock(S, new Map(), raw), null);

// ── Sổ lớp: tab BÁO GIẢNG (Kiến thức cần đạt) ──
var BG = L.parseCSV([
  'Chủ đề,Tiết,Tên bài học,Kiến thức cần đạt',
  'Giới thiệu,1,Giới thiệu chương trình,"- Giới thiệu chương trình học\n - Đường link youtobe : https://youtu.be/x"',
  'AN TOÀN VÀ BẢO MẬT,12,Bài 9: Bắt nạt trực tuyến,"• Trình bày được khái niệm bắt nạt trực tuyến (Cyberbullying);\n • Nêu được cách ứng xử khi bị bắt nạt;\n • Biết không chia sẻ thông tin cá nhân."',
  ',11,,',
  'SÁNG TẠO NỘI DUNG,23-24,Bài 18: Làm quen với Word,"• Mở được phần mềm Word."',
].join('\n'));
var G = W.parseGoals(BG);
assertEq('3 bài (bỏ dòng tiết trống)', G.map(function (x) { return x.name; }), ['Giới thiệu chương trình', 'Bài 9: Bắt nạt trực tuyến', 'Bài 18: Làm quen với Word']);
assertEq('bỏ dòng link, giữ mục tiêu ngắn gọn', G[0].goals, ['Giới thiệu chương trình học']);
assertEq('mục tiêu bỏ dấu đầu dòng + ; cuối', G[1].goals[0], 'Trình bày được khái niệm bắt nạt trực tuyến (Cyberbullying)');
assertEq('chủ đề', G[1].topic, 'AN TOÀN VÀ BẢO MẬT');
assertEq('tiết 23-24', G[2].t, [23, 24]);
assertEq('khớp theo số bài', W.goalsFor(G, 'Bài 9: Bắt nạt trực tuyến và ứng xử có trách nhiệm', '12', L.lessonOf).name, 'Bài 9: Bắt nạt trực tuyến');
assertEq('khớp theo tiết PPCT', W.goalsFor(G, 'Làm quen phần mềm', '24', L.lessonOf).name, 'Bài 18: Làm quen với Word');
assertEq('không khớp', W.goalsFor(G, 'Bài 30: Gì đó', '40', L.lessonOf), null);
assertEq('HS + chữ thường đầu câu', W.asHS('Trình bày được khái niệm'), 'HS trình bày được khái niệm');
var cg = W.pickComment(BANK, { lesson: 'Bài 9: Bắt nạt trực tuyến', topic: 'AN TOÀN VÀ BẢO MẬT', goals: G[1].goals, cls: '3.2', date: '2026-11-11', tiet: 2 });
assertEq('Ưu theo Kiến thức cần đạt', /HS (trình bày được khái niệm bắt nạt|nêu được cách ứng xử|biết không chia sẻ)/.test(cg.uu), true);
var weakSeen = false;
for (var i = 0; i < 12; i++) { var x = W.pickComment(BANK, { lesson: 'Bài 9: Bắt nạt trực tuyến', topic: 'AN TOÀN VÀ BẢO MẬT', goals: G[1].goals, cls: '3.' + i, date: '2026-11-11', tiet: 2 }); if (/^Một số HS chưa (trình bày|nêu) được/.test(x.hc)) weakSeen = true; if (/chưa biết không/.test(x.hc)) weakSeen = 'bad'; }
assertEq('Hạn chế "chưa … được", không ghép câu gượng', weakSeen, true);
assertEq('ôn tập không dùng mục tiêu bài', /^HS (ôn|tự giác)|^Đa số HS trả lời/.test(W.pickComment(BANK, { lesson: 'Ôn tập 1', goals: G[1].goals, cls: '3.1', date: '2026-11-09', tiet: 2 }).uu), true);

// ── Sổ lớp: tab lớp ──
function classCSV(ngay, bai, marks) {
  var n = ngay.length, blank = new Array(n).fill('');
  var lines = [
    ['TRƯỜNG', 'TIH THỬ NGHIỆM'], ['LỚP:', '3A4'], ['TÊN GV: Giáo Viên Một'],
    ['STT', 'MÃ HS', 'HỌ & TÊN', 'NGÀY SINH', 'TIẾT'].concat(ngay.map(function (_, i) { return String(9 + i); })),
    ['', '', '', '', 'NGÀY'].concat(ngay),
    ['', '', '', '', 'BÀI DẠY'].concat(bai),
    ['', '', '', '', 'ĐÃ HOÀN THÀNH'].concat(ngay.map(function () { return 'TRUE'; })),
  ];
  marks.forEach(function (m, i) { lines.push([String(i + 1), 'HS' + i, 'Học Sinh ' + i, '01/01/2018', ''].concat(m)); });
  return L.parseCSV(lines.map(function (r) { return r.join(','); }).join('\n'));
}
var C = L.parseClass(classCSV(['03.11', '05.11', '10.11', '12.11', '', ''], ['Bài 8', 'Ôn tập CĐ1', 'Ôn tập CĐ1', 'Bài 9', 'Bài 10', 'Bài 11'],
  [['x', 'x', 'x', 'v', '', ''], ['x', 'v', 'x', 'x', '', ''], ['x', 'x', 'x', 'v', '', '']]));
var ref = new Date(2026, 10, 9);
var hit12 = W.sessionFor(C, { date: '2026-11-12', ppct: '8' }, 0, L.dateOf, ref);
assertEq('khớp buổi theo ngày', [hit12.by, hit12.s.tiet], ['date', 12]);
assertEq('vắng buổi 12/11', W.absentAt(C, hit12.s), { known: true, names: ['Học Sinh 0', 'Học Sinh 2'] });
assertEq('nháp Điểm danh được ưu tiên', W.absentAt(C, hit12.s, { 7: 'x', 9: 'x' }).names, []);
assertEq('lệch PPCT', W.crossCheck({ ppct: '8' }, hit12), 'PPCT ghi 8, sổ lớp là tiết 12');
assertEq('khớp thì không cảnh báo', W.crossCheck({ ppct: '12', lesson: 'Bài 9: Bắt nạt' }, hit12, L.lessonOf), '');
assertEq('lệch tên bài (bài lớp 5 ghi nhầm vào lớp 3)', W.crossCheck({ ppct: '12', lesson: 'Bài 10: Đánh giá thông tin' }, hit12, L.lessonOf), 'bài ghi Bài 10, sổ lớp là Bài 9');
assertEq('ôn tập ghi thành bài mới', W.crossCheck({ ppct: '12', lesson: 'Ôn tập 1' }, hit12, L.lessonOf), 'bài ghi “Ôn tập 1”, sổ lớp là Bài 9');
var hitT = W.sessionFor(C, { date: '2026-11-17', ppct: '13' }, 0, L.dateOf, ref);
assertEq('sổ chưa ghi ngày → khớp tiết PPCT', [hitT.by, hitT.s.tiet], ['tiet', 13]);
assertEq('… và báo thiếu ngày', W.crossCheck({ ppct: '13' }, hitT), 'sổ lớp chưa ghi ngày cho tiết 13');
assertEq('buổi chưa điểm danh', W.absentAt(C, hitT.s).known, false);
assertEq('không có buổi', W.crossCheck({ ppct: '99' }, W.sessionFor(C, { date: '2026-11-20', ppct: '99' }, 0, L.dateOf, ref)), 'sổ lớp không có buổi này');

// ── Tạo bảng tuần mới ──
var tk = W.tkbMap(S); // S: bảng tuần ở trên (3.4: T3 3 (Sáng), T5 1 (Chiều))
assertEq('TKB theo lớp + thứ', [tk('3.4', 3, 0), tk('3.4', 5, 0), tk('3.9', 2, 0)], ['3 (Sáng)', '1 (Chiều)', '']);
var wk = W.buildWeek([{ cls: '3.4', c: C }], { dates: ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14'], tkbOf: tk, lessonOf: function (cls, s) { return s.bai; }, dateOf: L.dateOf, ref: ref });
assertEq('2 tiết tuần 10 của 3.4', wk.rows.map(function (x) { return [x.date, x.tkb, x.ppct, x.lesson, x.teacher]; }),
  [['2026-11-10', '3 (Sáng)', '11', 'Ôn tập CĐ1', 'Giáo Viên Một'], ['2026-11-12', '1 (Chiều)', '12', 'Bài 9', 'Giáo Viên Một']]);
var C2 = L.parseClass(classCSV(['05.10', '', ''], ['Bài 1', 'Bài 2', 'Bài 3'], [['x', 'x', '']]));
C2.sessions[1].done = true;
assertEq('lớp không có tiết có ngày trong tuần → báo', W.buildWeek([{ cls: '4.5', c: C2 }], { dates: ['2026-11-09', '2026-11-14'], tkbOf: tk, lessonOf: function () { return ''; }, dateOf: L.dateOf, ref: ref }).undated, ['4.5']);
assertEq('ngày d/m/yyyy như bảng trường', W.dmy('2026-11-09'), '9/11/2026');
var gc = W.gridClip([['9/11/2026', '3.4', '3 (Sáng)', '11', 'Ôn tập 1', '0', '', 'Ưu: a\nHạn chế: b', 'GV', '']]);
assertEq('khối A:J 10 ô', W.parseTSV(gc.tsv)[0].length, 10);

console.log(failures ? '\n' + failures + ' FAIL' : '\nTất cả đều PASS');
process.exit(failures ? 1 : 0);
