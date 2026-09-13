/* ============================================================
   js/charts-3d.js
   Bộ plugin Chart.js DÙNG CHUNG để các biểu đồ (bar/doughnut/pie/line)
   có chiều sâu giả-3D + trông "doanh nghiệp lớn" hơn — người dùng phản
   hồi giao diện báo cáo hiện tại quá phẳng/đơn giản so với báo cáo
   thật hay mang đi trình bày.

   Chart.js (đã dùng sẵn trong project, js/vendor/chart.umd.min.js) là
   thư viện 2D THUẦN, không có chế độ 3D thật (khác Highcharts 3D hay
   ECharts-GL) — KHÔNG đổi thư viện (tốn thêm phụ thuộc, rủi ro vỡ các
   biểu đồ đang chạy tốt), mà tự vẽ thêm bằng canvas (Chart.js plugin
   API: `id` + hook `afterDatasetsDraw`/`beforeDraw`) để MÔ PHỎNG chiều
   sâu:
     - Bar: vẽ thêm mặt bên (phải) + mặt trên (nắp) mỗi cột, tô đậm/nhạt
       hơn màu gốc → nhìn như khối hộp chữ nhật 3D thay vì hình chữ
       nhật phẳng (kiểu biểu đồ cột 3D quen thuộc trong Excel/PowerBI).
     - Doughnut/Pie: vẽ thêm 1 lớp "đáy" lệch xuống dưới + tô đậm hơn
       trước khi Chart.js vẽ lớp thật lên trên → nhìn như hình trụ có
       độ dày thay vì đĩa phẳng.
     - Line: filter gradient dọc (đậm ở đáy nhạt dần lên đỉnh vùng tô)
       + đổ bóng nhẹ dưới đường viền — tạo cảm giác "nổi khối" nhẹ mà
       không cần vẽ mặt 3D thật (đường line 3D thật sẽ rối, khó đọc).

   Nạp file này SAU Chart.js, TRƯỚC bất kỳ file nào gọi
   window.EduCharts3D.* khi cấu hình chart (js/dashboard.js,
   js/coordinator/charts.js).
   ============================================================ */
(function (global) {
  'use strict';

  const DEPTH = 10; // px lệch cho hiệu ứng mặt bên/nắp — vừa đủ rõ, không quá dày

  /** #RRGGBB → {r,g,b}. Bỏ qua chuỗi không hợp lệ (trả về xám trung tính an toàn). */
  function hexToRgb(hex) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
    return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : { r: 150, g: 150, b: 150 };
  }
  function shade(hex, percent) {
    // percent âm = tối hơn, dương = sáng hơn (giữ nguyên logic đơn giản, đủ dùng cho hiệu ứng khối 3D)
    const { r, g, b } = hexToRgb(hex);
    const f = (c) => Math.max(0, Math.min(255, Math.round(c + (percent < 0 ? c : 255 - c) * percent)));
    return `rgb(${f(r)}, ${f(g)}, ${f(b)})`;
  }

  /** Tạo linear gradient dọc (đậm ở đáy, nhạt dần lên đỉnh) cho cột/vùng tô line. */
  function verticalGradient(ctx, chartArea, colorTop, colorBottom) {
    if (!chartArea) return colorBottom; // canvas chưa layout xong lần đầu
    const g = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
    g.addColorStop(0, colorTop);
    g.addColorStop(1, colorBottom);
    return g;
  }

  // ---- Plugin: cột 3D (mặt bên + nắp trên) ----
  const bar3dPlugin = {
    id: 'edu3dBar',
    afterDatasetsDraw(chart) {
      const { ctx } = chart;
      chart.data.datasets.forEach((dataset, di) => {
        if (chart.getDatasetMeta(di).type !== 'bar') return;
        const meta = chart.getDatasetMeta(di);
        const baseColor = Array.isArray(dataset.backgroundColor) ? null : dataset.backgroundColor;
        meta.data.forEach((bar, i) => {
          const color = Array.isArray(dataset.backgroundColor) ? dataset.backgroundColor[i] : baseColor;
          if (!color || typeof color !== 'string' || color[0] !== '#') return; // gradient/rgba tuỳ chỉnh thì bỏ qua, không vỡ hình
          const { x, y, base, width } = bar.getProps(['x', 'y', 'base', 'width'], true);
          const halfW = width / 2;
          const left = x - halfW, right = x + halfW, top = y, bottom = base;
          if (bottom - top < 1) return; // cột 0 hoặc gần 0 — không vẽ khối rỗng

          ctx.save();
          // Mặt bên (phải) — hình bình hành nối cạnh phải mặt trước sang mặt sau lệch DEPTH.
          ctx.fillStyle = shade(color, -0.28);
          ctx.beginPath();
          ctx.moveTo(right, top);
          ctx.lineTo(right + DEPTH, top - DEPTH);
          ctx.lineTo(right + DEPTH, bottom - DEPTH);
          ctx.lineTo(right, bottom);
          ctx.closePath();
          ctx.fill();

          // Mặt trên (nắp) — hình bình hành nối cạnh trên mặt trước sang mặt sau.
          ctx.fillStyle = shade(color, 0.22);
          ctx.beginPath();
          ctx.moveTo(left, top);
          ctx.lineTo(left + DEPTH, top - DEPTH);
          ctx.lineTo(right + DEPTH, top - DEPTH);
          ctx.lineTo(right, top);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        });
      });
    },
  };

  // ---- Plugin: doughnut/pie 3D (đáy dày hơn, đổ bóng) ----
  const pie3dPlugin = {
    id: 'edu3dPie',
    beforeDatasetsDraw(chart) {
      const meta0 = chart.getDatasetMeta(0);
      if (!meta0 || (chart.config.type !== 'doughnut' && chart.config.type !== 'pie')) return;
      const { ctx } = chart;
      const RIM = 8; // độ dày "đáy trụ" giả lập
      ctx.save();
      ctx.translate(0, RIM);
      meta0.data.forEach((arc, i) => {
        const bg = chart.data.datasets[0].backgroundColor;
        const color = Array.isArray(bg) ? bg[i] : bg;
        if (!color || typeof color !== 'string' || color[0] !== '#') return;
        ctx.beginPath();
        ctx.fillStyle = shade(color, -0.35);
        const props = arc.getProps(['x', 'y', 'startAngle', 'endAngle', 'innerRadius', 'outerRadius'], true);
        ctx.arc(props.x, props.y, props.outerRadius, props.startAngle, props.endAngle);
        ctx.arc(props.x, props.y, props.innerRadius, props.endAngle, props.startAngle, true);
        ctx.closePath();
        ctx.fill();
      });
      ctx.restore();
    },
  };

  // ---- Plugin: đổ bóng mềm dưới đường Line (nổi khối nhẹ) ----
  const lineShadowPlugin = {
    id: 'edu3dLineShadow',
    beforeDatasetDraw(chart, args) {
      if (chart.config.type !== 'line') return;
      const { ctx } = chart;
      ctx.save();
      ctx.shadowColor = 'rgba(23,179,163,.35)';
      ctx.shadowBlur = 10;
      ctx.shadowOffsetY = 4;
    },
    afterDatasetDraw(chart) {
      if (chart.config.type !== 'line') return;
      chart.ctx.restore();
    },
  };

  if (global.Chart) {
    global.Chart.register(bar3dPlugin, pie3dPlugin, lineShadowPlugin);
  }

  global.EduCharts3D = { shade, verticalGradient, DEPTH };
})(window);
