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
  const K = global.EduArenaKinds;
  const FX = global.EduArenaFX;
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
    document.querySelectorAll('.ar-screen').forEach((el) => { el.hidden = el.id !== screen; });
    global.scrollTo(0, 0);
    $('arMain').focus({ preventScroll: true });
  }
  function refreshWallet() {
    $('arCoins').textContent = profile().coins;
    $('arAvatarBtn').textContent = avatarOf(profile());
    $('arJoinAvatarFace').textContent = avatarOf(profile());
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
        SRC.title = exam.title;
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
    SRC.title = [curCat()?.name, curCat()?.levels.find((l) => l.id === lvl)?.name, mt === ALL ? 'Trộn mọi chủ đề' : mt].filter(Boolean).join(' › ');
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
  /** Các dạng câu em/giáo viên chọn chơi (mặc định: tất cả). */
  function kinds() { return (S.prefs.kinds || []).filter((k) => C.KINDS.includes(k)).length ? S.prefs.kinds : C.KINDS; }
  function playableCount() { return C.buildDeck(SRC.questions || [], C.rngFrom(1), 0, kinds()).length; }
  /** Vẽ các chip "Dạng câu hỏi" kèm số câu từng dạng trong bộ đang chọn. */
  function paintKinds() {
    const n = SRC.questions ? C.countKinds(SRC.questions) : null;
    const on = kinds();
    $('arKinds').innerHTML = C.KINDS.map((k) => `<button type="button" data-kind="${k}" class="${on.includes(k) ? 'is-on' : ''}" aria-pressed="${on.includes(k)}"
      ${n && !n[k] ? 'disabled title="Bộ này không có dạng câu này"' : ''}>${C.KIND_ICON[k]} ${C.KIND_LABEL[k]}${n ? ` <small>${n[k]}</small>` : ''}</button>`).join('');
  }
  function updateDeckInfo() {
    if (!SRC.questions) return;
    const n = playableCount();
    paintKinds();
    const info = n ? `${n} câu chơi được với các dạng câu đã chọn.` : '⚠️ Bộ này không có câu thuộc các dạng đã chọn — chọn thêm dạng câu hoặc bài khác.';
    $('arDeckInfo').textContent = info;
    $('arDeckInfoTeacher').textContent = info;
    $('arPlay').disabled = !n;
    document.dispatchEvent(new CustomEvent('arena:deck', { detail: { playable: n } }));
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
  // Vai Giáo viên: Tốc độ / Đua / Sinh tồn / Kéo co / Đấu phép (Phòng cả lớp) + Bảng điểm (trình chiếu, js/arena/arena-board.js).
  // Săn vàng, Câu cá, Giải mã chỉ chơi 1 người → ở vai Giáo viên hiểu là Tốc độ; Bảng điểm ở vai khác cũng vậy.
  const ROOM_MODES = ['speed', 'race', 'survival', 'tug', 'spell', 'heist', 'board'];
  function effMode() {
    const m = S.prefs.mode;
    if (role() === 'teacher') return ROOM_MODES.includes(m) ? m : 'speed';
    return m === 'board' ? 'speed' : m;
  }
  function paintModes() {
    const m = effMode();
    document.querySelectorAll('.ar-mode').forEach((b) => {
      const on = b.dataset.mode === m;
      b.classList.toggle('is-on', on); b.setAttribute('aria-checked', on);
    });
    $('arSecs').closest('.ar-field').hidden = m === 'gold'; // Săn vàng không giới hạn giờ (như Blooket)
  }

  // ============================================================
  // VAI: học sinh / giáo viên / chơi một mình
  // ============================================================
  const ROLES = ['student', 'teacher', 'solo'];
  function role() { return $('arHome').dataset.role; }
  function setRole(r, persist) {
    if (!ROLES.includes(r)) r = 'student';
    $('arHome').dataset.role = r;
    document.querySelectorAll('#arRoles .ar-role').forEach((b) => {
      const on = b.dataset.role === r;
      b.classList.toggle('is-on', on); b.setAttribute('aria-selected', on); b.tabIndex = on ? 0 : -1;
    });
    if (persist) { S.role = r; save(); }
    paintModes();
    document.dispatchEvent(new CustomEvent('arena:role', { detail: { role: r } }));
  }
  /** Mở bằng link giáo viên gửi → chỉ còn ô nhập tên (ẩn thanh chọn vai). */
  function setInvite(on) { $('arHome').classList.toggle('is-invite', !!on); if (on) setRole('student', false); }
  /** Lưu tên đang dùng (họ tên của học sinh hoặc biệt danh chơi một mình) và đồng bộ 2 ô nhập. */
  function setNick(v) {
    S.last = String(v || '').replace(/\s+/g, ' ').trim().slice(0, 30); save();
    // Không viết đè ô đang gõ (sẽ nuốt dấu cách giữa các chữ khi em đang nhập họ tên).
    [$('arNick'), $('arJoinName')].forEach((el) => { if (el !== document.activeElement && el.value.trim() !== S.last) el.value = S.last; });
    refreshWallet();
    return S.last;
  }
  function initRoles() {
    const bar = $('arRoles');
    bar.addEventListener('click', (e) => { const b = e.target.closest('.ar-role'); if (b) { setRole(b.dataset.role, true); sfx('click'); } });
    bar.addEventListener('keydown', (e) => { // ← → đổi vai khi đang ở thanh chọn
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const i = ROLES.indexOf(role()) + (e.key === 'ArrowRight' ? 1 : -1);
      setRole(ROLES[(i + ROLES.length) % ROLES.length], true);
      bar.querySelector('.ar-role.is-on').focus();
    });
    const deep = ['de', 'cat', 'lvl', 'mt', 'mode'].some((k) => params.get(k));
    if (params.get('phong')) setInvite(true);
    else setRole(S.role === 'teacher' ? 'teacher' : deep ? 'solo' : (ROLES.includes(S.role) ? S.role : 'student'), false);
  }
  function initHome() {
    $('arNick').value = S.last;
    // Máy phòng học dùng chung: KHÔNG điền sẵn tên người dùng trước vào ô họ tên của học sinh
    // (chỉ điền khi tải lại trang giữa chừng — xem arena-room.js init).
    $('arJoinName').value = '';
    $('arNick').addEventListener('change', () => { S.last = $('arNick').value.trim().slice(0, 30); save(); refreshWallet(); });
    $('arJoinAvatar').addEventListener('click', () => openPacks());
    initRoles();
    $('arModes').addEventListener('click', (e) => { const b = e.target.closest('.ar-mode'); if (!b) return; S.prefs.mode = b.dataset.mode; save(); paintModes(); sfx('click'); document.dispatchEvent(new CustomEvent('arena:mode')); });
    if (Object.keys(MODE_LABEL).includes(params.get('mode'))) S.prefs.mode = params.get('mode');
    paintModes();
    chipGroup('arCount', 'count', Number);
    chipGroup('arLevel', 'level', String);
    chipGroup('arSecs', 'secs', Number);
    $('arKinds').addEventListener('click', (e) => {
      const b = e.target.closest('[data-kind]');
      if (!b || b.disabled) return;
      const cur = kinds().slice();
      const i = cur.indexOf(b.dataset.kind);
      if (i >= 0) { if (cur.length === 1) { toast('Cần giữ ít nhất 1 dạng câu.'); return; } cur.splice(i, 1); } else cur.push(b.dataset.kind);
      S.prefs.kinds = C.KINDS.filter((k) => cur.includes(k)); save(); sfx('click');
      updateDeckInfo();
    });
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
    const src = role() === 'student' ? $('arJoinName') : $('arNick');
    if (src.value.trim()) setNick(src.value); else { S.last = ''; save(); }
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
  const MODE_LABEL = { speed: '⚡ Tốc độ', gold: '💰 Săn vàng', race: '🏁 Đua về đích', survival: '❤️ Sinh tồn', fish: '🎣 Câu cá',
    tug: '🪢 Kéo co', spell: '🔮 Đấu phép', heist: '🔐 Giải mã' };
  const KEY_OF = { speed: 'score', gold: 'gold', race: 'pos', survival: 'score', fish: 'kg', tug: 'pull', spell: 'dmg', heist: 'gems' };
  const UNIT_OF = { score: 'điểm', gold: 'vàng', pos: 'bước', kg: 'kg', pull: 'lực kéo', dmg: 'sát thương', gems: 'đá quý' };
  const POWER_MODES = ['speed', 'survival']; // chế độ có vật phẩm hỗ trợ (kiểu Wayground)

  /**
   * Vào trận. `drill` (mảng câu từ C.practiceDeck) = lượt "Luyện câu sai": Tốc độ, 1 mình, hết câu là xong,
   * không ghi kỷ lục — chỉ để em sửa lại đúng những câu vừa sai.
   */
  function start(drill) {
    drill = Array.isArray(drill) && drill.length ? drill : null;
    if (!drill) { S.last = $('arNick').value.trim().slice(0, 30); save(); }
    const deck = drill || C.buildDeck(SRC.questions || [], rng, 0, kinds());
    if (!deck.length) return;
    const mode = drill ? 'speed' : effMode();
    const n = drill ? deck.length : mode === 'speed' ? Math.min(S.prefs.count, deck.length) : S.prefs.count;
    const p = profile();
    const me = { id: 'me', name: nickName(), face: avatarOf(p), score: 0, gold: 0, pos: 0, streak: 0, me: true };
    const nBots = { race: 3, heist: 3, tug: 5 }[mode] || 4;
    const players = drill ? [me] : [me].concat(C.makeBots(nBots, rng, S.prefs.level));
    players.forEach((pl, i) => {
      Object.assign(pl, { kg: 0, frenzy: 0, hp: mode === 'spell' ? C.SPELL_HP : C.LIVES, pull: 0, dmg: 0, shield: false, gems: 0 });
      if (mode === 'tug') pl.team = i < 3 ? 'red' : 'blue'; // em + 2 bạn máy (Đỏ) đấu 3 bạn máy (Xanh)
      if (mode === 'heist') pl.vault = C.newVault(rng);
    });
    const bestKey = drill ? '' : `${SRC.key}|${mode}|${n}`;
    const best = (bestKey && p.best[bestKey]) || null;
    let ghost = null;
    if (mode === 'speed' && best && best.trail) {
      ghost = { id: 'ghost', name: 'Kỷ lục của em', face: '👻', score: 0, ghost: true, bot: true };
      players.push(ghost);
    }
    G = {
      mode, deck, n, i: 0, players, me, ghost, best, bestKey, practice: !!drill,
      limitMs: mode === 'gold' ? 0 : S.prefs.secs * 1000,
      goal: n, maxRounds: mode === 'race' ? n * 3 : n,
      log: [], trail: [], bestStreak: 0, correct: 0, startedAt: Date.now(), locked: false, phase: 'q',
      powers: [], x2: false, rope: 0, crack: {}, opened: 0, boost: 1, trackDrawn: false,
    };
    $('arTrack').hidden = mode !== 'race' && mode !== 'tug';
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
    G.picker = null;
    if (C.kindOf(q) === 'choice') {
      $('arAnswers').className = 'ar-answers n' + q.options.length;
      $('arAnswers').innerHTML = q.options.map((o, k) => `<button type="button" class="ar-ans c${k}" data-k="${k}">
        <span class="ar-shape" aria-hidden="true">${SHAPES[k]}</span><span class="ar-ans-text">${esc(o)}</span><kbd>${k + 1}</kbd></button>`).join('');
    } else {
      // Chọn nhiều / Sắp xếp / Ghép đôi — js/arena/arena-kinds.js
      G.picker = K.mount($('arAnswers'), q, { onAnswer: (a) => answer(a) });
    }
    $('arFeedback').hidden = true;
    renderHud(); renderSide(); renderTrack(); renderPowers();
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
    const ok = C.grade(q, k);
    const me = G.me;
    G.log.push({ q, chosen: k, ok });
    if (ok) G.correct++;
    // Chuỗi đúng: Đua (raceStep) và Sinh tồn (survivalStep) tự đếm — tránh cộng 2 lần.
    if (G.mode !== 'race' && G.mode !== 'survival') me.streak = ok ? me.streak + 1 : 0;
    const life = G.mode === 'survival' ? C.survivalStep(me, ok, G.i) : null;
    if (G.picker) G.picker.result(k);
    else document.querySelectorAll('#arAnswers .ar-ans').forEach((b) => {
      const kk = +b.dataset.k;
      b.disabled = true;
      b.classList.toggle('is-correct', kk === q.correctIdx);
      b.classList.toggle('is-wrong', kk === k && !ok);
      b.classList.toggle('is-dim', kk !== q.correctIdx && kk !== k);
    });
    sfx(life && life.out ? 'lose' : ok ? (me.streak >= 3 ? 'combo' : 'correct') : 'wrong');
    if (!ok && global.EduFX) global.EduFX.shake($('arAnswers'));

    const prevRank = rankOf(me);
    let fb = '';
    let pop = ''; // số bay lên từ ô em chọn
    const events = [];
    // Vật phẩm ✖️2: nhân đôi điểm của câu ĐÚNG kế tiếp.
    const dbl = ok && G.x2 ? 2 : 1;
    if (dbl === 2) G.x2 = false;
    const x2Tag = dbl === 2 ? ' <span class="ar-tag up">✖️2 nhân đôi!</span>' : '';
    if (G.mode === 'speed') {
      const pts = C.speedPoints(ok, ms, G.limitMs) * dbl;
      const bonus = ok ? C.streakBonus(me.streak) * dbl : 0;
      me.score += pts + bonus;
      G.trail.push(me.score);
      botsSpeed();
      if (ok) pop = `+${pts + bonus}`;
      fb = ok ? `<b>+${pts + bonus}</b> điểm${bonus ? ` <span class="ar-tag">🔥 chuỗi ${me.streak} +${bonus}</span>` : ''}${x2Tag}` : (k === null ? 'Hết giờ!' : 'Chưa đúng');
    } else if (G.mode === 'survival') {
      const pts = ok ? C.speedPoints(true, ms, G.limitMs) * dbl : 0;
      me.score += pts;
      if (ok) pop = `+${pts}`;
      botsSurvival(events);
      fb = (ok ? `<b>+${pts}</b> điểm${x2Tag}` : (k === null ? 'Hết giờ!' : 'Chưa đúng'))
        + (life.healed ? ' <span class="ar-tag up">💚 Hồi 1 tim!</span>' : '')
        + (life.out ? ' <span class="ar-tag">💀 Hết tim — em bị loại!</span>' : life.lost ? ' <span class="ar-tag">💔 Mất 1 tim</span>' : '')
        + ` <span class="ar-fb-hp">${C.hearts(me.hp)}</span>`;
    } else if (G.mode === 'fish') {
      if (ok) {
        const doubled = me.frenzy > 0;
        const c = C.castLine(rng, me.frenzy);
        me.frenzy = c.frenzy;
        me.kg += c.kg;
        pop = c.kg ? `+${c.kg} kg` : '👢';
        fb = `<span class="ar-catch" aria-hidden="true">${c.fish.icon}</span> Em câu được <b>${esc(c.fish.name)}</b>${c.kg ? ` — <b>+${c.kg} kg</b>` : ' — 0 kg 😅'}`
          + (doubled ? ' <span class="ar-tag up">⚡ x2</span>' : '') + (c.fish.frenzy ? ' <span class="ar-tag up">⚡ Mồi thần!</span>' : '');
        if (c.kg >= 15 && global.EduFX) global.EduFX.confetti({ count: 50 });
      } else fb = k === null ? 'Hết giờ — cá sổng mất 🎣' : 'Chưa đúng — cá sổng mất 🎣';
      botsFish(events);
    } else if (G.mode === 'race') {
      const step = C.raceStep(me, ok, G.goal);
      if (ok) pop = step === 2 ? '⚡ +2' : '+1';
      botsRace();
      fb = ok ? (step === 2 ? '<b>⚡ Tăng tốc! +2 bước</b>' : '<b>+1 bước</b>') : (k === null ? 'Hết giờ — đứng yên' : 'Sai — đứng yên');
    } else if (G.mode === 'tug') {
      const pull = C.tugPull(ok, ms, G.limitMs);
      me.pull += pull;
      if (ok) pop = pull === 2 ? '💪 +2' : '+1';
      const st = botsTug(pull);
      fb = (ok ? `<b>+${pull}</b> lực kéo${pull === 2 ? ' <span class="ar-tag up">⚡ nhanh — kéo gấp đôi</span>' : ''}` : (k === null ? 'Hết giờ — đội em hụt 1 nhịp' : 'Chưa đúng — đội em hụt 1 nhịp'))
        + ` <span class="ar-tag${st.delta > 0 ? ' up' : ''}">${st.delta > 0 ? `Dây dịch về Đội Đỏ ${st.delta} vạch` : st.delta < 0 ? `Dây dịch về Đội Xanh ${-st.delta} vạch` : 'Dây đứng yên'}</span>`;
    } else if (G.mode === 'spell' || G.mode === 'heist') {
      G.boost = C.spellBoost(ms, G.limitMs);
      const fast = G.boost >= 1.25 ? ` <span class="ar-tag up">⚡ nhanh ×${G.boost.toFixed(1)}</span>` : '';
      fb = ok ? `<b>Chính xác!</b> ${G.mode === 'spell' ? 'Chọn 1 phép' : 'Chọn việc làm'}${fast}:` : `${k === null ? 'Hết giờ' : 'Chưa đúng'} — mất lượt này`;
    } else {
      fb = ok ? '<b>Chính xác!</b> Chọn 1 rương:' : 'Chưa đúng — không có rương lần này';
    }
    G.bestStreak = Math.max(G.bestStreak, me.streak);
    const newRank = rankOf(me);
    const move = G.mode !== 'gold' && newRank < prevRank ? ` <span class="ar-tag up">▲ lên hạng ${newRank}</span>` : '';
    // Kiểu Wayground: đúng liền 3 câu → nhận 1 vật phẩm hỗ trợ.
    const got = ok && POWER_MODES.includes(G.mode) ? C.earnPowerup(G.powers, me.streak, rng) : '';
    const gotTag = got ? ` <span class="ar-tag up">🎁 Nhận ${C.POWERUPS[got].icon} ${C.POWERUPS[got].name}</span>` : '';
    showFeedback(ok, fb + move + gotTag, q, k);
    if (events.length) $('arFbExtra').insertAdjacentHTML('beforeend', `<ul class="ar-events">${events.map((e) => `<li>${e}</li>`).join('')}</ul>`);
    renderHud(); renderSide(); renderTrack(); renderPowers();
    answerFx(q, k, ok, pop, life, newRank < prevRank);
    if (G.mode === 'gold' && ok) { showChests(); return; }
    if (G.mode === 'spell' && ok) { showSpells(); return; }
    if (G.mode === 'heist' && ok) { showHeist(); return; }
    if (G.mode === 'gold') botsGold([]);
    if (G.mode === 'spell') botsSpell();
    if (G.mode === 'heist') botsHeist();
    afterAnswer();
  }

  /** Hiệu ứng sau khi chấm: ô đúng nảy, số bay lên từ ô em chọn, HUD nảy/đỏ/xanh theo kết quả. */
  function answerFx(q, k, ok, pop, life, rankUp) {
    const tile = Number.isInteger(k) ? document.querySelector(`#arAnswers .ar-ans[data-k="${k}"]`) : $('arAnswers').querySelector('.ar-kind-go');
    if (ok) {
      FX.flash(C.kindOf(q) === 'choice' ? document.querySelector(`#arAnswers .ar-ans[data-k="${q.correctIdx}"]`) : $('arAnswers'), 'fx-correct');
      if (pop) FX.float(tile || $('arAnswers'), pop, 'up');
      FX.flash($('arStat'), 'fx-bump');
      if (G.me.streak >= 3) FX.flash($('arStreak'), 'fx-fire');
    }
    if (life && life.lost) FX.flash($('arStat'), 'fx-hit');
    if (life && life.healed) { FX.flash($('arStat'), 'fx-heal'); FX.float($('arStat'), '💚 +1', 'heal'); }
    const fish = $('arFeedback').querySelector('.ar-catch');
    if (fish && ok) FX.burst(fish, ['💦', '💧'], 7);
    if (rankUp) FX.flash($('arSide').querySelector('li.is-me'), 'fx-rankup');
  }

  /** "Đáp án đúng: ..." — câu chọn 1 hiện 1 dòng; dạng khác hiện danh sách + "em đúng 2/4". */
  function answerHtml(q, k) {
    if (C.kindOf(q) === 'choice') return `<div class="ar-fb-ans">Đáp án đúng: <b>${SHAPES[q.correctIdx]} ${esc(q.options[q.correctIdx])}</b></div>`;
    const part = C.partial(q, k);
    const unit = { multi: 'đáp án', order: 'bước', match: 'cặp' }[C.kindOf(q)];
    return `<div class="ar-fb-ans">${k !== null && k !== undefined ? `<span class="ar-tag">em đúng ${part.right}/${part.of} ${unit}</span> ` : ''}Đáp án đúng:
      <ul class="ar-fb-list">${C.answerLines(q).map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>`;
  }
  function showFeedback(ok, html, q, k) {
    const f = $('arFeedback');
    f.hidden = false;
    f.className = 'ar-feedback ' + (ok ? 'is-ok' : 'is-bad');
    f.innerHTML = `<div class="ar-fb-head">${ok ? '✅' : '❌'} ${html}</div>`
      + (!ok ? answerHtml(q, k) : '')
      + (!ok && q.expl ? `<div class="ar-fb-expl">💡 ${esc(q.expl)}</div>` : '')
      + '<div class="ar-fb-extra" id="arFbExtra"></div>';
  }

  function afterAnswer() {
    G.phase = 'next';
    const done = isOver();
    const extra = $('arFbExtra');
    extra.insertAdjacentHTML('beforeend', `<button type="button" class="ar-btn ar-btn-play ar-next" id="arNext">${done ? '🏆 Xem kết quả' : 'Câu tiếp ▶'} <kbd>Enter</kbd></button>`);
    $('arNext').addEventListener('click', next);
    $('arNext').focus({ preventScroll: true });
  }
  function next() {
    if (!G || G.phase !== 'next') return;
    if (isOver()) { finish(); return; }
    G.i++;
    nextQuestion();
  }

  function isOver() {
    if (G.i + 1 >= G.maxRounds) return true;
    if (G.mode === 'race') return G.players.some((p) => p.pos >= G.goal);
    // Sinh tồn: em hết tim, hoặc mọi đối thủ đã bị loại (lượt 1 mình → chơi hết câu).
    if (G.mode === 'survival') return G.me.hp <= 0 || (G.players.length > 1 && G.players.every((p) => p.me || p.hp <= 0));
    if (G.mode === 'spell') return G.me.hp <= 0 || G.players.every((p) => p.me || p.hp <= 0);
    if (G.mode === 'tug') return Math.abs(G.rope) >= C.TUG_GOAL;
    return false;
  }

  // ── Vật phẩm hỗ trợ (kiểu Wayground) ──
  function renderPowers() {
    const box = $('arPowers');
    box.hidden = !G || !POWER_MODES.includes(G.mode) || (!G.powers.length && !G.x2);
    if (box.hidden) return;
    box.innerHTML = G.powers.map((id, i) => {
      const P = C.POWERUPS[id];
      return `<button type="button" class="ar-power p-${id}" data-pw="${i}" title="${esc(P.tip)}" ${G.phase === 'q' ? '' : 'disabled'}>
        <span aria-hidden="true">${P.icon}</span><b>${esc(P.name)}</b></button>`;
    }).join('') + (G.x2 ? '<span class="ar-tag up ar-power-on">✖️2 đang bật — câu đúng kế tiếp gấp đôi</span>' : '');
  }
  function usePower(i) {
    if (!G || G.phase !== 'q' || G.locked) return;
    const id = G.powers[i];
    if (!id) return;
    if (id === 'fifty') {
      const hide = C.fiftyFifty(cur(), rng);
      if (!hide.length) { toast(C.kindOf(cur()) === 'choice' ? 'Câu này chỉ có 2 lựa chọn — để dành 50:50 cho câu sau nhé.' : '50:50 chỉ dùng cho câu chọn 1 đáp án — để dành cho câu sau nhé.'); return; }
      hide.forEach((k) => { const b = document.querySelector(`.ar-ans[data-k="${k}"]`); if (b) { b.disabled = true; b.classList.add('is-gone'); } });
    } else if (id === 'time') {
      if (!G.limitMs) return;
      G.qStart = Math.min(performance.now(), G.qStart + G.limitMs / 2);
    } else if (id === 'x2') {
      if (G.x2) { toast('✖️2 đang bật rồi — trả lời đúng để dùng nhé.'); return; }
      G.x2 = true;
    }
    G.powers.splice(i, 1);
    sfx('critical');
    renderPowers();
  }

  // ── Bot từng chế độ ──
  function botsSurvival(events) {
    G.players.forEach((p) => {
      if (!p.bot || p.hp <= 0) return;
      const a = C.botAnswer(p, G.limitMs, rng);
      const st = C.survivalStep(p, a.correct, G.i);
      if (a.correct) p.score += C.speedPoints(true, a.ms, G.limitMs);
      if (st.out) events.push(`💀 ${p.face} ${esc(p.name)} hết tim — bị loại!`);
    });
  }
  function botsFish(events) {
    G.players.forEach((p) => {
      if (!p.bot || rng() > p.accuracy) return;
      const c = C.castLine(rng, p.frenzy);
      p.frenzy = c.frenzy;
      p.kg += c.kg;
      if (c.kg >= 15) events.push(`${c.fish.icon} ${p.face} ${esc(p.name)} câu được ${esc(c.fish.name)} ${c.kg} kg!`);
    });
  }
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
    // Rương mở: vàng bùng ra (được) hoặc ô đỏ rung (mất); lấy/đổi của bạn → vàng bay từ dòng bạn đó về em.
    if (r.delta > 0) { FX.float(boxes[k], `+${r.delta}`, 'gold'); FX.burst(boxes[k], ['🪙', '✨'], c.kind === 'mult' ? 12 : 7); }
    else if (r.delta < 0) { FX.float(boxes[k], `${r.delta}`, 'down'); FX.flash(boxes[k], 'fx-wrong'); }
    if (r.target && r.delta > 0) for (let n = 0; n < 4; n++) FX.fly(anchorOf(r.target), $('arStat'), '🪙', { delay: n * 90, ms: 550 });
    FX.flash($('arStat'), r.delta < 0 ? 'fx-hit' : 'fx-bump');
    sfx(r.delta > 0 ? (c.kind === 'mult' ? 'critical' : 'match') : r.delta < 0 ? 'lose' : 'flip');
    if (c.kind === 'mult' && c.factor === 3 && global.EduFX) global.EduFX.confetti({ count: 60 });
    botsGold([]);
    afterAnswer();
  }

  // ── Kéo co ──
  /** Bạn máy cùng trả lời câu này (em ở Đội Đỏ). Dịch dây và trả { rope, delta }. */
  function botsTug(myPull) {
    const pulls = { red: [], blue: [] };
    G.players.forEach((p) => {
      let pull = myPull;
      if (p.bot) { const a = C.botAnswer(p, G.limitMs, rng); pull = C.tugPull(a.correct, a.ms, G.limitMs); p.pull += pull; }
      pulls[p.team].push(pull);
    });
    const st = C.tugStep(G.rope, pulls.red, pulls.blue);
    G.rope = st.rope;
    return st;
  }
  /** Sợi dây kéo co (dùng chung với Phòng cả lớp). rope > 0 = nghiêng về Đội Đỏ (bên trái). from: vẽ nút dây ở vị trí cũ rồi EduArenaFX.settle() trượt tới. */
  function ropeHtml(rope, red, blue, from) {
    const side = (t, list) => `<div class="ar-rope-team is-${t}"><b>${C.TEAMS[t].icon} ${C.TEAMS[t].name}</b><small>${list}</small></div>`;
    const lean = rope > 0 ? `nghiêng về Đội Đỏ ${rope}/${C.TUG_GOAL}` : rope < 0 ? `nghiêng về Đội Xanh ${-rope}/${C.TUG_GOAL}` : 'đang cân bằng';
    return `<div class="ar-rope" role="img" aria-label="Dây kéo co ${lean}">${side('red', red)}
      <div class="ar-rope-field"><span class="ar-rope-line"></span><span class="ar-rope-mid" aria-hidden="true"></span>
        <span class="ar-rope-knot" data-rope="${rope}" style="left:${50 - (from ?? rope) / 2}%"${from !== undefined && from !== rope ? ` data-to="${50 - rope / 2}%"` : ''} aria-hidden="true"></span></div>${side('blue', blue)}</div>`;
  }

  // ── Chọn trong khung phản hồi (phép / mục tiêu / việc làm / ký hiệu) — phím 1..n bấm ô data-hot ──
  // Mỗi bước chỉ giữ 1 hàng nút (bước trước bị gỡ) để khung không dài ra; dòng kết quả (.ar-chest-msg) thì giữ lại.
  function lockPicks() { $('arFbExtra').querySelectorAll('.ar-pick, .ar-pick-prompt').forEach((el) => el.remove()); }
  function pickRow(cls, items, prompt) {
    lockPicks();
    if (prompt) $('arFbExtra').insertAdjacentHTML('beforeend', `<p class="ar-chest-msg up ar-pick-prompt">${prompt}</p>`);
    $('arFbExtra').insertAdjacentHTML('beforeend', `<div class="ar-chests ar-pick ${cls}">${items.map((it, k) => `<button type="button" class="ar-chest${it.cls ? ' ' + it.cls : ''}" data-hot="${k + 1}" ${it.off ? 'disabled' : ''}>
      <span aria-hidden="true">${it.icon}</span>${it.name ? `<b>${esc(it.name)}</b>` : ''}${it.sub ? `<small>${it.sub}</small>` : ''}<kbd>${k + 1}</kbd></button>`).join('')}</div>`);
    const row = $('arFbExtra').lastElementChild;
    const first = row.querySelector('[data-hot]:not(:disabled)');
    if (first) first.focus({ preventScroll: true });
    return [...row.querySelectorAll('.ar-chest')];
  }
  function fbMsg(html, up) { $('arFbExtra').insertAdjacentHTML('beforeend', `<p class="ar-chest-msg ${up ? 'up' : 'down'}">${html}</p>`); return $('arFbExtra').lastElementChild; }
  /** Chỗ neo hiệu ứng của 1 người: em = ô điểm trên HUD, bạn khác = dòng trên bảng xếp hạng (tìm lại mỗi lần vì bảng hay vẽ lại). */
  const anchorOf = (p) => (p.me ? $('arStat') : $('arSide').querySelector(`li[data-key="${p.id}"]`));
  function fbEvents(events) { if (events.length) $('arFbExtra').insertAdjacentHTML('beforeend', `<ul class="ar-events">${events.map((e) => `<li>${e}</li>`).join('')}</ul>`); }
  const who = (p) => (p.me ? 'Em' : `${p.face} ${esc(p.name)}`);

  // ── Đấu phép ──
  function showSpells() {
    G.phase = 'pick';
    G.spells = C.rollSpells(rng);
    $('arFbExtra').innerHTML = '';
    pickRow('ar-spells', G.spells.map((id) => ({ icon: C.SPELLS[id].icon, name: C.SPELLS[id].name, cls: 's-' + id,
      sub: esc(id === 'heal' && G.me.hp >= C.SPELL_HP ? 'Em đang đầy máu — chọn phép khác lợi hơn' : C.SPELLS[id].tip) })))
      .forEach((b, k) => b.addEventListener('click', () => pickSpell(G.spells[k])));
  }
  function pickSpell(id) {
    if (!G || G.phase !== 'pick') return;
    const kind = C.SPELLS[id].kind;
    const foes = G.players.filter((p) => !p.me && p.hp > 0);
    if ((kind === 'hit' || kind === 'drain') && foes.length > 1) {
      pickRow('ar-targets', foes.map((p) => ({ icon: p.face, name: p.name, sub: `${p.hp} máu${p.shield ? ' · 🛡️ có khiên' : ''}` })),
        `${C.SPELLS[id].icon} ${C.SPELLS[id].name} — chọn đối thủ:`)
        .forEach((b, k) => b.addEventListener('click', () => castMine(id, foes[k])));
      return;
    }
    castMine(id, foes[0] || null);
  }
  function spellLine(caster, id, r) {
    const P = C.SPELLS[id];
    if (P.kind === 'shield') return `${P.icon} ${who(caster)} dựng Khiên phép`;
    if (P.kind === 'heal') return `${P.icon} ${who(caster)} ${r.heal ? `hồi ${r.heal} máu` : 'dùng Hồi phục khi đang đầy máu'}`;
    const parts = r.hits.map((h) => (h.blocked ? `${who(h.target)} chặn bằng 🛡️` : `${who(h.target)} −${h.amount}${h.ko ? ' 💥 bị hạ!' : ''}`));
    return `${P.icon} ${who(caster)} dùng ${P.name}: ${parts.join(', ') || 'trượt'}${r.heal ? ` · hồi ${r.heal} máu` : ''}`;
  }
  function castMine(id, target) {
    if (!G || G.phase !== 'pick') return;
    G.phase = 'chosen';
    lockPicks();
    const r = C.castSpell(G.me, id, target, G.players, G.boost, G.i);
    fbMsg(spellLine(G.me, id, r), true);
    spellFx(G.me, id, r, 0);
    const kind = C.SPELLS[id].kind;
    sfx(r.hits.some((h) => h.ko) ? 'critical' : kind === 'heal' || kind === 'shield' ? 'match' : 'combo');
    botsSpell();
    afterAnswer();
  }
  /**
   * Phép bay từ người dùng tới mục tiêu; tới nơi thì dòng bị trúng đỏ lên + "−25" (khiên: sáng xanh),
   * bị hạ thì nổ tia lửa. Hồi máu/khiên: sáng tại chỗ. delay (ms) để các đòn nối nhau, không chồng lên.
   */
  function spellFx(caster, id, r, delay) {
    const P = C.SPELLS[id];
    setTimeout(() => {
      const from = anchorOf(caster);
      if (P.kind === 'heal' || P.kind === 'shield') {
        FX.flash(from, P.kind === 'heal' ? 'fx-heal' : 'fx-shield');
        FX.float(from, P.kind === 'heal' ? `💚 +${r.heal}` : '🛡️', P.kind === 'heal' ? 'heal' : 'info');
        return;
      }
      r.hits.forEach((h, n) => {
        FX.fly(from, anchorOf(h.target), P.icon, { delay: n * 90, spin: P.kind === 'drain' }).then(() => {
          const el = anchorOf(h.target);
          if (h.blocked) { FX.flash(el, 'fx-shield'); FX.float(el, '🛡️ chặn!', 'info'); return; }
          FX.flash(el, 'fx-hit');
          FX.float(el, `−${h.amount}`, 'down');
          if (h.ko) FX.burst(el, ['💥', '✨', '⭐'], 9);
          if (h.target.me && global.EduFX) global.EduFX.shake($('arStat'));
        });
      });
      if (r.heal) setTimeout(() => FX.float(anchorOf(caster), `🌀 +${r.heal}`, 'heal'), 700);
    }, delay || 0);
  }
  /** Bạn máy còn trụ trả lời; đúng thì thi triển. Chỉ báo đòn nhắm vào em hoặc hạ gục ai đó. */
  function botsSpell() {
    const events = [];
    G.players.forEach((p) => {
      if (!p.bot || p.hp <= 0) return;
      const a = C.botAnswer(p, G.limitMs, rng);
      if (!a.correct) return;
      const pick = C.botSpell(p, G.players, rng);
      const r = C.castSpell(p, pick.id, pick.target, G.players, C.spellBoost(a.ms, G.limitMs), G.i);
      if (r.hits.some((h) => h.target.me || h.ko)) { events.push(spellLine(p, pick.id, r)); spellFx(p, pick.id, r, 450 + events.length * 350); }
    });
    if (G.me.hp <= 0) sfx('lose');
    fbEvents(events);
    renderHud(); renderSide();
  }

  // ── Giải mã ──
  const SYM = (k) => `<span class="ar-sym c${k}">${SHAPES[k]}</span>`;
  const locks = (n) => '🔓'.repeat(n) + '🔒'.repeat(C.VAULT_LEN - n);
  function showHeist() {
    G.phase = 'pick';
    const threat = C.vaultThreat(G.crack, G.me);
    const acts = ['mine', 'crack', 'rekey'];
    $('arFbExtra').innerHTML = '';
    pickRow('ar-heist', [
      { icon: '⛏️', name: 'Đào đá quý', sub: 'Trả lời càng nhanh đào càng nhiều' },
      { icon: '🔓', name: 'Phá két', sub: `Đoán 1 ký hiệu mã két của 1 bạn — mở đủ ${C.VAULT_LEN} ô lấy ${C.HEIST_STEAL * 100}% đá quý` },
      { icon: '🔁', name: 'Đổi mã két', sub: threat ? `Có bạn đã mở ${threat}/${C.VAULT_LEN} ô két em!` : 'Chưa ai mở được ô nào', off: !threat },
    ]).forEach((b, k) => b.addEventListener('click', () => pickHeist(acts[k])));
  }
  function pickHeist(act) {
    if (!G || G.phase !== 'pick') return;
    const me = G.me;
    if (act === 'mine') {
      const g = C.mineGems(rng, G.boost);
      me.gems += g;
      fbMsg(`⛏️ Em đào được <b>${g} 💎</b>`, true);
      FX.float($('arStat'), `+${g} 💎`, 'gem');
      FX.burst($('arStat'), ['💎', '✨'], 6);
      sfx('match');
    } else if (act === 'rekey') {
      C.rekey(G.crack, me, rng);
      fbMsg('🔁 Em đã đổi mã két — mọi người phải đoán lại từ đầu', true);
      FX.flash($('arStat'), 'fx-shield');
      sfx('flip');
    } else {
      const foes = G.players.filter((p) => !p.me);
      pickRow('ar-targets', foes.map((p) => ({ icon: p.face, name: p.name, sub: `${p.gems} 💎 · ${locks(C.crackOf(G.crack, me.id, p.id).pos)}` })), '🔓 Chọn két muốn phá:')
        .forEach((b, k) => b.addEventListener('click', () => pickSymbol(foes[k])));
      return;
    }
    endHeistTurn();
  }
  function pickSymbol(target) {
    if (!G || G.phase !== 'pick') return;
    const pr = C.crackOf(G.crack, G.me.id, target.id);
    const syms = Array.from({ length: C.VAULT_SYMS }, (_, k) => k);
    pickRow('ar-syms', syms.map((k) => ({ icon: SYM(k), off: pr.wrong.includes(k) })),
      `Ô ${pr.pos + 1}/${C.VAULT_LEN} két của ${who(target)} là ký hiệu nào?${pr.wrong.length ? ` <small>(đã loại ${pr.wrong.map(SYM).join(' ')})</small>` : ''}`)
      .forEach((b, k) => b.addEventListener('click', () => {
        if (!G || G.phase !== 'pick') return;
        const r = C.crackTry(G.crack, G.me, target, k, rng);
        if (r.opened && !r.take) {
          G.opened++;
          FX.flash(fbMsg(`🔓 Em mở được két của ${who(target)} — nhưng két đang trống, chưa có đá quý nào`, true), 'fx-unlock');
          sfx('flip');
        } else if (r.opened) {
          G.opened++;
          fbMsg(`💥 Em phá được két của ${who(target)} — lấy <b>${r.take} 💎</b>!`, true);
          gemsFly(target, G.me, r.take);
          sfx('critical');
          if (global.EduFX) global.EduFX.confetti({ count: 60 });
        } else if (r.hit) {
          FX.flash(fbMsg(`✅ Đúng ô ${r.pos}! Két ${who(target)}: ${locks(r.pos)}`, true), 'fx-unlock');
          setTimeout(() => { FX.flash(anchorOf(target), 'fx-unlock'); FX.float(anchorOf(target), '🔓', 'info'); }, 50);
          sfx('correct');
        } else { FX.flash(fbMsg(`✖️ Không phải ${SYM(k)} — lần sau thử ký hiệu khác`, false), 'fx-wrong'); sfx('wrong'); }
        endHeistTurn();
      }));
  }
  function endHeistTurn() {
    G.phase = 'chosen';
    lockPicks();
    botsHeist();
    afterAnswer();
  }
  /** Két bị phá: vài viên đá quý bay từ két bị phá sang người phá + "−N"/"+N". */
  function gemsFly(fromP, toP, take, delay) {
    setTimeout(() => {
      const from = anchorOf(fromP), to = anchorOf(toP);
      FX.flash(from, 'fx-hit');
      FX.float(from, `−${take} 💎`, 'down');
      for (let n = 0; n < 5; n++) FX.fly(from, to, '💎', { delay: n * 80, ms: 600 }).then(() => { if (n === 4) { FX.flash(anchorOf(toP), 'fx-bump'); FX.float(anchorOf(toP), `+${take} 💎`, 'gem'); } });
    }, delay || 30);
  }
  function botsHeist() {
    const events = [];
    let robbed = false;
    G.players.forEach((p) => {
      if (!p.bot) return;
      const a = C.botAnswer(p, G.limitMs, rng);
      if (!a.correct) return;
      const d = C.botHeist(p, G.players, G.crack, rng);
      if (d.act === 'mine') p.gems += C.mineGems(rng, C.spellBoost(a.ms, G.limitMs));
      else if (d.act === 'rekey') C.rekey(G.crack, p, rng);
      else {
        const r = C.crackTry(G.crack, p, d.target, d.sym, rng);
        if (r.opened && r.take) {
          events.push(`💥 ${who(p)} phá két của ${d.target.me ? 'em' : who(d.target)}, lấy ${r.take} 💎!`);
          robbed = robbed || d.target.me;
          if (d.target.me) gemsFly(G.me, p, r.take, 500);
        }
        else if (r.hit && d.target.me) events.push(`⚠️ ${who(p)} đoán đúng ô ${r.pos} két của em (${locks(r.pos)}) — cân nhắc đổi mã!`);
      }
    });
    if (robbed) sfx('lose');
    fbEvents(events);
    renderHud(); renderSide();
  }

  // ── Bảng xếp hạng / HUD / đường đua ──
  /** Xếp hạng theo chế độ (Sinh tồn: tim → trụ lâu → điểm). */
  function ranked(list) {
    if (G.mode === 'survival') return list.slice().sort(C.survivalOrder);
    if (G.mode === 'spell') return list.slice().sort(C.spellOrder);
    return C.rank(list, KEY_OF[G.mode]);
  }
  function rankOf(p) { return ranked(G.players).indexOf(p) + 1; }
  function renderHud() {
    const me = G.me;
    $('arStat').innerHTML = G.mode === 'speed' ? `⭐ ${me.score.toLocaleString('vi-VN')} điểm`
      : G.mode === 'gold' ? `🪙 ${me.gold.toLocaleString('vi-VN')} vàng`
      : G.mode === 'survival' ? `<span class="ar-hud-hp">${C.hearts(me.hp)}</span> ⭐ ${me.score.toLocaleString('vi-VN')}`
      : G.mode === 'fish' ? `🎣 ${me.kg.toLocaleString('vi-VN')} kg${me.frenzy ? ` <span class="ar-tag up">⚡ x2 ×${me.frenzy}</span>` : ''}`
      : G.mode === 'tug' ? `🔴 Đội Đỏ · em kéo ${me.pull}`
      : G.mode === 'spell' ? `<span class="ar-hpbar" aria-hidden="true"><i style="width:${me.hp}%"></i></span> ${me.hp}/${C.SPELL_HP} máu${me.shield ? ' · 🛡️' : ''}`
      : G.mode === 'heist' ? `💎 ${me.gems.toLocaleString('vi-VN')} · két em ${locks(C.vaultThreat(G.crack, me))}`
      : `🏁 ${me.pos}/${G.goal} bước`;
    const s = $('arStreak');
    s.hidden = me.streak < 2;
    s.textContent = `🔥 Chuỗi ${me.streak}`;
  }
  function renderSide() {
    const key = KEY_OF[G.mode];
    const unit = UNIT_OF[key];
    const surv = G.mode === 'survival', spell = G.mode === 'spell';
    const extra = (p) => (surv ? ` <span class="ar-board-hp">${C.hearts(p.hp)}</span>`
      : G.mode === 'tug' ? ` <span class="ar-team-dot is-${p.team}" title="${C.TEAMS[p.team].name}"></span>` : '');
    // Dòng phụ dưới tên (không bị cắt khi tên dài): thanh máu / số ô két em đã mở.
    const sub = (p) => (spell ? `<span class="ar-board-sub"><span class="ar-hpbar" title="${p.hp} máu"><i style="width:${p.hp}%"></i></span> ${p.hp}${p.shield ? ' 🛡️' : ''}</span>`
      : G.mode === 'heist' && !p.me ? `<span class="ar-board-sub" title="Em đã mở ${C.crackOf(G.crack, 'me', p.id).pos}/${C.VAULT_LEN} ô két bạn này">${locks(C.crackOf(G.crack, 'me', p.id).pos)}</span>` : '');
    FX.flip($('arSide'), () => { $('arSide').innerHTML = `<h3>${G.practice ? '🔁 Luyện câu sai' : MODE_LABEL[G.mode]}</h3><ol class="ar-board">${ranked(G.players).map((p, i) => `<li data-key="${p.id}" class="${p.me ? 'is-me' : ''}${p.ghost ? ' is-ghost' : ''}${(surv || spell) && p.hp <= 0 ? ' is-out' : ''}">
      <span class="ar-board-rank">${i + 1}</span><span class="ar-board-face">${p.face}</span>
      <span class="ar-board-name">${esc(p.name)}${extra(p)}</span><b>${p[key].toLocaleString('vi-VN')}</b><small>${unit}</small>${sub(p)}</li>`).join('')}</ol>`; });
  }
  function renderTrack() {
    if (G.mode === 'tug') {
      const knot = $('arTrack').querySelector('.ar-rope-knot');
      if (knot && G.trackDrawn) {
        const was = +knot.dataset.rope || 0;
        knot.dataset.rope = G.rope;
        knot.style.left = (50 - G.rope / 2) + '%';
        if (G.rope !== was) {
          FX.flash($('arTrack').querySelector('.ar-rope'), G.rope > was ? 'fx-pull-red' : 'fx-pull-blue');
          FX.flash($('arTrack').querySelector(`.ar-rope-team.is-${G.rope > was ? 'red' : 'blue'}`), 'fx-bump');
        }
        return;
      }
      const faces = (t) => G.players.filter((p) => p.team === t).map((p) => (p.me ? `<b>${p.face}</b>` : p.face)).join(' ');
      $('arTrack').innerHTML = ropeHtml(G.rope, faces('red'), faces('blue'));
      G.trackDrawn = true;
      return;
    }
    if (G.mode !== 'race') return;
    const lanes = $('arTrack').querySelectorAll('.ar-lane');
    if (lanes.length === G.players.length && G.trackDrawn) {
      G.players.forEach((p, i) => {
        const r = lanes[i].querySelector('.ar-runner');
        if (+r.dataset.pos === p.pos) return;
        r.dataset.pos = p.pos;
        r.style.left = `calc(${(p.pos / G.goal) * 100}% - ${(p.pos / G.goal) * 2}rem)`;
        FX.flash(r, 'fx-hop');
      });
      return;
    }
    $('arTrack').innerHTML = G.players.map((p) => `<div class="ar-lane${p.me ? ' is-me' : ''}">
      <span class="ar-lane-name">${esc(p.name)}</span>
      <div class="ar-lane-road"><span class="ar-runner" data-pos="${p.pos}" style="left:calc(${(p.pos / G.goal) * 100}% - ${(p.pos / G.goal) * 2}rem)">${p.face}</span><span class="ar-flag" aria-hidden="true">🏁</span></div></div>`).join('');
    G.trackDrawn = true;
  }

  // ── Kết thúc ──
  function finish() {
    clearInterval(G.timer);
    const key = KEY_OF[G.mode];
    const board = ranked(G.players.filter((p) => !p.ghost));
    const won = C.tugWinner(G.rope);
    // Kéo co tính theo đội: đội em thắng (hoặc hoà) = hạng 1, thua = hạng 2.
    const place = G.mode === 'tug' ? (won === 'blue' ? 2 : 1) : board.indexOf(G.me) + 1;
    const total = G.log.length;
    const p = profile();
    const coins = C.coinsFor({ correct: G.correct, place, players: G.mode === 'tug' ? 2 : board.length });
    p.coins += coins;
    p.games = (p.games || 0) + 1;
    const value = G.me[key];
    const old = p.best[G.bestKey];
    const record = !G.practice && (!old || value > old.value);
    if (record) p.best[G.bestKey] = { value, at: Date.now(), trail: G.mode === 'speed' ? G.trail.slice(0, 40) : undefined };
    save();
    try {
      global.EduGamification && global.EduGamification.recordGameSession(G.practice ? 'arena-practice' : 'arena-' + G.mode, {
        score: total ? Math.round((G.correct / total) * 100) : 0, scoreType: 'percent', accuracy: total ? Math.round((G.correct / total) * 100) : 0,
        correctAnswers: G.correct, wrongAnswers: total - G.correct, durationSec: Math.round((Date.now() - G.startedAt) / 1000), showReward: false,
      });
    } catch (e) { /* XP chỉ là phần thêm */ }

    const wrong = G.log.filter((x) => !x.ok);
    $('arEndTitle').textContent = G.practice
      ? (wrong.length ? `🔁 Luyện câu sai — em đã sửa được ${G.correct}/${total} câu` : '🎉 Tuyệt vời! Em đã sửa hết các câu sai!')
      : G.mode === 'survival' && place === 1 ? `🏆 ${nickName()} là người sống sót cuối cùng!`
      : G.mode === 'survival' && G.me.hp <= 0 ? `💀 Em đã bị loại — về hạng ${place}/${board.length}. Thử lại nhé!`
      : G.mode === 'fish' && place === 1 ? `🏆 ${nickName()} là Vua câu cá!`
      : G.mode === 'tug' ? (won === 'red' ? `🏆 Đội Đỏ thắng! Em góp ${G.me.pull} lực kéo` : won === 'blue' ? `🔵 Đội Xanh thắng lần này — em góp ${G.me.pull} lực kéo` : `🤝 Hai đội hoà — em góp ${G.me.pull} lực kéo`)
      : G.mode === 'spell' && G.me.hp <= 0 ? `💥 Em bị hạ — về hạng ${place}/${board.length}. Thử lại nhé!`
      : G.mode === 'spell' && place === 1 ? `🏆 ${nickName()} là pháp sư trụ lại cuối cùng!`
      : G.mode === 'heist' && place === 1 ? `🏆 ${nickName()} là Vua giải mã!`
      : place === 1 ? `🏆 ${nickName()} vô địch ${MODE_LABEL[G.mode]}!` : `${MODE_LABEL[G.mode]} — em về hạng ${place}/${board.length}`;
    $('arPodium').hidden = G.practice;
    $('arAgain').hidden = G.practice;
    const top = board.slice(0, 3);
    const order = [1, 0, 2].filter((i) => top[i]);
    const unit = UNIT_OF[key];
    $('arPodium').innerHTML = order.map((i) => `<div class="ar-pod p${i + 1}${top[i].me ? ' is-me' : ''}" style="--d:${(2 - i) * 0.35}s">
      <span class="ar-pod-face">${top[i].face}</span><b class="ar-pod-name">${esc(top[i].name)}</b>
      <span class="ar-pod-val">${top[i][key].toLocaleString('vi-VN')} ${unit}</span><div class="ar-pod-block">${i + 1}</div></div>`).join('');
    $('arEndStats').innerHTML = `
      <div><b>${G.correct}/${total}</b><span>câu đúng</span></div>
      <div><b>${G.bestStreak}</b><span>chuỗi đúng dài nhất</span></div>
      <div><b>${value.toLocaleString('vi-VN')}</b><span>${unit}${record && old ? ' · <em>kỷ lục mới!</em>' : ''}</span></div>
      ${G.mode === 'survival' ? `<div><b>${C.hearts(G.me.hp)}</b><span>${G.me.hp > 0 ? 'em trụ đến cuối!' : 'hết tim'}</span></div>` : ''}
      ${G.mode === 'spell' ? `<div><b>${G.me.hp}</b><span>máu còn lại</span></div>` : ''}
      ${G.mode === 'heist' ? `<div><b>${G.opened}</b><span>két em phá được</span></div>` : ''}
      ${G.mode === 'tug' ? `<div><b>${Math.abs(G.rope)}/${C.TUG_GOAL}</b><span>${won ? `dây lệch về ${C.TEAMS[won].name}` : 'dây cân bằng'}</span></div>` : ''}
      <div class="is-coin"><b>+${coins} 🪙</b><span>xu (đang có ${p.coins})</span></div>`;
    const rv = $('arReview');
    rv.hidden = !wrong.length;
    rv.open = G.practice;
    rv.innerHTML = reviewHtml(wrong);
    paintPracticeBtn($('arPractice'), wrong.length);
    show('arEnd');
    refreshWallet();
    const win = G.practice ? !wrong.length : place === 1 && !(G.mode === 'tug' && !won);
    sfx(win ? 'win' : G.practice || place <= 3 ? 'match' : 'lose');
    if (win && global.EduFX) global.EduFX.confetti({ count: 120 });
    G.phase = 'end';
  }

  /** Danh sách câu sai (dùng chung cho màn kết thúc 1 người và Phòng cả lớp). log: [{ q, chosen, ok }]. */
  function reviewHtml(wrong) {
    return `<summary>📒 Xem lại ${wrong.length} câu sai</summary><ol>${wrong.map((x) => `<li><b>${esc(x.q.text)}</b>
      <span>${C.kindOf(x.q) === 'choice' ? '' : `<i class="ar-review-kind">${C.KIND_ICON[C.kindOf(x.q)]} ${C.KIND_LABEL[C.kindOf(x.q)]}</i> `}Đáp án đúng: <em class="ar-review-ok">${C.answerLines(x.q).map(esc).join(' · ')}</em>${C.chosenLines(x.q, x.chosen).length ? ` · em chọn: ${C.chosenLines(x.q, x.chosen).map(esc).join(' · ')}` : ' · em chưa trả lời'}</span>
      ${x.q.expl ? `<small>💡 ${esc(x.q.expl)}</small>` : ''}</li>`).join('')}</ol>`;
  }
  function paintPracticeBtn(btn, n) {
    btn.hidden = !n;
    btn.innerHTML = `<span aria-hidden="true">🔁</span> Luyện lại ${n} câu sai`;
  }
  /** Bắt đầu lượt "Luyện câu sai" từ nhật ký [{ q, ok }]; false nếu không còn câu sai. */
  function practice(log) {
    const deck = C.practiceDeck(log, rng);
    if (!deck.length) { toast('Không còn câu sai nào — giỏi lắm!'); return false; }
    start(deck);
    return true;
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
    const pw = ['q', 'w', 'e'].indexOf(String(e.key).toLowerCase());
    if (G.phase === 'q' && pw >= 0 && G.powers[pw]) { e.preventDefault(); usePower(pw); return; }
    if (G.phase === 'q' && G.picker) {
      if (n >= 1 && n <= cur().options.length) { e.preventDefault(); G.picker.key(n); }
      else if (e.key === 'Enter' && !(e.target.closest && e.target.closest('button'))) { e.preventDefault(); G.picker.submit(); }
    } else if (G.phase === 'q' && n >= 1 && n <= cur().options.length) {
      e.preventDefault();
      const b = document.querySelector(`.ar-ans[data-k="${n - 1}"]`);
      if (b && !b.disabled) answer(n - 1); // không chọn được đáp án đã bị 50:50 ẩn
    }
    else if (G.phase === 'chest' && n >= 1 && n <= 3) { e.preventDefault(); pickChest(n - 1); }
    else if (G.phase === 'pick' && n >= 1) { // Đấu phép / Giải mã: các ô đang chọn được (data-hot)
      const b = $('arFbExtra').querySelector(`[data-hot="${n}"]:not(:disabled)`);
      if (b) { e.preventDefault(); b.click(); }
    }
    else if (G.phase === 'next' && (e.key === 'Enter' || e.key === ' ') && e.target.id !== 'arNext') { e.preventDefault(); next(); }
  });
  $('arAnswers').addEventListener('click', (e) => { const b = e.target.closest('.ar-ans[data-k]'); if (b) answer(+b.dataset.k); });
  $('arPowers').addEventListener('click', (e) => { const b = e.target.closest('[data-pw]'); if (b) usePower(+b.dataset.pw); });
  $('arQuit').addEventListener('click', quit);
  $('arAgain').addEventListener('click', () => start());
  $('arPractice').addEventListener('click', () => { if (G) practice(G.log); });
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

  // Dùng chung với "Phòng cả lớp" (js/arena/arena-room.js — nạp SAU file này).
  global.EduArena = {
    _state: () => G, _store: () => S,
    api: {
      esc, sfx, toast, show, rng, SHAPES, prefs: S.prefs, save, profile, avatarOf, refreshWallet,
      /** Lưu biệt danh đang gõ; trả biệt danh (rỗng nếu chưa nhập). */
      saveNick() { S.last = $('arNick').value.trim().slice(0, 30); save(); refreshWallet(); return S.last; },
      /** Lưu họ tên (hoặc biệt danh) và đồng bộ các ô nhập; trả tên đã chuẩn hoá (rỗng nếu chưa nhập). */
      setNick, role, setRole, setInvite, effMode,
      /** Luyện câu sai: reviewHtml(wrong) vẽ danh sách, practice(log) vào lượt luyện. */
      reviewHtml, paintPracticeBtn, practice, kinds, ropeHtml,
      nickName, avatar: () => avatarOf(profile()),
      /** Bộ câu đang chọn ở màn chọn: { questions, key, title } (questions null = đang tải). */
      deckSource: () => ({ questions: SRC.questions, key: SRC.key, title: SRC.title || '' }),
      inGame: () => !!G && G.phase !== 'end' && !$('arGame').hidden,
    },
  };
})(window);
