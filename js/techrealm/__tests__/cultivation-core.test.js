/* Unit test luật tu luyện (js/techrealm/cultivation-core.js) — hàm thuần, không mạng.
   Chạy: node js/techrealm/__tests__/cultivation-core.test.js */
'use strict';
const path = require('path');
const C = require(path.join(__dirname, '..', 'cultivation-core.js'));

let fails = 0;
function eq(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) fails++;
  console.log((ok ? 'PASS  ' : 'FAIL  ') + label + (ok ? '' : '  got ' + JSON.stringify(actual) + ' want ' + JSON.stringify(expected)));
}

const L = 'LABCDEFGH23';
const NOW = '2026-11-16T03:00:00.000Z'; // 10:00 giờ VN
const SYS = { kind: 'system' };
const GV = { kind: 'teacher', uid: 'gv1' };
const ev = (type, evidence, learnerId) => ({ type, learnerId: learnerId || L, evidence });
const run = (event, rows, actor, now) => C.evaluateEvent(event, { summary: C.summarize(rows || []), actor: actor || SYS, now: now || NOW });

// ── 1. Cảnh giới, tiểu cảnh giới ──
eq('7 cảnh giới đúng thứ tự', C.REALMS.map((r) => r.name), ['Luyện Khí', 'Trúc Cơ', 'Kim Đan', 'Nguyên Anh', 'Hóa Thần', 'Độ Kiếp', 'Chân Tiên']);
eq('Luyện Khí 0 EXP → Sơ kỳ', C.stageOf(1, 0).stage, 'Sơ kỳ');
eq('Luyện Khí 100/300 → Trung kỳ', C.stageOf(1, 100).stage, 'Trung kỳ');
eq('Luyện Khí 299 → Hậu kỳ, chưa đỉnh phong', [C.stageOf(1, 299).stage, C.stageOf(1, 299).peak], ['Hậu kỳ', false]);
eq('Luyện Khí 500 (đủ EXP, chưa đột phá) → Hậu kỳ đỉnh phong, KHÔNG tự lên cảnh giới', [C.stageOf(1, 500).stage, C.stageOf(1, 500).peak, C.stageOf(1, 500).realm], ['Hậu kỳ', true, 1]);
eq('Trúc Cơ 640 (300→900) → Trung kỳ', C.stageOf(2, 640).stage, 'Trung kỳ');
eq('Chân Tiên → Viên mãn', C.stageOf(7, 20000).stage, 'Viên mãn');

// ── 2. Cấu hình ──
eq('cấu hình mặc định hợp lệ', C.validateConfig(C.DEFAULT_CONFIG), []);
const merged = C.mergeConfig(C.DEFAULT_CONFIG, { rewards: { LESSON: { amount: 25 } } });
eq('Admin ghi đè 1 mức thưởng, giữ phần còn lại', [merged.rewards.LESSON.amount, merged.rewards.LESSON.minScore, C.DEFAULT_CONFIG.rewards.LESSON.amount], [25, 70, 20]);
const bad = C.mergeConfig(C.DEFAULT_CONFIG, { rewards: { LESSON: { amount: -5 }, PAGE_VIEW: { amount: 1 } }, breakthrough: { 4: { minExp: 500 } } });
const errs = C.validateConfig(bad).join(' | ');
eq('bắt mức thưởng âm', /LESSON: mức thưởng/.test(errs), true);
eq('bắt nguồn lạ (PAGE_VIEW)', /Nguồn lạ trong rewards: PAGE_VIEW/.test(errs), true);
eq('bắt ngưỡng cảnh giới không tăng dần', /Cảnh giới 4: minExp phải tăng dần/.test(errs), true);
eq('bắt công pháp lạ', C.validateConfig(C.mergeConfig(C.DEFAULT_CONFIG, { breakthrough: { 3: { courses: ['khong-co'] } } })).some((e) => /công pháp lạ khong-co/.test(e)), true);

// ── 3. Vật phẩm ──
eq('danh mục vật phẩm mặc định hợp lệ', C.validateItems(C.DEFAULT_ITEMS), []);
eq('đủ 6 loại vật phẩm', C.ITEM_KINDS, ['linh-thach', 'cong-phap', 'phap-bao', 'dan-duoc', 'danh-hieu', 'trang-tri']);
const itemErr = C.validateItems([
  { id: 'x', name: 'X', desc: 'd', kind: 'dan-duoc', rarity: 2, obtain: { type: 'shop', price: 10 }, effect: { type: 'add-exp', amount: 100 } },
  { id: 'y', name: 'Y', desc: 'd', kind: 'phap-bao', rarity: 9, obtain: { type: 'shop' }, effect: { type: 'cosmetic' } },
]).join(' | ');
eq('cấm vật phẩm cộng EXP', /x\): chức năng không hợp lệ/.test(itemErr), true);
eq('bắt độ hiếm ngoài 1–5 và hàng bán thiếu giá', /độ hiếm phải 1–5/.test(itemErr) && /hàng bán phải có giá/.test(itemErr), true);

// ── 4. Tính EXP từng nguồn ──
eq('mở trang KHÔNG phải nguồn EXP', run(ev('PAGE_VIEW', { pageId: 'home' })).code, 'invalid');
eq('mã học viên sai → từ chối', run(ev('LESSON', { lessonId: 'ic3-lv1/1', score: 80 }, 'abc')).code, 'invalid');
eq('giáo viên không được tự gửi "đạt bài kiểm tra" (chỉ máy chủ chấm)', run(ev('TEST', { testId: 'khao-hach-2', score: 90 }), [], GV).code, 'forbidden');
eq('máy chủ không tự thưởng dự án (cần thầy cô duyệt)', run(ev('PROJECT', { projectId: 'p1', pct: 90 }), [], SYS).code, 'forbidden');
eq('bài học thiếu điểm → từ chối', run(ev('LESSON', { lessonId: 'ic3-lv1/1' })).code, 'invalid');
eq('bài học dưới 70 điểm → chưa thưởng', run(ev('LESSON', { lessonId: 'ic3-lv1/1', score: 65 })).code, 'below-threshold');
const lesson = run(ev('LESSON', { lessonId: 'ic3-lv1/1', score: 80, durationSec: 300, topic: 1 }));
eq('bài học đạt → +20, xác nhận ngay bởi hệ thống', [lesson.tx.amount, lesson.tx.status, lesson.tx.by], [20, 'confirmed', 'system']);
eq('txId tất định', lesson.tx.txId, L + '|LESSON|ic3-lv1/1');
eq('gửi lại cùng bài → trùng, KHÔNG có giao dịch mới', run(ev('LESSON', { lessonId: 'ic3-lv1/1', score: 100 }), [lesson.tx]), { ok: true, duplicate: true, txId: lesson.tx.txId });
eq('kiểm tra 100 điểm → 60 + 20 thưởng tuyệt đối', run(ev('TEST', { testId: 'khao-hach-2', score: 100 })).tx.amount, 80);
eq('kiểm tra 75 điểm → 60', run(ev('TEST', { testId: 'khao-hach-2', score: 75 })).tx.amount, 60);
eq('bên gửi tự ghi amount KHÔNG có tác dụng', run(ev('LESSON', { lessonId: 'ic3-lv1/2', score: 80, amount: 9999 })).tx.amount, 20);
eq('dự án 92% → 180', run(ev('PROJECT', { projectId: 'p1', pct: 92 }), [], GV).tx.amount, 180);
eq('dự án 80% → 150', run(ev('PROJECT', { projectId: 'p1', pct: 80 }), [], GV).tx.amount, 150);
eq('dự án 40% → chưa đạt', run(ev('PROJECT', { projectId: 'p1', pct: 40 }), [], GV).code, 'below-threshold');
eq('thầy cô thưởng thiếu lý do → từ chối', run(ev('TEACHER', { awardId: 'a1', amount: 10 }), [], GV).code, 'invalid');
eq('thầy cô thưởng quá mức tối đa (30) → từ chối', run(ev('TEACHER', { awardId: 'a1', amount: 31, note: 'Giúp bạn ôn bài' }), [], GV).code, 'invalid');
eq('thầy cô thưởng hợp lệ → xác nhận, ghi uid', (() => { const r = run(ev('TEACHER', { awardId: 'a1', amount: 20, note: 'Giúp bạn ôn bài' }), [], GV).tx; return [r.amount, r.status, r.by]; })(), [20, 'confirmed', 'gv1']);
eq('tham gia Phòng cả lớp → +15', run(ev('ACTIVITY', { activityId: 'room-ABC123' }), [], GV).tx.amount, 15);
eq('bí cảnh: chỉ máy chủ ghi (sau khi chạy lại nhật ký)', run(ev('CHALLENGE', { challengeId: 'thanh-pho-mat-dien/mach-dien', score: 90 }), [], GV).code, 'forbidden');
eq('bí cảnh 90 điểm → 30; 70 → 20; 40 → chưa đạt', [run(ev('CHALLENGE', { challengeId: 'tp/a', score: 90 })).tx.amount, run(ev('CHALLENGE', { challengeId: 'tp/a', score: 70 })).tx.amount, run(ev('CHALLENGE', { challengeId: 'tp/a', score: 40 })).code], [30, 20, 'below-threshold']);
eq('màn Boss 90 điểm → 30 + 40 thưởng Boss', run(ev('CHALLENGE', { challengeId: 'tp/boss', score: 90, boss: true })).tx.amount, 70);

// ── 5. Trần ngày / tuần, theo giờ Việt Nam ──
(function () {
  let rows = [];
  for (let i = 1; i <= 11; i++) {
    const r = run(ev('LESSON', { lessonId: 'b' + i, score: 90 }), rows);
    if (r.tx) rows.push(r.tx); else rows.push({ rejected: r.code });
  }
  eq('10 bài × 20 = 200 (trần ngày) → bài thứ 11 bị chặn', [rows.filter((r) => r.amount).reduce((a, r) => a + r.amount, 0), rows[10].rejected], [200, 'cap-reached']);
  const cfg = C.mergeConfig(C.DEFAULT_CONFIG, { rewards: { LESSON: { perDay: 50 } } });
  const ctx = (rs) => ({ config: cfg, summary: C.summarize(rs), actor: SYS, now: NOW });
  const a = C.evaluateEvent(ev('LESSON', { lessonId: 'c1', score: 90 }), ctx([])).tx;
  const b = C.evaluateEvent(ev('LESSON', { lessonId: 'c2', score: 90 }), ctx([a])).tx;
  const c = C.evaluateEvent(ev('LESSON', { lessonId: 'c3', score: 90 }), ctx([a, b])).tx;
  eq('chạm trần giữa chừng → chỉ cộng phần còn lại (20, 20, 10)', [a.amount, b.amount, c.amount], [20, 20, 10]);
  const late = C.evaluateEvent(ev('LESSON', { lessonId: 'c4', score: 90 }), { config: cfg, summary: C.summarize([a, b, c]), actor: SYS, now: '2026-11-16T16:59:00.000Z' });
  const next = C.evaluateEvent(ev('LESSON', { lessonId: 'c4', score: 90 }), { config: cfg, summary: C.summarize([a, b, c]), actor: SYS, now: '2026-11-16T17:00:00.000Z' });
  eq('23:59 giờ VN vẫn là hôm nay (hết trần); 00:00 giờ VN là ngày mới', [late.code, next.tx && next.tx.amount], ['cap-reached', 20]);
  let wk = [];
  ['a1', 'a2', 'a3'].forEach((id) => { wk.push(run(ev('TEACHER', { awardId: id, amount: 20, note: 'Phát biểu xây dựng bài' }), wk, GV).tx); });
  eq('thầy cô thưởng vượt trần tuần (50) → lần 3 CHỜ Admin duyệt', wk.map((t) => t.status), ['confirmed', 'confirmed', 'pending']);
  eq('ngày đầu tuần là thứ Hai (giờ VN)', [C.weekKey('2026-11-16T03:00:00Z'), C.weekKey('2026-11-22T16:59:00Z'), C.weekKey('2026-11-22T17:00:00Z')], ['2026-11-16', '2026-11-16', '2026-11-23']);
})();

// ── 6. Tóm tắt sổ cái: trùng, duyệt, huỷ ──
(function () {
  const t = lesson.tx;
  const s = C.summarize([t, Object.assign({}, t, { createdAt: '2026-11-16T03:00:01.000Z' }), t]);
  eq('ghi đua 3 dòng cùng txId → chỉ tính 1 lần', [s.exp, s.history.length], [20, 1]);
  const pend = { txId: 'p|TEACHER|x', learnerId: L, kind: 'exp', type: 'TEACHER', sourceId: 'x', amount: 30, status: 'pending', by: 'gv1', createdAt: NOW };
  eq('đang chờ: không cộng vào EXP', [C.summarize([pend]).exp, C.summarize([pend]).pendingExp], [0, 30]);
  const ok = { txId: 'p|TEACHER|x|review', learnerId: L, kind: 'review', refTxId: 'p|TEACHER|x', status: 'confirmed', by: 'admin1', createdAt: NOW };
  eq('Admin duyệt → cộng, người xác nhận là Admin', (() => { const z = C.summarize([pend, ok]); return [z.exp, z.history[0].status, z.history[0].by]; })(), [30, 'confirmed', 'admin1']);
  const rev = { txId: t.txId + '|reversal', learnerId: L, kind: 'reversal', refTxId: t.txId, amount: -20, by: 'gv1', note: 'Làm hộ', createdAt: NOW };
  const z = C.summarize([t, rev]);
  eq('huỷ giao dịch → EXP về 0, bài không còn tính "đã học"', [z.exp, z.history[0].status, !!z.lessonsDone['ic3-lv1/1']], [0, 'reversed', false]);
  eq('dòng đã huỷ hiện người huỷ + lý do (không phải người ghi ban đầu)', [z.history[0].by, z.history[0].reverseNote], ['gv1', 'Làm hộ']);
  eq('thời gian hoạt động cộng từ facts.durationSec', C.summarize([t]).activitySec, 300);
})();

// ── 7. Đột phá ──
(function () {
  const mk = (type, id, amount, facts) => ({ txId: C.txIdOf(L, type, id), learnerId: L, kind: 'exp', type, sourceId: id, amount, status: 'confirmed', facts: facts || {}, by: 'system', createdAt: NOW });
  let rows = [mk('LESSON', 'x', 250)];
  eq('Luyện Khí → Trúc Cơ: đủ? (250 EXP, chưa khảo hạch)', C.breakthroughCheck(C.summarize(rows)).eligible, false);
  rows.push(mk('TEST', 'khao-hach-2', 60));
  const chk = C.breakthroughCheck(C.summarize(rows));
  eq('đủ 310 EXP + đạt khảo hạch Trúc Cơ → được đột phá', [chk.to, chk.eligible], [2, true]);
  const made = C.breakthroughRows(L, C.summarize(rows), null, 'system', NOW);
  eq('đột phá tạo dòng cảnh giới + vật phẩm thưởng', made.rows.map((r) => r.kind + ':' + (r.realm || r.itemId)), ['realm:2', 'item:khung-van-may', 'item:linh-thach']);
  rows = rows.concat(made.rows);
  const s = C.summarize(rows);
  eq('sau đột phá: Trúc Cơ, có 100 linh thạch', [s.realm, s.items['linh-thach']], [2, 100]);
  const k = C.breakthroughCheck(s);
  eq('Trúc Cơ → Kim Đan cần: EXP 900, công pháp ic3-1, khảo hạch, 1 dự án', k.conditions.map((c) => c.id), ['exp', 'course:ic3-1', 'test:khao-hach-3', 'projects']);
  eq('EXP đủ nhưng chưa xong công pháp → KHÔNG được đột phá', (() => {
    const r2 = rows.concat([mk('TEACHER', 'big', 1000), mk('TEST', 'khao-hach-3', 60), mk('PROJECT', 'p1', 150)]);
    return C.breakthroughCheck(C.summarize(r2)).eligible;
  })(), false);
  const full = rows.concat([mk('TEACHER', 'big', 1000), mk('TEST', 'khao-hach-3', 60), mk('PROJECT', 'p1', 150)])
    .concat(C.DEFAULT_CONFIG.courses['ic3-1'].map((l) => mk('LESSON', l, 20)));
  eq('đủ cả 4 nhóm điều kiện → được lên Kim Đan', C.breakthroughCheck(C.summarize(full)).eligible, true);
  const rev = { txId: C.txIdOf(L, 'LESSON', 'x') + '|reversal', learnerId: L, kind: 'reversal', refTxId: C.txIdOf(L, 'LESSON', 'x'), amount: -250, by: 'gv1', createdAt: NOW };
  eq('huỷ giao dịch sau khi đã đột phá → KHÔNG tự hạ cảnh giới', C.summarize(rows.concat([rev])).realm, 2);
  eq('Chân Tiên cần chứng chỉ thật', C.DEFAULT_CONFIG.breakthrough[7].certified, true);
})();

// ── 8. Linh căn ──
(function () {
  const el = C.elementScores([{ at: NOW, topics: { 1: 80, 7: 90, 2: 60, 3: 70 } }], NOW);
  eq('chủ đề → linh căn; Thổ = TB chủ đề 2 và 3', [el.kim.score, el.hoa.score, el.tho.score], [80, 90, 65]);
  eq('chưa làm bài chủ đề Mộc → null ("chưa đánh giá"), không phải 0', el.moc, null);
  const old = C.elementScores([{ at: '2026-08-02T03:00:00Z', topics: { 1: 40 } }, { at: NOW, topics: { 1: 90 } }], NOW);
  eq('bài gần đây nặng hơn bài cũ 106 ngày (gần 90 hơn 40)', old.kim.score > 75, true);
  eq('điểm ngoài 0–100 bị bỏ', C.elementScores([{ at: NOW, topics: { 1: 150 } }], NOW).kim, null);
})();

// ── 9. Thành tựu ──
(function () {
  const s = C.summarize([lesson.tx]);
  eq('EXP đầu tiên → "Nhập môn"', C.newAchievements(s).map((a) => a.id), ['nhap-mon']);
  eq('đã có → không lặp lại', C.newAchievements(Object.assign({}, s, { achievements: { 'nhap-mon': NOW } })).map((a) => a.id), []);
})();

console.log(fails ? `\n✗ ${fails} kiểm tra lỗi` : '\n✓ cultivation-core: mọi kiểm tra đạt');
process.exit(fails ? 1 : 0);
