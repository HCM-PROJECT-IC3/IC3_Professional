/* ════════════════════════════════════════════════════════════
   js/excel-simulator.js — "MOS Excel 2019: Ôn luyện cuối khóa"

   Chỉ khai báo RIBBON config + icon + "lưới ô tính" riêng của Excel —
   luồng thao tác Ribbon dùng CHUNG với Word/PowerPoint, nằm ở
   js/ribbon-sim-core.js.

   Dữ liệu: data/mos-excel-lessons.json — chuyển thể trực tiếp từ các
   task ĐÃ CÓ trong js/mos-tasks/tiet3-project1.js và tiet3-project2.js
   (Downloads/On_Tap_MOS/On_tap_Excel.zip → Tiet_3/PROJECT_1, PROJECT_2)
   — cùng 1 nguồn đề, chỉ khác cách luyện: mos-practice.html cho nộp file
   Excel thật để chấm điểm, còn simulator này cho luyện THAO TÁC RIBBON
   trước khi làm trên file thật.
   ════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var RIBBON = {
    'File': [
      { group: 'Backstage', buttons: ['New', 'Open', 'Save', 'Save As', 'Print', 'Share', 'Export', 'Options', 'Close'] }
    ],
    'Home': [
      { group: 'Clipboard', buttons: ['Paste', 'Cut', 'Copy', 'Format Painter'] },
      { group: 'Font', buttons: ['Font', 'Font Size', 'Bold', 'Italic', 'Underline', 'Fill Color', 'Font Color', 'Borders'] },
      { group: 'Alignment', buttons: ['Top Align', 'Middle Align', 'Wrap Text', 'Merge & Center', 'Align Left', 'Center'] },
      { group: 'Number', buttons: ['Number Format', 'Currency', 'Percent Style', 'Comma Style', 'Increase Decimal', 'Decrease Decimal', 'Dialog Box Launcher'] },
      { group: 'Styles', buttons: ['Conditional Formatting', 'Format as Table', 'Cell Styles'] },
      { group: 'Cells', buttons: ['Insert', 'Delete', 'Format'] },
      { group: 'Editing', buttons: ['AutoSum', 'Fill', 'Clear', 'Sort & Filter', 'Find & Select'] }
    ],
    'Insert': [
      { group: 'Tables', buttons: ['PivotTable', 'Table'] },
      { group: 'Illustrations', buttons: ['Pictures', 'Shapes', 'Icons'] },
      { group: 'Charts', buttons: ['Recommended Charts', 'Column Chart', 'Pie Chart', 'Line Chart'] },
      { group: 'Sparklines', buttons: ['Line', 'Column'] },
      { group: 'Filters', buttons: ['Slicer'] },
      { group: 'Links', buttons: ['Link'] },
      { group: 'Text', buttons: ['Text Box', 'Header & Footer', 'WordArt'] },
      { group: 'Symbols', buttons: ['Equation', 'Symbol'] }
    ],
    'Page Layout': [
      { group: 'Themes', buttons: ['Themes'] },
      { group: 'Page Setup', buttons: ['Margins', 'Orientation', 'Size', 'Print Area', 'Breaks', 'Background', 'Print Titles'] },
      { group: 'Scale to Fit', buttons: ['Width', 'Height', 'Scale'] },
      { group: 'Sheet Options', buttons: ['Gridlines', 'Headings'] },
      { group: 'Arrange', buttons: ['Align'] }
    ],
    'Formulas': [
      { group: 'Function Library', buttons: ['Insert Function', 'AutoSum', 'Logical', 'Text', 'Date & Time', 'Lookup & Reference'] },
      { group: 'Defined Names', buttons: ['Name Manager', 'Define Name'] },
      { group: 'Formula Auditing', buttons: ['Trace Precedents', 'Show Formulas'] },
      { group: 'Calculation', buttons: ['Calculation Options'] }
    ],
    'Data': [
      { group: 'Get & Transform Data', buttons: ['From Text/CSV', 'From Web'] },
      { group: 'Sort & Filter', buttons: ['Sort', 'Filter', 'Clear', 'Reapply'] },
      { group: 'Data Tools', buttons: ['Text to Columns', 'Remove Duplicates', 'Data Validation'] },
      { group: 'Forecast', buttons: ['What-If Analysis'] },
      { group: 'Outline', buttons: ['Group', 'Ungroup', 'Subtotal'] }
    ],
    'Review': [
      { group: 'Proofing', buttons: ['Spelling'] },
      { group: 'Comments', buttons: ['New Comment'] },
      { group: 'Protect', buttons: ['Protect Sheet', 'Protect Workbook'] }
    ],
    'View': [
      { group: 'Workbook Views', buttons: ['Normal', 'Page Break Preview', 'Page Layout'] },
      { group: 'Show', buttons: ['Gridlines', 'Headings'] },
      { group: 'Zoom', buttons: ['Zoom', '100%'] },
      { group: 'Window', buttons: ['New Window', 'Freeze Panes'] }
    ],
    // ---- Tab ngữ cảnh ----
    'Chart Design': [
      { group: 'Data', buttons: ['Switch Row/Column', 'Select Data'] },
      { group: 'Chart Layouts', buttons: ['Add Chart Element', 'Quick Layout'] },
      { group: 'Chart Styles', buttons: ['Change Colors'] }
    ],
    'Table Design': [
      { group: 'Table Styles', buttons: ['Table Style Medium 2', 'Table Style Light 1'] },
      { group: 'Table Style Options', buttons: ['Header Row', 'Banded Rows', 'Total Row'] }
    ]
  };
  var TAB_ORDER = ['File', 'Home', 'Insert', 'Page Layout', 'Formulas', 'Data', 'Review', 'View'];
  var CONTEXTUAL_TABS = ['Chart Design', 'Table Design'];

  var ICONS = {
    'new': '🆕', 'open': '📂', 'save': '💾', 'save as': '💾', 'print': '🖨️',
    'share': '📤', 'export': '📤', 'options': '⚙️', 'close': '✖️',
    'paste': '📋', 'cut': '✂️', 'copy': '🗐', 'format painter': '🖌️',
    'fill color': '🎨', 'font color': '🅰️', 'borders': '⊞',
    'top align': '⬆️', 'middle align': '↕️', 'wrap text': '↩️', 'merge & center': '⇔', 'align left': '≡', 'center': '≣',
    'number format': '#️⃣', 'currency': '💲', 'percent style': '%', 'comma style': ',', 'increase decimal': '.0→.00', 'decrease decimal': '.00→.0',
    'dialog box launcher': '↘', 'conditional formatting': '🎯', 'format as table': '📋', 'cell styles': '🖼️',
    'insert': '➕', 'delete': '␡', 'format': '📐',
    'autosum': 'Σ', 'fill': '🪣', 'clear': '🧹', 'sort & filter': '⇅', 'find & select': '🔍',
    'pivottable': '📊', 'table': '⊞', 'pictures': '🖼️', 'shapes': '◇', 'icons': '⭐',
    'recommended charts': '📊', 'column chart': '📊', 'pie chart': '🥧', 'line chart': '📈',
    'line': '📈', 'column': '📊', 'slicer': '🔪', 'link': '🔗',
    'text box': '📝', 'header & footer': '⬒', 'wordart': '🅰️', 'equation': '∑', 'symbol': 'Ω',
    'themes': '🎭', 'margins': '▭', 'orientation': '↻', 'size': '📐', 'print area': '🖨️',
    'breaks': '⏎', 'background': '🖼️', 'print titles': '🏷️',
    'width': '↔️', 'height': '↕️', 'scale': '🔍', 'gridlines': '⊞', 'headings': '🔤', 'align': '▤',
    'insert function': 'fx', 'logical': '🔀', 'text': '🔤', 'date & time': '🕒', 'lookup & reference': '🔎',
    'name manager': '🏷️', 'define name': '🏷️', 'trace precedents': '↖️', 'show formulas': '🧮', 'calculation options': '⚙️',
    'from text/csv': '📄', 'from web': '🌐',
    'sort': '⇅', 'filter': '🔽', 'reapply': '🔄',
    'text to columns': '⫴', 'remove duplicates': '🧹', 'data validation': '✅', 'what-if analysis': '❓',
    'group': '➕', 'ungroup': '➖', 'subtotal': 'Σ',
    'spelling': '✔️', 'new comment': '💬', 'protect sheet': '🔒', 'protect workbook': '🔒',
    'normal': '🔲', 'page break preview': '📄', 'page layout': '📃',
    'zoom': '🔍', 'new window': '🪟', 'freeze panes': '❄️',
    'switch row/column': '⇄', 'select data': '📊', 'add chart element': '➕', 'quick layout': '⚡', 'change colors': '🎨',
    'table style medium 2': '🟧', 'table style light 1': '⬜', 'header row': '☑️', 'banded rows': '☑️', 'total row': '☑️',
    'bold': 'B', 'italic': 'I', 'underline': 'U'
  };
  var SMALL_GLYPH_LABELS = { 'bold': 1, 'italic': 1, 'underline': 1 };
  var SMALL_ICON_LABELS = {
    'cut': 1, 'copy': 1, 'format painter': 1, 'fill color': 1, 'font color': 1, 'borders': 1,
    'top align': 1, 'middle align': 1, 'wrap text': 1, 'align left': 1, 'center': 1,
    'currency': 1, 'percent style': 1, 'comma style': 1, 'increase decimal': 1, 'decrease decimal': 1,
    'dialog box launcher': 1
  };
  var PILL_LABELS = {
    'font': 1, 'font size': 1, 'number format': 1,
    'table style medium 2': 1, 'table style light 1': 1,
    'gridlines': 1, 'headings': 1, '100%': 1, 'header row': 1, 'banded rows': 1, 'total row': 1
  };

  // ────────────────────────────────────────────────────────────
  // "Lưới ô tính" giả lập — dựng 1 bảng A..G x 1..12 tĩnh (không có dữ
  // liệu thật của file .xlsx gốc, chỉ để trông giống Excel thật), cộng 1
  // formula bar (Name Box + fx). Khi hoàn thành 1 nhiệm vụ, tô sáng ô liên
  // quan (nếu có coordinate trong desc) để học sinh thấy "có tác dụng".
  // ────────────────────────────────────────────────────────────
  var COLS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
  var ROWS = 12;
  var highlightedCells = {}; // { fileName: Set-like obj of "A1" }
  var sheetTabsByFile = {
    'Tiet3_Project1.xlsx': ['Exchange Rates', 'New Accounts', 'Contact'],
    'Tiet3_Project2.xlsx': ['January', 'February', 'March', 'Summary']
  };

  function buildGrid() {
    var host = document.getElementById('xwGrid');
    if (!host) return;
    var html = '<table class="xw-table"><thead><tr><th class="xw-corner"></th>';
    COLS.forEach(function (c) { html += '<th>' + c + '</th>'; });
    html += '</tr></thead><tbody>';
    for (var r = 1; r <= ROWS; r++) {
      html += '<tr><th>' + r + '</th>';
      COLS.forEach(function (c) {
        html += '<td data-cell="' + c + r + '"></td>';
      });
      html += '</tr>';
    }
    html += '</tbody></table>';
    host.innerHTML = html;
  }

  function renderSheetTabs(file) {
    var host = document.getElementById('xwSheetTabs');
    if (!host) return;
    var tabs = sheetTabsByFile[file] || ['Sheet1'];
    host.innerHTML = tabs.map(function (t, i) {
      return '<span class="xw-sheet-tab' + (i === 0 ? ' xw-sheet-tab-active' : '') + '">' + t + '</span>';
    }).join('');
  }

  function extractCellRef(desc) {
    var m = (desc || '').match(/\b([A-G]\d{1,2}(?::[A-G]\d{1,2})?)\b/);
    return m ? m[1] : null;
  }

  function renderHighlights(file) {
    var host = document.getElementById('xwGrid');
    if (!host) return;
    host.querySelectorAll('.xw-cell-hit').forEach(function (el) { el.classList.remove('xw-cell-hit'); });
    var set = highlightedCells[file] || [];
    set.forEach(function (ref) {
      var addr = ref.split(':')[0];
      var el = host.querySelector('[data-cell="' + addr + '"]');
      if (el) el.classList.add('xw-cell-hit');
    });
    var nameBox = document.getElementById('xwNameBox');
    if (nameBox) nameBox.textContent = set.length ? set[set.length - 1] : 'A1';
  }

  var sim = RibbonSim.create({
    dataUrl: 'data/mos-excel-lessons.json',
    progressKey: 'xs_progress_v1',
    ribbon: RIBBON,
    tabOrder: TAB_ORDER,
    contextualTabs: CONTEXTUAL_TABS,
    icons: ICONS,
    smallGlyphLabels: SMALL_GLYPH_LABELS,
    smallIconLabels: SMALL_ICON_LABELS,
    pillLabels: PILL_LABELS,
    docSuffix: ' - Excel',
    docDefaultName: 'Book1',
    missionFileFallback: '📊 Bảng tính thực hành',
    backstageTab: 'File',
    onResetLesson: function () { highlightedCells = {}; },
    onOpenSubtask: function (s) {
      renderSheetTabs(s.file || 'Book1');
      renderHighlights(s.file || 'Book1');
    },
    onCompleteSubtask: function (sub) {
      var file = sub.file || 'Book1';
      var ref = extractCellRef(sub.desc);
      if (ref) {
        if (!highlightedCells[file]) highlightedCells[file] = [];
        highlightedCells[file].push(ref);
      }
      renderHighlights(file);
    }
  });

  buildGrid();
  window.__xsDebug = { STATE: sim.STATE };
})();
