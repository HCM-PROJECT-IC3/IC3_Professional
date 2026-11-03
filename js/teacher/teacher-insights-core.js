/* ============================================================
   js/teacher/teacher-insights-core.js — LOGIC THUẦN (tầng Domain) cho phần "Tổng quan lớp" của
   teacher-dashboard.html. Không DOM, không mạng, không Firebase → test bằng Node
   (js/teacher/__tests__/teacher-insights-core.test.js). Giao diện: js/teacher/insights.js.

   Mọi phép tính chạy trên dữ liệu ĐÃ CÓ trên máy (bài nộp dashboard đã tải, danh sách đề trong
   localStorage của Soạn đề, bản lưu sổ lớp của trang Điểm danh) → 0 lượt Firebase / Apps Script thêm.

     proficiency(histories)              phân loại năng lực theo điểm TB từng em: Giỏi · Khá · TB · Yếu
     progressGauge(students, histories)  Chưa làm · Chưa đạt · Đạt · Vượt trội (đếm học sinh)
     spotlight(histories, n)             n em cần hỗ trợ nhất / n em xuất sắc nhất
     trendLabel(trends)                  tên → 'up' | 'down' (từ EduAnalytics.progressTrends)
     assignmentProgress(a, results, students, keyOf)  bài đã giao: đã nộp / chưa nộp / nộp muộn theo lớp
     compareRounds(results, a, b)        so sánh 2 đợt kiểm tra theo lớp + số em tiến bộ / sa sút
     attendanceSummary(classes)          chuyên cần theo lớp (từ so-lop-core stats) + em vắng nhiều/vắng liền
   ============================================================ */
(function (global) {
  'use strict';

  const PASS = 70;    // = ngưỡng "Đạt" của EduAnalytics.passRate
  const EXCEL = 90;
  const BANDS = [
    { id: 'gioi', label: 'Giỏi', min: 85 },
    { id: 'kha', label: 'Khá', min: 70 },
    { id: 'tb', label: 'Trung bình', min: 50 },
    { id: 'yeu', label: 'Yếu', min: 0 },
  ];
  const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);
  const mean = (a) => (a.length ? Math.round(a.reduce((s, x) => s + x, 0) / a.length) : null);
  const low = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().toLocaleLowerCase('vi');
  const keyNC = (name, cls) => low(name) + '__' + low(cls);
  const byNatural = (a, b) => String(a).localeCompare(String(b), 'vi', { numeric: true });

  function bandOf(score) {
    if (typeof score !== 'number') return null;
    return BANDS.find((b) => score >= b.min).id;
  }

  /** { total, bands: { gioi, kha, tb, yeu }, pct: { … } } — chỉ em đã có điểm. */
  function proficiency(histories) {
    const bands = { gioi: 0, kha: 0, tb: 0, yeu: 0 };
    let total = 0;
    (histories || []).forEach((h) => { const b = bandOf(h.avgScore); if (b) { bands[b]++; total++; } });
    const p = {};
    Object.keys(bands).forEach((k) => { p[k] = pct(bands[k], total); });
    return { total, bands, pct: p };
  }

  /**
   * Đồng hồ tiến độ: mỗi học sinh trong danh sách lớp xếp 1 nhóm theo điểm TB trong phạm vi lọc.
   * Em có bài nộp nhưng không nằm trong danh sách lớp (vd tự gõ tên) vẫn được tính vào nhóm điểm.
   */
  function progressGauge(students, histories, keyOf) {
    const k = keyOf || ((s) => keyNC(s.name, s.className));
    const byKey = new Map((histories || []).map((h) => [h.studentKey, h]));
    const out = { notStarted: 0, below: 0, pass: 0, excel: 0, total: 0 };
    const seen = new Set();
    (students || []).forEach((s) => {
      const key = k(s);
      if (seen.has(key)) return;
      seen.add(key);
      out.total++;
      const h = byKey.get(key);
      if (!h || typeof h.avgScore !== 'number') out.notStarted++;
      else if (h.avgScore >= EXCEL) out.excel++;
      else if (h.avgScore >= PASS) out.pass++;
      else out.below++;
    });
    (histories || []).forEach((h) => {
      if (seen.has(h.studentKey) || typeof h.avgScore !== 'number') return;
      out.total++;
      if (h.avgScore >= EXCEL) out.excel++; else if (h.avgScore >= PASS) out.pass++; else out.below++;
    });
    out.passPct = pct(out.pass + out.excel, out.total);
    out.donePct = pct(out.total - out.notStarted, out.total);
    return out;
  }

  /** n em điểm TB thấp nhất (< PASS) và n em cao nhất (≥ PASS); bằng điểm → làm nhiều bài hơn đứng trước. */
  function spotlight(histories, n) {
    const has = (histories || []).filter((h) => typeof h.avgScore === 'number');
    const more = (a, b) => (b.attemptsCount || 0) - (a.attemptsCount || 0) || byNatural(a.studentName, b.studentName);
    return {
      bottom: has.filter((h) => h.avgScore < PASS).sort((a, b) => a.avgScore - b.avgScore || more(a, b)).slice(0, n || 3),
      top: has.filter((h) => h.avgScore >= PASS).sort((a, b) => b.avgScore - a.avgScore || more(a, b)).slice(0, n || 3),
    };
  }

  /** Tra nhanh xu hướng: Map 'tên__lớp' → 'up' | 'down'. */
  function trendLabel(trends) {
    const m = new Map();
    ((trends && trends.improving) || []).forEach((t) => m.set(keyNC(t.studentName, t.studentClass), 'up'));
    ((trends && trends.declining) || []).forEach((t) => m.set(keyNC(t.studentName, t.studentClass), 'down'));
    return m;
  }

  // ── Bài đã giao ──
  /** Bài nộp thuộc đề tự soạn `title`: testName "… › <title>" (quiz-engine thêm " (nộp muộn)" khi quá hạn). */
  function matchesTitle(testName, title) {
    const last = low(String(testName || '').split(' › ').pop()).replace(/\s*\(nộp muộn\)$/, '');
    return !!title && last === low(title);
  }
  /**
   * a: { title, classes: [tên lớp], deadline (ms, 0 = không hạn), createdAt (ms) }.
   * Trả { classes: [{ className, roster, submitted, late, missing: [tên], avg }], total: { roster, submitted, pct } }.
   * "Đã nộp" = có ít nhất 1 bài của đề này kể từ lúc giao (lấy bài điểm cao nhất).
   */
  function assignmentProgress(a, results, students, keyOf) {
    const k = keyOf || ((s) => keyNC(s.name, s.className));
    const since = (a.createdAt || 0) - 86400000; // em làm sớm trước lúc bấm "Giao" trong ngày vẫn tính
    const mine = (results || []).filter((r) => matchesTitle(r.testName, a.title) && (r.submittedAtMs || 0) >= since);
    // Mỗi em: điểm cao nhất; "nộp muộn" chỉ khi KHÔNG có bài nào nộp đúng hạn. Cùng khoá với danh sách lớp (keyOf).
    const best = new Map();
    mine.forEach((r) => {
      const key = k({ name: r.studentName, className: r.studentClass });
      const onTime = !a.deadline || (r.submittedAtMs || 0) <= a.deadline;
      const cur = best.get(key) || { score: null, onTime: false, className: r.studentClass || '' };
      if (typeof r.score === 'number' && (cur.score == null || r.score > cur.score)) cur.score = r.score;
      cur.onTime = cur.onTime || onTime;
      best.set(key, cur);
    });
    const wanted = new Set((a.classes || []).map(low));
    const rows = (a.classes || []).slice().sort(byNatural).map((className) => {
      const roster = (students || []).filter((s) => low(s.className) === low(className));
      const done = roster.filter((s) => best.has(k(s)));
      const scores = done.map((s) => best.get(k(s)).score).filter((x) => typeof x === 'number');
      return {
        className, roster: roster.length, submitted: done.length,
        late: done.filter((s) => !best.get(k(s)).onTime).length,
        missing: roster.filter((s) => !best.has(k(s))).map((s) => s.name).sort((x, y) => x.localeCompare(y, 'vi')),
        avg: mean(scores),
      };
    });
    const extra = [...best.values()].filter((v) => !wanted.has(low(v.className))).length; // em lớp khác làm thử
    const roster = rows.reduce((s, r) => s + r.roster, 0), submitted = rows.reduce((s, r) => s + r.submitted, 0);
    return { classes: rows, extra, total: { roster, submitted, pct: pct(submitted, roster) }, overdue: !!a.deadline && Date.now() > a.deadline };
  }

  // ── So sánh 2 đợt kiểm tra ──
  /**
   * So sánh đợt A với đợt B (2 tên bài thi). Mỗi em lấy điểm cao nhất của mỗi đợt.
   * Trả { classes: [{ className, avgA, avgB, nA, nB, delta }], overall: {…}, students: { both, up, down, same } }.
   */
  function compareRounds(results, testA, testB) {
    const pick = (t) => {
      const m = new Map();
      (results || []).forEach((r) => {
        if (r.testName !== t || typeof r.score !== 'number') return;
        const key = keyNC(r.studentName, r.studentClass);
        const old = m.get(key);
        if (!old || r.score > old.score) m.set(key, { score: r.score, className: r.studentClass || '—' });
      });
      return m;
    };
    const A = pick(testA), B = pick(testB);
    const classes = {};
    const add = (m, side) => m.forEach((v) => { (classes[v.className] = classes[v.className] || { A: [], B: [] })[side].push(v.score); });
    add(A, 'A'); add(B, 'B');
    const rows = Object.keys(classes).sort(byNatural).map((c) => {
      const avgA = mean(classes[c].A), avgB = mean(classes[c].B);
      return { className: c, avgA, avgB, nA: classes[c].A.length, nB: classes[c].B.length, delta: avgA != null && avgB != null ? avgB - avgA : null };
    });
    const allA = [...A.values()].map((v) => v.score), allB = [...B.values()].map((v) => v.score);
    const st = { both: 0, up: 0, down: 0, same: 0 };
    A.forEach((va, key) => {
      const vb = B.get(key);
      if (!vb) return;
      st.both++;
      if (vb.score - va.score >= 5) st.up++; else if (va.score - vb.score >= 5) st.down++; else st.same++;
    });
    const oa = mean(allA), ob = mean(allB);
    return { classes: rows, overall: { avgA: oa, avgB: ob, nA: allA.length, nB: allB.length, delta: oa != null && ob != null ? ob - oa : null }, students: st };
  }

  // ── Chuyên cần ──
  /**
   * classes: [{ className, school, at, stats: so-lop-core stats(cls) }] → theo lớp: tỉ lệ có mặt, số buổi,
   * em cần chú ý (vắng ≥ 3 buổi hoặc vắng liền ≥ 2 — như watchList của so-lop-core, bỏ em đã nghỉ luôn).
   */
  function attendanceSummary(classes) {
    const rows = (classes || []).map((c) => {
      const s = c.stats || { students: [], sessions: [] };
      const present = s.sessions.reduce((n, x) => n + x.comat, 0), absent = s.sessions.reduce((n, x) => n + x.vang, 0);
      const watch = s.students.filter((x) => !x.nl && (x.vang >= 3 || x.lien >= 2))
        .sort((a, b) => b.lien - a.lien || b.vang - a.vang)
        .map((x) => ({ name: x.name, vang: x.vang, lien: x.lien }));
      return { className: c.className, school: c.school || '', at: c.at || 0, sessions: s.sessions.length, rate: present + absent ? pct(present, present + absent) : null, watch };
    }).sort((a, b) => byNatural(a.className, b.className));
    const withRate = rows.filter((r) => r.rate != null);
    return { classes: rows, rate: withRate.length ? Math.round(withRate.reduce((s, r) => s + r.rate, 0) / withRate.length) : null, watch: rows.reduce((n, r) => n + r.watch.length, 0) };
  }

  global.EduTeacherInsights = global.EduTeacherInsights || {};
  Object.assign(global.EduTeacherInsights, {
    PASS, EXCEL, BANDS, bandOf, proficiency, progressGauge, spotlight, trendLabel,
    matchesTitle, assignmentProgress, compareRounds, attendanceSummary, keyNC,
  });
  if (typeof module !== 'undefined' && module.exports) module.exports = global.EduTeacherInsights;
})(typeof window !== 'undefined' ? window : globalThis);
