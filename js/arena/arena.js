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
  const SC = global.EduArenaScene; // dải sân khấu có tranh (js/arena/arena-scene.js)
  const D = global.EduArenaDrama;  // chữ lớn giữa màn hình, xu bay, số đếm dần (js/arena/arena-drama.js)
  const CD = global.EduArenaCards; // bàn bốc thẻ bài mỗi 3 câu (js/arena/arena-cards.js)
  const HY = global.EduArenaHype;  // bình luận viên: mục tiêu trước mắt, lời bình, cao trào (js/arena/arena-hype.js)
  const SUSPENSE_MS = 750; // em bấm đáp án → trống dồn một nhịp rồi mới lộ đúng/sai
  const reducedMotion = () => { try { return global.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
  const CHAL_XU = 5;     // xu thưởng mỗi thử thách (Câu hỏi vàng / Thử thách tốc độ)
  const CHAL_MS = 5000;  // Thử thách tốc độ: đúng trong 5 giây
  const STORE = 'eduquiz_arena_v1';
  const SHAPES = ['▲', '◆', '●', '■', '★', '⬟'];
  const AVATAR_DEFAULT = '🙂';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sfx = (n) => { try { global.EduSFX && global.EduSFX.play(n); } catch (e) { /* không có âm thanh cũng chơi được */ } };
  const music = (lv) => { try { global.EduSFX && global.EduSFX.music && global.EduSFX.music(lv); } catch (e) { /* ignore */ } }; // nhạc nền trận (game-sfx.js)
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
    if (screen !== 'arGame') music(0); // rời màn chơi (kết quả, bỏ cuộc, sảnh) → tắt nhạc nền
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
  // Bộ theo tiết PPCT (câu All Key): Ôn tập / Luyện thi · Kiểm tra ("Tiết N" = tên cũ trước 10/2026)
  const LESSON_RE = /^(Tiết \d+$|Ôn tập\s|Luyện thi\s)/;
  const TEST_RE = /^Kiểm tra\s/;
  const BAI_RE = /^Bài \d+[.:]/; // câu Củng cố theo bài học — không trộn vào "Trộn mọi chủ đề"
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
    // Link có ?cat= thì theo link; không thì mở lại đúng bộ lần trước (đỡ chọn lại 3 ô mỗi lần vào)
    const want = params.get('cat') ? { cat: params.get('cat'), lvl: params.get('lvl'), mt: params.get('mt') } : (S.prefs.deck || {});
    if (want.cat && SRC.meta.categories.some((c) => c.id === want.cat)) cat.value = want.cat;
    fillLevels(want.lvl);
    if (want.mt && [...$('arMt').options].some((o) => o.value === want.mt)) $('arMt').value = want.mt;
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
    const names = Object.keys(lv?.minitests || {}).filter((n) => (lv.minitests[n]?.count ?? 1) > 0); // bỏ bộ chưa có câu
    const num = (n) => parseInt((n.match(/\d+/) || [0])[0], 10);
    const topics = names.filter((n) => !LESSON_RE.test(n) && !TEST_RE.test(n) && !BAI_RE.test(n));
    const bai = names.filter((n) => BAI_RE.test(n)).sort((a, b) => num(a) - num(b));
    const finals = names.filter((n) => /^Ôn tập cuối khóa\s/.test(n)); // 8 tiết ôn cuối khóa (All Key)
    const lessons = names.filter((n) => LESSON_RE.test(n) && !finals.includes(n)); // đã xếp theo tiết trong file
    const tests = names.filter((n) => TEST_RE.test(n));
    const grp = (label, list) => (list.length ? `<optgroup label="${esc(label)}">${list.map((n) => `<option value="${esc(n)}">${esc(n)}</option>`).join('')}</optgroup>` : '');
    $('arMt').innerHTML = (topics.length > 1 ? `<option value="${ALL}">🎲 Trộn mọi chủ đề</option>` : '')
      + grp('Theo tên bài', bai) + grp('Theo chủ đề', topics) + grp('Ôn tập theo tiết', lessons) + grp('Kiểm tra theo tiết', tests) + grp('Ôn tập cuối khóa', finals);
  }
  let loadSeq = 0;
  async function bankChanged() {
    const seq = ++loadSeq;
    const cat = $('arCat').value, lvl = $('arLvl').value, mt = $('arMt').value;
    SRC.key = `${cat}|${lvl}|${mt}`;
    S.prefs.deck = { cat, lvl, mt }; save();
    SRC.title = [curCat()?.name, curCat()?.levels.find((l) => l.id === lvl)?.name, mt === ALL ? 'Trộn mọi chủ đề' : mt].filter(Boolean).join(' › ');
    SRC.questions = null;
    $('arDeckInfo').textContent = 'Đang tải câu hỏi...';
    const files = SRC.manifest[`${cat}__${lvl}`] || {};
    const lv = curCat()?.levels.find((l) => l.id === lvl);
    const names = mt === ALL ? Object.keys(lv?.minitests || {}).filter((n) => !LESSON_RE.test(n) && !TEST_RE.test(n) && !BAI_RE.test(n)) : [mt];
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
    $('arMoreSum').textContent = on.length === C.KINDS.length ? '· đang bật tất cả dạng' : '· đang bật: ' + on.map((k) => C.KIND_LABEL[k]).join(', ');
  }
  /** Dòng giải thích số câu thật của trận (bộ ít/nhiều hơn số câu chọn) — cho cả 2 vai. */
  function countInfo(n) {
    const want = S.prefs.count;
    const mode = effMode();
    const play = C.playCount(want, n);
    let s = `Bộ có ${n} câu chơi được`;
    if (want && want > n) s += ` — chọn ${want} câu nhưng bộ chỉ có ${n}, trận sẽ có ${play} câu (không lặp câu)`;
    else s += ` · trận ${play} câu${want ? '' : ' (tất cả)'}`;
    if (mode === 'race' || mode === 'moon') {
      const need = play * (mode === 'race' ? 3 : 2);
      if (need > n) s += `. ${mode === 'race' ? 'Đua về đích' : 'Lên Mặt Trăng'} có thể cần tới ${need} lượt: hết ${n} câu mới trộn lại, không lặp liền nhau`;
    }
    return s + '.';
  }
  /** Chip số câu lớn hơn số câu bộ có: mờ + giải thích (vẫn bấm được, trận tự lấy đúng số câu có). */
  function paintCountChips(n) {
    $('arCount').querySelectorAll('button').forEach((b) => {
      const v = Number(b.dataset.v);
      const over = v > 0 && v > n;
      b.classList.toggle('is-over', over);
      b.title = over ? `Bộ chỉ có ${n} câu — trận sẽ có ${n} câu` : v === 0 ? `Chơi hết ${n} câu của bộ` : '';
      if (v === 0) b.textContent = n ? `Tất cả (${n})` : 'Tất cả';
    });
  }
  function updateDeckInfo() {
    if (!SRC.questions) return;
    const n = playableCount();
    paintKinds();
    paintCountChips(n);
    const info = n ? countInfo(n) : '⚠️ Bộ này không có câu thuộc các dạng đã chọn — chọn thêm dạng câu hoặc bài khác.';
    $('arDeckInfo').textContent = info;
    $('arDeckInfoTeacher').textContent = info;
    $('arPlay').disabled = !n;
    if (!n) $('arMore').open = true; // thiếu câu vì tắt dạng câu → mở sẵn chỗ bật lại
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
  // Săn vàng, Câu cá, Đào hoá thạch, Lên Mặt Trăng chỉ chơi 1 người → ở vai Giáo viên hiểu là Tốc độ; Bảng điểm ở vai khác cũng vậy.
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
      if (!on) return;
      // Luật đầy đủ của chế độ đang chọn (thẻ chỉ còn 1 dòng ngắn) + tên chế độ trên nút Vào trận
      const desc = b.querySelector(role() === 'teacher' ? 'small:not(.only-solo)' : 'small:not(.only-teacher)');
      $('arModeDesc').innerHTML = `<b>${esc(b.querySelector('b').textContent)}:</b> ${esc(desc ? desc.textContent : '')}`;
      $('arPlayLabel').textContent = 'Vào trận: ' + b.querySelector('b').textContent;
    });
    $('arSecs').closest('.ar-field').hidden = m === 'gold'; // Săn vàng không giới hạn giờ (như Blooket)
  }

  // ============================================================
  // VAI: học sinh / giáo viên / chơi một mình / mini-game (js/arena/arena-mini.js)
  // ============================================================
  const ROLES = ['student', 'teacher', 'solo', 'minigame'];
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
    else if (ROLES.includes(params.get('vai'))) setRole(params.get('vai'), false); // link từ trang chủ: arena.html?vai=minigame
    else setRole(S.role === 'teacher' ? 'teacher' : deep ? 'solo' : (ROLES.includes(S.role) ? S.role : 'student'), false);
  }
  function initHome() {
    $('arNick').value = S.last;
    // Máy phòng học dùng chung: KHÔNG điền sẵn tên người dùng trước vào ô họ tên của học sinh
    // (chỉ điền khi tải lại trang giữa chừng — xem arena-room.js init).
    $('arJoinName').value = '';
    $('arNick').addEventListener('change', () => { S.last = $('arNick').value.trim().slice(0, 30); save(); refreshWallet(); paintDue(); });
    paintDue();
    $('arNick').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !$('arPlay').disabled) { e.preventDefault(); start(); } });
    $('arJoinAvatar').addEventListener('click', () => openPacks());
    initRoles();
    $('arModes').addEventListener('click', (e) => { const b = e.target.closest('.ar-mode'); if (!b) return; S.prefs.mode = b.dataset.mode; save(); paintModes(); sfx('click'); document.dispatchEvent(new CustomEvent('arena:mode')); });
    if (Object.keys(MODE_LABEL).includes(params.get('mode'))) S.prefs.mode = params.get('mode');
    paintModes();
    chipGroup('arCount', 'count', Number);
    // Đổi số câu / chế độ → cập nhật dòng "bộ có N câu, trận X câu" (Đua/Mặt Trăng còn báo số lượt)
    $('arCount').addEventListener('click', () => updateDeckInfo());
    document.addEventListener('arena:mode', () => updateDeckInfo());
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
      if (b.dataset.go === 'packs') openPacks(); else { show('arHome'); refreshWallet(); paintDue(); }
    }));
  }

  // ============================================================
  // LINH VẬT
  // ============================================================
  function openPacks() {
    const src = role() === 'student' ? $('arJoinName') : $('arNick');
    if (src.value.trim()) setNick(src.value); else { S.last = ''; save(); }
    renderPacks();
    closeReveal();
    show('arPacks');
  }
  /** Ngày theo giờ máy, dạng YYYY-MM-DD (nhiệm vụ ngày). */
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const starsHtml = (n) => `<span class="ar-stars" aria-label="${n} sao">${'★'.repeat(n)}<i>${'★'.repeat(C.STAR_AT.length - n)}</i></span>`;
  const bar = (v, max) => `<span class="ar-qbar"><i style="width:${Math.min(100, Math.round((v / max) * 100))}%"></i></span>`;
  /** Cộng câu đúng vào nhiệm vụ ngày (Chơi một mình + Phòng cả lớp). Đủ mục tiêu → báo nhận vé. */
  function addDaily(correct) {
    if (C.addDaily(profile(), correct, today())) { save(); toast('🎯 Xong nhiệm vụ hôm nay — em nhận 1 🎟️ vé mở hộp miễn phí!'); return true; }
    return false;
  }
  function renderPacks(fresh) {
    const p = profile();
    refreshWallet();
    const d = C.dailyOf(p, today());
    const tickets = p.tickets || 0;
    const left = C.PITY_MAX - (p.pity || 0);
    const total = C.PACKS.reduce((n, pk) => n + pk.blooks.length, 0);
    const owned = Object.keys(p.owned).length;
    const sets = C.PACKS.filter((pk) => p.sets && p.sets[pk.id]).length;
    $('arQuests').innerHTML = `
      <div class="ar-quest${d.done ? ' is-done' : ''}"><span class="ar-quest-ico" aria-hidden="true">🎯</span><div>
        <b>Nhiệm vụ hôm nay</b><small>${d.done ? 'Đã xong — mai quay lại nhận vé mới nhé' : `Trả lời đúng ${d.goal} câu trong Đấu trường → 1 vé mở hộp miễn phí`}</small>
        ${bar(d.correct, d.goal)}<em>${d.correct}/${d.goal} câu${tickets ? ` · <strong>🎟️ ${tickets} vé</strong>` : ''}</em></div></div>
      <div class="ar-quest"><span class="ar-quest-ico" aria-hidden="true">🛡️</span><div>
        <b>Bảo hiểm Sử thi</b><small>${left <= 1 ? 'Hộp kế tiếp <strong>chắc chắn</strong> ra Sử thi trở lên!' : `Còn ${left} hộp nữa chắc chắn ra Sử thi trở lên`}</small>
        ${bar(p.pity || 0, C.PITY_MAX - 1)}<em>${p.pity || 0}/${C.PITY_MAX - 1} hộp chưa ra Sử thi</em></div></div>
      <div class="ar-quest"><span class="ar-quest-ico" aria-hidden="true">📚</span><div>
        <b>Sưu tập</b><small>Đủ 9 Linh vật của 1 hộp → thưởng ${C.SET_BONUS} xu</small>
        ${bar(owned, total)}<em>${owned}/${total} Linh vật · ${sets}/${C.PACKS.length} hộp đã đủ</em></div></div>`;
    $('arPackList').innerHTML = C.PACKS.map((pk) => {
      const own = pk.blooks.filter((b) => p.owned[b.id]).length;
      const done = p.sets && p.sets[pk.id];
      const can = tickets > 0 || p.coins >= C.PACK_PRICE;
      return `<button type="button" class="ar-pack${done ? ' is-done' : ''}" data-pack="${pk.id}" ${can ? '' : 'disabled'}>
        <span class="ar-pack-ico" aria-hidden="true">${pk.icon}</span><b>${esc(pk.name)}</b>
        <small>${done ? '🏆 Đã đủ bộ' : `${own}/${pk.blooks.length} · đủ bộ +${C.SET_BONUS} 🪙`}</small>${bar(own, pk.blooks.length)}
        <span class="ar-price">${tickets ? '🎟️ Miễn phí' : `🪙 ${C.PACK_PRICE}`}</span></button>`;
    }).join('');
    $('arCollCount').textContent = `${owned}/${total}`;
    $('arCollection').innerHTML = C.PACKS.map((pk) => `<h3 class="ar-h3">${pk.icon} ${esc(pk.name)}${p.sets && p.sets[pk.id] ? ' <span class="ar-set-done">🏆 Đủ bộ</span>' : ''}</h3><div class="ar-blooks">${pk.blooks.map((b) => {
      const has = p.owned[b.id];
      return `<button type="button" class="ar-blook r-${b.rarity}${has ? '' : ' is-locked'}${p.avatar === b.id ? ' is-avatar' : ''}${fresh === b.id ? ' is-new' : ''}" data-blook="${has ? b.id : ''}"
        title="${has ? esc(b.name) + ' · ' + C.RARITY[b.rarity].label + (has > 1 ? ' · x' + has : '') : 'Chưa có — ' + C.RARITY[b.rarity].label}" ${has ? '' : 'disabled'}>
        <span class="ar-blook-emoji">${has ? b.emoji : '❔'}</span><small>${has ? esc(b.name) : C.RARITY[b.rarity].label}</small>${has ? starsHtml(C.starsOf(has)) : ''}</button>`;
    }).join('')}</div>`).join('');
  }

  // ── Mở hộp: hộp rung (ánh sáng đổi màu theo độ hiếm) → nổ → thẻ lật ra. Bấm/Space để mở nhanh. ──
  const R_HIGH = ['epic', 'legendary', 'mystery'];
  const R_SPARK = { common: ['✨'], rare: ['✨', '💠'], epic: ['✨', '⭐', '💜'], legendary: ['⭐', '🌟', '✨', '💛'], mystery: ['🌟', '💖', '✨', '⭐'] };
  let RV = null;
  /** Ô "Nhiệm vụ hôm nay" ở màn kết thúc (Chơi một mình + Phòng cả lớp). */
  function dailyStat() {
    const d = C.dailyOf(profile(), today());
    return `<div class="is-quest"><b>${d.done ? '🎟️' : `${d.correct}/${d.goal}`}</b><span>${d.done ? 'nhiệm vụ hôm nay xong — có vé mở hộp' : 'câu đúng hôm nay · đủ thì nhận vé mở hộp'}</span></div>`;
  }
  function closeReveal() {
    if (RV) clearTimeout(RV.t);
    RV = null;
    $('arReveal').hidden = true;
    $('arReveal').innerHTML = '';
  }
  function buy(packId) {
    const p = profile();
    const ticket = (p.tickets || 0) > 0;
    const res = C.buyPack(p, packId, rng, { ticket });
    if (!res.ok) { toast('Chưa đủ xu — chơi thêm vài ván nhé!'); return; }
    save();
    renderPacks(res.blook.id);
    const pk = C.PACKS.find((x) => x.id === packId);
    const r = $('arReveal');
    if (RV) clearTimeout(RV.t);
    RV = { res, pk, ticket, stage: 'shake' };
    r.hidden = false;
    r.className = `ar-reveal r-${res.blook.rarity}${R_HIGH.includes(res.blook.rarity) ? ' is-high' : ''}`;
    r.innerHTML = `<div class="ar-reveal-box">
      <button type="button" class="ar-reveal-pack" data-rv="skip" aria-label="Mở nhanh"><span class="ar-reveal-glow" aria-hidden="true"></span><span class="ar-reveal-ico">${pk.icon}</span></button>
      <p class="ar-reveal-tip">${res.pity ? '🛡️ Bảo hiểm kích hoạt — chắc chắn Sử thi trở lên!' : 'Đang mở hộp... bấm để mở nhanh'}</p></div>`;
    sfx('flip');
    if (FX.reduced()) { revealCard(); return; }
    RV.t = setTimeout(() => { if (RV) { r.classList.add('is-tease'); sfx(R_HIGH.includes(res.blook.rarity) ? 'combo' : 'click'); RV.t = setTimeout(revealCard, R_HIGH.includes(res.blook.rarity) ? 1000 : 650); } }, 700);
  }
  function revealCard() {
    if (!RV || RV.stage === 'card') return;
    clearTimeout(RV.t);
    RV.stage = 'card';
    const { res, pk } = RV;
    const b = res.blook, p = profile();
    const r = $('arReveal');
    const pack = r.querySelector('.ar-reveal-pack');
    if (pack) FX.burst(pack, R_SPARK[b.rarity], R_HIGH.includes(b.rarity) ? 14 : 8);
    const again = (p.tickets || 0) > 0 ? '🎟️ Mở tiếp (miễn phí)' : `Mở tiếp · 🪙 ${C.PACK_PRICE}`;
    const canAgain = (p.tickets || 0) > 0 || p.coins >= C.PACK_PRICE;
    r.classList.add('is-open');
    r.innerHTML = `<div class="ar-reveal-box">
      <div class="ar-reveal-card r-${b.rarity}"><span class="ar-reveal-shine" aria-hidden="true"></span>
        <span class="ar-reveal-badge">${res.dupe ? (res.starUp ? '⬆️ Lên sao!' : 'Đã có') : '✨ MỚI!'}</span>
        <span class="ar-reveal-emoji">${b.emoji}</span><b>${esc(b.name)}</b>
        <span class="ar-rarity">${C.RARITY[b.rarity].label}</span>${starsHtml(res.stars)}
        <small>${res.dupe ? `Trùng — hoàn lại 🪙 ${res.refund}` : `Linh vật mới trong ${esc(pk.name)}`}</small>
        ${res.set ? `<p class="ar-reveal-set">🏆 Đủ bộ ${esc(pk.name)}! +${res.set.bonus} 🪙</p>` : ''}
        ${res.pity ? '<p class="ar-reveal-note">🛡️ Nhờ bảo hiểm Sử thi</p>' : ''}</div>
      <div class="ar-row ar-center-row">
        <button type="button" class="ar-btn ar-btn-play" data-rv="again" ${canAgain ? '' : 'disabled'}>${again}</button>
        ${p.avatar === b.id ? '' : '<button type="button" class="ar-btn" data-rv="avatar">Làm ảnh đại diện</button>'}
        <button type="button" class="ar-btn ar-btn-ghost" data-rv="close">Đóng</button></div></div>`;
    const card = r.querySelector('.ar-reveal-card');
    FX.burst(card, R_SPARK[b.rarity], R_HIGH.includes(b.rarity) ? 16 : 6);
    if (res.set) setTimeout(() => FX.float(r.querySelector('.ar-reveal-set'), `+${res.set.bonus} 🪙`, 'gold'), 500);
    sfx(['legendary', 'mystery'].includes(b.rarity) ? 'critical' : res.set ? 'win' : 'match');
    if ((R_HIGH.includes(b.rarity) || res.set) && global.EduFX) global.EduFX.confetti({ count: b.rarity === 'epic' ? 70 : 130 });
    r.querySelector('[data-rv="again"]').focus();
    const tile = document.querySelector(`#arCollection [data-blook="${b.id}"]`);
    if (tile) FX.flash(tile, 'fx-bump');
  }
  function initPacks() {
    $('arPackList').addEventListener('click', (e) => {
      const b = e.target.closest('[data-pack]');
      if (b && !b.disabled) buy(b.dataset.pack);
    });
    $('arReveal').addEventListener('click', (e) => {
      const b = e.target.closest('[data-rv]');
      if (!b && e.target === $('arReveal') && RV && RV.stage === 'card') { closeReveal(); return; }
      if (!b || !RV) return;
      const act = b.dataset.rv;
      if (act === 'skip') revealCard();
      else if (act === 'again') buy(RV.pk.id);
      else if (act === 'close') closeReveal();
      else if (act === 'avatar') { profile().avatar = RV.res.blook.id; save(); renderPacks(); b.remove(); toast('Đã đổi Linh vật đại diện ' + RV.res.blook.emoji); }
    });
    document.addEventListener('keydown', (e) => {
      if (!RV) return;
      if (e.key === 'Escape') { closeReveal(); return; }
      if (RV.stage !== 'card' && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); revealCard(); }
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
    tug: '🪢 Kéo co', spell: '🔮 Đấu phép', heist: '🔐 Giải mã', dino: '🦖 Đào hoá thạch', moon: '🚀 Lên Mặt Trăng', boss: '🦠 Diệt Virus' };
  const KEY_OF = { speed: 'score', gold: 'gold', race: 'pos', survival: 'score', fish: 'kg', tug: 'pull', spell: 'dmg', heist: 'gems', dino: 'fossils', moon: 'km', boss: 'dmg' };
  const UNIT_OF = { score: 'điểm', gold: 'vàng', pos: 'bước', kg: 'kg', pull: 'lực kéo', dmg: 'sát thương', gems: 'đá quý', fossils: 'hoá thạch', km: 'nghìn km' };
  const POWER_MODES = ['speed', 'survival', 'moon']; // chế độ có vật phẩm hỗ trợ (kiểu Wayground)

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
    $('arGame').classList.remove('is-fever'); // trận trước bỏ ngang lúc đang bùng cháy
    // Số câu thật: không vượt số câu bộ có (trước đây mọi chế độ trừ Tốc độ lấy thẳng số câu chọn → lặp câu)
    const n = drill ? deck.length : C.playCount(S.prefs.count, deck.length);
    const p = profile();
    const me = { id: 'me', name: nickName(), face: avatarOf(p), score: 0, gold: 0, pos: 0, streak: 0, me: true };
    const nBots = { race: 3, heist: 3, tug: 5, boss: 3 }[mode] || 4; // Diệt Virus: đội 4 người
    const players = drill ? [me] : [me].concat(C.makeBots(nBots, rng, S.prefs.level));
    players.forEach((pl, i) => {
      Object.assign(pl, { kg: 0, frenzy: 0, hp: mode === 'spell' ? C.SPELL_HP : C.LIVES, pull: 0, dmg: 0, shield: false, gems: 0, fossils: 0, cheat: 0, lastGain: 0, km: 0 });
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
      mode, n, i: 0, players, me, ghost, best, bestKey, practice: !!drill,
      // Đua về đích / Lên Mặt Trăng cần nhiều lượt hơn số câu: hết bộ mới trộn lại, không lặp liền nhau
      deck: mode === 'race' ? C.extendDeck(deck, n * 3, rng) : mode === 'moon' ? C.extendDeck(deck, n * 2, rng) : deck.slice(0, n),
      limitMs: mode === 'gold' ? 0 : S.prefs.secs * 1000,
      goal: n, maxRounds: mode === 'race' ? n * 3 : mode === 'moon' ? n * 2 : n,
      log: [], trail: [], bestStreak: 0, correct: 0, startedAt: Date.now(), locked: false, phase: 'q',
      powers: [], x2: false, rope: 0, crack: {}, opened: 0, boost: 1, trackDrawn: false, busted: 0, cheats: 0,
    };
    // Diệt Virus: máu Trùm Virus theo số câu × số người (top = giai đoạn cao nhất đã tới)
    if (mode === 'boss') { const max = C.bossMaxHp(n, players.length); G.boss = { hp: max, max, top: 0, lastHeal: 0 }; }
    // Thử thách có thưởng xu (không có ở lượt Luyện câu sai): 1–2 Câu hỏi VÀNG + 1 Thử thách tốc độ (khi có giới hạn giờ).
    // Đua/Mặt Trăng không biết trước câu cuối → rải trong n câu đầu.
    G.goldAt = []; G.speedAt = -1; G.bonus = 0; G.chal = '';
    G.shield = false; G.goldNext = false; G.bet = false; G.betQ = false; // hiệu ứng thẻ bài đang chờ
    G.drawnAt = -1; // số câu đã trả lời lúc bốc thẻ gần nhất (mỗi mốc chỉ bốc 1 lần)
    if (!drill) {
      const span = Math.max(2, Math.min(G.maxRounds, n));
      const pool = Array.from({ length: span - 1 }, (_, k) => k + 1);
      for (let k = pool.length - 1; k > 0; k--) { const j = Math.floor(rng() * (k + 1)); [pool[k], pool[j]] = [pool[j], pool[k]]; }
      G.goldAt = pool.slice(0, span >= 10 ? 2 : 1);
      if (G.limitMs && pool.length > G.goldAt.length) G.speedAt = pool[G.goldAt.length];
    }
    G.climaxSeen = {}; G.pendingClimax = ''; G.hypeBefore = null;
    $('arGame').classList.remove('is-climax');
    $('arCaster').hidden = true;
    paintBonus(); paintCardFx();
    $('arTimerWrap').hidden = !G.limitMs;
    document.body.dataset.mode = mode;
    show('arGame');
    // Sân khấu có tranh thay cho đường đua/dây kéo co dạng chữ; lượt Luyện câu sai giữ gọn (không có cảnh)
    const scene = SC && !drill;
    $('arTrack').hidden = scene || (mode !== 'race' && mode !== 'tug');
    $('arScene').hidden = !scene;
    if (scene) SC.mount($('arScene'), G); else if (SC) SC.clear();
    sfx('click');
    nextQuestion();
  }

  function cur() { return G.deck[G.i % G.deck.length]; }

  function nextQuestion() {
    G.phase = 'intro'; G.locked = false; // 'intro': câu hỏi + ô đáp án đang hiện ra, chưa bấm được, chưa tính giờ
    const q = cur();
    $('arQNum').textContent = G.mode === 'race' || G.mode === 'moon' ? `Câu ${G.i + 1}` : `Câu ${G.i + 1}/${G.maxRounds}`;
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
    // Thử thách của câu này · câu cuối (chế độ biết trước số câu) → chữ lớn giữa màn hình trước khi tính giờ
    G.chal = G.goldAt.includes(G.i) || G.goldNext ? 'gold' : G.i === G.speedAt ? 'speed' : '';
    G.goldNext = false;
    G.betQ = G.bet; G.bet = false; // thẻ Đặt cược áp dụng cho câu này
    paintCardFx();
    const box = document.querySelector('#arGame .ar-qbox'), chal = $('arChal');
    box.classList.toggle('is-gold', G.chal === 'gold');
    chal.hidden = !G.chal;
    chal.className = 'ar-chal t-' + (G.chal || 'gold');
    chal.innerHTML = G.chal === 'gold' ? `<i class="fa-solid fa-crown" aria-hidden="true"></i> Câu hỏi vàng · đúng +${CHAL_XU} xu`
      : G.chal === 'speed' ? `<i class="fa-solid fa-bolt" aria-hidden="true"></i> Còn <b id="arChalS">${CHAL_MS / 1000}</b> giây · đúng +${CHAL_XU} xu` : '';
    const last = !G.practice && G.mode !== 'race' && G.mode !== 'moon' && G.maxRounds > 1 && G.i === G.maxRounds - 1;
    let big = true;
    if (D && G.chal === 'gold') D.banner('CÂU HỎI VÀNG', { tone: 'gold', icon: 'fa-crown', sub: `Trả lời đúng: +${CHAL_XU} xu` });
    else if (D && G.chal === 'speed') D.banner('THỬ THÁCH TỐC ĐỘ', { tone: 'speed', icon: 'fa-bolt', sub: `Đúng trong ${CHAL_MS / 1000} giây: +${CHAL_XU} xu` });
    else if (D && last) D.banner('CÂU CUỐI!', { tone: 'final', icon: 'fa-flag-checkered', sub: 'Câu quyết định thứ hạng' });
    else if (D && G.betQ) D.banner('ĐẶT CƯỢC!', { tone: 'final', icon: 'fa-dice', sub: `Đúng +${C.CARD_XU.betWin} xu · Sai −${C.CARD_XU.betLose} xu` });
    else if (D && HY && G.pendingClimax) { const cb = HY.CLIMAX[G.pendingClimax]; D.banner(cb.title, { tone: cb.tone, icon: cb.icon, sub: cb.sub, ms: 1500 }); G.pendingClimax = ''; }
    else big = false;
    if (big) sfx('whoosh');
    box.classList.remove('is-intro'); void box.offsetWidth; box.classList.add('is-intro');
    renderHud(); renderSide(); renderTrack(); renderPowers();
    const g = G, i = G.i;
    setTimeout(() => {
      if (G !== g || G.i !== i || G.phase !== 'intro') return;
      box.classList.remove('is-intro');
      G.phase = 'q';
      renderPowers();
      G.qStart = G.chalStart = performance.now(); // chalStart: vật phẩm Thêm giờ không kéo dài Thử thách tốc độ
      music(1);
      startTimer();
      liveStart();
    }, reducedMotion() ? 0 : big ? 1350 : 600);
  }

  function startTimer() {
    clearInterval(G.timer);
    if (!G.limitMs) return;
    const bar = $('arTimer');
    let lastSec = -1;
    G.timer = setInterval(() => {
      const left = Math.max(0, 1 - (performance.now() - G.qStart) / G.limitMs);
      bar.style.width = (left * 100) + '%';
      bar.classList.toggle('is-low', left < 0.25);
      // 5 giây cuối: tích tắc; 3 giây cuối: tim đập + viền đỏ nhấp nháy
      const sec = Math.ceil((left * G.limitMs) / 1000);
      if (left > 0 && sec <= 5 && sec !== lastSec) { lastSec = sec; sfx(sec <= 3 ? 'heartbeat' : 'tick'); }
      if (left > 0) music(sec > 5 ? 1 : sec > 2 ? 2 : 3);
      $('arGame').classList.toggle('is-tense', left > 0 && sec <= 3);
      if (G.chal === 'speed') {
        const s = Math.max(0, CHAL_MS - (performance.now() - G.chalStart));
        const el = $('arChalS'); if (el) el.textContent = Math.ceil(s / 1000);
        $('arChal').classList.toggle('is-miss', s <= 0);
      }
      if (left <= 0) answer(null);
    }, 100);
  }

  function answer(k) {
    if (!G || G.locked || G.phase !== 'q') return;
    G.locked = true;
    clearInterval(G.timer);
    music(0); // tắt nhạc để nghe trống dồn + đúng/sai
    $('arGame').classList.remove('is-tense');
    const now = performance.now();
    const chalMs = now - (G.chalStart || 0);
    const ms = Math.min(G.limitMs || Infinity, now - G.qStart);
    liveStop();
    if (k === null || k === undefined || reducedMotion() || G.practice) { reveal(k, ms, chalMs); return; }
    // Kiểu Kahoot: ô em chọn sáng lên + trống dồn một nhịp → mới lộ đúng/sai (thời gian đã chốt ở trên)
    G.phase = 'lock';
    if (G.picker) $('arAnswers').classList.add('is-locking');
    else document.querySelectorAll('#arAnswers .ar-ans').forEach((b) => { b.disabled = true; b.classList.toggle('is-locked', +b.dataset.k === k); });
    renderPowers();
    sfx('drumroll');
    const g = G;
    setTimeout(() => {
      if (G !== g || G.phase !== 'lock') return;
      G.phase = 'q';
      $('arAnswers').classList.remove('is-locking');
      reveal(k, ms, chalMs);
    }, SUSPENSE_MS);
  }

  function reveal(k, ms, chalMs) {
    const q = cur();
    if (HY) G.hypeBefore = HY.before(G, ranked(G.players.filter((p) => !p.ghost)));
    const ok = C.grade(q, k);
    const me = G.me;
    const streak0 = me.streak; // thẻ Khiên chuỗi: sai thì trả lại chuỗi này
    G.log.push({ q, chosen: k, ok });
    if (ok) G.correct++;
    // Chuỗi đúng: Đua (raceStep), Sinh tồn (survivalStep), Mặt Trăng (moonStep), Diệt Virus (bossHit) tự đếm — tránh cộng 2 lần.
    if (!['race', 'survival', 'moon', 'boss'].includes(G.mode)) me.streak = ok ? me.streak + 1 : 0;
    const alive0 = G.mode === 'boss' ? G.players.filter((p) => p.hp > 0).length : 0;
    const hit = G.mode === 'boss' ? C.bossHit(me, ok, ms, G.limitMs, C.bossPhase(G.boss.hp, G.boss.max), rng, G.i) : null;
    const life = G.mode === 'survival' ? C.survivalStep(me, ok, G.i) : hit ? hit.life : null;
    let bossEvt = null;
    if (G.picker) G.picker.result(k);
    else document.querySelectorAll('#arAnswers .ar-ans').forEach((b) => {
      const kk = +b.dataset.k;
      b.disabled = true;
      b.classList.toggle('is-correct', kk === q.correctIdx);
      b.classList.toggle('is-wrong', kk === k && !ok);
      b.classList.toggle('is-dim', kk !== q.correctIdx && kk !== k);
      b.classList.remove('is-locked');
    });
    sfx(life && life.out ? 'lose' : ok ? (me.streak >= 3 ? 'combo' : 'correct') : 'wrong');
    if (SC) SC.mood('me', ok);
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
    } else if (G.mode === 'moon') {
      const st = C.moonStep(me, ok, ms, G.limitMs, G.n, G.i);
      const gain = st.gain * (dbl === 2 && st.gain ? 1 : 0); // ✖️2: bay thêm 1 lần nữa (không vượt Mặt Trăng)
      if (gain) me.km = Math.min(C.MOON_KM, me.km + gain);
      if (me.km >= C.MOON_KM && me.landedAt === undefined) me.landedAt = G.i;
      const up = st.gain + gain;
      if (ok) pop = `🚀 +${up}`;
      botsMoon(events);
      const boost = C.moonBoost(me.streak);
      fb = ok ? `<b>+${up}</b> nghìn km${boost > 1 ? ` <span class="ar-tag up">🔥 tầng đẩy ×${boost}</span>` : ''}${x2Tag}`
          + (st.stage ? ` <span class="ar-tag up">🛰️ Qua Trạm ${C.MOON_STAGES.indexOf(st.stage) + 1}!</span>` : '')
          + (me.km >= C.MOON_KM ? ' <span class="ar-tag up">🌕 Em đã chạm Mặt Trăng!</span>' : '')
        : `${k === null ? 'Hết giờ' : 'Chưa đúng'} — chết máy${st.fell ? `, tụt <b>${st.fell}</b> nghìn km` : ' — đứng yên ở trạm'}`;
    } else if (G.mode === 'boss') {
      let dmg = hit.dmg;
      if (dbl === 2 && dmg) { me.dmg += dmg; dmg *= 2; } // ✖️2: đánh thêm 1 đòn y hệt
      me.lastCrit = hit.crit;
      if (ok) pop = hit.crit ? `💥 −${dmg}` : `⚔️ −${dmg}`;
      const team = botsBoss(events);
      bossEvt = C.bossRound(G.boss, dmg + team.total, (dmg ? 1 : 0) + team.ok, alive0);
      G.boss.lastHeal = bossEvt.heal;
      const combo = C.bossCombo(me.streak);
      fb = (ok ? `<b>−${dmg}</b> máu Virus${hit.crit ? ' <span class="ar-tag up">💥 Chí mạng!</span>' : ''}${combo > 1 ? ` <span class="ar-tag up">🔥 combo ×${combo.toFixed(1)}</span>` : ''}${x2Tag}`
        : `${k === null ? 'Hết giờ' : 'Chưa đúng'} — Virus đánh trả`)
        + (life.healed ? ' <span class="ar-tag up">💚 Hồi 1 tim!</span>' : '')
        + (life.out ? ' <span class="ar-tag">😵 Em đã gục!</span>' : life.lost ? ' <span class="ar-tag">💔 Mất 1 tim</span>' : '')
        + ` <span class="ar-fb-hp">${C.hearts(me.hp)}</span>`;
      events.unshift(bossEvt.ko ? `🎉 Cả đội gây ${bossEvt.dealt} sát thương — Trùm Virus đã bị diệt!`
        : `⚔️ Cả đội gây ${bossEvt.dealt} sát thương — Virus còn ${G.boss.hp}/${G.boss.max} máu`);
      if (bossEvt.heal) events.push(`🧬 Đội đúng chưa tới một nửa — Virus nhân bản, hồi ${bossEvt.heal} máu!`);
    } else if (G.mode === 'spell' || G.mode === 'heist' || G.mode === 'dino') {
      G.boost = C.spellBoost(ms, G.limitMs);
      const fast = G.boost >= 1.25 && G.mode !== 'dino' ? ` <span class="ar-tag up">⚡ nhanh ×${G.boost.toFixed(1)}</span>` : '';
      fb = ok ? `<b>Chính xác!</b> ${G.mode === 'spell' ? 'Chọn 1 phép' : 'Chọn việc làm'}${fast}:` : `${k === null ? 'Hết giờ' : 'Chưa đúng'} — mất lượt này`;
      if (G.mode === 'dino') me.lastGain = 0;
    } else {
      fb = ok ? '<b>Chính xác!</b> Chọn 1 rương:' : 'Chưa đúng — không có rương lần này';
    }
    G.bestStreak = Math.max(G.bestStreak, me.streak);
    const newRank = rankOf(me);
    const move = G.mode !== 'gold' && newRank < prevRank ? ` <span class="ar-tag up">▲ lên hạng ${newRank}</span>` : '';
    // Kiểu Wayground: đúng liền 3 câu → nhận 1 vật phẩm hỗ trợ.
    const got = ok && POWER_MODES.includes(G.mode) ? C.earnPowerup(G.powers, me.streak, rng) : '';
    const gotTag = got ? ` <span class="ar-tag up">🎁 Nhận ${C.POWERUPS[got].icon} ${C.POWERUPS[got].name}</span>` : '';
    // Thử thách: đúng (và đủ nhanh với Thử thách tốc độ) → +xu, cộng vào ví khi xong trận (bỏ cuộc thì mất như xu thường)
    let chalTag = '', chalWon = false;
    if (G.chal) {
      chalWon = ok && (G.chal === 'gold' || chalMs <= CHAL_MS);
      if (chalWon) { G.bonus += CHAL_XU; chalTag = ` <span class="ar-tag up">🪙 +${CHAL_XU} xu thử thách</span>`; }
      else chalTag = ` <span class="ar-tag">${G.chal === 'gold' ? 'Hụt Câu hỏi vàng' : ok ? 'Đúng nhưng quá 5 giây — hụt thử thách' : 'Hụt thử thách tốc độ'}</span>`;
    }
    // Thẻ bài đang có hiệu lực: Khiên chuỗi (sai vẫn giữ chuỗi) · Đặt cược (đúng +8 / sai −3 xu thưởng)
    let cardTag = '', betWon = false;
    if (!ok && G.shield && streak0 > 0) { me.streak = streak0; G.shield = false; cardTag += ` <span class="ar-tag up">🛡️ Khiên chuỗi giữ chuỗi ${streak0} câu</span>`; }
    if (G.betQ) {
      G.betQ = false;
      if (ok) { betWon = true; G.bonus += C.CARD_XU.betWin; cardTag += ` <span class="ar-tag up">🎲 Thắng cược +${C.CARD_XU.betWin} xu</span>`; }
      else { G.bonus = Math.max(0, G.bonus - C.CARD_XU.betLose); cardTag += ` <span class="ar-tag">🎲 Thua cược −${C.CARD_XU.betLose} xu</span>`; }
    }
    showFeedback(ok, fb + move + gotTag + chalTag + cardTag, q, k);
    if (events.length) $('arFbExtra').insertAdjacentHTML('beforeend', `<ul class="ar-events">${events.map((e) => `<li>${e}</li>`).join('')}</ul>`);
    renderHud(); renderSide(); renderTrack(); renderPowers();
    answerFx(q, k, ok, pop, life, newRank < prevRank);
    paintBonus(); paintCardFx();
    if (chalWon || betWon) {
      if (D) D.coinFly(chalWon ? $('arChal') : $('arFeedback'), $('arBonus'), 7);
      sfx('match');
    }
    // Chữ lớn: lên/mất ngôi đầu (từ câu 2, không tính Kéo co theo đội) · mốc chuỗi đúng 3/5/8
    if (D && !G.practice) {
      const solo = G.mode !== 'tug' && G.mode !== 'boss' && G.i >= 1; // 2 chế độ chơi theo đội
      if (bossEvt && bossEvt.ko) { D.banner('VIRUS ĐÃ BỊ DIỆT!', { tone: 'up', icon: 'fa-shield-virus', sub: 'Dữ liệu của cả đội an toàn!' }); sfx('critical'); }
      else if (bossEvt && bossEvt.newPhase) { const P = C.BOSS_PHASES[bossEvt.newPhase]; D.banner(`VIRUS ${P.name}!`, { tone: bossEvt.newPhase === 2 ? 'fire' : 'down', icon: 'fa-virus', sub: P.sub }); sfx('whoosh'); }
      else if (solo && newRank === 1 && prevRank > 1) { D.banner('EM DẪN ĐẦU!', { tone: 'up', icon: 'fa-crown', sub: 'Giữ vững ngôi đầu nhé!' }); sfx('critical'); }
      else if (solo && prevRank === 1 && newRank > 1) D.banner('BỊ VƯỢT MẶT!', { tone: 'down', icon: 'fa-person-running', sub: `Tụt xuống hạng ${newRank} — gỡ lại ngay!` });
      else if (ok && [3, 5, 8].includes(me.streak)) D.banner(`CHUỖI ${me.streak} CÂU!`, { tone: 'fire', icon: 'fa-fire', sub: me.streak >= 8 ? 'Không ai cản nổi!' : me.streak >= 5 ? 'Bất bại!' : 'Đang nóng tay!' });
    }
    if (G.mode === 'gold' && ok) { showChests(); return; }
    if (G.mode === 'spell' && ok) { showSpells(); return; }
    if (G.mode === 'heist' && ok) { showHeist(); return; }
    if (G.mode === 'dino' && ok) { showDino(); return; }
    if (G.mode === 'gold') botsGold([]);
    if (G.mode === 'spell') botsSpell();
    if (G.mode === 'heist') botsHeist();
    if (G.mode === 'dino') botsDino();
    afterAnswer();
  }

  /** Hiệu ứng sau khi chấm: ô đúng nảy, số bay lên từ ô em chọn, HUD nảy/đỏ/xanh theo kết quả. */
  function answerFx(q, k, ok, pop, life, rankUp) {
    const tile = Number.isInteger(k) ? document.querySelector(`#arAnswers .ar-ans[data-k="${k}"]`) : $('arAnswers').querySelector('.ar-kind-go');
    const P = global.EduParty;
    const right = C.kindOf(q) === 'choice' ? document.querySelector(`#arAnswers .ar-ans[data-k="${q.correctIdx}"]`) : $('arAnswers');
    // Chuỗi ≥ 5 câu: viền khung câu hỏi bốc lửa cho tới khi sai (js/arena/arena.css .is-fever)
    $('arGame').classList.toggle('is-fever', ok && G.me.streak >= 5);
    if (P) P.flash(ok ? (G.me.streak >= 5 ? 'gold' : 'good') : 'bad');
    if (ok) {
      FX.flash(right, 'fx-correct');
      FX.burst(right, G.me.streak >= 5 ? ['🔥', '⭐', '✨'] : ['✨', '⭐'], G.me.streak >= 3 ? 12 : 8);
      if (G.me.streak >= 3) sfx('sparkle');
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
    if (C.kindOf(q) === 'choice') return `<div class="ar-fb-ans">Đáp án đúng: <b class="ar-hl">${SHAPES[q.correctIdx]} ${esc(q.options[q.correctIdx])}</b><span class="ar-memo">Ghi nhớ!</span></div>`;
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
    if (G.hypeBefore) { const b = G.hypeBefore; G.hypeBefore = null; if (!done) hypeAfter(b); }
    const extra = $('arFbExtra');
    // Mỗi 3 câu, đúng ≥ 2 câu → được bốc 1 thẻ bài trước khi sang câu sau
    if (!done && !G.practice && CD && G.drawnAt !== G.log.length && C.cardCheckpoint(G.log)) {
      const right = G.log.slice(-C.CARD_EVERY).filter((x) => x.ok).length;
      G.phase = 'draw';
      extra.insertAdjacentHTML('beforeend', `<button type="button" class="ar-btn ar-btn-play ar-draw" id="arDraw"><i class="fa-solid fa-layer-group" aria-hidden="true"></i> Bốc thẻ bài! <small>đúng ${right}/${C.CARD_EVERY} câu</small> <kbd>Enter</kbd></button>`);
      $('arDraw').addEventListener('click', drawCard);
      $('arDraw').focus({ preventScroll: true });
      sfx('whoosh');
      return;
    }
    extra.insertAdjacentHTML('beforeend', `<button type="button" class="ar-btn ar-btn-play ar-next" id="arNext">${done ? '🏆 Xem kết quả' : 'Câu tiếp ▶'} <kbd>Enter</kbd></button>`);
    $('arNext').addEventListener('click', next);
    $('arNext').focus({ preventScroll: true });
  }
  /** Bốc thẻ: 3 lá hợp với trận này (EduArenaCore.drawCards) → em chọn → áp hiệu ứng → hiện nút Câu tiếp. */
  async function drawCard() {
    if (!G || G.phase !== 'draw') return;
    G.phase = 'cards';
    G.drawnAt = G.log.length;
    const g = G;
    const ids = C.drawCards(rng, { x2: POWER_MODES.includes(G.mode) || G.mode === 'boss', time: !!G.limitMs, full: G.powers.length >= C.POWER_MAX });
    const id = await CD.open(ids);
    if (G !== g) return; // đã bỏ cuộc trong lúc bốc
    const btn = $('arDraw'); if (btn) btn.remove();
    applyCard(id);
    afterAnswer();
  }
  function applyCard(id) {
    const c = C.CARDS[id];
    if (id === 'fifty' || id === 'time' || id === 'x2') G.powers.push(id);
    else if (id === 'shield') G.shield = true;
    else if (id === 'gold') G.goldNext = true;
    else if (id === 'bet') G.bet = true;
    else if (C.CARD_XU[id]) {
      G.bonus += C.CARD_XU[id];
      paintBonus();
      if (D) D.coinFly($('arFeedback'), $('arBonus'), id === 'jackpot' ? 12 : 6);
      sfx('match');
    }
    renderPowers(); paintCardFx();
    const tone = { power: 'speed', guard: 'up', gold: 'gold', risk: 'final', coin: 'gold', rare: 'fire' }[c.tone];
    if (D) D.banner(c.name, { tone, icon: c.fa, sub: c.desc, ms: 1600 });
  }
  /** Ô xu thưởng trên thanh trên (thử thách + thẻ bài) — cộng vào ví khi xong trận. */
  function paintBonus() {
    const el = $('arBonus');
    el.hidden = !G || !G.bonus;
    if (!el.hidden) el.innerHTML = `🪙 +${G.bonus} <small>xu thưởng</small>`;
  }
  /** Thẻ đang có hiệu lực (Khiên chuỗi · Đặt cược · Câu vàng kế tiếp) trên thanh trên. */
  function paintCardFx() {
    const el = $('arCardFx');
    const on = G ? [G.shield && '<i class="fa-solid fa-shield-halved" aria-hidden="true"></i> Khiên chuỗi',
      (G.bet || G.betQ) && '<i class="fa-solid fa-dice" aria-hidden="true"></i> Đặt cược',
      G.goldNext && '<i class="fa-solid fa-crown" aria-hidden="true"></i> Câu vàng kế tiếp'].filter(Boolean) : [];
    el.hidden = !on.length;
    el.innerHTML = on.join(' · ');
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
    if (G.mode === 'moon') return G.players.some((p) => p.km >= C.MOON_KM);
    if (G.mode === 'boss') return G.boss.hp <= 0 || G.me.hp <= 0;
    // Sinh tồn: em hết tim, hoặc mọi đối thủ đã bị loại (lượt 1 mình → chơi hết câu).
    if (G.mode === 'survival') return G.me.hp <= 0 || (G.players.length > 1 && G.players.every((p) => p.me || p.hp <= 0));
    if (G.mode === 'spell') return G.me.hp <= 0 || G.players.every((p) => p.me || p.hp <= 0);
    if (G.mode === 'tug') return Math.abs(G.rope) >= C.TUG_GOAL;
    return false;
  }

  // ── Không khí trận đấu (js/arena/arena-hype.js) ──
  /** Trong lúc em nghĩ: từng bạn máy lần lượt "chốt đáp án" (chỉ là hình — kết quả bạn máy vẫn tính lúc chấm). */
  function liveStart() {
    liveStop();
    if (!G || G.practice) return;
    const bots = G.players.filter((p) => p.bot && !p.ghost && !((G.mode === 'survival' || G.mode === 'spell' || G.mode === 'boss') && !(p.hp > 0)));
    if (!bots.length) return;
    const lim = G.limitMs || 12000, g = G, i = G.i;
    const live = { n: bots.length, done: 0, t: [] };
    G.live = live;
    paintLive();
    bots.forEach((b) => {
      const at = lim * Math.min(0.95, Math.max(0.12, (b.speed || 0.5) + (Math.random() - 0.5) * 0.3));
      live.t.push(setTimeout(() => {
        if (G !== g || G.i !== i || G.phase !== 'q' || G.live !== live) return;
        live.done++;
        if (SC) SC.lockIn(b.id, true);
        paintLive();
        if (live.done === live.n) sfx('tick');
      }, at));
    });
  }
  function liveStop() {
    if (G && G.live) { G.live.t.forEach(clearTimeout); G.live = null; }
    $('arLive').hidden = true;
    if (SC) SC.lockIn(null, false);
  }
  function paintLive() {
    const L = G.live, el = $('arLive');
    el.hidden = false;
    const all = L.done === L.n;
    el.classList.toggle('is-hot', all);
    el.innerHTML = all ? `<i class="fa-solid fa-hourglass-end" aria-hidden="true"></i> ${G.mode === 'boss' ? 'Đồng đội đã chốt hết — chờ em!' : 'Mọi người đã chốt — chỉ còn em!'}`
      : `<i class="fa-solid fa-user-check" aria-hidden="true"></i> ${G.mode === 'boss' ? 'Đồng đội' : 'Đã chốt'} ${L.done}/${L.n}`;
  }
  /** Sau mỗi lượt: lời bình viên, bạn máy trêu khi vượt/bị vượt, ghi nhận cao trào (chữ lớn ở đầu câu sau). */
  function hypeAfter(b) {
    if (!HY || G.practice) return;
    const c = HY.commentary(G, b, ranked(G.players.filter((p) => !p.ghost)));
    const g = G;
    if (c.climax && !G.climaxSeen[c.climax]) {
      G.climaxSeen[c.climax] = true;
      G.pendingClimax = c.climax;
      $('arGame').classList.add('is-climax');
    }
    setTimeout(() => {
      if (G !== g) return;
      const el = $('arCaster');
      el.hidden = !c.text;
      if (c.text) { el.innerHTML = `<i class="fa-solid fa-microphone-lines" aria-hidden="true"></i> <span>${esc(c.text)}</span>`; FX.flash(el, 'fx-caster'); }
      if (c.taunt && SC) SC.talk(c.taunt.id, c.taunt.text, 1800, c.taunt.hot);
    }, reducedMotion() ? 0 : 700);
  }

  // ── Vật phẩm hỗ trợ (kiểu Wayground) ──
  function renderPowers() {
    const box = $('arPowers');
    box.hidden = !G || (!G.powers.length && !G.x2); // vật phẩm tự có (Tốc độ/Sinh tồn/Mặt Trăng) hoặc từ thẻ bài (mọi chế độ)
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

  // ── Diệt Virus ──
  /** Đồng đội máy cùng đánh Virus. Trả { total: tổng sát thương, ok: số bạn đánh trúng }. */
  function botsBoss(events) {
    const ph = C.bossPhase(G.boss.hp, G.boss.max);
    let total = 0, ok = 0;
    G.players.forEach((p) => {
      if (!p.bot || p.hp <= 0) return;
      const a = C.botAnswer(p, G.limitMs || 20000, rng);
      const h = C.bossHit(p, a.correct, a.ms, G.limitMs, ph, rng, G.i);
      p.lastCrit = h.crit;
      total += h.dmg;
      if (h.dmg) ok++;
      if (h.crit) events.push(`💥 ${who(p)} chí mạng −${h.dmg}!`);
      if (h.life.out) events.push(`😵 ${who(p)} đã gục — còn ${G.players.filter((x) => x.hp > 0).length} người trụ`);
    });
    return { total, ok };
  }

  // ── Lên Mặt Trăng ──
  function botsMoon(events) {
    G.players.forEach((p) => {
      if (!p.bot) return;
      const a = C.botAnswer(p, G.limitMs, rng);
      const st = C.moonStep(p, a.correct, a.ms, G.limitMs, G.n, G.i);
      if (st.landed && st.gain) events.push(`🌕 ${who(p)} đã chạm Mặt Trăng!`);
      else if (st.stage) events.push(`🛰️ ${who(p)} qua Trạm ${C.MOON_STAGES.indexOf(st.stage) + 1}`);
    });
  }

  // ── Đào hoá thạch ──
  function showDino() {
    G.phase = 'pick';
    $('arFbExtra').innerHTML = '';
    const acts = ['dig', 'cheat', 'inspect'];
    pickRow('ar-dino', [
      { icon: '⛏️', name: 'Đào thật', sub: 'Chọn 1 trong 3 tảng đá' },
      { icon: '🤫', name: 'Ăn gian', sub: `Hoá thạch ×${C.DINO_CHEAT} — nhưng ${C.DINO_CHEAT_TURNS} lượt tới bị kiểm tra là mất ${C.DINO_FINE * 100}%` },
      { icon: '🔍', name: 'Kiểm tra 1 bạn', sub: `Bắt quả tang bạn ăn gian → lấy ${C.DINO_FINE * 100}% hoá thạch của bạn đó` },
    ]).forEach((b, k) => b.addEventListener('click', () => pickDino(acts[k])));
  }
  function pickDino(act) {
    if (!G || G.phase !== 'pick') return;
    const me = G.me;
    if (act === 'inspect') {
      const foes = G.players.filter((p) => !p.me);
      pickRow('ar-targets', foes.map((p) => ({ icon: p.face, name: p.name,
        sub: `${p.fossils} 🦴${p.lastGain ? ` · vừa đào <b>+${p.lastGain}</b>${p.lastGain >= 90 ? ' 🤨' : ''}` : ''}` })), '🔍 Kiểm tra ai? <small>(bạn vừa đào được nhiều bất thường có thể đang ăn gian)</small>')
        .forEach((b, k) => b.addEventListener('click', () => {
          if (!G || G.phase !== 'pick') return;
          const t = foes[k];
          const r = C.inspect(me, t);
          if (r.caught) {
            G.busted++;
            fbMsg(`🚨 Bắt quả tang ${who(t)} ăn gian — em lấy <b>${r.take} 🦴</b>!`, true);
            for (let n = 0; n < 4; n++) FX.fly(anchorOf(t), $('arStat'), '🦴', { delay: n * 90, ms: 550 });
            if (SC) SC.talk(t.id, 'Ối, bị lộ rồi!', 1500, true);
            sfx('critical');
          } else {
            FX.flash(fbMsg(`😇 ${who(t)} đào trung thực — em mất lượt này`, false), 'fx-wrong');
            if (SC) SC.talk(t.id, 'Mình trung thực mà!', 1400);
            sfx('wrong');
          }
          endDinoTurn();
        }));
      return;
    }
    const rocks = C.rollRocks(rng);
    const cheat = act === 'cheat';
    const btns = pickRow('ar-rocks', rocks.map((_, k) => ({ icon: '🪨', name: `Tảng ${k + 1}` })), cheat ? '🤫 Ăn gian — chọn 1 tảng (được ×3):' : '⛏️ Chọn 1 tảng đá để đào:');
    btns.forEach((b, k) => b.addEventListener('click', () => {
      if (!G || G.phase !== 'pick') return;
      G.phase = 'chosen';
      const gain = C.digRock(me, rocks[k], cheat);
      me.lastGain = gain;
      if (cheat) G.cheats++;
      // Lật cả 3 tảng (như rương Săn vàng) để em thấy mình chọn hên hay xui
      rocks.forEach((v, j) => {
        const L = C.rockLabel(v);
        btns[j].disabled = true;
        btns[j].classList.add(j === k ? 'is-picked' : 'is-other');
        btns[j].innerHTML = `<span aria-hidden="true">${L.icon}</span><b>${v} 🦴</b><small>${esc(L.title)}</small>`;
      });
      fbMsg(gain ? `${C.rockLabel(rocks[k]).icon} Em đào được <b>${gain} 🦴</b>${cheat ? ` <span class="ar-tag">🤫 ×${C.DINO_CHEAT} — cẩn thận bị kiểm tra!</span>` : ''}` : '🪨 Tảng đá trống — lần sau may hơn!', gain > 0);
      if (gain) { FX.float(btns[k], `+${gain}`, 'gold'); FX.burst(btns[k], ['🦴', '✨'], gain >= 90 ? 12 : 6); }
      if (rocks[k] >= 120 && global.EduFX) global.EduFX.confetti({ count: 60 });
      sfx(gain ? (gain >= 90 ? 'critical' : 'match') : 'flip');
      $('arFbExtra').querySelectorAll('.ar-pick-prompt').forEach((el) => el.remove());
      endDinoTurn(true);
    }));
  }
  function endDinoTurn(keepRocks) {
    G.phase = 'chosen';
    if (!keepRocks) lockPicks();
    else $('arFbExtra').querySelectorAll('.ar-pick').forEach((el) => el.classList.remove('ar-pick')); // giữ 3 tảng đã lật
    botsDino();
    afterAnswer();
  }
  /** Bạn máy: đào (có lúc ăn gian) hoặc kiểm tra người vừa đào nhiều — có thể bắt quả tang em. */
  function botsDino() {
    const events = [];
    const acts = G.players.filter((p) => p.bot).map((p) => {
      p.lastGain = 0;
      const a = C.botAnswer(p, G.limitMs, rng);
      return a.correct ? { p, d: C.botDino(p, G.players, rng) } : null;
    }).filter(Boolean);
    acts.forEach(({ p, d }) => {
      if (d.act === 'dig') { p.lastGain = C.digRock(p, C.rollRocks(rng)[d.rock], d.cheat); return; }
      const r = C.inspect(p, d.target);
      if (r.caught && d.target.me) {
        events.push(`🚨 ${who(p)} kiểm tra em — bắt quả tang em ăn gian, lấy ${r.take} 🦴!`);
        sfx('lose');
        for (let n = 0; n < 4; n++) FX.fly($('arStat'), anchorOf(p), '🦴', { delay: 400 + n * 90, ms: 550 });
      } else if (r.caught) events.push(`🚨 ${who(p)} bắt quả tang ${who(d.target)} ăn gian, lấy ${r.take} 🦴`);
      else if (d.target.me) events.push(`🔍 ${who(p)} kiểm tra em — em trung thực, bạn ấy mất lượt`);
    });
    C.tickCheat(G.players);
    fbEvents(events);
    renderHud(); renderSide();
  }

  // ── Bảng xếp hạng / HUD / đường đua ──
  /** Xếp hạng theo chế độ (Sinh tồn: tim → trụ lâu → điểm). */
  function ranked(list) {
    if (G.mode === 'survival') return list.slice().sort(C.survivalOrder);
    if (G.mode === 'spell') return list.slice().sort(C.spellOrder);
    if (G.mode === 'moon') return list.slice().sort(C.moonOrder);
    if (G.mode === 'boss') return list.slice().sort(C.bossOrder);
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
      : G.mode === 'dino' ? `🦴 ${me.fossils.toLocaleString('vi-VN')} hoá thạch${me.cheat > 0 ? ` <span class="ar-tag">🤫 đang ăn gian · còn ${me.cheat} lượt</span>` : ''}`
      : G.mode === 'moon' ? `🚀 ${me.km}/${C.MOON_KM} nghìn km${C.moonBoost(me.streak) > 1 ? ` <span class="ar-tag up">🔥 ×${C.moonBoost(me.streak)}</span>` : ''}`
      : G.mode === 'boss' ? `<span class="ar-hud-hp">${C.hearts(me.hp)}</span> ⚔️ ${me.dmg} · 🦠 <span class="ar-hpbar is-virus" aria-hidden="true"><i style="width:${(G.boss.hp / G.boss.max) * 100}%"></i></span> ${G.boss.hp}/${G.boss.max}`
      : `🏁 ${me.pos}/${G.goal} bước`;
    const rv = $('arRival');
    const line = HY && !G.practice ? HY.rivalLine(G, ranked(G.players.filter((p) => !p.ghost))) : '';
    rv.hidden = !line;
    if (rv.textContent !== line) { rv.textContent = line; if (line) FX.flash(rv, 'fx-bump'); }
    if (SC && !G.practice) SC.aura('me', me.streak >= 3);
    const s = $('arStreak');
    s.hidden = me.streak < 2;
    s.textContent = `🔥 Chuỗi ${me.streak}`;
  }
  function renderSide() {
    const key = KEY_OF[G.mode];
    const unit = UNIT_OF[key];
    const surv = G.mode === 'survival' || G.mode === 'boss', spell = G.mode === 'spell'; // Diệt Virus: tim như Sinh tồn
    const extra = (p) => (surv ? ` <span class="ar-board-hp">${C.hearts(p.hp)}</span>`
      : G.mode === 'tug' ? ` <span class="ar-team-dot is-${p.team}" title="${C.TEAMS[p.team].name}"></span>` : '');
    // Dòng phụ dưới tên (không bị cắt khi tên dài): thanh máu / số ô két em đã mở.
    const sub = (p) => (spell ? `<span class="ar-board-sub"><span class="ar-hpbar" title="${p.hp} máu"><i style="width:${p.hp}%"></i></span> ${p.hp}${p.shield ? ' 🛡️' : ''}</span>`
      : G.mode === 'heist' && !p.me ? `<span class="ar-board-sub" title="Em đã mở ${C.crackOf(G.crack, 'me', p.id).pos}/${C.VAULT_LEN} ô két bạn này">${locks(C.crackOf(G.crack, 'me', p.id).pos)}</span>`
      : G.mode === 'dino' && p.lastGain ? `<span class="ar-board-sub">vừa đào +${p.lastGain}${p.lastGain >= 90 && !p.me ? ' 🤨' : ''}</span>`
      : G.mode === 'moon' ? `<span class="ar-board-sub">${p.km >= C.MOON_KM ? '🌕 đã tới Mặt Trăng' : `<span class="ar-hpbar is-moon"><i style="width:${Math.round((p.km / C.MOON_KM) * 100)}%"></i></span> ${C.moonFloor(p.km) ? `Trạm ${C.MOON_STAGES.indexOf(C.moonFloor(p.km)) + 1}` : 'bệ phóng'}`}</span>` : '');
    FX.flip($('arSide'), () => { $('arSide').innerHTML = `<h3>${G.practice ? '🔁 Luyện câu sai' : MODE_LABEL[G.mode]} <small>· ${unit}</small></h3><ol class="ar-board">${ranked(G.players).map((p, i) => `<li data-key="${p.id}" class="${p.me ? 'is-me' : ''}${p.ghost ? ' is-ghost' : ''}${(surv || spell) && p.hp <= 0 ? ' is-out' : ''}">
      <span class="ar-board-rank">${i + 1}</span><span class="ar-board-face">${p.face}</span>
      <span class="ar-board-name">${esc(p.name)}${extra(p)}</span><b>${p[key].toLocaleString('vi-VN')}</b>${sub(p)}</li>`).join('')}</ol>`; });
    if (SC && G && !G.practice) SC.sync(G);
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
    if (SC) SC.clear();
    clearInterval(G.timer);
    liveStop();
    $('arGame').classList.remove('is-climax');
    $('arCaster').hidden = true;
    const key = KEY_OF[G.mode];
    const board = ranked(G.players.filter((p) => !p.ghost));
    const won = C.tugWinner(G.rope);
    // Kéo co tính theo đội: đội em thắng (hoặc hoà) = hạng 1, thua = hạng 2.
    // Diệt Virus: cả đội diệt được Virus = hạng 1, không diệt được = hạng chót (xu thưởng thấp nhất).
    const bossWin = G.mode === 'boss' && G.boss.hp <= 0;
    const place = G.mode === 'tug' ? (won === 'blue' ? 2 : 1) : G.mode === 'boss' ? (bossWin ? 1 : board.length) : board.indexOf(G.me) + 1;
    const mvp = G.mode === 'boss' && board[0] === G.me;
    const total = G.log.length;
    const p = profile();
    const coins = C.coinsFor({ correct: G.correct, place, players: G.mode === 'tug' ? 2 : board.length });
    p.coins += coins + (G.bonus || 0);
    p.games = (p.games || 0) + 1;
    addDaily(G.correct);
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
      : G.mode === 'dino' && place === 1 ? `🏆 ${nickName()} là Nhà khảo cổ số 1!`
      : G.mode === 'moon' && place === 1 && G.me.km >= C.MOON_KM ? `🚀 ${nickName()} chạm Mặt Trăng đầu tiên!`
      : G.mode === 'moon' && place === 1 ? `🏆 ${nickName()} bay cao nhất!`
      : G.mode === 'boss' && bossWin ? (mvp ? `🏆 Cả đội đã diệt Trùm Virus — ${nickName()} là MVP!` : `🛡️ Cả đội đã diệt Trùm Virus! Em gây ${G.me.dmg} sát thương`)
      : G.mode === 'boss' && G.me.hp <= 0 ? `😵 Em đã gục — Virus còn ${Math.round((G.boss.hp / G.boss.max) * 100)}% máu. Thử lại nhé!`
      : G.mode === 'boss' ? `🦠 Hết câu — Virus còn ${Math.round((G.boss.hp / G.boss.max) * 100)}% máu. Lần sau cả đội dồn sức nhé!`
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
      ${G.mode === 'dino' ? `<div><b>${G.busted}</b><span>lần em bắt quả tang${G.cheats ? ` · em ăn gian ${G.cheats} lần` : ''}</span></div>` : ''}
      ${G.mode === 'moon' ? `<div><b>${Math.round((G.me.km / C.MOON_KM) * 100)}%</b><span>${G.me.km >= C.MOON_KM ? 'đã tới Mặt Trăng' : 'quãng đường tới Mặt Trăng'}</span></div>` : ''}
      ${G.mode === 'boss' ? `${bossWin ? `<div><b>${total}</b><span>câu để diệt Virus</span></div>` : `<div><b>${Math.round((G.boss.hp / G.boss.max) * 100)}%</b><span>máu Virus còn lại</span></div>`}<div><b>${C.hearts(G.me.hp)}</b><span>${mvp ? 'MVP của đội' : `hạng ${board.indexOf(G.me) + 1}/${board.length} sát thương`}</span></div>` : ''}
      ${G.mode === 'tug' ? `<div><b>${Math.abs(G.rope)}/${C.TUG_GOAL}</b><span>${won ? `dây lệch về ${C.TEAMS[won].name}` : 'dây cân bằng'}</span></div>` : ''}
      <div class="is-coin"><b>+${coins} 🪙</b><span>xu (đang có ${p.coins})</span></div>
      ${G.bonus ? `<div class="is-coin"><b>+${G.bonus} 🪙</b><span>xu thử thách</span></div>` : ''}
      ${dailyStat()}`;
    const rv = $('arReview');
    rv.hidden = !wrong.length;
    rv.open = true; // mở sẵn để em thấy xấp thẻ lật ôn
    const booked = toBook(nickName(), G.log, (G.practice ? 'Đấu trường · Luyện câu sai' : 'Đấu trường · ' + (SRC.title || '')));
    rv.innerHTML = reviewHtml(wrong);
    $('arBookNote').innerHTML = bookNoteHtml(booked);
    paintPracticeBtn($('arPractice'), wrong.length);
    show('arEnd');
    if (D) { D.hide(); D.countUp($('arEndStats')); }
    refreshWallet();
    const win = G.practice ? !wrong.length : G.mode === 'boss' ? bossWin : place === 1 && !(G.mode === 'tug' && !won);
    sfx(win ? 'win' : G.practice || place <= 3 ? 'match' : 'lose');
    $('arGame').classList.remove('is-fever');
    celebrate(win ? 1 : G.practice ? 0 : place);
    G.phase = 'end';
  }

  /** Kết trận: hạng 1 → pháo hoa + mưa ruy băng + vỗ tay; hạng 2–3 → mưa ruy băng; còn lại im lặng. Dùng chung cho Phòng cả lớp. */
  function celebrate(place) {
    const P = global.EduParty;
    if (!P) { if (place === 1 && global.EduFX) global.EduFX.confetti({ count: 120 }); return; }
    if (place === 1) { P.flash('gold'); P.fireworks({ shells: 9, ms: 3000 }); P.rain({ count: 120 }); setTimeout(() => sfx('cheer'), 500); }
    else if (place === 2 || place === 3) { P.rain({ count: 80 }); setTimeout(() => sfx('cheer'), 300); }
  }

  /** Danh sách câu sai (dùng chung cho màn kết thúc 1 người và Phòng cả lớp). log: [{ q, chosen, ok }]. */
  // ── Sổ tay câu sai (js/services/wrongbook-store.js) — chơi xong vẫn có lịch ôn cách quãng ở Góc học tập ──
  /**
   * Ghi kết quả trận vào Sổ tay: câu sai → hộp 1 (ôn ngay), câu đã có trong sổ mà trả lời đúng ĐÚNG HẠN → lên hộp.
   * Câu bộ ngân hàng: lưu nguyên câu gốc (tra theo uid) để ôn ở trang chủ y như bài làm; còn lại dựng câu chọn 1.
   * log: [{ q: câu Đấu trường, ok }]. Trả { added, up, mastered }.
   */
  function toBook(name, log, src) {
    const W = global.EduWrongbook;
    const nm = String(name || '').trim();
    if (!W || !nm || nm === 'Em' || !log || !log.length) return null;
    const raw = new Map((SRC.questions || []).filter((q) => q && q.uid && q.question).map((q) => [q.uid, q]));
    const results = log.map((x) => {
      const c = x.q || {};
      const r = c.uid && raw.get(c.uid);
      if (r) return { q: r, ok: !!x.ok, partial: r.type === 'truefalse' || r.type === 'list' }; // 1 ý của câu nhiều ý
      if (C.kindOf(c) !== 'choice' || !Array.isArray(c.options) || !c.options[c.correctIdx]) return null;
      // Xếp phương án theo chữ: cùng 1 câu chơi nhiều lần (đảo thứ tự) vẫn là 1 mục trong sổ
      return { q: { type: 'single', question: c.text, options: c.options.slice().sort(), correct: [c.options[c.correctIdx]], explanation: c.expl || '', imageUrl: c.img || '' }, ok: !!x.ok };
    }).filter(Boolean);
    const st = W.findByName(nm) || { name: nm, cls: '', school: '' };
    const r = W.record(st, results, { src: String(src || '').slice(0, 120), dueOnly: true });
    r.st = st;
    return r;
  }
  /** Link mở thẳng Sổ tay câu sai của em ở trang chủ (js/learning-hub.js openFromLink). */
  function bookLink(st) { return 'index.html?goc=sotay' + (st && st.key ? '&hs=' + encodeURIComponent(st.key) : ''); }
  function bookNoteHtml(r) {
    if (!r || !(r.added || r.up || r.mastered)) return '';
    const bits = [r.added && `ghi <b>${r.added}</b> câu sai mới`, r.up && `<b>${r.up}</b> câu ôn đúng hạn được lên hộp`, r.mastered && `<b>${r.mastered}</b> câu đã thuộc hẳn`].filter(Boolean);
    return `<p class="ar-book-note"><i class="fa-solid fa-book-bookmark" aria-hidden="true"></i> Sổ tay câu sai: ${bits.join(' · ')}. <a href="${esc(bookLink(r.st))}">Mở Sổ tay để ôn cách quãng</a> cho nhớ lâu.</p>`;
  }
  /** Màn chọn (Chơi một mình): nhắc số câu trong Sổ tay đã đến hạn ôn của biệt danh đang nhập. */
  function paintDue() {
    const el = $('arDue'), W = global.EduWrongbook;
    if (!el) return;
    const st = W && W.findByName($('arNick').value);
    const now = Date.now();
    const n = st ? Object.values(W.studentBook(st.key).items || {}).filter((it) => it.due <= now).length : 0;
    el.hidden = !n;
    if (n) el.innerHTML = `<i class="fa-solid fa-book-bookmark" aria-hidden="true"></i> Em có <b>${n}</b> câu trong Sổ tay đến hạn ôn — <a href="${esc(bookLink(st))}">ôn ngay</a> cho nhớ lâu, rồi quay lại chiến tiếp!`;
  }
  function reviewHtml(wrong) {
    const F = global.EduArenaFlash; // xấp thẻ lật ôn nhanh (js/arena/arena-flash.js)
    // Có xấp thẻ: danh sách đáp án thu gọn — để em tự nhớ lại trước khi xem (thẻ lật mới là chỗ ôn chính)
    const flash = F ? F.html(wrong) : '';
    return `<summary>📒 Xem lại ${wrong.length} câu sai</summary>${flash}${flash ? '<details class="ar-review-all"><summary>Xem cả danh sách đáp án</summary>' : ''}<ol>${wrong.map((x) => `<li><b>${esc(x.q.text)}</b>
      <span>${C.kindOf(x.q) === 'choice' ? '' : `<i class="ar-review-kind">${C.KIND_ICON[C.kindOf(x.q)]} ${C.KIND_LABEL[C.kindOf(x.q)]}</i> `}Đáp án đúng: <em class="ar-review-ok">${C.answerLines(x.q).map(esc).join(' · ')}</em>${C.chosenLines(x.q, x.chosen).length ? ` · em chọn: ${C.chosenLines(x.q, x.chosen).map(esc).join(' · ')}` : ' · em chưa trả lời'}</span>
      ${x.q.expl ? `<small>💡 ${esc(x.q.expl)}</small>` : ''}</li>`).join('')}</ol>${flash ? '</details>' : ''}`;
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
    if (SC) SC.clear();
    if (D) D.hide();
    if (CD) CD.close();
    liveStop();
    $('arGame').classList.remove('is-tense', 'is-climax');
    G = null;
    show('arHome');
  }

  // ============================================================
  // PHÍM TẮT + KHỞI ĐỘNG
  // ============================================================
  document.addEventListener('keydown', (e) => {
    if (!G || $('arGame').hidden || /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
    if (CD && CD.isOpen()) { if (CD.key(e)) e.preventDefault(); return; } // đang bốc thẻ: 1/2/3, Enter
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
    else if (G.phase === 'pick' && n >= 1) { // Đấu phép / Giải mã / Đào hoá thạch: các ô đang chọn được (data-hot)
      const b = $('arFbExtra').querySelector(`[data-hot="${n}"]:not(:disabled)`);
      if (b) { e.preventDefault(); b.click(); }
    }
    else if (G.phase === 'draw' && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); drawCard(); }
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
      reviewHtml, paintPracticeBtn, practice, kinds, toBook, bookNoteHtml, ropeHtml, addDaily, dailyStat, celebrate,
      nickName, avatar: () => avatarOf(profile()),
      /** Bộ câu đang chọn ở màn chọn: { questions, key, title } (questions null = đang tải). */
      deckSource: () => ({ questions: SRC.questions, key: SRC.key, title: SRC.title || '' }),
      inGame: () => !!G && G.phase !== 'end' && !$('arGame').hidden,
    },
  };
})(window);
