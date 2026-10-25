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
    return Promise.resolve(allowStale || now <= e.expiresAt ? e.value : null);
  },
  setAsync: function (k, v, ttl) { mem.set(k, { value: v, expiresAt: now + ttl }); return Promise.resolve(); },
  clear: function (k) { mem.delete(k); },
};
// Firestore giả: đếm số lần đọc toàn bộ students_roster
var reads = 0, offline = false;
var DOCS = [{ id: 's1', name: 'An', school: 'A', status: 'active' }, { id: 's2', name: 'Bình', school: 'B', status: 'active' }];
globalThis.EduFirebase = {
  countSnap: function () {},
  db: { collection: function () { return { where: function () { return { limit: function () { return { get: function () {
    reads++;
    return new Promise(function (resolve) {
      setTimeout(function () {
        resolve({ metadata: { fromCache: offline }, docs: DOCS.map(function (d) { var c = Object.assign({}, d); delete c.id; return { id: d.id, data: function () { return c; } }; }) });
      }, 5);
    });
  } }; } }; } }; } },
};

require(path.join(__dirname, '..', 'roster-cache-service.js'));
var R = globalThis.EduRosterCache;

(async function () {
  var both = await Promise.all([R.activeAll(), R.activeAll()]);
  assertEq('2 trang hỏi cùng lúc → chỉ 1 lần đọc, cùng dữ liệu { id, ...data }', [reads, both[0].length, both[1][0]], [1, 2, { id: 's1', name: 'An', school: 'A', status: 'active' }]);
  await new Promise(function (r) { setTimeout(r, 0); });
  await R.activeAll();
  assertEq('đã có bản đệm (trang khác mở sau) → 0 lượt đọc thêm', reads, 1);
  now += 2 * 60 * 60 * 1000;
  await R.activeAll({ maxAgeMs: 30 * 60 * 1000 });
  assertEq('"Làm mới" với tuổi tối đa 30 phút → bản 2 giờ tuổi bị đọc lại', reads, 2);
  R.invalidate();
  await R.activeAll();
  assertEq('sau khi ghi students_roster (invalidate) → đọc lại', reads, 3);
  R.put([{ id: 'x', status: 'active' }]);
  var put = await R.activeAll();
  assertEq('put() từ trang Quản lý lớp → dùng luôn, 0 lượt đọc', [reads, put.length], [3, 1]);
  now += 7 * 60 * 60 * 1000; // quá hạn 6 giờ
  offline = true;
  var stale = await R.activeAll();
  assertEq('hết lượt đọc/mất mạng → dùng bản đệm cũ thay vì báo lỗi', [reads, stale[0].id], [4, 'x']);
  console.log(failures ? '\n' + failures + ' FAIL' : '\nTất cả PASS');
  process.exit(failures ? 1 : 0);
})();
