/* ════════════════════════════════════════════════════════════
   js/word-simulator.js — "MOS Word 2019: Ôn luyện cuối khóa"

   Dữ liệu: data/mos-word-lessons.json (10 tiết x các "nhiệm vụ" (subtask),
   mỗi nhiệm vụ có 1 yêu cầu (desc) + danh sách bước thao tác (steps) được
   trích tự động từ nguyên liệu PPTX gốc (IIG Vietnam). Mỗi step có 1 "type":

     ribbon_tab    — click đúng tab trên Ribbon (Home/Insert/Design/...)
     ribbon_button — click đúng nút trong đúng nhóm của tab đang mở
     dialog_field  — nhập đúng nội dung vào (các) ô trong hộp thoại
     dialog_choice — chọn đúng lựa chọn trong hộp thoại/gallery
     checkbox_toggle — bật/tắt đúng hộp kiểm
     confirm       — click nút xác nhận (OK/Close/Save/Add/Set/Apply/Insert)
     manual_action — thao tác không mô phỏng được (chọn vùng văn bản, kéo
                     chuột...) — hiển thị hướng dẫn, học sinh tự làm trên
                     Word thật rồi bấm "Đã thực hiện" để qua bước kế.

   Kiến trúc: KHÔNG mô phỏng pixel-by-pixel toàn bộ Word — chỉ mô phỏng
   đúng luồng thao tác Ribbon (tab → nhóm → nút → hộp thoại) vì đây là kỹ
   năng cốt lõi MOS kiểm tra ("biết lệnh nằm ở đâu"). Ribbon được dựng từ
   RIBBON config bên dưới, đủ bao phủ toàn bộ vocabulary xuất hiện trong
   275 nhiệm vụ của 10 tiết.
   ════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var DATA_URL = 'data/mos-word-lessons.json';
  var PROGRESS_KEY = 'ws_progress_v1';

  // ────────────────────────────────────────────────────────────
  // RIBBON — cấu hình Ribbon Word 2019 (đủ các tab/nhóm/nút mà 10 tiết
  // MOS Word cần dùng tới, cộng thêm vài nút phổ biến khác để Ribbon
  // trông thật và tạo "nhiễu" (distractor) khi học sinh phải tìm đúng nút).
  // ────────────────────────────────────────────────────────────
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

  var GENERIC_CHOICE_DISTRACTORS = [
    'Cancel', 'Apply', 'Restore Defaults', 'Ignore All', 'Print Preview',
    'None', 'Custom...', 'More Options...', 'Reset'
  ];
  var CONFIRM_LABELS = ['OK', 'Close', 'Save', 'Add', 'Set', 'Apply', 'Insert'];

  // ────────────────────────────────────────────────────────────
  // STATE
  // ────────────────────────────────────────────────────────────
  var STATE = {
    data: null,
    progress: {},
    currentLesson: null,
    currentSubtaskIdx: 0,
    currentStepIdx: 0,
    activeTab: 'Home'
  };

  function norm(s) {
    return (s || '').toString().trim().toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // bỏ dấu để so khớp khoan dung hơn với phần tiếng Việt lẫn trong control
      .replace(/[^a-z0-9]+/g, ' ').trim();
  }
  function fuzzyMatch(a, b) {
    var na = norm(a), nb = norm(b);
    if (!na || !nb) return false;
    return na === nb || na.indexOf(nb) !== -1 || nb.indexOf(na) !== -1;
  }

  function loadProgress() {
    try {
      var raw = localStorage.getItem(PROGRESS_KEY);
      STATE.progress = raw ? JSON.parse(raw) : {};
    } catch (e) { STATE.progress = {}; }
  }
  function saveProgress() {
    try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(STATE.progress)); } catch (e) {}
  }
  function markSubtaskDone(id) {
    STATE.progress[id] = true;
    saveProgress();
  }

  // ────────────────────────────────────────────────────────────
  // LOBBY
  // ────────────────────────────────────────────────────────────
  function renderLobby() {
    var grid = document.getElementById('wsLessonGrid');
    var totalEl = document.getElementById('wsLobbyTotal');
    grid.innerHTML = '';
    var totalDone = 0, totalAll = 0;

    STATE.data.lessons.forEach(function (lesson) {
      var subs = lesson.subtasks;
      var done = subs.filter(function (s) { return STATE.progress[s.id]; }).length;
      totalDone += done; totalAll += subs.length;
      var pct = subs.length ? Math.round(done / subs.length * 100) : 0;

      var tile = document.createElement('button');
      tile.type = 'button';
      tile.className = 'ws-lesson-tile' + (pct === 100 ? ' ws-complete' : '');
      tile.innerHTML =
        '<span class="ws-lesson-tile-num">' + lesson.index + '</span>' +
        '<span class="ws-lesson-tile-title">' + escapeHtml(lesson.title) + '</span>' +
        '<span class="ws-lesson-tile-sub">' + escapeHtml(lesson.subtitle || '') + '</span>' +
        '<span class="ws-lesson-tile-progress-bar"><span class="ws-lesson-tile-progress-fill" style="width:' + pct + '%"></span></span>' +
        '<span class="ws-lesson-tile-progress-label">' + done + '/' + subs.length + ' nhiệm vụ' + (pct === 100 ? ' · Hoàn thành 🎉' : '') + '</span>';
      tile.addEventListener('click', function () { openLesson(lesson); });
      grid.appendChild(tile);
    });

    totalEl.textContent = totalDone + '/' + totalAll + ' nhiệm vụ đã hoàn thành';
  }

  function escapeHtml(s) {
    return (s || '').toString()
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ────────────────────────────────────────────────────────────
  // LESSON RUNNER
  // ────────────────────────────────────────────────────────────
  function openLesson(lesson) {
    STATE.currentLesson = lesson;
    STATE.currentSubtaskIdx = 0;
    // Nhảy tới nhiệm vụ đầu tiên CHƯA hoàn thành (để học sinh quay lại tiếp tục dở dang)
    for (var i = 0; i < lesson.subtasks.length; i++) {
      if (!STATE.progress[lesson.subtasks[i].id]) { STATE.currentSubtaskIdx = i; break; }
      if (i === lesson.subtasks.length - 1) STATE.currentSubtaskIdx = 0; // đã xong hết -> cho xem lại từ đầu
    }
    document.getElementById('wsLessonTitle').textContent = lesson.title;
    document.getElementById('wsLessonSubtitle').textContent = lesson.subtitle || '';
    show('wsLessonScreen'); hide('wsLobbyScreen');
    renderTaskRail();
    openSubtask(STATE.currentSubtaskIdx);
  }

  function closeLesson() {
    renderLobby();
    show('wsLobbyScreen'); hide('wsLessonScreen');
  }

  function renderTaskRail() {
    var rail = document.getElementById('wsTaskRail');
    rail.innerHTML = '';
    STATE.currentLesson.subtasks.forEach(function (s, idx) {
      var item = document.createElement('div');
      var done = !!STATE.progress[s.id];
      item.className = 'ws-task-item' + (idx === STATE.currentSubtaskIdx ? ' ws-active' : '') + (done ? ' ws-done' : '');
      item.innerHTML =
        '<span class="ws-task-item-mark">' + (done ? '✅' : (idx + 1)) + '</span>' +
        '<span class="ws-task-item-text">' + escapeHtml(truncate(s.desc, 70)) + '</span>';
      item.addEventListener('click', function () { openSubtask(idx); });
      rail.appendChild(item);
    });
    updateLessonProgress();
  }

  function updateLessonProgress() {
    var subs = STATE.currentLesson.subtasks;
    var done = subs.filter(function (s) { return STATE.progress[s.id]; }).length;
    document.getElementById('wsLessonProgress').textContent = done + '/' + subs.length;
  }

  function truncate(s, n) {
    s = s || '';
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  }

  function openSubtask(idx) {
    STATE.currentSubtaskIdx = idx;
    STATE.currentStepIdx = 0;
    STATE.activeTab = 'Home';
    var s = STATE.currentLesson.subtasks[idx];
    document.getElementById('wsMissionFile').textContent = s.file ? '📄 ' + s.file : '📄 Tài liệu thực hành';
    document.getElementById('wsMissionDesc').textContent = (s.letter ? s.letter + '. ' : '') + s.desc;
    document.getElementById('wwDocName').textContent = (s.file || 'Document1') + ' - Word';
    highlightRailActive();
    renderTab(STATE.activeTab);
    renderCurrentStep();
  }

  function highlightRailActive() {
    var items = document.querySelectorAll('.ws-task-item');
    items.forEach(function (el, i) { el.classList.toggle('ws-active', i === STATE.currentSubtaskIdx); });
  }

  function currentSubtask() { return STATE.currentLesson.subtasks[STATE.currentSubtaskIdx]; }
  function currentStep() { return currentSubtask().steps[STATE.currentStepIdx]; }

  // ────────────────────────────────────────────────────────────
  // RIBBON RENDERING
  // ────────────────────────────────────────────────────────────
  function renderTab(tabName) {
    STATE.activeTab = tabName;
    var tabsEl = document.getElementById('wwTabs');
    tabsEl.innerHTML = '';
    var allTabs = TAB_ORDER.concat(CONTEXTUAL_TABS.filter(function (t) { return t === tabName; }));
    // Luôn hiện các tab chuẩn; tab ngữ cảnh chỉ hiện khi đang là tab đang mở
    // (để Ribbon không quá dài) — nhưng nếu step yêu cầu 1 tab ngữ cảnh khác
    // đang không hiển thị, renderCurrentStep() sẽ tự thêm nó vào.
    allTabs.forEach(function (t) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ww-tab' + (t === tabName ? ' ww-active' : '');
      btn.textContent = t;
      btn.addEventListener('click', function () { handleTabClick(t); });
      tabsEl.appendChild(btn);
    });

    var groupsEl = document.getElementById('wwGroups');
    groupsEl.innerHTML = '';
    var groups = RIBBON[tabName] || [];
    groups.forEach(function (g) {
      var gEl = document.createElement('div');
      gEl.className = 'ww-group';
      var btnsWrap = document.createElement('div');
      btnsWrap.className = 'ww-group-buttons';
      g.buttons.forEach(function (label) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'ww-btn';
        b.textContent = label;
        b.addEventListener('click', function () { handleButtonClick(g.group, label, b); });
        btnsWrap.appendChild(b);
      });
      var lbl = document.createElement('div');
      lbl.className = 'ww-group-label';
      lbl.textContent = g.group;
      gEl.appendChild(btnsWrap);
      gEl.appendChild(lbl);
      groupsEl.appendChild(gEl);
    });
  }

  function ensureTabAvailable(tabName) {
    if (TAB_ORDER.indexOf(tabName) !== -1) return;
    var tabsEl = document.getElementById('wwTabs');
    var exists = Array.prototype.some.call(tabsEl.children, function (el) { return fuzzyMatch(el.textContent, tabName); });
    if (!exists && RIBBON[tabName]) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ww-tab';
      btn.textContent = tabName;
      btn.addEventListener('click', function () { handleTabClick(tabName); });
      tabsEl.appendChild(btn);
    }
  }

  // ────────────────────────────────────────────────────────────
  // STEP FLOW
  // ────────────────────────────────────────────────────────────
  function renderCurrentStep() {
    var sub = currentSubtask();
    if (STATE.currentStepIdx >= sub.steps.length) { completeSubtask(); return; }
    var step = currentStep();

    document.getElementById('wsInstructionStepNum').textContent = 'Bước ' + (STATE.currentStepIdx + 1) + '/' + sub.steps.length + ':';
    document.getElementById('wsInstructionText').textContent = step.text;

    clearFlashes();

    switch (step.type) {
      case 'ribbon_tab':
        prepareRibbonTabStep(step);
        break;
      case 'ribbon_button':
        prepareRibbonButtonStep(step);
        break;
      case 'dialog_field':
        openFieldDialog(step);
        break;
      case 'dialog_choice':
        openChoiceDialog(step, step.control, gatherDistractorsFor(step));
        break;
      case 'checkbox_toggle':
        openCheckboxDialog(step);
        break;
      case 'confirm':
        openConfirmPrompt(step);
        break;
      default:
        openManualStep(step);
    }
  }

  function advanceStep() {
    STATE.currentStepIdx++;
    renderCurrentStep();
  }

  function completeSubtask() {
    var sub = currentSubtask();
    markSubtaskDone(sub.id);
    renderTaskRail();
    showToast('✅ Hoàn thành nhiệm vụ ' + (sub.letter ? sub.letter + '. ' : '') + '— ' + truncate(sub.desc, 60));
    var nextIdx = STATE.currentSubtaskIdx + 1;
    setTimeout(function () {
      if (nextIdx < STATE.currentLesson.subtasks.length) {
        openSubtask(nextIdx);
      } else {
        showToast('🎉 Bạn đã hoàn thành toàn bộ ' + STATE.currentLesson.title + '!');
      }
    }, 900);
  }

  function showToast(msg) {
    var t = document.getElementById('wsToast');
    t.textContent = msg;
    show('wsToast', true);
    clearTimeout(showToast._h);
    showToast._h = setTimeout(function () { hide('wsToast'); }, 2400);
  }

  // ---- ribbon_tab: cần click đúng tab (đôi khi kèm 1 lựa chọn/menu con sau đó) ----
  function prepareRibbonTabStep(step) {
    var tab = step.tab;
    if (tab && RIBBON[tab]) ensureTabAvailable(tab);
    if (tab && RIBBON[tab]) {
      pulseTab(tab);
    } else {
      // Không nhận diện được tab hợp lệ trong Ribbon config -> chuyển
      // sang xác nhận chung để không làm học sinh bị kẹt.
      openConfirmPrompt(step);
      return;
    }
    step._pendingControl = step.control || null;
  }

  function pulseTab(tab) {
    var tabsEl = document.getElementById('wwTabs');
    Array.prototype.forEach.call(tabsEl.children, function (el) {
      el.classList.toggle('ww-target', fuzzyMatch(el.textContent, tab));
    });
  }

  function handleTabClick(tabName) {
    var step = currentStep();
    if (!step) { renderTab(tabName); return; }
    if ((step.type === 'ribbon_tab' || step.type === 'ribbon_button') && step.tab && fuzzyMatch(tabName, step.tab)) {
      renderTab(tabName);
      clearPulses();
      if (step.type === 'ribbon_tab') {
        if (step.control) {
          // vd: "Từ thẻ File, chọn New." — sau khi mở tab, cần chọn 1 mục trong đó
          openChoiceDialog(step, step.control, gatherTabButtons(tabName, step.control));
        } else {
          advanceStep();
        }
      } else {
        // ribbon_button: đã đúng tab, chờ click đúng nhóm/nút
        highlightExpectedButton(step);
      }
    } else {
      renderTab(tabName); // vẫn cho xem, nhưng không tính là đúng bước
      if (currentStep().type === 'ribbon_tab' || currentStep().type === 'ribbon_button') {
        flashWrongTab(tabName);
      }
    }
  }

  function flashWrongTab(tabName) {
    var tabsEl = document.getElementById('wwTabs');
    Array.prototype.forEach.call(tabsEl.children, function (el) {
      if (fuzzyMatch(el.textContent, tabName)) {
        el.classList.add('ww-wrong-flash');
        setTimeout(function () { el.classList.remove('ww-wrong-flash'); }, 350);
      }
    });
  }

  // ---- ribbon_button: cần đúng tab (đã ở đúng tab) + đúng nút trong nhóm ----
  function prepareRibbonButtonStep(step) {
    if (step.tab && RIBBON[step.tab] && !fuzzyMatch(STATE.activeTab, step.tab)) {
      ensureTabAvailable(step.tab);
      pulseTab(step.tab);
      return; // chờ handleTabClick chuyển tab trước
    }
    highlightExpectedButton(step);
  }

  function highlightExpectedButton(step) {
    if (!step.control) { advanceStep(); return; }
    var groupsEl = document.getElementById('wwGroups');
    var found = false;
    Array.prototype.forEach.call(groupsEl.querySelectorAll('.ww-btn'), function (btn) {
      if (fuzzyMatch(btn.textContent, step.control)) found = true;
    });
    if (!found) {
      // Nút không có sẵn trong Ribbon config -> hiện lựa chọn xác nhận chung
      openChoiceDialog(step, step.control, GENERIC_CHOICE_DISTRACTORS.slice(0, 2));
    }
  }

  function handleButtonClick(group, label, btnEl) {
    var step = currentStep();
    if (!step) return;
    var isTargetType = step.type === 'ribbon_button';
    var matches = isTargetType && fuzzyMatch(label, step.control) && (!step.group || fuzzyMatch(group, step.group));
    if (matches) {
      btnEl.classList.add('ww-correct-flash');
      setTimeout(function () { advanceStep(); }, 260);
    } else if (isTargetType) {
      btnEl.classList.add('ww-wrong-flash');
      setTimeout(function () { btnEl.classList.remove('ww-wrong-flash'); }, 350);
    }
  }

  function clearFlashes() {
    document.querySelectorAll('.ww-correct-flash,.ww-wrong-flash').forEach(function (el) {
      el.classList.remove('ww-correct-flash', 'ww-wrong-flash');
    });
  }
  function clearPulses() {
    document.querySelectorAll('.ww-target').forEach(function (el) { el.classList.remove('ww-target'); });
  }

  function gatherTabButtons(tabName, exceptLabel) {
    var pool = [];
    (RIBBON[tabName] || []).forEach(function (g) { pool = pool.concat(g.buttons); });
    pool = pool.filter(function (b) { return !fuzzyMatch(b, exceptLabel); });
    shuffle(pool);
    return pool.slice(0, 3);
  }

  function gatherDistractorsFor(step) {
    var pool = [];
    if (step.group && RIBBON[step.tab || STATE.activeTab]) {
      (RIBBON[step.tab || STATE.activeTab] || []).forEach(function (g) {
        if (fuzzyMatch(g.group, step.group)) pool = pool.concat(g.buttons);
      });
    }
    pool = pool.filter(function (b) { return !fuzzyMatch(b, step.control); });
    if (pool.length < 2) pool = pool.concat(GENERIC_CHOICE_DISTRACTORS);
    shuffle(pool);
    return pool.slice(0, 3);
  }

  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    return arr;
  }

  // ────────────────────────────────────────────────────────────
  // DIALOG (modal) — dùng chung cho dialog_field / dialog_choice /
  // checkbox_toggle / confirm / manual_action
  // ────────────────────────────────────────────────────────────
  function openDialogShell(title) {
    document.getElementById('wwDialogTitle').textContent = title;
    var body = document.getElementById('wwDialogBody');
    var footer = document.getElementById('wwDialogFooter');
    body.innerHTML = '';
    footer.innerHTML = '';
    show('wwDialogOverlay', true);
    return { body: body, footer: footer };
  }
  function closeDialogShell() { hide('wwDialogOverlay'); }

  function makeFooterBtn(label, primary, onClick) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'ww-dialog-btn' + (primary ? '' : ' ww-secondary');
    b.textContent = label;
    b.addEventListener('click', onClick);
    return b;
  }

  function openFieldDialog(step) {
    var d = openDialogShell('Hộp thoại');
    var inputs = [];
    step.fields.forEach(function (pair) {
      var fieldName = pair[0], expected = pair[1];
      var wrap = document.createElement('div');
      wrap.className = 'ww-dialog-field';
      var label = document.createElement('label');
      label.textContent = fieldName + ':';
      var input = document.createElement('input');
      input.type = 'text';
      input.placeholder = 'Nhập ' + fieldName + '…';
      wrap.appendChild(label);
      wrap.appendChild(input);
      d.body.appendChild(wrap);
      inputs.push({ input: input, expected: expected.trim() });
    });
    d.footer.appendChild(makeFooterBtn('OK', true, function () {
      var allOk = inputs.every(function (f) {
        var ok = fuzzyMatch(f.input.value, f.expected);
        f.input.classList.toggle('ww-input-wrong', !ok);
        return ok;
      });
      if (allOk) { closeDialogShell(); advanceStep(); }
    }));
  }

  function openChoiceDialog(step, correctLabel, distractors) {
    var d = openDialogShell('Chọn thao tác');
    var options = distractors.slice();
    options.push(correctLabel);
    shuffle(options);
    var grid = document.createElement('div');
    grid.className = 'ww-choice-grid';
    options.forEach(function (opt) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'ww-choice-option';
      b.textContent = opt;
      b.addEventListener('click', function () {
        if (fuzzyMatch(opt, correctLabel)) { closeDialogShell(); advanceStep(); }
        else { b.classList.add('ww-wrong-flash'); setTimeout(function () { b.classList.remove('ww-wrong-flash'); }, 350); }
      });
      grid.appendChild(b);
    });
    d.body.appendChild(grid);
    d.footer.appendChild(makeFooterBtn('Hủy', false, closeDialogShell));
  }

  function openCheckboxDialog(step) {
    var d = openDialogShell('Tuỳ chọn');
    var wantsChecked = /^chọn$/i.test((step.action || '').trim());
    var row = document.createElement('div');
    row.className = 'ww-checkbox-row';
    var cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !wantsChecked; // trạng thái ban đầu ngược lại yêu cầu, để học sinh phải bấm đổi
    var lbl = document.createElement('label');
    lbl.textContent = step.label;
    row.appendChild(cb); row.appendChild(lbl);
    d.body.appendChild(row);
    d.footer.appendChild(makeFooterBtn('OK', true, function () {
      if (cb.checked === wantsChecked) { closeDialogShell(); advanceStep(); }
      else { row.classList.add('ww-wrong-flash'); setTimeout(function () { row.classList.remove('ww-wrong-flash'); }, 350); }
    }));
  }

  function openConfirmPrompt(step) {
    var label = step.control || 'OK';
    var d = openDialogShell('Xác nhận');
    var p = document.createElement('div');
    p.textContent = 'Bấm "' + label + '" để hoàn tất thao tác.';
    d.body.appendChild(p);
    var distractors = CONFIRM_LABELS.filter(function (l) { return !fuzzyMatch(l, label); });
    shuffle(distractors);
    [label].concat(distractors.slice(0, 2)).forEach(function (opt, i) {
      var b = makeFooterBtn(opt, opt === label, function () {
        if (fuzzyMatch(opt, label)) { closeDialogShell(); advanceStep(); }
        else { b.classList.add('ww-wrong-flash'); setTimeout(function () { b.classList.remove('ww-wrong-flash'); }, 350); }
      });
      d.footer.appendChild(b);
    });
  }

  function openManualStep(step) {
    closeDialogShell();
    // Với manual_action, không dùng modal — hiện ngay trong thanh hướng dẫn
    // (đã render ở renderCurrentStep) kèm nút xác nhận bên dưới cửa sổ Word.
    var footer = document.querySelector('.ws-mission-footer');
    var existing = document.getElementById('wsManualConfirmBtn');
    if (existing) existing.remove();
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'wsManualConfirmBtn';
    btn.className = 'ws-manual-confirm-btn';
    btn.textContent = '✓ Đã thực hiện — Tiếp tục';
    btn.addEventListener('click', function () { btn.remove(); advanceStep(); });
    footer.insertBefore(btn, footer.firstChild);
  }

  // ────────────────────────────────────────────────────────────
  // UTIL show/hide
  // ────────────────────────────────────────────────────────────
  function show(id, flex) {
    var el = document.getElementById(id);
    el.classList.remove('ws-hidden');
    if (flex) el.style.display = 'flex';
  }
  function hide(id) {
    var el = document.getElementById(id);
    el.classList.add('ws-hidden');
    el.style.display = '';
  }

  // ────────────────────────────────────────────────────────────
  // INIT
  // ────────────────────────────────────────────────────────────
  function init() {
    loadProgress();
    document.getElementById('wsBackBtn').addEventListener('click', closeLesson);
    document.getElementById('wsSkipBtn').addEventListener('click', function () {
      var manualBtn = document.getElementById('wsManualConfirmBtn');
      if (manualBtn) manualBtn.remove();
      closeDialogShell();
      advanceStep();
    });

    fetch(DATA_URL)
      .then(function (r) { return r.json(); })
      .then(function (json) {
        STATE.data = json;
        renderLobby();
      })
      .catch(function (err) {
        document.getElementById('wsLobbyTotal').textContent = 'Không tải được dữ liệu bài học.';
        console.error('word-simulator: load data failed', err);
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
