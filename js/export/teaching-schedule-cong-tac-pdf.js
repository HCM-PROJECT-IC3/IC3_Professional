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
     - Mục đích             ← CỐ ĐỊNH "Giảng dạy IC3" (hằng số PURPOSE,
       đúng nguyên văn file .doc gốc) — bản trước từng cho người dùng CHỌN
       giữa Giảng dạy/Ôn Thi qua modal, nhưng người dùng phản hồi bỏ hẳn
       lựa chọn này, không hỏi gì thêm khi xuất nữa.
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

  // "Mục đích" KHÔNG còn cho chọn nữa (bản trước có modal chọn Giảng dạy/
  // Ôn Thi — người dùng phản hồi bỏ hẳn lựa chọn, luôn cố định đúng câu
  // chữ trong file .doc gốc "Mục đích : Giảng dạy IC3").
  const PURPOSE = 'Giảng dạy IC3';

  // Logo IIG — dùng chung window.EduIigLogo (xem js/export/iig-logo.js,
  // nạp TRƯỚC file này) thay vì tự nhúng lại chuỗi base64 ở đây.
  const LOGO_B64 = global.EduIigLogo.base64;
  const LOGO_ASPECT = global.EduIigLogo.aspect;

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

  /** Trên điện thoại/tablet (dò bằng "pointer: coarse", không phải bề
   * rộng màn hình — tablet màn rộng vẫn dùng chạm), doc.save() KHÔNG lỗi
   * nhưng hành vi khác desktop: Safari iOS/iPadOS thường MỞ THẲNG PDF
   * trong tab mới thay vì tự tải xuống (cách Safari xử lý MỌI PDF trên
   * web, không riêng app này) — hiện gợi ý 1 lần/thiết bị (nhớ qua
   * localStorage) để người dùng không tưởng "bấm không có tác dụng". Lỗi
   * đọc localStorage (chế độ ẩn danh chặn) chỉ bỏ gợi ý, KHÔNG chặn xuất
   * PDF thật sự — xem cùng cơ chế trong js/export/teaching-schedule-pdf.js. */
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
   */
  function drawOnePage(doc, teacher, days, weekKey, M) {
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
    n = drawLabelValue(doc, 'Mục đích: ', PURPOSE, MARGIN, y, contentWidth);
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
  }

  /** Xuất "Phiếu công tác" cho ĐÚNG 1 giáo viên/1 tuần — 1 file PDF/1 trang.
   * @param {{name:string, code?:string, id?:string}} teacher
   * @param {Object} days      Dữ liệu "days" của teaching_schedule (Lịch tuần)
   * @param {string} weekLabel (không hiện trên PDF — chỉ giữ tham số để
   *   tương thích chữ ký hàm, phòng khi cần dùng lại sau này)
   * @param {string} weekKey   Xem drawOnePage()
   * @param {Object} M         window.EduModels.TeachingSchedule
   */
  function exportOne(teacher, days, weekLabel, weekKey, M) {
    if (!ensureLibsLoaded()) return;
    maybeShowMobileSaveHint();
    const { jsPDF } = global.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' });
    drawOnePage(doc, teacher, days, weekKey, M);
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
   * @param {string} [fileSuffix] Hậu tố tên file (thường là nhãn tuần đã slug hoá)
   */
  function exportMany(list, weekKey, M, fileSuffix) {
    if (!ensureLibsLoaded()) return;
    if (!list.length) return;
    maybeShowMobileSaveHint();
    const { jsPDF } = global.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' });
    list.forEach(({ teacher, days }, i) => {
      if (i > 0) doc.addPage();
      drawOnePage(doc, teacher, days, weekKey, M);
    });
    doc.save(`Phieu_Cong_Tac_Tat_Ca${fileSuffix ? `_${slugName(fileSuffix)}` : ''}.pdf`);
  }

  global.EduCongTacPdf = { exportOne, exportMany };
})(window);
