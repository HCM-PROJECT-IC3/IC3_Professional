/* ============================================================
   js/so-lop/so-lop-core.js — đọc "FORM QUẢN LÝ LỚP" của Điều phối đào tạo (Google Sheet chia sẻ
   "Bất kỳ ai có đường liên kết") cho trang Điểm danh & tiến độ (diem-danh.html).
   Một giáo viên dạy nhiều trường, mỗi trường 1 điều phối với cách ghi hơi khác nhau — đọc được cả:
     • "Bài 7" · "Bài 4-5" · "Bài 4 + 5" · "Giới Thiệu + Bài 1" · "Bài 12: Tìm kiếm..." · chỉ tên bài
       ("Tìm hiểu cơ bản về phần cứng" → khớp tên bộ "Bài N." của cấp đó) · "Ôn tập CĐ1"
     • TÊN GV ghi chung 1 ô ("TÊN GV Nguyễn Hoài Bảo") hoặc từng tiết 1 người (lớp nhiều GV dạy luân phiên)
     • 1 tiết/buổi hoặc 2 tiết/buổi cùng ngày (dán điểm danh cho cả 2 cột)
   Hàm thuần, không gọi mạng (test: js/so-lop/__tests__/so-lop-core.test.js):
     parsePaste(text) → { sheets: [{ id, label }], folders: [{ id, url, label }] }   ("Trường: link" mỗi dòng)
     parseLinks · parseTabs · isClassTab · parseCSV · mark · parseClass
     lessonOf(text) · matchName(text, names, prev) · lessonsOf(sessions, names)
     todaySession · nextSession · sessionGroup · dateOf · summary · stats · pasteText · cellRef · isMine
     teacherKey · teachersOf · taughtBy · mondayOf · weekPlan · monthCount · monthLog   (lọc theo GV + lịch giảng dạy, bảng công)
     watchList(cls) → học sinh vắng nhiều / vắng liền · untickedSessions → tiết đã qua chưa tick Hoàn thành
   Ký hiệu điểm danh như hướng dẫn trên Sheet: X có mặt · V vắng · NL nghỉ luôn · Mới học sinh mới.
   ============================================================ */
(function (global) {
  'use strict';

  const norm = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  const up = (s) => norm(s).toLocaleUpperCase('vi');
  const low = (s) => norm(s).toLocaleLowerCase('vi');

  // ── Link ──
  const SHEET_RE = /https?:\/\/docs\.google\.com\/spreadsheets\/d\/([A-Za-z0-9_-]{20,})[^\s]*/g;
  const FOLDER_RE = /https?:\/\/drive\.google\.com\/(?:drive\/(?:u\/\d+\/)?folders\/|open\?id=)([A-Za-z0-9_-]{20,})[^\s]*/g;
  function parseLinks(text) {
    const out = [];
    String(text || '').replace(/spreadsheets\/d\/([A-Za-z0-9_-]{20,})/g, (m, id) => { if (!out.includes(id)) out.push(id); return m; });
    return out;
  }
  /** Đoạn dán kiểu "THCS Mạch Kiếm Hùng: <link>" (link cùng dòng hoặc dòng dưới tên trường) → link kèm nhãn trường. */
  function parsePaste(text) {
    const sheets = [], folders = [];
    let pending = '';
    String(text || '').split(/\r?\n/).forEach((line) => {
      const urls = [];
      line.replace(SHEET_RE, (m, id) => { urls.push({ kind: 's', id, url: m }); return m; })
        .replace(FOLDER_RE, (m, id) => { urls.push({ kind: 'f', id, url: m }); return m; });
      const label = norm(line.replace(SHEET_RE, ' ').replace(FOLDER_RE, ' ').replace(/https?:\/\/\S+/g, ' ')).replace(/[:\-–|]+$/, '').trim();
      if (!urls.length) { if (label) pending = label; return; }
      const lb = label || pending;
      pending = '';
      urls.forEach((u) => {
        if (u.kind === 's') { if (!sheets.some((x) => x.id === u.id)) sheets.push({ id: u.id, label: lb }); }
        else if (!folders.some((x) => x.id === u.id)) folders.push({ id: u.id, url: `https://drive.google.com/drive/folders/${u.id}`, label: lb });
      });
    });
    return { sheets, folders };
  }

  const unesc = (s) => s.replace(/\\x([0-9a-f]{2})/gi, (m, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\u([0-9a-f]{4})/gi, (m, h) => String.fromCharCode(parseInt(h, 16))).replace(/\\(.)/g, '$1');
  function parseTabs(html) {
    const s = String(html || '');
    const t = /<title>([^<]*)<\/title>/.exec(s);
    const title = t ? norm(t[1].replace(/\s*-\s*Google (Drive|Trang tính|Sheets)\s*$/i, '')) : '';
    const tabs = [];
    const re = /items\.push\(\{name: "((?:[^"\\]|\\.)*)"[^}]*?gid: "(\d+)"/g;
    let m;
    while ((m = re.exec(s))) tabs.push({ name: norm(unesc(m[1])), gid: m[2] });
    return { title: title.replace(/&amp;/g, '&'), tabs };
  }
  const isClassTab = (name) => /^\d{1,2}\s*[A-Za-z/.]\s*\d*/.test(norm(name));

  function parseCSV(text) {
    const rows = [];
    let row = [], cell = '', q = false;
    const s = String(text || '');
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (q) {
        if (c === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && s[i + 1] === '\n') i++;
        row.push(cell); rows.push(row); row = []; cell = '';
      } else cell += c;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }

  /** Ký hiệu điểm danh → 'x' | 'v' | 'nl' | 'moi' | '' ; ô ghi thứ khác (số phòng, ghi chú) → '?' — không tính. */
  function mark(v) {
    const t = low(v);
    if (!t || t === '#n/a') return '';
    if (t === 'x') return 'x';
    if (t === 'v' || t === 'vắng' || t === 'p' || t === 'kp') return 'v';
    if (t === 'nl' || t === 'nghỉ luôn') return 'nl';
    if (t === 'mới' || t === 'moi') return 'moi';
    return '?';
  }
  const SHEET_MARK = { x: 'x', v: 'v', nl: 'NL', moi: 'Mới' };
  const PLACEHOLDER = /^\(.*\)$/; // "(Tên lót + Tên)" — chữ mẫu điều phối để sẵn
  // Ô GV của tiết ghi ghi chú thay vì tên ("Trường nghỉ", "Nghỉ lễ", "Hoãn") → không phải giáo viên
  const NOT_TEACHER = /nghỉ|lễ|hoãn|tết|thi|không dạy|bù/i;
  const cleanGV = (g) => { const t = norm(g).replace(/^[:\-–\s]+/, ''); return !t || PLACEHOLDER.test(t) || NOT_TEACHER.test(t) ? '' : t; };

  /** Bảng của 1 tab lớp → dữ liệu. Không thấy dòng TIẾT/BÀI DẠY → null (không phải tab lớp). */
  function parseClass(rows) {
    rows = rows || [];
    const find = (label) => {
      for (let r = 0; r < Math.min(rows.length, 40); r++) {
        const c = (rows[r] || []).findIndex((x) => up(x) === label || (label === 'TÊN GV' && up(x).startsWith(label)));
        if (c >= 0) return { r, c };
      }
      return null;
    };
    const tiet = find('TIẾT'), bai = find('BÀI DẠY');
    if (!tiet || !bai) return null;
    const thu = find('THỨ'), ngay = find('NGÀY'), done = find('ĐÃ HOÀN THÀNH'), gv = find('TÊN GV');
    const head = (k) => { const f = find(k); return f ? norm((rows[f.r] || [])[f.c + 1]) : ''; };
    const cell = (f, c) => (f ? norm((rows[f.r] || [])[c]) : '');
    const sessions = [];
    for (let c = tiet.c + 1; c < (rows[tiet.r] || []).length; c++) {
      const n = cell(tiet, c);
      if (!/^\d+$/.test(n)) { if (sessions.length) break; continue; }
      const g = cell(gv, c);
      sessions.push({ col: c, tiet: +n, thu: cell(thu, c), ngay: cell(ngay, c), bai: cell(bai, c), done: up(cell(done, c)) === 'TRUE', gv: cleanGV(g) });
    }
    const start = Math.max(tiet.r, bai.r, done ? done.r : 0) + 1;
    const nameCol = Math.max(0, (rows[tiet.r] || []).findIndex((x) => /^HỌ\s*(&|VÀ)\s*TÊN/.test(up(x))));
    const codeCol = nameCol > 0 ? nameCol - 1 : 0;
    const students = [];
    for (let r = start; r < rows.length; r++) {
      const row = rows[r] || [], name = norm(row[nameCol]);
      if (!name) continue;
      const marks = {};
      sessions.forEach((s) => { const m = mark(row[s.col]); if (m) marks[s.col] = m; });
      students.push({ row: r, code: norm(row[codeCol]), name, dob: norm(row[nameCol + 1]), marks });
    }
    const teacher = gv ? cleanGV(norm((rows[gv.r] || [])[gv.c]).replace(/^TÊN GV/i, '')) : '';
    return { school: head('TRƯỜNG'), cls: head('LỚP:') || head('LỚP'), size: +head('SĨ SỐ:') || students.length, teacher, sessions, students };
  }

  // ── Bài dạy ──
  /** "Bài 7" → [7] · "Bài 4-5" → [4,5] · "Bài 4 + 5" / "Bài 10+11" → [4,5] / [10,11] · "Giới Thiệu + Bài 1" → [1]
      · "Ôn tập CĐ1" → review · "Giới thiệu" → []. */
  function lessonOf(text) {
    const t = norm(text), bai = [];
    const re = /Bài\s*(\d+)((?:\s*(?:[-–+,&]|và)\s*(?:Bài\s*)?\d+)*)/gi;
    let m;
    while ((m = re.exec(t))) {
      let prev = +m[1];
      if (!bai.includes(prev)) bai.push(prev);
      const more = /\s*([-–+,&]|và)\s*(?:Bài\s*)?(\d+)/gi;
      let k;
      while ((k = more.exec(m[2]))) {
        const n = +k[2];
        if (/[-–]/.test(k[1]) && n > prev && n - prev <= 4) { for (let i = prev + 1; i <= n; i++) if (!bai.includes(i)) bai.push(i); }
        else if (!bai.includes(n)) bai.push(n);
        prev = n;
      }
    }
    return { bai, review: /ôn\s*tập|kiểm\s*tra/i.test(t) };
  }
  const STOP = new Set(['bài', 'của', 'và', 'các', 'về', 'trong', 'một', 'số', 'với', 'the']);
  const words = (s) => low(s).replace(/^bài\s*\d+\s*[.:]\s*/, '').replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((w) => w && !STOP.has(w));
  /** Tên bài không có số → số bài trong bộ "Bài N." của cấp đó (khớp ≥ 75% chữ). Trùng điểm → bài gần sau prev nhất. */
  function matchName(text, names, prev) {
    const tw = words(text);
    if (tw.length < 2 || !names) return 0;
    let best = [], bestScore = 0;
    Object.keys(names).forEach((n) => {
      const nw = new Set(words(names[n].name || names[n]));
      const score = tw.filter((w) => nw.has(w)).length / tw.length;
      if (score > bestScore + 1e-9) { bestScore = score; best = [+n]; } else if (Math.abs(score - bestScore) < 1e-9) best.push(+n);
    });
    if (bestScore < 0.75 || !best.length) return 0;
    const after = best.filter((n) => n > (prev || 0)).sort((a, b) => a - b);
    return after.length ? after[0] : best.sort((a, b) => b - a)[0];
  }
  /** Bài của từng tiết theo thứ tự (khớp tên cần biết bài đã dạy trước đó). */
  function lessonsOf(sessions, names) {
    let prev = 0;
    return (sessions || []).map((s) => {
      const l = lessonOf(s.bai);
      if (!l.bai.length && !l.review && s.bai) { const n = matchName(s.bai, names, prev); if (n) l.bai.push(n); }
      if (l.bai.length) prev = Math.max(...l.bai);
      return l;
    });
  }

  // ── Ngày, buổi, tiến độ ──
  /** "28.10" → Date trong năm học hiện tại (tháng 8–12 thuộc năm bắt đầu, tháng 1–7 năm sau). */
  function dateOf(ngay, ref) {
    const m = /^(\d{1,2})[./-](\d{1,2})/.exec(norm(ngay));
    if (!m) return null;
    const r = ref || new Date(), start = r.getMonth() >= 7 ? r.getFullYear() : r.getFullYear() - 1;
    const mo = +m[2];
    return new Date(mo >= 8 ? start : start + 1, mo - 1, +m[1]);
  }
  function todaySession(sessions, date) {
    const d = date || new Date();
    return (sessions || []).find((s) => {
      const x = dateOf(s.ngay, d);
      return x && x.getDate() === d.getDate() && x.getMonth() === d.getMonth();
    }) || null;
  }
  /** Tiết chưa hoàn thành đầu tiên sau tiết đã hoàn thành cuối cùng (kể cả khi điều phối chưa ghi bài). */
  function nextSession(sessions) {
    const s = sessions || [];
    let last = -1;
    s.forEach((x, i) => { if (x.done) last = i; });
    return s.slice(last + 1).find((x) => !x.done) || s.find((x) => !x.done) || null;
  }
  /** Số tiết mỗi buổi (1 hoặc 2) — đếm các ngày đã dạy. */
  function perDay(sessions) {
    const by = {};
    (sessions || []).forEach((s) => { if (s.ngay) by[s.ngay] = (by[s.ngay] || 0) + 1; });
    const counts = Object.values(by);
    if (!counts.length) return 1;
    const two = counts.filter((n) => n >= 2).length;
    return two * 2 >= counts.length ? 2 : 1;
  }
  /** Các tiết dạy cùng buổi với tiết s (cùng NGÀY; chưa ghi ngày thì đoán theo số tiết mỗi buổi của lớp). */
  function sessionGroup(sessions, s) {
    if (!s) return [];
    const list = sessions || [];
    if (s.ngay) return list.filter((x) => x.ngay === s.ngay);
    const n = perDay(list), i = list.indexOf(s), out = [s];
    for (let k = i + 1; k < list.length && out.length < n; k++) { if (list[k].ngay || list[k].done) break; out.push(list[k]); }
    return out;
  }
  const THU = ['CN', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
  /** Tóm tắt 1 lớp cho bảng tổng quan. lessons = lessonsOf(...) (tuỳ chọn).
      planned = tiết đã xếp bài · total = tiết cả năm (để thanh tiến độ không báo 100% khi điều phối chưa xếp tiếp). */
  function summary(cls, lessons, ref) {
    const ss = cls.sessions, ls = lessons || lessonsOf(ss);
    const planned = ss.filter((s) => s.bai), done = ss.filter((s) => s.done);
    const last = done[done.length - 1] || null, next = nextSession(ss);
    let nextLesson = next ? ls[ss.indexOf(next)] : null, guess = false;
    if (next && !next.bai) {
      const taught = ls.filter((l, i) => ss[i].done).reduce((a, l) => a.concat(l.bai), []);
      const max = taught.length ? Math.max(...taught) : 0;
      nextLesson = max ? { bai: [max + 1], review: false } : null; guess = !!max;
    }
    const days = [];
    ss.filter((s) => s.ngay).slice(-6).forEach((s) => { const d = dateOf(s.ngay, ref); if (d && !days.includes(d.getDay())) days.push(d.getDay()); });
    days.sort((a, b) => a - b);
    // Cả năm: số tiết điều phối đã xếp bài, hoặc số cột tiết trên Sheet (tối đa 45 tiết/năm theo PPCT) nếu chưa xếp hết
    const plannedN = Math.max(planned.length, done.length);
    return {
      planned: plannedN, total: Math.max(plannedN, Math.min(ss.length, 45)), done: done.length, last, next, nextLesson, guess,
      perDay: perDay(ss), days, daysText: days.map((d) => THU[d]).join(', '),
      lastDate: last ? dateOf(last.ngay, ref) : null,
    };
  }

  /** Chuyên cần: mỗi học sinh { vang, comat, nl, lien }; mỗi buổi đã điểm danh { col, comat, vang }. */
  function stats(cls) {
    const per = cls.students.map((st) => {
      let vang = 0, comat = 0, lien = 0, nl = false;
      cls.sessions.forEach((s) => {
        const m = st.marks[s.col];
        if (!m || m === '?') return;
        if (m === 'v') { vang++; lien++; } else { if (m === 'x' || m === 'moi') comat++; if (m !== 'nl') lien = 0; }
        if (m === 'nl') nl = true;
      });
      return { name: st.name, code: st.code, vang, comat, nl, lien };
    });
    const sess = cls.sessions.map((s) => {
      let comat = 0, vang = 0;
      cls.students.forEach((st) => { const m = st.marks[s.col]; if (m === 'x' || m === 'moi') comat++; else if (m === 'v') vang++; });
      return { col: s.col, comat, vang };
    }).filter((x) => x.comat + x.vang);
    return { students: per, sessions: sess };
  }

  /** Ô dán vào Sheet: mỗi dòng 1 học sinh đúng thứ tự trên Sheet (dòng trống giữ trống); cols > 1 → lặp cho
      các tiết cùng buổi, cách nhau bằng Tab (dán 1 lần điền cả 2 cột). marks: { row: 'x'|'v'|'nl'|'moi' }. */
  function pasteText(students, marks, cols) {
    if (!students.length) return '';
    const n = Math.max(1, cols || 1), by = new Map(students.map((s) => [s.row, s])), out = [];
    for (let r = students[0].row; r <= students[students.length - 1].row; r++) {
      const v = by.has(r) ? (SHEET_MARK[marks[r]] || '') : '';
      out.push(Array(n).fill(v).join('\t'));
    }
    return out.join('\n');
  }
  function colName(i) { let s = ''; i += 1; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }
  const cellRef = (col, row) => colName(col) + (row + 1);

  /** Lớp có tôi dạy: tên trong ô TÊN GV chung hoặc ở bất kỳ tiết nào (bỏ dấu cách thừa, không phân biệt hoa thường). */
  function isMine(cls, me) {
    const m = low(me).replace(/\s+/g, '');
    if (!m) return false;
    const has = (s) => low(s).replace(/\s+/g, '').includes(m);
    return has(cls.teacher) || cls.sessions.some((s) => has(s.gv));
  }

  // ── Giáo viên & lịch giảng dạy ──
  /** Khoá so tên GV: không phân biệt hoa thường, dấu cách thừa ("Huỳnh Thị  Kim Hằng" = "Huỳnh Thị Kim Hằng"). */
  const teacherKey = (s) => low(s);
  /** GV của 1 lớp: { key: { name, tiet } } — tiết ghi GV riêng thì tính cho người đó; tiết để trống tính cho GV chung của lớp. */
  function teachersOf(cls) {
    const out = {};
    const add = (name, n) => { const k = teacherKey(name); if (!k) return; (out[k] || (out[k] = { name: norm(name), tiet: 0 })).tiet += n; };
    cls.sessions.forEach((s) => { if (s.gv) add(s.gv, s.done ? 1 : 0); else if (cls.teacher) add(cls.teacher, s.done ? 1 : 0); });
    if (cls.teacher) add(cls.teacher, 0);
    return out;
  }
  /** Tiết của GV đó trong lớp (teacher rỗng = mọi tiết). */
  function taughtBy(cls, teacher) {
    const k = teacherKey(teacher);
    if (!k) return cls.sessions.slice();
    return cls.sessions.filter((s) => teacherKey(s.gv || cls.teacher) === k);
  }
  const day0 = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  /** Thứ 2 của tuần chứa ngày d (+ offset tuần). */
  function mondayOf(d, offset) {
    const x = day0(d || new Date());
    x.setDate(x.getDate() - ((x.getDay() + 6) % 7) + 7 * (offset || 0));
    return x;
  }
  /** Lịch 1 tuần của GV. classes = [{ key, school, cls, sm }] (cls = parseClass, sm = summary).
      Mỗi mục: { date, key, school, cls, sessions, kind } — kind:
        'done'     tiết đã ghi ngày trong tuần và đã tick Hoàn thành
        'planned'  đã ghi ngày nhưng chưa tick Hoàn thành
        'expected' ngày GV thường dạy lớp đó (theo các buổi gần nhất), từ hôm nay trở đi — kèm tiết/bài tiếp theo
        'missing'  ngày thường dạy đã qua trong tuần mà Sheet chưa có buổi nào — nhắc cập nhật Sheet / điểm danh */
  function weekPlan(classes, teacher, monday, today) {
    const mon = day0(monday), now = day0(today || new Date()), end = new Date(mon); end.setDate(end.getDate() + 7);
    const out = [];
    (classes || []).forEach((c) => {
      const mine = taughtBy(c.cls, teacher);
      if (!mine.length || (teacher && !mine.some((s) => s.done || s.ngay))) return;
      const seen = new Set();
      mine.forEach((s) => {
        const d = dateOf(s.ngay, now);
        if (!d || d < mon || d >= end) return;
        const k = d.getTime();
        const hit = out.find((e) => e.key === c.key && e.date.getTime() === k);
        if (hit) { hit.sessions.push(s); if (!s.done) hit.kind = 'planned'; return; }
        seen.add(k);
        out.push({ date: d, key: c.key, school: c.school, cls: c.cls, sessions: [s], kind: s.done ? 'done' : 'planned' });
      });
      // Ngày thường dạy: thứ của 6 buổi gần nhất GV này đã dạy (đã qua)
      const days = new Set();
      mine.filter((s) => s.ngay && s.done).slice(-6).forEach((s) => { const d = dateOf(s.ngay, now); if (d && d <= now) days.add(d.getDay()); });
      // Ngày lớp đã có buổi (bất kỳ GV nào — lớp dạy luân phiên thì hôm đó có thể GV khác dạy)
      const classDays = new Set(c.cls.sessions.map((s) => dateOf(s.ngay, now)).filter(Boolean).map((d) => d.getTime()));
      const lastDated = c.cls.sessions.map((s) => dateOf(s.ngay, now)).filter(Boolean).sort((a, b) => b - a)[0] || null;
      // Buổi dự kiến lần lượt nhận các tiết chưa dạy tiếp theo (lớp 2 tiết/buổi: mỗi buổi 2 tiết)
      let first = true, ni = c.sm && c.sm.next ? c.cls.sessions.indexOf(c.sm.next) : -1;
      [...days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).forEach((wd) => {
        const d = new Date(mon); d.setDate(d.getDate() + ((wd + 6) % 7));
        if (seen.has(d.getTime()) || classDays.has(d.getTime())) return;
        if (d >= now) {
          const g = ni >= 0 && ni < c.cls.sessions.length ? sessionGroup(c.cls.sessions, c.cls.sessions[ni]) : [];
          if (g.length) ni = c.cls.sessions.indexOf(g[g.length - 1]) + 1;
          out.push({ date: d, key: c.key, school: c.school, cls: c.cls, sessions: g, kind: 'expected', first });
          first = false;
        } else if (!lastDated || lastDated < d) out.push({ date: d, key: c.key, school: c.school, cls: c.cls, sessions: [], kind: 'missing' });
      });
    });
    return out.sort((a, b) => a.date - b.date || String(a.school).localeCompare(String(b.school), 'vi') || String(a.cls.cls).localeCompare(String(b.cls.cls), 'vi', { numeric: true }));
  }
  /** Số tiết GV đã dạy (đã tick Hoàn thành, có ngày) trong tháng — theo trường: { school: tiết }. */
  function monthCount(classes, teacher, year, month) {
    const out = {};
    (classes || []).forEach((c) => taughtBy(c.cls, teacher).forEach((s) => {
      const d = s.done && dateOf(s.ngay, new Date(year, month, 15));
      if (d && d.getFullYear() === year && d.getMonth() === month) out[c.school] = (out[c.school] || 0) + 1;
    }));
    return out;
  }
  /** Bảng công tháng của GV: từng tiết đã tick Hoàn thành (có ngày) — [{ date, school, key, cls, tiet, bai }], theo ngày. */
  function monthLog(classes, teacher, year, month) {
    const out = [];
    (classes || []).forEach((c) => taughtBy(c.cls, teacher).forEach((s) => {
      const d = s.done && dateOf(s.ngay, new Date(year, month, 15));
      if (d && d.getFullYear() === year && d.getMonth() === month) out.push({ date: d, school: c.school, key: c.key, cls: c.cls.cls, tiet: s.tiet, bai: s.bai });
    }));
    return out.sort((a, b) => a.date - b.date || String(a.school).localeCompare(String(b.school), 'vi') || String(a.cls).localeCompare(String(b.cls), 'vi', { numeric: true }) || a.tiet - b.tiet);
  }
  /** Tiết đã qua (có ngày, trong `days` ngày gần nhất) mà chưa tick Đã hoàn thành của GV — gộp theo lớp + ngày:
      [{ date, key, school, cls, sessions }], cũ trước. Dùng cho mục "Việc cần làm". */
  function untickedSessions(classes, teacher, today, days) {
    const now = day0(today || new Date()), from = new Date(now);
    from.setDate(from.getDate() - (days || 30));
    const out = [];
    (classes || []).forEach((c) => taughtBy(c.cls, teacher).forEach((s) => {
      const d = !s.done && dateOf(s.ngay, now);
      if (!d || d >= now || d < from) return;
      const hit = out.find((e) => e.key === c.key && e.date.getTime() === d.getTime());
      if (hit) hit.sessions.push(s); else out.push({ date: d, key: c.key, school: c.school, cls: c.cls, sessions: [s] });
    }));
    return out.sort((a, b) => a.date - b.date || String(a.cls.cls).localeCompare(String(b.cls.cls), 'vi', { numeric: true }));
  }
  /** Học sinh cần chú ý: vắng từ 3 tiết hoặc vắng 2 tiết liền gần đây (chưa nghỉ luôn). */
  function watchList(cls) {
    return stats(cls).students.filter((x) => !x.nl && (x.vang >= 3 || x.lien >= 2)).sort((a, b) => b.lien - a.lien || b.vang - a.vang);
  }

  global.EduSoLop = {
    parseLinks, parsePaste, parseTabs, isClassTab, parseCSV, mark, parseClass,
    lessonOf, matchName, lessonsOf, dateOf, todaySession, nextSession, perDay, sessionGroup, summary,
    stats, pasteText, colName, cellRef, isMine, teacherKey, teachersOf, taughtBy, mondayOf, weekPlan, monthCount, monthLog, watchList, untickedSessions, SHEET_MARK, THU,
  };
})(typeof window !== 'undefined' ? window : globalThis);
