/* ============================================================
   js/coordinator/student-detail.js
   Drawer chi tiết 1 học sinh cho Coordinator Dashboard (Commit #5).

   Hiển thị:
   - Thông tin học sinh (avatar, MSSV, lớp, giáo viên, trạng thái).
   - 4 KPI nhanh: số lượt làm bài, điểm TB, điểm cao nhất, điểm gần nhất.
   - Lịch sử làm bài ĐẦY ĐỦ — gọi trực tiếp studentResultRepository
     (KHÔNG dùng lại dữ liệu `filteredResults` đã tải sẵn, vì bộ lọc
     5 chiều trên dashboard có thể đang thu hẹp theo bài thi/khoảng thời
     gian — chi tiết học sinh phải luôn cho xem TOÀN BỘ lịch sử của
     đúng em đó, bất kể bộ lọc đang bật).
   - Lịch sử đăng nhập: xem ghi chú THẬT THÀ bên dưới — hệ thống hiện
     tại không có, vì học sinh làm bài ẨN DANH (không qua Firebase Auth,
     xem mục 1 LMAP-ARCHITECTURE.md), nên activity_logs (keyed theo uid)
     không có bản ghi nào của các em. Không giả lập số liệu này.

   Mỗi lần mở drawer đều ghi 1 dòng activity_logs
   (action: VIEW_STUDENT_DETAIL, targetId: studentKey) qua
   EduActivityLog.log — phục vụ Audit Log của Admin sau này.

   Nạp SAU: student-result-repository.js, exam-history.model.js,
            activity-log-service.js.
   Nạp TRƯỚC: dashboard.js.
   ============================================================ */
(function (global) {
  'use strict';

  const cache = new Map(); // studentKey -> ExamHistory đầy đủ (không bị bộ lọc), tránh gọi lại Firestore khi mở lại cùng 1 học sinh

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function initials(name) {
    const parts = String(name || '').trim().split(/\s+/);
    return (parts[parts.length - 1] || '?').slice(0, 1).toUpperCase();
  }

  function fmtDate(ms) {
    if (!ms) return '—';
    return new Date(ms).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function fmtDuration(sec) {
    if (typeof sec !== 'number' || sec <= 0) return '—';
    const m = Math.floor(sec / 60), s = sec % 60;
    return m > 0 ? `${m} phút ${s}s` : `${s}s`;
  }

  const overlay = () => document.getElementById('studentDetailOverlay');

  function open(student, quickHistory) {
    const key = global.EduModels.Roster.studentKeyOf({ name: student.name, className: student.className });

    renderHeader(student);
    overlay().classList.add('show');
    document.body.style.overflow = 'hidden';

    // Ghi audit log — không chặn UI nếu lỗi (EduActivityLog.log tự nuốt lỗi).
    if (global.EduActivityLog) {
      global.EduActivityLog.log(global.EduModels.ActivityLog.ACTIONS.VIEW_STUDENT_DETAIL, {
        targetId: key,
        meta: { studentName: student.name, className: student.className },
      });
    }

    if (cache.has(key)) {
      renderBody(student, cache.get(key));
      return;
    }

    document.getElementById('detailDrawerBody').innerHTML = '<div class="loading-note">⏳ Đang tải lịch sử làm bài…</div>';

    global.EduRepositories.studentResult
      .listByStudent({ studentName: student.name, studentClass: student.className })
      .then((results) => {
        const [history] = global.EduModels.ExamHistory.buildFromResults(results);
        const full = history || { attempts: [], attemptsCount: 0, avgScore: null, bestScore: null, latestScore: null };
        cache.set(key, full);
        renderBody(student, full);
      })
      .catch((err) => {
        document.getElementById('detailDrawerBody').innerHTML =
          `<div class="detail-empty-note">❌ Không tải được lịch sử làm bài: ${esc(err.message)}</div>`;
        void quickHistory; // fallback tối thiểu nếu cần dùng sau này — hiện chưa cần vì đã báo lỗi rõ ràng
      });
  }

  function close() {
    overlay().classList.remove('show');
    document.body.style.overflow = '';
  }

  function renderHeader(student) {
    document.getElementById('detailAvatar').innerHTML = student.avatarUrl
      ? `<img src="${esc(student.avatarUrl)}" alt="">`
      : esc(initials(student.name));
    document.getElementById('detailDrawerName').textContent = student.name || '—';
    document.getElementById('detailDrawerMeta').textContent =
      `${student.mssv ? 'MSSV ' + student.mssv + ' · ' : ''}${student.className || '—'}${student.teacherName ? ' · GV ' + student.teacherName : ''}`;
  }

  function renderBody(student, history) {
    const attempts = history.attempts || [];
    const body = document.getElementById('detailDrawerBody');

    const kpiRow = `
      <div class="detail-kpi-row">
        <div class="detail-kpi"><div class="detail-kpi-value">${history.attemptsCount || 0}</div><div class="detail-kpi-label">Lượt làm bài</div></div>
        <div class="detail-kpi"><div class="detail-kpi-value">${history.avgScore !== null ? history.avgScore + '%' : '—'}</div><div class="detail-kpi-label">Điểm TB</div></div>
        <div class="detail-kpi"><div class="detail-kpi-value">${history.bestScore !== null ? history.bestScore + '%' : '—'}</div><div class="detail-kpi-label">Cao nhất</div></div>
        <div class="detail-kpi"><div class="detail-kpi-value">${history.latestScore !== null ? history.latestScore + '%' : '—'}</div><div class="detail-kpi-label">Gần nhất</div></div>
      </div>`;

    const statusBadge = `<span class="badge ${student.status === 'inactive' ? 'inactive' : 'active'}">${student.status === 'inactive' ? 'Ngừng học' : 'Đang học'}</span>`;

    const historySection = `
      <div>
        <div class="detail-section-title">📝 Lịch sử làm bài ${statusBadge}</div>
        ${attempts.length ? `
          <div class="table-scroll">
            <table class="detail-history-table">
              <thead><tr><th>Bài thi</th><th>Điểm</th><th>Đúng/Sai/Bỏ qua</th><th>Thời gian làm</th><th>Nộp lúc</th></tr></thead>
              <tbody>
                ${attempts.map((a) => `
                  <tr>
                    <td>${esc(a.testName || '—')}</td>
                    <td class="score-cell ${typeof a.score === 'number' ? (a.score >= 70 ? 'pass' : 'fail') : 'none'}">${typeof a.score === 'number' ? a.score + '%' : '—'}</td>
                    <td>${esc(a.correct ?? '—')}/${esc(a.incorrect ?? '—')}/${esc(a.skipped ?? '—')}</td>
                    <td>${fmtDuration(a.elapsedSec)}</td>
                    <td>${fmtDate(a.submittedAtMs)}</td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>` : `<div class="detail-empty-note">Học sinh này chưa nộp bài thi nào (đối chiếu theo Họ tên + Lớp — xem ghi chú ở form thêm học sinh nếu tên không khớp roster).</div>`}
      </div>`;

    const loginSection = `
      <div>
        <div class="detail-section-title">🔐 Lịch sử đăng nhập</div>
        <div class="detail-empty-note">
          Học sinh làm bài <strong>ẩn danh</strong> (không qua tài khoản đăng nhập), nên hệ thống
          hiện tại không có dữ liệu lịch sử đăng nhập cho từng em — chỉ có dữ liệu NỘP BÀI ở trên.
          Nếu về sau roster yêu cầu học sinh đăng nhập bằng tài khoản, mục này sẽ tự động có dữ liệu
          từ <code>activity_logs</code> mà không cần đổi lại giao diện.
        </div>
      </div>`;

    body.innerHTML = kpiRow + historySection + loginSection;
  }

  document.getElementById('detailDrawerCloseBtn').addEventListener('click', close);
  overlay().addEventListener('click', (e) => { if (e.target === overlay()) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && overlay().classList.contains('show')) close(); });

  global.EduCoordinatorStudentDetail = { open, close };
})(window);
