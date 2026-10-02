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

  /**
   * So sánh tự nhiên cho nhãn dạng "Chương trình › Cấp độ › Tên minitest"
   * (testName) hoặc tên lớp — nếu phần cuối (sau dấu "›" cuối cùng, hoặc
   * cả chuỗi nếu không có "›") khớp "Bài N. ..." hoặc "Bài N: ..." ở CẢ 2
   * BÊN và cùng tiền tố, so theo SỐ bài thay vì bảng chữ cái (tránh "Bài 1,
   * Bài 10, Bài 11, Bài 2..." sai mạch chương trình — đặc biệt từ khi có bộ
   * "Theo Tên bài" 35 bài/khối). Chấp nhận CẢ dấu chấm lẫn dấu hai chấm sau
   * số thứ tự vì IC3/Spark đặt tên kiểu "Bài 1. ..." còn MOS Word/Excel/
   * PowerPoint đặt tên kiểu "Bài 1: ..." (xem data/ic3/minitests-manifest.json)
   * — thiếu dấu hai chấm sẽ không lộ lỗi khi mỗi khối chỉ có 8 bài (1 chữ
   * số luôn sort đúng dù so chuỗi hay so số), chỉ lộ ra khi có ≥10 bài.
   * Mọi trường hợp khác (lớp học, chủ đề, "Tiết N"...) giữ nguyên so chuỗi
   * mặc định.
   */
  function compareNatural(a, b) {
    const SEP = ' › ';
    const splitAt = (s) => {
      const i = s.lastIndexOf(SEP);
      return i === -1 ? { prefix: '', last: s } : { prefix: s.slice(0, i), last: s.slice(i + SEP.length) };
    };
    const pa = splitAt(a), pb = splitAt(b);
    const ma = pa.last.match(/^Bài (\d+)[.:]/);
    const mb = pb.last.match(/^Bài (\d+)[.:]/);
    if (ma && mb && pa.prefix === pb.prefix) return parseInt(ma[1], 10) - parseInt(mb[1], 10);
    return a.localeCompare(b, 'vi');
  }

  /** Ma trận điểm TB theo [lớp x bài thi] — dùng cho Heatmap. */
  function heatmapMatrix(results, rowField = 'studentClass', colField = 'testName') {
    const rows = [...new Set(results.map((r) => r[rowField]).filter(Boolean))].sort(compareNatural);
    const cols = [...new Set(results.map((r) => r[colField]).filter(Boolean))].sort(compareNatural);
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
    compareNatural, // lộ ra để nơi khác (vd dropdown lọc "Bài thi") dùng chung 1 kiểu sắp xếp
  };
})(window);
