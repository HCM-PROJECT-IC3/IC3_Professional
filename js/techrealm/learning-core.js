/* ============================================================
   js/techrealm/learning-core.js — LUẬT HỌC TẬP của Tàng Kinh Các (Domain thuần).

   Chạy ở trình duyệt (app React), Node (test) và Apps Script (scripts/build-apps-script.js chép nguyên văn).
   Không DOM, không mạng, không localStorage; không `?.` / `??`.

   Nội dung khoá học: data/techrealm/courses.json (sinh bởi scripts/build-techrealm-courses.mjs từ data/ic3).
   Tiến độ: đọc LỊCH SỬ BÀI LÀM SẴN CÓ (eduquiz_records do js/quiz-engine.js ghi) — không ghi thêm gì, không đổi
   cách chấm. Mỗi bài làm được nối về đúng bài học nhờ { catId, levelId, mtKey } mà sảnh cũ đã lưu.
   Cấu hình của giáo viên (thứ tự mở bài, điểm đạt, khoá/mở bài, video/tài liệu thêm) đi trong LINK lớp học, như
   đề tự soạn `?de=` — 0 lượt Firebase. Cấu hình này chỉ là hướng dẫn học tập; EXP và cảnh giới vẫn do máy chủ xác
   thực (cultivation-core), nên tự sửa link không lấy được phần thưởng nào.
   Tài liệu: docs/techrealm/LEARNING_SYSTEM.md
   ============================================================ */
(function (root) {
  'use strict';

  const LESSON_RE = /^Bài (\d+)[.:]\s*/;
  const ID_RE = /^[a-z0-9][a-z0-9._\/-]{0,99}$/;
  const PASS = 70; // = js/learning-hub.js § PASS

  /** Giống hệt scripts/build-techrealm-courses.mjs § slug (test so khớp với courses.json). */
  function slug(s) {
    return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'd')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  }

  /** Bài làm (catId, levelId, tên minitest) → id đơn vị học: bài học, bài kiểm tra, ôn tập; null nếu không thuộc khoá nào. */
  function unitIdOf(catId, levelId, mtKey) {
    if (!catId || !levelId || !mtKey) return null;
    const base = (String(catId) + '-' + String(levelId)).toLowerCase();
    const m = LESSON_RE.exec(mtKey);
    if (m) return { kind: 'lesson', id: base + '/' + Number(m[1]) };
    if (/^Kiểm tra/.test(mtKey)) return { kind: 'gate', id: base + '/kt-' + slug(mtKey) };
    if (/^Ôn tập/.test(mtKey)) return { kind: 'review', id: base + '/ot-' + slug(mtKey) };
    return null;
  }

  /* ── Cấu hình lớp (giáo viên) ─────────────────────────────────────────────── */
  const DEFAULT_COURSE_CFG = { mode: 'sequential', minScore: PASS, locked: [], unlocked: [], gateAfter: {}, extra: {} };

  function cleanStr(v, max) { return typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max) : ''; }
  function cleanUrl(v) {
    const s = cleanStr(v, 300);
    return /^https:\/\/[^\s"'<>]+$/.test(s) ? s : ''; // chỉ https — chặn javascript:, data:, http:
  }
  function cleanIds(a, max) {
    return (Array.isArray(a) ? a : []).filter(function (x) { return typeof x === 'string' && ID_RE.test(x); }).slice(0, max);
  }
  function cleanLinks(a) {
    return (Array.isArray(a) ? a : []).map(function (x) { return x && { title: cleanStr(x.title, 80), url: cleanUrl(x.url) }; })
      .filter(function (x) { return x && x.title && x.url; }).slice(0, 5);
  }

  /** Cấu hình lớp nhận từ link (không tin được) → bản sạch. Sai kiểu thì về mặc định, không ném lỗi. */
  function sanitizeClassConfig(raw) {
    const r = raw && typeof raw === 'object' ? raw : {};
    const out = { v: 1, className: cleanStr(r.className, 40), issuedAt: typeof r.issuedAt === 'number' ? r.issuedAt : 0, courses: {} };
    const courses = r.courses && typeof r.courses === 'object' ? r.courses : {};
    Object.keys(courses).slice(0, 20).forEach(function (cid) {
      if (!ID_RE.test(cid)) return;
      const c = courses[cid] || {};
      const extra = {};
      Object.keys(c.extra && typeof c.extra === 'object' ? c.extra : {}).slice(0, 100).forEach(function (lid) {
        if (!ID_RE.test(lid)) return;
        const e = { videos: cleanLinks(c.extra[lid].videos), docs: cleanLinks(c.extra[lid].docs) };
        if (e.videos.length || e.docs.length) extra[lid] = e;
      });
      const gateAfter = {};
      Object.keys(c.gateAfter && typeof c.gateAfter === 'object' ? c.gateAfter : {}).slice(0, 30).forEach(function (gid) {
        if (ID_RE.test(gid) && ID_RE.test(String(c.gateAfter[gid]))) gateAfter[gid] = c.gateAfter[gid];
      });
      const ms = Number(c.minScore);
      out.courses[cid] = {
        mode: c.mode === 'free' ? 'free' : 'sequential',
        minScore: ms >= 40 && ms <= 100 ? Math.round(ms) : PASS,
        locked: cleanIds(c.locked, 300),
        unlocked: cleanIds(c.unlocked, 300),
        gateAfter: gateAfter,
        extra: extra,
      };
    });
    return out;
  }
  function courseCfg(classCfg, courseId) {
    const c = classCfg && classCfg.courses && classCfg.courses[courseId];
    return c || DEFAULT_COURSE_CFG;
  }

  /* ── Tiến độ từ lịch sử bài làm ───────────────────────────────────────────── */
  /** records: eduquiz_records ĐÃ lọc theo học sinh. → { units: { id: { best, attempts, lastAt, bestTest, timeSec } } } */
  function progressOf(records) {
    const units = {};
    (records || []).forEach(function (r) {
      const u = unitIdOf(r.catId, r.levelId, r.mtKey);
      if (!u || typeof r.score !== 'number') return;
      const p = units[u.id] || (units[u.id] = { kind: u.kind, best: 0, attempts: 0, lastAt: 0, bestTest: null, timeSec: 0 });
      p.attempts++;
      p.best = Math.max(p.best, r.score);
      if (r.examMode === 'test') p.bestTest = Math.max(p.bestTest === null ? 0 : p.bestTest, r.score);
      const t = Number(r.id) > 1e14 ? Math.floor(Number(r.id) / 1000) : Number(r.id) || 0;
      p.lastAt = Math.max(p.lastAt, t);
      if (typeof r.elapsedSec === 'number' && r.elapsedSec > 0) p.timeSec += Math.min(r.elapsedSec, 4 * 3600);
    });
    return { units: units };
  }

  /* ── Cây kỹ năng: trạng thái từng nút ──
     done: điểm cao nhất ≥ điểm đạt · available: mở được · locked: chưa mở (reason: 'teacher' | 'requires') */
  function nodeStates(course, progress, classCfg) {
    const cfg = courseCfg(classCfg, course.id);
    const min = cfg.minScore;
    const units = (progress && progress.units) || {};
    const st = {};
    const passed = function (id) { return !!units[id] && units[id].best >= min; };
    function decide(node, requires) {
      if (passed(node.id)) return { state: 'done', best: units[node.id].best };
      if (cfg.locked.indexOf(node.id) >= 0) return { state: 'locked', reason: 'teacher' };
      if (cfg.mode === 'free' || cfg.unlocked.indexOf(node.id) >= 0) return { state: 'available', best: units[node.id] ? units[node.id].best : null };
      const missing = requires.filter(function (r) { return !passed(r); });
      return missing.length ? { state: 'locked', reason: 'requires', missing: missing } : { state: 'available', best: units[node.id] ? units[node.id].best : null };
    }
    course.lessons.forEach(function (l) { st[l.id] = decide(l, l.requires || []); });
    (course.gates || []).forEach(function (g) { st[g.id] = decide(g, cfg.gateAfter[g.id] ? [cfg.gateAfter[g.id]] : g.requires || []); });
    return st;
  }

  /** Điều kiện hoàn thành khoá học + bài nên làm tiếp. */
  function courseStatus(course, progress, classCfg) {
    const st = nodeStates(course, progress, classCfg);
    const cfg = courseCfg(classCfg, course.id);
    const lDone = course.lessons.filter(function (l) { return st[l.id].state === 'done'; }).length;
    const gates = course.gates || [];
    const gDone = gates.filter(function (g) { return st[g.id].state === 'done'; }).length;
    const conditions = [{ id: 'lessons', label: 'Đạt ' + cfg.minScore + ' điểm ở mọi bài học', current: lDone, target: course.lessons.length, met: lDone === course.lessons.length }];
    if (gates.length) conditions.push({ id: 'gates', label: 'Đạt ' + cfg.minScore + ' điểm ở mọi bài kiểm tra', current: gDone, target: gates.length, met: gDone === gates.length });
    const total = course.lessons.length + gates.length;
    const next = course.lessons.concat(gates).filter(function (n) { return st[n.id].state === 'available'; })[0] || null;
    return {
      states: st, lessonsDone: lDone, gatesDone: gDone, total: total,
      pct: total ? Math.round(((lDone + gDone) / total) * 100) : 0,
      complete: conditions.every(function (c) { return c.met; }), conditions: conditions, next: next,
    };
  }

  /** EXP xem trước (theo bảng thưởng của cultivation-core). Chỉ để HIỂN THỊ — máy chủ mới ghi EXP thật. */
  function expPreview(course, cultivationConfig) {
    const r = (cultivationConfig && cultivationConfig.rewards) || {};
    const perLesson = (r.LESSON && r.LESSON.amount) || 0;
    const perGate = (r.TEST && r.TEST.amount) || 0;
    return { perLesson: perLesson, perGate: perGate, total: perLesson * course.lessons.length + perGate * (course.gates || []).length };
  }

  /**
   * Bài nộp ĐÃ ĐƯỢC MÁY CHỦ CHẤM LẠI → sự kiện cho CultivationService. Không có điểm máy chủ → [] (không thưởng).
   * sub: { learnerId, catId, levelId, mtKey, serverScore, durationSec }
   */
  function submissionEvents(sub) {
    if (!sub || typeof sub.serverScore !== 'number' || !sub.learnerId) return [];
    const u = unitIdOf(sub.catId, sub.levelId, sub.mtKey);
    if (!u) return [];
    const ev = { score: Math.max(0, Math.min(100, Math.round(sub.serverScore))) };
    if (typeof sub.durationSec === 'number') ev.durationSec = Math.max(0, Math.min(4 * 3600, Math.round(sub.durationSec)));
    if (u.kind === 'lesson') { ev.lessonId = u.id; return [{ type: 'LESSON', learnerId: sub.learnerId, evidence: ev }]; }
    if (u.kind === 'gate') { ev.testId = u.id; return [{ type: 'TEST', learnerId: sub.learnerId, evidence: ev }]; }
    ev.exerciseId = u.id;
    return [{ type: 'EXERCISE', learnerId: sub.learnerId, evidence: ev }];
  }

  const api = {
    PASS: PASS, DEFAULT_COURSE_CFG: DEFAULT_COURSE_CFG, slug: slug, unitIdOf: unitIdOf,
    sanitizeClassConfig: sanitizeClassConfig, courseCfg: courseCfg, progressOf: progressOf,
    nodeStates: nodeStates, courseStatus: courseStatus, expPreview: expPreview, submissionEvents: submissionEvents,
  };
  root.EduLearning = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
