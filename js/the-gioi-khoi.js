/* ============================================================
   js/the-gioi-khoi.js — mini-game "Thế Giới Khối" (the-gioi-khoi.html).
   Thế giới khối 2D nhìn ngang, tự sinh mỗi ván. Em đào khối, chế tạo cuốc/kiếm, xây chỗ trú.
   Quặng quý (Silic, Đồng, Pha lê dữ liệu) phải trả lời ĐÚNG 1 câu IC3 thật mới lấy được — sai thì quặng vỡ.
   Đêm xuống, bọ mã độc (tranh phẳng img/malware/*.svg) kéo tới; sáng ra chúng tan.
   Thắng: chế tạo "Lõi Bảo Mật" trước khi hết 3 ngày. Thua: hết tim.
   Hình vẽ phẳng bằng canvas (màu đơn, không gradient/texture). Câu hỏi: data/ic3/minitests (file tĩnh) — 0 Firebase.
   Kỷ lục lưu localStorage 'tgk_best'. Kết quả gửi EduGamification.recordGameSession('the-gioi-khoi', …) (Đấu trường đọc arena.score).
   ============================================================ */
(function () {
  'use strict';

  // ── Hằng số ──
  const T = 32;                       // cạnh 1 khối (px)
  const W = 140, H = 48;              // kích thước thế giới (khối)
  const DAY_SEC = 150, NIGHT_SEC = 75, DAYS = 3;
  const REACH = 4.6;                  // tầm với (khối)
  const MAX_HP = 6;

  // Khối: màu phẳng + viền đậm hơn; hard = giây đào bằng tay; tier = cấp cuốc tối thiểu; q = phải trả lời câu hỏi
  const B = {
    0: null,
    1: { id: 'grass', name: 'Cỏ', c: '#5cb85c', top: '#4a9e48', hard: .45, tier: 0, drop: 2 },
    2: { id: 'dirt', name: 'Đất', c: '#9b6b43', hard: .4, tier: 0, drop: 2, place: true },
    3: { id: 'stone', name: 'Đá', c: '#8a8f98', hard: 1.6, tier: 1, drop: 3, place: true },
    4: { id: 'wood', name: 'Gỗ', c: '#8b5a2b', hard: .9, tier: 0, drop: 4 },
    5: { id: 'leaf', name: 'Lá', c: '#3f9d4f', hard: .2, tier: 0, drop: 0 },
    6: { id: 'plank', name: 'Ván', c: '#c8955a', hard: .7, tier: 0, drop: 6, place: true },
    7: { id: 'silic', name: 'Quặng Silic', c: '#8a8f98', dot: '#cfe3ff', hard: 1.8, tier: 1, drop: 7, q: true, pts: 40 },
    8: { id: 'copper', name: 'Quặng Đồng', c: '#7d828c', dot: '#e8873a', hard: 2.2, tier: 2, drop: 8, q: true, pts: 60 },
    9: { id: 'crystal', name: 'Pha lê dữ liệu', c: '#6f7480', dot: '#4fe0e6', hard: 2.6, tier: 3, drop: 9, q: true, pts: 90 },
    10: { id: 'bedrock', name: 'Đá nền', c: '#3b3f47', hard: Infinity, tier: 99 },
    11: { id: 'cracked', name: 'Đá vỡ', c: '#80858e', hard: 1.2, tier: 1, drop: 3 },
  };
  // Vật phẩm trong túi (id khối thả ra + đồ chế tạo)
  const ITEM = {
    2: { name: 'Đất', c: B[2].c }, 3: { name: 'Đá', c: B[3].c }, 4: { name: 'Gỗ', c: B[4].c }, 6: { name: 'Ván', c: B[6].c },
    7: { name: 'Silic', c: '#cfe3ff' }, 8: { name: 'Đồng', c: '#e8873a' }, 9: { name: 'Pha lê', c: '#4fe0e6' },
  };
  const TOOLS = [
    { name: 'Tay không', tier: 0, speed: 1, dmg: 1 },
    { name: 'Cuốc gỗ', tier: 1, speed: 1.6, dmg: 1 },
    { name: 'Cuốc đá', tier: 2, speed: 2.4, dmg: 2 },
    { name: 'Cuốc đồng', tier: 3, speed: 3.4, dmg: 2 },
  ];
  const RECIPES = [
    { id: 'plank', name: 'Ván gỗ ×4', desc: 'Để xây chỗ trú', need: { 4: 1 }, give: () => add(6, 4) },
    { id: 'p1', name: 'Cuốc gỗ', desc: 'Đào được đá, quặng Silic', need: { 6: 3, 4: 2 }, ok: () => S.tool < 1, give: () => { S.tool = 1; } },
    { id: 'p2', name: 'Cuốc đá', desc: 'Đào được quặng Đồng, đào nhanh hơn', need: { 3: 3, 4: 2 }, ok: () => S.tool < 2, give: () => { S.tool = 2; } },
    { id: 'sword', name: 'Kiếm Silic', desc: 'Đánh bọ mã độc mạnh ×3', need: { 7: 2, 4: 1 }, ok: () => !S.sword, give: () => { S.sword = true; } },
    { id: 'p3', name: 'Cuốc đồng', desc: 'Đào được Pha lê dữ liệu', need: { 8: 3, 4: 2 }, ok: () => S.tool < 3, give: () => { S.tool = 3; } },
    { id: 'heal', name: 'Bánh mì năng lượng', desc: 'Hồi 2 tim', need: { 4: 1, 7: 1 }, ok: () => S.hp < MAX_HP, give: () => { S.hp = Math.min(MAX_HP, S.hp + 2); } },
    { id: 'core', name: 'Lõi Bảo Mật', desc: 'Hoàn thành — bảo vệ thế giới khỏi mã độc', need: { 9: 3, 8: 3, 7: 3 }, give: () => win() },
  ];
  const MALWARE = ['trojan', 'spyware', 'adware', 'phishing', 'ransom', 'botnet', 'rootkit', 'logicbomb'];
  const MAL_NAME = { trojan: 'Trojan', spyware: 'Phần mềm gián điệp', adware: 'Phần mềm quảng cáo', phishing: 'Lừa đảo', ransom: 'Mã độc tống tiền', botnet: 'Botnet', rootkit: 'Rootkit', logicbomb: 'Bom logic' };

  const $ = (id) => document.getElementById(id);
  const cv = $('tgk'), g = cv.getContext('2d');
  const sfx = (n) => { try { if (window.EduSFX) window.EduSFX.play(n); } catch (e) { /* âm thanh là phụ */ } };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const ri = (a, b) => Math.floor(rnd(a, b + 1));

  let S; // trạng thái ván
  const key = {};
  const mouse = { x: 0, y: 0, down: false, right: false };
  const img = {};
  MALWARE.forEach((m) => { const im = new Image(); im.src = 'img/malware/' + m + '.svg'; img[m] = im; });

  // ── Câu hỏi (cùng nguồn và cách lọc với battle-quiz.js) ──
  let QS = [], qi = 0;
  function loadQuestions() {
    const get = (u) => fetch(u).then((r) => { if (!r.ok) throw new Error(u); return r.json(); });
    return get('data/ic3/minitests-manifest.json').then((man) => {
      let paths = [];
      Object.keys(man).forEach((p) => Object.keys(man[p]).forEach((n) => { if (/^\d+\.\s/.test(n)) paths.push(man[p][n]); }));
      paths = shuffle(paths).slice(0, 6);
      return Promise.all(paths.map((p) => get('data/ic3/' + p).catch(() => [])));
    }).then((lists) => {
      const out = [];
      lists.forEach((l) => (l || []).forEach((q) => {
        if (q && Array.isArray(q.options) && q.options.length >= 2 && Array.isArray(q.correct) && (q.type === 'single' || (q.type === 'multi' && q.correct.length === 1))) out.push(q);
      }));
      QS = shuffle(out);
    }).catch(() => { QS = []; });
  }
  function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  // ── Sinh thế giới ──
  function genWorld() {
    const m = new Uint8Array(W * H);
    const surf = [];
    let h = 18, slope = 0;
    for (let x = 0; x < W; x++) {
      slope = Math.max(-1, Math.min(1, slope + rnd(-.45, .45)));
      if (Math.random() < .55) h += Math.round(slope);
      h = Math.max(12, Math.min(24, h));
      surf.push(h);
    }
    for (let x = 0; x < W; x++) {
      for (let y = 0; y < H; y++) {
        let b = 0;
        if (y === H - 1) b = 10;
        else if (y > surf[x] + 4) b = 3;
        else if (y > surf[x]) b = 2;
        else if (y === surf[x]) b = 1;
        m[y * W + x] = b;
      }
    }
    // Quặng: càng sâu càng quý; mỗi mạch 2–4 khối
    const vein = (id, n, y0, y1) => {
      for (let k = 0; k < n; k++) {
        let x = ri(3, W - 4), y = ri(y0, y1);
        for (let s = 0; s < ri(2, 4); s++) {
          if (m[y * W + x] === 3) m[y * W + x] = id;
          x += ri(-1, 1); y += ri(-1, 1);
        }
      }
    };
    vein(7, 26, 22, 34); vein(8, 20, 28, 41); vein(9, 13, 36, H - 3);
    // Hang nhỏ cho dễ xuống sâu
    for (let k = 0; k < 9; k++) {
      let x = ri(8, W - 8), y = ri(26, H - 6);
      for (let s = 0; s < 40; s++) {
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 0; dy++) { const i = (y + dy) * W + x + dx; if (m[i] && m[i] !== 10) m[i] = 0; }
        x = Math.max(2, Math.min(W - 3, x + ri(-1, 1))); y = Math.max(24, Math.min(H - 3, y + ri(-1, 1)));
      }
    }
    // Cây
    for (let x = 4; x < W - 4; x += ri(5, 9)) {
      const y = surf[x] - 1, th = ri(3, 5);
      for (let i = 0; i < th; i++) m[(y - i) * W + x] = 4;
      const ty = y - th;
      for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 0; dy++) {
        if (Math.abs(dx) === 2 && dy === -2) continue;
        const i = (ty + dy) * W + x + dx;
        if (!m[i]) m[i] = 5;
      }
    }
    return { m, surf };
  }
  const at = (x, y) => (x < 0 || x >= W || y < 0 || y >= H ? 10 : S.map[y * W + x]);
  const set = (x, y, b) => { if (x >= 0 && x < W && y >= 0 && y < H) S.map[y * W + x] = b; };
  const solid = (x, y) => { const b = at(x, y); return b !== 0 && b !== 5; }; // lá đi xuyên được

  // ── Ván mới ──
  function newGame() {
    const w = genWorld();
    const sx = Math.floor(W / 2);
    S = {
      map: w.m, surf: w.surf,
      p: { x: sx + .1, y: w.surf[sx] - 2, vx: 0, vy: 0, w: .7, h: 1.7, face: 1, ground: false, hurt: 0 },
      inv: {}, sel: 0, tool: 0, sword: false, hp: MAX_HP,
      t: 0, day: 1, night: false, mobs: [], spawnT: 0,
      dig: null, placeMode: false, score: 0, qOk: 0, qAll: 0, kills: 0, ores: 0,
      paused: true, over: false, started: Date.now(), fx: [],
    };
    hud(); bar(); recipes();
  }
  function add(id, n) { S.inv[id] = (S.inv[id] || 0) + n; bar(); recipes(); }
  function has(need) { return Object.keys(need).every((k) => (S.inv[k] || 0) >= need[k]); }

  // ── Vòng lặp ──
  let last = 0;
  function frame(ts) {
    const dt = Math.min(.05, (ts - last) / 1000 || 0); last = ts;
    if (S && !S.paused && !S.over) update(dt);
    if (S) draw();
    requestAnimationFrame(frame);
  }

  function update(dt) {
    // Thời gian: ngày → đêm → ngày…
    S.t += dt;
    const cyc = DAY_SEC + NIGHT_SEC, inCyc = S.t % cyc, day = Math.floor(S.t / cyc) + 1;
    const night = inCyc >= DAY_SEC;
    if (night !== S.night) {
      S.night = night;
      if (night) toast('Trời tối — bọ mã độc đang tới. Xây chỗ trú hoặc chuẩn bị kiếm!');
      else { S.mobs.forEach((m) => puff(m.x, m.y)); S.mobs = []; S.hp = Math.min(MAX_HP, S.hp + 2); toast(`Trời sáng — Ngày ${day}. Bọ mã độc đã tan, hồi 2 tim.`); sfx('sparkle'); }
    }
    if (day > DAYS) return lose('Hết 3 ngày mà chưa chế tạo được Lõi Bảo Mật.');
    S.day = day;

    // Di chuyển
    const p = S.p, sp = 5.2;
    const L = key.ArrowLeft || key.a || key.KeyA || key.left, R = key.ArrowRight || key.d || key.KeyD || key.right;
    p.vx = (R ? sp : 0) - (L ? sp : 0);
    if (p.vx) p.face = Math.sign(p.vx);
    if ((key.ArrowUp || key.w || key.KeyW || key.Space || key.jump) && p.ground) { p.vy = -10.2; p.ground = false; }
    p.vy = Math.min(18, p.vy + 28 * dt);
    move(p, dt);
    if (p.hurt > 0) p.hurt -= dt;

    // Đào (giữ chuột trái)
    const tgt = target();
    if (mouse.down && !S.placeMode && tgt && !mobAt(mouse)) {
      const b = B[at(tgt.x, tgt.y)];
      if (b && b.hard !== Infinity) {
        const tool = TOOLS[S.tool];
        if (b.tier > tool.tier) {
          if (!S.dig || S.dig.warned !== `${tgt.x},${tgt.y}`) toast(`Cần ${TOOLS[b.tier].name} để đào ${b.name}.`);
          S.dig = { x: tgt.x, y: tgt.y, p: 0, warned: `${tgt.x},${tgt.y}` };
        } else {
          if (!S.dig || S.dig.x !== tgt.x || S.dig.y !== tgt.y) S.dig = { x: tgt.x, y: tgt.y, p: 0 };
          S.dig.p += dt * tool.speed / b.hard;
          if (S.dig.p >= 1) { mine(tgt.x, tgt.y); S.dig = null; }
        }
      }
    } else if (!mouse.down) S.dig = null;

    // Quái ban đêm
    if (S.night) {
      S.spawnT -= dt;
      const cap = 3 + S.day * 2;
      if (S.spawnT <= 0 && S.mobs.length < cap) { spawnMob(); S.spawnT = rnd(4, 7) - S.day; }
    }
    S.mobs.forEach((m) => {
      const dx = p.x - m.x;
      m.vx = Math.sign(dx) * (1.6 + S.day * .35);
      m.vy = Math.min(18, m.vy + 28 * dt);
      const before = m.x;
      move(m, dt);
      if (m.ground && Math.abs(m.x - before) < .001 && Math.abs(dx) > .6) m.vy = -9; // vướng thì nhảy
      if (m.hit > 0) m.hit -= dt;
      if (Math.abs(dx) < .8 && Math.abs(p.y - m.y) < 1.2 && p.hurt <= 0) {
        S.hp--; p.hurt = 1; p.vx = 0; p.vy = -6; sfx('wrong'); hud();
        if (S.hp <= 0) lose(`${MAL_NAME[m.kind]} đã xâm nhập. Hết tim.`);
      }
    });
    S.fx = S.fx.filter((f) => (f.t -= dt) > 0);
    hud();
  }

  // Va chạm hộp (AABB) với lưới khối
  function move(e, dt) {
    e.x += e.vx * dt;
    if (hit(e)) { e.x -= e.vx * dt; e.vx = 0; }
    e.y += e.vy * dt; e.ground = false;
    if (hit(e)) { if (e.vy > 0) e.ground = true; e.y -= e.vy * dt; e.vy = 0; }
    e.x = Math.max(.5, Math.min(W - 1.5, e.x));
  }
  function hit(e) {
    for (let x = Math.floor(e.x); x <= Math.floor(e.x + e.w - .001); x++)
      for (let y = Math.floor(e.y); y <= Math.floor(e.y + e.h - .001); y++) if (solid(x, y)) return true;
    return false;
  }

  // Ô chuột đang chỉ (trong tầm với)
  function target() {
    const c = cam(), tx = Math.floor((mouse.x + c.x) / T), ty = Math.floor((mouse.y + c.y) / T);
    const px = S.p.x + S.p.w / 2, py = S.p.y + S.p.h / 2;
    if (Math.hypot(tx + .5 - px, ty + .5 - py) > REACH) return null;
    return { x: tx, y: ty };
  }
  function cam() {
    const vw = cv.width / dpr, vh = cv.height / dpr;
    return {
      x: Math.max(0, Math.min(W * T - vw, (S.p.x + .35) * T - vw / 2)),
      y: Math.max(0, Math.min(H * T - vh, (S.p.y + .85) * T - vh / 2)),
    };
  }

  function mine(x, y) {
    const id = at(x, y), b = B[id];
    if (b.q) return ask(x, y, id);
    set(x, y, 0);
    if (b.drop) add(b.drop, 1);
    if (id === 4) { // chặt cây: rụng luôn lá xung quanh cho gọn
      for (let dy = -4; dy <= 0; dy++) for (let dx = -2; dx <= 2; dx++) if (at(x + dx, y + dy) === 5) set(x + dx, y + dy, 0);
    }
    sfx('click'); puff(x, y);
  }

  function place() {
    const t = target(), slots = slotList(), it = slots[S.sel];
    if (!t || !it || !B[it.id] || !B[it.id].place || !(S.inv[it.id] > 0) || at(t.x, t.y) !== 0) return;
    const p = S.p;
    if (t.x + 1 > p.x && t.x < p.x + p.w && t.y + 1 > p.y && t.y < p.y + p.h) return; // không đặt đè lên mình
    if (S.mobs.some((m) => t.x + 1 > m.x && t.x < m.x + m.w && t.y + 1 > m.y && t.y < m.y + m.h)) return;
    set(t.x, t.y, it.id); S.inv[it.id]--; bar(); recipes(); sfx('click');
  }

  // ── Câu hỏi khi đào quặng ──
  function ask(x, y, id) {
    const b = B[id];
    if (!QS.length) { set(x, y, 0); add(b.drop, 1); S.ores++; S.score += Math.round(b.pts / 2); toast('Chưa tải được câu hỏi — quặng được tặng, điểm một nửa.'); return; }
    const q = QS[qi++ % QS.length];
    const opts = shuffle(q.options);
    S.paused = true; mouse.down = false;
    modal(`<div class="ore-tag"><i style="background:${ITEM[b.drop].c}"></i>${esc(b.name)} — trả lời đúng để lấy quặng</div>
      <p class="q">${esc(q.question || q.text || '')}</p>
      <div class="opts">${opts.map((o, i) => `<button type="button" data-i="${i}">${esc(o)}</button>`).join('')}</div>
      <p class="note" id="tgkQNote"></p>`);
    $('tgkModalBox').querySelectorAll('.opts button').forEach((btn) => btn.addEventListener('click', () => {
      const pick = opts[+btn.dataset.i], ok = q.correct.indexOf(pick) >= 0;
      S.qAll++;
      $('tgkModalBox').querySelectorAll('.opts button').forEach((x) => {
        x.disabled = true;
        if (q.correct.indexOf(opts[+x.dataset.i]) >= 0) x.classList.add('ok');
      });
      if (ok) {
        S.qOk++; S.ores++; S.score += b.pts; set(x, y, 0); add(b.drop, 1); sfx('correct');
        $('tgkQNote').textContent = `Chính xác! +1 ${ITEM[b.drop].name}, +${b.pts} điểm.`;
      } else {
        btn.classList.add('no'); set(x, y, 11); sfx('wrong');
        $('tgkQNote').innerHTML = `Chưa đúng — quặng vỡ thành đá.${q.explanation ? ' ' + esc(q.explanation) : ''}`;
      }
      if (window.EduMiniArena) window.EduMiniArena.live(points());
      setTimeout(() => { closeModal(); S.paused = false; hud(); }, ok ? 900 : 2200);
    }));
  }

  // ── Quái ──
  function spawnMob() {
    const side = Math.random() < .5 ? -1 : 1;
    const x = Math.max(2, Math.min(W - 3, Math.round(S.p.x + side * rnd(13, 18))));
    let y = 1; while (y < H - 2 && !solid(x, y + 1)) y++;
    if (solid(x, y) || solid(x, y - 1)) return;
    S.mobs.push({ x, y: y - 1.2, vx: 0, vy: 0, w: .9, h: 1.1, hp: 3 + Math.floor(S.day / 2), kind: MALWARE[ri(0, MALWARE.length - 1)], hit: 0, ground: false });
  }
  function mobAt(pt) {
    const c = cam(), wx = (pt.x + c.x) / T, wy = (pt.y + c.y) / T;
    return S.mobs.find((m) => wx >= m.x - .2 && wx <= m.x + m.w + .2 && wy >= m.y - .2 && wy <= m.y + m.h + .2) || null;
  }
  function attack(m) {
    const p = S.p;
    if (Math.hypot(m.x - p.x, m.y - p.y) > 2.8) return toast('Lại gần hơn để đánh.');
    m.hp -= (S.sword ? 3 : 1) * TOOLS[S.tool].dmg; m.hit = .2; m.vy = -5; m.x += Math.sign(m.x - p.x) * .6;
    sfx('critical');
    if (m.hp <= 0) { S.mobs = S.mobs.filter((x) => x !== m); S.kills++; S.score += 25; puff(m.x, m.y); toast(`Đã chặn ${MAL_NAME[m.kind]}! +25`); }
  }
  function puff(x, y) { S.fx.push({ x, y, t: .35 }); }

  // ── Kết thúc ──
  function points() { return S.score + S.qOk * 20 + S.kills * 5; }
  function finish(winFlag, why) {
    if (S.over) return;
    S.over = true; S.paused = true;
    const pts = points() + (winFlag ? 500 + Math.max(0, Math.round((DAYS * (DAY_SEC + NIGHT_SEC) - S.t) / 2)) : 0);
    const best = Math.max(pts, +localStorage.getItem('tgk_best') || 0);
    try { localStorage.setItem('tgk_best', String(best)); } catch (e) { /* bỏ qua */ }
    sfx(winFlag ? 'fanfare' : 'lose');
    const acc = S.qAll ? Math.round(S.qOk / S.qAll * 100) : 0;
    try {
      if (window.EduGamification && window.EduGamification.recordGameSession) {
        let st = {}; try { st = JSON.parse(localStorage.getItem('eduquiz_current_student') || '{}') || {}; } catch (e) { st = {}; }
        window.EduGamification.recordGameSession('the-gioi-khoi', {
          xp: Math.round(pts / 10), score: acc, scoreType: 'percent', accuracy: acc, correctAnswers: S.qOk, wrongAnswers: S.qAll - S.qOk,
          durationSec: Math.round((Date.now() - S.started) / 1000), arena: { score: pts, win: !!winFlag },
          studentName: st.name || '', studentClass: st.class || '', studentSchool: st.school || '',
        });
      }
    } catch (e) { /* ghi XP là phụ */ }
    modal(`<h3>${winFlag ? '<i class="fa-solid fa-shield-halved" aria-hidden="true"></i> Đã chế tạo Lõi Bảo Mật!' : 'Ván kết thúc'}</h3>
      <p class="note" style="margin-top:0">${esc(why)}</p>
      <div class="rec"><span>Điểm</span><b>${pts}</b></div>
      <div class="rec"><span>Câu đúng</span><b>${S.qOk}/${S.qAll}</b></div>
      <div class="rec"><span>Quặng lấy được</span><b>${S.ores}</b></div>
      <div class="rec"><span>Bọ mã độc đã chặn</span><b>${S.kills}</b></div>
      <div class="rec"><span>Kỷ lục của máy này</span><b>${best}</b></div>
      <div style="display:flex;gap:8px;margin-top:14px"><button type="button" class="btn pri" id="tgkAgain">Chơi ván mới</button></div>`);
    $('tgkAgain').onclick = () => { closeModal(); newGame(); S.paused = false; };
  }
  const win = () => finish(true, 'Thế giới khối đã an toàn trước mã độc.');
  const lose = (why) => finish(false, why);

  // ── Vẽ (phẳng: màu đơn + viền) ──
  let dpr = 1;
  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function skyColor() {
    const cyc = DAY_SEC + NIGHT_SEC, t = S.t % cyc;
    if (t < DAY_SEC - 10) return '#8ecdf5';
    if (t < DAY_SEC) return '#e9a06b';
    if (t > cyc - 8) return '#f2b98a';
    return '#16203d';
  }
  function draw() {
    const vw = cv.width / dpr, vh = cv.height / dpr, c = cam();
    g.fillStyle = skyColor(); g.fillRect(0, 0, vw, vh);
    // mặt trời / mặt trăng
    const cyc = DAY_SEC + NIGHT_SEC, ph = (S.t % cyc) / (S.night ? NIGHT_SEC : DAY_SEC) - (S.night ? DAY_SEC / NIGHT_SEC : 0);
    g.fillStyle = S.night ? '#e8ecff' : '#ffd84d';
    g.fillRect(vw * (.1 + .8 * Math.max(0, Math.min(1, ph))) - 22, 70 + Math.abs(ph - .5) * 60, 44, 44);

    const x0 = Math.floor(c.x / T), y0 = Math.floor(c.y / T), x1 = Math.ceil((c.x + vw) / T), y1 = Math.ceil((c.y + vh) / T);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const id = at(x, y), b = B[id];
      const sx = x * T - c.x, sy = y * T - c.y;
      if (!b && x >= 0 && x < W && y > S.surf[x] + 1) { g.fillStyle = '#2b303b'; g.fillRect(sx, sy, T, T); } // hang dưới đất: tối
      if (!b || (y >= H)) continue;
      g.fillStyle = b.c; g.fillRect(sx, sy, T, T);
      if (b.top) { g.fillStyle = b.top; g.fillRect(sx, sy, T, 8); }
      if (b.dot) { g.fillStyle = b.dot; [[6, 7], [19, 5], [12, 17], [23, 21], [5, 23]].forEach(([a, d]) => g.fillRect(sx + a, sy + d, 5, 5)); }
      if (id === 4) { g.fillStyle = '#6f4520'; g.fillRect(sx + 9, sy, 3, T); g.fillRect(sx + 20, sy, 3, T); }
      if (id === 6) { g.fillStyle = '#a8773f'; g.fillRect(sx, sy + 10, T, 2); g.fillRect(sx, sy + 21, T, 2); }
      if (id === 11) { g.strokeStyle = '#5c6068'; g.lineWidth = 2; g.beginPath(); g.moveTo(sx + 6, sy + 4); g.lineTo(sx + 16, sy + 16); g.lineTo(sx + 12, sy + 28); g.stroke(); }
      g.strokeStyle = 'rgba(0,0,0,.16)'; g.lineWidth = 1; g.strokeRect(sx + .5, sy + .5, T - 1, T - 1);
    }
    // vết đào
    if (S.dig && S.dig.p > 0) {
      const sx = S.dig.x * T - c.x, sy = S.dig.y * T - c.y;
      g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(sx, sy + T * (1 - S.dig.p), T, T * S.dig.p);
    }
    // ô đang chỉ
    const t = target();
    if (t) { g.strokeStyle = S.placeMode ? '#7df9a0' : '#ffffff'; g.lineWidth = 2; g.strokeRect(t.x * T - c.x + 1, t.y * T - c.y + 1, T - 2, T - 2); }
    // bọ mã độc
    S.mobs.forEach((m) => {
      const sx = m.x * T - c.x - 4, sy = m.y * T - c.y - 6, im = img[m.kind];
      if (m.hit > 0) g.globalAlpha = .5;
      if (im && im.complete && im.naturalWidth) g.drawImage(im, sx, sy, m.w * T + 8, m.h * T + 8);
      else { g.fillStyle = '#8b5cf6'; g.fillRect(sx, sy, m.w * T, m.h * T); }
      g.globalAlpha = 1;
    });
    drawPlayer(c);
    S.fx.forEach((f) => { g.fillStyle = 'rgba(255,255,255,' + f.t * 2 + ')'; for (let i = 0; i < 5; i++) g.fillRect(f.x * T - c.x + 8 + i * 4, f.y * T - c.y + 8 + ((i * 7) % 12), 5, 5); });
    if (S.night) { g.fillStyle = 'rgba(8,12,30,.35)'; g.fillRect(0, 0, vw, vh); }
  }
  // Bạn nhỏ: áo trắng, quần xanh, khăn đỏ — khối phẳng
  function drawPlayer(c) {
    const p = S.p, x = p.x * T - c.x, y = p.y * T - c.y, w = p.w * T, f = p.face;
    if (p.hurt > 0 && Math.floor(p.hurt * 10) % 2) return;
    const walk = p.vx && p.ground ? Math.sin(performance.now() / 90) * 4 : 0;
    g.fillStyle = '#2f4e9e'; g.fillRect(x + 3, y + 36 + 0, 7, 18 + walk); g.fillRect(x + w - 10, y + 36, 7, 18 - walk); // chân
    g.fillStyle = '#f4f6fb'; g.fillRect(x + 1, y + 20, w - 2, 18);   // áo
    g.fillStyle = '#e5484d'; g.fillRect(x + w / 2 - 3, y + 20, 6, 8); // khăn
    g.fillStyle = '#f2c9a0'; g.fillRect(x + 2, y + 2, w - 4, 18);     // mặt
    g.fillStyle = '#2b2118'; g.fillRect(x + 1, y, w - 2, 6);          // tóc
    g.fillRect(x + (f > 0 ? w - 9 : 6), y + 9, 3, 4);                 // mắt
    // dụng cụ trên tay
    const hx = f > 0 ? x + w - 2 : x - 10;
    if (S.sword) { g.fillStyle = '#cfe3ff'; g.fillRect(hx + (f > 0 ? 2 : 0), y + 14, 4, 16); }
    else if (S.tool) { g.fillStyle = ['', '#c8955a', '#8a8f98', '#e8873a'][S.tool]; g.fillRect(hx, y + 18, 10, 4); }
    g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 1; g.strokeRect(x + 1.5, y + .5, w - 3, 37);
  }

  // ── Giao diện ──
  function slotList() {
    return [2, 3, 6, 4, 7, 8, 9].filter((id) => S.inv[id] > 0 || [2, 3, 6].includes(id)).map((id) => ({ id, n: S.inv[id] || 0 }));
  }
  function bar() {
    const list = slotList();
    if (S.sel >= list.length) S.sel = 0;
    $('tgkBar').innerHTML = list.map((it, i) => `<div class="slot${i === S.sel ? ' on' : ''}" data-s="${i}" title="${esc(ITEM[it.id].name)}${B[it.id] && B[it.id].place ? ' — đặt được' : ''}">
      <small>${i + 1}</small><i class="sw" style="background:${ITEM[it.id].c}"></i><b>${it.n}</b></div>`).join('');
  }
  function hud() {
    $('tgkHearts').innerHTML = Array.from({ length: MAX_HP }, (_, i) => `<i class="fa-solid fa-heart" style="opacity:${i < S.hp ? 1 : .25}" aria-hidden="true"></i>`).join('');
    $('tgkHearts').title = S.hp + ' tim';
    const cyc = DAY_SEC + NIGHT_SEC, inC = S.t % cyc, left = S.night ? cyc - inC : DAY_SEC - inC;
    $('tgkTime').innerHTML = `<i class="fa-solid fa-${S.night ? 'moon' : 'sun'}" aria-hidden="true"></i> Ngày ${Math.min(S.day, DAYS)}/${DAYS} · ${S.night ? 'Đêm' : 'Ngày'} còn ${Math.ceil(left)}s`;
    $('tgkScore').textContent = points();
    $('tgkQ').textContent = `${S.qOk}/${S.qAll}`;
    $('tgkTool').innerHTML = `<i class="fa-solid fa-${S.placeMode ? 'cube' : 'hammer'}" aria-hidden="true"></i> ${S.placeMode ? 'Đặt khối' : TOOLS[S.tool].name}${S.sword ? ' · Kiếm Silic' : ''}`;
  }
  function recipes() {
    $('tgkRecipes').innerHTML = RECIPES.filter((r) => !r.ok || r.ok()).map((r) => {
      const need = Object.keys(r.need).filter((k) => r.need[k]).map((k) => `<span class="need${(S.inv[k] || 0) < r.need[k] ? ' miss' : ''}">${ITEM[k].name} ${S.inv[k] || 0}/${r.need[k]}</span>`).join(' · ');
      return `<div class="rec"><div><b>${esc(r.name)}</b><small>${esc(r.desc)}</small><small>${need}</small></div>
        <button type="button" class="btn${has(r.need) ? ' pri' : ''}" data-r="${r.id}" ${has(r.need) ? '' : 'disabled'}>Làm</button></div>`;
    }).join('');
  }
  function modal(html) { $('tgkModalBox').innerHTML = html; $('tgkModal').hidden = false; }
  function closeModal() { $('tgkModal').hidden = true; }
  let toastT = 0;
  function toast(msg) { const t = $('tgkToast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2600); }
  function intro() {
    S.paused = true;
    modal(`<div class="intro"><h3><i class="fa-solid fa-cube" aria-hidden="true"></i> Thế Giới Khối</h3>
      <p class="note" style="margin-top:0">Chế tạo <b>Lõi Bảo Mật</b> (3 Pha lê dữ liệu + 3 Đồng + 3 Silic) trước khi hết ${DAYS} ngày.</p>
      <ul>
        <li><b>Di chuyển:</b> A/D hoặc ← →, nhảy: W / ↑ / Space.</li>
        <li><b>Đào:</b> giữ chuột trái vào khối gần mình. <b>Đặt khối:</b> chuột phải (chọn khối ở thanh dưới, phím 1–7).</li>
        <li><b>Quặng:</b> Silic → Đồng → Pha lê, càng sâu càng quý. Đào xong phải <b>trả lời đúng 1 câu IC3</b> mới lấy được.</li>
        <li><b>Chế tạo (C):</b> gỗ → ván → cuốc gỗ → cuốc đá → cuốc đồng. Kiếm Silic đánh mạnh gấp 3.</li>
        <li><b>Ban đêm:</b> bọ mã độc kéo tới — bấm vào chúng để đánh, hoặc xây tường chặn lại.</li>
      </ul>
      <button type="button" class="btn pri" id="tgkGo"><i class="fa-solid fa-play" aria-hidden="true"></i> ${QS.length ? 'Bắt đầu' : 'Đang tải câu hỏi…'}</button></div>`);
    const go = $('tgkGo');
    go.onclick = () => { closeModal(); S.paused = false; S.started = Date.now(); sfx('go'); };
  }

  // ── Sự kiện ──
  addEventListener('resize', resize);
  addEventListener('keydown', (e) => {
    if (!$('tgkModal').hidden) return;
    key[e.key] = key[e.code] = true;
    if (e.code === 'Space' || e.key.startsWith('Arrow')) e.preventDefault();
    if (/^[1-7]$/.test(e.key)) { S.sel = +e.key - 1; bar(); }
    if (e.key === 'c' || e.key === 'C') toggleCraft();
    if (e.key === 'e' || e.key === 'E') { S.placeMode = !S.placeMode; hud(); }
  });
  addEventListener('keyup', (e) => { key[e.key] = key[e.code] = false; });
  addEventListener('blur', () => { Object.keys(key).forEach((k) => { key[k] = false; }); mouse.down = false; });
  cv.addEventListener('contextmenu', (e) => e.preventDefault());
  cv.addEventListener('pointermove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; });
  cv.addEventListener('pointerdown', (e) => {
    mouse.x = e.clientX; mouse.y = e.clientY;
    if (S.paused) return;
    const m = mobAt(mouse);
    if (e.button === 0 && m) return attack(m);
    if (e.button === 2 || (e.button === 0 && S.placeMode)) return place();
    if (e.button === 0) mouse.down = true;
  });
  addEventListener('pointerup', () => { mouse.down = false; });
  $('tgkBar').addEventListener('click', (e) => { const s = e.target.closest('[data-s]'); if (s) { S.sel = +s.dataset.s; bar(); } });
  function toggleCraft() { const c = $('tgkCraft'); c.hidden = !c.hidden; recipes(); }
  $('tgkCraftBtn').onclick = toggleCraft;
  $('tgkHelpBtn').onclick = () => { if (!S.over) intro(); };
  $('tgkRecipes').addEventListener('click', (e) => {
    const b = e.target.closest('[data-r]'); if (!b) return;
    const r = RECIPES.find((x) => x.id === b.dataset.r);
    if (!r || !has(r.need)) return;
    Object.keys(r.need).forEach((k) => { S.inv[k] -= r.need[k]; });
    r.give(); sfx('match'); toast(`Đã làm: ${r.name}`); bar(); recipes(); hud();
  });
  document.querySelectorAll('.touch [data-k]').forEach((b) => {
    const k = b.dataset.k;
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); key[k] = true; });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => b.addEventListener(ev, () => { key[k] = false; }));
  });
  $('tgkPlaceMode').onclick = () => { S.placeMode = !S.placeMode; hud(); };
  if (window.EduMiniArena && window.EduMiniArena.on) $('tgkHome').hidden = true; // trong Đấu trường: nút về nằm ở trang cha

  // ── Khởi động ──
  resize(); newGame(); intro();
  loadQuestions().then(() => { const go = $('tgkGo'); if (go) go.innerHTML = '<i class="fa-solid fa-play" aria-hidden="true"></i> Bắt đầu'; });
  requestAnimationFrame(frame);
})();
