/* ============================================================
   js/repositories/teaching-travel-repository.js
   Repository cho tab "🚗 Hỗ trợ xăng xe" — cùng mô hình BaseRepository với
   js/repositories/teaching-schedule-repository.js.
   ============================================================ */
(function (global) {
  'use strict';

  const M = global.EduModels.TeachingTravel;

  class TeachingTravelDistanceRepository extends global.EduBaseRepository {
    constructor() { super(M.TRAVEL_DISTANCES_COLLECTION); }
    /** Toàn bộ khoảng cách đã nhập của MỌI giáo viên — dùng khi tính hỗ
     * trợ cho cả tuần (nhiều giáo viên cùng lúc), tránh gọi getById() lặp
     * lại từng người. */
    async listAll() { return this.list(); }
    /** Cập nhật/gộp thêm 1 mục "trường: km" vào đúng document của 1 giáo
     * viên — upsert() có merge:true nên Firestore tự gộp SÂU vào map
     * `schools` đã có (không xoá mất các trường khác đã nhập trước đó khi
     * chỉ sửa 1 ô). */
    async setSchoolDistance(teacherCode, schoolName, km) {
      await this.upsert(teacherCode, {
        schools: { [schoolName]: km },
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
    }
  }

  global.EduRepositories = global.EduRepositories || {};
  global.EduRepositories.teachingTravelDistance = new TeachingTravelDistanceRepository();
})(window);
