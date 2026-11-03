/* ============================================================
   js/core/grading.js — chấm 1 câu hỏi: hàm THUẦN, không đụng DOM/State.
   Nguồn DUY NHẤT của luật chấm: js/quiz-engine.js (_buildQuestionDetail) gọi hàm này;
   apps/src/77-grading.gs là bản Apps Script tương đương — test
   apps/__tests__/code-gs.test.js so 2 bản trên TOÀN BỘ data/ic3 (đổi luật ở đây thì
   đổi cả bên đó). Chuẩn bị cho chấm điểm phía máy chủ (docs/architecture/SERVER-GRADING.md).

   ans = câu trả lời của học sinh, dạng gửi qua mạng được (JSON):
     single: 'B' · multi: ['A','C'] · truefalse: {0:true,1:false} · matching: {trái: phải}
     hotspot: ['id1','id2'] (hoặc Set) · list: {0:'x'} · classify: {text: zone}
     ordering: ['a','b','c'] · dragfill/selectfill: {0:'từ'}
   Trả về 'correct' | 'incorrect' | 'skipped'.
   ============================================================ */
(function (root) {
  'use strict';

  const keysOf = (o) => (o && typeof o === 'object' ? Object.keys(o) : []);

  function questionStatus(q, ans) {
    switch (q.type) {
      case 'single':
        if (ans && (q.correct || []).includes(ans)) return 'correct';
        return ans ? 'incorrect' : 'skipped';

      case 'multi': {
        // Thứ tự chọn không quan trọng
        const user = [...(Array.isArray(ans) ? ans : [])].sort();
        if (!user.length) return 'skipped';
        return JSON.stringify(user) === JSON.stringify([...(q.correct || [])].sort()) ? 'correct' : 'incorrect';
      }

      case 'truefalse': {
        const a = ans || {};
        if (!keysOf(a).length) return 'skipped';
        return (q.statements || []).every((st, j) => a[j] === st.answer) ? 'correct' : 'incorrect';
      }

      case 'matching': {
        if (!(q.pairs && q.pairs.length && ans && keysOf(ans).length)) return 'skipped';
        return q.pairs.every((p) => ans[p.left] === p.right) ? 'correct' : 'incorrect';
      }

      case 'hotspot': {
        const sel = ans instanceof Set ? [...ans] : (Array.isArray(ans) ? ans : []);
        if (!sel.length) return 'skipped';
        const want = (q.areas || []).filter((a) => a.correct).map((a) => a.id).sort();
        return JSON.stringify([...sel].sort()) === JSON.stringify(want) ? 'correct' : 'incorrect';
      }

      case 'list': {
        const a = ans || {};
        if (!keysOf(a).length) return 'skipped';
        return (q.items || []).every((it, j) => a[j] === it.correct) ? 'correct' : 'incorrect';
      }

      case 'classify': {
        // Chỉ thẻ mồi nhử (q.distractors) bị kéo vào nhóm → vẫn tính là bỏ qua
        const a = ans || {};
        const items = q.items || [];
        if (!items.some((it) => a[it.text] !== undefined)) return 'skipped';
        return items.every((it) => a[it.text] === it.zone) ? 'correct' : 'incorrect';
      }

      case 'ordering': {
        if (!(Array.isArray(ans) && ans.length)) return 'skipped';
        return JSON.stringify(ans) === JSON.stringify(q.items || []) ? 'correct' : 'incorrect';
      }

      case 'dragfill':
      case 'selectfill': {
        const a = ans || {};
        if (!keysOf(a).length) return 'skipped';
        return (q.blanks || []).every((text, bi) => a[bi] === text) ? 'correct' : 'incorrect';
      }

      default:
        return 'skipped';
    }
  }

  /** Câu trả lời ĐÚNG theo đáp án của câu hỏi (dùng cho test + kiểm tra dữ liệu). null = loại không chấm được. */
  function correctAnswerOf(q) {
    switch (q.type) {
      case 'single': return (q.correct || [])[0] || null;
      case 'multi': return (q.correct || []).slice();
      case 'truefalse': return Object.fromEntries((q.statements || []).map((st, j) => [j, st.answer]));
      case 'matching': return Object.fromEntries((q.pairs || []).map((p) => [p.left, p.right]));
      case 'hotspot': return (q.areas || []).filter((a) => a.correct).map((a) => a.id);
      case 'list': return Object.fromEntries((q.items || []).map((it, j) => [j, it.correct]));
      case 'classify': return Object.fromEntries((q.items || []).map((it) => [it.text, it.zone]));
      case 'ordering': return (q.items || []).slice();
      case 'dragfill': case 'selectfill': return Object.fromEntries((q.blanks || []).map((t, bi) => [bi, t]));
      default: return null;
    }
  }

  const api = { questionStatus, correctAnswerOf };
  root.EduGrading = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
