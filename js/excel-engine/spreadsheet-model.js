/* ════════════════════════════════════════════════════════════
   js/excel-engine/spreadsheet-model.js — MOS Exam Simulator (Excel)

   Application State THẬT của Excel — không phải "hoạt cảnh minh hoạ".
   Đây là state mà Validation Engine sẽ đọc để chấm bài (xem
   js/exam-engine/validation-engine.js). Workbook nhiều sheet, mỗi ô lưu
   đúng 4 field theo yêu cầu: { value, formula, style, numberFormat }.

   Recalculation: mỗi lần setCellFormula/setCellValue, engine tính lại
   TOÀN BỘ sheet theo thứ tự phụ thuộc (dependency graph từ
   formula-engine.extractDependencies) — đơn giản nhưng đúng, đủ cho quy
   mô 1 bài thi MOS (vài chục-vài trăm ô, không phải bảng tính triệu
   dòng). Có phát hiện vòng lặp (#CIRCULAR!).
   ════════════════════════════════════════════════════════════ */
(function (root, factory) {
  var FormulaEngine = typeof module === 'object' && module.exports
    ? require('./formula-engine.js')
    : (root && root.ExcelEngine && root.ExcelEngine.FormulaEngine);
  var mod = factory(FormulaEngine);
  if (typeof module === 'object' && module.exports) {
    module.exports = mod;
  }
  if (root) {
    root.ExcelEngine = root.ExcelEngine || {};
    root.ExcelEngine.SpreadsheetModel = mod;
  }
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : null), function (FormulaEngine) {
  'use strict';

  function key(col, row) { return col + ',' + row; }

  function emptyCell() {
    return {
      value: null,
      formula: null,
      style: { bold: false, italic: false, underline: false, fontColor: null, fillColor: null, fontFamily: null, fontSize: null, align: null },
      numberFormat: 'General'
    };
  }

  function Sheet(name) {
    this.name = name;
    this.cells = {}; // "col,row" -> cell
    this.rowCount = 100;
    this.colCount = 26;
    this.columnWidths = {};
    this.rowHeights = {};
    this.conditionalFormats = []; // { range:{c1,r1,c2,r2}, rule, style }
    this.dataValidations = []; // { range:{c1,r1,c2,r2}, rule }
    this.tables = []; // { name, range, hasHeader }
    this.charts = []; // { id, type, dataRange, title, position }
    this.frozen = { rows: 0, cols: 0 };
  }
  Sheet.prototype.getCell = function (col, row) {
    return this.cells[key(col, row)] || null;
  };
  Sheet.prototype.ensureCell = function (col, row) {
    var k = key(col, row);
    if (!this.cells[k]) this.cells[k] = emptyCell();
    return this.cells[k];
  };

  function Workbook() {
    this.sheets = {};
    this.sheetOrder = [];
    this.activeSheet = null;
  }
  Workbook.prototype.addSheet = function (name) {
    if (this.sheets[name]) throw new Error('Sheet "' + name + '" already exists');
    var sheet = new Sheet(name);
    this.sheets[name] = sheet;
    this.sheetOrder.push(name);
    if (!this.activeSheet) this.activeSheet = name;
    return sheet;
  };
  Workbook.prototype.removeSheet = function (name) {
    if (this.sheetOrder.length <= 1) throw new Error('Workbook must keep at least 1 sheet');
    delete this.sheets[name];
    this.sheetOrder = this.sheetOrder.filter(function (n) { return n !== name; });
    if (this.activeSheet === name) this.activeSheet = this.sheetOrder[0];
  };
  Workbook.prototype.renameSheet = function (oldName, newName) {
    if (!this.sheets[oldName]) throw new Error('Sheet "' + oldName + '" not found');
    if (this.sheets[newName]) throw new Error('Sheet "' + newName + '" already exists');
    this.sheets[newName] = this.sheets[oldName];
    this.sheets[newName].name = newName;
    delete this.sheets[oldName];
    this.sheetOrder = this.sheetOrder.map(function (n) { return n === oldName ? newName : n; });
    if (this.activeSheet === oldName) this.activeSheet = newName;
  };

  // ────────────────────────────────────────────────────────────
  // A1 <-> {col,row} helpers (dùng chung với formula-engine)
  // ────────────────────────────────────────────────────────────
  function a1ToColRow(a1) {
    var m = /^\$?([A-Za-z]{1,3})\$?([0-9]+)$/.exec(a1);
    if (!m) throw new Error('Invalid A1 reference: ' + a1);
    return { col: FormulaEngine.colToIndex(m[1]), row: parseInt(m[2], 10) };
  }
  function colRowToA1(col, row) {
    return FormulaEngine.indexToCol(col) + row;
  }

  // ────────────────────────────────────────────────────────────
  // ENGINE — bọc Workbook + tính công thức qua FormulaEngine
  // ────────────────────────────────────────────────────────────
  function SpreadsheetEngine(workbook) {
    this.workbook = workbook || new Workbook();
    if (!this.workbook.sheetOrder.length) this.workbook.addSheet('Sheet1');
  }

  SpreadsheetEngine.prototype._resolverFor = function (evaluatingSheet) {
    var self = this;
    return {
      currentSheet: evaluatingSheet,
      getCellValue: function (sheetName, col, row) {
        var sheet = self.workbook.sheets[sheetName];
        if (!sheet) return null;
        var cell = sheet.getCell(col, row);
        return cell ? cell.value : null;
      },
      getRangeValues: function (sheetName, c1, r1, c2, r2) {
        var sheet = self.workbook.sheets[sheetName];
        var out = [];
        for (var r = r1; r <= r2; r++) {
          var row = [];
          for (var c = c1; c <= c2; c++) {
            var cell = sheet ? sheet.getCell(c, r) : null;
            row.push(cell ? cell.value : null);
          }
          out.push(row);
        }
        return out;
      }
    };
  };

  /** Đặt giá trị tĩnh (không công thức) cho 1 ô. */
  SpreadsheetEngine.prototype.setCellValue = function (sheetName, a1, value) {
    var sheet = this._sheet(sheetName);
    var rc = a1ToColRow(a1);
    var cell = sheet.ensureCell(rc.col, rc.row);
    cell.formula = null;
    cell.value = value;
    this.recalcAll();
  };

  /** Đặt công thức cho 1 ô (formula bắt đầu bằng "=" hoặc không đều được nhận). */
  SpreadsheetEngine.prototype.setCellFormula = function (sheetName, a1, formula) {
    var sheet = this._sheet(sheetName);
    var rc = a1ToColRow(a1);
    var cell = sheet.ensureCell(rc.col, rc.row);
    if (typeof formula === 'string' && formula.charAt(0) === '=') {
      cell.formula = formula;
    } else {
      // không phải công thức thật -> set value trực tiếp (tiện cho UI nhập liệu 1 hàm setCell duy nhất)
      cell.formula = null;
      cell.value = isNaN(parseFloat(formula)) || formula === '' ? formula : parseFloat(formula);
      this.recalcAll();
      return;
    }
    this.recalcAll();
  };

  SpreadsheetEngine.prototype.setCellStyle = function (sheetName, a1, styleChanges) {
    var sheet = this._sheet(sheetName);
    var rc = a1ToColRow(a1);
    var cell = sheet.ensureCell(rc.col, rc.row);
    Object.assign(cell.style, styleChanges);
  };

  SpreadsheetEngine.prototype.setCellNumberFormat = function (sheetName, a1, numberFormat) {
    var sheet = this._sheet(sheetName);
    var rc = a1ToColRow(a1);
    var cell = sheet.ensureCell(rc.col, rc.row);
    cell.numberFormat = numberFormat;
  };

  SpreadsheetEngine.prototype._sheet = function (sheetName) {
    var sheet = this.workbook.sheets[sheetName || this.workbook.activeSheet];
    if (!sheet) throw new Error('Sheet "' + sheetName + '" not found');
    return sheet;
  };

  SpreadsheetEngine.prototype.getCell = function (sheetName, a1) {
    var sheet = this._sheet(sheetName);
    var rc = a1ToColRow(a1);
    return sheet.getCell(rc.col, rc.row);
  };

  /**
   * Tính lại toàn bộ workbook — thứ tự tô-pô đơn giản bằng lặp nhiều vòng
   * (mỗi vòng tính các ô mà mọi phụ thuộc đã "sẵn sàng"); nếu sau N vòng
   * vẫn còn ô chưa tính được → vòng lặp tham chiếu (#CIRCULAR!).
   */
  SpreadsheetEngine.prototype.recalcAll = function () {
    var self = this;
    var formulaCells = []; // { sheetName, col, row, cell }
    this.workbook.sheetOrder.forEach(function (sheetName) {
      var sheet = self.workbook.sheets[sheetName];
      Object.keys(sheet.cells).forEach(function (k) {
        var cell = sheet.cells[k];
        if (cell.formula) {
          var parts = k.split(',');
          formulaCells.push({ sheetName: sheetName, col: parseInt(parts[0], 10), row: parseInt(parts[1], 10), cell: cell });
        }
      });
    });

    var pending = formulaCells.slice();
    var maxRounds = pending.length + 2;
    while (pending.length && maxRounds-- > 0) {
      var next = [];
      pending.forEach(function (fc) {
        var deps = FormulaEngine.extractDependencies(fc.cell.formula, fc.sheetName);
        var selfRef = deps.some(function (d) { return d.sheet === fc.sheetName && d.col === fc.col && d.row === fc.row; });
        if (selfRef) {
          fc.cell.value = null;
          fc.cell.error = '#CIRCULAR!';
          return; // đã "giải quyết" (là lỗi), không đưa vào next
        }
        var depsOnPendingFormula = deps.some(function (d) {
          return pending.some(function (p) { return p !== fc && p.sheetName === d.sheet && p.col === d.col && p.row === d.row; });
        });
        if (depsOnPendingFormula) { next.push(fc); return; }
        var resolver = self._resolverFor(fc.sheetName);
        var result = FormulaEngine.evaluate(fc.cell.formula, resolver);
        fc.cell.value = result.error ? null : result.value;
        fc.cell.error = result.error || null;
      });
      if (next.length === pending.length) {
        // không tiến triển được -> vòng lặp tham chiếu giữa các ô còn lại
        next.forEach(function (fc) { fc.cell.value = null; fc.cell.error = '#CIRCULAR!'; });
        break;
      }
      pending = next;
    }
  };

  // ────────────────────────────────────────────────────────────
  // Sort — theo 1 cột, giữ nguyên hàng còn lại đi theo (giống Excel thật:
  // sort cả record chứ không chỉ 1 cột lẻ).
  // ────────────────────────────────────────────────────────────
  SpreadsheetEngine.prototype.sortRange = function (sheetName, range, sortColIndexInRange, ascending) {
    var sheet = this._sheet(sheetName);
    var rc1 = a1ToColRow(range.start), rc2 = a1ToColRow(range.end);
    var c1 = Math.min(rc1.col, rc2.col), c2 = Math.max(rc1.col, rc2.col);
    var r1 = Math.min(rc1.row, rc2.row), r2 = Math.max(rc1.row, rc2.row);
    // Chụp lại toàn bộ giá trị TRƯỚC khi ghi đè — sort là 1 phép hoán vị,
    // nếu ghi trực tiếp vào ô gốc trong lúc vẫn còn phải đọc từ ô đó ở một
    // bước khác thì sẽ đọc phải dữ liệu đã bị ghi đè (read-after-write).
    var rows = [];
    for (var r = r1; r <= r2; r++) {
      var rowSnapshot = [];
      for (var c = c1; c <= c2; c++) {
        var cell = sheet.ensureCell(c, r);
        rowSnapshot.push({ value: cell.value, formula: cell.formula, style: Object.assign({}, cell.style), numberFormat: cell.numberFormat });
      }
      rows.push(rowSnapshot);
    }
    rows.sort(function (a, b) {
      var av = a[sortColIndexInRange].value, bv = b[sortColIndexInRange].value;
      if (typeof av === 'number' && typeof bv === 'number') return ascending ? av - bv : bv - av;
      var as = String(av == null ? '' : av), bs = String(bv == null ? '' : bv);
      return ascending ? as.localeCompare(bs) : bs.localeCompare(as);
    });
    // Ghi snapshot đã sort trở lại lưới theo đúng vị trí cột gốc.
    for (var i = 0; i < rows.length; i++) {
      var destRow = r1 + i;
      for (var j = 0; j < rows[i].length; j++) {
        var destCol = c1 + j;
        var destCell = sheet.ensureCell(destCol, destRow);
        var snap = rows[i][j];
        destCell.value = snap.value;
        destCell.formula = snap.formula;
        destCell.style = snap.style;
        destCell.numberFormat = snap.numberFormat;
      }
    }
    this.recalcAll();
  };

  // ────────────────────────────────────────────────────────────
  // Filter (AutoFilter) — trả về danh sách chỉ số hàng (trong range) khớp
  // điều kiện, dùng để UI ẩn/hiện hàng — không xoá dữ liệu.
  // ────────────────────────────────────────────────────────────
  SpreadsheetEngine.prototype.filterRange = function (sheetName, range, colIndexInRange, predicate) {
    var sheet = this._sheet(sheetName);
    var rc1 = a1ToColRow(range.start), rc2 = a1ToColRow(range.end);
    var c1 = Math.min(rc1.col, rc2.col);
    var r1 = Math.min(rc1.row, rc2.row), r2 = Math.max(rc1.row, rc2.row);
    var visibleRows = [];
    for (var r = r1; r <= r2; r++) {
      var cell = sheet.getCell(c1 + colIndexInRange, r);
      var v = cell ? cell.value : null;
      if (predicate(v)) visibleRows.push(r);
    }
    return visibleRows;
  };

  // ────────────────────────────────────────────────────────────
  // Conditional Formatting / Data Validation / Table / Chart — lưu định
  // nghĩa vào sheet, Validator đọc trực tiếp từ các mảng này.
  // ────────────────────────────────────────────────────────────
  SpreadsheetEngine.prototype.addConditionalFormat = function (sheetName, range, rule, style) {
    var sheet = this._sheet(sheetName);
    var rc1 = a1ToColRow(range.start), rc2 = a1ToColRow(range.end);
    sheet.conditionalFormats.push({
      range: { c1: Math.min(rc1.col, rc2.col), r1: Math.min(rc1.row, rc2.row), c2: Math.max(rc1.col, rc2.col), r2: Math.max(rc1.row, rc2.row) },
      rule: rule, style: style
    });
  };
  SpreadsheetEngine.prototype.addDataValidation = function (sheetName, range, rule) {
    var sheet = this._sheet(sheetName);
    var rc1 = a1ToColRow(range.start), rc2 = a1ToColRow(range.end);
    sheet.dataValidations.push({
      range: { c1: Math.min(rc1.col, rc2.col), r1: Math.min(rc1.row, rc2.row), c2: Math.max(rc1.col, rc2.col), r2: Math.max(rc1.row, rc2.row) },
      rule: rule
    });
  };
  SpreadsheetEngine.prototype.addTable = function (sheetName, name, range, hasHeader) {
    var sheet = this._sheet(sheetName);
    sheet.tables.push({ name: name, range: range, hasHeader: hasHeader !== false });
  };
  SpreadsheetEngine.prototype.addChart = function (sheetName, chartDef) {
    var sheet = this._sheet(sheetName);
    var chart = Object.assign({ id: 'chart' + (sheet.charts.length + 1) }, chartDef);
    sheet.charts.push(chart);
    return chart;
  };

  /** Áp dụng conditional format của 1 ô -> style hiển thị (dùng cho renderer, không đổi style gốc lưu trong cell). */
  SpreadsheetEngine.prototype.getEffectiveStyle = function (sheetName, a1) {
    var sheet = this._sheet(sheetName);
    var rc = a1ToColRow(a1);
    var cell = sheet.getCell(rc.col, rc.row) || emptyCell();
    var style = Object.assign({}, cell.style);
    sheet.conditionalFormats.forEach(function (cf) {
      if (rc.col >= cf.range.c1 && rc.col <= cf.range.c2 && rc.row >= cf.range.r1 && rc.row <= cf.range.r2) {
        if (evalCFRule(cf.rule, cell.value)) Object.assign(style, cf.style);
      }
    });
    return style;
  };
  function evalCFRule(rule, value) {
    if (!rule) return false;
    var n = typeof value === 'number' ? value : parseFloat(value);
    switch (rule.type) {
      case 'greaterThan': return n > rule.value;
      case 'lessThan': return n < rule.value;
      case 'between': return n >= rule.min && n <= rule.max;
      case 'equal': return value === rule.value;
      case 'textContains': return typeof value === 'string' && value.indexOf(rule.value) !== -1;
      default: return false;
    }
  }

  return {
    Workbook: Workbook,
    Sheet: Sheet,
    SpreadsheetEngine: SpreadsheetEngine,
    emptyCell: emptyCell,
    a1ToColRow: a1ToColRow,
    colRowToA1: colRowToA1
  };
});
