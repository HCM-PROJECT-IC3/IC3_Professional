/* ============================================================
   js/coordinator/charts.js
   Vẽ 6 biểu đồ cho Coordinator Dashboard (11/2026: thay Pie/Radar trùng ý bằng Phân bố điểm + % đã làm theo lớp;
   cột ngang xếp lớp yếu trước; xu hướng theo tuần, không làm mượt; màu theo theme sáng/tối):
   Điểm TB lớp, Xu hướng, Phân bố điểm, Tham gia theo lớp (dùng Chart.js — đã có sẵn qua CDN trong
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

  /** Hiện thông báo lỗi thân thiện thay cho canvas trắng khi Chart.js không tải được
   *  (bị chặn mạng, tracking prevention, adblock, CDN sập...). Không throw, không im lặng. */
  function showLibUnavailable(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !canvas.parentElement) return;
    canvas.style.display = 'none';
    let msg = canvas.parentElement.querySelector('.chart-lib-error');
    if (!msg) {
      msg = document.createElement('div');
      msg.className = 'chart-lib-error chart-empty';
      msg.innerHTML = 'Không tải được thư viện biểu đồ (Chart.js).<br>Kiểm tra kết nối mạng, trình chặn quảng cáo, hoặc thử "<i class="fa-solid fa-rotate" aria-hidden="true"></i> Làm mới dữ liệu".';
      canvas.parentElement.appendChild(msg);
    }
    msg.style.display = 'flex';
  }

  function hideLibUnavailable(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !canvas.parentElement) return;
    canvas.style.display = '';
    const msg = canvas.parentElement.querySelector('.chart-lib-error');
    if (msg) msg.style.display = 'none';
  }

  // Màu theo theme (sáng/tối) — đọc biến CSS lúc vẽ để chữ, lưới, cột đủ tương phản ở cả 2 chế độ.
  function theme() {
    const cs = getComputedStyle(document.documentElement), v = (n, d) => (cs.getPropertyValue(n) || '').trim() || d;
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    return {
      text: v('--text', '#1a1f36'), muted: v('--muted', '#5f6b8a'), grid: v('--border', '#e3e7f2'),
      bar: v('--purple-ink', '#2f40b2'), warn: dark ? '#ff8a70' : '#c2410c', ok: dark ? '#4cc47a' : '#1d7a44',
      mid: dark ? '#f2b632' : '#b7791f', bad: dark ? '#ff7a6e' : '#c62f25', soft: dark ? '#7f8fd9' : '#7c8bd6',
    };
  }
  function baseOptions(t, extra) {
    return Object.assign({
      responsive: true, maintainAspectRatio: false, animation: false,
      plugins: { legend: { display: false }, tooltip: { displayColors: false } },
    }, extra);
  }
  const axis = (t, o) => Object.assign({ grid: { color: t.grid }, border: { color: t.grid }, ticks: { color: t.muted, font: { size: 11 } } }, o);
  /** Vạch dọc/ngang ở mốc giá trị (vd ngưỡng đạt 70%) — plugin tự viết, khỏi thêm chartjs-plugin-annotation. */
  const markLine = (value, color, horizontal) => ({
    id: 'markLine', afterDatasetsDraw(chart) {
      const sc = horizontal ? chart.scales.x : chart.scales.y, area = chart.chartArea, ctx = chart.ctx;
      if (!sc) return;
      const px = sc.getPixelForValue(value);
      ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]); ctx.beginPath();
      if (horizontal) { ctx.moveTo(px, area.top); ctx.lineTo(px, area.bottom); } else { ctx.moveTo(area.left, px); ctx.lineTo(area.right, px); }
      ctx.stroke(); ctx.restore();
    },
  });
  /** Biểu đồ cột ngang: khung cao theo số lớp (không ép 15 lớp vào 240px), tối đa 420px. */
  function sizeFor(canvasId, rows) {
    const body = document.getElementById(canvasId).parentElement;
    body.style.height = Math.max(200, Math.min(420, 40 + rows * 24)) + 'px';
  }
  function emptyMsg(canvasId, text) {
    const canvas = document.getElementById(canvasId);
    canvas.style.display = 'none';
    let m = canvas.parentElement.querySelector('.chart-nodata');
    if (!m) { m = document.createElement('div'); m.className = 'chart-empty chart-nodata'; canvas.parentElement.appendChild(m); }
    m.textContent = text; m.style.display = '';
  }
  function clearEmpty(canvasId) {
    const canvas = document.getElementById(canvasId);
    canvas.style.display = '';
    const m = canvas.parentElement.querySelector('.chart-nodata');
    if (m) m.style.display = 'none';
  }

  let last = null;
  /** @param {Object} p { filteredResults, examHistories, filteredStudents } */
  function renderAll(p) {
    last = p;
    destroyAll();

    // 4 biểu đồ cần Chart.js. CDN bị chặn thì Heatmap & Progress (DOM/CSS) vẫn vẽ; mỗi chart bọc try/catch riêng để
    // 1 chart lỗi (dữ liệu bất thường) không kéo sập các chart còn lại.
    const chartJsReady = typeof Chart !== 'undefined';
    const stats = global.EduAnalytics.classStats(p.filteredResults, p.filteredStudents || []);
    [
      ['chartBar', () => renderBar(stats)],
      ['chartLine', () => renderLine(p.filteredResults)],
      ['chartPie', () => renderBands(p.filteredResults)],
      ['chartRadar', () => renderParticipation(stats)],
    ].forEach(([canvasId, fn]) => {
      if (!chartJsReady) { showLibUnavailable(canvasId); return; }
      hideLibUnavailable(canvasId);
      clearEmpty(canvasId);
      try { fn(); } catch (err) {
        console.error(`[EduCoordinatorCharts] Lỗi khi vẽ #${canvasId}:`, err);
        showLibUnavailable(canvasId);
      }
    });

    try { renderHeatmap(p.filteredResults); } catch (err) { console.error('[EduCoordinatorCharts] Lỗi khi vẽ heatmap:', err); }
    try { renderProgress(p.filteredResults, p.examHistories, p.filteredStudents); } catch (err) { console.error('[EduCoordinatorCharts] Lỗi khi vẽ progress:', err); }
  }
  // Đổi sáng/tối → vẽ lại bằng dữ liệu đang có (không tải lại gì)
  new MutationObserver(() => { if (last) renderAll(last); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  // ---- 1) Điểm TB theo lớp: cột ngang, lớp yếu nhất trước, lớp dưới 70% tô màu cảnh báo, vạch đạt 70% ----
  function renderBar(stats) {
    const t = theme();
    const rows = stats.filter((c) => c.avg !== null).sort((a, b) => a.avg - b.avg);
    if (!rows.length) { emptyMsg('chartBar', 'Chưa có bài nộp trong phạm vi đang lọc.'); return; }
    sizeFor('chartBar', rows.length);
    charts.bar = new Chart(document.getElementById('chartBar'), {
      type: 'bar',
      data: { labels: rows.map((c) => c.cls), datasets: [{ data: rows.map((c) => c.avg), backgroundColor: rows.map((c) => (c.avg < 70 ? t.warn : t.bar)), borderRadius: 3, barPercentage: .8, categoryPercentage: .85 }] },
      options: baseOptions(t, {
        indexAxis: 'y',
        plugins: { legend: { display: false }, tooltip: { displayColors: false, callbacks: { label: (c) => `${c.parsed.x}% · ${rows[c.dataIndex].count} bài nộp` } } },
        scales: { x: axis(t, { min: 0, max: 100, ticks: { color: t.muted, stepSize: 25, callback: (v) => v + '%' } }), y: axis(t, { grid: { display: false }, ticks: { color: t.text, font: { size: 11, weight: '600' } } }) },
      }),
      plugins: [markLine(70, t.muted, true)],
    });
  }

  // ---- 2) Điểm TB theo tuần (hoặc theo ngày khi dữ liệu < 3 tuần): đường thẳng, không làm mượt, có số bài ----
  function renderLine(results) {
    const t = theme();
    const ms = results.map((r) => r.submittedAtMs).filter(Boolean);
    const spanDays = ms.length ? (Math.max(...ms) - Math.min(...ms)) / 864e5 : 0;
    const byWeek = spanDays >= 21;
    const title = document.getElementById('lineTitle');
    if (title) title.textContent = byWeek ? 'Điểm TB theo tuần' : 'Điểm TB theo ngày';
    const pts = byWeek
      ? global.EduAnalytics.trendByWeek(results).map((x) => { const d = new Date(x.weekMs); return { label: `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`, avg: x.avg, count: x.count, week: true }; })
      : global.EduAnalytics.trendByDay(results).map((x) => ({ label: x.date.slice(8, 10) + '/' + x.date.slice(5, 7), avg: x.avg, count: x.count }));
    if (!pts.length) { emptyMsg('chartLine', 'Chưa có bài nộp trong khoảng thời gian này.'); return; }
    charts.line = new Chart(document.getElementById('chartLine'), {
      type: 'line',
      data: { labels: pts.map((x) => x.label), datasets: [{ data: pts.map((x) => x.avg), borderColor: t.bar, backgroundColor: t.bar, borderWidth: 2, tension: 0, fill: false, pointRadius: 3, pointHoverRadius: 5 }] },
      options: baseOptions(t, {
        plugins: { legend: { display: false }, tooltip: { displayColors: false, callbacks: { title: (c) => (pts[c[0].dataIndex].week ? 'Tuần từ ' : 'Ngày ') + pts[c[0].dataIndex].label, label: (c) => `${c.parsed.y}% · ${pts[c.dataIndex].count} bài` } } },
        scales: { y: axis(t, { min: 0, max: 100, ticks: { color: t.muted, stepSize: 25, callback: (v) => v + '%' } }), x: axis(t, { grid: { display: false }, ticks: { color: t.muted, maxRotation: 0, autoSkip: true, font: { size: 11 } } }) },
      }),
      plugins: [markLine(70, t.muted, false)],
    });
  }

  // ---- 3) Phân bố điểm 4 mức (thay Pie Đạt/Chưa đạt — trùng ô KPI "Tỷ lệ đạt") ----
  function renderBands(results) {
    const t = theme();
    const bands = global.EduAnalytics.scoreBands(results), total = bands.reduce((a, b) => a + b.count, 0);
    const note = document.getElementById('bandsNote');
    if (note) note.textContent = total ? `${total} bài · đạt (≥70%) ${Math.round(((bands[2].count + bands[3].count) / total) * 100)}%` : '';
    if (!total) { emptyMsg('chartPie', 'Chưa có bài nộp trong phạm vi đang lọc.'); return; }
    charts.pie = new Chart(document.getElementById('chartPie'), {
      type: 'bar',
      data: { labels: bands.map((b) => b.label), datasets: [{ data: bands.map((b) => b.count), backgroundColor: [t.bad, t.mid, t.soft, t.ok], borderRadius: 3, barPercentage: .7 }] },
      options: baseOptions(t, {
        plugins: { legend: { display: false }, tooltip: { displayColors: false, callbacks: { label: (c) => `${c.parsed.y} bài (${Math.round((c.parsed.y / total) * 100)}%)` } } },
        scales: { y: axis(t, { beginAtZero: true, ticks: { color: t.muted, precision: 0 } }), x: axis(t, { grid: { display: false }, ticks: { color: t.text, font: { size: 11, weight: '600' } } }) },
      }),
    });
  }

  // ---- 4) % học sinh đã làm ≥ 1 bài theo lớp (thay Radar — trùng biểu đồ 1, khó đọc). Lớp ít nhất trước. ----
  function renderParticipation(stats) {
    const t = theme();
    const rows = stats.filter((c) => c.roster > 0).sort((a, b) => a.participation - b.participation || b.roster - a.roster);
    if (!rows.length) { emptyMsg('chartRadar', 'Chưa có danh sách học sinh của các lớp trong phạm vi này.'); return; }
    sizeFor('chartRadar', rows.length);
    charts.radar = new Chart(document.getElementById('chartRadar'), {
      type: 'bar',
      data: { labels: rows.map((c) => c.cls), datasets: [{ data: rows.map((c) => c.participation), backgroundColor: rows.map((c) => (c.participation < 50 ? t.warn : t.bar)), borderRadius: 3, barPercentage: .8, categoryPercentage: .85 }] },
      options: baseOptions(t, {
        indexAxis: 'y',
        plugins: { legend: { display: false }, tooltip: { displayColors: false, callbacks: { label: (c) => `${c.parsed.x}% · ${rows[c.dataIndex].submitted}/${rows[c.dataIndex].roster} học sinh đã làm` } } },
        scales: { x: axis(t, { min: 0, max: 100, ticks: { color: t.muted, stepSize: 25, callback: (v) => v + '%' } }), y: axis(t, { grid: { display: false }, ticks: { color: t.text, font: { size: 11, weight: '600' } } }) },
      }),
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
          html += `<td class="hm ${heatClass(val)}" title="${esc(row)} · ${esc(col)}: ${val}%">${val}</td>`;
        }
      });
      html += '</tr>';
    });
    html += '</tbody></table>';
    el.innerHTML = html;
  }

  /** 11/2026: tô CẢ Ô nền nhạt + chữ đậm cùng sắc (đọc rõ cả sáng/tối) thay chip nhỏ chữ trắng trên nền vàng/xanh nhạt. */
  function heatClass(score) {
    if (score >= 85) return 'hm-4';
    if (score >= 70) return 'hm-3';
    if (score >= 50) return 'hm-2';
    return 'hm-1';
  }
  /** (giữ cho nơi khác có thể dùng) Đỏ (điểm thấp) → Vàng → Xanh lá (điểm cao). */
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
      progressRing(passRate, 'Tỷ lệ đạt', theme().ok),
      progressRing(completionRate, 'Tỷ lệ hoàn thành', theme().bar),
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
