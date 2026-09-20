/* ════════════════════════════════════════════════════════════
   js/word-engine/document-model.js — MOS Exam Simulator (Word)

   Document Object Model THẬT của Word — Validator đọc state này để
   chấm bài (không đọc chuỗi thao tác). Cấu trúc:

   Document {
     paragraphs: [Paragraph],
     tables: [Table], images: [Image], shapes: [Shape],
     header: RunContainer, footer: RunContainer,
     pageNumbers: { enabled, position, format },
     pageLayout: { marginsCm, orientation, size, columns },
     selection: { startPara, startOffset, endPara, endOffset },
     clipboard: RunContainer|null,
     history: { past: [...snapshots], future: [...snapshots] }
   }

   Paragraph {
     id, runs: [Run], style ('Normal'|'Heading1'|...), alignment,
     listType ('none'|'bullet'|'number'), listLevel
   }
   Run { text, bold, italic, underline, fontFamily, fontSize, color, highlightColor }

   Thiết kế: paragraph là 1 chuỗi Run nối tiếp — format ký tự áp dụng
   theo SELECTION (giống Word thật: bôi đen 1 đoạn text rồi Bold) bằng
   cách CẮT (split) run tại đúng ranh giới offset, không phải áp cho cả
   run/cả đoạn.
   ════════════════════════════════════════════════════════════ */
(function (root, factory) {
  var mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  if (root) {
    root.WordEngine = root.WordEngine || {};
    root.WordEngine.DocumentModel = mod;
  }
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : null), function () {
  'use strict';

  var uidCounter = 0;
  function uid(prefix) { return prefix + (++uidCounter); }

  function defaultRun(text) {
    return { text: text || '', bold: false, italic: false, underline: false, fontFamily: 'Calibri', fontSize: 11, color: null, highlightColor: null };
  }
  function defaultParagraph(text, style) {
    return { id: uid('p'), runs: [defaultRun(text || '')], style: style || 'Normal', alignment: 'left', listType: 'none', listLevel: 0, spacingBefore: 0, spacingAfter: 0 };
  }

  function createDocument() {
    return {
      paragraphs: [defaultParagraph('')],
      tables: [],
      images: [],
      shapes: [],
      header: { runs: [] },
      footer: { runs: [] },
      pageNumbers: { enabled: false, position: 'bottom-center', format: 'plain' },
      pageLayout: { marginsCm: { top: 2.54, bottom: 2.54, left: 2.54, right: 2.54 }, orientation: 'portrait', size: 'A4', columns: 1 },
      selection: { startPara: 0, startOffset: 0, endPara: 0, endOffset: 0 },
      clipboard: null,
      history: { past: [], future: [] }
    };
  }

  // ────────────────────────────────────────────────────────────
  // Text helpers — 1 paragraph nhìn như 1 chuỗi text logic ghép từ các run
  // ────────────────────────────────────────────────────────────
  function paragraphText(p) {
    return p.runs.map(function (r) { return r.text; }).join('');
  }

  function runsHaveSameFormat(a, b) {
    return a.bold === b.bold && a.italic === b.italic && a.underline === b.underline &&
      a.fontFamily === b.fontFamily && a.fontSize === b.fontSize &&
      a.color === b.color && a.highlightColor === b.highlightColor;
  }

  /**
   * Dọn run rỗng (text length 0) và gộp các run liền kề CÙNG định dạng.
   * Bắt buộc phải gọi trước mỗi lần split/format — nếu không, run rỗng
   * "mồ côi" (vd còn sót lại từ paragraph rỗng ban đầu sau khi gõ text
   * vào vị trí 0) sẽ lọt vào p.runs và làm sai các check kiểu
   * "toàn bộ paragraph đã bold" (every() quét luôn cả run rỗng bold=false).
   */
  function normalizeRuns(p) {
    var nonEmpty = p.runs.filter(function (r) { return r.text.length > 0; });
    var merged = [];
    nonEmpty.forEach(function (r) {
      var last = merged[merged.length - 1];
      if (last && runsHaveSameFormat(last, r)) last.text += r.text;
      else merged.push(Object.assign({}, r));
    });
    p.runs = merged.length ? merged : [defaultRun('')];
  }

  /**
   * Cắt các run của paragraph tại đúng 2 offset (start, end) để có ranh
   * giới run rõ ràng ngay tại vị trí đó — trả về index của run bắt đầu
   * đúng tại offset "start" (dùng để biết vùng run nào nằm trong [start,end)).
   */
  function splitRunsAt(p, offsets) {
    normalizeRuns(p);
    var sorted = offsets.slice().sort(function (a, b) { return a - b; });
    sorted.forEach(function (offset) {
      var pos = 0;
      for (var i = 0; i < p.runs.length; i++) {
        var run = p.runs[i];
        var runEnd = pos + run.text.length;
        if (offset > pos && offset < runEnd) {
          var cut = offset - pos;
          var left = Object.assign({}, run, { text: run.text.slice(0, cut) });
          var right = Object.assign({}, run, { text: run.text.slice(cut) });
          p.runs.splice(i, 1, left, right);
          break;
        }
        pos = runEnd;
      }
    });
  }

  /** Trả về danh sách run index nằm (toàn bộ hoặc 1 phần, sau khi đã split) trong [start,end). */
  function runsInRange(p, start, end) {
    if (end <= start) return [];
    splitRunsAt(p, [start, end]);
    var indices = [];
    var pos = 0;
    for (var i = 0; i < p.runs.length; i++) {
      var runEnd = pos + p.runs[i].text.length;
      if (pos >= start && runEnd <= end && p.runs[i].text.length > 0) indices.push(i);
      pos = runEnd;
    }
    return indices;
  }

  // ────────────────────────────────────────────────────────────
  // History (Undo/Redo) — snapshot toàn bộ nội dung document (đủ dùng ở
  // quy mô 1 bài thi; không tối ưu diff vì không cần thiết).
  // ────────────────────────────────────────────────────────────
  function snapshotContent(doc) {
    return JSON.stringify({ paragraphs: doc.paragraphs, tables: doc.tables, images: doc.images, shapes: doc.shapes, header: doc.header, footer: doc.footer, pageNumbers: doc.pageNumbers, pageLayout: doc.pageLayout });
  }
  function pushHistory(doc) {
    doc.history.past.push(snapshotContent(doc));
    if (doc.history.past.length > 100) doc.history.past.shift();
    doc.history.future = [];
  }
  function restoreSnapshot(doc, snap) {
    var data = JSON.parse(snap);
    Object.assign(doc, data);
  }
  function undo(doc) {
    if (!doc.history.past.length) return false;
    doc.history.future.push(snapshotContent(doc));
    var snap = doc.history.past.pop();
    restoreSnapshot(doc, snap);
    return true;
  }
  function redo(doc) {
    if (!doc.history.future.length) return false;
    doc.history.past.push(snapshotContent(doc));
    var snap = doc.history.future.pop();
    restoreSnapshot(doc, snap);
    return true;
  }

  // ────────────────────────────────────────────────────────────
  // ACTIONS — mỗi action ghi history TRƯỚC khi mutate (để undo về được
  // đúng trạng thái ngay trước action đó).
  // ────────────────────────────────────────────────────────────

  /** Đặt vùng chọn hiện tại (dùng bởi UI khi người dùng bôi đen bằng chuột/bàn phím). */
  function setSelection(doc, startPara, startOffset, endPara, endOffset) {
    doc.selection = { startPara: startPara, startOffset: startOffset, endPara: endPara, endOffset: endOffset };
  }

  /** Chèn text tại vị trí con trỏ (selection collapsed) hoặc thay thế vùng đang chọn. */
  function insertText(doc, text) {
    pushHistory(doc);
    var sel = doc.selection;
    if (sel.startPara !== sel.endPara || sel.startOffset !== sel.endOffset) {
      deleteRangeInternal(doc, sel);
    }
    var p = doc.paragraphs[sel.startPara];
    splitRunsAt(p, [sel.startOffset]);
    var pos = 0, inserted = false;
    for (var i = 0; i < p.runs.length; i++) {
      var runEnd = pos + p.runs[i].text.length;
      if (!inserted && sel.startOffset === pos) {
        p.runs.splice(i, 0, Object.assign({}, defaultRun(text), lastRunFormat(p, sel.startOffset)));
        inserted = true;
        break;
      }
      pos = runEnd;
    }
    if (!inserted) p.runs.push(Object.assign({}, defaultRun(text), lastRunFormat(p, sel.startOffset)));
    normalizeRuns(p);
    var newOffset = sel.startOffset + text.length;
    setSelection(doc, sel.startPara, newOffset, sel.startPara, newOffset);
  }

  function lastRunFormat(p, offset) {
    // Format ký tự mới gõ kế thừa từ run ngay trước vị trí con trỏ (hành vi Word thật).
    var pos = 0;
    for (var i = 0; i < p.runs.length; i++) {
      pos += p.runs[i].text.length;
      if (pos >= offset) {
        var r = p.runs[i];
        return { bold: r.bold, italic: r.italic, underline: r.underline, fontFamily: r.fontFamily, fontSize: r.fontSize, color: r.color, highlightColor: r.highlightColor };
      }
    }
    return {};
  }

  /**
   * Xoá vùng [start,end) — GIỮ NGUYÊN định dạng của phần văn bản CÒN LẠI
   * (cắt theo ranh giới run thật, không gộp cả đoạn về 1 run theo định
   * dạng của run đầu tiên). Trước đây collapse về `Object.assign({},
   * p.runs[0], {text: newText})` làm mất định dạng của phần text sống
   * sót nếu nó vốn có định dạng KHÁC run đầu (vd xoá phần plain-text mở
   * đầu, chữ bold còn lại phía sau bị "tẩy" luôn thành plain) — bắt được
   * qua code review, xem js/word-engine/__tests__/document-model.test.js.
   */
  function deleteRangeInternal(doc, sel) {
    if (sel.startPara === sel.endPara) {
      var p = doc.paragraphs[sel.startPara];
      splitRunsAt(p, [sel.startOffset, sel.endOffset]);
      var pos = 0;
      p.runs = p.runs.filter(function (run) {
        var runStart = pos, runEnd = pos + run.text.length;
        pos = runEnd;
        // Giữ lại run nếu nó nằm HOÀN TOÀN ngoài vùng bị xoá.
        return runEnd <= sel.startOffset || runStart >= sel.endOffset;
      });
      normalizeRuns(p);
    } else {
      // Xoá xuyên nhiều paragraph: giữ phần ĐẦU của paragraph đầu (trước
      // start) + phần CUỐI của paragraph cuối (sau end), MỖI phần giữ
      // NGUYÊN run/định dạng gốc của nó thay vì gộp phẳng thành 1 run.
      var startP = doc.paragraphs[sel.startPara];
      var endP = doc.paragraphs[sel.endPara];
      splitRunsAt(startP, [sel.startOffset]);
      splitRunsAt(endP, [sel.endOffset]);
      var keepStartRuns = [];
      var posStart = 0;
      startP.runs.forEach(function (run) {
        if (posStart < sel.startOffset) keepStartRuns.push(run);
        posStart += run.text.length;
      });
      var keepEndRuns = [];
      var posEnd = 0;
      endP.runs.forEach(function (run) {
        var runEnd = posEnd + run.text.length;
        if (runEnd > sel.endOffset) keepEndRuns.push(run);
        posEnd = runEnd;
      });
      startP.runs = keepStartRuns.concat(keepEndRuns);
      normalizeRuns(startP);
      doc.paragraphs.splice(sel.startPara + 1, sel.endPara - sel.startPara);
    }
  }

  /** Xoá vùng đang chọn (Delete/Backspace khi có selection). */
  function deleteSelection(doc) {
    pushHistory(doc);
    var sel = doc.selection;
    deleteRangeInternal(doc, sel);
    setSelection(doc, sel.startPara, sel.startOffset, sel.startPara, sel.startOffset);
  }

  /** Phần lõi của applyCharacterFormat KHÔNG tự pushHistory — dùng nội bộ
   * bởi toggleCharacterFormat() để có thể chụp lịch sử 1 LẦN DUY NHẤT,
   * TRƯỚC bước dò "cả vùng đã bật format chưa" (bước dò đó tự nó gọi
   * runsInRange() làm split ranh giới run — nếu pushHistory xảy ra SAU
   * bước dò như trước đây, ảnh chụp Undo sẽ là bản ĐÃ BỊ SPLIT thay vì
   * đúng trạng thái người dùng nhìn thấy trước khi bấm Bold). */
  function applyCharacterFormatInternal(doc, format) {
    var sel = doc.selection;
    for (var pi = sel.startPara; pi <= sel.endPara; pi++) {
      var p = doc.paragraphs[pi];
      var s = pi === sel.startPara ? sel.startOffset : 0;
      var e = pi === sel.endPara ? sel.endOffset : paragraphText(p).length;
      var idxs = runsInRange(p, s, e);
      idxs.forEach(function (idx) { Object.assign(p.runs[idx], format); });
    }
  }
  /** Áp định dạng ký tự (bold/italic/underline/font/size/color/highlight) lên vùng đang chọn. */
  function applyCharacterFormat(doc, format) {
    pushHistory(doc);
    applyCharacterFormatInternal(doc, format);
  }

  /** "Toggle" bold/italic/underline — nếu TOÀN BỘ vùng chọn đã bật thì tắt, ngược lại bật hết (đúng hành vi Word). */
  function toggleCharacterFormat(doc, field) {
    // pushHistory() PHẢI chạy TRƯỚC bước dò "cả vùng đã bật field chưa"
    // (runsInRange() bên dưới tự làm split ranh giới run) — nếu không,
    // ảnh Undo sẽ chụp lại bản ĐÃ BỊ SPLIT (nhiều run vụn cùng định dạng)
    // thay vì đúng cấu trúc run gốc trước khi người dùng bấm nút.
    pushHistory(doc);
    var sel = doc.selection;
    var allOn = true;
    for (var pi = sel.startPara; pi <= sel.endPara && allOn; pi++) {
      var p = doc.paragraphs[pi];
      var s = pi === sel.startPara ? sel.startOffset : 0;
      var e = pi === sel.endPara ? sel.endOffset : paragraphText(p).length;
      var idxsCheck = runsInRange(p, s, e);
      if (!idxsCheck.length) allOn = false;
      idxsCheck.forEach(function (idx) { if (!p.runs[idx][field]) allOn = false; });
    }
    var patch = {};
    patch[field] = !allOn;
    applyCharacterFormatInternal(doc, patch);
  }

  /** Đặt paragraph style (Normal/Heading1/Heading2/Title/...) cho 1 hoặc nhiều paragraph trong selection. */
  function setParagraphStyle(doc, style) {
    pushHistory(doc);
    var sel = doc.selection;
    for (var pi = sel.startPara; pi <= sel.endPara; pi++) doc.paragraphs[pi].style = style;
  }
  function setAlignment(doc, alignment) {
    pushHistory(doc);
    var sel = doc.selection;
    for (var pi = sel.startPara; pi <= sel.endPara; pi++) doc.paragraphs[pi].alignment = alignment;
  }
  function setListType(doc, listType, listLevel) {
    pushHistory(doc);
    var sel = doc.selection;
    for (var pi = sel.startPara; pi <= sel.endPara; pi++) {
      doc.paragraphs[pi].listType = listType;
      doc.paragraphs[pi].listLevel = listLevel || 0;
    }
  }

  /** Chèn 1 paragraph mới (Enter) ngay sau paragraph hiện tại. */
  /**
   * Enter — 2 lỗi thật đã bắt được ở bản cũ:
   *   1) Chỉ đọc sel.startOffset, BỎ QUA trường hợp đang có 1 vùng chọn
   *      (startOffset !== endOffset): nếu học viên bôi đen 1 đoạn rồi bấm
   *      Enter, Word thật XOÁ đoạn đó rồi mới tách dòng tại đúng chỗ đó —
   *      bản cũ tách dòng tại startOffset và "phần bị bôi đen" vẫn còn
   *      nguyên trong 1 trong 2 đoạn mới, dữ liệu sai hẳn.
   *   2) `p.runs = [defaultRun(before)]` / `defaultParagraph(after, ...)`
   *      collapse CẢ 2 phần về định dạng mặc định (bold=false...), xoá
   *      sạch định dạng gốc của toàn bộ paragraph dù người dùng chỉ bấm
   *      Enter, không hề đổi định dạng gì.
   */
  function insertParagraphBreak(doc) {
    pushHistory(doc);
    var sel = doc.selection;
    if (sel.startPara !== sel.endPara || sel.startOffset !== sel.endOffset) {
      deleteRangeInternal(doc, sel);
      sel = { startPara: sel.startPara, startOffset: sel.startOffset, endPara: sel.startPara, endOffset: sel.startOffset };
    }
    var p = doc.paragraphs[sel.startPara];
    splitRunsAt(p, [sel.startOffset]);
    var beforeRuns = [], afterRuns = [];
    var pos = 0;
    p.runs.forEach(function (run) {
      if (pos < sel.startOffset) beforeRuns.push(run); else afterRuns.push(run);
      pos += run.text.length;
    });
    p.runs = beforeRuns;
    normalizeRuns(p);
    var newPara = defaultParagraph('', p.style);
    newPara.runs = afterRuns;
    newPara.alignment = p.alignment;
    newPara.listType = p.listType;
    newPara.listLevel = p.listLevel;
    normalizeRuns(newPara);
    doc.paragraphs.splice(sel.startPara + 1, 0, newPara);
    setSelection(doc, sel.startPara + 1, 0, sel.startPara + 1, 0);
  }

  // ────────────────────────────────────────────────────────────
  // Tables / Images / Shapes
  // ────────────────────────────────────────────────────────────
  function insertTable(doc, atParaIndex, rows, cols) {
    pushHistory(doc);
    var cells = [];
    for (var r = 0; r < rows; r++) {
      var row = [];
      for (var c = 0; c < cols; c++) row.push({ runs: [defaultRun('')] });
      cells.push(row);
    }
    var table = { id: uid('tbl'), anchorParaIndex: atParaIndex, rows: rows, cols: cols, cells: cells, style: 'TableGridLight' };
    doc.tables.push(table);
    return table;
  }
  function setTableCellText(doc, tableId, row, col, text) {
    pushHistory(doc);
    var table = doc.tables.filter(function (t) { return t.id === tableId; })[0];
    if (!table) throw new Error('Table not found: ' + tableId);
    table.cells[row][col].runs = [defaultRun(text)];
  }
  function insertImage(doc, atParaIndex, imageDef) {
    pushHistory(doc);
    var image = Object.assign({ id: uid('img'), anchorParaIndex: atParaIndex, position: { x: 0, y: 0 }, size: { width: 200, height: 150 }, wrapText: 'inline' }, imageDef);
    doc.images.push(image);
    return image;
  }
  function insertShape(doc, atParaIndex, shapeDef) {
    pushHistory(doc);
    var shape = Object.assign({ id: uid('shp'), anchorParaIndex: atParaIndex, shapeType: 'rectangle', position: { x: 0, y: 0 }, size: { width: 100, height: 100 }, fillColor: '#4472C4', text: '' }, shapeDef);
    doc.shapes.push(shape);
    return shape;
  }

  // ────────────────────────────────────────────────────────────
  // Header/Footer/Page numbers/Page layout
  // ────────────────────────────────────────────────────────────
  function setHeaderText(doc, text) { pushHistory(doc); doc.header.runs = [defaultRun(text)]; }
  function setFooterText(doc, text) { pushHistory(doc); doc.footer.runs = [defaultRun(text)]; }
  function setPageNumbers(doc, enabled, position, format) {
    pushHistory(doc);
    doc.pageNumbers = { enabled: enabled, position: position || doc.pageNumbers.position, format: format || doc.pageNumbers.format };
  }
  function setPageLayout(doc, patch) {
    pushHistory(doc);
    // Merge marginsCm theo từng field TRƯỚC — nếu Object.assign(doc.pageLayout, patch)
    // chạy trước, nó thay thế thẳng doc.pageLayout.marginsCm bằng patch.marginsCm
    // (cùng tham chiếu), làm mất các field margin không được truyền (vd chỉ đổi top).
    var marginsCm = patch.marginsCm;
    var rest = Object.assign({}, patch);
    delete rest.marginsCm;
    Object.assign(doc.pageLayout, rest);
    if (marginsCm) Object.assign(doc.pageLayout.marginsCm, marginsCm);
  }

  // ────────────────────────────────────────────────────────────
  // Find / Replace
  // ────────────────────────────────────────────────────────────
  function findAll(doc, searchText, matchCase) {
    var matches = [];
    doc.paragraphs.forEach(function (p, pi) {
      var text = paragraphText(p);
      var haystack = matchCase ? text : text.toLowerCase();
      var needle = matchCase ? searchText : searchText.toLowerCase();
      if (!needle) return;
      var idx = haystack.indexOf(needle);
      while (idx !== -1) {
        matches.push({ paraIndex: pi, start: idx, end: idx + needle.length });
        idx = haystack.indexOf(needle, idx + needle.length);
      }
    });
    return matches;
  }
  /**
   * Thay TỪNG match trong 1 paragraph theo đúng ranh giới run (không gộp
   * cả đoạn về 1 run theo định dạng run đầu) — 2 lỗi thật đã bắt được ở
   * bản cũ:
   *   1) Text KHÔNG bị thay (trước/sau match, hoặc phần match nằm giữa 1
   *      run có định dạng khác run đầu) bị "tẩy" về định dạng của run[0].
   *   2) `count` là biến CHUNG cho mọi paragraph — hễ 1 paragraph nào đó
   *      trước đó có match, MỌI paragraph sau (kể cả paragraph không hề
   *      có match) đều bị collapse về 1 run vì điều kiện `if (count)` xét
   *      trên tổng số match toàn tài liệu chứ không phải của riêng
   *      paragraph đó.
   * Xử lý match từ CUỐI paragraph về ĐẦU để offset các match trước đó
   * không bị lệch khi replaceText khác độ dài searchText.
   */
  function replaceInParagraph(p, searchText, replaceText, matchCase) {
    var text = paragraphText(p);
    var haystack = matchCase ? text : text.toLowerCase();
    var needle = matchCase ? searchText : searchText.toLowerCase();
    if (!needle) return 0;
    var matches = [];
    var idx = haystack.indexOf(needle);
    while (idx !== -1) {
      matches.push({ start: idx, end: idx + needle.length });
      idx = haystack.indexOf(needle, idx + needle.length);
    }
    if (!matches.length) return 0;
    matches.reverse().forEach(function (m) {
      splitRunsAt(p, [m.start, m.end]);
      var pos = 0, insertIndex = -1, inheritedFormat = null;
      var newRuns = [];
      p.runs.forEach(function (run) {
        var runStart = pos, runEnd = pos + run.text.length;
        pos = runEnd;
        if (runEnd <= m.start || runStart >= m.end) { newRuns.push(run); return; }
        // Run nằm trong vùng match -> loại khỏi kết quả, nhưng nhớ định
        // dạng của run ĐẦU TIÊN bị loại để phần thay thế kế thừa đúng vị
        // trí đó (giống hành vi Find/Replace thật của Word).
        if (inheritedFormat === null) inheritedFormat = run;
        if (insertIndex === -1) insertIndex = newRuns.length;
      });
      if (insertIndex === -1) insertIndex = newRuns.length;
      newRuns.splice(insertIndex, 0, Object.assign({}, inheritedFormat || defaultRun(''), { text: replaceText }));
      p.runs = newRuns;
    });
    normalizeRuns(p);
    return matches.length;
  }
  function replaceAll(doc, searchText, replaceText, matchCase) {
    pushHistory(doc);
    var count = 0;
    doc.paragraphs.forEach(function (p) { count += replaceInParagraph(p, searchText, replaceText, matchCase); });
    return count;
  }

  // ────────────────────────────────────────────────────────────
  // Copy / Paste
  // ────────────────────────────────────────────────────────────
  function copySelection(doc) {
    var sel = doc.selection;
    if (sel.startPara !== sel.endPara) {
      // đơn giản hoá: copy nhiều paragraph -> nối text (đủ cho mục đích chấm thi)
      var text = [];
      for (var pi = sel.startPara; pi <= sel.endPara; pi++) text.push(paragraphText(doc.paragraphs[pi]));
      doc.clipboard = { runs: [defaultRun(text.join('\n'))] };
      return;
    }
    var p = doc.paragraphs[sel.startPara];
    var idxs = runsInRange(p, sel.startOffset, sel.endOffset);
    doc.clipboard = { runs: idxs.map(function (i) { return Object.assign({}, p.runs[i]); }) };
  }
  function pasteAtSelection(doc) {
    if (!doc.clipboard) return;
    pushHistory(doc);
    var sel = doc.selection;
    if (sel.startPara !== sel.endPara || sel.startOffset !== sel.endOffset) deleteRangeInternal(doc, sel);
    var p = doc.paragraphs[sel.startPara];
    splitRunsAt(p, [sel.startOffset]);
    var insertIndex = 0, pos = 0;
    for (; insertIndex < p.runs.length; insertIndex++) {
      if (pos === sel.startOffset) break;
      pos += p.runs[insertIndex].text.length;
    }
    var clones = doc.clipboard.runs.map(function (r) { return Object.assign({}, r); });
    p.runs.splice.apply(p.runs, [insertIndex, 0].concat(clones));
    normalizeRuns(p);
    var pasteLen = clones.reduce(function (s, r) { return s + r.text.length; }, 0);
    setSelection(doc, sel.startPara, sel.startOffset + pasteLen, sel.startPara, sel.startOffset + pasteLen);
  }

  // ────────────────────────────────────────────────────────────
  // Keyboard shortcuts — map tổ hợp phím -> action, dùng bởi UI simulator
  // (word-simulator gắn keydown listener và tra bảng này thay vì if/else
  // dài dòng, đồng thời để Validator/task có thể liệt kê "phím tắt hợp lệ").
  // ────────────────────────────────────────────────────────────
  var KEYBOARD_SHORTCUTS = {
    'ctrl+b': function (doc) { toggleCharacterFormat(doc, 'bold'); },
    'ctrl+i': function (doc) { toggleCharacterFormat(doc, 'italic'); },
    'ctrl+u': function (doc) { toggleCharacterFormat(doc, 'underline'); },
    'ctrl+c': function (doc) { copySelection(doc); },
    'ctrl+v': function (doc) { pasteAtSelection(doc); },
    'ctrl+z': function (doc) { undo(doc); },
    'ctrl+y': function (doc) { redo(doc); },
    'ctrl+a': function (doc) {
      var lastPara = doc.paragraphs.length - 1;
      setSelection(doc, 0, 0, lastPara, paragraphText(doc.paragraphs[lastPara]).length);
    }
  };
  function handleKeyboardShortcut(doc, combo) {
    var fn = KEYBOARD_SHORTCUTS[combo.toLowerCase()];
    if (!fn) return false;
    fn(doc);
    return true;
  }

  return {
    createDocument: createDocument,
    paragraphText: paragraphText,
    normalizeRuns: normalizeRuns,
    setSelection: setSelection,
    insertText: insertText,
    deleteSelection: deleteSelection,
    applyCharacterFormat: applyCharacterFormat,
    toggleCharacterFormat: toggleCharacterFormat,
    setParagraphStyle: setParagraphStyle,
    setAlignment: setAlignment,
    setListType: setListType,
    insertParagraphBreak: insertParagraphBreak,
    insertTable: insertTable,
    setTableCellText: setTableCellText,
    insertImage: insertImage,
    insertShape: insertShape,
    setHeaderText: setHeaderText,
    setFooterText: setFooterText,
    setPageNumbers: setPageNumbers,
    setPageLayout: setPageLayout,
    findAll: findAll,
    replaceAll: replaceAll,
    copySelection: copySelection,
    pasteAtSelection: pasteAtSelection,
    undo: undo,
    redo: redo,
    handleKeyboardShortcut: handleKeyboardShortcut,
    KEYBOARD_SHORTCUTS: Object.keys(KEYBOARD_SHORTCUTS)
  };
});
