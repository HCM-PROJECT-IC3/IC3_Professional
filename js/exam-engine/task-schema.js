/* ════════════════════════════════════════════════════════════
   js/exam-engine/task-schema.js — MOS Exam Simulator

   Chuẩn hoá 1 task theo đúng khung bắt buộc:
     { id, application, instruction, initialState, requirements,
       points, hints, skill, difficulty, topic }

   defineTask() KHÔNG tự tính điểm từng requirement (đó là việc của
   người viết task) — nó chỉ:
     - Áp giá trị mặc định (points=1/requirement nếu không khai báo).
     - Tính points tổng (nếu không truyền sẵn) = tổng points requirements.
     - Validate cấu trúc tối thiểu ngay lúc định nghĩa (fail sớm khi
       giáo viên/dev viết task sai hình dạng, thay vì lỗi ngầm lúc chấm).
   ════════════════════════════════════════════════════════════ */
(function (root, factory) {
  var mod = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = mod;
  }
  if (root) {
    root.ExamEngine = root.ExamEngine || {};
    root.ExamEngine.defineTask = mod.defineTask;
    root.ExamEngine.TaskSchema = mod;
  }
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : null), function () {
  'use strict';

  var VALID_APPS = ['word', 'excel', 'powerpoint'];

  function defineTask(def) {
    if (!def || typeof def !== 'object') throw new Error('Task definition must be an object');
    if (!def.id) throw new Error('Task requires an id');
    if (VALID_APPS.indexOf(def.application) === -1) {
      throw new Error('Task "' + def.id + '" has invalid application: ' + def.application);
    }
    if (!def.instruction) throw new Error('Task "' + def.id + '" requires an instruction');
    if (!Array.isArray(def.requirements) || def.requirements.length === 0) {
      throw new Error('Task "' + def.id + '" requires a non-empty requirements array');
    }

    var requirements = def.requirements.map(function (r, i) {
      if (!r.id) throw new Error('Task "' + def.id + '" requirement #' + i + ' needs an id');
      if (typeof r.check !== 'function') throw new Error('Task "' + def.id + '" requirement "' + r.id + '" needs a check() function');
      return Object.assign({ points: 1, label: r.id }, r);
    });

    var points = def.points != null ? def.points : requirements.reduce(function (s, r) { return s + r.points; }, 0);

    return {
      id: def.id,
      application: def.application,
      instruction: def.instruction,
      // initialState: hàm hoặc object — dùng hàm khi mỗi lần mở task cần 1
      // bản sao độc lập (tránh học viên A sửa state ảnh hưởng học viên B
      // khi chạy trong cùng 1 tiến trình test/demo).
      initialState: def.initialState,
      requirements: requirements,
      points: points,
      hints: def.hints || [],
      skill: def.skill || null,
      topic: def.topic || null,
      difficulty: def.difficulty || 'medium',
      // prepareForValidation(state) — TÙY CHỌN: chuyển state đang lưu
      // (luôn phải JSON-serializable để autosave được) sang hình dạng mà
      // requirement.check() cần đọc, vd Excel cần "hydrate" lại thành 1
      // SpreadsheetEngine sống từ workbookSnapshot thuần JSON. Chỉ
      // ExamSession.submit() gọi hàm này (xem exam-runner.js) — không
      // controller nào được tự hydrate/serialize thủ công nữa.
      prepareForValidation: typeof def.prepareForValidation === 'function' ? def.prepareForValidation : null
    };
  }

  /** Trả về bản sao sâu của initialState — dùng khi bắt đầu 1 lượt làm task. */
  function instantiateInitialState(task) {
    var init = task.initialState;
    var raw = typeof init === 'function' ? init() : init;
    return JSON.parse(JSON.stringify(raw || {}));
  }

  return {
    defineTask: defineTask,
    instantiateInitialState: instantiateInitialState,
    VALID_APPS: VALID_APPS
  };
});
