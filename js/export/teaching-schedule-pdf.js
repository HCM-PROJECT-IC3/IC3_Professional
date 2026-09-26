/* ============================================================
   js/export/teaching-schedule-pdf.js
   Engine xuất PDF cho tính năng "📅 Lịch giảng dạy" — xuất lịch làm
   việc/giảng dạy hàng tuần của 1 giáo viên (hoặc nhiều giáo viên, mỗi
   người 1 trang) thành file PDF để in/gửi.

   THIẾT KẾ PHỎNG THEO ĐÚNG file Excel gốc "LỊCH GIẢNG DẠY TEAM GVTH NH
   2026-2027.xlsx" (On_Tap_MOS) mà người dùng đã quen mắt nhiều năm —
   người dùng yêu cầu "giống từ màu sắc lẫn bố cục" để dễ nhìn/dễ nhớ hơn
   là theo màu tím thương hiệu mặc định của app:
     - Font Tinos (metric-tương thích Times New Roman, đã nhúng sẵn ở
       js/vendor/tinos-vietnamese-jspdf.js — dùng CHUNG với "📋 Phiếu công
       tác") thay vì NotoSans.
     - Tiêu đề ĐỎ đậm, căn giữa; dòng "Thời gian áp dụng" tô vàng giống ô
       Excel B4.
     - Mỗi buổi (Sáng/Chiều) tách THÀNH 7 HÀNG đúng cấu trúc Excel: 1 hàng
       "Chọn loại hình phụ trách" + 1 hàng "Địa điểm giảng dạy" + 5 hàng
       "Tiết 1..5" — thay vì dồn cả 3 thứ vào 1 ô như bản trước — nền vàng
       nhạt (Sáng) / xanh lá nhạt (Chiều) đúng màu Excel, chữ loại hình
       màu xanh navy, địa điểm/mã lớp màu xanh dương, viền phân cách xanh
       lá đậm giữa các cột Thứ (bản Excel dùng viền NÉT ĐỨT — jsPDF-
       AutoTable không vẽ được nét đứt cho viền ô nên thay bằng nét liền
       cùng màu, vẫn đủ để mắt phân biệt ranh giới từng Thứ).

   Dùng jsPDF (js/vendor/jspdf.umd.min.js) + jsPDF-AutoTable
   (js/vendor/jspdf.plugin.autotable.min.js, bản v4 — gọi qua hàm toàn
   cục autoTable(doc, opts)) + font Tinos (js/vendor/tinos-vietnamese-jspdf.js,
   nạp SẴN trong teaching-schedule.html cho "📋 Phiếu công tác").

   Nạp SAU: js/vendor/jspdf.umd.min.js, js/vendor/jspdf.plugin.autotable.min.js,
            js/vendor/tinos-vietnamese-jspdf.js,
            js/models/teaching-schedule.model.js (chỉ cần cho tham số M truyền vào,
            file này không tự require).
   ============================================================ */
(function (global) {
  'use strict';

  const FONT = 'Tinos';
  const PAGE_MARGIN = 40;

  // Bảng màu LẤY ĐÚNG từ file Excel gốc (mã màu đọc trực tiếp từ style ô,
  // xem ghi chú ở đầu file) — KHÔNG dùng lại bảng màu theo TYPE_COLOR (mỗi
  // loại hình 1 màu) của bản trước, vì Excel gốc chỉ tô nền theo BUỔI
  // (vàng/xanh lá), chữ mới đổi màu theo Ý NGHĨA (loại hình/địa điểm/nhãn).
  const TITLE_RED = [255, 0, 0];
  const SUBTLE_BLUE = [0, 112, 192];      // 0070C0 — giá trị địa điểm/mã lớp
  const TYPE_LABEL_BLUE = [0, 112, 192];  // nhãn "Chọn loại hình phụ trách"
  const LOCATION_LABEL_BLUE = [68, 114, 196]; // 4472C4 — nhãn "Địa điểm giảng dạy"
  const TYPE_VALUE_NAVY = [0, 32, 96];    // 002060 — giá trị loại hình
  const HEADER_ORANGE = [227, 108, 9];    // E36C09 — nền hàng tiêu đề bảng
  const SANG_BG = [255, 242, 204];        // FFF2CC
  const SANG_TEXT = [237, 125, 49];       // ED7D31 — chữ "SÁNG" + số tiết
  const CHIEU_BG = [226, 239, 218];       // E2EFDA
  const CHIEU_TEXT = [55, 86, 35];        // 375623 — chữ "CHIỀU" + số tiết
  const SEPARATOR_GREEN = [0, 176, 80];   // 00B050 — viền phân cách giữa các Thứ
  const YELLOW_HILITE = [255, 255, 0];    // nền vàng cho giá trị "Tuần ..."
  const GRAY = [140, 140, 140];
  const BORDER_GRAY = [180, 180, 180];

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

  /** Vẽ phần đầu trang kiểu "mẫu Excel gốc": tiêu đề đỏ căn giữa + các
   * dòng thông tin (Thời gian áp dụng/Mã NV/Họ tên/SĐT/Địa chỉ) — trả về
   * toạ độ Y để vẽ bảng lịch tiếp theo, TÍNH ĐỘNG theo số dòng thật (địa
   * chỉ dài tự xuống dòng qua doc.splitTextToSize, không tràn lề/đè bảng). */
  function drawHeader(doc, { teacherName, teacherCode, teacherPhone, teacherAddress, weekLabel }) {
    const pageWidth = doc.internal.pageSize.getWidth();
    const contentWidth = pageWidth - PAGE_MARGIN * 2;

    doc.setFillColor(...TITLE_RED);
    doc.rect(0, 0, pageWidth, 4, 'F');

    const logo = global.EduIigLogo;
    if (logo) {
      const logoW = 42;
      const logoH = logoW * logo.aspect;
      doc.addImage(logo.base64, 'PNG', PAGE_MARGIN, 12, logoW, logoH);
    }

    let y = 30;
    doc.setFont(FONT, 'bold');
    doc.setFontSize(20);
    doc.setTextColor(...TITLE_RED);
    doc.text('LỊCH GIẢNG DẠY', pageWidth / 2, y, { align: 'center' });

    doc.setFont(FONT, 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...GRAY);
    doc.text(`Xuất lúc: ${nowLabel()}`, pageWidth - PAGE_MARGIN, 16, { align: 'right' });

    y += 22;
    doc.setFont(FONT, 'bold');
    doc.setFontSize(11.5);
    doc.setTextColor(30, 30, 30);
    const labelThoiGian = 'Thời gian áp dụng: ';
    doc.text(labelThoiGian, PAGE_MARGIN, y);
    const labelW = doc.getTextWidth(labelThoiGian);
    const weekText = `Tuần ${weekLabel || ''}`;
    doc.setFont(FONT, 'bolditalic');
    const weekW = doc.getTextWidth(weekText);
    // Nền vàng ĐÚNG kiểu ô B4 trong Excel gốc — vẽ rect trước rồi in chữ
    // đè lên trên (jsPDF không có khái niệm "cell highlight" cho text rời).
    doc.setFillColor(...YELLOW_HILITE);
    doc.rect(PAGE_MARGIN + labelW - 2, y - 10.5, weekW + 4, 13.5, 'F');
    doc.setTextColor(0, 0, 0);
    doc.text(weekText, PAGE_MARGIN + labelW, y);

    y += 18;
    doc.setFont(FONT, 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(30, 30, 30);
    // Gộp mọi khoảng trắng/xuống dòng trong tên (dữ liệu dán từ Excel hay có
    // ký tự xuống dòng ẩn) thành 1 khoảng trắng — nếu không, jsPDF sẽ coi
    // "\n" trong chuỗi là lệnh xuống dòng thật, làm tên bị "rớt" xuống hàng
    // dưới và đè lên dòng SĐT/Địa chỉ kế tiếp.
    const oneLine = (s) => String(s || '').replace(/\s+/g, ' ').trim();
    const line2 = `Mã NV: ${oneLine(teacherCode)}      Họ tên giáo viên: ${oneLine(teacherName) || '(chưa rõ tên)'}`;
    doc.text(line2, PAGE_MARGIN, y);

    let lines3 = [];
    if (teacherPhone || teacherAddress) {
      y += 16;
      const parts = [];
      if (teacherPhone) parts.push(`SĐT: ${oneLine(teacherPhone)}`);
      if (teacherAddress) parts.push(`Địa chỉ: ${oneLine(teacherAddress)}`);
      const line3 = parts.join('      ');
      // splitTextToSize BỌC ĐÚNG theo bề rộng in được của font đang dùng —
      // địa chỉ dài tới đâu cũng không tràn lề, số dòng trả về là con số
      // THẬT để tính đúng khoảng cách xuống bảng bên dưới ("rớt dòng").
      lines3 = doc.splitTextToSize(line3, contentWidth);
      doc.text(lines3, PAGE_MARGIN, y);
    }

    y += Math.max(0, (lines3.length - 1)) * 13 + 12;
    doc.setDrawColor(...BORDER_GRAY);
    doc.setLineWidth(0.8);
    doc.line(PAGE_MARGIN, y, pageWidth - PAGE_MARGIN, y);
    doc.setTextColor(0, 0, 0);
    return y + 8;
  }

  /** Đọc mã lớp CỦA ĐÚNG 1 TIẾT — periods[i] thường là chuỗi mã lớp, dữ
   * liệu CŨ (giai đoạn chỉ tích chọn) có thể vẫn là boolean true. */
  function periodValue(sess, pi) {
    const raw = sess.periods && sess.periods[pi];
    if (typeof raw === 'string') return raw.trim();
    return raw ? '✓' : '';
  }

  /** Vẽ bảng lịch kiểu "mẫu Excel gốc" — mỗi buổi (Sáng/Chiều) tách thành
   * 7 hàng: 1 hàng "Chọn loại hình phụ trách" + 1 hàng "Địa điểm giảng
   * dạy" + 5 hàng "Tiết 1..5" (M.PERIODS_PER_SESSION, LUÔN cố định 5 dù
   * Chiều thường chỉ dạy 4 — đúng số hàng cố định trong file Excel gốc,
   * không phải lỗi). Cột "Buổi" gộp dòng (rowSpan) xuyên suốt cả 7 hàng
   * của buổi đó, nền vàng nhạt (Sáng)/xanh lá nhạt (Chiều) phủ TOÀN BỘ 7
   * hàng — đúng cách tô nền theo BUỔI của Excel gốc (không tô theo từng
   * loại hình phụ trách như bản trước). Trả về toạ độ Y ngay dưới bảng. */
  function buildScheduleTable(doc, days, M, startY) {
    const totalCols = 2 + M.WEEKDAYS.length;
    const head = [['Buổi', 'Thông tin', ...M.WEEKDAYS.map((d) => M.WEEKDAY_LABELS[d])]];
    const body = [];

    M.SESSIONS.forEach((sessionKey) => {
      const isSang = sessionKey === 'morning';
      const bg = isSang ? SANG_BG : CHIEU_BG;
      const labelColor = isSang ? SANG_TEXT : CHIEU_TEXT;
      const rowCount = 2 + M.PERIODS_PER_SESSION;

      const sessOf = (d) => (days[String(d)] || M.emptyDay())[sessionKey];

      // Hàng 1: "Chọn loại hình phụ trách" — cột "Buổi" bắt đầu rowSpan ở đây.
      body.push([
        {
          content: isSang ? 'SÁNG' : 'CHIỀU',
          rowSpan: rowCount,
          styles: { fillColor: bg, textColor: labelColor, fontStyle: 'bold', fontSize: 10.5 },
        },
        { content: 'Chọn loại hình\nphụ trách', styles: { fillColor: bg, textColor: TYPE_LABEL_BLUE, fontStyle: 'bold', fontSize: 8.3, cellPadding: 4, halign: 'left' } },
        ...M.WEEKDAYS.map((d) => {
          const sess = sessOf(d);
          return { content: sess.type || '—', styles: { fillColor: bg, textColor: sess.type ? TYPE_VALUE_NAVY : GRAY } };
        }),
      ]);

      // Hàng 2: "Địa điểm giảng dạy".
      body.push([
        { content: 'Địa điểm\ngiảng dạy', styles: { fillColor: bg, textColor: LOCATION_LABEL_BLUE, fontStyle: 'bold', fontSize: 8.3, cellPadding: 4, halign: 'left' } },
        ...M.WEEKDAYS.map((d) => {
          const sess = sessOf(d);
          // Buổi dạy Ở 2 TRƯỜNG ("Trường A + Trường B") — xuống dòng thay
          // vì để dính 1 chuỗi dài dễ tràn cột hẹp, mỗi trường 1 dòng cho
          // dễ đọc (bảng PDF chỉ có 1 cột/ngày, không tách 2 cột được).
          const schools = M.splitLocations(sess.location);
          return { content: schools.length ? schools.join('\n') : '—', styles: { fillColor: bg, textColor: schools.length ? SUBTLE_BLUE : GRAY } };
        }),
      ]);

      // Hàng 3-7: "Tiết 1".."Tiết 5".
      for (let pi = 0; pi < M.PERIODS_PER_SESSION; pi++) {
        body.push([
          { content: String(pi + 1), styles: { fillColor: bg, textColor: labelColor, fontStyle: 'bold', fontSize: 9 } },
          ...M.WEEKDAYS.map((d) => {
            const sess = sessOf(d);
            const val = periodValue(sess, pi);
            return { content: val || '—', styles: { fillColor: bg, textColor: val ? SUBTLE_BLUE : GRAY } };
          }),
        ]);
      }
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    // Bề rộng cột "Buổi" đo THẬT theo chữ "SÁNG"/"CHIỀU" (bold 12pt, đúng
    // cỡ/độ đậm sẽ in) — cố định 34pt trước đây KHÔNG đủ chỗ, chữ bị ngắt
    // dòng giữa từ ("SÁNG" → "SÁN"+"G", "CHIỀU" → "CHI"+"ỀU"), đúng lỗi đã
    // từng gặp và sửa ở js/export/teaching-timetable-pdf.js.
    doc.setFont(FONT, 'bold');
    doc.setFontSize(10.5);
    const buoiTextW = Math.max(doc.getTextWidth('SÁNG'), doc.getTextWidth('CHIỀU'));
    const buoiColWidth = buoiTextW + 14;
    const infoColWidth = 78;
    const dayColWidth = (pageWidth - PAGE_MARGIN * 2 - buoiColWidth - infoColWidth) / M.WEEKDAYS.length;
    const columnStyles = {
      0: { cellWidth: buoiColWidth, halign: 'center' },
      1: { cellWidth: infoColWidth },
    };
    M.WEEKDAYS.forEach((_, i) => { columnStyles[i + 2] = { cellWidth: dayColWidth }; });

    // cellPadding/fontSize CỐ TÌNH thu nhỏ hơn so với bản trước (5pt/9.5pt)
    // — bảng LUÔN có đúng 15 hàng cố định (1 head + 2 buổi × 7 hàng, xem
    // comment buildScheduleTable ở trên), nên có thể tính trước tổng chiều
    // cao và ép đủ trong 1 trang A4 ngang (595pt) cùng bảng thống kê bên
    // dưới — tránh lỗi ĐÃ GẶP: bảng + thống kê vượt quá chiều cao trang,
    // khiến AutoTable tự chèn thêm trang 2 và "rớt" nốt bảng thống kê xuống
    // đó (mất liền mạch, tưởng thiếu dữ liệu dù dữ liệu vẫn còn).
    global.autoTable(doc, {
      startY,
      margin: { left: PAGE_MARGIN, right: PAGE_MARGIN, bottom: PAGE_MARGIN },
      head, body,
      theme: 'grid',
      tableLineColor: BORDER_GRAY,
      tableLineWidth: 0.6,
      headStyles: { font: FONT, fillColor: HEADER_ORANGE, textColor: 255, fontStyle: 'bold', fontSize: 9, cellPadding: 3, halign: 'center' },
      styles: { font: FONT, fontSize: 8.3, cellPadding: 3, valign: 'middle', halign: 'center', overflow: 'linebreak' },
      columnStyles,
      // Viền phân cách ĐẬM MÀU XANH LÁ giữa các cột Thứ — Excel gốc dùng
      // nét đứt xanh lá (00B050) để tách rõ từng Thứ, AutoTable không vẽ
      // được nét đứt cho viền ô nên thay bằng nét liền CÙNG MÀU (didDrawCell
      // vẽ đè 1 đường kẻ tay sau khi ô đã vẽ xong).
      didDrawCell: (data) => {
        if (data.column.index < 2 || data.column.index >= totalCols - 1) return;
        doc.setDrawColor(...SEPARATOR_GREEN);
        doc.setLineWidth(1.1);
        const { x, y, width, height } = data.cell;
        doc.line(x + width, y, x + width, y + height);
      },
    });
    return doc.lastAutoTable.finalY;
  }

  /** Bảng thống kê tuần (2 cặp label:value × 4 hàng) — cùng số liệu với
   * "Thống kê tuần" trên web (M.computeWeekStats), font/màu đồng bộ theo
   * giao diện mới (Tinos, xanh dương) thay vì tím thương hiệu mặc định. */
  function buildStatsTable(doc, stats, startY, pageHeight) {
    const pageWidth = doc.internal.pageSize.getWidth();
    const contentWidth = pageWidth - PAGE_MARGIN * 2;
    const pairWidth = contentWidth / 2;
    const valueWidth = 44;
    const labelWidth = pairWidth - valueWidth;

    const rows = [
      ['Trường dạy chính', stats.schoolsMain, 'Tiết dạy chính', stats.periodsMain],
      ['Trường dạy trám', stats.schoolsSub, 'Tiết dạy trám', stats.periodsSub],
      ['Tiết ôn thi (TT/Online)', stats.periodsReview, 'Buổi soạn bài', stats.sessionsPrep],
      ['Buổi làm tại cty', stats.sessionsOffice, 'Lần trợ giảng/dự giảng', stats.sessionsMentor],
    ];
    const body = rows.map(([l1, v1, l2, v2]) => [l1, String(v1), l2, String(v2)]);

    // Co giãn theo khoảng trống THẬT còn lại phía dưới bảng lịch (thay vì
    // cỡ chữ/khoảng cách cố định như bản trước) — đảm bảo khối thống kê
    // LUÔN vừa trong phần còn lại của trang, không bao giờ bị AutoTable tự
    // tách sang trang 2 (đúng lỗi đã gặp: hàng đầu ở trang 1, 3 hàng còn
    // lại "rớt" xuống trang 2). titleBlockH/rowH dưới đây là cỡ MẶC ĐỊNH
    // (đủ rộng rãi khi trang còn nhiều chỗ trống); factor < 1 khi chật.
    const titleBlockH = 20;
    const rowH = 20;
    const gapAboveDefault = 14;
    const desiredBlockH = gapAboveDefault + titleBlockH + rows.length * rowH;
    const remaining = Math.max(0, pageHeight - PAGE_MARGIN - startY);
    const factor = Math.max(0.55, Math.min(1, remaining / desiredBlockH));

    const fontSize = 11.5 * factor;
    const cellPadding = Math.max(2, 8 * factor);
    const titleFontSize = Math.max(9, 12 * factor);
    const gapAbove = Math.max(6, gapAboveDefault * factor);
    let y = startY + gapAbove;

    doc.setFont(FONT, 'bold');
    doc.setFontSize(titleFontSize);
    doc.setTextColor(...SUBTLE_BLUE);
    doc.text('THỐNG KÊ TUẦN', PAGE_MARGIN, y);
    doc.setTextColor(0, 0, 0);
    y += Math.max(10, 14 * factor);

    global.autoTable(doc, {
      startY: y,
      margin: { left: PAGE_MARGIN, right: PAGE_MARGIN, bottom: PAGE_MARGIN },
      body,
      theme: 'grid',
      tableLineColor: BORDER_GRAY,
      tableLineWidth: 0.6,
      styles: { font: FONT, fontSize, cellPadding, valign: 'middle' },
      columnStyles: {
        0: { textColor: GRAY, halign: 'left', cellWidth: labelWidth },
        1: { fontStyle: 'bold', halign: 'left', textColor: TYPE_VALUE_NAVY, cellWidth: valueWidth },
        2: { textColor: GRAY, halign: 'left', cellWidth: labelWidth },
        3: { fontStyle: 'bold', halign: 'left', textColor: TYPE_VALUE_NAVY, cellWidth: valueWidth },
      },
    });
    return doc.lastAutoTable.finalY;
  }

  function drawOnePage(doc, teacher, days, weekLabel, M, { isFirstPage }) {
    if (!isFirstPage) doc.addPage();
    // startY LẤY TỪ drawHeader() (không còn số cố định) — địa chỉ/tên dài
    // xuống mấy dòng thì bảng cũng tự lùi xuống đúng bấy nhiêu, không bao
    // giờ đè lên phần header phía trên.
    const tableStartY = drawHeader(doc, {
      teacherName: teacher.name,
      teacherCode: teacher.code || teacher.id,
      teacherPhone: teacher.phone,
      teacherAddress: teacher.address,
      weekLabel,
    });
    const tableEndY = buildScheduleTable(doc, days, M, tableStartY);
    const pageHeight = doc.internal.pageSize.getHeight();
    buildStatsTable(doc, M.computeWeekStats(days), tableEndY, pageHeight);
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

  /** Trên điện thoại/tablet (thiết bị cầm tay chạm chính — dò bằng
   * "pointer: coarse" thay vì bề rộng màn hình, vì tablet màn rộng vẫn
   * dùng chạm), doc.save() KHÔNG lỗi nhưng hành vi khác desktop: Safari
   * iOS/iPadOS thường MỞ THẲNG PDF trong tab mới thay vì tự tải xuống
   * (đúng cách Safari xử lý MỌI file PDF trên web, không riêng gì app
   * này) — không báo trước dễ khiến người dùng tưởng "bấm không có tác
   * dụng gì". Hiện 1 lần duy nhất/thiết bị (ghi nhớ qua localStorage) để
   * không làm phiền những lần xuất sau. Lỗi đọc localStorage (chế độ ẩn
   * danh chặn) chỉ bỏ qua gợi ý, KHÔNG được chặn việc xuất PDF thật sự. */
  function maybeShowMobileSaveHint() {
    try {
      if (!(global.matchMedia && global.matchMedia('(pointer: coarse)').matches)) return;
      if (global.localStorage.getItem('eduPdfMobileHintShown')) return;
      global.localStorage.setItem('eduPdfMobileHintShown', '1');
    } catch (err) { return; }
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = 'ℹ️ Trên điện thoại/tablet, PDF thường mở ngay trong tab mới — bấm biểu tượng Chia sẻ rồi chọn "Lưu vào Files/Tải xuống" để lưu lại máy.';
    el.classList.add('show');
    clearTimeout(el._mobileHintT);
    el._mobileHintT = setTimeout(() => el.classList.remove('show'), 5200);
  }

  /** Xuất 1 file PDF cho ĐÚNG 1 giáo viên/1 tuần — nút "🖨️ PDF" từng hàng
   * (admin/coordinator) hoặc "🖨️ Xuất PDF" trong "Lịch của tôi" (giáo viên). */
  function exportOne(teacher, days, weekLabel, M) {
    if (!ensureLibsLoaded()) return;
    maybeShowMobileSaveHint();
    const { jsPDF } = global.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape' });
    drawOnePage(doc, teacher, days, weekLabel, M, { isFirstPage: true });
    doc.save(`lich-${slugify(teacher.name || teacher.code)}-${slugify(weekLabel)}.pdf`);
  }

  /** Xuất 1 file PDF DUY NHẤT gồm lịch của NHIỀU giáo viên, mỗi người 1
   * trang — nút "🖨️ Xuất PDF tất cả" trên thanh công cụ (chỉ admin/coordinator).
   * @param {Array<{teacher, days}>} list
   */
  function exportMany(list, weekLabel, M) {
    if (!ensureLibsLoaded()) return;
    if (!list.length) return;
    maybeShowMobileSaveHint();
    const { jsPDF } = global.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape' });
    list.forEach(({ teacher, days }, i) => {
      drawOnePage(doc, teacher, days, weekLabel, M, { isFirstPage: i === 0 });
    });
    doc.save(`lich-giang-day-${slugify(weekLabel)}.pdf`);
  }

  global.EduTeachingSchedulePdf = { exportOne, exportMany };
})(window);
