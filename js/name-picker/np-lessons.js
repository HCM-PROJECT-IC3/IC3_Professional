/* ============================================================
   js/name-picker/np-lessons.js — câu hỏi "Bốc thử thách" theo tiết/bài lớp đang học (trang Gọi tên).
   Khối lớp → cấp độ (Lớp 3/6 → LV1 · 4/7 → LV2 · 5/8 → LV3, như sảnh thi) → PPCT 45 tiết
   (data/ic3/ppct-lessons.json, sinh bởi scripts/build-ppct-lessons.py) → bộ "Bài N." của đúng cấp đó.
   Chỉ hỏi bài của tiết đã chọn (tiết Ôn tập/Kiểm tra = các bài từ tiết ôn trước tới đó) — không lấy bài
   chưa học, không lấy bộ Ôn tập/Kiểm tra All Key (giữ 3 nhóm bộ câu tách riêng).
   Lọc câu để hỏi miệng trên máy chiếu: chỉ trắc nghiệm 1/nhiều đáp án có đủ phương án, không dựa vào hình,
   không quá dài; câu nhiều đáp án ghi rõ số đáp án cần chọn.
     levelForClass(cls) · LEVELS · periodsOf(rows) · suitable(q, grade) · toCard(q, src)   hàm thuần (có test)
     load() → { [level]: { grade, periods } } · pool(level, tiet) → Promise<thẻ câu hỏi>
   Chỉ đọc file tĩnh — không Firebase, không gửi gì đi.
   ============================================================ */
(function (global) {
  'use strict';

  const LEVELS = [
    { id: 'Spark__LV1', name: 'Spark LV1', grade: 3 }, { id: 'Spark__LV2', name: 'Spark LV2', grade: 4 }, { id: 'Spark__LV3', name: 'Spark LV3', grade: 5 },
    { id: 'IC3__LV1', name: 'IC3 LV1', grade: 6 }, { id: 'IC3__LV2', name: 'IC3 LV2', grade: 7 }, { id: 'IC3__LV3', name: 'IC3 LV3', grade: 8 },
  ];
  const levelById = (id) => LEVELS.find((l) => l.id === id) || null;
  /** "5A5" → Spark__LV3 · "8A1" → IC3__LV3 · "3/11" → Spark__LV1; lớp ngoài 3–8 → ''. */
  function levelForClass(cls) {
    const g = parseInt((String(cls || '').match(/\d+/) || [])[0], 10);
    const l = LEVELS.find((x) => x.grade === g);
    return l ? l.id : '';
  }

  /** Dòng PPCT → các tiết: [{ tiet, bai: [số bài hỏi được], items: ['Bài 3' | 'Ôn tập 1' ...] }] theo thứ tự.
      Tiết "5-6" (1 bài học 2 tiết) tách thành tiết 5 và 6; tiết Ôn tập/Kiểm tra hỏi các bài từ tiết ôn trước tới đó. */
  function periodsOf(rows) {
    const by = new Map();
    let learned = [], review = [];
    const nums = (t) => {
      const m = String(t || '').match(/^(\d+)(?:\s*([-+])\s*(\d+))?$/);
      if (!m) return [];
      const a = +m[1], b = m[3] ? +m[3] : a;
      if (m[2] === '+') return [a, b];
      const out = [];
      for (let n = a; n <= b && out.length < 6; n++) out.push(n);
      return out;
    };
    (rows || []).forEach((r) => {
      // Kiểm tra ngay sau tiết Ôn tập → hỏi lại đúng các bài của tiết ôn đó
      const bai = r.bai ? [r.bai] : (learned.length ? learned.slice() : review.slice());
      if (r.bai) learned.push(r.bai); else { review = bai; learned = []; }
      nums(r.tiet).forEach((n) => {
        const p = by.get(n) || { tiet: n, bai: [], items: [] };
        const item = r.bai ? `Bài ${r.bai}` : r.title;
        if (!p.items.includes(item)) p.items.push(item);
        bai.forEach((b) => { if (!p.bai.includes(b)) p.bai.push(b); });
        by.set(n, p);
      });
    });
    return [...by.values()].sort((a, b) => a.tiet - b.tiet);
  }

  // Câu nhắc tới hình/bảng/đoạn trên đề — hỏi miệng không có hình thì không trả lời được
  const VISUAL = /(hình|ảnh|biểu tượng|bảng|đoạn|sơ đồ)\s+(bên dưới|bên trên|bên cạnh|dưới đây|sau đây|minh hoạ|minh họa)|như hình|trong hình|hình vẽ|câu (trên|trước)|ở câu/i;
  /** Câu hợp để hỏi nhanh trên lớp: rõ ràng, đủ phương án, không cần hình, vừa sức đọc của khối (tiểu học ngắn hơn). */
  function suitable(q, grade) {
    if (!q || (q.type !== 'single' && q.type !== 'multi')) return false;
    if (q.image || q.image_file || q.image_id) return false;
    const t = String(q.question || '').trim(), o = (q.options || []).map((x) => String(x).trim()), c = q.correct || [];
    if (!t || VISUAL.test(t)) return false;
    if (t.length > (grade && grade <= 5 ? 140 : 180)) return false;
    if (o.length < 2 || o.length > 4 || o.some((x) => !x || x.length > 110)) return false;
    if (new Set(o.map((x) => x.toLowerCase())).size !== o.length) return false;
    if (!c.length || !c.every((x) => o.includes(String(x).trim()))) return false;
    if (q.type === 'single' && c.length !== 1) return false;
    return true;
  }
  const L = 'ABCD';
  /** Câu trong data → thẻ "Hỏi bài": phương án A–D giữ nguyên thứ tự, đáp án ghi chữ cái + nội dung. */
  function toCard(q, src) {
    const o = q.options.map((x) => String(x).trim()), c = (q.correct || []).map((x) => String(x).trim());
    const ok = o.map((x, i) => (c.includes(x) ? i : -1)).filter((i) => i >= 0);
    const ex = String(q.explanation || '').trim();
    return {
      k: 'quiz', uid: q.uid || q.id, src, t: String(q.question).trim(), o,
      n: q.type === 'multi' ? ok.length : 0, ok,
      a: ok.map((i) => `${L[i]}. ${o[i]}`).join(' · '),
      ex: ex.length <= 220 ? ex : '',
    };
  }

  // ── Tải file tĩnh (nhớ trong phiên) ──
  const BASE = 'data/ic3/';
  const memo = {};
  const getJSON = (url) => memo[url] || (memo[url] = fetch(url, { cache: 'no-cache' }).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }).catch((e) => { delete memo[url]; throw e; }));
  let PPCT = null;
  /** { [level]: { grade, periods } } — lỗi mạng thì {} (vẫn bốc thẻ câu hỏi chung theo khối). */
  async function load() {
    if (PPCT) return PPCT;
    try {
      const d = await getJSON(BASE + 'ppct-lessons.json');
      PPCT = {};
      LEVELS.forEach((l) => { if (d[l.id]) PPCT[l.id] = { grade: d[l.id].grade || l.grade, periods: periodsOf(d[l.id].rows) }; });
    } catch (e) { return {}; }
    return PPCT;
  }
  /** Tên bộ "Bài N. …" của 1 cấp: { N: { name, file } }. */
  async function lessonSets(level) {
    const m = await getJSON(BASE + 'minitests-manifest.json');
    const out = {};
    Object.entries(m[level] || {}).forEach(([name, file]) => {
      const x = name.match(/^Bài (\d+)[.:]/);
      if (x) out[+x[1]] = { name, file };
    });
    return out;
  }
  const periodOf = (level, tiet) => ((PPCT && PPCT[level] && PPCT[level].periods) || []).find((p) => p.tiet === tiet) || null;
  /** Nhãn 1 tiết: "Tiết 13 · Bài 9. Tìm hiểu về kết nối mạng không dây" / "Tiết 11 · Ôn tập 1 (hỏi lại Bài 1–8)". */
  function periodLabel(p, sets) {
    const names = p.items.map((it) => {
      const m = /^Bài (\d+)$/.exec(it);
      return m && sets && sets[+m[1]] ? sets[+m[1]].name : it;
    });
    const review = p.items.every((it) => !/^Bài \d+$/.test(it)) && p.bai.length;
    const range = review ? ` (hỏi lại Bài ${Math.min(...p.bai)}–${Math.max(...p.bai)})` : '';
    return `Tiết ${p.tiet} · ${names.join(' + ')}${range}`;
  }
  /** Thẻ câu hỏi của tiết đã chọn. Ít hơn 2 câu hợp lệ → thêm bài của tiết liền trước (đã học), không lấy bài sau. */
  async function pool(level, tiet) {
    await load();
    const lv = levelById(level), p = periodOf(level, tiet);
    if (!lv || !p) return [];
    const sets = await lessonSets(level);
    const grade = (PPCT[level] && PPCT[level].grade) || lv.grade;
    const take = async (bai) => {
      const lists = await Promise.all(bai.filter((n) => sets[n]).map((n) =>
        getJSON(BASE + sets[n].file).then((qs) => (Array.isArray(qs) ? qs : qs.questions || [])
          .filter((q) => suitable(q, grade)).map((q) => toCard(q, `Bài ${n}`))).catch(() => [])));
      return [].concat(...lists);
    };
    let cards = await take(p.bai);
    if (cards.length < 2) {
      const prev = PPCT[level].periods.filter((x) => x.tiet < tiet && x.bai.length).pop();
      if (prev) cards = cards.concat(await take(prev.bai.filter((n) => !p.bai.includes(n))));
    }
    return cards;
  }

  global.EduNamePickerLessons = { LEVELS, levelById, levelForClass, periodsOf, suitable, toCard, load, lessonSets, periodLabel, pool };
})(typeof window !== 'undefined' ? window : globalThis);
