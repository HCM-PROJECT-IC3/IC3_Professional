/* ============================================================
   js/so-lop/tkb-source.js — TKB của giáo viên (tab "TKB lớp" ở Lịch giảng dạy, collection teaching_timetable)
   cho thẻ Lịch dạy của Điểm danh: xếp lớp vào buổi Sáng/Chiều + tiết theo TKB bàn giao, khỏi xếp tay.

   CHI PHÍ FIRESTORE (đọc qua js/repositories/, lưu localStorage eduquiz_tkb_v1):
     • Mỗi tuần đang xem: 1 lượt get teaching_timetable/{mãGV}__{thứ Hai}. Giữ trên máy: tuần hiện tại/tới 6 giờ,
       tuần đã qua 30 ngày — kể cả khi tuần đó KHÔNG có TKB (khỏi hỏi lại liên tục).
     • Tuần chưa nhập TKB: dùng TKB gần nhất đã có trên máy (TKB bàn giao áp dụng nhiều tuần). Máy chưa có bản nào
       → 1 lần listByTeacher (số tuần đã nhập của GV đó), tối đa 1 lần/3 ngày.
     • Mã GV: giáo viên lấy teacherCode trong hồ sơ đăng nhập (0 lượt). Admin / xem GV khác: 1 lần đọc danh sách
       giáo viên, giữ 3 ngày.
     • Lỗi (mất mạng, chưa có quyền): không thử lại trong 30 phút, dùng bản cũ trên máy nếu có. Không bao giờ
       đọc dây chuyền nhiều tuần; cùng 1 tuần đang đọc dở thì các lần gọi sau dùng chung 1 lượt.
   create({ repos, storage, now }) để test (js/so-lop/__tests__/tkb-source.test.js) — trang dùng EduSoLopTkb mặc định.
   ============================================================ */
(function (global) {
  'use strict';

  const KEY = 'eduquiz_tkb_v1';
  const HOUR = 3600e3, DAY = 24 * HOUR;
  const CUR_TTL = 6 * HOUR, PAST_TTL = 30 * DAY, LIST_TTL = 3 * DAY, ERR_TTL = 30 * 60e3;
  const MAX_WEEKS = 16; // tuần lưu trên máy (mỗi tuần ~1–2KB)

  const plain = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/\s+/g, ' ').trim();
  const pad = (n) => String(n).padStart(2, '0');
  /** Thứ Hai (Date) → "YYYY-MM-DD" như weekKey của Lịch giảng dạy. */
  const weekKeyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const weekEnd = (wk) => { const [y, m, d] = wk.split('-').map(Number); return new Date(y, m - 1, d + 7).getTime(); };

  function create(opts) {
    const o = opts || {};
    const now = o.now || (() => Date.now());
    const storage = o.storage || null;
    const repos = () => (typeof o.repos === 'function' ? o.repos() : o.repos) || null;
    const inflight = new Map();
    const errAt = new Map();

    function load() {
      try { const v = JSON.parse(storage.getItem(KEY)); if (v && typeof v === 'object') return { w: v.w || {}, t: v.t || null, l: v.l || {} }; } catch (e) { /* hỏng → làm lại */ }
      return { w: {}, t: null, l: {} };
    }
    function save(st) {
      // Giữ MAX_WEEKS tuần mới nhất (theo weekKey) — bộ nhớ đầy thì bỏ qua, lần sau đọc lại
      const ids = Object.keys(st.w).sort((a, b) => (a.split('__')[1] < b.split('__')[1] ? 1 : -1));
      ids.slice(MAX_WEEKS).forEach((k) => delete st.w[k]);
      try { storage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* đầy bộ nhớ */ }
    }
    const ttl = (wk) => (weekEnd(wk) <= now() ? PAST_TTL : CUR_TTL);
    const failedRecently = (k) => errAt.has(k) && now() - errAt.get(k) < ERR_TTL;
    function once(k, fn) {
      if (inflight.has(k)) return inflight.get(k);
      const p = Promise.resolve().then(fn).finally(() => inflight.delete(k));
      inflight.set(k, p);
      return p;
    }

    /** Mã GV theo tên trên Sheet. profile.teacherCode dùng ngay khi tên khớp hồ sơ (hoặc chưa có tên để so).
        '' = có danh sách GV mà không thấy tên · null = chưa đọc được danh sách (mạng / chưa có Firestore). */
    async function codeOf(name, profile) {
      const want = plain(name);
      if (!want) return '';
      const pn = plain(profile && (profile.name || profile.displayName));
      if (profile && profile.teacherCode && (!pn || pn === want)) return profile.teacherCode;
      const st = load();
      const fresh = st.t && now() - st.t.at < LIST_TTL;
      if (!fresh && !failedRecently('teachers')) {
        const R = repos();
        if (R && R.teachingTeacher && R.teachingTeacher.listActive) {
          try {
            const list = await once('teachers', () => R.teachingTeacher.listActive());
            const map = {};
            (list || []).forEach((t) => { if (t && t.name) map[plain(t.name)] = t.code || t.id; });
            st.t = { at: now(), map };
            save(st);
          } catch (e) { errAt.set('teachers', now()); }
        }
      }
      if (!st.t) return null;
      return st.t.map[want] || '';
    }

    /** TKB tuần `monday` của GV `code` → { days, from (weekKey của bản dùng), fallback, stale } | null. */
    async function week(code, monday) {
      if (!code) return null;
      const wk = weekKeyOf(monday), id = `${code}__${wk}`;
      let st = load(), e = st.w[id];
      if ((!e || now() - e.at >= ttl(wk)) && !failedRecently(id)) {
        const R = repos();
        if (R && R.teachingTimetable) {
          try {
            const doc = await once(id, () => R.teachingTimetable.getById(id));
            st = load();
            st.w[id] = e = { at: now(), days: doc && doc.days ? doc.days : null };
            save(st);
          } catch (err) { errAt.set(id, now()); }
        }
      }
      if (e && e.days && hasClass(e.days)) return { days: e.days, from: wk, fallback: false, stale: now() - e.at >= ttl(wk) };
      // Tuần này chưa nhập TKB → TKB gần nhất của GV đó trên máy (tuần trước đó ưu tiên, không có thì tuần sau gần nhất)
      let best = pickNear(st, code, wk);
      if (!best && !(st.l[code] && now() - st.l[code] < LIST_TTL) && !failedRecently('list:' + code)) {
        const R = repos();
        if (R && R.teachingTimetable && R.teachingTimetable.listByTeacher) {
          try {
            const rows = await once('list:' + code, () => R.teachingTimetable.listByTeacher(code));
            st = load();
            (rows || []).filter((r) => r && r.weekKey && r.days).forEach((r) => {
              const k = `${code}__${r.weekKey}`;
              if (!st.w[k] || !st.w[k].days) st.w[k] = { at: now(), days: r.days };
            });
            st.l[code] = now();
            save(st);
            best = pickNear(load(), code, wk);
          } catch (err) { errAt.set('list:' + code, now()); }
        }
      }
      return best ? { days: best.days, from: best.wk, fallback: true, stale: false } : null;
    }
    function pickNear(st, code, wk) {
      const have = Object.keys(st.w).filter((k) => k.startsWith(code + '__') && st.w[k] && st.w[k].days && hasClass(st.w[k].days))
        .map((k) => ({ wk: k.slice(code.length + 2), days: st.w[k].days }));
      const before = have.filter((x) => x.wk <= wk).sort((a, b) => (a.wk < b.wk ? 1 : -1))[0];
      return before || have.filter((x) => x.wk > wk).sort((a, b) => (a.wk < b.wk ? -1 : 1))[0] || null;
    }
    const hasClass = (days) => Object.keys(days).some((k) => ['morning', 'afternoon'].some((s) => (days[k] && days[k][s] || [])
      .some((c) => (c && typeof c === 'object' ? c.maLop : c))));

    return { codeOf, week, weekKeyOf };
  }

  global.EduSoLopTkb = create({ repos: () => global.EduRepositories, storage: (() => { try { return global.localStorage; } catch (e) { return null; } })() });
  global.EduSoLopTkb.create = create;
})(typeof window !== 'undefined' ? window : globalThis);
