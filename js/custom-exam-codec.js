/* ============================================================
   js/custom-exam-codec.js
   Mã hoá / giải mã "đề giáo viên tự soạn" thành 1 tham số URL
   (index.html?de=... / live-quiz.html?de=...) — dùng CHUNG cho trình
   soạn đề (js/exam-builder.js), trang làm bài (js/quiz-engine.js) và
   phòng thi đấu trực tiếp (js/live-quiz.js).

   Đề KHÔNG lưu trên Firestore — toàn bộ nằm trong link:
     • câu lấy từ ngân hàng: chỉ tham chiếu (tên minitest + uid câu trong
       data/ic3/minitests/*.json), trang nhận tự tải file tĩnh;
     • câu giáo viên tự soạn: nội dung đầy đủ, nén deflate.
   → 0 lượt đọc/ghi Firestore cho việc soạn, chia sẻ, mở đề.

   Exam (dạng dùng trong code):
     { title, desc, cat, level, duration, shuffle, theme:{color, icon}, deadline (ms, 0 = không hạn),
       items: [ {mt, uid}                         // câu ngân hàng
              | {custom: {type, q, options, correct, items, pairs, expl, img}} ] }
   custom.type: 'single' | 'multi' | 'tf' | 'ordering' | 'matching'
     single/multi: options[] + correct[] (chỉ số)   tf: correct[0] = 0 (Đúng) | 1 (Sai)
     ordering: items[] theo ĐÚNG thứ tự            matching: pairs[[trái, phải], ...]

   Mã link:
     v1 (cũ, vẫn đọc được): base64url(JSON) — chỉ có câu ngân hàng.
     v2: "2z" + base64url(deflate(JSON)) — hoặc "2j" + base64url(JSON) khi
         trình duyệt không có CompressionStream.

   AN TOÀN: link ai cũng tạo được, trang làm bài lại chèn nội dung câu
   hỏi thẳng vào HTML → mọi chuỗi của câu tự soạn được ESCAPE khi mở
   rộng (toEngineQuestion), ảnh chỉ nhận https:// hoặc data:image/... .
   ============================================================ */
(function (global) {
  'use strict';

  const MAX_TEXT = 600;
  const MAX_ITEMS = 200;

  function _prefix(c, l) { return `${c}__${l}__`.toLowerCase(); }

  function _bytesToB64url(bytes) {
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function _b64urlToBytes(s) {
    const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }
  async function _pipe(bytes, stream) {
    const out = new Response(new Blob([bytes]).stream().pipeThrough(stream));
    return new Uint8Array(await out.arrayBuffer());
  }

  const hasCompression = typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';

  // ── Câu tự soạn: dạng gọn trong payload ──
  function _packCustom(c) {
    const o = { t: c.type, q: c.q || '' };
    if (c.options) o.o = c.options;
    if (c.correct) o.a = c.correct;
    if (c.items) o.s = c.items;
    if (c.pairs) o.p = c.pairs;
    if (c.expl) o.e = c.expl;
    if (c.img) o.i = c.img;
    return o;
  }
  function _str(v) { return String(v ?? '').slice(0, MAX_TEXT); }
  function _unpackCustom(o) {
    const t = ['single', 'multi', 'tf', 'ordering', 'matching'].includes(o.t) ? o.t : null;
    if (!t) return null;
    const c = { type: t, q: _str(o.q) };
    if (Array.isArray(o.o)) c.options = o.o.slice(0, 8).map(_str);
    if (Array.isArray(o.a)) c.correct = o.a.filter((n) => Number.isInteger(n) && n >= 0 && n < 8);
    if (Array.isArray(o.s)) c.items = o.s.slice(0, 10).map(_str);
    if (Array.isArray(o.p)) c.pairs = o.p.slice(0, 10).filter(Array.isArray).map(([l, r]) => [_str(l), _str(r)]);
    if (o.e) c.expl = String(o.e).slice(0, 2000);
    if (o.i && safeImage(o.i)) c.img = o.i;
    return c;
  }

  /** Chỉ nhận ảnh https:// (không ký tự phá thuộc tính), ảnh có sẵn của
   *  ngân hàng (img/...) hoặc data:image base64. */
  function safeImage(src) {
    const s = String(src || '');
    return /^https:\/\/[^\s"'<>`\\]+$/i.test(s)
      || /^img\/[\w\-./]+\.(png|jpe?g|webp|gif|svg)$/i.test(s) && !s.includes('..')
      || /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(s);
  }

  /** exam → chuỗi mã (async vì dùng CompressionStream). */
  async function encode(exam) {
    const p = _prefix(exam.cat || '', exam.level || '');
    const m = [];
    const mIdx = new Map();
    const q = (exam.items || []).map((it) => {
      if (it.custom) return _packCustom(it.custom);
      if (!mIdx.has(it.mt)) { mIdx.set(it.mt, m.length); m.push(it.mt); }
      return [mIdx.get(it.mt), it.uid.startsWith(p) && p !== '__' ? it.uid.slice(p.length) : '=' + it.uid];
    });
    const payload = { v: 2, t: exam.title || '', c: exam.cat || '', l: exam.level || '', du: Math.max(0, parseInt(exam.duration, 10) || 0), s: exam.shuffle ? 1 : 0, m, q };
    if (exam.desc) payload.d = exam.desc;
    if (exam.theme) payload.th = [exam.theme.color || 0, exam.theme.icon || ''];
    if (exam.deadline) payload.h = Math.round(Number(exam.deadline) / 60000); // phút — link ngắn hơn ms
    const json = new TextEncoder().encode(JSON.stringify(payload));
    if (hasCompression) {
      try { return '2z' + _bytesToB64url(await _pipe(json, new CompressionStream('deflate'))); } catch (e) { /* rơi xuống dạng không nén */ }
    }
    return '2j' + _bytesToB64url(json);
  }

  /** chuỗi mã → exam, hoặc null nếu hỏng / không đọc được. */
  async function decode(code) {
    try {
      code = String(code || '').trim();
      let o;
      if (code.startsWith('2z')) {
        if (!hasCompression) return null;
        o = JSON.parse(new TextDecoder().decode(await _pipe(_b64urlToBytes(code.slice(2)), new DecompressionStream('deflate'))));
      } else if (code.startsWith('2j')) {
        o = JSON.parse(new TextDecoder().decode(_b64urlToBytes(code.slice(2))));
      } else {
        o = JSON.parse(new TextDecoder().decode(_b64urlToBytes(code))); // v1
      }
      if (!o || (o.v !== 1 && o.v !== 2) || !Array.isArray(o.q)) return null;
      const m = Array.isArray(o.m) ? o.m : [];
      const p = _prefix(o.c || '', o.l || '');
      const items = o.q.slice(0, MAX_ITEMS).map((x) => {
        if (Array.isArray(x)) {
          const [i, u] = x;
          const mt = m[i];
          if (!mt || !o.c || !o.l) return null;
          return { mt, uid: String(u).startsWith('=') ? String(u).slice(1) : p + u };
        }
        if (x && typeof x === 'object') { const c = _unpackCustom(x); return c ? { custom: c } : null; }
        return null;
      }).filter(Boolean);
      if (!items.length) return null;
      return {
        // Bỏ < > khỏi tên đề — tên được hiện ở nhiều chỗ (lịch sử, báo cáo).
        title: String(o.t || 'Đề giáo viên soạn').replace(/[<>]/g, '').slice(0, 120),
        desc: String((o.v === 2 && o.d) || '').replace(/[<>]/g, '').slice(0, 300),
        cat: o.c || '', level: o.l || '',
        duration: Math.min(180, Math.max(0, parseInt(o.v === 1 ? o.d : o.du, 10) || 0)),
        shuffle: !!o.s,
        theme: Array.isArray(o.th) ? { color: parseInt(o.th[0], 10) || 0, icon: String(o.th[1] || '').slice(0, 4) } : null,
        deadline: Number.isFinite(Number(o.h)) && Number(o.h) > 0 ? Number(o.h) * 60000 : 0,
        items,
      };
    } catch (e) {
      return null;
    }
  }

  async function buildLink(exam, page = 'index.html') { return `${page}?de=${await encode(exam)}`; }

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  /** Câu tự soạn → đúng định dạng câu hỏi của trang làm bài (đã escape).
   *  Trả null nếu câu chưa hợp lệ (thiếu đáp án...). */
  function toEngineQuestion(c, idx) {
    const base = { question: esc(c.q), uid: `custom__${idx}`, id: `c${idx + 1}`, image: false };
    if (c.expl) base.explanation = esc(c.expl);
    if (c.img && safeImage(c.img)) base.imageUrl = c.img;
    const opts = (c.options || []).map(esc);
    const correctIdx = (c.correct || []).filter((i) => i < opts.length);
    switch (c.type) {
      case 'single':
      case 'multi':
        if (opts.length < 2 || !correctIdx.length) return null;
        return Object.assign(base, { type: c.type === 'multi' && correctIdx.length > 1 ? 'multi' : 'single', options: opts, correct: correctIdx.map((i) => opts[i]) });
      case 'tf':
        return Object.assign(base, { type: 'single', options: ['Đúng', 'Sai'], correct: [(c.correct || [0])[0] === 1 ? 'Sai' : 'Đúng'] });
      case 'ordering': {
        const items = (c.items || []).filter((s) => String(s).trim()).map(esc);
        return items.length >= 2 ? Object.assign(base, { type: 'ordering', items }) : null;
      }
      case 'matching': {
        const pairs = (c.pairs || []).filter(([l, r]) => String(l).trim() && String(r).trim()).map(([l, r]) => ({ left: esc(l), right: esc(r) }));
        return pairs.length >= 2 ? Object.assign(base, { type: 'matching', pairs }) : null;
      }
      default:
        return null;
    }
  }

  /** Câu (tự soạn hoặc ngân hàng) → câu cho phòng thi đấu trực tiếp
   *  (js/live-quiz.js: chỉ trắc nghiệm 1 đáp án, 2-6 lựa chọn, hiển thị
   *  bằng textContent nên giữ chữ THÔ, không escape). null = không dùng được. */
  function toLiveQuestion(it) {
    let question, options, correct;
    if (it.custom) {
      const c = it.custom;
      if (c.type === 'tf') { question = c.q; options = ['Đúng', 'Sai']; correct = [(c.correct || [0])[0] === 1 ? 'Sai' : 'Đúng']; }
      else if ((c.type === 'single' || c.type === 'multi') && (c.correct || []).length === 1) {
        question = c.q; options = c.options || []; correct = [options[c.correct[0]]];
      } else return null;
    } else if (it.q && it.q.type === 'single') {
      question = it.q.question; options = it.q.options || []; correct = it.q.correct || [];
    } else return null;
    options = options.map((o) => String(o).trim());
    if (!String(question || '').trim() || options.length < 2 || options.length > 6 || options.some((o) => !o) || !correct.length) return null;
    return { question: String(question).trim(), options, correct: correct.map(String) };
  }

  /** Tải câu ngân hàng (file tĩnh data/ic3) cho các mục {mt, uid} → gắn it.q. */
  async function attachBankQuestions(exam) {
    const refs = exam.items.filter((it) => !it.custom);
    if (!refs.length) return exam;
    const manifest = await fetch('data/ic3/minitests-manifest.json').then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
    const names = [...new Set(refs.map((r) => r.mt))];
    const lists = await Promise.all(names.map(async (n) => {
      const rel = manifest?.[`${exam.cat}__${exam.level}`]?.[n];
      if (!rel) return [];
      try { const r = await fetch(`data/ic3/${rel}`); return r.ok ? r.json() : []; } catch (e) { return []; }
    }));
    const map = new Map();
    names.forEach((n, i) => lists[i].forEach((q) => map.set(n + '\u0000' + q.uid, q)));
    refs.forEach((r) => { r.q = map.get(r.mt + '\u0000' + r.uid) || null; });
    return exam;
  }

  global.EduCustomExam = { encode, decode, buildLink, toEngineQuestion, toLiveQuestion, attachBankQuestions, safeImage, hasCompression };
})(window);
