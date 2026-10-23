/* ============================================================
   js/daily-challenge.js — "Thử thách hôm nay" ở sảnh index.html

   Mỗi ngày 5 câu chọn theo NGÀY + Chương trình/Cấp độ đang chọn ở sảnh
   (cùng hạt giống → cả lớp cùng đề trong ngày, so điểm với nhau được).
     • 20 giây/câu, điểm theo tốc độ (500–1000) + thưởng chuỗi đúng liền.
     • Hết lượt: ô đúng/sai + "Chép kết quả" kiểu Wordle để gửi nhóm lớp.
     • Chuỗi ngày thử thách + XP qua EduGamification (lần đầu trong ngày).
     • Làm lại trong ngày được nhưng không tính điểm/chuỗi.

   Chỉ đọc file tĩnh data/ic3 (dùng chung bộ tải của quiz-engine.js:
   _fetchTopicsForMix) và ghi localStorage 'eduquiz_daily'.
   0 lượt Firebase, 0 Apps Script.
   ============================================================ */
(function (global) {
  'use strict';

  const STORE_KEY = 'eduquiz_daily';
  const N_QUESTIONS = 5;
  const SEC_PER_Q = 20;
  const KEEP_DAYS = 40;              // số kết quả ngày giữ lại cho mỗi học sinh
  const EPOCH = new Date(2026, 8, 1); // thử thách #1 = 01/09/2026 (khai giảng)
  const ALPHA = 'ABCD';
  const canSpeak = 'speechSynthesis' in global;

  const $ = (id) => document.getElementById(id);
  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function plain(html) { const d = document.createElement('div'); d.innerHTML = String(html ?? ''); return (d.textContent || '').trim(); }
  function lsGet(k, fb) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch (e) { return fb; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  function sfx(name) { try { global.EduSFX?.play(name); } catch (e) { /* âm thanh chỉ là phụ */ } }

  // ── Ngày theo giờ máy (không dùng toISOString: ở VN trước 7h sáng sẽ ra ngày hôm qua) ──
  function dayKey(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function prevDayKey(key) {
    const [y, m, d] = key.split('-').map(Number);
    return dayKey(new Date(y, m - 1, d - 1));
  }
  function challengeNo(d = new Date()) {
    const mid = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    return Math.round((mid - EPOCH) / 864e5) + 1;
  }
  function dayLabel(d = new Date()) { return `${d.getDate()}/${d.getMonth() + 1}`; }

  // ── Ngẫu nhiên có hạt giống (cùng ngày + cùng bộ → cùng đề trên mọi máy) ──
  function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function seededShuffle(arr, rand) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  // ── Học sinh đang chọn ở sảnh ──
  function lobbyStudent() {
    const v = (id) => ($(id)?.value || '').trim();
    const name = v('studentName');
    const key = name ? [name, v('studentClass'), v('studentSchool')].map((x) => x.toLowerCase()).join('|') : 'khach';
    return { name: name || 'Khách', key };
  }
  function lobbySet() {
    const cat = $('categorySelect')?.value || '';
    const lvl = $('levelSelect')?.value || '';
    const lvlName = $('levelSelect')?.selectedOptions?.[0]?.textContent?.trim() || `${cat} ${lvl}`;
    return { cat, lvl, lvlName };
  }

  // ── Lưu trữ: { [studentKey]: { streak, last, best, results: { 'YYYY-MM-DD|CAT|LV': {...} } } } ──
  function studentData(key) {
    const all = lsGet(STORE_KEY, {});
    const s = all[key] && typeof all[key] === 'object' ? all[key] : {};
    return { streak: s.streak | 0, last: s.last || '', best: s.best | 0, results: s.results && typeof s.results === 'object' ? s.results : {} };
  }
  function saveStudent(key, data) {
    const all = lsGet(STORE_KEY, {});
    const ks = Object.keys(data.results).sort();
    ks.slice(0, Math.max(0, ks.length - KEEP_DAYS)).forEach((k) => delete data.results[k]);
    all[key] = data;
    lsSet(STORE_KEY, all);
  }
  /** Chuỗi còn hiệu lực hôm nay: làm hôm nay hoặc hôm qua thì còn, bỏ 1 ngày thì về 0. */
  function liveStreak(data, today = dayKey()) {
    return data.last === today || data.last === prevDayKey(today) ? data.streak : 0;
  }

  // ── Chọn câu ──
  function usable(q) {
    return q && q.type === 'single' && !q.image && !q.imageUrl && Array.isArray(q.options)
      && q.options.length >= 2 && q.options.length <= 4 && Array.isArray(q.correct) && q.correct.length === 1
      && q.options.includes(q.correct[0]);
  }
  async function buildQuestions(set, today) {
    if (typeof global._fetchTopicsForMix !== 'function') throw new Error('Thiếu bộ tải câu hỏi.');
    const topics = await global._fetchTopicsForMix(set.cat, set.lvl);
    const seen = new Set();
    const pool = [];
    Object.keys(topics).sort().forEach((name) => (topics[name] || []).forEach((q) => {
      const id = q.uid || `${name}#${q.id}`;
      if (!usable(q) || seen.has(id)) return;
      seen.add(id);
      pool.push(Object.assign({ _topic: name, _id: id }, q));
    }));
    pool.sort((a, b) => (a._id < b._id ? -1 : a._id > b._id ? 1 : 0));
    const rand = rng(hashStr(`${today}|${set.cat}|${set.lvl}`));
    return seededShuffle(pool, rand).slice(0, N_QUESTIONS)
      .map((q) => Object.assign({}, q, { options: seededShuffle(q.options, rand) }));
  }

  function pointsFor(ok, secLeft, combo) {
    if (!ok) return 0;
    return 500 + Math.round(500 * Math.max(0, secLeft) / SEC_PER_Q) + Math.min(300, 100 * Math.max(0, combo - 1));
  }
  function gridOf(marks) { return marks.map((m) => (m ? '🟩' : '🟥')).join(''); }
  function shareText(r) {
    return `EduQuiz · Thử thách số ${r.no} (${r.dayLabel})\n${r.lvlName}: ${r.correct}/${r.total} câu, ${r.score.toLocaleString('vi-VN')} điểm\n`
      + `${gridOf(r.marks)}${r.streak > 1 ? ` · chuỗi ${r.streak} ngày` : ''}`;
  }

  // ── Giao diện ──
  const G = { running: false, qs: [], i: 0, score: 0, combo: 0, maxCombo: 0, marks: [], timer: 0, left: 0, locked: false, t0: 0, counted: false, set: null, today: '', lastFocus: null };

  function ensureModal() {
    let ov = $('dcOverlay');
    if (ov) return ov;
    ov = document.createElement('div');
    ov.id = 'dcOverlay';
    ov.className = 'dc-overlay';
    ov.hidden = true;
    ov.innerHTML = `
      <div class="dc-modal" role="dialog" aria-modal="true" aria-labelledby="dcTitle">
        <div class="dc-head">
          <div class="dc-title" id="dcTitle"><i class="fa-solid fa-bolt" aria-hidden="true"></i> Thử thách hôm nay</div>
          <div class="dc-sub" id="dcSub"></div>
          <button type="button" class="dc-close" id="dcClose" aria-label="Đóng thử thách"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
        </div>
        <div class="dc-body" id="dcBody"></div>
      </div>`;
    document.body.appendChild(ov);
    $('dcClose').addEventListener('click', close);
    ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
    ov.addEventListener('keydown', onKey);
    return ov;
  }

  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    const opts = [...document.querySelectorAll('#dcBody .dc-opt')];
    if (opts.length && !G.locked) {
      const idx = 'abcd'.indexOf(e.key.toLowerCase()) >= 0 ? 'abcd'.indexOf(e.key.toLowerCase()) : '1234'.indexOf(e.key);
      if (idx >= 0 && opts[idx]) { e.preventDefault(); opts[idx].click(); }
    } else if (e.key === 'Enter' && $('dcNext') && document.activeElement?.tagName !== 'BUTTON') {
      e.preventDefault(); $('dcNext').click();
    }
  }

  function setBody(html, sub) {
    $('dcBody').innerHTML = html;
    if (sub != null) $('dcSub').textContent = sub;
  }

  async function open() {
    const ov = ensureModal();
    G.lastFocus = document.activeElement;
    ov.hidden = false;
    document.body.classList.add('dc-open');
    G.set = lobbySet();
    G.today = dayKey();
    const st = lobbyStudent();
    $('dcSub').textContent = `Số ${challengeNo()} ·${dayLabel()} · ${G.set.lvlName}`;
    if (!G.set.cat || !G.set.lvl) { setBody('<p class="dc-msg">Chọn Chương trình và Cấp độ ở sảnh trước.</p>'); return; }

    const prev = studentData(st.key).results[`${G.today}|${G.set.cat}|${G.set.lvl}`];
    if (prev) { renderDone(prev, true); $('dcClose').focus(); return; }
    renderIntro(st);
  }

  function renderIntro(st) {
    const data = studentData(st.key);
    const streak = liveStreak(data);
    setBody(`
      <div class="dc-intro">
                <p class="dc-intro-lead"><b>${N_QUESTIONS} câu</b> · mỗi câu <b>${SEC_PER_Q} giây</b></p>
        <ul class="dc-rules">
          <li>Trả lời đúng được 500 điểm, càng nhanh càng được thêm, tối đa 1.000.</li>
          <li>Đúng liền từ 2 câu trở lên được cộng thêm 100 điểm mỗi câu.</li>
          <li>Cả lớp làm <b>cùng một đề</b> trong ngày. Làm xong có thể chép kết quả gửi nhóm lớp.</li>
        </ul>
        <div class="dc-stats">
          <span><i class="fa-solid fa-fire" aria-hidden="true"></i> Chuỗi <b>${streak} ngày</b></span>
          <span><i class="fa-solid fa-trophy" aria-hidden="true"></i> Kỷ lục <b>${data.best.toLocaleString('vi-VN')}</b></span>
        </div>
        <p class="dc-who">${st.key === 'khach' ? '<i class="fa-solid fa-user" aria-hidden="true"></i> Chưa chọn tên ở sảnh nên kết quả sẽ lưu cho "Khách".' : `<i class="fa-solid fa-user" aria-hidden="true"></i> ${esc(st.name)}`}</p>
        <button type="button" class="dc-btn dc-btn-go" id="dcGo">Bắt đầu</button>
        <p class="dc-hint dc-keys">Phím tắt: A/B/C/D hoặc 1–4 để chọn, Enter để qua câu.</p>
      </div>`);
    $('dcGo').addEventListener('click', () => start(true));
    $('dcGo').focus();
  }

  async function start(counted) {
    setBody('<p class="dc-msg">Đang tải câu hỏi…</p>');
    let qs = [];
    try { qs = await buildQuestions(G.set, G.today); } catch (e) { console.warn('[Thử thách]', e); }
    if ($('dcOverlay').hidden) return;
    if (qs.length < N_QUESTIONS) {
      setBody('<p class="dc-msg">Không tải được câu hỏi. Kiểm tra mạng rồi thử lại. Muốn làm khi mất mạng thì bấm "Tải sẵn để dùng offline" ở sảnh lúc còn mạng.</p>');
      return;
    }
    Object.assign(G, { running: true, qs, i: 0, score: 0, combo: 0, maxCombo: 0, marks: [], locked: false, t0: Date.now(), counted });
    renderQ();
  }

  function renderQ() {
    const q = G.qs[G.i];
    G.locked = false;
    G.left = SEC_PER_Q;
    setBody(`
      <div class="dc-top">
        <span class="dc-step">Câu ${G.i + 1}/${G.qs.length}</span>
        <span class="dc-dots">${G.qs.map((_, k) => `<i class="${k < G.marks.length ? (G.marks[k] ? 'ok' : 'no') : k === G.i ? 'cur' : ''}"></i>`).join('')}</span>
        <span class="dc-score" id="dcScore">${G.score.toLocaleString('vi-VN')} điểm</span>
      </div>
      <div class="dc-timer" aria-hidden="true"><i id="dcTimerBar"></i></div>
      <div class="dc-qrow">
        <div class="dc-q" id="dcQ">${q.question}</div>
        ${canSpeak ? '<button type="button" class="dc-speak" id="dcSpeak" aria-label="Nghe câu hỏi" title="Nghe câu hỏi"><i class="fa-solid fa-volume-high" aria-hidden="true"></i></button>' : ''}
      </div>
      <div class="dc-opts">
        ${q.options.map((o, j) => `<button type="button" class="dc-opt dc-c${j}" data-j="${j}"><b>${ALPHA[j]}</b><span>${o}</span></button>`).join('')}
      </div>
      <div class="dc-feedback" id="dcFeedback" aria-live="polite"></div>`,
    null);
    document.querySelectorAll('#dcBody .dc-opt').forEach((b) => b.addEventListener('click', () => answer(+b.dataset.j)));
    $('dcSpeak')?.addEventListener('click', () => speak(`${plain(q.question)}. ${q.options.map((o, j) => `${ALPHA[j]}. ${plain(o)}`).join('. ')}`));
    document.querySelector('#dcBody .dc-opt')?.focus();
    const bar = $('dcTimerBar');
    bar.style.transition = 'none';
    bar.style.width = '100%';
    requestAnimationFrame(() => requestAnimationFrame(() => {
      bar.style.transition = `width ${SEC_PER_Q}s linear`;
      bar.style.width = '0%';
    }));
    const startedAt = Date.now();
    clearInterval(G.timer);
    G.timer = setInterval(() => {
      G.left = SEC_PER_Q - (Date.now() - startedAt) / 1000;
      if (G.left <= 0) answer(-1);
    }, 200);
  }

  function answer(j) {
    if (G.locked) return;
    G.locked = true;
    clearInterval(G.timer);
    if (canSpeak) global.speechSynthesis.cancel();
    const q = G.qs[G.i];
    const okIdx = q.options.indexOf(q.correct[0]);
    const ok = j === okIdx;
    G.combo = ok ? G.combo + 1 : 0;
    G.maxCombo = Math.max(G.maxCombo, G.combo);
    const pts = pointsFor(ok, G.left, G.combo);
    G.score += pts;
    G.marks.push(ok);

    const bar = $('dcTimerBar');
    if (bar) { bar.style.transition = 'none'; bar.style.width = getComputedStyle(bar).width; }
    document.querySelectorAll('#dcBody .dc-opt').forEach((b, k) => {
      b.disabled = true;
      if (k === okIdx) b.classList.add('is-right');
      else if (k === j) b.classList.add('is-wrong');
      else b.classList.add('is-dim');
    });
    $('dcScore').textContent = `${G.score.toLocaleString('vi-VN')} điểm`;
    sfx(ok ? (G.combo >= 3 ? 'combo' : 'correct') : 'wrong');

    const last = G.i === G.qs.length - 1;
    const head = ok
      ? `<b class="dc-fb-ok"><i class="fa-solid fa-check" aria-hidden="true"></i> Đúng, +${pts.toLocaleString('vi-VN')} điểm</b>${G.combo >= 2 ? ` <span class="dc-combo"><i class="fa-solid fa-fire" aria-hidden="true"></i> ${G.combo} câu liền</span>` : ''}`
      : `<b class="dc-fb-no">${j < 0 ? '<i class="fa-solid fa-clock" aria-hidden="true"></i> Hết giờ' : '<i class="fa-solid fa-xmark" aria-hidden="true"></i> Sai'}</b> Đáp án đúng: <b>${ALPHA[okIdx]}. ${q.correct[0]}</b>`;
    $('dcFeedback').innerHTML = `<div class="dc-fb-head">${head}</div>`
      + (q.explanation ? `<p class="dc-explain">${esc(plain(q.explanation))}</p>` : '')
      + `<button type="button" class="dc-btn" id="dcNext">${last ? 'Xem kết quả' : 'Câu tiếp'}</button>`;
    $('dcNext').addEventListener('click', () => { if (last) finish(); else { G.i++; renderQ(); } });
    $('dcNext').focus();
  }

  function finish(silent) {
    G.running = false;
    clearInterval(G.timer);
    while (G.marks.length < G.qs.length) G.marks.push(false); // thoát giữa chừng: câu chưa làm tính sai
    const st = lobbyStudent();
    const data = studentData(st.key);
    const correct = G.marks.filter(Boolean).length;
    const r = {
      no: challengeNo(), dayLabel: dayLabel(), lvlName: G.set.lvlName,
      correct, total: G.qs.length, score: G.score, marks: G.marks.slice(), maxCombo: G.maxCombo,
      sec: Math.round((Date.now() - G.t0) / 1000), streak: liveStreak(data),
    };
    let newBest = false;
    let xp = null;
    if (G.counted) {
      if (data.last !== G.today) {
        data.streak = data.last === prevDayKey(G.today) ? data.streak + 1 : 1;
        data.last = G.today;
      }
      r.streak = data.streak;
      newBest = data.best > 0 && r.score > data.best; // lần đầu chưa có kỷ lục để "phá"
      data.best = Math.max(data.best, r.score);
      data.results[`${G.today}|${G.set.cat}|${G.set.lvl}`] = r;
      saveStudent(st.key, data);
      if (global.EduGamification?.recordGameSession) {
        try {
          xp = global.EduGamification.recordGameSession('daily-challenge', {
            xp: 20 + correct * 10 + (correct === r.total ? 30 : 0),
            score: Math.round((correct / r.total) * 100), scoreType: 'percent', showReward: false,
          });
        } catch (e) { /* XP chỉ là phụ */ }
      }
    }
    if (silent) return;
    renderDone(r, false, { newBest, xp, counted: G.counted });
    if (correct === r.total || newBest) {
      sfx('win');
      if (typeof global.launchConfetti === 'function') global.launchConfetti();
    }
  }

  function renderDone(r, already, extra = {}) {
    const wrong = r.total - r.correct;
    const msg = wrong === 0 ? 'Đúng cả 5 câu.'
      : `Sai ${wrong} câu. Bấm "Làm lại" để xem lại lời giải.`;
    const xpLine = extra.xp ? `<span class="dc-xp">+${extra.xp.xpGained} XP</span>` : '';
    setBody(`
      <div class="dc-done">
        ${already ? '<p class="dc-already">Em đã làm thử thách hôm nay. Đây là kết quả lần đầu.</p>' : ''}
        <div class="dc-big">${r.score.toLocaleString('vi-VN')}<small>điểm</small></div>
        <div class="dc-grid" role="img" aria-label="${r.correct} trên ${r.total} câu đúng">${r.marks.map((m) => `<i class="${m ? 'ok' : 'no'}"></i>`).join('')}</div>
        <p class="dc-done-msg">${msg}</p>
        <div class="dc-stats">
          <span><i class="fa-solid fa-circle-check" aria-hidden="true"></i> <b>${r.correct}/${r.total}</b> câu</span>
          <span><i class="fa-solid fa-stopwatch" aria-hidden="true"></i> <b>${r.sec}</b> giây</span>
          <span><i class="fa-solid fa-fire" aria-hidden="true"></i> Chuỗi <b>${r.streak}</b> ngày</span>
          ${extra.newBest ? '<span class="dc-best"><i class="fa-solid fa-trophy" aria-hidden="true"></i> Kỷ lục mới</span>' : ''}
          ${xpLine}
        </div>
        ${extra.counted === false ? '<p class="dc-hint">Lượt làm lại không tính điểm, chuỗi và XP.</p>' : ''}
        <pre class="dc-share" id="dcShare">${esc(shareText(r))}</pre>
        <div class="dc-actions">
          <button type="button" class="dc-btn dc-btn-go" id="dcCopy"><i class="fa-solid fa-copy" aria-hidden="true"></i> Chép kết quả</button>
          <button type="button" class="dc-btn dc-btn-ghost" id="dcAgain"><i class="fa-solid fa-rotate-right" aria-hidden="true"></i> Làm lại</button>
        </div>
        <p class="dc-hint" id="dcCopyMsg" aria-live="polite">Đề mới mở lúc 0 giờ mỗi ngày.</p>
      </div>`);
    $('dcCopy').addEventListener('click', () => copy(shareText(r)));
    $('dcAgain').addEventListener('click', () => start(false));
    $('dcCopy').focus();
  }

  async function copy(text) {
    let ok = false;
    try { await navigator.clipboard.writeText(text); ok = true; } catch (e) {
      const range = document.createRange();
      range.selectNodeContents($('dcShare'));
      const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range);
      try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
    }
    $('dcCopyMsg').textContent = ok ? 'Đã chép. Dán vào nhóm lớp trên Zalo hoặc Messenger.' : 'Trình duyệt không cho chép tự động. Bôi đen khung kết quả rồi bấm Ctrl+C.';
  }

  function speak(text) {
    if (!canSpeak) return;
    global.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'vi-VN';
    u.rate = 0.95;
    const vi = global.speechSynthesis.getVoices().find((v) => /^vi/i.test(v.lang));
    if (vi) u.voice = vi;
    global.speechSynthesis.speak(u);
  }

  function close() {
    const ov = $('dcOverlay');
    if (!ov || ov.hidden) return;
    // Lượt tính điểm đang dở: thoát = nộp luôn (không cho xem trước đề rồi làm lại từ đầu)
    if (G.running && G.counted) {
      if (!global.confirm('Thoát bây giờ thì các câu chưa làm sẽ tính là sai. Em vẫn muốn thoát?')) return;
      finish(true);
    }
    G.running = false;
    clearInterval(G.timer);
    if (canSpeak) global.speechSynthesis.cancel();
    ov.hidden = true;
    document.body.classList.remove('dc-open');
    updateButton();
    global.dispatchEvent(new CustomEvent('edu:daily-updated'));
    G.lastFocus?.focus?.();
  }

  // ── Nút ở sảnh: hàng đầu của .lobby-extras, hiện chuỗi + trạng thái hôm nay ──
  function updateButton() {
    const btn = $('dailyChallengeBtn');
    if (!btn) return;
    const st = lobbyStudent();
    const set = lobbySet();
    const data = studentData(st.key);
    const done = data.results[`${dayKey()}|${set.cat}|${set.lvl}`];
    const streak = liveStreak(data);
    btn.classList.toggle('is-done', !!done);
    btn.querySelector('.dc-open-sub').textContent = done
      ? `Hôm nay: ${done.correct}/${done.total} câu, ${done.score.toLocaleString('vi-VN')} điểm`
      : `Số ${challengeNo()} · 5 câu, cả lớp cùng đề`;
    const fire = btn.querySelector('.dc-open-streak');
    fire.hidden = streak < 1;
    fire.innerHTML = `<i class="fa-solid fa-fire" aria-hidden="true"></i> ${streak}`;
    fire.title = `Chuỗi ${streak} ngày liên tiếp làm thử thách`;
  }

  function mount() {
    const box = document.querySelector('.lobby-card .lobby-extras');
    if (!box || $('dailyChallengeBtn')) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'dailyChallengeBtn';
    btn.className = 'btn-secondary dc-open-btn';
    btn.innerHTML = '<span class="dc-open-bolt" aria-hidden="true"><i class="fa-solid fa-bolt"></i></span>'
      + '<span class="dc-open-text"><b>Thử thách hôm nay</b><small class="dc-open-sub"></small></span>'
      + '<span class="dc-open-streak" hidden></span>';
    btn.addEventListener('click', open);
    box.prepend(btn);
    ['studentName', 'studentClass', 'studentSchool', 'categorySelect', 'levelSelect']
      // setTimeout: đổi Chương trình thì sảnh đổ lại danh sách Cấp độ ngay sau sự kiện này
      .forEach((id) => $(id)?.addEventListener('change', () => setTimeout(updateButton)));
    updateButton();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();

  global.EduDailyChallenge = { open, _pointsFor: pointsFor, _shareText: shareText, _liveStreak: liveStreak };
})(window);
