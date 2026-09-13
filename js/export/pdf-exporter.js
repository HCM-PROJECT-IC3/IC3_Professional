/* ============================================================
   js/export/pdf-exporter.js
   Engine xuất PDF (Commit #7) cho bảng "Danh sách học sinh" ở
   Coordinator Dashboard & Teacher Dashboard.

   Dùng jsPDF (js/vendor/jspdf.umd.min.js) + jsPDF-AutoTable
   (js/vendor/jspdf.plugin.autotable.min.js, bản v4 — gọi qua hàm
   toàn cục autoTable(doc, opts), KHÔNG phải doc.autoTable(opts)
   như bản v3 cũ).

   Logo: dùng chung window.EduIigLogo (ảnh logo IIG thật, xem
   js/export/iig-logo.js) — GIỐNG hệt logo dùng ở "📋 Phiếu công tác"
   (js/export/teaching-schedule-cong-tac-pdf.js), không còn vẽ huy hiệu
   vector "IC3" tự chế như bản trước.

   Biểu đồ: lấy trực tiếp từ 4 canvas Chart.js đã vẽ sẵn trên trang
   (#chartBar/#chartLine/#chartPie/#chartRadar, xem js/coordinator/
   charts.js) bằng canvas.toDataURL('image/png') — không cần vẽ lại,
   không cần thêm thư viện chụp màn hình (html2canvas).

   KHÔNG còn footer ở cuối mỗi trang, và KHÔNG còn dòng phụ đề nhỏ
   (scopeLabel, vd "Dashboard Điều phối đào tạo — EduQuiz ·
   dieuphoidaotao · Điều phối đào tạo") dưới tiêu đề — người dùng phản
   hồi bỏ hẳn 2 phần này (xem drawHeader()/exportReport() bên dưới —
   drawFooterAllPages() và tham số opts.scopeLabel không còn được dùng
   để vẽ gì cả nữa, chỉ còn scopeLabel dùng để LỌC dữ liệu ở nơi khác).

   Nạp SAU: js/vendor/jspdf.umd.min.js, js/vendor/jspdf.plugin.autotable.min.js,
            js/export/iig-logo.js, analytics-service.js.
   ============================================================ */
(function (global) {
  'use strict';

  const BRAND = [79, 107, 255]; // #4f6bff
  const GRAY = [110, 110, 120];
  const PAGE_MARGIN = 40;

  function nowLabel() {
    return new Date().toLocaleString('vi-VN');
  }

  // Logo IIG thật (window.EduIigLogo, xem js/export/iig-logo.js) — GIỐNG
  // hệt logo dùng ở "📋 Phiếu công tác", thay cho huy hiệu vector "IC3"
  // tự vẽ trước đây.
  function drawLogoBadge(doc, x, y) {
    const logo = global.EduIigLogo;
    if (!logo) return; // an toàn nếu lỡ quên nạp js/export/iig-logo.js
    const logoW = 50;
    const logoH = logoW * logo.aspect;
    doc.addImage(logo.base64, 'PNG', x, y, logoW, logoH);
  }

  function drawHeader(doc) {
    const pageWidth = doc.internal.pageSize.getWidth();
    drawLogoBadge(doc, PAGE_MARGIN, 20);
    doc.setTextColor(30, 30, 40);
    doc.setFont('NotoSans', 'bold');
    doc.setFontSize(13);
    doc.text('Học Liệu Số — Báo cáo học sinh (IC3)', PAGE_MARGIN + 62, 38);
    doc.setFont('NotoSans', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...GRAY);
    doc.text(`Xuất lúc: ${nowLabel()}`, pageWidth - PAGE_MARGIN, 38, { align: 'right' });
    doc.setDrawColor(220, 222, 235);
    doc.setLineWidth(0.7);
    doc.line(PAGE_MARGIN, 58, pageWidth - PAGE_MARGIN, 58);
    doc.setTextColor(0, 0, 0);
  }

  function sectionTitle(doc, text, y) {
    doc.setFont('NotoSans', 'bold');
    doc.setFontSize(11.5);
    doc.setTextColor(...BRAND);
    doc.text(text, PAGE_MARGIN, y);
    doc.setTextColor(0, 0, 0);
  }

  function drawKpiTable(doc, kpis, startY, scopeLabel) {
    global.autoTable(doc, {
      startY,
      margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
      head: [['Chỉ số', 'Giá trị']],
      body: kpis,
      theme: 'grid',
      headStyles: { fillColor: BRAND, textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [247, 248, 252] },
      styles: { font: 'NotoSans', fontSize: 9.5, cellPadding: 5 },
      columnStyles: { 1: { fontStyle: 'bold', halign: 'right' } },
      didDrawPage: () => drawHeader(doc),
    });
    return doc.lastAutoTable.finalY;
  }

  /** Chụp canvas Chart.js hiện có trên trang thành ảnh PNG (base64). null nếu canvas trống/chưa vẽ. */
  function captureCanvas(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || canvas.style.display === 'none' || !canvas.width || !canvas.height) return null;
    try { return canvas.toDataURL('image/png', 1.0); } catch (e) { return null; }
  }

  function drawChartsPage(doc, scopeLabel) {
    doc.addPage();
    drawHeader(doc);
    sectionTitle(doc, '📈 Biểu đồ', 78);

    const charts = [
      ['chartBar', 'Điểm TB theo lớp'],
      ['chartPie', 'Tỉ lệ Đạt / Chưa đạt'],
      ['chartLine', 'Xu hướng điểm TB theo ngày'],
      ['chartRadar', 'So sánh điểm TB giữa các lớp'],
    ];
    const pageWidth = doc.internal.pageSize.getWidth();
    const colWidth = (pageWidth - PAGE_MARGIN * 2 - 16) / 2;
    const rowHeight = 175;
    let x = PAGE_MARGIN;
    let y = 92;
    charts.forEach(([id, label], i) => {
      const img = captureCanvas(id);
      doc.setFont('NotoSans', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...GRAY);
      doc.text(label, x, y);
      if (img) {
        try { doc.addImage(img, 'PNG', x, y + 6, colWidth, rowHeight - 20); } catch (e) { /* bỏ qua ảnh lỗi, không chặn cả PDF */ }
      } else {
        doc.setFontSize(8);
        doc.text('(Không có dữ liệu biểu đồ)', x, y + 20);
      }
      if (i % 2 === 0) {
        x = PAGE_MARGIN + colWidth + 16;
      } else {
        x = PAGE_MARGIN;
        y += rowHeight;
      }
    });
    doc.setTextColor(0, 0, 0);
  }

  function drawStudentListTable(doc, rows, scopeLabel) {
    doc.addPage();
    drawHeader(doc);
    sectionTitle(doc, '🧑\u200d🎓 Danh sách học sinh', 78);

    const body = rows.map(({ student, history, progress }) => [
      student.mssv || '—',
      student.name || '—',
      student.className || '—',
      student.teacherName || '—',
      history ? `${history.latestScore}%` : '—',
      history ? `${history.avgScore}%` : '—',
      `${progress}%`,
      student.status === 'inactive' ? 'Ngừng học' : 'Đang học',
    ]);
    global.autoTable(doc, {
      startY: 88,
      margin: { left: PAGE_MARGIN, right: PAGE_MARGIN, top: 62 },
      head: [['MSSV', 'Họ tên', 'Lớp', 'Giáo viên', 'Điểm gần nhất', 'Điểm TB', 'Tiến độ', 'Trạng thái']],
      body,
      theme: 'grid',
      headStyles: { fillColor: BRAND, textColor: 255, fontStyle: 'bold', fontSize: 8.5 },
      styles: { font: 'NotoSans', fontSize: 8, cellPadding: 4 },
      alternateRowStyles: { fillColor: [247, 248, 252] },
      didDrawPage: () => drawHeader(doc),
      didParseCell: (data) => {
        if (data.section === 'body' && (data.column.index === 4 || data.column.index === 5)) {
          const raw = parseFloat(data.cell.raw);
          if (!Number.isNaN(raw)) {
            if (raw < 70) { data.cell.styles.textColor = [178, 58, 46]; }
            else { data.cell.styles.textColor = [27, 122, 67]; }
          }
        }
      },
    });
  }

  function drawStudentPivotTable(doc, title, list, scopeLabel) {
    doc.addPage();
    drawHeader(doc);
    sectionTitle(doc, title, 78);
    const body = list.map((e) => [e.studentName, e.studentClass || '—', `${e.avgScore}%`, `${e.bestScore}%`, e.attemptsCount]);
    global.autoTable(doc, {
      startY: 88,
      margin: { left: PAGE_MARGIN, right: PAGE_MARGIN, top: 62 },
      head: [['Họ tên', 'Lớp', 'Điểm TB', 'Điểm cao nhất', 'Số lượt làm bài']],
      body,
      theme: 'grid',
      headStyles: { fillColor: BRAND, textColor: 255, fontStyle: 'bold' },
      styles: { font: 'NotoSans', fontSize: 9, cellPadding: 4.5 },
      alternateRowStyles: { fillColor: [247, 248, 252] },
      didDrawPage: () => drawHeader(doc),
    });
  }

  /**
   * @param {Object} scoped { filteredResults, filteredStudents, examHistories }
   * @param {Object} opts   { rows, scopeLabel, kpis: [[label,value],...], fileName }
   */
  function exportReport(scoped, opts) {
    if (typeof global.jspdf === 'undefined' || typeof global.autoTable === 'undefined') {
      global.dispatchEvent(new CustomEvent('edu:toast', { detail: '❌ Không tải được thư viện PDF (jsPDF). Kiểm tra kết nối mạng rồi thử lại.' }));
      return;
    }
    const { jsPDF } = global.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });

    drawHeader(doc);
    sectionTitle(doc, '📊 Tổng quan', 78);
    drawKpiTable(doc, opts.kpis, 88, opts.scopeLabel);

    drawChartsPage(doc, opts.scopeLabel);
    drawStudentPivotTable(doc, '📉 Học sinh cần hỗ trợ (điểm TB < 60%)', global.EduAnalytics.studentsNeedingSupport(scoped.examHistories, 60), opts.scopeLabel);
    drawStudentPivotTable(doc, '🏆 Học sinh xuất sắc (Top 20)', global.EduAnalytics.topStudents(scoped.examHistories, 20), opts.scopeLabel);
    drawStudentListTable(doc, opts.rows, opts.scopeLabel);

    doc.save(opts.fileName || `bao-cao-hoc-sinh-${new Date().toISOString().slice(0, 10)}.pdf`);
  }

  global.EduPdfExporter = { exportReport };
})(window);
