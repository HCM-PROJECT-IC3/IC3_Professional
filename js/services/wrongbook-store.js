/* ============================================================
   js/services/wrongbook-store.js — kho "Sổ tay câu sai" dùng chung (localStorage 'eduquiz_wrongbook_v1').
   0 lượt Firebase, 0 Apps Script — chỉ ở máy học sinh.

   Người dùng:
     • js/learning-hub.js (index.html) — gom câu sai sau mỗi bài, màn ôn Leitner.
     • js/arena/arena.js + arena-room.js (arena.html) — câu sai khi chơi Đấu trường cũng vào sổ tay,
       để chơi game xong vẫn có lịch ôn lại cho nhớ lâu.

   Lặp lại ngắt quãng (hộp Leitner 1→4: ôn ngay → 1 ngày → 3 ngày → 7 ngày → thuộc). Sai lại thì về hộp 1.
   Mỗi học sinh tách theo Họ tên + Lớp + Trường (máy trường dùng chung).

     keyOf(name, cls, school)        khoá học sinh
     qKey(q)                         khoá câu (uid ngân hàng, hoặc băm nội dung)
     record(st, results, opts)       results: [{ q, ok, partial }] → { added, up, mastered, again }
                                     opts: { src, review (phiên ôn sổ tay: không thêm câu mới), dueOnly (chỉ cho lên hộp khi tới hạn) }
                                     partial = câu chỉ hỏi 1 phần (1 ý Đúng/Sai của câu gốc) → đúng không cho lên hộp
     findByName(name)                học sinh trên máy này có đúng họ tên (lớp/trường lấy từ lịch sử bài làm)
     book() / studentBook(key)       đọc sổ
   ============================================================ */
(function (global) {
  'use strict';

  const BOOK_KEY = 'eduquiz_wrongbook_v1';
  const DAY = 24 * 60 * 60 * 1000;
  const BOX_GAP = { 1: 0, 2: DAY, 3: 3 * DAY, 4: 7 * DAY };
  const MAX_ITEMS = 200;
  const MAX_IMG = 60000; // ảnh nhúng (đề tự soạn) quá lớn → không lưu, tránh đầy bộ nhớ

  function lsGet(k, fb) { try { const v = global.localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch (e) { return fb; } }
  function lsSet(k, v) { try { global.localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }

  function keyOf(name, cls, school) {
    return [name, cls, school].map((x) => String(x || '').trim().toLowerCase()).join('|');
  }
  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(36);
  }
  function qKey(q) {
    if (q.uid && !String(q.uid).startsWith('custom__')) return 'u:' + q.uid;
    return 'c:' + hash([q.question, (q.options || []).join('|'), (q.items || []).join('|'), JSON.stringify(q.pairs || '')].join('#'));
  }
  /** Bản gọn của câu để lưu: bỏ trường tạm "_..." (prepareQuestions dựng lại khi ôn). */
  function slim(q) {
    const o = {};
    Object.keys(q).forEach((k) => { if (k[0] !== '_') o[k] = q[k]; });
    return o;
  }
  function book() { return lsGet(BOOK_KEY, {}); }
  function studentBook(key) { return book()[key] || { items: {}, mastered: 0 }; }
  function entryOf(b, st) {
    if (!b[st.key]) b[st.key] = { name: st.name, cls: st.cls || '', school: st.school || '', items: {}, mastered: 0, updated: 0 };
    return b[st.key];
  }
  function promote(it, now) {
    if (it.box >= 4) return 'mastered';
    it.box += 1;
    it.due = now + BOX_GAP[it.box];
    it.right = (it.right || 0) + 1;
    return 'up';
  }
  function demote(it, now) { it.box = 1; it.due = now; it.wrong = (it.wrong || 0) + 1; }
  function trim(sb) {
    const keys = Object.keys(sb.items);
    if (keys.length <= MAX_ITEMS) return;
    // Bỏ câu đã lên hộp cao nhất / cũ nhất trước.
    keys.sort((a, b) => (sb.items[b].box - sb.items[a].box) || (sb.items[a].added - sb.items[b].added))
      .slice(0, keys.length - MAX_ITEMS).forEach((k) => delete sb.items[k]);
  }

  function record(st, results, opts) {
    const o = opts || {};
    const out = { added: 0, up: 0, mastered: 0, again: 0, saved: false };
    if (!st || !st.name || !Array.isArray(results) || !results.length) return out;
    st.key = st.key || keyOf(st.name, st.cls, st.school);
    const b = book();
    const sb = entryOf(b, st);
    const now = o.now || Date.now();
    const seen = new Set(); // 1 câu gốc tách nhiều ý (Đúng/Sai) — mỗi lượt chỉ tính 1 lần
    results.forEach((r) => {
      const q = r && r.q;
      if (!q || (q.type === 'hotspot' && String(q.imageUrl || '').startsWith('data:'))) return;
      const k = qKey(q);
      const it = sb.items[k];
      if (r.ok) {
        if (!it || seen.has(k) || r.partial || (o.dueOnly && it.due > now)) return;
        seen.add(k);
        if (promote(it, now) === 'mastered') { delete sb.items[k]; sb.mastered = (sb.mastered || 0) + 1; out.mastered++; } else out.up++;
      } else {
        if (seen.has(k)) return;
        seen.add(k);
        if (it) { demote(it, now); out.again++; }
        else if (!o.review) {
          if (String(q.imageUrl || '').length > MAX_IMG) return;
          sb.items[k] = { q: slim(q), box: 1, due: now, wrong: 1, right: 0, added: now, src: o.src || '' };
          out.added++;
        }
      }
    });
    trim(sb);
    sb.updated = now;
    out.saved = lsSet(BOOK_KEY, b);
    return out;
  }

  /** Học sinh có đúng họ tên trên máy này (mới nhất trước) — lấy lớp/trường từ lịch sử bài làm / sổ tay. */
  function findByName(name) {
    const want = String(name || '').trim().replace(/\s+/g, ' ').toLowerCase();
    if (!want) return null;
    const hits = new Map();
    const recs = lsGet('eduquiz_records', []);
    (Array.isArray(recs) ? recs : []).forEach((r) => {
      if (!r || String(r.studentName || '').trim().replace(/\s+/g, ' ').toLowerCase() !== want) return;
      const k = keyOf(r.studentName, r.studentClass, r.studentSchool);
      const t = Number(r.id) || 0;
      const at = t > 1e14 ? Math.floor(t / 1000) : t;
      if (!hits.has(k) || hits.get(k).last < at) hits.set(k, { key: k, name: r.studentName, cls: r.studentClass || '', school: r.studentSchool || '', last: at });
    });
    Object.entries(book()).forEach(([k, v]) => {
      if (!v || String(v.name || '').trim().toLowerCase() !== want || hits.has(k)) return;
      hits.set(k, { key: k, name: v.name, cls: v.cls || '', school: v.school || '', last: v.updated || 0 });
    });
    return [...hits.values()].sort((a, b) => b.last - a.last)[0] || null;
  }

  global.EduWrongbook = { BOOK_KEY, BOX_GAP, MAX_ITEMS, keyOf, qKey, slim, promote, demote, record, findByName, book, studentBook };
})(typeof window !== 'undefined' ? window : globalThis);
