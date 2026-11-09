/* Test repository "users" (js/repositories/user-repository.js).
   Chạy: node js/repositories/__tests__/user-repository.test.js — Firestore giả, không gọi mạng. */
var path = require('path');

var failures = 0;
function assertEq(label, actual, expected) {
  var pass = JSON.stringify(actual) === JSON.stringify(expected);
  console.log((pass ? 'PASS' : 'FAIL') + '  ' + label + '  =>  ' + JSON.stringify(actual) + (pass ? '' : '  (expected ' + JSON.stringify(expected) + ')'));
  if (!pass) failures++;
}

globalThis.window = globalThis;
var DELETE = { __delete: true };
var STAMP = { __serverTimestamp: true };
globalThis.firebase = { firestore: { FieldValue: { delete: function () { return DELETE; }, serverTimestamp: function () { return STAMP; } } } };

// Firestore giả: ghi lại query cuối cùng + các lệnh set(merge)
var DOCS = {
  t1: { name: 'Cô An', role: 'teacher', approved: true, teacherCode: 'GV01', createdAt: 3 },
  t2: { name: 'Thầy Bình', role: 'teacher', approved: true, createdAt: 2 },
  t3: { name: 'Chưa duyệt', role: 'teacher', approved: false, teacherCode: 'GV03', createdAt: 1 },
  a1: { name: 'Admin', role: 'admin', approved: true, createdAt: 4 },
};
var lastQuery = null, writes = [], offline = false;
function query(state) {
  return {
    where: function (f, op, v) { return query(Object.assign({}, state, { where: state.where.concat([[f, op, v]]) })); },
    orderBy: function (f, dir) { return query(Object.assign({}, state, { orderBy: [f, dir] })); },
    limit: function (n) { return query(Object.assign({}, state, { limit: n })); },
    get: function () {
      lastQuery = state;
      var ids = Object.keys(DOCS).filter(function (id) {
        return state.where.every(function (w) { return DOCS[id][w[0]] === w[2]; });
      });
      if (state.orderBy) {
        var f = state.orderBy[0], s = state.orderBy[1] === 'desc' ? -1 : 1;
        ids.sort(function (a, b) { return s * (DOCS[a][f] - DOCS[b][f]); });
      }
      ids = ids.slice(0, state.limit);
      return Promise.resolve({
        metadata: { fromCache: offline },
        docs: ids.map(function (id) { return { id: id, data: function () { return Object.assign({}, DOCS[id]); } }; }),
      });
    },
  };
}
globalThis.EduFirebase = {
  db: {
    collection: function (name) {
      var q = query({ col: name, where: [], limit: null });
      q.doc = function (id) {
        return { set: function (data, opts) { writes.push({ col: name, id: id, data: data, merge: !!(opts && opts.merge) }); return Promise.resolve(); } };
      };
      return q;
    },
  },
};

require(path.join(__dirname, '..', '..', 'models', 'school.model.js'));
require(path.join(__dirname, '..', 'base-repository.js'));
require(path.join(__dirname, '..', 'user-repository.js'));
var repo = globalThis.EduRepositories.user;

(async function () {
  // 1. Giáo viên đã duyệt: đúng query rules cho phép (role + approved, limit ≤ 1000)
  var teachers = await repo.listApprovedTeachers();
  assertEq('listApprovedTeachers: chỉ GV đã duyệt', teachers.map(function (t) { return t.id; }).sort(), ['t1', 't2']);
  assertEq('listApprovedTeachers: query khớp firestore.rules', lastQuery.where, [['role', '==', 'teacher'], ['approved', '==', true]]);
  assertEq('listApprovedTeachers: limit ≤ 1000', lastQuery.limit <= 1000, true);
  assertEq('listApprovedTeachers: có id + dữ liệu', teachers.find(function (t) { return t.id === 't1'; }).name, 'Cô An');

  // 2. Map Mã NV → uid: bỏ GV không có mã và GV chưa duyệt
  assertEq('teacherCodeToUid', await repo.teacherCodeToUid(), { GV01: 't1' });

  // 3. Admin: toàn bộ, mới tạo trước
  var all = await repo.listAll();
  assertEq('listAll: mới tạo trước', all.map(function (u) { return u.id; }), ['a1', 't1', 't2', 't3']);
  assertEq('listAll: limit ≤ 1000', lastQuery.limit <= 1000, true);
  assertEq('listAll: collection users', lastQuery.col, 'users');

  // 4. Ghi luôn merge, không ghi đè cả hồ sơ
  writes = [];
  await repo.setRole('t3', 'coordinator');
  await repo.setSchools('t1', ['THCS A', 'THCS B']);
  await repo.setTeacherCode('t2', 'GV02');
  await repo.setTeacherCode('t1', '');
  assertEq('setRole: kèm duyệt, merge, đóng dấu updatedAt', writes[0], { col: 'users', id: 't3', data: { role: 'coordinator', approved: true, updatedAt: STAMP }, merge: true });
  assertEq('setSchools: merge, kèm schoolIds', writes[1], { col: 'users', id: 't1', data: { schools: ['THCS A', 'THCS B'], schoolIds: ['thcs-a', 'thcs-b'], updatedAt: STAMP }, merge: true });
  assertEq('setTeacherCode: merge', writes[2], { col: 'users', id: 't2', data: { teacherCode: 'GV02', updatedAt: STAMP }, merge: true });
  assertEq('setTeacherCode rỗng: xoá field', writes[3].data.teacherCode === DELETE, true);

  // 5. Tạo hồ sơ (nhập GV từ Excel): set KHÔNG merge, id = uid
  writes = [];
  await repo.createWithId('new1', { name: 'GV mới', role: 'teacher', approved: true });
  assertEq('createWithId: không merge', writes[0].merge, false);

  // 6. SDK offline (hoặc hết lượt đọc) → báo lỗi thay vì trả danh sách rỗng từ cache
  offline = true;
  var code = null;
  try { await repo.listApprovedTeachers(); } catch (e) { code = e.code; }
  assertEq('offline → lỗi unavailable', code, 'unavailable');
  offline = false;

  console.log(failures ? '\n' + failures + ' FAIL' : '\nTất cả PASS');
  process.exit(failures ? 1 : 0);
})();
