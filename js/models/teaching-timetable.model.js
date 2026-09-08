/* ============================================================
   js/models/teaching-timetable.model.js
   Model cho tab "🗓️ TKB lớp" (teaching-schedule.html) — THỜI KHOÁ BIỂU
   dạng LƯỚI TIẾT HỌC (Buổi/Tiết/Thời gian × Thứ2-7), phỏng theo đúng mẫu
   thời khoá biểu giấy nhà trường cung cấp (banner "IG VIỆT NAM"): mỗi
   giáo viên có 1 khung giờ tiết riêng (vì mỗi trường quy định giờ khác
   nhau) + với mỗi Thứ/tiết, điền MÃ LỚP đang dạy (vd "5/1") — khác với
   tab "📅 Lịch tuần" vốn ghi nhận LOẠI HÌNH PHỤ TRÁCH (Dạy chính/Trám/
   Cty/WFH...) ở cấp độ cả buổi, không tách theo từng tiết. 2 tab phục vụ
   2 mục đích khác nhau (theo dõi nhân sự vs. thời khoá biểu treo lớp) nên
   tách riêng model/collection, không gộp chung để tránh vỡ dữ liệu cũ.

   2 collection Firestore MỚI:
   - "teaching_timetable_periods" : { id (=mã NV), morning: [{start,end}],
       afternoon: [{start,end}] } — khung giờ tiết CỦA RIÊNG giáo viên đó
       (vì dạy nhiều trường khác nhau, giờ giấc mỗi trường mỗi khác), sửa
       thủ công qua modal "⏱️ Giờ tiết", áp dụng cho MỌI tuần (không lặp
       lại cấu hình theo từng tuần) — nếu chưa có, dùng DEFAULT_PERIOD_TIMES.
   - "teaching_timetable" : { id (=`${teacherCode}__${weekKey}`), teacherCode,
       teacherName, weekKey, weekLabel, days: { "2".."7": { morning:
       [Cell...], afternoon: [Cell...] } }, updatedAt }
     Cell = { maLop: string, truong: string } — MỖI TIẾT giữ CẢ mã lớp LẪN
     tên trường riêng (không chỉ 1 field mã lớp như bản đầu) vì 1 giáo
     viên có thể dạy LINH HOẠT nhiều trường khác nhau, thậm chí đổi trường
     giữa các tiết trong CÙNG 1 buổi (vd tiết 1-2 dạy trường A, tiết 4-5
     dạy trường B) — không thể gộp chung "1 trường/buổi" như tab "📅 Lịch
     tuần" (field `location` ở cấp buổi) mà phải tách theo TỪNG TIẾT.
     Dữ liệu CŨ (trước khi có field `truong`) lưu thẳng STRING thay vì
     Cell — mọi nơi đọc phải qua `cellOf()` để tự quy đổi tương thích
     ngược, KHÔNG được đọc `.maLop`/`.truong` trực tiếp từ dữ liệu thô.
     Độ dài mảng morning/afternoon LUÔN khớp số tiết trong periodTimes của
     giáo viên đó tại thời điểm lưu (renderTimetableGrid tự đệm/cắt khi
     khung giờ đổi sau này).
   ============================================================ */
(function (global) {
  'use strict';

  const PERIOD_TIMES_COLLECTION = 'teaching_timetable_periods';
  const TIMETABLE_COLLECTION = 'teaching_timetable';

  // Khung giờ mặc định — LẤY ĐÚNG từ mẫu thời khoá biểu giấy (5 tiết Sáng,
  // 4 tiết Chiều, nghỉ giải lao sau tiết 2 mỗi buổi). Dùng khi giáo viên
  // chưa tự sửa khung giờ riêng của mình.
  const DEFAULT_PERIOD_TIMES = Object.freeze({
    morning: Object.freeze([
      { start: '07:30', end: '08:05' },
      { start: '08:10', end: '08:45' },
      { start: '09:20', end: '09:55' },
      { start: '10:00', end: '10:25' },
      { start: '10:35', end: '11:10' },
    ]),
    afternoon: Object.freeze([
      { start: '13:30', end: '14:05' },
      { start: '14:10', end: '14:45' },
      { start: '15:05', end: '15:40' },
      { start: '15:45', end: '16:20' },
    ]),
  });

  const WEEKDAYS = Object.freeze([2, 3, 4, 5, 6, 7]);
  const WEEKDAY_LABELS = Object.freeze({ 2: 'Thứ 2', 3: 'Thứ 3', 4: 'Thứ 4', 5: 'Thứ 5', 6: 'Thứ 6', 7: 'Thứ 7' });
  const SESSIONS = Object.freeze(['morning', 'afternoon']);
  const SESSION_LABELS = Object.freeze({ morning: 'SÁNG', afternoon: 'CHIỀU' });
  // Sau tiết thứ mấy thì chèn dòng "Ra chơi" — cố định theo đúng mẫu giấy
  // (sau tiết 2 của MỖI buổi), bỏ qua nếu buổi đó không đủ tiết.
  const BREAK_AFTER_INDEX = 1;

  function docId(teacherCode, weekKey) { return `${teacherCode}__${weekKey}`; }

  function clonePeriodTimes(pt) {
    return {
      morning: (pt && pt.morning && pt.morning.length ? pt.morning : DEFAULT_PERIOD_TIMES.morning)
        .map((p) => ({ start: p.start || '', end: p.end || '' })),
      afternoon: (pt && pt.afternoon && pt.afternoon.length ? pt.afternoon : DEFAULT_PERIOD_TIMES.afternoon)
        .map((p) => ({ start: p.start || '', end: p.end || '' })),
    };
  }

  /** 1 ô-tiết trống — {maLop, truong} rỗng. */
  function emptyCell() { return { maLop: '', truong: '' }; }

  /** Quy đổi 1 ô-tiết THÔ (đọc từ Firestore) về đúng dạng {maLop, truong} —
   * tương thích ngược với dữ liệu CŨ lưu thẳng string (trước khi có field
   * "Trường"): string đó được hiểu là `maLop`, `truong` để trống. LUÔN
   * dùng hàm này khi đọc 1 ô-tiết, không đọc `.maLop` trực tiếp từ dữ liệu
   * thô vì có thể vẫn là string. */
  function cellOf(raw) {
    if (raw && typeof raw === 'object') return { maLop: raw.maLop || '', truong: raw.truong || '' };
    return { maLop: raw || '', truong: '' };
  }

  /** Khung ngày trống — số tiết mỗi buổi khớp đúng periodTimes truyền vào
   * (đệm ô rỗng cho đủ số tiết, cắt bớt nếu dư — dùng khi khung giờ vừa đổi
   * số tiết nhưng dữ liệu cũ còn ít/nhiều tiết hơn). */
  function emptyDays(periodTimes) {
    const pt = clonePeriodTimes(periodTimes);
    const days = {};
    WEEKDAYS.forEach((d) => {
      days[String(d)] = {
        morning: pt.morning.map(() => emptyCell()),
        afternoon: pt.afternoon.map(() => emptyCell()),
      };
    });
    return days;
  }

  /** Chuẩn hoá 1 bộ "days" đã lưu về đúng số tiết hiện tại của periodTimes
   * (đệm/cắt từng mảng) + quy đổi từng ô về {maLop, truong} qua cellOf() —
   * gọi mỗi khi render để không vỡ layout khi giáo viên vừa sửa khung giờ
   * (thêm/bớt tiết) nhưng dữ liệu lớp cũ chưa khớp, và để tương thích
   * ngược với dữ liệu CŨ (string) trước khi có field "Trường". */
  function normalizeDays(days, periodTimes) {
    const pt = clonePeriodTimes(periodTimes);
    const out = {};
    WEEKDAYS.forEach((d) => {
      const src = (days && days[String(d)]) || {};
      out[String(d)] = {
        morning: pt.morning.map((_, i) => cellOf(src.morning && src.morning[i])),
        afternoon: pt.afternoon.map((_, i) => cellOf(src.afternoon && src.afternoon[i])),
      };
    });
    return out;
  }

  global.EduModels = global.EduModels || {};
  global.EduModels.TeachingTimetable = {
    PERIOD_TIMES_COLLECTION,
    TIMETABLE_COLLECTION,
    DEFAULT_PERIOD_TIMES,
    WEEKDAYS,
    WEEKDAY_LABELS,
    SESSIONS,
    SESSION_LABELS,
    BREAK_AFTER_INDEX,
    docId,
    clonePeriodTimes,
    emptyCell,
    cellOf,
    emptyDays,
    normalizeDays,
  };
})(window);
