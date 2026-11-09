/* Test hàm thuần của ô chọn sảnh (js/ui-select.js): tìm không dấu, chữ đầu, tô chữ khớp, ảnh chữ cái.
   Chạy: node js/services/__tests__/ui-select.test.js — không cần trình duyệt. */
var path = require('path');

var failures = 0;
function assertEq(label, actual, expected) {
  var pass = JSON.stringify(actual) === JSON.stringify(expected);
  console.log((pass ? 'PASS' : 'FAIL') + '  ' + label + '  =>  ' + JSON.stringify(actual) + (pass ? '' : '  (expected ' + JSON.stringify(expected) + ')'));
  if (!pass) failures++;
}

require(path.join(__dirname, '..', '..', 'ui-select.js'));
var S = globalThis.EduSmartSelect;

assertEq('bỏ dấu + đ', S.plain('  Đặng   Thị Ánh  '), 'dang thi anh');
assertEq('ảnh chữ cái: họ + tên', [S.initials('Nguyễn Văn An'), S.initials('Đào Hà My'), S.initials('Khoa'), S.initials('')], ['NA', 'ĐM', 'KH', '?']);

assertEq('ảnh chữ cái: bỏ phần lớp kèm theo', [S.initials('Đào Ngọc Hiếu · 3A1'), S.initials('Lê An (vắng)'), S.initials('Trần Bình - 4A2')], ['ĐH', 'LA', 'TB']);
assertEq('tìm không dấu',S.matches('Dương Vũ Anh Khoa', 'khoa'), true);
assertEq('tìm có dấu', S.matches('Dương Vũ Anh Khoa', 'Khoa'), true);
assertEq('tìm chữ đầu các từ', S.matches('Nguyễn Văn An', 'nva'), true);
assertEq('chữ đầu phải theo thứ tự', S.matches('Nguyễn Văn An', 'avn'), false);
assertEq('nhiều từ, đầu từ', S.matches('Lê Ngọc Hương Giang', 'le gia'), true);
assertEq('không khớp', S.matches('Lê Ngọc Hương Giang', 'minh'), false);
assertEq('ô tìm trống = mọi mục', S.matches('bất kỳ', '  '), true);
assertEq('tên trường viết hoa', S.matches('TIH PHONG PHÚ 2', 'phong phu'), true);
assertEq('lớp', S.matches('3A2', '3a'), true);

assertEq('tô chữ khớp, giữ dấu', S.highlight('Dương Vũ Anh Khoa', 'khoa'), 'Dương Vũ Anh <mark>Khoa</mark>');
assertEq('tô giữa từ có dấu', S.highlight('Huỳnh Khánh Đăng', 'khanh'), 'Huỳnh <mark>Khánh</mark> Đăng');
assertEq('tô từng từ khi gõ nhiều đầu từ', S.highlight('Lê Ngọc Hương Giang', 'le gia'), '<mark>Lê</mark> Ngọc Hương <mark>Gia</mark>ng');
assertEq('tên dạng dấu tách rời (NFD) vẫn tô đúng', S.highlight('Khánh'.normalize('NFD'), 'khanh'), '<mark>Khánh</mark>');
assertEq('chặn HTML', S.highlight('<b>An</b>', 'an'), '&lt;b&gt;<mark>An</mark>&lt;/b&gt;');
assertEq('không gõ gì: chỉ escape', S.highlight('A & B', ''), 'A &amp; B');

assertEq('bỏ gạch trang trí chữ nhắc', [S.cleanPlaceholder('-- Chọn lớp trước --'), S.cleanPlaceholder('— Chọn trường —'), S.cleanPlaceholder('Chưa có danh sách — liên hệ Điều phối')], ['Chọn lớp trước', 'Chọn trường', 'Chưa có danh sách — liên hệ Điều phối']);

console.log(failures ? '\n' + failures + ' test FAIL' : '\nTất cả PASS');
process.exit(failures ? 1 : 0);
