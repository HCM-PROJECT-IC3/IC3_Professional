/* ============================================================
   js/arena/arena.js — giao diện "Đấu trường" (arena.html).
   Logic thuần (điểm, rương, bot, linh vật) ở js/arena/arena-core.js.

   Nguồn câu hỏi (file tĩnh — 0 Firebase):
     • arena.html?de=<mã>                 đề giáo viên soạn (js/custom-exam-codec.js, nạp lười)
     • arena.html?cat=IC3&lvl=LV1&mt=...  ngân hàng data/ic3 (chọn sẵn từ sảnh index.html)
   Lưu trên máy (localStorage 'eduquiz_arena_v1'): xu, Linh vật, kỷ lục theo biệt danh.
   ============================================================ */
(function (global) {
  'use strict';

  const C = global.EduArenaCore;
  const STORE = 'eduquiz_arena_v1';
  const SHAPES = ['▲', '◆', '●', '■', '★', '⬟'];
  const AVATAR_DEFAULT = '🙂';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sfx = (n) => { try { global.EduSFX && global.EduSFX.play(n); } catch (e) { /* không có âm thanh cũng chơi được */ } };
  const rng = C.rngFrom((Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0);

  // ============================================================
  // LƯU TRỮ (theo biệt danh, chỉ trên máy)
  // ============================================================
  function load() { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch (e) { return {}; } }
  function save() { try { localStorage.setItem(STORE, JSON.stringify(S)); } catch (e) { /* bộ nhớ đầy / bị chặn — vẫn chơi được */ } }
  const S = Object.assign({ players: {}, last: '', prefs: {} }, load());
  S.prefs = Object.assign({ mode: 'speed', count: 15, level: 'normal', secs: 20 }, S.prefs);
  const nickKey = (n) => String(n || '').trim().toLowerCase() || 'khach';
  function profile() {
    const k = nickKey(S.last);
    if (!S.players[k]) S.players[k] = C.newProfile();
    return S.players[k];
  }
  function avatarOf(p) { const b = p && p.avatar && C.blookById(p.avatar); return b ? b.emoji : AVATAR_DEFAULT; }
  function nickName() { return String(S.last || '').trim() || 'Em'; }

  function toast(msg) {
    const t = $('arToast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast.t);
    toast.t = setTimeout(() => { t.hidden = true; }, 2600);
  }
  function show(screen) {
    ['arHome', 'arPacks', 'arGame', 'arEnd'].forEach((id) => { $(id).hidden = id !== screen; });
    global.scrollTo(0, 0);
    $('arMain').focus({ preventScroll: true });
  }
  function refreshWallet() {
    $('arCoins').textContent = profile().coins;
    $('arAvatarBtn').textContent = avatarOf(profile());
  }

  // ============================================================
  // NGUỒN CÂU HỎI
  // ============================================================
  const params = new URLSearchParams(location.search);
  const SRC = { de: params.get('de') || '', exam: null, meta: null, manifest: null, questions: null, key: '' };
  const LESSON_RE = /^Tiết \d+$/;
  const BAI_RE = /^Bài \d+[.:]/;
  const ALL = '__ALL__';
  const getJson = (u) => fetch(u).then((r) => { if (!r.ok) throw new Error(u + ' ' + r.status); return r.json(); });

  async function initSource() {
    if (SRC.de) {
      $('arSourceBank').hidden = true;
      const box = $('arSourceDe');
      box.hidden = false;
      box.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang mở đề của giáo viên...';
      try {
        await global.EduLazyLoad.loadScripts(['js/custom-exam-codec.js']);
        const exam = await global.EduCustomExam.decode(SRC.de);
        if (!exam) throw new Error('Link đề hỏng');
        await global.EduCustomExam.attachBankQuestions(exam);
        SRC.exam = exam;
        SRC.questions = exam.items.map((it, k) => (it.custom ? global.EduCustomExam.toEngineQuestion(it.custom, k) : it.q)).filter(Boolean);
        SRC.key = 'de:' + hashStr(SRC.de);
        box.innerHTML = `<span class="ar-de-ico">📝</span><div><b>${esc(exam.title)}</b><small>Đề giáo viên soạn · ${exam.items.length} câu</small></div>`;
      } catch (e) {
        box.innerHTML = '⚠️ Không mở được link đề. <a href="arena.html">Chơi với ngân hàng câu hỏi</a>';
        SRC.questions = [];
      }
      updateDeckInfo();
      return;
    }
    try {
      [SRC.meta, SRC.manifest] = await Promise.all([getJson('data/ic3/meta.json'), getJson('data/ic3/minitests-manifest.json')]);
    } catch (e) {
      $('arDeckInfo').textContent = '⚠️ Không tải được ngân hàng câu hỏi — kiểm tra mạng rồi tải lại trang.';
      return;
    }
    const cat = $('arCat');
    cat.innerHTML = SRC.meta.categories.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
    if (params.get('cat') && SRC.meta.categories.some((c) => c.id === params.get('cat'))) cat.value = params.get('cat');
    fillLevels(params.get('lvl'));
    if (params.get('mt') && [...$('arMt').options].some((o) => o.value === params.get('mt'))) $('arMt').value = params.get('mt');
    cat.addEventListener('change', () => { fillLevels(); bankChanged(); });
    $('arLvl').addEventListener('change', () => { fillMts(); bankChanged(); });
    $('arMt').addEventListener('change', bankChanged);
    bankChanged();
  }
  function curCat() { return SRC.meta.categories.find((c) => c.id === $('arCat').value); }
  function fillLevels(want) {
    const lv = $('arLvl');
    lv.innerHTML = (curCat()?.levels || []).map((l) => `<option value="${esc(l.id)}">${esc(l.name)}</option>`).join('');
    if (want && [...lv.options].some((o) => o.value === want)) lv.value = want;
    fillMts();
  }
  function fillMts() {
    const lv = curCat()?.levels.find((l) => l.id === $('arLvl').value);
    const names = Object.keys(lv?.minitests || {});
    const num = (n) => parseInt((n.match(/\d+/) || [0])[0], 10);
    const topics = names.filter((n) => !LESSON_RE.test(n) && !BAI_RE.test(n));
    const bai = names.filter((n) => BAI_RE.test(n)).sort((a, b) => num(a) - num(b));
    const lessons = names.filter((n) => LESSON_RE.test(n)).sort((a, b) => num(a) - num(b));
    const grp = (label, list) => (list.length ? `<optgroup label="${esc(label)}">${list.map((n) => `<option value="${esc(n)}">${esc(n)}</option>`).join('')}</optgroup>` : '');
    $('arMt').innerHTML = (topics.length > 1 ? `<option value="${ALL}">🎲 Trộn mọi chủ đề</option>` : '')
      + grp('Theo tên bài', bai) + grp('Theo chủ đề', topics) + grp('Ôn tập cuối kỳ', lessons);
  }
  let loadSeq = 0;
  async function bankChanged() {
    const seq = ++loadSeq;
    const cat = $('arCat').value, lvl = $('arLvl').value, mt = $('arMt').value;
    SRC.key = `${cat}|${lvl}|${mt}`;
    SRC.questions = null;
    $('arDeckInfo').textContent = 'Đang tải câu hỏi...';
    const files = SRC.manifest[`${cat}__${lvl}`] || {};
    const lv = curCat()?.levels.find((l) => l.id === lvl);
    const names = mt === ALL ? Object.keys(lv?.minitests || {}).filter((n) => !LESSON_RE.test(n) && !BAI_RE.test(n)) : [mt];
    const lists = await Promise.all(names.map((n) => (files[n] ? getJson('data/ic3/' + files[n]).catch(() => []) : [])));
    if (seq !== loadSeq) return; // người dùng đã chọn bài khác
    SRC.questions = lists.flat();
    updateDeckInfo();
  }
  function playableCount() { return C.buildDeck(SRC.questions || [], C.rngFrom(1)).length; }
  function updateDeckInfo() {
    if (!SRC.questions) return;
    const n = playableCount();
    $('arDeckInfo').textContent = n ? `${n} câu chơi được (trắc nghiệm 1 đáp án và Đúng/Sai).` : '⚠️ Bộ này không có câu trắc nghiệm 1 đáp án / Đúng/Sai — chọn bài khác.';
    $('arPlay').disabled = !n;
  }
  function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }

  // ============================================================
  // MÀN CHỌN
  // ============================================================
  function chipGroup(id, key, parse) {
    const box = $(id);
    const paint = () => box.querySelectorAll('button').forEach((b) => b.classList.toggle('is-on', parse(b.dataset.v) === S.prefs[key]));
    box.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      S.prefs[key] = parse(b.dataset.v); save(); paint(); sfx('click');
    });
    paint();
  }
  function paintModes() {
    document.querySelectorAll('.ar-mode').forEach((b) => {
      const on = b.dataset.mode === S.prefs.mode;
      b.classList.toggle('is-on', on); b.setAttribute('aria-checked', on);
    });
    $('arSecs').closest('.ar-field').hidden = S.prefs.mode === 'gold'; // Săn vàng không giới hạn giờ (như Blooket)
  }
  function initHome() {
    $('arNick').value = S.last;
    $('arNick').addEventListener('change', () => { S.last = $('arNick').value.trim().slice(0, 24); save(); refreshWallet(); });
    $('arModes').addEventListener('click', (e) => { const b = e.target.closest('.ar-mode'); if (!b) return; S.prefs.mode = b.dataset.mode; save(); paintModes(); sfx('click'); });
    if (['speed', 'gold', 'race'].includes(params.get('mode'))) S.prefs.mode = params.get('mode');
    paintModes();
    chipGroup('arCount', 'count', Number);
    chipGroup('arLevel', 'level', String);
    chipGroup('arSecs', 'secs', Number);
    $('arPlay').addEventListener('click', start);
    $('arAvatarBtn').addEventListener('click', () => openPacks());
    $('arOpenPacks').addEventListener('click', () => openPacks());
    document.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => {
      if (b.dataset.go === 'packs') openPacks(); else { show('arHome'); refreshWallet(); }
    }));
  }

  // ============================================================
  // LINH VẬT
  // ============================================================
  function openPacks() {
    S.last = $('arNick').value.trim().slice(0, 24); save();
    renderPacks();
    $('arReveal').hidden = true;
    show('arPacks');
  }
  function renderPacks() {
    const p = profile();
    refreshWallet();
    $('arPackList').innerHTML = C.PACKS.map((pk) => {
      const own = pk.blooks.filter((b) => p.owned[b.id]).length;
      return `<button type="button" class="ar-pack" data-pack="${pk.id}" ${p.coins < C.PACK_PRICE ? 'disabled' : ''}>
        <span class="ar-pack-ico" aria-hidden="true">${pk.icon}</span><b>${esc(pk.name)}</b>
        <small>${own}/${pk.blooks.length} đã có</small><span class="ar-price">🪙 ${C.PACK_PRICE}</span></button>`;
    }).join('');
    const total = C.PACKS.reduce((s, pk) => s + pk.blooks.length, 0);
    const owned = Object.keys(p.owned).length;
    $('arCollCount').textContent = `${owned}/${total}`;
    $('arCollection').innerHTML = C.PACKS.map((pk) => `<h3 class="ar-h3">${pk.icon} ${esc(pk.name)}</h3><div class="ar-blooks">${pk.blooks.map((b) => {
      const has = p.owned[b.id];
      return `<button type="button" class="ar-blook r-${b.rarity}${has ? '' : ' is-locked'}${p.avatar === b.id ? ' is-avatar' : ''}" data-blook="${has ? b.id : ''}"
        title="${has ? esc(b.name) + ' · ' + C.RARITY[b.rarity].label + (has > 1 ? ' · x' + has : '') : 'Chưa có — ' + C.RARITY[b.rarity].label}" ${has ? '' : 'disabled'}>
        <span class="ar-blook-emoji">${has ? b.emoji : '❔'}</span><small>${has ? esc(b.name) : C.RARITY[b.rarity].label}</small></button>`;
    }).join('')}</div>`).join('');
  }
  function initPacks() {
    $('arPackList').addEventListener('click', (e) => {
      const b = e.target.closest('[data-pack]');
      if (!b || b.disabled) return;
      const res = C.buyPack(profile(), b.dataset.pack, rng);
      if (!res.ok) { toast('Chưa đủ xu — chơi thêm vài ván nhé!'); return; }
      save();
      const r = $('arReveal');
      r.hidden = false;
      r.className = 'ar-reveal is-shaking';
      r.innerHTML = '<span class="ar-egg" aria-hidden="true">🥚</span><p>Đang mở hộp...</p>';
      sfx('flip');
      setTimeout(() => {
        r.className = `ar-reveal is-open r-${res.blook.rarity}`;
        r.innerHTML = `<span class="ar-reveal-emoji">${res.blook.emoji}</span><b>${esc(res.blook.name)}</b>
          <span class="ar-rarity">${C.RARITY[res.blook.rarity].label}</span>
          <small>${res.dupe ? `Đã có rồi — hoàn lại 🪙 ${res.refund}` : 'Linh vật mới!'}</small>`;
        sfx(['legendary', 'mystery'].includes(res.blook.rarity) ? 'critical' : 'match');
        if (['epic', 'legendary', 'mystery'].includes(res.blook.rarity) && global.EduFX) global.EduFX.confetti({ count: 90 });
        renderPacks();
      }, 900);
    });
    $('arCollection').addEventListener('click', (e) => {
      const b = e.target.closest('[data-blook]');
      if (!b || !b.dataset.blook) return;
      profile().avatar = b.dataset.blook; save();
      renderPacks();
      toast('Đã đổi Linh vật đại diện ' + C.blookById(b.dataset.blook).emoji);
    });
  }

  // ============================================================
  // TRẬN ĐẤU
  // ============================================================
  let G = null;
  const MODE_LABEL = { speed: '⚡ Tốc độ', gold: '💰 Săn vàng', race: '🏁 Đua về đích' };
  const KEY_OF = { speed: 'score', gold: 'gold', race: 'pos' };

  function start() {
    S.last = $('arNick').value.trim().slice(0, 24); save();
    const deck = C.buildDeck(SRC.questions || [], rng);
    if (!deck.length) return;
    const mode = S.prefs.mode;
    const n = mode === 'speed' ? Math.min(S.prefs.count, deck.length) : S.prefs.count;
    const p = profile();
    const me = { id: 'me', name: nickName(), face: avatarOf(p), score: 0, gold: 0, pos: 0, streak: 0, me: true };
    const players = [me].concat(C.makeBots(mode === 'race' ? 3 : 4, rng, S.prefs.level));
    const bestKey = `${SRC.key}|${mode}|${n}`;
    const best = p.best[bestKey] || null;
    let ghost = null;
    if (mode === 'speed' && best && best.trail) {
      ghost = { id: 'ghost', name: 'Kỷ lục của em', face: '👻', score: 0, ghost: true, bot: true };
      players.push(ghost);
    }
    G = {
      mode, deck, n, i: 0, players, me, ghost, best, bestKey,
      limitMs: mode === 'gold' ? 0 : S.prefs.secs * 1000,
      goal: n, maxRounds: mode === 'race' ? n * 3 : n,
      log: [], trail: [], bestStreak: 0, correct: 0, startedAt: Date.now(), locked: false, phase: 'q',
    };
    $('arTrack').hidden = mode !== 'race';
    $('arTimerWrap').hidden = !G.limitMs;
    document.body.dataset.mode = mode;
    show('arGame');
    sfx('click');
    nextQuestion();
  }

  function cur() { return G.deck[G.i % G.deck.length]; }

  function nextQuestion() {
    G.phase = 'q'; G.locked = false;
    const q = cur();
    $('arQNum').textContent = G.mode === 'race' ? `Câu ${G.i + 1}` : `Câu ${G.i + 1}/${G.maxRounds}`;
    $('arQ').textContent = q.text;
    const img = $('arQImg');
    if (q.img) { img.src = q.img; img.hidden = false; } else { img.hidden = true; img.removeAttribute('src'); }
    $('arAnswers').className = 'ar-answers n' + q.options.length;
    $('arAnswers').innerHTML = q.options.map((o, k) => `<button type="button" class="ar-ans c${k}" data-k="${k}">
      <span class="ar-shape" aria-hidden="true">${SHAPES[k]}</span><span class="ar-ans-text">${esc(o)}</span><kbd>${k + 1}</kbd></button>`).join('');
    $('arFeedback').hidden = true;
    renderHud(); renderSide(); renderTrack();
    G.qStart = performance.now();
    startTimer();
  }

  function startTimer() {
    clearInterval(G.timer);
    if (!G.limitMs) return;
    const bar = $('arTimer');
    G.timer = setInterval(() => {
      const left = Math.max(0, 1 - (performance.now() - G.qStart) / G.limitMs);
      bar.style.width = (left * 100) + '%';
      bar.classList.toggle('is-low', left < 0.25);
      if (left <= 0) answer(null);
    }, 100);
  }

  function answer(k) {
    if (!G || G.locked || G.phase !== 'q') return;
    G.locked = true;
    clearInterval(G.timer);
    const q = cur();
    const ms = Math.min(G.limitMs || Infinity, performance.now() - G.qStart);
    const ok = k === q.correctIdx;
    const me = G.me;
    G.log.push({ q, chosen: k, ok });
    if (ok) { G.correct++; me.streak++; G.bestStreak = Math.max(G.bestStreak, me.streak); } else if (G.mode !== 'race') me.streak = 0;
    document.querySelectorAll('.ar-ans').forEach((b) => {
      const kk = +b.dataset.k;
      b.disabled = true;
      b.classList.toggle('is-correct', kk === q.correctIdx);
      b.classList.toggle('is-wrong', kk === k && !ok);
      b.classList.toggle('is-dim', kk !== q.correctIdx && kk !== k);
    });
    sfx(ok ? (me.streak >= 3 ? 'combo' : 'correct') : 'wrong');
    if (!ok && global.EduFX) global.EduFX.shake($('arAnswers'));

    const prevRank = rankOf(me);
    let fb = '';
    if (G.mode === 'speed') {
      const pts = C.speedPoints(ok, ms, G.limitMs);
      const bonus = ok ? C.streakBonus(me.streak) : 0;
      me.score += pts + bonus;
      G.trail.push(me.score);
      botsSpeed();
      fb = ok ? `<b>+${pts + bonus}</b> điểm${bonus ? ` <span class="ar-tag">🔥 chuỗi ${me.streak} +${bonus}</span>` : ''}` : (k === null ? 'Hết giờ!' : 'Chưa đúng');
    } else if (G.mode === 'race') {
      const step = C.raceStep(me, ok, G.goal);
      botsRace();
      fb = ok ? (step === 2 ? '<b>⚡ Tăng tốc! +2 bước</b>' : '<b>+1 bước</b>') : (k === null ? 'Hết giờ — đứng yên' : 'Sai — đứng yên');
    } else {
      fb = ok ? '<b>Chính xác!</b> Chọn 1 rương:' : 'Chưa đúng — không có rương lần này';
    }
    const newRank = rankOf(me);
    const move = G.mode !== 'gold' && newRank < prevRank ? ` <span class="ar-tag up">▲ lên hạng ${newRank}</span>` : '';
    showFeedback(ok, fb + move, q, k);
    renderHud(); renderSide(); renderTrack();
    if (G.mode === 'gold' && ok) { showChests(); return; }
    if (G.mode === 'gold') botsGold([]);
    afterAnswer();
  }

  function showFeedback(ok, html, q, k) {
    const f = $('arFeedback');
    f.hidden = false;
    f.className = 'ar-feedback ' + (ok ? 'is-ok' : 'is-bad');
    f.innerHTML = `<div class="ar-fb-head">${ok ? '✅' : '❌'} ${html}</div>`
      + (!ok ? `<div class="ar-fb-ans">Đáp án đúng: <b>${SHAPES[q.correctIdx]} ${esc(q.options[q.correctIdx])}</b></div>` : '')
      + (!ok && q.expl ? `<div class="ar-fb-expl">💡 ${esc(q.expl)}</div>` : '')
      + '<div class="ar-fb-extra" id="arFbExtra"></div>';
  }

  function afterAnswer() {
    G.phase = 'next';
    const done = G.mode === 'race' ? (G.players.some((p) => p.pos >= G.goal) || G.i + 1 >= G.maxRounds) : G.i + 1 >= G.maxRounds;
    const extra = $('arFbExtra');
    extra.insertAdjacentHTML('beforeend', `<button type="button" class="ar-btn ar-btn-play ar-next" id="arNext">${done ? '🏆 Xem kết quả' : 'Câu tiếp ▶'} <kbd>Enter</kbd></button>`);
    $('arNext').addEventListener('click', next);
    $('arNext').focus({ preventScroll: true });
  }
  function next() {
    if (!G || G.phase !== 'next') return;
    const done = G.mode === 'race' ? (G.players.some((p) => p.pos >= G.goal) || G.i + 1 >= G.maxRounds) : G.i + 1 >= G.maxRounds;
    if (done) { finish(); return; }
    G.i++;
    nextQuestion();
  }

  // ── Bot từng chế độ ──
  function botsSpeed() {
    G.players.forEach((p) => {
      if (p.ghost) { p.score = C.ghostScoreAt(G.best, G.i) || 0; return; }
      if (!p.bot) return;
      const a = C.botAnswer(p, G.limitMs, rng);
      p.streak = a.correct ? p.streak + 1 : 0;
      p.score += C.speedPoints(a.correct, a.ms, G.limitMs) + (a.correct ? C.streakBonus(p.streak) : 0);
    });
  }
  function botsRace() {
    G.players.forEach((p) => { if (p.bot) C.raceStep(p, C.botAnswer(p, G.limitMs, rng).correct, G.goal); });
  }
  /** Mỗi bot trả lời 1 câu; đúng → mở 1 rương ngẫu nhiên (có thể cướp/đổi vàng của em). */
  function botsGold(events) {
    G.players.forEach((p) => {
      if (!p.bot || rng() > p.accuracy) return;
      const chests = C.rollChests(rng);
      const c = chests[Math.floor(rng() * 3)];
      const r = C.applyChest(c, p, G.players);
      if (r.target && r.target.me) {
        events.push(c.kind === 'swap' ? `🔄 ${p.face} ${esc(p.name)} đổi vàng với em!` : `🦝 ${p.face} ${esc(p.name)} lấy ${r.delta} vàng của em!`);
      }
    });
    if (events.length) $('arFbExtra').insertAdjacentHTML('beforeend', `<ul class="ar-events">${events.map((e) => `<li>${e}</li>`).join('')}</ul>`);
    renderHud(); renderSide();
  }

  // ── Rương (Săn vàng) ──
  function showChests() {
    G.phase = 'chest';
    G.chests = C.rollChests(rng);
    $('arFbExtra').innerHTML = `<div class="ar-chests">${G.chests.map((_, k) => `<button type="button" class="ar-chest" data-c="${k}" aria-label="Rương ${k + 1}">
      <span aria-hidden="true">🎁</span><kbd>${k + 1}</kbd></button>`).join('')}</div>`;
    $('arFbExtra').querySelector('.ar-chest').focus({ preventScroll: true });
    $('arFbExtra').querySelectorAll('.ar-chest').forEach((b) => b.addEventListener('click', () => pickChest(+b.dataset.c)));
  }
  function pickChest(k) {
    if (!G || G.phase !== 'chest') return;
    G.phase = 'chosen';
    const c = G.chests[k];
    const r = C.applyChest(c, G.me, G.players);
    const boxes = $('arFbExtra').querySelectorAll('.ar-chest');
    G.chests.forEach((ch, j) => {
      const L = C.chestLabel(ch);
      boxes[j].disabled = true;
      boxes[j].classList.add(j === k ? 'is-picked' : 'is-other');
      boxes[j].innerHTML = `<span aria-hidden="true">${L.icon}</span><small>${esc(L.title)}</small>`;
    });
    const L = C.chestLabel(c);
    const who = r.target ? ` ${r.target.face} ${esc(r.target.name)}` : '';
    const msg = c.kind === 'steal' && r.target ? `${L.icon} Em lấy ${r.delta} vàng của${who}!`
      : c.kind === 'swap' && r.target ? `🔄 Em đổi vàng với${who}!`
      : c.kind === 'swap' ? '🔄 Em đang giàu nhất — không đổi được'
      : `${L.icon} ${L.title}${r.delta ? ` (${r.delta > 0 ? '+' : ''}${r.delta})` : ''}`;
    $('arFbExtra').insertAdjacentHTML('beforeend', `<p class="ar-chest-msg ${r.delta >= 0 ? 'up' : 'down'}">${msg}</p>`);
    sfx(r.delta > 0 ? (c.kind === 'mult' ? 'critical' : 'match') : r.delta < 0 ? 'lose' : 'flip');
    if (c.kind === 'mult' && c.factor === 3 && global.EduFX) global.EduFX.confetti({ count: 60 });
    botsGold([]);
    afterAnswer();
  }

  // ── Bảng xếp hạng / HUD / đường đua ──
  function rankOf(p) { return C.rank(G.players, KEY_OF[G.mode]).indexOf(p) + 1; }
  function renderHud() {
    const me = G.me;
    $('arStat').innerHTML = G.mode === 'speed' ? `⭐ ${me.score.toLocaleString('vi-VN')} điểm`
      : G.mode === 'gold' ? `🪙 ${me.gold.toLocaleString('vi-VN')} vàng` : `🏁 ${me.pos}/${G.goal} bước`;
    const s = $('arStreak');
    s.hidden = me.streak < 2;
    s.textContent = `🔥 Chuỗi ${me.streak}`;
  }
  function renderSide() {
    const key = KEY_OF[G.mode];
    const unit = { score: 'điểm', gold: 'vàng', pos: 'bước' }[key];
    $('arSide').innerHTML = `<h3>${MODE_LABEL[G.mode]}</h3><ol class="ar-board">${C.rank(G.players, key).map((p, i) => `<li class="${p.me ? 'is-me' : ''}${p.ghost ? ' is-ghost' : ''}">
      <span class="ar-board-rank">${i + 1}</span><span class="ar-board-face">${p.face}</span>
      <span class="ar-board-name">${esc(p.name)}</span><b>${p[key].toLocaleString('vi-VN')}</b><small>${unit}</small></li>`).join('')}</ol>`;
  }
  function renderTrack() {
    if (G.mode !== 'race') return;
    $('arTrack').innerHTML = G.players.map((p) => `<div class="ar-lane${p.me ? ' is-me' : ''}">
      <span class="ar-lane-name">${esc(p.name)}</span>
      <div class="ar-lane-road"><span class="ar-runner" style="left:calc(${(p.pos / G.goal) * 100}% - ${(p.pos / G.goal) * 2}rem)">${p.face}</span><span class="ar-flag" aria-hidden="true">🏁</span></div></div>`).join('');
  }

  // ── Kết thúc ──
  function finish() {
    clearInterval(G.timer);
    const key = KEY_OF[G.mode];
    const ranked = C.rank(G.players.filter((p) => !p.ghost), key);
    const place = ranked.indexOf(G.me) + 1;
    const total = G.log.length;
    const p = profile();
    const coins = C.coinsFor({ correct: G.correct, place, players: ranked.length });
    p.coins += coins;
    p.games = (p.games || 0) + 1;
    const value = G.me[key];
    const old = p.best[G.bestKey];
    const record = !old || value > old.value;
    if (record) p.best[G.bestKey] = { value, at: Date.now(), trail: G.mode === 'speed' ? G.trail.slice(0, 40) : undefined };
    save();
    try {
      global.EduGamification && global.EduGamification.recordGameSession('arena-' + G.mode, {
        score: total ? Math.round((G.correct / total) * 100) : 0, scoreType: 'percent', accuracy: total ? Math.round((G.correct / total) * 100) : 0,
        correctAnswers: G.correct, wrongAnswers: total - G.correct, durationSec: Math.round((Date.now() - G.startedAt) / 1000), showReward: false,
      });
    } catch (e) { /* XP chỉ là phần thêm */ }

    $('arEndTitle').textContent = place === 1 ? `🏆 ${nickName()} vô địch ${MODE_LABEL[G.mode]}!` : `${MODE_LABEL[G.mode]} — em về hạng ${place}/${ranked.length}`;
    const top = ranked.slice(0, 3);
    const order = [1, 0, 2].filter((i) => top[i]);
    const unit = { score: 'điểm', gold: 'vàng', pos: 'bước' }[key];
    $('arPodium').innerHTML = order.map((i) => `<div class="ar-pod p${i + 1}${top[i].me ? ' is-me' : ''}" style="--d:${(2 - i) * 0.35}s">
      <span class="ar-pod-face">${top[i].face}</span><b class="ar-pod-name">${esc(top[i].name)}</b>
      <span class="ar-pod-val">${top[i][key].toLocaleString('vi-VN')} ${unit}</span><div class="ar-pod-block">${i + 1}</div></div>`).join('');
    $('arEndStats').innerHTML = `
      <div><b>${G.correct}/${total}</b><span>câu đúng</span></div>
      <div><b>${G.bestStreak}</b><span>chuỗi đúng dài nhất</span></div>
      <div><b>${value.toLocaleString('vi-VN')}</b><span>${unit}${record && old ? ' · <em>kỷ lục mới!</em>' : ''}</span></div>
      <div class="is-coin"><b>+${coins} 🪙</b><span>xu (đang có ${p.coins})</span></div>`;
    const wrong = G.log.filter((x) => !x.ok);
    const rv = $('arReview');
    rv.hidden = !wrong.length;
    rv.open = false;
    rv.innerHTML = `<summary>📒 Xem lại ${wrong.length} câu sai</summary><ol>${wrong.map((x) => `<li><b>${esc(x.q.text)}</b>
      <span>Đáp án: ${esc(x.q.options[x.q.correctIdx])}${x.chosen !== null && x.chosen !== undefined ? ` · em chọn: ${esc(x.q.options[x.chosen])}` : ' · hết giờ'}</span>
      ${x.q.expl ? `<small>💡 ${esc(x.q.expl)}</small>` : ''}</li>`).join('')}</ol>`;
    show('arEnd');
    refreshWallet();
    sfx(place === 1 ? 'win' : place <= 3 ? 'match' : 'lose');
    if (place === 1 && global.EduFX) global.EduFX.confetti({ count: 120 });
    G.phase = 'end';
  }

  function quit() {
    if (!G || G.phase === 'end') return;
    if (!confirm('Bỏ cuộc trận này? Em sẽ không nhận được xu.')) return;
    clearInterval(G.timer);
    G = null;
    show('arHome');
  }

  // ============================================================
  // PHÍM TẮT + KHỞI ĐỘNG
  // ============================================================
  document.addEventListener('keydown', (e) => {
    if (!G || $('arGame').hidden || /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
    const n = parseInt(e.key, 10);
    if (G.phase === 'q' && n >= 1 && n <= cur().options.length) { e.preventDefault(); answer(n - 1); }
    else if (G.phase === 'chest' && n >= 1 && n <= 3) { e.preventDefault(); pickChest(n - 1); }
    else if (G.phase === 'next' && (e.key === 'Enter' || e.key === ' ') && e.target.id !== 'arNext') { e.preventDefault(); next(); }
  });
  $('arAnswers').addEventListener('click', (e) => { const b = e.target.closest('.ar-ans'); if (b) answer(+b.dataset.k); });
  $('arQuit').addEventListener('click', quit);
  $('arAgain').addEventListener('click', start);
  $('arSound').addEventListener('click', () => {
    if (!global.EduSFX) return;
    global.EduSFX.toggleMuted();
    paintSound();
  });
  function paintSound() { $('arSound').innerHTML = `<i class="fa-solid ${global.EduSFX && global.EduSFX.isMuted() ? 'fa-volume-xmark' : 'fa-volume-high'}"></i>`; }
  $('arTheme').addEventListener('click', () => {
    const dark = document.documentElement.getAttribute('data-theme') !== 'dark';
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    try { localStorage.setItem('ic3_theme', dark ? 'dark' : 'light'); } catch (e) { /* ignore */ }
  });

  paintSound();
  initHome();
  initPacks();
  refreshWallet();
  initSource();

  global.EduArena = { _state: () => G, _store: () => S };
})(window);
