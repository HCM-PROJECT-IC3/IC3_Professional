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
  // Bài nộp lên Firestore KHÔNG bị bỏ sau MAX_ATTEMPTS lần: lý do thất bại thường
  // gặp nhất là HẾT LƯỢT GHI TRONG NGÀY (gói Spark, đặt lại ~14-15h chiều giờ VN)
  // — 8 lần thử với backoff chỉ kéo dài ~35 phút, trước đây bài nộp bị BỎ trong lúc
  // chờ hạn mức đặt lại. Giữ tới khi gửi được (hoặc rules từ chối hẳn), tối đa 30
  // ngày. An toàn vì mỗi bài có mã cố định (createOnce) — gửi lại không tạo trùng.
  const KEEP_UNTIL_SENT = { firestore_quiz_result: true, mos_submission: true };
  // Bài gửi Google Sheet có mã cố định (submissionId — js/services/result-submitter.js)
  // cũng giữ tới khi gửi được: khi js/backend-config.js tắt Firestore, Sheet là nơi
  // lưu DUY NHẤT; apps/Code.gs bỏ qua bản trùng mã nên gửi lại không tạo dòng thừa.
  function keepUntilSent(item) {
    return !!KEEP_UNTIL_SENT[item.type] || (item.type === 'google_sheet' && !!(item.payload && item.payload.submissionId));
  }
  const KEEP_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

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
    // Rải ±50% (trước: chỉ +0..1 giây): cả lớp cùng lỗi 1 lúc (Apps Script quá 30 lượt chạy
    // song song) thì lần thử lại cũng dàn ra nhiều giây, không dồn lại đúng 1 thời điểm.
    const base = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * Math.pow(2, attempts));
    return Math.round(base * (0.5 + Math.random()));
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
      createdAt: Date.now(),
      type,
      payload,
      attempts: 0,
      nextAttemptAt: Date.now() + BASE_DELAY_MS,
    });
    _writeQueue(items);
  }

  let _flushing = false; // chặn 2 lượt flush() chạy chồng nhau (vd sự kiện 'online' bắn đúng lúc interval cũng chạy)

  // Học sinh mở NHIỀU TAB: mỗi tab có interval flush riêng, cùng đọc 1 hàng đợi trong
  // localStorage → cùng gửi 1 bài N lần (N lượt Apps Script/Firestore). Web Locks cho
  // đúng 1 tab flush tại 1 thời điểm; tab khác thấy khoá bận thì bỏ lượt này.
  function flush() {
    if (_flushing) return Promise.resolve();
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return Promise.resolve(); // chắc chắn offline thì khỏi tốn công thử
    if (typeof navigator !== 'undefined' && navigator.locks && navigator.locks.request) {
      return navigator.locks.request('eduquiz_pending_sync', { ifAvailable: true }, (lock) => (lock ? _flushNow() : undefined));
    }
    return _flushNow();
  }

  async function _flushNow() {
    if (_flushing) return;
    const items = _readQueue();
    if (!items.length) return;

    _flushing = true;
    try {
      const now = Date.now();
      const remaining = [];
      // Cầu dao theo loại: 1 bài lỗi TẠM THỜI (Apps Script quá tải/hết hạn mức, mất mạng) thì
      // các bài cùng loại còn lại gần như chắc cũng lỗi → hoãn theo cùng mốc, không gọi tiếp.
      // Trước đây máy treo 20 bài = 20 lượt gọi thất bại mỗi vòng, nhân với cả phòng máy.
      const downUntil = {};
      for (const item of items) {
        if (item.nextAttemptAt > now) { remaining.push(item); continue; }
        if (downUntil[item.type]) {
          item.nextAttemptAt = downUntil[item.type] + Math.round(Math.random() * BASE_DELAY_MS);
          remaining.push(item);
          continue;
        }

        const fnName = SENDER_FN_NAMES[item.type];
        const fn = global[fnName];
        if (typeof fn !== 'function') { remaining.push(item); continue; } // module gửi chưa nạp trên trang này — thử lại lượt sau

        const keep = keepUntilSent(item);
        let ok = false;
        let permanent = false;
        try {
          // _retry: báo hàm gửi biết đây là lần gửi lại (bị rules từ chối = đã có sẵn).
          const res = await fn(keep ? Object.assign({}, item.payload, { _retry: true }) : item.payload);
          ok = !res || res.success !== false; // không trả gì hoặc success !== false đều coi là thành công
          permanent = !!(res && res.permanent);
        } catch (e) {
          ok = false;
        }

        if (ok) continue; // xong — không đưa lại vào remaining
        if (permanent) {
          console.warn(`[EduPendingSync] Bỏ 1 mục "${item.type}" — máy chủ từ chối hẳn (dữ liệu không hợp lệ), gửi lại cũng không được.`);
          continue;
        }

        item.attempts += 1;
        if (keep) {
          if (now - (item.createdAt || now) > KEEP_MAX_AGE_MS) {
            console.warn(`[EduPendingSync] Bỏ 1 mục "${item.type}" sau 30 ngày không gửi được.`);
            continue;
          }
        } else if (item.attempts >= MAX_ATTEMPTS) {
          console.warn(`[EduPendingSync] Bỏ 1 mục "${item.type}" sau ${MAX_ATTEMPTS} lần gửi lại thất bại.`);
          continue; // bỏ hẳn — tránh hàng đợi phình vô hạn nếu backend hỏng dài hạn
        }
        item.nextAttemptAt = now + _backoffDelay(Math.min(item.attempts, MAX_ATTEMPTS));
        downUntil[item.type] = item.nextAttemptAt;
        remaining.push(item);
      }
      // Trong lúc chờ mạng ở trên, enqueue() (tab này hoặc tab khác) có thể đã thêm bài
      // mới — đọc lại và giữ các mục chưa có trong lượt này, không ghi đè mất chúng.
      const seen = new Set(items.map((i) => i.id));
      _writeQueue(remaining.concat(_readQueue().filter((i) => !seen.has(i.id))));
    } finally {
      _flushing = false;
    }
  }

  function init() {
    // Có thể còn sót từ lần trước (tab đóng đột ngột lúc đang chờ retry). Trễ ngẫu nhiên
    // 0–8 giây: cả lớp mở trang / Wi-Fi phòng máy có lại CÙNG LÚC thì không dồn hết bài
    // còn treo vào Apps Script trong cùng 1 giây.
    const later = () => setTimeout(flush, Math.random() * 8000);
    later();
    window.addEventListener('online', later);
    setInterval(flush, PERIODIC_FLUSH_MS); // dự phòng — 'online' không phải lúc nào cũng bắn đáng tin cậy trên mobile
  }

  global.EduPendingSync = { enqueue, flush, init, _readQueue };
  init();
})(window);
