/* ════════════════════════════════════════════════════════════
   js/ribbon-sim-core.js — Engine dùng CHUNG cho cả 3 "MOS Ribbon
   Simulator" (Word, Excel, PowerPoint). Tách ra từ js/word-simulator.js
   (bản gốc chỉ có Word) để áp dụng đúng 1 luồng thao tác Ribbon
   (tab → nhóm → nút → hộp thoại) cho cả 3 môn thay vì viết lại 3 lần.

   Cách dùng: mỗi trang <subject>-simulator.html include file này TRƯỚC
   js/<subject>-simulator.js — file kia chỉ khai báo RIBBON config + icon
   + (tuỳ chọn) hook vẽ "canvas" riêng của môn đó (trang giấy Word / lưới ô
   tính Excel / slide PowerPoint), rồi gọi:

     RibbonSim.create({ dataUrl, progressKey, ribbon, tabOrder,
       contextualTabs, icons, docSuffix, docDefaultName,
       onOpenSubtask(sub), onCompleteSubtask(sub), onResetLesson() });

   Các id phần tử DOM dùng chung, cố định giữa 3 trang (xem *-simulator.html):
   wsLobbyScreen/wsLessonScreen/wsLessonGrid/wsLobbyTotal/wsBackBtn/
   wsSkipBtn/wsLessonTitle/wsLessonSubtitle/wsTaskRail/wsLessonProgress/
   wsMissionFile/wsMissionDesc/wwDocName/wwTabs/wwGroups/wwDialogOverlay/
   wwDialogTitle/wwDialogBody/wwDialogFooter/wsToast/wsInstructionStepNum/
   wsInstructionText — HTML mỗi môn giữ nguyên khung này, chỉ đổi phần
   "canvas" bên trong .ws-stage (trang giấy / lưới ô tính / slide).

   Dữ liệu bài học: mỗi <subject>-lessons.json có dạng
   { subject, version, lessons: [{ id, index, title, subtitle,
     subtasks: [{ id, letter, file, desc, steps: [...] }] }] }
   Mỗi step có 1 "type" — xem chú thích gốc trong js/word-simulator.js:
   ribbon_tab / ribbon_button / dialog_field / dialog_choice /
   checkbox_toggle / confirm / manual_action.
   ════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var DEFAULT_GENERIC_CHOICE_DISTRACTORS = [
    'Cancel', 'Apply', 'Restore Defaults', 'Ignore All', 'Print Preview',
    'None', 'Custom...', 'More Options...', 'Reset'
  ];
  var DEFAULT_CONFIRM_LABELS = ['OK', 'Close', 'Save', 'Add', 'Set', 'Apply', 'Insert'];

  function norm(s) {
    return (s || '').toString().trim().toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, ' ').trim();
  }
  function fuzzyMatch(a, b) {
    var na = norm(a), nb = norm(b);
    if (!na || !nb) return false;
    return na === nb || na.indexOf(nb) !== -1 || nb.indexOf(na) !== -1;
  }
  function escapeHtml(s) {
    return (s || '').toString()
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function truncate(s, n) {
    s = s || '';
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  }
  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    return arr;
  }

  function create(config) {
    var DATA_URL = config.dataUrl;
    var PROGRESS_KEY = config.progressKey;
    var RIBBON = config.ribbon;
    var TAB_ORDER = config.tabOrder;
    var CONTEXTUAL_TABS = config.contextualTabs || [];
    var ICONS = config.icons || {};
    var SMALL_GLYPH_LABELS = config.smallGlyphLabels || {};
    var SMALL_ICON_LABELS = config.smallIconLabels || {};
    var PILL_LABELS = config.pillLabels || {};
    var GENERIC_CHOICE_DISTRACTORS = config.genericChoiceDistractors || DEFAULT_GENERIC_CHOICE_DISTRACTORS;
    var CONFIRM_LABELS = config.confirmLabels || DEFAULT_CONFIRM_LABELS;
    var DOC_SUFFIX = config.docSuffix || '';
    var DOC_DEFAULT_NAME = config.docDefaultName || 'Document1';
    var MISSION_FILE_FALLBACK = config.missionFileFallback || '📄 Tài liệu thực hành';
    var BACKSTAGE_TAB = config.backstageTab || 'File';

    function iconFor(label) { return ICONS[norm(label)] || '▫'; }
    function kindFor(label) {
      var n = norm(label);
      if (SMALL_GLYPH_LABELS[n]) return 'glyph';
      if (SMALL_ICON_LABELS[n]) return 'small';
      if (PILL_LABELS[n]) return 'pill';
      return 'large';
    }

    var STATE = {
      data: null,
      progress: {},
      currentLesson: null,
      currentSubtaskIdx: 0,
      currentStepIdx: 0,
      activeTab: TAB_ORDER[1] || TAB_ORDER[0]
    };

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

    // ── LOBBY ──────────────────────────────────────────────────
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

    // ── LESSON RUNNER ──────────────────────────────────────────
    function openLesson(lesson) {
      STATE.currentLesson = lesson;
      STATE.currentSubtaskIdx = 0;
      if (config.onResetLesson) config.onResetLesson();
      for (var i = 0; i < lesson.subtasks.length; i++) {
        if (!STATE.progress[lesson.subtasks[i].id]) { STATE.currentSubtaskIdx = i; break; }
        if (i === lesson.subtasks.length - 1) STATE.currentSubtaskIdx = 0;
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

    function openSubtask(idx) {
      STATE.currentSubtaskIdx = idx;
      STATE.currentStepIdx = 0;
      STATE.activeTab = TAB_ORDER[1] || TAB_ORDER[0];
      var s = STATE.currentLesson.subtasks[idx];
      document.getElementById('wsMissionFile').textContent = s.file ? '📄 ' + s.file : MISSION_FILE_FALLBACK;
      document.getElementById('wsMissionDesc').textContent = (s.letter ? s.letter + '. ' : '') + s.desc;
      var docNameEl = document.getElementById('wwDocName');
      if (docNameEl) docNameEl.textContent = (s.file || DOC_DEFAULT_NAME) + DOC_SUFFIX;
      highlightRailActive();
      renderTab(STATE.activeTab);
      if (config.onOpenSubtask) config.onOpenSubtask(s);
      renderCurrentStep();
    }

    function highlightRailActive() {
      var items = document.querySelectorAll('.ws-task-item');
      items.forEach(function (el, i) { el.classList.toggle('ws-active', i === STATE.currentSubtaskIdx); });
    }

    function currentSubtask() { return STATE.currentLesson.subtasks[STATE.currentSubtaskIdx]; }
    function currentStep() { return currentSubtask().steps[STATE.currentStepIdx]; }

    // ── RIBBON RENDERING ───────────────────────────────────────
    function renderTab(tabName) {
      STATE.activeTab = tabName;
      var tabsEl = document.getElementById('wwTabs');
      tabsEl.innerHTML = '';
      var allTabs = TAB_ORDER.concat(CONTEXTUAL_TABS.filter(function (t) { return t === tabName; }));
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
      groupsEl.classList.toggle('ww-backstage', tabName === BACKSTAGE_TAB);
      var groups = RIBBON[tabName] || [];

      if (tabName === BACKSTAGE_TAB) {
        groups.forEach(function (g) {
          g.buttons.forEach(function (label) {
            var b = document.createElement('button');
            b.type = 'button';
            b.className = 'ww-backstage-item';
            b.dataset.label = label;
            b.innerHTML = '<span class="ww-btn-icon">' + iconFor(label) + '</span><span>' + escapeHtml(label) + '</span>';
            b.addEventListener('click', function () { handleButtonClick(g.group, label, b); });
            groupsEl.appendChild(b);
          });
        });
        return;
      }

      groups.forEach(function (g) {
        var gEl = document.createElement('div');
        gEl.className = 'ww-group';
        var btnsWrap = document.createElement('div');
        btnsWrap.className = 'ww-group-buttons';
        g.buttons.forEach(function (label) {
          var kind = kindFor(label);
          var b = document.createElement('button');
          b.type = 'button';
          b.className = 'ww-btn ww-btn-' + kind;
          b.dataset.label = label;
          b.title = label;
          if (kind === 'pill') {
            b.innerHTML = '<span class="ww-btn-label">' + escapeHtml(label) + '</span><span class="ww-btn-caret">▾</span>';
          } else if (kind === 'glyph') {
            b.innerHTML = '<span class="ww-btn-glyph ww-glyph-' + norm(label).replace(/\s+/g, '-') + '">' + iconFor(label) + '</span>';
          } else if (kind === 'small') {
            b.innerHTML = '<span class="ww-btn-icon">' + iconFor(label) + '</span>';
          } else {
            b.innerHTML = '<span class="ww-btn-icon">' + iconFor(label) + '</span><span class="ww-btn-label">' + escapeHtml(label) + '</span>';
          }
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

    // ── STEP FLOW ──────────────────────────────────────────────
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
      if (config.onCompleteSubtask) config.onCompleteSubtask(sub);
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

    function prepareRibbonTabStep(step) {
      var tab = step.tab;
      if (tab && RIBBON[tab]) ensureTabAvailable(tab);
      if (tab && RIBBON[tab]) {
        pulseTab(tab);
      } else {
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
            openChoiceDialog(step, step.control, gatherTabButtons(tabName, step.control));
          } else {
            advanceStep();
          }
        } else {
          highlightExpectedButton(step);
        }
      } else {
        renderTab(tabName);
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

    function prepareRibbonButtonStep(step) {
      if (step.tab && RIBBON[step.tab] && !fuzzyMatch(STATE.activeTab, step.tab)) {
        ensureTabAvailable(step.tab);
        pulseTab(step.tab);
        return;
      }
      highlightExpectedButton(step);
    }

    function highlightExpectedButton(step) {
      if (!step.control) { advanceStep(); return; }
      var groupsEl = document.getElementById('wwGroups');
      var found = false;
      Array.prototype.forEach.call(groupsEl.querySelectorAll('.ww-btn'), function (btn) {
        if (fuzzyMatch(btn.dataset.label || btn.textContent, step.control)) found = true;
      });
      if (!found) {
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

    // ── DIALOG ─────────────────────────────────────────────────
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
      cb.checked = !wantsChecked;
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
      [label].concat(distractors.slice(0, 2)).forEach(function (opt) {
        var b = makeFooterBtn(opt, opt === label, function () {
          if (fuzzyMatch(opt, label)) { closeDialogShell(); advanceStep(); }
          else { b.classList.add('ww-wrong-flash'); setTimeout(function () { b.classList.remove('ww-wrong-flash'); }, 350); }
        });
        d.footer.appendChild(b);
      });
    }

    function openManualStep(step) {
      closeDialogShell();
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

    // ── UTIL show/hide ─────────────────────────────────────────
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

    // ── INIT ───────────────────────────────────────────────────
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
          console.error('ribbon-sim-core: load data failed', err);
        });
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }

    return { STATE: STATE, renderLobby: renderLobby, openLesson: openLesson };
  }

  window.RibbonSim = { create: create, norm: norm, fuzzyMatch: fuzzyMatch, escapeHtml: escapeHtml, truncate: truncate };
})();
