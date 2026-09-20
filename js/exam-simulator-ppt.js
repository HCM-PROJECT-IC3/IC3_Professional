/* ════════════════════════════════════════════════════════════
   js/exam-simulator-ppt.js — controller cho exam-simulator-ppt.html

   Cùng pipeline với 2 trang Word/Excel (xem chú thích ở
   js/exam-simulator-excel.js). `pres` (Presentation, js/ppt-engine/
   slide-model.js) là dữ liệu THUẦN JSON như Word — session.states[TASK.id]
   = { pres: pres } dùng trực tiếp cho autosave lẫn Validator.

   Tương tác THẬT: kéo-thả object bằng chuột (mousedown/mousemove/mouseup)
   để đổi position, click chọn object để bật input X/Y + nút layer
   ordering, double-click để sửa text (contenteditable cho object type
   "text"). KHÔNG có bước "chọn đáp án" nào — mọi thứ đều là thao tác
   trực tiếp trên canvas giống PowerPoint thật.
   ════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var UI = window.ExamEngine.UiChrome;
  var PM = window.PptEngine.SlideModel;
  var TASK = window.PptTasks.sample.task;
  var SESSION_ID = 'exam-ppt-' + TASK.id;
  var DURATION_SECONDS = 15 * 60;

  var session = new window.ExamEngine.ExamRunner.ExamSession({
    tasks: [TASK],
    durationSeconds: DURATION_SECONDS,
    onTick: UI.renderTimer,
    onTimeUp: function () { doSubmit(true); },
    onStateChange: function () { scheduleAutosave(); }
  });
  var scheduleAutosave = UI.createAutosaveScheduler(SESSION_ID, session, { demo: true });

  var pres = null; // tham chiếu trực tiếp tới session.states[TASK.id].pres
  var selectedObjectId = null;
  var tickTimer = null;
  var drag = null; // { objectId, startX, startY, origX, origY }

  function commitEngineState() { session.setTaskState(TASK.id, { pres: pres }); }

  function init() {
    window.MosExamAutosave.restore(SESSION_ID).then(function (saved) {
      if (saved && saved.snapshot && !saved.snapshot.submitted) {
        session.restoreSnapshot(saved.snapshot);
      }
      pres = session.getTaskState(TASK.id).pres;
      UI.renderInstruction(session, TASK.id);
      UI.renderHints(TASK.hints);
      renderCanvas();
      renderInspector();
      renderObjectList();
      tickTimer = UI.startTicking(session);
      bindEvents();
      if (saved && saved.snapshot && saved.snapshot.submitted) UI.showResult(saved.snapshot.result);
    });
  }

  function currentSlide() { return pres.slides[pres.activeSlideIndex]; }

  // ────────────────────────────────────────────────────────────
  // RENDER
  // ────────────────────────────────────────────────────────────
  function renderCanvas() {
    var canvas = document.getElementById('expCanvas');
    var slide = currentSlide();
    canvas.innerHTML = '';
    slide.objects.slice().sort(function (a, b) { return a.zIndex - b.zIndex; }).forEach(function (obj) {
      var el = document.createElement('div');
      el.className = 'exp-object' + (obj.id === selectedObjectId ? ' exp-selected' : '');
      el.dataset.id = obj.id;
      el.dataset.type = obj.type;
      el.style.left = obj.position.x + 'px';
      el.style.top = obj.position.y + 'px';
      el.style.width = obj.size.width + 'px';
      el.style.height = obj.size.height + 'px';
      el.style.zIndex = obj.zIndex;
      el.style.transform = obj.rotation ? 'rotate(' + obj.rotation + 'deg)' : '';
      if (obj.type === 'shape') el.style.background = (obj.style && obj.style.fillColor) || '#4472C4';
      if (obj.type === 'text') {
        el.contentEditable = 'true';
        el.textContent = obj.text || '';
      } else {
        el.textContent = obj.type === 'shape' ? (obj.shapeType || 'shape') : (obj.type + (obj.text ? ': ' + obj.text : ''));
      }
      canvas.appendChild(el);
    });
    bindObjectEvents(canvas);
    renderObjectList();
  }

  function renderObjectList() {
    var list = document.getElementById('expObjectList');
    var slide = currentSlide();
    list.innerHTML = slide.objects.map(function (obj) {
      return '<button type="button" data-id="' + obj.id + '" class="' + (obj.id === selectedObjectId ? 'exp-active' : '') + '">' +
        UI.escapeHtml(obj.type + ': ' + (obj.text || obj.shapeType || obj.id)) + '</button>';
    }).join('');
    list.querySelectorAll('button').forEach(function (btn) {
      btn.addEventListener('click', function () {
        selectedObjectId = btn.dataset.id;
        updateSelectionHighlightOnly();
      });
    });
  }

  function renderInspector() {
    var obj = selectedObjectId ? PM.getObject(currentSlide(), selectedObjectId) : null;
    document.getElementById('expPosX').value = obj ? obj.position.x : '';
    document.getElementById('expPosY').value = obj ? obj.position.y : '';
    ['expPosX', 'expPosY', 'expBringFront', 'expBringForward', 'expSendBackward', 'expSendBack'].forEach(function (id) {
      document.getElementById(id).disabled = !obj;
    });
  }

  // ────────────────────────────────────────────────────────────
  // EVENTS — chọn / kéo-thả / sửa text trên canvas
  // ────────────────────────────────────────────────────────────
  function bindObjectEvents(canvas) {
    canvas.querySelectorAll('.exp-object').forEach(function (el) {
      el.addEventListener('mousedown', function (e) {
        var wasAlreadySelected = selectedObjectId === el.dataset.id;
        selectedObjectId = el.dataset.id;
        var obj = PM.getObject(currentSlide(), selectedObjectId);
        // Với text box CHƯA được chọn từ trước, lần mousedown này CHỈ để
        // chọn — không cho phép kéo. Nếu vẫn arm drag ngay từ click đầu
        // tiên (ngưỡng 4px), 1 cú click hơi rung tay (chuột cảm ứng/
        // trackpad) khi học viên chỉ định bấm vào để SỬA CHỮ sẽ vô tình
        // nhích object đi vài pixel — task chấm theo position.x CHÍNH
        // XÁC (vd ppt-tasks-sample.js) sẽ rớt điểm dù học viên không hề
        // cố ý di chuyển. Học viên vẫn kéo được bình thường: click 1 lần
        // để chọn, rồi nhấn-giữ-kéo ở lần tương tác kế tiếp.
        if (el.dataset.type !== 'text' || wasAlreadySelected) {
          drag = { objectId: selectedObjectId, startX: e.clientX, startY: e.clientY, origX: obj.position.x, origY: obj.position.y, moved: false };
        } else {
          drag = null;
        }
        // CHỈ chặn hành vi mặc định (có thể khởi động chọn-text-kéo-chuột
        // của trình duyệt) cho object KHÔNG PHẢI text — text box cần giữ
        // nguyên hành vi focus/đặt con trỏ mặc định của contenteditable,
        // nếu không học viên sẽ KHÔNG BAO GIỜ click vào để sửa nội dung
        // được (preventDefault chặn luôn cả việc focus).
        if (el.dataset.type !== 'text') e.preventDefault();
        // Không gọi renderCanvas() ở đây — nếu object đang click là text
        // box, render lại ngay sẽ HUỶ luôn focus/caret vừa được trình
        // duyệt đặt vào, khiến việc gõ chữ ngay sau khi click không hoạt
        // động. Chỉ cập nhật viền chọn + panel X/Y tại chỗ.
        updateSelectionHighlightOnly();
      });
      if (el.dataset.type === 'text') {
        el.addEventListener('input', function () {
          PM.setText(currentSlide(), el.dataset.id, el.textContent);
          commitEngineState();
        });
      }
    });
  }

  function updateSelectionHighlightOnly() {
    document.querySelectorAll('.exp-object').forEach(function (el) {
      el.classList.toggle('exp-selected', el.dataset.id === selectedObjectId);
    });
    document.querySelectorAll('#expObjectList button').forEach(function (btn) {
      btn.classList.toggle('exp-active', btn.dataset.id === selectedObjectId);
    });
    renderInspector();
  }

  function bindEvents() {
    document.addEventListener('mousemove', function (e) {
      if (!drag) return;
      var dx = e.clientX - drag.startX, dy = e.clientY - drag.startY;
      // Ngưỡng di chuyển nhỏ (4px) trước khi coi là "đang kéo" — nếu áp
      // dụng ngay từ pixel đầu tiên, một cú CLICK đơn thuần (không kéo)
      // vào text box vẫn bị tính là "đã kéo" (dx/dy = 0 vẫn set lại đúng
      // vị trí cũ nên vô hại thật ra, nhưng giữ ngưỡng để không gọi
      // setPosition/re-render thừa mỗi lần chỉ click chọn).
      if (!drag.moved && Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
      drag.moved = true;
      PM.setPosition(currentSlide(), drag.objectId, drag.origX + dx, drag.origY + dy);
      var el = document.querySelector('.exp-object[data-id="' + drag.objectId + '"]');
      if (el) {
        var obj = PM.getObject(currentSlide(), drag.objectId);
        el.style.left = obj.position.x + 'px';
        el.style.top = obj.position.y + 'px';
      }
    });
    document.addEventListener('mouseup', function () {
      if (!drag) return;
      if (drag.moved) { commitEngineState(); renderInspector(); }
      drag = null;
    });

    document.getElementById('expPosX').addEventListener('change', function (e) {
      if (!selectedObjectId) return;
      var obj = PM.getObject(currentSlide(), selectedObjectId);
      PM.setPosition(currentSlide(), selectedObjectId, parseFloat(e.target.value) || 0, obj.position.y);
      commitEngineState();
      renderCanvas();
    });
    document.getElementById('expPosY').addEventListener('change', function (e) {
      if (!selectedObjectId) return;
      var obj = PM.getObject(currentSlide(), selectedObjectId);
      PM.setPosition(currentSlide(), selectedObjectId, obj.position.x, parseFloat(e.target.value) || 0);
      commitEngineState();
      renderCanvas();
    });
    document.getElementById('expBringFront').addEventListener('click', function () { applyLayerCmd(PM.bringToFront); });
    document.getElementById('expBringForward').addEventListener('click', function () { applyLayerCmd(PM.bringForward); });
    document.getElementById('expSendBackward').addEventListener('click', function () { applyLayerCmd(PM.sendBackward); });
    document.getElementById('expSendBack').addEventListener('click', function () { applyLayerCmd(PM.sendToBack); });

    UI.bindCommonButtons(function () { doSubmit(false); });
  }

  function applyLayerCmd(fn) {
    if (!selectedObjectId) return;
    fn(currentSlide(), selectedObjectId);
    commitEngineState();
    renderCanvas();
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

  window.__eppDebug = { getPres: function () { return pres; }, session: session };
  init();
})();
