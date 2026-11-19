/* Unit test CultivationService (js/techrealm/cultivation-service.js) với kho trong bộ nhớ.
   Chạy: node js/techrealm/__tests__/cultivation-service.test.js */
'use strict';
const path = require('path');
const C = require(path.join(__dirname, '..', 'cultivation-core.js'));
const S = require(path.join(__dirname, '..', 'cultivation-service.js'));

let fails = 0;
function eq(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) fails++;
  console.log((ok ? 'PASS  ' : 'FAIL  ') + label + (ok ? '' : '  got ' + JSON.stringify(actual) + ' want ' + JSON.stringify(expected)));
}

const L = 'LABCDEFGH23';
const SYS = { kind: 'system' };
const GV = { kind: 'teacher', uid: 'gv1' };
const AD = { kind: 'admin', uid: 'ad1' };
let t = Date.parse('2026-11-16T01:00:00Z');
const clock = () => new Date((t += 60e3)).toISOString(); // mỗi lần gọi +1 phút

const store = S.createMemoryStore();
const svc = S.create({ store, clock });
const exp = () => svc.profile(L).exp;

// ── Chống ghi nhận trùng ──
const r1 = svc.recordEvent({ type: 'LESSON', learnerId: L, evidence: { lessonId: 'ic3-lv1/1', score: 85, durationSec: 240 } }, SYS);
const r2 = svc.recordEvent({ type: 'LESSON', learnerId: L, evidence: { lessonId: 'ic3-lv1/1', score: 85, durationSec: 240 } }, SYS);
const r3 = svc.recordEvent({ type: 'LESSON', learnerId: L, evidence: { lessonId: 'ic3-lv1/1', score: 100 } }, SYS);
eq('lần 1 ghi, lần 2–3 (gửi lại / làm lại) báo trùng', [r1.ok && !r1.duplicate, r2.duplicate, r3.duplicate], [true, true, true]);
eq('EXP chỉ cộng 1 lần', exp(), 20);
eq('kho chỉ có 1 dòng EXP + 1 thành tựu "Nhập môn" (tự ghi cùng giao dịch)', store.rows.map((r) => r.kind + ':' + (r.type || r.achievementId)), ['exp:LESSON', 'achievement:nhap-mon']);
eq('lỗi nhập liệu không ghi gì vào kho', [svc.recordEvent({ type: 'LESSON', learnerId: L, evidence: { lessonId: 'z', score: 10 } }, SYS).code, store.rows.length], ['below-threshold', 2]);

// ── Đột phá trọn quy trình ──
eq('chưa đủ điều kiện → từ chối, trả danh sách điều kiện', (() => { const r = svc.breakthrough(L, { kind: 'learner', uid: L }); return [r.ok, r.code, r.conditions.map((c) => c.id + ':' + c.met)]; })(),
  [false, 'not-eligible', ['exp:false', 'test:khao-hach-2:false']]);
svc.recordEvent({ type: 'TEST', learnerId: L, evidence: { testId: 'khao-hach-2', score: 100, topic: 7 } }, SYS);
svc.recordEvent({ type: 'PROJECT', learnerId: L, evidence: { projectId: 'thu-moi', pct: 95 } }, GV);
eq('20 + 80 + 180 = 280 EXP (chưa đủ 300)', exp(), 280);
svc.recordEvent({ type: 'ACTIVITY', learnerId: L, evidence: { activityId: 'room-K7M2QX' } }, GV);
eq('+15 tham gia phòng cả lớp → 295', exp(), 295);
eq('Luyện Khí Hậu kỳ', svc.profile(L).stage.stage, 'Hậu kỳ');
svc.recordEvent({ type: 'TEACHER', learnerId: L, evidence: { awardId: 'w46-1', amount: 10, note: 'Giúp bạn cùng bàn ôn bài' } }, GV);
const before = svc.profile(L);
eq('305 EXP + đạt khảo hạch → đủ điều kiện', [before.exp, before.next.eligible, before.stage.peak], [305, true, true]);
const bt = svc.breakthrough(L, { kind: 'learner', uid: L });
eq('đột phá thành công lên Trúc Cơ, nhận vật phẩm thưởng', [bt.ok, bt.to, bt.items], [true, 2, [{ itemId: 'khung-van-may', qty: 1 }, { itemId: 'linh-thach', qty: 100 }]]);
const after = svc.profile(L);
eq('hồ sơ: Trúc Cơ Sơ kỳ, có linh thạch, có thành tựu phá cảnh', [after.realm.name, after.stage.stage, after.items['linh-thach'], !!after.achievements['pha-canh-truc-co']], ['Trúc Cơ', 'Sơ kỳ', 100, true]);
eq('bấm đột phá lần nữa → không nhân đôi phần thưởng', [svc.breakthrough(L, SYS).ok, svc.profile(L).items['linh-thach']], [false, 100]);
eq('thời gian hoạt động (phút) cộng từ bài đã ghi', after.activityMinutes, 4);

// ── Lịch sử ──
const kinds = after.history.map((h) => h.kind);
eq('lịch sử có EXP, cảnh giới, vật phẩm, thành tựu — mới nhất trước', [kinds.includes('exp'), kinds.includes('realm'), kinds.includes('item'), kinds.includes('achievement'), after.history[0].at >= after.history[after.history.length - 1].at], [true, true, true, true, true]);
eq('mỗi dòng EXP có nguồn, số lượng, thời điểm, trạng thái, người xác nhận', Object.keys(after.history.find((h) => h.type === 'PROJECT')).filter((k) => ['type', 'sourceId', 'amount', 'at', 'status', 'by'].includes(k)).length, 6);

// ── Quyền ──
eq('giáo viên không được duyệt giao dịch chờ (chỉ Admin)', svc.review(L, 'x', 'confirmed', GV).code, 'forbidden');
eq('học sinh không được huỷ giao dịch', svc.reverse(L, r1.tx.txId, { kind: 'learner', uid: L }, 'tự huỷ thử').code, 'forbidden');
eq('huỷ thiếu lý do → từ chối', svc.reverse(L, r1.tx.txId, GV, '').code, 'invalid');
eq('chỉ máy chủ ghi bài đánh giá năng lực', svc.recordAssessment(L, 'att-1', { 1: 80 }, GV).code, 'forbidden');

// ── Duyệt / huỷ ──
['w46-2', 'w46-3', 'w46-4', 'w46-5', 'w46-6'].forEach((id) => svc.recordEvent({ type: 'TEACHER', learnerId: L, evidence: { awardId: id, amount: 10, note: 'Phát biểu xây dựng bài' } }, GV));
const p = svc.profile(L);
const pendingTx = p.history.find((h) => h.status === 'pending');
eq('thưởng của thầy cô vượt 50/tuần → 1 giao dịch chờ, chưa cộng', [!!pendingTx, p.pendingExp], [true, 10]);
const expBefore = p.exp;
eq('Admin duyệt → cộng', [svc.review(L, pendingTx.txId, 'confirmed', AD).status, svc.profile(L).exp - expBefore], ['confirmed', 10]);
eq('duyệt lại lần 2 → báo trùng, không cộng thêm', [svc.review(L, pendingTx.txId, 'confirmed', AD).duplicate, svc.profile(L).exp - expBefore], [true, 10]);
const e0 = svc.profile(L).exp;
eq('thầy cô huỷ bài học (làm hộ) → trừ đúng 20, huỷ lần 2 báo trùng', [svc.reverse(L, r1.tx.txId, GV, 'Bạn khác làm hộ').ok, e0 - svc.profile(L).exp, svc.reverse(L, r1.tx.txId, GV, 'Bạn khác làm hộ').duplicate], [true, 20, true]);
eq('cảnh giới đã đạt giữ nguyên sau khi huỷ', svc.profile(L).realm.name, 'Trúc Cơ');

// ── Linh căn ──
svc.recordAssessment(L, 'att-1', { 1: 80, 4: 40, 7: 90, 9: 100, 2: 'x' }, SYS);
svc.recordAssessment(L, 'att-1', { 1: 0 }, SYS); // gửi lại cùng bài → bỏ qua
const el = svc.profile(L).elements;
eq('linh căn từ bài đánh giá; chủ đề lạ/giá trị lạ bị bỏ; gửi lại không ghi đè', [el.kim.score, el.moc.score, el.hoa.score, el.thuy], [80, 40, 90, null]);

// ── Kho khác: 2 học sinh tách biệt ──
const L2 = 'LZZZZZZZZZ2';
svc.recordEvent({ type: 'LESSON', learnerId: L2, evidence: { lessonId: 'ic3-lv1/1', score: 90 } }, SYS);
eq('cùng bài, học sinh khác → giao dịch riêng', [svc.profile(L2).exp, svc.profile(L2).realm.name], [20, 'Luyện Khí']);

// ── Cấu hình hỏng → không khởi tạo được ──
let threw = '';
try { S.create({ store: S.createMemoryStore(), config: { rewards: { LESSON: { amount: -1 } } } }); } catch (e) { threw = e.message; }
eq('cấu hình sai → báo lỗi ngay khi khởi tạo', /không hợp lệ/.test(threw), true);
let threwItems = '';
try { S.create({ store: S.createMemoryStore(), items: [{ id: 'hack', name: 'H', desc: 'd', kind: 'dan-duoc', rarity: 1, obtain: { type: 'shop', price: 1 }, effect: { type: 'add-exp' } }] }); } catch (e) { threwItems = e.message; }
eq('vật phẩm cộng EXP → không khởi tạo được', /không hợp lệ/.test(threwItems), true);
eq('Admin đổi mức thưởng → áp dụng', (() => {
  const s2 = S.create({ store: S.createMemoryStore(), clock, config: { rewards: { LESSON: { amount: 35 } } } });
  s2.recordEvent({ type: 'LESSON', learnerId: L, evidence: { lessonId: 'a', score: 90 } }, SYS);
  return s2.profile(L).exp;
})(), 35);
eq('C.DEFAULT_CONFIG không bị sửa bởi service', C.DEFAULT_CONFIG.rewards.LESSON.amount, 20);

console.log(fails ? `\n✗ ${fails} kiểm tra lỗi` : '\n✓ cultivation-service: mọi kiểm tra đạt');
process.exit(fails ? 1 : 0);
