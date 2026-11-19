/* Unit test khung bí cảnh + Bí cảnh 1 "Thành phố mất điện" (luật thuần, tất định) + nối vào luật tu luyện.
   Chạy: node js/techrealm/__tests__/challenge-core.test.js */
'use strict';
const path = require('path');
const E = require(path.join(__dirname, '..', 'challenge-core.js'));
const TP = require(path.join(__dirname, '..', 'thanh-pho-mat-dien-core.js'));
require(path.join(__dirname, '..', 'cultivation-core.js'));
const S = require(path.join(__dirname, '..', 'cultivation-service.js'));

let fails = 0;
function eq(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) fails++;
  console.log((ok ? 'PASS  ' : 'FAIL  ') + label + (ok ? '' : '  got ' + JSON.stringify(actual).slice(0, 300) + ' want ' + JSON.stringify(expected).slice(0, 300)));
}
const CID = 'thanh-pho-mat-dien';
const lv = (id) => E.levelOf(CID, id);
const { MATERIALS, circuitLit } = TP.data;

/* "Người chơi" viết bằng code: đọc trạng thái, ra thao tác như người thật (mỗi thao tác cách 1,5 giây). */
function play(levelId, seed, strategy) {
  const L = lv(levelId);
  let s = L.init(E.rng(seed));
  const actions = [];
  let t = 0;
  const act = (a) => { t += 1500; const full = Object.assign({ t }, a); actions.push(full); s = L.apply(E.clone(s), full); };
  strategy(s, act, () => s);
  return { actions, state: s };
}
const answerAll = (get, act, wrongFirst) => get().qs.forEach((q) => {
  if (wrongFirst) act({ type: 'answer', q: q.id, o: (q.correct + 1) % q.options.length });
  act({ type: 'answer', q: q.id, o: q.correct });
});
const cond = (s) => s.palette.filter((m) => MATERIALS[m].conductor);
const ins = (s) => s.palette.filter((m) => !MATERIALS[m].conductor);
function solveL1(s0, act, get, sloppy) {
  const c = cond(get()); const i = ins(get());
  if (sloppy) { act({ type: 'place', slot: 'a', m: i[0] }); act({ type: 'place', slot: 'b', m: c[0] }); act({ type: 'test' }); }
  act({ type: 'place', slot: 'a', m: c[0] }); act({ type: 'place', slot: 'b', m: c[1] }); act({ type: 'test' });
  act({ type: 'place', slot: 'a', m: c[2] }); act({ type: 'toggle' }); act({ type: 'test' });
  act({ type: 'place', slot: 'm', m: c[0] }); act({ type: 'place', slot: 'h', m: c[1] }); act({ type: 'place', slot: 'p', m: i[0] }); act({ type: 'test' });
  answerAll(get, act, sloppy);
}

// ── 1. Hạt giống, nhật ký ──
eq('cùng seed → cùng dãy số; khác seed → khác', [E.rng(42).next() === E.rng(42).next(), E.rng(42).next() === E.rng(43).next()], [true, false]);
eq('nhật ký: thời điểm lùi → từ chối', E.validateLog([{ t: 5, type: 'test' }, { t: 3, type: 'test' }]) !== null, true);
eq('nhật ký: 50 thao tác trong 1 giây → "nhanh bất thường"', /nhanh bất thường/.test(E.validateLog(Array.from({ length: 50 }, (_, i) => ({ t: i * 20, type: 'test' }))) || ''), true);
eq('nhật ký: quá 600 thao tác / thao tác quá dài → từ chối', [!!E.validateLog(Array.from({ length: 601 }, (_, i) => ({ t: i * 500, type: 'x' }))), !!E.validateLog([{ t: 1, type: 'x', junk: 'y'.repeat(300) }])], [true, true]);

// ── 2. Vật lý: mạch điện ──
const loop = { kind: 'loop', slots: ['a'], switch: true, lamps: ['den'] };
eq('mạch kín, vật dẫn, công tắc đóng → sáng; công tắc mở → tắt', [circuitLit(loop, { a: 'dong' }, true).den, circuitLit(loop, { a: 'dong' }, false).den], [true, false]);
eq('nối bằng vật cách điện / để trống → tắt', [circuitLit(loop, { a: 'nhua' }, true).den, circuitLit(loop, {}, true).den], [false, false]);
const par = { kind: 'parallel', main: ['m'], branches: [{ lamp: 'H', slots: ['h'] }, { lamp: 'P', slots: ['p'] }] };
eq('song song: ngắt 1 nhánh, nhánh kia vẫn sáng; đứt mạch chính → tắt hết', [circuitLit(par, { m: 'sat', h: 'chi', p: 'len' }), circuitLit(par, { m: 'go', h: 'chi', p: 'dong' })], [{ H: true, P: false }, { H: false, P: false }]);
eq('than chì (ruột bút chì) dẫn điện; thủy tinh, cao su, gỗ khô, len không', ['chi', 'thuytinh', 'caosu', 'go', 'len'].map((m) => MATERIALS[m].conductor), [true, false, false, false, false]);

// ── 3. Màn 1 ──
const good1 = play('mach-dien', 7, (s, act, get) => solveL1(s, act, get, false));
const r1 = E.replay(CID, 'mach-dien', 7, good1.actions);
eq('màn 1 làm đúng ngay: hoàn thành, 3 sao, 3 lần thử', [r1.result.completed, r1.result.stars, r1.state.tests], [true, 3, 3]);
eq('chạy lại = đúng trạng thái người chơi thấy', JSON.stringify(r1.state) === JSON.stringify(good1.state), true);
const sloppy1 = play('mach-dien', 7, (s, act, get) => solveL1(s, act, get, true));
const rs = E.replay(CID, 'mach-dien', 7, sloppy1.actions);
eq('màn 1 có thử sai + trả lời sai trước: vẫn hoàn thành nhưng điểm thấp hơn', [rs.result.completed, rs.result.score < r1.result.score, rs.result.parts.application], [true, true, 0]);
eq('nối sai → đèn không sáng, chưa qua vòng', (() => { const p = play('mach-dien', 7, (s, act, get) => { act({ type: 'place', slot: 'a', m: ins(get())[0] }); act({ type: 'place', slot: 'b', m: cond(get())[0] }); act({ type: 'test' }); }); return [p.state.round, p.state.lastLit.den]; })(), [0, false]);
eq('đặt vật liệu KHÔNG có trong túi → bỏ qua', (() => { const p = play('mach-dien', 7, (s, act, get) => { const notIn = Object.keys(MATERIALS).find((m) => !get().palette.includes(m)); act({ type: 'place', slot: 'a', m: notIn }); }); return p.state.placed; })(), {});
eq('nối mạch hoàn hảo nhưng bỏ câu hỏi vận dụng → chưa hoàn thành, bị giới hạn 40 điểm (không giới hạn sẽ là ~80)', (() => {
  const r = E.replay(CID, 'mach-dien', 7, good1.actions.filter((a) => a.type !== 'answer'));
  const p = r.result.parts;
  return [r.result.completed, r.result.score, p.accuracy + p.solving + p.time + p.attempts > 40, r.result.stars];
})(), [false, 40, true, 0]);

// ── 4. Màn 2 ──
function solveL2(s, act, get, mode) {
  const st = get();
  const others = st.buildings.filter((b) => !b.essential);
  let best = null;
  for (let mask = 0; mask < 1 << others.length; mask++) {
    const pick = others.filter((_, i) => (mask >> i) & 1);
    const total = st.buildings.filter((b) => b.essential).concat(pick).reduce((t, b) => t + b.demand, 0);
    if (total <= st.cap && (!best || total > best.total)) best = { total, pick };
  }
  if (mode === 'overload') { st.buildings.forEach((b) => act({ type: 'toggle', id: b.id })); act({ type: 'submit' }); st.buildings.forEach((b) => act({ type: 'toggle', id: b.id })); }
  st.buildings.filter((b) => b.essential).forEach((b) => act({ type: 'toggle', id: b.id }));
  (mode === 'lazy' ? [] : best.pick).forEach((b) => act({ type: 'toggle', id: b.id }));
  act({ type: 'submit' });
  answerAll(get, act, false);
}
eq('mức tối ưu để chấm điểm LUÔN gồm nơi thiết yếu (không phạt học sinh vì giữ Bệnh viện)', TP.data.bestTotal([{ id: 'bv', demand: 60, essential: true }, { id: 'x', demand: 45 }, { id: 'y', demand: 45 }], 100), 60);
eq('mức tối ưu tính cả khu bắt buộc theo sự kiện (Đèn đường lúc trời tối)', TP.data.bestTotal([{ id: 'bv', demand: 30, essential: true }, { id: 'den', demand: 10 }, { id: 'sieu-thi', demand: 65 }], 100, ['den']), 40);
const g2 = play('phan-phoi', 11, (s, act, get) => solveL2(s, act, get, 'best'));
const r2 = E.replay(CID, 'phan-phoi', 11, g2.actions);
eq('màn 2 tối ưu: hoàn thành, giải quyết vấn đề 25/25, 3 sao', [r2.result.completed, r2.result.parts.solving, r2.result.stars], [true, 25, 3]);
eq('câu hỏi tính toán đúng: còn dư = công suất − đang dùng', (() => { const q = g2.state.qs[0]; return q.options[q.correct]; })(), `${g2.state.cap - g2.state.final} kW`);
const lazy = E.replay(CID, 'phan-phoi', 11, play('phan-phoi', 11, (s, act, get) => solveL2(s, act, get, 'lazy')).actions);
eq('chỉ bật 2 nơi thiết yếu: vẫn qua nhưng điểm "giải quyết vấn đề" thấp', [lazy.result.completed, lazy.result.parts.solving < 20], [true, true]);
const over = play('phan-phoi', 11, (s, act, get) => solveL2(s, act, get, 'overload'));
eq('bật hết → quá tải, không qua; sửa lại thì qua ở lần 2 (độ chính xác 1/2)', [over.state.submits, E.replay(CID, 'phan-phoi', 11, over.actions).eval.accuracy], [2, 0.5]);
eq('tắt nơi thiết yếu → không qua', (() => { const p = play('phan-phoi', 11, (s, act) => { act({ type: 'toggle', id: 'truong-hoc' }); act({ type: 'submit' }); }); return [p.state.passedAt, p.state.lastCheck.essentials]; })(), [0, false]);

// ── 5. Màn 3 ──
const g3 = play('du-lieu', 99, (s, act, get) => answerAll(get, act, false));
const r3 = E.replay(CID, 'du-lieu', 99, g3.actions);
eq('màn 3 trả lời đúng hết: hoàn thành, 3 sao', [r3.result.completed, r3.result.stars], [true, 3]);
eq('200 seed: điểm bất thường là số lớn nhất của chính khu đó VÀ ≥ 1,8× các khu khác cùng giờ (nhìn biểu đồ là thấy)', (() => {
  const off = [];
  for (let seed = 1; seed <= 200; seed++) {
    const s = lv('du-lieu').init(E.rng(seed));
    const d = s.districts.indexOf(s.qs[0].options[s.qs[0].correct]);
    const h = s.hours.indexOf(Number(s.qs[1].options[s.qs[1].correct].split(' ')[0]));
    const v = s.data[d][h];
    const peers = s.data.filter((_, i) => i !== d).map((r) => r[h]);
    if (v !== Math.max(...s.data[d]) || v < 1.8 * Math.max(...peers)) off.push(seed);
  }
  return off;
})(), []);

// ── 6. Boss ──
function solveBoss(s, act, get, greedy) {
  for (let turn = 0; turn < 5; turn++) {
    const st = get(); const ev = st.events[turn];
    const cap = st.cap0 + (ev.cap || 0);
    const bs = st.base.map((b) => ({ ...b, demand: b.demand + ((ev.demand && ev.demand[b.id]) || 0) }));
    let want;
    if (greedy) want = new Set(bs.map((b) => b.id));
    else {
      let best = null;
      for (let mask = 0; mask < 64; mask++) {
        const on = bs.filter((_, i) => (mask >> i) & 1);
        if (bs.some((b) => b.essential && !on.includes(b)) || (ev.must || []).some((id) => !on.find((b) => b.id === id))) continue;
        const total = on.reduce((t, b) => t + b.demand, 0);
        if (total <= cap && (!best || total > best.total)) best = { total, on };
      }
      want = new Set(best.on.map((b) => b.id));
    }
    bs.forEach((b) => { if (!!get().on[b.id] !== want.has(b.id)) act({ type: 'toggle', id: b.id }); });
    act({ type: 'end-turn' });
  }
  answerAll(get, act, false);
}
const gb = play('bao-qua-tai', 5, (s, act, get) => solveBoss(s, act, get, false));
const rb = E.replay(CID, 'bao-qua-tai', 5, gb.actions);
eq('Boss chơi tối ưu: 5 lượt không quá tải, Boss hết máu, hoàn thành 3 sao', [rb.state.log.every((l) => !l.overload), rb.state.hp, rb.result.completed, rb.result.stars], [true, 0, true, 3]);
const greedy = E.replay(CID, 'bao-qua-tai', 5, play('bao-qua-tai', 5, (s, act, get) => solveBoss(s, act, get, true)).actions);
eq('Boss bật hết mọi thứ: quá tải liên tục → thua', [greedy.state.log.filter((l) => l.overload).length >= 3, greedy.result.completed], [true, false]);

// ── 7. Nhiều seed: câu đố luôn giải được, đáp án duy nhất, phương án không trùng ──
const bad = [];
for (let seed = 1; seed <= 200; seed++) {
  for (const id of ['mach-dien', 'phan-phoi', 'du-lieu', 'bao-qua-tai']) {
    const s = lv(id).init(E.rng(seed));
    (s.qs || []).forEach((q) => { if (new Set(q.options).size !== q.options.length || q.correct < 0) bad.push(`${id}#${seed}:${q.id}`); });
    if (id === 'mach-dien' && (cond(s).length !== 3 || ins(s).length !== 3)) bad.push(`${id}#${seed}:palette`);
    if (id === 'phan-phoi' && !(s.best >= s.buildings.filter((b) => b.essential).reduce((t, b) => t + b.demand, 0))) bad.push(`${id}#${seed}:best`);
    if (id === 'du-lieu') {
      const sums = s.hours.map((_, h) => s.data.reduce((t, r) => t + r[h], 0));
      if (sums.filter((v) => v === Math.max(...sums)).length !== 1) bad.push(`${id}#${seed}:peak`);
    }
  }
  const p = play('phan-phoi', seed, (s, act, get) => solveL2(s, act, get, 'best'));
  if (!E.replay(CID, 'phan-phoi', seed, p.actions).result.completed) bad.push(`phan-phoi#${seed}:solve`);
  const b = play('bao-qua-tai', seed, (s, act, get) => solveBoss(s, act, get, false));
  if (!E.replay(CID, 'bao-qua-tai', seed, b.actions).result.completed) bad.push(`boss#${seed}:solve`);
}
eq('200 seed × 4 màn: không lỗi (giải được, đáp án duy nhất, phương án không trùng)', bad.slice(0, 10), []);

// ── 8. Xác thực phần thưởng: máy chủ chạy lại, không tin điểm gửi lên ──
const L = 'LABCDEFGH23';
const sub = (levelId, seed, actions, extra) => Object.assign({ learnerId: L, challengeId: CID, levelId, seed, actions }, extra || {});
eq('gói tin kèm score: 100 nhưng chơi dở → máy chủ chấm theo nhật ký (không có sự kiện vì chưa hoàn thành)', E.rewardEvent(sub('mach-dien', 7, good1.actions.slice(0, 3), { score: 100 })), null);
eq('đổi seed so với lúc chơi → nhật ký không còn đúng → không thưởng', E.rewardEvent(sub('bao-qua-tai', 6, gb.actions)), null);
eq('thiếu mã học viên → không thưởng', E.rewardEvent(Object.assign(sub('mach-dien', 7, good1.actions), { learnerId: '' })), null);
let tt = Date.parse('2026-11-17T01:00:00Z');
const store = S.createMemoryStore();
const svc = S.create({ store, clock: () => new Date((tt += 6e4)).toISOString() });
const award = (s) => { const e = E.rewardEvent(s); return e && svc.recordEvent(e, { kind: 'system' }); };
const a1 = award(sub('mach-dien', 7, good1.actions));
const a2 = award(sub('mach-dien', 7, good1.actions));
const ab = award(sub('bao-qua-tai', 5, gb.actions));
eq('màn 1 (3 sao) → +30 công huân; gửi lại → trùng; Boss 3 sao → 30 + 40', [a1.tx.amount, a2.duplicate, ab.tx.amount], [30, true, 70]);
eq('điểm ghi vào sổ cái = điểm máy chủ chạy lại', a1.tx.facts.score, r1.result.score);

console.log(fails ? `\n✗ ${fails} kiểm tra lỗi` : '\n✓ challenge-core + Thành phố mất điện: mọi kiểm tra đạt');
process.exit(fails ? 1 : 0);
