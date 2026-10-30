/* ============================================================
   js/arena/arena-mini.js — vai "Mini-game" của Đấu trường (arena.html?vai=minigame).
   7 mini-game cũ của Khu Vui Chơi chơi ngay tại đây, không khoá, thêm lớp thi đấu:
     1) Lưới trò (#arMiniGrid): tranh bìa riêng mỗi trò, hạng đang leo, kỷ lục, "Trò của ngày ×2 xu".
     2) Màn đối đầu: em vs đối thủ máy của hạng hiện tại + mốc điểm + xu thưởng → đếm 3-2-1.
     3) Trong trận (#arMini): trò chạy trong iframe (…html?arena=1, js/minigame-arena-bridge.js).
        Thanh trên đua điểm với "bóng ma" đối thủ, đếm chuỗi đúng, bình luận câu trend; viền màn
        hình loé xanh/đỏ theo đúng/sai, nhịp tim đỏ khi đang bị dẫn ở nước rút.
     4) Hết ván: công bố kịch tính (2 cột điểm đếm lên) → thắng/thua/sát nút, lên hạng, xu bay vào ví.
   Logic thuần ở js/arena/arena-mini-core.js. Tiến độ lưu trong hồ sơ Đấu trường của biệt danh
   (localStorage 'eduquiz_arena_v1' → players[nick].mini). 0 Firebase, 0 Apps Script.
   ============================================================ */
(function (global) {
  'use strict';

  const A = global.EduArena && global.EduArena.api;
  const M = global.EduArenaMiniCore;
  const D = global.EduArenaDrama;
  const ART = global.EduNamePickerArt;
  if (!A || !M) return;

  const $ = (id) => document.getElementById(id);
  const esc = A.esc;
  const fmt = M.fmt;
  const reduced = () => { try { return global.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
  const GOOD = ['correct', 'combo', 'critical', 'match'];
  const BAD = ['wrong'];
  const say = (kind, seed) => (global.EduArenaHype && global.EduArenaHype.say ? global.EduArenaHype.say(kind, seed) : '');

  function prog() {
    const p = A.profile();
    if (!p.mini || typeof p.mini !== 'object') p.mini = { streak: 0, g: {} };
    return p.mini;
  }
  const today = () => M.dayKey();

  // ============================================================
  // TRANH BÌA: cảnh của chính trò đó (giống nền trang game) + tranh 3D cách chơi (arena-mini-art.js)
  // ============================================================
  const ART3D = global.EduArenaMiniArt;
  let coverSeq = 0;
  function sceneSvg(name) {
    if (!ART) return '';
    let s = '';
    try { s = ART.scene(name); } catch (e) { return ''; }
    const p = 'mg' + (++coverSeq) + '-'; // id riêng: cùng cảnh có thể đang nằm trong iframe/thẻ khác
    return s.replace(/<text[\s\S]*?<\/text>/g, '').replace(/\bid="([^"]+)"/g, `id="${p}$1"`).replace(/url\(#([^)]+)\)/g, `url(#${p}$1)`).replace(/href="#([^"]+)"/g, `href="#${p}$1"`);
  }
  function coverHtml(g, stage) {
    return `<span class="ar-mg-cover" aria-hidden="true">${sceneSvg(g.scene)}<span class="ar-mg-art">${ART3D ? ART3D.draw(g.id) : ''}</span>` +
      `<span class="ar-mg-stage-no"><small>Chặng</small>${stage}</span></span>`;
  }

  // ============================================================
  // LƯỚI TRÒ
  // ============================================================
  function pips(tier) {
    return M.TIERS.map((t, i) => `<i class="${i < tier ? 'is-on' : ''}" style="--tc:${t.color}" title="${esc(t.name)}"></i>`).join('');
  }
  function paintGrid() {
    const grid = $('arMiniGrid');
    if (!grid) return;
    const P = prog(), feat = M.featured(today());
    const used = P.day && P.day.date === today() ? P.day.xu : 0;
    $('arMiniDay').innerHTML =
      `<span><i class="fa-solid fa-coins" aria-hidden="true"></i> Hôm nay: <b>${used}/${M.DAILY_CAP}</b> xu từ mini-game</span>` +
      (P.streak >= 2 ? `<span class="is-hot"><i class="fa-solid fa-fire" aria-hidden="true"></i> Chuỗi thắng <b>${P.streak}</b></span>` : '') +
      `<span><i class="fa-solid fa-star" aria-hidden="true"></i> Trò của ngày: <b>${esc(M.byId(feat).name)}</b> — xu ×2</span>`;
    coverSeq = 0;
    grid.innerHTML = M.GAMES.map((g, i) => {
      const gp = M.gameProg(P, g.id), r = M.rivalFor(g.id, P);
      const rank = gp.tier >= M.TIERS.length ? `<b style="color:${M.CHAMP.color}">Huyền thoại</b> · giữ ngai vàng` : `Đối thủ: <b>${esc(r.face + ' ' + r.name)}</b> <em style="--tc:${r.tierInfo.color}">${esc(r.tierInfo.name)}</em>`;
      return `<button type="button" class="ar-mg-tile${g.id === feat ? ' is-feat' : ''}${gp.wins ? ' is-cleared' : ''}" data-game="${esc(g.id)}">
        ${coverHtml(g, i + 1)}
        ${g.id === feat ? '<span class="ar-mg-ribbon"><i class="fa-solid fa-star" aria-hidden="true"></i> Trò của ngày ×2</span>' : ''}
        <span class="ar-mg-body">
          <span class="ar-mg-name"><i class="fa-solid ${g.fa}" aria-hidden="true"></i> ${esc(g.name)}</span>
          <span class="ar-mg-tag"><i class="fa-solid fa-book-open" aria-hidden="true"></i> IC3 · ${esc(g.topic)}</span>
          <span class="ar-mg-desc">${esc(g.desc)}</span>
          <span class="ar-mg-learn"><b>Em học được:</b> ${esc(g.learn)}</span>
          <span class="ar-mg-rank">${rank}</span>
          <span class="ar-mg-foot"><span class="ar-mg-pips" aria-label="Đã hạ ${Math.min(gp.tier, 5)}/5 đối thủ">${pips(gp.tier)}</span>
            <span class="ar-mg-best">${gp.best ? 'Kỷ lục <b>' + fmt(gp.best) + '</b>' : 'Chưa chơi'}</span></span>
        </span></button>`;
    }).join('');
  }

  // ============================================================
  // MÀN ĐỐI ĐẦU (trước trận)
  // ============================================================
  let cur = null; // { g, rival, race... }

  function openVs(gameId) {
    const g = M.byId(gameId);
    if (!g) return;
    const nick = A.setNick($('arNick').value || '');
    if (!nick) { A.toast('Nhập biệt danh trước để lưu hạng và xu của em nhé!'); $('arNick').focus(); return; }
    const P = prog(), r = M.rivalFor(g.id, P);
    const isFeat = M.featured(today()) === g.id;
    const winXu = r.champ ? 15 : M.winXu(r.tier);
    cur = { g, rival: r };
    A.show('arMini');
    coverSeq = 100;
    $('arMiniBody').innerHTML = `
      <div class="ar-mg-vs" style="--tc:${r.tierInfo.color}">
        <div class="ar-mg-vs-bg" aria-hidden="true">${sceneSvg(g.scene)}</div>
        <div class="ar-mg-vs-art" aria-hidden="true">${ART3D ? ART3D.draw(g.id) : ''}</div>
        <p class="ar-mg-vs-kicker">Chặng ${M.stageOf(g.id)}/${M.GAMES.length} · <i class="fa-solid ${g.fa}" aria-hidden="true"></i> ${esc(g.name)} · ${r.champ ? 'Giữ ngai vàng' : 'Hạng ' + esc(r.tierInfo.name) + ' — đối thủ ' + (r.tier + 1) + '/5'}</p>
        <div class="ar-mg-vs-row">
          <div class="ar-mg-fighter is-me"><span class="ar-mg-face">${esc(A.avatar())}</span><b>${esc(nick)}</b><small>Kỷ lục: ${fmt(M.gameProg(P, g.id).best)}</small></div>
          <div class="ar-mg-vs-mid" aria-hidden="true">VS</div>
          <div class="ar-mg-fighter is-rival"><span class="ar-mg-face">${esc(r.face)}</span><b>${esc(r.name)}</b><small>Mốc: ${fmt(r.target)} điểm</small></div>
        </div>
        <p class="ar-mg-vs-learn"><i class="fa-solid fa-book-open" aria-hidden="true"></i> IC3 · ${esc(g.topic)} — ${esc(g.learn)}</p>
        <p class="ar-mg-vs-goal">${r.champ ? 'Vượt kỷ lục <b>' + fmt(r.target) + '</b> của chính em để giữ ngai vàng!' : 'Đạt từ <b>' + fmt(r.target) + ' điểm</b> để hạ ' + esc(r.name) + ' và lên hạng.'}</p>
        <p class="ar-mg-vs-prize"><i class="fa-solid fa-coins" aria-hidden="true"></i> Thắng: <b>+${winXu * (isFeat ? 2 : 1)} xu</b>${isFeat ? ' (Trò của ngày ×2)' : ''} · Phá kỷ lục: +5 · Thắng liền 3 trận: thưởng thêm</p>
        <div class="ar-row ar-center-row">
          <button type="button" class="ar-btn ar-btn-play" id="arMgGo"><i class="fa-solid fa-play" aria-hidden="true"></i> Vào trận!</button>
          <button type="button" class="ar-btn ar-btn-ghost" id="arMgBack"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i> Chọn trò khác</button>
        </div>
        <div class="ar-mg-count" id="arMgCount" aria-live="assertive" hidden></div>
      </div>`;
    $('arMiniTitle').textContent = g.name;
    $('arMgGo').addEventListener('click', countdown);
    $('arMgBack').addEventListener('click', leave);
    $('arMgGo').focus();
    A.sfx('click');
  }

  function countdown() {
    const box = $('arMgCount');
    $('arMgGo').disabled = true;
    if (reduced()) { play(); return; }
    box.hidden = false;
    let n = 3;
    const tick = () => {
      if (!cur) return;
      if (n === 0) { box.textContent = 'Bắt đầu!'; A.sfx('go'); setTimeout(play, 450); return; }
      box.textContent = n; box.classList.remove('is-pop'); void box.offsetWidth; box.classList.add('is-pop');
      A.sfx('count'); n--; setTimeout(tick, 650);
    };
    tick();
  }

  // ============================================================
  // TRONG TRẬN
  // ============================================================
  function play() {
    if (!cur) return;
    const { g, rival } = cur;
    cur.race = { me: 0, started: 0, combo: 0, best: 0, flips: 0, wrongs: 0, lead: null, lastLine: 0, done: false, settled: false };
    $('arMiniBody').innerHTML = `
      <div class="ar-mg-hud" id="arMgHud">
        <div class="ar-mg-race" aria-label="Đua điểm với đối thủ">
          <div class="ar-mg-lane is-me"><span class="ar-mg-who">${esc(A.avatar())}</span><span class="ar-mg-bar"><i id="arMgMeBar"></i></span><b id="arMgMe">0</b></div>
          <div class="ar-mg-lane is-rival"><span class="ar-mg-who">${esc(rival.face)}</span><span class="ar-mg-bar"><i id="arMgGhostBar"></i></span><b id="arMgGhost">${g.live ? '0' : fmt(rival.target)}</b></div>
        </div>
        <span class="ar-pill ar-mg-combo" id="arMgCombo" hidden></span>
        <p class="ar-mg-caster" id="arMgCaster" aria-live="polite">${g.live ? 'Đối thủ ' + esc(rival.name) + ' đang chờ em bắt đầu…' : esc(potentialHint())}</p>
      </div>
      <div class="ar-mg-stage" id="arMgStage">
        <iframe id="arMgFrame" class="ar-mg-frame" title="${esc(g.name)}" src="${esc(g.page)}?arena=1" allow="fullscreen"></iframe>
        <div class="ar-mg-vignette" id="arMgVig" aria-hidden="true"></div>
        <div class="ar-mg-result" id="arMgResult" hidden role="dialog" aria-modal="true" aria-label="Kết quả trận"></div>
      </div>`;
    clearInterval(cur.timer);
    cur.timer = setInterval(tickRace, 250);
  }

  /** Thang thanh đua: mốc đối thủ nằm ở 80% chiều dài (vạch vàng trong CSS), vượt mốc vẫn còn chỗ chạy tiếp. */
  const scaleMax = () => cur.rival.target / 0.8;
  const barPct = (v) => Math.max(0, Math.min(100, (v / scaleMax()) * 100));

  /** Trò không có điểm trực tiếp (Thám tử, Máy tính ảo): điểm tối đa còn giành được — giảm dần theo giờ/manh mối/lỗi. */
  function potential(sec) {
    const r = cur.race, id = cur.g.id;
    const speed = Math.max(0, 200 - sec);
    if (id === 'cyber-detective') return (60 + Math.max(0, 40 - Math.max(0, r.flips - 2) * 8)) * 10 + speed;
    if (id === 'computer-simulator') return Math.max(40, 100 - r.wrongs * 15) * 10 + speed;
    return 0;
  }
  function potentialHint() {
    return cur.g.id === 'cyber-detective'
      ? 'Mở càng ít manh mối, kết luận càng nhanh thì điểm càng cao.'
      : 'Đọc kỹ nhiệm vụ: mỗi lần Kiểm tra sai mất 150 điểm, thưởng tốc độ giảm theo giây.';
  }
  const elapsed = () => (cur.race.started ? (Date.now() - cur.race.started) / 1000 : 0);

  function tickRace() {
    if (!cur || !cur.race || cur.race.settled || !$('arMgMe')) return;
    const { g, rival, race } = cur;
    const sec = elapsed();
    if (!g.live) {
      // Trò "một phát ăn ngay": cột trên là điểm tối đa em còn giành được, cột dưới là mốc đối thủ
      if (!race.started) return;
      race.me = potential(sec);
      paintRace(race.me, rival.target);
      const behind = race.me < rival.target;
      $('arMgVig').classList.toggle('is-danger', behind);
      line(behind ? { tone: 'final', text: 'Điểm tối đa đã thấp hơn mốc — kết luận chính xác vẫn có xu khích lệ!' }
        : { tone: 'up', text: 'Điểm tối đa còn ' + fmt(race.me) + ' — vẫn hơn mốc ' + fmt(rival.target) + ', chốt nhanh nào!' }, 3000);
      return;
    }
    if (!race.started) return;
    const ghost = M.ghostAt(rival.target, g.expectSec, sec);
    const done = sec >= g.expectSec;
    paintRace(race.me, ghost);
    const lead = race.me > ghost ? 'me' : race.me < ghost ? 'rival' : race.lead;
    if (lead && race.lead && lead !== race.lead && race.me > 0) {
      if (lead === 'me') { line({ tone: 'up', text: 'Vượt mặt ' + rival.name + ' rồi! ' + say('rankup', race.me) }, 0); A.sfx('sparkle'); }
      else line({ tone: 'down', text: rival.face + ' ' + rival.name + ' vừa vượt lên — tăng tốc!' }, 0);
    }
    race.lead = lead;
    const danger = done && race.me < rival.target;
    $('arMgVig').classList.toggle('is-danger', danger);
    const rl = M.raceLine(race.me, ghost, rival.target, done);
    if (rl) line(rl, 4000);
  }

  function paintRace(me, ghost) {
    $('arMgMe').textContent = fmt(me);
    $('arMgGhost').textContent = fmt(ghost);
    $('arMgMeBar').style.width = barPct(me) + '%';
    $('arMgGhostBar').style.width = barPct(ghost) + '%';
    $('arMgHud').classList.toggle('is-past', me >= cur.rival.target);
  }

  /** Lời bình 1 dòng; gap = khoảng nghỉ tối thiểu (ms) để không nhảy chữ liên tục. */
  function line(l, gap) {
    const el = $('arMgCaster');
    if (!el || !l) return;
    const now = Date.now();
    if (gap && now - cur.race.lastLine < gap) return;
    if (el.textContent === l.text) return;
    cur.race.lastLine = now;
    el.textContent = l.text;
    el.className = 'ar-mg-caster t-' + (l.tone || 'up');
  }

  function flash(kind) {
    const v = $('arMgVig');
    if (!v || reduced()) return;
    v.classList.remove('is-good', 'is-bad'); void v.offsetWidth;
    v.classList.add(kind === 'good' ? 'is-good' : 'is-bad');
  }

  function onEvt(name) {
    const race = cur.race;
    if (race.settled) return;
    if (cur.g.live && (GOOD.includes(name) || BAD.includes(name) || name === 'flip') && !race.started) race.started = Date.now();
    if (name === 'flip') { race.flips++; return; }
    if (BAD.includes(name)) {
      race.wrongs++;
      if (race.combo >= 3) line({ tone: 'down', text: 'Đứt chuỗi ' + race.combo + ' rồi — ' + say('wrong', race.wrongs) }, 0);
      else line({ tone: 'down', text: say('wrong', race.wrongs) }, 2500);
      race.combo = 0;
      flash('bad');
      paintCombo();
      return;
    }
    if (!GOOD.includes(name)) return;
    race.combo++;
    race.best = Math.max(race.best, race.combo);
    flash('good');
    paintCombo();
    const c = race.combo;
    if (c === 3 || c === 5 || c === 8 || (c > 8 && c % 5 === 0)) {
      const kind = c >= 8 ? 'streak8' : c >= 5 ? 'streak5' : 'streak3';
      line({ tone: 'fire', text: 'Chuỗi ' + c + '! ' + say(kind, c) }, 0);
      if (D && c >= 5) D.banner('CHUỖI ' + c, { tone: 'fire', icon: 'fa-fire', sub: say(kind, c + 1), ms: 1100 });
      A.sfx('combo');
    }
  }
  function paintCombo() {
    const el = $('arMgCombo');
    if (!el) return;
    const c = cur.race.combo;
    el.hidden = c < 2;
    el.innerHTML = `<i class="fa-solid fa-fire" aria-hidden="true"></i> Chuỗi ${c}`;
    el.classList.toggle('is-fever', c >= 5);
    $('arMgStage').classList.toggle('is-fever', c >= 5);
  }

  function onLive(score) {
    const race = cur.race;
    if (race.settled) return; // đang xem kết quả — ván mới bắt đầu sẽ đặt lại khi đóng
    // Thám tử / Máy tính ảo gửi live(0) lúc mở vụ án / nhiệm vụ: đồng hồ thưởng tốc độ chạy từ đây
    if (!cur.g.live) { Object.assign(race, { started: Date.now(), flips: 0, wrongs: 0 }); tickRace(); return; }
    if (!race.started) race.started = Date.now();
    race.me = M.livePoints(cur.g.id, score);
    tickRace();
  }

  function onResult(game, session) {
    if (!cur || game !== cur.g.id) return;
    const a = (session && session.arena) || {};
    if (a.final === false) { // Chim Vượt Ải qua 1 màn: mốc giữa chừng, chưa chốt
      if (D) D.banner('QUA MÀN ' + (a.level || ''), { tone: 'up', icon: 'fa-flag-checkered', sub: fmt(M.points(game, session)) + ' điểm', ms: 1200 });
      return;
    }
    const pts = M.points(game, session);
    const before = cur.rival;
    const r = M.settle(prog(), game, pts, today());
    A.profile().mini = r.prog;
    if (r.xu) A.profile().coins += r.xu;
    A.save();
    cur.race.settled = true;
    $('arMgVig').classList.remove('is-danger');
    line({ tone: 'up', text: 'Hết ván — cùng xem ai thắng!' }, 0);
    setTimeout(() => showResult(r, before), 1100); // để màn kết quả của chính trò hiện một nhịp
  }

  // ============================================================
  // CÔNG BỐ KẾT QUẢ
  // ============================================================
  function showResult(r, rival) {
    const box = $('arMgResult');
    if (!box || !cur) return;
    const next = M.rivalFor(cur.g.id, prog());
    const stage = M.nextStage(cur.g.id); // thắng → mời sang chặng kế trên hành trình
    const title = r.win ? (rival.champ ? 'GIỮ VỮNG NGAI VÀNG!' : 'CHIẾN THẮNG!') : r.near ? 'SÁT NÚT!' : 'CHƯA HẠ ĐƯỢC';
    const tone = r.win ? 'win' : r.near ? 'near' : 'lose';
    const sub = r.win
      ? (rival.champ ? 'Kỷ lục mới: ' + fmt(r.pts) : r.tierUp && next.champ ? 'Em đã hạ cả 5 đối thủ — lên Huyền thoại!' : 'Lên hạng ' + next.tierInfo.name + ' — đối thủ kế: ' + next.face + ' ' + next.name)
      : 'Còn thiếu ' + fmt(r.gap) + ' điểm để hạ ' + rival.face + ' ' + rival.name;
    const maxV = Math.max(r.pts, rival.target) || 1;
    box.innerHTML = `
      <div class="ar-mg-res-card t-${tone}">
        <p class="ar-mg-res-kicker">${esc(cur.g.name)}</p>
        <div class="ar-mg-res-cols">
          <div class="ar-mg-col is-me"><span class="ar-mg-col-val" data-to="${r.pts}">0</span><span class="ar-mg-col-bar"><i style="--h:${Math.round((r.pts / maxV) * 100)}%"></i></span><span class="ar-mg-col-who">${esc(A.avatar())} ${esc(A.nickName())}</span></div>
          <div class="ar-mg-col is-rival"><span class="ar-mg-col-val" data-to="${rival.target}">0</span><span class="ar-mg-col-bar"><i style="--h:${Math.round((rival.target / maxV) * 100)}%"></i></span><span class="ar-mg-col-who">${esc(rival.face)} ${esc(rival.name)}</span></div>
        </div>
        <div class="ar-mg-res-verdict" id="arMgVerdict">
          <h3>${esc(title)}</h3>
          <p>${esc(sub)}</p>
          <p class="ar-mg-res-say">${esc(M.verdictLine(r, r.pts + prog().g[cur.g.id].plays))}</p>
          ${r.parts.length ? `<ul class="ar-mg-res-xu">${r.parts.map((x) => `<li><span>${esc(x.label)}</span><b>+${x.xu}</b></li>`).join('')}</ul>` : ''}
          <p class="ar-mg-res-total" id="arMgXu"><i class="fa-solid fa-coins" aria-hidden="true"></i> +${r.xu} xu${r.capped ? ' <small>(đã chạm trần ' + M.DAILY_CAP + ' xu hôm nay — vẫn tính hạng và kỷ lục)</small>' : ''}</p>
          <div class="ar-row ar-center-row">
            <button type="button" class="ar-btn ar-btn-play" id="arMgAgain"><i class="fa-solid ${r.win ? 'fa-forward' : 'fa-rotate-right'}" aria-hidden="true"></i> ${r.win ? (next.champ ? 'Giữ ngai vàng' : 'Đấu ' + esc(next.name)) : 'Phục thù ngay'}</button>
            <button type="button" class="ar-btn ar-btn-ghost" id="arMgPeek"><i class="fa-solid fa-eye" aria-hidden="true"></i> Xem màn của trò</button>
            ${r.win && stage ? `<button type="button" class="ar-btn ar-btn-pack" id="arMgNext"><i class="fa-solid fa-route" aria-hidden="true"></i> Chặng ${M.stageOf(stage.id)}: ${esc(stage.name)}</button>` : ''}
            <button type="button" class="ar-btn ar-btn-ghost" id="arMgOther"><i class="fa-solid fa-table-cells-large" aria-hidden="true"></i> Đổi trò</button>
          </div>
        </div>
      </div>`;
    box.hidden = false;
    A.refreshWallet();
    $('arMgAgain').addEventListener('click', () => openVs(cur.g.id));
    $('arMgPeek').addEventListener('click', () => { box.hidden = true; resumeRace(); });
    $('arMgOther').addEventListener('click', leave);
    if ($('arMgNext')) $('arMgNext').addEventListener('click', () => openVs(stage.id));
    revealCols(box, () => {
      $('arMgVerdict').classList.add('is-on');
      A.sfx(r.win ? 'win' : r.near ? 'match' : 'lose');
      if (D) D.banner(title, { tone: r.win ? 'gold' : r.near ? 'final' : 'down', icon: r.win ? 'fa-trophy' : r.near ? 'fa-bolt' : 'fa-heart', ms: 1400 });
      if (r.win) A.celebrate(1);
      if (r.xu && D) D.coinFly($('arMgXu'), $('arWallet'), Math.min(10, 3 + Math.round(r.xu / 6)));
      $('arMgAgain').focus();
    });
  }

  /** 2 cột điểm mọc lên cùng lúc, số đếm theo — trống dồn rồi mới lộ kết quả. */
  function revealCols(box, done) {
    const vals = [...box.querySelectorAll('.ar-mg-col-val')];
    if (reduced()) { vals.forEach((v) => { v.textContent = fmt(+v.dataset.to); }); box.classList.add('is-grown'); done(); return; }
    A.sfx('count');
    requestAnimationFrame(() => box.classList.add('is-grown'));
    const t0 = performance.now(), dur = 1500;
    const step = (now) => {
      const f = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - f, 3);
      vals.forEach((v) => { v.textContent = fmt(+v.dataset.to * e); });
      if (f < 1) requestAnimationFrame(step); else setTimeout(done, 250);
    };
    requestAnimationFrame(step);
  }

  /** Đóng bảng kết quả để xem màn của trò / chơi tiếp trong iframe: ván sau đua lại từ đầu với đối thủ hiện tại. */
  function resumeRace() {
    if (!cur) return;
    cur.rival = M.rivalFor(cur.g.id, prog());
    Object.assign(cur.race, { me: 0, started: 0, combo: 0, flips: 0, wrongs: 0, lead: null, settled: false });
    const ghost = $('arMgGhost');
    if (ghost) {
      const lane = ghost.closest('.ar-mg-lane');
      lane.querySelector('.ar-mg-who').textContent = cur.rival.face;
      ghost.textContent = cur.g.live ? '0' : fmt(cur.rival.target);
    }
    paintRace(0, cur.g.live ? 0 : cur.rival.target);
    paintCombo();
    line({ tone: 'up', text: 'Ván mới: đối thủ ' + cur.rival.face + ' ' + cur.rival.name + ' — mốc ' + fmt(cur.rival.target) + ' điểm.' }, 0);
  }

  function leave() {
    if (cur) clearInterval(cur.timer);
    cur = null;
    if (D) D.hide();
    $('arMiniBody').innerHTML = '';
    A.setRole('minigame', true);
    A.show('arHome');
    paintGrid();
  }

  // ============================================================
  // KHỞI ĐỘNG
  // ============================================================
  global.addEventListener('message', (e) => {
    if (e.origin !== global.location.origin || !cur || !cur.race) return;
    const fr = $('arMgFrame');
    if (!fr || e.source !== fr.contentWindow) return;
    const m = e.data;
    if (!m || m.src !== 'edu-mini') return;
    if (m.t === 'evt') onEvt(m.name);
    else if (m.t === 'live') onLive(m.score);
    else if (m.t === 'result') onResult(m.game, m.session);
  });

  function init() {
    const grid = $('arMiniGrid');
    if (!grid) return;
    grid.addEventListener('click', (e) => { const t = e.target.closest('.ar-mg-tile'); if (t) openVs(t.dataset.game); });
    $('arMiniLeave').addEventListener('click', leave);
    document.addEventListener('arena:role', (e) => { if (e.detail && e.detail.role === 'minigame') paintGrid(); });
    $('arNick').addEventListener('change', paintGrid);
    paintGrid();
    const want = new URLSearchParams(global.location.search).get('tro');
    if (want && M.byId(want) && A.role() === 'minigame' && String($('arNick').value || '').trim()) openVs(want);
  }
  init();

  global.EduArenaMini = { paintGrid, openVs };
})(window);
