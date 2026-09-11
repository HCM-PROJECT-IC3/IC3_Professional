/* ============================================================
   js/export/teaching-schedule-cong-tac-pdf.js
   Xuất "PHIẾU CÔNG TÁC" (mẫu Word gốc: On_Tap_MOS/Phieu cong tac.doc) ra
   PDF, TỰ ĐỘNG điền theo đúng Lịch tuần (teaching_schedule) của 1 giáo
   viên/1 tuần — thay vì phải mở file Word gõ tay từng tuần:
     - Logo IIG + tiêu đề       ← lấy đúng ảnh logo nhúng trong file Word
       gốc (xuất thử file gốc ra PDF rồi trích ảnh, xem LOGO_B64 bên dưới).
     - Họ và tên nhân viên  ← tên giáo viên.
     - Bộ phận              ← cố định "Dự Án HCM" (đúng mẫu gốc — team này
                              chỉ có 1 bộ phận, không cần chọn).
     - Tên khách hàng cần gặp ← các "Địa điểm/tên trường" (field `location`
       của Sáng/Chiều, mọi Thứ trong tuần) — GỘP TRÙNG (1 trường có thể
       dạy nhiều buổi/nhiều ngày trong tuần, chỉ liệt kê 1 lần), giữ đúng
       thứ tự xuất hiện đầu tiên (Thứ2 → Thứ7, Sáng → Chiều).
     - Thời gian            ← ĐƠN GIẢN, 1 dòng/NGÀY thật sự có dạy (không
       tách theo buổi Sáng/Chiều/loại hình/trường — người dùng phản hồi chỉ
       cần gọn đúng mẫu giấy gốc): "Từ 08:00 đến 17:30, ngày {d} tháng {m}
       năm {y}" — khung giờ hành chính CỐ ĐỊNH (WORKDAY_START/END), CHỈ
       ngày là đổi theo Lịch tuần thật, không tính theo giờ tiết cụ thể
       (từng thử, ra giờ lẻ tẻ khác nhau mỗi ngày — không cần thiết).
     - Mục đích             ← do người dùng CHỌN lúc xuất (Giảng dạy/Ôn
       Thi — 2 lựa chọn duy nhất mẫu gốc dùng, xem modal trong
       teaching-schedule.html), KHÔNG suy luận tự động vì 1 tuần có thể
       vừa dạy vừa ôn thi, không có 1 câu trả lời "đúng" duy nhất.
     - Chữ ký người đi công tác ← tên giáo viên (chữ in, không phải chữ ký
       tay thật — vẫn cần ký tay/đóng dấu sau khi in như quy trình cũ).
     - Ngày...tháng...năm   ← NGÀY XUẤT FILE (thời điểm bấm nút), không
       phải ngày đầu tuần lịch — đúng yêu cầu "chọn theo thời điểm xuất".

   FONT/CỠ CHỮ khớp ĐÚNG file Word gốc (trích bằng cách mở file .doc qua
   Word COM và đọc Range.Font.Name/Size của từng đoạn — xem lịch sử trò
   chuyện): toàn bộ nội dung Times New Roman 13, riêng tiêu đề "PHIẾU CÔNG
   TÁC" 14 Đậm, 2 dòng chú thích chữ ký ("Chữ ký người đi công tác"/"Xác
   nhận của Trưởng bộ phận") 13 Đậm, dòng ngày ký 13 Nghiêng.
   KHÔNG dùng thẳng font "Times New Roman" của Microsoft (độc quyền, không
   được phép đóng gói phân phối lại trong mã nguồn ứng dụng) — dùng "Tinos"
   (Google Fonts, SIL Open Font License 1.1), bản THAY THẾ MIỄN PHÍ tương
   thích số đo với Times New Roman, xem js/vendor/tinos-vietnamese-jspdf.js.

   Dùng lại đúng jsPDF đã nạp sẵn cho js/export/teaching-schedule-pdf.js —
   không thêm thư viện mới.
   Nạp SAU: js/vendor/jspdf.umd.min.js, js/vendor/tinos-vietnamese-jspdf.js.
   ============================================================ */
(function (global) {
  'use strict';

  const BRAND = [79, 107, 255]; // #4f6bff — khớp --purple trong css/theme.css
  const GRAY = [110, 110, 120];
  const MARGIN = 56;
  const DEPARTMENT = 'Dự Án HCM'; // cố định theo đúng mẫu Word gốc
  const FONT = 'Tinos';
  const BODY_SIZE = 13; // khớp Font.Size=13 của toàn bộ nội dung trong file .doc gốc
  const TITLE_SIZE = 14; // khớp Font.Size=14 của dòng "PHIẾU CÔNG TÁC" trong file .doc gốc

  // Khung giờ công tác CỐ ĐỊNH cho mọi ngày có dạy — ban đầu thử tính "Từ
  // ... đến ..." theo ĐÚNG giờ tiết thật của từng giáo viên (khung giờ
  // tiết ở tab "🗓️ TKB lớp"), nhưng ra giờ lẻ tẻ khác nhau mỗi ngày (vd
  // "09:20 đến 09:55" nếu hôm đó chỉ dạy 1 tiết giữa buổi) — người dùng
  // phản hồi phiếu công tác chỉ cần 1 khung giờ hành chính CHUẨN, THỐNG
  // NHẤT mọi ngày, không cần khớp chính xác từng tiết. Cố định luôn
  // 08:00–17:30 (giờ hành chính chuẩn), không đọc từ periodTimes nữa.
  const WORKDAY_START = '08:00';
  const WORKDAY_END = '17:30';

  // Logo IIG — trích trực tiếp từ On_Tap_MOS/Phieu cong tac.doc (xuất file
  // gốc ra PDF bằng Word rồi lấy đúng ảnh JPEG nhúng bên trong, không phải
  // vẽ lại/tự chế) — PNG, ~117×65px. File nguồn lưu ở img/iig-logo.png
  // (dùng để tạo lại base64 này sau này nếu cần đổi/nâng cấp ảnh, KHÔNG
  // được HTML nào tham chiếu trực tiếp — chỉ jsPDF addImage() dùng chuỗi
  // base64 nhúng sẵn bên dưới).
  const LOGO_B64 = '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';
  const LOGO_ASPECT = 65 / 117; // height/width thật của ảnh gốc — giữ đúng tỉ lệ khi vẽ

  /** Bỏ dấu tiếng Việt (NFD, lọc khối combining marks) — dùng cho tên file
   * tải về, KHÔNG dùng cho nội dung hiển thị trong PDF (PDF vẫn in có dấu
   * nhờ font Tinos). */
  function stripDiacritics(s) {
    let out = '';
    for (const ch of String(s).normalize('NFD')) {
      const code = ch.codePointAt(0);
      if (code < 0x0300 || code > 0x036f) out += ch;
    }
    return out;
  }
  function slugName(s) {
    return stripDiacritics(s || '')
      .replace(/đ/gi, 'd')
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'Giao_Vien';
  }

  /** Gộp mọi khoảng trắng LIÊN TIẾP (kể cả xuống dòng \n/\r lỡ dính trong
   * dữ liệu gõ tay) về đúng 1 dấu cách — bắt buộc phải qua hàm này trước
   * khi đưa TÊN GIÁO VIÊN vào PDF: jsPDF tự tách dòng theo ký tự "\n" y hệt
   * xuống dòng thật, nên nếu field `name` lỡ có 1 dấu xuống dòng (gõ nhầm/
   * dán từ Excel) thì tên sẽ bị RỚT DÒNG giữa chừng dù đủ chỗ hiển thị
   * trên 1 hàng. */
  function oneLine(s) {
    return String(s || '').replace(/\s+/g, ' ').trim();
  }

  /** Danh sách "Địa điểm/tên trường" đã dạy trong tuần — gộp trùng, giữ
   * đúng thứ tự xuất hiện đầu tiên (Thứ2→7, Sáng→Chiều). */
  function collectSchools(days, M) {
    const seen = new Set();
    const out = [];
    M.WEEKDAYS.forEach((d) => {
      const day = (days && days[String(d)]) || M.emptyDay();
      M.SESSIONS.forEach((s) => {
        const loc = oneLine(day[s] && day[s].location);
        if (loc && !seen.has(loc)) { seen.add(loc); out.push(loc); }
      });
    });
    return out;
  }

  /** Ngày dương lịch cụ thể của 1 Thứ trong tuần — suy từ weekKey (Thứ 2
   * đầu tuần, "YYYY-MM-DD") + số Thứ (2..7, Thứ2 lệch 0 ngày, Thứ7 lệch 5
   * ngày) — xem js/models/teaching-schedule.model.js (WEEKDAYS/weekKey).
   * Trả về '' nếu thiếu weekKey (không chặn xuất PDF, chỉ bớt 1 chi tiết). */
  function dateForWeekday(weekKey, weekdayNum) {
    if (!weekKey) return '';
    const monday = new Date(`${weekKey}T00:00:00`);
    if (Number.isNaN(monday.getTime())) return '';
    const d = new Date(monday);
    d.setDate(monday.getDate() + (weekdayNum - 2));
    return `ngày ${d.getDate()} tháng ${d.getMonth() + 1} năm ${d.getFullYear()}`;
  }

  /** Danh sách dòng "Thời gian" — ĐƠN GIẢN, 1 dòng/NGÀY thật sự có dạy (bất
   * kỳ tiết nào ở Sáng hoặc Chiều có mã lớp/tích chọn): "Từ 08:00 đến
   * 17:30, ngày {d} tháng {m} năm {y}" — khung giờ hành chính CỐ ĐỊNH
   * (WORKDAY_START/END), KHÔNG tính theo giờ tiết thật (từng ra giờ lẻ
   * tẻ khác nhau mỗi ngày, không cần thiết cho phiếu công tác). Chỉ Ngày
   * là thay đổi theo đúng Lịch tuần, giờ luôn thống nhất mọi dòng. */
  function collectTimeLines(days, M, weekKey) {
    const out = [];
    M.WEEKDAYS.forEach((d) => {
      const day = (days && days[String(d)]) || M.emptyDay();
      const hasTaughtPeriod = M.SESSIONS.some((s) => ((day[s] && day[s].periods) || []).some((p) => !!p));
      if (!hasTaughtPeriod) return;
      const dateStr = dateForWeekday(weekKey, d) || `Thứ ${d}`;
      out.push(`Từ ${WORKDAY_START} đến ${WORKDAY_END}, ${dateStr}`);
    });
    return out;
  }

  /** "Nhãn: giá trị" trên ĐÚNG 1 hàng — value đã qua oneLine() ở nơi gọi
   * nên chắc chắn không tự rớt dòng giữa chừng; nếu value quá dài mới bọc
   * (splitTextToSize), nhưng KHÔNG BAO GIỜ xảy ra với các field ngắn như
   * họ tên/bộ phận/mục đích ở khổ A4 hiện tại. */
  function drawLabelValue(doc, label, value, x, y, maxWidth) {
    doc.setFont(FONT, 'normal');
    const lines = doc.splitTextToSize(label + value, maxWidth);
    doc.text(lines, x, y);
    return lines.length;
  }

  /** Vẽ 1 khối danh sách (numbered hoặc bullet "-"), tự xuống dòng theo bề
   * rộng in được, trả về Y ngay dưới khối vừa vẽ. */
  function drawList(doc, items, { x, y, maxWidth, lineHeight, marker }) {
    doc.setFont(FONT, 'normal');
    doc.setFontSize(BODY_SIZE);
    let curY = y;
    items.forEach((item, i) => {
      const bullet = typeof marker === 'function' ? marker(i) : marker;
      const bulletWidth = doc.getTextWidth(bullet);
      const lines = doc.splitTextToSize(item, maxWidth - bulletWidth - 4);
      doc.text(bullet, x, curY);
      doc.text(lines, x + bulletWidth + 4, curY);
      curY += lines.length * lineHeight;
    });
    return curY;
  }

  function ensureLibsLoaded() {
    if (typeof global.jspdf === 'undefined') {
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

  /** Vẽ 1 trang "Phiếu công tác" cho ĐÚNG 1 giáo viên/1 tuần vào `doc` đã
   * có sẵn (dùng chung cho cả exportOne — 1 trang duy nhất — và exportMany
   * — nhiều trang, mỗi giáo viên 1 trang, gọi addPage() trước khi vẽ nếu
   * không phải trang đầu). Tách riêng khỏi việc tạo jsPDF/lưu file để
   * exportMany có thể gộp NHIỀU giáo viên vào 1 file PDF DUY NHẤT thay vì
   * tải về từng file lẻ (giống hệt cách js/export/teaching-schedule-pdf.js
   * đã làm với "🖨️ Xuất PDF tất cả" của Lịch tuần).
   * @param {{name:string, code?:string, id?:string}} teacher
   * @param {Object} days   Dữ liệu "days" của teaching_schedule (Lịch tuần)
   * @param {string} weekKey Thứ 2 đầu tuần "YYYY-MM-DD" — dùng suy ra NGÀY
   *   DƯƠNG LỊCH CỤ THỂ của từng buổi trong mục "Thời gian" (xem
   *   dateForWeekday()); có thể bỏ trống nếu không có, chỉ mất chi tiết
   *   ngày, KHÔNG chặn xuất PDF.
   * @param {Object} M      window.EduModels.TeachingSchedule
   * @param {'Giảng dạy'|'Ôn Thi'} purpose Mục đích do người dùng chọn lúc xuất
   */
  function drawOnePage(doc, teacher, days, weekKey, M, purpose) {
    const pageWidth = doc.internal.pageSize.getWidth();
    const contentWidth = pageWidth - MARGIN * 2;
    const teacherName = oneLine(teacher.name) || '(chưa rõ tên)';

    doc.setFillColor(...BRAND);
    doc.rect(0, 0, pageWidth, 5, 'F');

    // Logo IIG — cùng cỡ tỉ lệ với file gốc, đặt lề trái ngay dưới dải màu
    // thương hiệu; tiêu đề canh giữa CẢ TRANG (không chỉ phần còn lại sau
    // logo) để giữ đúng cảm giác cân đối như bản Word gốc.
    const logoW = 64;
    const logoH = logoW * LOGO_ASPECT;
    const logoY = 16;
    doc.addImage(LOGO_B64, 'PNG', MARGIN, logoY, logoW, logoH);

    doc.setTextColor(20, 20, 30);
    doc.setFont(FONT, 'bold');
    doc.setFontSize(TITLE_SIZE);
    doc.text('PHIẾU CÔNG TÁC', pageWidth / 2, logoY + logoH / 2 + TITLE_SIZE / 3, { align: 'center' });

    let y = logoY + logoH + 30;
    doc.setTextColor(20, 20, 30);
    doc.setFontSize(BODY_SIZE);

    const lineH = 17; // khớp giãn dòng ~1.3× cỡ chữ 13 của file gốc

    let n = drawLabelValue(doc, 'Họ và tên nhân viên: ', teacherName, MARGIN, y, contentWidth);
    y += n * lineH + 4;

    n = drawLabelValue(doc, 'Bộ phận: ', DEPARTMENT, MARGIN, y, contentWidth);
    y += n * lineH + 8;

    doc.setFont(FONT, 'normal');
    doc.text('Tên khách hàng cần gặp:', MARGIN, y);
    y += lineH;
    const schools = collectSchools(days, M);
    if (schools.length) {
      y = drawList(doc, schools, {
        x: MARGIN + 14, y, maxWidth: contentWidth - 14, lineHeight: lineH,
        marker: (i) => `${i + 1}.`,
      });
    } else {
      doc.setTextColor(...GRAY);
      doc.text('(Chưa có lịch dạy trường nào trong tuần này)', MARGIN + 14, y);
      doc.setTextColor(20, 20, 30);
      y += lineH;
    }
    y += 6;

    doc.setFont(FONT, 'normal');
    doc.setFontSize(BODY_SIZE);
    doc.text('Thời gian:', MARGIN, y);
    y += lineH;
    const timeLines = collectTimeLines(days, M, weekKey);
    if (timeLines.length) {
      y = drawList(doc, timeLines, {
        x: MARGIN + 14, y, maxWidth: contentWidth - 14, lineHeight: lineH,
        marker: '-',
      });
    } else {
      doc.setTextColor(...GRAY);
      doc.text('(Chưa có tiết dạy nào trong tuần này)', MARGIN + 14, y);
      doc.setTextColor(20, 20, 30);
      y += lineH;
    }
    y += 8;

    doc.setFontSize(BODY_SIZE);
    n = drawLabelValue(doc, 'Mục đích: ', purpose || 'Giảng dạy', MARGIN, y, contentWidth);
    y += n * lineH + 30;

    // Ngày ký LẤY THEO THỜI ĐIỂM XUẤT FILE (không phải ngày đầu tuần lịch).
    const now = new Date();
    doc.setFont(FONT, 'italic');
    doc.setFontSize(BODY_SIZE);
    doc.text(
      `TP. Hồ Chí Minh, ngày ${now.getDate()} tháng ${now.getMonth() + 1} năm ${now.getFullYear()}`,
      pageWidth - MARGIN, y, { align: 'right' },
    );
    y += 40;

    const colWidth = contentWidth / 2;
    doc.setFont(FONT, 'bold');
    doc.text('Chữ ký người đi công tác', MARGIN + colWidth / 2, y, { align: 'center' });
    doc.text('Xác nhận của Trưởng bộ phận', MARGIN + colWidth + colWidth / 2, y, { align: 'center' });

    y += 56; // chừa khoảng trống để ký tay thật sau khi in
    doc.setFont(FONT, 'normal');
    doc.text(teacherName, MARGIN + colWidth / 2, y, { align: 'center' });

    doc.setFontSize(8.5);
    doc.setTextColor(...GRAY);
    doc.text('Phiếu công tác — tạo tự động từ Lịch giảng dạy', MARGIN, doc.internal.pageSize.getHeight() - 24);
  }

  /** Xuất "Phiếu công tác" cho ĐÚNG 1 giáo viên/1 tuần — 1 file PDF/1 trang.
   * @param {{name:string, code?:string, id?:string}} teacher
   * @param {Object} days      Dữ liệu "days" của teaching_schedule (Lịch tuần)
   * @param {string} weekLabel (không hiện trên PDF — chỉ giữ tham số để
   *   tương thích chữ ký hàm, phòng khi cần dùng lại sau này)
   * @param {string} weekKey   Xem drawOnePage()
   * @param {Object} M         window.EduModels.TeachingSchedule
   * @param {'Giảng dạy'|'Ôn Thi'} purpose
   */
  function exportOne(teacher, days, weekLabel, weekKey, M, purpose) {
    if (!ensureLibsLoaded()) return;
    const { jsPDF } = global.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' });
    drawOnePage(doc, teacher, days, weekKey, M, purpose);
    const teacherName = oneLine(teacher.name);
    doc.save(`Phieu_Cong_Tac_${slugName(teacherName || teacher.code || teacher.id)}.pdf`);
  }

  /** Xuất "Phiếu công tác" của NHIỀU giáo viên (cùng 1 tuần) thành 1 file
   * PDF DUY NHẤT, mỗi giáo viên 1 trang — nút "📋 Xuất PDF tất cả" trên
   * thanh công cụ (chỉ admin), song song với "🖨️ Xuất PDF tất cả" của Lịch
   * tuần đã có sẵn.
   * @param {Array<{teacher, days}>} list Danh sách GV/dữ liệu tuần đang hiển thị
   * @param {string} weekKey
   * @param {Object} M
   * @param {'Giảng dạy'|'Ôn Thi'} purpose
   * @param {string} [fileSuffix] Hậu tố tên file (thường là nhãn tuần đã slug hoá)
   */
  function exportMany(list, weekKey, M, purpose, fileSuffix) {
    if (!ensureLibsLoaded()) return;
    if (!list.length) return;
    const { jsPDF } = global.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' });
    list.forEach(({ teacher, days }, i) => {
      if (i > 0) doc.addPage();
      drawOnePage(doc, teacher, days, weekKey, M, purpose);
    });
    doc.save(`Phieu_Cong_Tac_Tat_Ca${fileSuffix ? `_${slugName(fileSuffix)}` : ''}.pdf`);
  }

  global.EduCongTacPdf = { exportOne, exportMany };
})(window);
