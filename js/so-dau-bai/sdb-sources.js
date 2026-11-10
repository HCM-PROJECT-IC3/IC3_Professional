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
     sheetSessions(store, EduSoLop, opts) — mọi tiết có ngày trên sổ lớp, khỏi nhập TKB mới có tiết để ghi
     absentOf(c, key, sessions, drafts) · pickLesson(ppct, bai, after, lessonOf) — bài trên Sheet → tiết PPCT
     listBooks(ls, uid) · bookForSchool(list, school) · bookEntries(list, school, cls, date) — sổ theo trường + tài khoản
     trimSoLop(ls, n) — bộ nhớ đầy: bỏ bớt bản CSV cũ của Điểm danh (đọc lại được) để sổ đầu bài vẫn lưu được
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

  /** Bản đọc dùng được: từ khi có danh sách sổ của trường (booksAt), sổ chờ đưa lên trường không tính. */
  function usableCache(store) {
    const cache = (store && store.cache) || {};
    if (!store || !store.booksAt) return cache;
    const ids = new Set((store.links || []).map((f) => f.id)), out = {};
    Object.keys(cache).forEach((k) => { if (ids.has(k.split('|')[0])) out[k] = cache[k]; });
    return out;
  }

  /** Bản CSV sổ lớp đã lưu ở trang Điểm danh → cùng dạng fromRoster; bỏ học sinh đã nghỉ luôn (NL). */
  function fromSoLop(store, L) {
    const out = [], seen = new Set();
    const cache = usableCache(store);
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

  const pad2 = (n) => String(n).padStart(2, '0');
  const isoDay = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

  /** Tên vắng của 1 buổi. Bản nháp lưu ở 1 cột nhưng áp cho cả buổi (Điểm danh ghi cùng lúc mọi tiết của buổi) nên có nháp thì theo nháp. */
  function absentOf(c, k, sess, drafts) {
    const out = [];
    c.students.forEach((st) => {
      // Nháp kèm tên (Điểm danh bản mới): dòng đó nay là bạn khác (điều phối chèn/xoá dòng) → bỏ qua nháp
      const ok = (d) => d && d.marks && d.marks[st.row] != null && !(d.names && d.names[st.row] && low(d.names[st.row]) !== low(st.name));
      const dr = sess.map((s) => (drafts || {})[`${k}|${s.col}`]).find(ok);
      const off = dr ? dr.marks[st.row] === 'v' : sess.some((s) => st.marks[s.col] === 'v');
      if (off && !out.includes(norm(st.name))) out.push(norm(st.name));
    });
    return out;
  }

  /**
   * Điểm danh của 1 lớp trong 1 ngày ở sổ lớp đã đọc (trang Điểm danh) — để Sổ đầu bài không phải điểm danh lại.
   * Bản nháp chưa ghi vào Sheet (drafts) được tính trước bản trên Sheet. 2 tiết cùng ngày → gộp tên vắng.
   * → { school, at, bai: ['Bài 7'], absent: [tên], sessions: số tiết } | null (không có lớp / ngày đó chưa có tiết)
   */
  function attendanceOn(store, L, opts) {
    const cache = usableCache(store), drafts = (store && store.drafts) || {};
    const key = normClass(opts.cls), d = opts.date;
    const keys = Object.keys(cache).sort((a, b) => (cache[b].at || 0) - (cache[a].at || 0));
    for (const k of keys) {
      let c;
      try { c = L.parseClass(L.parseCSV(cache[k].csv)); } catch (e) { c = null; }
      if (!c || normClass(c.cls) !== key) continue;
      if (opts.school && !sameSchool(c.school, opts.school) && low(c.school) !== low(opts.school)) continue;
      const sess = c.sessions.filter((s) => { const x = L.dateOf(s.ngay, d); return x && x.getDate() === d.getDate() && x.getMonth() === d.getMonth(); });
      if (!sess.length) return null;
      return { school: c.school, at: cache[k].at || 0, bai: sess.map((s) => s.bai).filter(Boolean), absent: absentOf(c, k, sess, drafts), sessions: sess.length };
    }
    return null;
  }

  /**
   * Mọi tiết có ngày trên các sổ lớp đã đọc → [{ school, cls, date: 'YYYY-MM-DD', tiet, bai, mine }].
   * mine: tiết của giáo viên opts.teacher (không truyền tên → false). Cùng lớp đọc ở 2 tab thì lấy bản mới.
   */
  function sheetSessions(store, L, opts) {
    const cache = usableCache(store), seen = new Set(), out = [];
    const { teacher, ref } = opts || {};
    Object.keys(cache).sort((a, b) => (cache[b].at || 0) - (cache[a].at || 0)).forEach((k) => {
      let c;
      try { c = L.parseClass(L.parseCSV(cache[k].csv)); } catch (e) { c = null; }
      if (!c || !c.school || !isClass(c.cls)) return;
      const id = low(c.school) + '|' + normClass(c.cls);
      if (seen.has(id)) return;
      seen.add(id);
      const mine = new Set(teacher ? L.taughtBy(c, teacher) : []);
      c.sessions.forEach((s) => {
        const d = L.dateOf(s.ngay, ref);
        if (d) out.push({ school: norm(c.school), cls: normClass(c.cls), date: isoDay(d), tiet: s.tiet, bai: norm(s.bai), mine: mine.has(s), key: k, col: s.col });
      });
    });
    return out;
  }

  /**
   * Bài ghi trên Sheet → tiết PPCT của sổ. Số TIẾT trên Sheet là thứ tự dạy của lớp, không phải số tiết PPCT, nên khớp theo "Bài N":
   * bài nhiều tiết thì lấy tiết đầu sau tiết đã dạy (after). Không khớp thì giữ chữ trên Sheet, ppct = null.
   */
  function pickLesson(rows, bai, after, lessonOf) {
    const text = norm(bai);
    if (!text) return null;
    const list = rows || [], want = lessonOf(text).bai[0];
    const hits = want ? list.filter((r) => lessonOf(r.name).bai.includes(want)).sort((a, b) => a.t - b.t) : list.filter((r) => low(r.name) === low(text));
    const r = hits.find((x) => +x.t > (after || 0)) || hits[0];
    return r ? { ppct: +r.t, lesson: r.name } : { ppct: null, lesson: text };
  }

  // ── Sổ theo trường + tài khoản: sodaubai_v1 là sổ đầu tiên, sổ khác ở sodaubai_v1:<mã>. Mỗi sổ tự ghi owner, settings.school. ──
  const BOOK_KEY = 'sodaubai_v1';
  /** Các sổ của tài khoản uid trên máy này (sổ chưa có chủ cũng tính — bản trước chưa ghi chủ). */
  function listBooks(ls, uid) {
    const out = [];
    for (let i = 0; i < ls.length; i++) {
      const key = ls.key(i);
      if (key !== BOOK_KEY && !String(key).startsWith(BOOK_KEY + ':')) continue;
      let b = null;
      try { b = JSON.parse(ls.getItem(key)); } catch (e) { b = null; }
      if (!b || !b.v || (b.owner && b.owner !== uid)) continue;
      out.push({ key, owner: b.owner || '', school: norm(b.settings && b.settings.school), entries: b.entries || [] });
    }
    return out.sort((a, b) => (a.key === BOOK_KEY ? -1 : b.key === BOOK_KEY ? 1 : a.school.localeCompare(b.school, 'vi')));
  }
  const bookForSchool = (list, school) => (list || []).find((b) => sameSchool(b.school, school) || (b.school && low(b.school) === low(school))) || null;
  /** Số tiết (kể cả tiết nghỉ) đã ghi cho lớp trong ngày ở sổ của trường đó. date: 'YYYY-MM-DD'. */
  function bookEntries(list, school, cls, date) {
    const b = bookForSchool(list, school), key = normClass(cls);
    return b ? b.entries.filter((e) => e.date === date && e.cls === key).length : 0;
  }

  /** Bỏ n bản CSV cũ nhất của Điểm danh (đọc lại từ Google không tốn gì). → true nếu đã bỏ được. */
  function trimSoLop(ls, n) {
    let s;
    try { s = JSON.parse(ls.getItem('eduquiz_solop_v1')); } catch (e) { return false; }
    const keys = Object.keys((s && s.cache) || {}).sort((a, b) => (s.cache[a].at || 0) - (s.cache[b].at || 0));
    if (!keys.length) return false;
    keys.slice(0, n || 10).forEach((k) => delete s.cache[k]);
    try { ls.setItem('eduquiz_solop_v1', JSON.stringify(s)); return true; } catch (e) { return false; }
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

  global.EduSdbSources = {
    normClass, isClass, schoolKey, sameSchool, usableCache, fromRoster, fromSoLop, attendanceOn, absentOf, sheetSessions, pickLesson, groupBySchool, mergeStudents, tietForLesson, rosterHit, goitenPatch, goitenDay,
    isoDay, listBooks, bookForSchool, bookEntries, trimSoLop,
  };
})(typeof window !== 'undefined' ? window : globalThis);
