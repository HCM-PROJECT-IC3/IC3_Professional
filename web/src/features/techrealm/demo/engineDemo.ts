/* Hồ sơ mẫu TÍNH BẰNG LUẬT THẬT: chạy một chuỗi hoạt động mẫu qua CultivationService với kho trong bộ nhớ,
   rồi đọc hồ sơ. Không có con số EXP / cảnh giới / điều kiện nào gõ tay — đổi luật ở js/techrealm/ thì
   giao diện xem thử đổi theo. 0 mạng. */
import { CultivationServiceApi, type Actor, type CultivationService, type Profile } from '../engine';
import { ME } from './data';

const SYS: Actor = { kind: 'system' };
const GV: Actor = { kind: 'teacher', uid: 'gv-lan' };
const GV2: Actor = { kind: 'teacher', uid: 'gv-minh' };
const STUDENT: Actor = { kind: 'learner', uid: ME.learnerId };

/** Đồng hồ giả: mỗi sự kiện cách nhau `step` phút, bắt đầu từ `start`. */
function fakeClock(start: string, step = 90) {
  let t = Date.parse(start);
  return () => new Date((t += step * 60e3)).toISOString();
}

function build(): { svc: CultivationService; profile: Profile } {
  const svc = CultivationServiceApi.create({ store: CultivationServiceApi.createMemoryStore(), clock: fakeClock('2026-11-10T00:00:00Z', 180) }); // thứ Hai → thứ Tư, cùng 1 tuần
  const L = ME.learnerId;
  const lesson = (n: number, score: number) => svc.recordEvent({ type: 'LESSON', learnerId: L, evidence: { lessonId: `ic3-lv1/${n}`, score, durationSec: 600, topic: n } }, SYS);
  lesson(1, 95); lesson(2, 82); lesson(3, 70);
  svc.recordEvent({ type: 'EXERCISE', learnerId: L, evidence: { exerciseId: 'bt-phan-cung', score: 90, durationSec: 420 } }, SYS);
  svc.recordEvent({ type: 'EXERCISE', learnerId: L, evidence: { exerciseId: 'bt-mat-khau', score: 75, durationSec: 300 } }, SYS);
  svc.recordEvent({ type: 'TEST', learnerId: L, evidence: { testId: 'khao-hach-2', score: 100, durationSec: 1500 } }, SYS);
  svc.recordEvent({ type: 'ACTIVITY', learnerId: L, evidence: { activityId: 'phong-K7M2QX' } }, GV);
  svc.recordEvent({ type: 'QUEST', learnerId: L, evidence: { questId: 'on-cong-dan-so' } }, GV);
  svc.recordEvent({ type: 'PROJECT', learnerId: L, evidence: { projectId: 'thu-moi-hoi-cho', pct: 92 } }, GV);
  svc.breakthrough(L, STUDENT); // ≥ 300 EXP + đạt khảo hạch Trúc Cơ → lên Trúc Cơ (kèm vật phẩm thưởng)
  lesson(4, 72); lesson(5, 88);
  svc.recordEvent({ type: 'TEST', learnerId: L, evidence: { testId: 'kiem-tra-giua-hk1', score: 85, durationSec: 2400 } }, SYS);
  svc.recordEvent({ type: 'EXERCISE', learnerId: L, evidence: { exerciseId: 'bt-luu-tru', score: 80 } }, SYS);
  // thầy cô thưởng 3 lần trong 1 tuần: lần thứ 3 vượt trần 50 → chờ Admin
  ['tuan46-a', 'tuan46-b', 'tuan46-c'].forEach((id, i) =>
    svc.recordEvent({ type: 'TEACHER', learnerId: L, evidence: { awardId: id, amount: 20, note: ['Giúp bạn ôn bài', 'Phát biểu xây dựng bài', 'Trình bày sản phẩm trước lớp'][i] } }, GV));
  // huỷ 1 bài tập do phát hiện nộp hộ
  const p0 = svc.profile(L);
  const ex = p0.history.find((h) => h.type === 'EXERCISE' && h.sourceId === 'bt-luu-tru');
  if (ex) svc.reverse(L, ex.txId, GV2, 'Bài nộp hộ — làm lại trên lớp');
  svc.recordAssessment(L, 'kt-giua-hk1', { 1: 72, 2: 66, 3: 60, 4: 45, 5: 61, 6: 55, 7: 81 }, SYS);
  return { svc, profile: svc.profile(L) };
}

const demo = build();
export const DEMO_PROFILE: Profile = demo.profile;
/** Cảnh giới / công huân / linh thạch của học viên mẫu — dùng thay mọi con số gõ tay. */
export const MY_REALM = DEMO_PROFILE.realm.id;
export const MY_EXP = DEMO_PROFILE.exp;
export const MY_STONES = DEMO_PROFILE.items['linh-thach'] ?? 0;

/** Người xác nhận → tên hiển thị (bản thật lấy từ hồ sơ giáo viên). */
export const ACTOR_NAME: Record<string, string> = { system: 'Hệ thống chấm', 'gv-lan': 'Cô Lan', 'gv-minh': 'Thầy Minh', [ME.learnerId]: 'Em' };

/** Kịch bản riêng cho nút "Xem thử hiệu ứng đột phá": 1 học viên vừa đủ điều kiện → gọi breakthrough thật. */
export function runDemoBreakthrough() {
  const L = 'LDEMO000001';
  const svc = CultivationServiceApi.create({ store: CultivationServiceApi.createMemoryStore(), clock: fakeClock('2026-11-16T01:00:00Z', 5) });
  svc.recordEvent({ type: 'TEST', learnerId: L, evidence: { testId: 'khao-hach-2', score: 100 } }, SYS);
  svc.recordEvent({ type: 'PROJECT', learnerId: L, evidence: { projectId: 'p-demo', pct: 95 } }, GV);
  svc.recordEvent({ type: 'QUEST', learnerId: L, evidence: { questId: 'q-demo' } }, GV);
  return svc.breakthrough(L, { kind: 'learner', uid: L });
}
