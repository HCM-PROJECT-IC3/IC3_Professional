/* ============================================================
   js/services/ai-core.js — LOGIC THUẦN của Trợ lý AI (Gemini). Không DOM, không mạng →
   chạy được trong Node (js/services/__tests__/ai-core.test.js).

   • build(task, payload)  chuẩn hoá dữ liệu + dựng câu lệnh cho 1 trong 4 việc:
       explain  — HS: vì sao đáp án em chọn chưa đúng (màn xem lại bài)
       genQuiz  — GV: soạn câu trắc nghiệm theo chủ đề / đoạn bài học (Soạn đề)
       reteach  — GV: gợi ý dạy lại câu cả lớp hay sai (dashboard)
       quickQ   — GV: câu hỏi miệng nhanh theo bài hôm nay (Gọi tên → Bốc thử thách)
     Câu lệnh do CODE dựng từ dữ liệu có cấu trúc — không nhận câu lệnh tự do, nên key giáo viên
     (qua Apps Script) không bị mượn để hỏi việc khác.
     ⚠️ apps/src/78-ai.gs § aiBuild_ là bản Apps Script của build() — PHẢI giống hệt
     (apps/__tests__/code-gs.test.js so 2 bản). Đổi bên này thì đổi cả bên kia.
   • requestBody / extractText / classify  gói & đọc REST generateContent của Gemini
   • parseQuiz / toQuickText  JSON câu hỏi AI trả về → dạng ngân hàng / dạng "Nhập nhanh" của Soạn đề
   • formatText  văn bản AI → HTML an toàn (chỉ **đậm** và gạch đầu dòng)
   • cacheKey    khoá lưu đệm (cùng việc + cùng dữ liệu → dùng lại, không gọi Gemini lần 2)
   0 Firebase: key cá nhân ở localStorage, key giáo viên ở Script Properties của Apps Script.
   ============================================================ */
(function (global) {
  'use strict';

  const MODELS = [
    { id: 'gemini-flash-latest', name: 'Gemini Flash (mới nhất) — nhanh, tiết kiệm' },
    { id: 'gemini-flash-lite-latest', name: 'Gemini Flash-Lite — rẻ và nhanh nhất' },
    { id: 'gemini-pro-latest', name: 'Gemini Pro — sâu hơn, chậm hơn' },
  ];
  const DEFAULT_MODEL = 'gemini-flash-latest';
  const MODEL_RE = /^[a-z0-9][a-z0-9.\-]{2,60}$/;
  const PUBLIC_TASKS = ['explain', 'quickQ'];   // học sinh / trang không đăng nhập gọi được qua Apps Script
  const STAFF_TASKS = ['genQuiz', 'reteach'];   // chỉ tài khoản quản trị (Apps Script kiểm vai trò)

  const SYS = 'Bạn là trợ giảng Tin học (IC3 / IC3 Spark) thân thiện ở trường phổ thông Việt Nam. '
    + 'Trả lời bằng tiếng Việt chuẩn, ngắn gọn, chính xác, hợp lứa tuổi. Không bịa thông tin; '
    + 'nếu câu hỏi hoặc đáp án có vẻ sai thì nói rõ.';

  // ── Chuẩn hoá dữ liệu vào (cắt ngắn để không tốn token, bỏ ký tự điều khiển) ──
  const clip = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, n);
  const clipBlock = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, n);
  const int = (v, a, b, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(a, Math.min(b, n)) : d; };
  const gradeOf = (v) => { const g = Math.round(Number(v)); return g >= 3 && g <= 12 ? g : 0; };
  /** Đáp án dạng bất kỳ (chuỗi, mảng, đối tượng nối cặp...) → 1 dòng chữ. */
  function describe(v) {
    if (v == null || v === '') return '';
    if (Array.isArray(v)) return v.map(describe).filter(Boolean).join('; ');
    if (typeof v === 'object') return Object.keys(v).map((k) => k + ' → ' + describe(v[k])).join('; ');
    return String(v);
  }
  const optionList = (a) => (Array.isArray(a) ? a : []).slice(0, 8).map((x) => clip(describe(x), 200)).filter(Boolean);
  const letters = (opts) => opts.map((o, i) => 'ABCDEFGH'.charAt(i) + '. ' + o).join('\n');
  const forGrade = (g) => (g ? ' lớp ' + g : '');

  const TASKS = {
    explain: {
      norm: (p) => ({
        question: clip(p.question, 900), type: clip(p.type, 20), options: optionList(p.options),
        correct: clip(describe(p.correct), 600), chosen: clip(describe(p.chosen), 600),
        explanation: clip(p.explanation, 400), grade: gradeOf(p.grade),
      }),
      ok: (n) => !!(n.question && n.correct),
      prompt: (n) => ({
        user: 'Học sinh' + forGrade(n.grade) + ' vừa trả lời SAI câu hỏi sau.\n'
          + 'Câu hỏi: ' + n.question + '\n'
          + (n.options.length ? 'Các phương án:\n' + letters(n.options) + '\n' : '')
          + 'Đáp án đúng: ' + n.correct + '\n'
          + 'Em đã chọn: ' + (n.chosen || '(bỏ trống)') + '\n'
          + (n.explanation ? 'Giải thích có sẵn: ' + n.explanation + '\n' : '')
          + 'Hãy viết cho em (xưng "em", tối đa 90 từ, không viết tiêu đề):\n'
          + '- Vì sao lựa chọn của em chưa đúng.\n- Vì sao đáp án đúng là đúng.\n- Một mẹo ngắn để nhớ.',
        json: false, maxTokens: 1024, temperature: 0.3,
      }),
    },
    genQuiz: {
      norm: (p) => ({
        topic: clip(p.topic, 200), source: clipBlock(p.source, 6000), count: int(p.count, 1, 15, 5),
        level: ['dễ', 'vừa', 'khó'].indexOf(p.level) >= 0 ? p.level : 'vừa', grade: gradeOf(p.grade), mix: !!p.mix,
      }),
      ok: (n) => !!(n.topic || n.source),
      prompt: (n) => ({
        user: 'Soạn ' + n.count + ' câu hỏi trắc nghiệm Tin học cho học sinh' + forGrade(n.grade) + ', độ khó ' + n.level
          + (n.topic ? ', về chủ đề: ' + n.topic : '') + '.\n'
          + (n.source ? 'Chỉ dựa trên nội dung bài học sau:\n"""\n' + n.source + '\n"""\n' : '')
          + 'Yêu cầu: mỗi câu có 4 phương án ngắn gọn và đúng 1 đáp án đúng'
          + (n.mix ? '; được xen vài câu Đúng/Sai (2 phương án "Đúng", "Sai") và vài câu nhiều đáp án đúng' : '')
          + '. Phương án sai phải hợp lý, không đánh đố, không trùng nhau. Mỗi câu kèm giải thích 1–2 câu.\n'
          + 'Chỉ trả về JSON dạng: [{"question":"...","options":["...","..."],"correct":["nguyên văn phương án đúng"],"explanation":"..."}]',
        json: true, maxTokens: 8192, temperature: 0.7,
      }),
    },
    reteach: {
      norm: (p) => ({
        question: clip(p.question, 900), options: optionList(p.options), correct: clip(describe(p.correct), 600),
        explanation: clip(p.explanation, 400), wrong: int(p.wrong, 0, 100000, 0), students: int(p.students, 0, 100000, 0),
        scope: clip(p.scope, 120), grade: gradeOf(p.grade),
      }),
      ok: (n) => !!(n.question && n.correct),
      prompt: (n) => ({
        user: 'Câu hỏi sau có ' + n.students + ' học sinh' + forGrade(n.grade) + ' làm sai (' + n.wrong + ' lượt sai'
          + (n.scope ? ', phạm vi: ' + n.scope : '') + ').\n'
          + 'Câu hỏi: ' + n.question + '\n'
          + (n.options.length ? 'Các phương án:\n' + letters(n.options) + '\n' : '')
          + 'Đáp án đúng: ' + n.correct + '\n'
          + (n.explanation ? 'Giải thích có sẵn: ' + n.explanation + '\n' : '')
          + 'Với vai trò tổ trưởng chuyên môn Tin học, gợi ý cho giáo viên (tối đa 180 từ), gồm 3 mục có gạch đầu dòng:\n'
          + '**Vì sao học sinh hay sai:** những hiểu nhầm thường gặp.\n'
          + '**Giảng lại trong 3 phút:** 2–3 bước, có ví dụ gần gũi.\n'
          + '**Câu hỏi củng cố:** 1 câu hỏi mới tương tự, kèm đáp án.',
        json: false, maxTokens: 1536, temperature: 0.5,
      }),
    },
    quickQ: {
      norm: (p) => ({ topic: clip(p.topic, 200), grade: gradeOf(p.grade), count: int(p.count, 1, 8, 5) }),
      ok: (n) => !!n.topic,
      prompt: (n) => ({
        user: 'Soạn ' + n.count + ' câu hỏi nhanh để giáo viên hỏi miệng cả lớp' + forGrade(n.grade) + ' sau bài: ' + n.topic + '.\n'
          + 'Mỗi câu ngắn (dưới 25 từ), không cần hình, có 4 phương án ngắn, đúng 1 đáp án đúng, giải thích dưới 20 từ.\n'
          + 'Chỉ trả về JSON dạng: [{"question":"...","options":["...","...","...","..."],"correct":["nguyên văn phương án đúng"],"explanation":"..."}]',
        json: true, maxTokens: 4096, temperature: 0.8,
      }),
    },
  };

  /**
   * @returns {{task, payload, system, user, json, maxTokens, temperature}}
   * Ném lỗi { code: 'invalid-argument' } nếu việc lạ hoặc thiếu dữ liệu.
   */
  function build(task, payload) {
    const t = Object.prototype.hasOwnProperty.call(TASKS, task) ? TASKS[task] : null;
    if (!t) throw Object.assign(new Error('Việc AI không hợp lệ: ' + task), { code: 'invalid-argument' });
    const n = t.norm(payload || {});
    if (!t.ok(n)) throw Object.assign(new Error('Thiếu dữ liệu cho việc AI ' + task), { code: 'invalid-argument' });
    const p = t.prompt(n);
    return { task, payload: n, system: SYS, user: p.user, json: p.json, maxTokens: p.maxTokens, temperature: p.temperature };
  }

  /** Thân yêu cầu REST models/{model}:generateContent. */
  function requestBody(b) {
    const gen = { temperature: b.temperature, maxOutputTokens: b.maxTokens };
    if (b.json) gen.responseMimeType = 'application/json';
    return { systemInstruction: { parts: [{ text: b.system }] }, contents: [{ role: 'user', parts: [{ text: b.user }] }], generationConfig: gen };
  }
  /** Phản hồi Gemini → { text, finish } (bỏ phần "suy nghĩ" của model). */
  function extractText(json) {
    const c = json && json.candidates && json.candidates[0];
    const parts = (c && c.content && c.content.parts) || [];
    const text = parts.filter((p) => p && !p.thought && typeof p.text === 'string').map((p) => p.text).join('').trim();
    const blocked = json && json.promptFeedback && json.promptFeedback.blockReason;
    return { text, finish: (c && c.finishReason) || (blocked ? 'SAFETY' : '') };
  }
  /** Lỗi HTTP của Gemini → loại: quota (429) · key (sai/khoá) · model (không có) · safety · busy. */
  function classify(status, body) {
    const s = String(body || '');
    if (status === 429 || /RESOURCE_EXHAUSTED|quota/i.test(s)) return 'quota';
    if (status === 401 || status === 403 || /API_KEY_INVALID|API key not valid|PERMISSION_DENIED/i.test(s)) return 'key';
    if (status === 404 || /models\/[^ ]+ is not found|NOT_FOUND/i.test(s)) return 'model';
    if (status === 400 && /SAFETY|blocked/i.test(s)) return 'safety';
    if (status === 400) return 'bad-request';
    return 'busy';
  }
  const KIND_MSG = {
    quota: 'Key đã hết hạn mức hôm nay (lỗi 429).',
    key: 'Key không hợp lệ hoặc đã bị khoá.',
    model: 'Model không tồn tại hoặc key chưa được dùng model này.',
    safety: 'Gemini từ chối trả lời nội dung này.',
    'bad-request': 'Yêu cầu không hợp lệ.',
    busy: 'Gemini đang bận hoặc mất mạng — thử lại sau.',
    empty: 'Gemini không trả về nội dung.',
  };

  // ── Câu hỏi AI soạn ──
  /** Văn bản JSON (có thể kèm ```json) → mảng câu dạng ngân hàng { question, type, options, correct, explanation }. */
  function parseQuiz(text, max) {
    let s = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
    const a = s.indexOf('['), z = s.lastIndexOf(']');
    let data = null;
    try { data = JSON.parse(s); } catch (e) { if (a >= 0 && z > a) { try { data = JSON.parse(s.slice(a, z + 1)); } catch (e2) { data = null; } } }
    if (data && !Array.isArray(data)) data = data.questions || data.items || null;
    if (!Array.isArray(data)) return [];
    const out = [];
    data.forEach((x) => {
      if (!x || typeof x !== 'object' || out.length >= (max || 20)) return;
      const question = clip(x.question || x.q, 600);
      const options = [];
      (Array.isArray(x.options) ? x.options : []).forEach((o) => { const v = clip(o, 200).replace(/^[A-Fa-f][.)]\s+/, ''); if (v && options.indexOf(v) < 0 && options.length < 6) options.push(v); });
      const raw = Array.isArray(x.correct) ? x.correct : x.correct != null ? [x.correct] : x.answer != null ? [x.answer] : [];
      const correct = [];
      raw.forEach((c) => {
        let v = clip(c, 200).replace(/^[A-Fa-f][.)]\s+/, '');
        if (typeof c === 'number' && options[c]) v = options[c];
        else if (/^[A-Fa-f]$/.test(v) && options.indexOf(v) < 0) v = options['ABCDEF'.indexOf(v.toUpperCase())] || v;
        if (options.indexOf(v) >= 0 && correct.indexOf(v) < 0) correct.push(v);
      });
      if (!question || options.length < 2 || !correct.length || correct.length === options.length) return;
      out.push({ question, type: correct.length > 1 ? 'multi' : 'single', options, correct, explanation: clip(x.explanation || x.explain, 400) });
    });
    return out;
  }
  /** Câu dạng ngân hàng → văn bản "Nhập nhanh" của Soạn đề (dấu * trước đáp án đúng; Đúng/Sai tự nhận ra). */
  function toQuickText(list) {
    return (list || []).map((q, i) => ['Câu ' + (i + 1) + ': ' + q.question]
      .concat(q.options.map((o, k) => (q.correct.indexOf(o) >= 0 ? '*' : '') + 'ABCDEF'.charAt(k) + '. ' + o))
      .concat(q.explanation ? ['Giải thích: ' + q.explanation] : []).join('\n')).join('\n\n');
  }

  // ── Hiển thị ──
  const escHtml = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  /** Văn bản AI → HTML an toàn: **đậm**, dòng "- " / "* " / "• " thành danh sách, còn lại là đoạn văn. */
  function formatText(text) {
    const inline = (s) => escHtml(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|\s)\*(\S[^*]*?)\*(?=\s|$)/g, '$1<i>$2</i>');
    const out = [];
    let list = null;
    String(text || '').replace(/\r/g, '').split('\n').forEach((line) => {
      const t = line.trim();
      const m = t.match(/^(?:[-*•]|\d+[.)])\s+(.*)$/);
      if (m) { if (!list) { list = []; out.push(list); } list.push(m[1]); return; }
      list = null;
      if (t) out.push(t);
    });
    return out.map((b) => (Array.isArray(b) ? '<ul>' + b.map((x) => '<li>' + inline(x) + '</li>').join('') + '</ul>' : '<p>' + inline(b) + '</p>')).join('');
  }

  /** FNV-1a 32 bit (đủ cho khoá lưu đệm trên máy — không dùng để bảo mật). */
  function hash(s) {
    let h = 0x811c9dc5;
    const str = String(s);
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(36);
  }
  const cacheKey = (task, normPayload) => task + ':' + hash(JSON.stringify(normPayload));

  global.EduAICore = {
    MODELS, DEFAULT_MODEL, MODEL_RE, PUBLIC_TASKS, STAFF_TASKS, KIND_MSG,
    build, requestBody, extractText, classify, parseQuiz, toQuickText, formatText, describe, hash, cacheKey,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.EduAICore;
})(typeof window !== 'undefined' ? window : globalThis);
