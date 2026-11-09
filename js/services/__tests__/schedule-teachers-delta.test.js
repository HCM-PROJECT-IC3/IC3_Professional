/* Test danh sách giáo viên chỉ đọc phần thay đổi (EduScheduleReadCache.readDelta / teachers).
   Chạy: node js/services/__tests__/schedule-teachers-delta.test.js — không gọi mạng thật. */
var path = require('path');

var failures = 0;
function assertEq(label, actual, expected) {
  var pass = JSON.stringify(actual) === JSON.stringify(expected);
  console.log((pass ? 'PASS' : 'FAIL') + '  ' + label + '  =>  ' + JSON.stringify(actual) + (pass ? '' : '  (expected ' + JSON.stringify(expected) + ')'));
  if (!pass) failures++;
}

// Môi trường tối thiểu: localStorage + EduDataCache (Map trong bộ nhớ) + firebase compat giả.
var store = {};
globalThis.window = globalThis;
globalThis.localStorage = {
  getItem: function (k) { return k in store ? store[k] : null; },
  setItem: function (k, v) { store[k] = String(v); },
  removeItem: function (k) { delete store[k]; },
};
var mem = new Map();
globalThis.EduDataCache = {
  getAsync: function (k) { return Promise.resolve(mem.has(k) ? mem.get(k) : null); },
  setAsync: function (k, v) { mem.set(k, v); return Promise.resolve(); },
  clear: function (k) { mem.delete(k); },
};
function DocumentReference(p) { this.path = p; }
DocumentReference.prototype.set = function () { return Promise.resolve(); };
DocumentReference.prototype.update = function () { return Promise.resolve(); };
DocumentReference.prototype.delete = function () { return Promise.resolve(); };
function CollectionReference(p) { this.path = p; }
CollectionReference.prototype.add = function () { return Promise.resolve(); };
function WriteBatch() {}
WriteBatch.prototype.commit = function () { return Promise.resolve(); };
WriteBatch.prototype.set = function () { return this; };
globalThis.firebase = { firestore: { DocumentReference: DocumentReference, CollectionReference: CollectionReference, WriteBatch: WriteBatch } };

require(path.join(__dirname, '..', 'schedule-read-cache.js'));
var RC = globalThis.EduScheduleReadCache;

(async function () {
  var H = 60 * 60 * 1000;
  // ── Danh sách giáo viên: chỉ đọc phần thay đổi ──
  globalThis.firebase.firestore.Timestamp = { fromMillis: function (ms) { return { seconds: Math.floor(ms / 1e3), nanoseconds: (ms % 1e3) * 1e6, ms: ms }; } };
  var ts = function (ms) { return { seconds: Math.floor(ms / 1e3), nanoseconds: 0 }; };
  var T0 = Date.UTC(2026, 10, 9, 1, 0);
  var server = [{ id: 'B', name: 'Bình' }, { id: 'A', name: 'An', updatedAt: ts(T0 - 864e5) }];
  var nFull = 0, nSince = 0, lastSince = null, clock = T0;
  var o = {
    now: function () { return clock; },
    full: function () { nFull++; return Promise.resolve(server.slice().sort(function (a, b) { return a.name < b.name ? -1 : 1; })); },
    since: function (t) { nSince++; lastSince = t.ms; return Promise.resolve(server.filter(function (d) { return d.updatedAt && d.updatedAt.seconds * 1e3 > t.ms; })); },
  };
  mem.clear();
  var l1 = await RC.readDelta('teachers', o);
  assertEq('lần đầu: đọc đủ', [nFull, nSince, l1.map(function (d) { return d.id; })], [1, 0, ['A', 'B']]);
  clock = T0 + 30 * 60e3;
  await RC.readDelta('teachers', o);
  assertEq('trong 1 giờ: 0 lượt', [nFull, nSince], [1, 0]);
  clock = T0 + 2 * H;
  server.push({ id: 'C', name: 'Chi', updatedAt: ts(T0 + H) });
  server[0] = { id: 'B', name: 'Bình Mới', updatedAt: ts(T0 + H + 5000) };
  var l3 = await RC.readDelta('teachers', o);
  assertEq('quá 1 giờ: chỉ hỏi phần thay đổi', [nFull, nSince, lastSince], [1, 1, T0 - 864e5]);
  assertEq('… gộp GV mới + GV vừa sửa, sắp theo tên', l3.map(function (d) { return d.name; }), ['An', 'Bình Mới', 'Chi']);
  clock = T0 + 4 * H;
  await RC.readDelta('teachers', o);
  assertEq('mốc mới = updatedAt lớn nhất đã thấy', lastSince, T0 + H + 5000);
  clock = T0 + 7 * 24 * H + H;
  server = server.filter(function (d) { return d.id !== 'C'; });
  var l5 = await RC.readDelta('teachers', o);
  assertEq('quá 7 ngày: đọc đủ (bắt GV bị xoá)', [nFull, l5.map(function (d) { return d.id; })], [2, ['A', 'B']]);
  var mNo = RC.mergeDelta({ list: [{ id: 'X', name: 'X' }], watermark: 0, fullAt: 1 }, [], 9);
  assertEq('doc cũ chưa có updatedAt: không gãy', [mNo.list.length, mNo.watermark, mNo.checkedAt], [1, 0, 9]);
  mem.clear();
  server = [{ id: 'Z', name: 'Zed' }];
  clock = T0 + 8 * 24 * H;
  await RC.readDelta('teachers', o);
  clock += 2 * H; lastSince = null;
  await RC.readDelta('teachers', o);
  assertEq('chưa doc nào có dấu: mốc = lúc đọc đủ − 10 phút', lastSince, T0 + 8 * 24 * H - 10 * 60e3);
  clock += 2 * H;
  var failing = Object.assign({}, o, { since: function () { return Promise.reject(new Error('offline')); } });
  assertEq('mất mạng khi hỏi phần thay đổi: dùng bản đã lưu', (await RC.readDelta('teachers', failing)).map(function (d) { return d.id; }), ['Z']);
  await new DocumentReference('teaching_teachers/Z').update({});
  var nBefore = nFull;
  await RC.readDelta('teachers', o);
  assertEq('ghi GV ở máy này: đọc đủ ngay', nFull, nBefore + 1);

  console.log(failures ? '\n' + failures + ' test FAIL' : '\nTất cả PASS');
  process.exit(failures ? 1 : 0);
})();
