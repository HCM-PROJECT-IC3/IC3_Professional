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
   batch.commit — dù từ module nào) đều xoá ngay các khoá liên quan tới document đó
   (affected()). Trước 04/11/2026 lưu 1 ô lịch là xoá SẠCH cache kể cả giáo viên, các tuần
   cũ, và tab đó đọc thẳng máy chủ tới khi đóng → tab Báo cáo/Xăng xe đọc lại hàng trăm
   lượt. Sửa từ MÁY KHÁC thì tối đa TTL_MS sau mới thấy (nút tải lại trang vẫn đọc từ
   cache trong thời gian đó — chấp nhận để giữ hạn mức).

   Thời hạn theo loại dữ liệu (ttlFor): tuần ĐÃ QUA gần như không ai sửa → 12 giờ (tab Báo
   cáo/Xăng xe đọc nhiều tuần cũ: trước đây mỗi 10 phút đọc lại T lượt/tuần); danh sách giáo
   viên, giờ tiết 1 giờ; danh sách tuần 30 phút; tuần hiện tại/tới vẫn 10 phút. Số lượt đọc mỗi
   lần mở trang tăng theo số giáo viên × số lần mở, nên phần không đổi phải giữ lâu.
   Nạp SAU firebase SDK + js/services/data-cache-service.js, TRƯỚC js/teaching-*.js.
   ============================================================ */
(function (global) {
  'use strict';

  const TTL_MS = 10 * 60 * 1000;
  const HOUR = 60 * 60 * 1000;
  const STATIC_TTL = { teachers: HOUR, periodTimes: HOUR, weeks: 30 * 60 * 1000 };
  const PAST_WEEK_TTL_MS = 12 * HOUR;
  const WEEK_KEYED = /^(schedule|timetable):(\d{4})-(\d{2})-(\d{2})$/;
  const SUGGEST_KEY = /-by-teacher:/; // gợi ý từ lịch cũ của 1 giáo viên: đọc cả năm học, không cần tươi

  /** Thời hạn bản lưu cho 1 khoá (now: ms, để test). weekKey = ngày thứ Hai đầu tuần "YYYY-MM-DD". */
  function ttlFor(key, now) {
    if (STATIC_TTL[key]) return STATIC_TTL[key];
    if (SUGGEST_KEY.test(key)) return HOUR;
    const m = WEEK_KEYED.exec(key);
    if (m) {
      const weekEnd = new Date(+m[2], +m[3] - 1, +m[4] + 7).getTime(); // 0 giờ thứ Hai tuần sau (giờ máy)
      if (weekEnd <= (now || Date.now())) return PAST_WEEK_TTL_MS;
    }
    return TTL_MS;
  }
  const PREFIX = 'schedule-read:';
  const KEYS_INDEX = PREFIX + '__keys';

  function cache() { return global.EduDataCache || null; }
  // Xoá IndexedDB là bất đồng bộ: khoá tab vừa ghi thì từ đó luôn đọc thẳng máy chủ (không
  // phụ thuộc thứ tự transaction), chắc chắn thấy đúng dữ liệu mình vừa lưu.
  const bypass = [];
  // Khoá vừa được ghi lại bằng dữ liệu đúng của chính tab này (put) sau lệnh ghi: dùng bản đệm lại bình thường.
  // Trước 10/11/2026: lưu lịch 1 giáo viên là cả tuần đó đọc thẳng máy chủ tới khi đóng tab — đổi tuần qua lại
  // mỗi lần 120 lượt (lịch + TKB của cả đội). Lệnh ghi kế tiếp chạm khoá này lại bỏ ghim (invalidate).
  const pinned = new Set();
  const bypassed = (key) => !pinned.has(key) && bypass.some((match) => match(key));

  /** Khoá bị ảnh hưởng khi ghi document `path` (khoá chưa có tiền tố PREFIX). Collection lạ: mọi khoá. */
  function affected(path) {
    const [col, id] = String(path || '').split('/');
    const week = (/\d{4}-\d{2}-\d{2}/.exec(id || '') || [])[0];
    const data = (word) => (k) => k.includes(word) && (!week || k.includes(week) || SUGGEST_KEY.test(k));
    switch (col) {
      case 'teaching_teachers': return (k) => k === 'teachers' || k === 'teachers~delta' || k.startsWith('doc:teacher:');
      case 'teaching_weeks': return (k) => k === 'weeks';
      case 'teaching_timetable_periods': return (k) => k === 'periodTimes' || k.startsWith('doc:periods:');
      case 'teaching_schedule': return data('schedule');
      case 'teaching_timetable': return data('timetable');
      case 'teaching_travel_distances': return () => false; // không đọc qua cache này
      default: return () => true;
    }
  }

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
    const usable = () => C && !bypassed(key);
    if (usable()) {
      const hit = await C.getAsync(fullKey, true);
      if (hit !== null && hit !== undefined) return hit;
    }
    // Mở DỒN (08/11/2026, burst.py): 5 tab Lịch dạy cùng lúc = 761 lượt (1 tab: 253) — tab nào cũng thấy bản đệm trống.
    // Khoá theo khoá đệm: 1 tab đọc + lưu xong, tab khác kiểm lại rồi dùng bản đó.
    const run = async () => {
      if (usable()) {
        const hit = await C.getAsync(fullKey, true);
        if (hit !== null && hit !== undefined) return hit;
      }
      const value = await loader();
      if (C) {
        rememberKey(fullKey);
        await C.setAsync(fullKey, value, ttlFor(key), true);
      }
      return value;
    };
    return C && C.exclusive && usable() ? C.exclusive(fullKey, run) : run();
  }

  /** Xoá các khoá khớp match (bỏ trống = mọi khoá). */
  function invalidate(match) {
    const hit = match || (() => true);
    bypass.push(hit);
    [...pinned].forEach((k) => { if (hit(k)) pinned.delete(k); });
    inflight.clear();
    const C = cache();
    if (!C) return;
    let keys = [];
    try { keys = JSON.parse(localStorage.getItem(KEYS_INDEX) || '[]'); } catch (e) { keys = []; }
    const gone = keys.filter((k) => hit(k.slice(PREFIX.length)));
    gone.forEach((k) => C.clear(k, true));
    try { localStorage.setItem(KEYS_INDEX, JSON.stringify(keys.filter((k) => !gone.includes(k)))); } catch (e) { /* ignore */ }
  }

  /** Ghi thẳng giá trị ĐÚNG (trang tự dựng từ dữ liệu đang có + phần vừa lưu) vào khoá — 0 lượt đọc lại.
   *  Gọi SAU khi lệnh ghi Firestore xong (móc ghi đã bỏ khoá này). */
  async function put(key, value) {
    const C = cache();
    if (!C) return;
    pinned.add(key);
    inflight.delete(key);
    rememberKey(PREFIX + key);
    await C.setAsync(PREFIX + key, value, ttlFor(key), true);
  }
  /** Bản đệm còn hạn của khoá, KHÔNG đọc máy chủ khi chưa có (null). */
  async function peek(key) {
    const C = cache();
    if (!C || bypassed(key)) return null;
    const hit = await C.getAsync(PREFIX + key, true);
    return hit === undefined ? null : hit;
  }

  // ── Xoá cache khi có ghi vào teaching_* ──
  function installWriteHooks() {
    const fs = global.firebase && global.firebase.firestore;
    if (!fs || fs.__scheduleCacheHooked) return;
    fs.__scheduleCacheHooked = true;
    const isSchedulePath = (path) => /^teaching_/.test(String(path || ''));
    const wrap = (proto, method, matchOf) => {
      if (!proto || typeof proto[method] !== 'function') return;
      const original = proto[method];
      proto[method] = function () {
        const match = matchOf(this, arguments);
        const result = original.apply(this, arguments);
        if (match) { const drop = () => invalidate(match); Promise.resolve(result).then(drop, drop); }
        return result;
      };
    };
    const docMatch = (ref) => (ref && isSchedulePath(ref.path) ? affected(ref.path) : null);
    wrap(fs.DocumentReference && fs.DocumentReference.prototype, 'set', docMatch);
    wrap(fs.DocumentReference && fs.DocumentReference.prototype, 'update', docMatch);
    wrap(fs.DocumentReference && fs.DocumentReference.prototype, 'delete', docMatch);
    wrap(fs.CollectionReference && fs.CollectionReference.prototype, 'add', docMatch);
    // Batch: nhớ document từng lệnh ghi; commit mới xoá đúng các khoá đó. Không nhớ được gì: xoá hết cho chắc.
    const batchPaths = new WeakMap();
    const noteBatch = (batch, args) => {
      const ref = args[0];
      if (ref && ref.path) batchPaths.set(batch, (batchPaths.get(batch) || []).concat(ref.path));
      return null;
    };
    const batchProto = fs.WriteBatch && fs.WriteBatch.prototype;
    ['set', 'update', 'delete'].forEach((m) => wrap(batchProto, m, noteBatch));
    wrap(batchProto, 'commit', (batch) => {
      const paths = batchPaths.get(batch);
      if (!paths) return () => true;
      const matches = paths.filter(isSchedulePath).map(affected);
      batchPaths.delete(batch);
      return matches.length ? (k) => matches.some((match) => match(k)) : null;
    });
  }

  // ── Danh sách giáo viên: đồng bộ PHẦN THAY ĐỔI (09/11/2026) ──
  // Đo (measure_all, giáo viên t3): bản đệm 'teachers' hết hạn 1 giờ → mở lại sau 1 giờ / hôm sau đọc lại đủ ~60 doc.
  // 50 GV × 3–4 lần mở cách nhau/ngày ≈ 9.000 lượt/ngày chỉ để lấy danh sách gần như không đổi.
  // Nay: đọc đủ DELTA_FULL_MS/lần (bắt GV bị xoá + doc cũ chưa có updatedAt); giữa các lần, quá DELTA_FRESH_MS thì chỉ hỏi
  // doc có updatedAt mới hơn mốc đã thấy (không ai sửa = 1 lượt). Mọi lệnh ghi teaching_teachers đóng dấu updatedAt
  // (EduRepositories.teachingTeacher + nhập Excel). Ghi ở máy này: bỏ bản đệm (affected 'teachers~delta') → đọc đủ ngay.
  const DELTA_FRESH_MS = HOUR;
  // 7 ngày như hồ sơ (profile-cache-service): chỉ admin xoá được GV và máy admin thấy ngay; máy khác thấy GV bị xoá
  // muộn nhất 7 ngày (thêm/sửa vẫn thấy sau ≤ 1 giờ).
  const DELTA_FULL_MS = 7 * 24 * HOUR;
  const DELTA_KEEP_MS = 30 * 24 * HOUR;
  const DELTA_MARGIN_MS = 10 * 60 * 1000; // chưa doc nào có updatedAt: mốc = lúc đọc đủ trừ lệch đồng hồ máy/máy chủ
  const msOf = (v) => (v && typeof v.seconds === 'number' ? v.seconds * 1e3 + Math.floor((Number(v.nanoseconds) || 0) / 1e6) : (typeof v === 'number' ? v : 0));
  const maxStamp = (list) => (list || []).reduce((m, d) => Math.max(m, msOf(d && d.updatedAt)), 0);
  const byName = (a, b) => (String(a.name || '') < String(b.name || '') ? -1 : String(a.name || '') > String(b.name || '') ? 1 : 0);

  /**
   * Gộp phần thay đổi vào danh sách đã lưu (thuần — test được). entry: { list, watermark, fullAt, checkedAt }.
   * → entry mới (doc cùng id thay bằng bản mới, doc mới thêm vào, sắp theo tên như orderBy('name')).
   */
  function mergeDelta(entry, changes, now) {
    const byId = new Map((entry.list || []).map((d) => [d.id, d]));
    (changes || []).forEach((d) => byId.set(d.id, d));
    return {
      list: [...byId.values()].sort(byName),
      watermark: Math.max(entry.watermark || 0, maxStamp(changes)),
      fullAt: entry.fullAt,
      checkedAt: now,
    };
  }

  /**
   * Đọc qua bản đệm delta. o = { full: () => Promise<list>, since: (Timestamp) => Promise<list thay đổi>, now? }.
   * Lỗi mạng khi hỏi phần thay đổi → dùng bản đã lưu (cũ còn hơn trống).
   */
  function readDelta(key, o) {
    const k = key + '~delta';
    if (inflight.has(k)) return inflight.get(k);
    const p = readDeltaNow(k, o).finally(() => inflight.delete(k));
    inflight.set(k, p);
    return p;
  }
  async function readDeltaNow(k, o) {
    const C = cache(), fullKey = PREFIX + k, now = (o.now || Date.now)();
    const store = async (entry) => { if (C) { rememberKey(fullKey); await C.setAsync(fullKey, entry, DELTA_KEEP_MS, true); } return entry.list; };
    const loadFull = async () => {
      const list = await o.full();
      return store({ list, watermark: maxStamp(list) || now - DELTA_MARGIN_MS, fullAt: now, checkedAt: now });
    };
    if (!C || bypassed(k)) return loadFull();
    const run = async () => {
      const e = await C.getAsync(fullKey, true);
      if (!e || !Array.isArray(e.list) || now - (e.fullAt || 0) >= DELTA_FULL_MS) return loadFull();
      if (now - (e.checkedAt || 0) < DELTA_FRESH_MS) return e.list;
      const TS = global.firebase && global.firebase.firestore && global.firebase.firestore.Timestamp;
      if (!TS) return loadFull();
      let changes;
      try { changes = await o.since(TS.fromMillis(e.watermark || 0)); } catch (err) { return e.list; }
      return store(mergeDelta(e, changes, now));
    };
    return C.exclusive ? C.exclusive(fullKey, run) : run();
  }

  /** Danh sách giáo viên (teaching_teachers) theo tên — dùng chung Lịch tuần, TKB, Xăng xe. */
  function teachers() {
    const repo = global.EduRepositories && global.EduRepositories.teachingTeacher;
    return readDelta('teachers', {
      full: () => repo.list({ orderBy: 'name' }),
      since: (ts) => repo.list({ where: [['updatedAt', '>', ts]], limit: 1000 }),
    });
  }

  installWriteHooks();
  global.EduScheduleReadCache = { read, put, peek, invalidate, ttlFor, TTL_MS, readDelta, mergeDelta, teachers, DELTA_FRESH_MS, DELTA_FULL_MS };
})(window);
