/* ════════════════════════════════════════════════════════════
   js/exam-simulator-word.js — controller cho exam-simulator-word.html

   Cùng pipeline với js/exam-simulator-excel.js (đọc chú thích ở đó cho
   luồng tổng quát). Khác biệt chính: `doc` (Document Object Model,
   js/word-engine/document-model.js) là dữ liệu THUẦN JSON ngay từ đầu
   (không như SpreadsheetEngine của Excel là 1 class instance) — nên
   session.states[TASK.id] = { doc: doc } dùng được TRỰC TIẾP cho cả
   autosave (IndexedDB) lẫn Validator, không cần lớp serialize/hydrate
   riêng như Excel.

   Gõ chữ dùng contenteditable THẬT của trình duyệt (con trỏ/IME mượt),
   nhưng SAU MỖI LẦN GÕ, model được đồng bộ NGƯỢC từ DOM (domToRuns) —
   và mọi thao tác định dạng (Bold/Style/Align/List/Undo) đi qua
   document-model.js rồi VẼ LẠI TOÀN BỘ DOM từ model, để model luôn là
   nguồn sự thật cuối cùng mà Validator đọc.
   ════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var UI = window.ExamEngine.UiChrome;
  var WD = window.WordEngine.DocumentModel;
  var TASK = window.WordTasks.sample.task;
  var SESSION_ID = 'exam-word-' + TASK.id;
  var DURATION_SECONDS = 15 * 60;

  var session = new window.ExamEngine.ExamRunner.ExamSession({
    tasks: [TASK],
    durationSeconds: DURATION_SECONDS,
    onTick: UI.renderTimer,
    onTimeUp: function () { doSubmit(true); },
    onStateChange: function () { scheduleAutosave(); }
  });
  var scheduleAutosave = UI.createAutosaveScheduler(SESSION_ID, session, { demo: true });

  var doc = null; // tham chiếu TRỰC TIẾP tới session.states[TASK.id].doc — mutate tại chỗ
  var tickTimer = null;

  function commitEngineState() {
    // `doc` đã là CHÍNH tham chiếu bên trong session.states — gọi lại
    // setTaskState() không phải để "ghi" (đã ghi tại chỗ rồi) mà để bắn
    // onStateChange() (lên lịch autosave).
    session.setTaskState(TASK.id, { doc: doc });
  }

  // ────────────────────────────────────────────────────────────
  // INIT
  // ────────────────────────────────────────────────────────────
  function init() {
    window.MosExamAutosave.restore(SESSION_ID).then(function (saved) {
      if (saved && saved.snapshot && !saved.snapshot.submitted) {
        session.restoreSnapshot(saved.snapshot);
      }
      doc = session.getTaskState(TASK.id).doc;
      UI.renderInstruction(session, TASK.id);
      UI.renderHints(TASK.hints);
      renderBody();
      renderHeaderFooter();
      tickTimer = UI.startTicking(session);
      bindGlobalEvents();
      if (saved && saved.snapshot && saved.snapshot.submitted) {
        UI.showResult(saved.snapshot.result);
      }
    });
  }

  // ────────────────────────────────────────────────────────────
  // RENDER — model (doc) → DOM. Luôn vẽ lại TOÀN BỘ sau mỗi thao tác định
  // dạng để DOM không bao giờ lệch khỏi state (đổi lại: mất vị trí con
  // trỏ chính xác sau khi bấm nút định dạng — chấp nhận được, giống cảm
  // giác "áp style rồi để Word tự focus lại" hơn là giữ nguyên con trỏ
  // pixel-perfect).
  // ────────────────────────────────────────────────────────────
  function renderRunSpan(run) {
    var dataAttrs = '';
    var styles = [];
    if (run.bold) { dataAttrs += ' data-bold="1"'; styles.push('font-weight:700'); }
    if (run.italic) { dataAttrs += ' data-italic="1"'; styles.push('font-style:italic'); }
    if (run.underline) { dataAttrs += ' data-underline="1"'; styles.push('text-decoration:underline'); }
    var styleAttr = styles.length ? ' style="' + styles.join(';') + '"' : '';
    return '<span' + dataAttrs + styleAttr + '>' + UI.escapeHtml(run.text) + '</span>';
  }

  function renderBody() {
    var body = document.getElementById('exwBody');
    body.innerHTML = doc.paragraphs.map(function (p, i) {
      var text = WD.paragraphText(p);
      var inner = text.length ? p.runs.map(renderRunSpan).join('') : '<br>';
      return '<div class="exw-para" contenteditable="true" data-p="' + i + '" data-style="' + p.style + '" data-align="' + p.alignment + '" data-list="' + p.listType + '">' + inner + '</div>';
    }).join('');
    body.querySelectorAll('.exw-para').forEach(bindParagraphEvents);
  }

  function renderHeaderFooter() {
    var headerText = doc.header.runs.map(function (r) { return r.text; }).join('');
    var footerText = doc.footer.runs.map(function (r) { return r.text; }).join('');
    var headerEl = document.getElementById('exwHeader');
    var footerEl = document.getElementById('exwFooter');
    if (headerEl.textContent !== headerText) headerEl.textContent = headerText;
    if (footerEl.textContent !== footerText) footerEl.textContent = footerText;
  }

  // ────────────────────────────────────────────────────────────
  // DOM → model sync helpers
  // ────────────────────────────────────────────────────────────
  function domToRuns(paraDiv) {
    var runs = [];
    paraDiv.childNodes.forEach(function (node) {
      if (node.nodeType === 3) {
        if (node.textContent.length) runs.push(makeRun(node.textContent, false, false, false));
      } else if (node.tagName === 'SPAN') {
        var text = node.textContent;
        if (!text.length) return;
        runs.push(makeRun(text, node.dataset.bold === '1', node.dataset.italic === '1', node.dataset.underline === '1'));
      }
      // <br> hoặc node khác (paragraph rỗng) -> bỏ qua, normalizeRuns() sẽ tự thêm run rỗng.
    });
    return runs;
  }
  function makeRun(text, bold, italic, underline) {
    return { text: text, bold: bold, italic: italic, underline: underline, fontFamily: 'Calibri', fontSize: 11, color: null, highlightColor: null };
  }

  function closestParaIndex(node) {
    var el = node.nodeType === 3 ? node.parentElement : node;
    var paraDiv = el && el.closest ? el.closest('.exw-para') : null;
    return paraDiv ? parseInt(paraDiv.dataset.p, 10) : null;
  }
  function offsetWithinPara(paraDiv, targetNode, targetOffset) {
    var total = 0, found = false;
    (function walk(node) {
      if (found) return;
      if (node === targetNode) { total += targetOffset; found = true; return; }
      if (node.nodeType === 3) { total += node.textContent.length; return; }
      for (var i = 0; i < node.childNodes.length; i++) { walk(node.childNodes[i]); if (found) return; }
    })(paraDiv);
    return total;
  }
  /** Đọc window.getSelection() hiện tại và ghi vào doc.selection. Trả về false nếu con trỏ không nằm trong 1 paragraph nào (vd đang ở header/footer). */
  function syncSelectionFromDom() {
    var sel = window.getSelection();
    if (!sel.rangeCount) return false;
    var range = sel.getRangeAt(0);
    var startPara = closestParaIndex(range.startContainer);
    var endPara = closestParaIndex(range.endContainer);
    if (startPara == null || endPara == null) return false;
    var startDiv = document.querySelector('.exw-para[data-p="' + startPara + '"]');
    var endDiv = document.querySelector('.exw-para[data-p="' + endPara + '"]');
    var startOffset = offsetWithinPara(startDiv, range.startContainer, range.startOffset);
    var endOffset = offsetWithinPara(endDiv, range.endContainer, range.endOffset);
    if (startPara <= endPara) {
      WD.setSelection(doc, startPara, startOffset, endPara, endOffset);
    } else {
      WD.setSelection(doc, endPara, endOffset, startPara, startOffset);
    }
    return true;
  }
  function syncParagraphFromDom(i) {
    var div = document.querySelector('.exw-para[data-p="' + i + '"]');
    if (!div) return;
    doc.paragraphs[i].runs = domToRuns(div);
    WD.normalizeRuns(doc.paragraphs[i]);
  }
  function focusParagraph(i, offset) {
    var div = document.querySelector('.exw-para[data-p="' + i + '"]');
    if (!div) return;
    div.focus();
    var range = document.createRange();
    var walker = document.createTreeWalker(div, NodeFilter.SHOW_TEXT);
    var node = walker.nextNode();
    if (node) { range.setStart(node, Math.min(offset, node.textContent.length)); range.collapse(true); }
    else { range.selectNodeContents(div); range.collapse(true); }
    var selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }

  // ────────────────────────────────────────────────────────────
  // EVENTS
  // ────────────────────────────────────────────────────────────
  function bindParagraphEvents(div) {
    var i = parseInt(div.dataset.p, 10);
    div.addEventListener('input', function () { syncParagraphFromDom(i); commitEngineState(); });
    div.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        syncParagraphFromDom(i);
        syncSelectionFromDom();
        WD.insertParagraphBreak(doc);
        commitEngineState();
        renderBody();
        focusParagraph(i + 1, 0);
        return;
      }
      var combo = (e.ctrlKey ? 'ctrl+' : '') + e.key.toLowerCase();
      // Ctrl+C/Ctrl+V CỐ Ý không đi qua WD.handleKeyboardShortcut ở đây:
      // document-model.js có sẵn copySelection()/pasteAtSelection() dùng
      // clipboard NỘI BỘ (doc.clipboard), nhưng nếu bắt Ctrl+V ở tầng
      // keydown và preventDefault() thì sự kiện 'paste' native (đọc đúng
      // clipboard THẬT của hệ điều hành, xem listener bên dưới) KHÔNG BAO
      // GIỜ được bắn nữa — học viên copy từ ngoài trang (Word thật, tab
      // khác) rồi Ctrl+V vào đây sẽ không dán được gì (bug thật đã bắt
      // được qua code review). Để native copy/paste tự lo — copy đã tự
      // đưa text lên OS clipboard, paste do listener 'paste' xử lý.
      if (combo !== 'ctrl+c' && combo !== 'ctrl+v' && WD.KEYBOARD_SHORTCUTS.indexOf(combo) !== -1) {
        e.preventDefault();
        syncParagraphFromDom(i);
        syncSelectionFromDom();
        WD.handleKeyboardShortcut(doc, combo);
        commitEngineState();
        renderBody();
      }
    });
    // Chặn paste HTML từ ngoài — chỉ nhận text thuần (đọc từ OS clipboard
    // THẬT qua e.clipboardData, không phải doc.clipboard nội bộ), tránh
    // trình duyệt nhét thẻ lạ vào DOM mà model không biết tới.
    div.addEventListener('paste', function (e) {
      e.preventDefault();
      var text = (e.clipboardData || window.clipboardData).getData('text/plain');
      document.execCommand('insertText', false, text);
    });
  }

  function bindGlobalEvents() {
    document.querySelectorAll('.exs-toolbar [data-cmd]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (!syncSelectionFromDom()) return;
        WD.toggleCharacterFormat(doc, btn.dataset.cmd);
        commitEngineState();
        renderBody();
      });
    });
    document.querySelectorAll('.exs-toolbar [data-align]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (!syncSelectionFromDom()) return;
        WD.setAlignment(doc, btn.dataset.align);
        commitEngineState();
        renderBody();
      });
    });
    document.querySelectorAll('.exs-toolbar [data-list]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (!syncSelectionFromDom()) return;
        WD.setListType(doc, btn.dataset.list, 0);
        commitEngineState();
        renderBody();
      });
    });
    document.getElementById('exsParaStyle').addEventListener('change', function (e) {
      if (!syncSelectionFromDom()) return;
      WD.setParagraphStyle(doc, e.target.value);
      commitEngineState();
      renderBody();
    });

    document.getElementById('exwHeader').addEventListener('input', function () {
      WD.setHeaderText(doc, this.textContent);
      commitEngineState();
    });
    document.getElementById('exwFooter').addEventListener('input', function () {
      WD.setFooterText(doc, this.textContent);
      commitEngineState();
    });

    UI.bindCommonButtons(function () { doSubmit(false); });
  }

  // ────────────────────────────────────────────────────────────
  // SUBMIT
  // ────────────────────────────────────────────────────────────
  function doSubmit(isTimeUp) {
    if (session.submitted) return;
    if (tickTimer) clearInterval(tickTimer);
    commitEngineState();
    var result = session.submit();
    window.MosExamAutosave.autosave(SESSION_ID, { demo: true }, session.toSnapshot());
    UI.showResult(result, isTimeUp);
  }

  window.__exwDebug = { getDoc: function () { return doc; }, session: session };
  init();
})();
