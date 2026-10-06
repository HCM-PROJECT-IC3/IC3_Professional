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

  /** In "[trang] N lượt đọc Firestore — <nhãn>" (xem countSnap() trong firebase-config.js). */
  function meter(label, snap) {
    if (global.EduFirebase && global.EduFirebase.countSnap) global.EduFirebase.countSnap(label, snap);
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

    async create(data) {
      const ref = await this.col().add(data);
      return ref.id;
    }

    /** Tạo với ID chỉ định trước (vd. dùng MSSV làm ID cho roster). */
    async createWithId(id, data) {
      await this.col().doc(id).set(data);
      return id;
    }

    async update(id, partialData) {
      await this.col().doc(id).update(partialData);
    }

    /** Tạo mới nếu chưa có, cập nhật nếu đã có (dựa theo id). */
    async upsert(id, data) {
      await this.col().doc(id).set(data, { merge: true });
    }

    async remove(id) {
      await this.col().doc(id).delete();
    }
  }

  global.EduBaseRepository = BaseRepository;
})(window);
