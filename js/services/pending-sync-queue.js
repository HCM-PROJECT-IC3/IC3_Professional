/* ============================================================
   js/services/pending-sync-queue.js
   Hàng đợi GỬI LẠI khi mất mạng — dùng chung cho mọi nơi cần ghi kết quả
   lên Firestore/Google Sheet (js/firestore-results.js, js/googleSheet.js,
   js/mos-submissions.js).

   VẤN ĐỀ THẬT trước đây: cả 3 module trên đều "gửi rồi quên" — nếu thất
   bại (mất mạng, timeout, Firestore/Apps Script lỗi tạm thời), chỉ
   console.warn rồi THÔI, không có gì gửi lại khi mạng có lại. Với
   js/mos-submissions.js cụ thể, đây là NƠI DUY NHẤT lưu kết quả (không
   như bài kiểm tra chính còn có eduquiz_records làm lưới an toàn local)
   — mất mạng đúng lúc nộp MOS Practice làm kết quả biến mất không dấu
   vết.

   CÁCH DÙNG — mỗi module tự gọi khi hàm gửi của mình thất bại:
     if (window.EduPendingSync) window.EduPendingSync.enqueue('firestore_quiz_result', payload);

   Hàng đợi tự thử gửi lại: ngay lúc tải trang, khi có sự kiện 'online',
   và định kỳ mỗi 20s (dự phòng — 1 số trình duyệt/mobile không bắn
   'online' đáng tin cậy). Có exponential backoff + jitter, tự bỏ 1 mục
   sau MAX_ATTEMPTS lần thất bại (tránh phình vô hạn nếu backend hỏng
   dài hạn), và tự dọn nếu chính hàng đợi bị hỏng JSON.

   GIỚI HẠN THÀNH THẬT: mỗi lần gửi lại gọi ĐÚNG hàm gửi gốc (vd
   saveToGoogleSheet) với ĐÚNG payload gốc — hàm đó vẫn tự sinh
   submissionId MỚI mỗi lần gọi (xem js/googleSheet.js), nên về lý
   thuyết 1 lần gửi lại SAU KHI RELOAD TRANG (mất luôn Set chống trùng
   trong bộ nhớ) có thể tạo 1 dòng trùng ở đích — đánh đổi chấp nhận
   được: "thà thấy 1 dòng trùng còn hơn mất trắng kết quả", và Nhóm B
   (khoá submitExam()) đã chặn hết mọi đường tạo trùng NGAY TỪ ĐẦU
   trong 1 phiên trang — hàng đợi này chỉ xử lý trường hợp hiếm gặp hơn:
   mạng chập chờn tại đúng thời điểm gửi.
   ============================================================ */
(function (global) {
  'use strict';

  const QUEUE_KEY = 'eduquiz_pending_sync_v1';
  const MAX_ATTEMPTS = 8;
  const BASE_DELAY_MS = 15000;        // 15 giây
  const MAX_DELAY_MS = 10 * 60 * 1000; // trần 10 phút giữa các lần thử
  const PERIODIC_FLUSH_MS = 20000;

  // type -> tên hàm TOÀN CỤC nhận đúng 1 payload và trả về Promise<{success}>
  const SENDER_FN_NAMES = {
    firestore_quiz_result: 'saveResultToFirestore',
    google_sheet:          'saveToGoogleSheet',
    mos_submission:        'saveMosSubmission',
  };

  function _readQueue() {
    let raw;
    try { raw = localStorage.getItem(QUEUE_KEY); } catch (e) { return []; }
    if (!raw) return [];
    try {
      const data = JSON.parse(raw);
      return Array.isArray(data) ? data : [];
    } catch (e) {
      console.warn('[EduPendingSync] Hàng đợi gửi lại bị hỏng, đã dọn:', e.message);
      try { localStorage.removeItem(QUEUE_KEY); } catch (e2) { /* không sao */ }
      return [];
    }
  }

  function _writeQueue(items) {
    try {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(items));
    } catch (e) {
      console.warn('[EduPendingSync] Không lưu được hàng đợi (đầy dung lượng?):', e.message);
    }
  }

  function _backoffDelay(attempts) {
    const jitter = Math.random() * 1000; // rải đều tránh nhiều máy cùng retry đúng 1 giây
    return Math.min(MAX_DELAY_MS, BASE_DELAY_MS * Math.pow(2, attempts)) + jitter;
  }

  /** Thêm 1 payload thất bại vào hàng đợi để thử gửi lại sau. */
  function enqueue(type, payload) {
    if (!SENDER_FN_NAMES[type]) {
      console.warn('[EduPendingSync] Bỏ qua — type không hợp lệ:', type);
      return;
    }
    const items = _readQueue();
    items.push({
      id: `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      type,
      payload,
      attempts: 0,
      nextAttemptAt: Date.now() + BASE_DELAY_MS,
    });
    _writeQueue(items);
  }

  let _flushing = false; // chặn 2 lượt flush() chạy chồng nhau (vd sự kiện 'online' bắn đúng lúc interval cũng chạy)

  async function flush() {
    if (_flushing) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return; // chắc chắn offline thì khỏi tốn công thử
    const items = _readQueue();
    if (!items.length) return;

    _flushing = true;
    try {
      const now = Date.now();
      const remaining = [];
      for (const item of items) {
        if (item.nextAttemptAt > now) { remaining.push(item); continue; }

        const fnName = SENDER_FN_NAMES[item.type];
        const fn = global[fnName];
        if (typeof fn !== 'function') { remaining.push(item); continue; } // module gửi chưa nạp trên trang này — thử lại lượt sau

        let ok = false;
        try {
          const res = await fn(item.payload);
          ok = !res || res.success !== false; // không trả gì hoặc success !== false đều coi là thành công
        } catch (e) {
          ok = false;
        }

        if (ok) continue; // xong — không đưa lại vào remaining

        item.attempts += 1;
        if (item.attempts >= MAX_ATTEMPTS) {
          console.warn(`[EduPendingSync] Bỏ 1 mục "${item.type}" sau ${MAX_ATTEMPTS} lần gửi lại thất bại.`);
          continue; // bỏ hẳn — tránh hàng đợi phình vô hạn nếu backend hỏng dài hạn
        }
        item.nextAttemptAt = now + _backoffDelay(item.attempts);
        remaining.push(item);
      }
      _writeQueue(remaining);
    } finally {
      _flushing = false;
    }
  }

  function init() {
    flush(); // có thể còn sót từ lần trước (tab đóng đột ngột lúc đang chờ retry)
    window.addEventListener('online', flush);
    setInterval(flush, PERIODIC_FLUSH_MS); // dự phòng — 'online' không phải lúc nào cũng bắn đáng tin cậy trên mobile
  }

  global.EduPendingSync = { enqueue, flush, init, _readQueue };
  init();
})(window);
