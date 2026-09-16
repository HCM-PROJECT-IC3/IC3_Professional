/* ════════════════════════════════════════════════════════════
   js/powerpoint-simulator.js — "MOS PowerPoint 2019: Ôn luyện cuối khóa"

   Chỉ khai báo RIBBON config + icon + "khung slide" riêng của
   PowerPoint — luồng thao tác Ribbon dùng CHUNG với Word/Excel, nằm ở
   js/ribbon-sim-core.js.

   Dữ liệu: data/mos-powerpoint-lessons.json — chuyển thể trực tiếp từ
   task ĐÃ CÓ trong js/mos-tasks/pptx-tiet10-project2.js (Downloads/
   On_Tap_MOS/On_Tap_PowerPoint.zip → Tiet_10) — cùng 1 nguồn đề, chỉ
   khác cách luyện: mos-practice.html cho nộp file .pptx thật để chấm
   điểm, còn simulator này cho luyện THAO TÁC RIBBON trước.
   ════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var RIBBON = {
    'File': [
      { group: 'Backstage', buttons: ['New', 'Open', 'Info', 'Save', 'Save As', 'Print', 'Share', 'Export', 'Options', 'Close'] }
    ],
    'Home': [
      { group: 'Clipboard', buttons: ['Paste', 'Cut', 'Copy', 'Format Painter'] },
      { group: 'Slides', buttons: ['New Slide', 'Layout', 'Reset', 'Section', 'Reuse Slides', 'Slides from Outline'] },
      { group: 'Font', buttons: ['Font', 'Font Size', 'Bold', 'Italic', 'Underline', 'Font Color', 'Equalize Character Height'] },
      { group: 'Paragraph', buttons: ['Bullets', 'Numbering', 'Align Left', 'Center', 'Line Spacing', 'Convert to SmartArt'] },
      { group: 'Drawing', buttons: ['Shapes', 'Arrange', 'Quick Styles'] },
      { group: 'Editing', buttons: ['Find', 'Replace', 'Select'] }
    ],
    'Insert': [
      { group: 'Slides', buttons: ['New Slide'] },
      { group: 'Tables', buttons: ['Table'] },
      { group: 'Images', buttons: ['Pictures', 'This Device', 'Screenshot', 'Photo Album'] },
      { group: 'Illustrations', buttons: ['Shapes', 'Icons', 'SmartArt', 'Chart', 'Forward or Next'] },
      { group: 'Links', buttons: ['Link', 'Action', 'Zoom', 'Summary Zoom'] },
      { group: 'Comments', buttons: ['New Comment'] },
      { group: 'Text', buttons: ['Text Box', 'Header & Footer', 'WordArt', 'Date & Time', 'Object'] },
      { group: 'Symbols', buttons: ['Equation', 'Symbol'] },
      { group: 'Media', buttons: ['Video', 'Audio', 'Screen Recording'] }
    ],
    'Design': [
      { group: 'Themes', buttons: ['Themes'] },
      { group: 'Variants', buttons: ['Variants'] },
      { group: 'Customize', buttons: ['Slide Size', 'Format Background'] }
    ],
    'Transitions': [
      { group: 'Transition to This Slide', buttons: ['None', 'Fade', 'Push', 'Wipe', 'Ripple'] },
      { group: 'Timing', buttons: ['Sound', 'Duration', 'Apply To All'] }
    ],
    'Animations': [
      { group: 'Animation', buttons: ['None', 'Appear', 'Fade', 'Fly In', 'Bounce', 'From Bottom-Right'] },
      { group: 'Advanced Animation', buttons: ['Add Animation', 'Animation Pane', 'Trigger'] },
      { group: 'Timing', buttons: ['Start', 'Duration', 'Reorder Animation', 'After Previous'] }
    ],
    'Slide Show': [
      { group: 'Start Slide Show', buttons: ['From Beginning', 'From Current Slide', 'Custom Slide Show', 'Record Slide Show'] },
      { group: 'Set Up', buttons: ['Set Up Slide Show', 'Hide Slide', 'Rehearse Timings'] },
      { group: 'Monitors', buttons: ['Resolution'] }
    ],
    'Review': [
      { group: 'Proofing', buttons: ['Spelling'] },
      { group: 'Comments', buttons: ['New Comment'] },
      { group: 'Compare', buttons: ['Compare'] }
    ],
    'View': [
      { group: 'Presentation Views', buttons: ['Normal', 'Slide Sorter', 'Notes Page', 'Reading View'] },
      { group: 'Master Views', buttons: ['Slide Master', 'Handout Master', 'Notes Master'] },
      { group: 'Show', buttons: ['Ruler', 'Gridlines'] },
      { group: 'Zoom', buttons: ['Zoom', '100%'] }
    ],
    // ---- Tab ngữ cảnh ----
    'Table Design': [
      { group: 'Table Styles', buttons: ['Medium Style 4 - Accent 6', 'Medium Style 2 - Accent 1'] },
      { group: 'Table Style Options', buttons: ['Header Row', 'Banded Rows', 'Total Row'] },
      { group: 'Borders', buttons: ['Outside Borders'] }
    ],
    'Table Layout': [
      { group: 'Rows & Columns', buttons: ['Insert Below', 'Insert Above', 'Delete'] },
      { group: 'Merge', buttons: ['Merge Cells', 'Split Cells'] }
    ],
    'Chart Design': [
      { group: 'Type', buttons: ['Change Chart Type'] },
      { group: 'Chart Layouts', buttons: ['Add Chart Element', 'Quick Layout'] },
      { group: 'Chart Styles', buttons: ['Change Colors'] },
      { group: 'Data', buttons: ['Switch Row/Column', 'Select Data'] }
    ],
    'Picture Format': [
      { group: 'Adjust', buttons: ['Corrections', 'Color', 'Artistic Effects', 'Crop', 'Change Picture'] },
      { group: 'Picture Styles', buttons: ['Picture Border', 'Picture Effects', 'Simple Frame', 'Oval'] },
      { group: 'Arrange', buttons: ['Align', 'Align Top'] },
      { group: 'Accessibility', buttons: ['Alt Text'] }
    ],
    'Shape Format': [
      { group: 'Insert Shapes', buttons: ['Edit Shape'] },
      { group: 'Shape Styles', buttons: ['Subtle Effect - Orange', 'Moderate Effect - Orange', 'Subtle Effect - Tan'] },
      { group: 'Text', buttons: ['Align Text'] },
      { group: 'Arrange', buttons: ['Arrange'] }
    ],
    'Slide Master': [
      { group: 'Edit Theme', buttons: ['Themes', 'Colors', 'Fonts'] },
      { group: 'Background', buttons: ['Colors', 'Fonts', 'Background Styles'] },
      { group: 'Master Layout', buttons: ['Insert Placeholder', 'Picture', 'Media'] },
      { group: 'Close', buttons: ['Close Master View'] }
    ],
    'Draw': [
      { group: 'Tools', buttons: ['Pen', 'Highlighter', 'Eraser'] }
    ],
    'Playback': [
      { group: 'Video Options', buttons: ['Trim Video', 'Start'] },
      { group: 'Audio Options', buttons: ['Trim Audio', 'Start'] }
    ]
  };
  var TAB_ORDER = ['File', 'Home', 'Insert', 'Design', 'Transitions', 'Animations', 'Slide Show', 'Review', 'View'];
  var CONTEXTUAL_TABS = ['Table Design', 'Table Layout', 'Chart Design', 'Picture Format', 'Shape Format', 'Slide Master', 'Draw', 'Playback'];

  var ICONS = {
    'new': '🆕', 'open': '📂', 'save': '💾', 'save as': '💾', 'print': '🖨️',
    'share': '📤', 'export': '📤', 'options': '⚙️', 'close': '✖️',
    'paste': '📋', 'cut': '✂️', 'copy': '🗐', 'format painter': '🖌️',
    'new slide': '➕', 'layout': '⬛', 'reset': '🔄', 'section': '📂',
    'font color': '🅰️', 'bullets': '≡', 'numbering': '№', 'align left': '≡', 'center': '≣', 'line spacing': '↕',
    'shapes': '◇', 'arrange': '▤', 'quick styles': '🎨',
    'find': '🔍', 'replace': '⇄', 'select': '⬚',
    'table': '⊞', 'pictures': '🖼️', 'screenshot': '📸', 'photo album': '🖼️',
    'icons': '⭐', 'smartart': '🔷', 'chart': '📊',
    'link': '🔗', 'action': '⚡', 'new comment': '💬',
    'text box': '📝', 'header & footer': '⬒', 'wordart': '🅰️', 'date & time': '🕒', 'object': '📦',
    'equation': '∑', 'symbol': 'Ω', 'video': '🎬', 'audio': '🔊', 'screen recording': '⏺️',
    'themes': '🎭', 'variants': '🎨', 'slide size': '📐', 'format background': '🖼️',
    'none': '🚫', 'fade': '🌫️', 'push': '➡️', 'wipe': '🧹',
    'sound': '🔊', 'duration': '⏱️', 'apply to all': '✅',
    'appear': '👁️', 'fly in': '🛫', 'add animation': '➕', 'animation pane': '📋', 'trigger': '⚡',
    'start': '▶️', 'reorder animation': '🔃',
    'from beginning': '▶️', 'from current slide': '⏯️', 'set up slide show': '⚙️', 'hide slide': '🙈', 'rehearse timings': '⏱️',
    'resolution': '🖥️', 'spelling': '✔️', 'compare': '⚖️',
    'normal': '🔲', 'slide sorter': '▦', 'notes page': '📝', 'reading view': '📖',
    'ruler': '📏', 'gridlines': '⊞', 'zoom': '🔍',
    'medium style 4 - accent 6': '🟪', 'medium style 2 - accent 1': '🟦',
    'header row': '☑️', 'banded rows': '☑️', 'total row': '☑️',
    'insert below': '⬇️', 'insert above': '⬆️', 'delete': '␡',
    'merge cells': '⬛', 'split cells': '▦',
    'add chart element': '➕', 'quick layout': '⚡', 'change colors': '🎨',
    'switch row/column': '⇄', 'select data': '📊',
    'corrections': '☀️', 'color': '🎨', 'artistic effects': '🖌️',
    'picture border': '▭', 'picture effects': '✨',
    'bold': 'B', 'italic': 'I', 'underline': 'U',
    'info': 'ℹ️', 'reuse slides': '🔁', 'slides from outline': '📄',
    'equalize character height': '🔤', 'convert to smartart': '🔷',
    'this device': '💻', 'forward or next': '⏭️', 'zoom': '🔎', 'summary zoom': '🔎',
    'ripple': '🌊', 'bounce': '⛹️', 'from bottom-right': '↖️', 'after previous': '⏱️',
    'custom slide show': '🎬', 'record slide show': '⏺️',
    'slide master': '🗂️', 'handout master': '🗂️', 'notes master': '🗂️',
    'outside borders': '▦', 'change chart type': '📊',
    'crop': '✂️', 'change picture': '🖼️', 'simple frame': '🖼️', 'oval': '⭕',
    'align': '▤', 'align top': '⬆️', 'alt text': '🏷️',
    'edit shape': '✏️', 'subtle effect - orange': '🟧', 'moderate effect - orange': '🟧',
    'subtle effect - tan': '🟫', 'align text': '▤',
    'media': '🎬', 'insert placeholder': '⬛', 'close master view': '✖️',
    'colors': '🎨', 'fonts': '🔤', 'background styles': '🖼️', 'picture': '🖼️',
    'pen': '🖊️', 'highlighter': '🖍️', 'eraser': '🧹', 'trim video': '✂️', 'trim audio': '✂️'
  };
  var SMALL_GLYPH_LABELS = { 'bold': 1, 'italic': 1, 'underline': 1 };
  var SMALL_ICON_LABELS = {
    'cut': 1, 'copy': 1, 'format painter': 1, 'font color': 1, 'bullets': 1, 'numbering': 1,
    'align left': 1, 'center': 1, 'line spacing': 1
  };
  var PILL_LABELS = {
    'font': 1, 'font size': 1,
    'medium style 4 - accent 6': 1, 'medium style 2 - accent 1': 1,
    'header row': 1, 'banded rows': 1, 'total row': 1,
    'none': 1, 'fade': 1, 'push': 1, 'wipe': 1, 'ripple': 1, 'appear': 1, 'fly in': 1, 'bounce': 1,
    'ruler': 1, 'gridlines': 1, '100%': 1
  };

  // ────────────────────────────────────────────────────────────
  // "Khung slide" giả lập — dãy thumbnail bên trái + 1 slide chính bên
  // phải (thay cho trang giấy Word / lưới ô tính Excel). Khi hoàn thành
  // nhiệm vụ liên quan đến bảng/biểu đồ/slide mới, thêm 1 "đối tượng" vào
  // slide đang mở để học sinh thấy tác dụng — không mô phỏng đúng 100%
  // nội dung .pptx gốc.
  // ────────────────────────────────────────────────────────────
  var slideObjects = {}; // { file: { slideCount, objects: [...] } }

  function ensureFileState(file) {
    if (!slideObjects[file]) slideObjects[file] = { slideCount: 1, objects: ['table'] };
    return slideObjects[file];
  }

  function renderSlideRail(file) {
    var host = document.getElementById('pwSlideRail');
    if (!host) return;
    var st = ensureFileState(file);
    var html = '';
    for (var i = 1; i <= st.slideCount; i++) {
      html += '<div class="pw-thumb' + (i === st.slideCount ? ' pw-thumb-active' : '') + '"><span class="pw-thumb-num">' + i + '</span></div>';
    }
    host.innerHTML = html;
  }

  var OBJECT_HTML = {
    table: function () {
      return '<table class="pwo pwo-table"><tr><td>Under 19</td><td>19 to 34</td><td>35 to 49</td><td>50+</td></tr>' +
        '<tr><td></td><td></td><td></td><td></td></tr></table>';
    },
    chart: function () { return '<div class="pwo pwo-chart">📊<span>Clustered Column Chart</span></div>'; },
    chartTitle: function () { return '<div class="pwo pwo-chart-title">Adventure Tour Popularity</div>'; }
  };

  function renderSlide(file) {
    var host = document.getElementById('pwSlideMain');
    if (!host) return;
    var st = ensureFileState(file);
    host.innerHTML = '<div class="pw-slide-title">Slide ' + st.slideCount + '</div>' +
      st.objects.map(function (o) {
        var f = OBJECT_HTML[o];
        return f ? f() : '';
      }).join('');
  }

  var sim = RibbonSim.create({
    dataUrl: 'data/mos-powerpoint-lessons.json',
    progressKey: 'ps_progress_v1',
    ribbon: RIBBON,
    tabOrder: TAB_ORDER,
    contextualTabs: CONTEXTUAL_TABS,
    icons: ICONS,
    smallGlyphLabels: SMALL_GLYPH_LABELS,
    smallIconLabels: SMALL_ICON_LABELS,
    pillLabels: PILL_LABELS,
    docSuffix: ' - PowerPoint',
    docDefaultName: 'Presentation1',
    missionFileFallback: '🖥️ Bài trình chiếu thực hành',
    backstageTab: 'File',
    onResetLesson: function () { slideObjects = {}; },
    onOpenSubtask: function (s) {
      renderSlideRail(s.file || 'Presentation1');
      renderSlide(s.file || 'Presentation1');
    },
    onCompleteSubtask: function (sub) {
      var file = sub.file || 'Presentation1';
      var st = ensureFileState(file);
      var n = RibbonSim.norm(sub.desc);
      if (/chen mot slide moi|slide 2/.test(n)) {
        st.slideCount++;
        st.objects = ['chart'];
      } else if (/chart title|tieu de bieu do|adventure tour/.test(n)) {
        st.objects.push('chartTitle');
      }
      renderSlideRail(file);
      renderSlide(file);
    }
  });

  window.__psDebug = { STATE: sim.STATE };
})();
