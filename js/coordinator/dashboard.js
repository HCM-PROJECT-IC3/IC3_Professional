/* ============================================================
   js/coordinator/dashboard.js
   Điểm vào (entry point) của coordinator-dashboard.html.
   Tải dữ liệu 1 lần (loadAll), sau đó CHỈ lọc lại trong bộ nhớ mỗi
   khi đổi filter (không gọi lại Firestore) để đổi bộ lọc mượt.

   Nạp SAU: data-loader.js, charts.js, auth-guard.js (edu:ready).
   ============================================================ */
(function () {
  'use strict';

  let rawData = null; // { courses, classes, students, teachers, results } — cache
  let myProfile = null; // hồ sơ users/{uid} của Điều phối đào tạo đang đăng nhập

  function toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('show'), 2600);
  }

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // Cho phép các module khác (student-table.js, student-detail.js...) hiện
  // toast dùng chung mà không cần import lại hàm toast() cục bộ ở đây.
  window.addEventListener('edu:toast', (e) => toast(e.detail));

  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await EduAuth.logoutUser();
    window.location.href = 'login.html';
  });

  window.addEventListener('edu:ready', ({ detail }) => {
    const { user, profile } = detail;
    myProfile = profile;
    document.getElementById('whoami').textContent = `${profile.name || user.email} · ${EduAuth.ROLE_LABEL[profile.role]}`;
    boot();
  });

  // ── Tải dữ liệu theo TỪNG PHẦN (11/2026) ─────────────────────────────────────────────
  // Trước: roster + kết quả bài nộp chung 1 try — 1 nguồn lỗi (vd Google Sheet bận) là trắng cả trang, thử lại phải
  // đọc lại hết. Nay 2 phần độc lập: phần nào lỗi chỉ phần đó báo, nút "Thử lại" đọc lại ĐÚNG phần đó; phần đã có giữ
  // nguyên (kể cả bản tải trước). Mỗi lượt tải có số thứ tự: lượt cũ về sau lượt mới thì bỏ, không đè dữ liệu mới.
  const part = { roster: null, results: null, rosterErr: null, resultsErr: null };
  const seq = { all: 0, roster: 0, results: 0 };
  const LOADERS = { roster: 'loadRoster', results: 'loadResults' };
  const PART_LABEL = { roster: 'danh sách học sinh / lớp', results: 'kết quả bài nộp' };

  function errText(err) {
    const F = window.EduFirebase;
    if (err && err.source === 'apps-script') return 'Không đọc được kết quả từ Google Sheet (' + err.message + ') — mạng chập chờn hoặc Apps Script đang bận.';
    if (err && err.breaker) return err.message;
    if (F && F.isQuotaOrOffline && F.isQuotaOrOffline(err)) return F.QUOTA_HINT + ' — máy này chưa có bản đã lưu.';
    return 'Lỗi: ' + ((err && err.message) || err);
  }

  async function boot(forceRefresh) {
    const D = window.EduCoordinatorData;
    if (!D.scopeOf(myProfile)) {
      // Chưa được Admin gán trường nào — không query gì cả (tránh query rỗng bị rules từ chối)
      document.getElementById('loadingNote').innerHTML = '<i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> Bạn chưa được Admin gán trường nào để hỗ trợ (Quản lý tài khoản → Trường được xem/hỗ trợ). Liên hệ Admin để được gán trường.';
      return false;
    }
    const my = ++seq.all;
    const kinds = ['roster', 'results'], mine = kinds.map((k) => ++seq[k]);
    const settled = await Promise.allSettled(kinds.map((k) => D[LOADERS[k]](myProfile, { forceRefresh: !!forceRefresh })));
    if (my !== seq.all) return false; // đã có lượt tải mới hơn
    kinds.forEach((k, i) => { if (mine[i] === seq[k]) takePart(k, settled[i]); });
    show();
    return !part.rosterErr && !part.resultsErr;
  }

  function takePart(kind, st) {
    if (st.status === 'fulfilled') { part[kind] = st.value; part[kind + 'Err'] = null; }
    else { part[kind + 'Err'] = st.reason || new Error('lỗi'); console.warn('[Tổng quan điều phối] Không tải được ' + PART_LABEL[kind] + ':', st.reason); }
  }

  /** Nút "Thử lại phần này": đọc lại ĐÚNG 1 nguồn bị lỗi, không đụng nguồn đã tải được. */
  async function retryPart(kind, btn) {
    if (btn) { btn.disabled = true; btn.textContent = 'Đang tải...'; }
    const my = ++seq[kind];
    const [st] = await Promise.allSettled([window.EduCoordinatorData[LOADERS[kind]](myProfile, {})]);
    if (my !== seq[kind]) return;
    takePart(kind, st);
    show();
    if (!part[kind + 'Err']) toast('Đã tải ' + PART_LABEL[kind] + '.');
  }

  function partialHtml(kinds) {
    return kinds.map((k) => `<div class="partial-row"><span><b>Chưa tải được ${PART_LABEL[k]}.</b> ${esc(errText(part[k + 'Err']))}${part[k] ? ' Đang hiện bản tải trước.' : ''}</span>
      <button type="button" class="btn-ghost partial-retry" data-retry="${k}">Thử lại phần này</button></div>`).join('');
  }

  function show() {
    const failed = ['roster', 'results'].filter((k) => part[k + 'Err']);
    const note = document.getElementById('loadingNote'), pn = document.getElementById('partialNote');
    if (!part.roster && !part.results) {
      note.hidden = false;
      note.innerHTML = failed.length ? partialHtml(failed) : 'Đang tải dữ liệu roster &amp; kết quả bài thi...';
      if (pn) pn.hidden = true;
      return;
    }
    note.hidden = true;
    if (pn) { pn.hidden = !failed.length; pn.innerHTML = failed.length ? partialHtml(failed) : ''; }
    const sc = window.EduCoordinatorData.scopeOf(myProfile);
    rawData = Object.assign({ courses: [], classes: [], students: [], teachers: [] }, part.roster || {},
      { results: part.results || [], schools: sc ? sc.schools : [], noSchoolsAssigned: false, _noRoster: !part.roster, _noResults: !part.results });

    // js/coordinator/student-detail.js dùng biến toàn cục này để lọc đúng studentSchool khi tải lịch sử 1 học sinh —
    // KHÔNG gán thì query đó bị Firestore từ chối với điều phối đã bị siết phạm vi trường.
    window.EduStudentDetailSchoolsScope = myProfile.role === 'admin' ? undefined : rawData.schools;

    // Làm mới dữ liệu dựng lại ô lọc: nhớ lựa chọn hiện tại để không bị reset về "Tất cả".
    const keptFilters = {};
    ['f-course', 'f-teacher', 'f-class', 'f-exam', 'f-range'].forEach((id) => { const el = document.getElementById(id); if (el) keptFilters[id] = el.value; });
    window.EduCoordinatorData.buildFilterOptions(rawData);
    Object.keys(keptFilters).forEach((id) => {
      const el = document.getElementById(id);
      if (el && keptFilters[id] && Array.from(el.options).some((o) => o.value === keptFilters[id])) el.value = keptFilters[id];
    });
    wireFilters();
    document.getElementById('kpiGrid').hidden = false;
    document.getElementById('chartsGrid').hidden = false;
    document.getElementById('watchlistsGrid').hidden = false;
    refresh();
  }

  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-retry]');
    if (b && LOADERS[b.dataset.retry]) retryPart(b.dataset.retry, b);
  });

  const REFRESH_COOLDOWN_MS = 20 * 1000;
  const REFRESH_AT_KEY = 'edu:coordinator:manualRefreshAt';
  function refreshCooldownLeft() {
    let at = 0;
    try { at = Number(localStorage.getItem(REFRESH_AT_KEY)) || 0; } catch (e) { /* storage bị chặn: không giới hạn */ }
    const left = at + REFRESH_COOLDOWN_MS - Date.now();
    return left > 0 && left <= REFRESH_COOLDOWN_MS ? left : 0; // đồng hồ máy bị chỉnh lùi → bỏ qua
  }
  function markRefreshed() {
    try { localStorage.setItem(REFRESH_AT_KEY, String(Date.now())); } catch (e) { /* bỏ qua */ }
  }

  // "Làm mới dữ liệu": bỏ qua cache 3 phút, đọc lại thẳng từ Firestore —
  // dùng khi cần xem số liệu tức thời (vd. đang theo dõi buổi thi trực tiếp).
  document.getElementById('refreshDataBtn').addEventListener('click', async () => {
    const btn = document.getElementById('refreshDataBtn');
    // Bấm liên tục / nhiều tab (08/11/2026, burst.py: 6 lần bấm = 6 lần gọi Apps Script listResults): mỗi máy làm mới
    // tối đa 1 lần / REFRESH_COOLDOWN_MS, tính chung mọi tab (localStorage).
    const wait = refreshCooldownLeft();
    if (wait > 0) { toast(`Dữ liệu vừa được làm mới — bấm lại sau ${Math.ceil(wait / 1000)} giây.`); return; }
    markRefreshed();
    btn.disabled = true;
    const oldLabel = btn.textContent;
    btn.innerHTML = '<i class="fa-solid fa-hourglass-half" aria-hidden="true"></i> Đang tải...';
    try {
      if (await boot(true)) toast('Đã cập nhật dữ liệu mới nhất.');
    } finally {
      btn.disabled = false;
      btn.textContent = oldLabel;
    }
  });

  function currentFilters() {
    return {
      courseId: document.getElementById('f-course').value,
      teacherId: document.getElementById('f-teacher').value,
      classId: document.getElementById('f-class').value,
      examName: document.getElementById('f-exam').value,
      rangeDays: document.getElementById('f-range').value,
    };
  }

  let filtersWired = false;
  function wireFilters() {
    // boot() chạy lại mỗi lần "Làm mới dữ liệu" — chỉ gắn listener MỘT lần, nếu không
    // mỗi lần bấm sẽ nhân đôi số lần render mỗi khi đổi bộ lọc.
    if (filtersWired) return;
    filtersWired = true;
    ['f-course', 'f-teacher', 'f-class', 'f-exam', 'f-range'].forEach((id) => {
      document.getElementById(id).addEventListener('change', refresh);
    });
    document.getElementById('resetFiltersBtn').addEventListener('click', () => {
      ['f-course', 'f-teacher', 'f-class', 'f-exam'].forEach((id) => { document.getElementById(id).value = ''; });
      document.getElementById('f-range').value = '30';
      refresh();
    });
  }

  function refresh() {
    if (!rawData) return;
    const filters = currentFilters();
    const scoped = window.EduCoordinatorData.applyFilters(rawData, filters);
    renderKpis(scoped, filters);
    window.EduCoordinatorCharts.renderAll(scoped);
    renderWatchlists(scoped);
    renderSchoolComparison(scoped);
    // Bảng quản lý học sinh đầy đủ — dùng lại đúng `scoped` đã
    // lọc 5 chiều, không gọi lại Firestore.
    if (window.EduCoordinatorStudentTable) window.EduCoordinatorStudentTable.render(scoped);
    if (window.EduWrongQuestions) window.EduWrongQuestions.setContext(wrongQuestionsScope(filters, scoped));
  }

  /** Bộ lọc → phạm vi hỏi Apps Script (wrongStats, js/teacher/wrong-questions.js).
   *  Khoá học/Giáo viên/Lớp quy về danh sách tên lớp như applyFilters; Admin = mọi trường. */
  function wrongQuestionsScope(f, scoped) {
    const days = { '7': 7, '30': 30, '90': 90 }[f.rangeDays];
    const byClass = !!(f.courseId || f.teacherId || f.classId);
    const names = byClass ? [...new Set(scoped.allowedClasses.map((c) => c.name).filter(Boolean))] : null;
    const optText = (id) => { const el = document.getElementById(id); return el && el.value ? el.options[el.selectedIndex].text : ''; };
    const who = f.classId ? 'Lớp ' + optText('f-class')
      : [optText('f-course'), f.teacherId ? 'GV ' + optText('f-teacher') : ''].filter(Boolean).join(' · ') || 'Mọi lớp';
    return {
      schools: myProfile.role === 'admin' ? undefined : rawData.schools,
      // Lọc ra 0 lớp: gửi tên không thể trùng — mảng rỗng thì Apps Script hiểu là "mọi lớp".
      classes: names ? (names.length ? names : ['\u0000']) : undefined,
      sinceMs: days ? Date.now() - days * 86400000 - (Date.now() % 3600000) : undefined, // làm tròn giờ như teacher dashboard
      testName: f.examName || '',
      label: [who, f.examName ? f.examName.split(' › ').pop() : 'mọi bài', days ? days + ' ngày qua' : 'toàn bộ'].join(' · '),
    };
  }

  // ============================================================
  // SO SÁNH GIỮA CÁC TRƯỜNG — chỉ có nghĩa khi phạm vi xem có ≥ 2 trường
  // ============================================================
  function renderSchoolComparison(scoped) {
    const rows = window.EduAnalytics.schoolComparison(scoped.filteredResults, scoped.filteredStudents);
    const card = document.getElementById('schoolCompareCard');
    card.hidden = rows.length < 2;
    if (card.hidden) return;
    const pct = (v) => (v === null || v === undefined ? '—' : v + '%');
    document.getElementById('schoolCompareCount').textContent = `(${rows.length})`;
    document.getElementById('schoolCompareRows').innerHTML = rows.map((r) => `
      <tr>
        <td>${esc(r.school)}</td>
        <td class="num">${r.rosterSize || '—'}</td>
        <td class="num">${r.active}</td>
        <td class="num">${pct(r.participation)}</td>
        <td class="num">${r.submissions}</td>
        <td class="num"><b>${pct(r.avg)}</b></td>
        <td class="num">${pct(r.passRate)}</td>
      </tr>`).join('');
  }

  // ============================================================
  // 7 KPI
  // ============================================================
  function renderKpis(scoped, filters) {
    const { filteredResults, filteredStudents, examHistories, allowedClasses } = scoped;
    const anyClassFilterActive = !!(filters.courseId || filters.teacherId || filters.classId);

    const noR = rawData._noRoster, noS = rawData._noResults, dash = (id) => { document.getElementById(id).textContent = '—'; };
    document.getElementById('kpiStudents').textContent = noR ? '—' : filteredStudents.length;

    const teacherCount = anyClassFilterActive
      ? new Set(allowedClasses.map((c) => c.teacherId).filter(Boolean)).size
      : rawData.teachers.length;
    document.getElementById('kpiTeachers').textContent = teacherCount;

    const examCount = new Set(filteredResults.map((r) => r.testName).filter(Boolean)).size;
    document.getElementById('kpiExams').textContent = examCount;

    const avg = window.EduAnalytics.avgScore(filteredResults);
    document.getElementById('kpiAvgScore').textContent = avg !== null ? avg + '%' : '—';

    const pass = window.EduAnalytics.passRate(filteredResults);
    document.getElementById('kpiPassRate').textContent = pass !== null ? pass + '%' : '—';

    const submittedKeys = new Set(examHistories.map((e) => e.studentKey));
    const notSubmitted = filteredStudents.filter((s) => !submittedKeys.has(
      window.EduModels.Roster.studentKeyOf({ name: s.name, className: s.className })
    ));
    document.getElementById('kpiNotSubmitted').textContent = noR || noS ? '—' : notSubmitted.length;
    const sub = document.getElementById('kpiNotSubmittedSub');
    if (sub) sub.textContent = noR || noS || !filteredStudents.length ? '' : `${Math.round((notSubmitted.length / filteredStudents.length) * 100)}% sĩ số · đã làm ${filteredStudents.length - notSubmitted.length}`;
    if (noS) ['kpiExams', 'kpiAvgScore', 'kpiPassRate', 'kpiNeedsSupport'].forEach(dash);

    const needsSupport = window.EduAnalytics.studentsNeedingSupport(examHistories, 60);
    document.getElementById('kpiNeedsSupport').textContent = needsSupport.length;

    // Lưu lại để renderWatchlists dùng chung, khỏi tính lại 2 lần.
    scoped._notSubmitted = notSubmitted;
    scoped._needsSupport = needsSupport;
  }

  // ============================================================
  // WATCHLISTS (danh sách rút gọn; bảng đầy đủ + chi tiết học sinh ở student-table.js/student-detail.js)
  // ============================================================
  const WATCHLIST_LIMIT = 8;

  function renderWatchlists(scoped) {
    renderNotSubmittedList(scoped._notSubmitted || []);
    renderNeedsSupportList(scoped._needsSupport || []);
    renderTopStudentsList(window.EduAnalytics.topStudents(scoped.examHistories, 20));
  }

  function renderNotSubmittedList(list) {
    document.getElementById('notSubmittedCount').textContent = `(${list.length})`;
    const ul = document.getElementById('notSubmittedList');
    if (!list.length) {
      ul.innerHTML = '<li class="watchlist-empty">Không có học sinh nào — mọi người đã làm bài!</li>';
      document.getElementById('notSubmittedMore').textContent = '';
      return;
    }
    ul.innerHTML = list.slice(0, WATCHLIST_LIMIT).map((s) => `
      <li class="watchlist-item">
        <span class="name">${esc(s.name)}</span>
        <span class="meta">${esc(s.className || '—')}${s.mssv ? ' · ' + esc(s.mssv) : ''}</span>
      </li>`).join('');
    document.getElementById('notSubmittedMore').textContent =
      list.length > WATCHLIST_LIMIT ? `+ ${list.length - WATCHLIST_LIMIT} học sinh khác — xem đầy đủ ở bảng danh sách học sinh bên dưới` : '';
  }

  function renderNeedsSupportList(list) {
    document.getElementById('needsSupportCount').textContent = `(${list.length})`;
    const ul = document.getElementById('needsSupportList');
    if (!list.length) {
      ul.innerHTML = '<li class="watchlist-empty">Không có học sinh nào dưới ngưỡng 60%.</li>';
      document.getElementById('needsSupportMore').textContent = '';
      return;
    }
    ul.innerHTML = list.slice(0, WATCHLIST_LIMIT).map((e) => `
      <li class="watchlist-item">
        <span class="name">${esc(e.studentName)}</span>
        <span class="meta">${esc(e.studentClass || '—')}</span>
        <span class="score-chip" style="background:var(--red-lt);color:var(--red)">${e.avgScore}%</span>
      </li>`).join('');
    document.getElementById('needsSupportMore').textContent =
      list.length > WATCHLIST_LIMIT ? `+ ${list.length - WATCHLIST_LIMIT} học sinh khác` : '';
  }

  function renderTopStudentsList(list) {
    document.getElementById('topStudentsCount').textContent = `(${list.length})`;
    const ul = document.getElementById('topStudentsList');
    if (!list.length) {
      ul.innerHTML = '<li class="watchlist-empty">Chưa có dữ liệu.</li>';
      document.getElementById('topStudentsMore').textContent = '';
      return;
    }
    ul.innerHTML = list.slice(0, WATCHLIST_LIMIT).map((e) => `
      <li class="watchlist-item">
        <span class="name">${esc(e.studentName)}</span>
        <span class="meta">${esc(e.studentClass || '—')}</span>
        <span class="score-chip" style="background:var(--green-lt);color:var(--green)">${e.avgScore}%</span>
      </li>`).join('');
    document.getElementById('topStudentsMore').textContent =
      list.length > WATCHLIST_LIMIT ? `+ ${list.length - WATCHLIST_LIMIT} học sinh khác` : '';
  }

})();
