/* ============================================================
   js/coordinator/student-table.js
   Bảng quản lý học sinh ĐẦY ĐỦ cho Coordinator Dashboard (Commit #5).
   Thay thế 3 danh sách rút gọn (watchlists) bằng 1 bảng chi tiết:
   avatar, MSSV, họ tên, lớp, giáo viên, điểm gần nhất, điểm TB,
   tiến độ học, trạng thái — có tìm kiếm, lọc trạng thái, phân trang.

   NGUYÊN TẮC: không gọi lại Firestore khi tìm kiếm/lọc/phân trang —
   chỉ lọc trong bộ nhớ trên dữ liệu đã có từ `scoped` (kết quả của
   EduCoordinatorData.applyFilters, xem data-loader.js), đúng tinh
   thần "bộ lọc 5 chiều không refetch" đã áp dụng ở Commit #4.

   Nạp SAU: analytics-service.js, roster.model.js, exam-history.model.js.
   Nạp TRƯỚC: dashboard.js (dashboard.js gọi render() mỗi khi refresh()).
   ============================================================ */
(function (global) {
  'use strict';

  const PAGE_SIZE_DEFAULT = 10;

  let state = {
    rows: [],       // toàn bộ hàng đã join (student + examHistory) theo scope hiện tại
    page: 1,
    pageSize: PAGE_SIZE_DEFAULT,
    search: '',
    status: '',
  };

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function initials(name) {
    const parts = String(name || '').trim().split(/\s+/);
    return (parts[parts.length - 1] || '?').slice(0, 1).toUpperCase();
  }

  /** Join filteredStudents (roster) với examHistories (quiz_results) theo studentKey. */
  function buildRows(scoped) {
    const { filteredStudents, examHistories, filteredResults } = scoped;
    const historyByKey = new Map(examHistories.map((e) => [e.studentKey, e]));
    const totalExams = new Set(filteredResults.map((r) => r.testName).filter(Boolean)).size;

    return filteredStudents.map((s) => {
      const key = global.EduModels.Roster.studentKeyOf({ name: s.name, className: s.className });
      const history = historyByKey.get(key) || null;
      const attemptsDone = history ? new Set(history.attempts.map((a) => a.testName).filter(Boolean)).size : 0;
      const progress = totalExams > 0 ? Math.min(100, Math.round((attemptsDone / totalExams) * 100)) : 0;
      return { student: s, history, progress, studentKey: key };
    });
  }

  function applyLocalFilters(rows) {
    const q = state.search.trim().toLowerCase();
    return rows.filter(({ student }) => {
      if (state.status && student.status !== state.status) return false;
      if (!q) return true;
      return (student.name || '').toLowerCase().includes(q) || (student.mssv || '').toLowerCase().includes(q);
    });
  }

  function scoreClass(score, passThreshold = 70) {
    if (typeof score !== 'number') return 'none';
    return score >= passThreshold ? 'pass' : 'fail';
  }

  function renderRow(row) {
    const { student, history, progress } = row;
    const latest = history ? history.latestScore : null;
    const avg = history ? history.avgScore : null;
    return `
      <tr>
        <td>
          <div class="avatar-cell">
            ${student.avatarUrl ? `<img src="${esc(student.avatarUrl)}" alt="">` : esc(initials(student.name))}
          </div>
        </td>
        <td>${esc(student.mssv || '—')}</td>
        <td>${esc(student.name || '—')}</td>
        <td>${esc(student.school || '—')}</td>
        <td>${esc(student.className || '—')}</td>
        <td>${esc(student.teacherName || '—')}</td>
        <td class="score-cell ${scoreClass(latest)}">${latest !== null ? latest + '%' : '—'}</td>
        <td class="score-cell ${scoreClass(avg)}">${avg !== null ? avg + '%' : '—'}</td>
        <td>
          <span class="progress-mini-track"><span class="progress-mini-fill" style="width:${progress}%"></span></span>
          <span class="progress-mini-label">${progress}%</span>
        </td>
        <td><span class="badge ${student.status === 'inactive' ? 'inactive' : 'active'}">${student.status === 'inactive' ? 'Ngừng học' : 'Đang học'}</span></td>
        <td><button type="button" class="row-view-btn" data-view-student="${esc(row.studentKey)}">Xem chi tiết</button></td>
      </tr>`;
  }

  function render(scoped) {
    state.rows = buildRows(scoped);
    state.page = 1; // đổi bộ lọc 5 chiều => reset về trang 1
    renderTable();
    document.getElementById('studentTableCard').hidden = false;
  }

  function renderTable() {
    const filtered = applyLocalFilters(state.rows);
    const totalPages = Math.max(1, Math.ceil(filtered.length / state.pageSize));
    state.page = Math.min(state.page, totalPages);
    const start = (state.page - 1) * state.pageSize;
    const pageRows = filtered.slice(start, start + state.pageSize);

    document.getElementById('studentTableCount').textContent = `(${filtered.length})`;
    const tbody = document.getElementById('studentTableBody');
    tbody.innerHTML = pageRows.length
      ? pageRows.map(renderRow).join('')
      : `<tr><td colspan="11" class="student-empty-cell">Không tìm thấy học sinh phù hợp bộ lọc hiện tại.</td></tr>`;

    tbody.querySelectorAll('[data-view-student]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.getAttribute('data-view-student');
        const row = state.rows.find((r) => r.studentKey === key);
        if (row && global.EduCoordinatorStudentDetail) global.EduCoordinatorStudentDetail.open(row.student, row.history);
      });
    });

    document.getElementById('studentPageIndicator').textContent = `Trang ${state.page}/${totalPages}`;
    document.getElementById('studentPrevPageBtn').disabled = state.page <= 1;
    document.getElementById('studentNextPageBtn').disabled = state.page >= totalPages;
  }

  function wireControls() {
    document.getElementById('studentSearchInput').addEventListener('input', (e) => {
      state.search = e.target.value;
      state.page = 1;
      renderTable();
    });
    document.getElementById('studentStatusFilter').addEventListener('change', (e) => {
      state.status = e.target.value;
      state.page = 1;
      renderTable();
    });
    document.getElementById('studentPageSize').addEventListener('change', (e) => {
      state.pageSize = parseInt(e.target.value, 10) || PAGE_SIZE_DEFAULT;
      state.page = 1;
      renderTable();
    });
    document.getElementById('studentPrevPageBtn').addEventListener('click', () => {
      state.page = Math.max(1, state.page - 1);
      renderTable();
    });
    document.getElementById('studentNextPageBtn').addEventListener('click', () => {
      state.page += 1;
      renderTable();
    });
    // Excel/PDF export: đúng lộ trình LMAP-ARCHITECTURE.md, các engine thật sẽ
    // được thêm ở Commit #6 (js/export/excel-exporter.js) và #7 (pdf-exporter.js).
    // Nút đã có sẵn ở đây để không phải sửa lại markup khi 2 commit đó tới.
    document.getElementById('exportExcelBtn').addEventListener('click', () => {
      global.dispatchEvent(new CustomEvent('edu:toast', { detail: 'Xuất Excel sẽ có ở Commit #6 (engine SheetJS 7-sheet workbook).' }));
    });
    document.getElementById('exportPdfBtn').addEventListener('click', () => {
      global.dispatchEvent(new CustomEvent('edu:toast', { detail: 'Xuất PDF sẽ có ở Commit #7 (logo, header/footer, biểu đồ).' }));
    });
  }

  // Script được nạp ở cuối <body> (giống toàn bộ file coordinator/* khác)
  // nên các phần tử DOM đã tồn tại — không cần chờ DOMContentLoaded.
  wireControls();

  global.EduCoordinatorStudentTable = { render };
})(window);
