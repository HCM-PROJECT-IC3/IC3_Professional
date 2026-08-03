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

  class ClassRepository extends global.EduBaseRepository {
    constructor() { super(R.CLASSES_COLLECTION); }
    async listByTeacher(teacherId) {
      return this.list({ where: [['teacherId', '==', teacherId]] });
    }
    async listByCourse(courseId) {
      return this.list({ where: [['courseId', '==', courseId]] });
    }
  }

  class StudentRosterRepository extends global.EduBaseRepository {
    constructor() { super(R.STUDENTS_COLLECTION); }

    async listByClass(classId) {
      return this.list({ where: [['classId', '==', classId]] });
    }

    async listByTeacher(teacherId) {
      return this.list({ where: [['teacherId', '==', teacherId]] });
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
