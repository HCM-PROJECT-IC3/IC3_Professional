/* ============================================================
   js/arena/arena-lobby-fun.js — trò khởi động cho học sinh trong lúc chờ giáo viên bấm Bắt đầu (Phòng cả lớp).

   KHÔNG dùng câu hỏi bài học (ngân hàng data/ic3, Sổ tay câu sai): sảnh chờ không được cho em xem/làm trước
   câu sắp thi. Chỉ dùng kho từ riêng js/arena/arena-words.js.

     Thử phản xạ   ô chuyển xanh thì bấm — đo mili-giây
     Nối từ        từ sau bắt đầu bằng tiếng cuối của từ trước (máy tính → tính năng → năng lượng...);
                      đồng hồ mỗi lượt ngắn dần, bẫy khác dấu (tính / tình / tin); sai hoặc hết giờ là dừng
     Ghép chữ      xếp chữ cái thành thuật ngữ tin học tiếng Anh theo nghĩa tiếng Việt — 45 giây, càng nhiều càng tốt
     Thả cảm xúc   6 biểu tượng CỐ ĐỊNH (không gõ chữ) bay lên màn chiếu
   Kỷ lục: localStorage ('eduquiz_arena_reflex', 'eduquiz_arena_wordfun'). Mạng: chỉ thả cảm xúc + kỷ lục MỚI gửi
   máy giáo viên, và CHỈ khi em nối thẳng WebRTC (0 lượt Firebase). Đường dự phòng → ctx.send = null → không gửi gì.

     mount(box, ctx)   ctx: { name, send(msg) | null, sfx(name) }
     unmount()         dừng mọi hẹn giờ (câu hỏi đầu tiên tới thì arena-room.js gọi)
     REACTS            biểu tượng (máy giáo viên chỉ nhận số thứ tự 0..5) · GAMES: trò có bảng kỷ lục trên màn chiếu
     reflexRank(list, name, ms) · chainMs(n)   thuần (test)
   ============================================================ */
(function (global) {
  'use strict';

  const WD = global.EduArenaWords;
  const REFLEX_KEY = 'eduquiz_arena_reflex'; // { best: {tên: ms}, top: [{name, ms, at}] }
  const WORD_KEY = 'eduquiz_arena_wordfun';  // { chain: {tên: số từ}, word: {tên: số từ} }
  const REACTS = ['👏', '🔥', '😂', '😮', '💪', '❤️'];
  const GAMES = { chain: { icon: '🔗', name: 'Vua nối từ', unit: 'từ' }, word: { icon: '🔤', name: 'Vua ghép chữ', unit: 'từ' } };
  const REACT_GAP_MS = 1500;   // thả cảm xúc: tối đa 1 lần / 1,5 giây (máy giáo viên cũng chặn)
  const TOP_N = 5;
  const WORD_ROUND_MS = 45000;
  const WORD_SKIP_MS = 3000;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const lsGet = (k, d) => { try { const v = JSON.parse(global.localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
  const lsSet = (k, v) => { try { global.localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* bộ nhớ đầy — vẫn chơi được */ } };
  const norm = (s) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();
  const rnd = () => Math.random();

  let F = null; // { box, ctx, timers, ivals, tab, reflex, chain, word, lastReact }

  /** Bảng kỷ lục máy này: mỗi tên 1 dòng (giữ thời gian tốt nhất), xếp nhanh → chậm, tối đa 5. */
  function reflexRank(list, name, ms, now) {
    const out = (list || []).filter((r) => norm(r.name) !== norm(name));
    const old = (list || []).find((r) => norm(r.name) === norm(name));
    out.push(old && old.ms <= ms ? old : { name, ms, at: now || Date.now() });
    return out.sort((a, b) => a.ms - b.ms).slice(0, TOP_N);
  }
  function reflexLine(ms) {
    return ms < 220 ? 'Phản xạ siêu nhân! ⚡' : ms < 280 ? 'Nhanh như chớp!' : ms < 350 ? 'Tay nhanh đấy!' : ms < 450 ? 'Ổn áp — thử lần nữa?' : 'Khởi động tiếp nào!';
  }
  /** Nối từ: thời gian cho lượt thứ n (0, 1, 2...) — 7 giây, ngắn dần 0,35 giây mỗi từ, tối thiểu 2,8 giây. */
  function chainMs(n) { return Math.max(2800, 7000 - n * 350); }

  function later(fn, ms) { const t = setTimeout(fn, ms); if (F) F.timers.push(t); return t; }
  function every(fn, ms) { const t = setInterval(fn, ms); if (F) F.ivals.push(t); return t; }
  function alive(box) { return F && F.box === box && box.isConnected; }
  function stopTimers() { if (!F) return; F.timers.forEach(clearTimeout); F.ivals.forEach(clearInterval); F.timers = []; F.ivals = []; }

  function mount(box, ctx) {
    unmount();
    F = { box, ctx, timers: [], ivals: [], lastReact: 0, tab: 'reflex' };
    box.innerHTML = `<div class="ar-fun">
      <div class="ar-fun-tabs" role="tablist" aria-label="Trò khởi động trong lúc chờ">
        <button type="button" role="tab" data-fun="reflex" class="is-on"><span aria-hidden="true">⚡</span> Phản xạ</button>
        <button type="button" role="tab" data-fun="chain"><span aria-hidden="true">🔗</span> Nối từ</button>
        <button type="button" role="tab" data-fun="word"><span aria-hidden="true">🔤</span> Ghép chữ</button>
      </div>
      <div class="ar-fun-body" id="arFunBody"></div>
      ${ctx.send ? `<div class="ar-fun-react" aria-label="Thả cảm xúc lên màn chiếu"><small>Thả cảm xúc lên màn chiếu:</small>
        ${REACTS.map((e, i) => `<button type="button" data-react="${i}" aria-label="Thả ${e}">${e}</button>`).join('')}</div>`
        : '<p class="ar-hint ar-fun-note">Máy em đang đi đường dự phòng — trò khởi động vẫn chơi được, nhưng không gửi lên màn chiếu (để tiết kiệm mạng của trường).</p>'}
    </div>`;
    box.addEventListener('click', onClick);
    box.addEventListener('pointerdown', onDown);
    paint();
  }
  function unmount() {
    if (!F) return;
    stopTimers();
    F.box.removeEventListener('click', onClick);
    F.box.removeEventListener('pointerdown', onDown);
    F = null;
  }

  function onClick(e) {
    if (!F) return;
    if (e.detail === 0 && e.target.closest('#arFunPad')) { reflexTap(); return; } // Enter/Space trên bàn phím
    const t = e.target.closest('[data-fun], [data-react], [data-chain], [data-chain-go], [data-tile], [data-slot], [data-word-go], [data-word-skip]');
    if (!t || t.disabled) return;
    const d = t.dataset;
    if (d.fun) { stopTimers(); F.tab = d.fun; F.box.querySelectorAll('[data-fun]').forEach((b) => b.classList.toggle('is-on', b === t)); paint(); return; }
    if (d.react !== undefined) react(+d.react, t);
    else if (d.chainGo !== undefined) chainStart();
    else if (d.chain !== undefined) chainPick(+d.chain);
    else if (d.wordGo !== undefined) wordStart();
    else if (d.wordSkip !== undefined) wordSkip();
    else if (d.tile !== undefined) wordTile(+d.tile);
    else if (d.slot !== undefined) wordUnpick(+d.slot);
  }
  // Phản xạ đo bằng pointerdown (nhanh hơn click ~100 ms trên điện thoại)
  function onDown(e) {
    const pad = e.target.closest('#arFunPad');
    if (!pad || !F) return;
    e.preventDefault();
    reflexTap();
  }
  function body() { return F && F.box.querySelector('#arFunBody'); }
  function paint() {
    const b = body();
    if (!b) return;
    if (F.tab === 'chain') chainIntro(b);
    else if (F.tab === 'word') wordIntro(b);
    else paintReflex(b);
  }
  /** Kỷ lục nối từ / ghép chữ của em; kỷ lục mới → báo màn chiếu (chỉ khi nối thẳng). */
  function wordBest(game) { return lsGet(WORD_KEY, {})[game] || {}; }
  function saveWordBest(game, n) {
    const all = lsGet(WORD_KEY, {}), k = norm(F.ctx.name);
    all[game] = all[game] || {};
    const isBest = n > 0 && n > (all[game][k] || 0);
    if (isBest) { all[game][k] = n; lsSet(WORD_KEY, all); if (F.ctx.send) F.ctx.send({ t: 'fun', g: game, n }); }
    return isBest;
  }
  function bestLine(game) {
    const me = wordBest(game)[norm(F.ctx.name)];
    return `<p class="ar-fun-best">${me ? `Kỷ lục của em: <b>${me} ${GAMES[game].unit}</b>` : 'Chưa có kỷ lục — thử ngay!'}</p>`;
  }

  // ── Thử phản xạ ──
  function store() { return lsGet(REFLEX_KEY, { best: {}, top: [] }); }
  function paintReflex(b) {
    const s = store(), me = F.ctx.name;
    const best = s.best[norm(me)];
    b.innerHTML = `<button type="button" class="ar-fun-pad is-idle" id="arFunPad"><b>Bấm để bắt đầu</b><small>Ô chuyển <span class="ar-fun-green">xanh</span> thì bấm thật nhanh!</small></button>
      <p class="ar-fun-best">${best ? `Kỷ lục của em: <b>${best} ms</b>` : 'Chưa có kỷ lục — thử ngay!'}</p>
      ${s.top.length ? `<ol class="ar-fun-top" aria-label="Tay nhanh nhất máy này">${s.top.map((r) => `<li${norm(r.name) === norm(me) ? ' class="is-me"' : ''}><span>${esc(r.name)}</span><b>${r.ms} ms</b></li>`).join('')}</ol>` : ''}`;
    F.reflex = { state: 'idle', t0: 0 };
  }
  function reflexTap() {
    const R = F.reflex, pad = F.box.querySelector('#arFunPad');
    if (!R || !pad) return;
    const set = (cls, html) => { pad.className = 'ar-fun-pad ' + cls; pad.innerHTML = html; };
    if (R.state === 'idle' || R.state === 'done') {
      R.state = 'wait';
      set('is-wait', '<b>Chờ...</b><small>đừng bấm vội!</small>');
      const box = F.box;
      R.timer = later(() => {
        if (!alive(box) || R.state !== 'wait') return;
        R.state = 'go'; R.t0 = performance.now();
        set('is-go', '<b>BẤM!</b>');
      }, 1200 + Math.random() * 2300);
      return;
    }
    if (R.state === 'wait') {
      clearTimeout(R.timer);
      R.state = 'done';
      set('is-early', '<b>Sớm quá! 😅</b><small>Bấm để thử lại</small>');
      F.ctx.sfx('wrong');
      return;
    }
    if (R.state === 'go') {
      const ms = Math.round(performance.now() - R.t0);
      // < 100 ms là đoán trước chứ không phải phản xạ (như các bài đo chuẩn) → tính như bấm sớm
      if (ms < 100) { R.state = 'done'; set('is-early', '<b>Đoán trước rồi! 😄</b><small>Phải thấy xanh mới bấm — thử lại nhé</small>'); F.ctx.sfx('wrong'); return; }
      const s = store(), k = norm(F.ctx.name);
      const isBest = !s.best[k] || ms < s.best[k];
      if (isBest) { s.best[k] = ms; s.top = reflexRank(s.top, F.ctx.name, ms); lsSet(REFLEX_KEY, s); }
      F.ctx.sfx(isBest ? 'combo' : 'correct');
      // Kỷ lục mới → báo màn chiếu (chỉ khi nối thẳng); máy giáo viên chỉ nhận 100–1500 ms
      if (isBest && F.ctx.send && ms <= 1500) F.ctx.send({ t: 'reflex', ms });
      paintReflex(body());
      const p2 = F.box.querySelector('#arFunPad');
      p2.className = 'ar-fun-pad is-done';
      p2.innerHTML = `<b>${ms} ms</b><small>${isBest ? '🏆 Kỷ lục mới! ' : ''}${esc(reflexLine(ms))} · Bấm để thử lại</small>`;
      F.reflex.state = 'done';
    }
  }

  // ── Nối từ ──
  function chainIntro(b) {
    b.innerHTML = `<div class="ar-fun-game">
      <p class="ar-fun-rule">Chọn từ <b>bắt đầu bằng tiếng cuối</b> của từ trước:<br><span class="ar-fun-eg">máy <u>tính</u> → <u>tính</u> năng → <u>năng</u> lượng...</span><br>Đồng hồ ngắn dần — coi chừng từ <b>khác dấu</b> (tính / tình / tin)!</p>
      <button type="button" class="ar-btn ar-btn-play" data-chain-go><i class="fa-solid fa-link" aria-hidden="true"></i> Bắt đầu nối</button>
      ${bestLine('chain')}</div>`;
  }
  function chainStart() {
    stopTimers();
    const w = WD.chainStart(rnd);
    F.chain = { word: w, used: new Set([w]), trail: [w], n: 0, turn: null, locked: false };
    chainTurn();
  }
  function chainTurn() {
    const Ch = F.chain;
    let turn = WD.chainTurn(Ch.word, Ch.used, rnd, 4);
    let reset = '';
    if (!turn.next) {
      // Hết từ nối được → đổi sang từ mới, giữ nguyên chuỗi (thưởng cho em đi tới tận cùng)
      reset = `Hết đường nối từ “${Ch.word}” — đổi từ mới!`;
      Ch.word = WD.chainStart(rnd);
      Ch.used.add(Ch.word);
      Ch.trail.push('…', Ch.word);
      turn = WD.chainTurn(Ch.word, Ch.used, rnd, 4);
    }
    Ch.turn = turn; Ch.locked = false;
    const ms = chainMs(Ch.n);
    const tail = WD.last(Ch.word);
    const head = Ch.word.slice(0, Ch.word.length - tail.length);
    body().innerHTML = `<div class="ar-fun-game">
      <p class="ar-fun-chain-n">🔗 Chuỗi <b>${Ch.n}</b> từ</p>
      <p class="ar-fun-trail">${Ch.trail.slice(-4).map((w) => esc(w)).join(' <span aria-hidden="true">→</span> ')}</p>
      <p class="ar-fun-word">${esc(head)}<mark>${esc(tail)}</mark></p>
      ${reset ? `<p class="ar-hint">${esc(reset)}</p>` : ''}
      <div class="ar-fun-bar"><i style="animation-duration:${ms}ms"></i></div>
      <div class="ar-fun-opts">${turn.options.map((w, k) => `<button type="button" class="ar-ans c${k}" data-chain="${k}"><span class="ar-ans-text">${esc(w)}</span></button>`).join('')}</div>
    </div>`;
    const box = F.box, my = Ch;
    Ch.timer = later(() => { if (alive(box) && F.chain === my && !my.locked) chainOver(null); }, ms);
  }
  function chainPick(k) {
    const Ch = F.chain;
    if (!Ch || Ch.locked) return;
    const w = Ch.turn.options[k];
    if (w !== Ch.turn.next) { chainOver(k); return; }
    clearTimeout(Ch.timer);
    Ch.locked = true;
    Ch.n++;
    Ch.word = w; Ch.used.add(w); Ch.trail.push(w);
    const btn = F.box.querySelector(`[data-chain="${k}"]`);
    if (btn) { btn.classList.add('is-correct'); if (global.EduArenaFX) global.EduArenaFX.float(btn, `+1`, 'up'); }
    F.ctx.sfx(Ch.n % 5 === 0 ? 'combo' : 'correct');
    const box = F.box;
    later(() => { if (alive(box) && F.chain === Ch) chainTurn(); }, 380);
  }
  function chainOver(k) {
    const Ch = F.chain;
    clearTimeout(Ch.timer);
    Ch.locked = true;
    F.box.querySelectorAll('[data-chain]').forEach((b) => {
      const w = Ch.turn.options[+b.dataset.chain];
      b.disabled = true;
      b.classList.toggle('is-correct', w === Ch.turn.next);
      b.classList.toggle('is-wrong', +b.dataset.chain === k);
    });
    F.ctx.sfx('wrong');
    const isBest = saveWordBest('chain', Ch.n);
    const box = F.box;
    later(() => {
      if (!alive(box) || F.chain !== Ch) return;
      body().innerHTML = `<div class="ar-fun-game">
        <p class="ar-fun-score">${k === null ? '⏰ Hết giờ!' : '❌ Chưa đúng!'} Từ nối được: <b>${esc(Ch.turn.next)}</b></p>
        <p class="ar-fun-big">🔗 ${Ch.n} từ${isBest ? ' · 🏆 Kỷ lục mới!' : ''}</p>
        <p class="ar-fun-trail">${Ch.trail.slice(-6).map(esc).join(' → ')}</p>
        <button type="button" class="ar-btn ar-btn-play" data-chain-go><i class="fa-solid fa-rotate-right" aria-hidden="true"></i> Nối lại</button>
        ${bestLine('chain')}</div>`;
      if (isBest) F.ctx.sfx('combo');
    }, 1300);
  }

  // ── Ghép chữ ──
  function wordIntro(b) {
    b.innerHTML = `<div class="ar-fun-game">
      <p class="ar-fun-rule">Xếp chữ cái thành <b>thuật ngữ tin học tiếng Anh</b> theo nghĩa cho sẵn.<br>${WORD_ROUND_MS / 1000} giây — ghép được càng nhiều càng giỏi! (Bỏ qua: −${WORD_SKIP_MS / 1000} giây)</p>
      <button type="button" class="ar-btn ar-btn-play" data-word-go><i class="fa-solid fa-font" aria-hidden="true"></i> Bắt đầu ghép</button>
      ${bestLine('word')}</div>`;
  }
  function wordStart() {
    stopTimers();
    const order = WD.TERMS.map((_, i) => i).sort(() => rnd() - 0.5);
    F.word = { order, k: 0, n: 0, end: performance.now() + WORD_ROUND_MS, tiles: [], picked: [], done: false };
    wordNext();
    const W = F.word, box = F.box;
    every(() => {
      if (!alive(box) || F.word !== W || W.done) return;
      const left = Math.max(0, W.end - performance.now());
      const el = F.box.querySelector('#arWordLeft');
      if (el) { el.textContent = Math.ceil(left / 1000) + ' giây'; el.classList.toggle('is-low', left < 10000); }
      if (left <= 0) wordOver();
    }, 200);
  }
  function wordNext() {
    const W = F.word;
    const [term, hint] = WD.TERMS[W.order[W.k % W.order.length]];
    W.term = term; W.hint = hint;
    W.tiles = WD.scramble(term, rnd).map((ch, i) => ({ ch, i, used: false }));
    W.picked = [];
    wordPaint();
  }
  function wordPaint() {
    const W = F.word;
    body().innerHTML = `<div class="ar-fun-game">
      <p class="ar-fun-chain-n">🔤 Ghép được <b>${W.n}</b> từ · ⏱ <span id="arWordLeft">${Math.ceil(Math.max(0, W.end - performance.now()) / 1000)} giây</span></p>
      <p class="ar-fun-hint">“${esc(W.hint)}”</p>
      <div class="ar-fun-slots" aria-label="Từ em đang ghép">${W.term.split('').map((_, i) => {
        const t = W.picked[i];
        return `<button type="button" class="ar-fun-slot${t !== undefined ? ' is-filled' : ''}" data-slot="${i}" ${t === undefined ? 'disabled' : ''}>${t !== undefined ? esc(W.tiles[t].ch) : ''}</button>`;
      }).join('')}</div>
      <div class="ar-fun-tiles">${W.tiles.map((t, i) => `<button type="button" class="ar-fun-tile" data-tile="${i}" ${t.used ? 'disabled' : ''}>${esc(t.ch)}</button>`).join('')}</div>
      <button type="button" class="ar-btn ar-btn-ghost ar-btn-sm" data-word-skip>Bỏ qua (−${WORD_SKIP_MS / 1000} giây)</button>
    </div>`;
  }
  function wordTile(i) {
    const W = F.word;
    if (!W || W.done || W.tiles[i].used) return;
    W.tiles[i].used = true;
    W.picked.push(i);
    F.ctx.sfx('click');
    if (W.picked.length < W.term.length) { wordPaint(); return; }
    const guess = W.picked.map((p) => W.tiles[p].ch).join('');
    if (guess === W.term) {
      W.n++; W.k++;
      F.ctx.sfx(W.n % 5 === 0 ? 'combo' : 'correct');
      wordPaint();
      const slots = F.box.querySelector('.ar-fun-slots');
      if (slots) { slots.classList.add('is-ok'); if (global.EduArenaFX) global.EduArenaFX.float(slots, `✓ ${W.term}`, 'up'); }
      const box = F.box;
      later(() => { if (alive(box) && F.word === W && !W.done) wordNext(); }, 450);
    } else {
      F.ctx.sfx('wrong');
      wordPaint();
      const slots = F.box.querySelector('.ar-fun-slots');
      if (slots && global.EduFX) global.EduFX.shake(slots);
      const box = F.box;
      later(() => { if (!alive(box) || F.word !== W || W.done) return; W.tiles.forEach((t) => { t.used = false; }); W.picked = []; wordPaint(); }, 500);
    }
  }
  function wordUnpick(slot) {
    const W = F.word;
    if (!W || W.done || W.picked[slot] === undefined) return;
    W.picked.splice(slot).forEach((p) => { W.tiles[p].used = false; }); // bỏ chữ này và các chữ sau nó
    wordPaint();
  }
  function wordSkip() {
    const W = F.word;
    if (!W || W.done) return;
    W.end -= WORD_SKIP_MS;
    W.k++;
    wordNext();
  }
  function wordOver() {
    const W = F.word;
    W.done = true;
    stopTimers();
    const isBest = saveWordBest('word', W.n);
    F.ctx.sfx(isBest ? 'combo' : 'flip');
    body().innerHTML = `<div class="ar-fun-game">
      <p class="ar-fun-score">⏰ Hết giờ! Từ đang ghép: <b>${esc(W.term)}</b> — ${esc(W.hint)}</p>
      <p class="ar-fun-big">🔤 ${W.n} từ${isBest ? ' · 🏆 Kỷ lục mới!' : ''}</p>
      <button type="button" class="ar-btn ar-btn-play" data-word-go><i class="fa-solid fa-rotate-right" aria-hidden="true"></i> Chơi lại</button>
      ${bestLine('word')}</div>`;
  }

  // ── Thả cảm xúc ──
  function react(i, btn) {
    const now = Date.now();
    if (!F.ctx.send || !REACTS[i]) return;
    if (now - F.lastReact < REACT_GAP_MS) { btn.classList.add('is-cool'); later(() => btn.classList.remove('is-cool'), 300); return; }
    F.lastReact = now;
    F.ctx.send({ t: 'react', e: i });
    if (global.EduArenaFX) global.EduArenaFX.float(btn, REACTS[i], 'info');
    F.box.querySelectorAll('[data-react]').forEach((b) => { b.disabled = true; });
    const box = F.box;
    later(() => { if (alive(box)) box.querySelectorAll('[data-react]').forEach((b) => { b.disabled = false; }); }, REACT_GAP_MS);
  }

  global.EduArenaLobbyFun = { mount, unmount, REACTS, GAMES, REACT_GAP_MS, reflexRank, chainMs };
})(typeof window !== 'undefined' ? window : globalThis);
