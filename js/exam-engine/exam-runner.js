/* ════════════════════════════════════════════════════════════
   js/exam-engine/exam-runner.js — MOS Exam Simulator

   Điều phối 1 PHIÊN THI (nhiều task, có thể trộn Word/Excel/PowerPoint):
   - Task navigation (next/prev/goto).
   - Flag task để xem lại.
   - Timer đếm ngược, tự nộp bài khi hết giờ.
   - Trong Exam Mode: ẨN đáp án/validator/expected state/hint — runner
     CHỦ ĐỘNG không lộ requirements/initialState "đúng" ra ngoài API
     công khai (getPublicTask), chỉ trả instruction + state hiện tại.
   - Nộp bài: thu thập application state của TỪNG task rồi gọi
     ExamEngine.Validator.validateExam() 1 LẦN DUY NHẤT lúc Submit (đúng
     tinh thần "ẩn validator" trong suốt quá trình làm bài).

   KHÔNG tự làm autosave persistence (đó là autosave-service.js) — runner
   chỉ phát sự kiện onStateChange(taskId, state) để lớp gọi nó (UI) quyết
   định có lưu hay không.
   ════════════════════════════════════════════════════════════ */
(function (root, factory) {
  var Validator = typeof module === 'object' && module.exports
    ? require('./validation-engine.js')
    : (root && root.ExamEngine && root.ExamEngine.Validator);
  var TaskSchema = typeof module === 'object' && module.exports
    ? require('./task-schema.js')
    : (root && root.ExamEngine && root.ExamEngine.TaskSchema);
  var mod = factory(Validator, TaskSchema);
  if (typeof module === 'object' && module.exports) module.exports = mod;
  if (root) {
    root.ExamEngine = root.ExamEngine || {};
    root.ExamEngine.ExamRunner = mod;
  }
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : null), function (Validator, TaskSchema) {
  'use strict';

  /**
   * @param {Object} opts
   * @param {Array} opts.tasks           danh sách task (đã defineTask())
   * @param {number} opts.durationSeconds thời lượng thi (giây), 0 = không giới hạn
   * @param {Function} [opts.onTick]      (secondsRemaining) -> void, gọi mỗi giây qua tick()
   * @param {Function} [opts.onTimeUp]    () -> void, gọi đúng 1 lần khi hết giờ
   * @param {Function} [opts.onStateChange] (taskId, state) -> void, gọi mỗi khi setTaskState
   */
  function ExamSession(opts) {
    if (!opts || !Array.isArray(opts.tasks) || !opts.tasks.length) {
      throw new Error('ExamSession requires a non-empty tasks array');
    }
    this.tasks = opts.tasks;
    this.durationSeconds = opts.durationSeconds || 0;
    this.secondsRemaining = this.durationSeconds;
    this.onTick = opts.onTick || function () {};
    this.onTimeUp = opts.onTimeUp || function () {};
    this.onStateChange = opts.onStateChange || function () {};

    this.currentIndex = 0;
    this.flags = {}; // taskId -> boolean
    this.states = {}; // taskId -> application state hiện tại của học viên
    this.initialSnapshots = {}; // taskId -> bản chụp state lúc khởi tạo, dùng để so sánh "đã đụng tới chưa"
    this.startedAt = Date.now();
    this.submitted = false;
    this.result = null;

    var self = this;
    this.tasks.forEach(function (t) {
      var initial = TaskSchema.instantiateInitialState(t);
      self.states[t.id] = initial;
      // Chụp lại state khởi tạo NGAY LÚC NÀY — không gọi lại
      // instantiateInitialState() sau này để so sánh, vì mỗi lần gọi tạo
      // ra id nội bộ (paragraph id, object id, ...) MỚI qua bộ đếm uid
      // toàn cục, khiến 2 bản "giống hệt nội dung" vẫn lệch nhau khi
      // JSON.stringify — làm getNavigationState() báo "đã làm" sai cho
      // mọi task chưa ai đụng tới.
      self.initialSnapshots[t.id] = JSON.stringify(initial);
    });
  }

  // ── Navigation ──
  ExamSession.prototype.currentTask = function () { return this.tasks[this.currentIndex]; };
  ExamSession.prototype.goTo = function (index) {
    if (index < 0 || index >= this.tasks.length) throw new Error('Task index out of range: ' + index);
    this.currentIndex = index;
  };
  ExamSession.prototype.next = function () { if (this.currentIndex < this.tasks.length - 1) this.currentIndex++; };
  ExamSession.prototype.prev = function () { if (this.currentIndex > 0) this.currentIndex--; };

  // ── Flag ──
  ExamSession.prototype.toggleFlag = function (taskId) { this.flags[taskId] = !this.flags[taskId]; };
  ExamSession.prototype.isFlagged = function (taskId) { return !!this.flags[taskId]; };
  ExamSession.prototype.flaggedTaskIds = function () {
    var self = this;
    return Object.keys(this.flags).filter(function (id) { return self.flags[id]; });
  };

  // ── State ──
  ExamSession.prototype.getTaskState = function (taskId) { return this.states[taskId]; };
  ExamSession.prototype.setTaskState = function (taskId, state) {
    this.states[taskId] = state;
    this.onStateChange(taskId, state);
  };

  /**
   * Hình dạng CÔNG KHAI của 1 task trong lúc thi — KHÔNG lộ requirements
   * (đáp án/validator) hay hints (theo yêu cầu "Ẩn đáp án / Ẩn validator /
   * Không cho xem hint" của Exam Mode). Chỉ dùng getPublicTask() để hiển
   * thị UI, không bao giờ truyền thẳng `task` gốc cho màn hình làm bài.
   */
  ExamSession.prototype.getPublicTask = function (taskId) {
    var task = this.tasks.filter(function (t) { return t.id === taskId; })[0];
    if (!task) return null;
    return {
      id: task.id,
      application: task.application,
      instruction: task.instruction,
      points: task.points,
      skill: task.skill,
      topic: task.topic,
      difficulty: task.difficulty
    };
  };

  // ── Timer ──
  /** Gọi mỗi giây bởi setInterval ở tầng UI — runner không tự tạo timer thật để dễ test. */
  ExamSession.prototype.tick = function () {
    if (this.submitted || this.durationSeconds <= 0) return;
    this.secondsRemaining = Math.max(0, this.secondsRemaining - 1);
    this.onTick(this.secondsRemaining);
    if (this.secondsRemaining === 0 && !this.submitted) {
      this.onTimeUp();
      this.submit();
    }
  };

  // ── Submit ──
  /** Chấm TOÀN BỘ bài thi — chỉ gọi Validator ở đây, KHÔNG lộ ra giữa chừng lúc đang làm bài. */
  ExamSession.prototype.submit = function () {
    if (this.submitted) return this.result;
    this.submitted = true;
    // task.prepareForValidation(state) — hook TÙY CHỌN để 1 task tự
    // chuyển state đang lưu (luôn phải JSON-serializable để autosave qua
    // IndexedDB được) sang hình dạng mà requirement.check() cần đọc. VD
    // Excel lưu { workbookSnapshot } suốt lúc làm bài (an toàn cho
    // autosave) nhưng requirement.check() cần { engine: SpreadsheetEngine
    // SỐNG } — trước đây bước "hydrate" này do CHÍNH controller UI tự
    // gọi thủ công ngay trước khi Submit, chỉ được đảm bảo bởi COMMENT
    // chứ không phải cấu trúc; nếu submit() được gọi từ 1 nơi khác quên
    // hydrate trước, mọi requirement của task đó âm thầm rớt về 0 điểm
    // (validation-engine nuốt lỗi trong check()). Đưa bước này vào ĐÚNG 1
    // chỗ (submit(), không phải từng controller) để không thể quên.
    var self = this;
    var statesForValidation = {};
    this.tasks.forEach(function (t) {
      var state = self.states[t.id];
      statesForValidation[t.id] = typeof t.prepareForValidation === 'function' ? t.prepareForValidation(state) : state;
    });
    this.result = Validator.validateExam(this.tasks, statesForValidation);
    this.result.durationUsedSeconds = Math.round((Date.now() - this.startedAt) / 1000);
    this.result.flaggedTaskIds = this.flaggedTaskIds();
    return this.result;
  };

  /** Trạng thái điều hướng dùng để vẽ sidebar (đã làm/gắn cờ/chưa làm) — không lộ điểm. */
  ExamSession.prototype.getNavigationState = function () {
    var self = this;
    return this.tasks.map(function (t, i) {
      return {
        index: i,
        taskId: t.id,
        application: t.application,
        current: i === self.currentIndex,
        flagged: !!self.flags[t.id],
        touched: JSON.stringify(self.states[t.id]) !== self.initialSnapshots[t.id]
      };
    });
  };

  /** Snapshot toàn phiên thi — dùng bởi autosave-service để lưu/khôi phục. */
  ExamSession.prototype.toSnapshot = function () {
    return {
      currentIndex: this.currentIndex,
      flags: this.flags,
      states: this.states,
      secondsRemaining: this.secondsRemaining,
      startedAt: this.startedAt,
      submitted: this.submitted,
      result: this.result
    };
  };
  ExamSession.prototype.restoreSnapshot = function (snap) {
    if (!snap) return;
    this.currentIndex = snap.currentIndex || 0;
    this.flags = snap.flags || {};
    // GHÉP theo từng task thay vì thay thế nguyên cụm this.states — nếu
    // snapshot cũ/lệch bộ task thiếu 1 task nào đó, thay thế thẳng
    // this.states = snap.states sẽ làm getTaskState(task đó) trả về
    // undefined thay vì initial state đã dựng sẵn lúc constructor, khiến
    // getNavigationState() báo nhầm "đã làm" cho 1 task học viên chưa hề
    // mở tới.
    if (snap.states) {
      for (var i = 0; i < this.tasks.length; i++) {
        var taskId = this.tasks[i].id;
        if (Object.prototype.hasOwnProperty.call(snap.states, taskId)) {
          this.states[taskId] = snap.states[taskId];
        }
      }
    }
    this.secondsRemaining = snap.secondsRemaining != null ? snap.secondsRemaining : this.secondsRemaining;
    this.startedAt = snap.startedAt || this.startedAt;
    this.submitted = !!snap.submitted;
    this.result = snap.result || null;
  };

  return { ExamSession: ExamSession };
});
