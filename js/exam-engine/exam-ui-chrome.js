/* ════════════════════════════════════════════════════════════
   js/exam-engine/exam-ui-chrome.js — MOS Exam Simulator

   "Khung UI" DÙNG CHUNG cho cả 3 trang exam-simulator-{word,excel,ppt}.js
   — trước đây mỗi trang tự viết lại y hệt: escapeHtml(), vẽ+chạy đồng hồ
   đếm ngược, debounce autosave, hiện overlay kết quả, và gắn nút
   Submit/Đóng/Hint. Tách ra đây 1 lần vì cả 3 trang dùng CHUNG bộ id DOM
   (#exsTimer, #exsResultScore, #exsResultDetails, #exsResultOverlay,
   #exsSubmitBtn, #exsResultCloseBtn, #exsHintBtn/#exsHintList/#exsHintBox,
   #exsInstruction, #exsPoints) — xem css/exam-simulator.css.

   Mỗi trang chỉ còn giữ lại phần THỰC SỰ khác nhau: cách vẽ vùng làm bài
   (lưới Excel / trang giấy Word / canvas PowerPoint) và cách gom
   Application State hiện tại để nộp bài.
   ════════════════════════════════════════════════════════════ */
(function (root, factory) {
  var mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  if (root) {
    root.ExamEngine = root.ExamEngine || {};
    root.ExamEngine.UiChrome = mod;
  }
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : null), function () {
  'use strict';

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /**
   * Debounce autosave — trả về 1 hàm schedule() gọi lại thì reset lại
   * hẹn giờ (giống mọi debounce chuẩn), sau `debounceMs` sẽ gọi
   * MosExamAutosave.autosave(sessionId, studentInfo, session.toSnapshot()).
   */
  function createAutosaveScheduler(sessionId, session, studentInfo, debounceMs) {
    var timer = null;
    return function schedule() {
      clearTimeout(timer);
      timer = setTimeout(function () {
        window.MosExamAutosave.autosave(sessionId, studentInfo, session.toSnapshot());
      }, debounceMs || 1500);
    };
  }

  function renderTimer(seconds) {
    var el = document.getElementById('exsTimer');
    if (!el) return;
    var m = Math.floor(seconds / 60), s = seconds % 60;
    el.textContent = '⏱ ' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    el.classList.toggle('exs-timer-low', seconds <= 60);
  }

  /**
   * Bắt đầu vòng lặp setInterval gọi session.tick() mỗi giây, tự dừng khi
   * đã nộp bài. Trả về id interval (để caller clearInterval khi Nộp bài
   * thủ công trước khi hết giờ).
   */
  function startTicking(session) {
    renderTimer(session.secondsRemaining);
    var timerId = setInterval(function () {
      if (session.submitted) { clearInterval(timerId); return; }
      session.tick();
    }, 1000);
    return timerId;
  }

  function renderInstruction(session, taskId) {
    var pub = session.getPublicTask(taskId);
    document.getElementById('exsInstruction').textContent = pub.instruction;
    document.getElementById('exsPoints').textContent = 'Điểm tối đa: ' + pub.points;
    return pub;
  }

  function renderHints(hints) {
    if (!hints || !hints.length) return;
    var box = document.getElementById('exsHintBox');
    if (!box) return;
    box.hidden = false;
    document.getElementById('exsHintList').innerHTML = hints.map(function (h) { return '<li>' + escapeHtml(h) + '</li>'; }).join('');
  }

  /** Task Result -> overlay kết quả. examResult có thể là kết quả validateExam() (nhiều task) hoặc validateTask() (1 task, dùng .tasks[0] nếu có). */
  function showResult(examResult, isTimeUp) {
    var taskResult = examResult.tasks ? examResult.tasks[0] : examResult;
    document.getElementById('exsResultScore').textContent = taskResult.score + ' / ' + taskResult.maxScore + (isTimeUp ? ' (hết giờ, tự nộp)' : '');
    document.getElementById('exsResultDetails').innerHTML = taskResult.details.map(function (d) {
      return '<li class="' + (d.passed ? 'exs-req-pass' : 'exs-req-fail') + '">' +
        '<span>' + (d.passed ? '✓' : '✗') + ' ' + escapeHtml(d.requirement) + '</span>' +
        '<span>' + d.points + '/' + d.maxPoints + '</span></li>';
    }).join('');
    document.getElementById('exsResultOverlay').hidden = false;
  }

  /** Gắn nút Hint/Submit/Đóng-kết-quả — 3 nút này giống hệt nhau ở cả 3 trang. */
  function bindCommonButtons(onSubmit) {
    var hintBtn = document.getElementById('exsHintBtn');
    if (hintBtn) {
      hintBtn.addEventListener('click', function () {
        document.getElementById('exsHintList').hidden = false;
        this.hidden = true;
      });
    }
    document.getElementById('exsSubmitBtn').addEventListener('click', onSubmit);
    document.getElementById('exsResultCloseBtn').addEventListener('click', function () {
      document.getElementById('exsResultOverlay').hidden = true;
    });
  }

  return {
    escapeHtml: escapeHtml,
    createAutosaveScheduler: createAutosaveScheduler,
    renderTimer: renderTimer,
    startTicking: startTicking,
    renderInstruction: renderInstruction,
    renderHints: renderHints,
    showResult: showResult,
    bindCommonButtons: bindCommonButtons
  };
});
