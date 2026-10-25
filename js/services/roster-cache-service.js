/* ============================================================
   js/services/roster-cache-service.js
   1 bản đệm DÙNG CHUNG cho toàn bộ học sinh đang học (students_roster, status "active").

   VÌ SAO CẦN FILE NÀY:
   4 trang quản lý tự đọc TOÀN BỘ danh sách học sinh (~2.800 doc), mỗi trang 1 khoá cache
   riêng: admin-users.js (tra cứu trường), coordinator/data-loader.js và teacher/data-loader.js
   (nhánh Admin), roster-manager.js (Admin, cả học sinh đã nghỉ). Admin mở 3 trang trong 1 giờ
   = ~9.000 lượt đọc (Firestore Usage 24/10/2026: đỉnh 9,1K lượt/giờ). Nay các trang dùng chung
   khoá ROSTER_KEY: trang nào đọc trước thì các trang sau lấy lại, 0 lượt đọc.

   Hạn 6 giờ. Mọi lần ghi students_roster trên máy này (roster-manager.js, admin-users.js)
   gọi invalidate() để lần đọc sau lấy bản mới. Bản đệm hết hạn vẫn được dùng làm phương án
   cuối khi Firebase hết lượt đọc/mất mạng (allowStale).

   Bản ghi giống hệt EduRepositories.studentRoster.list(): { id, ...data }.
   Nạp SAU js/firebase-config.js và js/services/data-cache-service.js.
   ============================================================ */
(function (global) {
  'use strict';

  const ROSTER_KEY = 'roster:active:all';
  const TTL_MS = 6 * 60 * 60 * 1000;
  let inflight = null; // 2 phần trong cùng 1 trang hỏi cùng lúc → chỉ 1 lần đọc

  const cache = () => global.EduDataCache;

  async function readFromServer() {
    const snap = await global.EduFirebase.db.collection('students_roster').where('status', '==', 'active').limit(10000).get();
    // SDK offline (hết lượt/mất mạng) trả cache máy thay vì báo lỗi — coi là thất bại
    if (snap.metadata && snap.metadata.fromCache) throw Object.assign(new Error('offline'), { code: 'unavailable' });
    if (global.EduFirebase.countSnap) global.EduFirebase.countSnap('students_roster (đang học, bản đệm chung)', snap);
    return snap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
  }

  /**
   * Toàn bộ học sinh đang học. maxAgeMs: tuổi tối đa chấp nhận của bản đệm (vd nút "Làm mới"
   * truyền số nhỏ để đọc lại). Trả mảng { id, ...data }.
   */
  async function activeAll({ maxAgeMs = TTL_MS } = {}) {
    const C = cache();
    const hit = C ? await C.getAsync(ROSTER_KEY, true) : null;
    if (hit && Array.isArray(hit.students) && Date.now() - (hit.cachedAt || 0) < maxAgeMs) return hit.students;
    if (inflight) return inflight;
    inflight = (async () => {
      try {
        const students = await readFromServer();
        put(students);
        return students;
      } catch (err) {
        const stale = C ? await C.getAsync(ROSTER_KEY, true, /* allowStale */ true) : null;
        if (stale && Array.isArray(stale.students)) {
          console.warn('[EduRosterCache] Không đọc được danh sách học sinh mới, dùng bản đã lưu:', err.message);
          return stale.students;
        }
        throw err;
      }
    })().finally(() => { inflight = null; });
    return inflight;
  }

  /** Ghi bản đệm từ dữ liệu vừa đọc ở nơi khác (vd roster-manager đọc cả HS đã nghỉ). */
  function put(students) {
    if (!cache()) return;
    cache().setAsync(ROSTER_KEY, { students, cachedAt: Date.now() }, TTL_MS, /* persist */ true);
  }

  /** Gọi sau mỗi lần ghi students_roster trên máy này. */
  function invalidate() {
    if (cache()) cache().clear(ROSTER_KEY, true);
  }

  global.EduRosterCache = { activeAll, put, invalidate, ROSTER_KEY, TTL_MS };
})(window);
