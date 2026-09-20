var WD = require('../document-model.js');

var failures = 0;
function assertEq(label, actual, expected) {
  var pass = JSON.stringify(actual) === JSON.stringify(expected);
  console.log((pass ? 'PASS' : 'FAIL') + '  ' + label + '  =>  ' + JSON.stringify(actual) + (pass ? '' : '  (expected ' + JSON.stringify(expected) + ')'));
  if (!pass) failures++;
}

// ── Text insertion + selection-based bold on a substring ──
var doc = WD.createDocument();
WD.setSelection(doc, 0, 0, 0, 0);
WD.insertText(doc, 'Hello world');
assertEq('inserted text', WD.paragraphText(doc.paragraphs[0]), 'Hello world');

// Bôi đen "world" (offset 6..11) rồi Bold
WD.setSelection(doc, 0, 6, 0, 11);
WD.toggleCharacterFormat(doc, 'bold');
var boldRuns = doc.paragraphs[0].runs.filter(function (r) { return r.bold; });
assertEq('only "world" is bold', boldRuns.map(function (r) { return r.text; }), ['world']);
assertEq('"Hello " stays not bold', doc.paragraphs[0].runs[0].bold, false);

// Toggle off: bôi lại "world", bold đang bật -> tắt
WD.setSelection(doc, 0, 6, 0, 11);
WD.toggleCharacterFormat(doc, 'bold');
assertEq('bold toggled off', doc.paragraphs[0].runs.some(function (r) { return r.bold; }), false);
assertEq('text unchanged after toggle', WD.paragraphText(doc.paragraphs[0]), 'Hello world');

// ── Paragraph style / alignment / list ──
WD.setSelection(doc, 0, 0, 0, 0);
WD.setParagraphStyle(doc, 'Heading1');
WD.setAlignment(doc, 'center');
assertEq('paragraph style', doc.paragraphs[0].style, 'Heading1');
assertEq('paragraph alignment', doc.paragraphs[0].alignment, 'center');

WD.setListType(doc, 'bullet', 0);
assertEq('list type', doc.paragraphs[0].listType, 'bullet');

// ── Enter key -> new paragraph, splitting text at cursor ──
var doc2 = WD.createDocument();
WD.setSelection(doc2, 0, 0, 0, 0);
WD.insertText(doc2, 'FirstSecond');
WD.setSelection(doc2, 0, 5, 0, 5); // giữa First|Second
WD.insertParagraphBreak(doc2);
assertEq('para count after Enter', doc2.paragraphs.length, 2);
assertEq('first para after split', WD.paragraphText(doc2.paragraphs[0]), 'First');
assertEq('second para after split', WD.paragraphText(doc2.paragraphs[1]), 'Second');

// ── Undo/Redo ──
var doc3 = WD.createDocument();
WD.setSelection(doc3, 0, 0, 0, 0);
WD.insertText(doc3, 'ABC');
WD.setSelection(doc3, 0, 0, 0, 3);
WD.toggleCharacterFormat(doc3, 'bold');
assertEq('before undo: bold', doc3.paragraphs[0].runs[0].bold, true);
WD.undo(doc3);
assertEq('after undo: bold reverted', doc3.paragraphs[0].runs.some(function (r) { return r.bold; }), false);
assertEq('after undo: text kept', WD.paragraphText(doc3.paragraphs[0]), 'ABC');
WD.redo(doc3);
assertEq('after redo: bold restored', doc3.paragraphs[0].runs.some(function (r) { return r.bold; }), true);

// ── Copy / Paste ──
var doc4 = WD.createDocument();
WD.setSelection(doc4, 0, 0, 0, 0);
WD.insertText(doc4, 'CopyMe');
WD.setSelection(doc4, 0, 0, 0, 6);
WD.copySelection(doc4);
WD.setSelection(doc4, 0, 6, 0, 6);
WD.insertText(doc4, ' and ');
WD.setSelection(doc4, 0, 11, 0, 11);
WD.pasteAtSelection(doc4);
assertEq('paste result', WD.paragraphText(doc4.paragraphs[0]), 'CopyMe and CopyMe');

// ── Find / Replace ──
var doc5 = WD.createDocument();
WD.setSelection(doc5, 0, 0, 0, 0);
WD.insertText(doc5, 'the cat sat on the mat');
var matches = WD.findAll(doc5, 'the', false);
assertEq('find matches count', matches.length, 2);
var replacedCount = WD.replaceAll(doc5, 'the', 'THE', false);
assertEq('replace count', replacedCount, 2);
assertEq('replaced text', WD.paragraphText(doc5.paragraphs[0]), 'THE cat sat on THE mat');

// ── Table / Image / Shape / Header / Footer / Page numbers / Page layout ──
var doc6 = WD.createDocument();
var table = WD.insertTable(doc6, 0, 2, 3);
assertEq('table dims', [table.rows, table.cols], [2, 3]);
WD.setTableCellText(doc6, table.id, 0, 0, 'Header');
assertEq('table cell text', doc6.tables[0].cells[0][0].runs[0].text, 'Header');

WD.insertImage(doc6, 0, { src: 'logo.png' });
assertEq('image inserted', doc6.images.length, 1);
WD.insertShape(doc6, 0, { shapeType: 'oval' });
assertEq('shape inserted', doc6.shapes[0].shapeType, 'oval');

WD.setHeaderText(doc6, 'My Header');
WD.setFooterText(doc6, 'My Footer');
assertEq('header text', doc6.header.runs[0].text, 'My Header');
assertEq('footer text', doc6.footer.runs[0].text, 'My Footer');

WD.setPageNumbers(doc6, true, 'bottom-center', 'plain');
assertEq('page numbers enabled', doc6.pageNumbers.enabled, true);

WD.setPageLayout(doc6, { orientation: 'landscape', marginsCm: { top: 1.5 } });
assertEq('orientation', doc6.pageLayout.orientation, 'landscape');
assertEq('margin top overridden', doc6.pageLayout.marginsCm.top, 1.5);
assertEq('margin left kept default', doc6.pageLayout.marginsCm.left, 2.54);

// ── Keyboard shortcuts dispatch table ──
var doc7 = WD.createDocument();
WD.setSelection(doc7, 0, 0, 0, 0);
WD.insertText(doc7, 'Shortcut');
WD.setSelection(doc7, 0, 0, 0, 8);
WD.handleKeyboardShortcut(doc7, 'Ctrl+B');
assertEq('ctrl+b applies bold', doc7.paragraphs[0].runs[0].bold, true);
WD.handleKeyboardShortcut(doc7, 'ctrl+z');
assertEq('ctrl+z undoes bold', doc7.paragraphs[0].runs.some(function (r) { return r.bold; }), false);

// ── Regression: xoá 1 phần văn bản KHÔNG được xoá/đổi định dạng của
// phần văn bản còn lại (bug thật: bản cũ collapse cả đoạn về định dạng
// của run đầu tiên, "tẩy" luôn bold của phần sống sót). ──
var doc8 = WD.createDocument();
WD.setSelection(doc8, 0, 0, 0, 0);
WD.insertText(doc8, 'Hello World');
WD.setSelection(doc8, 0, 6, 0, 11); // "World"
WD.toggleCharacterFormat(doc8, 'bold'); // "Hello " thường, "World" đậm
WD.setSelection(doc8, 0, 0, 0, 6); // xoá "Hello " (không đụng tới "World")
WD.deleteSelection(doc8);
assertEq('delete: remaining text correct', WD.paragraphText(doc8.paragraphs[0]), 'World');
assertEq('delete: surviving text KEEPS its own bold (not run[0]\'s format)', doc8.paragraphs[0].runs[0].bold, true);

// Xoá xuyên 2 paragraph cũng phải giữ định dạng 2 đầu ghép lại.
var doc9 = WD.createDocument();
WD.setSelection(doc9, 0, 0, 0, 0);
WD.insertText(doc9, 'BoldStart');
WD.setSelection(doc9, 0, 0, 0, 4); // chỉ "Bold"
WD.toggleCharacterFormat(doc9, 'bold');
WD.setSelection(doc9, 0, 9, 0, 9); // con trỏ (collapsed) ở cuối đoạn trước khi Enter
WD.insertParagraphBreak(doc9); // para0="BoldStart" (giữ nguyên "Bold" đậm + "Start" thường), tạo para1 rỗng
WD.setSelection(doc9, 1, 0, 1, 0);
WD.insertText(doc9, 'PlainEnd'); // para1 = "PlainEnd" (thường, kế thừa format tại vị trí gõ)
WD.setSelection(doc9, 0, 4, 1, 5); // xoá từ giữa para0 tới giữa para1: "Start" + "Plain" bị xoá, còn "Bold"+"End"
WD.deleteSelection(doc9);
assertEq('cross-paragraph delete: merged text', WD.paragraphText(doc9.paragraphs[0]), 'BoldEnd');
assertEq('cross-paragraph delete: paragraph count reduced', doc9.paragraphs.length, 1);
assertEq('cross-paragraph delete: "Bold" part keeps bold', doc9.paragraphs[0].runs[0].bold, true);
assertEq('cross-paragraph delete: "End" part stays plain', doc9.paragraphs[0].runs[1].bold, false);

// ── Regression: Enter với 1 vùng đang được CHỌN (không collapsed) phải
// XOÁ vùng đó rồi mới tách dòng tại đúng chỗ (giống Word thật) — bản cũ
// chỉ đọc startOffset, bỏ qua toàn bộ vùng chọn. ──
var doc9b = WD.createDocument();
WD.setSelection(doc9b, 0, 0, 0, 0);
WD.insertText(doc9b, 'Hello World');
WD.setSelection(doc9b, 0, 5, 0, 11); // bôi đen " World" (có khoảng trắng đầu)
WD.insertParagraphBreak(doc9b);
assertEq('Enter with selection: para0 has only kept prefix', WD.paragraphText(doc9b.paragraphs[0]), 'Hello');
assertEq('Enter with selection: para1 is empty (selection was fully consumed)', WD.paragraphText(doc9b.paragraphs[1]), '');

// ── Regression: Find/Replace KHÔNG được xoá định dạng của phần KHÔNG bị
// thay thế (kể cả ở paragraph khác không có match nào). ──
var doc10 = WD.createDocument();
WD.setSelection(doc10, 0, 0, 0, 0);
WD.insertText(doc10, 'Item: X');
WD.setSelection(doc10, 0, 6, 0, 7); // "X"
WD.toggleCharacterFormat(doc10, 'bold');
WD.setSelection(doc10, 0, 7, 0, 7); // collapse con trỏ về cuối trước khi Enter (Enter với vùng chọn dở dang sẽ XOÁ vùng đó — xem test doc9b)
WD.insertParagraphBreak(doc10);
WD.setSelection(doc10, 1, 0, 1, 0);
WD.insertText(doc10, 'Untouched bold line');
WD.setSelection(doc10, 1, 0, 1, 20);
WD.toggleCharacterFormat(doc10, 'bold');
var replaced = WD.replaceAll(doc10, 'Item', 'Product', false);
assertEq('replace count', replaced, 1);
assertEq('replace: replaced text correct', WD.paragraphText(doc10.paragraphs[0]), 'Product: X');
assertEq('replace: "X" (not part of match) keeps bold', doc10.paragraphs[0].runs[doc10.paragraphs[0].runs.length - 1].bold, true);
assertEq('replace: paragraph with NO match stays untouched (multi-run)', doc10.paragraphs[1].runs.every(function (r) { return r.bold; }), true);

// ── Regression: Undo sau Toggle Bold phải khôi phục ĐÚNG cấu trúc run
// gốc (không phải bản đã bị split bởi bước dò "cả vùng đã bold chưa"). ──
var doc11 = WD.createDocument();
WD.setSelection(doc11, 0, 0, 0, 0);
WD.insertText(doc11, 'ABCDEF');
var runsBeforeToggle = JSON.parse(JSON.stringify(doc11.paragraphs[0].runs));
WD.setSelection(doc11, 0, 2, 0, 4); // "CD" — giữa 1 run duy nhất, sẽ bị split khi dò allOn
WD.toggleCharacterFormat(doc11, 'bold');
WD.undo(doc11);
assertEq('undo after toggle restores EXACT original run structure', doc11.paragraphs[0].runs, runsBeforeToggle);

console.log('\n' + (failures === 0 ? 'ALL PASSED' : failures + ' FAILURE(S)'));
process.exit(failures === 0 ? 0 : 1);
