/* ============================================================
   js/services/schedule-read-cache.js
   Cache ĐỌC cho trang Lịch giảng dạy (teaching-schedule.html).

   Trước: mỗi lần mở trang đọc lại cả đội — giáo viên + MỌI tuần + lịch/TKB/giờ
   tiết của tuần đang xem (~110 lượt đọc Firestore/lần mở). ~18 giáo viên mở vài
   lần/ngày ≈ 10.000 lượt/ngày (20% hạn mức Spark).
   Giờ: kết quả lưu IndexedDB (js/services/data-cache-service.js) TTL_MS; mở lại
   trong khoảng đó = 0 lượt đọc.

   Không thấy dữ liệu cũ sau khi chính máy này sửa: MỌI thao tác ghi vào
   collection teaching_* trên trang (doc.set/update/delete, collection.add,
   batch.commit — dù từ module nào) đều xoá sạch cache này ngay. Sửa từ MÁY KHÁC
   thì tối đa TTL_MS sau mới thấy (nút tải lại trang vẫn đọc từ cache trong
   thời gian đó — chấp nhận để giữ hạn mức).

   Nạp SAU firebase SDK + js/services/data-cache-service.js, TRƯỚC js/teaching-*.js.
   ============================================================ */
(function (global) {
  'use strict';

  const TTL_MS = 10 * 60 * 1000;
  const PREFIX = 'schedule-read:';
  const KEYS_INDEX = PREFIX + '__keys';

  function cache() { return global.EduDataCache || null; }
  // Xoá IndexedDB là bất đồng bộ: tab vừa ghi thì từ đó luôn đọc thẳng máy chủ (không
  // phụ thuộc thứ tự transaction), chắc chắn thấy đúng dữ liệu mình vừa lưu.
  let bypass = false;

  function rememberKey(key) {
    try {
      const keys = new Set(JSON.parse(localStorage.getItem(KEYS_INDEX) || '[]'));
      keys.add(key);
      localStorage.setItem(KEYS_INDEX, JSON.stringify([...keys]));
    } catch (e) { /* storage bị chặn: cache vẫn hết hạn theo TTL */ }
  }

  // Gộp yêu cầu TRÙNG đang chạy: lúc mở trang 4 module (Lịch tuần, TKB, Báo cáo, Xăng xe)
  // cùng hỏi danh sách tuần khi cache còn trống → trước đây đọc máy chủ 4 lần.
  const inflight = new Map();

  /** Đọc qua cache: còn hạn → trả bản lưu (0 lượt Firestore); hết → loader() rồi lưu. */
  function read(key, loader) {
    if (inflight.has(key)) return inflight.get(key);
    const p = readNow(key, loader).finally(() => inflight.delete(key));
    inflight.set(key, p);
    return p;
  }

  async function readNow(key, loader) {
    const C = cache();
    const fullKey = PREFIX + key;
    if (C && !bypass) {
      const hit = await C.getAsync(fullKey, true);
      if (hit !== null && hit !== undefined) return hit;
    }
    const value = await loader();
    if (C) {
      rememberKey(fullKey);
      C.setAsync(fullKey, value, TTL_MS, true);
    }
    return value;
  }

  function invalidate() {
    bypass = true;
    inflight.clear();
    const C = cache();
    if (!C) return;
    let keys = [];
    try { keys = JSON.parse(localStorage.getItem(KEYS_INDEX) || '[]'); } catch (e) { keys = []; }
    keys.forEach((k) => C.clear(k, true));
    try { localStorage.removeItem(KEYS_INDEX); } catch (e) { /* ignore */ }
  }

  // ── Xoá cache khi có ghi vào teaching_* ──
  function installWriteHooks() {
    const fs = global.firebase && global.firebase.firestore;
    if (!fs || fs.__scheduleCacheHooked) return;
    fs.__scheduleCacheHooked = true;
    const isSchedulePath = (path) => /^teaching_/.test(String(path || ''));
    const wrap = (proto, method, pathOf) => {
      if (!proto || typeof proto[method] !== 'function') return;
      const original = proto[method];
      proto[method] = function () {
        const result = original.apply(this, arguments);
        if (pathOf(this)) Promise.resolve(result).then(invalidate, invalidate);
        return result;
      };
    };
    const docPath = (ref) => isSchedulePath(ref && ref.path);
    wrap(fs.DocumentReference && fs.DocumentReference.prototype, 'set', docPath);
    wrap(fs.DocumentReference && fs.DocumentReference.prototype, 'update', docPath);
    wrap(fs.DocumentReference && fs.DocumentReference.prototype, 'delete', docPath);
    wrap(fs.CollectionReference && fs.CollectionReference.prototype, 'add', docPath);
    // Batch không lộ đường dẫn từng thao tác — trang này chỉ ghi dữ liệu lịch nên xoá luôn.
    wrap(fs.WriteBatch && fs.WriteBatch.prototype, 'commit', () => true);
  }

  installWriteHooks();
  global.EduScheduleReadCache = { read, invalidate, TTL_MS };
})(window);
