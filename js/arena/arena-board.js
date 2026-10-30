/* ============================================================
   js/arena/arena-board.js — "Bảng điểm" (kiểu Board Battle của Wayground) trong Đấu trường.

   Giáo viên chiếu 1 bảng ô 100…500 lên màn hình; các đội (2–6) lần lượt chọn ô, cả lớp
   trả lời ra giấy/bảng con, giáo viên bấm Hiện đáp án rồi bấm tên các đội trả lời đúng.
   Ô 2 gấp đôi điểm, ô Rủi ro trừ một nửa giá trị nếu đội trả lời sai (EduArenaCore.makeBoard
   / boardScore). Học sinh không cần máy → chạy hoàn toàn trên máy giáo viên: 0 mạng, 0 Firebase.
   Nạp SAU js/arena/arena.js (dùng EduArena.api: bộ câu, dạng câu, số câu, giây mỗi câu).
   ============================================================ */
(function (global) {
  'use strict';

  const C = global.EduArenaCore;
  const K = global.EduArenaKinds;
  const A = global.EduArena.api;
  const FX = global.EduArenaFX;
  const $ = (id) => document.getElementById(id);
  const esc = A.esc;
  const SHAPES = A.SHAPES;
  const FACES = ['🦊', '🐼', '🐯', '🐸', '🦉', '🐙'];
  const SPECIAL = { x2: { icon: '✖️2', name: 'Ô nhân đôi — điểm gấp đôi!' }, risk: { icon: '⚠️', name: 'Ô rủi ro — đội trả lời sai bị trừ một nửa!' } };
  const fmt = (n) => Number(n || 0).toLocaleString('vi-VN');
  let B = null;

  function teamCount() { return Math.min(6, Math.max(2, A.prefs.boardTeams || 4)); }
  function teamNames() {
    const saved = Array.isArray(A.prefs.boardNames) ? A.prefs.boardNames : [];
    return FACES.map((_, i) => String(saved[i] || '').trim() || `Đội ${i + 1}`);
  }

  // ============================================================
  // THẺ Ở MÀN CHỌN (vai Giáo viên + chế độ Bảng điểm thay cho thẻ "Tạo phòng")
  // ============================================================
  function paintCard() {
    const on = A.role() === 'teacher' && A.effMode() === 'board';
    $('arBoardCard').hidden = !on;
    $('arRoomCard').hidden = on;
    if (!on) return;
    document.querySelectorAll('#arBoardTeams button').forEach((b) => b.classList.toggle('is-on', +b.dataset.v === teamCount()));
    const names = teamNames();
    const box = $('arBoardNames');
    // Không vẽ lại khi đang gõ tên (mất con trỏ).
    if (!box.contains(document.activeElement) || box.children.length !== teamCount()) {
      box.innerHTML = names.slice(0, teamCount()).map((n, i) => `<label class="ar-board-name"><span aria-hidden="true">${FACES[i]}</span>
        <input class="ar-input" data-team="${i}" maxlength="20" value="${esc(n)}" aria-label="Tên đội ${i + 1}"></label>`).join('');
    }
    $('arBoardGo').disabled = !(A.deckSource().questions || []).length || $('arPlay').disabled;
  }
  function initCard() {
    $('arBoardTeams').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      A.prefs.boardTeams = +b.dataset.v; A.save(); A.sfx('click'); paintCard();
    });
    $('arBoardNames').addEventListener('input', (e) => {
      const inp = e.target.closest('[data-team]');
      if (!inp) return;
      const names = teamNames();
      names[+inp.dataset.team] = inp.value.replace(/[<>]/g, '').slice(0, 20);
      A.prefs.boardNames = names; A.save();
    });
    $('arBoardGo').addEventListener('click', start);
    ['arena:deck', 'arena:role', 'arena:mode'].forEach((ev) => document.addEventListener(ev, paintCard));
    paintCard();
  }

  // ============================================================
  // TRẬN
  // ============================================================
  function start() {
    const src = A.deckSource();
    const deck = C.buildDeck(src.questions || [], A.rng, 0, A.kinds());
    if (!deck.length) { A.toast('Chọn bộ câu hỏi có câu chơi được trước nhé.'); return; }
    const names = teamNames();
    B = {
      title: src.title || '', secs: A.prefs.secs || 20,
      tiles: C.makeBoard(deck, A.prefs.count, A.rng), // 0 = "Tất cả"; không nhiều ô hơn số câu bộ có (tối đa 30)
      teams: names.slice(0, teamCount()).map((name, i) => ({ id: 't' + i, name, face: FACES[i], score: 0, right: 0 })),
      turn: 0, cur: null, phase: 'board', right: [], last: null, fresh: true,
    };
    A.show('arBoard');
    A.sfx('click');
    render();
  }
  function teamIds() { return B.teams.map((t) => t.id); }
  function turnTeam() { return B.teams[B.turn % B.teams.length]; }

  function render() {
    clearInterval(B.timer);
    if (B.phase === 'board') renderBoard();
    else if (B.phase === 'end') renderEnd();
    else renderQuestion();
  }
  function scoresHtml() {
    const lead = Math.max(...B.teams.map((t) => t.score));
    return `<div class="ar-bteams">${B.teams.map((t, i) => {
      const d = B.last && B.last[t.id];
      return `<div class="ar-bteam c${i}${B.phase === 'board' && t === turnTeam() ? ' is-turn' : ''}${t.score === lead && lead > 0 ? ' is-lead' : ''}">
        <span class="ar-bteam-face" aria-hidden="true">${t.face}</span><b>${esc(t.name)}</b><span class="ar-bteam-score">${fmt(t.score)}</span>
        ${d ? `<small class="ar-bteam-delta ${d > 0 ? 'up' : 'down'}">${d > 0 ? '+' : ''}${fmt(d)}</small>` : ''}</div>`;
    }).join('')}</div>`;
  }
  function renderBoard() {
    const left = B.tiles.filter((t) => !t.open).length;
    $('arBoard').innerHTML = `<div class="ar-hud ar-bhud">
        <span class="ar-pill ar-pill-main">🧩 Bảng điểm${B.title ? ' · ' + esc(B.title) : ''}</span>
        <span class="ar-pill">Còn ${left}/${B.tiles.length} ô</span>
        <button type="button" class="ar-btn ar-btn-ghost ar-btn-sm" data-bact="full"><i class="fa-solid fa-expand"></i> Toàn màn hình</button>
        <button type="button" class="ar-btn ar-btn-ghost ar-btn-sm" data-bact="end"><i class="fa-solid fa-flag-checkered"></i> Kết thúc</button></div>
      ${scoresHtml()}
      <p class="ar-bturn">Lượt chọn ô: <b>${turnTeam().face} ${esc(turnTeam().name)}</b></p>
      <div class="ar-bgrid n${B.tiles.length}${B.fresh ? ' is-new' : ''}">${B.tiles.map((t) => (t.open
        ? `<div class="ar-btile is-open${t.special ? ' sp-' + t.special : ''}"><span>${t.special ? SPECIAL[t.special].icon + ' ' : ''}${t.value}</span>
            <small>${t.right.length ? t.right.map((id) => B.teams.find((x) => x.id === id).face).join('') : '—'}</small></div>`
        : `<button type="button" class="ar-btile" data-tile="${t.i}" style="--i:${t.i}" aria-label="Ô ${t.value} điểm">${t.value}</button>`)).join('')}</div>`;
    // Vừa chấm ô: điểm các đội nảy lên + số cộng/trừ bay lên, đội đúng có sao.
    if (B.last) {
      document.querySelectorAll('#arBoard .ar-bteam').forEach((el, i) => {
        const d = B.last[B.teams[i].id];
        if (!d) return;
        FX.flash(el, d > 0 ? 'fx-bump' : 'fx-hit');
        FX.float(el, `${d > 0 ? '+' : '−'}${fmt(Math.abs(d))}`, d > 0 ? 'gold' : 'down');
        if (d > 0) FX.burst(el, ['⭐', '✨'], 6);
      });
    }
    B.fresh = false;
    B.last = null;
  }
  function qHtml(q, reveal) {
    const head = `<div class="ar-q">${esc(q.text)}</div>${q.img ? `<img class="ar-qimg" src="${esc(q.img)}" alt="">` : ''}`;
    if (C.kindOf(q) !== 'choice') return head + `<div class="ar-kind">${K.viewHtml(q, { reveal })}</div>`;
    return `${head}<div class="ar-answers n${q.options.length}">${q.options.map((o, k) => `<div class="ar-ans c${k}${reveal ? (k === q.correctIdx ? ' is-correct' : ' is-dim') : ''}">
      <span class="ar-shape" aria-hidden="true">${SHAPES[k]}</span><span class="ar-ans-text">${esc(o)}</span></div>`).join('')}</div>`;
  }
  function openTile(i) {
    const t = B.tiles[i];
    if (!t || t.open || B.phase !== 'board') return;
    B.cur = t; B.phase = 'q'; B.right = []; B.qStart = performance.now();
    A.sfx(t.special ? 'critical' : 'flip');
    const btn = document.querySelector(`#arBoard [data-tile="${i}"]`);
    const from = btn && btn.getBoundingClientRect();
    render();
    // Ô vừa chọn "phóng to" thành khung câu hỏi.
    const st = document.querySelector('#arBoard .ar-bstage');
    if (from && st && !FX.reduced()) {
      const to = st.getBoundingClientRect();
      st.animate([
        { transformOrigin: 'top left', transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})`, opacity: 0.4 },
        { transformOrigin: 'top left', transform: 'none', opacity: 1 },
      ], { duration: 420, easing: 'cubic-bezier(.2,.8,.3,1)' });
    }
  }
  function renderQuestion() {
    const t = B.cur, q = t.q;
    const mark = B.phase === 'mark';
    $('arBoard').innerHTML = `<div class="ar-hud ar-bhud">
        <span class="ar-pill ar-pill-main">Ô ${t.value} điểm${t.special ? ' · ' + SPECIAL[t.special].icon : ''}</span>
        <span class="ar-pill">Đội chọn ô: ${turnTeam().face} ${esc(turnTeam().name)}</span>
        ${mark ? '' : '<span class="ar-pill" id="arBSecs"></span>'}</div>
      ${t.special ? `<p class="ar-bspecial sp-${t.special}">${SPECIAL[t.special].icon} ${SPECIAL[t.special].name}</p>` : ''}
      ${mark ? '' : '<div class="ar-timer"><i id="arBTimer"></i></div>'}
      <div class="ar-room-stage ar-bstage">${qHtml(q, mark)}
        ${mark && C.kindOf(q) !== 'choice' ? `<div class="ar-fb-ans">Đáp án đúng:<ul class="ar-fb-list">${C.answerLines(q).map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
        ${mark && q.expl ? `<div class="ar-feedback is-ok"><div class="ar-fb-expl">💡 ${esc(q.expl)}</div></div>` : ''}</div>
      ${mark ? `<div class="ar-card ar-bmark"><h3 class="ar-h3">Đội nào trả lời đúng? <small class="ar-muted">(bấm tên đội hoặc phím 1–${B.teams.length})</small></h3>
          <div class="ar-bpick">${B.teams.map((tm, i) => `<button type="button" class="ar-bpick-btn c${i}${B.right.includes(tm.id) ? ' is-on' : ''}" data-bteam="${tm.id}" aria-pressed="${B.right.includes(tm.id)}">
            <span aria-hidden="true">${tm.face}</span> ${esc(tm.name)}<kbd>${i + 1}</kbd></button>`).join('')}</div>
          <div class="ar-row ar-center-row"><button type="button" class="ar-btn ar-btn-play" data-bact="score">Cộng điểm và về bảng <kbd>Enter</kbd></button></div></div>`
      : '<div class="ar-row ar-center-row"><button type="button" class="ar-btn ar-btn-play" data-bact="reveal"><i class="fa-solid fa-eye"></i> Hiện đáp án <kbd>Space</kbd></button></div>'}`;
    if (!mark) {
      const limit = B.secs * 1000;
      const tick = () => {
        const left = Math.max(0, limit - (performance.now() - B.qStart));
        const bar = $('arBTimer'), s = $('arBSecs');
        if (!bar) { clearInterval(B.timer); return; }
        bar.style.width = (left / limit) * 100 + '%';
        bar.classList.toggle('is-low', left < limit / 4);
        s.textContent = left > 0 ? `⏱ ${Math.ceil(left / 1000)} giây` : '⏰ Hết giờ';
        if (left <= 0) { clearInterval(B.timer); A.sfx('wrong'); }
      };
      tick();
      B.timer = setInterval(tick, 200);
    }
  }
  function reveal() {
    if (!B || B.phase !== 'q') return;
    B.phase = 'mark';
    A.sfx('correct');
    render();
    FX.flash(document.querySelector('#arBoard .ar-ans.is-correct'), 'fx-correct');
  }
  function toggleTeam(id) {
    if (!B || B.phase !== 'mark') return;
    const i = B.right.indexOf(id);
    if (i >= 0) B.right.splice(i, 1); else B.right.push(id);
    A.sfx('click');
    document.querySelectorAll('.ar-bpick-btn').forEach((b) => {
      const on = B.right.includes(b.dataset.bteam);
      b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', on);
      if (b.dataset.bteam === id) FX.flash(b, 'fx-bump');
    });
  }
  function score() {
    if (!B || B.phase !== 'mark') return;
    const t = B.cur;
    const d = C.boardScore(t, teamIds(), B.right);
    B.teams.forEach((tm) => { tm.score += d[tm.id]; if (B.right.includes(tm.id)) tm.right++; });
    t.open = true; t.right = B.right.slice();
    B.last = d;
    B.turn++;
    B.cur = null;
    B.phase = B.tiles.every((x) => x.open) ? 'end' : 'board';
    A.sfx(B.right.length ? 'match' : 'lose');
    render();
    if (B.phase === 'board') B.last = null;
  }
  function renderEnd() {
    B.phase = 'end';
    const board = B.teams.slice().sort((a, b) => b.score - a.score);
    const top = board.slice(0, 3);
    const order = [1, 0, 2].filter((i) => top[i]);
    const hard = B.tiles.filter((t) => t.open).sort((a, b) => a.right.length - b.right.length).slice(0, 3);
    $('arBoard').innerHTML = `<div class="ar-card ar-end">
      <h2 class="ar-h2 ar-center">🏆 ${esc(board[0].name)} thắng Bảng điểm!</h2>
      <div class="ar-podium">${order.map((i) => `<div class="ar-pod p${i + 1}" style="--d:${(2 - i) * 0.35}s">
        <span class="ar-pod-face">${top[i].face}</span><b class="ar-pod-name">${esc(top[i].name)}</b>
        <span class="ar-pod-val">${fmt(top[i].score)} điểm</span><div class="ar-pod-block">${i + 1}</div></div>`).join('')}</div>
      <div class="ar-room-table-wrap"><table class="ar-room-table"><thead><tr><th>Hạng</th><th>Đội</th><th>Điểm</th><th>Số ô trả lời đúng</th></tr></thead>
        <tbody>${board.map((t, i) => `<tr><td>${i + 1}</td><td>${t.face} ${esc(t.name)}</td><td>${fmt(t.score)}</td><td>${t.right}/${B.tiles.filter((x) => x.open).length}</td></tr>`).join('')}</tbody></table></div>
      ${hard.length ? `<h3 class="ar-h3">Câu nhiều đội sai nhất</h3><ol class="ar-room-hard">${hard.map((t) => `<li>${esc(t.q.text)} <span class="ar-muted">— ${t.right.length}/${B.teams.length} đội đúng · đáp án: ${esc(C.answerLines(t.q).join(' · '))}</span></li>`).join('')}</ol>` : ''}
      <div class="ar-row ar-center-row">
        <button type="button" class="ar-btn ar-btn-play" data-bact="again"><i class="fa-solid fa-rotate-right"></i> Bảng mới</button>
        <button type="button" class="ar-btn ar-btn-ghost" data-bact="home"><i class="fa-solid fa-gamepad"></i> Về Đấu trường</button></div></div>`;
    A.sfx('win');
    if (global.EduFX) global.EduFX.confetti({ count: 140 });
  }
  function end() {
    if (!B) return;
    if (B.phase !== 'end' && B.tiles.some((t) => !t.open) && !confirm('Kết thúc Bảng điểm và xem kết quả?')) return;
    clearInterval(B.timer);
    B.phase = 'end';
    render();
  }
  function home() {
    if (B) clearInterval(B.timer);
    B = null;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    A.show('arHome');
    paintCard();
  }

  $('arBoard').addEventListener('click', (e) => {
    const tile = e.target.closest('[data-tile]');
    if (tile) { openTile(+tile.dataset.tile); return; }
    const tm = e.target.closest('[data-bteam]');
    if (tm) { toggleTeam(tm.dataset.bteam); return; }
    const b = e.target.closest('[data-bact]');
    if (!b) return;
    const act = b.dataset.bact;
    if (act === 'reveal') reveal();
    else if (act === 'score') score();
    else if (act === 'end') end();
    else if (act === 'again') start();
    else if (act === 'home') home();
    else if (act === 'full') {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
    }
  });
  document.addEventListener('keydown', (e) => {
    if (!B || $('arBoard').hidden || /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
    if (B.phase === 'q' && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); reveal(); return; }
    if (B.phase !== 'mark') return;
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= B.teams.length) { e.preventDefault(); toggleTeam(B.teams[n - 1].id); }
    else if (e.key === 'Enter' && !(e.target.closest && e.target.closest('[data-bteam]'))) { e.preventDefault(); score(); }
  });

  initCard();
})(window);
