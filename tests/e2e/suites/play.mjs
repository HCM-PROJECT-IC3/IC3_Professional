// Khu vui chơi (/app/#/tro-choi) + Thành tích (/app/#/thanh-tich) — đọc eduquiz_gamestate, mở trang game cũ.
import { mainText, openApp, overflow, seed } from './_helpers.mjs';

export default async function ({ base, page, check, shot }) {
  const todayUTC = new Date().toISOString().slice(0, 10); // = gamification.js § _today()
  const yesterdayUTC = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  const state = (dailyDate) => ({
    xp: 640, totalQuizzes: 12, perfectScores: 1, streak: 4, lastPlayedDate: todayUTC,
    badges: ['first_quiz', 'streak_3', 'ten_quizzes'], totalGameSessions: 9,
    gameCounts: { 'mario-flappy': 4, 'pz-defense': 2, 'computer-simulator': 1, 'daily-challenge': 1, 'arena-room-speed': 1 },
    daily: { date: dailyDate, games: 2, done: false }, dailyQuestsDone: 2,
  });
  const p = await page();
  await seed(p, base, { eduquiz_gamestate: state(todayUTC), 'ic3v2.previewRole': 'guest', ic3_theme: 'light' });
  await openApp(p, base, '#/tro-choi');
  let t = await mainText(p);
  check('nhiệm vụ hôm nay: còn 1 ván', /Còn 1 ván/.test(t));
  check('số lượt đã chơi theo game', /Đã chơi 4 lượt/.test(t) && /Đã chơi 2 lượt/.test(t));
  const links = await p.evaluate(() => [...document.querySelectorAll('main a[href^="../"]')].map((a) => a.getAttribute('href')));
  const bad = [];
  for (const l of links) {
    const r = await fetch(new URL(l, base + 'app/').href);
    if (r.status !== 200) bad.push(`${l} → ${r.status}`);
  }
  check(`mọi link game trỏ tới trang có thật (${links.length})`, links.length >= 11 && !bad.length, bad);
  await shot(p, 'games.png');
  await Promise.all([p.waitForNavigation({ waitUntil: 'networkidle0' }), p.evaluate(() => [...document.querySelectorAll('main a')].find((a) => a.textContent.includes('Hành trình IC3')).click())]);
  await p.waitForFunction(() => document.getElementById('arHome')?.dataset.role, { timeout: 15000 });
  check('"Hành trình IC3" → Đấu trường đúng vai minigame', (await p.evaluate(() => document.getElementById('arHome').dataset.role)) === 'minigame');

  await seed(p, base, { eduquiz_gamestate: state(todayUTC), 'ic3v2.previewRole': 'guest' });
  await openApp(p, base, '#/thanh-tich');
  t = await mainText(p);
  check('thành tích: Cấp 4, còn 260 XP', /Cấp 4/.test(t) && /Còn 260 XP để lên cấp 5/.test(t));
  check('thành tích: 3/12 huy hiệu, nhiệm vụ 2/3', /3\/12/.test(t) && /2\/3/.test(t));
  check('thành tích: lượt Đấu trường cả lớp gộp đúng tên', /Đấu trường cả lớp/.test(t));
  await shot(p, 'achievements.png');

  await seed(p, base, { eduquiz_gamestate: state(yesterdayUTC), 'ic3v2.previewRole': 'guest' });
  await openApp(p, base, '#/tro-choi');
  check('nhiệm vụ lưu từ hôm qua → hôm nay tính lại (còn 3 ván)', /Còn 3 ván/.test(await mainText(p)));

  await seed(p, base, { 'ic3v2.previewRole': 'guest' });
  await openApp(p, base, '#/thanh-tich');
  t = await mainText(p);
  check('máy mới: Cấp 1, 0/12 huy hiệu', /Cấp 1/.test(t) && /0\/12/.test(t));
  await p.setViewport({ width: 375, height: 812 });
  check('thành tích 375px: không tràn ngang', !(await overflow(p)));
  await openApp(p, base, '#/tro-choi');
  check('khu vui chơi 375px: không tràn ngang', !(await overflow(p)));
  check('không lỗi JavaScript', p.errors.length === 0, p.errors);
  await p.closeAll();

  // ── Linh vật theo mùa (arena-core § SEASONS): đồng hồ trình duyệt cố định để không phụ thuộc ngày chạy CI ──
  const arena = async (iso, store) => {
    const q = await page();
    await q.evaluateOnNewDocument((t) => {
      const R = Date;
      class F extends R { constructor(...a) { super(...(a.length ? a : [t])); } static now() { return t; } }
      globalThis.Date = F;
    }, Date.parse(iso));
    await q.goto(base + 'arena.html?vai=solo', { waitUntil: 'networkidle0' });
    await q.evaluate((s) => localStorage.setItem('eduquiz_arena_v1', JSON.stringify(s)), store);
    await q.reload({ waitUntil: 'networkidle0' });
    await q.evaluate(() => { document.getElementById('arNick').value = 'Bin'; document.getElementById('arOpenPacks').click(); });
    await q.waitForSelector('#arPacks:not([hidden]) .ar-pack', { timeout: 10000 });
    return q;
  };
  const prof = (extra) => ({ last: 'Bin', players: { bin: Object.assign({ coins: 100, owned: {}, avatar: '', best: {}, games: 1 }, extra) }, prefs: {} });
  let q = await arena('2026-11-20T10:00:00', prof());
  const packs = await q.evaluate(() => [...document.querySelectorAll('#arPackList [data-pack]')].map((b) => b.dataset.pack));
  check('20/11: cửa hàng có Hộp Tri ân đứng đầu + 4 hộp thường', packs.length === 5 && packs[0] === 'season-teacher', packs);
  t = await q.evaluate(() => document.getElementById('arPacks').innerText);
  check('20/11: báo sự kiện + còn 11 ngày', /Sự kiện: Hộp Tri ân 20\/11/.test(t) && /Còn 11 ngày/.test(t));
  await q.evaluate(() => document.querySelector('#arPackList [data-pack="season-teacher"]').click());
  await new Promise((r) => setTimeout(r, 300));
  const got = await q.evaluate(() => JSON.parse(localStorage.getItem('eduquiz_arena_v1')).players.bin);
  const mine = Object.keys(got.owned);
  check('mở Hộp Tri ân: trừ xu, nhận linh vật của hộp mùa, làm ảnh đại diện', got.coins < 100 && mine.length === 1 && /^season-teacher:/.test(mine[0]) && got.avatar === mine[0], got);
  await shot(q, 'season-shop.png');
  await q.setViewport({ width: 375, height: 812 });
  await shot(q, 'season-shop-375.png');
  check('cửa hàng mùa 375px: không tràn ngang', !(await overflow(q)));
  check('cửa hàng mùa: không lỗi JavaScript', q.errors.length === 0, q.errors);
  await q.closeAll();

  q = await arena('2026-12-05T10:00:00', prof({ owned: got.owned, avatar: got.avatar }));
  const after = await q.evaluate(() => ({
    packs: [...document.querySelectorAll('#arPackList [data-pack]')].map((b) => b.dataset.pack),
    coll: document.getElementById('arCollection').innerText,
    avatar: document.getElementById('arAvatarBtn')?.textContent || '',
  }));
  check('hết mùa (5/12): không bán Hộp Tri ân, còn 4 hộp thường', after.packs.length === 4 && !after.packs.some((x) => /^season-/.test(x)), after.packs);
  check('hết mùa: bộ sưu tập vẫn giữ Hộp Tri ân đã mở', /Hộp Tri ân 20\/11/.test(after.coll));
  check('hết mùa: không lỗi JavaScript', q.errors.length === 0, q.errors);
  await q.closeAll();

  // ── Thẻ Luật chơi + màn mở trận 3‑2‑1 (js/arena/arena-rules.js, arena.js § matchIntro) ──
  const r = await page();
  await r.goto(base + 'arena.html', { waitUntil: 'networkidle0' });
  await r.evaluate(() => localStorage.setItem('eduquiz_arena_v1', JSON.stringify({ last: 'Bin', players: {}, prefs: { mode: 'speed', count: 10 } })));
  await r.goto(base + 'arena.html?vai=solo', { waitUntil: 'networkidle0' });
  const rules = () => r.evaluate(() => {
    const d = document.getElementById('arModeDesc');
    return { steps: d.querySelectorAll('.ar-rules-steps li').length, tags: d.querySelectorAll('.ar-rules-tag').length, text: d.innerText };
  });
  let rc = await rules();
  check('Luật chơi Tốc độ: 3 bước, nhãn, cao trào', rc.steps === 3 && rc.tags >= 2 && /Gay cấn nhất/.test(rc.text) && /Tốc độ/.test(rc.text), rc);
  await r.evaluate(() => document.querySelector('.ar-mode[data-mode="race"]').click());
  rc = await rules();
  check('đổi sang Đua về đích → luật đổi theo (tiến 2 bước)', /Đua về đích/.test(rc.text) && /2 bước/.test(rc.text), rc.text);
  check('Luật chơi không nhắc tên sản phẩm khác', !/kahoot|blooket|wayarena|wayground/i.test(await r.evaluate(() => document.getElementById('arHome').innerText)));
  await shot(r, 'rules-card.png');
  await r.setViewport({ width: 375, height: 812 });
  check('Luật chơi 375px: không tràn ngang', !(await overflow(r)));
  await r.setViewport({ width: 1280, height: 800 });

  await r.waitForFunction(() => !document.getElementById('arPlay').disabled, { timeout: 20000 });
  await r.evaluate(() => document.getElementById('arPlay').click());
  await r.waitForSelector('#arGame .ar-intro', { timeout: 10000 });
  const intro = await r.evaluate(() => ({ text: document.querySelector('.ar-intro').innerText, phase: document.querySelector('.ar-ans:not([disabled])') ? 'q' : 'wait' }));
  check('vào trận → màn mở trận: tên, điều kiện thắng, cao trào, đếm 3', /Đua về đích/.test(intro.text) && /Thắng:/.test(intro.text) && /Cao trào:/.test(intro.text) && /\b3\b/.test(intro.text), intro.text);
  await shot(r, 'match-intro.png');
  await r.keyboard.press('1');
  await new Promise((res) => setTimeout(res, 150));
  check('đang đếm ngược: phím 1 không trả lời, màn vẫn còn', await r.evaluate(() => !!document.querySelector('#arGame .ar-intro')));
  await r.keyboard.press('Enter');
  await r.waitForFunction(() => !document.querySelector('#arGame .ar-intro') && document.getElementById('arQ').textContent.trim().length > 0, { timeout: 5000 });
  check('Enter → vào câu 1 ngay', /Câu 1/.test(await r.evaluate(() => document.getElementById('arQNum').textContent)));
  check('Luật chơi + mở trận: không lỗi JavaScript', r.errors.length === 0, r.errors);
  await r.closeAll();

  // Tự vào câu 1 sau ~3 nhịp, không cần bấm
  const a2 = await page();
  await a2.goto(base + 'arena.html', { waitUntil: 'networkidle0' });
  await a2.evaluate(() => localStorage.setItem('eduquiz_arena_v1', JSON.stringify({ last: 'Bin', players: {}, prefs: { mode: 'speed', count: 10 } })));
  await a2.goto(base + 'arena.html?vai=solo', { waitUntil: 'networkidle0' });
  await a2.waitForFunction(() => !document.getElementById('arPlay').disabled, { timeout: 20000 });
  await a2.evaluate(() => document.getElementById('arPlay').click());
  await a2.waitForSelector('#arGame .ar-intro', { timeout: 10000 });
  await a2.waitForFunction(() => !document.querySelector('#arGame .ar-intro'), { timeout: 6000 }).catch(() => {});
  check('không bấm gì → tự vào câu 1 sau đếm ngược', await a2.evaluate(() => !document.querySelector('#arGame .ar-intro') && /Câu 1/.test(document.getElementById('arQNum').textContent)));

  // ── Bạn máy "như người" (arena-core § botPlan, 18/11/2026): mỗi câu 1 kế hoạch; điểm nhận ĐÚNG bằng kế hoạch ──
  await a2.waitForFunction(() => { const G = window.EduArena._state(); return G && G.phase === 'q' && G.plan && G.plan.i === G.i; }, { timeout: 8000 });
  const plan1 = await a2.evaluate(() => {
    const G = window.EduArena._state();
    return { personas: G.players.filter((p) => p.bot).map((p) => p.persona), plan: G.plan.by,
      before: Object.fromEntries(G.players.filter((p) => p.bot).map((p) => [p.id, { score: p.score, streak: p.streak }])), lim: G.limitMs };
  });
  const ids = Object.keys(plan1.plan);
  check('trận Tốc độ: mỗi bạn máy 1 tính cách, kế hoạch câu 1 có sẵn khi bắt đầu tính giờ',
    ids.length >= 3 && plan1.personas.every(Boolean) && new Set(plan1.personas).size === plan1.personas.length, plan1.personas);
  check('bạn máy không chốt cùng một nhịp (thời gian khác nhau)', new Set(ids.map((id) => Math.round(plan1.plan[id].ms / 100))).size >= Math.min(3, ids.length), ids.map((id) => plan1.plan[id].ms));
  await a2.evaluate(() => document.querySelector('#arAnswers .ar-ans').click());
  // trả lời → pha "chốt" (trống dồn, chưa chấm) → lộ đáp án và chấm cả bạn máy
  await a2.waitForFunction(() => !['q', 'lock', 'intro'].includes(window.EduArena._state().phase), { timeout: 8000 });
  const got1 = await a2.evaluate((ids) => {
    const G = window.EduArena._state(), C = window.EduArenaCore;
    return ids.map((id) => { const p = G.players.find((x) => x.id === id); return { id, score: p.score }; });
  }, ids);
  const want1 = await a2.evaluate((p1) => {
    const C = window.EduArenaCore;
    return Object.keys(p1.plan).map((id) => { const a = p1.plan[id], s = p1.before[id]; return { id, score: s.score + C.speedPoints(a.correct, a.ms, p1.lim) + (a.correct ? C.streakBonus(s.streak + 1) : 0) }; });
  }, plan1);
  check('điểm bạn máy = đúng kế hoạch đã "chốt" trên màn hình (không tung xúc xắc lần 2)', JSON.stringify(got1) === JSON.stringify(want1), { got1, want1 });
  check('bạn máy: không lỗi JavaScript', a2.errors.length === 0, a2.errors);
  await a2.closeAll();

  // ── Đối thủ nhớ em + bạn máy "đang nghĩ" trên sân + 1 trận ngắn trọn vẹn ──
  const rv = await page();
  const names = ['Mèo Wifi', 'Cú Bit', 'Rùa Byte', 'Cáo Pixel', 'Gấu Cache', 'Sóc USB', 'Cá Cloud', 'Thỏ Router'];
  const rivals0 = Object.fromEntries(names.map((n) => [n, { w: 2, l: 0, last: 'w' }]));
  await rv.goto(base + 'arena.html', { waitUntil: 'networkidle0' });
  await rv.evaluate((r) => localStorage.setItem('eduquiz_arena_v1', JSON.stringify({ last: 'Bin', prefs: { mode: 'speed', count: 3 },
    players: { bin: { coins: 0, owned: {}, avatar: '', best: {}, games: 0, rivals: r } } })), rivals0);
  await rv.goto(base + 'arena.html?vai=solo', { waitUntil: 'networkidle0' });
  await rv.waitForFunction(() => !document.getElementById('arPlay').disabled, { timeout: 20000 });
  await rv.evaluate(() => document.getElementById('arPlay').click());
  await rv.waitForSelector('#arGame .ar-intro', { timeout: 10000 });
  const ri = await rv.evaluate(() => ({ foes: [...document.querySelectorAll('.ar-intro-foes li')].map((li) => li.innerText.replace(/\s+/g, ' ')), say: document.querySelector('.ar-intro-say')?.innerText || '' }));
  check('mở trận: giới thiệu đối thủ + tính cách + thành tích đối đầu (2–0)', ri.foes.length >= 3 && ri.foes.every((t) => /(Cẩn thận|Hấp tấp|Đều tay|Bùng nổ)/.test(t) && /2–0/.test(t)), ri.foes);
  check('mở trận: bạn máy nhắc chuyện cũ — "Lần trước em thắng tớ… phục thù!"', /phục thù/.test(ri.say), ri.say);
  await rv.keyboard.press('Enter');
  await rv.waitForFunction(() => { const G = window.EduArena._state(); return G && G.phase === 'q' && G.plan && G.plan.i === G.i; }, { timeout: 8000 });
  const thinking = await rv.evaluate(() => [...document.querySelectorAll('#arScene .ar-sc-sp:not(.is-me)')].map((s) => /is-think|is-locked|is-stuck/.test(s.className)));
  check('trên sân: mỗi bạn máy đang nghĩ (ba chấm) hoặc đã chốt', thinking.length >= 3 && thinking.every(Boolean), thinking);
  await shot(rv, 'arena-thinking.png', { fullPage: false });
  // chơi hết 3 câu
  for (let k = 0; k < 3; k++) {
    await rv.waitForFunction(() => { const G = window.EduArena._state(); return (G && G.phase === 'q' && document.querySelector('#arAnswers .ar-ans:not([disabled])')) || !document.getElementById('arEnd').hidden; }, { timeout: 15000 });
    if (!(await rv.evaluate(() => document.getElementById('arEnd').hidden))) break;
    await rv.evaluate(() => document.querySelector('#arAnswers .ar-ans:not([disabled])').click());
    await rv.waitForFunction(() => window.EduArena._state().phase !== 'q' && window.EduArena._state().phase !== 'lock', { timeout: 8000 });
    await rv.evaluate(() => { const b = [...document.querySelectorAll('#arGame button')].find((x) => !x.hidden && x.offsetParent && /Câu tiếp|Tiếp|Xem kết quả/.test(x.innerText)); if (b) b.click(); });
  }
  const ended = await rv.waitForFunction(() => !document.getElementById('arEnd').hidden, { timeout: 20000 }).then(() => true, () => false);
  const re = await rv.evaluate(() => ({ line: document.getElementById('arEndRival')?.innerText || '', hidden: document.getElementById('arEndRival')?.hidden,
    rivals: JSON.parse(localStorage.getItem('eduquiz_arena_v1')).players.bin.rivals }));
  const played = Object.values(re.rivals).filter((r) => r.w + r.l === 3);
  check('hết trận: thắng/thua với từng bạn máy được lưu (mỗi bạn trong trận +1 ván)', ended && played.length >= 3, { ended, rivals: re.rivals });
  check('hết trận: bạn sát hạng em nói 1 câu theo kết quả', ended && !re.hidden && /:/.test(re.line) && re.line.length > 10, re.line);
  check('đối thủ nhớ em: không lỗi JavaScript', rv.errors.length === 0, rv.errors);
  await shot(rv, 'arena-end-rival.png');
  await rv.closeAll();

  // ── Hành trình IC3: người dẫn đường, sương vùng chưa tới, vẽ lại không giật, đi bộ sang chặng kế ──
  const m = await page();
  const questStore = { last: 'Bin', prefs: { mode: 'speed', count: 10 }, players: { bin: { coins: 0, owned: {}, avatar: '', best: {}, games: 0, quest: {
    lv: 'Spark|LV1', mini: { 'memory-game': 1, 'computer-simulator': 2 }, maps: { 'Spark|LV1': { s: { 'r1-quiz': 2 }, chest: {} } } } } } };
  await m.goto(base + 'arena.html', { waitUntil: 'networkidle0' });
  await m.evaluate((s) => localStorage.setItem('eduquiz_arena_v1', JSON.stringify(s)), questStore);
  await m.goto(base + 'arena.html?vai=minigame', { waitUntil: 'networkidle0' });
  await m.waitForSelector('#arQuestMap .ar-q-region', { timeout: 10000 });
  const mp = await m.evaluate(() => ({
    here: [...document.querySelectorAll('.ar-q-region.is-here')].map((r) => r.dataset.region),
    guides: [...document.querySelectorAll('.ar-q-guide')].map((g) => g.closest('.ar-q-region').dataset.region),
    guideText: document.querySelector('.ar-q-guide')?.innerText || '',
    fog: [...document.querySelectorAll('.ar-q-region.is-fog')].map((r) => r.dataset.region),
    next: document.querySelector('.ar-q-node.is-next')?.dataset.node,
    emoji: /\p{Extended_Pictographic}/u.test(document.querySelector('.ar-q-guide')?.innerText || ''),
  }));
  check('xong vùng 1 → em đang ở vùng 2: chỉ người dẫn đường vùng 2 lên tiếng, lời chào lần đầu', mp.here.join() === 'r2' && mp.guides.join() === 'r2' && /Chú Tư/.test(mp.guideText) && mp.next === 'r2-quiz', mp);
  check('vùng 3 → Trùm cuối phủ sương "Chưa khám phá"; vùng 1 không', mp.fog.join() === 'r3,r4,r5,r6,r7,fin' && /Chưa khám phá/.test(await m.evaluate(() => document.querySelector('.ar-q-region.is-fog').innerText)), mp.fog);
  check('người dẫn đường: hình tự vẽ, không emoji', !mp.emoji && !!(await m.$('.ar-q-guide svg')));
  await m.evaluate(() => document.querySelector('.ar-q-region.is-here').scrollIntoView({ block: 'start' }));
  await shot(m, 'quest-map.png', { fullPage: false });
  // về bản đồ khi không có gì đổi → không dựng lại cảnh SVG (trước đây 2 lần dựng lại mỗi lần về)
  const rebuilt = await m.evaluate(async () => {
    const out = [];
    const nm = (n) => (n.className && n.className.baseVal === undefined ? n.className : n.nodeName) || n.nodeName;
    const ob = new MutationObserver((l) => l.forEach((x) => { if (x.type === 'childList') out.push(nm(x.target) + ' +' + [...x.addedNodes].map(nm).join('|') + ' -' + [...x.removedNodes].map(nm).join('|')); }));
    ob.observe(document.getElementById('arQuestMap'), { childList: true, subtree: true });
    window.EduArena.api.toMap();
    await new Promise((r) => setTimeout(r, 300));
    ob.disconnect();
    return out;
  });
  check('về bản đồ, không có gì đổi → 0 lần dựng lại bản đồ', rebuilt.length === 0, rebuilt);
  // vào chặng vùng 2 → màn "lên đường"; về bản đồ → nhân vật đi bộ từ chặng vừa chơi sang chặng kế
  await m.evaluate(() => {
    window.__travel = false;
    new MutationObserver(() => { if (document.querySelector('.ar-q-travel')) window.__travel = true; }).observe(document.body, { childList: true });
    document.getElementById('arNick').value = 'Bin';
    window.__toasts = []; new MutationObserver(() => window.__toasts.push(document.getElementById('arToast').textContent)).observe(document.getElementById('arToast'), { childList: true, characterData: true, subtree: true });
    document.querySelector('[data-node="r2-quiz"]').click();
  });
  await m.waitForSelector('#arQuestGo');
  await m.evaluate(() => document.getElementById('arQuestGo').click());
  const started = await m.waitForFunction(() => { const G = window.EduArena._state(); return G && G.force; }, { timeout: 15000 }).then(() => true, () => false);
  if (!started) {
    check('vào chặng vùng 2 → trận bắt đầu', false, m.errors.concat(await m.evaluate(() => ({ toast: document.getElementById('arToast').innerText, hidden: document.getElementById('arToast').hidden,
      toasts: window.__toasts, travelSeen: window.__travel, travel: !!document.querySelector('.ar-q-travel'), sheet: !document.getElementById('arQuestSheet').hidden, G: !!window.EduArena._state(), screens: [...document.querySelectorAll('.ar-screen')].filter((s) => !s.hidden).map((s) => s.id) }))));
    await m.closeAll();
    return;
  }
  const travelGone = await m.waitForFunction(() => !document.querySelector('.ar-q-travel'), { timeout: 1000 }).then(() => true, () => false); // mờ dần 160 ms, đè màn đếm 3-2-1 (chưa tính giờ)
  check('vào chặng → hiện màn "lên đường" lúc tải, trận bắt đầu thì màn đó tắt (≤ 1 giây)', travelGone && await m.evaluate(() => window.__travel));
  // giả lập đã có sao ở chặng này → chặng kế là vùng 3; về bản đồ
  await m.evaluate(() => { const p = window.EduArena.api.profile(); p.quest.maps['Spark|LV1'].s['r2-quiz'] = 1; window.EduArena.api.toMap(); });
  const walked = await m.waitForSelector('.ar-q-walker', { timeout: 3000 }).then(() => true, () => false);
  check('về bản đồ → nhân vật đi bộ từ chặng vừa chơi sang chặng kế (không dịch chuyển tức thời)', walked);
  await m.waitForFunction(() => !document.querySelector('.ar-q-walker'), { timeout: 4000 }).catch(() => {});
  check('đi xong: nhân vật đứng ở chặng vùng 3, vùng 3 hết sương', await m.evaluate(() => document.querySelector('.ar-q-node.is-next')?.dataset.node === 'r3-quiz'
    && !document.querySelector('[data-region="r3"]').classList.contains('is-fog') && document.querySelector('.ar-q-node.is-next .ar-q-me').style.visibility !== 'hidden'));
  await m.setViewport({ width: 375, height: 812 });
  check('bản đồ Hành trình 375px: không tràn ngang', !(await overflow(m)));
  check('Hành trình: không lỗi JavaScript', m.errors.length === 0, m.errors);
  await m.closeAll();
}
