/* ============================================================
   js/teaching-schedule-travel.js
   Tab "🚗 Hỗ trợ xăng xe" (teaching-schedule.html) — tính tiền hỗ trợ đi
   lại cho giáo viên dạy xa trong 1 tuần cụ thể, dành cho role
   "teaching_coordinator" (🚗 Điều phối giáo viên) quản lý (admin dùng
   được luôn).

   Quy tắc tính (xem đầy đủ trong js/models/teaching-travel.model.js):
   - 11-15km/ngày: 20.000đ. ≥15,1km/ngày: 30.000đ. Dưới 11km: không hỗ trợ.
   - KHÔNG hỗ trợ cho buổi Dự Giảng/Ôn online (Dạy Trực Tuyến)/Trợ Giảng.
   - Khoảng cách nhà→trường do CON NGƯỜI tự nhập (bảng "📏 Khoảng cách nhà
     → trường"), lưu vào collection teaching_travel_distances — hệ thống
     không có toạ độ thật để tự tính.

   role === 'teacher' KHÔNG thấy tab này (ẩn qua [data-tab="travel"]) — chỉ
   admin/teaching_coordinator dùng (giống hệt js/teaching-schedule-report.js).

   Nạp SAU: js/models/teaching-schedule.model.js, js/models/teaching-travel.model.js,
   js/repositories/teaching-schedule-repository.js, js/repositories/teaching-travel-repository.js.
   ============================================================ */
(function () {
  'use strict';

  const M = window.EduModels.TeachingSchedule;
  const TM = window.EduModels.TeachingTravel;

  const state = {
    role: '',
    weeks: [],
    weekKey: '',
    scheduleRows: [],     // teaching_schedule docs của tuần đang chọn (mọi giáo viên)
    distanceByTeacher: {}, // teacherCode -> { schools: { [ten truong]: km } }
  };

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function toast(msg) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('show'), 2800);
  }

  window.addEventListener('edu:ready', ({ detail }) => {
    state.role = detail.profile.role;
    if (state.role === 'teacher') {
      // 1 giáo viên không cần xem/quản lý hỗ trợ xăng xe CẢ ĐỘI — ẩn hẳn
      // tab, không tải gì thêm.
      document.querySelectorAll('[data-tab="travel"]').forEach((b) => b.classList.add('force-hide'));
      return;
    }
    loadWeeks();
  });

  async function loadWeeks() {
    try {
      state.weeks = await window.EduRepositories.teachingWeek.listAll();
      const sel = document.getElementById('travelWeekSelect');
      if (!sel) return;
      if (!state.weeks.length) {
        sel.innerHTML = '<option value="">-- Chưa có tuần nào --</option>';
        return;
      }
      sel.innerHTML = state.weeks.map((w) => `<option value="${esc(w.id)}">${esc(w.label || w.id)}</option>`).join('');
      sel.value = state.weeks[state.weeks.length - 1].id; // mặc định tuần gần nhất
    } catch (err) {
      console.error('[Hỗ trợ xăng xe] Không tải được danh sách tuần:', err);
    }
  }

  document.getElementById('travelLoadBtn')?.addEventListener('click', loadTravel);

  async function loadTravel() {
    const weekKey = document.getElementById('travelWeekSelect').value;
    if (!weekKey) { toast('⚠️ Chọn 1 tuần trước.'); return; }
    state.weekKey = weekKey;

    const btn = document.getElementById('travelLoadBtn');
    const originalLabel = btn.textContent;
    btn.disabled = true;
    btn.textContent = '⏳ Đang tải...';
    try {
      const [rows, distanceDocs] = await Promise.all([
        window.EduRepositories.teachingSchedule.listByWeek(weekKey),
        window.EduRepositories.teachingTravelDistance.listAll().catch(() => []),
      ]);
      state.scheduleRows = rows;
      state.distanceByTeacher = {};
      distanceDocs.forEach((d) => { state.distanceByTeacher[d.id] = d; });

      const week = state.weeks.find((w) => w.id === weekKey);
      const info = document.getElementById('travelRangeInfo');
      if (info) info.textContent = `📆 ${week ? (week.label || week.id) : weekKey}`;

      renderDistanceTable();
      renderAllowanceTable();
      document.getElementById('travelEmpty').classList.add('force-hide');
      document.getElementById('travelBody').classList.remove('force-hide');
    } catch (err) {
      toast('❌ ' + (err && err.message ? err.message : String(err)));
    } finally {
      btn.disabled = false;
      btn.textContent = originalLabel;
    }
  }

  /** Danh sách trường CẦN hỗ trợ xăng xe của 1 giáo viên trong tuần đang
   * chọn (gộp từ mọi ngày, dùng TM.schoolsForDay để lọc đúng loại hình
   * được tính) — dùng để biết cần hỏi khoảng cách trường nào cho GV đó,
   * không hỏi thừa những trường chỉ dùng cho Dự Giảng/Trợ Giảng/Online. */
  function allowanceSchoolsOfTeacher(doc) {
    const seen = new Set();
    M.WEEKDAYS.forEach((d) => {
      const day = (doc.days && doc.days[String(d)]) || M.emptyDay();
      TM.schoolsForDay(day, M).forEach((s) => seen.add(s));
    });
    return Array.from(seen);
  }

  function renderDistanceTable() {
    const table = document.getElementById('travelDistanceTable');
    if (!table) return;
    const rows = [];
    state.scheduleRows.forEach((doc) => {
      const schools = allowanceSchoolsOfTeacher(doc);
      schools.forEach((school) => rows.push({ teacherCode: doc.teacherCode, teacherName: doc.teacherName || doc.teacherCode, school }));
    });
    if (!rows.length) {
      table.innerHTML = '<thead><tr><th>Giáo viên</th><th>Trường</th><th>Khoảng cách (km)</th></tr></thead>'
        + '<tbody><tr><td colspan="3" class="empty-cell">Không có buổi dạy nào cần hỗ trợ xăng xe trong tuần này.</td></tr></tbody>';
      return;
    }
    rows.sort((a, b) => a.teacherName.localeCompare(b.teacherName, 'vi') || a.school.localeCompare(b.school, 'vi'));
    const isReadOnly = state.role !== 'admin' && state.role !== 'teaching_coordinator';
    const body = rows.map((r) => {
      const km = ((state.distanceByTeacher[r.teacherCode] || {}).schools || {})[r.school] || '';
      return `<tr>
        <td class="report-pivot-name">${esc(r.teacherName)}</td>
        <td class="report-pivot-name">${esc(r.school)}</td>
        <td><input type="number" min="0" step="0.1" class="travel-km-input" data-teacher="${esc(r.teacherCode)}" data-school="${esc(r.school)}" value="${esc(km)}" placeholder="vd 12.5" ${isReadOnly ? 'readonly' : ''}></td>
      </tr>`;
    }).join('');
    table.innerHTML = `<thead><tr><th>Giáo viên</th><th>Trường</th><th>Khoảng cách (km)</th></tr></thead><tbody>${body}</tbody>`;

    if (isReadOnly) return;
    table.querySelectorAll('.travel-km-input').forEach((input) => {
      input.addEventListener('change', async () => {
        const teacherCode = input.dataset.teacher;
        const school = input.dataset.school;
        const km = Number(input.value) || 0;
        // Cập nhật NGAY trong state để bảng hỗ trợ bên dưới tính lại tức
        // thì, không cần chờ round-trip Firestore mới thấy kết quả.
        state.distanceByTeacher[teacherCode] = state.distanceByTeacher[teacherCode] || { schools: {} };
        state.distanceByTeacher[teacherCode].schools = state.distanceByTeacher[teacherCode].schools || {};
        state.distanceByTeacher[teacherCode].schools[school] = km;
        renderAllowanceTable();
        try {
          await window.EduRepositories.teachingTravelDistance.setSchoolDistance(teacherCode, school, km);
          toast(`✅ Đã lưu khoảng cách ${esc(school)}: ${km}km`);
        } catch (err) {
          toast('❌ ' + (err && err.message ? err.message : String(err)));
        }
      });
    });
  }

  function renderAllowanceTable() {
    const table = document.getElementById('travelAllowanceTable');
    if (!table) return;
    if (!state.scheduleRows.length) {
      table.innerHTML = '<thead><tr><th>Không có dữ liệu</th></tr></thead><tbody></tbody>';
      return;
    }
    const dayHead = M.WEEKDAYS.map((d) => `<th>${esc(M.WEEKDAY_LABELS[d])}</th>`).join('');
    const rows = state.scheduleRows.map((doc) => {
      const distanceMap = (state.distanceByTeacher[doc.teacherCode] || {}).schools || {};
      let weekTotal = 0;
      const dayCells = M.WEEKDAYS.map((d) => {
        const day = (doc.days && doc.days[String(d)]) || M.emptyDay();
        const { schools, km, amount, missingDistance } = TM.allowanceForDay(day, M, distanceMap);
        weekTotal += amount;
        if (!schools.length) return '<td class="travel-cell-zero">–</td>';
        const title = `${esc(schools.join(' → '))} (${km}km)${missingDistance ? ' — CHƯA đủ khoảng cách' : ''}`;
        const cls = missingDistance ? 'travel-cell-warn' : (amount > 0 ? 'travel-cell-paid' : 'travel-cell-zero');
        return `<td class="${cls}" title="${title}">${amount > 0 ? TM.formatVnd(amount) : '0đ'}${missingDistance ? ' ⚠️' : ''}</td>`;
      }).join('');
      return `<tr><td class="report-pivot-name">${esc(doc.teacherName || doc.teacherCode)}</td>${dayCells}<td class="report-pivot-total">${TM.formatVnd(weekTotal)}</td></tr>`;
    });
    table.innerHTML = `<thead><tr><th>Giáo viên</th>${dayHead}<th>Tổng tuần</th></tr></thead><tbody>${rows.join('')}</tbody>`;
  }
})();
