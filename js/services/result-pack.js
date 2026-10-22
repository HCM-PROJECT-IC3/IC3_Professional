/* ============================================================
   js/services/result-pack.js — HỌC SINH XUẤT KẾT QUẢ THÀNH MÃ / FILE, GIÁO
   VIÊN GOM LẠI (kiểu NetSupport) — thay cho việc ghi lên cloud khi mạng yếu
   hoặc khi muốn 0 lượt Firebase/Sheet.

   Luồng:
     1. Nộp bài xong, result-submitter.js gọi EduResultPack.remember(payload.sheet)
        → bài được mã hóa thành 1 dòng "EQR1.<dữ liệu>.<kiểm tra>" và lưu trên
        máy học sinh (localStorage, 60 bài gần nhất).
     2. Màn kết quả có nút Chép mã / Tải file → học sinh gửi cho giáo viên
        (Zalo, USB, email, qua máy chiếu...).
     3. Giáo viên mở gom-ket-qua.html, dán mã hoặc chọn nhiều file → bảng điểm
        + tải CSV. Không cần mạng, không cần đăng nhập, không gọi server.

   LƯU Ý TRUNG THỰC: đoạn "kiểm tra" (CRC32) chỉ bắt lỗi chép thiếu/sai ký tự.
   Nó KHÔNG chống học sinh cố tình tự dựng mã giả — muốn chống gian lận có chủ
   ý thì dùng đường nộp thật (Google Sheet / Firestore) hoặc Phòng cả lớp.

   Hàm thuần, chạy được cả ở trình duyệt lẫn Node (test: __tests__/result-pack.test.js).
   ============================================================ */
(function (global) {
  'use strict';

  const PREFIX = 'EQR1';
  const STORE_KEY = 'eduquiz_result_codes_v1';
  const KEEP = 60;
  const LIMITS = { n: 80, c: 40, s: 80, t: 160, ts: 40, st: 120, w: 700 };

  // ── CRC32 (bắt lỗi chép mã) ──
  const CRC_TABLE = (function () {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[i] = c >>> 0;
    }
    return t;
  })();
  function crc32(str) {
    const bytes = new TextEncoder().encode(str);
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return ((c ^ 0xFFFFFFFF) >>> 0).toString(16).padStart(8, '0');
  }

  // ── base64url có hỗ trợ tiếng Việt (UTF-8) ──
  function b64uEncode(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function b64uDecode(s) {
    const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  }

  const str = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
  const num = (v) => { const n = Number(v); return isFinite(n) ? n : 0; };

  /**
   * payload.sheet (result-submitter.js) → bản ghi gọn.
   * Khóa: id, n(tên), c(lớp), s(trường), t(bài), p(điểm %), k("đúng/tổng"), tm("mm:ss"),
   *       st(trạng thái), ts(giờ nộp), m(practice|test), tb(đổi tab), w(uid câu sai)
   */
  function toRecord(sheet) {
    return {
      v: 1,
      id: str(sheet.submissionId, 40),
      n: str(sheet.studentName, LIMITS.n),
      c: str(sheet.studentClass, LIMITS.c),
      s: str(sheet.studentSchool, LIMITS.s),
      t: str(sheet.testName, LIMITS.t),
      p: Math.max(0, Math.min(100, Math.round(num(sheet.score)))),
      k: str(sheet.correct, 12),
      tm: str(sheet.time, 10),
      st: str(sheet.status, LIMITS.st),
      ts: str(sheet.timestamp, LIMITS.ts),
      m: sheet.examMode === 'practice' ? 'practice' : 'test',
      tb: Math.max(0, Math.round(num(sheet.tabSwitch))),
      w: str(sheet.wrong, LIMITS.w),
    };
  }

  /** Bản ghi gọn → chuỗi mã "EQR1.<base64url>.<crc32>". */
  function encode(sheet) {
    const json = JSON.stringify(toRecord(sheet));
    return PREFIX + '.' + b64uEncode(json) + '.' + crc32(json);
  }

  /** Giải 1 mã. Trả { ok:true, rec } hoặc { ok:false, error }. Không bao giờ throw. */
  function decode(code) {
    try {
      const parts = String(code || '').trim().split('.');
      if (parts.length !== 3 || parts[0] !== PREFIX) return { ok: false, error: 'Không phải mã kết quả EduQuiz' };
      if (!/^[A-Za-z0-9_-]+$/.test(parts[1]) || !/^[0-9a-f]{8}$/.test(parts[2])) return { ok: false, error: 'Mã bị chép thiếu hoặc sai ký tự' };
      const json = b64uDecode(parts[1]);
      if (crc32(json) !== parts[2]) return { ok: false, error: 'Mã bị chép sai (không khớp mã kiểm tra)' };
      const o = JSON.parse(json);
      if (!o || o.v !== 1 || !o.id || !o.n) return { ok: false, error: 'Mã thiếu thông tin học sinh' };
      return { ok: true, rec: toRecord({
        submissionId: o.id, studentName: o.n, studentClass: o.c, studentSchool: o.s, testName: o.t,
        score: o.p, correct: o.k, time: o.tm, status: o.st, timestamp: o.ts, examMode: o.m, tabSwitch: o.tb, wrong: o.w,
      }) };
    } catch (e) {
      return { ok: false, error: 'Mã không đọc được' };
    }
  }

  /** Tìm mọi mã trong 1 đoạn văn bản dán/đọc từ file (mỗi mã tự dò, không cần xuống dòng đúng). */
  function extractCodes(text) {
    return String(text || '').match(/EQR1\.[A-Za-z0-9_-]+\.[0-9a-f]{8}/g) || [];
  }

  /**
   * Gom nhiều văn bản thành bảng: loại mã trùng (cùng id bài nộp), báo mã lỗi.
   * @returns {{rows:Object[], codes:string[], dup:number, bad:{code:string,error:string}[]}}
   *   codes[i] là mã gốc của rows[i] (để trang gom kết quả lưu lại và nạp lại khi mở lần sau).
   */
  function parseMany(texts) {
    const seen = new Set();
    const rows = [];
    const codes = [];
    const bad = [];
    let dup = 0;
    for (const text of [].concat(texts)) {
      for (const code of extractCodes(text)) {
        const r = decode(code);
        if (!r.ok) { bad.push({ code: code.slice(0, 24) + '…', error: r.error }); continue; }
        if (seen.has(r.rec.id)) { dup++; continue; }
        seen.add(r.rec.id);
        rows.push(r.rec);
        codes.push(code);
      }
    }
    return { rows, codes, dup, bad };
  }

  /** Chống "CSV injection": ô bắt đầu bằng = + - @ bị Excel hiểu là công thức. */
  function csvCell(v) {
    let s = String(v == null ? '' : v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  }

  const CSV_HEAD = ['Họ và tên', 'Lớp', 'Trường', 'Bài', 'Điểm (%)', 'Đúng/Tổng', 'Thời gian', 'Chế độ', 'Đổi tab', 'Trạng thái', 'Giờ nộp', 'Mã bài nộp'];
  function toCsv(rows) {
    const lines = [CSV_HEAD.map(csvCell).join(',')];
    for (const r of rows) {
      lines.push([r.n, r.c, r.s, r.t, r.p, r.k, r.tm, r.m === 'practice' ? 'Ôn luyện' : 'Kiểm tra', r.tb, r.st, r.ts, r.id].map(csvCell).join(','));
    }
    return '﻿' + lines.join('\r\n');   // BOM để Excel đọc đúng tiếng Việt
  }

  /** Thống kê nhanh cho giáo viên. */
  function summary(rows) {
    if (!rows.length) return { count: 0, avg: 0, min: 0, max: 0, below50: 0 };
    const ps = rows.map((r) => r.p);
    return {
      count: rows.length,
      avg: Math.round(ps.reduce((a, b) => a + b, 0) / ps.length),
      min: Math.min.apply(null, ps),
      max: Math.max.apply(null, ps),
      below50: ps.filter((p) => p < 50).length,
    };
  }

  // ── Phía học sinh: lưu mã các bài đã làm trên máy ──
  function list() {
    try { const a = JSON.parse(global.localStorage.getItem(STORE_KEY) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; }
  }
  /** Gọi sau khi nộp bài; không bao giờ throw (không được làm hỏng luồng nộp bài). */
  function remember(sheet) {
    try {
      if (!sheet.submissionId) sheet = Object.assign({}, sheet, { submissionId: 'L' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8) });
      const code = encode(sheet);
      const rec = toRecord(sheet);
      const all = list().filter((x) => x && x.id !== rec.id);
      all.unshift({ id: rec.id, at: Date.now(), name: rec.n, test: rec.t, score: rec.p, code });
      global.localStorage.setItem(STORE_KEY, JSON.stringify(all.slice(0, KEEP)));
      return code;
    } catch (e) { return ''; }
  }
  function last() { const a = list(); return a.length ? a[0] : null; }

  function safeName(s) {
    return String(s || 'hoc-sinh').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd')
      .replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 40) || 'hoc-sinh';
  }

  const api = { encode, decode, extractCodes, parseMany, toCsv, summary, toRecord, crc32, list, remember, last, safeName, PREFIX };
  global.EduResultPack = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
