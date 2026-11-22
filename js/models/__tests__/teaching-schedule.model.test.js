/* Test js/models/teaching-schedule.model.js — gộp mã lớp "Lịch tuần" với "TKB lớp".
   Chạy: node js/models/__tests__/teaching-schedule.model.test.js — hàm thuần, không gọi mạng. */
var path = require('path');

var failures = 0;
function assertEq(label, actual, expected) {
  var pass = JSON.stringify(actual) === JSON.stringify(expected);
  console.log((pass ? 'PASS' : 'FAIL') + '  ' + label + '  =>  ' + JSON.stringify(actual) + (pass ? '' : '  (expected ' + JSON.stringify(expected) + ')'));
  if (!pass) failures++;
}

globalThis.window = globalThis;
require(path.join(__dirname, '..', 'teaching-schedule.model.js'));
require(path.join(__dirname, '..', 'teaching-timetable.model.js'));
var M = globalThis.EduModels.TeachingSchedule;
var cellOf = globalThis.EduModels.TeachingTimetable.cellOf;
var cell = function (maLop) { return { maLop: maLop, truong: maLop ? 'THCS Lương Thế Vinh' : '' }; };

// Lỗi giáo viên báo: Thứ 3 sửa còn 2 tiết (tiết 4 6B6, tiết 5 6B4) nhưng Tổng quan vẫn hiện 3 tiết theo TKB cũ.
var sess = { type: 'Dạy chính', location: 'THCS Lương Thế Vinh', periods: ['', '', '', '6B6', '6B4'] };
var oldTkb = [cell(''), cell('6B6'), cell(''), cell('6B4'), cell('6B4')];
assertEq('Lịch tuần đã gõ lớp → tiết bỏ trống KHÔNG lấy lại từ TKB cũ', M.effectivePeriods(sess, oldTkb, cellOf), ['', '', '', '6B6', '6B4']);
assertEq('đếm đúng 2 tiết', M.effectivePeriods(sess, oldTkb, cellOf).filter(Boolean).length, 2);

assertEq('Lịch tuần chưa gõ lớp nào → dùng TKB', M.effectivePeriods({ type: 'Dạy chính', periods: ['', '', '', '', ''] }, oldTkb, cellOf), ['', '6B6', '', '6B4', '6B4']);
assertEq('buổi không có Lịch tuần → dùng TKB', M.effectivePeriods(undefined, [cell('5/1')], cellOf), ['5/1', '', '', '', '']);
assertEq('tiết thứ 6 chỉ có ở TKB vẫn giữ', M.effectivePeriods(sess, oldTkb.concat([cell('7A')]), cellOf), ['', '', '', '6B6', '6B4', '7A']);
assertEq('dữ liệu cũ dạng boolean true không tính là mã lớp', M.effectivePeriods({ periods: [true, '', '', '', ''] }, [cell('4.1')], cellOf), ['4.1', '', '', '', '']);
assertEq('TKB cũ dạng chuỗi thẳng vẫn đọc được', M.effectivePeriods(null, ['3K', ' 3G '], cellOf), ['3K', '3G', '', '', '']);
assertEq('cắt khoảng trắng mã lớp', M.effectivePeriods({ periods: [' 4.1 '] }, [], cellOf), ['4.1', '', '', '', '']);
assertEq('không có gì → 5 tiết trống', M.effectivePeriods(null, null, cellOf), ['', '', '', '', '']);
// Buổi nghỉ (Excel ghi "Nghỉ lễ"/"Nghỉ phép"/WFH...) không có mã lớp → KHÔNG lấy lớp TKB cũ
assertEq('Nghỉ lễ: bỏ lớp TKB cũ', M.effectivePeriods({ type: 'Nghỉ lễ', location: '', periods: ['', '', '', '', ''] }, [cell('4/6'), cell('3/3')], cellOf), ['', '', '', '', '']);
assertEq('WFH: bỏ lớp TKB cũ', M.effectivePeriods({ type: 'WFH', periods: [] }, ['4/6'], cellOf), ['', '', '', '', '']);
assertEq('isNonTeachingType', ['Nghỉ phép', 'Nghỉ phép/ lễ', 'Khám sức khỏe', 'Làm việc tại cty', 'Soạn bài', 'Dạy chính', 'Trợ Giảng', ''].map(M.isNonTeachingType), [true, true, true, true, true, false, false, false]);

console.log(failures ? '\n' + failures + ' FAIL' : '\nTất cả PASS');
process.exit(failures ? 1 : 0);
