/* Test js/repositories/base-repository.js — tầng hạ tầng đổi dấu EduModels.SERVER_TIME của model thành
   FieldValue.serverTimestamp(), ghi theo lô qua commitBatch. Model không cần Firebase để chạy.
   Chạy: node js/repositories/__tests__/base-repository.test.js — Firestore giả, không gọi mạng. */
var path = require('path');

var failures = 0;
function assertEq(label, actual, expected) {
  var pass = JSON.stringify(actual) === JSON.stringify(expected);
  console.log((pass ? 'PASS' : 'FAIL') + '  ' + label + (pass ? '' : '  =>  ' + JSON.stringify(actual) + '  (expected ' + JSON.stringify(expected) + ')'));
  if (!pass) failures++;
}

globalThis.window = globalThis;
// Model nạp TRƯỚC khi có Firebase: không được đụng tới firebase.*
require(path.join(__dirname, '..', '..', 'models', 'teaching-schedule.model.js'));
require(path.join(__dirname, '..', '..', 'models', 'activity-log.model.js'));
var M = globalThis.EduModels;
var t = M.TeachingSchedule.buildTeacher({ code: ' GV01 ', name: 'Cô An' });
assertEq('model chạy không cần Firebase, chỉ đánh dấu thời điểm máy chủ', [t.code, t.createdAt === M.SERVER_TIME, M.ActivityLog.build({ action: 'x' }).createdAt === M.SERVER_TIME], ['GV01', true, true]);
assertEq('dấu SERVER_TIME dùng chung giữa các model, không sửa được', [Object.isFrozen(M.SERVER_TIME), M.SERVER_TIME.__eduServerTime], [true, true]);

// Firestore giả
var SERVER_TS = { sentinel: 'serverTimestamp' };
globalThis.firebase = { firestore: { FieldValue: { serverTimestamp: function () { return SERVER_TS; } } } };
var written = [], commits = 0;
function docRef(col, id) {
  return {
    col: col, id: id,
    set: function (d, o) { written.push({ op: 'set', col: col, id: id, d: d, merge: !!(o && o.merge) }); return Promise.resolve(); },
    update: function (d) { written.push({ op: 'update', col: col, id: id, d: d }); return Promise.resolve(); },
  };
}
globalThis.EduFirebase = {
  db: {
    collection: function (col) {
      return { doc: function (id) { return docRef(col, id); }, add: function (d) { written.push({ op: 'add', col: col, d: d }); return Promise.resolve({ id: 'auto1' }); } };
    },
    batch: function () {
      var ops = [];
      return { set: function (ref, d, o) { ops.push({ op: 'batch', col: ref.col, id: ref.id, d: d, merge: !!(o && o.merge) }); },
        commit: function () { commits++; written = written.concat(ops); return Promise.resolve(); } };
    },
  },
};
require(path.join(__dirname, '..', 'base-repository.js'));
var B = globalThis.EduBaseRepository;
var teachers = new B('teaching_teachers'), weeks = new B('teaching_weeks');

(async function () {
  var input = { name: 'Cô An', createdAt: M.SERVER_TIME };
  await teachers.createWithId('GV01', input);
  assertEq('repository đổi SERVER_TIME → serverTimestamp() khi ghi', written[0].d.createdAt === SERVER_TS, true);
  assertEq('không sửa object gốc của model', input.createdAt === M.SERVER_TIME, true);
  var plain = { name: 'x' };
  assertEq('dữ liệu không có dấu → giữ nguyên object (không sao chép thừa)', B.toStore(plain) === plain, true);
  await teachers.update('GV01', { updatedAt: M.SERVER_TIME });
  await teachers.upsert('GV02', { updatedAt: M.SERVER_TIME });
  await teachers.create({ createdAt: M.SERVER_TIME });
  assertEq('update / upsert / create cũng đổi dấu', written.slice(1).map(function (w) { return [w.op, (w.d.updatedAt || w.d.createdAt) === SERVER_TS]; }), [['update', true], ['set', true], ['add', true]]);

  written = [];
  var items = [];
  for (var i = 0; i < 1000; i++) items.push({ repo: i % 2 ? teachers : weeks, id: 'd' + i, data: { n: i, updatedAt: M.SERVER_TIME }, merge: i === 0 });
  var n = await B.commitBatch(items);
  assertEq('commitBatch: 1000 tài liệu → 3 lô (≤ 450/lô), đúng collection, đổi dấu, giữ merge',
    [n, commits, written.length, written[1].col, written[0].col, written.every(function (w) { return w.d.updatedAt === SERVER_TS; }), written[0].merge, written[1].merge],
    [1000, 3, 1000, 'teaching_teachers', 'teaching_weeks', true, true, false]);
  assertEq('commitBatch rỗng → 0 lô', [await B.commitBatch([]), commits], [0, 3]);

  console.log(failures ? '\n' + failures + ' test FAIL' : '\nTất cả test PASS');
  process.exit(failures ? 1 : 0);
})();
