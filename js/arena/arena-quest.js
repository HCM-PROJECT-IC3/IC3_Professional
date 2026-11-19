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

  /* Cảnh nền: đổi id theo TIỀN TỐ CỐ ĐỊNH của nơi vẽ (vùng / thẻ chặng) và nhớ sẵn — trước đây mỗi lần vẽ lại id đổi theo bộ
     đếm → 8 cảnh SVG lớn bị dựng lại từ đầu mỗi lần về bản đồ (giật, "khựng"). Nay vẽ lại giống hệt → bỏ qua được (paint). */
  const sceneCache = new Map();
  function sceneSvg(name, prefix) {
    const k = name + '|' + prefix;
    if (sceneCache.has(k)) return sceneCache.get(k);
    const raw = global.EduArenaMini && global.EduArenaMini.sceneSvg ? global.EduArenaMini.sceneSvg(name) : '';
    const p = 'q' + prefix + '-'; // nhiều vùng có thể dùng chung cảnh → id riêng từng nơi vẽ
    const out = raw.replace(/\bid="([^"]+)"/g, `id="${p}$1"`).replace(/url\(#(?!np(?:Sph|SphSoft|Cyl|Light)\b)([^)]+)\)/g, `url(#${p}$1)`).replace(/href="#([^"]+)"/g, `href="#${p}$1"`);
    if (raw) sceneCache.set(k, out);
    return out;
  }

  /* NGƯỜI DẪN ĐƯỜNG mỗi vùng (18/11/2026): nói theo tiến độ của em ở vùng đó — chưa tới / đang đi / đã xong.
     Chỉ người dẫn đường của vùng em đang đi mới lên tiếng (không cả bản đồ cùng nói). {left} = số chặng chưa có sao. */
  const GUIDES = {
    r1: { who: 'Cô Lan', role: 'phòng máy', hi: 'Chào em! Phòng máy hôm nay mở cửa sớm. Thử Trận Tốc độ cho nóng người đã nhé.',
      mid: 'Em quen tay rồi đấy. Phòng máy còn {left} chặng chờ em.', done: 'Phòng máy giờ là của em. Ra phố thôi, Công dân số đang đợi!' },
    r2: { who: 'Chú Tư', role: 'đầu phố', hi: 'Trên mạng cũng như ngoài phố: đi đứng lịch sự, đừng lấy đồ của người khác. Vào đua nào!',
      mid: 'Phố còn {left} chặng. Nhớ: cái gì đăng lên mạng thì khó gỡ lắm.', done: 'Cả phố đều biết tên em rồi. Lên phòng máy chủ xem sao!' },
    r3: { who: 'Anh Khoa', role: 'phòng máy chủ', hi: 'Ở đây dữ liệu nhiều như núi. Ai tìm đúng, lọc đúng mới săn được vàng.',
      mid: 'Còn {left} chặng. Gặp nguồn tin lạ thì hỏi: ai viết, viết khi nào?', done: 'Kho dữ liệu đã gọn gàng. Bữa tiệc sáng tạo đang chờ!' },
    r4: { who: 'Chị Mai', role: 'xưởng sáng tạo', hi: 'Xưởng hôm nay làm văn bản, trang tính, trình chiếu. Câu cá được câu nào thì câu nhé!',
      mid: 'Còn {left} chặng. Bài đẹp là bài người đọc hiểu ngay.', done: 'Sản phẩm của em treo kín tường rồi. Ra sân thôi!' },
    r5: { who: 'Thầy Bình', role: 'sân trường', hi: 'Kéo co cần cả đội nghe nhau. Gửi thư, nhắn tin cũng vậy: rõ ràng và lịch sự.',
      mid: 'Còn {left} chặng. Trước khi bấm Gửi, đọc lại một lượt nhé.', done: 'Đội nào cũng muốn có em. Qua đảo cộng tác nào!' },
    r6: { who: 'Bà Năm', role: 'bến đảo', hi: 'Trên đảo này không ai làm một mình. Chia việc, chia tệp, cùng sửa — rồi mới tung phép!',
      mid: 'Còn {left} chặng. Làm nhóm thì nhớ ghi ai sửa gì.', done: 'Đảo đã thông thuyền. Lâu đài bảo mật ở ngay trước mặt.' },
    r7: { who: 'Đội trưởng Hùng', role: 'cổng lâu đài', hi: 'Kẻ xấu hay giả làm người quen. Mật khẩu là chìa khoá — đừng đưa ai cả.',
      mid: 'Còn {left} chặng. Thấy đường link lạ: dừng lại, nhìn kỹ, rồi mới bấm.', done: 'Lâu đài an toàn. Giờ chỉ còn Trùm cuối trên trạm vũ trụ!' },
    fin: { who: 'Chỉ huy Linh', role: 'trạm vũ trụ', hi: 'Trùm cuối trộn câu hỏi của cả bảy vùng. Cả đội trông vào em đấy.',
      mid: 'Virus vẫn còn đó. Thêm một trận nữa nhé!', done: 'Em đã đi hết Hành trình IC3. Cả bản đồ này là của em!' },
  };
  function guideText(r, q, key) {
    const g = GUIDES[r.id];
    if (!g) return '';
    const ns = Q.nodesOf(r.id);
    const left = ns.filter((n) => !Q.starsOf(q, key, n.id)).length;
    return left === ns.length ? g.hi : left ? g.mid.replace('{left}', left) : g.done;
  }
  function guideLine(r, q, key) {
    const g = GUIDES[r.id];
    if (!g) return '';
    const text = guideText(r, q, key);
    return `<p class="ar-q-guide"><span class="ar-q-guide-fig" aria-hidden="true">${guideFig(r.id)}</span>
      <span class="ar-q-guide-say"><b>${esc(g.who)}</b> <small>· ${esc(g.role)}</small><br>${esc(text)}</span></p>`;
  }
  /** Người dẫn đường: hình phẳng tự vẽ (đầu, tóc, áo theo màu vùng) — không emoji, không tranh AI. */
  function guideFig(id) {
    const c = COLORS[id] || '#2d2416';
    const hair = { r1: '#3b2a1a', r2: '#6b6b6b', r3: '#1f1f1f', r4: '#7a3b1a', r5: '#2a2a2a', r6: '#d9d9d9', r7: '#2a1f14', fin: '#4a2a14' }[id] || '#2a2a2a';
    return `<svg viewBox="0 0 48 48" width="40" height="40"><circle cx="24" cy="24" r="23" fill="#fffdf7" stroke="#2d2416" stroke-width="2"/>
      <path d="M9 44c2-9 8-13 15-13s13 4 15 13" fill="${c}" stroke="#2d2416" stroke-width="2"/>
      <circle cx="24" cy="20" r="9" fill="#f2c9a0" stroke="#2d2416" stroke-width="2"/>
      <path d="M15 19c0-7 4-10 9-10s9 3 9 10c-3-3-6-4-9-4s-6 1-9 4z" fill="${hair}" stroke="#2d2416" stroke-width="1.5"/>
      <circle cx="20.5" cy="21" r="1.3" fill="#2d2416"/><circle cx="27.5" cy="21" r="1.3" fill="#2d2416"/>
      <path d="M21 25c2 1.6 4 1.6 6 0" fill="none" stroke="#2d2416" stroke-width="1.5" stroke-linecap="round"/></svg>`;
  }

  /** Tranh huy hiệu chặng trên bản đồ: vẽ 1 lần rồi nhớ (bộ vẽ tranh sinh id SVG mới mỗi lần → bản đồ phải dựng lại). */
  const artCache = new Map();
  function medalArt(n, f) {
    if (!artCache.has(n.id)) artCache.set(n.id, f.art);
    return artCache.get(n.id);
  }
  function mapHtml(key) {
    const q = qp(), next = Q.nextNode(q, key), me = A.avatar(), m = Q.mapOf(q, key);
    const hereAt = next ? Q.REGIONS.findIndex((r) => r.id === next.region) : Q.REGIONS.length - 1;
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
          <span class="ar-q-medal" aria-hidden="true">${medalArt(n, f)}</span>
          ${starRow(s)}
          <span class="ar-q-nname">${esc(f.title)}</span>
          <span class="ar-q-nkind">${esc(f.kind)}</span>
        </button>`;
      }).join('');
      // Vùng phía trước chưa đặt chân tới: phủ sương (vẫn bấm vào được — bản đồ không khoá theo thứ tự)
      const fog = i > hereAt && got === 0;
      return `${i ? `<div class="ar-q-link${i <= hereAt ? ' is-walked' : ''}" aria-hidden="true"></div>` : ''}
        <section class="ar-q-region${i % 2 ? ' is-rev' : ''}${r.final ? ' is-final' : ''}${got === max ? ' is-full' : ''}${fog ? ' is-fog' : ''}${i === hereAt ? ' is-here' : ''}" style="--rc:${COLORS[r.id]}" data-region="${r.id}" aria-label="${r.final ? 'Trùm cuối' : 'Vùng ' + r.no}: ${esc(r.name)}${fog ? ' (chưa khám phá)' : ''}">
          <div class="ar-q-scene" aria-hidden="true">${sceneSvg(r.scene, r.id)}</div>
          <header class="ar-q-rhead">
            <span class="ar-q-rno">${r.final ? '<i class="fa-solid fa-trophy" aria-hidden="true"></i> Trùm cuối' : 'Vùng ' + r.no}</span>
            <b>${esc(r.name)}</b><small>${esc(r.lead)}</small>
            <span class="ar-q-rmeta"><span class="ar-q-rstars"><i class="fa-solid fa-star" aria-hidden="true"></i> ${got}/${max}</span>${fog ? '<span class="ar-q-chest is-fog"><i class="fa-solid fa-cloud" aria-hidden="true"></i> Chưa khám phá</span>' : chestHtml}</span>
          </header>
          ${i === hereAt ? guideLine(r, q, key) : ''}
          <div class="ar-q-path">${nodes}</div>
        </section>`;
    }).join('');
  }

  let paintedNick = null; // biệt danh của lần vẽ gần nhất
  const nickNow = () => String(($('arNick') && $('arNick').value) || '').trim().toLowerCase();
  const last = { head: '', daily: '', map: '' };
  let walkFrom = null; // chặng em vừa vào chơi → khi về bản đồ, nhân vật đi bộ từ đó sang chặng kế
  let queued = null;
  /* Gộp các lần gọi trong cùng 1 nhịp: về bản đồ trước đây vẽ 2 LẦN liền (sự kiện arena:role + toMap) → giật. */
  function paint(focusNext) {
    if (queued) { queued.focus = queued.focus || !!focusNext; return; }
    queued = { focus: !!focusNext };
    Promise.resolve().then(() => { const f = queued.focus; queued = null; paintNow(f); });
  }
  function paintNow(focusNext) {
    paintedNick = nickNow();
    const key = mapKey();
    if (!$('arQuestMap')) return;
    const put = (id, slot, html) => { if (last[slot] !== html) { $(id).innerHTML = html; last[slot] = html; } };
    put('arQuestHead', 'head', headHtml(key));
    put('arQuestDaily', 'daily', dailyHtml());
    put('arQuestMap', 'map', mapHtml(key));
    if (focusNext && A.role() === 'minigame') {
      const el = $('arQuestMap').querySelector('.ar-q-node.is-next');
      const from = walkFrom && $('arQuestMap').querySelector(`[data-node="${walkFrom}"]`);
      walkFrom = null;
      if (el) setTimeout(() => {
        el.scrollIntoView({ block: 'center', behavior: reduced() ? 'auto' : 'smooth' });
        if (from && from !== el) setTimeout(() => walk(from, el), reduced() ? 0 : 450);
      }, 120);
    }
  }
  /** Nhân vật của em đi từ chặng `from` tới chặng `to` theo từng bước nhún (không "dịch chuyển tức thời"). */
  function walk(from, to) {
    const me = to.querySelector('.ar-q-me');
    if (!me || reduced() || !me.animate) return;
    const a = from.querySelector('.ar-q-medal').getBoundingClientRect(), b = me.getBoundingClientRect();
    const dx = a.left + a.width / 2 - (b.left + b.width / 2), dy = a.top - 26 - b.top;
    const dist = Math.hypot(dx, dy);
    if (dist < 8) return;
    // Vùng có overflow:hidden → đi xuyên vùng thì nhân vật thật bị cắt. Cho 1 BẢN SAO đi trên lớp của trang
    // (toạ độ trang, không phải màn hình → cuộn giữa chừng vẫn khớp), tới nơi mới hiện nhân vật thật.
    const ghost = me.cloneNode(true);
    ghost.classList.add('ar-q-walker');
    Object.assign(ghost.style, { left: b.left + global.scrollX + 'px', top: b.top + global.scrollY + 'px', margin: '0' });
    document.body.appendChild(ghost);
    me.style.visibility = 'hidden';
    const steps = Math.max(3, Math.min(9, Math.round(dist / 70)));
    const frames = [];
    for (let s = 0; s <= steps; s++) {
      const k = 1 - s / steps, h = 1 - (s + 0.5) / steps;
      frames.push({ transform: `translate(${dx * k}px, ${dy * k}px)`, offset: s / steps, easing: 'ease-out' });
      if (s < steps) frames.push({ transform: `translate(${dx * h}px, ${dy * h - 12}px)`, offset: (s + 0.5) / steps, easing: 'ease-in' });
    }
    to.classList.add('is-arriving');
    A.sfx('whoosh');
    const done = () => { ghost.remove(); me.style.visibility = ''; to.classList.remove('is-arriving'); };
    const anim = ghost.animate(frames, { duration: Math.max(650, Math.min(1700, dist * 2.2)) });
    anim.onfinish = () => { done(); A.sfx('click'); };
    anim.oncancel = done;
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
        <div class="ar-q-sheet-art" aria-hidden="true"><div class="ar-q-scene">${sceneSvg(f.r.scene, 'sheet')}</div><div class="ar-q-sheet-fig">${f.art}</div></div>
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
  let going = false;
  async function go() {
    const n = sheetNode;
    if (!n || going) return;
    const nick = A.setNick($('arNick').value || '');
    if (!nick) { closeSheet(); A.toast('Nhập biệt danh trước để lưu sao và xu của em nhé!'); $('arNick').focus(); return; }
    const key = mapKey(), lv = levelOf(key), r = Q.regionById(n.region);
    closeSheet();
    walkFrom = n.id;
    if (n.kind === 'mini') { if (global.EduArenaMini) global.EduArenaMini.openVs(n.game); return; }
    // Trong lúc tải: màn "lên đường" (tên vùng, lời người dẫn đường) thay cho dòng thông báo nhỏ + bản đồ mờ;
    // bản đồ không bấm được chặng khác (1 lượt vào trận duy nhất). Gỡ NGAY khi trận bắt đầu — không giữ thêm giây nào.
    going = true;
    const map = $('arQuestMap');
    if (map) { map.classList.add('is-loading'); map.setAttribute('aria-busy', 'true'); }
    const travel = travelOpen(n, r);
    try {
      await A.playQuest({
        cat: lv.cat, lvl: lv.lvl, mt: r.mt, mode: r.mode, n: Q.QUIZ_N,
        title: 'Hành trình · ' + (r.final ? 'Trùm cuối' : 'Vùng ' + r.no + ': ' + r.name),
        quest: { node: n.id, map: key },
      });
    } finally {
      going = false;
      travelClose(travel);
      if (map) { map.classList.remove('is-loading'); map.removeAttribute('aria-busy'); }
    }
  }
  function travelOpen(n, r) {
    const g = GUIDES[r.id], f = info(n);
    const el = document.createElement('div');
    el.className = 'ar-q-travel';
    el.setAttribute('role', 'status');
    el.style.setProperty('--rc', COLORS[r.id]);
    el.innerHTML = `<div class="ar-q-travel-card">
        <p class="ar-q-travel-kicker">Đang lên đường tới</p>
        <h3>${r.final ? 'Trùm cuối' : 'Vùng ' + r.no + ' · ' + esc(r.name)}</h3>
        <p class="ar-q-travel-node">${esc(f.title)} · ${esc(f.kind)}</p>
        ${g ? `<p class="ar-q-travel-say"><span aria-hidden="true">${guideFig(r.id)}</span><span><b>${esc(g.who)}:</b> ${esc(guideText(r, qp(), mapKey()))}</span></p>` : ''}
        <span class="ar-q-travel-steps" aria-hidden="true"><i></i><i></i><i></i></span>
      </div>`;
    document.body.appendChild(el);
    return el;
  }
  function travelClose(el) {
    if (!el) return;
    if (reduced() || !el.animate) { el.remove(); return; }
    el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160 }).onfinish = () => el.remove();
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
      map.addEventListener('click', (e) => { const b = e.target.closest('.ar-q-node'); if (b && !going) openSheet(b.dataset.node); });
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
    // Gõ biệt danh rồi bấm ngay 1 chặng: ô biệt danh mất focus bắn "change" giữa lúc nhấn chuột → trước đây vẽ lại cả bản đồ
    // (id SVG cảnh nền đổi mỗi lần vẽ) làm nút đang bấm bị thay → mất cú bấm, phải bấm lần 2. Nay chỉ vẽ khi biệt danh đổi thật.
    $('arNick').addEventListener('change', () => { if (nickNow() !== paintedNick) paint(); });
    // Cảnh lớp học vẽ sau thẻ vào phòng: bỏ 10/11/2026 (màn vào phòng gọn, không tranh trang trí).
    paint();
  }

  global.EduArenaQuest = { paint, onQuizEnd, onMiniEnd, resultHtml, animateResult };
  init();
})(window);
