/* ============================================================
   js/coordinator/dashboard.js
   Điểm vào (entry point) của coordinator-dashboard.html — Commit #4.
   Tải dữ liệu 1 lần (loadAll), sau đó CHỈ lọc lại trong bộ nhớ mỗi
   khi đổi filter (không gọi lại Firestore) để đổi bộ lọc mượt.

   Nạp SAU: data-loader.js, charts.js, auth-guard.js (edu:ready).
   ============================================================ */
(function () {
  'use strict';

  let rawData = null; // { courses, classes, students, teachers, results } — cache

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
    document.getElementById('whoami').textContent = `${profile.name || user.email} · ${EduAuth.ROLE_LABEL[profile.role]}`;
    boot();
  });

  async function boot() {
    try {
      rawData = await window.EduCoordinatorData.loadAll();
    } catch (err) {
      document.getElementById('loadingNote').textContent = '❌ Không tải được dữ liệu: ' + err.message;
      return;
    }
    window.EduCoordinatorData.buildFilterOptions(rawData);
    wireFilters();
    document.getElementById('loadingNote').hidden = true;
    document.getElementById('kpiGrid').hidden = false;
    document.getElementById('chartsGrid').hidden = false;
    document.getElementById('watchlistsGrid').hidden = false;
    refresh();
  }

  function currentFilters() {
    return {
      courseId: document.getElementById('f-course').value,
      teacherId: document.getElementById('f-teacher').value,
      classId: document.getElementById('f-class').value,
      examName: document.getElementById('f-exam').value,
      rangeDays: document.getElementById('f-range').value,
    };
  }

  function wireFilters() {
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
    // Bảng quản lý học sinh đầy đủ (Commit #5) — dùng lại đúng `scoped` đã
    // lọc 5 chiều, không gọi lại Firestore.
    if (window.EduCoordinatorStudentTable) window.EduCoordinatorStudentTable.render(scoped);
  }

  // ============================================================
  // 7 KPI
  // ============================================================
  function renderKpis(scoped, filters) {
    const { filteredResults, filteredStudents, examHistories, allowedClasses } = scoped;
    const anyClassFilterActive = !!(filters.courseId || filters.teacherId || filters.classId);

    document.getElementById('kpiStudents').textContent = filteredStudents.length;

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
    document.getElementById('kpiNotSubmitted').textContent = notSubmitted.length;

    const needsSupport = window.EduAnalytics.studentsNeedingSupport(examHistories, 60);
    document.getElementById('kpiNeedsSupport').textContent = needsSupport.length;

    // Lưu lại để renderWatchlists dùng chung, khỏi tính lại 2 lần.
    scoped._notSubmitted = notSubmitted;
    scoped._needsSupport = needsSupport;
  }

  // ============================================================
  // WATCHLISTS (danh sách rút gọn — bảng đầy đủ + chi tiết học sinh sẽ ở Commit #5)
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
      ul.innerHTML = '<li class="watchlist-empty">🎉 Không có học sinh nào — mọi người đã làm bài!</li>';
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
      ul.innerHTML = '<li class="watchlist-empty">👍 Không có học sinh nào dưới ngưỡng 60%.</li>';
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
