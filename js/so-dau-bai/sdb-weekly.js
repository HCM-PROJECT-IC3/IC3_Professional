/* ============================================================
   js/so-dau-bai/sdb-weekly.js — "Điền bảng tuần" của Sổ đầu bài (so-dau-bai.html).
   Bảng tuần của trường ("BẢNG THEO DÕI, NHẬN XÉT TÌNH HÌNH GIẢNG DẠY…", mỗi tuần 1 tab Google Sheet) đã có sẵn
   ngày, lớp, tiết, bài, GV; còn trống 3 cột Học sinh vắng (Số lượng, Tên) và Nhận xét (Ưu điểm, hạn chế).
   Web đọc tab đó (link CSV công khai hoặc bảng giáo viên tự sao chép dán vào), điền vắng từ Điểm danh / sổ đầu bài,
   nhận xét chung theo bài, rồi trả về 1 khối ô để giáo viên dán thẳng vào cột F:H — không ghi Sheet, 0 Firebase, 0 Apps Script.
   Hàm thuần, không gọi mạng (test: js/so-dau-bai/__tests__/sdb-weekly.test.js):
     parseTSV · readSource(text) · parseWeekSheet(rows) · sameTeacher · kindOf · topicOf
     pickComment(bank, info) · splitNames · absentCells · clipBlock(sheet, fills, opts)
   Sổ lớp của Điều phối (FORM QUẢN LÝ LỚP): parseGoals (tab BÁO GIẢNG → Kiến thức cần đạt) · goalsFor · sessionFor (buổi theo
     ngày, sổ chưa ghi ngày thì theo tiết PPCT) · absentAt · crossCheck (bảng tuần lệch sổ lớp) · buildWeek + tkbMap + gridClip
     (tạo bảng tuần mới A:J từ sổ lớp, tiết TKB theo bảng tuần đã đọc) · weekSessions (tiết sổ lớp chưa ghi ngày → xếp theo
     lịch hằng tuần của lớp) · tkbPairs · week1From (số tuần theo tiêu đề tab) · planBlock (khối báo giảng K8:M12)
   ============================================================ */
(function (global) {
  'use strict';

  const norm = (s) => String(s == null ? '' : s).normalize('NFC').replace(/\s+/g, ' ').trim();
  const low = (s) => norm(s).toLocaleLowerCase('vi');
  const plain = (s) => low(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
  const pad = (n) => String(n).padStart(2, '0');
  const normClass = (s) => norm(s).replace(/^(\d+)\s*[Aa.\/_-]\s*(\d+)$/, '$1.$2');

  /** Bảng dán từ Google Sheet/Excel (Tab giữa các ô, ô nhiều dòng nằm trong ngoặc kép). */
  function parseTSV(text) {
    const rows = [];
    let row = [], cell = '', q = false, start = true;
    const s = String(text || '');
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (q) {
        if (c === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c;
        continue;
      }
      if (c === '"' && start) { q = true; start = false; continue; }
      start = false;
      if (c === '\t') { row.push(cell); cell = ''; start = true; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && s[i + 1] === '\n') i++;
        row.push(cell); rows.push(row); row = []; cell = ''; start = true;
      } else cell += c;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }

  /**
   * Ô nhập của giáo viên → { kind: 'link', id, gid } | { kind: 'paste' } | null.
   * Link phải có gid (mỗi tuần 1 tab); thiếu gid thì Google trả tab đầu tiên — vẫn nhận nhưng báo noGid.
   */
  function readSource(text) {
    const t = String(text || '');
    if (/\t/.test(t)) return { kind: 'paste' };
    const m = /spreadsheets\/d\/([A-Za-z0-9_-]{20,})/.exec(t);
    if (!m) return null;
    const g = /[#?&]gid=(\d+)/.exec(t);
    return { kind: 'link', id: m[1], gid: g ? g[1] : '0', noGid: !g };
  }

  /** "9/11/2026" · "Thứ 2\n09/11/2026" · "2026-11-09" → 'YYYY-MM-DD' | '' */
  function dateISO(v) {
    const s = norm(v);
    let m = /(\d{1,2})\s*[\/.-]\s*(\d{1,2})\s*[\/.-]\s*(\d{4})/.exec(s);
    if (m) return `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
    m = /(\d{4})-(\d{2})-(\d{2})/.exec(s);
    return m ? m[0] : '';
  }

  /** Tìm cột theo chữ tiêu đề (bỏ dấu, không phân biệt hoa thường). */
  function findCol(head, re) {
    for (let c = 0; c < head.length; c++) if (re.test(plain(head[c]))) return c;
    return -1;
  }

  /**
   * rows (CSV/TSV, 0-based) → {
   *   school, title, weekText, cols: { date, cls, tkb, ppct, lesson, absN, absNames, cmt, teacher },
   *   rows: [{ r, date, cls, tiet, buoi, ppct, lesson, teacher, cur: [ô F, G, H hiện có] }],
   *   teachers: [tên], warnings: [chuỗi]
   * } | null (không phải bảng tuần).
   */
  function parseWeekSheet(rows) {
    rows = rows || [];
    let hr = -1;
    for (let r = 0; r < Math.min(rows.length, 30); r++) if (/^thu,?\s*ngay/.test(plain((rows[r] || [])[0]))) { hr = r; break; }
    if (hr < 0) return null;
    const head = rows[hr];
    const cols = {
      date: 0,
      cls: findCol(head, /^lop/),
      tkb: findCol(head, /theo tkb/),
      ppct: findCol(head, /theo ppct/),
      lesson: findCol(head, /ten bai/),
      absN: findCol(head, /hoc sinh vang|hs vang/),
      cmt: findCol(head, /nhan xet/),
      teacher: findCol(head, /giao vien|gv day/),
    };
    if (cols.cls < 0 || cols.lesson < 0 || cols.absN < 0 || cols.cmt < 0) return null;
    cols.absNames = cols.absN + 1;
    const top = rows.slice(0, hr).map((r) => (r || []).map(norm));
    const flat = top.map((r) => r.filter(Boolean));
    const school = (flat.find((r) => r.some((x) => /^truong /.test(plain(x)))) || []).find((x) => /^truong /.test(plain(x))) || '';
    const ubnd = (flat.find((r) => /^(ubnd|uy ban)/.test(plain(r[0] || ''))) || [])[0] || '';
    const title = (flat.find((r) => /bang theo doi|so dau bai/.test(plain(r[0] || ''))) || [])[0] || '';
    const weekText = (flat.find((r) => /^tuan\b/.test(plain(r[0] || ''))) || [])[0] || '';

    const out = [], warnings = [];
    const sub = rows[hr + 1] || [];
    const first = /so luong/.test(plain(sub[cols.absN])) ? hr + 2 : hr + 1;
    for (let r = first; r < rows.length; r++) {
      const row = rows[r] || [];
      const a = plain(row[0]);
      if (/^(so tiet|tong|gvbm|to truong|nguoi lap)/.test(a)) break;
      const date = dateISO(row[0]);
      const cls = normClass(row[cols.cls]);
      if (!date || !cls) continue; // dòng trống, dòng mục "1. Tin học quốc tế"
      const tk = /(\d+)\s*\(?\s*(sang|chieu)?/.exec(plain(row[cols.tkb]));
      out.push({
        r, date, cls,
        tiet: tk ? +tk[1] : 0,
        buoi: tk && tk[2] === 'chieu' ? 'Chiều' : 'Sáng',
        ppct: norm(row[cols.ppct]),
        lesson: norm(row[cols.lesson]),
        teacher: norm(row[cols.teacher]),
        cur: [row[cols.absN] || '', row[cols.absNames] || '', row[cols.cmt] || ''],
      });
    }
    const teachers = [...new Set(out.map((x) => x.teacher).filter(Boolean))];
    const signers = signBlock(rows, first);

    // Tiêu đề "Tuần: 09 (Từ ngày 02/11…)" không khớp ngày dạy bên dưới (chép tab tuần trước quên sửa)
    const dates = out.map((x) => x.date).sort();
    const rng = [...weekText.matchAll(/(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{4})/g)].map((m) => `${m[3]}-${pad(m[2])}-${pad(m[1])}`);
    if (dates.length && rng.length === 2 && (dates[0] < rng[0] || dates[dates.length - 1] > rng[1])) {
      warnings.push(`Tiêu đề tab ghi “${weekText}” nhưng ngày dạy là ${vn(dates[0])} – ${vn(dates[dates.length - 1])}: nhớ sửa tiêu đề.`);
    }
    // Tiết PPCT của 1 lớp phải tăng dần theo buổi dạy (giảm → thường do chép nhầm công thức)
    const byCls = new Map();
    out.forEach((x) => { if (/^\d+$/.test(x.ppct)) (byCls.get(x.cls) || byCls.set(x.cls, []).get(x.cls)).push(x); });
    const bad = [];
    for (const [cls, list] of byCls) {
      const key = (x) => x.date + (x.buoi === 'Chiều' ? 1 : 0) + pad(x.tiet);
      list.sort((p, q) => key(p).localeCompare(key(q)));
      for (let i = 1; i < list.length; i++) if (+list[i].ppct <= +list[i - 1].ppct) bad.push(`${cls} (${vn(list[i].date)}: ${list[i].ppct} sau ${list[i - 1].ppct})`);
    }
    if (bad.length) warnings.push(`Tiết PPCT không tăng dần: ${bad.join(', ')}. Kiểm tra lại cột “Tiết dạy theo PPCT”.`);
    return { ubnd, school, title, weekText, cols, rows: out, teachers, warnings, signers };
  }

  /**
   * Khối ký cuối bảng: dòng "GVBM | TỔ TRƯỞNG | PHÓ HIỆU TRƯỞNG", tên nằm ở dòng có chữ đầu tiên bên dưới (cùng cột
   * hoặc lệch vài cột do ô gộp). → { gvbm, toTruong, pht } (thiếu ô nào thì '') | null nếu không có khối ký.
   */
  function signBlock(rows, from) {
    const ROLES = [['gvbm', /^(gvbm|giao vien bo mon)$/], ['toTruong', /^to truong/], ['pht', /^(pho hieu truong|hieu truong)/]];
    for (let r = from || 0; r < rows.length; r++) {
      const row = rows[r] || [], pos = {};
      row.forEach((v, c) => { const p = plain(v); for (const [k, re] of ROLES) if (pos[k] == null && re.test(p)) pos[k] = c; });
      if (pos.gvbm == null || Object.keys(pos).length < 2) continue;
      const out = { gvbm: '', toTruong: '', pht: '' };
      const cols = Object.entries(pos).sort((a, b) => a[1] - b[1]);
      for (let k = r + 1; k < Math.min(rows.length, r + 10); k++) {
        const line = rows[k] || [];
        if (!line.some((v) => norm(v))) continue;
        cols.forEach(([key, c], i) => {
          const end = i + 1 < cols.length ? cols[i + 1][1] : line.length;
          const hit = line.slice(c, end).map(norm).find(Boolean); // ô gộp: tên có thể lệch sang phải trong vùng của chức danh
          if (hit && !out[key] && !/^\(.*\)$/.test(hit)) out[key] = hit;
        });
        if (out.gvbm || out.toTruong || out.pht) return out;
      }
      return out;
    }
    return null;
  }
  const vn = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

  /** "Nguyễn Văn Hùng" khớp "nguyen van hung", "Thầy Hùng", "Hùng". */
  function sameTeacher(a, b) {
    const x = plain(a).replace(/^(thay|co)\s+/, ''), y = plain(b).replace(/^(thay|co)\s+/, '');
    if (!x || !y) return false;
    if (x === y) return true;
    const short = x.length < y.length ? x : y, long = short === x ? y : x;
    return !short.includes(' ') && long.split(' ').pop() === short;
  }

  /** Loại tiết: 'review' ôn tập · 'test' thi thử/kiểm tra · 'intro' giới thiệu · 'lesson' bài mới. */
  function kindOf(lesson) {
    const t = plain(lesson);
    if (/\btest\b|kiem tra|gmetrix|thi thu|bai thi/.test(t)) return 'test';
    if (/on tap|bai on/.test(t)) return 'review';
    if (/^gioi thieu/.test(t)) return 'intro';
    return 'lesson';
  }

  /** Chủ đề của bài theo PPCT của khối (rows: [{ t, topic, name }]), khớp số bài; không thấy → ''. */
  function topicOf(rows, lesson, lessonOf) {
    const want = lessonOf ? lessonOf(lesson).bai[0] : null;
    const list = rows || [];
    const hit = want ? list.find((r) => lessonOf(r.name).bai.includes(want)) : list.find((r) => low(r.name) === low(lesson));
    return hit ? low(hit.topic) : '';
  }

  /** Băm chuỗi → số (chọn câu khác nhau giữa các lớp, nhưng mở lại vẫn đúng câu cũ). */
  function hash(s) {
    let h = 2166136261;
    for (const ch of String(s)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  const at = (list, n) => (list && list.length ? list[n % list.length] : '');
  /** Tên bài bỏ "Bài 9:" để ghép câu: "Bài 9: Mật khẩu…" → "Mật khẩu…". */
  const shortLesson = (s) => norm(s).replace(/^bài\s*\d+\s*[:.\-–]\s*/i, '').replace(/\s*\(.*\)\s*$/, '');

  /**
   * Nhận xét chung của tiết: { uu, hc }.
   * info = { lesson, topic, cls, date, tiet, absent: số HS vắng, size: sĩ số, turn: lần bấm "Đổi câu" }
   * Ưu: 1 câu kiến thức (theo chủ đề hoặc tên bài) + 1 câu thái độ. Hạn chế: 1 câu theo chủ đề/loại tiết,
   * thêm câu sĩ số khi vắng nhiều.
   */
  function pickComment(bank, info) {
    const B = bank || {}, i = info || {};
    const kind = kindOf(i.lesson);
    const seed = hash(`${i.cls}|${i.date}|${i.tiet}|${i.turn || 0}`);
    const topic = (B.topics || {})[plain(i.topic)] || null;
    const group = kind === 'lesson' ? topic : (B.kinds || {})[kind];
    const bai = shortLesson(i.lesson);
    const fill = (s) => String(s || '').replace(/\{bai\}/g, bai);
    // Có "Kiến thức cần đạt" của bài (tab BÁO GIẢNG): Ưu = 1 mục tiêu đã đạt, Hạn chế = 1 mục tiêu khác "chưa … được".
    const goals = kind === 'lesson' ? (i.goals || []) : [];
    const gi = goals.length ? seed % goals.length : -1;
    const weak = goals.filter((g, k) => k !== gi && /^(\S+\s+){1,2}được\s/.test(g)); // "Trình bày được …", "Phân biệt được …"
    let know = gi >= 0 ? asHS(goals[gi]) + '.' : at((group && group.uu) || (B.common || {}).know, seed);
    const att = at((B.common || {}).uu, seed >>> 3);
    let hc = weak.length && (seed >>> 5) % 3 ? `Một số HS chưa ${lowerFirst(at(weak, seed >>> 9))}.` : at((group && group.hc) || (B.common || {}).hc, seed >>> 5);
    if (gi >= 0 && goals.length > 2 && (seed >>> 11) % 2) know = `Đa số HS ${lowerFirst(goals[gi].replace(/^(hs|học sinh)\s+/i, ''))}.`;
    const uu = [fill(know), fill(att)].filter(Boolean);
    const h = [fill(hc)];
    const size = +i.size || 0, n = +i.absent || 0;
    if (n >= 3 || (size && n / size >= 0.15)) h.push(fill(at((B.common || {}).absent, seed >>> 7)).replace(/\{n\}/g, n));
    return { uu: [...new Set(uu)].join(' '), hc: h.filter(Boolean).join(' ') };
  }

  /** "An, Bình (K); Chi" → [{ name, type: 'P' | 'K' }] */
  function splitNames(text) {
    return String(text || '').split(/[,;\n]/).map(norm).filter(Boolean)
      .map((n) => ({ name: n.replace(/\s*\((K|P)\)\s*$/i, ''), type: /\(K\)\s*$/i.test(n) ? 'K' : 'P' }));
  }
  const namesText = (list) => (list || []).map((a) => a.name + (a.type === 'K' ? ' (K)' : '')).join(', ');

  /** Ô Số lượng + Tên. known = đã điểm danh; chưa điểm danh thì để trống cả 2 ô. */
  function absentCells(list, known, zero) {
    if (!known) return ['', ''];
    const n = (list || []).length;
    return [n ? String(n) : (zero ? '0' : ''), namesText(list)];
  }

  const colName = (i) => { let s = ''; i += 1; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
  const escHTML = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const tsvCell = (s) => (/[\t\n"]/.test(s) ? `"${String(s).replace(/"/g, '""')}"` : String(s));

  /**
   * Khối ô để dán vào Sheet, từ ô Số lượng của dòng đầu tới ô Nhận xét của dòng cuối (vd F9:H46).
   * fills: Map r → [số lượng, tên, nhận xét] (chỉ dòng của tôi). Dòng của GV khác / dòng xen giữa giữ nguyên
   * giá trị đang có trên Sheet (đọc lúc nạp), để 1 lần dán không xoá phần của đồng nghiệp.
   * → { a1: 'F9', range: 'F9:H46', tsv, html, rows: số dòng, mine: số dòng của tôi } | null
   */
  function clipBlock(sheet, fills, raw) {
    if (!sheet || !sheet.rows.length || !fills || !fills.size) return null;
    const c0 = sheet.cols.absN, c1 = sheet.cols.cmt;
    const rs = [...fills.keys()];
    const r0 = Math.min(...rs), r1 = Math.max(...rs);
    const grid = [];
    for (let r = r0; r <= r1; r++) {
      const line = [];
      for (let c = c0; c <= c1; c++) {
        const f = fills.get(r);
        if (f && c === c0) line.push(f[0]);
        else if (f && c === c0 + 1) line.push(f[1]);
        else if (f && c === c1) line.push(f[2]);
        else line.push(String(((raw || [])[r] || [])[c] ?? ''));
      }
      grid.push(line);
    }
    const tsv = grid.map((l) => l.map(tsvCell).join('\t')).join('\n');
    const html = '<table>' + grid.map((l) => '<tr>' + l.map((v) => `<td>${escHTML(v).replace(/\n/g, '<br>')}</td>`).join('') + '</tr>').join('') + '</table>';
    const a1 = colName(c0) + (r0 + 1);
    return { a1, range: `${a1}:${colName(c1)}${r1 + 1}`, tsv, html, rows: r1 - r0 + 1, mine: fills.size };
  }

  // ── Sổ lớp của Điều phối (FORM QUẢN LÝ LỚP: tab BÁO GIẢNG + mỗi lớp 1 tab) ──

  /** 1 dòng "Kiến thức cần đạt" → câu gọn: bỏ gạch đầu dòng, dấu ; . cuối, dòng có link. '' nếu không dùng được. */
  function cleanGoal(s) {
    const t = norm(String(s || '').replace(/^[\s•\-–*+·]+/, '')).replace(/[;.,:\s]+$/, '');
    if (!t || /https?:|youtu|đường link/i.test(t) || t.length < 12) return '';
    return t.length > 140 ? t.slice(0, t.lastIndexOf(' ', 140)).replace(/[;,:\s]+$/, '') : t;
  }
  /** Tab BÁO GIẢNG (Chủ đề | Tiết | Tên bài học | Kiến thức cần đạt) → [{ t: [tiết], name, topic, goals }]. Tiết "23-24" → [23, 24]. */
  function parseGoals(rows) {
    rows = rows || [];
    const hr = rows.findIndex((r) => (r || []).some((x) => /^tiet$/.test(plain(x))) && (r || []).some((x) => /can dat|ten bai/.test(plain(x))));
    if (hr < 0) return [];
    const head = rows[hr];
    const cT = findCol(head, /^tiet$/), cN = findCol(head, /ten bai/), cG = findCol(head, /can dat|yeu cau/), cC = findCol(head, /^chu de/);
    const out = [];
    let topic = '';
    for (let r = hr + 1; r < rows.length; r++) {
      const row = rows[r] || [];
      if (cC >= 0 && norm(row[cC])) topic = norm(row[cC]);
      const m = /^(\d+)(?:\s*[-–]\s*(\d+))?$/.exec(norm(row[cT]));
      const name = norm(row[cN]);
      if (!m || !name) continue;
      const t = [];
      for (let i = +m[1]; i <= +(m[2] || m[1]) && t.length < 6; i++) t.push(i);
      const goals = cG >= 0 ? String(row[cG] || '').split(/\n|;\s*(?=[A-ZĐÂĂÊÔƠƯ])/).map(cleanGoal).filter(Boolean) : [];
      out.push({ t, name, topic, goals });
    }
    return out;
  }
  /** Mục tiêu của bài: khớp số bài ("Bài 9") rồi tới tiết PPCT, rồi tên. → { name, topic, goals } | null */
  function goalsFor(list, lesson, ppct, lessonOf) {
    const L = list || [];
    const want = lessonOf ? lessonOf(lesson).bai[0] : null;
    let hit = want ? L.find((x) => /^bài\s*\d/i.test(x.name) && lessonOf(x.name).bai[0] === want) : null;
    if (!hit && /^\d+$/.test(String(ppct || ''))) hit = L.find((x) => x.t.includes(+ppct) && (!want || !/^bài\s*\d/i.test(x.name)));
    if (!hit) hit = L.find((x) => low(x.name) === low(lesson));
    return hit || null;
  }
  const lowerFirst = (s) => (/^[A-ZÀ-Ỹ][a-zà-ỹ]/.test(s) ? s[0].toLocaleLowerCase('vi') + s.slice(1) : s);
  const asHS = (g) => (/^(hs|học sinh)\b/i.test(g) ? g.replace(/^học sinh/i, 'HS') : 'HS ' + lowerFirst(g));

  /**
   * Buổi của dòng bảng tuần trong tab lớp (EduSoLop.parseClass):
   * khớp ngày (2 tiết cùng ngày → theo thứ tự, nth 0-based) → { s, by: 'date' }; sổ chưa ghi ngày thì khớp tiết PPCT
   * → { s, by: 'tiet' }; không thấy → null. ref: Date để đoán năm học (dateOf).
   */
  function sessionFor(c, row, nth, dateOf, ref) {
    if (!c) return null;
    const same = c.sessions.filter((s) => { const d = dateOf(s.ngay, ref); return d && iso(d) === row.date; });
    if (same.length) return { s: same[Math.min(nth || 0, same.length - 1)], by: 'date' };
    if (/^\d+$/.test(row.ppct)) { const s = c.sessions.find((x) => x.tiet === +row.ppct && !x.ngay); if (s) return { s, by: 'tiet' }; }
    return null;
  }
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  /** Vắng của 1 buổi: known = đã có ít nhất 1 ô điểm danh; drafts = bản nháp chưa ghi Sheet của trang Điểm danh ({ row: mark }). */
  function absentAt(c, s, drafts, draftNames) {
    let known = false;
    const names = [];
    c.students.forEach((st) => {
      // draftNames (Điểm danh bản mới): dòng đó nay là bạn khác → bỏ nháp của dòng đó
      const nm = draftNames && draftNames[st.row], okRow = !nm || norm(nm).toLowerCase() === norm(st.name).toLowerCase();
      const m = okRow && drafts && drafts[st.row] != null ? drafts[st.row] : st.marks[s.col];
      if (m === 'x' || m === 'v' || m === 'moi') known = true;
      if (m === 'v') names.push(norm(st.name));
    });
    return { known, names };
  }
  /** Lệch giữa bảng tuần và sổ lớp → câu cảnh báo ('' nếu khớp). */
  function crossCheck(row, hit, lessonOf) {
    if (!hit) return 'sổ lớp không có buổi này';
    const out = [];
    if (/^\d+$/.test(row.ppct) && hit.s.tiet !== +row.ppct) out.push(`PPCT ghi ${row.ppct}, sổ lớp là tiết ${hit.s.tiet}`);
    if (lessonOf) {
      const a = lessonOf(row.lesson || ''), b = lessonOf(hit.s.bai || '');
      if (a.bai.length && b.bai.length && !a.bai.some((n) => b.bai.includes(n))) out.push(`bài ghi Bài ${a.bai.join('+')}, sổ lớp là ${norm(hit.s.bai)}`);
      else if (a.review !== b.review && (a.bai.length || b.bai.length) && hit.s.bai) out.push(`bài ghi “${shortLesson(row.lesson)}”, sổ lớp là ${norm(hit.s.bai)}`);
    }
    if (hit.by === 'tiet') out.push(`sổ lớp chưa ghi ngày cho tiết ${hit.s.tiet}`);
    return out.join('; ');
  }

  /**
   * Bảng tuần mới từ sổ lớp. classes: [{ cls: '3.1', c: parseClass }], dates: ['YYYY-MM-DD' × 6] (T2–T7),
   * tkbOf(cls, dow 2..7, nth) → '2 (Sáng)' | '', lessonOf(cls, s) → tên bài, dateOf, ref.
   * → { rows: [{ date, cls, tkb, ppct, lesson, teacher, s, c }], undated: [lớp không có tiết nào có ngày trong tuần] }
   * Xếp như bảng của trường: theo lớp, rồi ngày.
   */
  function buildWeek(classes, o) {
    const rows = [], undated = [];
    for (const { cls, c } of classes || []) {
      if (!c) continue;
      const list = weekSessions(c, o.dates, o.dateOf, o.ref);
      if (!list.length) undated.push(cls);
      const seen = {};
      list.forEach(({ s, date, plan }, j) => {
        const dow = isoDate(date).getDay() + 1, nth = seen[date] = (seen[date] ?? -1) + 1;
        // Thứ này không có trong TKB đã biết (lớp đổi ngày dạy) → tiết thứ j trong tuần của lớp đó, đánh dấu để kiểm tra
        const t = o.tkbOf(cls, dow, nth) || '', g = !t && o.tkbOf.guess ? o.tkbOf.guess(cls, j) : '';
        rows.push({ date, cls, tkb: t || g, tkbGuess: !!g, ppct: String(s.tiet), lesson: o.lessonOf(cls, s), teacher: s.gv || c.teacher || '', s, c, plan });
      });
    }
    const cmpC = (a, b) => { const [a1, a2] = a.split('.').map(Number), [b1, b2] = b.split('.').map(Number); return a1 - b1 || a2 - b2; };
    rows.sort((a, b) => cmpC(a.cls, b.cls) || a.date.localeCompare(b.date) || a.s.tiet - b.s.tiet);
    undated.sort(cmpC);
    return { rows, undated };
  }
  const isoDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const plusDays = (s, n) => { const d = isoDate(s); d.setDate(d.getDate() + n); return iso(d); };
  const mondayOf = (d) => iso(new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7)));
  /** Ô THỨ "Thứ 3" → 3 · "CN" → 8 · '' → 0 */
  const thuNum = (t) => { const m = /(\d)/.exec(norm(t)); return m ? +m[1] : (/^(cn|chu nhat)/.test(plain(t)) ? 8 : 0); };

  /**
   * Tiết của 1 lớp trong tuần dates (['YYYY-MM-DD' T2…T7]) theo sổ lớp → [{ s, date, plan }] theo thứ tự tiết.
   *   • Tiết có ô NGÀY: đúng ngày đó (plan: false).
   *   • Tiết sau tiết có ngày cuối cùng (điều phối chưa ghi ngày, kể cả tiết đã tick hoàn thành): xếp tiếp theo lịch
   *     hằng tuần của lớp (plan: true) — số tiết/tuần = số hay gặp nhất trong các tuần đã có ngày, thứ dạy = tuần gần nhất
   *     đủ số tiết đó; ô THỨ của tiết (nếu có) được ưu tiên. Tuần nghỉ lễ chưa biết trước: điều phối ghi NGÀY là theo ngày đó.
   */
  function weekSessions(c, dates, dateOf, ref) {
    const ss = (c && c.sessions) || [], d0 = dates[0], d1 = dates[dates.length - 1];
    const dated = [];
    ss.forEach((s, i) => { const d = s.ngay ? dateOf(s.ngay, ref) : null; if (d) dated.push({ s, i, date: iso(d), mon: mondayOf(d), dow: d.getDay() + 1 }); });
    const out = dated.filter((x) => x.date >= d0 && x.date <= d1).map((x) => ({ s: x.s, date: x.date, plan: false, i: x.i }));
    if (dated.length) {
      const by = new Map();
      dated.forEach((x) => (by.get(x.mon) || by.set(x.mon, []).get(x.mon)).push(x));
      const cnt = {};
      for (const g of by.values()) cnt[g.length] = (cnt[g.length] || 0) + 1;
      const k = +Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a] || b - a)[0];
      const mons = [...by.keys()].sort(), last = mons[mons.length - 1];
      const full = [...mons].reverse().find((m) => by.get(m).length === k);
      const pattern = by.get(full).slice().sort((a, b) => a.i - b.i).map((x) => x.dow);
      const want = mondayOf(isoDate(d0));
      let p = by.get(last).length; // vị trí tiếp theo, tính từ thứ Hai của tuần cuối có ngày
      for (let i = Math.max(...by.get(last).map((x) => x.i)) + 1; i < ss.length; i++) {
        const s = ss[i];
        if (s.ngay && dateOf(s.ngay, ref)) continue; // có ngày (ghi lệch thứ tự): đã xếp theo ngày ở trên
        const mon = plusDays(last, Math.floor(p / k) * 7), dow = thuNum(s.thu) || pattern[p % k];
        p++;
        if (mon > want) break;
        const date = plusDays(mon, dow - 2);
        if (mon === want && date >= d0 && date <= d1) out.push({ s, date, plan: true, i });
      }
    }
    return out.sort((a, b) => a.i - b.i).map(({ s, date, plan }) => ({ s, date, plan }));
  }

  /**
   * TKB theo bảng tuần đã đọc (lưu trên máy để các tuần sau dùng):
   * { 'lớp|thứ|tiết thứ mấy trong ngày': '2 (Sáng)', 'lớp|#j': tiết thứ j trong tuần của lớp (dự phòng khi lớp đổi thứ) }.
   */
  function tkbPairs(sheet) {
    const m = {}, seen = {}, order = (x) => x.date + (x.buoi === 'Chiều' ? 1 : 0) + pad(x.tiet);
    const rows = ((sheet && sheet.rows) || []).slice().sort((a, b) => order(a).localeCompare(order(b)));
    const j = {};
    for (const x of rows) {
      const dow = isoDate(x.date).getDay() + 1, k = `${x.cls}|${dow}`;
      const nth = seen[`${k}|${x.date}`] = (seen[`${k}|${x.date}`] ?? -1) + 1;
      const n = j[x.cls] = (j[x.cls] ?? -1) + 1;
      if (x.tiet) m[`${k}|${nth}`] = m[`${x.cls}|#${n}`] = `${x.tiet} (${x.buoi})`;
    }
    return m;
  }
  /**
   * TKB của lớp: lớp + thứ (+ tiết thứ mấy trong ngày) → "2 (Sáng)" | ''. src: bảng tuần đã đọc hoặc { cặp đã lưu }.
   * .guess(lớp, j): tiết thứ j trong tuần của lớp — chỉ dùng khi thứ đó không có trong TKB.
   */
  function tkbMap(src) {
    const m = src && src.rows ? tkbPairs(src) : (src || {});
    const f = (cls, dow, nth) => m[`${cls}|${dow}|${nth}`] || m[`${cls}|${dow}|0`] || '';
    f.guess = (cls, j) => m[`${cls}|#${j}`] || '';
    return f;
  }
  /**
   * Thứ Hai của Tuần 01 theo tiêu đề tab "Tuần: 10 (Từ ngày 09/11/2026 …)" → 'YYYY-MM-DD' | ''
   * ('' khi tiêu đề không khớp ngày dạy bên dưới — tab chép từ tuần trước quên sửa tiêu đề).
   */
  function week1From(sheet) {
    const m = /tuan\s*:?\s*(\d+)\s*\(\s*tu ngay\s*(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{4})/.exec(plain(sheet && sheet.weekText));
    if (!m || !+m[1] || (sheet.warnings || []).some((w) => /^Tiêu đề tab/.test(w))) return '';
    return plusDays(mondayOf(new Date(+m[4], +m[3] - 1, +m[2])), -(+m[1] - 1) * 7);
  }
  /**
   * Khối báo giảng bên phải bảng tuần (K8:M12 của mẫu trường): ngày thứ Hai + tiết PPCT đầu tuần, rồi mỗi khối 2 bài
   * của tuần (bài hay gặp nhất trong các lớp của khối, theo thứ tự tiết). rows: buildWeek().rows.
   */
  function planBlock(rows, monday) {
    const per = new Map();
    for (const x of rows || []) (per.get(x.cls) || per.set(x.cls, []).get(x.cls)).push(x);
    const mode = (list) => { const c = new Map(); list.filter(Boolean).forEach((v) => c.set(v, (c.get(v) || 0) + 1)); return [...c].sort((a, b) => b[1] - a[1])[0]?.[0] || ''; };
    const firsts = [], grades = new Map();
    for (const [cls, list] of per) {
      list.sort((a, b) => +a.ppct - +b.ppct);
      firsts.push(list[0].ppct);
      const g = parseInt(cls, 10);
      (grades.get(g) || grades.set(g, []).get(g)).push(list.map((x) => x.lesson));
    }
    const out = [[dmy(monday), mode(firsts), ''], ['Lớp', 'Bài dạy', 'Tin học quốc tế']];
    [...grades.keys()].sort((a, b) => a - b).forEach((g) => { const ls = grades.get(g); out.push([String(g), mode(ls.map((l) => l[0])), mode(ls.map((l) => l[1]))]); });
    return out;
  }
  /** Ô A:J của bảng tuần (Thứ ngày … Ghi chú) → { tsv, html } để dán từ ô A của dòng tiết đầu. */
  function gridClip(grid) {
    return {
      tsv: grid.map((l) => l.map(tsvCell).join('\t')).join('\n'),
      html: '<table>' + grid.map((l) => '<tr>' + l.map((v) => `<td>${escHTML(v).replace(/\n/g, '<br>')}</td>`).join('') + '</tr>').join('') + '</table>',
    };
  }
  const dmy = (d) => `${+d.slice(8, 10)}/${+d.slice(5, 7)}/${d.slice(0, 4)}`;

  global.EduSdbWeekly = {
    parseTSV, readSource, dateISO, parseWeekSheet, signBlock, sameTeacher, kindOf, topicOf, hash,
    shortLesson, pickComment, splitNames, namesText, absentCells, clipBlock, colName,
    cleanGoal, parseGoals, goalsFor, asHS, sessionFor, absentAt, crossCheck, buildWeek, tkbMap, gridClip, dmy,
    weekSessions, tkbPairs, week1From, planBlock,
  };
})(typeof window !== 'undefined' ? window : globalThis);
