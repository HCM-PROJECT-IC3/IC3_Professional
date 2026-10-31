/* ============================================================
   js/so-dau-bai/sdb-sources.js — nguồn dữ liệu có sẵn của dự án cho Sổ đầu bài (so-dau-bai.html).
   Sổ đầu bài không tự lưu lên mạng: lớp + học sinh lấy từ dữ liệu web đã có, cùng máy, 0 lượt Firebase,
   0 lượt Apps Script:
     • Sổ lớp Điều phối đã đọc ở trang Điểm danh (localStorage eduquiz_solop_v1 — có mã HS, ngày sinh)
     • Danh sách học sinh của hệ thống (file tĩnh data/roster/students-active.json — chỉ họ tên)
   Chiều ngược lại: tiết đã ghi sổ hôm nay → Gọi tên (vắng hôm nay + câu hỏi theo bài), như nút
   "Dùng cho Gọi tên" của Điểm danh.
   Hàm thuần, không gọi mạng (test: js/so-dau-bai/__tests__/sdb-sources.test.js):
     normClass · schoolKey · sameSchool · fromRoster(data) · fromSoLop(store, EduSoLop) · groupBySchool
     attendanceOn(store, EduSoLop, { school, cls, date }) — vắng của lớp trong ngày, khỏi điểm danh 2 lần
     mergeStudents(old, incoming) · tietForLesson(periods, text, lessonOf) · rosterHit(data, school, cls)
     goitenPatch(g, opts) · goitenDay(date)
   ============================================================ */
(function (global) {
  'use strict';

  const norm = (s) => String(s == null ? '' : s).normalize('NFC').replace(/\s+/g, ' ').trim();
  const low = (s) => norm(s).toLocaleLowerCase('vi');
  /** "3A1" · "3a1" · "3/11" · "3.1" → "3.1" / "3.11" (cùng quy ước với Sổ đầu bài). */
  const normClass = (s) => norm(s).replace(/^(\d+)\s*[Aa.\/_-]\s*(\d+)$/, '$1.$2');
  const isClass = (s) => /^\d+\.\d+$/.test(normClass(s));

  /** Tên trường bỏ phần loại trường: "TRƯỜNG TIỂU HỌC PHONG PHÚ 2" · "TiH Phong Phú 2" → "phong phú 2". */
  function schoolKey(s) {
    return low(s)
      .replace(/^trường\s+/, '')
      .replace(/^(tiểu học|trung học cơ sở|trung học phổ thông|thcs|thpt|tih|th)\s+/, '')
      .replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim();
  }
  const sameSchool = (a, b) => !!schoolKey(a) && schoolKey(a) === schoolKey(b);

  /** students-active.json → [{ school, cls, key, students: [{ code, name, dob }] }]. */
  function fromRoster(data) {
    const by = new Map();
    ((data && data.students) || []).forEach((s) => {
      const name = norm(s && s.name), school = norm(s && s.school), cls = norm(s && s.className);
      if (!name || !school || !cls || !isClass(cls)) return;
      const k = school + '|' + cls;
      const c = by.get(k) || { school, cls, key: normClass(cls), students: [] };
      if (!c.students.some((x) => x.name === name)) c.students.push({ code: '', name, dob: '' });
      by.set(k, c);
    });
    return [...by.values()];
  }

  /** Bản CSV sổ lớp đã lưu ở trang Điểm danh → cùng dạng fromRoster; bỏ học sinh đã nghỉ luôn (NL). */
  function fromSoLop(store, L) {
    const out = [], seen = new Set();
    const cache = (store && store.cache) || {};
    // Bản mới đọc trước: cùng lớp đọc 2 lần (2 sổ / tab trùng) thì giữ bản mới
    Object.keys(cache).sort((a, b) => (cache[b].at || 0) - (cache[a].at || 0)).forEach((k) => {
      let c;
      try { c = L.parseClass(L.parseCSV(cache[k].csv)); } catch (e) { c = null; }
      if (!c || !c.school || !isClass(c.cls)) return;
      const id = low(c.school) + '|' + normClass(c.cls);
      if (seen.has(id)) return;
      seen.add(id);
      const students = c.students
        .filter((s) => !Object.values(s.marks || {}).includes('nl'))
        .map((s) => ({ code: norm(s.code), name: norm(s.name), dob: norm(s.dob) }))
        .filter((s) => s.name && s.name.split(' ').length >= 2);
      if (students.length) out.push({ school: norm(c.school), cls: norm(c.cls), key: normClass(c.cls), students, at: cache[k].at || 0 });
    });
    return out;
  }

  /** [{ school, ... }] → [{ school, classes: [...] }] — trường cùng tên khác cách viết gộp làm một. */
  function groupBySchool(list) {
    const by = new Map();
    (list || []).forEach((c) => {
      const k = schoolKey(c.school) || low(c.school);
      const g = by.get(k) || { school: c.school, classes: [] };
      if (!g.classes.some((x) => x.key === c.key)) g.classes.push(c);
      by.set(k, g);
    });
    const num = (k) => k.split('.').map(Number);
    return [...by.values()].map((g) => Object.assign(g, {
      classes: g.classes.sort((a, b) => { const [a1, a2] = num(a.key), [b1, b2] = num(b.key); return a1 - b1 || a2 - b2; }),
    })).sort((a, b) => a.school.localeCompare(b.school, 'vi'));
  }

  /**
   * Điểm danh của 1 lớp trong 1 ngày ở sổ lớp đã đọc (trang Điểm danh) — để Sổ đầu bài không phải điểm danh lại.
   * Bản nháp chưa ghi vào Sheet (drafts) được tính trước bản trên Sheet. 2 tiết cùng ngày → gộp tên vắng.
   * → { school, at, bai: ['Bài 7'], absent: [tên], sessions: số tiết } | null (không có lớp / ngày đó chưa có tiết)
   */
  function attendanceOn(store, L, opts) {
    const cache = (store && store.cache) || {}, drafts = (store && store.drafts) || {};
    const key = normClass(opts.cls), d = opts.date;
    const keys = Object.keys(cache).sort((a, b) => (cache[b].at || 0) - (cache[a].at || 0));
    for (const k of keys) {
      let c;
      try { c = L.parseClass(L.parseCSV(cache[k].csv)); } catch (e) { c = null; }
      if (!c || normClass(c.cls) !== key) continue;
      if (opts.school && !sameSchool(c.school, opts.school) && low(c.school) !== low(opts.school)) continue;
      const sess = c.sessions.filter((s) => { const x = L.dateOf(s.ngay, d); return x && x.getDate() === d.getDate() && x.getMonth() === d.getMonth(); });
      if (!sess.length) return null;
      const absent = [];
      c.students.forEach((st) => {
        const off = sess.some((s) => {
          const dr = drafts[`${k}|${s.col}`];
          const m = dr && dr.marks && dr.marks[st.row] != null ? dr.marks[st.row] : st.marks[s.col];
          return m === 'v';
        });
        if (off && !absent.includes(norm(st.name))) absent.push(norm(st.name));
      });
      return { school: c.school, at: cache[k].at || 0, bai: sess.map((s) => s.bai).filter(Boolean), absent, sessions: sess.length };
    }
    return null;
  }

  /** Danh sách mới theo thứ tự nguồn; giữ mã HS/ngày sinh của bản cũ khi nguồn không có. */
  function mergeStudents(old, incoming) {
    const prev = new Map((old || []).map((s) => [low(s.name), s]));
    const list = (incoming || []).map((s) => {
      const o = prev.get(low(s.name)) || {};
      return { code: s.code || o.code || '', name: s.name, dob: s.dob || o.dob || '' };
    });
    const next = new Set(list.map((s) => low(s.name)));
    return {
      list,
      added: list.filter((s) => !prev.has(low(s.name))).length,
      removed: (old || []).filter((s) => !next.has(low(s.name))).map((s) => s.name),
    };
  }

  /** Tên bài ghi trong sổ ("Bài 9: Bắt nạt...") → tiết PPCT của trang Gọi tên (np-lessons) có Bài đó. */
  function tietForLesson(periods, text, lessonOf) {
    const l = lessonOf(text);
    if (!l.bai.length) return 0;
    const p = (periods || []).find((x) => x.items.includes(`Bài ${l.bai[0]}`));
    return p ? p.tiet : 0;
  }

  /** Lớp tương ứng trong students-active.json: { school, className, names } | null. */
  function rosterHit(data, school, cls) {
    const all = (data && data.students) || [];
    const key = normClass(cls);
    const hit = all.find((s) => s.school && (sameSchool(s.school, school) || low(s.school) === low(school)) && normClass(s.className) === key);
    if (!hit) return null;
    const names = all.filter((s) => s.school === hit.school && s.className === hit.className).map((s) => norm(s.name));
    return { school: hit.school, className: hit.className, names };
  }

  /** goi-ten.html ghi ngày dạng "2026-10-28" không đệm số 0. */
  const goitenDay = (d) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

  /**
   * Ghi lớp + vắng hôm nay + tiết câu hỏi vào bản lưu của Gọi tên (eduquiz_goiten_v1).
   * opts: { names (danh sách lớp trong sổ), absent (tên vắng), hit (rosterHit | null), tiet, level, day }
   * → { g, key, absent: số tên vắng khớp, miss: số tên vắng không khớp }
   */
  function goitenPatch(g, opts) {
    g = Object.assign({}, g || {});
    g.absent = Object.assign({}, g.absent); g.lesson = Object.assign({}, g.lesson); g.called = g.called || {};
    let key, names = opts.names || [];
    if (opts.hit) { g.src = 'class'; g.school = opts.hit.school; g.cls = opts.hit.className; key = `class:${opts.hit.school}|${opts.hit.className}`; names = opts.hit.names; }
    else { g.src = 'paste'; g.paste = names.join('\n'); key = 'paste'; }
    const byLower = new Map(names.map((n) => [low(n), n]));
    const absent = (opts.absent || []).map((n) => byLower.get(low(n))).filter(Boolean);
    g.absent[key] = { day: opts.day, names: absent };
    // Danh sách dán không tự biết khối → ghi rõ cấp độ; lớp của hệ thống để 'auto'
    if (opts.tiet) g.lesson[key] = { lv: key === 'paste' ? opts.level : 'auto', tiet: opts.tiet, day: opts.day };
    return { g, key, absent: absent.length, miss: (opts.absent || []).length - absent.length };
  }

  global.EduSdbSources = { normClass, isClass, schoolKey, sameSchool, fromRoster, fromSoLop, attendanceOn, groupBySchool, mergeStudents, tietForLesson, rosterHit, goitenPatch, goitenDay };
})(typeof window !== 'undefined' ? window : globalThis);
