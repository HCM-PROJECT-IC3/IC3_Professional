/* Unit test AI Sư Phụ (js/techrealm/mentor-core.js) + nối vào ai-core có sẵn. Không gọi mạng.
   Chạy: node js/techrealm/__tests__/mentor-core.test.js */
'use strict';
const path = require('path');
global.window = globalThis; // ai-core.js gắn vào window
const M = require(path.join(__dirname, '..', 'mentor-core.js'));
require(path.join(__dirname, '..', '..', 'services', 'ai-core.js'));
const AIC = globalThis.EduAICore;

let fails = 0;
function eq(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) fails++;
  console.log((ok ? 'PASS  ' : 'FAIL  ') + label + (ok ? '' : '  got ' + JSON.stringify(actual).slice(0, 300) + ' want ' + JSON.stringify(expected).slice(0, 300)));
}

// ── 1. Lọc thông tin cá nhân ──
const s = (t) => M.scrubPII(t).text;
eq('email', s('gửi cho em ở an.nguyen@gmail.com nhé'), 'gửi cho em ở [email] nhé');
eq('số điện thoại (0…, +84…, có dấu cách / chấm)', [s('gọi 0912345678'), s('sđt +84 912 345 678'), s('0912.345.678')], ['gọi [số điện thoại]', 'sđt [số điện thoại]', '[số điện thoại]']);
eq('số định danh 9–12 chữ số', s('CCCD 079123456789'), 'CCCD [dãy số]');
eq('tên tự giới thiệu', [s('Tên em là Nguyễn Văn An, lớp 6A1'), s('mình tên là Lê Bảo')], ['[tên], lớp 6A1', '[tên]']);
eq('địa chỉ nhà, mật khẩu', [s('nhà em ở 12 Lê Lợi quận 1'), s('mật khẩu là abc123')], ['[địa chỉ]', '[mật khẩu]']);
eq('đường link', s('xem https://abc.xyz/a?b=1 giúp em'), 'xem [link] giúp em');
eq('câu hỏi học tập bình thường KHÔNG bị đổi', s('RAM và ROM khác nhau thế nào? Máy có 8 GB RAM'), 'RAM và ROM khác nhau thế nào? Máy có 8 GB RAM');
eq('đếm số mục đã ẩn', M.scrubPII('a@b.vn 0912345678').removed, 2);

// ── 2. Câu lệnh ──
const hint = M.build('mentorHint', { question: 'Thiết bị nào là thiết bị nhập?', options: ['Bàn phím', 'Màn hình', 'Loa'], correct: ['Bàn phím'], answer: 'Bàn phím', level: 2 });
eq('gợi ý: KHÔNG nhận đáp án đúng dù trình duyệt có gửi kèm', [Object.keys(hint.payload).sort(), /Bàn phím/.test(hint.user.split('Các phương án:')[0])], [['attempt', 'grade', 'level', 'options', 'question'], false]);
eq('gợi ý: dặn AI tuyệt đối không nêu đáp án, theo đúng mức', [/TUYỆT ĐỐI không nêu đáp án/.test(hint.user), /MỨC 2/.test(hint.user)], [true, true]);
eq('gợi ý: mức ngoài 1–3 → kẹp lại', [M.build('mentorHint', { question: 'x', level: 9 }).payload.level, M.build('mentorHint', { question: 'x', level: 0 }).payload.level], [3, 1]);
const concept = M.build('mentorConcept', { topic: 'Phần cứng', question: 'Tên em là Minh Anh, RAM là gì ạ?', grade: 6 });
eq('hỏi kiến thức: lọc tên trước khi dựng câu lệnh', [/Minh Anh/.test(concept.user), /\[tên\]/.test(concept.user)], [false, true]);
eq('hỏi kiến thức: quá ngắn → từ chối', (() => { try { M.build('mentorConcept', { question: 'hi' }); return 'ok'; } catch (e) { return e.code; } })(), 'invalid-argument');
const code = M.build('codeHelp', { language: 'ruby', code: 'for i in range(3)\n    print(i)\n', error: 'SyntaxError: expected ":"' });
eq('lập trình: ngôn ngữ lạ → Python; giữ xuống dòng của code', [code.payload.language, code.payload.code.split('\n').length], ['python', 2]);
eq('lập trình: dặn không viết lại toàn bộ chương trình', /KHÔNG viết lại toàn bộ chương trình/.test(code.user), true);
eq('lập trình: code dài bị cắt 1500 ký tự', M.build('codeHelp', { code: 'x'.repeat(5000) }).payload.code.length, 1500);
const rub = M.build('rubricReview', { title: 'Áp phích', description: 'Áp phích về mật khẩu mạnh, có 3 mẹo và hình minh hoạ ổ khoá.', criteria: [{ name: 'Nội dung đúng', max: 4 }, { name: 'Trình bày', max: 99 }, { name: '' }] });
eq('rubric: bỏ tiêu chí rỗng, kẹp điểm tối đa 1–10, yêu cầu JSON', [rub.payload.criteria, rub.json], [[{ name: 'Nội dung đúng', max: 4 }, { name: 'Trình bày', max: 10 }], true]);
eq('câu lệnh hệ thống: từ chối ngoài học tập + không hỏi thông tin cá nhân', /Chỉ trả lời nội dung học tập/.test(hint.system) && /Không bao giờ đề nghị học sinh cung cấp thông tin cá nhân/.test(hint.system), true);

// ── 3. Nối vào ai-core có sẵn (cùng đường: bản đệm, key cá nhân, key trường) ──
eq('ai-core.build nhận việc AI Sư Phụ khi trang có nạp mentor-core', JSON.stringify(AIC.build('mentorHint', { question: 'x', level: 1 })) === JSON.stringify(M.build('mentorHint', { question: 'x', level: 1 })), true);
eq('ai-core.build việc cũ không đổi (explain)', AIC.build('explain', { question: 'Q', correct: 'A', chosen: 'B' }).task, 'explain');
eq('ai-core.build việc lạ vẫn báo lỗi', (() => { try { AIC.build('hack', {}); return 'ok'; } catch (e) { return e.code; } })(), 'invalid-argument');

// ── 4. Chế độ học / kiểm tra ──
const NOW = Date.parse('2026-11-17T03:00:00Z');
eq('đang làm bài Kiểm tra (bản tự lưu < 8 giờ) → chế độ kiểm tra', M.modeOf({ examMode: 'test', savedAt: NOW - 3600e3 }, NOW), 'test');
eq('bài Ôn luyện / bản lưu cũ > 8 giờ / không có → chế độ học', [M.modeOf({ examMode: 'practice', savedAt: NOW }, NOW), M.modeOf({ examMode: 'test', savedAt: NOW - 9 * 3600e3 }, NOW), M.modeOf(null, NOW)], ['learn', 'learn', 'learn']);
eq('chế độ kiểm tra: CHẶN mọi việc AI của học sinh (gợi ý, hỏi, code, giải thích câu sai)', ['mentorHint', 'mentorConcept', 'codeHelp', 'explain'].map((t) => M.policy('test', t).allowed), [false, false, false, false]);
eq('chế độ học: cho phép; việc lạ: chặn', [M.policy('learn', 'mentorHint').allowed, M.policy('learn', 'hack').allowed], [true, false]);

// ── 5. Đọc kết quả chấm rubric ──
const crit = [{ name: 'Nội dung đúng', max: 4 }, { name: 'Trình bày', max: 3 }];
const pr = M.parseRubric('```json\n{"criteria":[{"name":"trình bày","score":9,"comment":"Đẹp"},{"name":"Nội dung đúng","score":3,"comment":"Đủ 3 mẹo, liên hệ 0912345678"}],"overall":"Tốt"}\n```', crit);
eq('rubric: khớp theo tên (không phân biệt hoa thường), kẹp điểm ≤ tối đa, lọc thông tin cá nhân trong nhận xét', [pr.rows.map((r) => r.score), pr.total, pr.max, /\[số điện thoại\]/.test(pr.rows[0].comment)], [[3, 3], 6, 7, true]);
eq('rubric: AI trả chữ không phải JSON → null (giao diện báo, không bịa điểm)', M.parseRubric('Em làm tốt lắm', crit), null);

// ── 6. Gợi ý nhiệm vụ (luật trên máy, không AI) ──
const sg = M.suggestNext({
  due: 4,
  courses: [{ id: 'a', name: 'IC3 1', pct: 40, started: true, next: { title: 'Bài 7', href: '#a' } }, { id: 'b', name: 'MOS', pct: 0, started: false, next: { title: 'Bài 1', href: '#b' } }],
  challengeLevels: [{ id: 'l1', name: 'Trạm biến áp', stars: 2, unlocked: true, href: '#c' }],
  missions: [{ id: 'tien-dien', name: 'Tính tiền điện', score: 0, href: '#d' }],
});
eq('gợi ý nhiệm vụ: ôn câu đến hạn → học tiếp khoá đang dở → bí cảnh → nhiệm vụ đời sống', sg.map((x) => x.kind), ['on-tap', 'bai-hoc', 'bi-canh', 'nhiem-vu']);
eq('máy mới: gợi ý bắt đầu khoá đầu tiên', M.suggestNext({ courses: [{ id: 'b', name: 'MOS', pct: 0, started: false, next: { title: 'Bài 1', href: '#b' } }] })[0].title, 'Bắt đầu MOS');

console.log(fails ? `\n✗ ${fails} kiểm tra lỗi` : '\n✓ mentor-core: mọi kiểm tra đạt');
process.exit(fails ? 1 : 0);
