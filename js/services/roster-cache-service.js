/* ============================================================
   js/services/roster-cache-service.js
   1 bản đệm DÙNG CHUNG cho toàn bộ học sinh đang học (students_roster, status "active").

   VÌ SAO CẦN FILE NÀY:
   4 trang quản lý tự đọc TOÀN BỘ danh sách học sinh (~2.800 doc), mỗi trang 1 khoá cache
   riêng: admin-users.js (tra cứu trường), coordinator/data-loader.js và teacher/data-loader.js
   (nhánh Admin), roster-manager.js (Admin, cả học sinh đã nghỉ). Admin mở 3 trang trong 1 giờ
   = ~9.000 lượt đọc (Firestore Usage 24/10/2026: đỉnh 9,1K lượt/giờ). Nay các trang dùng chung
   khoá ROSTER_KEY: trang nào đọc trước thì các trang sau lấy lại, 0 lượt đọc.

   ĐỒNG BỘ PHẦN THAY ĐỔI (29/10/2026): trước đây hết hạn 6 giờ là đọc lại ~2.800 doc (đỉnh
   3,1K lượt/giờ trên Firestore Usage). Nay mọi lệnh ghi students_roster đóng dấu
   updatedAt = serverTimestamp() (stampRoster() bên dưới) → bản đệm hết hạn chỉ hỏi những doc
   có updatedAt MỚI HƠN mốc đã thấy: không ai sửa gì = 1 lượt đọc. Mỗi FULL_RESYNC_MS đọc lại
   toàn bộ 1 lần để bỏ học sinh bị XOÁ HẲN ở máy khác (xoá không để lại dấu cho delta) và bắt
   doc do bản web cũ ghi (chưa có updatedAt).

   Mọi lần ghi students_roster trên máy này gọi invalidate() → lần đọc sau hỏi phần thay đổi
   (không đọc lại toàn bộ). Bản đệm cũ vẫn được dùng làm phương án cuối khi Firebase hết lượt
   đọc/mất mạng.

   Bản ghi giống hệt EduRepositories.studentRoster.list(): { id, ...data }.
   Nạp SAU js/firebase-config.js và js/services/data-cache-service.js.
   ============================================================ */
(function (global) {
  'use strict';

  const ROSTER_KEY = 'roster:active:all';
  // Trong khoảng này: 0 lượt đọc. Quá hạn: hỏi phần thay đổi (~1 lượt) — trước đây 6 giờ vì
  // mỗi lần làm mới tốn cả roster; nay rẻ nên giữ ngắn cho dữ liệu tươi hơn.
  const TTL_MS = 30 * 60 * 1000;
  const FULL_RESYNC_MS = 3 * 24 * 60 * 60 * 1000;
  const KEEP_MS = 30 * 24 * 60 * 60 * 1000; // giữ bản đệm làm nền cho delta / phương án cuối
  const DELTA_LIMIT = 5000; // chạm trần = thay đổi quá nhiều → đọc lại toàn bộ cho chắc
  let inflight = null; // 2 phần trong cùng 1 trang hỏi cùng lúc → chỉ 1 lần đọc
  let dirty = false; // vừa ghi trên máy này (invalidate) → lần sau hỏi phần thay đổi ngay

  const cache = () => global.EduDataCache;

  /** Timestamp (hoặc bản đã qua IndexedDB/JSON: { seconds, nanoseconds }) → [giây, nano]. */
  function stampOf(v) {
    if (!v || typeof v.seconds !== 'number') return null;
    return [v.seconds, Number(v.nanoseconds) || 0];
  }
  function laterStamp(a, b) {
    if (!a) return b;
    if (!b) return a;
    return (b[0] > a[0] || (b[0] === a[0] && b[1] > a[1])) ? b : a;
  }
  /** updatedAt lớn nhất trong danh sách — mốc cho lần hỏi phần thay đổi sau. */
  function watermarkOf(students) {
    return (students || []).reduce((m, s) => laterStamp(m, stampOf(s && s.updatedAt)), null);
  }

  /** Field đóng dấu cho MỌI lệnh ghi students_roster (tạo/sửa/nạp Excel/gán lớp). */
  function stampRoster(data) {
    return Object.assign({}, data, { updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
  }

  /** Doc students_roster (mọi trạng thái) có updatedAt sau mốc `since` ([giây, nano] | null). */
  async function changedSince(since, label) {
    const ts = since ? new firebase.firestore.Timestamp(since[0], since[1]) : firebase.firestore.Timestamp.fromMillis(0);
    const snap = await global.EduFirebase.db.collection('students_roster').where('updatedAt', '>', ts).limit(DELTA_LIMIT).get();
    if (snap.metadata && snap.metadata.fromCache) throw Object.assign(new Error('offline'), { code: 'unavailable' });
    if (global.EduFirebase.countSnap) global.EduFirebase.countSnap(label || 'students_roster (thay đổi)', snap);
    if (snap.docs.length >= DELTA_LIMIT) throw Object.assign(new Error('quá nhiều thay đổi'), { code: 'delta-overflow' });
    return snap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
  }

  /** Gộp phần thay đổi vào danh sách cũ. keep(s) = còn giữ trong danh sách không (vd chỉ "active"). */
  function mergeChanges(list, changes, keep) {
    if (!changes.length) return list;
    const byId = new Map(list.map((s) => [s.id, s]));
    changes.forEach((s) => { if (!keep || keep(s)) byId.set(s.id, s); else byId.delete(s.id); });
    return Array.from(byId.values());
  }

  /**
   * Hỏi phần thay đổi kể từ bản `base` ({ students, fullAt, watermark }) rồi gộp vào.
   * keep(s): còn giữ học sinh đó trong danh sách không (vd chỉ "active"; bỏ trống = giữ mọi trạng thái).
   * Trả null khi cần đọc lại toàn bộ: chưa có nền, nền đã quá FULL_RESYNC_MS, hoặc thay đổi quá nhiều.
   * watermark chỉ tiến theo các lần đọc từ máy chủ (toàn bộ/phần thay đổi) — KHÔNG theo lần sửa lẻ
   * trên máy này, để không nhảy qua thay đổi máy khác ghi trước đó.
   */
  async function deltaFrom(base, keep, label) {
    // Công tắc tắt nhanh trong js/backend-config.js → luôn đọc toàn bộ như trước.
    if (global.EduBackend && global.EduBackend.rosterDeltaSync === false) return null;
    if (!base || !Array.isArray(base.students) || !base.fullAt || Date.now() - base.fullAt >= FULL_RESYNC_MS) return null;
    let changes;
    try {
      changes = await changedSince(base.watermark || null, label);
    } catch (err) {
      if (err.code === 'delta-overflow') return null;
      throw err;
    }
    return {
      students: mergeChanges(base.students, changes, keep),
      fullAt: base.fullAt,
      watermark: laterStamp(base.watermark || null, watermarkOf(changes)),
    };
  }

  async function readAll() {
    const snap = await global.EduFirebase.db.collection('students_roster').where('status', '==', 'active').limit(10000).get();
    // SDK offline (hết lượt/mất mạng) trả cache máy thay vì báo lỗi — coi là thất bại
    if (snap.metadata && snap.metadata.fromCache) throw Object.assign(new Error('offline'), { code: 'unavailable' });
    if (global.EduFirebase.countSnap) global.EduFirebase.countSnap('students_roster (đang học, bản đệm chung)', snap);
    return snap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
  }

  const isActive = (s) => s.status === 'active';

  function save(entry) {
    if (cache()) cache().setAsync(ROSTER_KEY, entry, KEEP_MS, /* persist */ true);
  }

  /**
   * Toàn bộ học sinh đang học. maxAgeMs: tuổi tối đa chấp nhận của bản đệm (vd nút "Làm mới"
   * truyền số nhỏ để hỏi lại). Trả mảng { id, ...data }.
   */
  async function activeAll({ maxAgeMs = TTL_MS } = {}) {
    const C = cache();
    const hit = C ? await C.getAsync(ROSTER_KEY, true, /* allowStale */ true) : null;
    const usable = hit && Array.isArray(hit.students);
    if (usable && !dirty && Date.now() - (hit.cachedAt || 0) < maxAgeMs) return hit.students;
    if (inflight) return inflight;
    inflight = (async () => {
      try {
        let entry = await deltaFrom(usable ? hit : null, isActive);
        if (!entry) {
          const students = await readAll();
          entry = { students, fullAt: Date.now(), watermark: watermarkOf(students) };
        }
        entry.cachedAt = Date.now();
        dirty = false;
        save(entry);
        return entry.students;
      } catch (err) {
        if (usable) {
          console.warn('[EduRosterCache] Không đọc được danh sách học sinh mới, dùng bản đã lưu:', err.message);
          return hit.students;
        }
        throw err;
      }
    })().finally(() => { inflight = null; });
    return inflight;
  }

  /** Ghi bản đệm từ dữ liệu đọc ở nơi khác (vd roster-manager đọc cả HS đã nghỉ).
   *  fullAt/watermark: của lần đọc từ máy chủ gần nhất ở nơi đó (mặc định: bây giờ / tính từ danh sách). */
  function put(students, fullAt, watermark) {
    dirty = false;
    save({ students, cachedAt: Date.now(), fullAt: fullAt || Date.now(), watermark: watermark !== undefined ? watermark : watermarkOf(students) });
  }

  /** Gọi sau mỗi lần ghi students_roster trên máy này: lần đọc sau hỏi phần thay đổi
   *  (vài lượt) thay vì đọc lại toàn bộ. */
  function invalidate() {
    dirty = true;
    const C = cache();
    if (!C) return;
    C.getAsync(ROSTER_KEY, true, true).then((hit) => {
      if (hit && Array.isArray(hit.students)) save(Object.assign({}, hit, { cachedAt: 0 }));
    });
  }

  global.EduRosterCache = {
    activeAll, put, invalidate, stampRoster, deltaFrom, watermarkOf,
    ROSTER_KEY, TTL_MS, FULL_RESYNC_MS,
  };
})(window);
