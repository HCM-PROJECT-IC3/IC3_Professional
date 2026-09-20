/* ════════════════════════════════════════════════════════════
   js/exam-simulator-excel.js — controller cho exam-simulator-excel.html

   Chứng minh pipeline THẬT hoạt động với thao tác chuột/bàn phím thật:
     User Actions (click ô, gõ công thức, Bold, đổi Number format)
       → Application State (SpreadsheetEngine sống, js/excel-engine/spreadsheet-model.js)
       → Autosave (IndexedDB, js/exam-engine/autosave-service.js)
       → [Nộp bài] → Validation Engine → Partial Scoring → Task Result

   Quy ước state 2 lớp (xem ghi chú trong ExcelTasks.sample):
     - session.states[taskId] LUÔN ở dạng JSON-serializable
       { workbookSnapshot } — an toàn để autosave qua IndexedDB.
     - `engine` (biến module-level) là bản SỐNG (SpreadsheetEngine) dùng
       để vẽ UI + nhận thao tác; sau mỗi thao tác, serialize lại vào
       session.states trước khi autosave.
     - Lúc Nộp bài, ExamSession.submit() tự gọi task.prepareForValidation()
       (khai báo trong excel-tasks-sample.js) để hydrate lại { engine }
       SỐNG cho Validator — controller ở ĐÂY không cần tự đổi shape nữa
       (trước đây phải tự nhớ swap thủ công đúng lúc, chỉ được đảm bảo
       bằng comment; nay việc này nằm ở đúng 1 chỗ trong exam-runner.js).
   ════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var UI = window.ExamEngine.UiChrome;
  var TASK = window.ExcelTasks.sample.task;
  var SESSION_ID = 'exam-excel-' + TASK.id; // 1 học viên demo — tích hợp roster thật ở đợt sau
  var COLS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
  var ROWS = 15;
  var DURATION_SECONDS = 15 * 60;

  var session = new window.ExamEngine.ExamRunner.ExamSession({
    tasks: [TASK],
    durationSeconds: DURATION_SECONDS,
    onTick: UI.renderTimer,
    onTimeUp: function () { doSubmit(true); },
    onStateChange: function () { scheduleAutosave(); }
  });
  var scheduleAutosave = UI.createAutosaveScheduler(SESSION_ID, session, { demo: true });

  var engine = null; // SpreadsheetEngine sống — được (re)hydrate lúc init/restore
  var selected = { col: 2, row: 5 }; // mặc định trỏ vào B5 (đúng ô đề bài yêu cầu)
  var tickTimer = null;

  function a1(col, row) { return window.ExcelEngine.FormulaEngine.indexToCol(col) + row; }

  function commitEngineState() {
    session.setTaskState(TASK.id, { workbookSnapshot: window.ExcelTasks.sample.serializeWorkbook(engine.workbook) });
  }

  // ────────────────────────────────────────────────────────────
  // INIT — khôi phục từ autosave nếu có (refresh trang / mất mạng tạm thời)
  // ────────────────────────────────────────────────────────────
  function init() {
    window.MosExamAutosave.restore(SESSION_ID).then(function (saved) {
      if (saved && saved.snapshot && !saved.snapshot.submitted) {
        session.restoreSnapshot(saved.snapshot);
      }
      engine = window.ExcelTasks.sample.hydrate(session.getTaskState(TASK.id));
      UI.renderInstruction(session, TASK.id);
      UI.renderHints(TASK.hints);
      renderGrid();
      renderFormulaBar();
      tickTimer = UI.startTicking(session);
      bindEvents();
      if (saved && saved.snapshot && saved.snapshot.submitted) {
        // Bài đã nộp trước đó (vd refresh sau khi nộp) — hiện lại kết quả, không cho làm tiếp.
        UI.showResult(saved.snapshot.result);
      }
    });
  }

  // Hook debug nhẹ (giống window.__wsDebug ở word-simulator.js) — không
  // dùng trong luồng chính, chỉ để kiểm thử thủ công/Playwright.
  window.__exsDebug = { getEngine: function () { return engine; }, getSelected: function () { return selected; }, session: session };

  // ────────────────────────────────────────────────────────────
  // GRID RENDER
  // ────────────────────────────────────────────────────────────
  function renderGrid() {
    var table = document.getElementById('exsGrid');
    var html = '<thead><tr><th></th>' + COLS.map(function (c) { return '<th>' + c + '</th>'; }).join('') + '</tr></thead><tbody>';
    for (var r = 1; r <= ROWS; r++) {
      html += '<tr><td class="exs-row-header">' + r + '</td>';
      for (var c = 1; c <= COLS.length; c++) {
        var ref = a1(c, r);
        var cell = engine.getCell('Sheet1', ref);
        var display = formatDisplay(cell);
        var classes = ['exs-cell'];
        if (cell) {
          if (cell.style.bold) classes.push('exs-bold');
          if (cell.style.italic) classes.push('exs-italic');
          if (cell.style.underline) classes.push('exs-underline');
          if (cell.error) classes.push('exs-error');
        }
        if (c === selected.col && r === selected.row) classes.push('exs-selected');
        html += '<td class="' + classes.join(' ') + '" data-col="' + c + '" data-row="' + r + '">' + UI.escapeHtml(display) + '</td>';
      }
      html += '</tr>';
    }
    html += '</tbody>';
    table.innerHTML = html;
    table.querySelectorAll('td.exs-cell').forEach(function (td) {
      td.addEventListener('click', function () {
        // QUAN TRỌNG: chốt nội dung công thức đang gõ dở ở Ô ĐANG CHỌN
        // (selected CŨ) TRƯỚC KHI đổi sang ô mới — nếu dựa vào sự kiện
        // "blur" của input để chốt, thứ tự thực thi không đáng tin cậy:
        // blur cháy lúc mousedown (TRƯỚC click), commit lúc đó vẫn đọc
        // `selected` cũ nên đúng cell, nhưng renderGrid() bên trong commit
        // sẽ THAY THẾ toàn bộ <td> (kể cả ô vừa được click) TRƯỚC KHI sự
        // kiện click thật sự bắn ra — có nguy cơ mất bản ghi selected mới
        // hoặc (tệ hơn) click tiếp theo bị "nuốt". Gọi commit tường minh ở
        // đây loại bỏ hoàn toàn phụ thuộc vào thời điểm blur.
        commitPendingInput();
        selected = { col: parseInt(td.dataset.col, 10), row: parseInt(td.dataset.row, 10) };
        renderGrid();
        renderFormulaBar();
      });
    });
  }

  function formatDisplay(cell) {
    if (!cell) return '';
    if (cell.error) return cell.error;
    if (cell.value == null) return '';
    if (typeof cell.value === 'number') {
      if (cell.numberFormat === 'Currency') return cell.value.toLocaleString('vi-VN') + ' ₫';
      if (cell.numberFormat === 'Percentage') return (cell.value * 100).toFixed(2) + '%';
      return String(cell.value);
    }
    return String(cell.value);
  }

  function renderFormulaBar() {
    var ref = a1(selected.col, selected.row);
    document.getElementById('exsNameBox').textContent = ref;
    var cell = engine.getCell('Sheet1', ref);
    document.getElementById('exsFormulaInput').value = cell ? (cell.formula || (cell.value == null ? '' : String(cell.value))) : '';
    document.getElementById('exsNumberFormat').value = cell ? cell.numberFormat : 'General';
    ['bold', 'italic', 'underline'].forEach(function (f) {
      var btn = document.querySelector('[data-cmd="' + f + '"]');
      btn.classList.toggle('exs-active', !!(cell && cell.style[f]));
    });
  }

  // ────────────────────────────────────────────────────────────
  // EVENTS
  // ────────────────────────────────────────────────────────────
  function bindEvents() {
    var input = document.getElementById('exsFormulaInput');
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        commitPendingInput();
        moveSelection(0, 1);
      }
    });
    // KHÔNG dùng sự kiện 'blur' để chốt công thức — xem chú thích dài ở
    // click handler của ô lưới (renderGrid()) về lý do thứ tự blur/click
    // không đáng tin cậy cho việc này. commitPendingInput() được gọi
    // tường minh ở MỌI nơi có thể rời khỏi ô đang chọn (click ô khác,
    // Enter, bấm định dạng, đổi Number format, Nộp bài).

    document.querySelectorAll('.exs-toolbar [data-cmd]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        commitPendingInput();
        var ref = a1(selected.col, selected.row);
        var cell = engine.getCell('Sheet1', ref) || {};
        var field = btn.dataset.cmd;
        engine.setCellStyle('Sheet1', ref, { [field]: !(cell.style && cell.style[field]) });
        commitEngineState();
        renderGrid();
        renderFormulaBar();
      });
    });

    document.getElementById('exsNumberFormat').addEventListener('change', function (e) {
      commitPendingInput();
      var ref = a1(selected.col, selected.row);
      engine.setCellNumberFormat('Sheet1', ref, e.target.value);
      commitEngineState();
      renderGrid();
    });

    UI.bindCommonButtons(function () {
      commitPendingInput();
      doSubmit(false);
    });
  }

  /**
   * Chốt nội dung ô công thức đang gõ dở vào ĐÚNG ô hiện tại (selected)
   * — gọi TƯỜNG MINH tại mọi điểm có thể rời khỏi ô (không dựa vào sự
   * kiện blur, xem lý do ở renderGrid()). Bỏ qua nếu giá trị không đổi
   * để tránh recalc/re-render thừa mỗi lần chỉ điều hướng qua lại.
   */
  function commitPendingInput() {
    var ref = a1(selected.col, selected.row);
    var raw = document.getElementById('exsFormulaInput').value;
    var cell = engine.getCell('Sheet1', ref);
    var current = cell ? (cell.formula || (cell.value == null ? '' : String(cell.value))) : '';
    if (raw === current) return;
    engine.setCellFormula('Sheet1', ref, raw);
    commitEngineState();
  }

  function moveSelection(dCol, dRow) {
    selected = {
      col: Math.min(COLS.length, Math.max(1, selected.col + dCol)),
      row: Math.min(ROWS, Math.max(1, selected.row + dRow))
    };
    renderGrid();
    renderFormulaBar();
  }

  // ────────────────────────────────────────────────────────────
  // SUBMIT — session.states[TASK.id] vẫn ở dạng { workbookSnapshot }
  // (không cần tự đổi sang { engine } ở đây nữa: ExamSession.submit() tự
  // gọi task.prepareForValidation() — xem excel-tasks-sample.js — đúng 1
  // lần lúc nộp bài). Hiện Task Result đúng hình dạng bắt buộc
  // (completed/score/maxScore/details).
  // ────────────────────────────────────────────────────────────
  function doSubmit(isTimeUp) {
    if (session.submitted) return;
    if (tickTimer) clearInterval(tickTimer);
    commitEngineState();
    var result = session.submit();
    window.MosExamAutosave.autosave(SESSION_ID, { demo: true }, session.toSnapshot());
    UI.showResult(result, isTimeUp);
  }

  init();
})();
