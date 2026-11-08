/* ============================================================
   js/repositories/user-repository.js
   Repository cho collection "users" (hồ sơ + vai trò, id = uid Firebase Auth).
   Gom các truy vấn trước đây viết lặp ở admin-users.js, roster-manager.js,
   teaching-schedule.js, coordinator/data-loader.js.

   js/auth.js vẫn đọc/ghi hồ sơ của CHÍNH người đăng nhập trực tiếp — nó nạp
   trên cả login.html, nơi không có tầng repository.

   Quyền thật nằm ở firestore.rules § users: chỉ Admin list toàn bộ; giáo
   viên/điều phối chỉ list được đúng query role == teacher && approved == true.

   Nạp sau js/models/school.model.js.
   ============================================================ */
(function (global) {
  'use strict';

  const USERS_COLLECTION = 'users';
  // Trần của rules (request.query.limit <= 1000).
  const MAX_LIST = 1000;
  const LOOKUP_CACHE_MS = 10 * 60 * 1000;
  const APPROVED_QUERY = { where: [['role', '==', 'teacher'], ['approved', '==', true]], limit: MAX_LIST };

  class UserRepository extends global.EduBaseRepository {
    constructor() { super(USERS_COLLECTION); }

    /** Mọi tài khoản, mới tạo trước — chỉ Admin (admin-users.html). */
    async listAll() {
      const ver = this.versionToken();
      const all = await this.list({ orderBy: 'createdAt', direction: 'desc', limit: MAX_LIST });
      // Đã có đủ giáo viên đã duyệt trong tay → mồi bản đệm của listApprovedTeachers(): Admin mở Quản lý tài khoản rồi
      // Quản lý lớp/Dashboard khỏi đọc lại ~100 lượt (đo 08/11/2026). Chạm trần MAX_LIST = có thể thiếu → không mồi.
      // Thứ tự theo id = thứ tự Firestore trả cho truy vấn không orderBy.
      if (all.length < MAX_LIST) {
        const approved = all.filter((u) => u.role === 'teacher' && u.approved === true)
          .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
        this.prime(APPROVED_QUERY, approved, LOOKUP_CACHE_MS, ver);
      }
      return all;
    }

    /** Giáo viên đã duyệt — query DUY NHẤT rules cho phép giáo viên/điều phối list. */
    async listApprovedTeachers(opts = {}) {
      // Bản đệm dùng chung 10 phút (Quản lý lớp, Dashboard điều phối, Lịch dạy cùng đọc danh sách này); duyệt/đổi vai trò qua
      // repository bỏ bản đệm ngay. opts.refresh = bỏ qua bản đệm (nút "Tải lại").
      return this.list(Object.assign({}, APPROVED_QUERY, { cacheMs: LOOKUP_CACHE_MS, refresh: !!opts.refresh }));
    }

    /**
     * Map Mã NV (teacherCode) → uid, chỉ giáo viên đã liên kết mã.
     * opts.cacheMs: giữ bảng lâu hơn danh sách giáo viên (Lịch dạy chỉ dùng để hiện ảnh đại diện) — ghi users ở máy này
     * vẫn bỏ ngay; máy khác gán mã mới thì ảnh hiện sau tối đa cacheMs.
     */
    async teacherCodeToUid(opts = {}) {
      return this.cachedValue('teacherCodeToUid', opts.cacheMs, async () => {
        const map = {};
        (await this.listApprovedTeachers()).forEach((u) => { if (u.teacherCode) map[u.teacherCode] = u.id; });
        return map;
      });
    }

    /** Admin đổi vai trò — đổi vai trò luôn kèm duyệt. */
    async setRole(uid, role) {
      await this.upsert(uid, { role, approved: true });
    }

    /** "Trường được xem" (users/{uid}.schools) — rules dùng để lọc kết quả/roster. */
    async setSchools(uid, schools) {
      await this.upsert(uid, UserRepository.schoolsPatch(schools));
    }

    /** Ghi "schools" (tên) luôn kèm "schoolIds" (slug) — rules chấp nhận cả hai khi chuyển tiếp. */
    static schoolsPatch(schools) {
      return { schools, schoolIds: global.EduModels.School.schoolIdsOf(schools) };
    }

    /** Liên kết Mã NV Lịch giảng dạy; mã rỗng → xoá field. */
    async setTeacherCode(uid, code) {
      await this.upsert(uid, { teacherCode: code || firebase.firestore.FieldValue.delete() });
    }
  }

  global.EduRepositories = global.EduRepositories || {};
  global.EduRepositories.user = new UserRepository();
  global.EduRepositories.UserRepository = UserRepository;
})(window);
