/* ============================================================
   js/techrealm/analytics-core.js — BÁO CÁO NĂNG LỰC HỌC VIÊN & LỚP HỌC (Domain thuần).

   Đầu vào là dữ liệu giáo viên ĐANG có: bài nộp (QuizResult của EduTeacherData.loadAll — cùng truy vấn, cùng bản
   đệm với dashboard giáo viên), danh sách học sinh, data/techrealm/courses.json, data/ic3/meta.json.
   Nối bài nộp → bài học nhờ testName "<chương trình> › <cấp> › <tên minitest>" + EduLearning.unitIdOf.
   Không DOM, không mạng. Tài liệu: docs/techrealm/HUONG_DAN_GIAO_VIEN.md §4.
   ============================================================ */
(function (root) {
  'use strict';

  const PASS = 70;
  const RISK_AVG = 50;
  const RISK_IDLE_DAYS = 14;
  // 7 chủ đề IC3 → 5 linh căn (giống cultivation-core.TOPIC_ELEMENT)
  const TOPIC_ELEMENT = { 1: 'kim', 2: 'tho', 3: 'tho', 4: 'moc', 5: 'thuy', 6: 'thuy', 7: 'hoa' };
  const TOPIC_NAME = { 1: 'Căn bản về công nghệ', 2: 'Công dân số', 3: 'Quản lý thông tin', 4: 'Sáng tạo nội dung', 5: 'Giao tiếp', 6: 'Hợp tác, cộng tác', 7: 'An toàn và bảo mật' };

  const norm = function (s) { return String(s == null ? '' : s).trim().toLowerCase(); };
  const keyOf = function (name, cls) { return norm(name) + '__' + norm(cls); }; // = EduModels.Roster.studentKeyOf
  const avg = function (a) { return a.length ? Math.round(a.reduce(function (t, x) { return t + x; }, 0) / a.length) : null; };

  /** Bảng tra tên chương trình / cấp trong meta.json → id (testName lưu TÊN hiển thị). */
  function metaIndex(meta) {
    const cats = {};
    ((meta && meta.categories) || []).forEach(function (c) {
      const levels = {};
      (c.levels || []).forEach(function (l) { levels[norm(l.name)] = l.id; levels[norm(l.id)] = l.id; });
      cats[norm(c.name)] = { id: c.id, levels: levels };
      cats[norm(c.id)] = { id: c.id, levels: levels };
    });
    return cats;
  }
  /** testName → { catId, levelId, mtKey } hoặc null (đề tự soạn, bài "Tổng hợp"…). */
  function parseTestName(testName, idx) {
    const parts = String(testName || '').split(' › ');
    if (parts.length < 3) return null;
    const cat = idx[norm(parts[0])];
    if (!cat) return null;
    const levelId = cat.levels[norm(parts[1])];
    if (!levelId) return null;
    return { catId: cat.id, levelId: levelId, mtKey: parts.slice(2).join(' › ') };
  }

  /** Bài nộp → hồ sơ năng lực từng học sinh + báo cáo lớp. */
  function classReport(input) {
    const L = root.EduLearning;
    if (!L) throw new Error('Cần nạp js/techrealm/learning-core.js');
    const now = input.now;
    const idx = metaIndex(input.meta);
    const courses = (input.catalog && input.catalog.courses) || [];
    const domains = (input.catalog && input.catalog.domains) || [];
    const byStudent = {};
    const ensure = function (name, cls, school) {
      const k = keyOf(name, cls);
      return byStudent[k] || (byStudent[k] = { key: k, name: name, cls: cls || '', school: school || '', results: [] });
    };
    (input.students || []).forEach(function (s) { if (s && s.name) ensure(s.name, s.className, s.school); });
    (input.results || []).forEach(function (r) {
      if (!r || !r.studentName || typeof r.score !== 'number') return;
      const st = ensure(r.studentName, r.studentClass, r.studentSchool);
      const p = parseTestName(r.testName, idx);
      const u = p ? L.unitIdOf(p.catId, p.levelId, p.mtKey) : null;
      const topic = p ? (/^(\d)\. /.exec(p.mtKey) || [])[1] : null;
      st.results.push({ at: r.submittedAtMs || 0, testName: r.testName || '', score: r.score, unit: u, topic: topic ? Number(topic) : null, timeSpent: r.timeSpent || 0 });
    });

    const students = Object.keys(byStudent).map(function (k) {
      const st = byStudent[k];
      st.results.sort(function (a, b) { return b.at - a.at; });
      // tiến độ dạng learning-core.progressOf (best theo đơn vị)
      const units = {};
      st.results.forEach(function (r) {
        if (!r.unit) return;
        const u = units[r.unit.id] || (units[r.unit.id] = { kind: r.unit.kind, best: 0, attempts: 0, lastAt: 0, bestTest: null, timeSec: 0 });
        u.attempts++; u.best = Math.max(u.best, r.score); u.lastAt = Math.max(u.lastAt, r.at);
      });
      const progress = { units: units };
      const courseRows = courses.map(function (c) {
        const ids = c.lessons.map(function (l) { return l.id; });
        const touched = ids.concat(c.gates.map(function (g) { return g.id; })).some(function (id) { return units[id]; });
        if (!touched) return null;
        const s = L.courseStatus(c, progress, null);
        const passedN = c.lessons.filter(function (l) { return units[l.id] && units[l.id].best >= PASS; }).map(function (l) { return l.n; });
        const maxPassed = passedN.length ? Math.max.apply(null, passedN) : 0;
        const gaps = c.lessons.filter(function (l) { return l.n < maxPassed && !(units[l.id] && units[l.id].best >= PASS); });
        return {
          id: c.id, name: c.name, plain: c.plain, domain: c.domain, pct: s.pct, lessonsDone: s.lessonsDone, lessons: c.lessons.length,
          tests: c.gates.filter(function (g) { return units[g.id]; }).map(function (g) { return { id: g.id, title: g.title, best: units[g.id].best, passed: units[g.id].best >= PASS }; }),
          gaps: gaps.map(function (l) { return { id: l.id, title: 'Bài ' + l.n + '. ' + l.title, best: units[l.id] ? units[l.id].best : null }; }),
          next: s.next ? { id: s.next.id, title: s.next.title } : null,
        };
      }).filter(Boolean);
      const domainPct = {};
      domains.forEach(function (d) {
        const rows = courseRows.filter(function (c) { return c.domain === d.id; });
        if (rows.length) domainPct[d.id] = avg(rows.map(function (c) { return c.pct; }));
      });
      const topics = {};
      st.results.forEach(function (r) { if (r.topic) (topics[r.topic] = topics[r.topic] || []).push(r.score); });
      const elements = {};
      Object.keys(topics).forEach(function (t) { const e = TOPIC_ELEMENT[t]; (elements[e] = elements[e] || []).push(avg(topics[t])); });
      Object.keys(elements).forEach(function (e) { elements[e] = avg(elements[e]); });
      const scores = st.results.map(function (r) { return r.score; });
      const last = st.results.length ? st.results[0].at : 0;
      const idleDays = last ? Math.floor((now - last) / 864e5) : null;
      const risk = [];
      if (!st.results.length) risk.push('Chưa nộp bài nào');
      else {
        if (avg(scores) < RISK_AVG) risk.push('Điểm trung bình dưới ' + RISK_AVG);
        if (idleDays !== null && idleDays >= RISK_IDLE_DAYS) risk.push(idleDays + ' ngày chưa làm bài');
        const failedTests = courseRows.reduce(function (t, c) { return t + c.tests.filter(function (x) { return !x.passed; }).length; }, 0);
        if (failedTests) risk.push(failedTests + ' bài kiểm tra chưa đạt');
      }
      return {
        key: st.key, name: st.name, cls: st.cls, school: st.school,
        attempts: st.results.length, avg: avg(scores), best: scores.length ? Math.max.apply(null, scores) : null, lastAt: last || null, idleDays: idleDays,
        courses: courseRows, domainPct: domainPct,
        topics: Object.keys(topics).map(function (t) { return { topic: Number(t), name: TOPIC_NAME[t], avg: avg(topics[t]), n: topics[t].length }; }),
        elements: elements, risk: risk,
        history: st.results.slice(0, 20).map(function (r) { return { at: r.at, testName: r.testName, score: r.score }; }),
      };
    }).sort(function (a, b) { return a.cls === b.cls ? (a.name < b.name ? -1 : 1) : (a.cls < b.cls ? -1 : 1); });

    // Báo cáo theo khoá học: số học sinh đã học, % hoàn thành trung bình
    const courseReport = courses.map(function (c) {
      const rows = students.map(function (s) { return s.courses.filter(function (x) { return x.id === c.id; })[0]; }).filter(Boolean);
      if (!rows.length) return null;
      return { id: c.id, name: c.name, plain: c.plain, students: rows.length, avgPct: avg(rows.map(function (r) { return r.pct; })) };
    }).filter(Boolean);

    // Bài khó nhất toàn lớp (dùng điểm cao nhất mỗi học sinh ở mỗi bài)
    const perUnit = {};
    Object.keys(byStudent).forEach(function (k) {
      const best = {};
      byStudent[k].results.forEach(function (r) { if (r.unit && r.unit.kind !== 'review') best[r.unit.id] = Math.max(best[r.unit.id] || 0, r.score); });
      Object.keys(best).forEach(function (id) { (perUnit[id] = perUnit[id] || []).push(best[id]); });
    });
    const title = {};
    courses.forEach(function (c) {
      c.lessons.forEach(function (l) { if (!title[l.id]) title[l.id] = c.plain + ' · Bài ' + l.n + '. ' + l.title; });
      c.gates.forEach(function (g) { if (!title[g.id]) title[g.id] = c.plain + ' · ' + g.title; });
    });
    const hardest = Object.keys(perUnit).filter(function (id) { return perUnit[id].length >= 3; })
      .map(function (id) { return { id: id, title: title[id] || id, avg: avg(perUnit[id]), students: perUnit[id].length, below: perUnit[id].filter(function (v) { return v < PASS; }).length }; })
      .sort(function (a, b) { return a.avg - b.avg; }).slice(0, 8);

    const domainReport = domains.map(function (d) {
      const vals = students.map(function (s) { return s.domainPct[d.id]; }).filter(function (v) { return v !== undefined; });
      return vals.length ? { id: d.id, name: d.name, students: vals.length, avgPct: avg(vals) } : null;
    }).filter(Boolean);
    const elementReport = ['kim', 'moc', 'thuy', 'hoa', 'tho'].map(function (e) {
      const vals = students.map(function (s) { return s.elements[e]; }).filter(function (v) { return typeof v === 'number'; });
      return { element: e, students: vals.length, avg: avg(vals) };
    });
    const active = students.filter(function (s) { return s.idleDays !== null && s.idleDays < 7; }).length;
    return {
      students: students, courses: courseReport, hardest: hardest, domains: domainReport, elements: elementReport,
      summary: {
        students: students.length, withResults: students.filter(function (s) { return s.attempts; }).length, active7: active,
        avg: avg(students.filter(function (s) { return s.avg !== null; }).map(function (s) { return s.avg; })),
        atRisk: students.filter(function (s) { return s.risk.length; }).length,
      },
    };
  }

  /** CSV báo cáo lớp (UTF-8 có BOM để Excel đọc đúng tiếng Việt). */
  function toCsv(report) {
    const q = function (v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; };
    const head = ['Học sinh', 'Lớp', 'Số bài nộp', 'Điểm TB', 'Điểm cao nhất', 'Ngày chưa làm bài', 'Công pháp đang học', 'Hoàn thành (%)', 'Bài còn thiếu', 'Cần chú ý'];
    const rows = report.students.map(function (s) {
      const main = s.courses.slice().sort(function (a, b) { return b.lessonsDone - a.lessonsDone; })[0];
      return [s.name, s.cls, s.attempts, s.avg, s.best, s.idleDays, main ? main.plain : '', main ? main.pct : '', main ? main.gaps.length : '', s.risk.join('; ')].map(q).join(',');
    });
    return '﻿' + [head.map(q).join(',')].concat(rows).join('\r\n');
  }

  const api = { PASS: PASS, TOPIC_ELEMENT: TOPIC_ELEMENT, TOPIC_NAME: TOPIC_NAME, metaIndex: metaIndex, parseTestName: parseTestName, classReport: classReport, toCsv: toCsv };
  root.EduClassAnalytics = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
