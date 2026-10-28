/* Test js/so-lop/so-lop-core.js — đọc FORM QUẢN LÝ LỚP của điều phối (link, tab, CSV, tiến độ, điểm danh).
   Chạy: node js/so-lop/__tests__/so-lop-core.test.js — dữ liệu giả, không gọi mạng. */
var path = require('path');

var failures = 0;
function assertEq(label, actual, expected) {
  var pass = JSON.stringify(actual) === JSON.stringify(expected);
  console.log((pass ? 'PASS' : 'FAIL') + '  ' + label + '  =>  ' + JSON.stringify(actual) + (pass ? '' : '  (expected ' + JSON.stringify(expected) + ')'));
  if (!pass) failures++;
}

require(path.join(__dirname, '..', 'so-lop-core.js'));
var L = globalThis.EduSoLop;
var ID = '1HVdviD5EHW42ervRU7pRc5lpR7gFPzeI43OAgo00wLY';

// ── Link ──
assertEq('nhiều link, bỏ trùng, bỏ link thư mục', L.parseLinks('https://docs.google.com/spreadsheets/d/' + ID + '/edit?usp=drive_web\nhttps://drive.google.com/drive/folders/1M287dBpRyRaDCtcs4V6ZEzcc1rI4lYd7\nhttps://docs.google.com/spreadsheets/d/' + ID + '/edit#gid=1'), [ID]);
assertEq('không có link', L.parseLinks('xin chào'), []);

// ── Tab từ /htmlview ──
var html = '<title>FORM QUẢN LÝ LỚP 3 - Google Drive</title><script>items.push({name: "C\\u00d4NG C\\u1ee4 \\u00d4N T\\u1eacP", pageUrl: "x?headers\\x3dtrue&gid=974130425", gid: "974130425",initialSheet: ("974130425" == gid)});'
  + 'items.push({name: "BÁO GIẢNG", pageUrl: "x", gid: "288894",initialSheet: false});items.push({name: "3A1", pageUrl: "x", gid: "278529434",initialSheet: false});'
  + 'items.push({name: "4/11", pageUrl: "x", gid: "5",initialSheet: false});</script>';
var info = L.parseTabs(html);
assertEq('tên file', info.title, 'FORM QUẢN LÝ LỚP 3');
assertEq('đủ tab + giải mã \\u', info.tabs.map(function (t) { return t.name + '#' + t.gid; }), ['CÔNG CỤ ÔN TẬP#974130425', 'BÁO GIẢNG#288894', '3A1#278529434', '4/11#5']);
assertEq('chỉ giữ tab lớp', info.tabs.filter(function (t) { return L.isClassTab(t.name); }).map(function (t) { return t.name; }), ['3A1', '4/11']);

// ── CSV ──
assertEq('CSV có ngoặc kép, xuống dòng trong ô, dấu phẩy', L.parseCSV('a,"b, c","d\n""e"""\r\n1,,3'), [['a', 'b, c', 'd\n"e"'], ['1', '', '3']]);

// ── Bảng lớp (giống mẫu FORM QUẢN LÝ LỚP: nhãn ở cột E, tiết từ cột F) ──
function row(cells) { var r = []; Object.keys(cells).forEach(function (k) { r[+k] = cells[k]; }); for (var i = 0; i < 12; i++) if (r[i] == null) r[i] = ''; return r; }
var rows = [
  row({ 0: 'TRƯỜNG', 1: 'TIH PHONG PHÚ 2' }),
  row({ 0: 'LỚP:', 1: '3A3', 4: 'GV không điền vào khu vực màu xanh' }),
  row({ 0: 'SĨ SỐ:', 1: '4' }),
  row({}),
  row({ 0: 'MÃ SỐ HS', 1: 'HỌ & TÊN ', 2: 'NGÀY SINH', 3: 'GHI CHÚ', 4: 'TIẾT', 5: '1', 6: '2', 7: '3', 8: '4', 9: '5' }),
  row({ 4: 'THỨ', 5: 'Thứ 3', 6: 'Thứ 4', 7: 'Thứ 3' }),
  row({ 4: 'NGÀY', 5: '06.10', 6: '07.10', 7: '13.10' }),
  row({ 4: 'TÊN GV Nguyễn Hoài Bảo' }),
  row({ 4: 'BÀI DẠY', 5: 'Giới thiệu', 6: 'Bài 1', 7: 'Bài 2', 8: 'Bài 3', 9: 'Ôn tập CĐ1' }),
  row({ 4: 'ĐÃ HOÀN THÀNH', 5: 'TRUE', 6: 'TRUE', 7: 'TRUE', 8: 'FALSE', 9: 'FALSE' }),
  row({ 0: 'IC3 - 1', 1: 'Đặng Minh Anh', 2: '05/11/2018', 5: 'x', 6: 'X', 7: 'v' }),
  row({ 0: 'IC3 - 2', 1: 'Hoàng Trâm Anh', 5: 'v', 6: 'v', 7: 'x' }),
  row({ 0: 'IC3 - 3', 1: '' }),
  row({ 0: 'IC3 - 4', 1: 'Phạm Chi', 5: 'x', 6: 'NL', 7: 'nl' }),
  row({ 0: 'IC3 - 5', 1: 'Lê Mới', 7: 'Mới' }),
];
var c = L.parseClass(rows);
assertEq('trường/lớp/sĩ số/GV', [c.school, c.cls, c.size, c.teacher], ['TIH PHONG PHÚ 2', '3A3', 4, 'Nguyễn Hoài Bảo']);
assertEq('buổi: tiết, ngày, bài, đã hoàn thành', c.sessions.map(function (s) { return [s.tiet, s.ngay, s.bai, s.done]; }),
  [[1, '06.10', 'Giới thiệu', true], [2, '07.10', 'Bài 1', true], [3, '13.10', 'Bài 2', true], [4, '', 'Bài 3', false], [5, '', 'Ôn tập CĐ1', false]]);
assertEq('học sinh: bỏ dòng mã trống tên, giữ số dòng trên Sheet', c.students.map(function (s) { return s.name + '@' + s.row; }), ['Đặng Minh Anh@10', 'Hoàng Trâm Anh@11', 'Phạm Chi@13', 'Lê Mới@14']);
assertEq('ký hiệu X/V/NL/Mới', [c.students[0].marks, c.students[2].marks, c.students[3].marks], [{ 5: 'x', 6: 'x', 7: 'v' }, { 5: 'x', 6: 'nl', 7: 'nl' }, { 7: 'moi' }]);
assertEq('tab không đúng mẫu → null', L.parseClass([['a', 'b'], ['c']]), null);

assertEq('tiết tiếp theo', L.nextSession(c.sessions).tiet, 4);
assertEq('buổi hôm nay theo NGÀY dd.mm', L.todaySession(c.sessions, new Date(2026, 9, 13)).tiet, 3);
assertEq('không dạy hôm nay', L.todaySession(c.sessions, new Date(2026, 9, 28)), null);

var st = L.stats(c);
assertEq('chuyên cần từng bạn', st.students.map(function (x) { return [x.name, x.vang, x.lien, x.nl]; }),
  [['Đặng Minh Anh', 1, 1, false], ['Hoàng Trâm Anh', 2, 0, false], ['Phạm Chi', 0, 0, true], ['Lê Mới', 0, 0, false]]);
assertEq('từng buổi có mặt/vắng', st.sessions, [{ col: 5, comat: 2, vang: 1 }, { col: 6, comat: 1, vang: 1 }, { col: 7, comat: 2, vang: 1 }]);

// ── Dán vào Sheet ──
assertEq('cột dán: đúng thứ tự dòng, dòng trống giữ trống, ký hiệu như Sheet', L.pasteText(c.students, { 10: 'x', 11: 'v', 13: 'nl', 14: 'moi' }), 'x\nV'.replace('V', 'v') + '\n\nNL\nMới');
assertEq('ô đầu tiên của tiết 8 (cột M, dòng 11)', L.cellRef(12, 10), 'M11');
assertEq('tên cột sau Z', [L.colName(25), L.colName(26), L.colName(27)], ['Z', 'AA', 'AB']);
// ── Bài dạy: mỗi điều phối ghi 1 kiểu ──
function bai(t) { return L.lessonOf(t).bai; }
assertEq('Bài N / có tên sau', [bai('Bài 7'), bai('Bài 12: Tìm kiếm thông tin')], [[7], [12]]);
assertEq('nhiều bài 1 tiết', [bai('Bài 4-5'), bai('Bài 4 + 5'), bai('Bài 5+6'), bai('Bài 10+11'), bai('Giới Thiệu + Bài 1'), bai('Bài 7 và 8')], [[4, 5], [4, 5], [5, 6], [10, 11], [1], [7, 8]]);
assertEq('ôn tập / giới thiệu', [L.lessonOf('Ôn  tập CD1'), L.lessonOf('Giới thiệu IC3')], [{ bai: [], review: true }, { bai: [], review: false }]);
var names = { 1: { name: 'Bài 1. Tìm hiểu phần cứng cơ bản của máy tính' }, 2: { name: 'Bài 2. Các thiết bị nhập xuất cơ bản' }, 3: { name: 'Bài 3. Tìm hiểu các loại máy tính' },
  10: { name: 'Bài 10. Làm quen với trình duyệt Web' }, 11: { name: 'Bài 11. Các trình duyệt Web phổ biến' } };
assertEq('chỉ ghi tên bài → khớp bộ Bài N', [L.matchName('Tìm hiểu cơ bản về phần cứng', names), L.matchName('Tìm hiểu các loại máy tính', names)], [1, 3]);
assertEq('tên trùng 2 bài → lấy bài ngay sau bài vừa dạy', [L.matchName('Trình duyệt web', names, 9), L.matchName('Trình duyệt Web', names, 10)], [10, 11]);
assertEq('không khớp đủ → 0', L.matchName('Thực hành tự do', names), 0);
assertEq('bài từng tiết theo thứ tự', L.lessonsOf([{ bai: 'Giới thiệu IC3' }, { bai: 'Phần cứng cơ bản máy tính' }, { bai: 'Trình duyệt Web' }, { bai: 'Trình duyệt Web' }, { bai: 'Ôn tập CĐ1' }], names).map(function (l) { return l.bai.join('+') || (l.review ? 'ôn' : '-'); }), ['-', '1', '10', '11', 'ôn']);

// ── Nhiều trường: dán "Trường: link" ──
var paste = L.parsePaste([
  'THCS Mạch Kiếm Hùng: https://drive.google.com/drive/folders/1Uc0dOqdSkcKYLQmQNY4EtMdnx6c13jIK?usp=drive_link', '',
  'TiH Nguyễn Trung Ngạn: https://docs.google.com/spreadsheets/d/1hGjwzUXYAjtsbkhnBsyAaOSuxjQgq0Rmmv5x--Vf5Ec/edit?gid=476747990#gid=476747990', '',
  'THCS Huỳnh Tấn Phát: ', 'https://docs.google.com/spreadsheets/d/1gBNUWH0GfDjTTYHgxUWTZoOacf1K4C59EkB-wie-VSA/edit?gid=94017467#gid=94017467',
  'https://docs.google.com/spreadsheets/d/' + ID + '/edit'].join('\n'));
assertEq('link Sheet kèm tên trường (cùng dòng / dòng trên / không nhãn)', paste.sheets.map(function (x) { return x.label; }), ['TiH Nguyễn Trung Ngạn', 'THCS Huỳnh Tấn Phát', '']);
assertEq('link thư mục kèm tên trường', paste.folders.map(function (x) { return [x.id, x.label]; }), [['1Uc0dOqdSkcKYLQmQNY4EtMdnx6c13jIK', 'THCS Mạch Kiếm Hùng']]);

// ── 2 tiết/buổi, GV từng tiết, tóm tắt ──
var two = [
  { col: 5, tiet: 1, ngay: '07.09', bai: 'Bài 1', done: true, gv: 'Nguyễn Hoài Bảo' }, { col: 6, tiet: 2, ngay: '07.09', bai: 'Bài 2', done: true, gv: 'Nguyễn Hoài Bảo' },
  { col: 7, tiet: 3, ngay: '14.09', bai: 'Bài 3', done: true, gv: 'Trần Minh Đức' }, { col: 8, tiet: 4, ngay: '14.09', bai: 'Bài 4', done: true, gv: 'Trần Minh Đức' },
  { col: 9, tiet: 5, ngay: '', bai: '', done: false, gv: '' }, { col: 10, tiet: 6, ngay: '', bai: '', done: false, gv: '' }, { col: 11, tiet: 7, ngay: '', bai: '', done: false, gv: '' },
];
var cls2 = { teacher: '', sessions: two, students: [] };
assertEq('2 tiết/buổi', L.perDay(two), 2);
assertEq('buổi tới chưa ghi ngày → nhóm 2 tiết', L.sessionGroup(two, two[4]).map(function (s) { return s.tiet; }), [5, 6]);
assertEq('buổi đã có ngày → các tiết cùng ngày', L.sessionGroup(two, two[2]).map(function (s) { return s.tiet; }), [3, 4]);
var sm = L.summary(cls2, null, new Date(2026, 9, 28));
assertEq('tóm tắt: đã dạy, tiết tiếp, đoán bài, thứ học', [sm.done, sm.next.tiet, sm.nextLesson.bai, sm.guess, sm.daysText], [4, 5, [5], true, 'Thứ 2']);
assertEq('chưa xếp bài tiếp → mẫu số là số cột tiết (không báo 100%)', [sm.planned, sm.total], [4, 7]);
assertEq('ngày trong năm học: tháng 9 năm nay, tháng 2 năm sau', [L.dateOf('07.09', new Date(2026, 9, 28)).getFullYear(), L.dateOf('10.02', new Date(2026, 9, 28)).getFullYear(), L.dateOf('10.02', new Date(2027, 1, 1)).getFullYear()], [2026, 2027, 2027]);
assertEq('lớp có tôi dạy (theo GV từng tiết, bỏ dấu cách thừa)', [L.isMine(cls2, 'trần minh  đức'), L.isMine(cls2, 'Hoàng Lực'), L.isMine({ teacher: 'Nguyễn Hoài Bảo', sessions: [] }, 'Nguyễn Hoài Bảo')], [true, false, true]);
assertEq('dán 2 cột cùng buổi (Tab)', L.pasteText(c.students.slice(0, 2), { 10: 'x', 11: 'v' }, 2), ['x\tx', 'v\tv'].join('\n'));
assertEq('ô ghi chữ khác (số phòng) không tính là điểm danh', [L.mark('226-230'), L.mark('#N/A')], ['?', '']);

// ── Giáo viên & lịch giảng dạy ──
var gvRows = rows.map(function (r) { return r.slice(); });
gvRows[7][4] = 'TÊN GV: Nguyễn Văn Hùng';
assertEq('ô GV "TÊN GV: tên" bỏ dấu hai chấm', L.parseClass(gvRows).teacher, 'Nguyễn Văn Hùng');
gvRows[7][4] = 'TÊN GV (Tên lót + Tên)'; gvRows[7][5] = 'Trần Minh Đức'; gvRows[7][6] = 'Trường nghỉ'; gvRows[7][7] = 'Huỳnh Thị  Kim hằng';
var rot = L.parseClass(gvRows);
assertEq('GV từng tiết; "Trường nghỉ" không phải GV', rot.sessions.slice(0, 3).map(function (s) { return s.gv; }), ['Trần Minh Đức', '', 'Huỳnh Thị Kim hằng']);
var tOf = L.teachersOf(rot);
assertEq('danh sách GV gộp hoa thường/dấu cách', Object.keys(tOf).sort(), ['huỳnh thị kim hằng', 'trần minh đức']);
assertEq('tiết của 1 GV', L.taughtBy(rot, 'Huỳnh Thị Kim Hằng').map(function (s) { return s.tiet; }), [3]);
assertEq('GV chung của lớp nhận các tiết để trống', L.taughtBy({ teacher: 'An', sessions: [{ gv: '' }, { gv: 'Bình' }] }, 'an').length, 1);
assertEq('Thứ 2 của tuần (28/10/2026 là Thứ 4)', [L.mondayOf(new Date(2026, 9, 28)).getDate(), L.mondayOf(new Date(2026, 9, 28), 1).getDate(), L.mondayOf(new Date(2026, 10, 1)).getDate()], [26, 2, 26]);

// Lịch tuần 26/10–1/11, hôm nay Thứ 4 28/10. Lớp A: GV Bảo dạy Thứ 3 + Thứ 4; lớp B: GV khác.
function ses(col, ngay, done, gv, bai) { return { col: col, tiet: col - 4, ngay: ngay, bai: bai || 'Bài ' + (col - 4), done: done, gv: gv || '' }; }
var A = { cls: '3A1', teacher: 'Nguyễn Hoài Bảo', students: [], sessions: [ses(5, '13.10', true), ses(6, '14.10', true), ses(7, '20.10', true), ses(8, '21.10', true), ses(9, '27.10', true), ses(10, '', false, '', 'Bài 6')] };
var B = { cls: '3A2', teacher: 'Lê Hảo', students: [], sessions: [ses(5, '15.10', true), ses(6, '22.10', true), ses(7, '', false)] };
var C = { cls: '6A1', teacher: '', students: [], sessions: [ses(5, '13.10', true, 'Nguyễn Hoài Bảo'), ses(6, '20.10', true, 'Trần Đức'), ses(7, '27.10', true, 'Trần Đức'), ses(8, '', false)] };
var input = [A, B, C].map(function (c, i) { return { key: 'k' + i, school: i < 2 ? 'PP2' : 'MKH', cls: c, sm: L.summary(c, null, new Date(2026, 9, 28)) }; });
var plan = L.weekPlan(input, 'nguyễn hoài bảo', L.mondayOf(new Date(2026, 9, 28)), new Date(2026, 9, 28));
assertEq('lịch tuần của GV: đã dạy Thứ 3, dự kiến Thứ 4 (kèm tiết tới); không có lớp GV khác; lớp luân phiên hôm đó GV khác dạy thì không báo thiếu',
  plan.map(function (e) { return [L.THU[e.date.getDay()], e.cls.cls, e.kind, e.sessions.map(function (s) { return s.tiet; }).join(',')]; }),
  [['Thứ 3', '3A1', 'done', '5'], ['Thứ 4', '3A1', 'expected', '6']]);
var plan2 = L.weekPlan(input, 'Nguyễn Hoài Bảo', L.mondayOf(new Date(2026, 9, 30)), new Date(2026, 9, 30));
assertEq('ngày thường dạy đã qua mà Sheet chưa có buổi → nhắc', plan2.filter(function (e) { return e.kind === 'missing'; }).map(function (e) { return L.THU[e.date.getDay()]; }), ['Thứ 4']);
var D = { cls: '3A6', teacher: 'Bảo', students: [], sessions: [ses(5, '15.10', true), ses(6, '16.10', true), ses(7, '22.10', true), ses(8, '23.10', true), ses(9, '', false), ses(10, '', false), ses(11, '', false)] };
var planD = L.weekPlan([{ key: 'd', school: 'PP2', cls: D, sm: L.summary(D, null, new Date(2026, 9, 28)) }], 'Bảo', L.mondayOf(new Date(2026, 9, 28)), new Date(2026, 9, 28));
assertEq('2 buổi dự kiến trong tuần nhận lần lượt tiết tiếp theo', planD.map(function (e) { return L.THU[e.date.getDay()] + ':' + e.sessions.map(function (s) { return s.tiet; }).join(','); }), ['Thứ 5:5', 'Thứ 6:6']);
assertEq('số tiết đã dạy trong tháng theo trường', [L.monthCount(input, 'Nguyễn Hoài Bảo', 2026, 9), L.monthCount(input, 'Trần Đức', 2026, 9)], [{ PP2: 5, MKH: 1 }, { MKH: 2 }]);
var log = L.monthLog(input, 'Nguyễn Hoài Bảo', 2026, 9);
assertEq('bảng công tháng: từng tiết đã dạy theo ngày, cùng ngày xếp theo trường', log.map(function (e) { return e.date.getDate() + ' ' + e.cls + ' T' + e.tiet; }), ['13 6A1 T1', '13 3A1 T1', '14 3A1 T2', '20 3A1 T3', '21 3A1 T4', '27 3A1 T5']);
var W = { sessions: [{ col: 1 }, { col: 2 }, { col: 3 }, { col: 4 }], students: [
  { name: 'An', marks: { 1: 'v', 2: 'x', 3: 'v', 4: 'v' } }, { name: 'Bình', marks: { 1: 'x', 2: 'x', 3: 'v', 4: 'v' } },
  { name: 'Chi', marks: { 1: 'v', 2: 'x', 3: 'x', 4: 'x' } }, { name: 'Dũng', marks: { 1: 'v', 2: 'v', 3: 'nl', 4: 'nl' } }] };
var U = { cls: '3A9', teacher: 'Bảo', students: [], sessions: [ses(5, '20.10', true), ses(6, '26.10', false), ses(7, '26.10', false), ses(8, '28.10', false), ses(9, '01.09', false)] };
assertEq('tiết đã qua chưa tick Hoàn thành: gộp theo ngày, bỏ hôm nay và quá 30 ngày',
  L.untickedSessions([{ key: 'u', school: 'PP2', cls: U }], 'Bảo', new Date(2026, 9, 28)).map(function (e) { return e.date.getDate() + ':' + e.sessions.map(function (s) { return s.tiet; }).join(','); }), ['26:2,3']);
assertEq('học sinh cần chú ý: vắng ≥3 hoặc 2 tiết liền, bỏ bạn đã nghỉ luôn', L.watchList(W).map(function (x) { return x.name; }), ['An', 'Bình']);

console.log(failures ? failures + ' FAIL' : 'Tất cả PASS');
process.exit(failures ? 1 : 0);
