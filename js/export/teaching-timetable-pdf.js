/* ============================================================
   js/export/teaching-timetable-pdf.js
   Xuất "🗓️ Thời khoá biểu" (tab TKB lớp → giáo viên) ra PDF bằng jsPDF +
   AutoTable — THAY THẾ nút "🖨️ In" cũ vốn chỉ gọi window.print() (hộp
   thoại in của trình duyệt, xem css/teaching-schedule.css @media print).

   LÝ DO ĐỔI: window.print() không kiểm soát được phần "Headers and
   footers" (ngày giờ, tiêu đề trang, URL, số trang) mà Chrome/Edge TỰ
   CHÈN vào mỗi trang in — đây là tính năng của trình duyệt, KHÔNG có API
   CSS/JS nào từ 1 trang web tắt được nó. Người dùng phản hồi cần bỏ hẳn
   phần đó → cách duy nhất là KHÔNG dùng hộp thoại in của trình duyệt nữa,
   xuất thẳng file .pdf bằng jsPDF (giống teaching-schedule-pdf.js/
   teaching-schedule-cong-tac-pdf.js đã làm) — file .pdf này không đi qua
   window.print() nên không có bất kỳ header/footer nào của trình duyệt.

   Cách này còn giải quyết luôn 2 việc kia:
   - "Giãn cách phân biệt Sáng/Chiều": vẽ 1 vạch màu thương hiệu (colSpan
     toàn bảng) giữa 2 khối, tự kiểm soát được layout thay vì phụ thuộc
     CSS in của trình duyệt.
   - "Vừa 1 trang A4 ngang": `new jsPDF({format:'a4', orientation:
     'landscape'})` + cỡ chữ/khoảng đệm được TÍNH TOÁN trực tiếp trong
     code này (không phải suy đoán qua @media print rồi hy vọng vừa) —
     kiểm tra chiều cao bảng SAU khi autoTable vẽ xong, nếu > 1 trang thì
     TỰ ĐỘNG vẽ lại với cỡ chữ nhỏ hơn (xem tryFit() bên dưới), đảm bảo
     luôn ra đúng 1 trang bất kể dữ liệu nhiều/ít tiết.

   Nạp SAU: js/vendor/jspdf.umd.min.js, js/vendor/jspdf.plugin.autotable.min.js,
            js/vendor/notosans-vietnamese-jspdf.js, js/export/iig-logo.js.
   ============================================================ */
(function (global) {
  'use strict';

  const BRAND = [79, 107, 255];
  const GRAY = [110, 110, 120];
  const PAGE_MARGIN = 22;

  function nowLabel() {
    return new Date().toLocaleString('vi-VN');
  }

  function stripDiacritics(s) {
    let out = '';
    for (const ch of String(s || '').normalize('NFD')) {
      const code = ch.codePointAt(0);
      if (code < 0x0300 || code > 0x036f) out += ch;
    }
    return out;
  }
  function slug(s) {
    return stripDiacritics(s).replace(/đ/gi, 'd').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'x';
  }

  function ensureLibsLoaded() {
    if (typeof global.jspdf === 'undefined' || typeof global.autoTable === 'undefined') {
      alert('❌ Không tải được thư viện PDF (jsPDF). Kiểm tra kết nối mạng rồi thử lại.');
      return false;
    }
    return true;
  }

  /** Vẽ dải màu thương hiệu + logo IIG (window.EduIigLogo, xem
   * js/export/iig-logo.js) + tiêu đề — trả về toạ độ Y để bắt đầu vẽ bảng. */
  function drawHeader(doc, teacherName, weekLabel, titleSize) {
    const pageWidth = doc.internal.pageSize.getWidth();
    doc.setFillColor(...BRAND);
    doc.rect(0, 0, pageWidth, 4, 'F');

    const logo = global.EduIigLogo;
    let titleX = PAGE_MARGIN;
    let logoBottom = 12;
    if (logo) {
      const logoW = 38;
      const logoH = logoW * logo.aspect;
      doc.addImage(logo.base64, 'PNG', PAGE_MARGIN, 10, logoW, logoH);
      titleX = PAGE_MARGIN + logoW + 10;
      logoBottom = 10 + logoH;
    }

    doc.setTextColor(30, 30, 40);
    doc.setFont('NotoSans', 'bold');
    doc.setFontSize(titleSize);
    doc.text(`THỜI KHOÁ BIỂU — ${teacherName || ''}`.trim(), titleX, 20);

    doc.setFont('NotoSans', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...GRAY);
    doc.text(`Áp dụng: ${weekLabel || ''}`, titleX, 31);
    doc.text(`Xuất lúc: ${nowLabel()}`, pageWidth - PAGE_MARGIN, 20, { align: 'right' });

    doc.setTextColor(0, 0, 0);
    return Math.max(38, logoBottom + 6);
  }

  /** Nội dung 1 ô Thứ×Tiết: "Mã lớp" (đậm) xuống dòng "Trường" (nhạt hơn) —
   * gộp thành 1 chuỗi có \n, AutoTable tự tách dòng (overflow: 'linebreak'). */
  function cellText(days, M, sessionKey, dayNum, pi) {
    const raw = ((days[String(dayNum)] || {})[sessionKey] || [])[pi];
    const c = M.cellOf(raw);
    const lines = [];
    if (c.maLop) lines.push(c.maLop);
    if (c.truong) lines.push(c.truong);
    return lines.join('\n') || '—';
  }

  /** Dựng head/body cho AutoTable — Buổi dùng rowSpan gộp theo từng buổi
   * (giống ô "Buổi" gộp dòng trên web), chèn 1 hàng "☕ Ra chơi" (colSpan)
   * sau tiết BREAK_AFTER_INDEX của mỗi buổi, và 1 hàng vạch màu ngăn cách
   * SÁNG/CHIỀU (colSpan toàn bảng) — đúng yêu cầu "giãn cách phân biệt
   * sáng/chiều" nhưng vẽ chủ động thay vì phụ thuộc CSS in trình duyệt. */
  function buildRows(days, periodTimes, M) {
    const head = [['Buổi', 'Tiết', 'Thời gian', ...M.WEEKDAYS.map((d) => M.WEEKDAY_LABELS[d])]];
    const body = [];
    const totalCols = 3 + M.WEEKDAYS.length;
    const SESSION_STYLE = {
      morning:   { fillColor: [255, 247, 224], textColor: [169, 122, 0] },
      afternoon: { fillColor: [240, 236, 255], textColor: [79, 107, 255] },
    };

    M.SESSIONS.forEach((sessionKey, si) => {
      const periods = periodTimes[sessionKey] || [];
      const hasBreak = periods.length > M.BREAK_AFTER_INDEX + 1;
      const rowSpan = periods.length + (hasBreak ? 1 : 0);

      periods.forEach((p, pi) => {
        const row = [];
        if (pi === 0) {
          row.push({
            content: M.SESSION_LABELS[sessionKey],
            rowSpan,
            styles: Object.assign({ fontStyle: 'bold', valign: 'middle', halign: 'center' }, SESSION_STYLE[sessionKey]),
          });
        }
        row.push(String(pi + 1));
        row.push(`${p.start || '?'} - ${p.end || '?'}`);
        M.WEEKDAYS.forEach((d) => row.push(cellText(days, M, sessionKey, d, pi)));
        body.push(row);
      });

      if (hasBreak) {
        body.push([{
          content: '☕ Ra chơi',
          colSpan: totalCols - 1, // trừ cột "Buổi" (đang bị rowSpan từ dòng tiết đầu che)
          styles: { fillColor: [246, 247, 251], textColor: GRAY, fontStyle: 'bold', halign: 'center', fontSize: 7.5, cellPadding: 2 },
        }]);
      }

      // Vạch màu ngăn cách SÁNG/CHIỀU — chỉ chèn SAU khối đầu tiên (Sáng).
      if (si === 0) {
        body.push([{
          content: '', colSpan: totalCols,
          styles: { fillColor: BRAND, minCellHeight: 3, cellPadding: 0, lineWidth: 0 },
        }]);
      }
    });

    return { head, body };
  }

  /** Thử vẽ bảng với 1 cỡ chữ cho trước, trả về true nếu bảng vừa ĐÚNG 1
   * trang (không sinh thêm trang nào), false nếu tràn — dùng để tự lùi cỡ
   * chữ nhỏ dần cho tới khi vừa, KHÔNG đoán mò 1 cỡ chữ cố định (số tiết
   * mỗi giáo viên/mỗi buổi có thể khác nhau tuỳ khung giờ họ tự cấu hình). */
  function tryFit(makeDoc, fontSize, cellPadding, titleSize) {
    const doc = makeDoc();
    const startY = doc.__startY;
    const { head, body } = doc.__rows;
    const pageWidth = doc.internal.pageSize.getWidth();
    const labelColWidth = 34;
    const tietColWidth = 30;
    const timeColWidth = 62;
    const dayColWidth = (pageWidth - PAGE_MARGIN * 2 - labelColWidth - tietColWidth - timeColWidth) / doc.__weekdayCount;

    global.autoTable(doc, {
      startY,
      margin: { left: PAGE_MARGIN, right: PAGE_MARGIN, bottom: PAGE_MARGIN },
      head, body,
      theme: 'grid',
      headStyles: { fillColor: BRAND, textColor: 255, fontStyle: 'bold', fontSize: fontSize + 1, halign: 'center' },
      styles: { font: 'NotoSans', fontSize, cellPadding, valign: 'middle', halign: 'center', overflow: 'linebreak' },
      columnStyles: {
        0: { cellWidth: labelColWidth },
        1: { cellWidth: tietColWidth, textColor: GRAY, fontStyle: 'bold' },
        2: { cellWidth: timeColWidth, fontStyle: 'bold' },
      },
    });
    const fitsOnePage = doc.internal.getNumberOfPages() === 1;
    return { doc, fitsOnePage };
  }

  /**
   * @param {Object} params { teacherName, weekLabel, days, periodTimes }
   * @param {Object} M module EduModels.TeachingTimetable (WEEKDAYS, WEEKDAY_LABELS,
   *   SESSIONS, SESSION_LABELS, BREAK_AFTER_INDEX, cellOf)
   */
  function exportTimetablePdf(params, M) {
    if (!ensureLibsLoaded()) return;
    const { teacherName, weekLabel, days, periodTimes } = params;
    const { jsPDF } = global.jspdf;
    const { head, body } = buildRows(days, periodTimes, M);

    // Thử từ cỡ chữ bình thường, lùi dần nếu tràn quá 1 trang — chặn ở
    // fontSize 5.5 (còn đọc được khi in) để không lùi vô hạn nếu 1 giáo
    // viên có QUÁ nhiều tiết/buổi bất thường.
    const CANDIDATES = [
      { fontSize: 8,   cellPadding: 4,   titleSize: 14 },
      { fontSize: 7.2, cellPadding: 3,   titleSize: 13 },
      { fontSize: 6.4, cellPadding: 2.2, titleSize: 12 },
      { fontSize: 5.8, cellPadding: 1.6, titleSize: 11 },
    ];

    let result = null;
    for (const cand of CANDIDATES) {
      const makeDoc = () => {
        const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape' });
        const startY = drawHeader(doc, teacherName, weekLabel, cand.titleSize);
        doc.__startY = startY;
        doc.__rows = { head, body };
        doc.__weekdayCount = M.WEEKDAYS.length;
        return doc;
      };
      result = tryFit(makeDoc, cand.fontSize, cand.cellPadding, cand.titleSize);
      if (result.fitsOnePage) break;
    }

    result.doc.save(`tkb-${slug(teacherName)}-${slug(weekLabel)}.pdf`);
  }

  global.EduTeachingTimetablePdf = { exportTimetablePdf };
})(window);
