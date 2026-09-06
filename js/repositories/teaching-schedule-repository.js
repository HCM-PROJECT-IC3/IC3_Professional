/* ============================================================
   js/repositories/teaching-schedule-repository.js
   3 repository nhỏ cho tính năng "📅 Lịch giảng dạy" — cùng mô hình với
   js/repositories/roster-repository.js (BaseRepository + query riêng).
   ============================================================ */
(function (global) {
  'use strict';

  const M = global.EduModels.TeachingSchedule;

  class TeachingTeacherRepository extends global.EduBaseRepository {
    constructor() { super(M.TEACHERS_COLLECTION); }
    async listActive() {
      return this.list({ where: [['active', '==', true]], orderBy: 'name' });
    }
  }

  class TeachingWeekRepository extends global.EduBaseRepository {
    constructor() { super(M.WEEKS_COLLECTION); }
    async listAll() {
      // id (weekKey) dạng "YYYY-MM-DD" → sắp theo id cũng chính là sắp theo
      // thời gian, không cần field ngày riêng.
      const rows = await this.list();
      return rows.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    }
  }

  class TeachingScheduleRepository extends global.EduBaseRepository {
    constructor() { super(M.SCHEDULE_COLLECTION); }
    async listByWeek(weekKey) {
      return this.list({ where: [['weekKey', '==', weekKey]] });
    }
    async listByTeacher(teacherCode) {
      return this.list({ where: [['teacherCode', '==', teacherCode]], orderBy: 'weekKey' });
    }
  }

  global.EduRepositories = global.EduRepositories || {};
  global.EduRepositories.teachingTeacher = new TeachingTeacherRepository();
  global.EduRepositories.teachingWeek = new TeachingWeekRepository();
  global.EduRepositories.teachingSchedule = new TeachingScheduleRepository();
})(window);
