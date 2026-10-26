/* Test tìm câu na ná nhau trong đề (js/services/question-similarity.js).
   Chạy: node js/services/__tests__/question-similarity.test.js — thuần, không mạng. */
var path = require('path');
var failures = 0;
function assertEq(label, actual, expected) {
  var pass = JSON.stringify(actual) === JSON.stringify(expected);
  console.log((pass ? 'PASS' : 'FAIL') + '  ' + label + (pass ? '' : '  =>  ' + JSON.stringify(actual) + '  (expected ' + JSON.stringify(expected) + ')'));
  if (!pass) failures++;
}
var S = require(path.join(__dirname, '..', 'question-similarity.js'));

// 4 biến thể thật trong IC3 LV1 · 7. An toàn và bảo mật (khác uid, khác đáp án)
var privacy = [
  { q: 'Đâu là lợi ích của việc duyệt Web “ở chế độ riêng tư" hoặc “ẩn danh”?', body: 'Những người khác sẽ không biết được các hoạt động duyệt web của bạn dù sử dụng cùng một thiết bị. Trình duyệt web của bạn không lưu giữ cookie.' },
  { q: 'Lợi ích của việc duyệt Web “chế độ riêng tư" hoặc “ẩn danh”?', body: 'Trình duyệt web của bạn không lưu giữ cookie. Không thể sử dụng vân tay kỹ thuật số để theo dõi các hoạt động trên trình duyệt của bạn.' },
  { q: 'Đâu là lợi ích của việc duyệt web "ở chế độ riêng tư"("in private") hoặc "ẩn danh" ("incognito")?', body: 'Trình duyệt sẽ không lưu giữ cookie, lịch sử duyệt web, hoặc dữ liệu biểu mẫu sau khi bạn đóng cửa sổ.' },
  { q: 'Lợi ích của việc duyệt web ở chế độ “riêng tư” hoặc “ẩn danh” là gì?', body: 'Trình duyệt web của bạn cho phép bạn thay đổi địa chỉ IP của mình. Trình duyệt web của bạn ẩn các hoạt động khỏi những người khác sử dụng cùng thiết bị.' },
];
var other = { q: 'Đâu là cách tốt nhất để tạo mật khẩu an toàn?', body: 'Sử dụng tên và ngày sinh của bạn. Sử dụng kết hợp chữ, số và ký hiệu.' };
assertEq('4 biến thể "duyệt web riêng tư" vào 1 nhóm, câu mật khẩu đứng riêng',
  S.groups([privacy[0], other, privacy[1], privacy[2], privacy[3]]), [[0, 2, 3, 4]]);

// Câu mở đầu chung nhưng hỏi chuyện khác → không tính là na ná
assertEq('"Ghép nối đúng ý nghĩa các thuật ngữ sau" với thuật ngữ khác nhau → không nhóm', S.groups([
  { q: 'Ghép nối đúng ý nghĩa của các thuật ngữ sau.', body: 'Phần cứng Thiết bị vật lý Phần mềm Chương trình máy tính' },
  { q: 'Ghép nối đúng ý nghĩa của các thuật ngữ sau.', body: 'Băng thông Lượng dữ liệu truyền LAN Mạng cục bộ' },
]), []);
assertEq('"Với mỗi câu phát biểu…" khác chủ đề → không nhóm', S.groups([
  { q: 'Với mỗi câu phát biểu về sự khác biệt giữa mạng có dây và không dây, hãy chọn Đúng hoặc Sai.', body: 'Mạng có dây ổn định hơn. Wi-Fi dùng sóng vô tuyến.' },
  { q: 'Với mỗi câu phát biểu về sự khác biệt giữa Internet và Intranet, hãy chọn phát biểu Đúng.', body: 'Intranet chỉ dùng trong nội bộ tổ chức. Internet là mạng toàn cầu.' },
]), []);

// Cùng câu hỏi, cùng đáp án (2 bản trùng hẳn) — kể cả có thẻ HTML
assertEq('trùng hẳn, khác thẻ HTML → 1 nhóm', S.groups([
  { q: '<b>Các trang web</b> sử dụng hai phương pháp nào để theo dõi thói quen duyệt web? (Chọn 2)', body: 'Cookie của bên thứ nhất. Cookie của bên thứ ba.' },
  { q: 'Các trang web sử dụng hai phương pháp nào để theo dõi thói quen duyệt web? (Chọn 2)', body: 'Cookie của bên thứ nhất. Vị trí GPS.' },
]), [[0, 1]]);

// Câu Đúng/Sai tự soạn (không có đáp án) — chỉ xét câu hỏi
assertEq('Đúng/Sai không đáp án, cùng câu → nhóm', S.groups([{ q: 'Mật khẩu nên dài ít nhất 8 ký tự.', body: '' }, { q: 'Mật khẩu nên dài ít nhất 8 ký tự', body: '' }]), [[0, 1]]);
assertEq('câu trống không nhóm với nhau', S.groups([{ q: '', body: '' }, { q: '', body: '' }]), []);

// bodyText: lấy chữ đáp án/mệnh đề, bỏ lời giải + câu hỏi + uid
assertEq('bodyText bỏ question/explanation/uid', S.bodyText({ uid: 'x1', question: 'Hỏi?', explanation: 'Giải', options: ['A1', 'B1'], statements: [{ text: 'Mệnh đề', correct: true }] }), 'A1 B1 Mệnh đề');

// matcher: chọn câu thay thế không na ná câu đã có trong đề
var has = S.matcher([privacy[0], other]);
assertEq('matcher: biến thể "riêng tư" → na ná', has(privacy[3]), true);
assertEq('matcher: câu khác hẳn → không', has({ q: 'Phần mềm diệt virus dùng để làm gì?', body: 'Phát hiện và loại bỏ mã độc.' }), false);
assertEq('matcher: đề rỗng → không', S.matcher([])(privacy[0]), false);

if (failures) { console.log('\n' + failures + ' FAIL'); process.exit(1); }
console.log('\nTất cả PASS');
