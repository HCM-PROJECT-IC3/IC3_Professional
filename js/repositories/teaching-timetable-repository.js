/* ============================================================
   js/repositories/teaching-timetable-repository.js
   2 repository nhỏ cho tab "🗓️ TKB lớp" — cùng mô hình BaseRepository
   với js/repositories/teaching-schedule-repository.js.
   ============================================================ */
(function (global) {
  'use strict';

  const M = global.EduModels.TeachingTimetable;

  class TeachingPeriodTimesRepository extends global.EduBaseRepository {
    constructor() { super(M.PERIOD_TIMES_COLLECTION); }
  }

  class TeachingTimetableRepository extends global.EduBaseRepository {
    constructor() { super(M.TIMETABLE_COLLECTION); }
    async listByWeek(weekKey) {
      return this.list({ where: [['weekKey', '==', weekKey]] });
    }
    /** Toàn bộ TKB lớp CỦA 1 GIÁO VIÊN qua MỌI tuần — dùng để gợi ý "Trường"/
     * "Mã lớp" đã dùng trước đó (xem gợi ý datalist trong teaching-timetable.js),
     * không giới hạn theo tuần đang xem. */
    async listByTeacher(teacherCode) {
      return this.list({ where: [['teacherCode', '==', teacherCode]] });
    }
  }

  global.EduRepositories = global.EduRepositories || {};
  global.EduRepositories.teachingPeriodTimes = new TeachingPeriodTimesRepository();
  global.EduRepositories.teachingTimetable = new TeachingTimetableRepository();
})(window);
