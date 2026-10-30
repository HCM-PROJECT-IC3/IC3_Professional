/* ============================================================
   js/name-picker/np-games.js — sân khấu + 11 trò của trang Gọi tên (goi-ten.html), gồm Đua bi (marble race).
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
  const music = (lv) => { try { global.EduSFX && global.EduSFX.music && global.EduSFX.music(lv); } catch (e) { /* ignore */ } };
  const P = global.EduParty; // pháo hoa, tia sáng, chữ nảy (js/fx-party.js)
  // Câu khen khi công bố — vui, đúng chính tả, không chê ai (cùng tinh thần TREND ở js/arena/arena-hype.js)
  const CHEER = ['Đỉnh nóc, kịch trần, bay phấp phới!', 'Người được chọn đã xuất hiện!', 'Sân khấu này là của em!', 'Tự tin toả sáng nào!',
    'Cả lớp cho một tràng pháo tay nào!', 'Trúng thưởng rồi nha!', 'Chuẩn bị trổ tài nào!'];
  const CHEER_TWIST = ['Lật kèo ngoạn mục!', 'Bất ngờ chưa!', 'Cú quay xe đỉnh cao!'];
  /** Biểu tượng rơi cùng ruy băng lúc công bố — mỗi trò một bộ, hợp với cảnh của trò đó. */
  const THEME = {
    egg: ['🥚', '🐣', '🐥'], race: ['🏁', '🏆', '⭐'], fish: ['🐟', '🐠', '💧'], balloon: ['🎈', '🎈', '⭐'], dino: ['🦖', '🍰', '🦕'],
    rocket: ['🚀', '⭐', '🌙'], light: ['🔦', '✨', '⭐'], gift: ['🎁', '🎀', '⭐'], card: ['🟥', '⚽', '📣'], ufo: ['🛸', '👽', '⭐'], marble: ['🔴', '🔵', '🟢', '🟠'],
  };
  const flashlight = '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M8 30l14-14 10 10-14 14z" fill="#5b6478"/><path d="M22 16l8-8 10 10-8 8z" fill="#ffd34d"/><path d="M30 8l10 10" stroke="#fff3b0" stroke-width="3"/><path d="M8 30l10 10-4 4-10-10z" fill="#3a4052"/></svg>';
  const marbleIcon = '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M4 32l40-12" stroke="#3a2a1e" stroke-width="5" stroke-linecap="round"/><path d="M4 32l40-12" stroke="#2f7be0" stroke-width="2.5" stroke-linecap="round"/>' + [[12, 21, '#e5484d'], [24, 17.5, '#f19a1a'], [36, 14, '#16a37f']].map(([x, y, c]) => `<circle cx="${x}" cy="${y}" r="6.5" fill="${c}" stroke="#3a2a1e" stroke-width="2"/><circle cx="${x - 2}" cy="${y - 2.5}" r="2" fill="#fff" opacity=".8"/>`).join('') + '</svg>';
  const flag = '<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="8" y="6" width="4" height="38" rx="2" fill="#6b4a2a"/>' + Array.from({ length: 12 }, (_, k) => `<rect x="${12 + (k % 4) * 7}" y="${6 + Math.floor(k / 4) * 7}" width="7" height="7" fill="${(k + Math.floor(k / 4)) % 2 ? '#fff' : '#222'}"/>`).join('') + '</svg>';

  /** 10 trò theo trang tham khảo + Đua bi (marble race). scene: cảnh nền trong np-art.js — mỗi trò 1 cảnh riêng. */
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
    { id: 'marble', name: 'Đua bi', desc: 'Bi ai lăn về nhất', scene: 'pegboard', icon: () => marbleIcon },
  ];
  const byId = (id) => GAMES.find((g) => g.id === id) || GAMES[0];
  /** Số nhân vật tối đa trên sân khấu theo trò (đông hơn thì máy chọn 1 nhóm, luôn có người được gọi). */
  const CAP = { race: 20, rocket: 20, dino: 24, gift: 24, fish: 30, balloon: 40, marble: 30 };
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
    const fit = () => { applyCam(); world.classList.toggle('is-small', stage.clientWidth / W < .6); };
    if (scaleObs) scaleObs.disconnect();
    scaleObs = new ResizeObserver(fit);
    scaleObs.observe(stage);
    fit();
  }
  /** Máy quay: phóng z lần, (x, y) ở giữa khung (không lộ ra ngoài tranh). Đua bi dùng khi về đích; trò khác luôn z = 1. */
  let camZ = 1, camX = W / 2, camY = H / 2;
  function applyCam() {
    if (!stage) return;
    const s = stage.clientWidth / W, z = camZ;
    const tx = Math.max(W / z - W, Math.min(0, W / (2 * z) - camX)), ty = Math.max(H / z - H, Math.min(0, H / (2 * z) - camY));
    world.style.transform = z === 1 ? `scale(${s})` : `scale(${s * z}) translate(${tx}px, ${ty}px)`;
  }
  function camera(z, x, y) { camZ = Math.max(1, z); camX = x; camY = y; applyCam(); }
  function stopAll() {
    timers.forEach(clearTimeout); timers.forEach(clearInterval); timers = [];
    frames.forEach(cancelAnimationFrame); frames = [];
  }
  function reset(scene) {
    stopAll();
    camera(1, W / 2, H / 2);
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
    if (o.data) el.dataset.name = o.data.name; // để soi đèn đúng người lúc công bố (spotlight)
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
    let last = -1;
    const tick = () => {
      const s = Math.max(0, Math.ceil((end - performance.now()) / 1000));
      c.innerHTML = `<i class="fa-solid fa-stopwatch" aria-hidden="true"></i><b>${String(s).padStart(2, '0')}</b><small>giây</small>`;
      c.classList.toggle('is-low', s <= 3);
      // 5 giây cuối tích tắc, 3 giây cuối tim đập + viền sân khấu nhấp nháy
      if (s > 0 && s <= 5 && s !== last) { last = s; sfx(s <= 3 ? 'heartbeat' : 'tick'); }
      if (s > 0) music(s > 5 ? 1 : s > 2 ? 2 : 3); // nhạc nền dồn dập dần theo đồng hồ
      world.classList.toggle('is-tense', s > 0 && s <= 3);
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
      async wrong() {
        b.querySelector('.np-banner-nm').classList.add('is-wrong');
        b.querySelector('.np-banner-box').insertAdjacentHTML('beforeend', '<span class="np-stamp">NHẦM RỒI!</span>');
        sfx('wrong');
        // Rung khung sân khấu (không rung .np-world vì nó đang mang transform phóng to)
        if (global.EduFX) global.EduFX.shake(stage);
        if (P) P.flash('bad');
        await sleep(1300); b.remove();
      },
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

  // Trộm trứng — gà mẹ ngủ, các bạn lén lấy trứng, gà thức dậy rượt
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

  // Đường đua — mỗi bạn 1 làn, đổi người dẫn đầu, người được gọi về nhất
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

  // Câu cá — cá bơi, lưỡi câu thả xuống, cá cắn hụt, con cuối bị kéo lên
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

  // Bóng bay — chim mổ nổ từng quả, quả cuối cùng còn lại
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

  // Khủng long — các bạn cầm bánh, khủng long đi ngửi, ăn mất bánh của 1 bạn
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

  // Tên lửa — phóng cùng lúc, chiếc nào chạm Mặt Trăng trước
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

  // Đèn pin — lớp học tắt đèn, vệt sáng đi tìm, bạn bị chiếu thì chạy
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

  // Hộp quà — các hộp đổi chỗ, mở thử vài hộp trống, hộp cuối có tên
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

  // Thẻ đỏ — các bạn chạy quanh sân, trọng tài rút thẻ vàng (hụt) rồi thẻ đỏ
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

  // UFO — các bạn chạy trên vỉa hè, đĩa bay chiếu tia hút thử rồi bắt cóc 1 bạn
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

  // Đua bi (kiểu "marble race" đang hot trên mạng xã hội) — mỗi bạn 1 viên bi; trộn trong phễu rồi thả xuống
  // đường ván zigzag 4 dốc đầy bẫy: cối xay hất ngược, bệ tăng tốc, MÁY TRỘN đảo thứ tự, LÒ XO tung bi lên trời,
  // BẪY SẬP rơi xuống ống hút về lại đầu dốc. Gần đích chạy chậm + máy quay zoom theo bi dẫn đầu, chụp ảnh về đích.
  // Cả trận được MÔ PHỎNG TRƯỚC theo đúng luật đường đua (mbSim), chọn trận kịch tính nhất trong vài lần thử,
  // rồi mới gán tên: người được gọi nhận đường bi về nhất, "Lật kèo" nhận đường bi dẫn đầu gần đích — mọi bất ngờ đều thật.
  const MB_INK = '#3a2a1e';
  /** Đường TÂM bi: dốc (L) nối bằng khúc quặt (Q) — bi văng ra thành chắn rồi rơi xuống dốc dưới. */
  const MB_PATH = [
    ['L', 128, 112, 712, 166],
    ['Q', 712, 166, 812, 172, 742, 228],
    ['L', 742, 228, 112, 284],
    ['Q', 112, 284, 22, 292, 100, 344],
    ['L', 100, 344, 742, 398],
    ['Q', 742, 398, 812, 404, 742, 458],
    ['L', 742, 458, 170, 512],
  ];
  const MB_RAMP = ['#e5484d', '#2f7be0', '#16a37f', '#f19a1a'];
  /** Vị trí (x) các bẫy/đồ chơi trên dốc; bin = máng đích dưới đáy; tube = ống hút từ bẫy sập về đầu dốc 4. */
  const MB = { spin: 330, boost: 600, mush: [210, 660], drum: 430, drumR: 40, trap: 470, binL: 40, binR: 450, floor: 548, tubeX: 772 };
  const mbR = (n) => (n <= 10 ? 15 : n <= 20 ? 12 : 10);
  /** y của dốc thứ i (0..3) tại x. */
  const mbY = (i, x) => { const g = MB_PATH[i * 2]; return g[2] + (g[4] - g[2]) * (x - g[1]) / (g[3] - g[1]); };
  const mbTrapOpen = (t) => ((t + .6) % 1.8) < .55;   // bẫy sập mở 0,55 giây mỗi 1,8 giây (giây mô phỏng)
  /** Đường gấp khúc → at(d) theo quãng đường. */
  function mbPoly(points) {
    const ds = [0];
    for (let i = 1; i < points.length; i++) ds.push(ds[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
    const L = ds[ds.length - 1];
    return { L, at(d) {
      const v = Math.max(0, Math.min(L, d));
      let i = 1; while (i < ds.length - 1 && ds[i] < v) i++;
      const f = (v - ds[i - 1]) / ((ds[i] - ds[i - 1]) || 1);
      return { x: points[i - 1].x + (points[i].x - points[i - 1].x) * f, y: points[i - 1].y + (points[i].y - points[i - 1].y) * f };
    } };
  }
  /** Lấy mẫu đường chính; at(d) theo quãng đường; dRamp(i, x) / dTurn(j, f) = quãng đường tới 1 điểm trên dốc / khúc quặt. */
  function mbTrack() {
    const pts = [], first = [];
    MB_PATH.forEach((g) => {
      const n = g[0] === 'L' ? 24 : 18;
      first.push(Math.max(0, pts.length - 1));
      for (let k = pts.length ? 1 : 0; k <= n; k++) {
        const t = k / n, u = 1 - t;
        pts.push(g[0] === 'L'
          ? { x: g[1] + (g[3] - g[1]) * t, y: g[2] + (g[4] - g[2]) * t }
          : { x: u * u * g[1] + 2 * u * t * g[3] + t * t * g[5], y: u * u * g[2] + 2 * u * t * g[4] + t * t * g[6] });
      }
    });
    const P = mbPoly(pts);
    let acc = 0;
    const cum = pts.map((p, i) => (acc += i ? Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y) : 0));
    const segD = first.map((i) => cum[i]).concat(P.L);
    const isTurn = (d) => [1, 3, 5].some((j) => d >= segD[j] && d < segD[j + 1]);
    return {
      L: P.L, at: P.at, isTurn, segD,
      dRamp: (i, x) => { const g = MB_PATH[i * 2]; return segD[i * 2] + (x - g[1]) / (g[3] - g[1]) * (segD[i * 2 + 1] - segD[i * 2]); },
      dTurn: (j, f) => segD[j] + f * (segD[j + 1] - segD[j]),
    };
  }
  const mbDrumC = (r) => ({ x: MB.drum, y: mbY(2, MB.drum) - (MB.drumR - r - 4) });
  const mbTube = () => mbPoly([{ x: MB.trap, y: mbY(3, MB.trap) }, { x: MB.trap, y: MB.floor }, { x: MB.tubeX, y: MB.floor }, { x: MB.tubeX, y: 482 }, { x: 742, y: 458 }]);
  /** Chỗ của bi về đích thứ k trong máng đích (lấp từ phải sang, hết hàng thì xếp chồng hàng trên). */
  function mbSlot(k, r) {
    const cap = Math.max(1, Math.floor((MB.binR - MB.binL) / (2 * r + 2)));
    return { x: MB.binR - r - 2 - (k % cap) * (2 * r + 2), y: MB.floor - Math.floor(k / cap) * (2 * r) };
  }

  /**
   * Mô phỏng cả trận (không vẽ), bước 1/30 giây. Mỗi khung lưu [x, y, rd, cờ] cho từng bi
   * (rd = quãng đường để xếp hạng; cờ: 1 tăng tốc · 2 trong máy trộn · 4 bay · 8 trong ống · 16 về đích).
   * Trả { frames, dt, Tw (lúc bi đầu tiên về đích), fin (thứ tự về đích), late (dẫn đầu ở 86% trận), events, score }.
   */
  function mbSim(slots, r, T) {
    const n = slots.length, dt = 1 / 30, dc = mbDrumC(r), rin = MB.drumR - r - 4, tube = mbTube();
    const F = {
      spin: T.dRamp(1, MB.spin), boost: T.dRamp(1, MB.boost), mush: MB.mush.map((x) => T.dRamp(2, x)),
      drum: T.dRamp(2, MB.drum), launch: T.dTurn(5, .5), trap: T.dRamp(3, MB.trap), r4: T.dRamp(3, 742) + 2,
      back: T.dRamp(2, 300), fwd: T.dRamp(3, 400),
    };
    const M = slots.map(() => ({ st: 'wait', d: 0, v: 0, v0: rand(128, 172), ph: rand(0, 6.3), hop: 0, hop0: 1, boost: 0, spun: 0, flew: 0, fell: 0 }));
    slots.map((p, i) => i).sort((a, b) => slots[b].y - slots[a].y || Math.abs(slots[a].x - 132) - Math.abs(slots[b].x - 132))
      .forEach((i, k) => { M[i].rel = .1 + k * .07; });
    const frames = [], events = [], fin = [];
    let t = 0;
    for (; t < 75; t += dt) {
      const out = new Float32Array(n * 4);
      M.forEach((m, i) => {
        // ── Cập nhật trạng thái ──
        if (m.st === 'wait' && t >= m.rel) { m.st = 'enter'; m.e = 0; }
        else if (m.st === 'enter') { m.e += dt / .3; if (m.e >= 1) { m.st = 'path'; m.d = 0; } }
        else if (m.st === 'path') {
          m.v = m.v0 * (1 + .2 * Math.sin(t * 1.7 + m.ph)) * (T.isTurn(m.d) ? .85 : 1) * (m.boost > 0 ? 1.9 : 1);
          const d0 = m.d;
          m.d += m.v * dt;
          m.boost = Math.max(0, m.boost - dt); m.hop = Math.max(0, m.hop - dt);
          const cross = (fd) => d0 < fd && m.d >= fd;
          const hop = (s) => { m.hop = s; m.hop0 = s; };
          if (cross(F.spin) && m.spun < 2 && rng() < .38) { m.spun++; m.d = F.spin - 90; hop(.45); events.push({ t, type: 'spin', i }); }
          if (cross(F.boost)) { m.boost = .9; events.push({ t, type: 'boost', i }); }
          F.mush.forEach((fd) => { if (cross(fd)) hop(.3); });
          if (cross(F.drum)) { m.st = 'drum'; m.d = F.drum; m.hold = rand(.35, 2.6); m.th = Math.PI / 2; events.push({ t, type: 'drum', i }); }
          else if (cross(F.launch) && m.flew < 2 && rng() < .45) {
            m.flew++;
            const toD = rng() < .5 ? F.back : F.fwd;
            m.st = 'air'; m.air = { p: 0, from: T.at(F.launch), toD, to: T.at(toD) };
            events.push({ t, type: toD === F.back ? 'back' : 'fwd', i });
          } else if (cross(F.trap) && !m.fell && mbTrapOpen(t)) { m.fell = 1; m.st = 'tube'; m.tp = 0; events.push({ t, type: 'trap', i }); }
          else if (m.d >= T.L) {
            m.st = 'done'; m.fin = fin.length; m.ft = t; fin.push(i);
            const s = mbSlot(m.fin, r);
            m.drop = mbPoly([T.at(T.L), { x: 84, y: mbY(3, 84) }, { x: MB.binL + r + 4, y: s.y }, s]); m.dd = 0;
          }
        } else if (m.st === 'drum') { m.hold -= dt; m.th += 7.5 * dt; if (m.hold <= 0) { m.st = 'path'; m.d = F.drum + 1; } }
        else if (m.st === 'air') { m.air.p += dt / 1.0; if (m.air.p >= 1) { m.st = 'path'; m.d = m.air.toD; m.hop = .3; m.hop0 = .3; } }
        else if (m.st === 'tube') { m.tp += dt / 1.4; if (m.tp >= 1) { m.st = 'path'; m.d = F.r4; } }
        else if (m.st === 'done') m.dd += 260 * dt;
        // ── Vị trí ──
        let x, y, rd, fl = 0;
        if (m.st === 'wait') { x = slots[i].x; y = slots[i].y; rd = -1; }
        else if (m.st === 'enter') { const p = T.at(0), q = Math.min(1, m.e); x = slots[i].x + (p.x - slots[i].x) * q; y = slots[i].y + (p.y - slots[i].y) * q; rd = 0; }
        else if (m.st === 'path') {
          const p = T.at(m.d);
          x = p.x; y = p.y - (m.hop > 0 ? Math.sin(Math.PI * m.hop / m.hop0) * (m.hop0 > .4 ? 30 : 13) : 0);
          rd = m.d; if (m.boost > 0) fl |= 1;
        } else if (m.st === 'drum') { x = dc.x + rin * Math.cos(m.th); y = dc.y + rin * Math.sin(m.th); rd = F.drum; fl |= 2; }
        else if (m.st === 'air') {
          const a = m.air, p = a.p;
          x = a.from.x + (a.to.x - a.from.x) * p; y = Math.max(28, a.from.y + (a.to.y - a.from.y) * p - 760 * p * (1 - p));
          rd = F.launch + (a.toD - F.launch) * p; fl |= 4;
        } else if (m.st === 'tube') { const p = tube.at(m.tp * tube.L); x = p.x; y = p.y; rd = F.trap + (F.r4 - F.trap) * m.tp; fl |= 8; }
        else { const p = m.drop.at(m.dd); x = p.x; y = p.y; rd = T.L + 1000 - m.fin * 5; fl |= 16; }
        out.set([x, y, rd, fl], i * 4);
      });
      // Bi đuổi kịp bi khác trên dốc thì nhảy qua (chen lấn)
      for (let i = 0; i < n; i++) {
        if (M[i].st !== 'path') continue;
        for (let j = 0; j < n; j++) {
          if (i === j || M[j].st !== 'path') continue;
          const dd = Math.abs(M[i].d - M[j].d);
          if (dd < 1.7 * r && M[i].v > M[j].v) out[i * 4 + 1] -= (1 - dd / (1.7 * r)) * r * 1.3;
        }
      }
      frames.push(out);
      if (fin.length === n || (fin.length && t > M[fin[0]].ft + 7)) break;
    }
    if (!fin.length) return null;
    const Tw = M[fin[0]].ft;
    const lead = (f) => { const o = frames[Math.min(frames.length - 1, f)]; let b = 0; for (let i = 1; i < n; i++) if (o[i * 4 + 2] > o[b * 4 + 2]) b = i; return b; };
    const late = lead(Math.floor(.86 * Tw / dt));
    let changes = 0, prev = -1;
    for (let f = Math.floor(.1 * Tw / dt); f < Tw / dt; f += 3) { const l = lead(f); if (l !== prev) { if (prev >= 0) changes++; prev = l; } }
    const kinds = new Set(events.filter((e) => e.t < Tw).map((e) => e.type)).size;
    const score = (late !== fin[0] ? 4 : 0) + Math.min(changes, 8) * .5 + kinds * .5 - (Tw < 12 || Tw > 34 ? 5 : 0);
    return { frames, dt, Tw, tEnd: t, fin, late, events, score };
  }

  /** Vẽ đường ván: ống hút, máng đích, phễu + cửa, 4 máng dốc, thành chắn, cối xay, bệ tăng tốc, nấm, máy trộn, lò xo, bẫy sập, vạch đích. */
  function mbDraw(r) {
    const tube = `M${MB.trap} ${mbY(3, MB.trap)}V${MB.floor}H${MB.tubeX}V482L742 458`;
    const ramps = [0, 1, 2, 3].map((i) => {
      const g = MB_PATH[i * 2], c = MB_RAMP[i], e = g[3] > g[1] ? 12 : -12;
      const x1 = g[1] - e, x2 = g[3] + (i === 3 ? -80 : e), y1 = mbY(i, x1), y2 = mbY(i, x2);
      return `<path d="M${x1} ${y1 - r - 5}L${x2} ${y2 - r - 5}L${x2} ${y2 + r + 4}L${x1} ${y1 + r + 4}z" fill="rgba(255,255,255,.3)"/>
        <path d="M${x1} ${y1 - r - 5}L${x2} ${y2 - r - 5}" stroke="${c}" stroke-width="3.5" opacity=".6" stroke-linecap="round"/>
        <path d="M${x1} ${y1 + r + 4}L${x2} ${y2 + r + 4}" stroke="${MB_INK}" stroke-width="12" stroke-linecap="round"/>
        <path d="M${x1} ${y1 + r + 4}L${x2} ${y2 + r + 4}" stroke="${c}" stroke-width="7" stroke-linecap="round"/>
        ${[x1 + e * 2, (x1 + x2) / 2, x2 - e * 2].map((x) => `<circle cx="${x}" cy="${mbY(i, x) + r + 4}" r="3" fill="#fff" stroke="${MB_INK}" stroke-width="1.5"/>`).join('')}`;
    }).join('');
    const walls = [1, 3, 5].map((i) => {
      const g = MB_PATH[i], sg = g[3] > g[1] ? 1 : -1;
      const d = `M${g[1] + sg * 8} ${g[2] - r - 10}Q${g[3] + sg * (r + 16)} ${g[4]} ${g[5] + sg * 16} ${g[6] + r + 6}`;
      return `<path d="${d}" stroke="${MB_INK}" stroke-width="11" fill="none" stroke-linecap="round"/><path d="${d}" stroke="#c4cad6" stroke-width="6" fill="none" stroke-linecap="round"/>`;
    }).join('');
    const spin = `<g transform="translate(${MB.spin} ${mbY(1, MB.spin) - r - 30})"><g class="np-mb-spin-in">${[0, 90, 180, 270].map((a) => `<rect x="-4" y="-30" width="8" height="26" rx="3" fill="#f2c94c" stroke="${MB_INK}" stroke-width="2" transform="rotate(${a})"/>`).join('')}<circle r="8" fill="#e5484d" stroke="${MB_INK}" stroke-width="2.5"/></g></g>`;
    const yb = mbY(1, MB.boost) + r + 4;
    const boost = `<g><rect x="${MB.boost - 26}" y="${yb - 7}" width="52" height="14" rx="4" fill="#ffd23f" stroke="${MB_INK}" stroke-width="2.5" transform="rotate(${Math.atan2(56, -630) * 57.3 + 180} ${MB.boost} ${yb})"/>
      ${[-14, 0, 14].map((dx) => `<path class="np-mb-chev" d="M${MB.boost + dx + 4} ${yb - 4}l-6 4 6 4" stroke="${MB_INK}" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round" style="animation-delay:${(dx + 14) / 50}s"/>`).join('')}</g>`;
    const bumps = MB.mush.map((x, k) => `<g transform="translate(${x} ${mbY(2, x) - r - 26})"><g class="np-mb-bump"><path d="M-16 0q0-18 16-18t16 18z" fill="${k ? '#8b4fd6' : '#e0559a'}" stroke="${MB_INK}" stroke-width="2.5"/><circle cx="-6" cy="-9" r="3" fill="#fff"/><circle cx="6" cy="-6" r="2.4" fill="#fff"/><rect x="-6" y="0" width="12" height="10" rx="3" fill="#fbe6c8" stroke="${MB_INK}" stroke-width="2"/></g></g>`).join('');
    const dc = mbDrumC(r), R = MB.drumR;
    const drum = `<g transform="translate(${dc.x} ${dc.y})"><circle r="${R}" fill="rgba(200,236,255,.45)" stroke="${MB_INK}" stroke-width="4"/>
      <g class="np-mb-drum-in"><circle r="${R - 1}" fill="none"/>${Array.from({ length: 6 }, (_, k) => `<rect x="-3" y="${-R + 2}" width="6" height="10" rx="2" fill="${MB_RAMP[k % 4]}" stroke="${MB_INK}" stroke-width="1.5" transform="rotate(${k * 60})"/>`).join('')}
      <path d="M${-R + 10} 0A${R - 10} ${R - 10} 0 0 1 0 ${-R + 10}" stroke="#fff" stroke-width="3" fill="none" opacity=".7"/></g>
      <circle r="6" fill="#5b6478" stroke="${MB_INK}" stroke-width="2"/></g>`;
    const spring = `<g transform="translate(806 416)"><g class="np-mb-spring"><rect x="16" y="-22" width="10" height="44" rx="3" fill="#5b6478" stroke="${MB_INK}" stroke-width="2.5"/>
      <path d="M16 -14l-6 4 6 4-6 4 6 4-6 4 6 4" stroke="#9aa3b8" stroke-width="3.5" fill="none" stroke-linejoin="round"/><rect x="-4" y="-18" width="10" height="36" rx="4" fill="#e5484d" stroke="${MB_INK}" stroke-width="2.5"/></g></g>`;
    const yt = mbY(3, MB.trap) + r + 4;
    const trap = `<g><rect x="${MB.trap - 18}" y="${yt - 6}" width="36" height="12" fill="#1c1c22"/>
      <g class="np-mb-trap"><rect class="np-mb-flap l" x="${MB.trap - 18}" y="${yt - 5}" width="18" height="10" fill="#f19a1a" stroke="${MB_INK}" stroke-width="2"/><rect class="np-mb-flap r" x="${MB.trap}" y="${yt - 5}" width="18" height="10" fill="#f19a1a" stroke="${MB_INK}" stroke-width="2"/></g>
      <g transform="translate(${MB.trap} ${mbY(3, MB.trap) - r - 40})"><path d="M0 -14l14 24h-28z" fill="#ffd23f" stroke="${MB_INK}" stroke-width="2.5" stroke-linejoin="round"/><rect x="-1.6" y="-6" width="3.2" height="9" fill="${MB_INK}"/><circle cy="6" r="1.8" fill="${MB_INK}"/></g></g>`;
    const yF = mbY(3, 176), hF = 2 * r + 14;
    const fin = Array.from({ length: 8 }, (_, k) => `<rect x="${(k % 2) * 7 + 172}" y="${yF - r - 8 + Math.floor(k / 2) * (hF / 4)}" width="7" height="${hF / 4}" fill="${(k + Math.floor(k / 2)) % 2 ? '#fff' : '#2b2b33'}"/>`).join('');
    const bin = `<path d="M${MB.binL - 6} ${MB.floor - 2 * r - 18}V${MB.floor + r + 6}H${MB.binR + 6}V${MB.floor - r - 8}" fill="rgba(255,255,255,.35)" stroke="${MB_INK}" stroke-width="4" stroke-linejoin="round"/>`;
    return `<svg class="np-track" viewBox="0 0 ${W} ${H}" aria-hidden="true">
      <path d="${tube}" stroke="${MB_INK}" stroke-width="${2 * r + 14}" fill="none" stroke-linejoin="round" opacity=".55"/><path d="${tube}" stroke="#d9f1ff" stroke-width="${2 * r + 8}" fill="none" stroke-linejoin="round" opacity=".92"/>
      <path d="${tube}" stroke="#fff" stroke-width="3" fill="none" stroke-linejoin="round" opacity=".8" transform="translate(-${r - 2} 0)"/>
      ${bin}
      <path d="M40 12H300L164 98H100z" class="np-mb-hopper" fill="rgba(255,255,255,.4)" stroke="${MB_INK}" stroke-width="4" stroke-linejoin="round"/>
      <rect class="np-mb-gate" x="98" y="96" width="68" height="8" rx="3" fill="#e5484d" stroke="${MB_INK}" stroke-width="2"/>
      ${ramps}${walls}${spin}${boost}${bumps}${drum}${spring}${trap}${fin}<rect x="172" y="${yF - r - 8}" width="14" height="${hF}" fill="none" stroke="${MB_INK}" stroke-width="2"/>
    </svg>`;
  }
  /** Chỗ các viên bi nằm trong phễu (xếp từ đáy lên, so le như bi thật). */
  function mbHopper(n, r) {
    const out = [];
    for (let j = 0; out.length < n && j < 12; j++) {
      const y = 98 - r - 2 - j * (2 * r + 1) * .9, f = Math.max(0, (98 - y) / 86);
      const left = 100 - 60 * f + r, right = 164 + 136 * f - r;
      const cols = Math.max(1, Math.floor((right - left) / (2 * r + 1)) + 1);
      const gap = cols > 1 ? (right - left) / (cols - 1) : 0;
      for (let c = 0; c < cols && out.length < n; c++) out.push({ x: cols > 1 ? left + c * gap : (left + right) / 2, y });
    }
    return N.shuffle(out, rng);
  }
  function mbBall(it, p, r) {
    const c = A.FUN[it.idx % A.FUN.length], c2 = A.FUN[(it.idx + 3) % A.FUN.length];
    const el = document.createElement('div');
    el.className = 'np-mb';
    el.dataset.name = it.name;
    el.style.setProperty('--r', r + 'px');
    el.innerHTML = `<div class="np-mb-ball" style="width:${2 * r}px;height:${2 * r}px"><svg viewBox="-20 -20 40 40" aria-hidden="true">
      <g class="np-mb-roll"><circle r="18" fill="${c}"/><path d="M-17 -5q17 -10 34 4" stroke="${c2}" stroke-width="6" fill="none"/><path d="M-12 12q12 -6 24 2" stroke="#fff" stroke-width="3" fill="none" opacity=".7"/></g>
      <path d="M13 -12a18 18 0 0 1-25 25a17 17 0 0 0 25-25z" fill="rgba(0,0,0,.22)"/><ellipse cx="-7" cy="-8" rx="6" ry="3.6" fill="#fff" opacity=".8" transform="rotate(-35 -7 -8)"/>
      <circle r="18" fill="none" stroke="${MB_INK}" stroke-width="2.4"/></svg></div><span class="np-mb-tag">${esc(it.label)}</span>`;
    layer.appendChild(el);
    const b = { el, roll: el.querySelector('.np-mb-roll'), data: it, color: c, x: p.x, y: p.y, h: 2 * r + 10, deg: 0, rd: -1 };
    el.style.transform = `translate(${p.x}px, ${p.y}px)`;
    return b;
  }
  /** Bảng xếp hạng trực tiếp (5 bạn dẫn đầu) ở góc phải. */
  function mbBoard() {
    const el = document.createElement('div');
    el.className = 'np-mb-board';
    el.innerHTML = '<h4>Bảng xếp hạng</h4><ol></ol>';
    fx.appendChild(el);
    return (order) => { el.querySelector('ol').innerHTML = order.slice(0, 5).map((b, k) => `<li><b>${k + 1}</b><i style="background:${b.color}"></i><span>${esc(b.data.full)}</span></li>`).join(''); };
  }
  /** Dải tin nhanh phía trên đường đua ("MÁY TRỘN!", "BẪY SẬP!"...). */
  function mbNews() {
    const el = document.createElement('div');
    el.className = 'np-mb-news';
    fx.appendChild(el);
    let t = 0;
    return (icon, text) => {
      el.innerHTML = `<i class="fa-solid ${icon}" aria-hidden="true"></i> ${esc(text)}`;
      el.classList.remove('is-on'); void el.offsetWidth; el.classList.add('is-on');
      clearTimeout(t); t = later(1700, () => el.classList.remove('is-on'));
    };
  }
  PLAY.marble = async (items, plan, D) => {
    const n = items.length, r = mbR(n), T = mbTrack();
    layer.insertAdjacentHTML('afterbegin', mbDraw(r));
    const slots = mbHopper(n, r);
    // 1) Mô phỏng vài trận, giữ trận kịch tính nhất (Lật kèo: bắt buộc có người dẫn đầu gần đích bị vượt)
    let sim = null;
    for (let k = 0; k < 12; k++) {
      const s = mbSim(slots, r, T);
      if (s && (!sim || s.score > sim.score)) sim = s;
      if (sim && sim.score >= 8 && sim.late !== sim.fin[0]) break;
    }
    // 2) Gán tên vào đường bi: người được gọi ↔ bi về nhất; Lật kèo ↔ bi dẫn đầu ở 86% trận (hoặc về nhì)
    const trajOf = new Array(n), free = new Set(items.map((_, i) => i));
    const give = (ii, tj) => { trajOf[ii] = tj; free.delete(tj); };
    const wi = items.findIndex((it) => it.name === plan.winner), ti = plan.twist ? items.findIndex((it) => it.name === plan.twist) : -1;
    give(wi, sim.fin[0]);
    const twistTraj = sim.late !== sim.fin[0] ? sim.late : sim.fin[1];
    if (ti >= 0 && ti !== wi && twistTraj != null) give(ti, twistTraj);
    const rest = N.shuffle([...free], rng);
    items.forEach((_, ii) => { if (trajOf[ii] == null) trajOf[ii] = rest.pop(); });
    // Bi đặt lộn xộn trong phễu, trộn 3 lần rồi mới về đúng chỗ của đường bi mình
    const start = N.shuffle(slots.slice(), rng);
    const balls = items.map((it, ii) => mbBall(it, start[ii], r));
    const ballOf = []; balls.forEach((b, ii) => { ballOf[trajOf[ii]] = b; });
    const win = balls[wi], twist = ti >= 0 && ti !== wi ? balls[ti] : null;
    const board = mbBoard(), news = mbNews();
    board(balls);
    const move = (b, x, y) => {
      const dx = x - b.x;
      if (dx) b.deg += (Math.hypot(dx, y - b.y) / r) * 57.3 * Math.sign(dx); // lăn phải → quay thuận, lăn trái → quay ngược
      b.x = x; b.y = y;
      b.el.style.transform = `translate(${x}px, ${y}px)`;
      b.roll.setAttribute('transform', `rotate(${b.deg.toFixed(1)})`);
    };

    // 3) Trộn bi trong phễu
    const hopper = layer.querySelector('.np-mb-hopper');
    shout('Trộn bi!');
    sfx('flip');
    hopper.classList.add('is-shake');
    for (let k = 0; k < 4; k++) {
      const perm = k < 3 ? N.shuffle(slots.slice(), rng) : null;
      balls.forEach((b, ii) => {
        const p = perm ? perm[ii] : slots[trajOf[ii]];
        b.el.style.transition = 'transform .32s cubic-bezier(.3,1.4,.5,1)';
        b.x = p.x; b.y = p.y; b.el.style.transform = `translate(${p.x}px, ${p.y}px)`;
      });
      sfx('click');
      await sleep(360);
    }
    hopper.classList.remove('is-shake');
    balls.forEach((b) => { b.el.style.transition = 'none'; });
    shout('Thả bi!');
    sfx('flip');
    await sleep(350);
    layer.querySelector('.np-mb-gate').classList.add('is-open');

    // 4) Phát lại trận đã mô phỏng: 72% thời gian đầu chạy nhanh, 28% cuối chạy CHẬM + zoom theo bi dẫn đầu
    const fr = sim.frames, nF = fr.length, Tw = sim.Tw;
    const R = Math.max(3500, D - 3000), OUT = 1500;
    const simAt = (u) => (u <= .72 ? (u / .72) * .86 * Tw : (.86 + ((u - .72) / .28) * .14) * Tw);
    const trapEl = layer.querySelector('.np-mb-trap'), springEl = layer.querySelector('.np-mb-spring');
    const told = {}, ev = sim.events.slice().sort((a, b) => a.t - b.t);
    let ei = 0, lead = null, lastSay = 0, lastBoard = 0, slow = false, done = false, saidA = false, saidB = false;
    const cam = { z: 1, x: W / 2, y: H / 2 };
    const talk = (b, text, tone, force) => { const now = performance.now(); if (!force && now - lastSay < 700) return; lastSay = now; say(b, text, 950, tone); };
    const pop = (el) => { el.classList.remove('is-hit'); void el.getBoundingClientRect(); el.classList.add('is-hit'); later(260, () => el.classList.remove('is-hit')); };
    const onEvent = (e) => {
      const b = ballOf[e.i];
      if (done) { if (e.type === 'back' || e.type === 'fwd') pop(springEl); return; } // đã có người về nhất: không tin/lời thoại đè lên kết quả
      if (e.type === 'spin') { if (rng() < .5) talk(b, 'Bị hất văng!', 'hot'); }
      else if (e.type === 'boost') { if (rng() < .3) talk(b, 'Tăng tốc!'); }
      else if (e.type === 'drum') { if (!told.drum) { told.drum = 1; news('fa-rotate', 'MÁY TRỘN — đảo thứ tự!'); sfx('flip'); } else if (rng() < .25) talk(b, 'Chóng mặt quá!'); }
      else if (e.type === 'back' || e.type === 'fwd') {
        pop(springEl); sfx('flip');
        if (!told.spring) { told.spring = 1; news('fa-arrow-up', 'LÒ XO TUNG BI LÊN TRỜI!'); }
        talk(b, e.type === 'back' ? 'Bay ngược rồi!' : 'Bay tắt luôn!', e.type === 'back' ? 'hot' : '');
      } else if (e.type === 'trap') {
        sfx('wrong');
        if (!told.trap) { told.trap = 1; news('fa-burst', 'BẪY SẬP! Rơi xuống ống hút về lại đầu dốc'); }
        talk(b, 'Áaa! Rơi bẫy!', 'hot', true);
      }
    };
    const frameAt = (st, k) => {
      const f = Math.max(0, Math.min(nF - 1, st / sim.dt)), f0 = Math.floor(f), f1 = Math.min(nF - 1, f0 + 1), a = f - f0, j = k * 4;
      const A0 = fr[f0], A1 = fr[f1];
      return [A0[j] + (A1[j] - A0[j]) * a, A0[j + 1] + (A1[j + 1] - A0[j + 1]) * a, A1[j + 2], A1[j + 3]];
    };
    const draw = (st) => {
      balls.forEach((b, ii) => {
        const [x, y, rd, fl] = frameAt(st, trajOf[ii]);
        b.rd = rd;
        move(b, x, y);
        b.el.classList.toggle('is-boost', !!(fl & 1));
        b.el.classList.toggle('is-air', !!(fl & 4));
        b.el.classList.toggle('is-tube', !!(fl & 8));
        b.el.style.zIndex = String(fl & 4 ? 400 : fl & 16 ? 250 : 10 + Math.max(0, Math.round(rd / T.L * 200)));
      });
      trapEl.classList.toggle('is-open', mbTrapOpen(st));
      while (ei < ev.length && ev[ei].t <= st) onEvent(ev[ei++]);
      return balls.slice().sort((a, b) => b.rd - a.rd);
    };
    const setCam = (z, x, y) => { cam.z = z; cam.x = x; cam.y = y; camera(z, x, y); };

    const t0 = performance.now();
    await new Promise((fin) => {
      const step = (now) => {
        const u = Math.max(0, Math.min(1, (now - t0) / R)), st = simAt(u); // mốc khung hình có thể sớm hơn t0 một chút
        const order = draw(st), top = order[0];
        order.forEach((b, k) => b.el.classList.toggle('is-top', k < 3 && b.rd >= 0));
        if (top.rd > 0 && top !== lead) {
          lead = top;
          balls.forEach((b) => b.el.classList.toggle('is-lead', b === top));
          sfx('click');
          if (u > .12 && u < .7) talk(top, `${top.data.label} vượt lên!`);
        }
        if (now - lastBoard > 180) { lastBoard = now; board(order); }
        // Lật kèo: bi dẫn đầu gần đích tưởng chắc thắng rồi bị vượt
        if (twist && !saidA && u > .6 && top === twist) { saidA = true; talk(twist, 'Về nhất chắc rồi!', '', true); }
        if (twist && saidA && !saidB && win.rd > twist.rd) { saidB = true; talk(twist, 'Ơ... bị vượt rồi!', 'hot', true); sfx('wrong'); }
        // Chạy chậm + zoom theo 2 bi dẫn đầu
        if (u > .72) {
          if (!slow) { slow = true; news('fa-stopwatch', 'CHẬM LẠI — về đích sát nút!'); world.classList.add('is-slowmo'); }
          const a = order[0], b = order[1] || a;
          const tx = (a.x + b.x) / 2, ty = (a.y + b.y) / 2 - 20;
          setCam(cam.z + (1.55 - cam.z) * .06, cam.x + (tx - cam.x) * .1, cam.y + (ty - cam.y) * .1);
        }
        if (!done && st >= Tw) {
          done = true;
          win.el.classList.add('is-win');
          const flash = document.createElement('div'); flash.className = 'np-mb-flash'; fx.appendChild(flash); later(700, () => flash.remove());
          burst(win.x, win.y - 20, ['🎉', '⭐', '✨'], 12);
          sfx('combo');
          news('fa-flag-checkered', `${win.data.full} VỀ NHẤT!`);
        }
        if (u < 1) frames.push(requestAnimationFrame(step)); else fin();
      };
      frames.push(requestAnimationFrame(step));
    });
    // 5) Về đích: kéo máy quay ra, các bi khác lăn nốt vào máng đích theo thứ tự
    world.classList.remove('is-slowmo');
    balls.forEach((b) => b.el.classList.remove('is-lead', 'is-top'));
    const t1 = performance.now(), z0 = cam.z, x0 = cam.x, y0 = cam.y, end = Math.min(sim.tEnd, Tw + 3.6);
    await new Promise((fin) => {
      const step = (now) => {
        const f = Math.max(0, Math.min(1, (now - t1) / OUT)), e = N.easeOut(Math.min(1, f * 1.6));
        board(draw(Tw + (end - Tw) * f));
        setCam(z0 + (1 - z0) * e, x0 + (W / 2 - x0) * e, y0 + (H / 2 - y0) * e);
        if (f < 1) frames.push(requestAnimationFrame(step)); else fin();
      };
      frames.push(requestAnimationFrame(step));
    });
    setCam(1, W / 2, H / 2);
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
    } else if (game === 'marble') {
      const r = mbR(items.length);
      layer.insertAdjacentHTML('afterbegin', mbDraw(r));
      mbHopper(items.length, r).forEach((p, k) => mbBall(items[k], p, r));
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
  /** 3 · 2 · 1 · Đi! trên cảnh chờ (nhân vật đang đứng sẵn) trước khi trò bắt đầu. */
  async function countdown() {
    fx.querySelectorAll('.np-banner, .np-hint-pill, .np-say').forEach((e) => e.remove());
    for (const t of ['3', '2', '1', 'Đi!']) {
      const c = document.createElement('div');
      c.className = 'np-cd' + (t.length > 1 ? ' is-go' : '');
      c.textContent = t;
      fx.appendChild(c);
      sfx(t.length > 1 ? 'go' : 'count');
      await sleep(t.length > 1 ? 480 : 560);
      c.remove();
    }
  }
  async function play(game, plan, numeric, allNames) {
    const g = byId(game);
    await countdown();
    reset(g.scene);
    const items = cast(game, plan.list, plan, numeric, allNames);
    plan.t0 = performance.now();
    clock(plan.ms);
    try {
      await PLAY[game](items, plan, plan.ms);
      world.classList.remove('is-tense');
      music(0); // im lặng để nghe trống dồn lúc soi đèn
      await spotlight(plan.winner);
    } finally { stopAll(); music(0); world.classList.remove('is-tense'); }
    // Đồng hồ dừng ở 00
    const c = fx.querySelector('.np-clock b'); if (c) c.textContent = '00';
  }
  /** Khung tên kết quả trên sân khấu (trang thêm nút hành động vào trong). */
  /** Trước khi công bố: sân khấu tối dần, vòng sáng thu lại quanh người được gọi + trống dồn. */
  async function spotlight(name) {
    const el = [...layer.querySelectorAll('[data-name]')].find((e) => e.dataset.name === name);
    const tgt = el && (el.querySelector('.np-sp-in, .np-mb-ball') || el);
    if (!tgt) return;
    const wr = world.getBoundingClientRect(), er = tgt.getBoundingClientRect(), k = wr.width / W;
    if (!er.width || !er.height || !k) return; // bị UFO bắt mất... → bỏ qua soi đèn
    const x = (er.left + er.width / 2 - wr.left) / k, y = (er.top + er.height / 2 - wr.top) / k;
    const sp = document.createElement('div');
    sp.className = 'np-spot';
    sp.style.setProperty('--x', x + 'px'); sp.style.setProperty('--y', y + 'px');
    fx.appendChild(sp);
    void sp.offsetWidth;
    sp.style.setProperty('--r', Math.max(56, (er.height / k) * .7 + 24) + 'px');
    sp.classList.add('is-on');
    el.classList.add('is-spot');
    sfx('drumroll');
    await sleep(1250);
  }
  function result(name, sub, twisted) {
    fx.querySelectorAll('.np-banner, .np-say, .np-hint-pill, .np-spot').forEach((e) => e.remove());
    const b = document.createElement('div');
    b.className = 'np-banner is-final';
    const cheer = pickOne(twisted ? CHEER_TWIST : CHEER);
    b.innerHTML = `<div class="np-banner-box">${twisted ? '<span class="np-twist-tag">Lật kèo!</span>' : ''}<p class="np-banner-lbl">Mời bạn</p>
      <p class="np-banner-nm" id="npRevealName">${esc(name)}</p><p class="np-banner-cheer">${esc(cheer)}</p>${sub ? `<p class="np-banner-sub">${esc(sub)}</p>` : ''}<div class="np-banner-acts"></div></div>`;
    fx.appendChild(b);
    b.classList.add('is-party');
    if (P) { P.rays(b); P.letters(b.querySelector('.np-banner-nm'), { step: 70, delay: 150 }); }
    return b.querySelector('.np-banner-acts');
  }
  function clearResult() { if (fx) fx.querySelectorAll('.np-banner').forEach((e) => e.remove()); }

  global.EduNamePickerGames = { GAMES, CAP, THEME, mount, idle, play, result, clearResult, labels, stop: stopAll };
})(window);
