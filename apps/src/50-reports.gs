// ====== ROSTER / ĐIỂM / BÁO CÁO TỔNG HỢP (tab HocSinh, KetQua, TongHop) ======
// Router: getRoster, getScores, getDashboard, writeReport — chỉ admin / điều phối đào tạo.
// Điều phối chỉ thấy học sinh của các trường mình phụ trách (who.schools), giống
// firestore.rules. Trước đây các API này chạy bằng GET công khai, không cần đăng nhập.

/** Roster (tab HocSinh), lọc theo lớp và theo trường được phép xem. */
function getRoster_(lopFilter, who) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID_DATA).getSheetByName(SHEET_ROSTER);
  let rows = sheetToObjects_(sheet);
  if (who && who.schools) {
    const allowed = new Set(who.schools);
    rows = rows.filter(function (r) { return allowed.has(String(r.Truong)); });
  }
  if (lopFilter) rows = rows.filter(function (r) { return r.Lop === lopFilter; });
  return rows;
}

/**
 * Điểm (tab KetQua). Tab này không có cột trường → điều phối chỉ thấy điểm của học sinh
 * có MSHS nằm trong roster các trường mình phụ trách.
 */
function getScores_(lopFilter, baiThiFilter, who) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID_DATA).getSheetByName(SHEET_SCORES);
  let rows = sheetToObjects_(sheet);
  if (who && who.schools) {
    const ids = new Set(getRoster_(null, who).map(function (r) { return String(r.MSHS); }));
    rows = rows.filter(function (r) { return ids.has(String(r.MSHS)); });
  }
  if (lopFilter) rows = rows.filter(function (r) { return r.Lop === lopFilter; });
  if (baiThiFilter) rows = rows.filter(function (r) { return r.BaiThi === baiThiFilter; });
  return rows;
}

/**
 * Số liệu tổng hợp tính sẵn trên server. Vai trò lấy từ tài khoản đã xác thực (trước
 * đây lấy từ tham số "role" web tự khai — ai cũng tự xưng admin được).
 */
function buildDashboardPayload_(lopFilter, who) {
  const role = who ? who.role : '';
  const scores = getScores_(lopFilter, null, who);
  const roster = getRoster_(lopFilter, who);

  const totalStudents = roster.length;
  const submitted = scores.filter(function (s) { return s.TrangThai === 'Đã nộp' || s.TrangThai === 'Hoàn thành'; });
  const completionRate = totalStudents > 0 ? submitted.length / totalStudents : 0;

  const avgScore = submitted.length > 0
    ? submitted.reduce(function (sum, s) { return sum + (Number(s.DiemSo) || 0); }, 0) / submitted.length
    : 0;

  // Phân bố điểm theo khoảng (để vẽ biểu đồ histogram/pie)
  const distribution = { '0-4': 0, '5-6': 0, '7-8': 0, '9-10': 0 };
  submitted.forEach(function (s) {
    const d = Number(s.DiemSo) || 0;
    if (d < 5) distribution['0-4']++;
    else if (d < 7) distribution['5-6']++;
    else if (d < 9) distribution['7-8']++;
    else distribution['9-10']++;
  });

  // Tỷ lệ đúng/sai theo loại câu hỏi (yêu cầu cột ChiTietLoaiCauHoi lưu JSON dạng
  // {"MultipleChoice":{"dung":8,"sai":2}, "Matching":{"dung":5,"sai":3}, ...})
  const byQuestionType = {};
  submitted.forEach(function (s) {
    if (!s.ChiTietLoaiCauHoi) return;
    let detail;
    try { detail = JSON.parse(s.ChiTietLoaiCauHoi); } catch (e) { return; }
    Object.keys(detail).forEach(function (type) {
      if (!byQuestionType[type]) byQuestionType[type] = { dung: 0, sai: 0 };
      byQuestionType[type].dung += detail[type].dung || 0;
      byQuestionType[type].sai += detail[type].sai || 0;
    });
  });

  const base = {
    totalStudents: totalStudents,
    totalSubmitted: submitted.length,
    completionRate: completionRate,
    avgScore: avgScore,
    distribution: distribution,
    byQuestionType: byQuestionType,
    byClass: groupByClass_(submitted),
  };
  if (role === 'admin') base.roster = roster; // admin cần xem/chỉnh toàn bộ danh sách
  return base;
}

function groupByClass_(submitted) {
  const map = {};
  submitted.forEach(function (s) {
    if (!map[s.Lop]) map[s.Lop] = { count: 0, totalScore: 0 };
    map[s.Lop].count++;
    map[s.Lop].totalScore += Number(s.DiemSo) || 0;
  });
  return Object.keys(map).map(function (lop) {
    return { lop: lop, soLuong: map[lop].count, diemTB: map[lop].totalScore / map[lop].count };
  });
}

/**
 * report: mảng các object (mỗi object = 1 dòng báo cáo), ví dụ:
 * [{ ngayXuat: '2026-08-13', lop: '6A1', soHS: 32, tyLeHoanThanh: 0.9, diemTB: 7.5 }, ...]
 */
function writeSummaryReport_(report) {
  if (!Array.isArray(report) || report.length === 0 || report.length > 5000) {
    throw appError_('invalid-argument', 'report rỗng, quá lớn hoặc sai định dạng');
  }
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID_REPORT).getSheetByName(SHEET_REPORT_SUMMARY);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

  const rows = report.map(function (item) {
    return headers.map(function (h) { return item[h] !== undefined ? noFormula_(item[h]) : ''; });
  });
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, headers.length).setValues(rows);

  return { rowsWritten: rows.length };
}
