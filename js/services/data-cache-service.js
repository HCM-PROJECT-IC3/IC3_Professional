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

   ★ THAM SỐ `persist` (MỚI) — dùng localStorage thay vì sessionStorage:
   Mặc định (persist=false) dùng sessionStorage — cache tự hết khi đóng
   tab, phù hợp cho dữ liệu CẦN TƯƠI (vd. quiz_results lúc đang theo dõi
   thi trực tiếp). Với dữ liệu ÍT ĐỔI và tốn nhiều lượt đọc theo số
   lượng bản ghi (roster toàn trường — chỉ đổi khi Admin/Điều phối import
   Excel, không phải mỗi phút), gọi với persist=true để cache SỐNG QUA
   NHIỀU LẦN mở tab/nhiều ngày — quan trọng khi roster lên tới hàng chục
   nghìn học sinh: nếu không, MỖI lần mở dashboard admin (kể cả người
   khác, kể cả ngày khác) đều tốn lại toàn bộ số lượt đọc đó, có thể
   chạm trần 50.000 đọc/ngày miễn phí của Firestore (gói Spark) khi
   trường quá lớn. Có nút "🔄 Làm mới dữ liệu" (forceRefresh) ở mọi
   dashboard để bỏ qua cache khi cần thấy roster mới nhất ngay.

   Nạp file này TRƯỚC coordinator/data-loader.js và teacher/data-loader.js.
   ============================================================ */
(function (global) {
  'use strict';

  const PREFIX = 'eduDashCache:';

  function storageFor(persist) {
    return persist ? localStorage : sessionStorage;
  }

  function safeParse(raw) {
    try { return JSON.parse(raw); } catch (e) { return null; }
  }

  /** @returns {*} Giá trị đã cache nếu còn hạn, ngược lại null. */
  function get(key, persist) {
    try {
      const storage = storageFor(persist);
      const raw = storage.getItem(PREFIX + key);
      if (!raw) return null;
      const entry = safeParse(raw);
      if (!entry || Date.now() > entry.expiresAt) {
        storage.removeItem(PREFIX + key);
        return null;
      }
      return entry.value;
    } catch (e) {
      // Safari chế độ riêng tư / storage bị chặn — cache chỉ là tối ưu
      // thêm, không phải bắt buộc, nên bỏ qua lỗi và coi như miss.
      return null;
    }
  }

  /** Lưu value vào cache với thời hạn ttlMs (mili-giây). */
  function set(key, value, ttlMs, persist) {
    try {
      storageFor(persist).setItem(PREFIX + key, JSON.stringify({ value, expiresAt: Date.now() + ttlMs }));
    } catch (e) { /* hết quota hoặc bị chặn — bỏ qua, không ảnh hưởng chức năng chính */ }
  }

  function clear(key, persist) {
    try { storageFor(persist).removeItem(PREFIX + key); } catch (e) { /* ignore */ }
  }

  /** Xoá toàn bộ cache Dashboard (cả sessionStorage lẫn localStorage) —
   *  dùng khi cần chắc chắn tải mới hoàn toàn. */
  function clearAll() {
    [sessionStorage, localStorage].forEach((storage) => {
      try {
        Object.keys(storage)
          .filter((k) => k.startsWith(PREFIX))
          .forEach((k) => storage.removeItem(k));
      } catch (e) { /* ignore */ }
    });
  }

  global.EduDataCache = { get, set, clear, clearAll };
})(window);
