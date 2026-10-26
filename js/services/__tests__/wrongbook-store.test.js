/* Test js/services/wrongbook-store.js — Sổ tay câu sai dùng chung (Góc học tập + Đấu trường), hộp Leitner.
   Chạy: node js/services/__tests__/wrongbook-store.test.js — localStorage giả, không gọi mạng. */
var path = require('path');

var failures = 0;
function assertEq(label, actual, expected) {
  var pass = JSON.stringify(actual) === JSON.stringify(expected);
  console.log((pass ? 'PASS' : 'FAIL') + '  ' + label + '  =>  ' + JSON.stringify(actual) + (pass ? '' : '  (expected ' + JSON.stringify(expected) + ')'));
  if (!pass) failures++;
}

var mem = {};
globalThis.localStorage = { getItem: function (k) { return k in mem ? mem[k] : null; }, setItem: function (k, v) { mem[k] = String(v); } };
require(path.join(__dirname, '..', 'wrongbook-store.js'));
var W = globalThis.EduWrongbook;
var DAY = 864e5;

var q1 = { uid: 'ic3-1', type: 'single', question: 'Q1', options: ['a', 'b'], correct: ['a'], _tmp: 1 };
var q2 = { uid: 'ic3-2', type: 'truefalse', question: 'Q2', statements: [{ text: 's1', answer: 'true' }, { text: 's2', answer: 'false' }] };
var an = { name: 'Nguyễn An', cls: '6A1', school: 'THCS X' };
var key = W.keyOf(an.name, an.cls, an.school);

// ── Câu sai → hộp 1; bỏ trường tạm ──
var r = W.record(an, [{ q: q1, ok: false }, { q: q2, ok: true }], { src: 'Bài 1', now: 1000 });
assertEq('sai → ghi mới; đúng mà chưa có trong sổ → bỏ qua', [r.added, r.up, r.saved], [1, 0, true]);
var it = W.studentBook(key).items['u:ic3-1'];
assertEq('hộp 1, ôn ngay, bỏ trường "_"', [it.box, it.due, it.q._tmp, it.src], [1, 1000, undefined, 'Bài 1']);

// ── Góc học tập (hành vi cũ): đúng là lên hộp ngay, không cần tới hạn ──
W.record(an, [{ q: q1, ok: true }], { now: 2000 });
assertEq('đúng → hộp 2, hạn +1 ngày', [W.studentBook(key).items['u:ic3-1'].box, W.studentBook(key).items['u:ic3-1'].due], [2, 2000 + DAY]);

// ── Đấu trường (dueOnly): đúng khi CHƯA tới hạn → không lên hộp (không "cày" sổ bằng game) ──
r = W.record(an, [{ q: q1, ok: true }], { now: 3000, dueOnly: true });
assertEq('Đấu trường: chưa tới hạn → giữ hộp 2', [r.up, W.studentBook(key).items['u:ic3-1'].box], [0, 2]);
r = W.record(an, [{ q: q1, ok: true }], { now: 2000 + DAY, dueOnly: true });
assertEq('Đấu trường: tới hạn → lên hộp 3', [r.up, W.studentBook(key).items['u:ic3-1'].box], [1, 3]);

// ── 1 câu gốc tách nhiều ý (Đúng/Sai): sai 1 ý → ghi cả câu 1 lần; đúng 1 ý (partial) → không lên hộp ──
r = W.record(an, [{ q: q2, ok: false, partial: true }, { q: q2, ok: false, partial: true }], { now: 5000, dueOnly: true });
assertEq('sai 2 ý cùng câu gốc → ghi 1 mục', [r.added, Object.keys(W.studentBook(key).items).length], [1, 2]);
r = W.record(an, [{ q: q2, ok: true, partial: true }], { now: 9e12, dueOnly: true });
assertEq('đúng 1 ý → không lên hộp', [r.up, W.studentBook(key).items['u:ic3-2'].box], [0, 1]);

// ── Sai lại → về hộp 1 ──
r = W.record(an, [{ q: q1, ok: false }], { now: 6000 });
assertEq('sai lại câu đã có → về hộp 1, đếm sai', [r.again, W.studentBook(key).items['u:ic3-1'].box, W.studentBook(key).items['u:ic3-1'].wrong], [1, 1, 2]);

// ── Phiên ôn sổ tay (review): không thêm câu mới ──
r = W.record(an, [{ q: { question: 'Mới', options: ['x', 'y'], correct: ['x'] }, ok: false }], { review: true, now: 7000 });
assertEq('review: câu mới sai không được thêm', r.added, 0);

// ── Thuộc hẳn: hộp 4 + đúng → xoá khỏi sổ, cộng "đã thuộc" ──
var b = JSON.parse(mem[W.BOOK_KEY]); b[key].items['u:ic3-1'].box = 4; mem[W.BOOK_KEY] = JSON.stringify(b);
r = W.record(an, [{ q: q1, ok: true }], { now: 8000 });
assertEq('hộp 4 + đúng → thuộc hẳn, rời sổ', [r.mastered, !!W.studentBook(key).items['u:ic3-1'], W.studentBook(key).mastered], [1, false, 1]);

// ── Khoá câu không có uid: theo nội dung (phương án đã xếp → đổi thứ tự vẫn 1 mục) ──
assertEq('qKey: cùng nội dung → cùng khoá', W.qKey({ question: 'Z', options: ['a', 'b'] }), W.qKey({ question: 'Z', options: ['a', 'b'] }));
assertEq('qKey: đề tự soạn (custom__) → băm nội dung', W.qKey({ uid: 'custom__9', question: 'Z', options: ['a'] }).slice(0, 2), 'c:');

// ── Tìm học sinh theo họ tên: lấy lớp/trường từ lịch sử bài làm (mới nhất) ──
mem.eduquiz_records = JSON.stringify([
  { id: 100, studentName: 'Trần Bình', studentClass: '6A2', studentSchool: 'THCS X' },
  { id: 200, studentName: 'trần  bình', studentClass: '7A2', studentSchool: 'THCS X' },
]);
var f = W.findByName(' Trần Bình ');
assertEq('findByName: không phân biệt hoa/thường, dấu cách; lấy bản mới nhất', f && f.cls, '7A2');
assertEq('findByName: có sổ tay (chưa làm bài) cũng tìm được', W.findByName('nguyễn an').cls, '6A1');
assertEq('findByName: không có → null', W.findByName('Không Ai'), null);

// ── Giới hạn kích thước sổ ──
var many = [];
for (var i = 0; i < W.MAX_ITEMS + 30; i++) many.push({ q: { uid: 'm' + i, question: 'M' + i, options: ['a', 'b'], correct: ['a'] }, ok: false });
W.record({ name: 'Lê Chi' }, many, { now: 9000 });
assertEq('sổ không vượt MAX_ITEMS câu', Object.keys(W.studentBook(W.keyOf('Lê Chi')).items).length, W.MAX_ITEMS);

// ── Bộ nhớ đầy → báo không lưu được ──
var setItem = localStorage.setItem; localStorage.setItem = function () { throw new Error('QuotaExceeded'); };
assertEq('localStorage đầy → saved=false, không văng lỗi', W.record(an, [{ q: { uid: 'z', question: 'Z' }, ok: false }]).saved, false);
localStorage.setItem = setItem;

console.log(failures ? '\n' + failures + ' FAIL' : '\nTất cả PASS');
process.exit(failures ? 1 : 0);
