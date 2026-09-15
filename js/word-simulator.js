/* ════════════════════════════════════════════════════════════
   js/word-simulator.js — "MOS Word 2019: Ôn luyện cuối khóa"

   Chỉ khai báo RIBBON config + icon + "đối tượng trang giấy" riêng của
   Word (watermark/ảnh/bảng/text box/hyperlink/header/footer) — luồng
   thao tác Ribbon dùng CHUNG cho cả Word/Excel/PowerPoint nằm ở
   js/ribbon-sim-core.js (xem chú thích gốc ở đó cho ngữ nghĩa các loại
   step: ribbon_tab / ribbon_button / dialog_field / dialog_choice /
   checkbox_toggle / confirm / manual_action).

   Dữ liệu: data/mos-word-lessons.json (10 tiết x các "nhiệm vụ", trích tự
   động từ nguyên liệu PPTX gốc IIG Vietnam — 275 nhiệm vụ).
   ════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var RIBBON = {
    'File': [
      { group: 'Backstage', buttons: ['New', 'Open', 'Save', 'Save As', 'Print', 'Share', 'Export', 'Options', 'Close'] }
    ],
    'Home': [
      { group: 'Clipboard', buttons: ['Paste', 'Cut', 'Copy', 'Format Painter'] },
      { group: 'Font', buttons: ['Font', 'Arial', 'Font Size', 'Bold', 'Italic', 'Underline', 'Text Highlight Color', 'Font Color'] },
      { group: 'Paragraph', buttons: ['Bullets', 'Numbering', 'Sort', 'Show/Hide ¶', 'Align Left', 'Center', 'Line and Paragraph Spacing', 'Shading', 'Borders', 'Increase Indent', 'Dialog Box Launcher'] },
      { group: 'Styles', buttons: ['Normal', 'No Spacing', 'Heading 1', 'Heading 2', 'Title', 'Emphasis', 'Strong'] },
      { group: 'Editing', buttons: ['Find', 'Replace', 'Select', 'Select All', 'Go To'] }
    ],
    'Insert': [
      { group: 'Pages', buttons: ['Cover Page', 'Blank Page', 'Page Break'] },
      { group: 'Tables', buttons: ['Table', 'Convert Text to Table'] },
      { group: 'Illustrations', buttons: ['Pictures', 'Shapes', 'SmartArt', 'Chart', 'Screenshot'] },
      { group: 'Links', buttons: ['Insert Link', 'Bookmark', 'Cross-reference'] },
      { group: 'Comments', buttons: ['New Comment'] },
      { group: 'Header & Footer', buttons: ['Header', 'Footer', 'Page Number'] },
      { group: 'Text', buttons: ['Text Box', 'Quick Parts', 'WordArt', 'Drop Cap', 'Signature Line', 'Date & Time', 'Object'] },
      { group: 'Symbols', buttons: ['Equation', 'Symbol'] }
    ],
    'Design': [
      { group: 'Document Formatting', buttons: ['Themes', 'Style Set', 'Colors', 'Fonts'] },
      { group: 'Page Background', buttons: ['Watermark', 'Page Color', 'Page Borders'] }
    ],
    'Layout': [
      { group: 'Page Setup', buttons: ['Margins', 'Orientation', 'Size', 'Columns', 'Breaks', 'Line Numbers', 'Hyphenation'] },
      { group: 'Paragraph', buttons: ['Indent Left', 'Indent Right', 'Spacing Before', 'Spacing After', 'Dialog Box Launcher'] },
      { group: 'Arrange', buttons: ['Position', 'Wrap Text', 'Align', 'Rotate'] }
    ],
    'References': [
      { group: 'Table of Contents', buttons: ['Table of Contents', 'Add Text', 'Update Table'] },
      { group: 'Footnotes', buttons: ['Insert Footnote', 'Insert Endnote'] },
      { group: 'Citations & Bibliography', buttons: ['Insert Citation', 'Bibliography', 'Style'] },
      { group: 'Captions', buttons: ['Insert Caption'] },
      { group: 'Index', buttons: ['Mark Entry', 'Insert Index'] }
    ],
    'Review': [
      { group: 'Proofing', buttons: ['Spelling & Grammar', 'Word Count'] },
      { group: 'Comments', buttons: ['New Comment', 'Delete', 'Next'] },
      { group: 'Tracking', buttons: ['Track Changes'] },
      { group: 'Protect', buttons: ['Restrict Editing'] }
    ],
    'View': [
      { group: 'Views', buttons: ['Read Mode', 'Print Layout', 'Web Layout', 'Outline', 'Draft'] },
      { group: 'Show', buttons: ['Ruler', 'Gridlines', 'Navigation Pane'] },
      { group: 'Zoom', buttons: ['Zoom', '100%'] }
    ],
    // ---- Contextual tabs (chỉ hiện khi đang thao tác đối tượng liên quan,
    // nhưng để đơn giản hoá mô phỏng, engine cho phép chọn thẳng các tab
    // này từ danh sách tab luôn hiển thị) ----
    'Picture Format': [
      { group: 'Adjust', buttons: ['Corrections', 'Color', 'Artistic Effects', 'Compress Pictures'] },
      { group: 'Picture Styles', buttons: ['Picture Border', 'Picture Effects', 'Picture Layout'] },
      { group: 'Arrange', buttons: ['Position', 'Wrap Text'] }
    ],
    'Table Design': [
      { group: 'Table Styles', buttons: ['List Table 1 Light - Accent 3', 'Grid Table', 'Shading', 'Borders'] }
    ],
    'Table Layout': [
      { group: 'Data', buttons: ['Sort', 'Convert to Text', 'Formula'] },
      { group: 'Rows & Columns', buttons: ['Insert Below', 'Insert Above', 'Delete'] }
    ],
    'Header & Footer': [
      { group: 'Header & Footer', buttons: ['Header', 'Footer', 'Page Number'] },
      { group: 'Close', buttons: ['Close Header and Footer'] }
    ],
    'Shape Format': [
      { group: 'Shape Styles', buttons: ['Shape Fill', 'Shape Outline', 'Shape Effects'] },
      { group: 'Arrange', buttons: ['Position', 'Wrap Text', 'More Layout Options'] }
    ]
  };
  var TAB_ORDER = ['File', 'Home', 'Insert', 'Design', 'Layout', 'References', 'Review', 'View'];
  var CONTEXTUAL_TABS = ['Picture Format', 'Table Design', 'Table Layout', 'Header & Footer', 'Shape Format'];

  var ICONS = {
    'new': '🆕', 'open': '📂', 'save': '💾', 'save as': '💾', 'print': '🖨️',
    'share': '📤', 'export': '📤', 'options': '⚙️', 'close': '✖️',
    'paste': '📋', 'cut': '✂️', 'copy': '🗐', 'format painter': '🖌️',
    'text highlight color': '🖍️', 'font color': '🅰️',
    'bullets': '≡', 'numbering': '№', 'sort': '⇅', 'show/hide ¶': '¶',
    'align left': '≡', 'center': '≣', 'line and paragraph spacing': '↕',
    'shading': '🎨', 'borders': '⊞', 'increase indent': '⇥', 'dialog box launcher': '↘',
    'find': '🔍', 'replace': '⇄', 'select': '⬚', 'select all': '⬚', 'go to': '📍',
    'table': '⊞', 'convert text to table': '⊞',
    'pictures': '🖼️', 'shapes': '◇', 'smartart': '🔷', 'chart': '📊', 'screenshot': '📸',
    'insert link': '🔗', 'bookmark': '🔖', 'cross-reference': '#',
    'new comment': '💬', 'header': '⬒', 'footer': '⬓', 'page number': '①',
    'text box': '📝', 'quick parts': '🧩', 'wordart': '🅰️', 'drop cap': '🔠',
    'signature line': '✒️', 'date & time': '🕒', 'object': '📦',
    'equation': '∑', 'symbol': 'Ω',
    'themes': '🎭', 'style set': '🖋️', 'colors': '🎨', 'fonts': '🔤',
    'watermark': '💧', 'page color': '🎨', 'page borders': '⊞',
    'margins': '▭', 'orientation': '↻', 'size': '📐', 'columns': '‖',
    'breaks': '⏎', 'line numbers': '#', 'hyphenation': '‐',
    'position': '⌖', 'wrap text': '🌊', 'align': '▤', 'rotate': '↻',
    'table of contents': '📑', 'add text': '➕', 'update table': '🔄',
    'insert footnote': '¹', 'insert endnote': '²',
    'insert citation': '📚', 'bibliography': '📖', 'style': '🎓',
    'insert caption': '🏷️', 'mark entry': '🔖', 'insert index': '📇',
    'spelling & grammar': '✔️', 'word count': '🔢', 'track changes': '📝',
    'restrict editing': '🔒', 'delete': '␡', 'next': '➡️',
    'read mode': '📖', 'print layout': '🖨️', 'web layout': '🌐', 'outline': '☰', 'draft': '📄',
    'ruler': '📏', 'gridlines': '⊞', 'navigation pane': '🧭', 'zoom': '🔍',
    'corrections': '☀️', 'color': '🎨', 'artistic effects': '🖌️', 'compress pictures': '🗜️',
    'picture border': '▭', 'picture effects': '✨', 'picture layout': '🖼️',
    'convert to text': '📝', 'formula': '∑', 'insert below': '⬇️', 'insert above': '⬆️',
    'close header and footer': '✖️',
    'shape fill': '🎨', 'shape outline': '▭', 'shape effects': '✨', 'more layout options': '⚙️',
    'bold': 'B', 'italic': 'I', 'underline': 'U'
  };
  var SMALL_GLYPH_LABELS = { 'bold': 1, 'italic': 1, 'underline': 1 };
  var SMALL_ICON_LABELS = {
    'cut': 1, 'copy': 1, 'format painter': 1, 'show/hide ¶': 1, 'align left': 1,
    'center': 1, 'shading': 1, 'borders': 1, 'increase indent': 1,
    'dialog box launcher': 1, 'text highlight color': 1, 'font color': 1,
    'bullets': 1, 'numbering': 1, 'add text': 1, 'delete': 1, 'next': 1
  };
  var PILL_LABELS = {
    'font': 1, 'arial': 1, 'font size': 1, 'normal': 1, 'no spacing': 1,
    'heading 1': 1, 'heading 2': 1, 'title': 1, 'emphasis': 1, 'strong': 1,
    'list table 1 light - accent 3': 1, 'grid table': 1,
    'ruler': 1, 'gridlines': 1, 'navigation pane': 1, '100%': 1, 'style': 1,
    'indent left': 1, 'indent right': 1, 'spacing before': 1, 'spacing after': 1
  };

  // ────────────────────────────────────────────────────────────
  // "Nội dung tài liệu" giả lập — trang giấy KHÔNG còn đứng yên suốt cả
  // tiết học: mỗi khi hoàn thành 1 nhiệm vụ (watermark, chèn ảnh, bảng,
  // text box, hyperlink, header/footer...), trang thêm 1 "đối tượng" phù
  // hợp để học sinh CẢM NHẬN được thao tác vừa làm có tác dụng thật —
  // KHÔNG mô phỏng chính xác nội dung file .docx gốc (không có dữ liệu đó
  // ở phía client), chỉ tái hiện đúng LOẠI đối tượng đã thao tác.
  // ────────────────────────────────────────────────────────────
  var canvasObjects = {}; // { [fileName]: [{type,label}, ...] }
  var CANVAS_RULES = [
    { type: 'watermark', test: /watermark|hinh mo/ },
    { type: 'hyperlink', test: /sieu lien ket|hyperlink/ },
    { type: 'textbox', test: /hop van ban|text box/ },
    { type: 'header', test: /\bheader\b/ },
    { type: 'footer', test: /\bfooter\b/ },
    { type: 'hr', test: /duong ngang|horizontal line/ },
    { type: 'picture', test: /buc tranh|hinh anh|\bpicture\b|chen hinh/ },
    { type: 'table', test: /\bbang\b|\btable\b/ }
  ];
  function classifyCanvasObject(desc) {
    var n = RibbonSim.norm(desc);
    for (var i = 0; i < CANVAS_RULES.length; i++) {
      if (CANVAS_RULES[i].test.test(n)) return CANVAS_RULES[i].type;
    }
    return null;
  }
  function addCanvasObjectForSubtask(sub) {
    var type = classifyCanvasObject(sub.desc);
    if (!type) return;
    var file = sub.file || 'Document1';
    if (!canvasObjects[file]) canvasObjects[file] = [];
    canvasObjects[file].push({ type: type, label: RibbonSim.truncate(sub.desc, 46) });
  }
  var CANVAS_OBJECT_HTML = {
    watermark: function () { return '<div class="wwo wwo-watermark">SAMPLE</div>'; },
    hyperlink: function (label) { return '<div class="wwo wwo-hyperlink">🔗 ' + RibbonSim.escapeHtml(label) + '</div>'; },
    textbox: function (label) { return '<div class="wwo wwo-textbox">' + RibbonSim.escapeHtml(label) + '</div>'; },
    header: function () { return '<div class="wwo wwo-header">Header</div>'; },
    footer: function () { return '<div class="wwo wwo-footer">Footer</div>'; },
    hr: function () { return '<div class="wwo wwo-hr"></div>'; },
    picture: function () { return '<div class="wwo wwo-picture">🖼️</div>'; },
    table: function () {
      return '<table class="wwo wwo-table"><tr><td></td><td></td><td></td></tr><tr><td></td><td></td><td></td></tr></table>';
    }
  };
  function renderCanvasObjects(file) {
    var host = document.getElementById('wwPageObjects');
    if (!host) return;
    var list = canvasObjects[file] || [];
    host.innerHTML = list.map(function (o) {
      var f = CANVAS_OBJECT_HTML[o.type];
      return f ? f(o.label) : '';
    }).join('');
  }

  var sim = RibbonSim.create({
    dataUrl: 'data/mos-word-lessons.json',
    progressKey: 'ws_progress_v1',
    ribbon: RIBBON,
    tabOrder: TAB_ORDER,
    contextualTabs: CONTEXTUAL_TABS,
    icons: ICONS,
    smallGlyphLabels: SMALL_GLYPH_LABELS,
    smallIconLabels: SMALL_ICON_LABELS,
    pillLabels: PILL_LABELS,
    docSuffix: ' - Word',
    docDefaultName: 'Document1',
    missionFileFallback: '📄 Tài liệu thực hành',
    backstageTab: 'File',
    onResetLesson: function () { canvasObjects = {}; },
    onOpenSubtask: function (s) { renderCanvasObjects(s.file || 'Document1'); },
    onCompleteSubtask: function (sub) {
      addCanvasObjectForSubtask(sub);
      renderCanvasObjects(sub.file || 'Document1');
    }
  });

  // Hook debug nhẹ — không dùng trong luồng chính, chỉ để kiểm thử thủ công
  // renderCanvasObjects() từ console/Playwright mà không cần đi hết các bước.
  window.__wsDebug = { STATE: sim.STATE, addCanvasObjectForSubtask: addCanvasObjectForSubtask, renderCanvasObjects: renderCanvasObjects };
})();
