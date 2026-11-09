/* Test phần "chỉ đọc phần thay đổi" cho trang Admin (10/11/2026):
   - users: mọi lệnh ghi qua repository đóng dấu updatedAt; changedSince gộp tài khoản tạo mới + vừa sửa.
   - teaching_teachers: ghi qua repository đóng dấu updatedAt.
   - schools: listAll() qua bản đệm dùng chung (cacheMs); tạo trường mới bỏ bản đệm.
   Chạy: node js/repositories/__tests__/admin-delta.test.js — Firestore giả, không gọi mạng. */
var path = require('path');

var failures = 0;
function assertEq(label, actual, expected) {
  var pass = JSON.stringify(actual) === JSON.stringify(expected);
  console.log((pass ? 'PASS' : 'FAIL') + '  ' + label + (pass ? '' : '  =>  ' + JSON.stringify(actual) + '  (expected ' + JSON.stringify(expected) + ')'));
  if (!pass) failures++;
}

globalThis.window = globalThis;
var store = {};
globalThis.localStorage = { getItem: function (k) { return k in store ? store[k] : null; }, setItem: function (k, v) { store[k] = String(v); }, removeItem: function (k) { delete store[k]; } };
require(path.join(__dirname, '..', '..', 'models', 'school.model.js'));
require(path.join(__dirname, '..', '..', 'models', 'teaching-schedule.model.js'));
require(path.join(__dirname, '..', '..', 'models', 'roster.model.js'));

var SERVER_TS = { sentinel: 'serverTimestamp' };
globalThis.firebase = { firestore: { FieldValue: { serverTimestamp: function () { return SERVER_TS; }, delete: function () { return { sentinel: 'delete' }; } } } };
var written = [], queries = [];
var DATA = {
  users: [{ id: 'a', role: 'teacher', createdAt: 5 }, { id: 'b', role: 'teacher', updatedAt: 7 }],
  schools: [{ id: 'truong-2', name: 'Trường 2' }, { id: 'truong-1', name: 'Trường 1' }],
};
function query(col, filters) {
  return {
    where: function (f, op, v) { return query(col, filters.concat([[f, op, v]])); },
    orderBy: function () { return this; },
    limit: function () { return this; },
    get: function () {
      queries.push(col + (filters.length ? ' where ' + filters.map(function (x) { return x[0] + x[1]; }).join('&') : ''));
      var rows = (DATA[col] || []).filter(function (d) { return filters.every(function (x) { return x[1] === '>' ? (d[x[0]] || 0) > x[2] : x[1] === 'in' ? x[2].indexOf(d[x[0]]) >= 0 : d[x[0]] === x[2]; }); });
      return Promise.resolve({ metadata: { fromCache: false }, docs: rows.map(function (d) { return { id: d.id, data: function () { var o = Object.assign({}, d); delete o.id; return o; } }; }) });
    },
  };
}
globalThis.EduFirebase = {
  db: {
    collection: function (col) {
      var q = query(col, []);
      q.doc = function (id) { return { set: function (d, o) { written.push({ col: col, id: id, d: d, merge: !!(o && o.merge) }); return Promise.resolve(); }, update: function (d) { written.push({ col: col, id: id, d: d, op: 'update' }); return Promise.resolve(); } }; };
      return q;
    },
    batch: function () { var ops = []; return { set: function (ref, d) { ops.push(d); }, commit: function () { written.push({ batch: ops.length }); return Promise.resolve(); } }; },
  },
};
var mem = new Map();
globalThis.EduDataCache = {
  getAsync: function (k) { return Promise.resolve(mem.has(k) ? JSON.parse(JSON.stringify(mem.get(k))) : null); },
  setAsync: function (k, v) { mem.set(k, v); return Promise.resolve(); },
  clear: function (k) { mem.delete(k); },
};
require(path.join(__dirname, '..', 'base-repository.js'));
require(path.join(__dirname, '..', 'user-repository.js'));
require(path.join(__dirname, '..', 'teaching-schedule-repository.js'));
require(path.join(__dirname, '..', 'school-repository.js'));
require(path.join(__dirname, '..', 'roster-repository.js'));
var R = globalThis.EduRepositories;

(async function () {
  // ── users ──
  await R.user.setRole('u1', 'coordinator');
  await R.user.setSchools('u2', ['Trường 1']);
  await R.user.setTeacherCode('u3', 'GV01');
  assertEq('users: setRole/setSchools/setTeacherCode đều đóng dấu updatedAt', written.map(function (w) { return w.d.updatedAt === SERVER_TS; }), [true, true, true]);
  assertEq('… giữ nguyên dữ liệu ghi', [written[0].d.role, written[1].d.schoolIds, written[2].d.teacherCode], ['coordinator', ['truong-1'], 'GV01']);
  written = []; queries = [];
  var ch = await R.user.changedSince(4, 6);
  assertEq('changedSince: 2 truy vấn (tạo mới + vừa sửa)', queries.sort(), ['users where createdAt>', 'users where updatedAt>']);
  assertEq('… gộp không trùng', ch.map(function (u) { return u.id; }).sort(), ['a', 'b']);
  DATA.users.push({ id: 'c', createdAt: 9, updatedAt: 9 });
  assertEq('… tài khoản vừa tạo + vừa sửa chỉ 1 lần', (await R.user.changedSince(8, 8)).map(function (u) { return u.id; }), ['c']);

  // ── teaching_teachers ──
  written = [];
  await R.teachingTeacher.update('GV01', { name: 'Cô An' });
  await R.teachingTeacher.createWithId('GV02', globalThis.EduModels.TeachingSchedule.buildTeacher({ code: 'GV02', name: 'Thầy Bình' }));
  assertEq('teaching_teachers: sửa + tạo đóng dấu updatedAt', written.map(function (w) { return w.d.updatedAt === SERVER_TS; }), [true, true]);

  // ── schools ──
  queries = [];
  var s1 = await R.school.listAll();
  var s2 = await R.school.listAll();
  assertEq('schools: lần 2 lấy bản đệm (0 lượt)', [queries.length, s1.map(function (s) { return s.name; }), s2.length], [1, ['Trường 1', 'Trường 2'], 2]);
  await R.school.listAll({ refresh: true });
  assertEq('refresh: đọc lại', queries.length, 2);
  await R.school.ensureFromNames(['Trường 3']);
  queries = [];
  DATA.schools.push({ id: 'truong-3', name: 'Trường 3' });
  var s3 = await R.school.listAll();
  assertEq('tạo trường mới → bỏ bản đệm, đọc lại thấy trường mới', [queries.length, s3.length], [1, 3]);

  // ── classes: nhân sự trường chỉ đọc lớp trường mình ──
  DATA.classes = [];
  for (var i = 0; i < 30; i++) DATA.classes.push({ id: 'c' + i, name: 'Lớp ' + (29 - i), school: 'Trường ' + (i % 15) });
  queries = [];
  var mine = await R.class.listForSchools(['Trường 3', 'Trường 7']);
  assertEq('lớp: chỉ trường được gán', mine.map(function (c) { return c.school; }).sort(), ['Trường 3', 'Trường 3', 'Trường 7', 'Trường 7']);
  assertEq('… 1 truy vấn school in, sắp theo tên', [queries, mine.map(function (c) { return c.name; })], [['classes where schoolin'], ['Lớp 11', 'Lớp 22', 'Lớp 26', 'Lớp 7']]);
  queries = [];
  var many = await R.class.listForSchools(['Trường 0', 'Trường 1', 'Trường 2', 'Trường 3', 'Trường 4', 'Trường 5', 'Trường 6', 'Trường 7', 'Trường 8', 'Trường 9', 'Trường 10', 'Trường 11']);
  assertEq('> 10 trường: chia nhiều truy vấn, không trùng', [queries.length, many.length], [2, 24]);
  queries = [];
  assertEq('chưa gán trường: 0 lớp, 0 lượt', [(await R.class.listForSchools([])).length, queries.length], [0, 0]);
  assertEq('Admin (null): mọi lớp', (await R.class.listForSchools(null)).length, 30);

  console.log(failures ? '\n' + failures + ' test FAIL' : '\nTất cả PASS');
  process.exit(failures ? 1 : 0);
})();
