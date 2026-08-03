/* ============================================================
   js/coordinator/charts.js
   Vẽ 6 loại biểu đồ cho Coordinator Dashboard (Commit #4):
   Bar, Line, Pie, Radar (dùng Chart.js — đã có sẵn qua CDN trong
   ic3-dashboard.html/dashboard.js nên dùng lại đúng cách cũ) +
   Heatmap, Progress (tự vẽ bằng DOM/CSS, KHÔNG cần thêm plugin
   Chart.js mới, giữ đúng nguyên tắc không phình thêm phụ thuộc).

   Nạp SAU: analytics-service.js, Chart.js (CDN).
   ============================================================ */
(function (global) {
  'use strict';

  let charts = {}; // instance Chart.js hiện tại — phải destroy trước khi vẽ lại

  const PALETTE = ['#4f6bff', '#17b3a3', '#f6a723', '#ff8a3d', '#2e8cf0', '#dd4fa6', '#21b36b', '#f0483e'];

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function destroyAll() {
    Object.values(charts).forEach((c) => c && c.destroy());
    charts = {};
  }

  /** @param {Object} p { filteredResults, examHistories, filteredStudents } */
  function renderAll(p) {
    if (typeof Chart === 'undefined') return; // CDN Chart.js chưa tải xong / bị chặn mạng
    destroyAll();
    renderBar(p.filteredResults);
    renderLine(p.filteredResults);
    renderPie(p.filteredResults);
    renderRadar(p.filteredResults);
    renderHeatmap(p.filteredResults);
    renderProgress(p.filteredResults, p.examHistories, p.filteredStudents);
  }

  // ---- 1) Bar: điểm TB theo lớp ----
  function renderBar(results) {
    const byClass = global.EduAnalytics.groupAvgBy(results, 'studentClass');
    const labels = Object.keys(byClass).sort();
    charts.bar = new Chart(document.getElementById('chartBar'), {
      type: 'bar',
      data: { labels, datasets: [{ label: 'Điểm TB (%)', data: labels.map((k) => byClass[k]), backgroundColor: '#4f6bff', borderRadius: 6 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, max: 100 } },
      },
    });
  }

  // ---- 2) Line: xu hướng điểm TB theo ngày ----
  function renderLine(results) {
    const trend = global.EduAnalytics.trendByDay(results);
    charts.line = new Chart(document.getElementById('chartLine'), {
      type: 'line',
      data: {
        labels: trend.map((t) => new Date(t.date).toLocaleDateString('vi-VN')),
        datasets: [{
          label: 'Điểm TB theo ngày (%)', data: trend.map((t) => t.avg),
          borderColor: '#17b3a3', backgroundColor: 'rgba(23,179,163,.15)',
          fill: true, tension: 0.3, pointRadius: 3,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, max: 100 } },
      },
    });
  }

  // ---- 3) Pie: tỉ lệ Đạt / Chưa đạt ----
  function renderPie(results) {
    const passRate = global.EduAnalytics.passRate(results);
    const scores = results.map((r) => r.score).filter((s) => typeof s === 'number');
    const passed = scores.filter((s) => s >= 70).length;
    const failed = scores.length - passed;
    charts.pie = new Chart(document.getElementById('chartPie'), {
      type: 'pie',
      data: {
        labels: ['Đạt (≥70%)', 'Chưa đạt (<70%)'],
        datasets: [{ data: [passed, failed], backgroundColor: ['#21b36b', '#f0483e'], borderWidth: 0 }],
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } },
    });
    void passRate; // đã hiển thị ở KPI card, chart chỉ minh hoạ tỉ lệ trực quan
  }

  // ---- 4) Radar: so sánh điểm TB giữa các lớp (tối đa 8 lớp để biểu đồ còn đọc được) ----
  function renderRadar(results) {
    const byClass = global.EduAnalytics.groupAvgBy(results, 'studentClass');
    const labels = Object.keys(byClass).sort().slice(0, 8);
    charts.radar = new Chart(document.getElementById('chartRadar'), {
      type: 'radar',
      data: {
        labels,
        datasets: [{
          label: 'Điểm TB (%)', data: labels.map((k) => byClass[k] || 0),
          borderColor: '#4f6bff', backgroundColor: 'rgba(79,107,255,.2)', pointBackgroundColor: '#4f6bff',
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { r: { beginAtZero: true, max: 100, ticks: { stepSize: 25 } } },
      },
    });
  }

  // ---- 5) Heatmap: ma trận Lớp × Bài thi (tự vẽ bằng DOM, tô màu theo điểm TB) ----
  function renderHeatmap(results) {
    const el = document.getElementById('chartHeatmap');
    const { rows, cols, matrix } = global.EduAnalytics.heatmapMatrix(results, 'studentClass', 'testName');
    if (!rows.length || !cols.length) {
      el.innerHTML = '<div class="chart-empty">Chưa đủ dữ liệu để vẽ ma trận.</div>';
      return;
    }
    const colsShown = cols.slice(0, 12); // giới hạn cột để bảng không quá rộng
    let html = '<table class="heatmap-table"><thead><tr><th>Lớp \\ Bài thi</th>';
    colsShown.forEach((c) => { html += `<th title="${esc(c)}">${esc(c.length > 14 ? c.slice(0, 14) + '…' : c)}</th>`; });
    html += '</tr></thead><tbody>';
    rows.forEach((row, ri) => {
      html += `<tr><td>${esc(row)}</td>`;
      colsShown.forEach((col) => {
        const ci = cols.indexOf(col);
        const val = matrix[ri][ci];
        if (val === null || val === undefined) {
          html += '<td><span class="heatmap-cell empty">—</span></td>';
        } else {
          html += `<td><span class="heatmap-cell" style="background:${heatColor(val)}">${val}</span></td>`;
        }
      });
      html += '</tr>';
    });
    html += '</tbody></table>';
    el.innerHTML = html;
  }

  /** Đỏ (điểm thấp) → Vàng → Xanh lá (điểm cao), khớp bảng màu semantic trong theme.css. */
  function heatColor(score) {
    if (score >= 80) return '#21b36b';
    if (score >= 70) return '#5fbf6f';
    if (score >= 60) return '#f6a723';
    if (score >= 50) return '#ff8a3d';
    return '#f0483e';
  }

  // ---- 6) Progress: 2 vòng tròn tiến độ (tự vẽ bằng conic-gradient) ----
  function renderProgress(results, examHistories, students) {
    const el = document.getElementById('chartProgress');
    const passRate = global.EduAnalytics.passRate(results) ?? 0;
    const completionRate = global.EduAnalytics.completionRate(examHistories, students.length) ?? 0;
    el.innerHTML = [
      progressRing(passRate, 'Tỷ lệ đạt', '#21b36b'),
      progressRing(completionRate, 'Tỷ lệ hoàn thành', '#4f6bff'),
    ].join('');
  }

  function progressRing(percent, label, color) {
    const p = Math.max(0, Math.min(100, percent));
    return `
      <div class="progress-ring-wrap">
        <div class="progress-ring" style="background:conic-gradient(${color} ${p * 3.6}deg, var(--card2) 0deg)">
          <span class="progress-ring-value">${p}%</span>
        </div>
        <div class="progress-ring-label">${esc(label)}</div>
      </div>`;
  }

  global.EduCoordinatorCharts = { renderAll, PALETTE };
})(window);
