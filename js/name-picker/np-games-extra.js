/* ============================================================
   js/name-picker/np-games-extra.js — 6 trò gọi tên thêm cho trang Gọi tên (goi-ten.html):
     Ong tìm hoa · Mèo bắt chuột · Thả diều · Sút luân lưu · Đèn xanh đèn đỏ · Bịt mắt bắt dê
   Tranh + cảnh nền: np-art-extra.js (tự vẽ, cùng nét np-art.js) — không tải ảnh ngoài.
   Đăng ký qua EduNamePickerGames.register(); dùng chung bộ dựng sân khấu (kit) và khung hunt() của np-games.js,
   nên vẫn giữ luật chung: người được gọi đã chọn TRƯỚC, trò chỉ "diễn" — vài lần hụt, Lật kèo, lộ diện ở giây cuối.
   ============================================================ */
(function (global) {
  'use strict';

  const A = global.EduNamePickerArt;
  const G = global.EduNamePickerGames;
  const N = global.EduNamePicker;
  if (!A || !A.extra || !G || !G.register) return;
  const K = G.kit;
  const { bee, bloom, cat, mouse, kite, ball, goalie, light, seeker, ICON } = A.extra; // tranh: np-art-extra.js
  const FUN = A.FUN;
  const rng = Math.random;
  const { sleep, rand, pickOne, sfx } = K;
  const find = (list, name) => list.find((s) => s.data && s.data.name === name);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  /** Số lần "hụt" theo thời gian chơi (giống hunt): 1..max. */
  const fakesFor = (D, per, max) => clamp(Math.round(D / per), 1, max || 4);

  // ============================================================
  // 1) ONG TÌM HOA — vườn hoa mang tên, ong đậu thử vài bông, bông cuối nở bung
  // ============================================================
  function beeField(items) {
    const pos = K.scatter(items.length, 90, 300, 930, 578);
    const w = items.length <= 20 ? 56 : items.length <= 30 ? 48 : 42;
    const list = items.map((it, k) => K.sprite(bloom(FUN[it.idx % FUN.length]), pos[k].x, pos[k].y, { w, h: w * 1.83, tag: it.label, cls: 'np-bloom-sp', data: it }));
    list.forEach((sp, k) => sp.el.style.setProperty('--bd', (k % 5) * .35 + 's'));
    K.setActors(list);
    return list;
  }
  G.register({
    id: 'bee', name: 'Ong tìm hoa', desc: 'Ong đậu bông nào', scene: 'garden', icon: ICON.bee, cap: 40, theme: ['🌸', '🐝', '🍯'],
    idle: (items) => { beeField(items); K.sprite(bee(), 150, 150, { w: 80, h: 62, cls: 'np-agent np-bee-sp' }); },
    play: async (items, plan, D) => {
      const list = beeField(items);
      const b = K.sprite(bee(), 150, 150, { w: 80, h: 62, cls: 'np-agent np-bee-sp' });
      K.say(b, 'Vo ve... bông nào nhiều mật nhất?', 1500);
      await K.hunt({
        agent: b, list, plan, D, speed: 400,
        offset: (sp) => ({ x: sp.x + 8, y: sp.y - sp.h * .66 }),
        fake: async (sp) => {
          sp.el.classList.add('is-droop'); sfx('click');
          K.say(sp, pickOne(['Chưa có mật!', 'Nhầm rồi, bay tiếp!', 'Hoa này chưa nở!', 'Không phải mình đâu!']), 900);
          await sleep(800); sp.el.classList.remove('is-droop');
        },
        take: async (sp, final) => {
          sp.el.classList.add('is-bloom'); sfx(final ? 'combo' : 'flip');
          K.say(b, final ? 'Ngọt lịm! Chọn bông này!' : 'Ồ, bông này thơm quá...', 1300, 'hot');
          if (final) K.burst(sp.x, sp.y - sp.h * .7, ['🌸', '🍯', '✨', '🌼'], 14);
          await sleep(final ? 900 : 600);
        },
        release: async (sp) => { sp.el.classList.remove('is-bloom'); sp.el.classList.add('is-droop'); K.say(b, 'Ơ... hết mật rồi!', 900); await sleep(500); sp.el.classList.remove('is-droop'); },
      });
    },
  });

  // ============================================================
  // 2) MÈO BẮT CHUỘT — chuột chạy khắp bếp, mèo vồ hụt vài lần rồi tóm 1 chú
  // ============================================================
  const CAT_BOX = [90, 390, 930, 585];
  function mouseFloor(items) {
    const pos = K.scatter(items.length, 110, 400, 900, 580);
    const w = items.length <= 16 ? 70 : 58;
    const list = items.map((it, k) => K.sprite(mouse(FUN[it.idx % FUN.length]), pos[k].x, pos[k].y, { w, h: w * .65, tag: it.label, cls: 'np-mouse-sp', data: it }));
    K.setActors(list);
    return list;
  }
  G.register({
    id: 'cat', name: 'Mèo bắt chuột', desc: 'Mèo vồ chú chuột nào', scene: 'kitchen', icon: ICON.cat, cap: 24, theme: ['🐭', '🧀', '🐾'],
    idle: (items) => { mouseFloor(items); K.sprite(cat(), 820, 380, { w: 150, h: 112, cls: 'np-agent np-cat-sp is-left' }); },
    play: async (items, plan, D) => {
      const list = mouseFloor(items);
      const c = K.sprite(cat(), 980, 380, { w: 150, h: 112, cls: 'np-agent np-cat-sp' });
      K.wander(list, CAT_BOX, 220);
      await K.go(c, 820, 400, 700);
      K.say(c, 'Meo! Chú chuột nào ăn vụng phô mai?', 1500, 'hot');
      await K.hunt({
        agent: c, list, plan, D: D - 700, speed: 420,
        offset: (sp) => ({ x: sp.x + (c.x > sp.x ? 70 : -70), y: sp.y + 2 }),
        fake: async (sp) => {
          c.el.classList.add('is-pounce'); sfx('whoosh');
          K.say(c, pickOne(['Hụt rồi! Meo...', 'Nhầm rồi, đi tiếp!', 'Trơn như chạch!']), 900);
          K.say(sp, 'Chít chít!', 700);
          await sleep(300); c.el.classList.remove('is-pounce');
          await K.flee(sp, c.x, c.y, CAT_BOX);
        },
        take: async (sp, final) => {
          c.el.classList.add('is-pounce'); sp.el.classList.add('is-caught'); sfx(final ? 'combo' : 'flip');
          K.say(c, final ? 'Meo! Tóm được rồi nhé!' : 'Bắt được rồi!', 1400, 'hot');
          if (final) K.burst(sp.x, sp.y - 30, ['🧀', '🐾', '✨'], 12);
          await sleep(final ? 900 : 600);
          c.el.classList.remove('is-pounce');
        },
        release: async (sp) => { sp.el.classList.remove('is-caught'); K.say(sp, 'Chít chít, thoát rồi!', 900); await K.flee(sp, c.x, c.y, CAT_BOX); },
      });
    },
  });

  // ============================================================
  // 3) THẢ DIỀU — mỗi bạn 1 con diều, gió đổi chiều, diều ai bay cao nhất
  // ============================================================
  function kiteField(items) {
    const n = items.length, cw = 920 / n, w = clamp(cw * .78, 30, 66), hk = w * 130 / 70;
    const kites = items.map((it, k) => K.sprite(kite(FUN[it.idx % FUN.length], FUN[(it.idx + 3) % FUN.length]), 40 + cw * (k + .5), 480, { w, h: hk, tag: it.label, cls: 'np-kite-sp' + (k % 2 ? ' is-alt' : ''), data: it, flat: true }));
    const holders = items.map((it, k) => K.sprite(A.kid(it.idx), 40 + cw * (k + .5), 594, { w: clamp(cw * .55, 22, 40), cls: 'np-kid-sp np-holder', flat: true }));
    // Dây diều: 1 lớp SVG nằm dưới diều, cập nhật mỗi khung hình
    const strings = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    strings.setAttribute('class', 'np-strings'); strings.setAttribute('viewBox', `0 0 ${K.W} ${K.H}`);
    strings.innerHTML = kites.map(() => '<path fill="none" stroke="rgba(60,40,20,.55)" stroke-width="1.4"/>').join('');
    K.layer.prepend(strings);
    const paths = [...strings.children];
    const draw = (k, x, y) => {
      const hx = holders[k].x + holders[k].w * .25, hy = 594 - holders[k].w * 1.0;
      paths[k].setAttribute('d', `M${hx} ${hy}Q${(hx + x) / 2 + 30} ${(hy + y) / 2 + 40} ${x} ${y}`);
    };
    kites.forEach((sp, k) => draw(k, sp.x, sp.y - sp.h * .72));
    return { kites, draw };
  }
  G.register({
    id: 'kite', name: 'Thả diều', desc: 'Diều ai bay cao nhất', scene: 'meadow', icon: ICON.kite, cap: 16, theme: ['🪁', '☁️', '⭐'],
    idle: (items) => { kiteField(items); },
    play: async (items, plan, D) => {
      const { kites, draw } = kiteField(items);
      const names = items.map((it) => it.name);
      const sc = N.raceScript(names, plan.winner, rng, plan.twist);
      K.shout('Thả diều nào!');
      sfx('whoosh');
      await sleep(800);
      const phase = kites.map(() => rand(0, 6.3));
      const baseX = kites.map((sp) => sp.x);
      const t0 = performance.now(), run = D - 1000;
      let lead = '', gust = false;
      await new Promise((done) => {
        const step = (now) => {
          const t = Math.min(1, (now - t0) / run), wind = Math.sin(t * 7) * 18;
          // Gió lớn giữa chừng: cả đàn diều chao đảo
          if (!gust && t > .45) { gust = true; K.shout('Gió lớn!'); sfx('whoosh'); kites.forEach((sp) => { sp.el.classList.add('is-gust'); K.later(900, () => sp.el.classList.remove('is-gust')); }); }
          let best = -1, who = null;
          kites.forEach((sp, k) => {
            const p = N.raceAt(sc[names[k]], t);
            const x = baseX[k] + (wind + Math.sin(now / 520 + phase[k]) * 10) * (.3 + p), y = 480 - p * 340;
            sp.el.style.transform = `translate(${x}px, ${y}px) rotate(${Math.sin(now / 400 + phase[k]) * 9}deg)`;
            sp.x = x; sp.y = y;
            draw(k, x, y - sp.h * .72);
            if (p > best) { best = p; who = sp; }
          });
          if (who && who.data.name !== lead) { lead = who.data.name; kites.forEach((s) => s.el.classList.toggle('is-lead', s === who)); sfx('click'); }
          K.twistTalk(t, kites, plan);
          if (t < 1) K.frame(step); else done();
        };
        K.frame(step);
      });
      const win = find(kites, plan.winner);
      win.el.classList.add('is-win');
      K.burst(win.x, win.y - win.h * .7, ['⭐', '✨', '🌟'], 12);
      sfx('combo');
    },
  });

  // ============================================================
  // 4) SÚT LUÂN LƯU — từng bạn lên sút: thủ môn bắt, trúng cột, bay lên khán đài... bàn thắng vàng ở cú cuối
  // ============================================================
  const SPOT = { x: 500, y: 420 };
  function pitch(items) {
    const pos = K.scatter(items.length, 70, 470, 930, 585);
    const list = K.kids(items, pos);
    list.forEach((s, k) => s.el.style.setProperty('--bd', (k % 6) * .25 + 's'));
    const gk = K.sprite(goalie(), 500, 312, { w: 66, h: 106, cls: 'np-agent np-gk-sp' });
    const b = K.sprite(ball(), SPOT.x, SPOT.y, { w: 26, h: 26, cls: 'np-fball-sp' });
    return { list, gk, b };
  }
  G.register({
    id: 'goal', name: 'Sút luân lưu', desc: 'Ai ghi bàn thắng vàng', scene: 'goal', icon: ICON.goal, cap: 24, theme: ['⚽', '🥅', '🏆'],
    idle: (items) => { pitch(items); },
    play: async (items, plan, D) => {
      const { list, gk, b } = pitch(items);
      const world = () => K.world;
      const t0 = performance.now(), end = t0 + D;
      // Thủ môn nhún nhảy giữa khung thành
      let diving = false;
      K.every(700, () => { if (!diving) K.go(gk, rand(450, 550), 312, 600, { still: true, ease: 'ease-in-out' }); });
      const corner = () => pickOne([[365, 200], [365, 285], [635, 200], [635, 285]]);
      async function shot(sp, outcome, final) {
        sp.frozen = true;
        sp.el.classList.add('is-target');
        const home = { x: sp.x, y: sp.y };
        await K.go(sp, SPOT.x - 46, SPOT.y + 34, 800);
        sp.el.classList.remove('is-target');
        K.say(sp, final ? 'Cú sút quyết định!' : pickOne(['Xem đây!', 'Góc này!', 'Một, hai...']), 800);
        await sleep(final ? 900 : 500);
        await K.go(sp, SPOT.x - 18, SPOT.y + 10, 220);
        const [tx, ty] = corner();
        const left = tx < 500;
        sfx('whoosh');
        diving = true;
        // Bàn thắng: thủ môn đổ người sai hướng · Bắt bóng: đúng hướng · Cột dọc / Xà ngang / Bay lên khán đài
        const dive = outcome === 'goal' ? !left : left;
        gk.el.classList.add(dive ? 'dive-l' : 'dive-r');
        K.go(gk, dive ? 430 : 570, 312, 260, { still: true, ease: 'ease-out' });
        const to = { goal: [tx, ty], save: [dive ? 420 : 580, 262], post: [left ? 330 : 670, 250], bar: [tx, 160], over: [tx + (left ? -90 : 90), 60] }[outcome];
        b.el.classList.add('is-kick');
        await K.go(b, to[0], to[1], final ? 620 : 460, { still: true, ease: 'cubic-bezier(.2,.7,.3,1)' });
        if (outcome === 'goal') {
          K.burst(to[0], to[1], ['⚽', '✨', '🎉'], 12);
          world().classList.add('is-net');
        } else {
          sfx(outcome === 'save' ? 'flip' : 'wrong');
          const msg = { save: ['Thủ môn bắt gọn!', 'Cứu thua xuất sắc!'], post: ['Trúng cột dọc!', 'Choang! Cột dọc!'], bar: ['Dội xà ngang!'], over: ['Bóng bay lên khán đài!'] }[outcome];
          K.say(outcome === 'save' ? gk : sp, pickOne(msg), 1000, 'hot');
          await K.go(b, rand(380, 620), 380, 500, { still: true, ease: 'ease-out' });
        }
        return async () => {
          // Dọn lượt: thủ môn đứng dậy, bóng về chấm phạt đền, bạn vừa sút về chỗ
          gk.el.classList.remove('dive-l', 'dive-r'); diving = false;
          b.el.classList.remove('is-kick'); K.place(b, SPOT.x, SPOT.y, 0);
          world().classList.remove('is-net');
          await K.go(sp, home.x, home.y, 700);
          sp.frozen = false;
        };
      }
      const winner = find(list, plan.winner), decoy = plan.twist ? find(list, plan.twist) : null;
      const fakes = fakesFor(D, 4600, 4);
      const tail = decoy ? 7200 : 3600;
      const outs = N.shuffle(['save', 'post', 'save', 'bar', 'over'], rng);
      for (let k = 0; k < fakes; k++) {
        const slot = t0 + (D - tail) * (k / fakes);
        if (performance.now() < slot) await sleep(slot - performance.now());
        if (performance.now() > end - tail - 1500) break;
        const v = pickOne(list.filter((s) => s !== winner && s !== decoy && !s.frozen));
        if (!v) break;
        const done = await shot(v, outs[k % outs.length]);
        await sleep(500);
        done();
        await sleep(400);
      }
      if (decoy) {
        if (performance.now() < end - tail) await sleep(end - tail - performance.now());
        const done = await shot(decoy, 'bar');
        const bn = K.banner(decoy.data.full, 'Tưởng ghi bàn rồi...');
        await sleep(600);
        await bn.wrong();
        await done();
      }
      const left = end - performance.now() - 3000;
      if (left > 0) await sleep(left);
      K.glide(1.25, 500, 330);
      await shot(winner, 'goal', true);
      K.shout('VÀOOO!');
      sfx('combo');
      winner.el.classList.add('is-happy');
      await sleep(600);
    },
  });

  // ============================================================
  // 5) ĐÈN XANH ĐÈN ĐỎ — đèn xanh cả lớp chạy về đích, đèn đỏ phải đứng im; ai nhúc nhích bị gọi
  // ============================================================
  function yard(items) {
    const pos = K.scatter(items.length, 60, 345, 300, 585);
    const list = K.kids(items, pos);
    list.forEach((s, k) => s.el.style.setProperty('--bd', (k % 6) * .25 + 's'));
    const tl = K.sprite(light(), 925, 520, { w: 66, h: 180, cls: 'np-agent np-tl-sp is-red' });
    return { list, tl };
  }
  G.register({
    id: 'redlight', name: 'Đèn xanh đèn đỏ', desc: 'Đèn đỏ ai nhúc nhích', scene: 'yard', icon: ICON.redlight, cap: 24, theme: ['🚦', '🟢', '🔴'],
    idle: (items) => { yard(items); },
    play: async (items, plan, D) => {
      const { list, tl } = yard(items);
      const winner = find(list, plan.winner), decoy = plan.twist ? find(list, plan.twist) : null;
      // Mỗi lượt đèn đỏ tốn thời gian cố định (thường · Lật kèo · lượt cuối); phần còn lại chia cho đèn xanh
      // để đèn đỏ cuối cùng rơi đúng lúc hết giờ.
      const RED = { normal: 1500, twist: 2900, last: 1700 };
      const end = performance.now() + D - 300;
      const normals = clamp(Math.floor((D - 300 - RED.last - (decoy ? RED.twist : 0)) / (RED.normal + 1100)), 1, 4);
      const kinds = Array(normals).fill('normal').concat(decoy ? ['twist'] : [], ['last']);
      const stepMax = 500 / kinds.length;
      const others = () => list.filter((s) => s !== winner && s !== decoy);
      const setLight = (c) => { tl.el.classList.remove('is-red', 'is-green'); tl.el.classList.add('is-' + c); };
      for (let r = 0; r < kinds.length; r++) {
        const kind = kinds[r];
        const redLeft = kinds.slice(r).reduce((s, k) => s + RED[k], 0);
        const green = Math.max(600, (end - performance.now() - redLeft) / (kinds.length - r));
        // Đèn xanh: chạy về phía đích (mỗi bạn bước một khác)
        setLight('green'); K.say(tl, 'Đèn xanh!', Math.min(800, green)); sfx('go');
        list.forEach((sp) => {
          const x = Math.min(800, sp.x + rand(stepMax * .3, stepMax * 1.15)), y = clamp(sp.y + rand(-22, 22), 345, 585);
          K.go(sp, x, y, green - 120);
        });
        await sleep(green);
        // Đèn đỏ: đứng im, đèn quét mắt tìm người nhúc nhích
        setLight('red'); K.shout('Đèn đỏ!'); sfx('count');
        tl.el.classList.add('is-scan');
        await sleep(350);
        const sus = kind === 'last' ? winner : kind === 'twist' ? decoy : pickOne(others());
        if (sus) {
          sus.el.classList.add('is-target');
          await sleep(400);
          sus.el.classList.add('is-wobble');
          if (kind === 'last') {
            K.glide(1.3, sus.x, sus.y - sus.h * .5);
            sus.el.classList.add('is-scared');
            K.say(tl, 'Nhúc nhích rồi nhé!', 1400, 'hot'); sfx('combo');
            await sleep(950);
          } else if (kind === 'twist') {
            const bn = K.banner(sus.data.full, 'Đèn đỏ mà nhúc nhích!');
            await sleep(600);
            await bn.wrong();
            K.say(sus, 'Mình đứng im mà!', 900);
            await sleep(250);
          } else {
            K.say(sus, pickOne(['Suýt nhúc nhích!', 'Phù... đứng kịp!', 'Ngứa mũi quá!']), 900); sfx('click');
            await sleep(500);
            K.say(tl, pickOne(['Đứng im giỏi lắm!', 'Nhầm rồi, chơi tiếp!']), 800);
            await sleep(250);
          }
          sus.el.classList.remove('is-target', 'is-wobble');
        }
        tl.el.classList.remove('is-scan');
      }
    },
  });

  // ============================================================
  // 6) BỊT MẮT BẮT DÊ — các bạn đứng vòng tròn dưới gốc đa, người bịt mắt dò đường bắt 1 bạn
  // ============================================================
  const RING = { x: 500, y: 468, rx: 380, ry: 108 };
  function ring(items) {
    const n = items.length, off = rand(0, Math.PI * 2);
    const pos = items.map((_, k) => { const a = off + (Math.PI * 2 * k) / n; return { x: RING.x + Math.cos(a) * RING.rx, y: RING.y + Math.sin(a) * RING.ry }; });
    const list = K.kids(items, pos);
    list.forEach((s, k) => { s.home = pos[k]; s.el.style.setProperty('--bd', (k % 6) * .25 + 's'); });
    const sk = K.sprite(seeker(), RING.x, RING.y + 10, { w: 64, h: 104, cls: 'np-agent np-seeker' });
    return { list, sk };
  }
  G.register({
    id: 'blind', name: 'Bịt mắt bắt dê', desc: 'Người bịt mắt bắt ai', scene: 'banyan', icon: ICON.blind, cap: 24, theme: ['🙈', '🐐', '✨'],
    idle: (items) => { ring(items); },
    play: async (items, plan, D) => {
      const { list, sk } = ring(items);
      const box = [70, 340, 930, 588];
      // Các bạn nhún nhảy quanh chỗ mình đứng, trêu người bịt mắt
      K.every(700, () => list.forEach((sp) => {
        if (sp.frozen || rng() > .3) return;
        K.go(sp, clamp(sp.home.x + rand(-34, 34), box[0], box[2]), clamp(sp.home.y + rand(-16, 16), box[1], box[3]), 600);
      }));
      K.say(sk, 'Dê ơi, ở đâu rồi?', 1400);
      K.later(1600, () => list.length && K.say(pickOne(list), pickOne(['Ở đây nè!', 'Bên này!', 'Bắt mình đi!']), 1000));
      await K.hunt({
        agent: sk, list, plan, D, speed: 190,
        offset: (sp) => ({ x: sp.x + (sk.x > sp.x ? 44 : -44), y: sp.y + 3 }),
        fake: async (sp) => {
          sk.el.classList.add('is-grab'); sfx('whoosh');
          K.say(sp, pickOne(['Hihi, trượt rồi!', 'Hụt rồi nha!', 'Nhầm rồi, đi tiếp!']), 900);
          await sleep(300); sk.el.classList.remove('is-grab');
          await K.flee(sp, sk.x, sk.y, box);
          sp.home = { x: sp.x, y: sp.y };
          K.say(sk, 'Đâu rồi ta...', 800);
        },
        take: async (sp, final) => {
          sk.el.classList.add('is-grab'); sp.el.classList.add('is-scared', 'is-caught'); sfx(final ? 'combo' : 'flip');
          if (final) { await sleep(400); sk.el.classList.add('is-unmask'); K.say(sk, 'Bắt được dê rồi!', 1400, 'hot'); K.burst(sp.x, sp.y - 50, ['🐐', '✨', '🎉'], 12); }
          else K.say(sk, 'Bắt được rồi nhé!', 1100, 'hot');
          await sleep(final ? 800 : 600);
        },
        release: async (sp) => { sk.el.classList.remove('is-grab'); sp.el.classList.remove('is-scared', 'is-caught'); K.say(sp, 'Lêu lêu, thoát rồi!', 900); await K.flee(sp, sk.x, sk.y, box); sp.home = { x: sp.x, y: sp.y }; },
      });
    },
  });
})(window);
