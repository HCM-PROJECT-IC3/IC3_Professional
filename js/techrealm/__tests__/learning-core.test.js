/* Unit test luật học tập (js/techrealm/learning-core.js) + khớp với data/techrealm/courses.json, data/ic3/meta.json,
   và nối vào luật tu luyện. Chạy: node js/techrealm/__tests__/learning-core.test.js */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const LC = require(path.join(__dirname, '..', 'learning-core.js'));
const C = require(path.join(__dirname, '..', 'cultivation-core.js'));
const S = require(path.join(__dirname, '..', 'cultivation-service.js'));

let fails = 0;
function eq(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) fails++;
  console.log((ok ? 'PASS  ' : 'FAIL  ') + label + (ok ? '' : '  got ' + JSON.stringify(actual).slice(0, 300) + ' want ' + JSON.stringify(expected).slice(0, 300)));
}

const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/techrealm/courses.json'), 'utf8'));
const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/ic3/meta.json'), 'utf8'));
const course = (id) => data.courses.find((c) => c.id === id);
const ic3 = course('ic3-1');

// ── 1. Khớp dữ liệu: bài làm ở sảnh cũ → đúng nút trong khoá học ──
const mismatch = [];
data.courses.forEach((c) => c.lessons.concat(c.gates, c.reviews).forEach((n) => {
  const u = LC.unitIdOf(n.src.ct, n.src.cap, n.src.bai);
  if (!u || u.id !== n.id) mismatch.push(c.id + ':' + n.id + '≠' + (u && u.id));
}));
eq(`mọi bài / kiểm tra / ôn tập trong courses.json nối đúng từ { catId, levelId, mtKey } của sảnh (${data.courses.reduce((a, c) => a + c.lessons.length + c.gates.length + c.reviews.length, 0)} nút)`, mismatch, []);
const dupIds = [];
meta.categories.forEach((cat) => cat.levels.forEach((lv) => {
  const seen = {};
  Object.keys(lv.minitests).forEach((k) => { const u = LC.unitIdOf(cat.id, lv.id, k); if (u) { if (seen[u.id]) dupIds.push(u.id); seen[u.id] = 1; } });
}));
eq('không 2 minitest nào trong meta.json ra cùng id', dupIds, []);
const cultMismatch = Object.keys(C.DEFAULT_CONFIG.courses).filter((cid) => JSON.stringify(C.DEFAULT_CONFIG.courses[cid]) !== JSON.stringify(course(cid).lessons.map((l) => l.id)));
eq('công pháp trong điều kiện đột phá (cultivation-core) = đúng danh sách bài của courses.json', cultMismatch, []);
eq('12 lĩnh vực theo Prompt 04', data.domains.map((d) => d.name), ['IC3', 'MOS', 'Tin học văn phòng', 'Scratch', 'Python', 'Lập trình Web', 'Computer Science', 'AI', 'Robotics', 'STEM', 'Khoa học tự nhiên', 'Kỹ năng sống']);
eq('mỗi khoá học có đủ: tên, mô tả, cấp độ, bài học, điều kiện (bài/kiểm tra)', data.courses.every((c) => c.name && c.description && c.level && c.lessons.length && Array.isArray(c.gates)), true);
eq('bài học có tài liệu từ slides-manifest (IC3 cấp 1: 35/35)', ic3.lessons.filter((l) => l.docs.length).length, 35);
eq('tài liệu chỉ là link https', data.courses.every((c) => c.lessons.every((l) => l.docs.every((d) => /^https:\/\//.test(d.url)))), true);

// ── 2. Cấu hình lớp: link không tin được → làm sạch ──
const cfg = LC.sanitizeClassConfig({
  className: '6A1'.repeat(30), issuedAt: 5,
  courses: {
    'ic3-1': { mode: 'hack', minScore: 5, locked: ['ic3-lv1/3', '<script>', 42], gateAfter: { 'ic3-lv1/kt-x': 'ic3-lv1/2', bad: '../x' },
      extra: { 'ic3-lv1/1': { videos: [{ title: 'Bài giảng', url: 'https://youtu.be/abc' }, { title: 'xấu', url: 'javascript:alert(1)' }, { title: 'http', url: 'http://x.vn' }], docs: [] } } },
    'BAD ID': { mode: 'free' },
  },
});
const c1 = cfg.courses['ic3-1'];
eq('tên lớp cắt 40 ký tự', cfg.className.length, 40);
eq('mode lạ → tuần tự; điểm đạt ngoài 40–100 → 70', [c1.mode, c1.minScore], ['sequential', 70]);
eq('id bài lạ / không phải chuỗi bị bỏ', c1.locked, ['ic3-lv1/3']);
eq('chỉ giữ link https (bỏ javascript:, http:)', c1.extra['ic3-lv1/1'].videos, [{ title: 'Bài giảng', url: 'https://youtu.be/abc' }]);
eq('id khoá học lạ bị bỏ; gateAfter sai bị bỏ', [Object.keys(cfg.courses), c1.gateAfter], [['ic3-1'], { 'ic3-lv1/kt-x': 'ic3-lv1/2' }]);
eq('dữ liệu rác → cấu hình rỗng hợp lệ', LC.sanitizeClassConfig('abc'), { v: 1, className: '', issuedAt: 0, courses: {} });

// ── 3. Tiến độ từ eduquiz_records (đúng các field js/quiz-engine.js § saveRecord ghi) ──
const T0 = Date.parse('2026-11-10T02:00:00Z');
const rec = (n, score, extra) => Object.assign({ id: (T0 + n * 6e4) * 1000 + 7, catId: 'IC3', levelId: 'LV1', mtKey: ic3.lessons[n - 1].src.bai, score, examMode: 'practice', elapsedSec: 300 }, extra || {});
const records = [rec(1, 60), rec(1, 85), rec(2, 90, { examMode: 'test' }), rec(3, 50), { id: 1, category: 'IC3', level: 'LV1', minitest: 'Bài 4', score: 100 },
  { id: (T0 + 9e6) * 1000, catId: 'IC3', levelId: 'LV1', mtKey: ic3.gates[0].src.bai, score: 80, examMode: 'test', elapsedSec: 1800 }];
const prog = LC.progressOf(records);
eq('bài 1: 2 lượt, điểm cao nhất 85, cộng thời gian', [prog.units['ic3-lv1/1'].attempts, prog.units['ic3-lv1/1'].best, prog.units['ic3-lv1/1'].timeSec], [2, 85, 600]);
eq('ghi riêng điểm chế độ Kiểm tra', [prog.units['ic3-lv1/2'].bestTest, prog.units['ic3-lv1/1'].bestTest], [90, null]);
eq('bài làm bản cũ (chưa có catId) bị bỏ qua, không lỗi', Object.keys(prog.units).length, 4);

// ── 4. Cây kỹ năng ──
let st = LC.nodeStates(ic3, prog, null);
eq('tuần tự: bài 1,2 xong → bài 3 mở (50 điểm chưa đạt) → bài 4 khoá chờ bài 3', [st['ic3-lv1/1'].state, st['ic3-lv1/2'].state, st['ic3-lv1/3'].state, st['ic3-lv1/4'].state, st['ic3-lv1/4'].missing], ['done', 'done', 'available', 'locked', ['ic3-lv1/3']]);
eq('bài kiểm tra giữa HK1 cần học xong tới bài 9 → còn khoá dù đã có điểm 80? (không — đã đạt thì tính done)', st[ic3.gates[0].id].state, 'done');
eq('bài kiểm tra HK1 chưa làm → khoá, chờ bài ' + ic3.gates[1].requires[0], [st[ic3.gates[1].id].state, st[ic3.gates[1].id].reason], ['locked', 'requires']);
const free = LC.sanitizeClassConfig({ courses: { 'ic3-1': { mode: 'free', locked: ['ic3-lv1/5'] } } });
st = LC.nodeStates(ic3, prog, free);
eq('giáo viên chọn tự do: bài 10 mở; bài 5 bị giáo viên khoá', [st['ic3-lv1/10'].state, st['ic3-lv1/5'].state, st['ic3-lv1/5'].reason], ['available', 'locked', 'teacher']);
const strict = LC.sanitizeClassConfig({ courses: { 'ic3-1': { minScore: 90, unlocked: ['ic3-lv1/20'], gateAfter: { [ic3.gates[1].id]: 'ic3-lv1/2' } } } });
st = LC.nodeStates(ic3, prog, strict);
eq('điểm đạt 90: bài 1 (85) chưa xong; giáo viên mở sẵn bài 20; đổi điều kiện bài kiểm tra HK1 → chỉ cần bài 2', [st['ic3-lv1/1'].state, st['ic3-lv1/20'].state, st[ic3.gates[1].id].state], ['available', 'available', 'available']);

const status = LC.courseStatus(ic3, prog, null);
eq('trạng thái khoá học: 2/35 bài, 1/4 kiểm tra, chưa hoàn thành, gợi ý bài 3', [status.lessonsDone, status.gatesDone, status.complete, status.next.id], [2, 1, false, 'ic3-lv1/3']);
const allRecs = ic3.lessons.map((l, i) => rec(i + 1, 80)).concat(ic3.gates.map((g, i) => ({ id: (T0 + 1e7 + i) * 1000, catId: 'IC3', levelId: 'LV1', mtKey: g.src.bai, score: 75, examMode: 'test' })));
eq('đạt mọi bài + mọi kiểm tra → hoàn thành 100%', (() => { const s = LC.courseStatus(ic3, LC.progressOf(allRecs), null); return [s.complete, s.pct, s.next]; })(), [true, 100, null]);
eq('EXP xem trước theo bảng thưởng: 35×20 + 4×60', LC.expPreview(ic3, C.DEFAULT_CONFIG), { perLesson: 20, perGate: 60, total: 940 });

// ── 5. Nối vào luật tu luyện: chỉ bài ĐÃ ĐƯỢC MÁY CHỦ CHẤM mới sinh EXP ──
const L = 'LABCDEFGH23';
const sub = (mtKey, serverScore) => ({ learnerId: L, catId: 'IC3', levelId: 'LV1', mtKey, serverScore, durationSec: 420 });
eq('bài nộp chỉ có điểm máy học sinh tự chấm → không sinh sự kiện', LC.submissionEvents({ learnerId: L, catId: 'IC3', levelId: 'LV1', mtKey: ic3.lessons[0].src.bai, score: 100 }), []);
eq('bài học → LESSON (id khớp courses.json)', LC.submissionEvents(sub(ic3.lessons[0].src.bai, 88))[0], { type: 'LESSON', learnerId: L, evidence: { score: 88, durationSec: 420, lessonId: 'ic3-lv1/1' } });
eq('bài kiểm tra → TEST', LC.submissionEvents(sub(ic3.gates[0].src.bai, 75))[0].type + ':' + LC.submissionEvents(sub(ic3.gates[0].src.bai, 75))[0].evidence.testId, 'TEST:' + ic3.gates[0].id);
eq('ôn tập → EXERCISE; minitest chủ đề → không thuộc khoá nào', [LC.submissionEvents(sub(ic3.reviews[0].src.bai, 80))[0].type, LC.submissionEvents(sub('1. Căn bản về công nghệ', 80))], ['EXERCISE', []]);
let t = Date.parse('2026-11-16T01:00:00Z');
const store = S.createMemoryStore();
const svc = S.create({ store, clock: () => new Date((t += 6e4)).toISOString() });
const send = (s) => LC.submissionEvents(s).map((e) => svc.recordEvent(e, { kind: 'system' }));
send(sub(ic3.lessons[0].src.bai, 88));
send(sub(ic3.lessons[0].src.bai, 95)); // làm lại cùng bài
send(sub(ic3.gates[0].src.bai, 100));
eq('đi trọn đường: bài học +20 (làm lại không cộng), kiểm tra 100 điểm +80', svc.profile(L).exp, 100);
const sum = C.summarize(store.rows);
eq('bài đạt qua đường này được tính vào điều kiện "Hoàn thành công pháp" (đúng id ic3-lv1/1) và "Vượt qua kiểm tra"', [!!sum.lessonsDone['ic3-lv1/1'], !!sum.testsPassed[ic3.gates[0].id]], [true, true]);

console.log(fails ? `\n✗ ${fails} kiểm tra lỗi` : '\n✓ learning-core: mọi kiểm tra đạt');
process.exit(fails ? 1 : 0);
