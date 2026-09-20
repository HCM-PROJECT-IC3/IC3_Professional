/* ════════════════════════════════════════════════════════════
   js/excel-engine/excel-tasks-sample.js — Task mẫu môn Excel

   Ví dụ THAM CHIẾU đúng theo goal: "Expected: B5.formula = SUM(B2:B4),
   B5.numberFormat = Currency, B5.font.bold = true" — dùng để chứng minh
   toàn bộ pipeline Initial Document → Simulator → User Actions →
   Application State → Validation Engine → Partial Scoring → Task Result
   hoạt động đúng, KHÔNG kiểm tra chuỗi thao tác.

   application state truyền vào validator = 1 SpreadsheetEngine instance
   (xem js/excel-engine/spreadsheet-model.js) sau khi học viên thao tác.
   ════════════════════════════════════════════════════════════ */
(function (root, factory) {
  var deps = typeof module === 'object' && module.exports ? {
    ExamEngine: require('../exam-engine/task-schema.js'),
    SM: require('./spreadsheet-model.js')
  } : {
    ExamEngine: root.ExamEngine,
    SM: root.ExcelEngine.SpreadsheetModel
  };
  var mod = factory(deps.ExamEngine, deps.SM);
  if (typeof module === 'object' && module.exports) module.exports = mod;
  if (root) {
    root.ExcelTasks = root.ExcelTasks || {};
    root.ExcelTasks.sample = mod;
  }
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : null), function (TaskSchema, SM) {
  'use strict';

  var task = TaskSchema.defineTask({
    id: 'excel-sum-b5',
    application: 'excel',
    skill: 'Formulas & Functions',
    topic: 'SUM, số tiền, định dạng ô',
    difficulty: 'easy',
    instruction: 'Tại ô B5, tính tổng doanh thu từ B2 đến B4 bằng công thức SUM, định dạng ô là Currency (tiền tệ) và in đậm kết quả.',
    hints: [
      'Dùng =SUM(B2:B4) thay vì cộng tay từng ô.',
      'Ribbon Home → Number → chọn định dạng Currency.',
      'Ribbon Home → Font → Bold (hoặc Ctrl+B).'
    ],
    // initialState là 1 hàm để mỗi lượt làm bài tạo 1 bản engine độc lập.
    initialState: function () {
      var engine = new SM.SpreadsheetEngine();
      engine.setCellValue('Sheet1', 'A2', 'Tháng 1');
      engine.setCellValue('Sheet1', 'A3', 'Tháng 2');
      engine.setCellValue('Sheet1', 'A4', 'Tháng 3');
      engine.setCellValue('Sheet1', 'A5', 'Tổng');
      engine.setCellValue('Sheet1', 'B2', 12000000);
      engine.setCellValue('Sheet1', 'B3', 15500000);
      engine.setCellValue('Sheet1', 'B4', 9800000);
      // Trả về đúng "state cần chấm": ta serialize workbook, chứ không trả
      // instance sống (initialState phải JSON-serializable — xem
      // task-schema.instantiateInitialState()).
      return { workbookSnapshot: serializeWorkbook(engine.workbook) };
    },
    // Validator cần { engine: SpreadsheetEngine SỐNG } (gọi state.engine.getCell(...))
    // nhưng state lưu suốt lúc làm bài LUÔN là { workbookSnapshot } thuần
    // JSON (an toàn cho autosave qua IndexedDB) — ExamSession.submit() tự
    // gọi hook này đúng 1 lần lúc Nộp bài, controller UI không cần tự
    // "hydrate" thủ công nữa (trước đây phải nhớ làm đúng lúc, chỉ được
    // đảm bảo bằng comment — xem lịch sử review).
    prepareForValidation: function (state) {
      return { engine: hydrate(state) };
    },
    requirements: [
      {
        id: 'formula',
        label: 'Formula',
        points: 4,
        check: function (state) {
          var cell = state.engine.getCell('Sheet1', 'B5');
          return !!cell && typeof cell.formula === 'string' && cell.formula.replace(/\s/g, '').toUpperCase() === '=SUM(B2:B4)';
        }
      },
      {
        id: 'numberFormat',
        label: 'Number format',
        points: 3,
        check: function (state) {
          var cell = state.engine.getCell('Sheet1', 'B5');
          return !!cell && cell.numberFormat === 'Currency';
        }
      },
      {
        id: 'bold',
        label: 'Bold',
        points: 3,
        check: function (state) {
          var cell = state.engine.getCell('Sheet1', 'B5');
          return !!cell && cell.style && cell.style.bold === true;
        }
      }
    ]
  });

  function serializeWorkbook(workbook) {
    return JSON.parse(JSON.stringify(workbook));
  }

  /**
   * Dựng lại 1 SpreadsheetEngine SỐNG, ĐỘC LẬP từ workbookSnapshot (dùng
   * lúc mở task trong simulator). Phải deep-clone snapshot — nếu chỉ
   * Object.assign nông thì mọi lần hydrate() từ CÙNG 1 initialState sẽ
   * dùng chung tham chiếu `cells`/mảng lồng nhau, khiến việc thao tác ở
   * 1 lượt làm bài rò rỉ sang lượt khác (đã bắt được lỗi này qua unit
   * test js/exam-engine/__tests__/pipeline-excel.test.js).
   */
  function hydrate(initialState) {
    var snapshot = JSON.parse(JSON.stringify(initialState.workbookSnapshot));
    var workbook = new SM.Workbook();
    Object.keys(snapshot.sheets).forEach(function (name) {
      var sheet = workbook.addSheet(name);
      Object.assign(sheet, snapshot.sheets[name]);
    });
    workbook.activeSheet = snapshot.activeSheet;
    return new SM.SpreadsheetEngine(workbook);
  }

  return { task: task, hydrate: hydrate, serializeWorkbook: serializeWorkbook };
});
