/* ============================================================
   js/arena/arena-core.js — LOGIC THUẦN của "Đấu trường" (arena.html).
   Không đụng DOM/mạng → chạy được trong Node (js/arena/__tests__).

   Đấu trường = chơi 1 bộ câu hỏi (ngân hàng data/ic3 hoặc link đề giáo
   viên ?de=) theo kiểu game, đấu với đối thủ máy trên CHÍNH máy học sinh:
     • speed — "Tốc độ" kiểu Kahoot: điểm theo tốc độ, chuỗi đúng, bóng ma kỷ lục
     • gold  — "Săn vàng" kiểu Blooket Gold Quest: đúng → mở 1 trong 3 rương
     • race  — "Đua về đích" kiểu Blooket Racing: đúng → tiến 1 bước
     • tug   — "Kéo co" 2 đội · spell — "Đấu phép" · heist — "Giải mã" (kiểu Wayground)
     • dino  — "Đào hoá thạch" kiểu Blooket Deceptive Dinos · moon — "Lên Mặt Trăng" kiểu Mastery Peak
     • boss  — "Diệt Virus" kiểu Boss Raid: cả đội cùng hạ 1 Trùm Virus có 3 giai đoạn
     • board — "Bảng điểm" kiểu Board Battle: giáo viên trình chiếu, các đội không cần máy
   + Linh vật: xu kiếm được khi chơi → mở hộp → sưu tập (localStorage).
   0 lượt Firebase, 0 Apps Script — không gửi gì ra ngoài.
   ============================================================ */
(function (global) {
  'use strict';

  // ── Ngẫu nhiên có hạt giống (test lặp lại được) ──
  function rngFrom(seed) {
    let s = (seed >>> 0) || 1;
    return function () { // mulberry32
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffle(arr, rng) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  function pickWeighted(list, rng) {
    const total = list.reduce((s, x) => s + x.w, 0);
    let r = rng() * total;
    for (const x of list) { r -= x.w; if (r < 0) return x; }
    return list[list.length - 1];
  }

  // ============================================================
  // CÂU HỎI — đổi câu ngân hàng / câu tự soạn sang câu Đấu trường. 4 dạng (q.kind):
  //   choice — 1 đáp án đúng (ô màu ▲ ◆ ● ■ như Kahoot): { options, correctIdx }
  //            (single, multi có 1 đáp án, mỗi mệnh đề Đúng/Sai, mỗi dòng của list/selectfill)
  //   multi  — chọn nhiều (Kahoot "multi-select"): { options, correct:[chỉ số đúng, tăng dần] }
  //   order  — sắp xếp (Kahoot "Puzzle"):          { options: các bước đã xáo, correct:[chỉ số theo đúng thứ tự] }
  //   match  — ghép đôi:                            { left, options: vế phải đã xáo, correct:[ô phải của từng mục trái] }
  // Câu trả lời `a`: choice → số; multi → mảng chỉ số đã chọn; order → mảng chỉ số theo thứ tự bấm;
  // match → mảng: a[i] = ô phải ghép với mục trái i. Câu cũ không có `kind` = choice.
  // ============================================================
  const MAX_OPTIONS = 6;
  const MAX_PAIRS = 6;   // = số màu ô đáp án
  const MAX_STEPS = 6;
  const KINDS = ['choice', 'multi', 'order', 'match'];
  const KIND_LABEL = { choice: 'Chọn 1', multi: 'Chọn nhiều', order: 'Sắp xếp', match: 'Ghép đôi' };
  const KIND_ICON = { choice: '🔘', multi: '☑️', order: '🔢', match: '🔗' };
  function strip(html) {
    return String(html ?? '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ').trim();
  }
  function imageOf(q) {
    const src = q.imageUrl || (q.image_file ? 'img/' + q.image_file : '');
    return /^(img\/[\w\-./]+|https:\/\/[^\s"'<>`\\]+)$/i.test(src) && !src.includes('..') ? src : '';
  }
  const unique = (arr) => new Set(arr).size === arr.length;
  /** Câu dẫn ngắn đặt trước từng dòng (câu dẫn dài quá thì bỏ để câu không quá dài trên máy chiếu). */
  const lead = (intro, dflt) => (intro && intro.length < 120 ? intro + ' — ' : dflt || '');
  /**
   * Tách đoạn có chỗ trống thành từng dòng theo "\n" (giống _splitFillBlankLines ở js/quiz-engine.js):
   * mỗi dòng là mảng token {t:'text', v} | {t:'blank', i}.
   */
  function fillLines(segments, nBlanks) {
    const lines = [[]];
    (segments || []).forEach((seg, i) => {
      String(seg || '').split('\n').forEach((part, pi) => {
        if (pi > 0) lines.push([]);
        if (strip(part)) lines[lines.length - 1].push({ t: 'text', v: strip(part) });
      });
      if (i < nBlanks) lines[lines.length - 1].push({ t: 'blank', i });
    });
    return lines.filter((l) => l.length);
  }

  /** 1 câu (dạng engine data/ic3) → 0..n câu Đấu trường (chưa xáo — buildDeck xáo). */
  function convert(q) {
    if (!q || typeof q !== 'object') return [];
    const base = { img: imageOf(q), uid: q.uid || '', expl: strip(q.explanation) };
    const text = strip(q.question);
    if (q.type === 'single' || q.type === 'multi') {
      const options = (q.options || []).map(strip);
      const ok = new Set((q.correct || []).map(strip));
      const hits = options.filter((o) => ok.has(o));
      if (!text || options.length < 2 || options.length > MAX_OPTIONS || options.some((o) => !o) || !unique(options)) return [];
      if (hits.length === 1 && (q.type === 'single' || ok.size === 1)) return [Object.assign({ text, options, answer: hits[0] }, base)];
      // Chọn nhiều: mọi đáp án đúng phải có trong danh sách, và không phải "chọn tất cả".
      if (q.type === 'multi' && hits.length >= 2 && hits.length === ok.size && hits.length < options.length) {
        return [Object.assign({ kind: 'multi', text, options, answers: hits }, base)];
      }
      return [];
    }
    if (q.type === 'truefalse') {
      const t = q.label_true || 'Đúng', f = q.label_false || 'Sai';
      return (q.statements || []).map((s) => strip(s.text) && (s.answer === 'true' || s.answer === 'false') && Object.assign({
        text: lead(text, 'Đúng hay sai? ') + strip(s.text),
        options: [t, f], answer: s.answer === 'true' ? t : f, keepOrder: true,
      }, base)).filter(Boolean);
    }
    if (q.type === 'list') {
      // Mỗi dòng có lựa chọn riêng → mỗi dòng 1 câu chọn 1.
      return (q.items || []).map((it) => {
        const options = (it && it.options || []).map(strip), answer = strip(it && it.correct), line = strip(it && it.text);
        if (!line || options.length < 2 || options.length > MAX_OPTIONS || !unique(options) || !options.includes(answer)) return null;
        return Object.assign({ text: lead(text) + line, options, answer, keepOrder: options.length === 2 }, base);
      }).filter(Boolean);
    }
    if (q.type === 'selectfill') {
      // Dạng "mỗi dòng 1 phát biểu + 1 ô chọn" → mỗi dòng 1 câu; dòng có ≥ 2 ô trống (câu liền mạch) thì bỏ qua.
      const bank = [...new Set((q.wordBank || []).map(strip).filter(Boolean))];
      const blanks = (q.blanks || []).map(strip);
      if (bank.length < 2 || bank.length > MAX_OPTIONS) return [];
      return fillLines(q.segments, blanks.length).map((line) => {
        const holes = line.filter((tk) => tk.t === 'blank');
        if (holes.length !== 1 || !bank.includes(blanks[holes[0].i])) return null;
        const last = line[line.length - 1].t === 'blank';
        const sentence = line.map((tk) => (tk.t === 'text' ? tk.v : last ? '' : '_____')).join(' ').replace(/\s+/g, ' ').trim();
        if (!sentence) return null;
        return Object.assign({ text: lead(text) + sentence, options: bank, answer: blanks[holes[0].i], keepOrder: true }, base);
      }).filter(Boolean);
    }
    if (q.type === 'ordering') {
      const items = (q.items || []).map(strip);
      if (!text || items.length < 3 || items.length > MAX_STEPS || items.some((x) => !x) || !unique(items)) return [];
      return [Object.assign({ kind: 'order', text, items }, base)];
    }
    if (q.type === 'matching') {
      const pairs = (q.pairs || []).map((p) => ({ l: strip(p && p.left), r: strip(p && p.right) }));
      if (!text || pairs.length < 2 || pairs.length > MAX_PAIRS || pairs.some((p) => !p.l || !p.r)
        || !unique(pairs.map((p) => p.r)) || !unique(pairs.map((p) => p.l))) return [];
      return [Object.assign({ kind: 'match', text, left: pairs.map((p) => p.l), right: pairs.map((p) => p.r) }, base)];
    }
    return [];
  }
  function kindOf(q) { return (q && q.kind) || 'choice'; }
  /** Hoán vị 0..n-1 khác thứ tự gốc (nếu n ≥ 2) — câu sắp xếp/ghép đôi không bao giờ "đúng sẵn". */
  function scramble(n, rng) {
    const idx = Array.from({ length: n }, (_, i) => i);
    for (let t = 0; t < 8; t++) {
      const p = shuffle(idx, rng);
      if (n < 2 || p.some((v, i) => v !== i)) return p;
    }
    return idx.slice(1).concat(0);
  }
  /** Câu đã đổi (convert) → câu chơi: xáo đáp án, tính chỉ số đáp án đúng. */
  function finalize(c, rng) {
    const common = { text: c.text, img: c.img, uid: c.uid, expl: c.expl };
    if (c.kind === 'multi') {
      const options = shuffle(c.options, rng);
      return Object.assign({ kind: 'multi', options, correct: c.answers.map((a) => options.indexOf(a)).sort((a, b) => a - b) }, common);
    }
    if (c.kind === 'order') {
      const p = scramble(c.items.length, rng); // p[k] = bước gốc nằm ở ô k
      return Object.assign({ kind: 'order', options: p.map((i) => c.items[i]), correct: c.items.map((_, i) => p.indexOf(i)) }, common);
    }
    if (c.kind === 'match') {
      const rows = shuffle(c.left.map((_, i) => i), rng);
      const left = rows.map((i) => c.left[i]), right = rows.map((i) => c.right[i]);
      const p = scramble(right.length, rng);
      return Object.assign({ kind: 'match', left, options: p.map((i) => right[i]), correct: left.map((_, i) => p.indexOf(i)) }, common);
    }
    const options = c.keepOrder ? c.options : shuffle(c.options, rng);
    return Object.assign({ options, correctIdx: options.indexOf(c.answer) }, common);
  }
  /**
   * Danh sách câu → bộ câu chơi: trộn câu + trộn đáp án (Đúng/Sai giữ thứ tự).
   * kinds (tuỳ chọn): chỉ lấy các dạng này, vd ['choice','match'].
   */
  /** Chuẩn hoá để so trùng: cùng chữ (không phân biệt hoa/thường, khoảng trắng, dấu câu 2 đầu). GIỮ dấu tiếng Việt. */
  function normText(s) {
    return String(s ?? '').normalize('NFC').toLowerCase().replace(/\s+/g, ' ').replace(/^[\s.,:;!?…"'“”()\-]+|[\s.,:;!?…"'“”()\-]+$/g, '');
  }
  /** Khoá trùng của 1 câu: đề + đáp án (chuẩn hoá). Cùng đề + cùng đáp án = 1 câu, dù khác phương án nhiễu/thứ tự. */
  function dedupeKey(c) {
    const ans = c.answer ?? c.answers ?? c.items ?? c.right;
    const norm = (v) => (Array.isArray(v) ? v.map(norm) : v && typeof v === 'object' ? JSON.stringify(v) : normText(v));
    const a = norm(ans);
    // Chọn nhiều: thứ tự đáp án không quan trọng
    const key = Array.isArray(a) && (c.kind === 'multi') ? a.slice().sort() : a;
    return normText(c.text) + '\u0000' + JSON.stringify(key);
  }
  function buildDeck(questions, rng, max, kinds) {
    const out = [];
    const seen = new Set();
    const want = Array.isArray(kinds) && kinds.length ? new Set(kinds) : null;
    (questions || []).forEach((q) => convert(q).forEach((c) => {
      if (want && !want.has(c.kind || 'choice')) return;
      const k = dedupeKey(c);
      if (!seen.has(k)) { seen.add(k); out.push(c); }
    }));
    return shuffle(out, rng).slice(0, max || out.length).map((c) => finalize(c, rng));
  }
  /** Số câu thật của trận: want = số câu chọn (0 = "Tất cả"), không vượt số câu bộ có — KHÔNG lặp câu. */
  function playCount(want, available) {
    const n = Math.max(0, available | 0);
    const w = Math.max(0, want | 0);
    return w === 0 ? n : Math.min(w, n);
  }
  /**
   * Bộ dài `needed` lượt cho chế độ cần nhiều lượt hơn số câu (Đua về đích, Lên Mặt Trăng): dùng HẾT các
   * câu rồi mới trộn lại lượt mới, và không bao giờ gặp lại đúng câu vừa hỏi ở chỗ nối 2 lượt.
   * Bản sao (không dùng chung object) để mỗi lượt độc lập.
   */
  function extendDeck(deck, needed, rng) {
    const src = deck || [];
    const need = Math.max(0, needed | 0);
    if (!src.length || need <= src.length) return src.slice(0, need || src.length);
    const out = src.slice();
    while (out.length < need) {
      const pass = shuffle(src.slice(), rng);
      if (pass.length > 1 && pass[0] === out[out.length - 1]) pass.push(pass.shift()); // không lặp liền nhau
      pass.forEach((c) => { if (out.length < need) out.push(Object.assign({}, c)); });
    }
    return out;
  }
  /** Đếm số câu chơi được theo từng dạng: { choice, multi, order, match }. */
  function countKinds(questions) {
    const n = { choice: 0, multi: 0, order: 0, match: 0 };
    buildDeck(questions, rngFrom(1)).forEach((q) => { n[kindOf(q)]++; });
    return n;
  }

  /** Câu trả lời có đúng khuôn dạng của câu không (máy chủ phòng kiểm tra trước khi nhận). */
  function isAnswer(q, a) {
    const n = (q.options || []).length;
    const inRange = (v) => Number.isInteger(v) && v >= 0 && v < n;
    switch (kindOf(q)) {
      case 'choice': return inRange(a);
      case 'multi': return Array.isArray(a) && a.length >= 1 && a.length <= n && a.every(inRange) && unique(a);
      case 'order': return Array.isArray(a) && a.length === n && a.every(inRange) && unique(a);
      case 'match': return Array.isArray(a) && a.length === (q.left || []).length && a.every(inRange);
      default: return false;
    }
  }
  /** Chấm đúng/sai (cả câu — kiểu Kahoot: sai 1 phần là sai). */
  function grade(q, a) {
    if (a === null || a === undefined || !isAnswer(q, a)) return false;
    if (kindOf(q) === 'choice') return a === q.correctIdx;
    const want = q.correct || [];
    const got = kindOf(q) === 'multi' ? a.slice().sort((x, y) => x - y) : a;
    return got.length === want.length && got.every((v, i) => v === want[i]);
  }
  /** Đúng bao nhiêu phần (để báo "đúng 3/4 cặp"): { right, of }. Câu chọn 1 → 0/1 hoặc 1/1. */
  function partial(q, a) {
    const k = kindOf(q);
    if (k === 'choice') return { right: grade(q, a) ? 1 : 0, of: 1 };
    const want = q.correct || [];
    if (!Array.isArray(a)) return { right: 0, of: want.length };
    if (k === 'multi') return { right: a.filter((v) => want.includes(v)).length, of: want.length };
    return { right: want.filter((v, i) => a[i] === v).length, of: want.length };
  }
  /** Các dòng mô tả đáp án đúng (hiện ở phần xem lại / CSV). */
  function answerLines(q) {
    const o = q.options || [];
    switch (kindOf(q)) {
      case 'multi': return (q.correct || []).map((i) => o[i]);
      case 'order': return (q.correct || []).map((i, n) => `${n + 1}. ${o[i]}`);
      case 'match': return (q.left || []).map((l, i) => `${l} → ${o[(q.correct || [])[i]]}`);
      default: return [o[q.correctIdx]];
    }
  }
  /** Các dòng mô tả câu trả lời của em (rỗng nếu không trả lời). */
  function chosenLines(q, a) {
    if (a === null || a === undefined || !isAnswer(q, a)) return [];
    const o = q.options || [];
    switch (kindOf(q)) {
      case 'multi': return a.map((i) => o[i]);
      case 'order': return a.map((i, n) => `${n + 1}. ${o[i]}`);
      case 'match': return (q.left || []).map((l, i) => `${l} → ${o[a[i]]}`);
      default: return [o[a]];
    }
  }
  function answerText(q) { return answerLines(q).join(kindOf(q) === 'choice' ? '' : ' | '); }

  /**
   * Bộ "Luyện câu sai": từ nhật ký [{ q, ok }] lấy các câu chưa đúng (bỏ trùng), xáo lại đáp án
   * để em không nhớ vị trí. Câu 2 lựa chọn (Đúng/Sai) giữ nguyên thứ tự.
   */
  function practiceDeck(log, rng) {
    const out = [];
    const seen = new Set();
    (log || []).forEach((x) => {
      if (!x || x.ok || !x.q || !Array.isArray(x.q.options) || seen.has(x.q.text)) return;
      const q = x.q, k = kindOf(q);
      if (k === 'choice') {
        const answer = q.options[q.correctIdx];
        if (answer === undefined) return;
        seen.add(q.text);
        const options = q.options.length <= 2 ? q.options.slice() : shuffle(q.options, rng);
        out.push({ text: q.text, options, correctIdx: options.indexOf(answer), img: q.img, uid: q.uid, expl: q.expl });
        return;
      }
      if (!Array.isArray(q.correct) || (k === 'match' && !Array.isArray(q.left))) return;
      seen.add(q.text);
      // Dựng lại dạng gốc rồi xáo lại như lúc tạo bộ câu.
      const o = q.options;
      const c = k === 'multi' ? { kind: k, options: o.slice(), answers: q.correct.map((i) => o[i]) }
        : k === 'order' ? { kind: k, items: q.correct.map((i) => o[i]) }
        : { kind: k, left: q.left.slice(), right: q.correct.map((i) => o[i]) };
      out.push(finalize(Object.assign(c, { text: q.text, img: q.img, uid: q.uid, expl: q.expl }), rng));
    });
    return shuffle(out, rng);
  }

  // ============================================================
  // ĐIỂM KIỂU KAHOOT
  // ============================================================
  /** Đúng: 1000 × (1 − (thời gian/giới hạn)/2), 500..1000. Sai/hết giờ: 0. */
  function speedPoints(correct, ms, limitMs) {
    if (!correct) return 0;
    const f = Math.min(1, Math.max(0, ms / limitMs));
    return Math.round(1000 * (1 - f / 2));
  }
  /** Thưởng chuỗi đúng: 2 câu liên tiếp +100, 3 → +200 ... tối đa +500. */
  function streakBonus(streak) { return streak >= 2 ? Math.min(500, (streak - 1) * 100) : 0; }

  // ============================================================
  // ĐỐI THỦ MÁY
  // ============================================================
  const BOT_NAMES = ['Mèo Wifi', 'Cú Bit', 'Rùa Byte', 'Cáo Pixel', 'Gấu Cache', 'Sóc USB', 'Cá Cloud', 'Thỏ Router'];
  const BOT_FACES = ['🐱', '🦉', '🐢', '🦊', '🐻', '🐿️', '🐟', '🐰'];
  /** level: 'easy' | 'normal' | 'hard' — độ chính xác + tốc độ của bot. */
  function makeBots(n, rng, level) {
    const acc = { easy: [0.45, 0.65], normal: [0.6, 0.8], hard: [0.75, 0.92] }[level] || [0.6, 0.8];
    return shuffle(BOT_NAMES.map((name, i) => ({ name, face: BOT_FACES[i] })), rng).slice(0, n).map((b, i) => Object.assign(b, {
      id: 'bot' + i, bot: true,
      accuracy: acc[0] + rng() * (acc[1] - acc[0]),
      speed: 0.25 + rng() * 0.5, // tỉ lệ thời gian thường dùng
      score: 0, gold: 0, pos: 0, streak: 0,
    }));
  }
  function botAnswer(bot, limitMs, rng) {
    const correct = rng() < bot.accuracy;
    const ms = Math.min(limitMs, Math.round(limitMs * Math.max(0.08, bot.speed + (rng() - 0.5) * 0.3)));
    return { correct, ms };
  }

  // ============================================================
  // SĂN VÀNG — rương (giống bảng của Blooket Gold Quest, đã chỉnh cho lớp học)
  // ============================================================
  const CHESTS = [
    { kind: 'gain', amount: 10, w: 14 }, { kind: 'gain', amount: 20, w: 14 }, { kind: 'gain', amount: 30, w: 12 },
    { kind: 'gain', amount: 40, w: 10 }, { kind: 'gain', amount: 50, w: 9 }, { kind: 'gain', amount: 100, w: 5 },
    { kind: 'mult', factor: 2, w: 7 }, { kind: 'mult', factor: 3, w: 3 },
    { kind: 'lose', pct: 25, w: 6 }, { kind: 'lose', pct: 50, w: 3 },
    { kind: 'steal', pct: 10, w: 6 }, { kind: 'steal', pct: 25, w: 4 },
    { kind: 'swap', w: 2 }, { kind: 'none', w: 5 },
  ];
  function chestLabel(c) {
    switch (c.kind) {
      case 'gain': return { icon: '🪙', title: `+${c.amount} vàng` };
      case 'mult': return { icon: c.factor === 3 ? '💎' : '✨', title: `Nhân ${c.factor}!` };
      case 'lose': return { icon: '🕳️', title: `Mất ${c.pct}%` };
      case 'steal': return { icon: '🦝', title: `Lấy ${c.pct}% của 1 bạn` };
      case 'swap': return { icon: '🔄', title: 'Đổi vàng với 1 bạn' };
      default: return { icon: '💨', title: 'Không có gì' };
    }
  }
  /** 3 rương — luôn có ít nhất 1 rương "được" để không quá xui. */
  function rollChests(rng) {
    const out = [pickWeighted(CHESTS, rng), pickWeighted(CHESTS, rng), pickWeighted(CHESTS, rng)];
    if (!out.some((c) => c.kind === 'gain' || c.kind === 'mult')) out[Math.floor(rng() * 3)] = { kind: 'gain', amount: 20 };
    return out.map((c) => Object.assign({}, c));
  }
  /**
   * Áp rương cho người mở (actor); target = người bị lấy/đổi (giàu nhất ngoài actor nếu không chỉ định).
   * Sửa trực tiếp .gold; trả { delta, target } để hiện thông báo.
   */
  function applyChest(c, actor, others) {
    const before = actor.gold;
    let target = null;
    const richest = () => others.filter((o) => o !== actor).sort((a, b) => b.gold - a.gold)[0] || null;
    switch (c.kind) {
      case 'gain': actor.gold += c.amount; break;
      case 'mult': actor.gold = actor.gold > 0 ? actor.gold * c.factor : 10 * c.factor; break;
      case 'lose': actor.gold = Math.floor(actor.gold * (1 - c.pct / 100)); break;
      case 'steal': {
        target = richest();
        if (target) { const take = Math.floor(target.gold * c.pct / 100); target.gold -= take; actor.gold += take; }
        break;
      }
      case 'swap': {
        target = richest();
        if (target && target.gold > actor.gold) { const t = target.gold; target.gold = actor.gold; actor.gold = t; } else target = null;
        break;
      }
      default: break;
    }
    return { delta: actor.gold - before, target };
  }

  // ============================================================
  // ĐUA VỀ ĐÍCH
  // ============================================================
  /** Đúng → +1 bước; chuỗi 3 đúng liên tiếp → thêm +1 (tăng tốc). Không vượt đích. */
  function raceStep(racer, correct, goal) {
    if (!correct) { racer.streak = 0; return 0; }
    racer.streak = (racer.streak || 0) + 1;
    const step = racer.streak % 3 === 0 ? 2 : 1;
    const before = racer.pos;
    racer.pos = Math.min(goal, racer.pos + step);
    return racer.pos - before;
  }

  // ============================================================
  // SINH TỒN (kiểu Battle Royale của Blooket) — dùng chung 1 người + Phòng cả lớp
  // ============================================================
  const LIVES = 3;        // số tim lúc đầu (cũng là tối đa)
  const HEAL_EVERY = 3;   // đúng liền bao nhiêu câu thì hồi 1 tim
  /**
   * Chấm 1 câu cho người chơi Sinh tồn (sửa trực tiếp p.hp / p.streak / p.outAt).
   * Đã bị loại thì không đổi gì. i = số thứ tự câu (để biết ai trụ lâu hơn).
   */
  function survivalStep(p, ok, i) {
    if (p.hp === undefined) p.hp = LIVES;
    if (p.hp <= 0) return { lost: false, healed: false, out: true, already: true };
    let lost = false, healed = false;
    if (ok) {
      p.streak = (p.streak || 0) + 1;
      if (p.streak % HEAL_EVERY === 0 && p.hp < LIVES) { p.hp++; healed = true; }
    } else {
      p.streak = 0; p.hp--; lost = true;
      if (p.hp <= 0) { p.hp = 0; p.outAt = i; }
    }
    return { lost, healed, out: p.hp <= 0, already: false };
  }
  /** So sánh xếp hạng Sinh tồn: nhiều tim hơn → trụ lâu hơn (bị loại muộn hơn) → nhiều điểm hơn. */
  function survivalOrder(a, b) {
    const outA = a.hp > 0 ? Infinity : (a.outAt ?? -1), outB = b.hp > 0 ? Infinity : (b.outAt ?? -1);
    return ((b.hp || 0) - (a.hp || 0)) || (outA === outB ? 0 : outB > outA ? 1 : -1) || ((b.score || 0) - (a.score || 0));
  }
  function hearts(hp) { return hp > 0 ? '❤️'.repeat(hp) + '🖤'.repeat(Math.max(0, LIVES - hp)) : '💀'; }

  // ============================================================
  // CÂU CÁ (kiểu Fishing Frenzy của Blooket) — đúng thì được thả câu
  // ============================================================
  const FISH = [
    { id: 'boot', icon: '👢', name: 'Chiếc ủng cũ', min: 0, max: 0, w: 8 },
    { id: 'small', icon: '🐟', name: 'Cá rô', min: 1, max: 3, w: 30 },
    { id: 'clown', icon: '🐠', name: 'Cá hề', min: 2, max: 5, w: 22 },
    { id: 'puffer', icon: '🐡', name: 'Cá nóc', min: 3, max: 7, w: 14 },
    { id: 'squid', icon: '🦑', name: 'Mực ống', min: 5, max: 10, w: 10 },
    { id: 'octo', icon: '🐙', name: 'Bạch tuộc', min: 6, max: 12, w: 7 },
    { id: 'shark', icon: '🦈', name: 'Cá mập', min: 15, max: 30, w: 4 },
    { id: 'whale', icon: '🐋', name: 'Cá voi xanh', min: 40, max: 60, w: 1 },
    { id: 'frenzy', icon: '⚡', name: 'Mồi thần — 3 lần câu tới nhân đôi!', min: 2, max: 4, w: 4, frenzy: 3 },
  ];
  /**
   * Thả câu 1 lần. frenzy = số lần còn được nhân đôi. Trả { fish, kg, frenzy } (frenzy mới, đã trừ lần này).
   */
  function castLine(rng, frenzy) {
    const fish = pickWeighted(FISH, rng);
    let kg = fish.min + Math.floor(rng() * (fish.max - fish.min + 1));
    let left = frenzy || 0;
    if (left > 0) { kg *= 2; left--; }
    if (fish.frenzy) left = Math.max(left, fish.frenzy);
    return { fish, kg, frenzy: left };
  }

  // ============================================================
  // VẬT PHẨM HỖ TRỢ (kiểu power-up của Wayground/Quizizz) — đúng liền 3 câu nhận 1 món
  // ============================================================
  const POWERUPS = {
    fifty: { icon: '✂️', name: '50:50', tip: 'Bỏ bớt 2 đáp án sai' },
    time: { icon: '⏳', name: 'Thêm giờ', tip: 'Thêm một nửa thời gian cho câu này' },
    x2: { icon: '✖️2', name: 'Nhân đôi', tip: 'Câu đúng kế tiếp được gấp đôi điểm' },
  };
  const POWER_EVERY = 3;
  const POWER_MAX = 3;
  /** Đúng liền đủ POWER_EVERY câu → 1 vật phẩm ngẫu nhiên (giữ tối đa POWER_MAX). Trả id hoặc ''. */
  function earnPowerup(held, streak, rng) {
    if (!streak || streak % POWER_EVERY !== 0 || held.length >= POWER_MAX) return '';
    const ids = Object.keys(POWERUPS);
    const id = ids[Math.floor(rng() * ids.length)];
    held.push(id);
    return id;
  }
  // ── Thẻ bài: cứ mỗi CARD_EVERY câu, đúng ≥ CARD_NEED câu trong nhóm đó thì được bốc 1 trong 3 lá úp ──
  const CARD_EVERY = 3, CARD_NEED = 2;
  /** tone: màu mặt lá · w: trọng số rút (càng nhỏ càng hiếm) · fa: icon Font Awesome. */
  const CARDS = {
    fifty: { name: '50:50', fa: 'fa-scissors', tone: 'power', w: 16, desc: 'Bỏ bớt 2 đáp án sai ở 1 câu — bấm để dùng' },
    time: { name: 'Thêm giờ', fa: 'fa-hourglass-half', tone: 'power', w: 14, desc: 'Thêm nửa thời gian cho 1 câu — bấm để dùng' },
    x2: { name: 'Nhân đôi', fa: 'fa-angles-up', tone: 'power', w: 12, desc: 'Câu đúng kế tiếp được gấp đôi điểm' },
    shield: { name: 'Khiên chuỗi', fa: 'fa-shield-halved', tone: 'guard', w: 12, desc: 'Sai 1 câu vẫn giữ nguyên chuỗi đúng' },
    gold: { name: 'Câu vàng', fa: 'fa-crown', tone: 'gold', w: 12, desc: 'Câu kế tiếp thành Câu hỏi vàng — đúng +5 xu' },
    bet: { name: 'Đặt cược', fa: 'fa-dice', tone: 'risk', w: 9, desc: 'Câu kế tiếp: đúng +8 xu, sai −3 xu thưởng' },
    coins: { name: 'Túi xu', fa: 'fa-sack-dollar', tone: 'coin', w: 18, desc: '+3 xu thưởng ngay' },
    jackpot: { name: 'Kho báu', fa: 'fa-gem', tone: 'rare', w: 4, desc: '+10 xu thưởng ngay — lá hiếm!' },
  };
  const CARD_XU = { coins: 3, jackpot: 10, betWin: 8, betLose: 3 };
  /** Vừa xong 1 nhóm CARD_EVERY câu và đúng đủ CARD_NEED câu trong nhóm đó? log: [{ ok }]. */
  function cardCheckpoint(log) {
    if (!log.length || log.length % CARD_EVERY !== 0) return false;
    return log.slice(-CARD_EVERY).filter((x) => x.ok).length >= CARD_NEED;
  }
  /**
   * 3 lá KHÁC NHAU, rút theo trọng số trong các lá dùng được ở trận này.
   * ctx: { x2 (chế độ có điểm nhân đôi), time (có giới hạn giờ), full (đã giữ đủ POWER_MAX vật phẩm) }.
   */
  function drawCards(rng, ctx) {
    const c = ctx || {};
    let pool = Object.keys(CARDS).filter((id) => {
      if ((id === 'fifty' || id === 'time' || id === 'x2') && c.full) return false;
      if (id === 'x2' && !c.x2) return false;
      if (id === 'time' && !c.time) return false;
      return true;
    });
    const out = [];
    while (out.length < 3 && pool.length) {
      const total = pool.reduce((s, id) => s + CARDS[id].w, 0);
      let r = rng() * total, pick = pool[pool.length - 1];
      for (const id of pool) { r -= CARDS[id].w; if (r < 0) { pick = id; break; } }
      out.push(pick);
      pool = pool.filter((id) => id !== pick);
    }
    return out;
  }
  /** 50:50 — chỉ số các đáp án SAI cần ẩn (để lại đáp án đúng + 1 đáp án sai). Câu ≤ 2 lựa chọn: không ẩn gì. */
  function fiftyFifty(q, rng) {
    if (kindOf(q) !== 'choice' || q.options.length <= 2) return [];
    const wrong = q.options.map((_, k) => k).filter((k) => k !== q.correctIdx);
    return shuffle(wrong, rng).slice(0, Math.min(2, wrong.length - 1));
  }

  // ============================================================
  // KÉO CO (kiểu Tug of War của Wayground) — 2 đội, dùng chung 1 người + Phòng cả lớp
  // ============================================================
  const TUG_GOAL = 100;  // dây lệch hẳn về 1 phía 100 vạch → đội đó thắng ngay
  const TUG_K = 30;      // chênh lệch lực kéo TRUNG BÌNH mỗi câu × hệ số này = số vạch dây dịch
  const TEAMS = { red: { name: 'Đội Đỏ', icon: '🔴' }, blue: { name: 'Đội Xanh', icon: '🔵' } };
  /** Lực kéo 1 người ở 1 câu: sai/bỏ trống 0 · đúng 1 · đúng trong nửa đầu thời gian 2. */
  function tugPull(ok, ms, limitMs) { return ok ? (limitMs && ms <= limitMs / 2 ? 2 : 1) : 0; }
  /**
   * Dịch dây sau 1 câu. red/blue = mảng lực kéo từng thành viên (vắng = 0). Lấy trung bình mỗi đội
   * nên đội đông hơn không được lợi. rope > 0 = nghiêng về Đội Đỏ.
   */
  function tugStep(rope, red, blue) {
    const avg = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
    const next = Math.max(-TUG_GOAL, Math.min(TUG_GOAL, rope + Math.round((avg(red) - avg(blue)) * TUG_K)));
    return { rope: next, delta: next - rope };
  }
  function tugWinner(rope) { return rope > 0 ? 'red' : rope < 0 ? 'blue' : ''; }
  /** Người mới vào đội đang ít người hơn (bằng nhau → Đỏ). */
  function tugTeamFor(counts) { return (counts.blue || 0) < (counts.red || 0) ? 'blue' : 'red'; }

  // ============================================================
  // ĐẤU PHÉP (kiểu WayArena) — đúng thì chọn 1 trong 3 phép: tấn công, phòng thủ, hồi máu
  // ============================================================
  const SPELL_HP = 100;
  const SPELLS = {
    fire: { icon: '🔥', name: 'Cầu lửa', tip: 'Gây 25 sát thương cho 1 đối thủ', kind: 'hit', power: 25, w: 30 },
    bolt: { icon: '⚡', name: 'Sấm sét', tip: 'Gây 12 sát thương cho mọi đối thủ', kind: 'all', power: 12, w: 18 },
    drain: { icon: '🌀', name: 'Hút máu', tip: 'Lấy 15 máu của 1 đối thủ', kind: 'drain', power: 15, w: 14 },
    shield: { icon: '🛡️', name: 'Khiên phép', tip: 'Chặn trọn đòn đánh kế tiếp nhắm vào em', kind: 'shield', power: 0, w: 20 },
    heal: { icon: '💚', name: 'Hồi phục', tip: 'Hồi 25 máu', kind: 'heal', power: 25, w: 18 },
  };
  const ATTACKS = ['fire', 'bolt', 'drain'];
  /** 3 phép khác nhau, luôn có ít nhất 1 phép tấn công. */
  function rollSpells(rng) {
    const pool = Object.keys(SPELLS).map((id) => ({ id, w: SPELLS[id].w }));
    const out = [];
    while (out.length < 3) {
      const id = pickWeighted(pool.filter((x) => !out.includes(x.id)), rng).id;
      out.push(id);
    }
    if (!out.some((id) => ATTACKS.includes(id))) out[Math.floor(rng() * 3)] = 'fire';
    return out;
  }
  /** Trả lời càng nhanh phép càng mạnh: ×1.0 (hết giờ) … ×1.5 (tức thì). */
  function spellBoost(ms, limitMs) { return limitMs ? 1 + 0.5 * Math.max(0, 1 - ms / limitMs) : 1; }
  const alive = (p) => p.hp > 0;
  /**
   * Thi triển phép. Sửa trực tiếp hp/shield/dmg/outAt. target chỉ cần cho fire/drain.
   * Trả { hits:[{ target, amount, blocked, ko }], heal } để hiện thông báo.
   */
  function castSpell(caster, id, target, players, boost, i) {
    const S = SPELLS[id];
    const res = { hits: [], heal: 0 };
    if (!S || !alive(caster)) return res;
    const hit = (t) => {
      if (!t || t === caster || !alive(t)) return 0;
      if (t.shield) { t.shield = false; res.hits.push({ target: t, amount: 0, blocked: true, ko: false }); return 0; }
      const amount = Math.min(t.hp, Math.round(S.power * boost));
      t.hp -= amount;
      caster.dmg = (caster.dmg || 0) + amount;
      if (t.hp <= 0) { t.hp = 0; t.outAt = i; }
      res.hits.push({ target: t, amount, blocked: false, ko: t.hp <= 0 });
      return amount;
    };
    if (S.kind === 'hit') hit(target);
    else if (S.kind === 'all') players.forEach((p) => { if (p !== caster) hit(p); });
    else if (S.kind === 'drain') { const got = hit(target); res.heal = Math.min(SPELL_HP - caster.hp, got); caster.hp += res.heal; }
    else if (S.kind === 'heal') { res.heal = Math.min(SPELL_HP - caster.hp, Math.round(S.power * boost)); caster.hp += res.heal; }
    else if (S.kind === 'shield') caster.shield = true;
    return res;
  }
  /** Máy chọn phép: máu thấp thì ưu tiên hồi/khiên, còn lại đánh người nhiều máu nhất (hay chính em). */
  function botSpell(bot, players, rng) {
    const ids = rollSpells(rng);
    const foes = players.filter((p) => p !== bot && alive(p) && !p.ghost);
    const defend = ids.find((id) => id === 'heal' || id === 'shield');
    if (defend && bot.hp <= 40 && !(defend === 'shield' && bot.shield)) return { id: defend, target: null };
    const atk = ids.find((id) => ATTACKS.includes(id));
    if (!foes.length) return { id: defend || ids[0], target: null };
    const sorted = foes.slice().sort((a, b) => b.hp - a.hp);
    const target = rng() < 0.6 ? sorted[0] : foes[Math.floor(rng() * foes.length)];
    return { id: atk || ids[0], target };
  }
  /** Xếp hạng Đấu phép: còn trụ → bị hạ muộn hơn → nhiều máu → gây nhiều sát thương. */
  function spellOrder(a, b) {
    const outA = alive(a) ? Infinity : (a.outAt ?? -1), outB = alive(b) ? Infinity : (b.outAt ?? -1);
    return (outA === outB ? 0 : outB > outA ? 1 : -1) || (b.hp - a.hp) || ((b.dmg || 0) - (a.dmg || 0));
  }

  // ============================================================
  // GIẢI MÃ (kiểu "Những người giải mã" của Wayground) — đào đá quý, đoán mã phá két của nhau
  // Mỗi người có 1 két khoá bằng mã 3 ký hiệu (▲ ◆ ● ■). Trả lời đúng → chọn 1 việc:
  //   • Đào đá quý (nhanh thì được nhiều hơn)
  //   • Phá két 1 bạn: đoán ký hiệu ở ô đang mở; đúng → sang ô sau, đủ 3 ô → lấy 50% đá quý của bạn đó
  //   • Đổi mã két của mình: mọi tiến độ người khác đang phá két em về 0
  // Tiến độ phá: crack[attackerId][targetId] = { pos, wrong:[ký hiệu đã thử sai ở ô pos] }.
  // ============================================================
  const VAULT_LEN = 3;
  const VAULT_SYMS = 4;
  const HEIST_STEAL = 0.5;
  const GEMS = [{ v: 10, w: 26 }, { v: 15, w: 24 }, { v: 20, w: 20 }, { v: 25, w: 14 }, { v: 35, w: 10 }, { v: 50, w: 6 }];
  function newVault(rng) { return Array.from({ length: VAULT_LEN }, () => Math.floor(rng() * VAULT_SYMS)); }
  function mineGems(rng, boost) { return Math.round(pickWeighted(GEMS, rng).v * (boost || 1)); }
  function crackOf(crack, a, t) {
    const row = crack[a] || (crack[a] = {});
    return row[t] || (row[t] = { pos: 0, wrong: [] });
  }
  /** Đổi mã két của `target`: mã mới + xoá mọi tiến độ đang phá két này. */
  function rekey(crack, target, rng) {
    target.vault = newVault(rng);
    Object.keys(crack).forEach((a) => { delete crack[a][target.id]; });
  }
  /** Đoán 1 ký hiệu. Trả { hit, pos (ô đã mở sau lượt), opened, take }. */
  function crackTry(crack, attacker, target, sym, rng) {
    const pr = crackOf(crack, attacker.id, target.id);
    if (target.vault[pr.pos] !== sym) {
      if (!pr.wrong.includes(sym)) pr.wrong.push(sym);
      return { hit: false, pos: pr.pos, opened: false, take: 0 };
    }
    pr.pos++; pr.wrong = [];
    if (pr.pos < VAULT_LEN) return { hit: true, pos: pr.pos, opened: false, take: 0 };
    const take = Math.floor((target.gems || 0) * HEIST_STEAL);
    target.gems -= take;
    attacker.gems = (attacker.gems || 0) + take;
    rekey(crack, target, rng);
    return { hit: true, pos: VAULT_LEN, opened: true, take };
  }
  /** Người đang tiến gần nhất tới két của `target` (để cảnh báo / quyết định đổi mã). */
  function vaultThreat(crack, target) {
    return Object.keys(crack).reduce((m, a) => Math.max(m, (crack[a][target.id] || { pos: 0 }).pos), 0);
  }
  /** Máy chọn việc: bị đe doạ (2/3 ô) → đổi mã; đang phá dở hoặc thấy két giàu → phá; còn lại đào. */
  function botHeist(bot, players, crack, rng) {
    if (vaultThreat(crack, bot) >= VAULT_LEN - 1 && rng() < 0.7) return { act: 'rekey' };
    const foes = players.filter((p) => p !== bot);
    const going = foes.filter((p) => crackOf(crack, bot.id, p.id).pos > 0);
    const rich = foes.slice().sort((a, b) => b.gems - a.gems)[0];
    const target = going[0] || (rich && rich.gems >= 40 && rng() < 0.45 ? rich : null);
    if (!target) return { act: 'mine' };
    const pr = crackOf(crack, bot.id, target.id);
    const left = Array.from({ length: VAULT_SYMS }, (_, k) => k).filter((k) => !pr.wrong.includes(k));
    return { act: 'crack', target, sym: left[Math.floor(rng() * left.length)] };
  }

  // ============================================================
  // ĐÀO HOÁ THẠCH (kiểu Deceptive Dinos của Blooket) — đào đá, có thể ăn gian, kiểm tra nhau
  // Trả lời đúng → chọn 1 việc:
  //   • Đào thật: chọn 1 trong 3 tảng đá, được số hoá thạch trong đó
  //   • Ăn gian: được gấp DINO_CHEAT lần, nhưng bị gắn cờ "đang ăn gian" DINO_CHEAT_TURNS lượt
  //   • Kiểm tra 1 bạn: bạn đó đang ăn gian → lấy DINO_FINE phần hoá thạch của bạn đó; trung thực → mất lượt
  // ============================================================
  const DINO_CHEAT = 3;
  const DINO_CHEAT_TURNS = 2;
  const DINO_FINE = 0.4;
  const ROCKS = [{ v: 0, w: 8 }, { v: 10, w: 24 }, { v: 20, w: 22 }, { v: 30, w: 18 }, { v: 50, w: 12 }, { v: 80, w: 6 }, { v: 120, w: 2 }];
  /** 3 tảng đá — luôn có ít nhất 1 tảng có hoá thạch. */
  function rollRocks(rng) {
    const out = [0, 1, 2].map(() => pickWeighted(ROCKS, rng).v);
    if (!out.some((v) => v > 0)) out[Math.floor(rng() * 3)] = 20;
    return out;
  }
  function rockLabel(v) { return v >= 120 ? { icon: '🦖', title: 'Bộ xương khủng long!' } : v >= 50 ? { icon: '🦕', title: 'Hoá thạch quý' } : v > 0 ? { icon: '🦴', title: 'Hoá thạch' } : { icon: '🪨', title: 'Đá trống' }; }
  /** Đào 1 tảng (sửa p.fossils / p.cheat). Trả số hoá thạch được. */
  function digRock(p, v, cheat) {
    const gain = cheat ? v * DINO_CHEAT : v;
    p.fossils = (p.fossils || 0) + gain;
    if (cheat) p.cheat = DINO_CHEAT_TURNS;
    return gain;
  }
  /** Kiểm tra `target`: đang ăn gian → mất DINO_FINE số hoá thạch cho người kiểm tra, xoá cờ. */
  function inspect(actor, target) {
    if (!target || target === actor || !(target.cheat > 0)) return { caught: false, take: 0 };
    const take = Math.floor((target.fossils || 0) * DINO_FINE);
    target.fossils -= take;
    actor.fossils = (actor.fossils || 0) + take;
    target.cheat = 0;
    target.caught = (target.caught || 0) + 1;
    return { caught: true, take };
  }
  /** Hết 1 lượt: cờ ăn gian của mọi người giảm 1. */
  function tickCheat(players) { players.forEach((p) => { if (p.cheat > 0) p.cheat--; }); }
  /** Máy chọn việc: đôi khi kiểm tra người vừa tăng vọt; còn lại đào, có lúc ăn gian. */
  function botDino(bot, players, rng) {
    const foes = players.filter((p) => p !== bot && !p.ghost);
    const sus = foes.filter((p) => (p.lastGain || 0) >= 60).sort((a, b) => b.lastGain - a.lastGain)[0];
    if (sus && rng() < 0.45) return { act: 'inspect', target: sus };
    if (foes.length && rng() < 0.1) return { act: 'inspect', target: foes[Math.floor(rng() * foes.length)] };
    return { act: 'dig', cheat: rng() < 0.3, rock: Math.floor(rng() * 3) };
  }

  // ============================================================
  // LÊN MẶT TRĂNG (kiểu leo đỉnh Mastery Peak của Wayground) — tên lửa bay theo câu đúng
  // Đúng: bay lên theo tốc độ trả lời; chuỗi đúng bật tầng đẩy (×1.5 từ 3 câu, ×2 từ 5 câu).
  // Sai/hết giờ: chết máy, tụt MOON_FALL nghìn km nhưng không tụt dưới trạm đã qua (mỗi 1/4 đường).
  // Ai chạm Mặt Trăng (MOON_KM nghìn km) trước thắng.
  // ============================================================
  const MOON_KM = 384;
  const MOON_FALL = 30;
  const MOON_STAGES = [96, 192, 288];
  /** Bậc tầng đẩy theo chuỗi đúng. */
  function moonBoost(streak) { return streak >= 5 ? 2 : streak >= 3 ? 1.5 : 1; }
  function moonFloor(km) { return MOON_STAGES.filter((s) => km >= s).pop() || 0; }
  /**
   * 1 câu cho 1 tên lửa (sửa p.km / p.streak / p.landedAt). n = số câu của trận (đúng hết, thật nhanh
   * thì tới nơi sau khoảng 7/10 số câu). Trả { gain, fell, stage (trạm mới qua, 0 = không), landed }.
   */
  function moonStep(p, ok, ms, limitMs, n, i) {
    const before = p.km || 0;
    if (before >= MOON_KM) return { gain: 0, fell: 0, stage: 0, landed: true };
    if (!ok) {
      p.streak = 0;
      const km = Math.max(moonFloor(before), before - MOON_FALL);
      p.km = km;
      return { gain: 0, fell: before - km, stage: 0, landed: false };
    }
    p.streak = (p.streak || 0) + 1;
    const fast = limitMs ? 1 - 0.5 * Math.min(1, Math.max(0, ms / limitMs)) : 1;
    const km = Math.min(MOON_KM, before + Math.round((MOON_KM / Math.max(1, n)) * fast * moonBoost(p.streak)));
    p.km = km;
    if (km >= MOON_KM && p.landedAt === undefined) p.landedAt = i;
    return { gain: km - before, fell: 0, stage: MOON_STAGES.find((s) => before < s && km >= s) || 0, landed: km >= MOON_KM };
  }
  /** Xếp hạng: đã đáp trước → bay cao hơn. */
  function moonOrder(a, b) {
    const la = a.landedAt ?? Infinity, lb = b.landedAt ?? Infinity;
    return (la - lb) || ((b.km || 0) - (a.km || 0)) || (a.bot === b.bot ? 0 : a.bot ? 1 : -1);
  }

  // ============================================================
  // DIỆT VIRUS (kiểu Boss Raid) — em + 3 bạn máy chung 1 đội, cùng hạ "Trùm Virus"
  // Đúng: tấn công (10, nhanh thêm tới 6) × combo theo chuỗi (×1.1 … ×1.4), 15% chí mạng ×2.
  // Sai/hết giờ: Virus đánh trả, mất 1 tim (đúng liền 3 câu hồi 1 tim — như Sinh tồn); hết tim = gục.
  // Giai đoạn theo máu Virus: ≤60% "Nổi giận" — lượt nào cả đội đúng chưa tới một nửa, Virus nhân bản
  // hồi 6% máu; ≤25% "Liều chết" — chí mạng 30%. Hạ Virus trước khi hết câu → cả đội thắng; MVP = gây nhiều sát thương nhất.
  // ============================================================
  const BOSS_PER = 7;        // máu Virus = số câu × số người × BOSS_PER (đội đúng ~70% thì thường hạ được)
  const BOSS_HEAL = 0.06;
  const BOSS_PHASES = [
    { name: 'Trùm Virus', sub: 'Cả đội trả lời đúng để tấn công!' },
    { name: 'NỔI GIẬN', sub: 'Đội đúng chưa tới một nửa → Virus tự nhân bản hồi máu' },
    { name: 'LIỀU CHẾT', sub: 'Virus sắp gục — chí mạng dễ hơn, dồn sức!' },
  ];
  function bossMaxHp(n, team) { return Math.max(40, Math.round(n * team * BOSS_PER)); }
  function bossPhase(hp, max) { const r = hp / max; return r <= 0.25 ? 2 : r <= 0.6 ? 1 : 0; }
  function bossCombo(streak) { return 1 + 0.1 * Math.min(4, Math.max(0, streak - 1)); }
  /**
   * Đòn của 1 người ở 1 câu (sửa p.hp / p.streak / p.dmg qua survivalStep). Người đã gục không đánh.
   * Trả { dmg, crit, life } — life như survivalStep (lost/healed/out).
   */
  function bossHit(p, ok, ms, limitMs, phase, rng, i) {
    if (p.hp <= 0) return { dmg: 0, crit: false, life: { lost: false, healed: false, out: true, already: true } };
    const life = survivalStep(p, ok, i);
    if (!ok) return { dmg: 0, crit: false, life };
    const fast = limitMs ? 6 * Math.max(0, 1 - ms / limitMs) : 3;
    const crit = rng() < (phase >= 2 ? 0.3 : 0.15);
    const dmg = Math.round((10 + fast) * bossCombo(p.streak) * (crit ? 2 : 1));
    p.dmg = (p.dmg || 0) + dmg;
    return { dmg, crit, life };
  }
  /**
   * Hết 1 lượt: trừ tổng sát thương, Virus "Nổi giận" mà đội đúng < nửa số người còn trụ → hồi máu.
   * boss = { hp, max, top } (top = giai đoạn cao nhất đã tới, để chữ lớn chỉ hiện 1 lần).
   * Trả { dealt, heal, phase, newPhase (giai đoạn vừa bước vào, 0 = không), ko }.
   */
  function bossRound(boss, total, okCount, alive) {
    const before = boss.hp, phase0 = bossPhase(before, boss.max);
    boss.hp = Math.max(0, before - total);
    let heal = 0;
    if (boss.hp > 0 && phase0 >= 1 && okCount * 2 < alive) {
      heal = Math.min(boss.max - boss.hp, Math.round(boss.max * BOSS_HEAL));
      boss.hp += heal;
    }
    const phase = bossPhase(boss.hp, boss.max);
    const newPhase = phase > (boss.top || 0) ? phase : 0;
    if (newPhase) boss.top = phase;
    return { dealt: before - Math.max(0, before - total), heal, phase, newPhase, ko: boss.hp <= 0 };
  }
  /** Xếp hạng trong đội: gây nhiều sát thương hơn → còn nhiều tim hơn → em trước bạn máy. */
  function bossOrder(a, b) {
    return ((b.dmg || 0) - (a.dmg || 0)) || ((b.hp || 0) - (a.hp || 0)) || (a.bot === b.bot ? 0 : a.bot ? 1 : -1);
  }

  // ============================================================
  // BẢNG ĐIỂM (kiểu Board Battle) — giáo viên trình chiếu, các đội trả lời không cần máy
  // ============================================================
  const BOARD_VALUES = [100, 200, 300, 400, 500];
  /**
   * Bảng n ô (mỗi ô 1 câu của bộ đã xáo, lặp nếu thiếu). Khoảng 1/6 số ô là ô đặc biệt:
   *   x2   — điểm gấp đôi
   *   risk — đội trả lời SAI bị trừ một nửa giá trị ô
   */
  function makeBoard(deck, n, rng) {
    const count = Math.max(1, Math.min(n || deck.length, 30, deck.length || 1));
    const values = shuffle(Array.from({ length: count }, (_, i) => BOARD_VALUES[i % BOARD_VALUES.length]), rng);
    const special = Math.max(1, Math.round(count / 6));
    const slots = shuffle(Array.from({ length: count }, (_, i) => i), rng).slice(0, Math.min(count, special * 2));
    return values.map((value, i) => {
      const si = slots.indexOf(i);
      return { i, q: deck[i % deck.length], value, special: si < 0 ? '' : si % 2 ? 'risk' : 'x2', open: false };
    });
  }
  /** Điểm cộng/trừ của mỗi đội sau 1 ô. rightIds = các đội trả lời đúng. Trả { [teamId]: delta }. */
  function boardScore(tile, teamIds, rightIds) {
    const out = {};
    teamIds.forEach((id) => {
      if (rightIds.includes(id)) out[id] = tile.value * (tile.special === 'x2' ? 2 : 1);
      else out[id] = tile.special === 'risk' ? -Math.round(tile.value / 2) : 0;
    });
    return out;
  }

  // ============================================================
  // XẾP HẠNG
  // ============================================================
  function rank(players, key) {
    return players.slice().sort((a, b) => (b[key] - a[key]) || (a.bot === b.bot ? 0 : a.bot ? 1 : -1));
  }

  // ============================================================
  // XU + LINH VẬT (kiểu "Blook" của Blooket)
  // ============================================================
  /** Xu thưởng sau 1 ván: theo số câu đúng + thứ hạng (không thưởng khi không đúng câu nào). */
  function coinsFor({ correct, place, players }) {
    if (!correct) return 0;
    const placeBonus = { 1: 15, 2: 10, 3: 6 }[place] || 2;
    return Math.min(60, correct * 2 + (players > 1 ? placeBonus : 0));
  }
  const PACK_PRICE = 25;
  const RARITY = {
    common: { label: 'Thường', w: 600, refund: 3 },
    rare: { label: 'Hiếm', w: 270, refund: 8 },
    epic: { label: 'Sử thi', w: 100, refund: 15 },
    legendary: { label: 'Huyền thoại', w: 27, refund: 40 },
    mystery: { label: 'Bí ẩn', w: 3, refund: 100 },
  };
  const PACKS = [
    { id: 'hardware', name: 'Hộp Phần cứng', icon: '💻', blooks: [
      ['mouse', 'Chuột Click', '🖱️', 'common'], ['keyboard', 'Bàn Phím', '⌨️', 'common'], ['printer', 'Máy In', '🖨️', 'common'],
      ['disk', 'Đĩa Mềm', '💾', 'common'], ['battery', 'Pin Năng Lượng', '🔋', 'rare'], ['monitor', 'Màn Hình', '🖥️', 'rare'],
      ['chip', 'Chip Thông Minh', '🧠', 'epic'], ['robot', 'Rô-bốt IC3', '🤖', 'legendary'], ['alien', 'Bọ Lỗi Ngoài Hành Tinh', '👾', 'mystery'],
    ] },
    { id: 'internet', name: 'Hộp Internet', icon: '🌐', blooks: [
      ['mail', 'Thư Điện Tử', '📧', 'common'], ['link', 'Liên Kết', '🔗', 'common'], ['cloud', 'Đám Mây', '☁️', 'common'],
      ['phone', 'Điện Thoại', '📱', 'common'], ['satellite', 'Vệ Tinh', '🛰️', 'rare'], ['compass', 'La Bàn Web', '🧭', 'rare'],
      ['rocket', 'Tên Lửa 5G', '🚀', 'epic'], ['owl', 'Cú Tra Cứu', '🦉', 'legendary'], ['ufo', 'Đĩa Bay Wi-Fi', '🛸', 'mystery'],
    ] },
    { id: 'security', name: 'Hộp An toàn', icon: '🛡️', blooks: [
      ['lock', 'Ổ Khoá', '🔒', 'common'], ['key', 'Chìa Khoá', '🔑', 'common'], ['shield', 'Khiên Chắn', '🛡️', 'common'],
      ['bug', 'Sâu Máy Tính', '🐛', 'common'], ['detective', 'Thám Tử Mạng', '🕵️', 'rare'], ['virus', 'Vi-rút Bị Bắt', '🦠', 'rare'],
      ['fire', 'Tường Lửa', '🧯', 'epic'], ['dragon', 'Rồng Bảo Mật', '🐉', 'legendary'], ['ghost', 'Bóng Ma Hacker', '👻', 'mystery'],
    ] },
    { id: 'pets', name: 'Hộp Thú cưng', icon: '🐾', blooks: [
      ['cat', 'Mèo', '🐱', 'common'], ['dog', 'Cún', '🐶', 'common'], ['frog', 'Ếch', '🐸', 'common'], ['penguin', 'Chim Cánh Cụt', '🐧', 'common'],
      ['fox', 'Cáo', '🦊', 'rare'], ['panda', 'Gấu Trúc', '🐼', 'rare'], ['tiger', 'Hổ', '🐯', 'epic'],
      ['unicorn', 'Kỳ Lân', '🦄', 'legendary'], ['dragonpet', 'Rồng Con', '🐲', 'mystery'],
    ] },
  ].map((p) => Object.assign(p, { blooks: p.blooks.map(([id, name, emoji, rarity]) => ({ id: p.id + ':' + id, name, emoji, rarity, pack: p.id })) }));
  function blookById(id) {
    for (const p of PACKS) { const b = p.blooks.find((x) => x.id === id); if (b) return b; }
    return null;
  }
  // Thử thách quanh việc mở hộp (kiểu gacha "bảo hiểm" + sưu tập):
  //   • Bảo hiểm: mở PITY_MAX hộp liền không ra Sử thi trở lên → hộp kế chắc chắn Sử thi trở lên
  //   • Hoàn thành 1 hộp (đủ 9 Linh vật) → thưởng SET_BONUS xu, 1 lần
  //   • Trùng Linh vật → lên sao (★ 1 con · ★★ 3 con · ★★★ 6 con) + hoàn xu
  //   • Nhiệm vụ ngày: đúng DAILY_GOAL câu trong Đấu trường hôm nay → 1 vé mở hộp miễn phí
  const PITY_MAX = 10;
  const HIGH = ['epic', 'legendary', 'mystery'];
  const SET_BONUS = 60;
  const STAR_AT = [1, 3, 6];
  const DAILY_GOAL = 20;
  const starsOf = (count) => STAR_AT.filter((n) => (count || 0) >= n).length;
  /** Mở 1 hộp: chọn độ hiếm theo trọng số rồi chọn đều trong độ hiếm đó. `high` → chỉ Sử thi trở lên (bảo hiểm). */
  function openPack(packId, rng, high) {
    const pack = PACKS.find((p) => p.id === packId);
    if (!pack) return null;
    const avail = Object.keys(RARITY).filter((r) => (!high || HIGH.includes(r)) && pack.blooks.some((b) => b.rarity === r)).map((r) => ({ r, w: RARITY[r].w }));
    const r = pickWeighted(avail, rng).r;
    const pool = pack.blooks.filter((b) => b.rarity === r);
    return pool[Math.floor(rng() * pool.length)];
  }
  /**
   * Hồ sơ người chơi (lưu localStorage theo biệt danh): { coins, owned:{id:count}, avatar, best:{setKey: {...}} }.
   * buyPack: trừ xu, thêm linh vật; trùng → hoàn lại xu theo độ hiếm. Trả { ok, blook, dupe, refund }.
   */
  // Bắt đầu 0 xu: đổi biệt danh không "cày" được xu; 1 ván đầu đã đủ mở hộp đầu tiên.
  function newProfile() { return { coins: 0, owned: {}, avatar: '', best: {}, games: 0 }; }
  /**
   * opts.ticket → dùng vé miễn phí (nhiệm vụ ngày) thay cho xu.
   * Trả thêm: pity (hộp này nhờ bảo hiểm), stars + starUp (lên sao), set (hoàn thành hộp → {bonus}).
   */
  function buyPack(profile, packId, rng, opts) {
    const ticket = !!(opts && opts.ticket);
    if (ticket ? !(profile.tickets > 0) : profile.coins < PACK_PRICE) return { ok: false, reason: ticket ? 'ticket' : 'coins' };
    const pity = (profile.pity || 0) >= PITY_MAX - 1;
    const blook = openPack(packId, rng, pity);
    if (!blook) return { ok: false, reason: 'pack' };
    if (ticket) profile.tickets--; else profile.coins -= PACK_PRICE;
    profile.pity = HIGH.includes(blook.rarity) ? 0 : (profile.pity || 0) + 1;
    profile.opened = (profile.opened || 0) + 1;
    const before = profile.owned[blook.id] || 0;
    const dupe = before > 0;
    profile.owned[blook.id] = before + 1;
    const refund = dupe ? RARITY[blook.rarity].refund : 0;
    profile.coins += refund;
    if (!profile.avatar) profile.avatar = blook.id;
    const stars = starsOf(before + 1);
    let set = null;
    const pack = PACKS.find((p) => p.id === packId);
    profile.sets = profile.sets || {};
    if (!dupe && !profile.sets[packId] && pack.blooks.every((b) => profile.owned[b.id])) {
      profile.sets[packId] = Date.now();
      profile.coins += SET_BONUS;
      set = { bonus: SET_BONUS };
    }
    return { ok: true, blook, dupe, refund, pity, stars, starUp: dupe && stars > starsOf(before), set };
  }
  /** Nhiệm vụ ngày: cộng số câu đúng (day = 'YYYY-MM-DD' giờ máy). Đủ DAILY_GOAL lần đầu trong ngày → +1 vé. */
  function addDaily(profile, correct, day) {
    if (!profile.daily || profile.daily.day !== day) profile.daily = { day, correct: 0, done: false };
    profile.daily.correct += Math.max(0, correct | 0);
    if (!profile.daily.done && profile.daily.correct >= DAILY_GOAL) {
      profile.daily.done = true;
      profile.tickets = (profile.tickets || 0) + 1;
      return true;
    }
    return false;
  }
  function dailyOf(profile, day) {
    const d = profile.daily && profile.daily.day === day ? profile.daily : { correct: 0, done: false };
    return { correct: Math.min(DAILY_GOAL, d.correct), goal: DAILY_GOAL, done: d.done };
  }

  /** Bóng ma kỷ lục (Kahoot ghost mode): điểm cộng dồn sau mỗi câu của lần chơi tốt nhất. */
  function ghostScoreAt(best, i) {
    if (!best || !Array.isArray(best.trail) || !best.trail.length) return null;
    return best.trail[Math.min(i, best.trail.length - 1)];
  }

  global.EduArenaCore = {
    rngFrom, shuffle, strip, convert, buildDeck, practiceDeck, normText, dedupeKey, playCount, extendDeck,
    KINDS, KIND_LABEL, KIND_ICON, kindOf, countKinds, isAnswer, grade, partial, answerLines, chosenLines, answerText,
    speedPoints, streakBonus, makeBots, botAnswer,
    CHESTS, rollChests, applyChest, chestLabel, raceStep, rank,
    LIVES, HEAL_EVERY, survivalStep, survivalOrder, hearts, FISH, castLine,
    POWERUPS, POWER_EVERY, POWER_MAX, earnPowerup, fiftyFifty,
    CARDS, CARD_EVERY, CARD_NEED, CARD_XU, cardCheckpoint, drawCards,
    TUG_GOAL, TUG_K, TEAMS, tugPull, tugStep, tugWinner, tugTeamFor,
    SPELL_HP, SPELLS, rollSpells, spellBoost, castSpell, botSpell, spellOrder,
    VAULT_LEN, VAULT_SYMS, HEIST_STEAL, newVault, mineGems, crackOf, rekey, crackTry, vaultThreat, botHeist,
    DINO_CHEAT, DINO_CHEAT_TURNS, DINO_FINE, rollRocks, rockLabel, digRock, inspect, tickCheat, botDino,
    MOON_KM, MOON_FALL, MOON_STAGES, moonBoost, moonFloor, moonStep, moonOrder,
    BOSS_PER, BOSS_HEAL, BOSS_PHASES, bossMaxHp, bossPhase, bossCombo, bossHit, bossRound, bossOrder,
    BOARD_VALUES, makeBoard, boardScore,
    coinsFor, PACK_PRICE, RARITY, PACKS, blookById, openPack, newProfile, buyPack, PITY_MAX, SET_BONUS, STAR_AT, DAILY_GOAL, starsOf, addDaily, dailyOf, ghostScoreAt,
  };
})(typeof window !== 'undefined' ? window : globalThis);
