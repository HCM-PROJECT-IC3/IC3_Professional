/* ════════════════════════════════════════════════════════════
   js/exam-engine/validation-engine.js — MOS Exam Simulator

   Bộ máy chấm điểm DÙNG CHUNG cho cả 3 môn (Word/Excel/PowerPoint).
   Nguyên tắc cốt lõi: KHÔNG kiểm tra chuỗi hành động (click đúng thứ tự
   ribbon) — chỉ kiểm tra APPLICATION STATE cuối cùng so với danh sách
   `requirements` mà mỗi task khai báo. Xem js/exam-engine/task-schema.js
   cho hình dạng chuẩn của 1 task, và js/word-engine|excel-engine|
   ppt-engine/*-tasks*.js cho ví dụ requirements cụ thể từng môn.

   requirement = {
     id, label, points,
     check(state, task) -> boolean   // state = application state hiện tại
   }

   Chạy được cả trong Node (unit test bằng `node`, xem
   js/exam-engine/__tests__/) lẫn trong trình duyệt (gắn vào
   window.ExamEngine).
   ════════════════════════════════════════════════════════════ */
(function (root, factory) {
  var mod = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = mod;
  }
  if (root) {
    root.ExamEngine = root.ExamEngine || {};
    root.ExamEngine.Validator = mod;
  }
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : null), function () {
  'use strict';

  /**
   * Chấm 1 requirement đơn lẻ — không bao giờ ném lỗi ra ngoài: nếu hàm
   * check() của task tự nó lỗi (ví dụ truy cập field không tồn tại vì học
   * viên chưa thao tác gì), coi như "chưa đạt" thay vì làm sập cả bài thi.
   */
  function checkRequirement(req, state, task) {
    var passed = false;
    var error = null;
    try {
      passed = !!req.check(state, task);
    } catch (e) {
      passed = false;
      error = e && e.message ? e.message : String(e);
    }
    var points = Number(req.points) || 0;
    return {
      requirement: req.label || req.id,
      id: req.id,
      passed: passed,
      points: passed ? points : 0,
      maxPoints: points,
      error: error
    };
  }

  /**
   * Chấm 1 task: trả về đúng hình dạng theo yêu cầu —
   * { completed, score, maxScore, details }
   */
  function validateTask(task, state) {
    if (!task || !Array.isArray(task.requirements)) {
      return { completed: false, score: 0, maxScore: 0, details: [] };
    }
    var details = task.requirements.map(function (req) {
      return checkRequirement(req, state, task);
    });
    var score = details.reduce(function (s, d) { return s + d.points; }, 0);
    var maxScore = details.reduce(function (s, d) { return s + d.maxPoints; }, 0);
    return {
      completed: maxScore > 0 && score === maxScore,
      score: score,
      maxScore: maxScore,
      details: details
    };
  }

  /**
   * Chấm cả bài thi (nhiều task, có thể khác môn nhau) — states là map
   * { [taskId]: applicationState } do exam-runner thu thập lúc Nộp bài.
   */
  function validateExam(tasks, states) {
    states = states || {};
    var taskResults = (tasks || []).map(function (task) {
      var result = validateTask(task, states[task.id]);
      return Object.assign({
        taskId: task.id,
        application: task.application,
        skill: task.skill,
        topic: task.topic,
        difficulty: task.difficulty
      }, result);
    });
    var score = taskResults.reduce(function (s, r) { return s + r.score; }, 0);
    var maxScore = taskResults.reduce(function (s, r) { return s + r.maxScore; }, 0);
    var percent = maxScore > 0 ? Math.round((score / maxScore) * 1000) / 10 : 0;
    return {
      score: score,
      maxScore: maxScore,
      percent: percent,
      passed: percent >= (75), // ngưỡng đạt mặc định của MOS/GMetrix — có thể override ở nơi gọi
      tasks: taskResults,
      skillReport: buildSkillReport(taskResults)
    };
  }

  /**
   * Gộp kết quả theo Application/Skill/Topic/Difficulty để tạo báo cáo
   * năng lực (yêu cầu "Skill Mapping" trong goal).
   */
  function buildSkillReport(taskResults) {
    var byApp = {};
    var bySkill = {};
    var byDifficulty = {};
    taskResults.forEach(function (r) {
      accumulate(byApp, r.application || 'unknown', r);
      accumulate(bySkill, r.skill || 'unknown', r);
      accumulate(byDifficulty, r.difficulty || 'unknown', r);
    });
    return { byApplication: byApp, bySkill: bySkill, byDifficulty: byDifficulty };
  }

  function accumulate(bucket, key, r) {
    if (!bucket[key]) bucket[key] = { score: 0, maxScore: 0, taskCount: 0, completedCount: 0 };
    bucket[key].score += r.score;
    bucket[key].maxScore += r.maxScore;
    bucket[key].taskCount += 1;
    if (r.completed) bucket[key].completedCount += 1;
  }

  return {
    checkRequirement: checkRequirement,
    validateTask: validateTask,
    validateExam: validateExam,
    buildSkillReport: buildSkillReport
  };
});
