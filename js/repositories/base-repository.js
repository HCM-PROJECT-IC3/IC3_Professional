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
      if (options.limit) q = q.limit(options.limit);
      const snap = await q.get();
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
