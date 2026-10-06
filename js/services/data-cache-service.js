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
    } catch (e) {
      // localStorage/sessionStorage chỉ ~5 triệu ký tự CHO CẢ TRANG — dữ liệu lớn phải
      // dùng setAsync() (IndexedDB). Báo ra console thay vì im lặng: cache ghi hỏng
      // nghĩa là lần sau lại đọc lại toàn bộ từ Firestore.
      console.warn('[EduDataCache] Không lưu được cache "' + key + '" (' + e.name + ') — dùng setAsync() cho dữ liệu lớn.');
    }
  }

  function clear(key, persist) {
    try { storageFor(persist).removeItem(PREFIX + key); } catch (e) { /* ignore */ }
    idbDelete(key);
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
    idbClear();
  }

  // ── Cache LỚN trong IndexedDB (getAsync/setAsync) ──
  // Dùng cho dữ liệu hàng nghìn bản ghi (roster, quiz_results, câu hỏi...): không
  // bị trần ~5 triệu ký tự của localStorage. persist=false giữ đúng nghĩa "theo
  // tab" bằng 1 mã phiên lưu trong sessionStorage — tab khác/đóng tab = cache miss.
  const IDB_NAME = 'eduDataCache';
  const IDB_STORE = 'kv';
  let idbPromise = null;

  function openIdb() {
    if (!idbPromise) {
      idbPromise = new Promise((resolve) => {
        try {
          const req = global.indexedDB.open(IDB_NAME, 1);
          req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(null);
          req.onblocked = () => resolve(null);
        } catch (e) { resolve(null); }
      });
    }
    return idbPromise;
  }

  function idbRequest(mode, fn) {
    return openIdb().then((idb) => new Promise((resolve) => {
      if (!idb) return resolve(undefined);
      try {
        const req = fn(idb.transaction(IDB_STORE, mode).objectStore(IDB_STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(undefined);
      } catch (e) { resolve(undefined); }
    }));
  }

  function idbDelete(key) { return idbRequest('readwrite', (s) => s.delete(key)); }
  function idbClear() { return idbRequest('readwrite', (s) => s.clear()); }

  function sessionTag() {
    try {
      let tag = sessionStorage.getItem(PREFIX + '__session');
      if (!tag) {
        tag = Date.now().toString(36) + Math.random().toString(36).slice(2);
        sessionStorage.setItem(PREFIX + '__session', tag);
      }
      return tag;
    } catch (e) { return 'no-session-storage'; }
  }

  /** Như get() nhưng đọc từ IndexedDB (rơi về get() cho dữ liệu cũ còn trong storage).
   *  allowStale=true: trả về cả bản ĐÃ HẾT HẠN — chỉ dùng làm phương án cuối khi
   *  Firebase hết lượt đọc/mất mạng (trang vẫn chạy bằng dữ liệu cũ, kèm thông báo).
   *  Vì vậy bản hết hạn (persist) KHÔNG bị xoá khi đọc — lần ghi sau sẽ đè lên. */
  async function getAsync(key, persist, allowStale) {
    const entry = await idbRequest('readonly', (s) => s.get(key));
    if (entry) {
      const sameScope = persist || entry.tag === sessionTag();
      if (sameScope && (allowStale || Date.now() <= entry.expiresAt)) return entry.value;
      if (!sameScope) idbDelete(key);
      return null;
    }
    return allowStale ? null : get(key, persist);
  }

  /** Như set() nhưng lưu vào IndexedDB — không giới hạn ~5 triệu ký tự. */
  async function setAsync(key, value, ttlMs, persist) {
    // Xoá bản cũ trong localStorage/sessionStorage (nếu có) để trả lại quota cho trang.
    try { storageFor(persist).removeItem(PREFIX + key); } catch (e) { /* ignore */ }
    const entry = { value, expiresAt: Date.now() + ttlMs, tag: persist ? null : sessionTag() };
    const ok = await idbRequest('readwrite', (s) => s.put(entry, key));
    if (ok === undefined) set(key, value, ttlMs, persist); // IndexedDB bị chặn → thử storage thường
  }

  global.EduDataCache = { get, set, clear, clearAll, getAsync, setAsync };
})(window);
