/* ============================================================
   js/services/data-cache-service.js
   Cache tạm (TTL ngắn) cho dữ liệu Dashboard (roster + quiz_results)
   trong sessionStorage — mục tiêu: KHÔNG gọi lại Firestore mỗi khi
   Giáo viên/Điều phối đào tạo F5 hoặc mở lại trang trong vài phút.

   VÌ SAO CẦN FILE NÀY:
   coordinator/data-loader.js và teacher/data-loader.js đều gọi
   loadAll() 1 lần mỗi khi trang tải — bản thân query đã tối ưu
   (limit 1000 cho quiz_results, lọc where theo "schools" cho giáo
   viên), NHƯNG nếu 1 người mở lại trang / bấm F5 nhiều lần trong lúc
   theo dõi học sinh làm bài (vd. đang trong buổi thi), mỗi lần vẫn
   tốn lại TOÀN BỘ số lượt đọc đó — cộng dồn rất nhanh khi roster có
   hàng ngàn học sinh. Cache TTL ngắn (mặc định 3 phút) giải quyết
   đúng trường hợp này: trong 3 phút, mở lại trang bao nhiêu lần cũng
   chỉ tính 1 lượt đọc thật.

   KHÔNG dùng để cache dữ liệu học sinh làm bài (ghi kết quả) — chỉ
   áp dụng cho luồng ĐỌC của Dashboard.

   Dùng sessionStorage (không phải localStorage) — cache tự hết khi
   đóng tab, tránh hiện dữ liệu cũ vô thời hạn nếu quay lại sau nhiều
   giờ/ngày.

   Nạp file này TRƯỚC coordinator/data-loader.js và teacher/data-loader.js.
   ============================================================ */
(function (global) {
  'use strict';

  const PREFIX = 'eduDashCache:';

  function safeParse(raw) {
    try { return JSON.parse(raw); } catch (e) { return null; }
  }

  /** @returns {*} Giá trị đã cache nếu còn hạn, ngược lại null. */
  function get(key) {
    try {
      const raw = sessionStorage.getItem(PREFIX + key);
      if (!raw) return null;
      const entry = safeParse(raw);
      if (!entry || Date.now() > entry.expiresAt) {
        sessionStorage.removeItem(PREFIX + key);
        return null;
      }
      return entry.value;
    } catch (e) {
      // Safari chế độ riêng tư / sessionStorage bị chặn — cache chỉ là
      // tối ưu thêm, không phải bắt buộc, nên bỏ qua lỗi và coi như miss.
      return null;
    }
  }

  /** Lưu value vào cache với thời hạn ttlMs (mili-giây). */
  function set(key, value, ttlMs) {
    try {
      sessionStorage.setItem(PREFIX + key, JSON.stringify({ value, expiresAt: Date.now() + ttlMs }));
    } catch (e) { /* hết quota hoặc bị chặn — bỏ qua, không ảnh hưởng chức năng chính */ }
  }

  function clear(key) {
    try { sessionStorage.removeItem(PREFIX + key); } catch (e) { /* ignore */ }
  }

  /** Xoá toàn bộ cache Dashboard (dùng khi cần chắc chắn tải mới hoàn toàn). */
  function clearAll() {
    try {
      Object.keys(sessionStorage)
        .filter((k) => k.startsWith(PREFIX))
        .forEach((k) => sessionStorage.removeItem(k));
    } catch (e) { /* ignore */ }
  }

  global.EduDataCache = { get, set, clear, clearAll };
})(window);
