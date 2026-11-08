/* Test mở DỒN trên cùng 1 máy (nhiều tab cùng lúc, F5 giữa lúc đang tải) — đo trên Firestore giả có độ trễ
   (scripts/measure-firestore/burst.py, 08/11/2026): Admin mở 5 tab Quản lý lớp cùng lúc = 15.776 lượt (1 tab: 3.258);
   F5 8 lần Quản lý tài khoản lúc đang tải = 25.097 lượt. Mỗi "tab" ở đây = 1 bản nạp module riêng, dùng CHUNG bản đệm
   (IndexedDB giả) và khoá Web Locks giả của máy. Chạy: node js/services/__tests__/tab-burst.test.js */
var path = require('path');

var failures = 0;
function assertEq(label, actual, expected) {
  var pass = JSON.stringify(actual) === JSON.stringify(expected);
  console.log((pass ? 'PASS' : 'FAIL') + '  ' + label + (pass ? '' : '  =>  ' + JSON.stringify(actual) + '  (expected ' + JSON.stringify(expected) + ')'));
  if (!pass) failures++;
}
var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

globalThis.window = globalThis;
var ls = {};
globalThis.localStorage = { getItem: function (k) { return k in ls ? ls[k] : null; }, setItem: function (k, v) { ls[k] = String(v); }, removeItem: function (k) { delete ls[k]; } };

// ── Web Locks giả (đúng ngữ nghĩa: hàng đợi theo tên, signal huỷ lúc đang chờ) ──
var queues = {};
function fakeLocks() {
  return {
    request: function (name, opts, cb) {
      if (typeof opts === 'function') { cb = opts; opts = {}; }
      return new Promise(function (resolve, reject) {
        var q = queues[name] = queues[name] || [];
        var entry = {};
        var done = function () { q.splice(q.indexOf(entry), 1); if (q.length) q[0].run(); };
        entry.run = function () { Promise.resolve().then(cb).then(function (v) { done(); resolve(v); }, function (e) { done(); reject(e); }); };
        if (opts.signal) opts.signal.addEventListener('abort', function () {
          var i = q.indexOf(entry);
          if (i > 0) { q.splice(i, 1); reject(Object.assign(new Error('aborted'), { name: 'AbortError' })); }
        });
        q.push(entry);
        if (q.length === 1) entry.run();
      });
    },
  };
}
Object.defineProperty(globalThis, 'navigator', { value: { locks: fakeLocks() }, configurable: true, writable: true });

// ── IndexedDB giả cho data-cache-service.js (chung mọi "tab"), ghi xong sau 1 nhịp như IndexedDB thật ──
var store = new Map();
function req(fn) { var r = {}; setTimeout(function () { r.result = fn(); if (r.onsuccess) r.onsuccess(); }, 1); return r; }
globalThis.indexedDB = {
  open: function () {
    var db = { transaction: function () { return { objectStore: function () { return {
      get: function (k) { return req(function () { var v = store.get(k); return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }); },
      put: function (v, k) { return req(function () { store.set(k, JSON.parse(JSON.stringify(v))); return k; }); },
      delete: function (k) { return req(function () { store.delete(k); }); },
    }; } }; } };
    var r = {}; setTimeout(function () { r.result = db; r.onsuccess(); }, 0); return r;
  },
};
globalThis.sessionStorage = { getItem: function () { return 'tab'; }, setItem: function () {}, removeItem: function () {} };

// ── Firestore giả: where ==, orderBy(__name__), startAfter, limit; độ trễ; đếm lượt; có thể "chết" giữa chừng (F5) ──
function Ts(s, ns) { this.seconds = s; this.nanoseconds = ns; }
Ts.fromMillis = function (ms) { return new Ts(Math.floor(ms / 1000), (ms % 1000) * 1e6); };
globalThis.firebase = { firestore: { Timestamp: Ts, FieldPath: { documentId: function () { return '__name__'; } }, FieldValue: { serverTimestamp: function () { return 'TS'; } } } };
var COLS = { students_roster: [], classes: [{ id: 'c1', name: 'A' }, { id: 'c2', name: 'B' }] };
for (var i = 0; i < 2500; i++) COLS.students_roster.push({ id: 's' + String(i).padStart(4, '0'), name: 'HS' + i, status: i % 10 ? 'active' : 'inactive', updatedAt: new Ts(1000 + (i * 7919) % 2500, 0) });
var reads = 0, queries = 0, killAfter = Infinity;
function q(col, st) {
  return {
    where: function (f, op, v) { return q(col, Object.assign({}, st, { where: (st.where || []).concat([[f, v]]) })); },
    orderBy: function (f) { return q(col, Object.assign({}, st, { orderBy: f })); },
    limit: function (n) { return q(col, Object.assign({}, st, { limit: n })); },
    startAfter: function (id) { return q(col, Object.assign({}, st, { after: id })); },
    get: function () {
      if (queries >= killAfter) return new Promise(function () {}); // tab bị F5: truy vấn không bao giờ trả về
      queries++;
      var rows = COLS[col].filter(function (d) { return (st.where || []).every(function (w) { return d[w[0]] === w[1]; }); });
      if (st.orderBy === '__name__') rows.sort(function (a, b) { return a.id < b.id ? -1 : 1; });
      else if (st.orderBy) rows.sort(function (a, b) { return a[st.orderBy] < b[st.orderBy] ? -1 : 1; });
      if (st.after) rows = rows.filter(function (d) { return d.id > st.after; });
      if (st.limit) rows = rows.slice(0, st.limit);
      reads += Math.max(1, rows.length);
      return sleep(30).then(function () {
        return { metadata: { fromCache: false }, size: rows.length, docs: rows.map(function (d) { var c = Object.assign({}, d); delete c.id; return { id: d.id, data: function () { return c; } }; }) };
      });
    },
  };
}
globalThis.EduFirebase = { countSnap: function () {}, db: { collection: function (c) { return q(c, {}); } } };

function load(rel) {
  var p = path.join(__dirname, '..', '..', rel);
  delete require.cache[require.resolve(p)];
  require(p);
}
load('services/data-cache-service.js');
load('models/school.model.js');
function newTab() { // 1 tab = bản nạp module riêng (biến trong module riêng), dùng chung EduDataCache/khoá/IndexedDB
  load('services/roster-cache-service.js');
  load('repositories/base-repository.js');
  return { R: globalThis.EduRosterCache, B: globalThis.EduBaseRepository };
}

(async function () {
  var C = globalThis.EduDataCache;

  // ── EduDataCache.exclusive: chỉ 1 tab chạy 1 lúc theo tên ──
  var order = [];
  await Promise.all([
    C.exclusive('k', async function () { order.push('a+'); await sleep(20); order.push('a-'); }),
    C.exclusive('k', async function () { order.push('b+'); await sleep(5); order.push('b-'); }),
    C.exclusive('khac', async function () { order.push('c'); }),
  ]);
  assertEq('cùng tên → lần lượt; khác tên → chạy ngay', order, ['a+', 'c', 'a-', 'b+', 'b-']);
  var hung = C.exclusive('treo', function () { return new Promise(function () {}); }); // tab giữ khoá bị treo (mạng đứng)
  var t0 = Date.now();
  var ran = await C.exclusive('treo', async function () { return 'chay'; }, { waitMs: 50 });
  assertEq('chờ khoá quá waitMs → tự chạy (không treo theo tab khác)', [ran, Date.now() - t0 < 1000], ['chay', true]);
  void hung;
  var saved = globalThis.navigator;
  Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true, writable: true });
  assertEq('trình duyệt không có Web Locks → chạy luôn', await C.exclusive('x', async function () { return 1; }), 1);
  Object.defineProperty(globalThis, 'navigator', { value: saved, configurable: true, writable: true });

  // ── 5 tab cùng mở trang Admin, bản đệm học sinh còn trống → chỉ 1 lần đọc toàn bộ ──
  var tabs = [newTab(), newTab(), newTab(), newTab(), newTab()];
  reads = 0;
  var lists = await Promise.all(tabs.map(function (t) { return t.R.activeAll(); }));
  var active = COLS.students_roster.filter(function (s) { return s.status === 'active'; }).length;
  assertEq('5 tab cùng lúc → đọc toàn bộ đúng 1 lần (' + active + ' HS đang học)', [reads <= active + 3, lists.map(function (l) { return l.length; })], [true, [active, active, active, active, active]]);

  // ── BaseRepository.list({ cacheMs }) ở 3 tab cùng lúc → 1 lần đọc ──
  reads = 0;
  var cls = await Promise.all([newTab(), newTab(), newTab()].map(function (t) { return new t.B('classes').list({ orderBy: 'name', cacheMs: 600000 }); }));
  assertEq('3 tab hỏi danh sách lớp cùng lúc → 1 lần đọc', [reads, cls.map(function (l) { return l.length; })], [2, [2, 2, 2]]);

  // ── Đọc toàn bộ theo từng phần + lưu tiến độ: F5 giữa chừng không đọc lại từ đầu ──
  var t = newTab();
  var all = COLS.students_roster.length;
  reads = 0; queries = 0; killAfter = 2; // tab đọc được 2 phần thì bị F5
  var dead = t.R.pagedRead('test-all', function () { return globalThis.EduFirebase.db.collection('students_roster'); }, 'test', { pageSize: 1000 });
  void dead;
  await sleep(200);
  var firstTry = reads;
  killAfter = Infinity; queries = 0;
  var t2 = newTab(); // trang tải lại
  var res = await t2.R.pagedRead('test-all', function () { return globalThis.EduFirebase.db.collection('students_roster'); }, 'test', { pageSize: 1000 });
  assertEq('F5 sau 2 phần → lần tải sau chỉ đọc phần còn lại', [firstTry, reads - firstTry], [2000, all - 2000]);
  assertEq('kết quả ghép đủ, không trùng', [res.docs.length, new Set(res.docs.map(function (d) { return d.id; })).size], [all, all]);
  // Mốc delta an toàn: không lớn hơn updatedAt lớn nhất của PHẦN ĐẦU (đọc sớm nhất) — thay đổi xảy ra sau khi đọc phần
  // đầu vẫn được lần hỏi phần thay đổi bắt lại.
  var firstPage = COLS.students_roster.slice().sort(function (a, b) { return a.id < b.id ? -1 : 1; }).slice(0, 1000);
  var firstMax = firstPage.reduce(function (m, d) { return Math.max(m, d.updatedAt.seconds); }, 0);
  assertEq('mốc delta = updatedAt lớn nhất của phần đầu', res.watermark, [firstMax, 0]);
  reads = 0;
  var again = await t2.R.pagedRead('test-all', function () { return globalThis.EduFirebase.db.collection('students_roster'); }, 'test', { pageSize: 1000 });
  assertEq('đọc xong thì xoá tiến độ — lần sau đọc mới từ đầu', [reads, again.docs.length], [all, all]);

  // Bản dở quá hạn (10 phút) → bỏ, đọc lại từ đầu (dữ liệu quá cũ để ghép)
  reads = 0; queries = 0; killAfter = 1;
  t.R.pagedRead('cu', function () { return globalThis.EduFirebase.db.collection('students_roster'); }, 'test', { pageSize: 1000 });
  await sleep(200);
  killAfter = Infinity;
  var realNow = Date.now; var shift = 11 * 60 * 1000;
  Date.now = function () { return realNow() + shift; };
  reads = 0;
  await newTab().R.pagedRead('cu', function () { return globalThis.EduFirebase.db.collection('students_roster'); }, 'test', { pageSize: 1000 });
  Date.now = realNow;
  assertEq('bản dở quá 10 phút → đọc lại từ đầu', reads, all);

  // activeAll đọc toàn bộ theo phần (F5 lúc Admin đang tải bản đệm chung)
  store.clear();
  reads = 0; queries = 0; killAfter = 1;
  newTab().R.activeAll();
  await sleep(200);
  killAfter = Infinity;
  var before = reads;
  var list = await newTab().R.activeAll();
  assertEq('activeAll: F5 giữa chừng → tải lại chỉ đọc phần còn thiếu', [before, reads - before, list.length], [1000, active - 1000, active]);

  console.log(failures ? '\n' + failures + ' FAIL' : '\nTất cả PASS');
  process.exit(failures ? 1 : 0);
})();
