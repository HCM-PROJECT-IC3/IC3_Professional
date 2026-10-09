/* ============================================================
   js/learning-hub.js — "Góc học tập" của học sinh (index.html)

   Học tập cá nhân hoá, chạy HOÀN TOÀN trên máy (localStorage) —
   0 lượt đọc/ghi Firebase:
     • Tổng quan: số bài, điểm TB gần đây, chuỗi ngày học, biểu đồ xu
       hướng điểm, GỢI Ý HÔM NAY (ôn câu đến hạn, ôn bài yếu nhất...).
     • Theo bài: mức nắm vững từng bài/chủ đề đã làm (TB 3 lần gần nhất,
       xu hướng ↑↓), yếu nhất lên đầu, nút "Ôn ngay" chọn sẵn bài ở sảnh.
     • Sổ tay câu sai: tự gom mọi câu làm sai qua các bài, ôn theo
       phương pháp LẶP LẠI NGẮT QUÃNG (hộp Leitner 1→4: ôn ngay → 1 ngày
       → 3 ngày → 7 ngày → thuộc). Sai lại thì về hộp 1.

   Nguồn dữ liệu:
     - 'eduquiz_records' (lịch sử bài nộp, js/quiz-engine.js § saveRecord)
     - sự kiện 'edu:exam-graded' (quiz-engine.js § submitExam) — có câu
       hỏi đầy đủ để lưu vào sổ tay và ôn lại được.
   Mỗi học sinh tách riêng theo Họ tên + Lớp + Trường (máy trường dùng chung).
   ============================================================ */
(function (global) {
  'use strict';

  const BOOK_KEY = 'eduquiz_wrongbook_v1';
  const DAY = 24 * 60 * 60 * 1000;
  // Hộp Leitner → khoảng cách tới lần ôn kế tiếp.
  const BOX_GAP = { 1: 0, 2: DAY, 3: 3 * DAY, 4: 7 * DAY };
  const MAX_ITEMS = 200;
  const REVIEW_BATCH = 20;
  const PASS = 70;

  const $ = (id) => document.getElementById(id);
  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function plain(html) { const d = document.createElement('div'); d.innerHTML = String(html ?? ''); return (d.textContent || '').trim(); }
  function lsGet(k, fb) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch (e) { return fb; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  function notify(msg, type) { if (typeof global.showNotification === 'function') global.showNotification(msg, type || 'info'); }

  // ── Học sinh ──
  function keyOf(name, cls, school) {
    return [name, cls, school].map((x) => String(x || '').trim().toLowerCase()).join('|');
  }
  function lobbyStudent() {
    const v = (id) => ($(id)?.value || '').trim();
    const name = v('studentName');
    return name ? { name, cls: v('studentClass'), school: v('studentSchool'), key: keyOf(name, v('studentClass'), v('studentSchool')) } : null;
  }
  function readRecords() { const r = lsGet('eduquiz_records', []); return Array.isArray(r) ? r : []; }
  function recTime(r) { const id = Number(r.id) || 0; return id > 1e14 ? Math.floor(id / 1000) : id; }
  /** Mọi học sinh từng làm bài / có sổ tay trên máy này (mới nhất trước). */
  function knownStudents() {
    const map = new Map();
    readRecords().forEach((r) => {
      if (!r.studentName) return;
      const k = keyOf(r.studentName, r.studentClass, r.studentSchool);
      if (!map.has(k)) map.set(k, { key: k, name: r.studentName, cls: r.studentClass || '', school: r.studentSchool || '', last: recTime(r) });
    });
    const book = lsGet(BOOK_KEY, {});
    Object.entries(book).forEach(([k, v]) => {
      if (!map.has(k) && v && v.name) map.set(k, { key: k, name: v.name, cls: v.cls || '', school: v.school || '', last: v.updated || 0 });
    });
    return [...map.values()].sort((a, b) => b.last - a.last);
  }

  // ============================================================
  // SỔ TAY CÂU SAI (Leitner)
  // ============================================================
  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(36);
  }
  function qKey(q) {
    if (q.uid && !String(q.uid).startsWith('custom__')) return 'u:' + q.uid;
    return 'c:' + hash([q.question, (q.options || []).join('|'), (q.items || []).join('|'), JSON.stringify(q.pairs || '')].join('#'));
  }
  /** Bản gọn của câu để lưu: bỏ trường tạm "_..." (prepareQuestions dựng lại khi ôn). */
  function slim(q) {
    const o = {};
    Object.keys(q).forEach((k) => { if (k[0] !== '_') o[k] = q[k]; });
    return o;
  }
  function loadStudentBook(book, st) {
    if (!book[st.key]) book[st.key] = { name: st.name, cls: st.cls, school: st.school, items: {}, mastered: 0, updated: 0 };
    return book[st.key];
  }
  function promote(it, now) {
    if (it.box >= 4) return 'mastered';
    it.box += 1;
    it.due = now + BOX_GAP[it.box];
    it.right = (it.right || 0) + 1;
    return 'up';
  }
  function demote(it, now) { it.box = 1; it.due = now; it.wrong = (it.wrong || 0) + 1; }

  function onGraded(e) {
    const { questions, details, session } = e.detail || {};
    if (!questions || !details || !session || !session.studentName) return;
    const st = { name: session.studentName, cls: session.studentClass || '', school: session.studentSchool || '' };
    st.key = keyOf(st.name, st.cls, st.school);
    const book = lsGet(BOOK_KEY, {});
    const sb = loadStudentBook(book, st);
    const now = Date.now();
    let added = 0, up = 0, mastered = 0, again = 0;
    const src = [session.level, session.minitest].filter(Boolean).join(' › ');
    questions.forEach((q, i) => {
      const d = details[i];
      if (!d || !q || q.type === 'hotspot' && String(q.imageUrl || '').startsWith('data:')) return;
      const k = qKey(q);
      const it = sb.items[k];
      if (d.status === 'correct' && it) {
        if (promote(it, now) === 'mastered') { delete sb.items[k]; sb.mastered = (sb.mastered || 0) + 1; mastered++; } else up++;
      } else if (d.status === 'incorrect') {
        if (it) { demote(it, now); again++; }
        else if (!session.isWrongbook) {
          // Ảnh nhúng quá lớn (đề tự soạn) — vẫn lưu được nhưng giới hạn để không đầy bộ nhớ.
          if (String(q.imageUrl || '').length > 60000) return;
          sb.items[k] = { q: slim(q), box: 1, due: now, wrong: 1, right: 0, added: now, src };
          added++;
        }
      }
    });
    // Giới hạn kích thước: bỏ câu đã lên hộp cao nhất / cũ nhất trước.
    const keys = Object.keys(sb.items);
    if (keys.length > MAX_ITEMS) {
      keys.sort((a, b) => (sb.items[b].box - sb.items[a].box) || (sb.items[a].added - sb.items[b].added))
        .slice(0, keys.length - MAX_ITEMS).forEach((k) => delete sb.items[k]);
    }
    sb.updated = now;
    if (!lsSet(BOOK_KEY, book)) return;
    if (session.isWrongbook) {
      setTimeout(() => notify(`Sổ tay: ${up + mastered} câu nhớ thêm${mastered ? ` (${mastered} câu đã thuộc hẳn)` : ''}, ${again} câu cần ôn lại.`, 'success'), 900);
    } else if (added) {
      setTimeout(() => notify(`Đã ghi ${added} câu sai vào Sổ tay — mở "Góc học tập" để ôn lại cho nhớ lâu.`, 'info'), 1600);
    }
    if (!session.isRetry) {
      const goal = goalOf(st.key);
      // Lịch sử ('eduquiz_records') đã có bài vừa nộp (saveRecord chạy trước sự kiện này).
      if (goal && weekDone(studentRecords(st.key)) === goal) {
        setTimeout(() => notify(`🎉 Chúc mừng! Em đã hoàn thành mục tiêu ${goal} bài tuần này.`, 'success'), 2400);
      }
    }
    updateBadge();
  }

  function studentBook(key) { return lsGet(BOOK_KEY, {})[key] || { items: {}, mastered: 0 }; }
  function dueItems(sb, now = Date.now()) {
    return Object.entries(sb.items || {}).filter(([, it]) => it.due <= now)
      .sort(([, a], [, b]) => (a.box - b.box) || (a.due - b.due));
  }

  // ============================================================
  // THỐNG KÊ
  // ============================================================
  function studentRecords(key) {
    return readRecords().filter((r) => keyOf(r.studentName, r.studentClass, r.studentSchool) === key)
      .sort((a, b) => recTime(a) - recTime(b));
  }
  function dayKey(ts) { const d = new Date(ts); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; }
  function streakOf(recs) {
    const days = new Set(recs.map((r) => dayKey(recTime(r))));
    let n = 0;
    const d = new Date();
    if (!days.has(dayKey(d.getTime()))) d.setDate(d.getDate() - 1); // hôm nay chưa học vẫn giữ chuỗi tới hôm qua
    while (days.has(dayKey(d.getTime()))) { n++; d.setDate(d.getDate() - 1); }
    return { streak: n, days: days.size };
  }
  /** Tra id Chương trình/Cấp độ cho bản ghi cũ (chỉ lưu tên hiển thị). */
  function resolveIds(r) {
    if (r.catId && r.levelId) return { catId: r.catId, levelId: r.levelId, mtKey: r.mtKey || '' };
    const cats = global.quizRepository?.categories || [];
    const cat = cats.find((c) => c.name === r.category);
    const lv = cat?.levels?.find((l) => l.name === r.level);
    const mtKey = lv && lv.minitests && Object.prototype.hasOwnProperty.call(lv.minitests, r.minitest) ? r.minitest : '';
    return { catId: cat?.id || '', levelId: lv?.id || '', mtKey };
  }
  function topicStats(recs) {
    const groups = new Map();
    recs.forEach((r) => {
      const ids = resolveIds(r);
      const isMix = r.isRandomMix || /^Tổng hợp/.test(r.minitest || '');
      const label = isMix ? 'Tổng hợp (ngẫu nhiên)' : (r.minitest || 'Bài làm');
      const k = `${r.level}|${label}`;
      if (!groups.has(k)) groups.set(k, { label, level: r.level || r.category || '', scores: [], ids: isMix ? null : ids });
      groups.get(k).scores.push(Number(r.score) || 0);
    });
    return [...groups.values()].map((g) => {
      const recent = g.scores.slice(-3);
      const avg = Math.round(recent.reduce((s, x) => s + x, 0) / recent.length);
      const last = g.scores[g.scores.length - 1];
      const prev = g.scores.length > 1 ? g.scores[g.scores.length - 2] : null;
      return Object.assign(g, { avg, last, best: Math.max(...g.scores), trend: prev === null ? 0 : Math.sign(last - prev), attempts: g.scores.length });
    }).sort((a, b) => a.avg - b.avg);
  }

  // ============================================================
  // THẺ GHI NHỚ (lật thẻ) — ôn nhanh Sổ tay không cần làm lại cả câu:
  // mặt trước = câu hỏi, mặt sau = đáp án + giải thích; học sinh tự đánh
  // giá "Đã nhớ" (lên hộp sau) / "Chưa nhớ" (về hộp 1).
  // ============================================================
  function answerHtml(q) {
    const P = (s) => esc(plain(s));
    switch (q.type) {
      case 'single':
      case 'multi': {
        const ok = new Set((q.correct || []).map(plain));
        return `<ol class="lh-fc-opts">${(q.options || []).map((o) => `<li class="${ok.has(plain(o)) ? 'is-ok' : ''}">${ok.has(plain(o)) ? '<i class="fa-solid fa-check"></i> ' : ''}${P(o)}</li>`).join('')}</ol>`;
      }
      case 'truefalse':
        return `<ul class="lh-fc-list">${(q.statements || []).map((s) => `<li><b class="${s.answer === 'true' ? 'is-t' : 'is-f'}">${s.answer === 'true' ? (q.label_true || 'Đúng') : (q.label_false || 'Sai')}</b> ${P(s.text)}</li>`).join('')}</ul>`;
      case 'list':
        return `<ul class="lh-fc-list">${(q.items || []).map((it) => `<li>${P(it.text)} → <b>${P(it.correct)}</b></li>`).join('')}</ul>`;
      case 'matching':
        return `<ul class="lh-fc-list">${(q.pairs || []).map((p) => `<li>${P(p.left)} → <b>${P(p.right)}</b></li>`).join('')}</ul>`;
      case 'ordering':
        return `<ol class="lh-fc-list">${(q.items || []).map((s) => `<li>${P(s)}</li>`).join('')}</ol>`;
      case 'classify':
        return `<ul class="lh-fc-list">${(q.items || []).map((it) => `<li>${P(it.text)} → <b>${P(it.zone)}</b></li>`).join('')}</ul>`;
      case 'dragfill':
      case 'selectfill':
        return `<ol class="lh-fc-list">${(q.blanks || []).map((b) => `<li><b>${P(b)}</b></li>`).join('')}</ol>`;
      default:
        return '<p class="lh-note">Câu chọn vùng trên ảnh — bấm "Ôn câu đến hạn" để làm lại trực tiếp.</p>';
    }
  }
  function frontHtml(q) {
    if ((q.type === 'single' || q.type === 'multi') && (q.options || []).length) {
      return `<ol class="lh-fc-opts is-front">${q.options.map((o) => `<li>${esc(plain(o))}</li>`).join('')}</ol>`
        + (q.type === 'multi' ? '<p class="lh-note">(Có nhiều đáp án đúng)</p>' : '');
    }
    return '<p class="lh-note">Nhớ lại đáp án trong đầu rồi lật thẻ để kiểm tra.</p>';
  }
  function flashHtml(sb) {
    const F = H.flash;
    if (F.i >= F.keys.length) {
      return `<div class="lh-empty"><i class="fa-solid fa-flag-checkered"></i>
        <p>Xong ${F.keys.length} thẻ: <b>${F.ok}</b> đã nhớ, <b>${F.again}</b> cần ôn lại.${F.mastered ? ` ${F.mastered} câu đã thuộc hẳn — rời khỏi sổ!` : ''}</p>
        <button type="button" class="lh-btn" data-act="flash-exit">Về Sổ tay</button></div>`;
    }
    const it = (sb.items || {})[F.keys[F.i]];
    if (!it) { F.i++; return flashHtml(sb); }
    const q = it.q;
    const img = q.imageUrl || (q.image_file ? `img/${q.image_file}` : '');
    return `<div class="lh-fc-top"><span>Thẻ ${F.i + 1}/${F.keys.length}</span>
        <div class="lh-bar"><i style="width:${(F.i / F.keys.length) * 100}%"></i></div>
        <button type="button" class="lh-btn lh-btn-ghost lh-btn-sm" data-act="flash-exit">Thoát</button></div>
      <div class="lh-fc ${F.flipped ? 'is-flipped' : ''}" data-act="${F.flipped ? '' : 'flip'}" tabindex="0" role="button" aria-label="${F.flipped ? 'Mặt sau thẻ' : 'Lật thẻ'}">
        <div class="lh-fc-q">${esc(plain(q.question))}</div>
        ${img && /^(img\/|https:|data:image\/)/.test(img) ? `<img class="lh-fc-img" src="${esc(img)}" alt="">` : ''}
        ${F.flipped
          ? `<div class="lh-fc-label"><i class="fa-solid fa-key"></i> Đáp án</div>${answerHtml(q)}${q.explanation ? `<div class="lh-fc-expl"><i class="fa-regular fa-lightbulb"></i> ${esc(plain(q.explanation))}</div>` : ''}`
          : `${frontHtml(q)}<div class="lh-fc-hint"><i class="fa-solid fa-hand-pointer"></i> Bấm vào thẻ (hoặc phím Space) để lật</div>`}
      </div>
      ${F.flipped ? `<div class="lh-fc-actions">
        <button type="button" class="lh-btn lh-btn-again" data-act="flash-again"><i class="fa-solid fa-rotate-left"></i> Chưa nhớ <kbd>1</kbd></button>
        <button type="button" class="lh-btn lh-btn-ok" data-act="flash-ok"><i class="fa-solid fa-check"></i> Đã nhớ <kbd>2</kbd></button></div>` : ''}`;
  }
  function flashGrade(ok) {
    const F = H.flash;
    const book = lsGet(BOOK_KEY, {});
    const sb = book[H.key];
    const k = F.keys[F.i];
    const it = sb && sb.items[k];
    if (it) {
      const now = Date.now();
      if (ok) {
        if (promote(it, now) === 'mastered') { delete sb.items[k]; sb.mastered = (sb.mastered || 0) + 1; F.mastered++; }
        F.ok++;
      } else { demote(it, now); F.again++; }
      sb.updated = now;
      lsSet(BOOK_KEY, book);
    }
    F.i++; F.flipped = false;
    render(); updateBadge();
  }

  // ============================================================
  // GIAO DIỆN
  // ============================================================
  const H = { key: '', tab: 'overview', flash: null };

  function ensureModal() {
    if ($('learningHub')) return;
    const wrap = document.createElement('div');
    wrap.id = 'learningHub';
    wrap.className = 'modal-overlay lh-overlay';
    wrap.style.display = 'none';
    wrap.innerHTML = `<div class="modal-box lh-box" role="dialog" aria-modal="true" aria-labelledby="lhTitle">
      <div class="lh-head">
        <h3 id="lhTitle"><i class="fa-solid fa-seedling"></i> Góc học tập</h3>
        <select id="lhStudent" class="lh-student" aria-label="Chọn học sinh"></select>
        <button type="button" class="modal-close" id="lhClose" aria-label="Đóng Góc học tập"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
      </div>
      <div class="lh-tabs" role="tablist">
        <button type="button" role="tab" data-tab="overview"><i class="fa-solid fa-chart-line"></i> Tổng quan</button>
        <button type="button" role="tab" data-tab="topics"><i class="fa-solid fa-layer-group"></i> Theo bài</button>
        <button type="button" role="tab" data-tab="book"><i class="fa-solid fa-book-bookmark"></i> Sổ tay câu sai <span class="lh-tab-badge" id="lhTabBadge"></span></button>
      </div>
      <div class="lh-body" id="lhBody"></div>
      <p class="lh-foot"><i class="fa-solid fa-lock"></i> Dữ liệu chỉ lưu trên máy này (không gửi đi đâu). Mỗi học sinh có sổ riêng theo Họ tên + Lớp + Trường.</p>
    </div>`;
    document.body.appendChild(wrap);
    wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });
    $('lhClose').addEventListener('click', close);
    $('lhStudent').addEventListener('change', (e) => { H.key = e.target.value; H.flash = null; render(); });
    wrap.querySelector('.lh-tabs').addEventListener('click', (e) => {
      const b = e.target.closest('[data-tab]');
      if (b) { H.tab = b.dataset.tab; H.flash = null; render(); }
    });
    $('lhBody').addEventListener('click', onBodyClick);
    document.addEventListener('keydown', (e) => {
      if (wrap.style.display === 'none') return;
      if (e.key === 'Escape') { if (H.flash) { H.flash = null; render(); } else close(); return; }
      if (!H.flash || /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
      if (e.key === ' ' && !H.flash.flipped && H.flash.i < H.flash.keys.length) { e.preventDefault(); H.flash.flipped = true; render(); }
      else if (H.flash.flipped && (e.key === '1' || e.key === '2')) flashGrade(e.key === '2');
    });
  }

  let lastFocus = null;
  function open(tab) {
    ensureModal();
    lastFocus = document.activeElement;
    const students = knownStudents();
    const cur = lobbyStudent();
    if (cur && !students.some((s) => s.key === cur.key)) students.unshift(Object.assign({ last: Date.now() }, cur));
    H.key = cur ? cur.key : (students[0]?.key || '');
    H.tab = tab || 'overview';
    H.flash = null;
    $('lhStudent').innerHTML = students.length
      ? students.map((s) => `<option value="${esc(s.key)}">${esc(s.name)}${s.cls ? ' · ' + esc(s.cls) : ''}</option>`).join('')
      : '<option value="">Chưa có học sinh nào trên máy này</option>';
    $('lhStudent').value = H.key;
    $('learningHub').style.display = 'flex';
    render();
    document.querySelector('#learningHub .lh-tabs .is-active')?.focus();
  }
  function close() {
    const m = $('learningHub');
    if (!m || m.style.display === 'none') return;
    m.style.display = 'none';
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
  }

  function render() {
    document.querySelectorAll('#learningHub .lh-tabs [data-tab]').forEach((b) => {
      b.classList.toggle('is-active', b.dataset.tab === H.tab);
      b.setAttribute('aria-selected', b.dataset.tab === H.tab);
    });
    const sb = studentBook(H.key);
    const due = dueItems(sb).length;
    $('lhTabBadge').textContent = due || '';
    const body = $('lhBody');
    if (!H.key) {
      body.innerHTML = `<div class="lh-empty"><i class="fa-solid fa-user-graduate"></i><p>Chọn <b>Trường → Lớp → Họ và tên</b> ở trang chọn bài rồi làm 1 bài đầu tiên — Góc học tập sẽ tự theo dõi tiến bộ của em.</p></div>`;
      return;
    }
    const recs = studentRecords(H.key);
    if (H.tab === 'overview') body.innerHTML = overviewHtml(recs, sb);
    else if (H.tab === 'topics') body.innerHTML = topicsHtml(recs);
    else body.innerHTML = H.flash ? flashHtml(sb) : bookHtml(sb);
  }

  // ── Mục tiêu tuần (tự đặt — tạo động lực đều đặn, lưu trên máy) ──
  const GOAL_KEY = 'eduquiz_goals_v1';
  const GOAL_CHOICES = [3, 5, 7, 10];
  function weekStart(ts = Date.now()) {
    const d = new Date(ts); d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Thứ 2
    return d.getTime();
  }
  function goalOf(key) { return (lsGet(GOAL_KEY, {})[key] || {}).perWeek || 0; }
  function setGoal(key, n) { const g = lsGet(GOAL_KEY, {}); g[key] = { perWeek: n }; lsSet(GOAL_KEY, g); }
  function weekDone(recs) { const ws = weekStart(); return recs.filter((r) => recTime(r) >= ws).length; }
  function goalHtml(recs) {
    const goal = goalOf(H.key);
    const done = weekDone(recs);
    const pick = GOAL_CHOICES.map((n) => `<button type="button" class="lh-goal-pick${n === goal ? ' is-active' : ''}" data-act="goal" data-n="${n}">${n} bài</button>`).join('');
    if (!goal) {
      return `<div class="lh-card lh-goal"><div class="lh-card-title"><i class="fa-solid fa-flag"></i> Mục tiêu tuần này</div>
        <p class="lh-note">Đặt mục tiêu nhỏ, đều đặn mỗi tuần — em muốn làm bao nhiêu bài?</p><div class="lh-goal-picks">${pick}</div></div>`;
    }
    const pct = Math.min(100, Math.round((done / goal) * 100));
    const daysLeft = 7 - ((new Date().getDay() + 6) % 7) - 1;
    const msg = done >= goal ? '🎉 Hoàn thành mục tiêu tuần! Giữ phong độ nhé.'
      : `Còn ${goal - done} bài${daysLeft > 0 ? ` trong ${daysLeft + 1} ngày` : ' — hôm nay là ngày cuối tuần'}.`;
    return `<div class="lh-card lh-goal ${done >= goal ? 'is-done' : ''}"><div class="lh-card-title"><i class="fa-solid fa-flag"></i> Mục tiêu tuần này
        <span class="lh-goal-count">${done}/${goal} bài</span></div>
      <div class="lh-goal-bar"><i style="width:${pct}%"></i></div>
      <p class="lh-note">${msg}</p>
      <details class="lh-goal-edit"><summary>Đổi mục tiêu</summary><div class="lh-goal-picks">${pick}</div></details></div>`;
  }

  function sparkline(scores) {
    const pts = scores.slice(-20);
    if (pts.length < 2) return '<div class="lh-spark-empty">Làm thêm bài để thấy đường tiến bộ.</div>';
    const W = 560, Hh = 120, pad = 10;
    const x = (i) => pad + (i * (W - 2 * pad)) / (pts.length - 1);
    const y = (v) => pad + ((100 - v) * (Hh - 2 * pad)) / 100;
    const line = pts.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    const area = `${line} L${x(pts.length - 1).toFixed(1)},${Hh - pad} L${x(0).toFixed(1)},${Hh - pad} Z`;
    return `<svg class="lh-spark" viewBox="0 0 ${W} ${Hh}" role="img" aria-label="Điểm ${pts.length} bài gần nhất: ${pts.join(', ')}%">
      <line x1="${pad}" x2="${W - pad}" y1="${y(PASS)}" y2="${y(PASS)}" class="lh-spark-pass"/>
      <text x="${pad + 2}" y="${y(PASS) + 13}" class="lh-spark-label">Mức đạt ${PASS}%</text>
      <path d="${area}" class="lh-spark-area"/><path d="${line}" class="lh-spark-line"/>
      ${pts.map((v, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="4" class="${v >= PASS ? 'is-pass' : 'is-fail'}"><title>Bài ${i + 1}: ${v}%</title></circle>`).join('')}
    </svg>`;
  }

  function overviewHtml(recs, sb) {
    const scores = recs.map((r) => Number(r.score) || 0);
    const recent = scores.slice(-10);
    const avg = recent.length ? Math.round(recent.reduce((s, x) => s + x, 0) / recent.length) : null;
    const { streak, days } = streakOf(recs);
    const due = dueItems(sb).length;
    const inBook = Object.keys(sb.items || {}).length;
    const topics = topicStats(recs);
    const weak = topics.find((t) => t.avg < PASS && t.ids && t.ids.mtKey);
    const tips = [];
    if (due) tips.push(`<div class="lh-tip is-hot"><i class="fa-solid fa-book-bookmark"></i><div><b>Ôn ${due} câu đến hạn trong Sổ tay</b><span>Ôn đúng lúc sắp quên giúp nhớ lâu gấp nhiều lần học dồn.</span></div><button type="button" class="lh-btn" data-act="review">Ôn ngay</button></div>`);
    if (weak) tips.push(`<div class="lh-tip"><i class="fa-solid fa-bullseye"></i><div><b>Củng cố "${esc(weak.label)}"</b><span>Điểm TB gần đây ${weak.avg}% — dưới mức đạt ${PASS}%.</span></div><button type="button" class="lh-btn" data-act="practice" data-cat="${esc(weak.ids.catId)}" data-lvl="${esc(weak.ids.levelId)}" data-mt="${esc(weak.ids.mtKey)}">Làm lại</button></div>`);
    const lastTs = recs.length ? recTime(recs[recs.length - 1]) : 0;
    if (recs.length && Date.now() - lastTs > 3 * DAY) tips.push(`<div class="lh-tip"><i class="fa-solid fa-calendar-day"></i><div><b>Đã ${Math.floor((Date.now() - lastTs) / DAY)} ngày chưa luyện tập</b><span>Mỗi ngày 1 bài ngắn 10–15 phút hiệu quả hơn 1 buổi dài mỗi tuần.</span></div></div>`);
    const strong = topics.filter((t) => t.avg >= 90 && t.attempts >= 2);
    if (strong.length && !weak) tips.push(`<div class="lh-tip is-good"><i class="fa-solid fa-trophy"></i><div><b>Em đã vững ${strong.length} bài</b><span>Thử chế độ "Kiểm tra" hoặc bài "Tổng hợp" để luyện như thi thật.</span></div></div>`);
    if (!recs.length) tips.push(`<div class="lh-tip"><i class="fa-solid fa-play"></i><div><b>Bắt đầu với bài "Theo Tên bài" vừa học trên lớp</b><span>Làm xong, câu sai sẽ tự vào Sổ tay để ôn lại.</span></div></div>`);
    return `<div class="lh-kpis">
        <div class="lh-kpi"><b>${recs.length}</b><span>Bài đã làm</span></div>
        <div class="lh-kpi ${avg === null ? '' : avg >= PASS ? 'is-good' : 'is-warn'}"><b>${avg === null ? '–' : avg + '%'}</b><span>Điểm TB 10 bài gần nhất</span></div>
        <div class="lh-kpi"><b>${streak}<small> ngày</small></b><span>Chuỗi học liên tiếp · ${days} ngày đã học</span></div>
        <div class="lh-kpi ${due ? 'is-warn' : ''}"><b>${due}<small>/${inBook}</small></b><span>Câu cần ôn hôm nay / trong sổ</span></div>
      </div>
      ${goalHtml(recs)}
      <div class="lh-card"><div class="lh-card-title"><i class="fa-solid fa-chart-line"></i> Điểm các bài gần đây</div>${sparkline(scores)}</div>
      <div class="lh-card"><div class="lh-card-title"><i class="fa-solid fa-lightbulb"></i> Gợi ý hôm nay</div>${tips.join('') || '<div class="lh-spark-empty">Em đang làm rất tốt — tiếp tục duy trì nhé!</div>'}</div>`;
  }

  function topicsHtml(recs) {
    const topics = topicStats(recs);
    if (!topics.length) return '<div class="lh-empty"><i class="fa-solid fa-layer-group"></i><p>Chưa có bài nào. Làm bài xong sẽ thấy mức nắm vững từng bài ở đây.</p></div>';
    const lvl = (v) => (v >= 90 ? ['is-great', 'Vững'] : v >= PASS ? ['is-good', 'Đạt'] : v >= 50 ? ['is-warn', 'Cần ôn'] : ['is-bad', 'Yếu']);
    return `<p class="lh-note">Sắp từ yếu đến vững theo điểm trung bình 3 lần làm gần nhất.</p>
      <div class="lh-topics">${topics.map((t) => {
        const [cls, label] = lvl(t.avg);
        const canPractice = t.ids && t.ids.catId && t.ids.mtKey;
        return `<div class="lh-topic ${cls}">
          <div class="lh-topic-main">
            <div class="lh-topic-name">${esc(t.label)}</div>
            <div class="lh-topic-meta">${esc(t.level)} · ${t.attempts} lần · cao nhất ${t.best}% · lần cuối ${t.last}%
              ${t.trend > 0 ? '<i class="fa-solid fa-arrow-trend-up lh-up" title="Tiến bộ so với lần trước"></i>' : t.trend < 0 ? '<i class="fa-solid fa-arrow-trend-down lh-down" title="Giảm so với lần trước"></i>' : ''}</div>
            <div class="lh-bar"><i style="width:${t.avg}%"></i></div>
          </div>
          <div class="lh-topic-side"><b>${t.avg}%</b><span class="lh-chip">${label}</span>
            ${canPractice ? `<button type="button" class="lh-btn lh-btn-sm" data-act="practice" data-cat="${esc(t.ids.catId)}" data-lvl="${esc(t.ids.levelId)}" data-mt="${esc(t.ids.mtKey)}">Ôn ngay</button>` : ''}</div>
        </div>`;
      }).join('')}</div>`;
  }

  function bookHtml(sb) {
    const now = Date.now();
    const items = Object.entries(sb.items || {}).sort(([, a], [, b]) => (a.due - b.due) || (a.box - b.box));
    const due = items.filter(([, it]) => it.due <= now);
    const fmtDue = (t) => { if (t <= now) return 'Đến hạn'; const d = Math.ceil((t - now) / DAY); return d <= 1 ? 'Ngày mai' : `Sau ${d} ngày`; };
    const dots = (box) => [1, 2, 3, 4].map((b) => `<i class="${b <= box ? 'on' : ''}"></i>`).join('');
    return `<div class="lh-book-head">
        <div class="lh-kpis lh-kpis-3">
          <div class="lh-kpi ${due.length ? 'is-warn' : ''}"><b>${due.length}</b><span>Đến hạn ôn</span></div>
          <div class="lh-kpi"><b>${items.length - due.length}</b><span>Đang chờ lượt ôn</span></div>
          <div class="lh-kpi is-good"><b>${sb.mastered || 0}</b><span>Câu đã thuộc</span></div>
        </div>
        <div class="lh-book-actions">
          <button type="button" class="lh-btn" data-act="review" ${due.length ? '' : 'disabled'}><i class="fa-solid fa-play"></i> Ôn ${Math.min(due.length, REVIEW_BATCH)} câu đến hạn</button>
          <button type="button" class="lh-btn lh-btn-ghost" data-act="review-all" ${items.length ? '' : 'disabled'}>Ôn tất cả (${Math.min(items.length, REVIEW_BATCH)})</button>
          <button type="button" class="lh-btn lh-btn-ghost" data-act="flash" ${items.length ? '' : 'disabled'} title="Lật thẻ: câu hỏi ↔ đáp án + giải thích, tự đánh giá nhớ/chưa nhớ"><i class="fa-regular fa-clone"></i> Thẻ ghi nhớ</button>
        </div>
        <p class="lh-note"><i class="fa-solid fa-circle-info"></i> Mỗi câu đi qua 4 hộp: trả lời đúng → lên hộp sau và hẹn ôn thưa dần (ngay → 1 ngày → 3 ngày → 7 ngày → <b>thuộc</b>); sai → quay về hộp 1.</p>
      </div>
      ${items.length ? `<ul class="lh-book">${items.map(([k, it]) => `<li class="${it.due <= now ? 'is-due' : ''}">
          <span class="lh-leit" title="Hộp ${it.box}/4">${dots(it.box)}</span>
          <div class="lh-book-main"><div class="lh-book-q">${esc(plain(it.q.question))}</div>
            <div class="lh-book-meta">${esc(it.src || '')}${it.src ? ' · ' : ''}sai ${it.wrong || 1} lần</div></div>
          <span class="lh-due">${fmtDue(it.due)}</span>
          <button type="button" class="lh-icon" data-act="remove" data-k="${esc(k)}" title="Bỏ khỏi sổ (em đã hiểu câu này)" aria-label="Bỏ câu khỏi sổ"><i class="fa-solid fa-check"></i></button>
        </li>`).join('')}</ul>`
        : '<div class="lh-empty"><i class="fa-solid fa-face-smile"></i><p>Sổ tay đang trống. Câu nào làm sai trong bài thi/ôn luyện sẽ tự được ghi vào đây.</p></div>'}`;
  }

  function onBodyClick(e) {
    const b = e.target.closest('[data-act]');
    if (!b || b.disabled) return;
    const act = b.dataset.act;
    if (act === 'goal') {
      setGoal(H.key, +b.dataset.n);
      render(); updateBadge();
      return;
    }
    if (act === 'flash') {
      const sb = studentBook(H.key);
      const due = dueItems(sb).map(([k]) => k);
      const rest = Object.keys(sb.items || {}).filter((k) => !due.includes(k));
      H.flash = { keys: due.concat(rest).slice(0, REVIEW_BATCH), i: 0, flipped: false, ok: 0, again: 0, mastered: 0 };
      render();
      return;
    }
    if (act === 'flip') { H.flash.flipped = true; render(); return; }
    if (act === 'flash-ok' || act === 'flash-again') { flashGrade(act === 'flash-ok'); return; }
    if (act === 'flash-exit') { H.flash = null; render(); return; }
    if (act === 'practice') {
      close();
      if (typeof global.backToLobby === 'function' && $('lobby')?.style.display === 'none') global.backToLobby();
      const ok = typeof global.lobbySelectMinitest === 'function' && global.lobbySelectMinitest(b.dataset.cat, b.dataset.lvl, b.dataset.mt);
      if (typeof global.setLobbyView === 'function') global.setLobbyView('form');
      $('btnStart')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      notify(ok ? 'Đã chọn sẵn bài — bấm "Bắt đầu" để làm lại.' : 'Không chọn được bài này (đề có thể đã đổi tên).', ok ? 'success' : 'warning');
    } else if (act === 'review' || act === 'review-all') {
      const sb = studentBook(H.key);
      const list = act === 'review' ? dueItems(sb) : Object.entries(sb.items || {}).sort(([, a], [, b2]) => a.due - b2.due);
      const qs = list.slice(0, REVIEW_BATCH).map(([, it]) => it.q);
      if (!qs.length || typeof global.startWrongbookReview !== 'function') return;
      const st = knownStudents().find((s) => s.key === H.key) || lobbyStudent() || {};
      close();
      global.startWrongbookReview(qs, st);
    } else if (act === 'remove') {
      const book = lsGet(BOOK_KEY, {});
      const sb = book[H.key];
      if (!sb || !sb.items[b.dataset.k]) return;
      delete sb.items[b.dataset.k];
      sb.mastered = (sb.mastered || 0) + 1;
      lsSet(BOOK_KEY, book);
      render(); updateBadge();
    }
  }

  // ── Nút ở sảnh + huy hiệu số câu đến hạn ──
  function updateBadge() {
    const btn = $('learningHubBtn');
    if (!btn) return;
    const st = lobbyStudent();
    const n = st ? dueItems(studentBook(st.key)).length : 0;
    const badge = btn.querySelector('.lh-badge');
    badge.textContent = n;
    badge.hidden = !n;
    const goal = st ? goalOf(st.key) : 0;
    const prog = btn.querySelector('.lh-open-goal');
    if (goal) {
      const done = weekDone(studentRecords(st.key));
      prog.hidden = false;
      prog.querySelector('i').style.width = Math.min(100, Math.round((done / goal) * 100)) + '%';
      prog.title = `Mục tiêu tuần: ${done}/${goal} bài`;
      prog.querySelector('span').textContent = `${Math.min(done, goal)}/${goal}`;
    } else prog.hidden = true;
    btn.title = n ? `${n} câu trong Sổ tay đến hạn ôn` : 'Tiến độ học tập, bài cần củng cố, Sổ tay câu sai';
  }
  function mountButton() {
    const hist = document.querySelector('.lobby-card button[onclick="showRecords()"]');
    if (!hist || $('learningHubBtn')) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'learningHubBtn';
    btn.className = 'btn-secondary lh-open';
    btn.innerHTML = '<i class="fa-solid fa-seedling"></i> Góc học tập <span class="lh-badge" hidden></span>'
      + '<span class="lh-open-goal" hidden><b><i></i></b><span></span></span>';
    btn.addEventListener('click', () => open());
    hist.before(btn);
    ['studentName', 'studentClass', 'studentSchool'].forEach((id) => $(id)?.addEventListener('change', updateBadge));
    updateBadge();
  }

  global.addEventListener('edu:exam-graded', onGraded);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountButton);
  else mountButton();

  global.EduLearningHub = { open, updateBadge, _keyOf: keyOf };
})(window);
