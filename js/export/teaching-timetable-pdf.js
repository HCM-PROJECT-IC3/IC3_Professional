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
   * js/export/iig-logo.js) + tiêu đề — trả về toạ độ Y để bắt đầu vẽ bảng.
   * Cỡ chữ dòng phụ đề ("Áp dụng"/"Xuất lúc") + logo + khoảng cách dòng đều
   * TỈ LỆ THEO titleSize (thay vì cố định 8.5pt/logo 38pt trước đây) — khi
   * bảng ngắn được chọn cỡ chữ lớn (xem CANDIDATES trong exportTimetablePdf),
   * tiêu đề phóng to nhưng dòng phụ đề vẫn tí hin/dính sát ngay dưới trông
   * như lỗi, giờ phóng theo cùng tỉ lệ + giãn dòng rộng hơn cho cân đối. */
  function drawHeader(doc, teacherName, weekLabel, titleSize) {
    const pageWidth = doc.internal.pageSize.getWidth();
    doc.setFillColor(...BRAND);
    doc.rect(0, 0, pageWidth, 4, 'F');

    const subSize = Math.max(9, Math.round(titleSize * 0.62 * 10) / 10);
    const logoW = Math.max(38, titleSize * 3.1);
    const titleY = Math.max(20, titleSize + 6);
    const subY = titleY + subSize + 6;

    const logo = global.EduIigLogo;
    let titleX = PAGE_MARGIN;
    let logoBottom = 12;
    if (logo) {
      const logoH = logoW * logo.aspect;
      doc.addImage(logo.base64, 'PNG', PAGE_MARGIN, 10, logoW, logoH);
      titleX = PAGE_MARGIN + logoW + 12;
      logoBottom = 10 + logoH;
    }

    doc.setTextColor(30, 30, 40);
    doc.setFont('NotoSans', 'bold');
    doc.setFontSize(titleSize);
    doc.text(`THỜI KHOÁ BIỂU — ${teacherName || ''}`.trim(), titleX, titleY);

    doc.setFont('NotoSans', 'normal');
    doc.setFontSize(subSize);
    doc.setTextColor(...GRAY);
    doc.text(`Áp dụng: ${weekLabel || ''}`, titleX, subY);
    doc.text(`Xuất lúc: ${nowLabel()}`, pageWidth - PAGE_MARGIN, titleY, { align: 'right' });

    doc.setTextColor(0, 0, 0);
    return Math.max(subY + 16, logoBottom + 10);
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
   * và 1 hàng vạch màu ngăn cách SÁNG/CHIỀU (colSpan toàn bảng) — đúng yêu
   * cầu "giãn cách phân biệt sáng/chiều" nhưng vẽ chủ động thay vì phụ
   * thuộc CSS in trình duyệt. KHÔNG chèn hàng "☕ Ra chơi" (bản in PDF bỏ
   * hẳn, khác bản web) — theo yêu cầu người dùng, giữ bảng gọn hơn.
   *
   * MỖI THỨ có khung giờ RIÊNG (periodTimesByDay) — cột "Thời gian" hiện
   * giờ THAM CHIẾU (Thứ 2, hoặc Thứ đầu tiên có tiết đó) giống bản web;
   * Thứ nào có giờ THỰC TẾ khác giờ tham chiếu thì được nối thêm dòng giờ
   * riêng ngay trong ô Thứ đó (xem cellText()), KHÔNG bịa 1 giờ chung sai
   * cho những Thứ lệch khung. */
  function buildRows(days, periodTimesByDay, M) {
    const head = [['Buổi', 'Tiết', 'Thời gian', ...M.WEEKDAYS.map((d) => M.WEEKDAY_LABELS[d])]];
    const body = [];
    const totalCols = 3 + M.WEEKDAYS.length;
    const SESSION_STYLE = {
      morning:   { fillColor: [255, 247, 224], textColor: [169, 122, 0] },
      afternoon: { fillColor: [240, 236, 255], textColor: [79, 107, 255] },
    };

    M.SESSIONS.forEach((sessionKey, si) => {
      const maxCount = M.maxPeriodCount(periodTimesByDay, sessionKey);

      for (let pi = 0; pi < maxCount; pi++) {
        const refPeriod = M.WEEKDAYS.map((d) => (periodTimesByDay[String(d)][sessionKey] || [])[pi]).find(Boolean);
        const row = [];
        if (pi === 0) {
          row.push({
            content: M.SESSION_LABELS[sessionKey],
            rowSpan: maxCount,
            styles: Object.assign({ fontStyle: 'bold', valign: 'middle', halign: 'center' }, SESSION_STYLE[sessionKey]),
          });
        }
        row.push(String(pi + 1));
        row.push(refPeriod ? `${refPeriod.start || '?'} - ${refPeriod.end || '?'}` : '—');
        M.WEEKDAYS.forEach((d) => {
          const dayPeriod = (periodTimesByDay[String(d)][sessionKey] || [])[pi];
          if (!dayPeriod) { row.push({ content: '—', styles: { textColor: GRAY } }); return; }
          const raw = ((days[String(d)] || {})[sessionKey] || [])[pi];
          const cell = M.cellOf(raw);
          const differsFromRef = cell.maLop && refPeriod && (dayPeriod.start !== refPeriod.start || dayPeriod.end !== refPeriod.end);
          const ownTime = differsFromRef ? `(${dayPeriod.start || '?'}-${dayPeriod.end || '?'})\n` : '';
          row.push(ownTime + cellText(days, M, sessionKey, d, pi));
        });
        body.push(row);
      }

      // Vạch màu ngăn cách SÁNG/CHIỀU — chỉ chèn SAU khối đầu tiên (Sáng).
      // Hàng CAO hơn hẳn (minCellHeight 16, trước đây chỉ 3) nhưng dải màu
      // THẬT vẫn mảnh — phần cao thêm được "ăn" bằng màu trắng ở trên/dưới
      // ngay trong didDrawCell của tryFit() (xem TRACKED bằng content: ''),
      // tạo khoảng trắng thoáng rõ ràng 2 bên dải màu thay vì dán sát ngay
      // vào hàng dữ liệu trên/dưới như trước (nhìn như lỗi kẻ bảng).
      if (si === 0) {
        body.push([{
          content: '', colSpan: totalCols,
          styles: { fillColor: BRAND, minCellHeight: 16, cellPadding: 0, lineWidth: 0 },
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
    // 3 cột đầu (Buổi/Tiết/Thời gian) PHẢI đủ rộng cho chữ DÀI NHẤT sẽ in ở
    // cỡ (fontSize) đang thử — hệ số ước lượng trước đó (fontSize * 3.4)
    // vẫn KHÔNG đủ ở vài cỡ chữ, chữ vẫn bị ngắt dòng giữa từ ("Buổi" →
    // "Buổ"+"i", "SÁNG" → "SÁN"+"G"). Đo THẬT bề rộng từng chữ bằng
    // doc.getTextWidth() (đúng cỡ/độ đậm sẽ dùng khi vẽ) rồi mới cộng
    // cellPadding — đảm bảo KHÔNG BAO GIỜ bị ngắt dòng bất kể cỡ chữ nào.
    doc.setFont('NotoSans', 'bold');
    doc.setFontSize(fontSize + 1);
    const buoiHeadW = doc.getTextWidth('Buổi');
    const tietHeadW = doc.getTextWidth('Tiết');
    const timeHeadW = doc.getTextWidth('Thời gian');
    doc.setFontSize(fontSize);
    const buoiBodyW = Math.max(doc.getTextWidth('SÁNG'), doc.getTextWidth('CHIỀU'));
    const timeBodyW = doc.getTextWidth('07:30 - 08:05'); // mẫu giờ dài nhất thực tế (HH:MM - HH:MM)
    const pad = cellPadding * 2 + 4;
    const labelColWidth = Math.max(34, buoiHeadW, buoiBodyW) + pad;
    const tietColWidth = Math.max(30, tietHeadW) + pad;
    const timeColWidth = Math.max(62, timeHeadW, timeBodyW) + pad;
    const dayColWidth = (pageWidth - PAGE_MARGIN * 2 - labelColWidth - tietColWidth - timeColWidth) / doc.__weekdayCount;

    global.autoTable(doc, {
      startY,
      margin: { left: PAGE_MARGIN, right: PAGE_MARGIN, bottom: PAGE_MARGIN },
      head, body,
      theme: 'grid',
      headStyles: { fillColor: BRAND, textColor: 255, fontStyle: 'bold', fontSize: fontSize + 1, halign: 'center' },
      // minCellHeight TỈ LỆ THEO cellPadding đang thử — ở cỡ chữ lớn (giáo
      // viên ít tiết/ít ngày dạy), hàng cao hơn hẳn giúp bảng giãn lấp gần
      // hết trang thay vì co cụm ở góc trên để trống cả mảng lớn phía dưới.
      styles: { font: 'NotoSans', fontSize, cellPadding, valign: 'middle', halign: 'center', overflow: 'linebreak', minCellHeight: cellPadding * 5 },
      columnStyles: {
        0: { cellWidth: labelColWidth },
        1: { cellWidth: tietColWidth, textColor: GRAY, fontStyle: 'bold' },
        2: { cellWidth: timeColWidth, fontStyle: 'bold' },
      },
      // Ô vạch ngăn cách SÁNG/CHIỀU (content: '', colSpan toàn bảng, xem
      // buildRows()) được vẽ CAO hơn thật (minCellHeight 16) rồi SƠN TRẮNG
      // đè lên phần trên/dưới ngay sau khi autoTable tô màu xong, chỉ chừa
      // lại 1 dải màu MỎNG (BAR_H) ở giữa — tạo khoảng trắng thoáng bao
      // quanh thay vì dải màu dính sát hàng dữ liệu trên/dưới như trước.
      didDrawCell: (data) => {
        const raw = data.cell.raw;
        if (data.section !== 'body' || !raw || typeof raw !== 'object' || raw.content !== '' || !raw.colSpan) return;
        const BAR_H = 4;
        const { x, y, width, height } = data.cell;
        const gap = (height - BAR_H) / 2;
        if (gap <= 0) return;
        doc.setFillColor(255, 255, 255);
        doc.rect(x, y, width, gap, 'F');
        doc.rect(x, y + height - gap, width, gap, 'F');
      },
    });
    const fitsOnePage = doc.internal.getNumberOfPages() === 1;
    return { doc, fitsOnePage };
  }

  /**
   * @param {Object} params { teacherName, weekLabel, days, periodTimesByDay }
   * @param {Object} M module EduModels.TeachingTimetable (WEEKDAYS, WEEKDAY_LABELS,
   *   SESSIONS, SESSION_LABELS, BREAK_AFTER_INDEX, cellOf, maxPeriodCount)
   */
  function exportTimetablePdf(params, M) {
    if (!ensureLibsLoaded()) return;
    const { teacherName, weekLabel, days, periodTimesByDay } = params;
    const { jsPDF } = global.jspdf;
    const { head, body } = buildRows(days, periodTimesByDay, M);

    // Thử từ cỡ chữ LỚN NHẤT trước, LÙI DẦN nếu tràn quá 1 trang — vòng lặp
    // dừng ngay ở candidate ĐẦU TIÊN vừa đúng 1 trang, nên đặt các cỡ LỚN ở
    // đầu danh sách để giáo viên ít tiết/ít ngày dạy (bảng vốn ngắn) được
    // chọn cỡ to nhất có thể, bảng giãn lấp gần hết trang thay vì luôn cố
    // định ở cỡ nhỏ (8pt) rồi để trống cả mảng lớn phía dưới trang A4 ngang.
    // Chặn ở fontSize 5.5 (còn đọc được khi in) để không lùi vô hạn nếu 1
    // giáo viên có QUÁ nhiều tiết/buổi bất thường.
    const CANDIDATES = [
      { fontSize: 13,  cellPadding: 10,  titleSize: 18 },
      { fontSize: 11,  cellPadding: 8,   titleSize: 16 },
      { fontSize: 9.5, cellPadding: 6,   titleSize: 15 },
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
