/* ============================================================
   js/arena/arena-scene.js — dải sân khấu có tranh trong trận Đấu trường (Chơi một mình).
   Dùng chung tranh SVG của trang Gọi tên (js/name-picker/np-art.js): mỗi người chơi là 1 bạn nhỏ
   đồng phục; nhân vật di chuyển bằng CSS transition (chạy nghiêng khi đi), phản ứng theo kết quả.
     mount(el, G)     dựng cảnh theo chế độ (Tốc độ: sân bóng · Đua: đường chạy · Kéo co: đồi · Câu cá: ao ·
                      Săn vàng: nông trại · Sinh tồn: đảo hoang · Đấu phép: sân lâu đài · Giải mã: phố ·
                      Đào hoá thạch: chân núi lửa có khủng long canh · Lên Mặt Trăng: tên lửa bay lên, có trạm dừng ·
                      Diệt Virus: phòng máy chủ, cả đội đứng bên trái đánh Trùm Virus bên phải)
     sync(G)          so trạng thái trước/sau → chạy tới chỗ mới, nhảy (+điểm), rung (mất máu), nằm mờ (bị loại)
     mood(id, ok)     em trả lời đúng (nhảy) / sai (hoảng)
   Không mạng, không lưu gì. Máy đặt "giảm chuyển động": vẫn vẽ cảnh, bỏ chuyển động.
   ============================================================ */
(function (global) {
  'use strict';

  const A = global.EduNamePickerArt;
  const C = global.EduArenaCore;
  const W = 1000, H = 300;   // khung thế giới của dải sân khấu
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const reduced = () => { try { return global.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };

  /** Cảnh nền + đoạn cắt (oy: lấy dải 300px từ cảnh 1000×600) + mặt đất (gy) cho mỗi chế độ. */
  const SET = {
    speed: { scene: 'field', oy: 250, gy: 262 },
    race: { scene: 'track', oy: 130, gy: 0 },
    tug: { scene: 'sky', oy: 300, gy: 262 },
    fish: { scene: 'pond', oy: 300, gy: 266 },
    gold: { scene: 'farm', oy: 300, gy: 264 },
    survival: { scene: 'island', oy: 250, gy: 264 },
    spell: { scene: 'castle', oy: 240, gy: 264 },
    heist: { scene: 'street', oy: 228, gy: 236 },
    dino: { scene: 'jungle', oy: 150, gy: 262 },
    moon: { scene: 'space', oy: 0, gy: 272 },
    boss: { scene: 'server', oy: 220, gy: 264 },
  };
  const KEY = { speed: 'score', gold: 'gold', race: 'pos', survival: 'score', fish: 'kg', tug: 'pull', spell: 'dmg', heist: 'gems', dino: 'fossils', moon: 'km', boss: 'dmg' };
  const UNIT = { speed: '', gold: ' 🪙', race: '', survival: '', fish: ' kg', tug: '', spell: '', heist: ' 💎', dino: ' 🦴', moon: '', boss: '' };

  let S = null; // { el, world, layer, fx, mode, sp: {id: sprite}, prev: {id: {...}}, timers }

  // ── Khung ──
  function mount(el, G) {
    clear();
    const set = SET[G.mode] || SET.speed;
    el.hidden = false;
    const art = A.scene(set.scene);
    // .ar-sc-amb: cùng cảnh, làm mờ + tối, phủ kín cả dải — chỉ lộ ra 2 bên khi dải rộng hơn 10:3 (máy tính)
    const amb = art.replace('viewBox="0 0 1000 600" preserveAspectRatio="xMidYMid slice"', `viewBox="0 ${set.oy} 1000 300" preserveAspectRatio="xMidYMax slice"`)
      .replace(/\bid="([^"]+)"/g, 'id="amb-$1"').replace(/url\(#([^)]+)\)/g, 'url(#amb-$1)');
    el.innerHTML = `<div class="ar-sc-amb" aria-hidden="true">${amb}</div><div class="ar-sc-world"><div class="ar-sc-bg" style="transform:translateY(${-set.oy}px)">${art}</div><div class="ar-sc-layer"></div><div class="ar-sc-fx"></div></div>`;
    S = { el, world: el.querySelector('.ar-sc-world'), layer: el.querySelector('.ar-sc-layer'), fx: el.querySelector('.ar-sc-fx'), mode: G.mode, set, sp: {}, prev: {}, timers: [] };
    // Dải hẹp (điện thoại): khớp chiều ngang, dư chiều cao thì lộ thêm trời phía trên.
    // Dải rộng (máy tính): khớp chiều cao để thấy trọn tranh, khung 1000 đặt giữa, mép tranh mờ dần vào nền mờ 2 bên
    // (không soi gương/lặp tranh — lặp sẽ thấy 2 núi lửa, 2 lâu đài...).
    const fit = () => {
      if (!S) return;
      const cw = S.el.clientWidth, ch = S.el.clientHeight;
      const sc = Math.min(cw / W, ch / H);
      S.world.style.transform = `translate(${(cw - W * sc) / 2}px, 0) scale(${sc})`;
      S.top = Math.max(0, H - ch / sc); // y nhỏ nhất còn nhìn thấy
      S.el.classList.toggle('is-wide', cw / ch > W / H + .02);
      if (S.ready && S.G) layout(S.G, true);
    };
    S.ro = new ResizeObserver(fit);
    S.ro.observe(el);
    fit();
    const list = G.players.filter((p) => !p.ghost);
    if (G.mode === 'moon') moonProps();
    list.forEach((p, k) => {
      const look = p.me ? lookOf(p.name) : 3 + k * 5;
      // Lên Mặt Trăng: mỗi người là 1 tên lửa (màu riêng, em màu đỏ)
      const art = G.mode === 'moon' ? A.rocket(p.me ? '#e5484d' : A.FUN[(k * 3 + 1) % A.FUN.length]) : A.kid(look);
      S.sp[p.id] = sprite(p, art, k, list.length, G.mode === 'race' ? 34 : G.mode === 'moon' ? 40 : 0);
      if (G.mode === 'race') S.sp[p.id].el.classList.add('is-lane');
      if (G.mode === 'moon') { S.sp[p.id].el.classList.add('is-rocket'); S.sp[p.id].h = 74; }
    });
    if (G.mode === 'tug') ropeProps();
    if (G.mode === 'race') raceProps();
    if (G.mode === 'fish') fishProps();
    if (G.mode === 'dino') dinoProps();
    if (G.mode === 'boss') bossProps(G);
    S.G = G; S.ready = true;
    fit();
    snapshot(G);
  }
  function clear() {
    if (!S) return;
    S.timers.forEach(clearInterval);
    if (S.ro) S.ro.disconnect();
    S = null;
  }
  const lookOf = (name) => { let h = 7; for (const ch of String(name || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h % 8; };

  function sprite(p, art, k, n, size) {
    const el = document.createElement('div');
    el.className = 'ar-sc-sp' + (p.me ? ' is-me' : '');
    const w = size || (n > 5 ? 54 : 62);
    el.innerHTML = `<div class="ar-sc-in" style="width:${w}px">${art}</div>
      <span class="ar-sc-tag">${p.me ? '⭐ Em' : `${p.face} ${esc(p.name)}`}</span><span class="ar-sc-over"></span>`;
    S.layer.appendChild(el);
    return { el, x: 0, y: 0, w, h: w * 1.62, id: p.id };
  }
  function place(s, x, y, ms) {
    if (Math.abs(x - s.x) > 2 && ms) s.el.classList.toggle('is-left', x < s.x);
    const moving = ms && (Math.abs(x - s.x) > 4 || Math.abs(y - s.y) > 4);
    s.x = x; s.y = y;
    s.el.style.transition = ms && !reduced() ? `transform ${ms}ms cubic-bezier(.45,.05,.35,1)` : 'none';
    s.el.style.transform = `translate(${x}px, ${y}px)`;
    s.el.style.zIndex = String(Math.round(y));
    if (moving && !reduced()) {
      s.el.classList.add('is-run');
      clearTimeout(s.runT);
      s.runT = setTimeout(() => s.el.classList.remove('is-run'), ms);
    }
  }
  function flash(s, cls, ms) {
    s.el.classList.remove(cls); void s.el.offsetWidth; s.el.classList.add(cls);
    clearTimeout(s['t' + cls]);
    s['t' + cls] = setTimeout(() => s.el.classList.remove(cls), ms || 900);
  }
  /** Chữ/số bay lên trên đầu nhân vật. */
  function float(s, text, tone) {
    if (!S || reduced()) return;
    const b = document.createElement('span');
    b.className = 'ar-sc-float is-' + (tone || 'up');
    b.textContent = text;
    b.style.left = s.x + 'px'; b.style.top = (s.y - s.h - 6) + 'px';
    S.fx.appendChild(b);
    setTimeout(() => b.remove(), 1200);
  }
  function burst(x, y, items, n) {
    if (!S || reduced()) return;
    for (let k = 0; k < n; k++) {
      const b = document.createElement('span');
      b.className = 'ar-sc-bit';
      b.textContent = items[k % items.length];
      const a = (Math.PI * 2 * k) / n, d = 40 + Math.random() * 40;
      b.style.left = x + 'px'; b.style.top = y + 'px';
      b.style.setProperty('--dx', Math.cos(a) * d + 'px'); b.style.setProperty('--dy', Math.sin(a) * d - 20 + 'px');
      S.fx.appendChild(b);
      setTimeout(() => b.remove(), 900);
    }
  }

  /** Bong bóng lời thoại kiểu trang Gọi tên (gắn trên đầu 1 nhân vật/đạo cụ). */
  function say(s, text, ms, hot) {
    if (!S || !s) return;
    const old = S.fx.querySelector(`.ar-sc-say[data-for="${s.id}"]`);
    if (old) old.remove();
    const b = document.createElement('span');
    b.className = 'ar-sc-say' + (hot ? ' is-hot' : '');
    b.dataset.for = s.id;
    b.textContent = text;
    b.style.left = Math.max(110, Math.min(890, s.x)) + 'px';
    b.style.top = Math.max((S.top || 0) + 44, s.y - s.h - 8) + 'px';
    S.fx.appendChild(b);
    setTimeout(() => b.remove(), ms || 1500);
  }
  function flashEl(el, cls, ms) {
    el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
    setTimeout(() => el.classList.remove(cls), ms || 900);
  }

  // ── Đạo cụ riêng từng chế độ ──
  /** Bãi đào: khủng long đứng canh bên phải, đôi lúc "hít hít" đánh hơi người ăn gian. */
  function dinoProps() {
    const el = document.createElement('div');
    el.className = 'ar-sc-dino';
    el.innerHTML = A.dino();
    S.layer.appendChild(el);
    S.dino = { el, id: 'dino', x: 900, y: S.set.gy + 4, h: 116 };
    el.style.transform = `translate(${S.dino.x}px, ${S.dino.y}px)`;
    if (reduced()) return;
    S.timers.push(setInterval(() => {
      if (!S || Math.random() > .4) return;
      flashEl(S.dino.el, 'is-sniff', 1400);
      say(S.dino, ['Hít hít...', 'Ai ăn gian đấy?', 'Đào cẩn thận nhé!'][Math.floor(Math.random() * 3)], 1400);
    }, 5200));
  }
  /** Phòng máy chủ: Trùm Virus đứng bên phải, thanh máu + tên giai đoạn trên đầu, thỉnh thoảng gầm gừ. */
  function bossProps(G) {
    const el = document.createElement('div');
    el.className = 'ar-sc-boss';
    el.innerHTML = `<div class="ar-sc-boss-bar"><b>Trùm Virus</b><i><s></s></i></div><div class="ar-sc-boss-in">${A.virus()}</div>`;
    S.layer.appendChild(el);
    S.boss = { el, id: 'boss', x: 835, y: S.set.gy + 6, h: 200, hp: G.boss.hp };
    el.style.transform = `translate(${S.boss.x}px, ${S.boss.y}px)`;
    paintBoss(G);
    if (reduced()) return;
    S.timers.push(setInterval(() => {
      if (!S || !S.boss || Math.random() > .35 || S.boss.el.classList.contains('is-ko')) return;
      say(S.boss, ['Gừ gừ... ta sẽ xoá sạch dữ liệu!', 'Các ngươi không qua nổi ta đâu!', 'Mật khẩu yếu quá, hí hí!', 'Bấm vào link lạ đi nào...'][Math.floor(Math.random() * 4)], 1600, true);
    }, 6500));
  }
  function paintBoss(G) {
    const b = S.boss, B = G.boss;
    if (!b || !B) return;
    const ph = C.bossPhase(B.hp, B.max);
    b.el.querySelector('.ar-sc-boss-bar s').style.width = Math.max(0, (B.hp / B.max) * 100) + '%';
    b.el.querySelector('.ar-sc-boss-bar b').textContent = B.hp <= 0 ? 'Đã bị diệt!' : ph ? `Trùm Virus · ${C.BOSS_PHASES[ph].name}` : 'Trùm Virus';
    b.el.classList.toggle('is-p1', ph === 1);
    b.el.classList.toggle('is-p2', ph === 2);
    b.el.classList.toggle('is-ko', B.hp <= 0);
  }
  /** Tia đánh bay từ người chơi sang Virus (đúng) hoặc cục nhầy từ Virus sang người chơi (sai). */
  function shot(from, to, cls, delay) {
    if (!S || reduced()) return;
    const el = document.createElement('span');
    el.className = 'ar-sc-shot ' + cls;
    S.fx.appendChild(el);
    const a = el.animate([
      { transform: `translate(${from.x}px, ${from.y - from.h * .55}px) scale(.6)`, opacity: 0 },
      { transform: `translate(${(from.x + to.x) / 2}px, ${Math.min(from.y, to.y) - Math.max(from.h, to.h) * .8}px) scale(1)`, opacity: 1, offset: .5 },
      { transform: `translate(${to.x}px, ${to.y - to.h * .5}px) scale(1.2)`, opacity: 1 },
    ], { duration: 520, delay: delay || 0, easing: 'cubic-bezier(.3,.6,.4,1)', fill: 'both' });
    a.onfinish = () => el.remove();
  }
  /** Vũ trụ: bệ phóng dưới đáy + các trạm dừng (mỗi 1/4 đường) + vạch Mặt Trăng. */
  function moonProps() {
    S.layer.insertAdjacentHTML('afterbegin', '<span class="ar-sc-pad" aria-hidden="true"></span>'
      + C.MOON_STAGES.map((km, k) => `<span class="ar-sc-stage" data-km="${km}"><b>Trạm ${k + 1}</b></span>`).join('')
      + '<span class="ar-sc-stage is-moon"><b>🌕 Mặt Trăng</b></span>');
  }
  /** Độ cao (nghìn km) → y trong khung; vạch Mặt Trăng luôn nằm trong phần nhìn thấy. */
  function moonY(km) {
    const y0 = S.set.gy, y1 = Math.max((S.top || 0) + 84, 128);
    return y0 - (Math.min(km, C.MOON_KM) / C.MOON_KM) * (y0 - y1);
  }
  function raceProps() {
    S.fx.insertAdjacentHTML('beforeend', '<span class="ar-sc-finish" aria-hidden="true"></span>');
  }
  function ropeProps() {
    S.layer.insertAdjacentHTML('afterbegin', `<div class="ar-sc-rope"><span class="ar-sc-rope-line"></span><span class="ar-sc-knot"></span></div>
      <span class="ar-sc-mid" aria-hidden="true"></span><span class="ar-sc-flag is-red">🔴</span><span class="ar-sc-flag is-blue">🔵</span>`);
  }
  /** Ao: vài con cá bơi lững thững; câu được thì 1 con bay lên tay người câu. */
  function fishProps() {
    S.fish = [0, 1, 2, 3, 4].map((k) => {
      const el = document.createElement('div');
      el.className = 'ar-sc-fish';
      el.innerHTML = A.fish(A.FUN[(k * 3) % A.FUN.length]);
      S.layer.appendChild(el);
      const f = { el, x: 120 + k * 180, y: 160 + (k % 3) * 22 };
      el.style.transform = `translate(${f.x}px, ${f.y}px)`;
      return f;
    });
    if (reduced()) return;
    S.timers.push(setInterval(() => S && S.fish.forEach((f) => {
      if (Math.random() > .5) return;
      const ny0 = Math.max(150, (S.top || 0) + 40);
      const nx = Math.max(60, Math.min(900, f.x + (Math.random() - .5) * 220)), ny = Math.max(ny0, Math.min(215, f.y + (Math.random() - .5) * 50));
      f.el.classList.toggle('is-left', nx < f.x);
      f.x = nx; f.y = ny;
      f.el.style.transform = `translate(${nx}px, ${ny}px)`;
    }), 1300));
  }

  // ── Vị trí từng chế độ ──
  function layout(G, first) {
    const set = S.set, ms = first ? 0 : 900;
    const list = G.players.filter((p) => !p.ghost);
    const n = list.length;
    if (G.mode === 'race') {
      // Làn chạy nằm trong phần nhìn thấy: làn trên cùng vẫn thấy đầu, làn dưới cùng vẫn thấy tên
      const y0 = (S.top || 0) + 92, y1 = 272;
      list.forEach((p, k) => place(S.sp[p.id], 70 + Math.min(1, p.pos / G.goal) * 790, y0 + k * ((y1 - y0) / Math.max(1, n - 1)), first ? 0 : 1100));
      return;
    }
    if (G.mode === 'moon') {
      S.layer.querySelectorAll('.ar-sc-stage').forEach((el) => { el.style.top = moonY(el.dataset.km ? +el.dataset.km : C.MOON_KM) + 'px'; });
      const gap = 760 / Math.max(1, n);
      list.forEach((p, k) => {
        const s = S.sp[p.id];
        place(s, 150 + gap * (k + .5), moonY(p.km || 0), first ? 0 : 1100);
        s.el.classList.toggle('is-landed', (p.km || 0) >= C.MOON_KM);
      });
      return;
    }
    if (G.mode === 'boss') {
      const gap = 600 / Math.max(1, n);
      list.forEach((p, k) => { const s = S.sp[p.id]; place(s, 80 + gap * (k + .5), set.gy - (k % 2) * 12, ms); s.el.classList.remove('is-left'); });
      return;
    }
    if (G.mode === 'tug') {
      const shift = -(G.rope || 0) * 3.2; // dây nghiêng về Đỏ (rope > 0) → cả 2 đội trượt sang trái
      const red = list.filter((p) => p.team === 'red'), blue = list.filter((p) => p.team === 'blue');
      // Mỗi đội QUAY MẶT vào dây (Đỏ nhìn sang phải, Xanh nhìn sang trái) và ngả người ra sau (CSS .is-pull).
      // place() tự lật mặt theo hướng chạy → đặt lại hướng sau khi place.
      const gap = Math.min(86, 300 / Math.max(1, red.length, blue.length));
      red.forEach((p, k) => { const s = S.sp[p.id]; place(s, 330 - k * gap + shift, set.gy, first ? 0 : 900); s.el.classList.remove('is-left'); s.el.classList.add('is-pull'); });
      blue.forEach((p, k) => { const s = S.sp[p.id]; place(s, 670 + k * gap + shift, set.gy, first ? 0 : 900); s.el.classList.add('is-left', 'is-pull'); });
      const rope = S.layer.querySelector('.ar-sc-rope');
      rope.style.transition = first || reduced() ? 'none' : 'transform .9s cubic-bezier(.45,.05,.35,1)';
      rope.style.transform = `translateX(${shift}px)`;
      return;
    }
    // Tốc độ / Sinh tồn / Đấu phép / Săn vàng / Câu cá / Giải mã: đứng 1 hàng; Tốc độ xếp theo hạng (đổi hạng → chạy đổi chỗ)
    const order = G.mode === 'speed' || G.mode === 'gold' || G.mode === 'heist' || G.mode === 'fish' || G.mode === 'dino'
      ? C.rank(list, KEY[G.mode]) : list;
    const gap = (G.mode === 'dino' ? 700 : 820) / Math.max(1, n); // Đào hoá thạch: chừa chỗ cho khủng long
    // Đứng so le 2 bậc cho có chiều sâu — trừ khi có tim/thanh máu trên đầu (để không bị khung cắt mất)
    const lift = G.mode === 'survival' || G.mode === 'spell' ? 0 : 14;
    order.forEach((p, k) => place(S.sp[p.id], 90 + gap * (k + .5), set.gy - (k % 2) * lift, ms));
  }

  // ── Đồng bộ sau mỗi lượt ──
  function snapshot(G) {
    G.players.forEach((p) => { S.prev[p.id] = { v: p[KEY[G.mode]] || 0, hp: p.hp, gold: p.gold || 0 }; });
    paintOver(G);
  }
  /** Dòng trên đầu: tim (Sinh tồn), thanh máu (Đấu phép), hạng (Tốc độ). */
  function paintOver(G) {
    G.players.forEach((p) => {
      const s = S.sp[p.id];
      if (!s) return;
      const o = s.el.querySelector('.ar-sc-over');
      if (G.mode === 'survival' || G.mode === 'boss') o.textContent = C.hearts(p.hp);
      else if (G.mode === 'spell') o.innerHTML = `<i class="ar-sc-hp"><b style="width:${Math.max(0, p.hp)}%"></b></i>`;
      else if (G.mode === 'dino') o.textContent = p.me && p.cheat > 0 ? '🤫' : ''; // chỉ em biết mình đang ăn gian
      else if (G.mode === 'moon') o.textContent = (p.km || 0) >= C.MOON_KM ? '🏁' : C.moonBoost(p.streak || 0) > 1 ? `🔥×${C.moonBoost(p.streak)}` : '';
      else o.textContent = '';
      s.el.classList.toggle('is-out', (G.mode === 'survival' || G.mode === 'spell' || G.mode === 'boss') && p.hp <= 0);
    });
  }
  function sync(G) {
    if (!S || S.mode !== G.mode) return;
    const key = KEY[G.mode];
    layout(G, false);
    const hits = []; // Diệt Virus: số sát thương hiện trên đầu Virus khi tia đánh tới nơi
    G.players.forEach((p, k) => {
      const s = S.sp[p.id], pr = S.prev[p.id];
      if (!s || !pr) return;
      const v = p[key] || 0, dv = v - pr.v;
      if (G.mode === 'boss') {
        if (dv > 0 && S.boss) { flash(s, 'is-happy'); shot(s, S.boss, p.lastCrit ? 'is-crit' : 'is-hit', k * 90); hits.push({ dv, crit: p.lastCrit, k }); }
        if (p.hp < pr.hp && S.boss) { shot(S.boss, s, 'is-goo', 380); setTimeout(() => { if (S) { flash(s, 'is-hit'); float(s, '💔', 'down'); } }, 900); }
        return;
      }
      if (G.mode === 'moon') {
        if (dv > 0) {
          float(s, `+${dv}`, 'up');
          if (v >= C.MOON_KM && pr.v < C.MOON_KM) { say(s, p.me ? 'Em tới Mặt Trăng rồi!' : 'Tới nơi rồi!', 1800); burst(s.x, s.y - s.h, ['⭐', '✨', '🌟'], 8); }
        } else if (dv < 0) { flash(s, 'is-hit'); float(s, `−${-dv}`, 'down'); burst(s.x, s.y, ['💨'], 4); }
        return;
      }
      if (G.mode === 'dino' && dv < 0) {
        flash(s, 'is-hit');
        float(s, `🚨 −${-dv} 🦴`, 'down');
        if (S.dino) { flashEl(S.dino.el, 'is-chomp', 900); say(S.dino, p.me ? 'Bắt quả tang em ăn gian!' : 'Gừm! Bắt quả tang!', 1600, true); }
        return;
      }
      if (G.mode === 'gold' && p.gold !== pr.gold) {
        const d = p.gold - pr.gold;
        float(s, `${d > 0 ? '+' : ''}${d} 🪙`, d > 0 ? 'gold' : 'down');
        if (d > 0) { flash(s, 'is-happy'); burst(s.x, s.y - s.h, ['🪙', '✨'], 6); } else flash(s, 'is-hit');
      } else if (dv > 0 && G.mode !== 'race' && G.mode !== 'tug') {
        flash(s, 'is-happy');
        if (G.mode === 'fish') catchFish(s, dv);
        else float(s, `+${Math.round(dv).toLocaleString('vi-VN')}${UNIT[G.mode]}`, G.mode === 'heist' ? 'gem' : 'up');
        if (G.mode === 'heist') burst(s.x, s.y - s.h, ['💎', '✨'], 5);
        if (G.mode === 'dino') burst(s.x, s.y - 20, dv >= 120 ? ['🦴', '🦖', '✨'] : ['🦴', '🪨'], dv >= 50 ? 8 : 5);
      }
      if (G.mode === 'race' && dv > 0) float(s, dv >= 2 ? '⚡ +2' : '+1', 'up');
      if ((G.mode === 'survival' || G.mode === 'spell') && p.hp < pr.hp) {
        flash(s, 'is-hit');
        float(s, G.mode === 'spell' ? `−${pr.hp - p.hp}` : '💔', 'down');
      }
    });
    if (G.mode === 'boss' && S.boss) {
      const b = S.boss;
      hits.forEach((h) => setTimeout(() => {
        if (!S || !S.boss) return;
        flash(b, h.crit ? 'is-crit' : 'is-hurt', 500);
        float(b, h.crit ? `💥 −${h.dv}` : `−${h.dv}`, h.crit ? 'gold' : 'down');
        if (h.crit) burst(b.x, b.y - b.h * .5, ['💥', '✨', '⚡'], 8);
      }, 520 + h.k * 90));
      setTimeout(() => {
        if (!S || !S.boss) return;
        paintBoss(G);
        if (G.boss.hp <= 0 && b.hp > 0) { burst(b.x, b.y - b.h * .5, ['💥', '⭐', '✨', '🎉'], 14); say(b, 'Khôngggg... dữ liệu an toàn rồi!', 2200, true); }
        else if (G.boss.lastHeal) { float(b, `🧬 +${G.boss.lastHeal}`, 'heal'); say(b, 'Nhân bản! Hồi máu nào!', 1500, true); }
        b.hp = G.boss.hp;
      }, hits.length ? 640 + hits.length * 90 : 0);
    }
    if (G.mode === 'tug') {
      const was = S.prevRope || 0, now = G.rope || 0;
      if (now !== was) Object.values(S.sp).forEach((s) => flash(s, 'is-heave', 600));
      S.prevRope = now;
    }
    snapshot(G);
  }
  /** Câu được cá: 1 con cá trong ao bay theo đường cong lên tay bạn đó. */
  function catchFish(s, kg) {
    float(s, `+${kg} kg`, 'up');
    if (reduced() || !S.fish) return;
    const f = S.fish[Math.floor(Math.random() * S.fish.length)];
    const fly = f.el.cloneNode(true);
    fly.className = 'ar-sc-fish is-catch';
    S.fx.appendChild(fly);
    fly.animate([
      { transform: `translate(${f.x}px, ${f.y}px) rotate(0)` },
      { transform: `translate(${(f.x + s.x) / 2}px, ${Math.min(f.y, s.y) - 120}px) rotate(-200deg)`, offset: .5 },
      { transform: `translate(${s.x - 30}px, ${s.y - s.h - 10}px) rotate(-360deg) scale(.7)` },
    ], { duration: 800, easing: 'cubic-bezier(.3,.6,.4,1)' }).onfinish = () => { fly.remove(); if (S) burst(s.x, s.y - s.h, ['💦', '✨'], 6); };
  }
  /** Em trả lời: đúng → nhảy, sai/hết giờ → hoảng. */
  function mood(id, ok) {
    if (!S || !S.sp[id]) return;
    flash(S.sp[id], ok ? 'is-happy' : 'is-scared', 1000);
  }
  /** Bạn máy cũng phản ứng nhẹ theo lượt (đúng: nhảy, sai: lắc đầu) — dùng khi không có số liệu đổi. */
  function cheer(G) {
    if (!S) return;
    G.players.forEach((p) => { if (p.bot && S.sp[p.id] && Math.random() < .35) flash(S.sp[p.id], 'is-wave', 800); });
  }

  /** Lời thoại trên đầu 1 người chơi (id) — dùng cho sự kiện riêng của từng chế độ. */
  function talk(id, text, ms, hot) { if (S && S.sp[id]) say(S.sp[id], text, ms, hot); }

  global.EduArenaScene = { mount, sync, mood, cheer, talk, clear, SET };
})(window);
