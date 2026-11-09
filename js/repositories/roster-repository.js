/* ============================================================
   js/repositories/roster-repository.js
   3 repository nhỏ cho 3 collection MỚI: courses / classes / students_roster.
   Gộp chung 1 file vì đều nhỏ và luôn dùng cùng nhau (1 course có
   nhiều class, 1 class có nhiều student).
   ============================================================ */
(function (global) {
  'use strict';

  const R = global.EduModels.Roster;

  class CourseRepository extends global.EduBaseRepository {
    constructor() { super(R.COURSES_COLLECTION); }
  }

  // Lớp có field "school" → mọi lần ghi kèm schoolId (js/models/school.model.js).
  const withSchoolId = (data) => global.EduModels.School.withSchoolId(data);

  class ClassRepository extends global.EduBaseRepository {
    constructor() { super(R.CLASSES_COLLECTION); }
    create(data) { return super.create(withSchoolId(data)); }
    createWithId(id, data) { return super.createWithId(id, withSchoolId(data)); }
    update(id, partialData) { return super.update(id, withSchoolId(partialData)); }
    upsert(id, data) { return super.upsert(id, withSchoolId(data)); }
    async listByTeacher(teacherId) {
      return this.list({ where: [['teacherId', '==', teacherId]] });
    }
    async listByCourse(courseId) {
      return this.list({ where: [['courseId', '==', courseId]] });
    }

    /**
     * Lớp cho trang quản lý (10/11/2026). schools = trường được gán của Điều phối/Quản trị trường → chỉ lớp các trường đó
     * (where school in, ≤ 10 trường/truy vấn, KHÔNG orderBy để khỏi cần composite index — sắp theo tên ở đây).
     * Trước đây mọi nhân sự trường đọc CẢ collection (đo: 150 lượt/ngày/người cho ~4 lớp cần dùng) và Quản lý lớp hiện
     * lớp của trường khác kèm nút Sửa/Xoá. schools null/undefined (Admin) → mọi lớp, như cũ; [] (chưa gán trường) → [].
     * opts: { cacheMs, refresh }.
     */
    async listForSchools(schools, opts = {}) {
      const base = { cacheMs: opts.cacheMs, refresh: !!opts.refresh };
      if (schools == null) return this.list(Object.assign({ orderBy: 'name' }, base));
      if (!Array.isArray(schools) || !schools.length) return [];
      const parts = [];
      for (let i = 0; i < schools.length; i += 10) parts.push(schools.slice(i, i + 10));
      const lists = await Promise.all(parts.map((part) => this.list(Object.assign({ where: [['school', 'in', part]] }, base))));
      const byId = new Map();
      lists.flat().forEach((c) => byId.set(c.id, c));
      return [...byId.values()].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'vi'));
    }
  }

  class StudentRosterRepository extends global.EduBaseRepository {
    constructor() { super(R.STUDENTS_COLLECTION); }

    async listByClass(classId) {
      return this.list({ where: [['classId', '==', classId]] });
    }

    /**
     * Học sinh "Đang học" (status active) do ĐÚNG giáo viên `teacherId` (uid
     * tài khoản, không phải mã NV Lịch giảng dạy) phụ trách — dùng cho
     * teacher-dashboard.html (đợt siết quyền theo teacherId): TRƯỚC
     * ĐÂY trang này lọc theo listBySchools() (cả trường), khiến 1 giáo viên
     * nhìn thấy CẢ học sinh của đồng nghiệp dạy chung trường — đã sửa để
     * chỉ trả về đúng lớp giáo viên này phụ trách, khớp firestore.rules
     * (canAccessRosterStudent() chỉ so khớp teacherId, không cần "school
     * in [...]" nữa) — 2 điều kiện == đơn (teacherId + status) không cần
     * composite index (khác where('in',...) trước đây).
     */
    async listByTeacher(teacherId) {
      return this.list({ where: [['teacherId', '==', teacherId], ['status', '==', 'active']] });
    }

    /**
     * Học sinh đang học ("active") thuộc 1 trong các trường truyền vào.
     * Dùng cho teacher-dashboard.html — BẮT BUỘC truyền
     * đúng "schools" đã được Admin gán cho giáo viên (users/{uid}.schools),
     * vì firestore.rules chỉ cho giáo viên đọc document "school" nằm trong
     * danh sách đó; where('in', ...) tối đa 10 giá trị.
     */
    async listBySchools(schools) {
      if (!schools || !schools.length) return [];
      return this.list({
        where: [['status', '==', R.STUDENT_STATUS.ACTIVE], ['school', 'in', schools.slice(0, 10)]],
      });
    }

    /**
     * Học sinh CHƯA làm bài = có trong roster nhưng studentKey không xuất
     * hiện trong tập kết quả (submittedKeys) truyền vào.
     * @param {Set<string>} submittedKeys tập studentKey đã lấy từ ExamHistory
     */
    async listNotSubmitted(submittedKeys) {
      const all = await this.list({ where: [['status', '==', R.STUDENT_STATUS.ACTIVE]] });
      return all.filter((s) => !submittedKeys.has(R.studentKeyOf({ name: s.name, className: s.className })));
    }
  }

  global.EduRepositories = global.EduRepositories || {};
  global.EduRepositories.course = new CourseRepository();
  global.EduRepositories.class = new ClassRepository();
  global.EduRepositories.studentRoster = new StudentRosterRepository();
})(window);
