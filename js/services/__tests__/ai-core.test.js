/* Test js/services/ai-core.js — Trợ lý AI (dựng câu lệnh, đọc phản hồi Gemini, câu hỏi AI soạn, hiển thị an toàn).
   Chạy: node js/services/__tests__/ai-core.test.js — hàm thuần, không gọi mạng. */
var path = require('path');

var failures = 0;
function assertEq(label, actual, expected) {
  var pass = JSON.stringify(actual) === JSON.stringify(expected);
  console.log((pass ? 'PASS' : 'FAIL') + '  ' + label + (pass ? '' : '  =>  ' + JSON.stringify(actual) + '  (expected ' + JSON.stringify(expected) + ')'));
  if (!pass) failures++;
}
function throwsCode(fn) { try { fn(); return null; } catch (e) { return e.code || 'no-code'; } }

var C = require(path.join(__dirname, '..', 'ai-core.js'));

// ── Dựng câu lệnh ──
var ex = C.build('explain', { question: '  RAM là gì?\u0007 ', options: ['Bộ nhớ tạm', 'Ổ cứng'], correct: ['Bộ nhớ tạm'], chosen: 'Ổ cứng', grade: 7 });
assertEq('explain: chuẩn hoá (bỏ ký tự điều khiển, khoảng trắng)', [ex.payload.question, ex.payload.grade, ex.json], ['RAM là gì?', 7, false]);
assertEq('explain: câu lệnh có câu hỏi, phương án A/B, đáp án đúng và lựa chọn của em',
  ['Câu hỏi: RAM là gì?', 'A. Bộ nhớ tạm\nB. Ổ cứng', 'Đáp án đúng: Bộ nhớ tạm', 'Em đã chọn: Ổ cứng', 'lớp 7'].every(function (s) { return ex.user.indexOf(s) >= 0; }), true);
assertEq('explain: bỏ trống → ghi rõ', C.build('explain', { question: 'Q', correct: 'A' }).user.indexOf('Em đã chọn: (bỏ trống)') >= 0, true);
assertEq('explain: đáp án dạng nối cặp (đối tượng) → 1 dòng', C.build('explain', { question: 'Nối', correct: { CPU: 'xử lý', RAM: 'nhớ tạm' } }).payload.correct, 'CPU → xử lý; RAM → nhớ tạm');
assertEq('explain: thiếu đáp án đúng → invalid-argument', throwsCode(function () { C.build('explain', { question: 'Q' }); }), 'invalid-argument');
assertEq('việc lạ (kể cả tên thuộc tính của Object) → invalid-argument', [throwsCode(function () { C.build('chat', {}); }), throwsCode(function () { C.build('toString', {}); })], ['invalid-argument', 'invalid-argument']);
assertEq('lớp ngoài 3–12 → bỏ', C.build('quickQ', { topic: 'Bài 1', grade: 99 }).payload.grade, 0);
var gq = C.build('genQuiz', { topic: 'Phần cứng', count: 99, level: 'siêu khó', source: 'a\n\n\n\nb', mix: 1 });
assertEq('genQuiz: số câu tối đa 15, độ khó lạ → vừa, gộp dòng trống', [gq.payload.count, gq.payload.level, gq.payload.source, gq.json], [15, 'vừa', 'a\n\nb', true]);
assertEq('genQuiz: nội dung bài học dài bị cắt 6000 ký tự', C.build('genQuiz', { source: 'x'.repeat(9000) }).payload.source.length, 6000);
assertEq('genQuiz: cần chủ đề hoặc nội dung', throwsCode(function () { C.build('genQuiz', { count: 3 }); }), 'invalid-argument');
assertEq('reteach: số lượt sai + phạm vi vào câu lệnh', C.build('reteach', { question: 'Q', correct: 'A', wrong: 12, students: 9, scope: '8A1' }).user.indexOf('có 9 học sinh làm sai (12 lượt sai, phạm vi: 8A1)') >= 0, true);
assertEq('việc công khai / việc giáo viên', [C.PUBLIC_TASKS, C.STAFF_TASKS], [['explain', 'quickQ'], ['genQuiz', 'reteach']]);

// ── Gói / đọc REST Gemini ──
var body = C.requestBody(gq);
assertEq('requestBody: systemInstruction + JSON mode', [body.systemInstruction.parts[0].text === gq.system, body.generationConfig.responseMimeType, body.generationConfig.maxOutputTokens], [true, 'application/json', 8192]);
assertEq('requestBody: văn bản thường không ép JSON', 'responseMimeType' in C.requestBody(ex).generationConfig, false);
assertEq('extractText: bỏ phần "suy nghĩ" của model', C.extractText({ candidates: [{ content: { parts: [{ text: 'nghĩ...', thought: true }, { text: ' Kết quả ' }] }, finishReason: 'STOP' }] }), { text: 'Kết quả', finish: 'STOP' });
assertEq('extractText: bị chặn', C.extractText({ promptFeedback: { blockReason: 'SAFETY' } }), { text: '', finish: 'SAFETY' });
assertEq('classify: 429 / key sai / model / bận', [C.classify(429, ''), C.classify(400, '{"reason":"API_KEY_INVALID"}'), C.classify(403, ''), C.classify(404, ''), C.classify(503, '')], ['quota', 'key', 'key', 'model', 'busy']);

// ── Câu hỏi AI soạn ──
var raw = '```json\n[{"question":"RAM là?","options":["A. Bộ nhớ tạm","B. Ổ cứng","C. Màn hình","D. Chuột"],"correct":["A"],"explanation":"RAM mất dữ liệu khi tắt máy."},'
  + '{"question":"Chọn 2 thiết bị nhập","options":["Bàn phím","Chuột","Loa","Màn hình"],"correct":["Bàn phím","Chuột"]},'
  + '{"question":"Thiếu đáp án","options":["x","y"],"correct":["z"]},'
  + '{"question":"Tất cả đều đúng?","options":["x","y"],"correct":["x","y"]},'
  + '{"question":"RAM là bộ nhớ trong.","options":["Đúng","Sai"],"correct":[0]}]\n```';
var qs = C.parseQuiz(raw);
assertEq('parseQuiz: bỏ ``` và tiền tố "A. ", đáp án ghi chữ cái → nguyên văn', qs[0], { question: 'RAM là?', type: 'single', options: ['Bộ nhớ tạm', 'Ổ cứng', 'Màn hình', 'Chuột'], correct: ['Bộ nhớ tạm'], explanation: 'RAM mất dữ liệu khi tắt máy.' });
assertEq('parseQuiz: nhiều đáp án → multi; bỏ câu không có/toàn đáp án đúng; đáp án ghi số thứ tự', qs.map(function (q) { return q.type + ':' + q.correct.join('|'); }), ['single:Bộ nhớ tạm', 'multi:Bàn phím|Chuột', 'single:Đúng']);
assertEq('parseQuiz: JSON bọc {questions:[...]} và chữ thừa xung quanh', C.parseQuiz('Đây: {"questions":[{"question":"Q","options":["a","b"],"correct":"b"}]}').length, 1);
assertEq('parseQuiz: hỏng → mảng rỗng', [C.parseQuiz('xin lỗi'), C.parseQuiz('')], [[], []]);
var quick = C.toQuickText(qs.slice(0, 1).concat(qs[2]));
assertEq('toQuickText: đúng dạng "Nhập nhanh" của Soạn đề (dấu * trước đáp án đúng, Giải thích:)',
  quick, 'Câu 1: RAM là?\n*A. Bộ nhớ tạm\nB. Ổ cứng\nC. Màn hình\nD. Chuột\nGiải thích: RAM mất dữ liệu khi tắt máy.\n\nCâu 2: RAM là bộ nhớ trong.\n*A. Đúng\nB. Sai');

// ── Hiển thị an toàn ──
assertEq('formatText: chặn HTML, **đậm**, gạch đầu dòng thành danh sách',
  C.formatText('**Vì sao:** <img src=x onerror=alert(1)>\n- ý 1\n- ý *nghiêng*\n\nKết'),
  '<p><b>Vì sao:</b> &lt;img src=x onerror=alert(1)&gt;</p><ul><li>ý 1</li><li>ý <i>nghiêng</i></li></ul><p>Kết</p>');
assertEq('cacheKey: cùng dữ liệu → cùng khoá, khác dữ liệu → khác khoá',
  [C.cacheKey('explain', ex.payload) === C.cacheKey('explain', C.build('explain', { question: 'RAM là gì?', options: ['Bộ nhớ tạm', 'Ổ cứng'], correct: ['Bộ nhớ tạm'], chosen: 'Ổ cứng', grade: 7 }).payload),
    C.cacheKey('explain', ex.payload) === C.cacheKey('explain', C.build('explain', { question: 'RAM là gì?', correct: 'x' }).payload)], [true, false]);
assertEq('model mặc định hợp lệ', C.MODEL_RE.test(C.DEFAULT_MODEL) && C.MODELS.every(function (m) { return C.MODEL_RE.test(m.id); }), true);

console.log(failures ? '\n' + failures + ' test FAIL' : '\nTất cả test PASS');
process.exit(failures ? 1 : 0);
