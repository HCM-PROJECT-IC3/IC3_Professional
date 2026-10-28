// ====== GHI ĐIỂM DANH VÀO SỔ LỚP CỦA ĐIỀU PHỐI (diem-danh.html) ======
//
// Sổ "FORM QUẢN LÝ LỚP" (Google Sheet của Điều phối đào tạo, mỗi tab 1 lớp): cột E là nhãn
// TIẾT / THỨ / NGÀY / TÊN GV / BÀI DẠY / ĐÃ HOÀN THÀNH, mỗi cột từ F là 1 tiết, học sinh từ dòng dưới.
// Web chỉ ĐỌC sổ qua link công khai (export CSV); muốn GHI thì phải qua đây vì trình duyệt không có
// quyền sửa file của người khác. Script chạy bằng tài khoản deploy ("Execute as: Me") → tài khoản đó
// phải là Người chỉnh sửa của file (điều phối thêm email đó ở nút Chia sẻ).
//
// Không tin vị trí ô từ web: script tự tìm lại dòng nhãn trong tab, kiểm cột thuộc vùng tiết, tên học
// sinh ở dòng gửi lên phải khớp tên trên Sheet (điều phối chèn/xoá dòng thì từ chối, không ghi lệch).
// Chỉ ghi: ký hiệu điểm danh (x / v / NL / Mới / trống), ô NGÀY đang trống, ô ĐÃ HOÀN THÀNH.

const NO_EDIT_MSG_ = 'Tài khoản Google đã deploy Apps Script chưa có quyền sửa file này — nhờ điều phối bấm Chia sẻ, thêm email đó với quyền Người chỉnh sửa.';
const CLASS_MARKS_ = { x: 'x', v: 'v', nl: 'NL', moi: 'Mới', '': '' };

function classSheetNorm_(s) {
  return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().toLocaleUpperCase('vi');
}

/** Tìm ô nhãn trong 40 dòng đầu → { r, c } (0-based) hoặc null. */
function classSheetFind_(disp, label) {
  for (let r = 0; r < Math.min(disp.length, 40); r++) {
    for (let c = 0; c < disp[r].length; c++) {
      const v = classSheetNorm_(disp[r][c]);
      if (v === label || (label === 'TÊN GV' && v.indexOf(label) === 0)) return { r: r, c: c };
    }
  }
  return null;
}

/**
 * p = { sheetId, gid, cols: [{ col, tiet }], marks: [{ row, name, m }], ngay?: 'YYYY-MM-DD', done?: bool }
 * row/col 0-based như CSV web đã đọc. Trả { written, ngay, done }.
 */
function classSheetWrite_(p) {
  if (!/^[A-Za-z0-9_-]{20,}$/.test(String(p.sheetId || ''))) throw appError_('invalid-argument', 'Mã file Sheet không hợp lệ.');
  const cols = Array.isArray(p.cols) ? p.cols : [];
  const marks = Array.isArray(p.marks) ? p.marks : [];
  if (!cols.length || cols.length > 3) throw appError_('invalid-argument', 'Cần 1–3 cột tiết.');
  if (marks.length > 120) throw appError_('invalid-argument', 'Quá nhiều học sinh.');

  let ss;
  try { ss = SpreadsheetApp.openById(p.sheetId); } catch (e) {
    throw appError_('permission-denied', NO_EDIT_MSG_);
  }
  const sh = ss.getSheets().filter(function (s) { return String(s.getSheetId()) === String(p.gid); })[0];
  if (!sh) throw appError_('not-found', 'Không thấy tab lớp này trong file (điều phối đã xoá/đổi tab?).');

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw appError_('unavailable', 'Đang có người ghi sổ — thử lại sau vài giây.');
  try {
    const nRow = sh.getLastRow(), nCol = sh.getLastColumn();
    const disp = sh.getRange(1, 1, nRow, nCol).getDisplayValues();
    const tiet = classSheetFind_(disp, 'TIẾT'), bai = classSheetFind_(disp, 'BÀI DẠY');
    if (!tiet || !bai) throw appError_('failed-precondition', 'Tab này không đúng mẫu FORM QUẢN LÝ LỚP.');
    const ngay = classSheetFind_(disp, 'NGÀY'), done = classSheetFind_(disp, 'ĐÃ HOÀN THÀNH');
    let nameCol = -1;
    disp[tiet.r].forEach(function (x, c) { if (nameCol < 0 && /^HỌ\s*(&|VÀ)\s*TÊN/.test(classSheetNorm_(x))) nameCol = c; });
    if (nameCol < 0) nameCol = 0;
    const firstStudent = Math.max(tiet.r, bai.r, done ? done.r : 0) + 1;

    // Cột: nằm bên phải ô nhãn TIẾT; ô TIẾT trên Sheet hoặc trống (công thức chưa hiện) hoặc đúng số tiết
    cols.forEach(function (x) {
      const c = Number(x.col);
      if (!(c > tiet.c && c < nCol)) throw appError_('invalid-argument', 'Cột tiết nằm ngoài vùng điểm danh.');
      const shown = String(disp[tiet.r][c] || '').trim();
      if (shown && shown !== String(x.tiet)) throw appError_('conflict', 'Sheet đã đổi: cột này là Tiết ' + shown + ' — bấm "Tải lại từ Sheet" rồi ghi lại.');
    });

    // Học sinh: dòng gửi lên phải đúng tên trên Sheet
    const toWrite = [];
    marks.forEach(function (x) {
      const r = Number(x.row);
      if (!(r >= firstStudent && r < nRow)) throw appError_('invalid-argument', 'Dòng học sinh ngoài vùng danh sách.');
      if (classSheetNorm_(disp[r][nameCol]) !== classSheetNorm_(x.name)) {
        throw appError_('conflict', 'Sheet đã đổi: dòng ' + (r + 1) + ' không còn là "' + x.name + '" — bấm "Tải lại từ Sheet" rồi ghi lại.');
      }
      if (!Object.prototype.hasOwnProperty.call(CLASS_MARKS_, String(x.m || ''))) throw appError_('invalid-argument', 'Ký hiệu điểm danh không hợp lệ: ' + x.m);
      toWrite.push({ r: r, v: CLASS_MARKS_[String(x.m || '')] });
    });

    let written = 0, ngayDone = false, doneDone = false;
    try {
    cols.forEach(function (x) {
      const c = Number(x.col);
      toWrite.forEach(function (w) {
        if (String(disp[w.r][c]) === w.v) return; // giống rồi — khỏi ghi
        sh.getRange(w.r + 1, c + 1).setValue(w.v);
        written++;
      });
    });

    // NGÀY: chỉ điền ô đang trống, đúng kiểu ngày như các ô bên cạnh (ô chọn ngày của điều phối)
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(p.ngay || ''));
    if (m && ngay) {
      const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      let fmt = 'dd.MM';
      for (let c = tiet.c + 1; c < nCol; c++) {
        const cell = sh.getRange(ngay.r + 1, c + 1);
        if (cell.getValue() instanceof Date) { fmt = cell.getNumberFormat() || fmt; break; }
      }
      cols.forEach(function (x) {
        const cell = sh.getRange(ngay.r + 1, Number(x.col) + 1);
        if (String(disp[ngay.r][Number(x.col)] || '').trim()) return;
        cell.setValue(d).setNumberFormat(fmt);
        ngayDone = true;
      });
    }

    // ĐÃ HOÀN THÀNH: ô tick (TRUE/FALSE)
    if (p.done === true && done) {
      cols.forEach(function (x) {
        if (classSheetNorm_(disp[done.r][Number(x.col)]) === 'TRUE') return;
        sh.getRange(done.r + 1, Number(x.col) + 1).setValue(true);
        doneDone = true;
      });
    }
    SpreadsheetApp.flush();
    } catch (e) {
      if (/permission|quyền/i.test(String(e && e.message))) throw appError_('permission-denied', NO_EDIT_MSG_);
      throw e;
    }
    return { written: written, ngay: ngayDone, done: doneDone };
  } finally {
    lock.releaseLock();
  }
}
