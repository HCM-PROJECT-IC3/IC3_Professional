/* ============================================================
   js/services/analytics-service.js
   Tầng Service — các hàm THUẦN (pure function, không gọi Firestore
   trực tiếp) để tính toán số liệu dùng chung cho Coordinator Dashboard,
   Teacher Dashboard, và Excel/PDF export. Nhận dữ liệu ĐÃ tải sẵn từ
   repository, trả về số liệu — dễ unit test, dễ tái sử dụng.

   Nạp SAU models/*.js (dùng EduModels.ExamHistory, LearningProgress).
   ============================================================ */
(function (global) {
  'use strict';

  /** Điểm trung bình (bỏ qua giá trị không phải number). */
  function avgScore(results) {
    const scores = results.map((r) => r.score).filter((s) => typeof s === 'number');
    return scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null;
  }

  /** Thời gian làm bài trung bình (giây). */
  function avgTime(results) {
    const times = results.map((r) => r.elapsedSec).filter((t) => typeof t === 'number' && t > 0);
    return times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : null;
  }

  /** Tỉ lệ đạt (%) theo ngưỡng điểm. */
  function passRate(results, threshold = 70) {
    const scores = results.map((r) => r.score).filter((s) => typeof s === 'number');
    if (!scores.length) return null;
    const passed = scores.filter((s) => s >= threshold).length;
    return Math.round((passed / scores.length) * 100);
  }

  /** Tỉ lệ hoàn thành = số học sinh đã có ít nhất 1 lượt nộp / tổng số học sinh trong roster. */
  function completionRate(examHistories, totalStudentsInRoster) {
    if (!totalStudentsInRoster) return null;
    return Math.round((examHistories.length / totalStudentsInRoster) * 100);
  }

  /** Top N học sinh theo điểm trung bình (dùng cho "Học sinh xuất sắc"). */
  function topStudents(examHistories, topN = 10) {
    return [...examHistories]
      .filter((e) => typeof e.avgScore === 'number')
      .sort((a, b) => b.avgScore - a.avgScore)
      .slice(0, topN);
  }

  /** Học sinh cần hỗ trợ = điểm TB dưới ngưỡng, sắp xếp yếu nhất trước. */
  function studentsNeedingSupport(examHistories, threshold = 60) {
    return [...examHistories]
      .filter((e) => typeof e.avgScore === 'number' && e.avgScore < threshold)
      .sort((a, b) => a.avgScore - b.avgScore);
  }

  /** Phân bố điểm theo khoảng (dùng cho biểu đồ cột "Phân bố điểm"). */
  function scoreDistribution(results, bucketSize = 10) {
    const buckets = {};
    for (let i = 0; i < 100; i += bucketSize) buckets[`${i}-${i + bucketSize - 1}`] = 0;
    results.forEach((r) => {
      if (typeof r.score !== 'number') return;
      const idx = Math.min(Math.floor(r.score / bucketSize), Math.floor(99 / bucketSize));
      const key = `${idx * bucketSize}-${idx * bucketSize + bucketSize - 1}`;
      buckets[key] = (buckets[key] || 0) + 1;
    });
    return buckets;
  }

  /** Điểm trung bình nhóm theo 1 field bất kỳ (studentClass, testName...) — dùng cho Bar/Radar chart. */
  function groupAvgBy(results, field) {
    const groups = {};
    results.forEach((r) => {
      const key = r[field] || '—';
      (groups[key] = groups[key] || []).push(r);
    });
    const out = {};
    Object.keys(groups).forEach((key) => { out[key] = avgScore(groups[key]); });
    return out;
  }

  /** Ma trận điểm TB theo [lớp x bài thi] — dùng cho Heatmap. */
  function heatmapMatrix(results, rowField = 'studentClass', colField = 'testName') {
    const rows = [...new Set(results.map((r) => r[rowField]).filter(Boolean))].sort();
    const cols = [...new Set(results.map((r) => r[colField]).filter(Boolean))].sort();
    const matrix = rows.map((row) => cols.map((col) => {
      const subset = results.filter((r) => r[rowField] === row && r[colField] === col);
      return avgScore(subset);
    }));
    return { rows, cols, matrix };
  }

  /** Xu hướng điểm TB theo ngày (dùng cho Line chart) — trả về mảng {date, avg} sắp theo thời gian tăng dần. */
  function trendByDay(results) {
    const byDay = {};
    results.forEach((r) => {
      if (!r.submittedAtMs) return;
      const day = new Date(r.submittedAtMs).toISOString().slice(0, 10);
      (byDay[day] = byDay[day] || []).push(r);
    });
    return Object.keys(byDay).sort().map((day) => ({ date: day, avg: avgScore(byDay[day]), count: byDay[day].length }));
  }

  global.EduAnalytics = {
    avgScore, avgTime, passRate, completionRate,
    topStudents, studentsNeedingSupport,
    scoreDistribution, groupAvgBy, heatmapMatrix, trendByDay,
  };
})(window);
