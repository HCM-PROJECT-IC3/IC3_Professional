/* ============================================================
   js/repositories/school-repository.js
   Repository cho danh mục trường (collection "schools", id = schoolId).
   Nạp sau js/models/school.model.js.
   ============================================================ */
(function (global) {
  'use strict';

  const S = global.EduModels.School;

  // Field Quản trị trường được sửa — khớp firestore.rules § schools (affectedKeys().hasOnly).
  const INFO_FIELDS = ['address', 'phone', 'contactName', 'note'];

  // schoolId đã có trong danh mục (theo máy). Trường chỉ thêm, không xoá → nhớ lâu không sai.
  const KNOWN_KEY = 'schools:knownIds:v1';
  function readKnownIds() {
    try { return new Set(JSON.parse(localStorage.getItem(KNOWN_KEY)) || []); } catch (e) { return new Set(); }
  }
  function saveKnownIds(ids) {
    try { localStorage.setItem(KNOWN_KEY, JSON.stringify(ids)); } catch (e) { /* chế độ riêng tư: lần sau đọc lại */ }
  }

  class SchoolRepository extends global.EduBaseRepository {
    constructor() { super(S.SCHOOLS_COLLECTION); }

    /** Toàn bộ danh mục (vài chục trường), sắp theo tên. */
    async listAll() {
      const list = await this.list({ limit: 1000 });
      return list.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'vi'));
    }

    /** Sửa thông tin liên hệ — bỏ field ngoài INFO_FIELDS, cắt 500 ký tự. */
    async updateInfo(schoolId, info) {
      const patch = { updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
      INFO_FIELDS.forEach((k) => { if (k in info) patch[k] = String(info[k] || '').trim().slice(0, 500); });
      await this.update(schoolId, patch);
      return patch;
    }

    /** Admin: ngừng / hoạt động lại (không xoá — dữ liệu cũ vẫn trỏ tới schoolId). */
    async setStatus(schoolId, status) {
      if (!Object.values(S.SCHOOL_STATUS).includes(status)) throw new Error('Trạng thái không hợp lệ: ' + status);
      await this.update(schoolId, { status, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
    }

    /**
     * Tạo document cho các tên trường CHƯA có trong danh mục (so theo schoolId).
     * Không sửa trường đã có — đổi tên trường cũ không làm đổi schoolId.
     * @param {string[]} names tên trường đang dùng (roster, hồ sơ giáo viên...)
     * @returns {Promise<string[]>} schoolId vừa tạo
     */
    async ensureFromNames(names) {
      // Máy này đã biết đủ các trường → khỏi đọc lại cả danh mục mỗi lần tải danh sách trường.
      const ids = [...new Set((names || []).map((n) => S.schoolIdOf(String(n || '').trim())).filter(Boolean))];
      const known = readKnownIds();
      if (ids.every((id) => known.has(id))) return [];
      const existing = new Set((await this.list({ limit: 1000 })).map((s) => s.id));
      const byId = new Map();
      (names || []).forEach((name) => {
        const clean = String(name || '').trim();
        const id = S.schoolIdOf(clean);
        if (id && !existing.has(id) && !byId.has(id)) byId.set(id, clean);
      });
      if (byId.size) {
        const batch = global.EduFirebase.db.batch();
        const now = firebase.firestore.FieldValue.serverTimestamp();
        byId.forEach((name, id) => {
          batch.set(this.col().doc(id), { name, status: S.SCHOOL_STATUS.ACTIVE, createdAt: now, updatedAt: now });
        });
        await batch.commit();
      }
      saveKnownIds([...existing, ...byId.keys()]);
      return [...byId.keys()];
    }
  }

  global.EduRepositories = global.EduRepositories || {};
  global.EduRepositories.school = new SchoolRepository();
  global.EduRepositories.school.INFO_FIELDS = INFO_FIELDS;
})(window);
