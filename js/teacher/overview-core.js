/* ============================================================
   js/teacher/overview-core.js — số liệu màn "Tổng quan" của trang quản lý (ic3-dashboard.html).
   Hàm thuần, không gọi mạng, không đụng bộ nhớ trình duyệt (test: js/teacher/__tests__/overview-core.test.js).
   Đầu vào là dữ liệu đã có trên máy: sổ lớp đã đọc ở Điểm danh + các sổ đầu bài.
     build({ store, books, teacher, now, L, SRC }) → { hasData, unmatched, kpi, week, watch, progress }
       L = EduSoLop · SRC = EduSdbSources
       kpi.unwritten = null khi giáo viên chưa dùng Sổ đầu bài (không nhắc việc không liên quan)
   ============================================================ */
(function (global) {
  'use strict';

  const day0 = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

  function classRows(store, teacher, L, SRC) {
    const cache = SRC.usableCache(store), links = (store && store.links) || [], mine = (store && store.mine) || {};
    const rows = [];
    Object.keys(cache).forEach((key) => {
      let p = null;
      try { p = L.parseClass(L.parseCSV(cache[key].csv)); } catch (e) { p = null; }
      if (!p || (teacher && !mine[key] && !L.isMine(p, teacher))) return;
      const [id, gid] = key.split('|'), f = links.find((x) => x.id === id), t = f && f.tabs.find((x) => x.gid === gid);
      rows.push({ key, p, name: (t && t.name) || p.cls, school: (f && (f.school || f.label)) || p.school || '', sm: L.summary(p, L.lessonsOf(p.sessions)) });
    });
    return rows;
  }

  function build(o) {
    const { store, books, teacher, now, L, SRC } = o;
    const rows = classRows(store, teacher, L, SRC);
    const unmatched = !rows.length && Object.keys(SRC.usableCache(store)).length > 0;
    const empty = { hasData: false, unmatched, kpi: null, week: [], watch: [], progress: [] };
    if (!rows.length) return empty;

    const nameOf = new Map(rows.map((r) => [r.key, r.name]));
    const plan = L.weekPlan(rows.map((r) => ({ key: r.key, school: r.school, cls: r.p, sm: r.sm })), teacher, L.mondayOf(now), now)
      .filter((e) => e.kind !== 'missing');
    const tiet = plan.reduce((a, e) => a.concat(e.sessions), []);
    const usesBook = (books || []).some((b) => b.entries.length);
    const late = (e) => e.sessions.length > 0 && day0(e.date) <= day0(now)
      && SRC.bookEntries(books, e.school, e.cls.cls, SRC.isoDay(e.date)) < e.sessions.length;

    let comat = 0, total = 0;
    rows.forEach((r) => L.stats(r.p).sessions.forEach((s) => { comat += s.comat; total += s.comat + s.vang; }));

    return {
      hasData: true,
      unmatched: false,
      kpi: {
        classes: rows.length,
        tietDone: tiet.filter((s) => s.done).length,
        tietWeek: tiet.length,
        rate: total ? Math.round((comat / total) * 100) : null,
        unwritten: usesBook ? plan.filter(late).length : null,
      },
      week: plan.map((e) => ({
        date: e.date, today: day0(e.date) === day0(now), kind: e.kind, key: e.key, name: nameOf.get(e.key), school: e.school,
        tiet: e.sessions.map((s) => s.tiet), bai: e.sessions.map((s) => s.bai).filter(Boolean),
      })),
      watch: rows.flatMap((r) => L.watchList(r.p).map((x) => ({ name: x.name, cls: r.name, school: r.school, vang: x.vang, lien: x.lien })))
        .sort((a, b) => b.lien - a.lien || b.vang - a.vang),
      progress: rows.map((r) => ({ key: r.key, name: r.name, school: r.school, done: r.sm.done, total: r.sm.total, pct: r.sm.total ? Math.round((r.sm.done / r.sm.total) * 100) : 0 }))
        .sort((a, b) => a.pct - b.pct || a.name.localeCompare(b.name, 'vi', { numeric: true })),
    };
  }

  global.EduOverviewCore = { build };
})(typeof window !== 'undefined' ? window : globalThis);
