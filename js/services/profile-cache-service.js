/* ============================================================
   js/services/profile-cache-service.js
   Cache BỀN (IndexedDB) + ĐỒNG BỘ DELTA cho collection "gvlab_profiles"
   (ảnh đại diện/trạng thái/tiểu sử của Trang Social Media).

   VÌ SAO CẦN FILE NÀY:
   portfolio.js và teaching-schedule.js trước đây đọc NGUYÊN collection
   gvlab_profiles MỖI lần mở trang (mỗi hồ sơ kèm avatar base64 tới
   ~300KB) — N lượt đọc + vài MB băng thông/lần F5. dashboard-page.js,
   teacher/dashboard.js, teaching-schedule.js còn đọc thêm 1 document
   gvlab_profiles/{uid} chỉ để hiện avatar trên topbar.

   CÁCH LÀM:
   - Lần đầu: đọc toàn bộ 1 lần, lưu vào IndexedDB (localStorage ~5MB
     không đủ chứa avatar base64).
   - Các lần sau: chỉ hỏi Firestore những hồ sơ có updatedAt MỚI HƠN mốc
     đã đồng bộ (portfolio.js luôn ghi updatedAt = serverTimestamp() khi
     lưu hồ sơ) → thường chỉ tốn 1 lượt đọc (query rỗng vẫn tính 1).
   - Trong FRESH_MS sau lần đồng bộ gần nhất: KHÔNG gọi mạng.
   - Mỗi FULL_RESYNC_MS đọc lại toàn bộ 1 lần để bắt hồ sơ bị xoá/hồ sơ
     cũ chưa có updatedAt.
   IndexedDB bị chặn (ẩn danh Safari...) → tự lùi về cache trong RAM.

   Nạp file này SAU js/firebase-config.js.
   ============================================================ */
(function (global) {
  'use strict';

  const COLLECTION = 'gvlab_profiles';
  const FRESH_MS = 2 * 60 * 1000;
  const FULL_RESYNC_MS = 24 * 60 * 60 * 1000;
  const SINGLE_TTL_MS = 10 * 60 * 1000;

  const IDB_NAME = 'eduProfileCache';
  const IDB_STORE = 'kv';
  const IDB_KEY = COLLECTION;

  function emptyState() {
    // docs: uid -> dữ liệu hồ sơ (Timestamp đã đổi sang mili-giây)
    // docAt: uid -> lúc đọc lẻ 1 document (khi chưa có bản đọc toàn bộ)
    // watermark: updatedAt lớn nhất (giờ SERVER) đã thấy — mốc cho delta
    return { docs: {}, docAt: {}, watermark: 0, syncedAt: 0, fullAt: 0 };
  }

  // ── IndexedDB tối giản (1 store key-value) ──
  let idbPromise = null;
  function openIdb() {
    if (idbPromise) return idbPromise;
    idbPromise = new Promise((resolve) => {
      try {
        const req = global.indexedDB.open(IDB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch (e) { resolve(null); }
    });
    return idbPromise;
  }

  async function idbGet() {
    const idb = await openIdb();
    if (!idb) return null;
    return new Promise((resolve) => {
      try {
        const req = idb.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(IDB_KEY);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      } catch (e) { resolve(null); }
    });
  }

  async function idbPut(value) {
    const idb = await openIdb();
    if (!idb) return;
    try { idb.transaction(IDB_STORE, 'readwrite').objectStore(IDB_STORE).put(value, IDB_KEY); }
    catch (e) { /* hết quota/bị chặn — cache RAM vẫn chạy */ }
  }

  let statePromise = null;
  function loadState() {
    if (!statePromise) {
      statePromise = idbGet().then((s) => (s && s.docs ? Object.assign(emptyState(), s) : emptyState()));
    }
    return statePromise;
  }

  function saveState(state) { return idbPut(state); }

  function toMillis(v) {
    return v && typeof v.toMillis === 'function' ? v.toMillis() : null;
  }

  /** Đổi Timestamp → mili-giây để lưu được vào IndexedDB (structured clone
   *  làm mất prototype Timestamp) và so sánh mốc delta. */
  function toPlain(data) {
    const out = {};
    Object.keys(data || {}).forEach((k) => {
      const ms = toMillis(data[k]);
      out[k] = ms !== null ? ms : data[k];
    });
    return out;
  }

  function db() {
    if (!global.EduFirebase || !global.EduFirebase.db) throw new Error('[EduProfileCache] Firestore chưa sẵn sàng.');
    return global.EduFirebase.db;
  }

  function absorb(state, snap) {
    snap.forEach((doc) => {
      const data = toPlain(doc.data());
      state.docs[doc.id] = data;
      if (typeof data.updatedAt === 'number' && data.updatedAt > state.watermark) state.watermark = data.updatedAt;
    });
  }

  async function fullSync(state) {
    const snap = await db().collection(COLLECTION).get();
    const fresh = emptyState();
    absorb(fresh, snap);
    fresh.syncedAt = fresh.fullAt = Date.now();
    return fresh;
  }

  async function deltaSync(state) {
    const since = firebase.firestore.Timestamp.fromMillis(state.watermark);
    const snap = await db().collection(COLLECTION).where('updatedAt', '>', since).get();
    absorb(state, snap);
    state.syncedAt = Date.now();
    return state;
  }

  let inflight = null;

  /**
   * Toàn bộ hồ sơ: { uid: { avatar, status, bio, updatedAt(ms), ... } }.
   * @param {{force?: boolean}} [opts] force=true → đọc lại toàn bộ từ Firestore.
   */
  function getAll(opts) {
    const force = !!(opts && opts.force);
    if (inflight && !force) return inflight;
    const run = (async () => {
      let state = await loadState();
      const now = Date.now();
      if (!force && state.fullAt && now - state.syncedAt < FRESH_MS) return state.docs;
      if (force || !state.fullAt || now - state.fullAt > FULL_RESYNC_MS) {
        state = await fullSync(state);
      } else {
        try {
          state = await deltaSync(state);
        } catch (e) {
          console.warn('[EduProfileCache] Đồng bộ delta lỗi, đọc lại toàn bộ:', e.message);
          state = await fullSync(state);
        }
      }
      statePromise = Promise.resolve(state);
      saveState(state);
      return state.docs;
    })();
    inflight = run;
    run.then(() => { if (inflight === run) inflight = null; }, () => { if (inflight === run) inflight = null; });
    return run;
  }

  /**
   * 1 hồ sơ theo uid (vd. avatar trên topbar). Đã có bản đọc toàn bộ thì
   * dùng getAll() (0 lượt đọc nếu còn mới, ~1 lượt nếu cần delta); chưa có
   * thì đọc đúng 1 document và nhớ trong SINGLE_TTL_MS.
   */
  async function get(uid) {
    if (!uid) return null;
    if (inflight) return (await inflight)[uid] || null;
    const state = await loadState();
    if (state.fullAt) return (await getAll())[uid] || null;
    if (state.docs[uid] && Date.now() - (state.docAt[uid] || 0) < SINGLE_TTL_MS) return state.docs[uid];
    const snap = await db().collection(COLLECTION).doc(uid).get();
    const data = snap.exists ? toPlain(snap.data()) : null;
    // Lấy lại state HIỆN TẠI (getAll() có thể vừa thay state mới trong lúc
    // chờ mạng) — ghi vào state cũ rồi lưu sẽ đè mất bản đọc toàn bộ.
    const cur = await loadState();
    if (data) cur.docs[uid] = data; else delete cur.docs[uid];
    cur.docAt[uid] = Date.now();
    saveState(cur);
    return data;
  }

  /** Cập nhật cache NGAY sau khi chính người dùng lưu hồ sơ (portfolio.js),
   *  không cần chờ lần đồng bộ sau. Các field FieldValue (serverTimestamp)
   *  bị bỏ qua — lần delta kế tiếp sẽ lấy giá trị thật từ server. */
  async function put(uid, partial) {
    if (inflight) await inflight.catch(() => {});
    const state = await loadState();
    const clean = {};
    Object.keys(partial || {}).forEach((k) => {
      const v = partial[k];
      if (v && typeof v === 'object' && !Array.isArray(v) && typeof v.isEqual === 'function') return;
      clean[k] = v;
    });
    state.docs[uid] = Object.assign({}, state.docs[uid], clean);
    saveState(state);
  }

  global.EduProfileCache = { getAll, get, put };
})(window);
