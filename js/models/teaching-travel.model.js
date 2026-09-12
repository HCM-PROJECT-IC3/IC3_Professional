/* ============================================================
   js/models/teaching-travel.model.js
   Model cho tab "🚗 Hỗ trợ xăng xe" (teaching-schedule.html) — tính tiền
   hỗ trợ xăng xe cho giáo viên đi dạy xa, dành cho role "teaching_coordinator"
   (🚗 Điều phối giáo viên) quản lý.

   Quy tắc nghiệp vụ (do người dùng cung cấp trực tiếp):
   - Hỗ trợ 20.000đ/ngày nếu tổng khoảng cách đi lại trong ngày từ 11 đến
     15km; từ 15,1km trở lên: 30.000đ/ngày. Dưới 11km: KHÔNG có hỗ trợ.
   - Khoảng cách tính: nhà → trường 1 nếu ngày đó chỉ dạy 1 trường; nhà →
     trường 1 → trường 2 nếu dạy 2 trường trong cùng 1 ngày.
   - KHÔNG có hỗ trợ xăng xe cho: Dự Giảng, Ôn online (= "Dạy Trực Tuyến"
     trong TASK_TYPES — hệ thống đã tách riêng loại "dạy trực tuyến" khỏi
     "Ôn Thi" từ trước, nên "ôn online" ánh xạ đúng vào type này), Trợ Giảng.

   1 collection Firestore MỚI:
   - "teaching_travel_distances" : { id (=teacherCode), schools: { [tên
       trường]: kmSốThực (1 chiều, nhà→trường đó) }, updatedAt }
     Khoảng cách do CON NGƯỜI tự nhập (tra Google Maps...) — hệ thống
     KHÔNG có toạ độ thật của nhà/trường để tự tính, không tự suy ra được.

   LƯU Ý QUAN TRỌNG về độ chính xác: hệ thống chỉ lưu khoảng cách "nhà→1
   trường" cho từng trường riêng lẻ, KHÔNG có khoảng cách "trường A→trường
   B" (cần thêm 1 ma trận khoảng cách giữa các trường mới tính đúng tuyệt
   đối lộ trình "nhà→trường1→trường2"). Khi 1 ngày dạy 2 trường, hàm dưới
   đây XẤP XỈ bằng cách CỘNG khoảng cách nhà→từng trường lại — đây là ước
   lượng hợp lý nhất có thể với dữ liệu hiện có, KHÔNG phải khoảng cách lộ
   trình thực tế chính xác tuyệt đối (thường sẽ cao hơn quãng đường thật
   nếu 2 trường gần nhau, vì tính dư quãng "trường1→nhà→trường2" thay vì
   "trường1→trường2" thẳng).
   ============================================================ */
(function (global) {
  'use strict';

  const TRAVEL_DISTANCES_COLLECTION = 'teaching_travel_distances';

  // Loại hình ĐƯỢC tính hỗ trợ — phải là buổi dạy THẬT SỰ tại 1 trường cụ
  // thể (có periods đã ghi mã lớp/tích chọn), không phải chỉ có type mà
  // trống trơn.
  const ALLOWANCE_TYPES = Object.freeze(['Dạy chính', 'Dạy Trám', 'Ôn Thi']);

  // Loại hình KHÔNG có hỗ trợ xăng xe dù có ghi `location` — theo đúng
  // yêu cầu nghiệp vụ: Dự Giảng/Trợ Giảng thường đi cùng buổi đã tính,
  // "Dạy Trực Tuyến" (ôn/dạy online) không cần di chuyển.
  const NO_ALLOWANCE_TYPES = Object.freeze(['Dự Giảng', 'Trợ Giảng', 'Dạy Trực Tuyến']);

  // Duyệt từ mức cao xuống thấp, khớp bậc ĐẦU TIÊN thoả minKm — đơn giản
  // hơn hẳn if/else lồng nhau khi cần thêm/sửa bậc sau này.
  const TIERS = Object.freeze([
    { minKm: 15.1, amount: 30000 },
    { minKm: 11, amount: 20000 },
  ]);

  /** Số tiền hỗ trợ cho ĐÚNG 1 ngày, từ tổng km ngày đó. Làm tròn 1 chữ số
   * thập phân trước khi so sánh — tránh lỗi cộng dấu phẩy động (vd
   * 5 + 10.1 có thể ra 15.099999999999998 thay vì 15.1 đúng nghĩa). */
  function amountForKm(km) {
    const rounded = Math.round((Number(km) || 0) * 10) / 10;
    if (rounded <= 0) return 0;
    for (const tier of TIERS) {
      if (rounded >= tier.minKm) return tier.amount;
    }
    return 0;
  }

  /** Danh sách trường (thứ tự Sáng→Chiều, GỘP TRÙNG) THẬT SỰ cần hỗ trợ
   * xăng xe trong 1 ngày — chỉ tính buổi có `type` thuộc ALLOWANCE_TYPES
   * VÀ có ít nhất 1 tiết/mã lớp đã ghi (periods có giá trị); bỏ qua hẳn
   * NO_ALLOWANCE_TYPES và các loại hành chính khác (Soạn bài/Cty/WFH/Khám
   * SK/Nghỉ phép — vốn không cần đi trường).
   * @param {Object} day  1 phần tử days["2".."7"] của teaching_schedule
   * @param {Object} M    window.EduModels.TeachingSchedule (cần SESSIONS)
   */
  function schoolsForDay(day, M) {
    const out = [];
    const seen = new Set();
    M.SESSIONS.forEach((s) => {
      const sess = day && day[s];
      if (!sess || !sess.type || !ALLOWANCE_TYPES.includes(sess.type)) return;
      const hasPeriod = (sess.periods || []).some((p) => !!p);
      if (!hasPeriod) return;
      const loc = (sess.location || '').trim();
      if (loc && !seen.has(loc)) { seen.add(loc); out.push(loc); }
    });
    return out;
  }

  /** Tổng km đi lại trong ngày — CỘNG khoảng cách nhà→từng trường (xem
   * chú thích "LƯU Ý QUAN TRỌNG" ở đầu file về độ chính xác khi có 2
   * trường trở lên trong cùng 1 ngày). Trường chưa có khoảng cách trong
   * `distanceMap` được tính là 0km (không phải bỏ qua — vẫn hiện trong
   * UI kèm cảnh báo "chưa nhập km" để điều phối giáo viên bổ sung). */
  function totalKmForDay(schools, distanceMap) {
    return schools.reduce((sum, school) => sum + (Number((distanceMap || {})[school]) || 0), 0);
  }

  /** Gộp schoolsForDay + totalKmForDay + amountForKm cho 1 ngày — trả về
   * đủ chi tiết để UI vừa hiện số tiền vừa giải thích được VÌ SAO (trường
   * nào, bao nhiêu km). */
  function allowanceForDay(day, M, distanceMap) {
    const schools = schoolsForDay(day, M);
    if (!schools.length) return { schools, km: 0, amount: 0, missingDistance: false };
    const km = totalKmForDay(schools, distanceMap);
    const missingDistance = schools.some((s) => !((distanceMap || {})[s] > 0));
    return { schools, km, amount: amountForKm(km), missingDistance };
  }

  function formatVnd(n) {
    return `${(Number(n) || 0).toLocaleString('vi-VN')}đ`;
  }

  global.EduModels = global.EduModels || {};
  global.EduModels.TeachingTravel = {
    TRAVEL_DISTANCES_COLLECTION,
    ALLOWANCE_TYPES,
    NO_ALLOWANCE_TYPES,
    TIERS,
    amountForKm,
    schoolsForDay,
    totalKmForDay,
    allowanceForDay,
    formatVnd,
  };
})(window);
