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

  // Mỗi CẤP HỌC có quy định thời lượng 1 tiết khác nhau (Tiểu học 35 phút,
  // THCS 45 phút) — TRƯỚC ĐÂY cả app chỉ dùng 1 khung giờ chung
  // (DEFAULT_PERIOD_TIMES, thực chất là khung Tiểu học) cho MỌI giáo viên,
  // kể cả khi giáo viên đó dạy cả 2 cấp trong CÙNG 1 tuần (Dạy Trám ở
  // nhiều trường khác nhau) — khiến cột "Thời gian" hiện SAI giờ thực tế
  // cho các tiết tại trường THCS (hiện 35 phút/tiết trong khi thực tế
  // 45 phút/tiết). SCHOOL_LEVELS + LEVEL_PERIOD_TIMES bên dưới tách rõ 2
  // khung giờ chuẩn theo cấp học — xem inferSchoolLevel() để tự nhận diện
  // cấp học từ tên trường đã gõ ("TiH ..." / "THCS ...", đúng quy ước tên
  // trường đã dùng sẵn trong dữ liệu thật), dùng để tô huy hiệu màu +
  // tính đúng giờ thực tế cho từng ô trong renderGrid() (js/teaching-timetable.js).
  const SCHOOL_LEVELS = Object.freeze({
    tieuHoc: Object.freeze({ key: 'tieuHoc', label: 'Tiểu học', short: 'TiH', minutes: 35, color: '#0f857a', bg: '#e3faf6' }),
    thcs: Object.freeze({ key: 'thcs', label: 'THCS', short: 'THCS', minutes: 45, color: '#1e64be', bg: '#e7f2fe' }),
  });

  /** Khung giờ CHUẨN theo cấp học — 5 tiết Sáng, 4 tiết Chiều, nghỉ giải lao
   * sau tiết 2 mỗi buổi (giống mẫu thời khoá biểu giấy gốc), chỉ khác đúng
   * THỜI LƯỢNG mỗi tiết (35' Tiểu học / 45' THCS). Dùng làm gợi ý áp dụng
   * nhanh trong modal "⏱️ Giờ tiết" (nút "Áp dụng khung...") và để tính
   * giờ THỰC TẾ hiển thị trong từng ô của lưới TKB — vẫn CHỈ LÀ MẶC ĐỊNH,
   * giáo viên/admin sửa tay lại theo đúng giờ trường quy định nếu khác. */
  const LEVEL_PERIOD_TIMES = Object.freeze({
    tieuHoc: Object.freeze({
      morning: Object.freeze([
        { start: '07:30', end: '08:05' },
        { start: '08:10', end: '08:45' },
        { start: '09:20', end: '09:55' },
        { start: '10:00', end: '10:35' },
        { start: '10:40', end: '11:15' },
      ]),
      afternoon: Object.freeze([
        { start: '13:30', end: '14:05' },
        { start: '14:10', end: '14:45' },
        { start: '15:05', end: '15:40' },
        { start: '15:45', end: '16:20' },
      ]),
    }),
    thcs: Object.freeze({
      morning: Object.freeze([
        { start: '07:00', end: '07:45' },
        { start: '07:50', end: '08:35' },
        { start: '08:55', end: '09:40' },
        { start: '09:45', end: '10:30' },
        { start: '10:35', end: '11:20' },
      ]),
      afternoon: Object.freeze([
        { start: '13:30', end: '14:15' },
        { start: '14:20', end: '15:05' },
        { start: '15:20', end: '16:05' },
        { start: '16:10', end: '16:55' },
      ]),
    }),
  });

  // Khung giờ mặc định khi giáo viên chưa tự sửa khung giờ riêng của mình
  // — dùng khung Tiểu học làm mặc định gốc (đa số giáo viên hệ Tiểu học).
  const DEFAULT_PERIOD_TIMES = LEVEL_PERIOD_TIMES.tieuHoc;

  /** Tự nhận diện CẤP HỌC từ tên trường đã gõ ở ô "Trường" — dựa theo quy
   * ước ĐÃ DÙNG SẴN trong dữ liệu thật (tiền tố "TiH ..." cho Tiểu học,
   * "THCS ..." cho THCS), không bắt gõ thêm trường dữ liệu mới. Trả về
   * null nếu không nhận diện được (tên trường không theo quy ước này) —
   * nơi gọi tự bỏ qua huy hiệu/cảnh báo khi không chắc chắn thay vì đoán
   * bừa cấp học. */
  function inferSchoolLevel(truong) {
    const t = (truong || '').trim().toLowerCase();
    if (!t) return null;
    if (/^thcs\b/.test(t) || t.includes('trung học cơ sở')) return 'thcs';
    if (/^tih\b/.test(t) || t.includes('tiểu học') || t.includes('tieu hoc')) return 'tieuHoc';
    return null;
  }

  /** Số phút thực của 1 tiết "HH:MM"→"HH:MM" — dùng để đối chiếu khung giờ
   * ĐANG ÁP DỤNG cho 1 tiết với thời lượng CHUẨN của cấp học suy ra từ
   * "Trường" của ô đó, phát hiện lệch (vd khung đang để 35' nhưng ô này là
   * lớp THCS chuẩn 45'/tiết) để cảnh báo trong renderGrid(). */
  function periodMinutes(period) {
    if (!period || !period.start || !period.end) return null;
    const [sh, sm] = period.start.split(':').map(Number);
    const [eh, em] = period.end.split(':').map(Number);
    if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return null;
    return (eh * 60 + em) - (sh * 60 + sm);
  }

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

  /** Chuẩn hoá 1 bộ khung giờ ĐÃ LƯU (đọc từ Firestore, collection
   * PERIOD_TIMES_COLLECTION) về ĐÚNG 1 khung giờ RIÊNG cho MỖI Thứ 2→7 —
   * TRƯỚC ĐÂY 1 giáo viên chỉ có 1 khung giờ DUY NHẤT áp cho CẢ TUẦN,
   * nhưng thực tế rất phổ biến 1 giáo viên dạy Tiểu học (35’/tiết) vào
   * mấy ngày, THCS (45’/tiết) vào mấy ngày khác trong CÙNG 1 tuần (dạy
   * trám nhiều trường) — áp 1 khung chung cho mọi Thứ sẽ luôn SAI giờ ở
   * ít nhất 1 vài ngày. Dữ liệu MỚI lưu dạng `{ byDay: {"2":{...},...,
   * "7":{...}} }`; dữ liệu CŨ (trước bản này, lưu thẳng `{morning,
   * afternoon}` không có "byDay") được hiểu là ÁP DỤNG GIỐNG NHAU cho mọi
   * Thứ (tương thích ngược, không làm mất cấu hình giáo viên đã lưu
   * trước đó) — admin chỉnh lại riêng từng Thứ khác cần khác đi qua modal
   * "⏱️ Giờ tiết" (xem tab-chọn-Thứ trong js/teaching-timetable.js). */
  function normalizePeriodTimesDoc(raw) {
    const byDay = raw && raw.byDay && typeof raw.byDay === 'object' ? raw.byDay : null;
    const legacyFlat = !byDay && raw && (raw.morning || raw.afternoon) ? raw : null;
    const out = {};
    WEEKDAYS.forEach((d) => {
      const key = String(d);
      out[key] = clonePeriodTimes(byDay ? byDay[key] : legacyFlat);
    });
    return out;
  }

  /** Khung giờ mặc định cho mọi Thứ 2→7 (dùng khi giáo viên chưa từng cấu
   * hình gì) — mỗi Thứ 1 bản sao riêng (không share cùng 1 mảng, tránh sửa
   * Thứ này lỡ đụng Thứ khác). */
  function emptyPeriodTimesByDay() {
    return normalizePeriodTimesDoc(null);
  }

  /** Số tiết NHIỀU NHẤT của 1 buổi (Sáng/Chiều) tính trên MỌI Thứ đã cấu
   * hình — quyết định lưới TKB cần vẽ bao nhiêu HÀNG cho buổi đó, vì mỗi
   * Thứ giờ có thể có số tiết khác nhau (Thứ này 5 tiết Tiểu học, Thứ kia
   * chỉ 4 tiết THCS chẳng hạn). Thứ nào ít tiết hơn thì các hàng dư ra của
   * Thứ đó hiện ô trống-khoá (xem renderGrid() trong js/teaching-timetable.js). */
  function maxPeriodCount(periodTimesByDay, sessionKey) {
    return WEEKDAYS.reduce((mx, d) => {
      const pt = periodTimesByDay[String(d)];
      const len = pt && pt[sessionKey] ? pt[sessionKey].length : 0;
      return Math.max(mx, len);
    }, 0);
  }

  /** Khung ngày trống — số tiết MỖI THỨ khớp đúng periodTimesByDay CỦA
   * ĐÚNG THỨ ĐÓ (không còn dùng chung 1 khung cho mọi Thứ như trước). */
  function emptyDays(periodTimesByDay) {
    const days = {};
    WEEKDAYS.forEach((d) => {
      const pt = clonePeriodTimes(periodTimesByDay[String(d)]);
      days[String(d)] = {
        morning: pt.morning.map(() => emptyCell()),
        afternoon: pt.afternoon.map(() => emptyCell()),
      };
    });
    return days;
  }

  /** Chuẩn hoá 1 bộ "days" đã lưu về đúng số tiết hiện tại của ĐÚNG THỨ ĐÓ
   * trong periodTimesByDay (đệm/cắt từng mảng theo TỪNG THỨ RIÊNG, không
   * còn 1 số tiết chung cho cả tuần) + quy đổi từng ô về {maLop, truong}
   * qua cellOf() — gọi mỗi khi render để không vỡ layout khi vừa sửa khung
   * giờ (thêm/bớt tiết) của 1 Thứ nhưng dữ liệu lớp cũ chưa khớp, và để
   * tương thích ngược với dữ liệu CŨ (string) trước khi có field "Trường". */
  function normalizeDays(days, periodTimesByDay) {
    const out = {};
    WEEKDAYS.forEach((d) => {
      const pt = clonePeriodTimes(periodTimesByDay[String(d)]);
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
    SCHOOL_LEVELS,
    LEVEL_PERIOD_TIMES,
    WEEKDAYS,
    WEEKDAY_LABELS,
    SESSIONS,
    SESSION_LABELS,
    BREAK_AFTER_INDEX,
    docId,
    clonePeriodTimes,
    normalizePeriodTimesDoc,
    emptyPeriodTimesByDay,
    maxPeriodCount,
    emptyCell,
    cellOf,
    emptyDays,
    normalizeDays,
    inferSchoolLevel,
    periodMinutes,
  };
})(window);
