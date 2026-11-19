/* ============================================================
   js/techrealm/smart-city-core.js — THÀNH PHỐ THÔNG MINH (Domain thuần, tất định).

   Bản đồ nhỏ 6×6, 8 loại công trình, 6 chỉ số có công thức RÕ RÀNG (mỗi chỉ số trả kèm bảng "vì sao": từng công trình
   góp bao nhiêu). Quyết định của học sinh (đặt gì, ở đâu, chọn than hay mặt trời) làm thay đổi chỉ số.
   Công trình mở khoá bằng BẰNG CHỨNG HỌC TẬP (bài đã đạt, sao bí cảnh, nhiệm vụ đời sống) — xem unlockStatus.
   Đây là sân tập: không sinh EXP/công huân, nên không cần máy chủ xác thực. Không DOM, không mạng, không ngẫu nhiên.
   Tài liệu: docs/techrealm/SMART_CITY.md
   ============================================================ */
(function (root) {
  'use strict';

  const SIZE = 6;
  // Sông chảy chéo góc dưới phải: không xây được (cũng là ranh giới tự nhiên).
  const WATER = ['5,2', '4,3', '5,3', '3,4', '4,4', '2,5', '3,5'];
  const START_MONEY = 300;

  /* Công trình. Đơn vị: tiền (xu thành phố), điện (MW), các điểm chỉ số mỗi năm.
     energy > 0: cấp điện · energy < 0: dùng điện. Công trình không đủ điện thì KHÔNG hoạt động (không góp gì, vẫn tốn bảo trì). */
  const TYPES = {
    'khu-dan-cu': { name: 'Khu dân cư', cost: 40, upkeep: 0, income: 8, energy: -5, env: -2, sci: 0, tech: 0, pop: 100, priority: 2 },
    'truong-hoc': { name: 'Trường học', cost: 60, upkeep: 4, income: 0, energy: -4, env: 0, sci: 12, tech: 2, pop: 0, priority: 3, serves: 2 },
    'benh-vien': { name: 'Bệnh viện', cost: 80, upkeep: 6, income: 0, energy: -6, env: -1, sci: 4, tech: 2, pop: 0, priority: 4, serves: 2 },
    'cong-vien': { name: 'Công viên', cost: 30, upkeep: 1, income: 0, energy: 0, env: 8, sci: 0, tech: 0, pop: 0, priority: 1 },
    'nha-may': { name: 'Nhà máy', cost: 70, upkeep: 2, income: 25, energy: -10, env: -12, sci: 0, tech: 4, pop: 0, priority: 1 },
    'phong-thi-nghiem': { name: 'Phòng thí nghiệm', cost: 90, upkeep: 6, income: 0, energy: -6, env: 0, sci: 20, tech: 6, pop: 0, priority: 2 },
    'trung-tam-ai': { name: 'Trung tâm AI', cost: 120, upkeep: 8, income: 10, energy: -12, env: 0, sci: 6, tech: 25, pop: 0, priority: 2 },
    'dien-mat-troi': { name: 'Trạm điện mặt trời', group: 'tram-nang-luong', cost: 100, upkeep: 2, income: 0, energy: 25, env: 0, sci: 0, tech: 3, pop: 0, priority: 9 },
    'nhiet-dien': { name: 'Trạm nhiệt điện than', group: 'tram-nang-luong', cost: 50, upkeep: 4, income: 0, energy: 40, env: -18, sci: 0, tech: 0, pop: 0, priority: 9 },
  };

  /* Điều kiện mở khoá — gắn với kiến thức / sản phẩm học tập (Prompt 06 §4).
     evidence: { lessons: số bài đã đạt (mọi khoá), course: { id: số bài đã đạt }, stars: { 'bí cảnh/màn': sao }, missions: { id: điểm } } */
  const UNLOCKS = {
    'khu-dan-cu': { label: 'Mở sẵn — nơi bắt đầu thành phố', test: function () { return true; } },
    'cong-vien': { label: 'Nhiệm vụ "Phân loại rác" từ 60 điểm', test: function (e) { return mission(e, 'phan-loai-rac') >= 60; } },
    'truong-hoc': { label: 'Đạt 1 bài bất kỳ ở Tàng Kinh Các', test: function (e) { return e.lessons >= 1; }, have: function (e) { return [Math.min(e.lessons, 1), 1]; } },
    'nhiet-dien': { label: 'Qua màn "Nhà máy điện" (Bí cảnh 1)', test: function (e) { return star(e, 'thanh-pho-mat-dien/phan-phoi') >= 1; } },
    'dien-mat-troi': { label: 'Qua màn "Nhà máy điện" và nhiệm vụ "Tính tiền điện" từ 60 điểm', test: function (e) { return star(e, 'thanh-pho-mat-dien/phan-phoi') >= 1 && mission(e, 'tien-dien') >= 60; } },
    'benh-vien': { label: 'Đạt 3 bài khoá "Kỹ năng sống trên môi trường số"', test: function (e) { return course(e, 'ky-nang-song-so') >= 3; }, have: function (e) { return [Math.min(course(e, 'ky-nang-song-so'), 3), 3]; } },
    'nha-may': { label: 'Nhiệm vụ "Tính tiền điện" từ 60 điểm', test: function (e) { return mission(e, 'tien-dien') >= 60; } },
    'phong-thi-nghiem': { label: 'Màn "Trạm biến áp" (Bí cảnh 1) đạt 2 sao', test: function (e) { return star(e, 'thanh-pho-mat-dien/mach-dien') >= 2; } },
    'trung-tam-ai': { label: 'Đạt 2 bài khoá "AI nhập môn" và đã xây Phòng thí nghiệm', test: function (e, s) { return course(e, 'ai-nhap-mon') >= 2 && !!s && countOf(s, 'phong-thi-nghiem') > 0; }, have: function (e) { return [Math.min(course(e, 'ai-nhap-mon'), 2), 2]; } },
  };
  function star(e, k) { return (e && e.stars && e.stars[k]) || 0; }
  function mission(e, k) { return (e && e.missions && e.missions[k]) || 0; }
  function course(e, k) { return (e && e.course && e.course[k]) || 0; }
  function countOf(s, type) { return Object.keys(s.tiles).filter(function (k) { return s.tiles[k] === type; }).length; }

  function unlockStatus(evidence, state) {
    const out = {};
    Object.keys(TYPES).forEach(function (t) {
      const u = UNLOCKS[t];
      out[t] = { unlocked: !!u.test(evidence || {}, state), label: u.label, progress: u.have ? u.have(evidence || {}) : null };
    });
    return out;
  }

  function newCity() { return { year: 1, money: START_MONEY, tiles: {}, history: [], log: [] }; }
  const key = function (x, y) { return x + ',' + y; };
  function inMap(x, y) { return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < SIZE && y < SIZE; }
  function near(a, b, r) { const p = a.split(',').map(Number); const q = b.split(',').map(Number); return Math.max(Math.abs(p[0] - q[0]), Math.abs(p[1] - q[1])) <= r; }

  /* ── Mô phỏng: chỉ số + bảng giải thích ──
     1) Điện: cấp = Σ trạm; dùng = Σ nhu cầu. Thiếu điện → tắt công trình ưu tiên THẤP trước (công viên, nhà máy…),
        giữ bệnh viện, trường học. Chỉ số Năng lượng = min(100, 100 × cấp / dùng); không dùng điện → 100.
     2) Môi trường = 70 + Σ tác động môi trường của công trình đang hoạt động (giới hạn 0–100).
     3) Kinh tế (tiền/năm) = Σ thu − Σ bảo trì. Chỉ số = 50 + 2 × tiền/năm (0–100).
     4) Khoa học, Công nghệ = Σ điểm của công trình đang hoạt động (0–100).
     5) Chất lượng sống = trung bình các Khu dân cư: 40 + 15 (có trường trong 2 ô) + 15 (có bệnh viện trong 2 ô)
        + 10 (công viên sát bên) − 15 (nhà máy / nhiệt điện sát bên) − 30 (mất điện); rồi × (0,5 + Môi trường/200). */
  function simulate(s) {
    const keys = Object.keys(s.tiles).sort();
    const list = keys.map(function (k) { return { k: k, t: s.tiles[k], d: TYPES[s.tiles[k]] }; });
    const supply = list.filter(function (b) { return b.d.energy > 0; }).reduce(function (t, b) { return t + b.d.energy; }, 0);
    const users = list.filter(function (b) { return b.d.energy < 0; })
      .sort(function (a, b) { return b.d.priority - a.d.priority || (a.k < b.k ? -1 : 1); });
    let left = supply;
    const powered = {};
    list.forEach(function (b) { if (b.d.energy >= 0) powered[b.k] = true; });
    users.forEach(function (b) { if (-b.d.energy <= left) { left += b.d.energy; powered[b.k] = true; } });
    const demand = users.reduce(function (t, b) { return t - b.d.energy; }, 0);
    const active = list.filter(function (b) { return powered[b.k]; });
    const why = { energy: [], economy: [], environment: [], science: [], technology: [], life: [] };
    const sumBy = function (field, bucket) {
      const by = {};
      active.forEach(function (b) { if (b.d[field]) by[b.d.name] = (by[b.d.name] || 0) + b.d[field]; });
      Object.keys(by).forEach(function (n) { why[bucket].push({ label: n, value: by[n] }); });
      return active.reduce(function (t, b) { return t + (b.d[field] || 0); }, 0);
    };
    const clamp = function (v) { return Math.max(0, Math.min(100, Math.round(v))); };

    why.energy.push({ label: 'Điện cấp', value: supply }, { label: 'Điện cần', value: -demand });
    const energy = demand === 0 ? 100 : clamp((100 * supply) / demand);
    const off = list.filter(function (b) { return !powered[b.k]; });
    if (off.length) why.energy.push({ label: 'Công trình mất điện', value: -off.length });

    const env = clamp(70 + sumBy('env', 'environment'));
    why.environment.unshift({ label: 'Mức gốc', value: 70 });

    const income = active.reduce(function (t, b) { return t + b.d.income; }, 0);
    const upkeep = list.reduce(function (t, b) { return t + b.d.upkeep; }, 0);
    const net = income - upkeep;
    why.economy.push({ label: 'Thu (công trình đang chạy)', value: income }, { label: 'Bảo trì (mọi công trình)', value: -upkeep });
    const economy = clamp(50 + 2 * net);

    const science = clamp(sumBy('sci', 'science'));
    const technology = clamp(sumBy('tech', 'technology'));

    const homes = list.filter(function (b) { return b.t === 'khu-dan-cu'; });
    const has = function (h, type, r) { return active.some(function (b) { return b.t === type && near(h.k, b.k, r); }); };
    const bad = function (h) { return list.some(function (b) { return (b.t === 'nha-may' || b.t === 'nhiet-dien') && powered[b.k] && near(h.k, b.k, 1); }); };
    let life = 0;
    if (homes.length) {
      const per = homes.map(function (h) {
        let v = 40 + (has(h, 'truong-hoc', 2) ? 15 : 0) + (has(h, 'benh-vien', 2) ? 15 : 0) + (has(h, 'cong-vien', 1) ? 10 : 0) - (bad(h) ? 15 : 0) - (powered[h.k] ? 0 : 30);
        return v * (0.5 + env / 200);
      });
      life = clamp(per.reduce(function (t, v) { return t + v; }, 0) / per.length);
      const n = homes.length;
      const c = function (f) { return homes.filter(f).length; };
      // Giá trị = phần đóng góp TRUNG BÌNH thật (điểm thưởng × số khu được hưởng ÷ số khu), không phải mức tối đa.
      const part = function (label, bonus, count) { why.life.push({ label: label + ' (' + count + '/' + n + ' khu)', value: Math.round((bonus * count) / n) }); };
      why.life.push({ label: 'Mức gốc', value: 40 });
      part('Có trường trong 2 ô', 15, c(function (h) { return has(h, 'truong-hoc', 2); }));
      part('Có bệnh viện trong 2 ô', 15, c(function (h) { return has(h, 'benh-vien', 2); }));
      part('Có công viên sát bên', 10, c(function (h) { return has(h, 'cong-vien', 1); }));
      part('Sát nhà máy / nhiệt điện', -15, c(bad));
      part('Mất điện', -30, c(function (h) { return !powered[h.k]; }));
      why.life.push({ label: 'Hệ số môi trường', value: Math.round((0.5 + env / 200) * 100) / 100 });
    }
    const population = active.reduce(function (t, b) { return t + b.d.pop; }, 0);
    return {
      indices: { energy: energy, economy: economy, environment: env, science: science, technology: technology, life: life },
      why: why, supply: supply, demand: demand, net: net, population: population, powered: powered,
    };
  }

  /* ── Mục tiêu mẫu (điều kiện "thành phố xanh") ── */
  const GOALS = [
    { id: 'dan-so', label: 'Có ít nhất 400 dân (4 khu dân cư có điện)', test: function (m) { return m.population >= 400; } },
    { id: 'du-dien', label: 'Năng lượng 100% (không công trình nào mất điện)', test: function (m) { return m.energy >= 100 && Object.keys(m.powered).length === m.count; } },
    { id: 'xanh', label: 'Môi trường từ 60', test: function (m) { return m.environment >= 60; } },
    { id: 'song-tot', label: 'Chất lượng cuộc sống từ 70', test: function (m) { return m.life >= 70; } },
    { id: 'tri-thuc', label: 'Khoa học từ 30 và Công nghệ từ 20', test: function (m) { return m.science >= 30 && m.technology >= 20; } },
    { id: 'ben-vung', label: 'Kinh tế từ 50 (thu đủ bù chi)', test: function (m) { return m.economy >= 50; } },
  ];
  function goals(s) {
    const r = simulate(s);
    const m = Object.assign({ population: r.population, powered: r.powered, count: Object.keys(s.tiles).length }, r.indices);
    return GOALS.map(function (g) { return { id: g.id, label: g.label, met: !!g.test(m) }; });
  }

  /* ── Thao tác (thuần: trả trạng thái mới + kết quả) ──
     build { type, x, y } · demolish { x, y } (hoàn 50%) · next-year (cộng tiền ròng, lưu lịch sử chỉ số) */
  function apply(s0, a, evidence) {
    const s = JSON.parse(JSON.stringify(s0));
    const fail = function (code, reason) { return { ok: false, code: code, reason: reason, state: s0 }; };
    if (!a || typeof a.type !== 'string') return fail('invalid', 'Thao tác lạ.');
    if (a.type === 'build') {
      const d = TYPES[a.build];
      if (!d) return fail('invalid', 'Công trình lạ.');
      if (!inMap(a.x, a.y)) return fail('invalid', 'Ngoài bản đồ.');
      const k = key(a.x, a.y);
      if (WATER.indexOf(k) >= 0) return fail('blocked', 'Không xây trên sông.');
      if (s.tiles[k]) return fail('blocked', 'Ô này đã có công trình.');
      if (!UNLOCKS[a.build].test(evidence || {}, s)) return fail('locked', 'Chưa mở khoá: ' + UNLOCKS[a.build].label + '.');
      if (s.money < d.cost) return fail('money', 'Không đủ tiền (cần ' + d.cost + ').');
      s.tiles[k] = a.build;
      s.money -= d.cost;
      s.log.push({ year: s.year, text: 'Xây ' + d.name + ' ở ô ' + (a.x + 1) + '-' + (a.y + 1) });
      return { ok: true, state: s };
    }
    if (a.type === 'demolish') {
      const k = key(a.x, a.y);
      if (!s.tiles[k]) return fail('invalid', 'Ô trống.');
      const d = TYPES[s.tiles[k]];
      delete s.tiles[k];
      s.money += Math.floor(d.cost / 2);
      s.log.push({ year: s.year, text: 'Phá ' + d.name + ' (hoàn ' + Math.floor(d.cost / 2) + ')' });
      return { ok: true, state: s };
    }
    if (a.type === 'next-year') {
      const r = simulate(s);
      s.money += r.net;
      s.history.push({ year: s.year, money: s.money, net: r.net, population: r.population, indices: r.indices });
      if (s.history.length > 30) s.history.shift();
      s.year++;
      s.log.push({ year: s.year, text: 'Sang năm ' + s.year + ': ' + (r.net >= 0 ? '+' : '') + r.net + ' tiền' });
      if (s.log.length > 50) s.log.splice(0, s.log.length - 50);
      return { ok: true, state: s };
    }
    return fail('invalid', 'Thao tác lạ.');
  }

  /** Dữ liệu lưu trên máy (không tin được) → trạng thái hợp lệ; hỏng thì thành phố mới. */
  function sanitize(raw) {
    const s = newCity();
    if (!raw || typeof raw !== 'object') return s;
    if (Number.isInteger(raw.year) && raw.year >= 1 && raw.year < 10000) s.year = raw.year;
    if (typeof raw.money === 'number' && isFinite(raw.money) && raw.money > -100000 && raw.money < 1000000) s.money = Math.round(raw.money);
    Object.keys(raw.tiles || {}).forEach(function (k) {
      const p = k.split(',').map(Number);
      if (p.length === 2 && inMap(p[0], p[1]) && WATER.indexOf(k) < 0 && TYPES[raw.tiles[k]]) s.tiles[k] = raw.tiles[k];
    });
    if (Array.isArray(raw.history)) s.history = raw.history.slice(-30);
    if (Array.isArray(raw.log)) s.log = raw.log.slice(-50).filter(function (l) { return l && typeof l.text === 'string'; });
    return s;
  }

  const api = { SIZE: SIZE, WATER: WATER, TYPES: TYPES, UNLOCKS: UNLOCKS, GOALS: GOALS, START_MONEY: START_MONEY, newCity: newCity, simulate: simulate, goals: goals, apply: apply, unlockStatus: unlockStatus, sanitize: sanitize };
  root.EduSmartCity = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
