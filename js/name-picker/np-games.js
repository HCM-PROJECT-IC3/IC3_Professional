/* ============================================================
   js/name-picker/np-games.js — sân khấu + 10 trò của trang Gọi tên (goi-ten.html).
   Sân khấu 1000×600 (co giãn theo khung), nhân vật là phần tử DOM chuyển động bằng CSS transition:
   chữ nét, mượt, máy yếu vẫn chạy được. Người được gọi đã chọn trước (name-picker-core.js) —
   mỗi trò chỉ "diễn": vài lần bắt hụt ("Nhầm rồi, đi tiếp!"), người thật lộ diện ở cuối.
   Lật kèo: bắt được 1 bạn → khung tên đóng dấu "NHẦM RỒI!" → chuyển sang bạn khác.
   API: EduNamePickerGames.GAMES (danh sách trò), mount(stage), idle(game, items), play(game, plan) → Promise
   ============================================================ */
(function (global) {
  'use strict';

  const A = global.EduNamePickerArt;
  const N = global.EduNamePicker;
  const W = 1000, H = 600;
  const rng = Math.random;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const rand = (a, b) => a + rng() * (b - a);
  const pickOne = (arr) => arr[Math.floor(rng() * arr.length)];
  const sfx = (n) => { try { global.EduSFX && global.EduSFX.play(n); } catch (e) { /* ignore */ } };
  const flashlight = '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M8 30l14-14 10 10-14 14z" fill="#5b6478"/><path d="M22 16l8-8 10 10-8 8z" fill="#ffd34d"/><path d="M30 8l10 10" stroke="#fff3b0" stroke-width="3"/><path d="M8 30l10 10-4 4-10-10z" fill="#3a4052"/></svg>';
  const flag = '<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="8" y="6" width="4" height="38" rx="2" fill="#6b4a2a"/>' + Array.from({ length: 12 }, (_, k) => `<rect x="${12 + (k % 4) * 7}" y="${6 + Math.floor(k / 4) * 7}" width="7" height="7" fill="${(k + Math.floor(k / 4)) % 2 ? '#fff' : '#222'}"/>`).join('') + '</svg>';

  /** 10 trò — cùng thứ tự với trang tham khảo. scene: cảnh nền trong np-art.js. */
  const GAMES = [
    { id: 'egg', name: 'Trộm trứng', desc: 'Gà mẹ rượt đuổi', scene: 'farm', icon: () => A.egg() },
    { id: 'race', name: 'Đường đua', desc: 'Ai về đích trước', scene: 'track', icon: () => flag },
    { id: 'fish', name: 'Câu cá', desc: 'Cá nào cắn câu', scene: 'pond', icon: () => A.fish('#f19a1a') },
    { id: 'balloon', name: 'Bóng bay', desc: 'Quả cuối cùng còn lại', scene: 'sky', icon: () => A.balloon('#e5484d') },
    { id: 'dino', name: 'Khủng long', desc: 'Ai bị ăn mất bánh', scene: 'jungle', icon: () => A.dino() },
    { id: 'rocket', name: 'Tên lửa', desc: 'Ai lên Mặt Trăng trước', scene: 'space', icon: () => A.rocket('#e23b2e') },
    { id: 'light', name: 'Đèn pin', desc: 'Tắt đèn đi tìm', scene: 'classroom', icon: () => flashlight },
    { id: 'gift', name: 'Hộp quà', desc: 'Mở hộp nhận thử thách', scene: 'party', icon: () => A.gift('#e5484d') },
    { id: 'card', name: 'Thẻ đỏ', desc: 'Trọng tài rút thẻ', scene: 'field', icon: () => A.card('#e23b2e') },
    { id: 'ufo', name: 'UFO', desc: 'Đĩa bay bắt cóc', scene: 'street', icon: () => A.ufo() },
  ];
  const byId = (id) => GAMES.find((g) => g.id === id) || GAMES[0];
  /** Số nhân vật tối đa trên sân khấu theo trò (đông hơn thì máy chọn 1 nhóm, luôn có người được gọi). */
  const CAP = { race: 20, rocket: 20, dino: 24, gift: 24, fish: 30, balloon: 40 };
  const CROWD = 24; // quá số này thì nhãn trên nhân vật là số thứ tự

  // ============================================================
  // SÂN KHẤU
  // ============================================================
  let stage = null, world = null, layer = null, fx = null, scaleObs = null;
  let timers = [], frames = [];
  function mount(el) {
    stage = el;
    stage.innerHTML = `<div class="np-world"><div class="np-bg"></div><div class="np-layer"></div><div class="np-fx"></div></div>`;
    world = stage.querySelector('.np-world');
    layer = stage.querySelector('.np-layer');
    fx = stage.querySelector('.np-fx');
    const fit = () => { const s = stage.clientWidth / W; world.style.transform = `scale(${s})`; world.classList.toggle('is-small', s < .6); };
    if (scaleObs) scaleObs.disconnect();
    scaleObs = new ResizeObserver(fit);
    scaleObs.observe(stage);
    fit();
  }
  function stopAll() {
    timers.forEach(clearTimeout); timers.forEach(clearInterval); timers = [];
    frames.forEach(cancelAnimationFrame); frames = [];
  }
  function reset(scene) {
    stopAll();
    world.querySelector('.np-bg').innerHTML = A.scene(scene);
    const small = world.classList.contains('is-small');
    world.className = 'np-world np-w-' + scene;
    world.classList.toggle('is-small', small);
    layer.innerHTML = ''; fx.innerHTML = '';
    layer.className = 'np-layer';
  }
  const every = (ms, fn) => { const t = setInterval(fn, ms); timers.push(t); return t; };
  const later = (ms, fn) => { const t = setTimeout(fn, ms); timers.push(t); return t; };

  /** Nhân vật: neo ở chân (x, y); di chuyển bằng transition transform; lớp sâu theo y. */
  function sprite(html, x, y, opt) {
    const o = opt || {};
    const el = document.createElement('div');
    el.className = 'np-sp ' + (o.cls || '');
    el.innerHTML = `<div class="np-sp-in" style="width:${o.w || 60}px">${html}</div>${o.tag ? `<span class="np-tag${/^\d+$/.test(o.tag) ? ' is-num' : ''}">${esc(o.tag)}</span>` : ''}`;
    layer.appendChild(el);
    const sp = { el, x, y, w: o.w || 60, h: o.h || (o.w || 60) * 1.6, frozen: false, data: o.data };
    place(sp, x, y, 0);
    return sp;
  }
  function place(sp, x, y, ms, ease) {
    if (x !== sp.x) sp.el.classList.toggle('is-left', x < sp.x);
    sp.x = x; sp.y = y;
    sp.el.style.transition = ms ? `transform ${ms}ms ${ease || 'linear'}` : 'none';
    sp.el.style.transform = `translate(${x}px, ${y}px)`;
    sp.el.style.zIndex = String(Math.round(y));
  }
  /** Đi/chạy tới (x, y) trong ms; trả Promise khi tới nơi. */
  function go(sp, x, y, ms, opt) {
    const o = opt || {};
    if (!o.still) sp.el.classList.add('is-run');
    place(sp, x, y, ms, o.ease);
    return new Promise((r) => later(ms, () => { if (!o.still) sp.el.classList.remove('is-run'); r(); }));
  }
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  /** Bong bóng lời thoại phía trên nhân vật (hoặc toạ độ). */
  function say(target, text, ms, tone) {
    const b = document.createElement('div');
    b.className = 'np-say' + (tone ? ' is-' + tone : '');
    b.textContent = text;
    const x = Math.max(110, Math.min(W - 110, target.x)), y = Math.max(60, target.y - (target.h || 80) - 14);
    b.style.left = x + 'px'; b.style.top = y + 'px';
    fx.appendChild(b);
    later(ms || 1100, () => { b.classList.add('is-out'); later(300, () => b.remove()); });
    return b;
  }
  /** Chữ to giữa sân khấu ("Đi!"). */
  function shout(text) {
    const b = document.createElement('div');
    b.className = 'np-shout';
    b.textContent = text;
    fx.appendChild(b);
    later(900, () => b.remove());
  }
  /** Đồng hồ đếm ngược góc trên trái. */
  function clock(ms) {
    const c = document.createElement('div');
    c.className = 'np-clock';
    fx.appendChild(c);
    const end = performance.now() + ms;
    const tick = () => {
      const s = Math.max(0, Math.ceil((end - performance.now()) / 1000));
      c.innerHTML = `<i class="fa-solid fa-stopwatch" aria-hidden="true"></i><b>${String(s).padStart(2, '0')}</b><small>giây</small>`;
      c.classList.toggle('is-low', s <= 3);
    };
    tick();
    every(250, tick);
  }
  function burst(x, y, items, n) {
    for (let k = 0; k < (n || 10); k++) {
      const p = document.createElement('span');
      p.className = 'np-bit';
      p.textContent = items[k % items.length];
      const a = (Math.PI * 2 * k) / (n || 10) + rand(-.3, .3), d = rand(50, 110);
      p.style.left = x + 'px'; p.style.top = y + 'px';
      p.style.setProperty('--dx', Math.cos(a) * d + 'px'); p.style.setProperty('--dy', Math.sin(a) * d + 'px');
      fx.appendChild(p);
      later(900, () => p.remove());
    }
  }

  /** Khung tên giữa sân khấu: "Bắt được rồi!" + tên; wrong → đóng dấu "NHẦM RỒI!". */
  function banner(name, lead, sub) {
    const b = document.createElement('div');
    b.className = 'np-banner';
    b.innerHTML = `<div class="np-banner-box"><p class="np-banner-lbl">${esc(lead)}</p><p class="np-banner-nm">${esc(name)}</p>${sub ? `<p class="np-banner-sub">${esc(sub)}</p>` : ''}</div>`;
    fx.appendChild(b);
    return {
      el: b,
      async wrong() { b.querySelector('.np-banner-nm').classList.add('is-wrong'); b.querySelector('.np-banner-box').insertAdjacentHTML('beforeend', '<span class="np-stamp">NHẦM RỒI!</span>'); sfx('wrong'); await sleep(1300); b.remove(); },
    };
  }

  // ── Bố trí ──
  /** n vị trí rải đều trong vùng (lưới + lệch ngẫu nhiên), xếp theo y. */
  function scatter(n, x0, y0, x1, y1) {
    const cols = Math.max(1, Math.round(Math.sqrt(n * (x1 - x0) / (y1 - y0))));
    const rows = Math.ceil(n / cols);
    const cw = (x1 - x0) / cols, rh = (y1 - y0) / Math.max(1, rows);
    const cells = N.shuffle(Array.from({ length: cols * rows }, (_, i) => i), rng).slice(0, n);
    const j = n > 24 ? .12 : .25; // đông: lệch ít để không đè lên nhau
    return cells.map((c) => ({ x: x0 + (c % cols + .5) * cw + rand(-cw * j, cw * j), y: y0 + (Math.floor(c / cols) + .5) * rh + rand(-rh * j, rh * j) }));
  }
  const kidW = (n) => (n <= 16 ? 58 : n <= 28 ? 50 : n <= 40 ? 44 : 40);
  let actors = []; // nhân vật đang trên sân khấu (để tránh đè lên nhau)
  function kids(items, pos, opt) {
    const w = kidW(items.length);
    layer.classList.toggle('is-crowd', items.length > 30);
    actors = items.map((it, k) => sprite(A.kid(it.idx) + ((opt && opt.extra) ? opt.extra(it) : ''), pos[k].x, pos[k].y, { w, h: w * 1.62, tag: it.label, cls: 'np-kid-sp', data: it }));
    return actors;
  }
  /** Học sinh đi lang thang trong vùng (bỏ qua bạn đang bị "giữ"). */
  function wander(list, box, speed) {
    every(650, () => {
      list.forEach((sp) => {
        if (sp.frozen || sp.gone || rng() > 0.35) return;
        // Chọn chỗ mới không chồng lên bạn khác (thử vài lần, không được thì đứng yên)
        for (let k = 0; k < 6; k++) {
          const x = Math.max(box[0], Math.min(box[2], sp.x + rand(-140, 140)));
          const y = Math.max(box[1], Math.min(box[3], sp.y + rand(-70, 70)));
          if (!roomy(sp, x, y, list)) continue;
          go(sp, x, y, Math.max(500, dist(sp, { x, y }) / (speed || 110) * 1000));
          return;
        }
      });
    });
  }
  /** Chỗ (x, y) có đủ rộng cho `sp` — không đè lên nhân vật khác (tính theo đích đến của họ). */
  function roomy(sp, x, y, list) {
    const rx = sp.w * .95, ry = sp.h * .42;
    return list.every((o) => o === sp || o.gone || ((o.x - x) / rx) ** 2 + ((o.y - y) / ry) ** 2 > 1);
  }
  /** Chạy trốn khỏi điểm (ax, ay). */
  function flee(sp, ax, ay, box) {
    const base = Math.atan2(sp.y - ay, (sp.x - ax) || rand(-1, 1));
    let x = sp.x, y = sp.y;
    // Hướng ngược người bắt trước, không có chỗ trống thì lệch dần sang hai bên
    for (const turn of [0, .5, -.5, 1, -1, 1.6, -1.6]) {
      const cx = Math.max(box[0], Math.min(box[2], sp.x + Math.cos(base + turn) * 190));
      const cy = Math.max(box[1], Math.min(box[3], sp.y + Math.sin(base + turn) * 90));
      if (roomy(sp, cx, cy, actors)) { x = cx; y = cy; break; }
    }
    sp.el.classList.add('is-scared');
    return go(sp, x, y, 700).then(() => sp.el.classList.remove('is-scared'));
  }

  /**
   * Khung chung "người bắt" (gà mẹ, đèn pin, trọng tài, UFO, khủng long, lưỡi câu):
   * vài lần bắt hụt rải đều, lần cuối tới đúng người được gọi khi hết giờ.
   * o: { agent, list, plan, D, speed, offset(sp)→{x,y}, fake(sp), take(sp, final), before(sp) }
   */
  async function hunt(o) {
    const { plan, list, agent } = o;
    const t0 = performance.now(), end = t0 + o.D;
    const find = (name) => list.find((s) => s.data.name === name);
    const winner = find(plan.winner), decoy = plan.twist ? find(plan.twist) : null;
    const reach = async (sp, ms) => {
      sp.frozen = true;
      const p = o.offset ? o.offset(sp) : { x: sp.x, y: sp.y };
      if (o.before) o.before(sp);
      await go(agent, p.x, p.y, Math.max(350, ms), { ease: 'cubic-bezier(.4,0,.3,1)' });
    };
    const travel = (sp) => Math.min(1500, Math.max(450, dist(agent, sp) / o.speed * 1000));
    const fakes = Math.max(1, Math.min(5, Math.round(o.D / 4200)));
    const tail = decoy ? 4200 : 1500;
    for (let k = 0; k < fakes; k++) {
      const slot = t0 + (o.D - tail) * ((k + 1) / (fakes + 1));
      if (performance.now() < slot - 600) await sleep(slot - 600 - performance.now());
      if (performance.now() > end - tail - 900) break;
      const v = pickOne(list.filter((s) => s !== winner && s !== decoy && !s.gone)) || null;
      if (!v) break;
      await reach(v, travel(v));
      await o.fake(v);
      v.frozen = false;
    }
    if (decoy) {
      const left = end - performance.now() - 3000;
      await reach(decoy, Math.max(500, Math.min(1600, left)));
      await o.take(decoy, false);
      const bn = banner(decoy.data.full, 'Bắt được rồi!');
      await sleep(700);
      await bn.wrong();
      if (o.release) await o.release(decoy);
      decoy.frozen = false;
    }
    await reach(winner, Math.max(500, Math.min(1800, end - performance.now() - 300)));
    await o.take(winner, true);
  }

  // ============================================================
  // CÁC TRÒ
  // ============================================================
  const PLAY = {};

  // 🥚 Trộm trứng — gà mẹ ngủ, các bạn lén lấy trứng, gà thức dậy rượt
  PLAY.egg = async (items, plan, D) => {
    const pos = scatter(items.length, 340, 385, 975, 585);
    const list = kids(items, pos);
    const box = [320, 380, 980, 590];
    const eggs = [0, 1, 2, 3, 4].map((k) => sprite(A.egg(), 125 + k * 22 - (k > 2 ? 44 : 0), 412 + (k > 2 ? 12 : 0), { w: 22, cls: 'np-nest-egg' }));
    const hen = sprite(A.hen(), 150, 440, { w: 120, h: 110, cls: 'np-agent is-asleep' });
    say(hen, 'Khò khò...', 1400);
    wander(list, box);
    // Vài bạn lén tới ổ lấy trứng rồi chạy về
    N.shuffle(list, rng).slice(0, Math.min(5, list.length)).forEach((sp, k) => later(400 + k * 380, async () => {
      if (sp.frozen) return;
      sp.frozen = true;
      const bx = sp.x, by = sp.y;
      await go(sp, 255 + rand(-20, 20), 455 + rand(-15, 25), 900);
      if (eggs[k]) eggs[k].el.remove();
      sp.el.classList.add('has-egg');
      sp.el.querySelector('.np-sp-in').insertAdjacentHTML('beforeend', `<span class="np-carry">${A.egg()}</span>`);
      await go(sp, bx, by, 900);
      sp.frozen = false;
    }));
    await sleep(Math.min(2600, D * .22));
    hen.el.classList.remove('is-asleep');
    say(hen, 'Cục tác! Ai lấy trứng?!', 1300, 'hot');
    sfx('wrong');
    await hunt({
      agent: hen, list, plan, D: D - (performance.now() - plan.t0), speed: 340,
      offset: (sp) => ({ x: sp.x - 50, y: sp.y + 4 }),
      fake: async (sp) => { say(hen, pickOne(['Nhầm rồi, đi tiếp!', 'Không phải bạn này!', 'Ơ, trứng đâu?']), 900); await flee(sp, hen.x, hen.y, box); },
      take: async (sp, final) => {
        sp.el.classList.add('is-scared', 'is-caught');
        say(hen, final ? 'Lần này bắt được thật rồi!' : 'Bắt được rồi nhé!', 1400, 'hot');
        sfx(final ? 'combo' : 'flip');
        if (final) await Promise.all([go(sp, 250, 470, 1100), go(hen, 190, 470, 1100)]);
        else await sleep(600);
      },
      release: async (sp) => { sp.el.classList.remove('is-caught'); await flee(sp, hen.x, hen.y, box); },
    });
  };

  /** Lật kèo ở trò đua: bạn đang dẫn đầu khoe "về nhất chắc rồi" rồi bị vượt phút chót. */
  function twistTalk(t, list, plan) {
    if (!plan.twist) return;
    const d = list.find((s) => s.data.name === plan.twist);
    if (!d) return;
    if (t > .8 && !plan.saidA) { plan.saidA = true; say(d, 'Về nhất chắc rồi!', 1100); }
    if (t > .95 && !plan.saidB) { plan.saidB = true; say(d, 'Ơ... bị vượt rồi!', 1200, 'hot'); sfx('wrong'); }
  }

  // 🏁 Đường đua — mỗi bạn 1 làn, đổi người dẫn đầu, người được gọi về nhất
  PLAY.race = async (items, plan, D) => {
    const n = items.length, top = 86, laneH = 500 / n;
    const w = Math.max(18, Math.min(44, laneH * .8));
    world.querySelector('.np-bg svg').insertAdjacentHTML('beforeend', Array.from({ length: n - 1 }, (_, k) => `<path d="M0 ${top + laneH * (k + 1)}h1000" stroke="#f1d2bd" stroke-width="2" stroke-dasharray="14 10" opacity=".7"/>`).join(''));
    const list = items.map((it, k) => sprite(A.kid(it.idx), 40, top + laneH * (k + 1) - 3, { w, h: w * 1.62, tag: it.label, cls: 'np-kid-sp np-lane-kid', data: it }));
    list.forEach((sp) => sp.el.style.setProperty('--w', w + 'px'));
    const names = items.map((it) => it.name);
    const sc = N.raceScript(names, plan.winner, rng, plan.twist);
    shout('Đi!');
    sfx('flip');
    await sleep(700);
    list.forEach((sp) => sp.el.classList.add('is-run'));
    let lead = '';
    const t0 = performance.now(), run = D - 900;
    await new Promise((done) => {
      const step = (now) => {
        const t = Math.min(1, (now - t0) / run);
        let best = -1, who = null;
        list.forEach((sp, k) => {
          const x = 40 + N.raceAt(sc[names[k]], t) * 820;
          sp.el.style.transform = `translate(${x}px, ${sp.y}px)`;
          sp.x = x;
          if (x > best) { best = x; who = sp; }
        });
        if (who && who.data.name !== lead) { lead = who.data.name; list.forEach((s) => s.el.classList.toggle('is-lead', s === who)); sfx('click'); }
        twistTalk(t, list, plan);
        if (t < 1) frames.push(requestAnimationFrame(step)); else done();
      };
      frames.push(requestAnimationFrame(step));
    });
    list.forEach((sp) => sp.el.classList.remove('is-run'));
    const win = list.find((s) => s.data.name === plan.winner);
    win.el.classList.add('is-happy', 'is-win');
    burst(win.x, win.y - 30, ['🎉', '⭐', '✨'], 10);
    sfx('combo');
  };

  // 🎣 Câu cá — cá bơi, lưỡi câu thả xuống, cá cắn hụt, con cuối bị kéo lên
  PLAY.fish = async (items, plan, D) => {
    const pos = scatter(items.length, 130, 230, 880, 520);
    const list = items.map((it, k) => sprite(A.fish(A.FUN[it.idx % A.FUN.length]), pos[k].x, pos[k].y, { w: 70, h: 44, tag: it.label, cls: 'np-fish-sp', data: it }));
    actors = list;
    const inPond = (x, y) => ((x - 500) / 460) ** 2 + ((y - 360) / 190) ** 2 < 1;
    every(700, () => list.forEach((sp) => {
      if (sp.frozen || rng() > .4) return;
      let x, y, k = 0;
      do { x = sp.x + rand(-160, 160); y = sp.y + rand(-60, 60); } while (!inPond(x, y) && ++k < 8);
      if (inPond(x, y) && roomy(sp, x, y, list)) go(sp, x, y, rand(1200, 2000), { still: true, ease: 'ease-in-out' });
    }));
    const hook = sprite('<span class="np-bobber"></span>', 716, 92, { w: 18, h: 18, cls: 'np-agent np-hook' });
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    line.setAttribute('class', 'np-line'); line.setAttribute('viewBox', `0 0 ${W} ${H}`);
    line.innerHTML = '<line x1="716" y1="92" x2="716" y2="92" stroke="#3a3a3a" stroke-width="2"/>';
    fx.appendChild(line);
    const ln = line.querySelector('line');
    const wr = world.getBoundingClientRect.bind(world);
    const draw = () => {
      const r = hook.el.getBoundingClientRect(), s = wr().width / W, o = wr();
      ln.setAttribute('x2', (r.left - o.left) / s); ln.setAttribute('y2', (r.top - o.top) / s);
      frames.push(requestAnimationFrame(draw));
    };
    draw();
    await hunt({
      agent: hook, list, plan, D, speed: 420,
      offset: (sp) => ({ x: sp.x + 30, y: sp.y - 22 }),
      fake: async (sp) => { sp.el.classList.add('is-nibble'); say(sp, pickOne(['Tuột mất rồi!', 'Nhầm rồi, đi tiếp!', 'Suýt nữa!']), 900); sfx('click'); await sleep(700); sp.el.classList.remove('is-nibble'); go(sp, sp.x - 120, sp.y + rand(-30, 30), 600, { still: true }); },
      take: async (sp, final) => {
        sp.el.classList.add('is-hooked'); sfx('flip');
        say(sp, final ? 'Cắn câu rồi!' : 'Dính rồi!', 1200, 'hot');
        if (final) { await Promise.all([go(sp, 760, 150, 1000, { still: true, ease: 'ease-in' }), go(hook, 730, 130, 1000, { still: true, ease: 'ease-in' })]); burst(760, 120, ['💦', '💧', '✨'], 10); }
        else await sleep(500);
      },
      release: async (sp) => { sp.el.classList.remove('is-hooked'); say(sp, 'Tuột mất rồi!', 800); await go(sp, sp.x - 100, sp.y + 40, 500, { still: true }); },
    });
  };

  // 🎈 Bóng bay — chim mổ nổ từng quả, quả cuối cùng còn lại
  PLAY.balloon = async (items, plan, D) => {
    const pos = scatter(items.length, 70, 140, 930, 470);
    const bw = items.length <= 20 ? 80 : 56;
    const list = items.map((it, k) => sprite(A.balloon(A.FUN[it.idx % A.FUN.length]), pos[k].x, pos[k].y + 60, { w: bw, h: bw * 1.86, tag: it.label, cls: 'np-balloon-sp' + (bw > 60 ? ' is-big' : ''), data: it }));
    list.forEach((sp, k) => { sp.el.style.setProperty('--bd', (k % 5) * .4 + 's'); });
    const bird = sprite(A.bird(), -80, 120, { w: 110, h: 76, cls: 'np-agent np-bird-sp' });
    const order = N.popOrder(items.map((i) => i.name), plan.winner, rng, plan.twist);
    const find = (name) => list.find((s) => s.data.name === name);
    const pops = plan.twist ? order.slice(0, -1) : order;
    const gap = Math.max(120, (D - (plan.twist ? 4600 : 1600)) / Math.max(1, pops.length));
    const fakeAt = Math.floor(pops.length * rand(.4, .7));
    const pop = (sp) => { sp.gone = true; sp.el.classList.add('is-pop'); burst(sp.x, sp.y - 70, ['💥', '✨'], 6); sfx('flip'); };
    for (let k = 0; k < pops.length; k++) {
      if (k === fakeAt && gap > 260) {
        const w = find(plan.winner);
        await go(bird, w.x - 50, w.y - 80, gap * .8, { still: true, ease: 'ease-in-out' });
        say(w, 'Ơ, không nổ!', 900); w.el.classList.add('is-wobble'); later(700, () => w.el.classList.remove('is-wobble'));
        await sleep(400);
      }
      const sp = find(pops[k]);
      await go(bird, sp.x - 50, sp.y - 80, gap * .8, { still: true, ease: 'ease-in-out' });
      pop(sp);
      await sleep(gap * .2);
    }
    if (plan.twist) {
      const w = find(plan.winner), d = find(plan.twist);
      await go(bird, w.x - 50, w.y - 80, 500, { still: true });
      w.el.classList.add('is-away'); sfx('flip');
      await sleep(700);
      const bn = banner(d.data.full, 'Quả cuối cùng còn lại!');
      await sleep(700);
      await bn.wrong();
      w.el.classList.remove('is-away');
      say(w, 'Ơ, không nổ!', 1000);
      await sleep(500);
      await go(bird, d.x - 50, d.y - 80, 500, { still: true });
      pop(d);
    }
    await go(bird, 1120, 60, 900, { still: true });
    const w = find(plan.winner);
    w.el.classList.add('is-win');
    sfx('combo');
  };

  // 🦖 Khủng long — các bạn cầm bánh, khủng long đi ngửi, ăn mất bánh của 1 bạn
  PLAY.dino = async (items, plan, D) => {
    const n = items.length, cols = Math.min(8, Math.ceil(Math.sqrt(n * 2.2))), rows = Math.ceil(n / cols);
    const pos = items.map((_, k) => ({ x: 130 + (k % cols + .5) * (820 / cols), y: 330 + (Math.floor(k / cols) + 1) * (250 / rows) }));
    const list = kids(items, pos, { extra: () => `<span class="np-hold">${A.cake()}</span>` });
    list.forEach((sp, k) => sp.el.style.setProperty('--bd', (k % 6) * .25 + 's'));
    const dino = sprite(A.dino(), 1100, 330, { w: 240, h: 186, cls: 'np-agent np-dino-sp' });
    await go(dino, 860, 330, 900);
    say(dino, 'Hít hít...', 1000);
    await hunt({
      agent: dino, list, plan, D: D - 900, speed: 300,
      offset: (sp) => ({ x: sp.x + 115, y: sp.y + 6 }),
      before: () => { dino.el.classList.add('is-sniff'); },
      fake: async (sp) => { say(dino, pickOne(['Hít hít... không phải bánh này', 'Nhầm rồi, đi tiếp!', 'Thơm... nhưng chưa phải!']), 1000); sp.el.classList.add('is-scared'); await sleep(900); sp.el.classList.remove('is-scared'); dino.el.classList.remove('is-sniff'); },
      take: async (sp, final) => {
        dino.el.classList.add('is-chomp'); sfx('combo');
        const cake = sp.el.querySelector('.np-hold');
        if (final && cake) cake.remove();
        sp.el.classList.add(final ? 'is-cry' : 'is-scared');
        say(dino, final ? 'Măm măm! Ngon quá!' : 'Măm...', 1300, 'hot');
        if (final) burst(sp.x, sp.y - 60, ['🍰', '✨', '💫'], 8);
        await sleep(800);
        dino.el.classList.remove('is-chomp');
      },
      release: async (sp) => { sp.el.classList.remove('is-scared'); say(sp, 'Bánh vẫn còn!', 800); await sleep(400); },
    });
  };

  // 🚀 Tên lửa — phóng cùng lúc, chiếc nào chạm Mặt Trăng trước
  PLAY.rocket = async (items, plan, D) => {
    const n = items.length, cw = 940 / n, w = Math.max(28, Math.min(58, cw * .82));
    const list = items.map((it, k) => sprite(A.rocket(A.FUN[it.idx % A.FUN.length]), 30 + cw * (k + .5), 540, { w, h: w * 1.86, tag: it.label, cls: 'np-rocket-sp' + (k % 2 ? ' is-alt' : ''), data: it }));
    const names = items.map((it) => it.name);
    const sc = N.raceScript(names, plan.winner, rng, plan.twist);
    shout('3... 2... 1... Phóng!');
    sfx('flip');
    await sleep(900);
    list.forEach((sp) => sp.el.classList.add('is-fly'));
    const t0 = performance.now(), run = D - 1100;
    let lead = '';
    await new Promise((done) => {
      const step = (now) => {
        const t = Math.min(1, (now - t0) / run);
        let best = -1, who = null;
        list.forEach((sp, k) => {
          const p = N.raceAt(sc[names[k]], t);
          const y = 540 - p * 380;
          sp.el.style.transform = `translate(${sp.x}px, ${y}px)`;
          sp.y = y;
          if (p > best) { best = p; who = sp; }
        });
        if (who && who.data.name !== lead) { lead = who.data.name; list.forEach((s) => s.el.classList.toggle('is-lead', s === who)); sfx('click'); }
        twistTalk(t, list, plan);
        if (t < 1) frames.push(requestAnimationFrame(step)); else done();
      };
      frames.push(requestAnimationFrame(step));
    });
    const win = list.find((s) => s.data.name === plan.winner);
    win.el.classList.add('is-win');
    burst(win.x, 130, ['⭐', '✨', '🌟'], 12);
    sfx('combo');
  };

  // 🔦 Đèn pin — lớp học tắt đèn, vệt sáng đi tìm, bạn bị chiếu thì chạy
  PLAY.light = async (items, plan, D) => {
    const pos = scatter(items.length, 60, 330, 940, 585);
    const list = kids(items, pos);
    const box = [40, 320, 960, 590];
    const dark = document.createElement('div');
    dark.className = 'np-dark';
    fx.appendChild(dark);
    const spot = sprite('<span class="np-spot"></span>', 500, 420, { w: 10, h: 10, cls: 'np-agent np-spot-sp' });
    // Vệt sáng là 1 vòng tròn với bóng đen phủ kín sân khấu — chạy theo vị trí của "spot"
    const ring = document.createElement('div');
    ring.className = 'np-spot-ring';
    fx.appendChild(ring);
    const follow = () => { ring.style.transform = spot.el.style.transform; ring.style.transition = spot.el.style.transition; };
    const mo = new MutationObserver(follow);
    mo.observe(spot.el, { attributes: true, attributeFilter: ['style'] });
    timers.push(setTimeout(() => {}, 0));
    follow();
    wander(list, box, 90);
    try {
      await hunt({
        agent: spot, list, plan, D, speed: 520,
        offset: (sp) => ({ x: sp.x, y: sp.y - sp.h * .45 }),
        fake: async (sp) => { say(sp, pickOne(['Nhầm rồi, đi tiếp!', 'Không phải mình!', 'Á, chói quá!']), 900); sfx('click'); await flee(sp, sp.x + rand(-1, 1) * 40, sp.y, box); },
        take: async (sp, final) => {
          sp.el.classList.add('is-scared');
          if (final) { ring.classList.add('is-found'); dark.classList.add('is-found'); say(sp, 'Bị tìm thấy rồi!', 1400, 'hot'); sfx('combo'); }
          await sleep(final ? 700 : 500);
        },
        release: async (sp) => { sp.el.classList.remove('is-scared'); await flee(sp, sp.x, sp.y - 30, box); },
      });
    } finally { mo.disconnect(); }
  };

  // 🎁 Hộp quà — các hộp đổi chỗ, mở thử vài hộp trống, hộp cuối có tên
  PLAY.gift = async (items, plan, D) => {
    const n = items.length;
    const pos = scatter(n, 90, 170, 910, 520);
    const list = items.map((it, k) => sprite(A.gift(A.FUN[it.idx % A.FUN.length]), pos[k].x, pos[k].y, { w: 74, h: 74, tag: it.label, cls: 'np-gift-sp', data: it }));
    const find = (name) => list.find((s) => s.data.name === name);
    const t0 = performance.now(), mixEnd = t0 + D * .55;
    // Đổi chỗ từng cặp, nhanh dần rồi chậm lại
    while (performance.now() < mixEnd) {
      const a = pickOne(list), b = pickOne(list.filter((s) => s !== a));
      const pa = { x: a.x, y: a.y };
      const ms = 260 + 340 * ((performance.now() - t0) / (D * .55));
      go(a, b.x, b.y, ms, { still: true, ease: 'ease-in-out' });
      go(b, pa.x, pa.y, ms, { still: true, ease: 'ease-in-out' });
      sfx('click');
      await sleep(ms * .6);
    }
    await sleep(400);
    const open = async (sp, real) => {
      sp.el.classList.add('is-open'); sfx(real ? 'combo' : 'flip');
      if (real) burst(sp.x, sp.y - 50, ['🎉', '🎊', '⭐', '✨'], 14);
      else say(sp, pickOne(['Trống trơn!', 'Hộp rỗng!', 'Nhầm rồi, đi tiếp!']), 900);
      await sleep(real ? 800 : 900);
      if (!real) sp.el.classList.remove('is-open');
    };
    const rest = N.shuffle(list.filter((s) => s.data.name !== plan.winner && s.data.name !== plan.twist), rng);
    const fakes = Math.max(1, Math.min(3, Math.round(D / 5000)));
    for (let k = 0; k < fakes && rest[k]; k++) { rest[k].el.classList.add('is-shake'); await sleep(500); rest[k].el.classList.remove('is-shake'); await open(rest[k], false); }
    if (plan.twist) {
      const d = find(plan.twist);
      d.el.classList.add('is-shake'); await sleep(600); d.el.classList.remove('is-shake');
      d.el.classList.add('is-open');
      const bn = banner(d.data.full, 'Hộp này có tên...');
      await sleep(700);
      await bn.wrong();
      d.el.classList.remove('is-open');
    }
    const w = find(plan.winner);
    w.el.classList.add('is-shake'); await sleep(700); w.el.classList.remove('is-shake');
    await open(w, true);
    w.el.classList.add('is-win');
  };

  // 🟥 Thẻ đỏ — các bạn chạy quanh sân, trọng tài rút thẻ vàng (hụt) rồi thẻ đỏ
  PLAY.card = async (items, plan, D) => {
    const pos = scatter(items.length, 120, 230, 880, 560);
    const list = kids(items, pos);
    const box = [60, 210, 940, 570];
    const ref = sprite(A.referee(), 880, 520, { w: 58, h: 94, cls: 'np-agent np-ref-sp' });
    const ball = sprite('<span class="np-ball">⚽</span>', 520, 400, { w: 26, h: 26, cls: 'np-ball-sp' });
    every(900, () => { go(ball, rand(150, 850), rand(260, 540), 850, { still: true, ease: 'ease-out' }); });
    wander(list, box, 150);
    await hunt({
      agent: ref, list, plan, D, speed: 380,
      offset: (sp) => ({ x: sp.x + 46, y: sp.y + 2 }),
      fake: async (sp) => {
        ref.el.classList.add('card-y'); say(ref, pickOne(['Thẻ vàng thôi!', 'Nhắc nhở nhé!', 'Nhầm rồi, đi tiếp!']), 1000); sfx('click');
        await sleep(800); ref.el.classList.remove('card-y'); await flee(sp, ref.x, ref.y, box);
      },
      take: async (sp, final) => {
        ref.el.classList.add('card-r'); sp.el.classList.add('is-scared');
        say(ref, final ? 'Toét! Thẻ đỏ!' : 'Thẻ đỏ...?', 1300, 'hot'); sfx(final ? 'combo' : 'flip');
        await sleep(700);
        if (!final) ref.el.classList.remove('card-r');
      },
      release: async (sp) => { sp.el.classList.remove('is-scared'); say(ref, 'À không, nhầm!', 800); await flee(sp, ref.x, ref.y, box); },
    });
  };

  // 🛸 UFO — các bạn chạy trên vỉa hè, đĩa bay chiếu tia hút thử rồi bắt cóc 1 bạn
  PLAY.ufo = async (items, plan, D) => {
    const big = items.length > CROWD;
    const pos = scatter(items.length, 40, 385, 960, big ? 585 : 468);
    const list = kids(items, pos);
    const box = [30, 375, 970, big ? 590 : 470];
    const ufo = sprite(A.ufo() + '<span class="np-beam"></span>', 500, 170, { w: 170, h: 94, cls: 'np-agent np-ufo-sp' });
    const bus = sprite(A.bus(), -200, 590, { w: 170, h: 85, cls: 'np-bus-sp' });
    if (big) bus.el.remove(); else go(bus, 1200, 590, Math.max(4000, D * .8), { still: true });
    wander(list, box, 140);
    await hunt({
      agent: ufo, list, plan, D, speed: 420,
      offset: (sp) => ({ x: sp.x, y: Math.max(150, sp.y - 210) }),
      fake: async (sp) => {
        ufo.el.classList.add('is-beam'); sp.el.classList.add('is-scared', 'is-lift'); say(ufo, pickOne(['Nhả ra!', 'Nhầm rồi, đi tiếp!', 'Bạn này nặng quá!']), 1000); sfx('click');
        await sleep(900); sp.el.classList.remove('is-lift'); ufo.el.classList.remove('is-beam'); await flee(sp, sp.x + rand(-1, 1) * 30, sp.y - 20, box);
      },
      take: async (sp, final) => {
        ufo.el.classList.add('is-beam'); sp.el.classList.add('is-scared', 'is-lift');
        say(ufo, final ? 'Bắt cóc thành công!' : 'Lên đây nào!', 1300, 'hot'); sfx(final ? 'combo' : 'flip');
        if (final) { await sleep(500); sp.el.classList.add('is-abduct'); await sleep(900); }
        else await sleep(700);
      },
      release: async (sp) => { sp.el.classList.remove('is-lift'); ufo.el.classList.remove('is-beam'); await flee(sp, sp.x, sp.y, box); },
    });
  };

  // ============================================================
  // API
  // ============================================================
  /** Nhãn ngắn trên nhân vật: số thứ tự, hoặc tên gọi (thêm chữ đệm nếu trùng). */
  function labels(names, numeric) {
    if (numeric) return names.map((n) => n);
    const words = names.map((n) => n.split(' '));
    const short = words.map((w) => w[w.length - 1]);
    const count = {};
    short.forEach((s) => { count[s] = (count[s] || 0) + 1; });
    return words.map((w, k) => (count[short[k]] > 1 && w.length > 1 ? w.slice(-2).join(' ') : short[k]));
  }
  /** Chọn nhóm lên sân khấu (giữ nguyên thứ tự danh sách để nhân vật không "đổi áo" giữa các lượt). */
  function cast(game, list, plan, numeric, allNames) {
    const cap = CAP[game] || 50;
    let show = list;
    if (list.length > cap) {
      const keep = new Set(N.finalists(list, plan ? plan.winner : list[0], cap, rng, plan && plan.twist));
      show = list.filter((n) => keep.has(n));
    }
    const all = allNames || list;
    // Đông (> 24 bạn trên sân khấu): huy hiệu SỐ THỨ TỰ trong danh sách lớp như trang tham khảo — tên dài sẽ đè lên nhau
    const crowd = !numeric && show.length > CROWD;
    const lb = crowd ? show.map((n) => String(all.indexOf(n) + 1)) : labels(show, numeric);
    return show.map((name, k) => ({ name, full: numeric ? 'Số ' + name : name, label: lb[k], idx: Math.max(0, all.indexOf(name)) }));
  }
  /** Cảnh chờ: sân khấu tĩnh với nhân vật đứng yên. */
  function idle(game, list, numeric, allNames) {
    const g = byId(game);
    reset(g.scene);
    const items = cast(game, list, null, numeric, allNames);
    if (!items.length) return;
    // Mỗi trò vẽ cảnh đầu bằng chính hàm chơi với thời gian 0: dùng bố cục tĩnh đơn giản cho nhanh
    if (game === 'race') {
      const laneH = 500 / items.length, w = Math.max(18, Math.min(44, laneH * .8));
      items.forEach((it, k) => sprite(A.kid(it.idx), 40, 86 + laneH * (k + 1) - 3, { w, h: w * 1.62, tag: it.label, cls: 'np-kid-sp np-lane-kid' }).el.style.setProperty('--w', w + 'px'));
    } else if (game === 'rocket') {
      const cw = 940 / items.length, w = Math.max(28, Math.min(58, cw * .82));
      items.forEach((it, k) => sprite(A.rocket(A.FUN[it.idx % A.FUN.length]), 30 + cw * (k + .5), 540, { w, h: w * 1.86, tag: it.label, cls: 'np-rocket-sp' + (k % 2 ? ' is-alt' : '') }));
    } else if (game === 'fish') {
      scatter(items.length, 130, 230, 880, 520).forEach((p, k) => sprite(A.fish(A.FUN[items[k].idx % A.FUN.length]), p.x, p.y, { w: 70, h: 44, tag: items[k].label, cls: 'np-fish-sp' }));
    } else if (game === 'balloon') {
      const bw = items.length <= 20 ? 80 : 56;
      scatter(items.length, 70, 140, 930, 470).forEach((p, k) => { const s = sprite(A.balloon(A.FUN[items[k].idx % A.FUN.length]), p.x, p.y + 60, { w: bw, h: bw * 1.86, tag: items[k].label, cls: 'np-balloon-sp' + (bw > 60 ? ' is-big' : '') }); s.el.style.setProperty('--bd', (k % 5) * .4 + 's'); });
    } else if (game === 'gift') {
      scatter(items.length, 90, 170, 910, 520).forEach((p, k) => sprite(A.gift(A.FUN[items[k].idx % A.FUN.length]), p.x, p.y, { w: 74, h: 74, tag: items[k].label, cls: 'np-gift-sp' }));
    } else if (game === 'dino') {
      const n = items.length, cols = Math.min(8, Math.ceil(Math.sqrt(n * 2.2))), rows = Math.ceil(n / cols);
      kids(items, items.map((_, k) => ({ x: 130 + (k % cols + .5) * (820 / cols), y: 330 + (Math.floor(k / cols) + 1) * (250 / rows) })), { extra: () => `<span class="np-hold">${A.cake()}</span>` });
      sprite(A.dino(), 870, 330, { w: 240, h: 186, cls: 'np-agent np-dino-sp' });
    } else {
      const box = { egg: [340, 385, 975, 585], light: [60, 330, 940, 585], card: [120, 230, 880, 560], ufo: [40, 385, 960, items.length > CROWD ? 585 : 468] }[game];
      const pos = scatter(items.length, ...box);
      const list2 = kids(items, pos);
      if (game === 'egg') { [0, 1, 2, 3, 4].forEach((k) => sprite(A.egg(), 125 + k * 22 - (k > 2 ? 44 : 0), 412 + (k > 2 ? 12 : 0), { w: 22, cls: 'np-nest-egg' })); sprite(A.hen(), 150, 440, { w: 120, h: 110, cls: 'np-agent is-asleep' }); }
      if (game === 'card') sprite(A.referee(), 880, 520, { w: 58, h: 94, cls: 'np-agent np-ref-sp' });
      if (game === 'ufo') { sprite(A.ufo(), 500, 170, { w: 170, h: 94, cls: 'np-agent np-ufo-sp' }); if (items.length <= CROWD) sprite(A.bus(), 860, 590, { w: 170, h: 85, cls: 'np-bus-sp' }); }
      if (game === 'light') { const d = document.createElement('div'); d.className = 'np-dark is-idle'; fx.appendChild(d); }
      list2.forEach((s, k) => s.el.style.setProperty('--bd', (k % 6) * .25 + 's'));
    }
    const hint = document.createElement('div');
    hint.className = 'np-hint-pill';
    hint.textContent = list.length > (CAP[game] || 50) ? `Bấm "Bắt đầu!" · mỗi lượt ${CAP[game]} bạn lên sân khấu` : 'Bấm vào đây hoặc nút "Bắt đầu!" để chơi';
    fx.appendChild(hint);
  }
  /** Chơi 1 lượt. plan: { list, winner, twist, ms }. Trả Promise khi diễn xong (khung tên do trang vẽ). */
  async function play(game, plan, numeric, allNames) {
    const g = byId(game);
    reset(g.scene);
    const items = cast(game, plan.list, plan, numeric, allNames);
    plan.t0 = performance.now();
    clock(plan.ms);
    try { await PLAY[game](items, plan, plan.ms); } finally { stopAll(); }
    // Đồng hồ dừng ở 00
    const c = fx.querySelector('.np-clock b'); if (c) c.textContent = '00';
  }
  /** Khung tên kết quả trên sân khấu (trang thêm nút hành động vào trong). */
  function result(name, sub, twisted) {
    fx.querySelectorAll('.np-banner, .np-say, .np-hint-pill').forEach((e) => e.remove());
    const b = document.createElement('div');
    b.className = 'np-banner is-final';
    b.innerHTML = `<div class="np-banner-box">${twisted ? '<span class="np-twist-tag">Lật kèo!</span>' : ''}<p class="np-banner-lbl">Mời bạn</p>
      <p class="np-banner-nm" id="npRevealName">${esc(name)}</p>${sub ? `<p class="np-banner-sub">${esc(sub)}</p>` : ''}<div class="np-banner-acts"></div></div>`;
    fx.appendChild(b);
    return b.querySelector('.np-banner-acts');
  }
  function clearResult() { if (fx) fx.querySelectorAll('.np-banner').forEach((e) => e.remove()); }

  global.EduNamePickerGames = { GAMES, CAP, mount, idle, play, result, clearResult, labels, stop: stopAll };
})(window);
