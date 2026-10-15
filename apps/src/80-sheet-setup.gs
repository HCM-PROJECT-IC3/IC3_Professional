
// ====== MENU TÙY CHỈNH TRÊN GOOGLE SHEET ======
// Tự động thêm menu "🎯 Công cụ IC3" mỗi khi mở file Sheet.
// Chỉ cần bấm menu, không cần vào Apps Script editor.
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🎯 Công cụ IC3')
    .addItem('🎨 Định dạng HocSinh', 'setupHocSinhFormatting_')
    .addItem('🎨 Định dạng KetQua', 'setupKetQuaFormatting_')
    .addItem('🎨 Định dạng NhatKyNopBai', 'setupNhatKyNopBaiFormatting_')
    .addItem('🎨 Định dạng TongHop', 'setupTongHopFormatting_')
    .addItem('📊 Cập nhật bảng Thống Kê + biểu đồ', 'setupThongKeSheet_')
    .addSeparator()
    .addItem('🚀 Chạy tất cả', 'runAllSetup_')
    .addItem('🩺 Kiểm tra sau khi deploy', 'kiemTraSauDeploy')
    .addToUi();
}

function runAllSetup_() {
  setupHocSinhFormatting_();
  setupKetQuaFormatting_();
  setupNhatKyNopBaiFormatting_();
  setupTongHopFormatting_();
  setupThongKeSheet_();
  SpreadsheetApp.getUi().alert('✅ Đã định dạng toàn bộ 4 sheet và cập nhật ThongKe + biểu đồ.');
}

// ====== ĐỊNH DẠNG SHEET HOC SINH ======
// Cột: A MSHS | B HoTen | C Lop | D Truong | E Email
function setupHocSinhFormatting_() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID_DATA).getSheetByName(SHEET_ROSTER);
  if (!sheet) throw new Error('Không tìm thấy tab "' + SHEET_ROSTER + '"');

  const lastCol = 5; // A..E
  const maxRows = 2000;

  const headerRange = sheet.getRange(1, 1, 1, lastCol);
  headerRange.setBackground('#1a73e8').setFontColor('#ffffff').setFontWeight('bold')
    .setHorizontalAlignment('center').setVerticalAlignment('middle');
  sheet.setFrozenRows(1);

  const dataRange = sheet.getRange(2, 1, maxRows - 1, lastCol);
  sheet.getBandings().forEach(b => b.remove());
  dataRange.applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, false, false);

  sheet.autoResizeColumns(1, lastCol);

  // Cảnh báo trùng MSHS (mã học sinh không được trùng nhau)
  const idRange = sheet.getRange(2, 1, maxRows - 1, 1);
  const rules = [];
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=AND($A2<>"", COUNTIF($A$2:$A,$A2)>1)')
    .setBackground('#f4cccc').setFontColor('#990000').setBold(true)
    .setRanges([idRange]).build());
  sheet.setConditionalFormatRules(rules);

  const existingFilter = sheet.getFilter();
  if (existingFilter) existingFilter.remove();
  sheet.getRange(1, 1, Math.max(sheet.getLastRow(), 2), lastCol).createFilter();

  if (sheet.getLastRow() > 1) {
    sheet.getRange(1, 1, sheet.getLastRow(), lastCol).setBorder(true, true, true, true, true, true, '#cccccc', SpreadsheetApp.BorderStyle.SOLID);
  }
}

// ====== ĐỊNH DẠNG SHEET KET QUA ======
// Cột: A Timestamp | B MSHS | C HoTen | D Lop | E BaiThi | F DiemSo |
//      G ThoiGianLamPhut | H TrangThai | I ChiTietLoaiCauHoi(JSON)
function setupKetQuaFormatting_() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID_DATA).getSheetByName(SHEET_SCORES);
  if (!sheet) throw new Error('Không tìm thấy tab "' + SHEET_SCORES + '"');

  const lastCol = 9; // A..I
  const maxRows = 3000;

  const headerRange = sheet.getRange(1, 1, 1, lastCol);
  headerRange.setBackground('#1a73e8').setFontColor('#ffffff').setFontWeight('bold')
    .setHorizontalAlignment('center').setVerticalAlignment('middle');
  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(3); // luôn thấy Timestamp, MSHS, HoTen khi cuộn ngang

  const dataRange = sheet.getRange(2, 1, maxRows - 1, lastCol);
  sheet.getBandings().forEach(b => b.remove());
  dataRange.applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, false, false);

  sheet.autoResizeColumns(1, lastCol);

  // Timestamp (A) hiển thị ngày giờ
  sheet.getRange(2, 1, maxRows - 1, 1).setNumberFormat('dd/mm/yyyy hh:mm:ss');
  // DiemSo (F) căn giữa
  sheet.getRange(2, 6, maxRows - 1, 1).setHorizontalAlignment('center');

  const rules = [];

  // Thang màu điểm số theo min/max thực tế trong dữ liệu (không cố định 0-10 hay 0-100)
  const diemRange = sheet.getRange(2, 6, maxRows - 1, 1);
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .setGradientMaxpointWithValue('#57bb8a', SpreadsheetApp.InterpolationType.MAX, '')
    .setGradientMidpointWithValue('#ffd666', SpreadsheetApp.InterpolationType.PERCENT, '50')
    .setGradientMinpointWithValue('#e06666', SpreadsheetApp.InterpolationType.MIN, '')
    .setRanges([diemRange]).build());

  // TrangThai (H): Đã nộp/Hoàn thành → xanh, còn lại (Chưa nộp...) → xám nhạt
  const statusRange = sheet.getRange(2, 8, maxRows - 1, 1);
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('Hoàn thành')
    .setBackground('#d9ead3').setFontColor('#274e13')
    .setRanges([statusRange]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('Đã nộp')
    .setBackground('#d9ead3').setFontColor('#274e13')
    .setRanges([statusRange]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('Chưa nộp')
    .setBackground('#f3f3f3').setFontColor('#666666')
    .setRanges([statusRange]).build());

  sheet.setConditionalFormatRules(rules);

  const existingFilter = sheet.getFilter();
  if (existingFilter) existingFilter.remove();
  sheet.getRange(1, 1, Math.max(sheet.getLastRow(), 2), lastCol).createFilter();

  if (sheet.getLastRow() > 1) {
    sheet.getRange(1, 1, sheet.getLastRow(), lastCol).setBorder(true, true, true, true, true, true, '#cccccc', SpreadsheetApp.BorderStyle.SOLID);
  }
}

// ====== ĐỊNH DẠNG SHEET TONG HOP ======
// Cột: A NgayXuat | B Lop | C SoHocSinh | D TyLeHoanThanh | E DiemTB
function setupTongHopFormatting_() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID_REPORT).getSheetByName(SHEET_REPORT_SUMMARY);
  if (!sheet) throw new Error('Không tìm thấy tab "' + SHEET_REPORT_SUMMARY + '"');

  const lastCol = 5; // A..E
  const maxRows = 2000;

  const headerRange = sheet.getRange(1, 1, 1, lastCol);
  headerRange.setBackground('#1a73e8').setFontColor('#ffffff').setFontWeight('bold')
    .setHorizontalAlignment('center').setVerticalAlignment('middle');
  sheet.setFrozenRows(1);

  const dataRange = sheet.getRange(2, 1, maxRows - 1, lastCol);
  sheet.getBandings().forEach(b => b.remove());
  dataRange.applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, false, false);

  sheet.autoResizeColumns(1, lastCol);

  // NgayXuat (A) dạng ngày, TyLeHoanThanh (D) dạng %, DiemTB (E) 1 số thập phân
  sheet.getRange(2, 1, maxRows - 1, 1).setNumberFormat('dd/mm/yyyy');
  sheet.getRange(2, 4, maxRows - 1, 1).setNumberFormat('0%').setHorizontalAlignment('center');
  sheet.getRange(2, 5, maxRows - 1, 1).setNumberFormat('0.0').setHorizontalAlignment('center');

  const rules = [];
  const tyLeRange = sheet.getRange(2, 4, maxRows - 1, 1);
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .setGradientMaxpointWithValue('#57bb8a', SpreadsheetApp.InterpolationType.MAX, '')
    .setGradientMidpointWithValue('#ffd666', SpreadsheetApp.InterpolationType.PERCENT, '50')
    .setGradientMinpointWithValue('#e06666', SpreadsheetApp.InterpolationType.MIN, '')
    .setRanges([tyLeRange]).build());

  const diemTbRange = sheet.getRange(2, 5, maxRows - 1, 1);
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .setGradientMaxpointWithValue('#57bb8a', SpreadsheetApp.InterpolationType.MAX, '')
    .setGradientMidpointWithValue('#ffd666', SpreadsheetApp.InterpolationType.PERCENT, '50')
    .setGradientMinpointWithValue('#e06666', SpreadsheetApp.InterpolationType.MIN, '')
    .setRanges([diemTbRange]).build());

  sheet.setConditionalFormatRules(rules);

  const existingFilter = sheet.getFilter();
  if (existingFilter) existingFilter.remove();
  sheet.getRange(1, 1, Math.max(sheet.getLastRow(), 2), lastCol).createFilter();

  if (sheet.getLastRow() > 1) {
    sheet.getRange(1, 1, sheet.getLastRow(), lastCol).setBorder(true, true, true, true, true, true, '#cccccc', SpreadsheetApp.BorderStyle.SOLID);
  }
}

// ====== ĐỊNH DẠNG SHEET NHẬT KÝ NỘP BÀI ======
// Cột: A SubmissionId | B HoTen | C Lop | D Truong | E BaiThi | F Diem |
//      G SoCauDung | H ThoiGianLam | I SoLanChuyenTab | J SoLanClick |
//      K TrangThai | L ThoiDiemNop | M GhiChu
function setupNhatKyNopBaiFormatting_() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID_REPORT).getSheetByName(SHEET_SUBMISSION_LOG);
  if (!sheet) throw new Error('Không tìm thấy tab "' + SHEET_SUBMISSION_LOG + '"');

  const lastCol = LOG_HEADERS.length; // A..N
  const maxRows = 2000; // đủ dùng lâu dài, chỉnh nếu cần nhiều hơn

  // --- Header: bold, nền màu, chữ trắng, freeze ---
  const headerRange = sheet.getRange(1, 1, 1, lastCol);
  headerRange.setBackground('#1a73e8').setFontColor('#ffffff').setFontWeight('bold')
    .setHorizontalAlignment('center').setVerticalAlignment('middle');
  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(2); // luôn thấy SubmissionId + HoTen khi cuộn ngang

  // --- Băng màu xen kẽ cho dễ đọc ---
  const dataRange = sheet.getRange(2, 1, maxRows - 1, lastCol);
  const existingBandings = sheet.getBandings();
  existingBandings.forEach(b => b.remove());
  dataRange.applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, false, false);

  // --- Autosize cột ---
  sheet.autoResizeColumns(1, lastCol);

  // --- Format cột Điểm (F) là số nguyên căn giữa ---
  sheet.getRange(2, 6, maxRows - 1, 1).setNumberFormat('0').setHorizontalAlignment('center');

  // --- Format cột ThoiGianNop (L): giờ trước, ngày/tháng kiểu Việt Nam (khớp các dòng cũ) ---
  sheet.getRange('L2:L').setNumberFormat('HH:mm:ss d/M/yyyy');
  if (sheet.getRange(1, lastCol).getValue() === '') sheet.getRange(1, lastCol).setValue(LOG_HEADERS[lastCol - 1]);

  // --- Xoá rule cũ, thêm Conditional Formatting mới ---
  const rules = [];

  // 1) Cột TrangThai (K): "OK" → xanh lá, còn lại (gian lận/nghi vấn) → đỏ cam
  const statusRange = sheet.getRange(2, 11, maxRows - 1, 1);
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('OK')
    .setBackground('#d9ead3').setFontColor('#274e13')
    .setRanges([statusRange]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextContains('⚠️')
    .setBackground('#f4cccc').setFontColor('#990000').setBold(true)
    .setRanges([statusRange]).build());

  // 2) Cột Điểm (F): thang màu đỏ→vàng→xanh theo điểm 0-100
  const diemRange = sheet.getRange(2, 6, maxRows - 1, 1);
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .setGradientMaxpointWithValue('#57bb8a', SpreadsheetApp.InterpolationType.NUMBER, '100')
    .setGradientMidpointWithValue('#ffd666', SpreadsheetApp.InterpolationType.NUMBER, '50')
    .setGradientMinpointWithValue('#e06666', SpreadsheetApp.InterpolationType.NUMBER, '0')
    .setRanges([diemRange]).build());

  // 3) Cột SoLanChuyenTab (I): >3 lần chuyển tab → tô cam cảnh báo khả nghi
  const tabSwitchRange = sheet.getRange(2, 9, maxRows - 1, 1);
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenNumberGreaterThan(3)
    .setBackground('#fce5cd').setFontColor('#b45f06').setBold(true)
    .setRanges([tabSwitchRange]).build());

  sheet.setConditionalFormatRules(rules);

  // --- Bật bộ lọc trên hàng tiêu đề ---
  const existingFilter = sheet.getFilter();
  if (existingFilter) existingFilter.remove();
  sheet.getRange(1, 1, Math.max(sheet.getLastRow(), 2), lastCol).createFilter();

  // --- Kẻ viền nhẹ toàn bộ vùng dữ liệu đang có ---
  if (sheet.getLastRow() > 1) {
    sheet.getRange(1, 1, sheet.getLastRow(), lastCol).setBorder(true, true, true, true, true, true, '#cccccc', SpreadsheetApp.BorderStyle.SOLID);
  }
}

// ====== SHEET THỐNG KÊ + BIỂU ĐỒ (tự cập nhật bằng công thức sống) ======
function setupThongKeSheet_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID_REPORT);
  let sheet = ss.getSheetByName('ThongKe');
  if (!sheet) {
    sheet = ss.insertSheet('ThongKe');
  } else {
    sheet.getCharts().forEach(c => sheet.removeChart(c));
    sheet.clear();
  }

  const src = SHEET_SUBMISSION_LOG; // 'NhatKyNopBai'

  // --- Tiêu đề ---
  sheet.getRange('A1').setValue('📊 THỐNG KÊ THEO LỚP (tự động cập nhật)')
    .setFontWeight('bold').setFontSize(14);

  // --- Bảng tổng hợp theo lớp bằng QUERY, tự cập nhật khi NhatKyNopBai có dữ liệu mới ---
  sheet.getRange('A3').setFormula(
    '=IFERROR(QUERY(' + src + '!C2:F,' +
    '"select C, count(F), avg(F) where C is not null group by C label count(F) \'SoLuotNop\', avg(F) \'DiemTB\'"),' +
    '"Chưa có dữ liệu")'
  );
  sheet.getRange('A3').setFontWeight('bold');

  // --- Số lượt nghi vấn gian lận theo lớp (TrangThai chứa ⚠️) ---
  sheet.getRange('F3').setValue('Lớp');
  sheet.getRange('G3').setValue('Số lượt nghi vấn');
  sheet.getRange('F3:G3').setFontWeight('bold').setBackground('#f4cccc');
  sheet.getRange('F4').setFormula(
    '=IFERROR(QUERY(' + src + '!C2:K,' +
    '"select C, count(K) where K contains \'⚠️\' group by C label count(K) \'\'"),"")'
  );

  // --- Tổng quan toàn trường ---
  sheet.getRange('A20').setValue('Tổng số bài đã nộp:').setFontWeight('bold');
  sheet.getRange('B20').setFormula('=COUNTA(' + src + '!A2:A)-COUNTBLANK(' + src + '!A2:A)');
  sheet.getRange('A21').setValue('Điểm trung bình toàn trường:').setFontWeight('bold');
  sheet.getRange('B21').setFormula('=IFERROR(AVERAGE(' + src + '!F2:F),0)');
  sheet.getRange('A22').setValue('Tổng số lượt nghi vấn gian lận:').setFontWeight('bold');
  sheet.getRange('B22').setFormula('=IFERROR(COUNTIF(' + src + '!K2:K,"*⚠️*"),0)');

  sheet.autoResizeColumns(1, 8);

  // --- Biểu đồ cột: điểm TB theo lớp ---
  SpreadsheetApp.flush(); // đảm bảo QUERY đã tính xong trước khi vẽ chart
  const chart1 = sheet.newChart()
    .setChartType(Charts.ChartType.COLUMN)
    .addRange(sheet.getRange('A3:A100'))
    .addRange(sheet.getRange('C3:C100'))
    .setPosition(5, 1, 0, 0)
    .setOption('title', 'Điểm trung bình theo lớp')
    .setOption('legend', { position: 'none' })
    .setOption('colors', ['#1a73e8'])
    .build();
  sheet.insertChart(chart1);

  // --- Biểu đồ tròn: số lượt nghi vấn theo lớp ---
  const chart2 = sheet.newChart()
    .setChartType(Charts.ChartType.PIE)
    .addRange(sheet.getRange('F4:G20'))
    .setPosition(5, 10, 0, 0)
    .setOption('title', 'Tỷ lệ nghi vấn gian lận theo lớp')
    .build();
  sheet.insertChart(chart2);
}
