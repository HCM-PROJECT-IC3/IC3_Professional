/* ============================================================
   js/techrealm/thanh-pho-mat-dien-core.js — BÍ CẢNH 1: THÀNH PHỐ MẤT ĐIỆN (luật thuần, tất định).
   Kiến thức: vật lý (mạch điện, vật dẫn/cách điện, mạch song song), năng lượng, toán (cộng trừ trong giới hạn),
   dữ liệu (đọc biểu đồ, phát hiện bất thường).
   Đăng ký vào EduChallenge (challenge-core.js — phải nạp trước). Chạy ở trình duyệt, Node (test) và Apps Script.
   Kịch bản, nhân vật, bản đồ: docs/techrealm/GAME_DESIGN.md §2.
   ============================================================ */
(function (root) {
  'use strict';
  const E = root.EduChallenge;
  if (!E) throw new Error('Cần nạp js/techrealm/challenge-core.js trước');

  /* ── Dữ liệu chung ── */
  const MATERIALS = {
    dong: { name: 'Dây đồng', conductor: true },
    sat: { name: 'Đinh sắt', conductor: true },
    nhom: { name: 'Giấy nhôm', conductor: true },
    chi: { name: 'Ruột bút chì', conductor: true }, // than chì dẫn điện
    nhua: { name: 'Thanh nhựa', conductor: false },
    go: { name: 'Que gỗ khô', conductor: false },
    len: { name: 'Sợi len', conductor: false },
    thuytinh: { name: 'Ống thủy tinh', conductor: false },
    caosu: { name: 'Cục tẩy cao su', conductor: false },
  };
  const BUILDINGS = [
    { id: 'benh-vien', name: 'Bệnh viện', base: 30, essential: true },
    { id: 'tram-nuoc', name: 'Trạm bơm nước', base: 20, essential: true },
    { id: 'truong-hoc', name: 'Trường học', base: 15 },
    { id: 'nha-o', name: 'Khu nhà ở', base: 35 },
    { id: 'sieu-thi', name: 'Siêu thị', base: 25 },
    { id: 'den-duong', name: 'Đèn đường', base: 10 },
  ];

  /** Câu hỏi trắc nghiệm: phương án đúng luôn khai báo ở vị trí 0, rồi xáo theo seed. */
  function mcq(r, id, text, options) {
    const order = r.shuffle(options.map(function (_, i) { return i; }));
    return { id: id, text: text, options: order.map(function (i) { return options[i]; }), correct: order.indexOf(0) };
  }
  function answerQ(s, a) {
    const q = s.qs.filter(function (x) { return x.id === a.q; })[0];
    if (!q || !(Number.isInteger(a.o) && a.o >= 0 && a.o < q.options.length)) return s;
    const rec = s.answers[q.id] || (s.answers[q.id] = { first: a.o, tries: 0, solved: false });
    if (rec.solved) return s;
    rec.tries++;
    if (a.o === q.correct) rec.solved = true;
    return s;
  }
  const firstRight = function (s, ids) { return ids.filter(function (id) { return s.answers[id] && s.answers[id].first === s.qs.filter(function (q) { return q.id === id; })[0].correct; }).length; };
  const allSolved = function (s) { return s.qs.every(function (q) { return s.answers[q.id] && s.answers[q.id].solved; }); };

  /* ═════════ Màn 1: Trạm biến áp — nối lại mạch điện ═════════ */
  function circuitLit(round, placed, sw) {
    const ok = function (slot) { return !!placed[slot] && !!MATERIALS[placed[slot]] && MATERIALS[placed[slot]].conductor; };
    const lit = {};
    if (round.kind === 'loop') {
      const on = round.slots.every(ok) && (round.switch === undefined || sw === true);
      round.lamps.forEach(function (l) { lit[l] = on; });
    } else {
      const main = round.main.every(ok);
      round.branches.forEach(function (b) { lit[b.lamp] = main && b.slots.every(ok); });
    }
    return lit;
  }
  const L1 = {
    id: 'mach-dien', title: 'Trạm biến áp: nối lại mạch điện', par: 150,
    init: function (r) {
      const cond = r.shuffle(['dong', 'sat', 'nhom', 'chi']).slice(0, 3);
      const ins = r.shuffle(['nhua', 'go', 'len', 'thuytinh', 'caosu']).slice(0, 3);
      const palette = r.shuffle(cond.concat(ins));
      const c0 = MATERIALS[cond[0]].name.toLowerCase();
      return {
        palette: palette, round: 0, placed: {}, sw: false, tests: 0, firstOk: [], roundTests: 0, lastLit: null, done: false,
        rounds: [
          { kind: 'loop', title: 'Nối 2 chỗ đứt để đèn sáng', slots: ['a', 'b'], lamps: ['den'], goal: { den: true } },
          { kind: 'loop', title: 'Mạch có công tắc: làm đèn sáng', slots: ['a'], switch: true, lamps: ['den'], goal: { den: true } },
          { kind: 'parallel', title: 'Chỉ cấp điện cho Bệnh viện, tắt Khu vui chơi để tiết kiệm', main: ['m'],
            branches: [{ lamp: 'benh-vien', name: 'Bệnh viện', slots: ['h'] }, { lamp: 'vui-choi', name: 'Khu vui chơi', slots: ['p'] }],
            goal: { 'benh-vien': true, 'vui-choi': false } },
        ],
        qs: [
          mcq(r, 'q1', 'Vì sao đèn sáng khi em nối bằng ' + c0 + '?', ['Vì ' + c0 + ' là vật dẫn điện, dòng điện đi qua được', 'Vì ' + c0 + ' rất nặng', 'Vì ' + c0 + ' có màu sáng', 'Vì pin tự làm đèn sáng, không cần dây']),
          mcq(r, 'q2', 'Vật nào KHÔNG cho dòng điện đi qua?', [MATERIALS[ins[0]].name, MATERIALS[cond[0]].name, MATERIALS[cond[1]].name, MATERIALS[cond[2]].name]),
          mcq(r, 'q3', 'Trong mạch song song, vì sao Bệnh viện vẫn sáng khi nhánh Khu vui chơi bị ngắt?', ['Mỗi nhánh có đường đi riêng cho dòng điện', 'Bệnh viện có pin riêng', 'Dòng điện chỉ chạy vào toà nhà lớn', 'Vì bóng đèn Khu vui chơi bị hỏng']),
        ],
        answers: {},
      };
    },
    apply: function (s, a) {
      const rd = s.rounds[s.round];
      if (a.type === 'answer') { if (!rd) { answerQ(s, a); if (allSolved(s)) s.done = true; } return s; }
      if (!rd) return s;
      const slots = rd.kind === 'loop' ? rd.slots : rd.main.concat(rd.branches[0].slots, rd.branches[1].slots);
      if (a.type === 'place' && slots.indexOf(a.slot) >= 0 && s.palette.indexOf(a.m) >= 0) s.placed[a.slot] = a.m;
      else if (a.type === 'clear' && slots.indexOf(a.slot) >= 0) delete s.placed[a.slot];
      else if (a.type === 'toggle' && rd.switch) s.sw = !s.sw;
      else if (a.type === 'test') {
        s.tests++; s.roundTests++;
        const lit = circuitLit(rd, s.placed, s.sw);
        s.lastLit = lit;
        const ok = Object.keys(rd.goal).every(function (k) { return !!lit[k] === rd.goal[k]; });
        if (ok) { s.firstOk.push(s.roundTests === 1); s.round++; s.placed = {}; s.sw = false; s.roundTests = 0; s.lastLit = null; }
      }
      return s;
    },
    evaluate: function (s) {
      const built = s.round >= s.rounds.length;
      return {
        completed: built && allSolved(s),
        accuracy: s.firstOk.filter(Boolean).length / s.rounds.length,
        solving: built ? Math.min(1, s.rounds.length / Math.max(s.rounds.length, s.tests)) : s.round / s.rounds.length * 0.5,
        application: firstRight(s, ['q1', 'q2', 'q3']) / 3,
        attempts: s.tests, minAttempts: s.rounds.length,
      };
    },
  };

  /* ═════════ Màn 2: Nhà máy điện — phân phối năng lượng ═════════ */
  function totalOn(bs, on) { return bs.filter(function (b) { return on[b.id]; }).reduce(function (t, b) { return t + b.demand; }, 0); }
  function bestTotal(bs, cap, must) {
    let best = -1;
    for (let mask = 0; mask < (1 << bs.length); mask++) {
      let t = 0; let ok = true;
      for (let i = 0; i < bs.length; i++) {
        const on = (mask >> i) & 1;
        if (!on && (bs[i].essential || (must && must.indexOf(bs[i].id) >= 0))) { ok = false; break; }
        if (on) t += bs[i].demand;
      }
      if (ok && t <= cap && t > best) best = t;
    }
    return best;
  }
  const L2 = {
    id: 'phan-phoi', title: 'Nhà máy điện: chia điện cho thành phố', par: 120,
    init: function (r) {
      const bs = BUILDINGS.map(function (b) { return { id: b.id, name: b.name, demand: Math.max(5, b.base + r.int(-1, 1) * 5), essential: !!b.essential }; });
      const cap = r.pick([90, 100, 110]);
      return { buildings: bs, cap: cap, on: {}, submits: 0, passedAt: 0, done: false, qs: [], answers: {}, perm: r.shuffle([0, 1, 2, 3]), best: bestTotal(bs, cap) };
    },
    apply: function (s, a) {
      if (a.type === 'answer') { if (s.passedAt) { answerQ(s, a); if (allSolved(s)) s.done = true; } return s; }
      if (s.passedAt) return s;
      if (a.type === 'toggle' && s.buildings.some(function (b) { return b.id === a.id; })) s.on[a.id] = !s.on[a.id];
      else if (a.type === 'submit') {
        s.submits++;
        const t = totalOn(s.buildings, s.on);
        const essentials = s.buildings.every(function (b) { return !b.essential || s.on[b.id]; });
        s.lastCheck = { total: t, overload: t > s.cap, essentials: essentials };
        if (t <= s.cap && essentials) {
          s.passedAt = s.submits; s.final = t;
          const left = s.cap - t;
          const opts = [left, s.cap + t, t, left + 10].map(String);
          const order = s.perm;
          s.qs = [
            { id: 'q1', text: 'Máy phát có ' + s.cap + ' kW. Các khu em bật dùng ' + t + ' kW. Còn dư bao nhiêu kW?', options: order.map(function (i) { return opts[i] + ' kW'; }), correct: order.indexOf(0) },
            { id: 'q2', text: 'Vì sao phải cấp điện cho Bệnh viện và Trạm bơm nước trước?', options: order.map(function (i) { return ['Vì đó là nơi thiết yếu cho sức khoẻ và nước sạch', 'Vì hai nơi đó dùng ít điện nhất', 'Vì hai nơi đó gần nhà máy nhất', 'Vì đèn ở đó đẹp nhất'][i]; }), correct: order.indexOf(0) },
          ];
        }
      }
      return s;
    },
    evaluate: function (s) {
      return {
        completed: !!s.passedAt && allSolved(s),
        accuracy: !s.passedAt ? 0 : s.passedAt === 1 ? 1 : 0.5,
        solving: s.passedAt && s.best > 0 ? s.final / s.best : 0,
        application: firstRight(s, ['q1', 'q2']) / 2,
        attempts: s.submits, minAttempts: 1,
      };
    },
  };

  /* ═════════ Màn 3: Phòng điều khiển — tìm chỗ rò điện trong dữ liệu ═════════ */
  const DISTRICTS = ['Khu Bắc', 'Khu Nam', 'Khu Đông', 'Khu Tây'];
  const HOURS = [6, 9, 12, 15, 18, 21];
  const PROFILE = [20, 30, 35, 30, 45, 40]; // ít buổi sáng, đỉnh buổi tối
  const L3 = {
    id: 'du-lieu', title: 'Phòng điều khiển: tìm chỗ rò điện', par: 150,
    init: function (r) {
      const factor = DISTRICTS.map(function () { return 0.8 + r.int(0, 4) / 10; });
      const data = DISTRICTS.map(function (_, d) { return PROFILE.map(function (p) { return Math.round(p * factor[d]) + r.int(-3, 3); }); });
      const ad = r.int(0, 3);
      const ah = r.int(0, 2) * 2 + 1; // 9h, 15h hoặc 21h — tránh trùng đỉnh tự nhiên 18h
      // Rò điện phải NHÌN THẤY được: cao nhất trong chính khu đó và ≥ 1,8× các khu khác cùng giờ (test kiểm 200 seed).
      const own = Math.max.apply(null, data[ad].filter(function (_, h) { return h !== ah; }));
      const peers = Math.max.apply(null, data.filter(function (_, d) { return d !== ad; }).map(function (row) { return row[ah]; }));
      data[ad][ah] = Math.round(Math.max(own, peers) * 1.8) + 5;
      const sums = HOURS.map(function (_, h) { return data.reduce(function (t, row) { return t + row[h]; }, 0); });
      let peak = 0;
      sums.forEach(function (v, h) { if (v > sums[peak]) peak = h; });
      sums.forEach(function (v, h) { if (h !== peak && v === sums[peak]) { data[0][peak] += 1; sums[peak] += 1; } });
      return {
        data: data, districts: DISTRICTS, hours: HOURS, done: false, answers: {},
        qs: [
          mcq(r, 'q1', 'Khu nào có số liệu bất thường (bị rò điện)?', [DISTRICTS[ad]].concat(DISTRICTS.filter(function (_, i) { return i !== ad; }))),
          mcq(r, 'q2', 'Bất thường xảy ra lúc mấy giờ?', [HOURS[ah] + ' giờ'].concat(HOURS.filter(function (_, i) { return i !== ah; }).slice(0, 3).map(function (h) { return h + ' giờ'; }))),
          mcq(r, 'q3', 'Lúc mấy giờ cả thành phố dùng nhiều điện nhất?', [HOURS[peak] + ' giờ'].concat(HOURS.filter(function (_, i) { return i !== peak; }).slice(0, 3).map(function (h) { return h + ' giờ'; }))),
          mcq(r, 'q4', 'Vì sao phải sửa chỗ rò điện ngay?', ['Vì rò điện vừa tốn điện vô ích, vừa có thể gây giật điện, cháy nổ', 'Vì rò điện làm đèn sáng hơn', 'Vì rò điện giúp tiết kiệm tiền', 'Vì đồng hồ điện sẽ chạy chậm lại']),
        ],
      };
    },
    apply: function (s, a) {
      if (a.type === 'answer') { answerQ(s, a); if (allSolved(s)) s.done = true; }
      return s;
    },
    evaluate: function (s) {
      const tries = s.qs.reduce(function (t, q) { return t + (s.answers[q.id] ? s.answers[q.id].tries : 0); }, 0);
      return {
        completed: allSolved(s),
        accuracy: firstRight(s, ['q1', 'q2', 'q3']) / 3,
        solving: Math.max(0, 1 - Math.max(0, tries - 4) / 6),
        application: firstRight(s, ['q4']),
        attempts: tries, minAttempts: 4,
      };
    },
  };

  /* ═════════ Boss: Cơn bão quá tải — 5 lượt giữ thành phố không sập điện ═════════ */
  const EVENTS = [
    { id: 'set', text: 'Sét đánh trúng trạm: máy phát giảm 20 kW.', cap: -20 },
    { id: 'nang', text: 'Nắng nóng: Khu nhà ở cần thêm 15 kW cho quạt.', demand: { 'nha-o': 15 } },
    { id: 'toi', text: 'Trời tối sầm: phải bật Đèn đường cho an toàn.', must: ['den-duong'] },
    { id: 'cap-cuu', text: 'Bệnh viện có ca mổ cấp cứu: cần thêm 10 kW.', demand: { 'benh-vien': 10 } },
    { id: 'mat-troi', text: 'Pin mặt trời trên mái trường phát thêm 15 kW.', cap: 15 },
    { id: 'mua', text: 'Mưa lớn: Trạm bơm nước chạy hết sức, cần thêm 10 kW.', demand: { 'tram-nuoc': 10 } },
  ];
  const BOSS = {
    id: 'bao-qua-tai', title: 'Boss: Cơn bão quá tải', par: 240, boss: true,
    init: function (r) {
      const s = { cap0: 110, base: BUILDINGS.map(function (b) { return { id: b.id, name: b.name, demand: b.base, essential: !!b.essential }; }),
        events: r.shuffle(EVENTS).slice(0, 5), turn: 0, on: { 'benh-vien': true, 'tram-nuoc': true }, hp: 100, log: [], done: false, answers: {},
        qs: [mcq(r, 'q1', 'Khi máy phát bị giảm công suất, em nên tắt khu nào trước?', ['Khu không thiết yếu, như Siêu thị', 'Bệnh viện', 'Trạm bơm nước', 'Tắt hết cả thành phố cho chắc'])] };
      return s;
    },
    apply: function (s, a) {
      if (s.turn >= s.events.length) {
        if (a.type === 'answer') { answerQ(s, a); if (allSolved(s)) s.done = true; }
        return s;
      }
      const ev = s.events[s.turn];
      if (a.type === 'toggle' && s.base.some(function (b) { return b.id === a.id; })) s.on[a.id] = !s.on[a.id];
      else if (a.type === 'end-turn') {
        const cap = s.cap0 + (ev.cap || 0);
        const bs = s.base.map(function (b) { return { id: b.id, essential: b.essential, demand: b.demand + ((ev.demand && ev.demand[b.id]) || 0) }; });
        const total = totalOn(bs, s.on);
        const must = (ev.must || []).every(function (id) { return s.on[id]; });
        const essentials = bs.every(function (b) { return !b.essential || s.on[b.id]; });
        const best = bestTotal(bs, cap, ev.must);
        let ts = 0;
        if (total <= cap) ts = (essentials && must ? 1 : 0.3) * (best > 0 ? total / best : 0);
        const dmg = Math.round(20 * ts);
        s.hp = Math.max(0, s.hp - dmg);
        s.log.push({ event: ev.id, cap: cap, total: total, overload: total > cap, essentials: essentials, must: must, score: ts, dmg: dmg });
        s.turn++;
      }
      return s;
    },
    evaluate: function (s) {
      const n = s.log.length || 1;
      const safe = s.log.filter(function (l) { return !l.overload; }).length;
      return {
        completed: s.turn >= s.events.length && allSolved(s) && safe >= 3,
        accuracy: safe / s.events.length,
        solving: s.log.reduce(function (t, l) { return t + l.score; }, 0) / n,
        application: firstRight(s, ['q1']),
        attempts: 1 + (s.events.length - safe), minAttempts: 1,
      };
    },
  };

  const def = E.register({
    id: 'thanh-pho-mat-dien',
    title: 'Thành phố mất điện',
    levels: [L1, L2, L3, BOSS],
    data: { MATERIALS: MATERIALS, BUILDINGS: BUILDINGS, EVENTS: EVENTS, circuitLit: circuitLit, totalOn: totalOn, bestTotal: bestTotal },
  });
  if (typeof module !== 'undefined' && module.exports) module.exports = def;
})(typeof window !== 'undefined' ? window : globalThis);
