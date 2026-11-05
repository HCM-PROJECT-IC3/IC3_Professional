/* Test bản đệm học sinh dùng chung (js/services/roster-cache-service.js).
   Chạy: node js/services/__tests__/roster-cache.test.js — không gọi mạng thật. */
var path = require('path');

var failures = 0;
function assertEq(label, actual, expected) {
  var pass = JSON.stringify(actual) === JSON.stringify(expected);
  console.log((pass ? 'PASS' : 'FAIL') + '  ' + label + '  =>  ' + JSON.stringify(actual) + (pass ? '' : '  (expected ' + JSON.stringify(expected) + ')'));
  if (!pass) failures++;
}

// EduDataCache giả: Map trong bộ nhớ, hỗ trợ allowStale (bản hết hạn vẫn đọc được khi allowStale)
globalThis.window = globalThis;
var mem = new Map();
var now = 1e12;
Date.now = function () { return now; };
globalThis.EduDataCache = {
  getAsync: function (k, persist, allowStale) {
    var e = mem.get(k);
    if (!e) return Promise.resolve(null);
    // structured clone của IndexedDB: Timestamp mất prototype, còn { seconds, nanoseconds }
    return Promise.resolve(allowStale || now <= e.expiresAt ? JSON.parse(JSON.stringify(e.value)) : null);
  },
  setAsync: function (k, v, ttl) { mem.set(k, { value: v, expiresAt: now + ttl }); return Promise.resolve(); },
  clear: function (k) { mem.delete(k); },
};

// Timestamp giả giống SDK (seconds/nanoseconds là field riêng của object)
function Ts(s, ns) { this.seconds = s; this.nanoseconds = ns; }
Ts.fromMillis = function (ms) { return new Ts(Math.floor(ms / 1000), (ms % 1000) * 1e6); };
var cmp = function (a, b) { return a.seconds - b.seconds || a.nanoseconds - b.nanoseconds; };
globalThis.firebase = { firestore: { Timestamp: Ts, FieldValue: { serverTimestamp: function () { return 'SERVER_TS'; } } } };

// Firestore giả: đếm lần đọc toàn bộ (where status) và lần hỏi phần thay đổi (where updatedAt)
var full = 0, delta = 0, offline = false, scoped = 0, scopedError = null;
var DOCS = [
  { id: 's1', name: 'An', school: 'A', status: 'active', updatedAt: new Ts(100, 500) },
  { id: 's2', name: 'Bình', school: 'B', status: 'active' }, // doc cũ chưa có updatedAt
];
function snapOf(list) {
  return { metadata: { fromCache: offline }, docs: list.map(function (d) { var c = Object.assign({}, d); delete c.id; return { id: d.id, data: function () { return c; } }; }) };
}
globalThis.EduFirebase = {
  countSnap: function () {},
  db: { collection: function () { return { where: function (field, op, val) {
    if (field === 'teacherId') {
      return { where: function (f2, o2, v2) { return { limit: function () { return { get: function () {
        if (scopedError) return Promise.reject(scopedError);
        scoped++;
        return Promise.resolve(snapOf(DOCS.filter(function (d) { return d.teacherId === val && d.updatedAt && cmp(d.updatedAt, v2) > 0; })));
      } }; } }; } };
    }
    return { limit: function () { return { get: function () {
    var list = field === 'status'
      ? (full++, DOCS.filter(function (d) { return d.status === val; }))
      : (delta++, DOCS.filter(function (d) { return d.updatedAt && cmp(d.updatedAt, val) > 0; }));
    return new Promise(function (resolve) { setTimeout(function () { resolve(snapOf(list)); }, 5); });
  } }; } }; } }; } },
};

require(path.join(__dirname, '..', '..', 'models', 'school.model.js'));
require(path.join(__dirname, '..', 'roster-cache-service.js'));
var R = globalThis.EduRosterCache;
var ids = function (list) { return list.map(function (s) { return s.id; }).sort(); };
var tick = function () { return new Promise(function (r) { setTimeout(r, 0); }); };

(async function () {
  var both = await Promise.all([R.activeAll(), R.activeAll()]);
  assertEq('2 trang hỏi cùng lúc → chỉ 1 lần đọc toàn bộ, dữ liệu { id, ...data }', [full, delta, both[0].length, both[1][1]], [1, 0, 2, { id: 's2', name: 'Bình', school: 'B', status: 'active' }]);
  await tick();
  await R.activeAll();
  assertEq('đã có bản đệm (trang khác mở sau) → 0 lượt đọc thêm', [full, delta], [1, 0]);

  now += R.TTL_MS + 1;
  var same = await R.activeAll();
  assertEq('quá hạn, không ai sửa → chỉ hỏi phần thay đổi (không đọc lại toàn bộ)', [full, delta, ids(same)], [1, 1, ['s1', 's2']]);

  // Máy khác: s2 nghỉ học, thêm s3 — cùng 1 lần ghi (cùng giây, khác nano)
  DOCS[1] = Object.assign({}, DOCS[1], { status: 'inactive', updatedAt: new Ts(200, 1) });
  DOCS.push({ id: 's3', name: 'Chi', school: 'A', status: 'active', updatedAt: new Ts(200, 2) });
  R.invalidate();
  await tick();
  var merged = await R.activeAll();
  assertEq('sau khi ghi (invalidate) → hỏi phần thay đổi: bỏ HS nghỉ, thêm HS mới', [full, delta, ids(merged)], [1, 2, ['s1', 's3']]);
  await tick();
  var stored = mem.get(R.ROSTER_KEY).value.watermark;
  assertEq('mốc đồng bộ = updatedAt mới nhất, giữ đủ nano giây', stored, [200, 2]);

  now += R.TTL_MS + 1;
  await R.activeAll({ maxAgeMs: 60 * 1000 });
  assertEq('"Làm mới" khi không có thay đổi → 1 lần hỏi, 0 doc', [full, delta], [1, 3]);

  now += R.FULL_RESYNC_MS;
  await R.activeAll();
  assertEq('quá 3 ngày từ lần đọc toàn bộ → đọc lại toàn bộ (bắt HS bị xoá hẳn)', [full, delta], [2, 3]);

  R.put([{ id: 'x', status: 'active', updatedAt: new Ts(300, 0) }], now, [250, 0]);
  var put = await R.activeAll();
  assertEq('put() từ trang Quản lý lớp → dùng luôn, 0 lượt đọc', [full, delta, put.length], [2, 3, 1]);
  assertEq('put() giữ mốc do trang gọi đưa (không lấy updatedAt của lần sửa lẻ)', mem.get(R.ROSTER_KEY).value.watermark, [250, 0]);

  mem.set(R.ROSTER_KEY, { value: { students: [{ id: 'old' }], cachedAt: 0 }, expiresAt: now + 1e9 });
  await R.activeAll();
  assertEq('bản đệm định dạng cũ (chưa có fullAt) → đọc toàn bộ 1 lần', [full, delta], [3, 3]);

  now += R.TTL_MS + 1;
  offline = true;
  var stale = await R.activeAll();
  assertEq('hết lượt đọc/mất mạng → dùng bản đệm cũ thay vì báo lỗi', [delta, ids(stale)], [4, ['s1', 's3']]);

  offline = false;
  // Giáo viên: chỉ hỏi phần thay đổi trong lớp mình
  DOCS.push({ id: 'g1', name: 'Giang', status: 'active', teacherId: 'gv', updatedAt: new Ts(500, 0) });
  var byTeacher = function (q) { return q.where('teacherId', '==', 'gv'); };
  var loads = 0;
  var loadAll = function () { loads++; return Promise.resolve(DOCS.filter(function (d) { return d.teacherId === 'gv' && d.status === 'active'; })); };
  var scope = { narrows: [byTeacher], loadAll: loadAll, label: 't' };
  var e1 = await R.scopedRoster(null, scope);
  assertEq('giáo viên lần đầu: đọc toàn bộ lớp mình', [loads, ids(e1.students)], [1, ['g1']]);
  var e2 = await R.scopedRoster(e1, scope);
  assertEq('giáo viên hết hạn, không ai sửa: 1 truy vấn thay đổi, không đọc toàn bộ', [loads, scoped, ids(e2.students)], [1, 1, ['g1']]);
  DOCS.push({ id: 'g2', name: 'Hà', status: 'active', teacherId: 'gv', updatedAt: new Ts(600, 0) });
  DOCS[DOCS.length - 2] = Object.assign({}, DOCS[DOCS.length - 2], { status: 'inactive', updatedAt: new Ts(601, 0) });
  var e3 = await R.scopedRoster(e2, scope);
  assertEq('giáo viên: thêm em mới, em nghỉ học bị bỏ', [loads, ids(e3.students)], [1, ['g2']]);
  now += R.SCOPED_FULL_MS;
  await R.scopedRoster(e3, scope);
  assertEq('giáo viên: 3 ngày đọc toàn bộ 1 lần (bắt em chuyển sang giáo viên khác)', loads, 2);
  var e4 = await R.scopedRoster(null, scope);
  scopedError = Object.assign(new Error('The query requires an index'), { code: 'failed-precondition' });
  var e5 = await R.scopedRoster(e4, scope);
  assertEq('chưa deploy index: tự đọc toàn bộ như cũ, không lỗi', [loads, ids(e5.students)], [4, ['g2']]);
  scopedError = Object.assign(new Error('offline'), { code: 'unavailable' });
  var thrown = null;
  try { await R.scopedRoster(e4, scope); } catch (err) { thrown = err.code; }
  assertEq('mất mạng: báo lỗi để trang dùng bản đã lưu, không đọc toàn bộ', [thrown, loads], ['unavailable', 4]);
  scopedError = null;

  // Ghi bù schoolId: máy khác đã xong → 5 lượt đọc thay vì đọc lại toàn bộ; ghi bù dở (đuôi còn thiếu) → phát hiện được
  var idOf = function (n) { return n.toLowerCase(); };
  var recs = Array.from({ length: 2800 }, function (_, i) { return { id: 'r' + i, school: 'A' }; });
  var asked = [];
  var serverDone = function (id) { asked.push(id); return Promise.resolve({ school: 'A', schoolId: 'a' }); };
  assertEq('ghi bù: máy khác đã xong → chỉ đọc 5 bản', [await R.alreadyStamped(recs, idOf, serverDone), asked.length, asked[4]], [true, 5, 'r2799']);
  assertEq('ghi bù: dừng dở ở bản 1200 → còn thiếu', await R.alreadyStamped(recs, idOf, function (id) { return Promise.resolve(+id.slice(1) < 1200 ? { school: 'A', schoolId: 'a' } : { school: 'A' }); }), false);
  assertEq('ghi bù: 1 bản ghi, bản đã bị xoá không tính là thiếu', await R.alreadyStamped([{ id: 'x' }], idOf, function () { return Promise.resolve(null); }), true);

  // Ghi bù: Huỷ không đọc toàn bộ; máy chủ đã đủ thì không hỏi
  var fullReads = 0, asks = 0;
  var readFull = function () { fullReads++; return Promise.resolve(recs); };
  var missing = function () { return Promise.resolve({ school: 'A' }); };
  var ask = function (yes) { return function () { asks++; return yes; }; };
  assertEq('ghi bù: bấm Huỷ → 0 lượt đọc toàn bộ', [await R.resolveUnstamped(recs, { idOf: idOf, readOne: missing, ask: ask(false), readFull: readFull }), fullReads, asks], [{ declined: true }, 0, 1]);
  assertEq('ghi bù: đồng ý → đọc toàn bộ đúng 1 lần', [(await R.resolveUnstamped(recs, { idOf: idOf, readOne: missing, ask: ask(true), readFull: readFull })).fresh.length, fullReads, asks], [2800, 1, 2]);
  assertEq('ghi bù: máy chủ đã đủ → không hỏi, không đọc toàn bộ', [await R.resolveUnstamped(recs, { idOf: idOf, readOne: serverDone, ask: ask(true), readFull: readFull }), fullReads, asks], [{ stamped: true }, 1, 2]);

  // Bấm "Làm mới dữ liệu" liên tục: đọc toàn bộ tối đa MANUAL_FULL_MS/lần
  var l0 = loads;
  var e6 = await R.scopedRoster(null, scope);
  var manual = Object.assign({}, scope, { fullMs: R.MANUAL_FULL_MS });
  now += R.MANUAL_FULL_MS - 1;
  var e7 = await R.scopedRoster(e6, manual);
  assertEq('làm mới trong 6 giờ: chỉ hỏi phần thay đổi', [loads - l0, e7.fullAt], [1, e6.fullAt]);
  now += 1;
  await R.scopedRoster(e7, manual);
  assertEq('làm mới sau 6 giờ: đọc toàn bộ', loads - l0, 2);

  var d = await R.deltaFrom({ students: [{ id: 'a' }], fullAt: now - R.FULL_RESYNC_MS, watermark: null });
  assertEq('deltaFrom: nền quá 3 ngày → null (nơi gọi đọc toàn bộ)', d, null);
  assertEq('stampRoster thêm updatedAt, không sửa object gốc', [R.stampRoster({ a: 1 }), Object.keys({ a: 1 })], [{ a: 1, updatedAt: 'SERVER_TS' }, ['a']]);
  assertEq('stampRoster kèm schoolId khi có tên trường', R.stampRoster({ school: 'THCS Lê Lợi' }), { school: 'THCS Lê Lợi', schoolId: 'thcs-le-loi', updatedAt: 'SERVER_TS' });

  // Công tắc tắt nhanh (js/backend-config.js → rosterDeltaSync: false): luôn đọc toàn bộ như trước
  offline = false;
  globalThis.EduBackend = { rosterDeltaSync: false };
  var f0 = full, d0 = delta;
  now += R.TTL_MS + 1;
  await R.activeAll();
  assertEq('tắt công tắc: quá hạn → đọc TOÀN BỘ, không hỏi phần thay đổi', [full - f0, delta - d0], [1, 0]);
  globalThis.EduBackend = { rosterDeltaSync: true };
  now += R.TTL_MS + 1;
  await R.activeAll();
  assertEq('bật lại: quay về hỏi phần thay đổi', [full - f0, delta - d0], [1, 1]);

  console.log(failures ? '\n' + failures + ' FAIL' : '\nTất cả PASS');
  process.exit(failures ? 1 : 0);
})();
