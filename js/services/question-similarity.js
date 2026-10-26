/* ============================================================
   js/services/question-similarity.js — tìm câu hỏi "na ná nhau" trong 1 đề
   (Soạn đề → Tình trạng đề). Ngân hàng All Key có nhiều biến thể cùng ý
   khác uid ("Lợi ích của việc duyệt web ở chế độ riêng tư…" có 4 bản),
   chặn trùng uid không bắt được.

   So theo tập từ (bỏ dấu câu, ngoặc kép, thẻ HTML), 2 tầng:
     • câu hỏi: Jaccard ≥ 0,75, hoặc câu ngắn hơn (≥ 5 từ) nằm ≥ 85%
       trong câu dài hơn;
     • phần đáp án/mệnh đề: Jaccard ≥ 0,25 — loại các câu mở đầu chung
       ("Với mỗi câu phát biểu, hãy chọn Đúng…", "Ghép nối đúng ý nghĩa
       các thuật ngữ sau") nhưng hỏi chuyện khác nhau.
   Thuần, không mạng — chạy được trong Node.
   ============================================================ */
(function (global) {
  'use strict';

  const STEM_MIN = 0.75;
  const CONTAIN_MIN = 0.85;
  const CONTAIN_MIN_WORDS = 5;
  const BODY_MIN = 0.25;

  function words(text) {
    const s = String(text || '').replace(/<[^>]*>/g, ' ').toLowerCase().normalize('NFC');
    return new Set(s.split(/[^\p{L}\p{N}]+/u).filter(Boolean));
  }

  function overlap(a, b) {
    let inter = 0;
    a.forEach((w) => { if (b.has(w)) inter++; });
    return inter;
  }

  function stemSimilarity(a, b) {
    if (!a.size || !b.size) return 0;
    const inter = overlap(a, b);
    const jac = inter / (a.size + b.size - inter);
    const small = Math.min(a.size, b.size);
    const cont = small >= CONTAIN_MIN_WORDS ? inter / small : 0;
    return Math.max(jac, cont >= CONTAIN_MIN ? cont : 0);
  }

  function bodySimilarity(a, b) {
    if (!a.size && !b.size) return 1; // cả 2 không có đáp án (vd. Đúng/Sai 1 mệnh đề) → chỉ xét câu hỏi
    if (!a.size || !b.size) return 0;
    const inter = overlap(a, b);
    return inter / (a.size + b.size - inter);
  }

  /** Chữ trong phần đáp án / mệnh đề / cặp nối của 1 câu (mọi dạng). */
  function bodyText(q) {
    const out = [];
    const SKIP = /^(question|explanation|expl|uid|id|type|correct|answer|image.*|img|imageUrl|hotspots?)$/;
    (function walk(v, key) {
      if (key && SKIP.test(key)) return;
      if (typeof v === 'string') out.push(v);
      else if (Array.isArray(v)) v.forEach((x) => walk(x, ''));
      else if (v && typeof v === 'object') Object.keys(v).forEach((k) => walk(v[k], k));
    })(q, '');
    return out.join(' ');
  }

  /**
   * Nhóm các câu na ná nhau.
   * @param {{q:string, body?:string}[]} items câu hỏi + chữ phần đáp án, theo thứ tự trong đề
   * @returns {number[][]} các nhóm chỉ số (≥ 2 câu/nhóm), xếp theo câu đầu tiên
   */
  function groups(items) {
    const stems = items.map((it) => words(it.q));
    const bodies = items.map((it) => words(it.body));
    const parent = items.map((_, i) => i);
    const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        if (stemSimilarity(stems[i], stems[j]) >= STEM_MIN && bodySimilarity(bodies[i], bodies[j]) >= BODY_MIN) parent[find(j)] = find(i);
      }
    }
    const by = new Map();
    items.forEach((_, i) => { const r = find(i); if (!by.has(r)) by.set(r, []); by.get(r).push(i); });
    return [...by.values()].filter((g) => g.length > 1).sort((x, y) => x[0] - y[0]);
  }

  /**
   * Hàm kiểm tra nhanh 1 câu mới có na ná câu nào trong danh sách không
   * (chọn câu thay thế ở Soạn đề) — tính tập từ của danh sách 1 lần.
   * @param {{q:string, body?:string}[]} items
   * @returns {(it:{q:string, body?:string}) => boolean}
   */
  function matcher(items) {
    const pre = items.map((it) => [words(it.q), words(it.body)]);
    return (it) => {
      const s = words(it.q), b = words(it.body);
      return pre.some(([s2, b2]) => stemSimilarity(s, s2) >= STEM_MIN && bodySimilarity(b, b2) >= BODY_MIN);
    };
  }

  const api = { words, stemSimilarity, bodySimilarity, bodyText, groups, matcher };
  global.EduQuestionSimilarity = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
