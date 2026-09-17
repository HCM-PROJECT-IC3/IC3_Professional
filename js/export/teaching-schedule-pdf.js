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

  // Màu nền + màu CHỮ của ô "Loại hình" trong bảng PDF — CÙNG Ý NGHĨA với
  // tc-chip/day-card-session trên web (xem css/teaching-schedule.css) và
  // KHỚP ĐÚNG bảng màu chữ người dùng cung cấp, để bản in ra nhận diện
  // được loại hình bằng màu y hệt màn hình. Nền luôn nhạt (gần trắng),
  // chữ luôn đậm — đủ tương phản để đọc/in trắng đen vẫn rõ.
  const TYPE_COLOR = {
    'Dạy chính':        { bg: [227, 250, 246], text: [15, 133, 122] },  // teal — "Dạy Trực Tiếp"
    'Dạy Trám':         { bg: [231, 242, 254], text: [30, 100, 190] },  // xanh dương
    'Dạy Trực Tuyến':   { bg: [228, 250, 238], text: [21, 140, 84] },   // xanh lá
    'Ôn Thi':           { bg: [236, 240, 255], text: [79, 107, 255] },  // tím
    'Trợ Giảng':        { bg: [250, 231, 244], text: [196, 54, 144] },  // hồng/magenta
    'Dự Giảng':         { bg: [255, 239, 226], text: [163, 84, 0] },    // cam
    'Soạn bài':         { bg: [246, 248, 254], text: [102, 112, 133] }, // trung tính
    'Làm việc tại cty': { bg: [253, 232, 231], text: [200, 40, 30] },   // đỏ
    'WFH':              { bg: [255, 246, 227], text: [122, 88, 0] },    // vàng đậm
    'Khám SK':          { bg: [253, 232, 231], text: [200, 40, 30] },   // đỏ
    'Nghỉ phép/ lễ':    { bg: [246, 248, 254], text: [27, 32, 54] },    // đen/trung tính
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
   * bên dưới ("rớt dòng"). Logo IIG thật (window.EduIigLogo, xem
   * js/export/iig-logo.js) ở góc trái trên — GIỐNG hệt logo dùng ở
   * "📋 Phiếu công tác" (js/export/teaching-schedule-cong-tac-pdf.js). */
  function drawHeader(doc, { teacherName, teacherCode, weekLabel }) {
    const pageWidth = doc.internal.pageSize.getWidth();
    const contentWidth = pageWidth - PAGE_MARGIN * 2;

    doc.setFillColor(...BRAND);
    doc.rect(0, 0, pageWidth, 5, 'F');

    const logo = global.EduIigLogo;
    let titleX = PAGE_MARGIN;
    if (logo) {
      const logoW = 50;
      const logoH = logoW * logo.aspect;
      doc.addImage(logo.base64, 'PNG', PAGE_MARGIN, 16, logoW, logoH);
      titleX = PAGE_MARGIN + logoW + 14;
    }

    let y = 34;
    doc.setTextColor(30, 30, 40);
    doc.setFont('NotoSans', 'bold');
    doc.setFontSize(16);
    doc.text('LỊCH GIẢNG DẠY', titleX, y);

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
    const lines = doc.splitTextToSize(subtitle, contentWidth - (titleX - PAGE_MARGIN));
    doc.text(lines, titleX, y);
    y = Math.max(y + lines.length * 14, 16 + logoW_H(logo));

    y += 8;
    doc.setDrawColor(220, 222, 235);
    doc.setLineWidth(0.8);
    doc.line(PAGE_MARGIN, y, pageWidth - PAGE_MARGIN, y);
    doc.setTextColor(0, 0, 0);
    return y + 14;
  }

  /** Chiều cao thật của logo (đã scale theo logoW=50 ở drawHeader) — dùng để
   * đảm bảo đường kẻ phân cách luôn nằm DƯỚI logo, không đè lên nhau khi
   * dòng phụ đề (tên GV/mã NV/tuần) ngắn hơn chiều cao logo. */
  function logoW_H(logo) {
    return logo ? 50 * logo.aspect : 0;
  }

  /** Gom các tiết LIÊN TIẾP dạy CÙNG 1 lớp thành 1 dòng "Tiết x–y: lớp"
   * thay vì liệt kê từng tiết rời rạc kiểu "T1=6A2, T2=6A8" (khó đọc, dễ
   * nhầm dấu "=" là phép toán) — vd 2 tiết liền dạy cùng lớp 6A2 in gọn
   * thành "Tiết 1–2: 6A2" thay vì "Tiết 1: 6A2" + "Tiết 2: 6A2" 2 dòng.
   * Dữ liệu CŨ (giai đoạn chỉ tích chọn, periods[i] là boolean true, chưa
   * có mã lớp) vẫn gom được bình thường, chỉ in "Tiết x–y" không kèm lớp. */
  function periodGroups(periods) {
    const list = periods || [];
    const groups = [];
    let i = 0;
    while (i < list.length) {
      const p = list[i];
      if (!p) { i++; continue; }
      const code = typeof p === 'string' ? p.trim() : null;
      let j = i;
      while (j + 1 < list.length) {
        const next = list[j + 1];
        const nextCode = next ? (typeof next === 'string' ? next.trim() : null) : undefined;
        if (!next || nextCode !== code) break;
        j++;
      }
      const range = i === j ? `Tiết ${i + 1}` : `Tiết ${i + 1}–${j + 1}`;
      groups.push(code ? `${range}: ${code}` : range);
      i = j + 1;
    }
    return groups;
  }

  /** Nội dung 1 ô (Buổi × Thứ) trong bảng lịch: loại hình + địa điểm + mỗi
   * nhóm tiết/lớp 1 dòng riêng (xem periodGroups) cho dễ đọc khi in. */
  function sessionCellText(sess, M) {
    if (!sess || !sess.type) return '—';
    const lines = [sess.type];
    if (sess.location) lines.push(sess.location);
    lines.push(...periodGroups(sess.periods));
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
          if (color) {
            data.cell.styles.fillColor = color.bg;
            data.cell.styles.textColor = color.text;
          }
        }
      },
    });
    return doc.lastAutoTable.finalY;
  }

  /** Bảng thống kê tuần (2 cặp label:value × 4 hàng) — cùng số liệu với
   * "Thống kê tuần" trên web (M.computeWeekStats). Cột "value" đặt NGAY
   * SÁT cột "label" (canh trái, bề rộng hẹp vừa đủ số) thay vì canh phải ở
   * mép ngoài bảng — trước đây label/value tách xa nhau ở 2 đầu bảng nên
   * dễ đọc nhầm số của nhóm khác, giờ mỗi cặp label:value dính liền nhau
   * như 1 khối, đọc thẳng theo hàng ngang không bị lạc số. */
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

    // Ước lượng chiều cao khối "tiêu đề + bảng" để CĂN GIỮA phần không
    // gian còn trống dưới bảng lịch (thay vì luôn dán sát ngay dưới bảng
    // lịch, để lại 1 mảng trắng trống lớn phía dưới cùng trang in ngang).
    const titleBlockH = 26;
    const rowH = 30; // fontSize 12 + cellPadding 9*2, ước lượng
    const estBlockH = titleBlockH + rows.length * rowH;
    const remaining = pageHeight - PAGE_MARGIN - startY;
    const gapAbove = Math.max(26, (remaining - estBlockH) / 2);
    let y = startY + gapAbove;

    doc.setFont('NotoSans', 'bold');
    doc.setFontSize(11.5);
    doc.setTextColor(...BRAND);
    doc.text('THỐNG KÊ TUẦN', PAGE_MARGIN, y);
    doc.setTextColor(0, 0, 0);
    y += 14;

    global.autoTable(doc, {
      startY: y,
      margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
      body,
      theme: 'grid',
      tableLineColor: [220, 222, 235],
      tableLineWidth: 0.8,
      styles: { font: 'NotoSans', fontSize: 12, cellPadding: 9, valign: 'middle' },
      columnStyles: {
        0: { textColor: GRAY, halign: 'left', cellWidth: labelWidth },
        1: { fontStyle: 'bold', halign: 'left', textColor: [30, 30, 40], cellWidth: valueWidth },
        2: { textColor: GRAY, halign: 'left', cellWidth: labelWidth },
        3: { fontStyle: 'bold', halign: 'left', textColor: [30, 30, 40], cellWidth: valueWidth },
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
