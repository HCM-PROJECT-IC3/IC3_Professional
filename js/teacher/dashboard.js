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

    // Ảnh đại diện tải lên ở "Trang Social Media" (portfolio.html § PfProfile) nằm trong
    // collection riêng "gvlab_profiles" — đọc 1 lần để hiện lên topbar,
    // giữ chữ cái đầu tên làm fallback nếu giáo viên chưa từng đổi ảnh
    // (cùng cách làm với js/dashboard-page.js).
    const avatarBox = document.getElementById('whoamiAvatar');
    if (avatarBox) {
      const name = profile.name || user.email || '';
      avatarBox.textContent = name.trim().charAt(0).toUpperCase();
      if (window.EduProfileCache) {
        window.EduProfileCache.get(user.uid)
          .then((p) => {
            const avatar = p ? p.avatar : null;
            if (avatar) avatarBox.innerHTML = `<img src="${avatar}" alt="">`;
          })
          .catch((err) => console.warn('[Teacher Dashboard] Không tải được ảnh đại diện Trang Social Media:', err.message));
      }
    }

    boot(profile);
  });

  let currentProfile = null;

  async function boot(profile, forceRefresh) {
    currentProfile = profile;
    try {
      rawData = await window.EduTeacherData.loadAll(profile, { forceRefresh: !!forceRefresh });
    } catch (err) {
      const F = window.EduFirebase;
      document.getElementById('loadingNote').textContent = err && err.source === 'apps-script'
        // Kết quả bài nộp đọc từ Google Sheet — lỗi ở đây KHÔNG phải Firebase hết lượt
        ? 'Không đọc được kết quả bài nộp từ Google Sheet (' + err.message + '). Mạng chập chờn hoặc Apps Script đang bận — bấm "Làm mới dữ liệu" để thử lại.'
        : err && err.breaker ? err.message
        : F && F.isQuotaOrOffline(err)
        ? F.QUOTA_HINT + '. Máy này chưa có dữ liệu đã lưu — thử lại sau.'
        : 'Không tải được dữ liệu: ' + err.message;
      return;
    }

    if (rawData.noSchoolsAssigned) {
      document.getElementById('loadingNote').textContent =
        'Tài khoản của bạn chưa được gán "Trường được xem". Liên hệ Quản trị viên để được gán trong trang Quản lý tài khoản.';
      return;
    }

    // Ghi vào biến toàn cục để student-detail.js (tái dùng từ coordinator,
    // xem ghi chú trong chính file đó) lọc đúng theo trường của giáo viên
    // khi query lịch sử làm bài đầy đủ của 1 học sinh. CHỈ gán cho role
    // teacher — Admin đọc KHÔNG giới hạn theo trường (đúng quyền isAdmin()
    // trong firestore.rules, xem data-loader.js), phải để undefined ở đây
    // (đúng mặc định student-detail.js mong đợi cho coordinator/admin),
    // nếu không rawData.schools (Admin có thể được gán TỪ dữ liệu, có khi
    // >10 trường) sẽ vô tình bị bó vào where('in', ...) tối đa 10 giá trị,
    // âm thầm mất dữ liệu học sinh ở các trường ngoài 10 trường đầu.
    window.EduStudentDetailSchoolsScope = currentProfile.role === 'admin' ? undefined : rawData.schools;

    // Làm mới dữ liệu dựng lại ô lọc: nhớ lựa chọn hiện tại để không bị reset về "Tất cả".
    const keptFilters = {};
    ['f-school', 'f-class', 'f-exam', 'f-range'].forEach((id) => { const el = document.getElementById(id); if (el) keptFilters[id] = el.value; });
    window.EduTeacherData.buildFilterOptions(rawData);
    Object.keys(keptFilters).forEach((id) => {
      const el = document.getElementById(id);
      if (el && keptFilters[id] && Array.from(el.options).some((o) => o.value === keptFilters[id])) el.value = keptFilters[id];
    });
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
    btn.innerHTML = '<i class="fa-solid fa-hourglass-half" aria-hidden="true"></i> Đang tải...';
    try {
      await boot(currentProfile, true);
      toast('Đã cập nhật dữ liệu mới nhất.');
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

  let filtersWired = false;
  function wireFilters() {
    // boot() chạy lại mỗi lần "Làm mới dữ liệu" — chỉ gắn listener MỘT lần, nếu không
    // mỗi lần bấm sẽ nhân đôi số lần render mỗi khi đổi bộ lọc.
    if (filtersWired) return;
    filtersWired = true;
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
    if (window.EduWrongQuestions) window.EduWrongQuestions.setContext(wrongQuestionsScope(filters));
  }

  /** Bộ lọc dashboard → phạm vi hỏi Apps Script (wrongStats). Admin không gán trường = mọi trường. */
  function wrongQuestionsScope(f) {
    const days = { '7': 7, '30': 30, '90': 90 }[f.rangeDays];
    const schools = f.school ? [f.school] : (currentProfile.role === 'admin' ? undefined : rawData.schools);
    return {
      schools,
      classes: f.classId ? [f.classId] : undefined,
      sinceMs: days ? Date.now() - days * 86400000 - (Date.now() % 3600000) : undefined, // làm tròn giờ → đổi bộ lọc khác mới coi là phạm vi mới
      testName: f.examName || '',
      label: [f.classId ? 'Lớp ' + f.classId : (f.school || 'Mọi lớp'), f.examName ? f.examName.split(' › ').pop() : 'mọi bài',
        days ? days + ' ngày qua' : 'toàn bộ'].join(' · '),
    };
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
      'Không có học sinh nào — mọi người đã làm bài!');

    renderList('needsSupport', scoped._needsSupport || [], (e) =>
      `<span class="name">${esc(e.studentName)}</span><span class="meta">${esc(e.studentClass || '—')}</span>` +
      `<span class="score-chip" style="background:var(--red-lt);color:var(--red)">${e.avgScore}%</span>`,
      'Không có học sinh nào dưới ngưỡng 60%.');

    renderList('topStudents', window.EduAnalytics.topStudents(scoped.examHistories, 20), (e) =>
      `<span class="name">${esc(e.studentName)}</span><span class="meta">${esc(e.studentClass || '—')}</span>` +
      `<span class="score-chip" style="background:var(--green-lt);color:var(--green)">${e.avgScore}%</span>`,
      'Chưa có dữ liệu.');

    renderClassRace(scoped);
  }

  // ============================================================
  // THI ĐUA LỚP THEO TUẦN — tính trên kết quả đã tải (0 lượt Firestore thêm)
  // ============================================================
  const MEDALS = ['🥇', '🥈', '🥉'];
  let classRace = [];

  function renderClassRace(scoped) {
    classRace = window.EduAnalytics.classLeaderboard(scoped.filteredResults, scoped.filteredStudents);
    document.getElementById('classRaceCount').textContent = `(${classRace.length} lớp)`;
    document.getElementById('classRacePresent').hidden = !classRace.length;
    const ul = document.getElementById('classRaceList');
    ul.innerHTML = classRace.length
      ? classRace.map((c, i) => `<li class="watchlist-item race-item"><span class="name">${MEDALS[i] || `${i + 1}.`} ${esc(c.className)}</span>`
        + `<span class="meta">TB ${c.avg}% · ${c.active}${c.rosterSize ? '/' + c.rosterSize : ''} HS · ${c.submissions} bài</span>`
        + `<span class="score-chip" style="background:var(--purple-lt);color:var(--purple)">${c.points}</span></li>`).join('')
      : '<li class="watchlist-empty">Tuần này chưa có bài nộp nào (theo bộ lọc đang chọn).</li>';
  }

  function presentClassRace() {
    if (!classRace.length) return;
    const ov = document.createElement('div');
    ov.className = 'race-overlay';
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-label', 'Bảng thi đua lớp tuần này');
    const top = classRace[0].points || 1;
    ov.innerHTML = `<button type="button" class="race-close" aria-label="Đóng">✕</button>
      <h2><i class="fa-solid fa-medal" aria-hidden="true"></i> Thi đua lớp tuần này</h2>
      <p class="race-sub">Từ thứ Hai ${new Date(window.EduAnalytics.weekStartMs()).toLocaleDateString('vi-VN')} · Điểm thi đua = điểm TB × % học sinh tham gia</p>
      <ol class="race-list">${classRace.slice(0, 10).map((c, i) => `<li style="--w:${Math.max(6, Math.round((c.points / top) * 100))}%">
        <span class="race-rank">${MEDALS[i] || i + 1}</span><span class="race-name">${esc(c.className)}</span>
        <span class="race-bar"><i></i></span><b class="race-pts">${c.points}</b>
        <span class="race-meta">TB ${c.avg}% · ${c.participation}% tham gia</span></li>`).join('')}</ol>`;
    const close = () => { ov.remove(); document.removeEventListener('keydown', onKey); if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    ov.querySelector('.race-close').addEventListener('click', close);
    document.addEventListener('keydown', onKey);
    document.body.appendChild(ov);
    ov.querySelector('.race-close').focus();
    if (ov.requestFullscreen) ov.requestFullscreen().catch(() => {});
  }
  document.getElementById('classRacePresent').addEventListener('click', presentClassRace);

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
