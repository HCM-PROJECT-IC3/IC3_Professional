/* ============================================================
   js/thi-dua/thi-dua-core.js — LOGIC THUẦN của trang "Thi đua lớp học" (thi-dua.html).
   Không đụng DOM/mạng → chạy được trong Node (js/thi-dua/__tests__/thi-dua-core.test.js).

   Mô hình (1 giáo viên dạy NHIỀU lớp — mỗi lớp 1 bảng thi đua riêng):
     state   { v, cur, classes: { [id]: cls }, criteria: { plus:[], minus:[] } (lớp bộ môn),
               criteriaCN: { plus:[], minus:[] } (lớp chủ nhiệm), rewards: [] }
     cls     { id, name, kind: 'gvbm'|'gvcn', groups: ['Tổ 1', ...], students: [{ id, name, group }], log: [entry] }
   GVBM (dạy nhiều lớp, vài tiết/tuần): tiêu chí học tập theo môn, so sánh các lớp mình dạy.
   GVCN (1 lớp cả tuần): tiêu chí nề nếp, tổ trực nhật xoay vòng, sơ kết tuần + tin nhắn phụ huynh.
     entry   { id, t, ids:[studentId], delta, reason, kind: 'award'|'redeem' }
   Điểm KHÔNG lưu riêng mà tính từ log → hoàn tác = bỏ entry cuối, sao lưu/khôi phục không lệch.
     earned  = tổng điểm thưởng/nhắc nhở (xếp hạng thi đua — đổi quà không làm tụt hạng)
     spent   = điểm đã dùng đổi quà;  balance = earned − spent (điểm còn để đổi quà)
   Log giữ tối đa LOG_MAX entry/lớp: entry cũ nhất được "gộp" vào carry của từng em để điểm không mất.
   ============================================================ */
(function (global) {
  'use strict';

  const VERSION = 1;
  const LOG_MAX = 1500;
  const MAX_STUDENTS = 80;
  const MAX_GROUPS = 12;
  const clean = (s, n = 60) => String(s == null ? '' : s).replace(/[<>\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
  let seq = 0;
  const uid = (p) => p + Date.now().toString(36) + (seq++).toString(36) + Math.random().toString(36).slice(2, 6);

  const DEFAULT_CRITERIA = {
    plus: [
      { id: 'p-speak', label: 'Phát biểu xây dựng bài', points: 1, icon: 'fa-hand' },
      { id: 'p-done', label: 'Hoàn thành bài thực hành', points: 2, icon: 'fa-circle-check' },
      { id: 'p-help', label: 'Giúp đỡ bạn', points: 1, icon: 'fa-heart' },
      { id: 'p-ic3', label: 'Bài IC3 đạt từ 90%', points: 2, icon: 'fa-star' },
      { id: 'p-tidy', label: 'Giữ máy, chỗ ngồi gọn gàng', points: 1, icon: 'fa-thumbs-up' },
    ],
    minus: [
      { id: 'm-talk', label: 'Nói chuyện riêng', points: -1, icon: 'fa-comment' },
      { id: 'm-game', label: 'Dùng máy sai mục đích', points: -2, icon: 'fa-gamepad' },
      { id: 'm-late', label: 'Chưa hoàn thành bài', points: -1, icon: 'fa-hourglass-half' },
    ],
  };
  // Lớp chủ nhiệm: nề nếp cả tuần (sơ kết thứ Sáu/thứ Bảy)
  const DEFAULT_CRITERIA_CN = {
    plus: [
      { id: 'cn-speak', label: 'Hăng hái phát biểu', points: 1, icon: 'fa-hand' },
      { id: 'cn-good', label: 'Điểm tốt trong ngày', points: 2, icon: 'fa-star' },
      { id: 'cn-help', label: 'Giúp đỡ bạn', points: 1, icon: 'fa-heart' },
      { id: 'cn-duty', label: 'Trực nhật tốt', points: 1, icon: 'fa-circle-check' },
      { id: 'cn-move', label: 'Tham gia phong trào', points: 2, icon: 'fa-flag' },
    ],
    minus: [
      { id: 'cn-late', label: 'Đi học muộn', points: -1, icon: 'fa-clock' },
      { id: 'cn-uni', label: 'Thiếu đồng phục, khăn quàng', points: -1, icon: 'fa-user-xmark' },
      { id: 'cn-hw', label: 'Không làm bài tập về nhà', points: -1, icon: 'fa-book' },
      { id: 'cn-talk', label: 'Mất trật tự', points: -1, icon: 'fa-comment' },
      { id: 'cn-clean', label: 'Không trực nhật', points: -2, icon: 'fa-triangle-exclamation' },
    ],
  };
  const KINDS = { gvbm: 'Lớp bộ môn', gvcn: 'Lớp chủ nhiệm' };
  const DEFAULT_REWARDS = [
    { id: 'r-sticker', label: 'Nhãn dán ngôi sao', cost: 5, icon: 'fa-star' },
    { id: 'r-seat', label: 'Chọn chỗ ngồi 1 buổi', cost: 10, icon: 'fa-location-dot' },
    { id: 'r-music', label: 'Chọn nhạc giờ thực hành', cost: 15, icon: 'fa-volume-high' },
    { id: 'r-helper', label: 'Làm trợ giảng 1 tiết', cost: 20, icon: 'fa-chalkboard-user' },
  ];

  function emptyState() {
    const copy = (x) => JSON.parse(JSON.stringify(x));
    return { v: VERSION, cur: '', classes: {}, criteria: copy(DEFAULT_CRITERIA), criteriaCN: copy(DEFAULT_CRITERIA_CN), rewards: copy(DEFAULT_REWARDS) };
  }
  /** Bộ tiêu chí của lớp (sửa trực tiếp object trả về = sửa bộ dùng chung của loại lớp đó). */
  function criteriaFor(state, cls) { return cls && cls.kind === 'gvcn' ? state.criteriaCN : state.criteria; }

  /** Chia tổ lần lượt theo thứ tự danh sách (1,2,3,1,2,3…) — giống cách xếp chỗ thường gặp. */
  function groupNames(n) {
    const k = Math.max(1, Math.min(MAX_GROUPS, n | 0));
    return Array.from({ length: k }, (_, i) => `Tổ ${i + 1}`);
  }
  function newClass(name, names, groupCount = 4, kind = 'gvbm') {
    const groups = groupNames(groupCount);
    const seen = new Set();
    const students = [];
    (names || []).forEach((raw) => {
      const n = clean(raw);
      const k = n.toLowerCase();
      if (!n || seen.has(k) || students.length >= MAX_STUDENTS) return;
      seen.add(k);
      students.push({ id: uid('s'), name: n, group: groups[students.length % groups.length], carry: 0, carrySpent: 0 });
    });
    return { id: uid('c'), name: clean(name, 40) || 'Lớp mới', kind: KINDS[kind] ? kind : 'gvbm', groups, students, log: [] };
  }
  /** Thêm học sinh mới vào lớp (bỏ trùng tên), xếp vào tổ đang ít người nhất. */
  function addStudents(cls, names) {
    const have = new Set(cls.students.map((s) => s.name.toLowerCase()));
    let added = 0;
    (names || []).forEach((raw) => {
      const n = clean(raw);
      if (!n || have.has(n.toLowerCase()) || cls.students.length >= MAX_STUDENTS) return;
      have.add(n.toLowerCase());
      const size = (g) => cls.students.filter((s) => s.group === g).length;
      const group = cls.groups.slice().sort((a, b) => size(a) - size(b))[0];
      cls.students.push({ id: uid('s'), name: n, group, carry: 0, carrySpent: 0 });
      added++;
    });
    return added;
  }
  function setGroupCount(cls, n) {
    cls.groups = groupNames(n);
    cls.students.forEach((s, i) => { s.group = cls.groups[i % cls.groups.length]; });
  }

  function trimLog(cls) {
    while (cls.log.length > LOG_MAX) {
      const e = cls.log.shift();
      e.ids.forEach((id) => {
        const s = cls.students.find((x) => x.id === id);
        if (!s) return;
        if (e.kind === 'redeem') s.carrySpent = (s.carrySpent || 0) - e.delta;
        else s.carry = (s.carry || 0) + e.delta;
      });
    }
  }

  /** Cộng/trừ điểm cho 1 hoặc nhiều em. @returns entry (null nếu không có em hợp lệ) */
  function award(cls, ids, delta, reason, now = Date.now()) {
    const valid = (ids || []).filter((id) => cls.students.some((s) => s.id === id));
    const d = Math.round(Number(delta) || 0);
    if (!valid.length || !d || Math.abs(d) > 100) return null;
    const e = { id: uid('e'), t: now, ids: [...new Set(valid)], delta: d, reason: clean(reason, 80), kind: 'award' };
    cls.log.push(e);
    trimLog(cls);
    return e;
  }

  /** Điểm từng em: { [id]: { earned, spent, balance, plus, minus } } */
  function scores(cls) {
    const out = {};
    cls.students.forEach((s) => { out[s.id] = { earned: s.carry || 0, spent: s.carrySpent || 0, plus: 0, minus: 0 }; });
    cls.log.forEach((e) => e.ids.forEach((id) => {
      const o = out[id];
      if (!o) return;
      if (e.kind === 'redeem') o.spent -= e.delta;
      else {
        o.earned += e.delta;
        if (e.delta > 0) o.plus += e.delta; else o.minus -= e.delta;
      }
    }));
    Object.values(out).forEach((o) => { o.balance = o.earned - o.spent; });
    return out;
  }

  /** Đổi quà: trừ vào điểm còn lại (không đổi điểm thi đua). */
  function redeem(cls, studentId, reward, now = Date.now()) {
    const sc = scores(cls)[studentId];
    const cost = Math.round(Number(reward && reward.cost) || 0);
    if (!sc) return { ok: false, error: 'Không tìm thấy học sinh.' };
    if (cost <= 0) return { ok: false, error: 'Phần thưởng chưa có giá điểm.' };
    if (sc.balance < cost) return { ok: false, error: `Cần ${cost} điểm, em còn ${sc.balance} điểm.` };
    const e = { id: uid('e'), t: now, ids: [studentId], delta: -cost, reason: clean(reward.label, 80), kind: 'redeem' };
    cls.log.push(e);
    trimLog(cls);
    return { ok: true, entry: e };
  }

  function undo(cls) { return cls.log.pop() || null; }

  const byName = (a, b) => a.name.localeCompare(b.name, 'vi');
  /** Bảng xếp hạng theo điểm thi đua; bằng điểm → cùng hạng, xếp theo tên. */
  function leaderboard(cls) {
    const sc = scores(cls);
    const list = cls.students.map((s) => Object.assign({}, s, sc[s.id])).sort((a, b) => (b.earned - a.earned) || byName(a, b));
    let rank = 0;
    return list.map((s, i) => { if (!i || list[i - 1].earned !== s.earned) rank = i + 1; return Object.assign(s, { rank }); });
  }

  /** Thi đua tổ: tổng điểm + điểm TB/em (tổ đông người không tự nhiên thắng). Xếp theo TB rồi tổng. */
  function groupBoard(cls) {
    const sc = scores(cls);
    return cls.groups.map((g) => {
      const members = cls.students.filter((s) => s.group === g);
      const total = members.reduce((n, s) => n + sc[s.id].earned, 0);
      return { group: g, members: members.length, total, avg: members.length ? Math.round((total / members.length) * 10) / 10 : 0 };
    }).sort((a, b) => (b.avg - a.avg) || (b.total - a.total) || a.group.localeCompare(b.group, 'vi', { numeric: true }));
  }

  /** Hoạt động gần đây, mới nhất trước: [{ t, names, delta, reason, kind }] */
  function recent(cls, n = 20) {
    const nameOf = new Map(cls.students.map((s) => [s.id, s.name]));
    return cls.log.slice(-n).reverse().map((e) => ({
      t: e.t, delta: e.delta, reason: e.reason, kind: e.kind,
      names: e.ids.map((id) => nameOf.get(id)).filter(Boolean),
    }));
  }

  /** Điểm cộng trong khoảng [fromMs, now] — "Ngôi sao tuần này". */
  function earnedSince(cls, fromMs) {
    const out = {};
    cls.log.forEach((e) => {
      if (e.kind !== 'award' || e.t < fromMs) return;
      e.ids.forEach((id) => { out[id] = (out[id] || 0) + e.delta; });
    });
    return out;
  }

  // ── Kết quả IC3 → điểm thi đua + "Hoa điểm 10" ──
  // rows: bản ghi mã kết quả đã giải (js/services/result-pack.js: id, n tên, c lớp, t bài, p %, pt điểm thử thách).
  const IMPORT_RULES = [{ min: 100, points: 3, label: 'Điểm 10' }, { min: 90, points: 2, label: 'Bài IC3 từ 90%' }];
  const IMPORTED_MAX = 5000;
  const HONORS_MAX = 300;
  const nameKey = (s) => String(s || '').normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
  const shortTest = (t) => String(t || '').split(' › ').pop();

  /** Các lớp ghi trong mã kết quả (bỏ mã Thử thách hôm nay) + lớp đoán khớp tên bảng thi đua. */
  function resultClasses(cls, rows) {
    const names = new Set(cls.students.map((s) => nameKey(s.name)));
    const count = {};
    rows.forEach((r) => { if (r.pt == null && r.c && names.has(nameKey(r.n))) count[r.c] = (count[r.c] || 0) + 1; });
    const list = Object.keys(count).sort((a, b) => (count[b] - count[a]) || a.localeCompare(b, 'vi', { numeric: true }));
    const title = nameKey(cls.name);
    const guess = list.find((c) => new RegExp(`(^|[^a-z0-9])${nameKey(c).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`).test(title)) || list[0] || '';
    return { list, guess, count };
  }

  /**
   * Cộng điểm cho bài đạt mốc (mỗi mã bài 1 lần) + ghi "Hoa điểm 10" cho bài 100%.
   * @param {{ className?: string, now?: number }} opts className: chỉ nhận bài của lớp này (chống trùng tên giữa các lớp)
   * @returns {{ awarded:number, points:number, perfect:number, already:number, unmatched:string[], low:number }}
   */
  function importResults(cls, rows, { className = '', now = Date.now() } = {}) {
    cls.imported = cls.imported || {};
    cls.honors = cls.honors || [];
    const byName = new Map(cls.students.map((s) => [nameKey(s.name), s]));
    const out = { awarded: 0, points: 0, perfect: 0, already: 0, unmatched: [], low: 0 };
    const unmatched = new Set();
    (rows || []).forEach((r) => {
      if (!r || !r.id || r.pt != null) return; // bỏ mã Thử thách hôm nay (đã có bảng xếp hạng riêng)
      if (className && nameKey(r.c) !== nameKey(className)) return;
      const s = byName.get(nameKey(r.n));
      if (!s) { unmatched.add(r.n); return; }
      if (cls.imported[r.id]) { out.already++; return; }
      const rule = IMPORT_RULES.find((x) => Number(r.p) >= x.min);
      cls.imported[r.id] = now;
      if (!rule) { out.low++; return; }
      if (award(cls, [s.id], rule.points, `${rule.label} · ${shortTest(r.t)}`.slice(0, 80), now)) { out.awarded++; out.points += rule.points; }
      if (rule.min === 100) {
        out.perfect++;
        cls.honors.push({ sid: s.id, t: clean(shortTest(r.t), 80), at: now });
      }
    });
    // Giới hạn dung lượng: bỏ mã cũ nhất / vinh danh cũ nhất
    const ids = Object.keys(cls.imported);
    if (ids.length > IMPORTED_MAX) ids.sort((a, b) => cls.imported[a] - cls.imported[b]).slice(0, ids.length - IMPORTED_MAX).forEach((k) => delete cls.imported[k]);
    if (cls.honors.length > HONORS_MAX) cls.honors.splice(0, cls.honors.length - HONORS_MAX);
    out.unmatched = [...unmatched].sort((a, b) => a.localeCompare(b, 'vi'));
    return out;
  }

  /** Bảng "Hoa điểm 10": mỗi em đạt 100% bao nhiêu bài, bài gần nhất. Nhiều bài trước, rồi mới đạt trước. */
  function honorBoard(cls) {
    const by = new Map();
    (cls.honors || []).forEach((h) => {
      const s = cls.students.find((x) => x.id === h.sid);
      if (!s) return;
      const e = by.get(s.id) || { id: s.id, name: s.name, group: s.group, count: 0, tests: [], last: 0 };
      e.count++;
      if (!e.tests.includes(h.t)) e.tests.push(h.t);
      e.last = Math.max(e.last, h.at);
      by.set(s.id, e);
    });
    return [...by.values()].sort((a, b) => (b.count - a.count) || (b.last - a.last) || a.name.localeCompare(b.name, 'vi'));
  }

  // ── Sơ kết tuần (GVCN + GVBM) ──
  const DAY = 864e5;
  /** [thứ Hai 0h, thứ Hai tuần sau 0h) theo giờ máy. offset 0 = tuần này, −1 = tuần trước. */
  function weekBounds(offset = 0, now = Date.now()) {
    const d = new Date(now); d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + 7 * offset);
    const from = d.getTime();
    const e = new Date(from); e.setDate(e.getDate() + 7);
    return { from, to: e.getTime() };
  }
  const dm = (ms) => { const d = new Date(ms); return `${d.getDate()}/${d.getMonth() + 1}`; };
  const weekLabel = (b) => `${dm(b.from)}–${dm(b.to - DAY)}`;

  /**
   * Tổng hợp 1 tuần: mỗi em (cộng, trừ, lý do), tổ, lý do hay gặp.
   * @returns {{ students: Array<{id,name,group,plus,minus,net,reasons:Object<string,{n,pts}>}>, groups, top, reminders, reasonCounts, entries }}
   */
  function weekSummary(cls, { from, to }) {
    const by = new Map(cls.students.map((s) => [s.id, { id: s.id, name: s.name, group: s.group, plus: 0, minus: 0, net: 0, reasons: {} }]));
    const reasonCounts = {};
    let entries = 0;
    cls.log.forEach((e) => {
      if (e.kind !== 'award' || e.t < from || e.t >= to) return;
      entries++;
      const r = e.reason || (e.delta > 0 ? 'Cộng điểm' : 'Trừ điểm');
      e.ids.forEach((id) => {
        const s = by.get(id);
        if (!s) return;
        if (e.delta > 0) s.plus += e.delta; else s.minus -= e.delta;
        s.net += e.delta;
        const k = s.reasons[r] || (s.reasons[r] = { n: 0, pts: 0 });
        k.n++; k.pts += e.delta;
        const c = reasonCounts[r] || (reasonCounts[r] = { n: 0, pts: 0, sign: Math.sign(e.delta) });
        c.n++; c.pts += e.delta;
      });
    });
    const students = [...by.values()];
    const byName = (a, b) => a.name.localeCompare(b.name, 'vi');
    const groups = cls.groups.map((g) => {
      const m = students.filter((s) => s.group === g);
      const net = m.reduce((n, s) => n + s.net, 0);
      return { group: g, members: m.length, net, avg: m.length ? Math.round((net / m.length) * 10) / 10 : 0 };
    }).sort((a, b) => (b.avg - a.avg) || (b.net - a.net) || a.group.localeCompare(b.group, 'vi', { numeric: true }));
    return {
      students, groups, entries, reasonCounts,
      top: students.filter((s) => s.net > 0).sort((a, b) => (b.net - a.net) || byName(a, b)).slice(0, 5),
      reminders: students.filter((s) => s.minus >= 2).sort((a, b) => (b.minus - a.minus) || byName(a, b)),
    };
  }
  const reasonList = (reasons, sign) => Object.entries(reasons).filter(([, v]) => Math.sign(v.pts) === sign)
    .sort((a, b) => Math.abs(b[1].pts) - Math.abs(a[1].pts)).map(([r, v]) => (v.n > 1 ? `${r} ×${v.n}` : r));

  /** Tin nhắn sơ kết tuần gửi nhóm lớp (không nêu tên em bị nhắc nhở — nhắc riêng). */
  function classMessage(cls, sum, bounds) {
    const lines = [`SƠ KẾT TUẦN ${weekLabel(bounds)} — ${cls.name}`];
    if (!sum.entries) return lines.concat('Tuần này chưa có ghi nhận thi đua.').join('\n');
    if (sum.groups.length > 1 && sum.groups[0].net > 0) lines.push(`🏆 Tổ dẫn đầu: ${sum.groups[0].group} (TB ${sum.groups[0].avg} điểm/bạn)`);
    if (sum.top.length) lines.push(`⭐ Tuyên dương: ${sum.top.map((s) => `${s.name} (+${s.net})`).join(', ')}`);
    const good = Object.entries(sum.reasonCounts).filter(([, v]) => v.sign > 0).sort((a, b) => b[1].n - a[1].n).slice(0, 3);
    if (good.length) lines.push(`👍 Cả lớp làm tốt: ${good.map(([r, v]) => `${r} (${v.n} lượt)`).join(', ')}`);
    const bad = Object.entries(sum.reasonCounts).filter(([, v]) => v.sign < 0).sort((a, b) => b[1].n - a[1].n).slice(0, 2);
    if (bad.length) lines.push(`📌 Cần cố gắng: ${bad.map(([r, v]) => `${r} (${v.n} lượt)`).join(', ')}`);
    return lines.join('\n');
  }

  /** Tin nhắn riêng cho phụ huynh 1 em (GVCN gửi Zalo). total = điểm thi đua tích luỹ. */
  function parentMessage(cls, st, bounds, { total = null, teacher = '' } = {}) {
    const plus = reasonList(st.reasons, 1);
    const minus = reasonList(st.reasons, -1);
    const lines = [`Kính gửi phụ huynh em ${st.name} (${cls.name}),`, `Tuần ${weekLabel(bounds)}:`];
    if (!plus.length && !minus.length) lines.push('- Em chưa có ghi nhận thi đua trong tuần.');
    if (plus.length) lines.push(`- Được khen: ${plus.join(', ')} (+${st.plus} điểm).`);
    if (minus.length) lines.push(`- Cần nhắc nhở: ${minus.join(', ')} (−${st.minus} điểm).`);
    if (total != null) lines.push(`- Điểm thi đua tích luỹ: ${total}.`);
    lines.push(minus.length > plus.length ? 'Mong gia đình nhắc nhở thêm để em tiến bộ. Trân trọng cảm ơn!' : 'Cảm ơn gia đình đã đồng hành cùng em!');
    if (teacher) lines.push(clean(teacher, 60));
    return lines.join('\n');
  }

  /** Tổ trực nhật tuần (lớp chủ nhiệm): xoay vòng theo số tuần, dutyShift = giáo viên dời lượt. */
  function dutyGroup(cls, now = Date.now()) {
    if (!cls.groups.length) return '';
    const week = Math.floor((weekBounds(0, now).from + 4 * DAY) / (7 * DAY)); // +4 ngày: mốc 1/1/1970 là thứ Năm
    const n = cls.groups.length;
    return cls.groups[(((week + (cls.dutyShift | 0)) % n) + n) % n];
  }

  /** So sánh các lớp cùng loại trong 1 tuần (GVBM dạy nhiều lớp). Xếp theo điểm TB/em. */
  function compareClasses(state, bounds, kind = 'gvbm') {
    return Object.values(state.classes).filter((c) => (c.kind || 'gvbm') === kind).map((c) => {
      const sum = weekSummary(c, bounds);
      const net = sum.students.reduce((n, s) => n + s.net, 0);
      return {
        id: c.id, name: c.name, students: c.students.length,
        active: sum.students.filter((s) => s.plus > 0).length,
        plus: sum.students.reduce((n, s) => n + s.plus, 0), minus: sum.students.reduce((n, s) => n + s.minus, 0),
        avg: c.students.length ? Math.round((net / c.students.length) * 10) / 10 : 0,
      };
    }).sort((a, b) => (b.avg - a.avg) || (b.plus - a.plus) || a.name.localeCompare(b.name, 'vi', { numeric: true }));
  }

  function csvCell(v) {
    let s = String(v == null ? '' : v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  }
  function toCsv(cls) {
    const head = ['Hạng', 'Họ và tên', 'Tổ', 'Điểm thi đua', 'Điểm cộng', 'Điểm trừ', 'Đã đổi quà', 'Điểm còn lại'];
    const rows = leaderboard(cls).map((s) => [s.rank, s.name, s.group, s.earned, s.plus, s.minus, s.spent, s.balance]);
    return '﻿' + [head].concat(rows).map((r) => r.map(csvCell).join(',')).join('\r\n');
  }

  /** Kiểm tra + chuẩn hoá state đọc từ localStorage / file sao lưu. Trả null nếu không dùng được. */
  function normalize(raw) {
    if (!raw || typeof raw !== 'object' || !raw.classes || typeof raw.classes !== 'object') return null;
    const st = emptyState();
    if (raw.criteria && Array.isArray(raw.criteria.plus) && Array.isArray(raw.criteria.minus)) {
      const crit = (c, sign) => ({ id: clean(c.id, 40) || uid('k'), label: clean(c.label, 60), icon: /^fa-[a-z0-9-]+$/.test(c.icon) ? c.icon : 'fa-star',
        points: sign * Math.max(1, Math.min(20, Math.abs(Math.round(Number(c.points) || 1)))) });
      st.criteria = { plus: raw.criteria.plus.filter((c) => c && c.label).map((c) => crit(c, 1)), minus: raw.criteria.minus.filter((c) => c && c.label).map((c) => crit(c, -1)) };
      if (raw.criteriaCN && Array.isArray(raw.criteriaCN.plus) && Array.isArray(raw.criteriaCN.minus)) {
        st.criteriaCN = { plus: raw.criteriaCN.plus.filter((c) => c && c.label).map((c) => crit(c, 1)), minus: raw.criteriaCN.minus.filter((c) => c && c.label).map((c) => crit(c, -1)) };
      }
    }
    if (Array.isArray(raw.rewards)) {
      st.rewards = raw.rewards.filter((r) => r && r.label).map((r) => ({ id: clean(r.id, 40) || uid('r'), label: clean(r.label, 60),
        cost: Math.max(1, Math.min(999, Math.round(Number(r.cost) || 1))), icon: /^fa-[a-z0-9-]+$/.test(r.icon) ? r.icon : 'fa-gem' }));
    }
    Object.values(raw.classes).forEach((c) => {
      if (!c || !Array.isArray(c.students)) return;
      const groups = Array.isArray(c.groups) && c.groups.length ? c.groups.map((g) => clean(g, 30)).filter(Boolean).slice(0, MAX_GROUPS) : groupNames(4);
      const students = c.students.filter((s) => s && s.id && s.name).slice(0, MAX_STUDENTS).map((s) => ({
        id: clean(s.id, 40), name: clean(s.name), group: groups.includes(s.group) ? s.group : groups[0],
        carry: Math.round(Number(s.carry) || 0), carrySpent: Math.round(Number(s.carrySpent) || 0),
      }));
      const ids = new Set(students.map((s) => s.id));
      const log = (Array.isArray(c.log) ? c.log : []).filter((e) => e && Array.isArray(e.ids) && Number.isFinite(Number(e.delta))).map((e) => ({
        id: clean(e.id, 40) || uid('e'), t: Number(e.t) || 0, ids: e.ids.filter((id) => ids.has(id)), delta: Math.round(Number(e.delta)),
        reason: clean(e.reason, 80), kind: e.kind === 'redeem' ? 'redeem' : 'award',
      })).filter((e) => e.ids.length);
      const id = clean(c.id, 40) || uid('c');
      const imported = {};
      if (c.imported && typeof c.imported === 'object') Object.keys(c.imported).slice(-IMPORTED_MAX).forEach((k) => { imported[clean(k, 40)] = Number(c.imported[k]) || 0; });
      const honors = (Array.isArray(c.honors) ? c.honors : []).filter((h) => h && ids.has(h.sid))
        .slice(-HONORS_MAX).map((h) => ({ sid: h.sid, t: clean(h.t, 80), at: Number(h.at) || 0 }));
      st.classes[id] = { id, name: clean(c.name, 40) || 'Lớp', kind: KINDS[c.kind] ? c.kind : 'gvbm', dutyShift: Math.round(Number(c.dutyShift) || 0) % 12, groups, students, log, imported, honors };
      trimLog(st.classes[id]);
    });
    st.cur = st.classes[raw.cur] ? raw.cur : (Object.keys(st.classes)[0] || '');
    st.sign = clean(raw.sign, 60); // chữ ký cuối tin nhắn phụ huynh
    return st;
  }

  const api = {
    VERSION, LOG_MAX, DEFAULT_CRITERIA, DEFAULT_REWARDS,
    emptyState, newClass, addStudents, setGroupCount, award, redeem, undo,
    scores, leaderboard, groupBoard, recent, earnedSince, toCsv, normalize,
    IMPORT_RULES, resultClasses, importResults, honorBoard,
    KINDS, DEFAULT_CRITERIA_CN, criteriaFor, weekBounds, weekLabel, weekSummary, classMessage, parentMessage, dutyGroup, compareClasses,
  };
  global.EduThiDua = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
