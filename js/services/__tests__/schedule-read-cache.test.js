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
WriteBatch.prototype.set = function () { return this; };
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

  // Lưu lịch 1 giáo viên 1 tuần: chỉ mất phần của tuần đó
  var old = 0;
  function oldLoader() { old++; return Promise.resolve(['x' + old]); }
  await Promise.all(['teachers', 'schedule:2026-10-12', 'schedule:2026-10-19', 'timetable:2026-10-19', 'doc:schedule:GV01__2026-10-19', 'schedule-by-teacher:GV01', 'doc:periods:GV01']
    .map(function (k) { return RC.read(k, oldLoader); }));
  old = 0;
  await new DocumentReference('teaching_schedule/GV01__2026-10-19').set({});
  await Promise.all(['teachers', 'schedule:2026-10-12', 'timetable:2026-10-19', 'doc:periods:GV01'].map(function (k) { return RC.read(k, oldLoader); }));
  assertEq('lưu lịch 1 tuần: giáo viên, tuần khác, TKB, giờ tiết vẫn dùng bản đệm', old, 0);
  await Promise.all(['schedule:2026-10-19', 'doc:schedule:GV01__2026-10-19', 'schedule-by-teacher:GV01'].map(function (k) { return RC.read(k, oldLoader); }));
  assertEq('lưu lịch 1 tuần: đúng phần tuần đó đọc lại máy chủ', old, 3);

  // Ghi theo lô: chỉ xoá document trong lô; lô không phải lịch thì giữ nguyên
  old = 0;
  await RC.read('timetable:2026-11-02', oldLoader);
  var b1 = new WriteBatch();
  b1.set(new DocumentReference('users/abc'), {});
  await b1.commit();
  await RC.read('timetable:2026-11-02', oldLoader);
  assertEq('lô không ghi teaching_*: cache giữ nguyên', old, 1);
  var b2 = new WriteBatch();
  b2.set(new DocumentReference('teaching_timetable/GV01__2026-11-02'), {});
  await b2.commit();
  await RC.read('timetable:2026-11-02', oldLoader);
  await RC.read('schedule:2026-10-12', oldLoader);
  assertEq('lô ghi TKB: đọc lại đúng tuần đó, khoá khác còn', old, 2);

  await new DocumentReference('teaching_weeks/2026-10-19').set({});
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
  assertEq('khoá khác: 10 phút', RC.ttlFor('doc:schedule:GV01__2026-10-26', now), RC.TTL_MS);
  assertEq('gợi ý theo giáo viên: 1 giờ', [RC.ttlFor('schedule-by-teacher:GV01', now), RC.ttlFor('timetable-by-teacher:GV01', now)], [3600000, 3600000]);

  // put sau khi lưu: tuần vừa lưu dùng lại bản đệm (trước: đọc thẳng máy chủ tới khi đóng tab)
  var n = 0;
  function weekLoader() { n++; return Promise.resolve(['server' + n]); }
  await RC.read('schedule:2026-11-09', weekLoader);
  await new DocumentReference('teaching_schedule/GV01__2026-11-09').set({});
  await new Promise(function (r) { setTimeout(r, 0); });
  assertEq('peek sau khi ghi: không có bản đệm', await RC.peek('schedule:2026-11-09'), null);
  await RC.put('schedule:2026-11-09', ['local-after-save']);
  assertEq('put: đọc lại lấy bản vừa ghi, 0 lượt máy chủ', [await RC.read('schedule:2026-11-09', weekLoader), n], [['local-after-save'], 1]);
  assertEq('peek: trả bản đệm, không gọi máy chủ', [await RC.peek('schedule:2026-11-09'), n], [['local-after-save'], 1]);
  await new DocumentReference('teaching_schedule/GV02__2026-11-09').set({});
  await new Promise(function (r) { setTimeout(r, 0); });
  assertEq('lệnh ghi kế tiếp: bỏ ghim, đọc máy chủ lại', [await RC.read('schedule:2026-11-09', weekLoader), n], [['server2'], 2]);
  assertEq('peek khoá chưa có: null', await RC.peek('schedule:2030-01-06'), null);

  console.log(failures ? '\n' + failures + ' test FAIL' : '\nTất cả PASS');
  process.exit(failures ? 1 : 0);
})();
