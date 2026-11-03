/* ============================================================
   js/exam-countdown.js — "Còn N ngày đến kỳ thi" ở sảnh index.html

   Một hàng nhỏ trong .lobby-extras (ngay dưới "Thử thách hôm nay"):
     • Ngày thi: EduBackend.examSeason (thầy cô khai trong js/backend-config.js,
       theo Chương trình đang chọn); chưa khai thì học sinh tự đặt — lưu
       localStorage 'eduquiz_examdate' theo học sinh + chương trình.
     • "Tuần này ôn N/7 ngày": đếm ngày có bài nộp (eduquiz_records) hoặc
       có làm Thử thách hôm nay (eduquiz_daily) của học sinh đang chọn.
     • Gợi ý theo số ngày còn lại (nước rút ≤ 14 ngày: làm bài Kiểm tra).

   Chỉ đọc localStorage + cấu hình tĩnh. 0 Firebase, 0 Apps Script, 0 tải thêm.
   ============================================================ */
(function (global) {
  'use strict';

  const PREF_KEY = 'eduquiz_examdate';
  const $ = (id) => document.getElementById(id);
  function lsGet(k, fb) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch (e) { return fb; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* chế độ ẩn danh: bỏ qua */ } }

  function dayKey(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function parseDay(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  }
  function today0() { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function daysLeft(date) { return Math.round((date - today0()) / 864e5); }

  function student() {
    const v = (id) => ($(id)?.value || '').trim();
    const name = v('studentName');
    return {
      name, cls: v('studentClass'), school: v('studentSchool'),
      key: name ? [name, v('studentClass'), v('studentSchool')].map((x) => x.toLowerCase()).join('|') : 'khach',
    };
  }
  function program() { return $('categorySelect')?.value || ''; }

  /** Kỳ thi gần nhất chưa qua: cấu hình của trường trước, rồi tới ngày học sinh tự đặt. */
  function upcomingExam(st, prog) {
    const list = (global.EduBackend?.examSeason || [])
      .filter((e) => e && (!e.program || e.program === prog))
      .map((e) => ({ date: parseDay(e.date), label: String(e.label || 'Kỳ thi'), fixed: true }))
      .filter((e) => e.date && daysLeft(e.date) >= 0)
      .sort((a, b) => a.date - b.date);
    if (list.length) return list[0];
    const own = lsGet(PREF_KEY, {})[`${st.key}|${prog}`];
    const d = parseDay(own);
    return d && daysLeft(d) >= 0 ? { date: d, label: `Kỳ thi ${prog}`.trim(), fixed: false } : null;
  }

  /** Số ngày trong tuần này (thứ Hai → hôm nay) em có ôn bài. */
  function studyDaysThisWeek(st) {
    const t = today0();
    const monday = new Date(t); monday.setDate(t.getDate() - ((t.getDay() + 6) % 7));
    const days = new Set();
    const recs = lsGet('eduquiz_records', []);
    (Array.isArray(recs) ? recs : []).forEach((r) => {
      if (st.name && String(r.studentName || '').trim().toLowerCase() !== st.name.toLowerCase()) return;
      const id = Number(r.id) || 0;
      const ms = id > 1e14 ? Math.floor(id / 1000) : id; // rec.id = Date.now()*1000 + ngẫu nhiên
      if (ms >= monday.getTime()) days.add(dayKey(new Date(ms)));
    });
    const daily = lsGet('eduquiz_daily', {})[st.key];
    Object.keys(daily?.results || {}).forEach((k) => {
      const d = parseDay(k.split('|')[0]);
      if (d && d >= monday) days.add(dayKey(d));
    });
    return { n: days.size, of: (t.getDay() + 6) % 7 + 1 };
  }

  function advice(left) {
    if (left === 0) return 'Hôm nay thi. Bình tĩnh, đọc kỹ đề!';
    if (left <= 3) return 'Ôn lại Sổ tay câu sai, ngủ đủ giấc.';
    if (left <= 14) return 'Nước rút: mỗi ngày 1 bài Tổng hợp chế độ Kiểm tra.';
    return 'Mỗi ngày 1 bài + Thử thách hôm nay.';
  }

  // ── Nhiệm vụ mùa thi: kế hoạch theo số ngày còn lại + lộ trình của chính em ──
  const SPRINT_DAYS = 14;  // 2 tuần cuối: nước rút bằng đề Tổng hợp chế độ Kiểm tra
  const MIX_KEY = '__RANDOM_MIX__'; // khoá bài "Tổng hợp" trong js/quiz-engine.js (RANDOM_MIX_KEY)
  /**
   * Nhiệm vụ hôm nay. info = EduLearningHub.seasonInfo(...) ({ path, today }) hoặc null.
   * @returns {null|{phase, text, sub?, act?:{type:'lesson'|'mix'|'book', mt?}, done, behind?}}
   */
  function missionFor(left, info) {
    if (left === 0) return { phase: 'Ngày thi', text: 'Hôm nay thi: không học bài mới. Đọc kỹ đề, làm câu dễ trước.', done: false };
    if (!info) return null;
    const P = info.path;
    const today = info.today || [];
    const mixDone = today.some((r) => r.isMix);
    if (left <= 3) return { phase: 'Ôn cuối', text: 'Ôn lại Sổ tay câu sai 10–15 phút, ngủ đủ giấc.', act: { type: 'book' }, done: false };
    if (left <= SPRINT_DAYS) return { phase: 'Nước rút', text: '1 bài Tổng hợp ở chế độ Kiểm tra, như đề thi thật.', act: { type: 'mix' }, done: mixDone };
    const remaining = P.steps.length - P.passed;
    if (!remaining || !P.next) return { phase: 'Giữ phong độ', text: 'Em đã đạt cả lộ trình. Làm 1 bài Tổng hợp để giữ phong độ.', act: { type: 'mix' }, done: mixDone };
    const weeks = Math.max(1, Math.ceil((left - SPRINT_DAYS) / 7));
    const perWeek = Math.ceil(remaining / weeks);
    return {
      phase: 'Học theo lộ trình', text: `Bài nên làm: ${P.next.name}`,
      sub: `Còn ${remaining}/${P.steps.length} bài chưa đạt · cần khoảng ${perWeek} bài/tuần để kịp nước rút ${SPRINT_DAYS} ngày cuối`,
      act: { type: 'lesson', mt: P.next.name },
      done: today.some((r) => !r.isMix && r.mtKey),
      behind: perWeek > 5,
    };
  }

  function renderMission(ex, st, prog) {
    const box = $('examMission');
    if (!box) return;
    const lvl = $('levelSelect')?.value || '';
    const hub = global.EduLearningHub;
    const left = ex ? daysLeft(ex.date) : -1;
    const info = ex && prog && lvl && hub?.seasonInfo ? hub.seasonInfo(st.name, st.cls, st.school, prog, lvl) : null;
    const m = ex ? missionFor(left, info) : null;
    box.hidden = !m;
    if (!m) return;
    box.classList.toggle('is-done', !!m.done);
    box.classList.toggle('is-behind', !!m.behind && !m.done);
    const btn = m.act && !m.done
      ? `<button type="button" class="xm-go" data-type="${m.act.type}" data-mt="${esc(m.act.mt || '')}">${m.act.type === 'book' ? 'Mở sổ tay' : 'Làm ngay'}</button>` : '';
    box.innerHTML = `<i class="fa-solid ${m.done ? 'fa-circle-check' : 'fa-bullseye'} xm-ico" aria-hidden="true"></i>
      <div class="xm-text"><div class="xm-head">Nhiệm vụ hôm nay · <span>${esc(m.phase)}</span>${m.done ? ' · <b>đã xong</b>' : ''}</div>
        <div class="xm-main">${esc(m.text)}</div>${m.sub ? `<div class="xm-sub">${esc(m.sub)}${m.behind && !m.done ? ' — nên tăng tốc' : ''}</div>` : ''}</div>${btn}`;
    box.querySelector('.xm-go')?.addEventListener('click', (e) => go(e.currentTarget.dataset, prog, lvl));
  }

  /** Chọn sẵn bài ở sảnh (giống nút "Làm bài" của Góc học tập) — em vẫn tự bấm Bắt đầu. */
  function go(d, prog, lvl) {
    if (d.type === 'book') { global.EduLearningHub?.open('book'); return; }
    const ok = typeof global.lobbySelectMinitest === 'function' && global.lobbySelectMinitest(prog, lvl, d.type === 'mix' ? MIX_KEY : d.mt);
    if (ok && d.type === 'mix') $('examModeTestBtn')?.click();
    if (typeof global.setLobbyView === 'function') global.setLobbyView('form');
    $('btnStart')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (typeof global.showNotification === 'function') {
      global.showNotification(ok ? 'Đã chọn sẵn bài — bấm "Bắt đầu" để làm.' : 'Không chọn được bài này (đề có thể đã đổi tên).', ok ? 'success' : 'warning');
    }
  }

  function render() {
    const row = $('examCountdown');
    if (!row) return;
    const st = student();
    const prog = program();
    const ex = upcomingExam(st, prog);
    const wk = studyDaysThisWeek(st);
    const dd = ex ? `${ex.date.getDate()}/${ex.date.getMonth() + 1}` : '';
    const left = ex ? daysLeft(ex.date) : 0;
    row.classList.toggle('is-unset', !ex);
    row.classList.toggle('is-near', !!ex && left <= 14);
    row.querySelector('.xc-main').innerHTML = ex
      ? `<b>${left === 0 ? 'Hôm nay' : `Còn ${left} ngày`}</b> <span>${esc(ex.label)} · ${dd}</span>`
      : '<b>Đặt ngày thi</b>';
    row.querySelector('.xc-sub').textContent = `Tuần này: ${wk.n}/${wk.of} ngày`;
    row.title = ex ? advice(left) : '';
    const edit = row.querySelector('.xc-edit');
    edit.hidden = !!ex?.fixed;
    edit.title = ex ? 'Đổi ngày thi' : 'Đặt ngày thi';
    renderMission(ex, st, prog);
  }
  function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  function editDate() {
    const st = student();
    const prog = program();
    const all = lsGet(PREF_KEY, {});
    const key = `${st.key}|${prog}`;
    const inp = $('examCountdownInput');
    inp.min = dayKey(today0());
    inp.value = all[key] || '';
    inp.hidden = false;
    try { inp.showPicker?.(); } catch (e) { /* trình duyệt cũ: vẫn gõ được */ }
    inp.focus();
    inp.onchange = () => {
      const d = parseDay(inp.value);
      if (d && daysLeft(d) >= 0) all[key] = inp.value; else delete all[key];
      lsSet(PREF_KEY, all);
      inp.hidden = true;
      render();
    };
    inp.onblur = () => { setTimeout(() => { inp.hidden = true; }, 150); };
  }

  function mount() {
    const box = document.querySelector('.lobby-card .lobby-extras');
    if (!box || $('examCountdown')) return;
    const row = document.createElement('div');
    row.id = 'examCountdown';
    row.className = 'exam-countdown';
    row.innerHTML = '<i class="fa-regular fa-calendar xc-ico" aria-hidden="true"></i>'
      + '<div class="xc-text"><div class="xc-main"></div><div class="xc-sub"></div></div>'
      + '<button type="button" class="xc-edit" aria-label="Đặt ngày thi"><i class="fa-solid fa-pen" aria-hidden="true"></i></button>'
      + '<input type="date" id="examCountdownInput" class="xc-input" hidden aria-label="Ngày thi">';
    row.querySelector('.xc-edit').addEventListener('click', editDate);
    row.querySelector('.xc-text').addEventListener('click', () => { if (row.classList.contains('is-unset')) editDate(); });
    const dc = $('dailyChallengeBtn');
    if (dc) dc.after(row); else box.prepend(row);
    const mission = document.createElement('div');
    mission.id = 'examMission';
    mission.className = 'exam-mission';
    mission.hidden = true;
    mission.setAttribute('aria-live', 'polite');
    row.after(mission);
    ['studentName', 'studentClass', 'studentSchool', 'categorySelect', 'levelSelect']
      .forEach((id) => $(id)?.addEventListener('change', () => setTimeout(render)));
    global.addEventListener('edu:record-saved', render);
    global.addEventListener('edu:daily-updated', render);
    render();
    // Ngân hàng câu hỏi (meta.json) + Góc học tập nạp sau → vẽ lại nhiệm vụ khi đã có lộ trình
    let tries = 0;
    const wait = setInterval(() => {
      if ((global.quizRepository && global.EduLearningHub?.seasonInfo) || ++tries > 40) { clearInterval(wait); render(); }
    }, 300);
  }

  global.EduExamCountdown = { _missionFor: missionFor };
  if (typeof module !== 'undefined' && module.exports) { module.exports = global.EduExamCountdown; return; }

  // Sau js/daily-challenge.js (cùng defer) để nằm ngay dưới nút Thử thách.
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})(typeof window !== 'undefined' ? window : globalThis);
