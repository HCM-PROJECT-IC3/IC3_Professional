/* ============================================================
   js/teaching-schedule-report.js
   Tab "📊 Báo cáo" (teaching-schedule.html) — tổng hợp Lịch tuần
   (teaching_schedule) của TOÀN ĐỘI thành biểu đồ + pivot table cho MỘT
   KHOẢNG TUẦN do người dùng chọn (khác "📊 Tổng quan" ở tab Lịch tuần,
   vốn chỉ xem đúng 1 tuần dạng lịch treo/ma trận, không tổng hợp số
   liệu) — phục vụ chính "🚗 Điều phối giáo viên" (role teaching_coordinator
   — KHÁC "coordinator" tức "🧭 Điều phối đào tạo", role đó không được vào
   trang này; CHỈ XEM trang này, không sửa gì) làm báo cáo, admin cũng
   dùng được.

   Đơn vị đếm: SỐ BUỔI (Sáng/Chiều có `type` — loại hình phụ trách), KHÔNG
   phải số tiết — vì không phải loại hình nào cũng gõ tiết cụ thể (Soạn
   bài/Cty/WFH/Khám SK/Nghỉ phép chỉ tích buổi, không có periods) nên đếm
   theo buổi là đơn vị DUY NHẤT áp dụng đúng cho MỌI loại hình, không bỏ
   sót nhóm nào khi tổng hợp (khớp đúng cách computeWeekStats() trong
   js/models/teaching-schedule.model.js đang đếm sessionsPrep/Office/Mentor).

   role === 'teacher' KHÔNG thấy tab này (ẩn qua [data-tab="report"]) — 1
   giáo viên không cần xem tổng hợp cả đội, chỉ admin/teaching_coordinator dùng.

   Dùng Chart.js (đã nạp qua js/vendor/chart.umd.min.js + fallback CDN,
   xem teaching-schedule.html) — PALETTE màu khớp ĐÚNG với màu chip loại
   hình đang dùng ở tab "📅 Lịch tuần" (xem TYPE_COLOR_SUFFIX trong
   js/teaching-schedule.js + .dash-chip.* trong css/teaching-schedule.css)
   để cùng 1 loại hình luôn ra cùng 1 màu ở MỌI nơi trong trang.

   Nạp SAU: js/models/teaching-schedule.model.js,
   js/repositories/teaching-schedule-repository.js, Chart.js.
   ============================================================ */
(function () {
  'use strict';

  const M = window.EduModels.TeachingSchedule;

  // Khớp đúng theme.css (bản sáng) + TYPE_COLOR_SUFFIX trong
  // js/teaching-schedule.js — không đọc CSS variable động vì canvas vẽ
  // màu tĩnh, giữ 1 bảng màu cố định là đủ (giống cách js/coordinator/
  // charts.js đã làm với PALETTE riêng của trang đó).
  const TYPE_COLORS = {
    'Dạy chính': '#17b3a3', 'Dạy Trám': '#2e8cf0', 'Dạy Trực Tuyến': '#21b36b',
    'Ôn Thi': '#4f6bff', 'Trợ Giảng': '#dd4fa6', 'Dự Giảng': '#ff8a3d',
    'Soạn bài': '#8892c8', 'Làm việc tại cty': '#f0483e', 'WFH': '#f6a723',
    'Khám SK': '#c0392b', 'Nghỉ phép/ lễ': '#2b2f45',
  };

  const state = { role: '', weeks: [] };
  let charts = {}; // instance Chart.js hiện tại — phải destroy trước khi vẽ lại

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
  function chartJsReady() { return typeof Chart !== 'undefined'; }

  window.addEventListener('edu:ready', ({ detail }) => {
    state.role = detail.profile.role;
    if (state.role === 'teacher') {
      // 1 giáo viên không cần biểu đồ/pivot tổng hợp CẢ ĐỘI — ẩn hẳn tab,
      // không tải gì thêm (đỡ tốn 1 lượt gọi teachingWeek.listAll() vô ích).
      document.querySelectorAll('[data-tab="report"]').forEach((b) => b.classList.add('force-hide'));
      return;
    }
    loadWeeks();
  });

  async function loadWeeks() {
    try {
      state.weeks = await window.EduRepositories.teachingWeek.listAll();
      renderWeekSelects();
    } catch (err) {
      console.error('[Báo cáo] Không tải được danh sách tuần:', err);
    }
  }

  function renderWeekSelects() {
    const fromSel = document.getElementById('reportFromWeek');
    const toSel = document.getElementById('reportToWeek');
    if (!fromSel || !toSel) return;
    if (!state.weeks.length) {
      fromSel.innerHTML = '<option value="">-- Chưa có tuần nào --</option>';
      toSel.innerHTML = fromSel.innerHTML;
      return;
    }
    const opts = state.weeks.map((w) => `<option value="${esc(w.id)}">${esc(w.label || w.id)}</option>`).join('');
    fromSel.innerHTML = opts;
    toSel.innerHTML = opts;
    // Mặc định CẢ 2 đầu = tuần gần nhất (đúng use case thường gặp nhất:
    // "báo cáo tuần này") — người dùng tự nới rộng "Từ tuần" nếu cần gộp
    // nhiều tuần để xem xu hướng.
    const latest = state.weeks[state.weeks.length - 1].id;
    fromSel.value = latest;
    toSel.value = latest;
  }

  document.getElementById('reportLoadBtn')?.addEventListener('click', loadReport);

  async function loadReport() {
    const fromKey = document.getElementById('reportFromWeek').value;
    const toKey = document.getElementById('reportToWeek').value;
    if (!fromKey || !toKey) { toast('⚠️ Chọn đủ Từ tuần/Đến tuần trước.'); return; }
    // weekKey dạng "YYYY-MM-DD" nên so sánh CHUỖI == so sánh ngày, không
    // cần parse Date — cho phép chọn ngược (Đến tuần < Từ tuần) mà vẫn ra
    // đúng khoảng, đỡ bắt người dùng phải nhớ thứ tự.
    const [lo, hi] = fromKey <= toKey ? [fromKey, toKey] : [toKey, fromKey];
    const weeksInRange = state.weeks.filter((w) => w.id >= lo && w.id <= hi);
    if (!weeksInRange.length) { toast('⚠️ Không có tuần nào trong khoảng đã chọn.'); return; }

    const btn = document.getElementById('reportLoadBtn');
    const originalLabel = btn.textContent;
    btn.disabled = true;
    btn.textContent = '⏳ Đang tải...';
    try {
      // 1 lượt listByWeek()/tuần (đã có sẵn cho "📊 Tổng quan") — Promise.all
      // song song, số tuần chọn thường nhỏ (vài tuần đến vài chục), không
      // cần phân trang/giới hạn thêm.
      const perWeekRows = await Promise.all(
        weeksInRange.map((w) => window.EduRepositories.teachingSchedule.listByWeek(w.id).catch(() => [])),
      );
      renderReport(weeksInRange, perWeekRows);
      document.getElementById('reportEmpty').classList.add('force-hide');
      document.getElementById('reportBody').classList.remove('force-hide');
    } catch (err) {
      toast('❌ ' + (err && err.message ? err.message : String(err)));
    } finally {
      btn.disabled = false;
      btn.textContent = originalLabel;
    }
  }

  /** Đếm tổng SỐ BUỔI (Sáng/Chiều có `type`) theo loại hình + theo giáo
   * viên, từ 1 mảng doc teaching_schedule (có thể gộp nhiều tuần — SAME
   * teacherCode ở nhiều doc khác nhau vẫn CỘNG DỒN đúng vào 1 hàng nhờ
   * gộp theo `code`, không tách theo tuần). */
  function aggregateRows(rows) {
    const byType = {};
    const byTeacher = {}; // code -> { code, name, total, byType:{} }
    rows.forEach((doc) => {
      const code = doc.teacherCode;
      if (!code) return;
      if (!byTeacher[code]) byTeacher[code] = { code, name: doc.teacherName || code, total: 0, byType: {} };
      const tRow = byTeacher[code];
      M.WEEKDAYS.forEach((d) => {
        const day = (doc.days && doc.days[String(d)]) || M.emptyDay();
        M.SESSIONS.forEach((s) => {
          const type = day[s] && day[s].type;
          if (!type) return;
          byType[type] = (byType[type] || 0) + 1;
          tRow.byType[type] = (tRow.byType[type] || 0) + 1;
          tRow.total += 1;
        });
      });
    });
    return { byType, byTeacher };
  }

  function destroyCharts() {
    Object.values(charts).forEach((c) => c && c.destroy());
    charts = {};
  }

  function renderReport(weeksInRange, perWeekRows) {
    destroyCharts();
    const allRows = perWeekRows.flat();
    const { byType, byTeacher } = aggregateRows(allRows);
    const teacherList = Object.values(byTeacher).sort((a, b) => b.total - a.total);

    const first = weeksInRange[0], last = weeksInRange[weeksInRange.length - 1];
    const rangeLabel = weeksInRange.length === 1
      ? (first.label || first.id)
      : `${first.label || first.id} → ${last.label || last.id} (${weeksInRange.length} tuần)`;
    const totalBuoi = Object.values(byType).reduce((a, b) => a + b, 0);
    const info = document.getElementById('reportRangeInfo');
    if (info) info.textContent = `📆 ${rangeLabel} · 👤 ${teacherList.length} giáo viên có lịch · 🔢 ${totalBuoi} buổi ghi nhận`;

    renderTypeChart(byType);
    renderTeacherChart(teacherList);
    renderTrendChart(weeksInRange, perWeekRows);
    renderPivotTable(teacherList, byType);
  }

  // ---- 1) Bar: tổng số buổi theo loại hình phụ trách ----
  function renderTypeChart(byType) {
    const canvas = document.getElementById('reportChartByType');
    if (!canvas) return;
    if (!chartJsReady()) { showLibUnavailable(canvas); return; }
    hideLibUnavailable(canvas);
    const labels = M.TASK_TYPES.filter((t) => byType[t] > 0);
    if (!labels.length) { showEmpty(canvas, 'Chưa có dữ liệu trong khoảng tuần này.'); return; }
    charts.byType = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{ label: 'Số buổi', data: labels.map((t) => byType[t]), backgroundColor: labels.map((t) => TYPE_COLORS[t] || '#8892c8'), borderRadius: 6 }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
      },
    });
  }

  // ---- 2) Bar ngang: số buổi theo giáo viên (Top 15, nhiều nhất trước) ----
  function renderTeacherChart(teacherList) {
    const canvas = document.getElementById('reportChartByTeacher');
    if (!canvas) return;
    if (!chartJsReady()) { showLibUnavailable(canvas); return; }
    hideLibUnavailable(canvas);
    if (!teacherList.length) { showEmpty(canvas, 'Chưa có dữ liệu trong khoảng tuần này.'); return; }
    const top = teacherList.slice(0, 15);
    charts.byTeacher = new Chart(canvas, {
      type: 'bar',
      data: { labels: top.map((t) => t.name), datasets: [{ label: 'Số buổi', data: top.map((t) => t.total), backgroundColor: '#4f6bff', borderRadius: 6 }] },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { x: { beginAtZero: true, ticks: { precision: 0 } } },
      },
    });
  }

  // ---- 3) Line: xu hướng tổng số buổi theo TỪNG tuần trong khoảng đã
  // chọn — CHỈ có ý nghĩa khi chọn từ 2 tuần trở lên, 1 tuần thì ẩn hẳn
  // card này (1 điểm dữ liệu không phải "xu hướng"). ----
  function renderTrendChart(weeksInRange, perWeekRows) {
    const card = document.getElementById('reportTrendCard');
    const canvas = document.getElementById('reportChartTrend');
    if (!card) return;
    if (weeksInRange.length < 2) { card.classList.add('force-hide'); return; }
    card.classList.remove('force-hide');
    if (!canvas) return;
    if (!chartJsReady()) { showLibUnavailable(canvas); return; }
    hideLibUnavailable(canvas);
    const totals = perWeekRows.map((rows) => {
      const { byType } = aggregateRows(rows);
      return Object.values(byType).reduce((a, b) => a + b, 0);
    });
    charts.trend = new Chart(canvas, {
      type: 'line',
      data: {
        labels: weeksInRange.map((w) => w.label || w.id),
        datasets: [{ label: 'Tổng số buổi', data: totals, borderColor: '#4f6bff', backgroundColor: 'rgba(79,107,255,.15)', fill: true, tension: .25, pointRadius: 4 }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
      },
    });
  }

  // ---- 4) Pivot table: hàng = giáo viên (sắp theo tổng giảm dần), cột =
  // loại hình phụ trách (CHỈ những loại thật sự xuất hiện, khỏi kéo dài
  // vô ích), cột/hàng cuối = Tổng — đúng nghĩa "pivot" cross-tab. ----
  function renderPivotTable(teacherList, byType) {
    const table = document.getElementById('reportPivotTable');
    if (!table) return;
    const typesUsed = M.TASK_TYPES.filter((t) => byType[t] > 0);
    if (!teacherList.length || !typesUsed.length) {
      table.innerHTML = '<thead><tr><th>Không có dữ liệu</th></tr></thead><tbody></tbody>';
      return;
    }
    const head = `<thead><tr><th>Giáo viên</th>${typesUsed.map((t) => `<th>${esc(t)}</th>`).join('')}<th>Tổng</th></tr></thead>`;
    const bodyRows = teacherList.map((t) => {
      const cells = typesUsed.map((type) => `<td>${t.byType[type] || 0}</td>`).join('');
      return `<tr><td class="report-pivot-name">${esc(t.name)}</td>${cells}<td class="report-pivot-total">${t.total}</td></tr>`;
    }).join('');
    const grandTotal = Object.values(byType).reduce((a, b) => a + b, 0);
    const totalsRow = `<tr class="report-pivot-footer"><td>Tổng cộng</td>`
      + `${typesUsed.map((type) => `<td>${byType[type]}</td>`).join('')}<td>${grandTotal}</td></tr>`;
    table.innerHTML = `${head}<tbody>${bodyRows}${totalsRow}</tbody>`;
  }

  /** Thông báo lỗi thân thiện thay canvas trắng khi Chart.js không tải
   * được (mạng chặn CDN, adblock...) — cùng cơ chế js/coordinator/charts.js
   * đã dùng cho tab Báo cáo kết quả. */
  function showLibUnavailable(canvas) {
    if (!canvas || !canvas.parentElement) return;
    canvas.style.display = 'none';
    let msg = canvas.parentElement.querySelector('.chart-lib-error');
    if (!msg) {
      msg = document.createElement('div');
      msg.className = 'chart-lib-error chart-empty';
      msg.textContent = '⚠️ Không tải được thư viện biểu đồ (Chart.js). Kiểm tra kết nối mạng rồi thử lại.';
      canvas.parentElement.appendChild(msg);
    }
    msg.style.display = 'flex';
  }
  function hideLibUnavailable(canvas) {
    if (!canvas || !canvas.parentElement) return;
    canvas.style.display = '';
    const msg = canvas.parentElement.querySelector('.chart-lib-error');
    if (msg) msg.style.display = 'none';
  }
  function showEmpty(canvas, text) {
    if (!canvas || !canvas.parentElement) return;
    canvas.style.display = 'none';
    let msg = canvas.parentElement.querySelector('.chart-empty-note');
    if (!msg) {
      msg = document.createElement('div');
      msg.className = 'chart-empty-note chart-empty';
      canvas.parentElement.appendChild(msg);
    }
    msg.textContent = text;
    msg.style.display = 'flex';
  }
})();
