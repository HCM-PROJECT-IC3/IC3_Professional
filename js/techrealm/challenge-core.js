/* ============================================================
   js/techrealm/challenge-core.js — KHUNG BÍ CẢNH (Domain thuần).

   Mỗi màn chơi là một "máy trạng thái" thuần và tất định:
       state0 = level.init(rng(seed))
       state' = level.apply(state, action)           (không sửa state cũ)
       eval   = level.evaluate(state)                → { completed, accuracy, solving, application, attempts, minAttempts }
   Giao diện (React) chỉ gửi action vào CHÍNH các hàm này, nên trạng thái trên màn hình = trạng thái máy chủ dựng lại.
   Nhận thưởng: trình duyệt gửi { seed, actions } — KHÔNG gửi điểm. Apps Script chạy lại (replay) bằng đúng file này
   (scripts/build-apps-script.js chép nguyên văn vào apps/Code.gs) và tự tính điểm. Sửa điểm trong gói tin vô tác dụng.

   Không DOM, không mạng, không Date.now(), không Math.random() (dùng rng có hạt giống), không `?.` / `??`.
   Tài liệu: docs/techrealm/CHALLENGE_SYSTEM.md, docs/techrealm/GAME_DESIGN.md
   ============================================================ */
(function (root) {
  'use strict';

  const registry = {};
  const MAX_ACTIONS = 600;
  const MAX_DURATION_MS = 2 * 3600e3;
  const MIN_MS_PER_ACTION = 120; // người thật không bấm nhanh hơn ~8 lần/giây suốt cả màn

  /** Bộ sinh số ngẫu nhiên có hạt giống (mulberry32) — cùng seed ra cùng dãy ở mọi nơi chạy. */
  function rng(seed) {
    let a = seed >>> 0;
    const next = function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    return {
      next: next,
      int: function (lo, hi) { return lo + Math.floor(next() * (hi - lo + 1)); },
      pick: function (arr) { return arr[Math.floor(next() * arr.length)]; },
      shuffle: function (arr) { const a2 = arr.slice(); for (let i = a2.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); const tmp = a2[i]; a2[i] = a2[j]; a2[j] = tmp; } return a2; },
    };
  }

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /** Đăng ký 1 bí cảnh: { id, title, levels: [{ id, title, par (giây), init, apply, evaluate }] }. */
  function register(def) {
    if (!def || !def.id || !Array.isArray(def.levels) || !def.levels.length) throw new Error('Bí cảnh không hợp lệ');
    def.levels.forEach(function (l) {
      ['init', 'apply', 'evaluate'].forEach(function (k) { if (typeof l[k] !== 'function') throw new Error('Màn ' + l.id + ' thiếu ' + k); });
    });
    registry[def.id] = def;
    return def;
  }
  function get(id) { return registry[id] || null; }
  function levelOf(challengeId, levelId) {
    const c = registry[challengeId];
    if (!c) return null;
    return c.levels.filter(function (l) { return l.id === levelId; })[0] || null;
  }

  /* ── Tiêu chí đánh giá (Prompt 05 §4) → điểm 0–100 ──
       hoàn thành nhiệm vụ (điều kiện bắt buộc) · độ chính xác 40 · giải quyết vấn đề 25 · vận dụng kiến thức 20
       · thời gian 10 · số lần thử 5.  Chưa hoàn thành: chỉ tính tối đa 40% để vẫn ghi nhận cố gắng. */
  const WEIGHTS = { accuracy: 40, solving: 25, application: 20, time: 10, attempts: 5 };
  function clamp01(x) { return Math.max(0, Math.min(1, Number(x) || 0)); }
  function score(ev, durationSec, par) {
    const time = durationSec <= par ? 1 : clamp01(1 - (durationSec - par) / (2 * par));
    const extra = Math.max(0, (ev.attempts || 0) - (ev.minAttempts || 1));
    const attempts = clamp01(1 - extra / 5);
    const parts = {
      accuracy: Math.round(WEIGHTS.accuracy * clamp01(ev.accuracy)),
      solving: Math.round(WEIGHTS.solving * clamp01(ev.solving)),
      application: Math.round(WEIGHTS.application * clamp01(ev.application)),
      time: Math.round(WEIGHTS.time * time),
      attempts: Math.round(WEIGHTS.attempts * attempts),
    };
    let total = parts.accuracy + parts.solving + parts.application + parts.time + parts.attempts;
    if (!ev.completed) total = Math.min(total, 40);
    const stars = !ev.completed ? 0 : total >= 85 ? 3 : total >= 65 ? 2 : 1;
    return { score: total, stars: stars, parts: parts, completed: !!ev.completed };
  }

  /** Kiểm nhật ký thao tác (không tin được): mảng { t: ms từ lúc bắt đầu, type: chuỗi, … } tăng dần, giới hạn số lượng. */
  function validateLog(actions) {
    if (!Array.isArray(actions)) return 'Nhật ký không phải mảng.';
    if (actions.length > MAX_ACTIONS) return 'Quá nhiều thao tác.';
    let prev = 0;
    for (let i = 0; i < actions.length; i++) {
      const a = actions[i];
      if (!a || typeof a !== 'object' || typeof a.type !== 'string' || a.type.length > 20) return 'Thao tác #' + i + ' sai dạng.';
      if (typeof a.t !== 'number' || !isFinite(a.t) || a.t < prev || a.t > MAX_DURATION_MS) return 'Thời điểm thao tác #' + i + ' không hợp lệ.';
      if (JSON.stringify(a).length > 200) return 'Thao tác #' + i + ' quá dài.';
      prev = a.t;
    }
    if (actions.length > 2 && prev < (actions.length - 1) * MIN_MS_PER_ACTION) return 'Thao tác nhanh bất thường.';
    return null;
  }

  /** Chạy lại một màn từ seed + nhật ký. Dùng ở CẢ trình duyệt (để chấm) lẫn máy chủ (để xác thực). */
  function replay(challengeId, levelId, seed, actions) {
    const level = levelOf(challengeId, levelId);
    if (!level) return { ok: false, code: 'not-found', reason: 'Không có màn này.' };
    if (!(Number.isInteger(seed) && seed >= 0 && seed <= 0xFFFFFFFF)) return { ok: false, code: 'invalid', reason: 'Hạt giống không hợp lệ.' };
    const bad = validateLog(actions);
    if (bad) return { ok: false, code: 'invalid', reason: bad };
    let state = level.init(rng(seed));
    for (let i = 0; i < actions.length; i++) {
      if (state.done) break; // màn đã kết thúc: thao tác sau đó bỏ qua
      state = level.apply(clone(state), actions[i]);
    }
    const ev = level.evaluate(state);
    const durationSec = Math.round((actions.length ? actions[actions.length - 1].t : 0) / 1000);
    return { ok: true, state: state, eval: ev, durationSec: durationSec, result: score(ev, durationSec, level.par) };
  }

  /** Bài nộp bí cảnh → sự kiện CHALLENGE cho luật tu luyện (chỉ khi replay hợp lệ và màn đã hoàn thành). */
  function rewardEvent(sub) {
    if (!sub || !/^L[0-9A-Z]{10}$/.test(String(sub.learnerId || ''))) return null;
    const r = replay(sub.challengeId, sub.levelId, sub.seed, sub.actions);
    if (!r.ok || !r.result.completed) return null;
    const level = levelOf(sub.challengeId, sub.levelId);
    return {
      type: 'CHALLENGE', learnerId: sub.learnerId,
      evidence: { challengeId: sub.challengeId + '/' + sub.levelId, score: r.result.score, durationSec: r.durationSec, boss: !!level.boss },
    };
  }

  const api = { rng: rng, register: register, get: get, levelOf: levelOf, score: score, validateLog: validateLog, replay: replay, rewardEvent: rewardEvent, WEIGHTS: WEIGHTS, clone: clone };
  root.EduChallenge = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
