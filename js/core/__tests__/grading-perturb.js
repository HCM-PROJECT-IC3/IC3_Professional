/* Sinh câu trả lời SAI có chủ đích cho 1 câu hỏi (dùng chung cho test chấm điểm JS và Apps Script).
   Mỗi phương án lệch đáp án đúng đúng 1 chỗ → bộ chấm phải trả 'incorrect'. Không phải file test. */
'use strict';

function otherThan(list, v) {
  return (list || []).find((x) => x !== v);
}

/** @returns {Array} các câu trả lời sai (có thể rỗng nếu câu hỏi không đủ phương án để làm sai) */
function wrongAnswersOf(q) {
  const out = [];
  switch (q.type) {
    case 'single': {
      const ids = (q.options || []).map((o) => (o && typeof o === 'object' ? o.id : o));
      const bad = ids.find((id) => !(q.correct || []).includes(id));
      if (bad !== undefined) out.push(bad);
      break;
    }
    case 'multi': {
      const corr = q.correct || [];
      if (corr.length > 1) out.push(corr.slice(1));                     // thiếu 1 đáp án
      const ids = (q.options || []).map((o) => (o && typeof o === 'object' ? o.id : o));
      const extra = ids.find((id) => !corr.includes(id));
      if (extra !== undefined) out.push(corr.concat([extra]));           // thừa 1 lựa chọn
      break;
    }
    case 'truefalse': {
      const st = q.statements || [];
      if (st.length) out.push(Object.fromEntries(st.map((s, j) => [j, j === 0 ? !s.answer : s.answer])));
      break;
    }
    case 'matching': {
      const p = q.pairs || [];
      if (p.length > 1 && p[0].right !== p[1].right) {
        const m = Object.fromEntries(p.map((x) => [x.left, x.right]));
        m[p[0].left] = p[1].right;
        m[p[1].left] = p[0].right;
        out.push(m);
      }
      break;
    }
    case 'hotspot': {
      const areas = q.areas || [];
      const good = areas.filter((a) => a.correct).map((a) => a.id);
      const bad = areas.find((a) => !a.correct);
      if (bad) out.push(good.concat([bad.id]));
      if (good.length > 1) out.push(good.slice(1));
      break;
    }
    case 'list': {
      const items = q.items || [];
      if (items.length) {
        const first = items[0];
        const opts = first.options || items.map((it) => it.correct);
        const wrong = otherThan(opts, first.correct);
        if (wrong !== undefined) out.push(Object.fromEntries(items.map((it, j) => [j, j === 0 ? wrong : it.correct])));
      }
      break;
    }
    case 'classify': {
      const items = q.items || [];
      const zones = [...new Set(items.map((it) => it.zone).concat((q.zones || []).map((z) => (z && z.id) || z)))];
      if (items.length) {
        const wrong = otherThan(zones, items[0].zone);
        if (wrong !== undefined) out.push(Object.fromEntries(items.map((it, j) => [it.text, j === 0 ? wrong : it.zone])));
      }
      break;
    }
    case 'ordering': {
      const items = (q.items || []).slice();
      if (items.length > 1 && items[0] !== items[1]) {
        [items[0], items[1]] = [items[1], items[0]];
        out.push(items);
      }
      break;
    }
    case 'dragfill':
    case 'selectfill': {
      const blanks = q.blanks || [];
      if (blanks.length) {
        const pool = (q.wordBank || []).concat(blanks);
        const wrong = otherThan(pool, blanks[0]);
        if (wrong !== undefined) out.push(Object.fromEntries(blanks.map((t, bi) => [bi, bi === 0 ? wrong : t])));
      }
      break;
    }
    default:
      break;
  }
  return out;
}

module.exports = { wrongAnswersOf };
