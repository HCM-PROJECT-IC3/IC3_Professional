/* ============================================================
   js/techrealm/cultivation-service.js — CultivationService (tầng Application, thuần).

   Điều phối luật ở cultivation-core.js với 1 CỔNG lưu trữ duy nhất:
     store.transact(learnerId, fn)  — đọc mọi dòng sổ cái của học sinh, gọi fn(rows) → dòng mới,
                                     ghi các dòng mới mà txId CHƯA có. Phải chạy loại trừ lẫn nhau
                                     (Apps Script: LockService; bộ nhớ: tự nhiên) và trả { appended, rows }.
   Không biết Sheet, Firestore hay trình duyệt tồn tại. Chạy y hệt ở:
     • Apps Script (apps/src/79-tr-ledger.gs nối store = Google Sheet) — NƠI DUY NHẤT ghi sổ cái thật;
     • Node (unit test) và app React (bản xem thử) với store trong bộ nhớ (createMemoryStore).
   Không dùng `?.` / `??` (chép nguyên văn vào apps/Code.gs).
   ============================================================ */
(function (root) {
  'use strict';
  const C = root.EduCultivation;
  if (!C) throw new Error('Cần nạp js/techrealm/cultivation-core.js trước cultivation-service.js');

  const STAFF = ['teacher', 'admin'];

  function create(opts) {
    const store = opts.store;
    const clock = opts.clock || function () { return new Date().toISOString(); };
    const config = C.mergeConfig(C.DEFAULT_CONFIG, opts.config);
    const errs = C.validateConfig(config);
    if (errs.length) throw new Error('Cấu hình tu luyện không hợp lệ: ' + errs.join(' '));
    const items = opts.items || C.DEFAULT_ITEMS;
    const itemErrs = C.validateItems(items);
    if (itemErrs.length) throw new Error('Danh mục vật phẩm không hợp lệ: ' + itemErrs.join(' '));
    const achievements = opts.achievements || C.DEFAULT_ACHIEVEMENTS;

    /** Sau mỗi thay đổi: ghi thêm thành tựu vừa đạt (cùng giao dịch). */
    function withAchievements(learnerId, rows, newRows, by, now) {
      const s = C.summarize(rows.concat(newRows));
      const el = C.elementScores(s.assessments, now);
      return newRows.concat(C.newAchievements(s, achievements, el).map(function (a) {
        return { txId: C.txIdOf(learnerId, 'ACH', a.id), learnerId: learnerId, kind: 'achievement', achievementId: a.id, by: by, createdAt: now, rulesVersion: config.version };
      }));
    }

    /**
     * Ghi nhận 1 hoạt động có bằng chứng. actor: { kind: 'system'|'teacher'|'admin', uid }.
     * → { ok, duplicate?, tx?, code?, reason? }. Gửi lại cùng sự kiện → { ok:true, duplicate:true }, KHÔNG cộng thêm.
     */
    function recordEvent(event, actor) {
      let result;
      const now = clock();
      store.transact(event && event.learnerId, function (rows) {
        const s = C.summarize(rows);
        result = C.evaluateEvent(event, { config: config, summary: s, actor: actor, now: now });
        if (!result.ok || result.duplicate) return [];
        return withAchievements(event.learnerId, rows, [result.tx], result.tx.by, now);
      });
      return result;
    }

    /** Bài đánh giá năng lực đã chấm trên máy chủ → dữ liệu linh căn. topics: { '1'..'7': điểm 0–100 }. */
    function recordAssessment(learnerId, attemptId, topics, actor) {
      if (!actor || actor.kind !== 'system') return { ok: false, code: 'forbidden', reason: 'Chỉ máy chủ chấm mới ghi bài đánh giá.' };
      const clean = {};
      Object.keys(topics || {}).forEach(function (t) {
        const v = topics[t];
        if (C.TOPIC_ELEMENT[t] && typeof v === 'number' && v >= 0 && v <= 100) clean[t] = Math.round(v);
      });
      if (!Object.keys(clean).length) return { ok: false, code: 'invalid', reason: 'Không có điểm chủ đề hợp lệ.' };
      const now = clock();
      const row = { txId: C.txIdOf(learnerId, 'ASSESS', attemptId), learnerId: learnerId, kind: 'assessment', sourceId: String(attemptId), facts: { topics: clean }, by: 'system', createdAt: now, rulesVersion: config.version };
      const out = store.transact(learnerId, function (rows) { return withAchievements(learnerId, rows, [row], 'system', now); });
      return { ok: true, duplicate: !out.appended.some(function (r) { return r.txId === row.txId; }) };
    }

    /** Duyệt giao dịch đang chờ (chỉ Admin — giao dịch chờ là thưởng của thầy cô vượt trần tuần). */
    function review(learnerId, refTxId, decision, actor, note) {
      if (!actor || actor.kind !== 'admin') return { ok: false, code: 'forbidden', reason: 'Chỉ Admin duyệt giao dịch chờ.' };
      if (decision !== 'confirmed' && decision !== 'rejected') return { ok: false, code: 'invalid', reason: 'Quyết định phải là confirmed hoặc rejected.' };
      let result;
      const now = clock();
      store.transact(learnerId, function (rows) {
        const h = C.summarize(rows).history.filter(function (x) { return x.txId === refTxId; })[0];
        if (!h) { result = { ok: false, code: 'not-found', reason: 'Không có giao dịch này.' }; return []; }
        if (h.status !== 'pending') { result = { ok: true, duplicate: true, status: h.status }; return []; }
        result = { ok: true, status: decision };
        return withAchievements(learnerId, rows, [{ txId: refTxId + '|review', learnerId: learnerId, kind: 'review', refTxId: refTxId, status: decision, note: note || '', by: actor.uid, createdAt: now, rulesVersion: config.version }], actor.uid, now);
      });
      return result;
    }

    /** Huỷ 1 giao dịch đã xác nhận (phát hiện gian lận, chấm nhầm). Bắt buộc lý do. Cảnh giới đã đạt KHÔNG bị hạ tự động. */
    function reverse(learnerId, refTxId, actor, note) {
      if (!actor || STAFF.indexOf(actor.kind) < 0) return { ok: false, code: 'forbidden', reason: 'Chỉ thầy cô / Admin được huỷ giao dịch.' };
      if (!(typeof note === 'string' && note.trim().length >= 5)) return { ok: false, code: 'invalid', reason: 'Cần ghi lý do huỷ (từ 5 ký tự).' };
      let result;
      const now = clock();
      store.transact(learnerId, function (rows) {
        const h = C.summarize(rows).history.filter(function (x) { return x.txId === refTxId && x.kind === 'exp'; })[0];
        if (!h) { result = { ok: false, code: 'not-found', reason: 'Không có giao dịch EXP này.' }; return []; }
        if (h.status === 'reversed') { result = { ok: true, duplicate: true }; return []; }
        result = { ok: true };
        return [{ txId: refTxId + '|reversal', learnerId: learnerId, kind: 'reversal', refTxId: refTxId, amount: -h.amount, note: note.slice(0, 300), by: actor.uid, createdAt: now, rulesVersion: config.version }];
      });
      return result;
    }

    /** Học sinh bấm Đột phá: máy chủ tự kiểm lại mọi điều kiện → { ok, to?, items?, conditions? }. */
    function breakthrough(learnerId, actor) {
      let result;
      const now = clock();
      store.transact(learnerId, function (rows) {
        const s = C.summarize(rows);
        const made = C.breakthroughRows(learnerId, s, config, actor && actor.kind === 'system' ? 'system' : String((actor && actor.uid) || 'learner'), now);
        if (!made) {
          result = { ok: false, code: 'not-eligible', reason: 'Chưa đủ điều kiện đột phá.', conditions: C.breakthroughCheck(s, config).conditions };
          return [];
        }
        result = { ok: true, to: made.to, items: made.rows.filter(function (r) { return r.kind === 'item'; }).map(function (r) { return { itemId: r.itemId, qty: r.qty }; }) };
        return withAchievements(learnerId, rows, made.rows, 'system', now);
      });
      return result;
    }

    /** Hồ sơ tu luyện đầy đủ (chỉ đọc). */
    function profile(learnerId) {
      const now = clock();
      let rows = [];
      store.transact(learnerId, function (r) { rows = r; return []; });
      const s = C.summarize(rows);
      return {
        learnerId: learnerId,
        exp: s.exp,
        pendingExp: s.pendingExp,
        realm: C.realmInfo(s.realm),
        stage: C.stageOf(s.realm, s.exp, config),
        next: C.breakthroughCheck(s, config),
        elements: C.elementScores(s.assessments, now),
        items: s.items,
        achievements: s.achievements,
        activityMinutes: Math.round(s.activitySec / 60),
        history: s.history,
      };
    }

    return { config: config, items: items, recordEvent: recordEvent, recordAssessment: recordAssessment, review: review, reverse: reverse, breakthrough: breakthrough, profile: profile };
  }

  /** Kho trong bộ nhớ — cho unit test và bản xem thử. `rows` có thể nạp sẵn. */
  function createMemoryStore(seed) {
    const all = (seed || []).slice();
    return {
      rows: all,
      transact: function (learnerId, fn) {
        const mine = all.filter(function (r) { return r.learnerId === learnerId; });
        const have = {};
        mine.forEach(function (r) { have[r.txId] = true; });
        const appended = (fn(mine.slice()) || []).filter(function (r) { if (have[r.txId]) return false; have[r.txId] = true; return true; });
        appended.forEach(function (r) { all.push(r); });
        return { appended: appended, rows: mine.concat(appended) };
      },
    };
  }

  const api = { create: create, createMemoryStore: createMemoryStore };
  root.EduCultivationService = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
