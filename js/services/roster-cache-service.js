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
   doc do bản web cũ ghi (chưa có updatedAt). 14 ngày (04/11/2026, trước 3 ngày ≈ 950 lượt đọc/ngày
   mỗi máy Admin): SDK compat 10.13 không có count() để dò xoá rẻ hơn; cần thấy ngay thì bấm "Tải lại".

   GIÁO VIÊN / ĐIỀU PHỐI (scopedRoster, 04/11/2026): trước đây mỗi người đọc lại CẢ danh sách của mình 12 giờ/lần
   — nguồn đọc đều đặn lớn nhất còn lại. Nay hỏi phần thay đổi trong đúng phạm vi rules cho phép (teacherId / school),
   cần composite index (firestore.indexes.json); chưa deploy index thì tự đọc toàn bộ như cũ. Học sinh CHUYỂN khỏi phạm
   vi (đổi giáo viên) không khớp query nên không thấy qua delta → đọc lại toàn bộ SCOPED_FULL_MS/lần; nút "Làm mới
   dữ liệu" đọc toàn bộ tối đa MANUAL_FULL_MS/lần, các lần bấm khác chỉ hỏi phần thay đổi.

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
  const FULL_RESYNC_MS = 14 * 24 * 60 * 60 * 1000;
  const SCOPED_FULL_MS = 3 * 24 * 60 * 60 * 1000;
  // Bấm "Tải lại"/"Làm mới dữ liệu" liên tục: mỗi máy đọc toàn bộ tối đa 6 giờ/lần (05/11/2026), còn lại chỉ hỏi phần
  // thay đổi. Thêm/sửa vẫn thấy ngay; riêng học sinh bị xoá hẳn hoặc chuyển đi có thể còn hiện tới 6 giờ.
  const MANUAL_FULL_MS = 6 * 60 * 60 * 1000;
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
  // Kèm schoolId khi có tên trường (js/models/school.model.js — trang ghi roster phải nạp file đó).
  function stampRoster(data) {
    return Object.assign({}, global.EduModels.School.withSchoolId(data), { updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
  }

  /** Doc students_roster (mọi trạng thái) có updatedAt sau mốc `since` ([giây, nano] | null). */
  async function changedSince(since, label, narrow) {
    const ts = since ? new firebase.firestore.Timestamp(since[0], since[1]) : firebase.firestore.Timestamp.fromMillis(0);
    const col = global.EduFirebase.db.collection('students_roster');
    const snap = await (narrow ? narrow(col) : col).where('updatedAt', '>', ts).limit(DELTA_LIMIT).get();
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
   * opts.narrows: [q => q.where(...)] thu hẹp theo phạm vi (mỗi hàm 1 truy vấn) · opts.fullMs: thay FULL_RESYNC_MS.
   */
  async function deltaFrom(base, keep, label, opts = {}) {
    // Công tắc tắt nhanh trong js/backend-config.js → luôn đọc toàn bộ như trước.
    if (global.EduBackend && global.EduBackend.rosterDeltaSync === false) return null;
    if (!base || !Array.isArray(base.students) || !base.fullAt || Date.now() - base.fullAt >= (opts.fullMs || FULL_RESYNC_MS)) return null;
    let changes = [];
    try {
      for (const narrow of opts.narrows || [null]) changes = changes.concat(await changedSince(base.watermark || null, label, narrow));
    } catch (err) {
      if (err.code === 'delta-overflow') return null;
      if (opts.narrows && (err.code === 'failed-precondition' || err.code === 'permission-denied')) {
        console.warn('[EduRosterCache] Chưa hỏi được phần thay đổi (index chưa deploy?), đọc toàn bộ:', err.message);
        return null;
      }
      throw err;
    }
    return {
      students: mergeChanges(base.students, changes, keep),
      fullAt: base.fullAt,
      watermark: laterStamp(base.watermark || null, watermarkOf(changes)),
    };
  }

  /**
   * Máy khác đã ghi bù schoolId chưa? Bản đệm delta không thấy field ghi bù (cố ý không đổi updatedAt) nên trông như còn
   * thiếu cả trăm bản ghi. Đọc n bản rải đều, có cả bản cuối — ghi bù dở giữa chừng thì phần đuôi còn thiếu — thay vì
   * đọc lại toàn bộ. readOne(id) → bản ghi trên máy chủ | null (đã xoá).
   */
  async function alreadyStamped(records, idOf, readOne, n = 5) {
    const step = Math.max(1, (records.length - 1) / Math.max(1, n - 1));
    const picks = [...new Set(Array.from({ length: n }, (_, i) => Math.min(records.length - 1, Math.round(i * step))))];
    const found = await Promise.all(picks.map((i) => readOne(records[i].id)));
    return found.every((s) => !s || s.schoolId === idOf(s.school));
  }

  /**
   * Bản đệm còn thiếu schoolId: máy chủ đã có chưa (vài lượt đọc)? Chưa có thì HỎI rồi mới đọc toàn bộ — bấm Huỷ không tốn
   * thêm lượt nào. Trả { stamped } | { declined } | { fresh: danh sách mới }.
   */
  async function resolveUnstamped(stale, { idOf, readOne, ask, readFull }) {
    if (await alreadyStamped(stale, idOf, readOne)) return { stamped: true };
    if (!ask()) return { declined: true };
    return { fresh: await readFull() };
  }

  /**
   * Danh sách trong phạm vi 1 người (giáo viên, điều phối). stale: bản lưu cũ (kể cả hết hạn), null = đọc toàn bộ.
   * loadAll(): đọc toàn bộ phạm vi. fullMs: tuổi tối đa của lần đọc toàn bộ (mặc định SCOPED_FULL_MS).
   * Trả { students, fullAt, watermark }.
   */
  async function scopedRoster(stale, { narrows, loadAll, label, fullMs }) {
    const entry = await deltaFrom(stale, isActive, label, { narrows, fullMs: fullMs || SCOPED_FULL_MS });
    if (entry) return entry;
    const students = await loadAll();
    return { students, fullAt: Date.now(), watermark: watermarkOf(students) };
  }

  // ── Đọc TOÀN BỘ theo từng phần, lưu tiến độ (08/11/2026) ──
  // Đo (burst.py, Firestore giả có độ trễ): F5 8 lần lúc Quản lý tài khoản đang đọc ~2.800 học sinh = 25.097 lượt — mỗi lần
  // tải lại bỏ dở 1 truy vấn đã tính phí rồi đọc lại từ đầu. Nay đọc PAGE_SIZE doc/lần theo mã doc, lưu phần đã đọc vào
  // bản đệm; trang tải lại (hoặc tab khác) đọc tiếp từ chỗ dở. Cùng số lượt khi không ai F5 (+1 lượt nếu phần cuối rỗng).
  const PAGE_SIZE = 1000;
  const PARTIAL_TTL_MS = 10 * 60 * 1000; // bản dở cũ hơn → bỏ, đọc lại từ đầu
  const PARTIAL_PREFIX = 'roster:partial:';

  /**
   * Đọc toàn bộ kết quả của baseQuery() theo từng phần (orderBy mã doc — không cần index ghép khi chỉ lọc ==).
   * name: khoá lưu tiến độ (khác nhau cho mỗi loại truy vấn). Trả { docs, watermark }: watermark = updatedAt lớn nhất
   * của PHẦN ĐẦU — mọi doc đọc sau có updatedAt ≤ lúc đọc, thay đổi xảy ra sau lúc đọc phần đầu > mốc này → lần hỏi
   * phần thay đổi kế tiếp vẫn bắt được (dùng max của cả danh sách có thể nhảy qua thay đổi xen giữa 2 phần).
   */
  async function pagedRead(name, baseQuery, label, { pageSize = PAGE_SIZE } = {}) {
    const C = cache();
    const key = PARTIAL_PREFIX + name;
    let part = C ? await C.getAsync(key, true) : null;
    if (!part || !Array.isArray(part.docs) || !part.startedAt || Date.now() - part.startedAt > PARTIAL_TTL_MS) {
      part = { docs: [], lastId: null, startedAt: Date.now(), watermark: null, done: false };
    }
    const docId = firebase.firestore.FieldPath.documentId();
    while (!part.done) {
      let q = baseQuery().orderBy(docId).limit(pageSize);
      if (part.lastId) q = q.startAfter(part.lastId);
      const snap = await q.get();
      // SDK offline (hết lượt/mất mạng) trả cache máy thay vì báo lỗi — coi là thất bại
      if (snap.metadata && snap.metadata.fromCache) throw Object.assign(new Error('offline'), { code: 'unavailable' });
      if (global.EduFirebase.countSnap) global.EduFirebase.countSnap(label, snap);
      const docs = snap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
      if (!part.lastId) part.watermark = watermarkOf(docs);
      part.docs = part.docs.concat(docs);
      if (docs.length) part.lastId = docs[docs.length - 1].id;
      part.done = docs.length < pageSize;
      if (C && !part.done) await C.setAsync(key, part, PARTIAL_TTL_MS, true);
    }
    if (C) await C.setAsync(key, null, 1, true); // xong → bỏ tiến độ (lần sau đọc mới từ đầu)
    return { docs: part.docs, watermark: part.watermark };
  }

  function readAll() {
    return pagedRead('active', () => global.EduFirebase.db.collection('students_roster').where('status', '==', 'active'),
      'students_roster (đang học, bản đệm chung)');
  }

  const isActive = (s) => s.status === 'active';

  function save(entry) {
    return cache() ? cache().setAsync(ROSTER_KEY, entry, KEEP_MS, /* persist */ true) : Promise.resolve();
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
    const wasDirty = dirty;
    // Khoá giữa các tab (EduDataCache.exclusive): nhiều tab cùng mở khi bản đệm trống → 1 tab đọc, các tab kia đợi rồi lấy
    // bản vừa lưu. Kiểm lại bản đệm SAU khi có khoá (tab trước có thể vừa lưu xong).
    const lock = C && C.exclusive ? (fn) => C.exclusive(ROSTER_KEY, fn) : (fn) => fn();
    inflight = lock(async () => {
      const cur = C ? await C.getAsync(ROSTER_KEY, true, /* allowStale */ true) : null;
      const curUsable = cur && Array.isArray(cur.students);
      if (curUsable && !wasDirty && Date.now() - (cur.cachedAt || 0) < maxAgeMs) return cur.students;
      try {
        let entry = await deltaFrom(curUsable ? cur : null, isActive);
        if (!entry) {
          const full = await readAll();
          entry = { students: full.docs, fullAt: Date.now(), watermark: full.watermark };
        }
        entry.cachedAt = Date.now();
        dirty = false;
        await save(entry);
        return entry.students;
      } catch (err) {
        if (curUsable) {
          console.warn('[EduRosterCache] Không đọc được danh sách học sinh mới, dùng bản đã lưu:', err.message);
          return cur.students;
        }
        throw err;
      }
    }).finally(() => { inflight = null; });
    return inflight;
  }

  /**
   * Nền cho trang cần CẢ học sinh đã nghỉ (Quản lý lớp, Admin) khi trang chưa có bản đệm riêng (05→07/11/2026):
   * máy đã có bản đệm "đang học" dùng chung (do trang Quản lý tài khoản/Dashboard/Trường đọc trước) thì dựng nền từ đó +
   * CHỈ đọc học sinh không đang học (status != active) — thay vì đọc lại cả roster (~2.800 lượt, đo trên Firestore giả).
   * Trả { students, fullAt, watermark } để đưa vào deltaFrom() (hỏi tiếp phần thay đổi kể từ mốc) — hoặc null khi nên đọc
   * toàn bộ như trước: chưa có/đã quá FULL_RESYNC_MS/định dạng cũ, tắt rosterDeltaSync, mất mạng.
   * Giới hạn: doc không có field status không nằm trong cả 2 truy vấn (bản đệm chung cũng vậy) → được bù ở lần đọc toàn bộ kế tiếp.
   */
  async function seedAllStatuses() {
    if (global.EduBackend && global.EduBackend.rosterDeltaSync === false) return null;
    const C = cache();
    const hit = C ? await C.getAsync(ROSTER_KEY, true, /* allowStale */ true) : null;
    if (!hit || !Array.isArray(hit.students) || !hit.fullAt || Date.now() - hit.fullAt >= FULL_RESYNC_MS) return null;
    try {
      const snap = await global.EduFirebase.db.collection('students_roster').where('status', '!=', 'active').limit(10000).get();
      if (snap.metadata && snap.metadata.fromCache) return null;
      if (snap.docs.length >= 10000) return null; // chạm trần → có thể thiếu, đọc toàn bộ cho chắc
      if (global.EduFirebase.countSnap) global.EduFirebase.countSnap('students_roster (đã nghỉ, dựng nền từ bản đệm chung)', snap);
      const inactive = snap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
      return { students: hit.students.concat(inactive), fullAt: hit.fullAt, watermark: hit.watermark || watermarkOf(hit.students) };
    } catch (err) {
      return null;
    }
  }

  // ── Điều phối / Quản trị trường: Dashboard điều phối ↔ Quản lý lớp dùng chung phạm vi (08/11/2026) ──
  // Đo (multi.py, điều phối 3 trường): Dashboard đọc 210 HS đang học rồi Quản lý lớp đọc lại 225 HS mọi trạng thái của
  // CÙNG các trường đó (và ngược lại) — mỗi máy đọc trùng ~210 lượt. Hai trang giữ bản đệm riêng theo cùng phạm vi:
  const SCOPED_KEYS = Object.freeze({ dashboard: 'coordinator:roster:', manager: 'roster-manager:' });
  /** Phạm vi 1 tài khoản không phải Admin: "uid:Trường A|Trường B" (khớp khoá cũ của 2 trang). */
  function scopeKeyOf(profile) {
    const schools = Array.isArray(profile && profile.schools) ? profile.schools.filter(Boolean) : [];
    return ((profile && (profile.uid || profile.id)) || 'unknown') + ':' + schools.slice().sort().join('|');
  }
  const scopedUsable = (e) => !!(e && Array.isArray(e.students) && e.fullAt && Date.now() - e.fullAt < SCOPED_FULL_MS)
    && !(global.EduBackend && global.EduBackend.rosterDeltaSync === false);

  /** Bản đệm Quản lý lớp (mọi trạng thái) → nền cho Dashboard (chỉ đang học), giữ mốc để hỏi tiếp phần thay đổi. 0 lượt đọc. */
  function scopedActiveFrom(entry) {
    if (!scopedUsable(entry)) return null;
    return { students: entry.students.filter(isActive), fullAt: entry.fullAt, watermark: entry.watermark || null };
  }

  /**
   * Bản đệm Dashboard (đang học) → nền cho Quản lý lớp: thêm HS đã nghỉ của đúng các trường (status == inactive & school in,
   * chỉ cần index đơn trường — cùng dạng truy vấn Dashboard đang dùng). null khi nên đọc toàn bộ như trước: không có/quá
   * SCOPED_FULL_MS, mất mạng, bị từ chối. Doc thiếu field status: như seedAllStatuses — bù ở lần đọc toàn bộ kế tiếp.
   */
  async function seedScopedAllStatuses(entry, schools) {
    const list = (schools || []).filter(Boolean);
    if (!scopedUsable(entry) || !list.length) return null;
    try {
      const col = global.EduFirebase.db.collection('students_roster');
      const byId = new Map(entry.students.map((s) => [s.id, s]));
      for (let i = 0; i < list.length; i += 10) {
        const snap = await col.where('status', '==', 'inactive').where('school', 'in', list.slice(i, i + 10)).limit(10000).get();
        if (snap.metadata && snap.metadata.fromCache) return null;
        if (snap.docs.length >= 10000) return null;
        if (global.EduFirebase.countSnap) global.EduFirebase.countSnap('students_roster (đã nghỉ, dựng nền từ Dashboard)', snap);
        snap.docs.forEach((d) => byId.set(d.id, Object.assign({ id: d.id }, d.data())));
      }
      return { students: Array.from(byId.values()), fullAt: entry.fullAt, watermark: entry.watermark || null };
    } catch (err) {
      return null;
    }
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
    activeAll, put, invalidate, stampRoster, deltaFrom, scopedRoster, seedAllStatuses, watermarkOf, alreadyStamped, resolveUnstamped,
    scopeKeyOf, scopedActiveFrom, seedScopedAllStatuses, SCOPED_KEYS, pagedRead,
    ROSTER_KEY, TTL_MS, FULL_RESYNC_MS, SCOPED_FULL_MS, MANUAL_FULL_MS,
  };
})(window);
