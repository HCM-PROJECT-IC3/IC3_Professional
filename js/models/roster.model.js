/* ============================================================
   js/models/roster.model.js
   Model bổ sung NỀN TẢNG (không nằm trong 6 model được liệt kê ban
   đầu, nhưng bắt buộc phải có): Student / Class / Course thật.

   LÝ DO CẦN THÊM: quiz_results hiện tại là bản ghi ẨN DANH theo từng
   LƯỢT làm bài — hệ thống không biết trước "lớp 6A có những học sinh
   nào" nên không thể tính "học sinh CHƯA làm bài". Roster là danh sách
   học sinh THẬT do Điều phối đào tạo / Giáo viên quản lý, độc lập với
   luồng làm bài ẩn danh hiện tại (không đổi index.html/quiz-engine.js).

   3 collection MỚI:
   - "courses"  : { id, name, level("thcs"|"tieu_hoc"), createdAt }
   - "classes"  : { id, name, courseId, teacherId, teacherName, studentCount, createdAt }
   - "students_roster" : { id (mssv hoặc auto), mssv, name, className,
       school, classId, teacherId, teacherName, avatarUrl, status, createdAt }

   TRƯỜNG (school): chuỗi tự do do Điều phối đào tạo nhập tay hoặc import
   từ Excel — dùng để lọc 3 select (Trường → Lớp → Tên) ở form làm bài
   index.html (xem js/lobby-roster.js). Không phải collection riêng vì
   1 Điều phối có thể quản lý học sinh của nhiều trường khác nhau.

   Đối chiếu với quiz_results: dùng studentName + studentClass (chuẩn
   hoá lowercase/trim) làm khoá nối tạm thời — xem
   exam-history.model.js -> keyOf(). Khi học sinh có MSSV, khuyến
   nghị yêu cầu nhập MSSV ở form làm bài (cải tiến KHÔNG bắt buộc,
   để riêng 1 commit sau).
   ============================================================ */
(function (global) {
  'use strict';

  const COURSES_COLLECTION = 'courses';
  const CLASSES_COLLECTION = 'classes';
  const STUDENTS_COLLECTION = 'students_roster';

  const STUDENT_STATUS = Object.freeze({
    ACTIVE: 'active',
    INACTIVE: 'inactive',
  });

  /** Khoá đối chiếu với StudentResult.studentName/studentClass. Phải khớp exam-history.model.js!keyOf */
  function studentKeyOf({ name, className }) {
    return `${(name || '').trim().toLowerCase()}__${(className || '').trim().toLowerCase()}`;
  }

  function buildStudent({ mssv, name, className, school, classId, teacherId, teacherName, avatarUrl }) {
    return {
      mssv: mssv || '',
      name: name || '',
      className: className || '',
      school: school || '',
      classId: classId || '',
      teacherId: teacherId || '',
      teacherName: teacherName || '',
      avatarUrl: avatarUrl || '',
      status: STUDENT_STATUS.ACTIVE,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    };
  }

  global.EduModels = global.EduModels || {};
  global.EduModels.Roster = {
    COURSES_COLLECTION,
    CLASSES_COLLECTION,
    STUDENTS_COLLECTION,
    STUDENT_STATUS,
    studentKeyOf,
    buildStudent,
  };
})(window);
