/* ============================================================
   js/services/collection-sync-service.js
   Bản sao CỤC BỘ (IndexedDB) của 1 collection Firestore lớn + ĐỒNG BỘ
   DELTA theo field thời gian cập nhật (mặc định "updatedAt").

   VÌ SAO CẦN FILE NÀY:
   image-manager.html đọc NGUYÊN collection "questions" (~6.000 câu) mỗi
   lần mở trang. Cache cũ lưu sessionStorage nhưng ngân hàng câu hỏi
   (~5 triệu ký tự) vượt trần ~5 triệu ký tự của storage → ghi cache
   thất bại âm thầm → mỗi lần mở trang = ~6.000 lượt đọc (khớp các đỉnh
   ~6K/giờ trên biểu đồ Firebase).

   CÁCH LÀM:
   - Lần đầu (hoặc mỗi fullEveryMs): đọc toàn bộ 1 lần, lưu IndexedDB.
   - Trong freshMs sau lần đồng bộ gần nhất: không gọi mạng.
   - Ngoài ra: chỉ hỏi doc có updatedAt > mốc đã thấy (thường ~1 lượt
     đọc). Mọi chỗ GHI collection phải đặt updatedAt = serverTimestamp().
   - Doc bị xoá ở máy khác chỉ được phát hiện ở lần đọc toàn bộ kế tiếp
     (SDK compat 10.13 chưa có count() để đối chiếu rẻ); xoá trên chính
     trang đang dùng thì gọi remove() để cập nhật ngay.

   Nạp SAU js/firebase-config.js.
   ============================================================ */
(function (global) {
  'use strict';

  const IDB_NAME = 'eduCollectionSync';
  const IDB_STORE = 'kv';
  let idbPromise = null;

  function openIdb() {
    if (!idbPromise) {
      idbPromise = new Promise((resolve) => {
        try {
          const req = global.indexedDB.open(IDB_NAME, 1);
          req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(null);
          req.onblocked = () => resolve(null);
        } catch (e) { resolve(null); }
      });
    }
    return idbPromise;
  }

  function idbRequest(mode, fn) {
    return openIdb().then((idb) => new Promise((resolve) => {
      if (!idb) return resolve(undefined);
      try {
        const req = fn(idb.transaction(IDB_STORE, mode).objectStore(IDB_STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(undefined);
      } catch (e) { resolve(undefined); }
    }));
  }

  function toMillis(v) {
    return v && typeof v.toMillis === 'function' ? v.toMillis() : null;
  }

  /** Timestamp cấp 1 → mili-giây (IndexedDB làm mất prototype Timestamp). */
  function toPlain(data) {
    const out = {};
    Object.keys(data || {}).forEach((k) => {
      const ms = toMillis(data[k]);
      out[k] = ms !== null ? ms : data[k];
    });
    return out;
  }

  function emptyState() {
    return { docs: {}, watermark: 0, syncedAt: 0, fullAt: 0 };
  }

  /**
   * @param {Object} opts
   * @param {string} opts.name khoá lưu IndexedDB (vd. 'questions')
   * @param {() => firebase.firestore.Query} opts.query query gốc (thường là collection)
   * @param {string} [opts.updatedField='updatedAt']
   * @param {number} [opts.freshMs=120000] trong khoảng này không gọi mạng
   * @param {number} [opts.fullEveryMs=7 ngày] chu kỳ đọc lại toàn bộ (bắt doc bị xoá)
   */
  function create(opts) {
    const name = opts.name;
    const field = opts.updatedField || 'updatedAt';
    const freshMs = opts.freshMs != null ? opts.freshMs : 2 * 60 * 1000;
    const fullEveryMs = opts.fullEveryMs != null ? opts.fullEveryMs : 7 * 24 * 60 * 60 * 1000;

    let statePromise = null;
    let inflight = null;
    let saveTimer = null;

    function loadState() {
      if (!statePromise) {
        statePromise = idbRequest('readonly', (s) => s.get(name))
          .then((st) => (st && st.docs ? Object.assign(emptyState(), st) : emptyState()));
      }
      return statePromise;
    }

    function setState(st) { statePromise = Promise.resolve(st); }

    // Gộp nhiều lần ghi liên tiếp (vd. sửa nhiều câu) thành 1 lần lưu IndexedDB.
    function scheduleSave() {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        loadState().then((st) => idbRequest('readwrite', (s) => s.put(st, name)));
      }, 300);
    }

    function absorb(st, docs) {
      docs.forEach((doc) => {
        const data = toPlain(doc.data());
        st.docs[doc.id] = data;
        if (typeof data[field] === 'number' && data[field] > st.watermark) st.watermark = data[field];
      });
    }

    /** Thay toàn bộ bản sao bằng kết quả 1 lần đọc toàn bộ đã có sẵn (vd. lúc xuất file). */
    function replaceAll(docs) {
      const st = emptyState();
      absorb(st, docs);
      st.syncedAt = st.fullAt = Date.now();
      setState(st);
      scheduleSave();
      return st.docs;
    }

    /**
     * @param {{force?: boolean}} [o] force=true → đọc lại toàn bộ.
     * @returns {Promise<{docs: Object<string,Object>, mode: 'cache'|'delta'|'full', reads: number}>}
     */
    function sync(o) {
      const force = !!(o && o.force);
      if (inflight && !force) return inflight;
      const run = (async () => {
        const st = await loadState();
        const now = Date.now();
        if (!force && st.fullAt && now - st.syncedAt < freshMs) return { docs: st.docs, mode: 'cache', reads: 0 };
        if (force || !st.fullAt || now - st.fullAt > fullEveryMs) {
          const snap = await opts.query().get();
          return { docs: replaceAll(snap.docs), mode: 'full', reads: Math.max(1, snap.size) };
        }
        try {
          const since = global.firebase.firestore.Timestamp.fromMillis(st.watermark);
          const snap = await opts.query().where(field, '>', since).get();
          absorb(st, snap.docs);
          st.syncedAt = Date.now();
          scheduleSave();
          return { docs: st.docs, mode: 'delta', reads: Math.max(1, snap.size) };
        } catch (e) {
          console.warn('[EduCollectionSync] Đồng bộ delta "' + name + '" lỗi, đọc lại toàn bộ:', e.message);
          const snap = await opts.query().get();
          return { docs: replaceAll(snap.docs), mode: 'full', reads: Math.max(1, snap.size) };
        }
      })();
      inflight = run;
      const done = () => { if (inflight === run) inflight = null; };
      run.then(done, done);
      return run;
    }

    /** Cập nhật bản sao sau khi CHÍNH trang này ghi (FieldValue như serverTimestamp bị bỏ qua). */
    async function put(id, data) {
      const st = await loadState();
      const clean = {};
      Object.keys(data || {}).forEach((k) => {
        const v = data[k];
        if (v && typeof v === 'object' && !Array.isArray(v) && typeof v.isEqual === 'function' && typeof v.toMillis !== 'function') return;
        clean[k] = toMillis(v) !== null ? toMillis(v) : v;
      });
      st.docs[id] = clean;
      scheduleSave();
    }

    async function remove(id) {
      const st = await loadState();
      delete st.docs[id];
      scheduleSave();
    }

    return { sync, put, remove, replaceAll };
  }

  global.EduCollectionSync = { create };
})(window);
