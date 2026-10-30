/* ============================================================
   js/arena/arena-quest.js — bản đồ "Hành trình IC3" (vai thứ 4 của Đấu trường, arena.html?vai=minigame).
   Ghép 2 module cũ thành 1 hành trình:
     • Trận quiz của Chơi một mình (js/arena/arena.js → api.playQuest) — mỗi vùng 1 chủ đề IC3,
       1 chế độ chơi riêng, 10 câu lấy từ bộ "Theo chủ đề" của cấp em chọn.
     • Mini-game (js/arena/arena-mini.js → openVs) — đặt đúng vùng chủ đề của trò.
   Sao 1–3 mỗi chặng, rương vùng, danh hiệu, 3 nhiệm vụ ngày (logic thuần: arena-quest-core.js).
   Tranh: cảnh nền np-art cho từng vùng, huy hiệu chặng = tranh bìa chế độ (arena-covers.js) hoặc
   tranh 3D mini-game (arena-mini-art.js). Lưu trong hồ sơ biệt danh: players[nick].quest.
   0 Firebase, 0 Apps Script.
   ============================================================ */
(function (global) {
  'use strict';

  const A = global.EduArena && global.EduArena.api;
  const Q = global.EduArenaQuestCore;
  const M = global.EduArenaMiniCore;
  const D = global.EduArenaDrama;
  if (!A || !Q || !M) return;

  const $ = (id) => document.getElementById(id);
  const esc = A.esc;
  const COV = global.EduArenaCovers;
  const ART3D = global.EduArenaMiniArt;
  const reduced = () => { try { return global.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };

  const LEVELS = [['Spark', 'LV1'], ['Spark', 'LV2'], ['Spark', 'LV3'], ['IC3', 'LV1'], ['IC3', 'LV2'], ['IC3', 'LV3']]
    .map(([cat, lvl]) => ({ cat, lvl, key: cat + '|' + lvl, name: cat + ' ' + lvl.replace('LV', 'Cấp ') }));
  const COLORS = { r1: '#2f6fe0', r2: '#0f9d75', r3: '#7a4ae0', r4: '#e0732f', r5: '#d6336c', r6: '#1593a8', r7: '#c0392b', fin: '#4b2a8f' };

  function qp() { const p = A.profile(); p.quest = Q.norm(p.quest); return p.quest; }
  function mapKey() {
    const q = qp();
    if (LEVELS.some((l) => l.key === q.lv)) return q.lv;
    const d = A.prefs.deck || {};
    const k = d.cat + '|' + d.lvl;
    return LEVELS.some((l) => l.key === k) ? k : LEVELS[0].key;
  }
  const levelOf = (key) => LEVELS.find((l) => l.key === key) || LEVELS[0];
  const modeName = (m) => String((A.MODE_LABEL || {})[m] || m).replace(/^\S+\s/, '');
  const today = () => Q.dayKey();

  /** Tên, mô tả, tranh của 1 chặng. */
  function info(node) {
    const r = Q.regionById(node.region);
    if (node.kind === 'mini') {
      const g = M.byId(node.game);
      return { r, title: g.name, kind: 'Mini-game', desc: g.desc, learn: g.learn, art: ART3D ? ART3D.draw(g.id) : '', g };
    }
    const rule = document.querySelector(`.ar-mode[data-mode="${node.region === 'fin' ? 'boss' : r.mode}"] small:not(.only-teacher)`);
    return {
      r, title: (r.final ? 'Trận cuối: ' : 'Trận ') + modeName(r.mode), kind: Q.QUIZ_N + ' câu quiz',
      desc: rule ? rule.textContent.trim() : '', learn: r.lead, art: COV ? COV.cover(r.mode) : '',
    };
  }
  /** Điều kiện từng sao (để em biết cần làm gì). */
  function rules(node) {
    if (node.kind === 'mini') {
      const l = M.byId(node.game).ladder;
      return [`Đạt ${M.fmt(l[0])} điểm (hạ đối thủ hạng Đồng)`, `Đạt ${M.fmt(l[2])} điểm (mốc hạng Vàng)`, `Đạt ${M.fmt(l[4])} điểm (mốc Huyền thoại)`];
    }
    return ['Đúng từ 50% số câu', 'Đúng từ 75% số câu', 'Đúng từ 90% và thắng trận'];
  }
  const starRow = (n, cls) => `<span class="ar-q-stars ${cls || ''}" aria-label="${n}/3 sao">${[0, 1, 2].map((i) =>
    `<i class="fa-solid fa-star${i < n ? ' is-on' : ''}" aria-hidden="true"></i>`).join('')}</span>`;

  // ============================================================
  // VẼ BẢN ĐỒ
  // ============================================================
  function headHtml(key) {
    const q = qp(), total = Q.totalStars(q, key), t = Q.titleFor(total), nt = Q.nextTitle(total);
    const pct = nt ? Math.round(((total - t.min) / (nt.min - t.min)) * 100) : 100;
    const mp = global.EduArenaMini ? global.EduArenaMini.prog() : null;
    const used = mp && mp.day && mp.day.date === M.dayKey() ? mp.day.xu : 0;
    const feat = M.byId(M.featured(M.dayKey()));
    return `<div class="ar-q-title">
        <h2 class="ar-h2"><i class="fa-solid fa-route" aria-hidden="true"></i> Hành trình IC3</h2>
        <p class="ar-hint">Đi qua 7 vùng theo 7 chủ đề IC3 rồi đấu Trùm cuối. Mỗi vùng có trận quiz đúng chủ đề, vài vùng có thêm mini-game. Gom sao để mở rương và lên danh hiệu.</p>
        <div class="ar-q-levels" role="radiogroup" aria-label="Cấp độ của bản đồ">${LEVELS.map((l) => {
          const on = l.key === key;
          return `<button type="button" class="ar-q-lv${on ? ' is-on' : ''}" role="radio" aria-checked="${on}" data-lv="${esc(l.key)}">${esc(l.name)}<small>${Q.totalStars(q, l.key)}★</small></button>`;
        }).join('')}</div>
      </div>
      <div class="ar-q-badge">
        <span class="ar-q-badge-ico" aria-hidden="true"><i class="fa-solid fa-crown"></i></span>
        <div><small>Danh hiệu</small><b>${esc(t.name)}</b>
          <span class="ar-q-bar" aria-hidden="true"><i style="width:${pct}%"></i></span>
          <small>${total}/${Q.MAX_STARS} sao${nt ? ` · còn ${nt.min - total} sao lên <b>${esc(nt.name)}</b>` : ' · đã cao nhất'}</small>
          <small class="ar-q-mini-day"><i class="fa-solid fa-coins" aria-hidden="true"></i> Mini-game hôm nay ${used}/${M.DAILY_CAP} xu · Trò của ngày: <b>${esc(feat.name)}</b> xu ×2</small>
        </div>
      </div>`;
  }

  function dailyHtml() {
    const q = qp(), d = Q.dayOf(q, today());
    return `<h3 class="ar-q-h3"><i class="fa-solid fa-list-check" aria-hidden="true"></i> Nhiệm vụ hôm nay <small>+${Q.QUEST_XU} xu mỗi nhiệm vụ</small></h3>
      <ul class="ar-q-daily">${Q.questsOf(today()).map((t) => {
        const v = Math.min(t.goal, d[t.id] || 0), done = d.done.includes(t.id);
        return `<li class="${done ? 'is-done' : ''}"><i class="fa-solid ${done ? 'fa-circle-check' : 'fa-star'}" aria-hidden="true"></i>
          <span>${esc(t.text)}</span><span class="ar-q-bar" aria-hidden="true"><i style="width:${Math.round((v / t.goal) * 100)}%"></i></span><b>${v}/${t.goal}</b></li>`;
      }).join('')}</ul>`;
  }

  let sceneN = 0;
  function sceneSvg(name) {
    const raw = global.EduArenaMini && global.EduArenaMini.sceneSvg ? global.EduArenaMini.sceneSvg(name) : '';
    const p = 'q' + (++sceneN) + '-'; // đổi lại id: nhiều vùng có thể dùng chung cảnh
    return raw.replace(/\bid="([^"]+)"/g, `id="${p}$1"`).replace(/url\(#([^)]+)\)/g, `url(#${p}$1)`).replace(/href="#([^"]+)"/g, `href="#${p}$1"`);
  }

  function mapHtml(key) {
    const q = qp(), next = Q.nextNode(q, key), me = A.avatar(), m = Q.mapOf(q, key);
    return Q.REGIONS.map((r, i) => {
      const ns = Q.nodesOf(r.id), got = Q.regionStars(q, key, r.id), max = ns.length * 3;
      const chest = m.chest[r.id];
      const chestHtml = chest === 2 ? '<span class="ar-q-chest is-gold" title="Đã mở rương vàng"><i class="fa-solid fa-crown" aria-hidden="true"></i> Rương vàng</span>'
        : chest ? '<span class="ar-q-chest is-open" title="Đã mở rương vùng"><i class="fa-solid fa-coins" aria-hidden="true"></i> Đã mở rương</span>'
        : `<span class="ar-q-chest" title="Mọi chặng trong vùng có sao thì mở rương +${Q.CHEST_XU} xu"><i class="fa-solid fa-lock" aria-hidden="true"></i> Rương +${Q.CHEST_XU} xu</span>`;
      const nodes = ns.map((n) => {
        const s = Q.starsOf(q, key, n.id), f = info(n), isNext = next && next.id === n.id;
        return `<button type="button" class="ar-q-node k-${n.kind} s-${s}${isNext ? ' is-next' : ''}" data-node="${esc(n.id)}" aria-label="${esc(f.title)} — ${s}/3 sao">
          ${isNext ? `<span class="ar-q-me" aria-hidden="true">${esc(me)}</span>` : ''}
          <span class="ar-q-medal" aria-hidden="true">${f.art}</span>
          ${starRow(s)}
          <span class="ar-q-nname">${esc(f.title)}</span>
          <span class="ar-q-nkind">${esc(f.kind)}</span>
        </button>`;
      }).join('');
      return `${i ? '<div class="ar-q-link" aria-hidden="true"></div>' : ''}
        <section class="ar-q-region${i % 2 ? ' is-rev' : ''}${r.final ? ' is-final' : ''}${got === max ? ' is-full' : ''}" style="--rc:${COLORS[r.id]}" aria-label="${r.final ? 'Trùm cuối' : 'Vùng ' + r.no}: ${esc(r.name)}">
          <div class="ar-q-scene" aria-hidden="true">${sceneSvg(r.scene)}</div>
          <header class="ar-q-rhead">
            <span class="ar-q-rno">${r.final ? '<i class="fa-solid fa-trophy" aria-hidden="true"></i> Trùm cuối' : 'Vùng ' + r.no}</span>
            <b>${esc(r.name)}</b><small>${esc(r.lead)}</small>
            <span class="ar-q-rmeta"><span class="ar-q-rstars"><i class="fa-solid fa-star" aria-hidden="true"></i> ${got}/${max}</span>${chestHtml}</span>
          </header>
          <div class="ar-q-path">${nodes}</div>
        </section>`;
    }).join('');
  }

  function paint(focusNext) {
    const key = mapKey();
    if (!$('arQuestMap')) return;
    $('arQuestHead').innerHTML = headHtml(key);
    $('arQuestDaily').innerHTML = dailyHtml();
    $('arQuestMap').innerHTML = mapHtml(key);
    if (focusNext && A.role() === 'minigame') {
      const el = $('arQuestMap').querySelector('.ar-q-node.is-next');
      if (el) setTimeout(() => el.scrollIntoView({ block: 'center', behavior: reduced() ? 'auto' : 'smooth' }), 120);
    }
  }

  // ============================================================
  // THẺ CHẶNG (bấm 1 chặng trên bản đồ)
  // ============================================================
  let sheetNode = null;
  function openSheet(id) {
    const n = Q.nodeById(id);
    if (!n) return;
    sheetNode = n;
    const key = mapKey(), s = Q.starsOf(qp(), key, n.id), f = info(n);
    let extra = '';
    if (n.kind === 'mini' && global.EduArenaMini) {
      const rv = M.rivalFor(n.game, global.EduArenaMini.prog());
      extra = `<p class="ar-q-sheet-rival"><span>${esc(rv.face)}</span> Đối thủ hiện tại: <b>${esc(rv.name)}</b> · ${rv.champ ? 'giữ ngai vàng' : 'hạng ' + esc(rv.tierInfo.name)}</p>`;
    } else if (n.kind === 'quiz') {
      extra = `<p class="ar-q-sheet-rival"><i class="fa-solid fa-book-open" aria-hidden="true"></i> Câu hỏi: ${f.r.final ? 'trộn cả 7 chủ đề' : 'chủ đề ' + esc(f.r.name)} · ${esc(levelOf(key).name)}</p>`;
    }
    const box = $('arQuestSheet');
    box.innerHTML = `<div class="ar-q-sheet-card" role="dialog" aria-modal="true" aria-labelledby="arQuestSheetTitle" style="--rc:${COLORS[n.region]}">
        <div class="ar-q-sheet-art" aria-hidden="true"><div class="ar-q-scene">${sceneSvg(f.r.scene)}</div><div class="ar-q-sheet-fig">${f.art}</div></div>
        <div class="ar-q-sheet-body">
          <p class="ar-q-sheet-kicker">${f.r.final ? 'Trùm cuối' : 'Vùng ' + f.r.no + ' · ' + esc(f.r.name)} · ${esc(f.kind)}</p>
          <h3 id="arQuestSheetTitle">${esc(f.title)}</h3>
          ${starRow(s, 'is-lg')}
          <p>${esc(f.desc)}</p>
          <p class="ar-q-sheet-learn"><b>Em học được:</b> ${esc(f.learn)}</p>
          ${extra}
          <ol class="ar-q-rules">${rules(n).map((t, i) => `<li class="${i < s ? 'is-on' : ''}">${starRow(i + 1)} ${esc(t)}</li>`).join('')}</ol>
          <div class="ar-row ar-center-row">
            <button type="button" class="ar-btn ar-btn-play" id="arQuestGo"><i class="fa-solid fa-play" aria-hidden="true"></i> ${s ? 'Chơi lại chặng' : 'Vào chặng'}</button>
            <button type="button" class="ar-btn ar-btn-ghost" id="arQuestClose"><i class="fa-solid fa-xmark" aria-hidden="true"></i> Đóng</button>
          </div>
        </div>
      </div>`;
    box.hidden = false;
    $('arQuestGo').addEventListener('click', go);
    $('arQuestClose').addEventListener('click', closeSheet);
    $('arQuestGo').focus();
    A.sfx('click');
  }
  function closeSheet() {
    const box = $('arQuestSheet');
    if (!box || box.hidden) return;
    box.hidden = true;
    box.innerHTML = '';
    const back = sheetNode && $('arQuestMap').querySelector(`[data-node="${sheetNode.id}"]`);
    sheetNode = null;
    if (back) back.focus();
  }
  async function go() {
    const n = sheetNode;
    if (!n) return;
    const nick = A.setNick($('arNick').value || '');
    if (!nick) { closeSheet(); A.toast('Nhập biệt danh trước để lưu sao và xu của em nhé!'); $('arNick').focus(); return; }
    const key = mapKey(), lv = levelOf(key), r = Q.regionById(n.region);
    closeSheet();
    if (n.kind === 'mini') { if (global.EduArenaMini) global.EduArenaMini.openVs(n.game); return; }
    A.toast('Đang tải câu hỏi ' + (r.final ? 'trận cuối' : 'chủ đề ' + r.name) + '...');
    await A.playQuest({
      cat: lv.cat, lvl: lv.lvl, mt: r.mt, mode: r.mode, n: Q.QUIZ_N,
      title: 'Hành trình · ' + (r.final ? 'Trùm cuối' : 'Vùng ' + r.no + ': ' + r.name),
      quest: { node: n.id, map: key },
    });
  }

  // ============================================================
  // KẾT QUẢ CHẶNG (gọi từ arena.js khi hết trận quiz, arena-mini.js khi hết ván mini-game)
  // ============================================================
  function apply(node, map, stars, extra) {
    const res = Q.settle(qp(), map, node, stars, today(), extra);
    if (res.xu) A.profile().coins += res.xu;
    A.save();
    const n = Q.nodeById(node);
    res.node = n;
    res.title = n ? info(n).title : '';
    res.next = n ? rules(n)[Math.min(2, Math.max(res.before, res.stars))] : '';
    return res;
  }
  function onQuizEnd(quest, r) {
    if (!quest || !Q.nodeById(quest.node)) return null;
    return apply(quest.node, quest.map, Q.quizStars(r), { correct: r.correct });
  }
  function onMiniEnd(game, pts) {
    const n = Q.NODES.find((x) => x.game === game);
    if (!n) return null;
    return apply(n.id, mapKey(), Q.miniStars(M.byId(game).ladder, pts));
  }

  function resultHtml(res) {
    const best = Math.max(res.before, res.stars);
    const line = res.gained ? `+${res.gained} sao mới!` : res.stars ? `Em giữ ${best}/3 sao ở chặng này.` : 'Chưa có sao lần này — thử lại nhé!';
    return `<div class="ar-q-res">
        <p class="ar-q-res-kicker"><i class="fa-solid fa-route" aria-hidden="true"></i> Hành trình IC3 · ${esc(res.title)}</p>
        <span class="ar-q-res-stars" aria-label="${res.stars}/3 sao">${[0, 1, 2].map((i) =>
          `<i class="fa-solid fa-star${i < res.stars ? ' will-on' : ''}${i >= res.before && i < res.stars ? ' is-new' : ''}" aria-hidden="true"></i>`).join('')}</span>
        <p class="ar-q-res-line">${esc(line)}</p>
        ${best < 3 && res.next ? `<p class="ar-q-res-hint">Sao kế tiếp: ${esc(res.next)}</p>` : ''}
        ${res.parts.length ? `<ul class="ar-q-res-parts">${res.parts.map((p) => `<li><span>${esc(p.label)}</span><b>+${p.xu} xu</b></li>`).join('')}</ul>` : ''}
        ${res.titleUp ? `<p class="ar-q-res-title"><i class="fa-solid fa-crown" aria-hidden="true"></i> Danh hiệu mới: <b>${esc(res.titleUp.name)}</b></p>` : ''}
      </div>`;
  }
  /** Sao bật lần lượt, sao mới có tiếng + nảy; rương/nhiệm vụ thì xu bay vào ví. */
  function animateResult(box, res) {
    const stars = [...box.querySelectorAll('.ar-q-res-stars .will-on')];
    if (reduced()) { stars.forEach((s) => s.classList.add('is-on')); return; }
    stars.forEach((s, i) => setTimeout(() => {
      s.classList.add('is-on');
      if (s.classList.contains('is-new')) A.sfx(i === 2 ? 'combo' : 'correct');
    }, 500 + i * 380));
    const after = 500 + stars.length * 380;
    if (res.xu && D) setTimeout(() => D.coinFly(box, $('arWallet'), Math.min(10, 3 + Math.round(res.xu / 8))), after);
    if (res.titleUp && D) setTimeout(() => D.banner('DANH HIỆU MỚI', { tone: 'gold', icon: 'fa-crown', sub: res.titleUp.name, ms: 1600 }), after + 300);
    else if (res.chest && D) setTimeout(() => D.banner(res.chest === 'gold' ? 'RƯƠNG VÀNG!' : 'MỞ RƯƠNG VÙNG!', { tone: 'gold', icon: res.chest === 'gold' ? 'fa-crown' : 'fa-coins', ms: 1300 }), after + 300);
    setTimeout(() => A.refreshWallet(), after + 200);
  }

  // ============================================================
  // KHỞI ĐỘNG
  // ============================================================
  function init() {
    const map = $('arQuestMap');
    if (map) {
      map.addEventListener('click', (e) => { const b = e.target.closest('.ar-q-node'); if (b) openSheet(b.dataset.node); });
      $('arQuestHead').addEventListener('click', (e) => {
        const b = e.target.closest('.ar-q-lv');
        if (!b) return;
        qp().lv = b.dataset.lv; A.save(); A.sfx('click'); paint();
      });
      const sheet = $('arQuestSheet');
      sheet.addEventListener('click', (e) => { if (e.target === sheet) closeSheet(); });
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });
    }
    document.addEventListener('arena:role', (e) => { if (e.detail && e.detail.role === 'minigame') paint(true); });
    $('arNick').addEventListener('change', () => paint());
    const join = $('arJoinScene');
    if (join) join.innerHTML = sceneSvg('classroom');
    paint();
  }

  global.EduArenaQuest = { paint, onQuizEnd, onMiniEnd, resultHtml, animateResult };
  init();
})(window);
