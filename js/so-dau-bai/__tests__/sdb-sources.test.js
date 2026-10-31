/* Test js/so-dau-bai/sdb-sources.js — lấy lớp/học sinh có sẵn cho Sổ đầu bài, gửi tiết hôm nay sang Gọi tên.
   Chạy: node js/so-dau-bai/__tests__/sdb-sources.test.js — dữ liệu giả, không gọi mạng. */
var path = require('path');

var failures = 0;
function assertEq(label, actual, expected) {
  var pass = JSON.stringify(actual) === JSON.stringify(expected);
  console.log((pass ? 'PASS' : 'FAIL') + '  ' + label + '  =>  ' + JSON.stringify(actual) + (pass ? '' : '  (expected ' + JSON.stringify(expected) + ')'));
  if (!pass) failures++;
}

require(path.join(__dirname, '..', '..', 'so-lop', 'so-lop-core.js'));
require(path.join(__dirname, '..', 'sdb-sources.js'));
var L = globalThis.EduSoLop;
var X = globalThis.EduSdbSources;

// ── Tên lớp, tên trường ──
assertEq('3A1 → 3.1', X.normClass('3A1'), '3.1');
assertEq('3/11 → 3.11', X.normClass('3/11'), '3.11');
assertEq('8A10 → 8.10', X.normClass(' 8a10 '), '8.10');
assertEq('cùng trường khác cách viết', X.sameSchool('TRƯỜNG TIỂU HỌC PHONG PHÚ 2', 'TIH PHONG PHÚ 2'), true);
assertEq('THCS bỏ tiền tố', X.schoolKey('THCS Mạch Kiếm Hùng'), 'mạch kiếm hùng');
assertEq('khác trường', X.sameSchool('TiH Phong Phú 2', 'TiH Phong Phú 1'), false);
assertEq('tên rỗng không khớp', X.sameSchool('', ''), false);

// ── data/roster/students-active.json ──
var roster = { students: [
  { school: 'TIH PHONG PHÚ 2', className: '3A2', name: 'Trần Thị B' },
  { school: 'TIH PHONG PHÚ 2', className: '3A1', name: 'Nguyễn Văn A' },
  { school: 'TIH PHONG PHÚ 2', className: '3A1', name: 'Nguyễn Văn A' },
  { school: 'TIH PHONG PHÚ 2', className: '3A1', name: 'Lê Văn C' },
  { school: 'TIH PHONG PHÚ 2', className: 'Khối 3', name: 'Bỏ Qua' },
  { school: 'THCS Mạch Kiếm Hùng', className: '6A1', name: 'Phạm D' },
] };
var fr = X.fromRoster(roster);
assertEq('roster: gom theo lớp, bỏ trùng tên, bỏ lớp không đúng dạng', fr.map(function (c) { return [c.school, c.cls, c.key, c.students.length]; }),
  [['TIH PHONG PHÚ 2', '3A2', '3.2', 1], ['TIH PHONG PHÚ 2', '3A1', '3.1', 2], ['THCS Mạch Kiếm Hùng', '6A1', '6.1', 1]]);
var grp = X.groupBySchool(fr);
assertEq('nhóm theo trường, lớp xếp theo số', grp.map(function (g) { return [g.school, g.classes.map(function (c) { return c.key; })]; }),
  [['THCS Mạch Kiếm Hùng', ['6.1']], ['TIH PHONG PHÚ 2', ['3.1', '3.2']]]);

// ── Sổ lớp Điều phối (CSV đã lưu ở trang Điểm danh) ──
function csv(rows) { return rows.map(function (r) { return r.map(function (c) { return '"' + c + '"'; }).join(','); }).join('\n'); }
// Giống mẫu FORM QUẢN LÝ LỚP: nhãn ở cột E, tiết từ cột F, tiêu đề HỌ & TÊN cùng dòng TIẾT
var tab = csv([
  ['TRƯỜNG', 'TiH Phong Phú 2', '', '', '', '', ''],
  ['LỚP:', '3A1', '', '', '', '', ''],
  ['MÃ SỐ HS', 'HỌ & TÊN', 'NGÀY SINH', 'GHI CHÚ', 'TIẾT', '1', '2'],
  ['', '', '', '', 'BÀI DẠY', 'Bài 1', 'Bài 2'],
  ['', '', '', '', 'ĐÃ HOÀN THÀNH', 'TRUE', 'FALSE'],
  ['HS01', 'Nguyễn Văn A', '01/02/2018', '', '', 'x', 'x'],
  ['HS02', 'Lê Văn C', '03/04/2018', '', '', 'x', 'NL'],
  ['HS03', 'Đỗ Thị E', '05/06/2018', '', '', 'v', 'x'],
]);
var store = { cache: { 'old|1': { at: 1, csv: tab.replace('Đỗ Thị E', 'Đỗ Thị Cũ') }, 'new|1': { at: 2, csv: tab }, 'bad|2': { at: 3, csv: 'rác' } } };
var fs = X.fromSoLop(store, L);
assertEq('sổ lớp: 1 lớp, bản mới nhất, bỏ học sinh NL', fs.map(function (c) { return [c.school, c.key, c.students.map(function (s) { return s.name; })]; }),
  [['TiH Phong Phú 2', '3.1', ['Nguyễn Văn A', 'Đỗ Thị E']]]);
assertEq('sổ lớp: có mã HS + ngày sinh', fs[0].students[0], { code: 'HS01', name: 'Nguyễn Văn A', dob: '01/02/2018' });
assertEq('sổ lớp trống', X.fromSoLop({}, L), []);
assertEq('2 nguồn cùng trường khác tên gộp 1 nhóm', X.groupBySchool(fs.concat(fr.slice(0, 2))).map(function (g) { return [g.school, g.classes.length]; }), [['TiH Phong Phú 2', 2]]);

// ── Điểm danh 1 lần: vắng của lớp trong ngày từ sổ lớp đã đọc ──
var att = csv([
  ['TRƯỜNG', 'TIH PHONG PHÚ 2', '', '', '', '', '', ''],
  ['LỚP:', '3A1', '', '', '', '', '', ''],
  ['MÃ SỐ HS', 'HỌ & TÊN', 'NGÀY SINH', '', 'TIẾT', '1', '2', '3'],
  ['', '', '', '', 'NGÀY', '06.10', '13.10', '13.10'],
  ['', '', '', '', 'BÀI DẠY', 'Bài 1', 'Bài 2', 'Bài 3'],
  ['', '', '', '', 'ĐÃ HOÀN THÀNH', 'TRUE', 'TRUE', 'FALSE'],
  ['HS01', 'Nguyễn Văn A', '', '', '', 'v', 'x', 'x'],
  ['HS02', 'Lê Văn C', '', '', '', 'x', 'v', ''],
  ['HS03', 'Đỗ Thị E', '', '', '', 'x', 'x', 'v'],
  ['HS04', 'Phan Thị G', '', '', '', 'x', 'x', 'x'],
]);
var st2 = { cache: { 's|9': { at: 5, csv: att } }, drafts: { 's|9|6': { at: 6, marks: { 9: 'v', 7: 'x' } } } };
var a1 = X.attendanceOn(st2, L, { school: 'TRƯỜNG TIỂU HỌC PHONG PHÚ 2', cls: '3.1', date: new Date(2026, 9, 6) });
assertEq('1 tiết trong ngày', [a1.absent, a1.bai, a1.sessions, a1.at], [['Nguyễn Văn A'], ['Bài 1'], 1, 5]);
var a2 = X.attendanceOn(st2, L, { school: '', cls: '3A1', date: new Date(2026, 9, 13) });
assertEq('2 tiết cùng ngày gộp vắng; bản nháp tính trước Sheet', [a2.absent, a2.bai], [['Đỗ Thị E', 'Phan Thị G'], ['Bài 2', 'Bài 3']]);
assertEq('ngày không có tiết', X.attendanceOn(st2, L, { cls: '3.1', date: new Date(2026, 9, 7) }), null);
assertEq('khác trường', X.attendanceOn(st2, L, { school: 'TiH Võ Văn Tần', cls: '3.1', date: new Date(2026, 9, 6) }), null);
assertEq('khác lớp', X.attendanceOn(st2, L, { cls: '3.2', date: new Date(2026, 9, 6) }), null);

// ── Ghép danh sách ──
var old = [{ code: 'HS01', name: 'Nguyễn Văn A', dob: '01/02/2018' }, { code: '', name: 'Học Sinh Cũ', dob: '' }];
var m = X.mergeStudents(old, [{ code: '', name: 'nguyễn văn a', dob: '' }, { code: '', name: 'Bạn Mới', dob: '' }]);
assertEq('giữ mã + ngày sinh cũ khi nguồn thiếu', m.list[0], { code: 'HS01', name: 'nguyễn văn a', dob: '01/02/2018' });
assertEq('đếm thêm/bớt', [m.added, m.removed], [1, ['Học Sinh Cũ']]);
assertEq('sổ chưa có lớp', X.mergeStudents(undefined, [{ name: 'A B' }]).added, 1);

// ── Tiết PPCT của Gọi tên theo tên bài trong sổ ──
var periods = [{ tiet: 1, items: ['Bài 1'] }, { tiet: 2, items: ['Bài 1'] }, { tiet: 9, items: ['Bài 9'] }, { tiet: 10, items: ['Ôn tập 1'] }];
assertEq('Bài 9: ... → tiết 9', X.tietForLesson(periods, 'Bài 9: Bắt nạt trực tuyến và ứng xử có trách nhiệm', L.lessonOf), 9);
assertEq('Bài 1 học 2 tiết → tiết đầu', X.tietForLesson(periods, 'Bài 1: Phần cứng', L.lessonOf), 1);
assertEq('tiết ôn tập → để Gọi tên tự gợi ý', X.tietForLesson(periods, 'Ôn tập 1', L.lessonOf), 0);
assertEq('không có PPCT', X.tietForLesson(undefined, 'Bài 3', L.lessonOf), 0);

// ── Khớp lớp với danh sách hệ thống ──
var hit = X.rosterHit(roster, 'TRƯỜNG TIỂU HỌC PHONG PHÚ 2', '3.1');
assertEq('khớp trường + lớp khác cách viết', hit, { school: 'TIH PHONG PHÚ 2', className: '3A1', names: ['Nguyễn Văn A', 'Nguyễn Văn A', 'Lê Văn C'] });
assertEq('không có lớp', X.rosterHit(roster, 'TIH PHONG PHÚ 2', '5.1'), null);
assertEq('trường khác', X.rosterHit(roster, 'TiH Võ Văn Tần', '3.1'), null);

// ── Gửi sang Gọi tên ──
var day = X.goitenDay(new Date(2026, 9, 5));
assertEq('ngày kiểu Gọi tên', day, '2026-10-5');
var g0 = { game: 'egg', absent: { 'paste': { day: 'x', names: ['Cũ'] } }, called: { k: [] } };
var r1 = X.goitenPatch(g0, { names: [], absent: ['nguyễn văn a', 'Không Có'], hit: hit, tiet: 9, level: 'Spark__LV1', day: day });
assertEq('lớp hệ thống: chọn đúng lớp', [r1.g.src, r1.g.school, r1.g.cls, r1.key], ['class', 'TIH PHONG PHÚ 2', '3A1', 'class:TIH PHONG PHÚ 2|3A1']);
assertEq('vắng khớp tên (không phân biệt hoa thường)', [r1.g.absent[r1.key], r1.absent, r1.miss], [{ day: day, names: ['Nguyễn Văn A'] }, 1, 1]);
assertEq('lớp hệ thống: cấp độ auto', r1.g.lesson[r1.key], { lv: 'auto', tiet: 9, day: day });
assertEq('giữ cài đặt khác + không sửa bản gốc', [r1.g.game, r1.g.absent.paste.day, g0.absent[r1.key]], ['egg', 'x', undefined]);
var r2 = X.goitenPatch({}, { names: ['A B', 'C D'], absent: ['C D'], hit: null, tiet: 0, level: 'Spark__LV1', day: day });
assertEq('không khớp hệ thống → dán danh sách của sổ', [r2.g.src, r2.g.paste, r2.key, r2.g.absent.paste.names], ['paste', 'A B\nC D', 'paste', ['C D']]);
assertEq('không có tiết → không ghi câu hỏi', r2.g.lesson.paste, undefined);
var r3 = X.goitenPatch({}, { names: ['A B'], absent: [], hit: null, tiet: 4, level: 'Spark__LV2', day: day });
assertEq('danh sách dán ghi rõ cấp độ', r3.g.lesson.paste, { lv: 'Spark__LV2', tiet: 4, day: day });

console.log(failures ? '\n' + failures + ' FAIL' : '\nTất cả PASS');
process.exit(failures ? 1 : 0);
