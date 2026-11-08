/* ============================================================
   js/repositories/base-repository.js
   Lớp Repository nền tảng — bọc quanh Firestore Compat SDK để các
   repository cụ thể (student-result, roster, activity-log...) không
   phải lặp lại code CRUD + xử lý lỗi.

   Đây là phần "Repositories" trong yêu cầu tách Clean Architecture:
   Controller/Service KHÔNG được gọi thẳng firebase.firestore(), mà
   luôn đi qua 1 Repository — giúp sau này đổi backend (vd. sang
   Cloud Functions REST API) chỉ cần sửa tầng repository.

   Nạp file này SAU js/firebase-config.js.
   ============================================================ */
(function (global) {
  'use strict';

  // Trần mặc định cho list() khi gọi KHÔNG truyền options.limit — phòng
  // ngừa 1 lời gọi quên truyền limit đọc nguyên cả collection nếu sau này
  // nó phình to ngoài dự tính. LƯU Ý: studentRoster.list({where: status ==
  // active}) (coordinator/teacher data-loader.js) hiện ĐANG gọi không
  // limit để lấy ĐỦ roster toàn trường (có thể hàng nghìn học sinh) — nên
  // trần này PHẢI đặt bằng đúng mức trần TỐI ĐA Firestore cho phép mỗi
  // query (10.000, giống hằng số đã dùng ở js/dashboard.js §
  // updateReportTab()), KHÔNG đặt thấp hơn, nếu không sẽ âm thầm cắt bớt
  // danh sách học sinh của các trường lớn. Đây chỉ là lưới an toàn cho lời
  // gọi THỰC SỰ quên truyền limit (vd. collection nhỏ như
  // "classes"/"courses"), không nhằm giới hạn dữ liệu cần thiết.
  const DEFAULT_LIST_LIMIT = 10000;

  /**
   * Dữ liệu từ tầng model → dạng Firestore: field mang dấu EduModels.SERVER_TIME ({ __eduServerTime: true })
   * thành FieldValue.serverTimestamp(). Chỉ xét field cấp 1 (model chỉ đặt dấu ở createdAt/updatedAt).
   */
  function toStore(data) {
    if (!data || typeof data !== 'object') return data;
    let out = null;
    Object.keys(data).forEach((k) => {
      const v = data[k];
      if (v && v.__eduServerTime === true) {
        out = out || Object.assign({}, data);
        out[k] = global.firebase.firestore.FieldValue.serverTimestamp();
      }
    });
    return out || data;
  }
  const BATCH_MAX = 450; // Firestore cho tối đa 500 thao tác/lô — chừa chỗ an toàn

  /** In "[trang] N lượt đọc Firestore — <nhãn>" (xem countSnap() trong firebase-config.js). */
  function meter(label, snap) {
    if (global.EduFirebase && global.EduFirebase.countSnap) global.EduFirebase.countSnap(label, snap);
  }

  // ── Bản đệm dùng chung cho danh sách nhỏ, ít đổi (07/11/2026) ──
  // Lớp, khoá học, giáo viên đã duyệt... được nhiều trang quản lý đọc lại từng trang một (đo: coordinator mở Dashboard rồi
  // Quản lý lớp tốn 656 lượt, trong đó 256 là đọc trùng). list({ cacheMs }) lưu kết quả vào EduDataCache (IndexedDB, dùng chung
  // mọi trang/tab của máy) trong cacheMs. Mọi lệnh ghi qua repository nâng "phiên bản" của collection (localStorage → tab khác
  // cũng thấy) nên bản cũ bị bỏ ngay; nơi ghi thẳng Firestore gọi repo.invalidate(). refresh:true = bỏ qua bản đệm nhưng vẫn
  // lưu bản mới. KHÔNG truyền cacheMs → như cũ. Dữ liệu lấy từ đệm có Timestamp đã mất hàm (toMillis...) như mọi bản đệm IndexedDB.
  const VER_PREFIX = 'edu_repo_ver:';
  const memVer = {};
  const inflightLists = new Map();
  function verOf(col) {
    try { const v = localStorage.getItem(VER_PREFIX + col); if (v !== null) return v; } catch (e) { /* dùng bản trong tab */ }
    return memVer[col] || '0';
  }
  function bumpVer(col) {
    const v = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    memVer[col] = v;
    try { localStorage.setItem(VER_PREFIX + col, v); } catch (e) { /* bỏ qua */ }
  }

  class BaseRepository {
    /** @param {string} collectionName Tên collection Firestore */
    constructor(collectionName) {
      this.collectionName = collectionName;
    }

    /** @returns {firebase.firestore.CollectionReference} */
    col() {
      if (!global.EduFirebase || !global.EduFirebase.db) {
        throw new Error('[EduRepository] Firestore chưa sẵn sàng (thiếu firebase-config.js).');
      }
      return global.EduFirebase.db.collection(this.collectionName);
    }

    async getById(id) {
      const snap = await this.col().doc(id).get();
      meter(`${this.collectionName}/${id}`, snap);
      return snap.exists ? Object.assign({ id: snap.id }, snap.data()) : null;
    }

    /**
     * @param {Object} options
     * @param {Array<[string,firebase.firestore.WhereFilterOp,*]>} [options.where]
     * @param {string} [options.orderBy]
     * @param {'asc'|'desc'} [options.direction]
     * @param {number} [options.limit]
     */
    async list(options = {}) {
      if (options.cacheMs > 0 && global.EduDataCache) return this._listShared(options);
      let q = this.col();
      (options.where || []).forEach(([field, op, value]) => { q = q.where(field, op, value); });
      if (options.orderBy) q = q.orderBy(options.orderBy, options.direction || 'asc');
      const appliedLimit = options.limit || DEFAULT_LIST_LIMIT;
      q = q.limit(appliedLimit);
      const snap = await q.get();
      // SDK đang offline (mất mạng HOẶC hết lượt đọc trong ngày — SDK coi
      // resource-exhausted là lỗi tạm thời và tự chuyển offline) thì get() KHÔNG
      // báo lỗi mà trả về những gì còn trong cache máy, thường là RỖNG/THIẾU.
      // Trả lỗi thay vì trả mảng thiếu: nơi gọi sẽ dùng cache của chính nó (IndexedDB)
      // — tránh lưu nhầm "roster rỗng" vào cache rồi hiện trống suốt 12 giờ.
      if (snap.metadata && snap.metadata.fromCache) {
        const err = new Error(`[EduRepository] list('${this.collectionName}') không lấy được từ máy chủ (offline / hết lượt đọc).`);
        err.code = 'unavailable';
        throw err;
      }
      meter(this.collectionName, snap);
      // Số bản ghi trả về CHẠM ĐÚNG trần đã áp (nhất là khi trần là
      // DEFAULT_LIST_LIMIT ngầm định, không phải limit cố ý của caller) rất
      // có thể là dấu hiệu bị CẮT BỚT (collection còn nhiều hơn) chứ không
      // phải trùng hợp — cảnh báo ra console để không âm thầm thiếu dữ liệu
      // mà không ai biết, thay vì phải đoán sau này.
      if (snap.docs.length === appliedLimit) {
        console.warn(`[EduRepository] list('${this.collectionName}') trả về đúng ${appliedLimit} bản ghi (chạm trần limit) — có thể còn dữ liệu bị cắt bớt, cân nhắc truyền limit cao hơn hoặc phân trang.`);
      }
      return snap.docs.map((doc) => Object.assign({ id: doc.id }, doc.data()));
    }

    _listKey(options) {
      return 'repo:' + this.collectionName + ':' + JSON.stringify([options.where || [], options.orderBy || '', options.direction || '', options.limit || 0]);
    }

    /** Phiên bản hiện tại của collection — lấy TRƯỚC khi đọc rồi đưa vào prime()/bản đệm (ghi xen giữa → bản đó tự bị coi là cũ). */
    versionToken() { return verOf(this.collectionName); }

    /**
     * Mồi bản đệm list({ cacheMs }) bằng dữ liệu vừa đọc ở truy vấn KHÁC nhưng chắc chắn cùng kết quả (vd lọc từ danh sách
     * đầy đủ) — trang sau hỏi đúng điều kiện đó khỏi đọc lại. ver: versionToken() lấy trước lần đọc gốc.
     */
    prime(options, docs, cacheMs, ver) {
      if (!global.EduDataCache || !(cacheMs > 0) || !Array.isArray(docs)) return;
      global.EduDataCache.setAsync(this._listKey(options), { ver: ver === undefined ? verOf(this.collectionName) : ver, docs }, cacheMs, true);
    }

    /**
     * Giá trị dẫn xuất từ collection này (vd bảng Mã NV → uid), lưu cacheMs và bỏ ngay khi máy này ghi vào collection
     * (cùng cơ chế phiên bản với list({ cacheMs })). Máy khác ghi: thấy sau tối đa cacheMs. loader() lỗi → không lưu.
     */
    async cachedValue(name, cacheMs, loader) {
      if (!(cacheMs > 0) || !global.EduDataCache) return loader();
      const key = 'repo:' + this.collectionName + ':value:' + name;
      const ver = verOf(this.collectionName);
      const C = global.EduDataCache;
      const hit = await C.getAsync(key, true);
      if (hit && hit.ver === ver && 'value' in hit) return hit.value;
      const run = async () => { // nhiều tab cùng lúc → 1 tab dựng, tab khác dùng lại (xem list cacheMs)
        const again = await C.getAsync(key, true);
        if (again && again.ver === verOf(this.collectionName) && 'value' in again) return again.value;
        const value = await loader();
        await C.setAsync(key, { ver, value }, cacheMs, true);
        return value;
      };
      return C.exclusive ? C.exclusive(key, run) : run();
    }

    async _listShared(options) {
      const col = this.collectionName;
      const key = this._listKey(options);
      const ver = verOf(col); // lấy TRƯỚC khi đọc: ghi xen giữa → bản này tự bị coi là cũ ở lần sau
      if (!options.refresh) {
        const hit = await global.EduDataCache.getAsync(key, true);
        if (hit && hit.ver === ver && Array.isArray(hit.docs)) return hit.docs;
      }
      const flightKey = key + '|' + ver;
      if (inflightLists.has(flightKey)) return inflightLists.get(flightKey);
      // Nhiều TAB cùng hỏi khi bản đệm trống (mở dồn, 08/11/2026): khoá theo khoá đệm, tab đến sau kiểm lại bản đệm sau khi
      // có khoá. refresh: chỉ nhận bản đọc SAU lúc hỏi (tab khác vừa đọc mới cho mình rồi). Lưu xong mới nhả khoá.
      const asked = Date.now();
      const C = global.EduDataCache;
      const lock = C.exclusive ? (fn) => C.exclusive(key, fn) : (fn) => fn();
      const p = lock(async () => {
        const hit = await C.getAsync(key, true);
        if (hit && hit.ver === verOf(col) && Array.isArray(hit.docs) && (!options.refresh || (hit.at || 0) > asked)) return hit.docs;
        const docs = await this.list(Object.assign({}, options, { cacheMs: 0 }));
        await C.setAsync(key, { ver, docs, at: Date.now() }, options.cacheMs, true);
        return docs;
      }).finally(() => inflightLists.delete(flightKey));
      inflightLists.set(flightKey, p);
      return p;
    }

    /** Bỏ mọi bản đệm list({ cacheMs }) của collection này — gọi ở nơi ghi THẲNG Firestore (không qua repository). */
    invalidate() { bumpVer(this.collectionName); }

    async create(data) {
      try {
        const ref = await this.col().add(toStore(data));
        return ref.id;
      } finally { this.invalidate(); }
    }

    /** Tạo với ID chỉ định trước (vd. dùng MSSV làm ID cho roster). */
    async createWithId(id, data) {
      try {
        await this.col().doc(id).set(toStore(data));
        return id;
      } finally { this.invalidate(); }
    }

    async update(id, partialData) {
      try {
        await this.col().doc(id).update(toStore(partialData));
      } finally { this.invalidate(); }
    }

    /** Tạo mới nếu chưa có, cập nhật nếu đã có (dựa theo id). */
    async upsert(id, data) {
      try {
        await this.col().doc(id).set(toStore(data), { merge: true });
      } finally { this.invalidate(); }
    }

    /**
     * Ghi nhiều tài liệu (có thể thuộc nhiều repository) theo lô ≤ 450 thao tác — trang giao diện
     * KHÔNG tự dựng db.batch(). items: [{ repo, id, data, merge? }]. Trả số tài liệu đã ghi.
     */
    static async commitBatch(items) {
      const db = global.EduFirebase && global.EduFirebase.db;
      if (!db) throw new Error('[EduRepository] Firestore chưa sẵn sàng (thiếu firebase-config.js).');
      const touched = new Set(items.map((w) => w.repo.collectionName));
      try {
        for (let i = 0; i < items.length; i += BATCH_MAX) {
          const batch = db.batch();
          items.slice(i, i + BATCH_MAX).forEach((w) => {
            const ref = w.repo.col().doc(w.id);
            if (w.merge) batch.set(ref, toStore(w.data), { merge: true }); else batch.set(ref, toStore(w.data));
          });
          await batch.commit();
        }
      } finally { touched.forEach((c) => bumpVer(c)); }
      return items.length;
    }

    async remove(id) {
      try {
        await this.col().doc(id).delete();
      } finally { this.invalidate(); }
    }
  }

  BaseRepository.toStore = toStore;
  global.EduBaseRepository = BaseRepository;
})(window);
