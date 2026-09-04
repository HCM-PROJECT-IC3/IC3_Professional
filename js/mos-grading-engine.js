/* ============================================================
   js/mos-grading-engine.js — Engine chấm điểm MOS Practice (Phase 1: Excel)

   Nhận vào 1 ExcelJS.Workbook (đã workbook.xlsx.load() từ file .xlsx
   học sinh nộp, xử lý HOÀN TOÀN trên trình duyệt — không gửi file lên
   server) + 1 danh sách "task" khai báo (xem js/mos-tasks/*.js), trả về
   kết quả từng task { id, label, passed, note, manual }.

   Mỗi loại task (task.type) có 1 hàm kiểm tra riêng trong CHECKERS.
   Task với type không tồn tại trong CHECKERS, hoặc type:"manual", LUÔN
   được đánh dấu manual:true — KHÔNG BAO GIỜ tự chấm đúng/sai bừa, để
   tránh chấm sai mà trông như đáng tin cậy (giáo viên tự xem file gốc
   nộp riêng nếu cần — Phase 1 không lưu file lên server, xem quyết định
   trong plan).
   ============================================================ */
(function (root) {
  'use strict';

  /** Lấy 1 cell theo địa chỉ "A11" trên 1 sheet (theo tên sheet). */
  function cell(workbook, sheetName, addr) {
    const ws = workbook.getWorksheet(sheetName);
    if (!ws) throw new Error(`Không tìm thấy worksheet "${sheetName}"`);
    return ws.getCell(addr);
  }

  /** true nếu cell không còn giá trị (đã Clear Contents) — chấp nhận null/undefined/''. */
  function isCellEmpty(c) {
    const v = c.value;
    return v === null || v === undefined || v === '';
  }

  /** Đếm số chữ số thập phân khai báo trong 1 numFmt code (vd "#,##0.00" → 2). */
  function decimalsInNumFmt(fmtCode) {
    if (!fmtCode || typeof fmtCode !== 'string') return null;
    // Chỉ xét phần format số dương (trước dấu ";" đầu tiên nếu có nhiều phần).
    const positivePart = fmtCode.split(';')[0];
    const m = positivePart.match(/\.([0#]+)/);
    return m ? m[1].length : 0;
  }

  /** Text hiển thị của 1 cell (dùng để so khớp nội dung không phân biệt hoa/thường, khoảng trắng thừa). */
  function cellText(c) {
    const v = c.value;
    if (v === null || v === undefined) return '';
    if (typeof v === 'object' && 'result' in v) return String(v.result ?? '').trim();
    if (typeof v === 'object' && v.richText) return v.richText.map(r => r.text).join('').trim();
    return String(v).trim();
  }

  function norm(s) {
    return (s || '').toString().trim().toLowerCase();
  }

  const CHECKERS = {
    /** params: { sheet, range: "A11:B11" } — mọi cell trong range phải trống. */
    cellsEmpty(workbook, params) {
      const ws = workbook.getWorksheet(params.sheet);
      if (!ws) return { passed: false, note: `Không tìm thấy worksheet "${params.sheet}".` };
      const notEmpty = [];
      const cells = expandRange(params.range);
      cells.forEach(addr => {
        const c = ws.getCell(addr);
        if (!isCellEmpty(c)) notEmpty.push(addr);
      });
      return notEmpty.length === 0
        ? { passed: true, note: `Đã xoá nội dung ${params.range}.` }
        : { passed: false, note: `Vẫn còn dữ liệu ở ô: ${notEmpty.join(', ')}.` };
    },

    /** params: { sheet, range, decimals } — mọi cell trong range hiển thị đúng số chữ số thập phân yêu cầu. */
    numberFormatDecimals(workbook, params) {
      const ws = workbook.getWorksheet(params.sheet);
      if (!ws) return { passed: false, note: `Không tìm thấy worksheet "${params.sheet}".` };
      const wrong = [];
      expandRange(params.range).forEach(addr => {
        const c = ws.getCell(addr);
        const d = decimalsInNumFmt(c.numFmt);
        if (d !== params.decimals) wrong.push(`${addr} (${d === null ? 'không xác định' : d + ' số lẻ'})`);
      });
      return wrong.length === 0
        ? { passed: true, note: `Đã định dạng ${params.decimals} chữ số thập phân cho ${params.range}.` }
        : { passed: false, note: `Chưa đúng định dạng ở: ${wrong.join(', ')}.` };
    },

    /** params: { sheet, deletedText, mustRemainTexts: [...] } — text đã xoá không còn xuất hiện,
     *  các text khác vẫn còn nguyên (tránh chấm đúng khi học sinh xoá nhầm hàng/cột khác). */
    rowDeleted(workbook, params) {
      const ws = workbook.getWorksheet(params.sheet);
      if (!ws) return { passed: false, note: `Không tìm thấy worksheet "${params.sheet}".` };
      const allTexts = [];
      ws.eachRow({ includeEmpty: false }, row => {
        row.eachCell({ includeEmpty: false }, c => allTexts.push(norm(cellText(c))));
      });
      const stillThere = allTexts.includes(norm(params.deletedText));
      const missing = params.mustRemainTexts.filter(t => !allTexts.includes(norm(t)));
      if (stillThere) return { passed: false, note: `Vẫn còn thấy "${params.deletedText}" — chưa xoá đúng hàng.` };
      if (missing.length) return { passed: false, note: `Bị mất thêm dữ liệu không liên quan: ${missing.join(', ')}.` };
      return { passed: true, note: `Đã xoá đúng hàng chứa "${params.deletedText}", dữ liệu khác còn nguyên.` };
    },

    /** params: { sheet, rows: [{ sourceCell, targetCell, suffix }] } — công thức nối chuỗi:
     *  giá trị TÍNH ĐƯỢC ở targetCell phải bằng giá trị ở sourceCell + suffix (chấp nhận mọi
     *  cú pháp công thức: &, CONCATENATE, TEXTJOIN... — chỉ so khớp KẾT QUẢ, giống cách MOS chấm). */
    concatFormulaResult(workbook, params) {
      const ws = workbook.getWorksheet(params.sheet);
      if (!ws) return { passed: false, note: `Không tìm thấy worksheet "${params.sheet}".` };
      const wrong = [];
      params.rows.forEach(({ sourceCell, targetCell, suffix }) => {
        const source = norm(cellText(ws.getCell(sourceCell)));
        const target = norm(cellText(ws.getCell(targetCell)));
        const expected = norm(source + (suffix ?? params.suffix ?? ''));
        if (!source || target !== expected) wrong.push(targetCell);
      });
      return wrong.length === 0
        ? { passed: true, note: `Công thức đúng cho toàn bộ ${params.rows.length} dòng.` }
        : { passed: false, note: `Sai/thiếu kết quả ở ô: ${wrong.join(', ')}.` };
    },
  };

  /** "A11:B11" → ["A11","B11"]; hỗ trợ range nhiều hàng/cột (vd "B4:D9"). */
  function expandRange(range) {
    const [startAddr, endAddr] = range.includes(':') ? range.split(':') : [range, range];
    const start = parseAddr(startAddr);
    const end = parseAddr(endAddr);
    const out = [];
    for (let r = start.row; r <= end.row; r++) {
      for (let c = start.col; c <= end.col; c++) {
        out.push(colLetter(c) + r);
      }
    }
    return out;
  }
  function parseAddr(addr) {
    const m = addr.match(/^([A-Z]+)(\d+)$/i);
    if (!m) throw new Error(`Địa chỉ ô không hợp lệ: ${addr}`);
    let col = 0;
    for (const ch of m[1].toUpperCase()) col = col * 26 + (ch.charCodeAt(0) - 64);
    return { col, row: parseInt(m[2], 10) };
  }
  function colLetter(n) {
    let s = '';
    while (n > 0) {
      const rem = (n - 1) % 26;
      s = String.fromCharCode(65 + rem) + s;
      n = Math.floor((n - 1) / 26);
    }
    return s;
  }

  /**
   * Chấm 1 workbook theo danh sách task.
   * @param {ExcelJS.Workbook} workbook
   * @param {Array} tasks — [{ id, label, type, params }]
   * @returns {{ results: Array, score: number, autoTotal: number, manualCount: number }}
   */
  function gradeWorkbook(workbook, tasks) {
    const results = tasks.map(task => {
      if (task.type === 'manual' || !CHECKERS[task.type]) {
        return { id: task.id, label: task.label, manual: true, passed: null, note: 'Cần giáo viên xem thủ công.' };
      }
      try {
        const r = CHECKERS[task.type](workbook, task.params || {});
        return { id: task.id, label: task.label, manual: false, passed: !!r.passed, note: r.note || '' };
      } catch (err) {
        return { id: task.id, label: task.label, manual: false, passed: false, note: 'Lỗi khi chấm: ' + err.message };
      }
    });
    const autoResults = results.filter(r => !r.manual);
    const passedCount = autoResults.filter(r => r.passed).length;
    const score = autoResults.length ? Math.round((passedCount / autoResults.length) * 100) : null;
    return {
      results,
      score,
      autoTotal: autoResults.length,
      passedCount,
      manualCount: results.length - autoResults.length,
    };
  }

  const api = { gradeWorkbook, CHECKERS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MosGradingEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
