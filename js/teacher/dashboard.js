/* ============================================================
   js/teacher/dashboard.js
   Điểm vào của teacher-dashboard.html (Commit #8/LMAP).

   Tái dùng NGUYÊN VẸN 3 module của Coordinator Dashboard (không sửa):
     js/coordinator/charts.js         → EduCoordinatorCharts.renderAll(scoped)
     js/coordinator/student-table.js  → EduCoordinatorStudentTable.render(scoped)
     js/coordinator/student-detail.js → EduCoordinatorStudentDetail.open(...)
   Cả 3 chỉ cần đúng shape { filteredResults, filteredStudents, examHistories }
   + đúng id phần tử DOM — không biết/không quan tâm dữ liệu đến từ
   coordinator hay teacher, nên dùng lại được 100% không sửa 1 dòng.

   KHÁC coordinator/dashboard.js: dùng js/teacher/data-loader.js (lọc
   theo "schools" của giáo viên ngay từ Firestore), không có bộ lọc
   Khoá học/Giáo viên (không áp dụng cho 1 giáo viên xem chính mình),
   và không có KPI "Tổng số giáo viên".

   Nạp SAU: js/teacher/data-loader.js, js/coordinator/{charts,student-table,student-detail}.js.
   ============================================================ */
(function () {
  'use strict';

  let rawData = null; // { schools, students, results, noSchoolsAssigned } — cache

  function toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('show'), 2600);
  }
  window.addEventListener('edu:toast', (e) => toast(e.detail));

  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await EduAuth.logoutUser();
    window.location.href = 'login.html';
  });

  window.addEventListener('edu:ready', ({ detail }) => {
    const { user, profile } = detail;
    document.getElementById('whoami').textContent = `${profile.name || user.email} · ${EduAuth.ROLE_LABEL[profile.role]}`;
    boot(profile);
  });

  let currentProfile = null;

  async function boot(profile, forceRefresh) {
    currentProfile = profile;
    try {
      rawData = await window.EduTeacherData.loadAll(profile, { forceRefresh: !!forceRefresh });
    } catch (err) {
      document.getElementById('loadingNote').textContent = '❌ Không tải được dữ liệu: ' + err.message;
      return;
    }

    if (rawData.noSchoolsAssigned) {
      document.getElementById('loadingNote').textContent =
        '⚠️ Tài khoản của bạn chưa được gán "Trường được xem". Liên hệ Quản trị viên để được gán trong trang Quản lý tài khoản.';
      return;
    }

    // Ghi vào biến toàn cục để student-detail.js (tái dùng từ coordinator,
    // xem ghi chú trong chính file đó) lọc đúng theo trường của giáo viên
    // khi query lịch sử làm bài đầy đủ của 1 học sinh.
    window.EduStudentDetailSchoolsScope = rawData.schools;

    window.EduTeacherData.buildFilterOptions(rawData);
    wireFilters();
    document.getElementById('loadingNote').hidden = true;
    document.getElementById('kpiGrid').hidden = false;
    document.getElementById('chartsGrid').hidden = false;
    document.getElementById('watchlistsGrid').hidden = false;
    refresh();
  }

  // "🔄 Làm mới dữ liệu": bỏ qua cache 3 phút, đọc lại thẳng từ Firestore —
  // dùng khi cần xem số liệu tức thời (vd. đang theo dõi buổi thi trực tiếp).
  document.getElementById('refreshDataBtn').addEventListener('click', async () => {
    if (!currentProfile) return;
    const btn = document.getElementById('refreshDataBtn');
    btn.disabled = true;
    const oldLabel = btn.textContent;
    btn.textContent = '⏳ Đang tải...';
    try {
      await boot(currentProfile, true);
      toast('✅ Đã cập nhật dữ liệu mới nhất.');
    } finally {
      btn.disabled = false;
      btn.textContent = oldLabel;
    }
  });

  function currentFilters() {
    return {
      school: document.getElementById('f-school')?.value || '',
      classId: document.getElementById('f-class').value, // thực ra là className (xem data-loader.js)
      examName: document.getElementById('f-exam').value,
      rangeDays: document.getElementById('f-range').value,
    };
  }

  function wireFilters() {
    ['f-school', 'f-class', 'f-exam', 'f-range'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('change', refresh);
    });
    document.getElementById('resetFiltersBtn').addEventListener('click', () => {
      ['f-school', 'f-class', 'f-exam'].forEach((id) => { const el = document.getElementById(id); if (el) el.value = ''; });
      document.getElementById('f-range').value = '30';
      refresh();
    });
  }

  function refresh() {
    if (!rawData) return;
    const filters = currentFilters();
    const scoped = window.EduTeacherData.applyFilters(rawData, filters);
    renderKpis(scoped);
    window.EduCoordinatorCharts.renderAll(scoped);
    renderWatchlists(scoped);
    if (window.EduCoordinatorStudentTable) window.EduCoordinatorStudentTable.render(scoped);
  }

  // ============================================================
  // KPI (6 — không có "Tổng số giáo viên" như bản coordinator)
  // ============================================================
  function renderKpis(scoped) {
    const { filteredResults, filteredStudents, examHistories } = scoped;

    document.getElementById('kpiStudents').textContent = filteredStudents.length;

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

    scoped._notSubmitted = notSubmitted;
    scoped._needsSupport = needsSupport;
  }

  // ============================================================
  // WATCHLISTS (giống coordinator, rút gọn — bảng đầy đủ ở dưới)
  // ============================================================
  const WATCHLIST_LIMIT = 8;

  function renderWatchlists(scoped) {
    renderList('notSubmitted', scoped._notSubmitted || [], (s) =>
      `<span class="name">${esc(s.name)}</span><span class="meta">${esc(s.className || '—')}${s.mssv ? ' · ' + esc(s.mssv) : ''}</span>`,
      '🎉 Không có học sinh nào — mọi người đã làm bài!');

    renderList('needsSupport', scoped._needsSupport || [], (e) =>
      `<span class="name">${esc(e.studentName)}</span><span class="meta">${esc(e.studentClass || '—')}</span>` +
      `<span class="score-chip" style="background:var(--red-lt);color:var(--red)">${e.avgScore}%</span>`,
      '👍 Không có học sinh nào dưới ngưỡng 60%.');

    renderList('topStudents', window.EduAnalytics.topStudents(scoped.examHistories, 20), (e) =>
      `<span class="name">${esc(e.studentName)}</span><span class="meta">${esc(e.studentClass || '—')}</span>` +
      `<span class="score-chip" style="background:var(--green-lt);color:var(--green)">${e.avgScore}%</span>`,
      'Chưa có dữ liệu.');
  }

  function renderList(prefix, list, rowHtml, emptyMsg) {
    document.getElementById(`${prefix}Count`).textContent = `(${list.length})`;
    const ul = document.getElementById(`${prefix}List`);
    if (!list.length) {
      ul.innerHTML = `<li class="watchlist-empty">${emptyMsg}</li>`;
      document.getElementById(`${prefix}More`).textContent = '';
      return;
    }
    ul.innerHTML = list.slice(0, WATCHLIST_LIMIT).map((item) => `<li class="watchlist-item">${rowHtml(item)}</li>`).join('');
    document.getElementById(`${prefix}More`).textContent =
      list.length > WATCHLIST_LIMIT ? `+ ${list.length - WATCHLIST_LIMIT} học sinh khác — xem đầy đủ ở bảng danh sách học sinh bên dưới` : '';
  }

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
})();
