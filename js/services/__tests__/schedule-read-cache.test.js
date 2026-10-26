/* Test cache đọc Lịch giảng dạy (js/services/schedule-read-cache.js).
   Chạy: node js/services/__tests__/schedule-read-cache.test.js — không gọi mạng thật. */
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
globalThis.firebase = { firestore: { DocumentReference: DocumentReference, CollectionReference: CollectionReference, WriteBatch: WriteBatch } };

require(path.join(__dirname, '..', 'schedule-read-cache.js'));
var RC = globalThis.EduScheduleReadCache;

var calls = 0;
function loader() { calls++; return Promise.resolve(['row' + calls]); }

(async function () {
  // 4 module cùng hỏi 1 khoá lúc cache còn trống → chỉ 1 lượt đọc máy chủ.
  var slow = 0;
  function slowLoader() { slow++; return new Promise(function (r) { setTimeout(function () { r(['w']); }, 20); }); }
  var four = await Promise.all([1, 2, 3, 4].map(function () { return RC.read('weeks-race', slowLoader); }));
  assertEq('4 yêu cầu song song: 1 lượt đọc', [slow, four.length], [1, 4]);

  assertEq('lần đầu: đọc máy chủ', await RC.read('weeks', loader), ['row1']);
  assertEq('lần sau: lấy từ cache, không đọc lại', [await RC.read('weeks', loader), calls], [['row1'], 1]);

  await new DocumentReference('users/abc').set({});
  assertEq('ghi collection khác teaching_*: cache giữ nguyên', [await RC.read('weeks', loader), calls], [['row1'], 1]);

  await new DocumentReference('teaching_schedule/2026-10-19_GV01').set({});
  assertEq('ghi teaching_*: cache bị xoá, đọc lại máy chủ', [await RC.read('weeks', loader), calls], [['row2'], 2]);
  assertEq('tab đã ghi: luôn đọc thẳng máy chủ', [await RC.read('weeks', loader), calls], [['row3'], 3]);

  var before = mem.size;
  await new WriteBatch().commit();
  assertEq('batch.commit: xoá cache', [before > 0, mem.size], [true, 0]);

  // Thời hạn theo loại dữ liệu
  var now = new Date(2026, 9, 28, 9, 0).getTime(); // thứ Tư 28/10/2026
  var H = 60 * 60 * 1000;
  assertEq('tuần đã qua: giữ 12 giờ', [RC.ttlFor('schedule:2026-10-19', now), RC.ttlFor('timetable:2026-09-07', now)], [12 * H, 12 * H]);
  assertEq('tuần hiện tại/tới: 10 phút', [RC.ttlFor('schedule:2026-10-26', now), RC.ttlFor('schedule:2026-11-02', now)], [RC.TTL_MS, RC.TTL_MS]);
  assertEq('giáo viên/giờ tiết 1 giờ, danh sách tuần 30 phút', [RC.ttlFor('teachers'), RC.ttlFor('periodTimes'), RC.ttlFor('weeks')], [H, H, 30 * 60 * 1000]);
  assertEq('khoá khác: 10 phút', RC.ttlFor('schedule-by-teacher:GV01', now), RC.TTL_MS);

  console.log(failures ? '\n' + failures + ' test FAIL' : '\nTất cả PASS');
  process.exit(failures ? 1 : 0);
})();
