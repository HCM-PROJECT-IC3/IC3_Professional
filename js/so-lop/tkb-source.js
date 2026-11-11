/* ============================================================
   js/so-lop/tkb-source.js — TKB của giáo viên ở Lịch giảng dạy (teaching-schedule.html) cho thẻ Lịch dạy của Điểm danh:
   xếp lớp vào buổi Sáng/Chiều, đúng tiết và GIỜ dạy, khỏi xếp tay.

   NGUỒN (giống hệt trang "TKB lớp" — js/teaching-timetable.js applyScheduleAutoFill + TeachingSchedule.effectivePeriods):
     • Mã lớp từng tiết: "Lịch tuần" (teaching_schedule/{mãGV}__{thứ Hai}.days[thứ][buổi].periods) là nguồn gốc; buổi
       Lịch tuần chưa gõ mã lớp nào thì lấy "TKB lớp" (teaching_timetable/{mãGV}__{thứ Hai}). Lưới TKB lớp tự điền từ Lịch
       tuần lúc mở và KHÔNG lưu lại, nên đọc riêng teaching_timetable thường chỉ thấy ô trống.
     • Trường: location của buổi (1 trường) → periodSchools[i] → ô "Trường" của TKB lớp.
     • Giờ tiết: teaching_timetable_periods/{mãGV} ("Giờ tiết" GV tự đặt) — trang tự chuẩn hoá về khung mặc định khi chưa có.

   CHI PHÍ FIRESTORE (qua js/repositories/, lưu localStorage eduquiz_tkb_v2):
     • Mỗi tuần đang xem: 2 lượt get song song (Lịch tuần + TKB lớp). Giữ 6 giờ (tuần đã qua 30 ngày), kể cả tuần trống.
     • Tuần chưa có lớp nào: dùng tuần gần nhất đã có trên máy (TKB bàn giao áp dụng nhiều tuần). Máy chưa có tuần nào
       → 1 lần đọc các tuần Lịch tuần của GV (where teacherCode, số tuần GV đã nhập), tối đa 1 lần/3 ngày.
     • Giờ tiết: 1 get, giữ 3 ngày. Mã GV: hồ sơ có teacherCode → 0 lượt; Admin / xem GV khác → 1 lần danh sách giáo
       viên (cùng truy vấn với trang Lịch giảng dạy, không cần index ghép), giữ 3 ngày.
     • Lỗi (mất mạng, chưa có quyền): không thử lại trong 30 phút, dùng bản cũ trên máy nếu có; lỗi in ra console.
       Cùng 1 tuần đang đọc dở thì các lần gọi sau dùng chung 1 lượt.
   create({ repos, storage, now }) để test (js/so-lop/__tests__/tkb-source.test.js) — trang dùng EduSoLopTkb mặc định.
   ============================================================ */
(function (global) {
  'use strict';

  const KEY = 'eduquiz_tkb_v2';
  const OLD_KEYS = ['eduquiz_tkb_v1']; // bản 10/11 đọc nhầm teaching_timetable (thường trống) → bỏ
  const HOUR = 3600e3, DAY = 24 * HOUR;
  const CUR_TTL = 6 * HOUR, PAST_TTL = 30 * DAY, LIST_TTL = 3 * DAY, ERR_TTL = 30 * 60e3;
  const MAX_WEEKS = 16;
  const OWN_PERIODS = 5; // = TeachingSchedule.PERIODS_PER_SESSION
  const WEEKDAYS = ['2', '3', '4', '5', '6', '7'], SESSIONS = ['morning', 'afternoon'];

  const plain = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/\s+/g, ' ').trim();
  const str = (s) => (typeof s === 'string' ? s.trim() : '');
  const pad = (n) => String(n).padStart(2, '0');
  const weekKeyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const weekEnd = (wk) => { const [y, m, d] = wk.split('-').map(Number); return new Date(y, m - 1, d + 7).getTime(); };
  const cellOf = (raw) => (raw && typeof raw === 'object' ? { maLop: str(raw.maLop), truong: str(raw.truong) } : { maLop: str(raw), truong: '' });

  /** Lịch tuần + TKB lớp của 1 tuần → { "2".."7": { morning: [{ maLop, truong }], afternoon: [...] } } | null (không có lớp nào). */
  function mergeWeek(sched, tt) {
    const out = {};
    let any = false;
    WEEKDAYS.forEach((d) => {
      out[d] = {};
      SESSIONS.forEach((s) => {
        const sess = (sched && sched.days && sched.days[d] && sched.days[d][s]) || null;
        const ttc = ((tt && tt.days && tt.days[d] && tt.days[d][s]) || []).map(cellOf);
        const own = (sess && Array.isArray(sess.periods) ? sess.periods : []).map(str);
        const ownWins = own.some(Boolean), len = Math.max(OWN_PERIODS, own.length, ttc.length);
        const locs = String((sess && sess.location) || '').split(' + ').map((x) => x.trim()).filter(Boolean);
        const loc = locs.length === 1 ? locs[0] : '', ps = (sess && sess.periodSchools) || [];
        out[d][s] = Array.from({ length: len }, (_, i) => {
          const mine = ownWins && i < OWN_PERIODS, t = ttc[i] || { maLop: '', truong: '' };
          const maLop = mine ? own[i] || '' : t.maLop;
          if (maLop) any = true;
          return { maLop, truong: maLop ? (mine ? loc || str(ps[i]) || t.truong : t.truong || loc || str(ps[i])) : '' };
        });
      });
    });
    return any ? out : null;
  }

  function create(opts) {
    const o = opts || {};
    const now = o.now || (() => Date.now());
    const storage = o.storage || null;
    const repos = () => (typeof o.repos === 'function' ? o.repos() : o.repos) || null;
    const log = o.log || ((...a) => { try { console.warn('[Lịch dạy · TKB]', ...a); } catch (e) { /* không có console */ } });
    const inflight = new Map(), errAt = new Map();
    try { OLD_KEYS.forEach((k) => storage && storage.removeItem && storage.removeItem(k)); } catch (e) { /* bỏ qua */ }

    function load() {
      try { const v = JSON.parse(storage.getItem(KEY)); if (v && typeof v === 'object') return { w: v.w || {}, t: v.t || null, l: v.l || {}, p: v.p || {} }; } catch (e) { /* hỏng → làm lại */ }
      return { w: {}, t: null, l: {}, p: {} };
    }
    function save(st) {
      Object.keys(st.w).sort((a, b) => (a.split('__')[1] < b.split('__')[1] ? 1 : -1)).slice(MAX_WEEKS).forEach((k) => delete st.w[k]);
      try { storage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* đầy bộ nhớ: lần sau đọc lại */ }
    }
    const ttl = (wk) => (weekEnd(wk) <= now() ? PAST_TTL : CUR_TTL);
    const failedRecently = (k) => errAt.has(k) && now() - errAt.get(k) < ERR_TTL;
    const fail = (k, e) => { errAt.set(k, now()); log(k, (e && (e.code || e.message)) || e); };
    function once(k, fn) {
      if (inflight.has(k)) return inflight.get(k);
      const p = Promise.resolve().then(fn).finally(() => inflight.delete(k));
      inflight.set(k, p);
      return p;
    }

    /** Mã GV theo tên. '' = có danh sách mà không thấy tên · null = chưa đọc được danh sách (mạng / quyền / chưa có Firestore). */
    async function codeOf(name, profile) {
      const want = plain(name);
      if (!want) return '';
      const pn = plain(profile && (profile.name || profile.displayName));
      if (profile && profile.teacherCode && (!pn || pn === want)) return profile.teacherCode;
      const st = load();
      if (!(st.t && now() - st.t.at < LIST_TTL) && !failedRecently('teachers')) {
        const R = repos(), T = R && R.teachingTeacher;
        if (T && T.list) {
          try {
            // Cùng truy vấn với teaching-schedule.js (orderBy name, không where) — where active + orderBy cần index ghép
            const list = await once('teachers', () => T.list({ orderBy: 'name' }));
            const map = {};
            (list || []).filter((t) => t && t.name).sort((a, b) => (a.active === false) - (b.active === false))
              .forEach((t) => { const k = plain(t.name); if (!map[k]) map[k] = t.code || t.id; });
            st.t = { at: now(), map };
            save(st);
          } catch (e) { fail('teachers', e); }
        }
      }
      if (!st.t) return null;
      return st.t.map[want] || '';
    }

    /** "Giờ tiết" của GV (bản thô teaching_timetable_periods, null = chưa đặt → trang dùng khung mặc định). */
    async function periods(code) {
      if (!code) return null;
      const st = load(), e = st.p[code];
      if ((!e || now() - e.at >= LIST_TTL) && !failedRecently('periods:' + code)) {
        const R = repos(), P = R && R.teachingPeriodTimes;
        if (P && P.getById) {
          try {
            const doc = await once('periods:' + code, () => P.getById(code));
            const s2 = load();
            s2.p[code] = { at: now(), raw: doc ? { byDay: doc.byDay || null, morning: doc.morning || null, afternoon: doc.afternoon || null } : null };
            save(s2);
            return s2.p[code].raw;
          } catch (err) { fail('periods:' + code, err); }
        }
      }
      return e ? e.raw : null;
    }

    /** Lớp từng tiết tuần `monday` của GV `code` → { days (dạng TKB lớp), from (weekKey bản dùng), fallback } | null. */
    async function week(code, monday) {
      if (!code) return null;
      const wk = weekKeyOf(monday), id = `${code}__${wk}`;
      let st = load(), e = st.w[id];
      if ((!e || now() - e.at >= ttl(wk)) && !failedRecently(id)) {
        const R = repos();
        if (R && (R.teachingSchedule || R.teachingTimetable)) {
          try {
            const get = (repo) => (repo && repo.getById ? repo.getById(id) : Promise.resolve(null));
            const [sched, tt] = await once(id, () => Promise.all([get(R.teachingSchedule), get(R.teachingTimetable)]));
            st = load();
            st.w[id] = e = { at: now(), days: mergeWeek(sched, tt) };
            save(st);
          } catch (err) { fail(id, err); }
        }
      }
      if (e && e.days) return { days: e.days, from: wk, fallback: false };
      let best = pickNear(st, code, wk);
      const lk = 'list:' + code;
      if (!best && !(st.l[code] && now() - st.l[code] < LIST_TTL) && !failedRecently(lk)) {
        const R = repos(), S = R && R.teachingSchedule;
        if (S && S.list) {
          try {
            // Chỉ where 1 trường (Firestore tự có index) — listByTeacher() thêm orderBy weekKey nên cần index ghép; sắp ở dưới
            const rows = await once(lk, () => S.list({ where: [['teacherCode', '==', code]] }));
            st = load();
            (rows || []).filter((r) => r && r.weekKey).sort((a, b) => (a.weekKey < b.weekKey ? 1 : -1)).slice(0, MAX_WEEKS).forEach((r) => {
              const k = `${code}__${r.weekKey}`, days = mergeWeek(r, null);
              if (days && (!st.w[k] || !st.w[k].days)) st.w[k] = { at: now(), days };
            });
            st.l[code] = now();
            save(st);
            best = pickNear(load(), code, wk);
          } catch (err) { fail(lk, err); }
        }
      }
      return best ? { days: best.days, from: best.wk, fallback: true } : null;
    }
    function pickNear(st, code, wk) {
      const have = Object.keys(st.w).filter((k) => k.startsWith(code + '__') && st.w[k] && st.w[k].days)
        .map((k) => ({ wk: k.slice(code.length + 2), days: st.w[k].days }));
      const before = have.filter((x) => x.wk <= wk).sort((a, b) => (a.wk < b.wk ? 1 : -1))[0];
      return before || have.filter((x) => x.wk > wk).sort((a, b) => (a.wk < b.wk ? -1 : 1))[0] || null;
    }

    return { codeOf, week, periods, weekKeyOf };
  }

  global.EduSoLopTkb = create({ repos: () => global.EduRepositories, storage: (() => { try { return global.localStorage; } catch (e) { return null; } })() });
  global.EduSoLopTkb.create = create;
  global.EduSoLopTkb.mergeWeek = mergeWeek;
})(typeof window !== 'undefined' ? window : globalThis);
