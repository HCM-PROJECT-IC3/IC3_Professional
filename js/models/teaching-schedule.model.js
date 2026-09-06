/* ============================================================
   js/models/teaching-schedule.model.js
   Model cho tính năng "📅 Lịch giảng dạy" (teaching-schedule.html) —
   quản lý lịch làm việc/giảng dạy hàng tuần của đội ngũ giáo viên,
   thay thế việc quản lý thủ công trên file Excel
   "LỊCH GIẢNG DẠY TEAM GVTH_NH ....xlsx".

   NGUỒN GỐC CẤU TRÚC DỮ LIỆU: suy ra trực tiếp từ file Excel mẫu người
   dùng cung cấp (không phải tự bịa) — mỗi tuần là 1 sheet, mỗi giáo viên
   chiếm 1 khối 14 dòng: 2 buổi (Sáng/Chiều) × (1 dòng "loại hình phụ
   trách" + 1 dòng "địa điểm giảng dạy" + 5 dòng "tiết 1-5" chứa tên lớp).
   Cột "loại hình phụ trách" là 1 dropdown cố định (đọc được từ
   <dataValidation> trong file gốc) — xem TASK_TYPES bên dưới, PHẢI khớp
   nguyên văn với file Excel để khi nhập/xuất lại không bị lệch.

   3 collection Firestore:
   - "teaching_teachers" : { id (=mã NV, vd "HCM0092"), code, name, phone,
       address, active, createdAt }
   - "teaching_weeks"    : { id (=weekKey "YYYY-MM-DD" của thứ Hai đầu
       tuần), label (vd "7.9 - 12.9.2026"), createdAt }
   - "teaching_schedule" : { id (=`${teacherCode}__${weekKey}`), teacherCode,
       teacherName, weekKey, weekLabel, days: { "2".."7": DaySchedule },
       updatedAt }
     DaySchedule = { morning: Session, afternoon: Session }
     Session     = { type: TASK_TYPES[n]|'', location: string, periods: [p1..p5] }
     (periods[i] = true nếu CÓ dạy tiết i+1, false/'' nếu không dạy — nhập
     bằng tích chọn (checkbox), không gõ tên lớp nữa. Dữ liệu CŨ nhập từ
     Excel có thể vẫn là tên lớp dạng chuỗi khác rỗng — mọi nơi đọc periods
     chỉ nên dùng "truthy" (!!p), KHÔNG so sánh === true, để tương thích
     ngược với dữ liệu đó.)
   ============================================================ */
(function (global) {
  'use strict';

  const TEACHERS_COLLECTION = 'teaching_teachers';
  const WEEKS_COLLECTION = 'teaching_weeks';
  const SCHEDULE_COLLECTION = 'teaching_schedule';

  // Nguyên văn danh sách <dataValidation> trong file Excel gốc — KHÔNG tự ý
  // đổi thứ tự/chính tả, vì khi xuất lại Excel (tính năng tương lai) hoặc
  // đối chiếu dữ liệu cũ phải khớp domain giá trị đã có.
  const TASK_TYPES = Object.freeze([
    'Dạy chính',
    'Dạy Trám',
    'Dạy Trực Tuyến',
    'Ôn Thi',
    'Trợ Giảng',
    'Dự Giảng',
    'Soạn bài',
    'Làm việc tại cty',
    'WFH',
    'Khám SK',
    'Nghỉ phép/ lễ',
  ]);

  // Thứ tự hiển thị Thứ 2 → Thứ 7 (Excel không có Chủ nhật trong lịch này).
  const WEEKDAYS = Object.freeze([2, 3, 4, 5, 6, 7]);
  const WEEKDAY_LABELS = Object.freeze({ 2: 'Thứ 2', 3: 'Thứ 3', 4: 'Thứ 4', 5: 'Thứ 5', 6: 'Thứ 6', 7: 'Thứ 7' });
  const SESSIONS = Object.freeze(['morning', 'afternoon']);
  const SESSION_LABELS = Object.freeze({ morning: 'Sáng', afternoon: 'Chiều' });
  const PERIODS_PER_SESSION = 5;

  function emptySession() {
    return { type: '', location: '', periods: ['', '', '', '', ''] };
  }
  function emptyDay() {
    return { morning: emptySession(), afternoon: emptySession() };
  }
  /** Khung ngày trống đủ 7 (Thứ2→7) cho 1 giáo viên/tuần mới tinh. */
  function emptyDays() {
    const days = {};
    WEEKDAYS.forEach((d) => { days[String(d)] = emptyDay(); });
    return days;
  }

  function scheduleDocId(teacherCode, weekKey) {
    return `${teacherCode}__${weekKey}`;
  }

  /**
   * Tính "THỐNG KÊ THEO TUẦN" cho 1 giáo viên — mô phỏng ĐÚNG các công
   * thức thống kê trong file Excel gốc, tính trực tiếp từ dữ liệu "days"
   * (không lưu số liệu tĩnh vào Firestore) để không bao giờ bị lệch/cũ
   * so với dữ liệu thật.
   */
  function computeWeekStats(days) {
    const locSet = { 'Dạy chính': new Set(), 'Dạy Trám': new Set() };
    let periodsMain = 0, periodsSub = 0, periodsReview = 0;
    let sessionsPrep = 0, sessionsOffice = 0, sessionsMentor = 0;
    const reviewLocSet = new Set();

    WEEKDAYS.forEach((d) => {
      const day = (days && days[String(d)]) || emptyDay();
      SESSIONS.forEach((s) => {
        const sess = day[s] || emptySession();
        // periods[i] giờ là boolean (tích/không tích) — nhưng dữ liệu CŨ
        // nhập từ Excel có thể vẫn là chuỗi tên lớp, nên chỉ xét "truthy"
        // (!!p), TUYỆT ĐỐI không gọi .trim() vì boolean không có hàm đó.
        const taughtPeriods = (sess.periods || []).filter((p) => !!p).length;
        if (sess.type === 'Dạy chính') {
          if (sess.location) locSet['Dạy chính'].add(sess.location);
          periodsMain += taughtPeriods;
        } else if (sess.type === 'Dạy Trám') {
          if (sess.location) locSet['Dạy Trám'].add(sess.location);
          periodsSub += taughtPeriods;
        } else if (sess.type === 'Ôn Thi' || sess.type === 'Dạy Trực Tuyến') {
          if (sess.location) reviewLocSet.add(sess.location);
          periodsReview += taughtPeriods;
        } else if (sess.type === 'Soạn bài') {
          sessionsPrep++;
        } else if (sess.type === 'Làm việc tại cty') {
          sessionsOffice++;
        } else if (sess.type === 'Trợ Giảng' || sess.type === 'Dự Giảng') {
          sessionsMentor++;
        }
      });
    });

    return {
      schoolsMain: locSet['Dạy chính'].size,
      periodsMain,
      schoolsSub: locSet['Dạy Trám'].size,
      periodsSub,
      schoolsReview: reviewLocSet.size,
      periodsReview,
      sessionsPrep,
      sessionsOffice,
      sessionsMentor,
    };
  }

  function buildTeacher({ code, name, phone, address }) {
    return {
      code: (code || '').trim(),
      name: (name || '').trim(),
      phone: (phone || '').trim(),
      address: (address || '').trim(),
      active: true,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    };
  }

  function buildWeek({ label }) {
    return {
      label: (label || '').trim(),
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    };
  }

  /** Suy ra nhãn hiển thị "dd.mm - dd.mm.yyyy" (Thứ2→Thứ7) từ ngày Thứ 2
   * đầu tuần (chuỗi "YYYY-MM-DD" của input type=date) — dùng khi tạo tuần
   * mới thủ công (nút "🧬 Tuần mới"), tự gợi ý nhãn giống format của file
   * Excel gốc để không phải gõ tay. */
  function labelFromMonday(mondayStr) {
    const d = new Date(`${mondayStr}T00:00:00`);
    if (Number.isNaN(d.getTime())) return mondayStr;
    const sat = new Date(d);
    sat.setDate(d.getDate() + 5);
    const fmt = (x) => `${x.getDate()}.${x.getMonth() + 1}`;
    return `${fmt(d)} - ${fmt(sat)}.${sat.getFullYear()}`;
  }

  /** weekKey (Thứ 2 đầu tuần, "YYYY-MM-DD") của TUẦN HIỆN TẠI theo giờ máy
   * người dùng — dùng để mỗi lần mở trang đều tự nhảy đúng vào tuần đang
   * diễn ra (thay vì luôn dừng ở tuần cuối danh sách), xem renderWeekSelect()
   * trong teaching-schedule.js. */
  function todayWeekKey() {
    const now = new Date();
    const dow = now.getDay(); // 0=CN, 1=Thứ2, ... 6=Thứ7
    const diffToMonday = dow === 0 ? -6 : 1 - dow;
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diffToMonday);
    const y = monday.getFullYear();
    const m = String(monday.getMonth() + 1).padStart(2, '0');
    const d = String(monday.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  /** Giáo viên đã nhập ÍT NHẤT 1 buổi có "loại hình phụ trách" trong tuần
   * hay chưa — dùng cho thanh tiến độ + bộ lọc "chỉ hiện GV chưa có lịch". */
  function hasAnySchedule(days) {
    if (!days) return false;
    return WEEKDAYS.some((d) => {
      const day = days[String(d)];
      if (!day) return false;
      return SESSIONS.some((s) => day[s] && day[s].type);
    });
  }

  global.EduModels = global.EduModels || {};
  global.EduModels.TeachingSchedule = {
    TEACHERS_COLLECTION,
    WEEKS_COLLECTION,
    SCHEDULE_COLLECTION,
    TASK_TYPES,
    WEEKDAYS,
    WEEKDAY_LABELS,
    SESSIONS,
    SESSION_LABELS,
    PERIODS_PER_SESSION,
    emptySession,
    emptyDay,
    emptyDays,
    scheduleDocId,
    computeWeekStats,
    buildTeacher,
    buildWeek,
    labelFromMonday,
    todayWeekKey,
    hasAnySchedule,
  };
})(window);
