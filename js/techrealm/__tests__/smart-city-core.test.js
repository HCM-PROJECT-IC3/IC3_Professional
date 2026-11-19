/* Unit test Thành phố thông minh + nhiệm vụ đời sống (luật thuần). Chạy: node js/techrealm/__tests__/smart-city-core.test.js */
'use strict';
const path = require('path');
const C = require(path.join(__dirname, '..', 'smart-city-core.js'));
const M = require(path.join(__dirname, '..', 'life-missions-core.js'));

let fails = 0;
function eq(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) fails++;
  console.log((ok ? 'PASS  ' : 'FAIL  ') + label + (ok ? '' : '  got ' + JSON.stringify(actual).slice(0, 300) + ' want ' + JSON.stringify(expected).slice(0, 300)));
}
const ALL = { lessons: 50, course: { 'ky-nang-song-so': 7, 'ai-nhap-mon': 6 }, stars: { 'thanh-pho-mat-dien/phan-phoi': 3, 'thanh-pho-mat-dien/mach-dien': 3 }, missions: { 'tien-dien': 100, 'phan-loai-rac': 100 } };
function build(s, steps, ev) {
  let st = s;
  for (const [b, x, y] of steps) {
    const r = C.apply(st, { type: 'build', build: b, x, y }, ev || ALL);
    if (!r.ok) throw new Error(b + ' ' + x + ',' + y + ': ' + r.reason);
    st = r.state;
  }
  return st;
}
const rich = () => Object.assign(C.newCity(), { money: 5000 });

// ── 1. Mở khoá bằng bằng chứng học tập ──
const none = C.unlockStatus({}, C.newCity());
eq('máy mới: chỉ mở Khu dân cư; mọi công trình khác cần bằng chứng học tập', Object.keys(none).filter((k) => none[k].unlocked), ['khu-dan-cu']);
eq('phân loại rác từ 60 điểm → mở Công viên', [C.unlockStatus({ missions: { 'phan-loai-rac': 59 } })['cong-vien'].unlocked, C.unlockStatus({ missions: { 'phan-loai-rac': 60 } })['cong-vien'].unlocked], [false, true]);
eq('đạt 1 bài → mở Trường học', C.unlockStatus({ lessons: 1 })['truong-hoc'].unlocked, true);
eq('qua màn Nhà máy điện (Bí cảnh 1) → mở nhiệt điện; mặt trời cần thêm nhiệm vụ tiền điện', (() => { const u = C.unlockStatus({ stars: { 'thanh-pho-mat-dien/phan-phoi': 1 } }); return [u['nhiet-dien'].unlocked, u['dien-mat-troi'].unlocked]; })(), [true, false]);
eq('Trung tâm AI cần 2 bài AI VÀ đã có Phòng thí nghiệm', [C.unlockStatus(ALL, C.newCity())['trung-tam-ai'].unlocked, C.unlockStatus(ALL, build(rich(), [['phong-thi-nghiem', 0, 0]]))['trung-tam-ai'].unlocked], [false, true]);
eq('tiến độ mở khoá hiện số (Bệnh viện 1/3 bài)', C.unlockStatus({ course: { 'ky-nang-song-so': 1 } })['benh-vien'].progress, [1, 3]);
eq('xây công trình chưa mở → từ chối kèm điều kiện', (() => { const r = C.apply(C.newCity(), { type: 'build', build: 'nha-may', x: 0, y: 0 }, {}); return [r.ok, r.code, /Tính tiền điện/.test(r.reason)]; })(), [false, 'locked', true]);

// ── 2. Luật xây ──
eq('không xây trên sông / ô đã có / ngoài bản đồ / thiếu tiền', [
  C.apply(C.newCity(), { type: 'build', build: 'khu-dan-cu', x: 5, y: 2 }, ALL).code,
  C.apply(build(C.newCity(), [['khu-dan-cu', 0, 0]]), { type: 'build', build: 'cong-vien', x: 0, y: 0 }, ALL).code,
  C.apply(C.newCity(), { type: 'build', build: 'khu-dan-cu', x: 6, y: 0 }, ALL).code,
  C.apply(Object.assign(C.newCity(), { money: 10 }), { type: 'build', build: 'khu-dan-cu', x: 0, y: 0 }, ALL).code,
], ['blocked', 'blocked', 'invalid', 'money']);
eq('xây trừ tiền; phá hoàn 50%; trạng thái cũ không bị sửa', (() => {
  const s0 = C.newCity();
  const s1 = build(s0, [['khu-dan-cu', 0, 0]]);
  const s2 = C.apply(s1, { type: 'demolish', x: 0, y: 0 }).state;
  return [s0.money, s1.money, s2.money, Object.keys(s0.tiles).length];
})(), [300, 260, 280, 0]);

// ── 3. Công thức chỉ số ──
eq('thành phố trống: điện 100 (không ai dùng), môi trường 70, kinh tế 50, sống 0', C.simulate(C.newCity()).indices, { energy: 100, economy: 50, environment: 70, science: 0, technology: 0, life: 0 });
const noPower = C.simulate(build(rich(), [['khu-dan-cu', 0, 0]]));
eq('khu dân cư không có trạm điện → mất điện, không thu thuế, chất lượng sống thấp', [noPower.indices.energy, noPower.powered['0,0'] || false, noPower.net, noPower.population], [0, false, 0, 0]);
const coal = build(rich(), [['nhiet-dien', 0, 0], ['khu-dan-cu', 1, 0], ['khu-dan-cu', 3, 0]]);
const solar = build(rich(), [['dien-mat-troi', 0, 0], ['khu-dan-cu', 1, 0], ['khu-dan-cu', 3, 0]]);
const rc = C.simulate(coal).indices; const rs = C.simulate(solar).indices;
eq('QUYẾT ĐỊNH: than làm môi trường 70 → 48; mặt trời giữ 66 (chỉ trừ 2×2 của dân cư)', [rc.environment, rs.environment], [48, 66]);
eq('QUYẾT ĐỊNH: nhà sát nhà máy nhiệt điện → chất lượng sống thấp hơn nhà ở xa (cùng than)', (() => {
  const near = C.simulate(build(rich(), [['nhiet-dien', 0, 0], ['khu-dan-cu', 1, 0]])).indices.life;
  const far = C.simulate(build(rich(), [['nhiet-dien', 0, 0], ['khu-dan-cu', 3, 0]])).indices.life;
  return near < far;
})(), true);
eq('QUYẾT ĐỊNH: trường + bệnh viện trong 2 ô và công viên sát bên nâng chất lượng sống', (() => {
  const base = build(rich(), [['dien-mat-troi', 0, 0], ['khu-dan-cu', 2, 2]]);
  const plus = build(base, [['truong-hoc', 2, 0], ['benh-vien', 0, 2], ['cong-vien', 3, 2]]);
  return [C.simulate(base).indices.life, C.simulate(plus).indices.life];
})(), [34, 70]); // 40×(0,5+68/200)≈34 → (40+15+15+10)×(0,5+75/200)=70
eq('thiếu điện: tắt công trình ưu tiên thấp trước, GIỮ bệnh viện', (() => {
  // 25 MW. Bệnh viện đặt SAU 2 nhà máy trên bản đồ: nếu không có luật ưu tiên, 2 nhà máy (20 MW) lấy điện trước, BV mất điện.
  const s = build(rich(), [['dien-mat-troi', 0, 0], ['nha-may', 1, 0], ['nha-may', 2, 0], ['benh-vien', 4, 0]]);
  const r = C.simulate(s);
  return [r.powered['4,0'], [r.powered['1,0'], r.powered['2,0']].filter(Boolean).length, r.indices.energy];
})(), [true, 1, 96]);
eq('bảng "vì sao" Chất lượng sống ghi đóng góp THẬT: 1/2 khu có trường → +8 (không phải +15)', (() => {
  const r = C.simulate(build(rich(), [['dien-mat-troi', 0, 0], ['khu-dan-cu', 1, 1], ['khu-dan-cu', 5, 0], ['truong-hoc', 0, 2]]));
  return r.why.life.find((w) => /trường/.test(w.label));
})(), { label: 'Có trường trong 2 ô (1/2 khu)', value: 8 });
eq('kinh tế = 50 + 2 × (thu − bảo trì), có bảng giải thích', (() => {
  const r = C.simulate(build(rich(), [['dien-mat-troi', 0, 0], ['nha-may', 1, 0]]));
  return [r.net, r.indices.economy, r.why.economy.map((w) => w.value)];
})(), [21, 92, [25, -4]]);
eq('mọi chỉ số có bảng "vì sao" (Năng lượng, Kinh tế, Môi trường, Khoa học, Công nghệ, Sống)', (() => {
  const r = C.simulate(build(rich(), [['dien-mat-troi', 0, 0], ['khu-dan-cu', 1, 1], ['truong-hoc', 2, 0], ['phong-thi-nghiem', 0, 1]]));
  return Object.keys(r.why).filter((k) => r.why[k].length > 0).length;
})(), 6);
eq('chỉ số luôn trong 0–100 (thành phố toàn nhiệt điện + nhà máy)', (() => {
  const st = build(rich(), [['nhiet-dien', 0, 0], ['nhiet-dien', 1, 0], ['nhiet-dien', 2, 0], ['nha-may', 0, 1], ['nha-may', 1, 1], ['nha-may', 2, 1], ['nha-may', 3, 1]]);
  return Object.values(C.simulate(st).indices).every((v) => v >= 0 && v <= 100);
})(), true);

// ── 4. Qua năm, mục tiêu ──
eq('qua 1 năm: cộng tiền ròng, ghi lịch sử', (() => {
  const s = build(rich(), [['dien-mat-troi', 0, 0], ['nha-may', 1, 0]]);
  const n = C.apply(s, { type: 'next-year' }).state;
  return [n.year, n.money - s.money, n.history.length];
})(), [2, 21, 1]);
// 3 trạm mặt trời = 75 MW ≥ 58 MW cần; mọi khu dân cư đều có trường + bệnh viện trong 2 ô và công viên sát bên.
const green = build(rich(), [['dien-mat-troi', 2, 2], ['dien-mat-troi', 0, 5], ['dien-mat-troi', 5, 5],
  ['khu-dan-cu', 1, 1], ['khu-dan-cu', 3, 1], ['khu-dan-cu', 1, 2], ['khu-dan-cu', 3, 0],
  ['truong-hoc', 2, 1], ['benh-vien', 2, 0], ['cong-vien', 0, 1], ['cong-vien', 4, 1], ['cong-vien', 0, 3], ['phong-thi-nghiem', 0, 0], ['trung-tam-ai', 5, 0], ['nha-may', 5, 1], ['cong-vien', 4, 0]]);
eq('có thể đạt đủ 6 mục tiêu "thành phố xanh" (lời giải mẫu)', C.goals(green).filter((g) => !g.met).map((g) => g.id), []);
eq('dữ liệu lưu bị sửa (ô trên sông, loại lạ, tiền khổng lồ) → làm sạch', (() => {
  const s = C.sanitize({ year: 3, money: 1e12, tiles: { '0,0': 'khu-dan-cu', '5,2': 'khu-dan-cu', '1,1': 'lau-dai', '9,9': 'cong-vien' } });
  return [s.year, s.money, s.tiles];
})(), [3, 300, { '0,0': 'khu-dan-cu' }]);

// ── 5. Nhiệm vụ: tiền điện ──
eq('điện năng: 50 W × 10 giờ × 30 ngày = 15 kWh (khớp câu hỏi)', M.kwh(50, 10), 15);
eq('bậc thang: 120 kWh = 50×1800 + 50×1900 + 20×2200', M.bill(120).money, 50 * 1800 + 50 * 1900 + 20 * 2200);
eq('bậc thang: mỗi bậc chỉ tính phần trong bậc', M.bill(120).rows.map((r) => r.kwh), [50, 50, 20]);
eq('giữ mức tối thiểu: tủ lạnh luôn 24 giờ, nồi cơm ≥ 1 giờ dù nhập 0', (() => { const u = M.usage({ 'tu-lanh': 0, 'noi-com': 0 }); return [u.find((x) => x.id === 'tu-lanh').hours, u.find((x) => x.id === 'noi-com').hours]; })(), [24, 1]);
const start = M.scoreElectric({}, {});
eq('mức dùng ban đầu vượt ngân sách (bài toán có việc để làm)', [start.budgetOk, start.bill.money > M.BUDGET], [false, true]);
const saved = M.scoreElectric({ 'may-lanh': 2, tivi: 3 }, { e1: 0, e2: 0, e3: 0 });
eq('giảm máy lạnh + tivi → dưới ngân sách; đúng 3 câu → 100 điểm', [saved.budgetOk, saved.score], [true, 100]);
eq('đáp án câu e1 khớp phép tính thật', M.electricQuestions()[0].options[0], `${M.kwh(50, 10)} kWh`);

// ── 6. Nhiệm vụ: phân loại rác ──
eq('đủ 4 thùng; mỗi thùng có ít nhất 3 món', Object.keys(M.BINS).map((b) => M.WASTE.filter((w) => w.bin === b).length >= 3), [true, true, true, true]);
eq('pin, bóng huỳnh quang, thuốc hết hạn, bình xịt → nguy hại (thu gom riêng)', ['pin-cu', 'bong-huynh-quang', 'thuoc-het-han', 'binh-xit'].map((id) => M.WASTE.find((w) => w.id === id).bin), ['nguy-hai', 'nguy-hai', 'nguy-hai', 'nguy-hai']);
eq('mỗi món có giải thích vì sao', M.WASTE.every((w) => w.why && w.why.length > 10), true);
const perfect = Object.fromEntries(M.WASTE.map((w) => [w.id, w.bin]));
eq('phân đúng hết → 100; bỏ pin vào rác khác → trừ điểm, có giải thích', [M.scoreWaste(perfect).score, (() => { const r = M.scoreWaste({ ...perfect, 'pin-cu': 'khac' }); return [r.score < 100, r.rows.find((x) => x.id === 'pin-cu').ok]; })()], [100, [true, false]]);

console.log(fails ? `\n✗ ${fails} kiểm tra lỗi` : '\n✓ smart-city + life-missions: mọi kiểm tra đạt');
process.exit(fails ? 1 : 0);
