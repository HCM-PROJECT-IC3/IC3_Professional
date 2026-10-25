/* ============================================================
   js/services/question-bank-lookup.js
   Tra uid câu hỏi → nội dung câu trong ngân hàng tĩnh data/ic3/*.json
   (0 Firebase, 0 Apps Script — chỉ GET file cùng tên miền, có Service
   Worker thì chạy được cả khi mất mạng).

   Dùng chung cho "❌ Câu cả lớp hay sai" ở teacher-dashboard.html
   (js/teacher/wrong-questions.js) và gom-ket-qua.html (js/gom-ket-qua.js).

   API: window.EduQuestionLookup = { resolve(items), answerHtml(q), plain(html), esc(s) }
     items: [{ uid, tests: ["Chương trình › Cấp độ › Bài", ...] }]
     resolve → Map uid → { q, mt, catId, levelId, levelName }
   ============================================================ */
(function (global) {
  'use strict';

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const plain = (html) => { const d = document.createElement('div'); d.innerHTML = String(html ?? ''); return (d.textContent || '').trim(); };

  let metaP = null;
  const levelFiles = new Map(); // file → Promise<Map uid → {q, mt}>
  function meta() {
    if (!metaP) metaP = fetch('data/ic3/meta.json').then((r) => (r.ok ? r.json() : { categories: [] })).catch(() => ({ categories: [] }));
    return metaP;
  }
  function levelIndex(file) {
    if (!levelFiles.has(file)) {
      levelFiles.set(file, fetch('data/ic3/' + file).then((r) => (r.ok ? r.json() : {})).catch(() => ({})).then((d) => {
        const idx = new Map();
        Object.entries(d.minitests || {}).forEach(([mt, qs]) => (qs || []).forEach((q) => { if (q && q.uid && !idx.has(q.uid)) idx.set(q.uid, { q, mt }); }));
        return idx;
      }));
    }
    return levelFiles.get(file);
  }
  /** Cấp độ chứa câu: theo tên bài nộp ("Chương trình › Cấp độ › Bài"), dự phòng theo tiền tố uid. */
  function candidateLevels(m, item) {
    const out = [];
    const push = (cat, lv) => { if (lv && lv.file && !out.some((x) => x.lv === lv)) out.push({ cat, lv }); };
    (item.tests || []).forEach((t) => {
      const [cn, ln] = String(t).split(' › ');
      const cat = (m.categories || []).find((c) => c.name === cn || c.id === cn);
      push(cat, cat && cat.levels.find((l) => l.name === ln || l.id === ln));
    });
    const uid = String(item.uid).toLowerCase();
    (m.categories || []).forEach((c) => c.levels.forEach((l) => { if (uid.startsWith(`${c.id}__${l.id}__`.toLowerCase())) push(c, l); }));
    return out;
  }
  async function resolve(items) {
    const m = await meta();
    const map = new Map();
    await Promise.all(items.map(async (it) => {
      for (const { cat, lv } of candidateLevels(m, it)) {
        const hit = (await levelIndex(lv.file)).get(it.uid);
        if (hit) { map.set(it.uid, Object.assign({ catId: cat.id, levelId: lv.id, levelName: lv.name }, hit)); return; }
      }
    }));
    return map;
  }

  /** Đáp án gọn để giáo viên xem nhanh (mọi chữ đã escape). */
  function answerHtml(q) {
    const P = (s) => esc(plain(s));
    switch (q.type) {
      case 'single': case 'multi': {
        const ok = new Set((q.correct || []).map(plain));
        return `<ul class="wq-ans">${(q.options || []).map((o) => `<li class="${ok.has(plain(o)) ? 'is-ok' : ''}">${ok.has(plain(o)) ? '✔ ' : ''}${P(o)}</li>`).join('')}</ul>`;
      }
      case 'truefalse':
        return `<ul class="wq-ans">${(q.statements || []).map((s) => `<li><b>${P(s.answer === 'true' ? q.label_true || 'Đúng' : q.label_false || 'Sai')}</b> — ${P(s.text)}</li>`).join('')}</ul>`;
      case 'matching':
        return `<ul class="wq-ans">${(q.pairs || []).map((p) => `<li>${P(p.left)} → <b>${P(p.right)}</b></li>`).join('')}</ul>`;
      case 'ordering':
        return `<ol class="wq-ans">${(q.items || []).map((s) => `<li>${P(s)}</li>`).join('')}</ol>`;
      default:
        return '<p class="wq-note">Xem đáp án đầy đủ trong Soạn đề / Quản lý câu hỏi.</p>';
    }
  }

  global.EduQuestionLookup = { resolve, answerHtml, plain, esc };
})(window);
