/* ============================================================
   js/export/teaching-schedule-pdf.js
   Engine xuất PDF cho tính năng "📅 Lịch giảng dạy" — xuất lịch làm
   việc/giảng dạy hàng tuần của 1 giáo viên (hoặc nhiều giáo viên, mỗi
   người 1 trang) thành file PDF để in/gửi.

   Dùng jsPDF (js/vendor/jspdf.umd.min.js) + jsPDF-AutoTable
   (js/vendor/jspdf.plugin.autotable.min.js, bản v4 — gọi qua hàm toàn
   cục autoTable(doc, opts)) — CÙNG 2 thư viện đã dùng ở
   js/export/pdf-exporter.js (báo cáo học sinh), không thêm thư viện mới.

   Nạp SAU: js/vendor/jspdf.umd.min.js, js/vendor/jspdf.plugin.autotable.min.js,
            js/models/teaching-schedule.model.js (chỉ cần cho tham số M truyền vào,
            file này không tự require).
   ============================================================ */
(function (global) {
  'use strict';

  const BRAND = [79, 107, 255]; // #4f6bff — khớp --purple trong css/theme.css
  const GRAY = [110, 110, 120];
  const PAGE_MARGIN = 40;

  // Màu nền ô "Loại hình" trong bảng PDF — CÙNG Ý NGHĨA với bảng màu
  // wk-chip/day-card-session trên web (xem css/teaching-schedule.css) để
  // bản in ra vẫn nhận diện được loại hình bằng màu như trên màn hình.
  // RGB nhạt (gần trắng) để chữ đen trong ô luôn đọc rõ khi in.
  const TYPE_COLOR = {
    'Dạy chính': [231, 242, 254],
    'Dạy Trám': [236, 240, 255],
    'Dạy Trực Tuyến': [228, 250, 238],
    'Ôn Thi': [227, 250, 246],
    'Trợ Giảng': [250, 231, 244],
    'Dự Giảng': [255, 239, 226],
    'Soạn bài': [246, 248, 254],
    'Làm việc tại cty': [246, 248, 254],
    'WFH': [246, 248, 254],
    'Khám SK': [253, 232, 231],
    'Nghỉ phép/ lễ': [253, 232, 231],
  };

  function nowLabel() {
    return new Date().toLocaleString('vi-VN');
  }

  /** Bỏ dấu tiếng Việt bằng cách tách dấu (NFD) rồi lọc theo mã điểm
   * Unicode của khối "Combining Diacritical Marks" (0x0300-0x036F) —
   * dùng vòng lặp so mã số thay vì regex chứa ký tự dấu trực tiếp trong
   * source, tránh lỗi mã hoá file khi copy/paste ký tự tổ hợp. */
  function stripDiacritics(s) {
    let out = '';
    for (const ch of String(s).normalize('NFD')) {
      const code = ch.codePointAt(0);
      if (code < 0x0300 || code > 0x036f) out += ch;
    }
    return out;
  }

  /** Bỏ dấu + ký tự đặc biệt để dùng an toàn trong tên file tải về. */
  function slugify(s) {
    return stripDiacritics(s || '')
      .replace(/đ/gi, 'd')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'giao-vien';
  }

  /** Vẽ phần đầu trang — trả về toạ độ Y ngay dưới đường kẻ phân cách để
   * vẽ bảng lịch tiếp theo, TÍNH ĐỘNG theo số dòng thật của dòng thông tin
   * (tên GV/mã NV/tuần bọc qua doc.splitTextToSize) — tên giáo viên dài
   * sẽ tự xuống dòng đúng chỗ thay vì tràn lề/đè lên đường kẻ hay bảng
   * bên dưới ("rớt dòng"). Không còn logo "IC3" — thay bằng 1 dải màu
   * thương hiệu mỏng ở mép trên, gọn và chuyên nghiệp hơn khối logo vuông. */
  function drawHeader(doc, { teacherName, teacherCode, weekLabel }) {
    const pageWidth = doc.internal.pageSize.getWidth();
    const contentWidth = pageWidth - PAGE_MARGIN * 2;

    doc.setFillColor(...BRAND);
    doc.rect(0, 0, pageWidth, 5, 'F');

    let y = 34;
    doc.setTextColor(30, 30, 40);
    doc.setFont('NotoSans', 'bold');
    doc.setFontSize(16);
    doc.text('Lịch giảng dạy hàng tuần', PAGE_MARGIN, y);

    doc.setFont('NotoSans', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...GRAY);
    doc.text(`Xuất lúc: ${nowLabel()}`, pageWidth - PAGE_MARGIN, y, { align: 'right' });

    y += 20;
    doc.setFontSize(11);
    doc.setTextColor(60, 60, 72);
    const subtitle = `${teacherName || '(chưa rõ tên)'}  ·  Mã NV: ${teacherCode}  ·  Tuần: ${weekLabel}`;
    // splitTextToSize BỌC ĐÚNG theo bề rộng in được của font NotoSans đang
    // dùng — dù tên giáo viên dài tới đâu cũng không tràn lề, số dòng trả
    // về là con số THẬT để tính đúng khoảng cách xuống bảng bên dưới.
    const lines = doc.splitTextToSize(subtitle, contentWidth);
    doc.text(lines, PAGE_MARGIN, y);
    y += lines.length * 14;

    y += 8;
    doc.setDrawColor(220, 222, 235);
    doc.setLineWidth(0.8);
    doc.line(PAGE_MARGIN, y, pageWidth - PAGE_MARGIN, y);
    doc.setTextColor(0, 0, 0);
    return y + 14;
  }

  function drawFooterAllPages(doc) {
    const total = doc.internal.getNumberOfPages();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    for (let i = 1; i <= total; i += 1) {
      doc.setPage(i);
      doc.setDrawColor(220, 222, 235);
      doc.setLineWidth(0.5);
      doc.line(PAGE_MARGIN, pageHeight - 28, pageWidth - PAGE_MARGIN, pageHeight - 28);
      doc.setFont('NotoSans', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...GRAY);
      doc.text('Lịch giảng dạy — báo cáo được tạo tự động', PAGE_MARGIN, pageHeight - 15);
      doc.text(`Trang ${i}/${total}`, pageWidth - PAGE_MARGIN, pageHeight - 15, { align: 'right' });
    }
  }

  /** Nội dung 1 ô (Buổi × Thứ) trong bảng lịch: loại hình + địa điểm +
   * danh sách tiết có tích, mỗi phần 1 dòng riêng cho dễ đọc khi in. */
  function sessionCellText(sess, M) {
    if (!sess || !sess.type) return '—';
    const periods = (sess.periods || [])
      .map((p, i) => (p ? String(i + 1) : null))
      .filter(Boolean);
    const lines = [sess.type];
    if (sess.location) lines.push(sess.location);
    if (periods.length) lines.push(`Tiết: ${periods.join(', ')}`);
    return lines.join('\n');
  }

  /** Vẽ bảng lịch 7 cột (Buổi + Thứ2..7) cho 1 giáo viên/1 tuần, tô màu ô
   * theo loại hình — trả về vị trí Y ngay dưới bảng để vẽ tiếp phần sau. */
  function buildScheduleTable(doc, days, M, startY) {
    const head = [['Buổi', ...M.WEEKDAYS.map((d) => M.WEEKDAY_LABELS[d])]];
    const body = M.SESSIONS.map((s) => [
      M.SESSION_LABELS[s].toUpperCase(),
      ...M.WEEKDAYS.map((d) => sessionCellText((days[String(d)] || M.emptyDay())[s], M)),
    ]);
    // Chia đều 6 cột Thứ theo bề rộng CÒN LẠI sau cột "Buổi" — không để
    // autoTable tự co giãn theo độ dài nội dung (mặc định sẽ làm 1 cột có
    // địa điểm dài phình to, các cột trống bị bóp nhỏ, trông như bảng lỗi
    // lệch). Bảng lịch tuần lúc nào cũng nên đều 6 cột như 1 lịch thật.
    const pageWidth = doc.internal.pageSize.getWidth();
    const labelColWidth = 52;
    const dayColWidth = (pageWidth - PAGE_MARGIN * 2 - labelColWidth) / M.WEEKDAYS.length;
    const columnStyles = { 0: { fontStyle: 'bold', halign: 'left', textColor: GRAY, cellWidth: labelColWidth } };
    M.WEEKDAYS.forEach((_, i) => { columnStyles[i + 1] = { cellWidth: dayColWidth }; });
    global.autoTable(doc, {
      startY,
      margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
      head, body,
      theme: 'grid',
      headStyles: { fillColor: BRAND, textColor: 255, fontStyle: 'bold', fontSize: 10, halign: 'center' },
      // minCellHeight chỉ là mức TỐI THIỂU — ô có nội dung dài hơn (địa
      // điểm dài, nhiều tiết) tự cao thêm, KHÔNG bao giờ bị cắt/rớt dòng;
      // đặt cao hơn 1 chút (44 thay vì 34) để có khoảng trắng thoáng, đỡ
      // cảm giác chữ dính sát viền ô khi cỡ chữ đã tăng lên.
      styles: { font: 'NotoSans', fontSize: 9.5, cellPadding: 6, valign: 'middle', halign: 'center', minCellHeight: 44, overflow: 'linebreak' },
      columnStyles,
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index > 0) {
          const sessKey = M.SESSIONS[data.row.index];
          const d = M.WEEKDAYS[data.column.index - 1];
          const sess = (days[String(d)] || M.emptyDay())[sessKey];
          const color = sess && TYPE_COLOR[sess.type];
          if (color) data.cell.styles.fillColor = color;
        }
      },
    });
    return doc.lastAutoTable.finalY;
  }

  /** Bảng thống kê tuần (2 cột label:value × 4 hàng) — cùng số liệu với
   * "Thống kê tuần" trên web (M.computeWeekStats). */
  function buildStatsTable(doc, stats, startY) {
    const body = [
      ['Trường dạy chính', String(stats.schoolsMain), 'Tiết dạy chính', String(stats.periodsMain)],
      ['Trường dạy trám', String(stats.schoolsSub), 'Tiết dạy trám', String(stats.periodsSub)],
      ['Tiết ôn thi (TT/Online)', String(stats.periodsReview), 'Buổi soạn bài', String(stats.sessionsPrep)],
      ['Buổi làm tại cty', String(stats.sessionsOffice), 'Lần trợ giảng/dự giảng', String(stats.sessionsMentor)],
    ];
    global.autoTable(doc, {
      startY: startY + 14,
      margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
      body,
      theme: 'plain',
      styles: { font: 'NotoSans', fontSize: 10, cellPadding: 5 },
      columnStyles: {
        0: { textColor: GRAY },
        1: { fontStyle: 'bold', halign: 'right' },
        2: { textColor: GRAY },
        3: { fontStyle: 'bold', halign: 'right' },
      },
    });
    return doc.lastAutoTable.finalY;
  }

  function drawOnePage(doc, teacher, days, weekLabel, M, { isFirstPage }) {
    if (!isFirstPage) doc.addPage();
    // startY LẤY TỪ drawHeader() (không còn số cố định 60) — tên giáo viên
    // dài xuống mấy dòng thì bảng cũng tự lùi xuống đúng bấy nhiêu, không
    // bao giờ đè lên phần header phía trên.
    const tableStartY = drawHeader(doc, { teacherName: teacher.name, teacherCode: teacher.code || teacher.id, weekLabel });
    const tableEndY = buildScheduleTable(doc, days, M, tableStartY);
    buildStatsTable(doc, M.computeWeekStats(days), tableEndY);
  }

  function ensureLibsLoaded() {
    if (typeof global.jspdf === 'undefined' || typeof global.autoTable === 'undefined') {
      const el = document.getElementById('toast');
      if (el) {
        el.textContent = '❌ Không tải được thư viện PDF (jsPDF). Kiểm tra kết nối mạng rồi thử lại.';
        el.classList.add('show');
        setTimeout(() => el.classList.remove('show'), 2800);
      }
      return false;
    }
    return true;
  }

  /** Xuất 1 file PDF cho ĐÚNG 1 giáo viên/1 tuần — nút "🖨️ PDF" từng hàng
   * (admin/coordinator) hoặc "🖨️ Xuất PDF" trong "Lịch của tôi" (giáo viên). */
  function exportOne(teacher, days, weekLabel, M) {
    if (!ensureLibsLoaded()) return;
    const { jsPDF } = global.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape' });
    drawOnePage(doc, teacher, days, weekLabel, M, { isFirstPage: true });
    drawFooterAllPages(doc);
    doc.save(`lich-${slugify(teacher.name || teacher.code)}-${slugify(weekLabel)}.pdf`);
  }

  /** Xuất 1 file PDF DUY NHẤT gồm lịch của NHIỀU giáo viên, mỗi người 1
   * trang — nút "🖨️ Xuất PDF tất cả" trên thanh công cụ (chỉ admin/coordinator).
   * @param {Array<{teacher, days}>} list
   */
  function exportMany(list, weekLabel, M) {
    if (!ensureLibsLoaded()) return;
    if (!list.length) return;
    const { jsPDF } = global.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape' });
    list.forEach(({ teacher, days }, i) => {
      drawOnePage(doc, teacher, days, weekLabel, M, { isFirstPage: i === 0 });
    });
    drawFooterAllPages(doc);
    doc.save(`lich-giang-day-${slugify(weekLabel)}.pdf`);
  }

  global.EduTeachingSchedulePdf = { exportOne, exportMany };
})(window);
