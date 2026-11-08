/* Test bản đệm phía repository "users" (js/repositories/user-repository.js) — đo trên Firestore giả (multi.py):
   - Admin mở Quản lý tài khoản (đọc MỌI users) rồi Quản lý lớp/Dashboard: đọc lại 106 giáo viên đã duyệt dù vừa có đủ.
   - Lịch dạy: bảng Mã NV → tài khoản (chỉ để hiện ảnh đại diện) đọc lại cả danh sách giáo viên mỗi 12 giờ trên MỖI máy.
   Chạy: node js/repositories/__tests__/user-repository-cache.test.js — không gọi mạng thật. */
var path = require('path');

var failures = 0;
function assertEq(label, actual, expected) {
  var pass = JSON.stringify(actual) === JSON.stringify(expected);
  console.log((pass ? 'PASS' : 'FAIL') + '  ' + label + (pass ? '' : '  =>  ' + JSON.stringify(actual) + '  (expected ' + JSON.stringify(expected) + ')'));
  if (!pass) failures++;
}

globalThis.window = globalThis;
var now = 1e12;
Date.now = function () { return now; };
var ls = {};
globalThis.localStorage = { getItem: function (k) { return k in ls ? ls[k] : null; }, setItem: function (k, v) { ls[k] = String(v); }, removeItem: function (k) { delete ls[k]; } };
var mem = new Map();
globalThis.EduDataCache = {
  getAsync: function (k) { var e = mem.get(k); return Promise.resolve(e && now <= e.exp ? JSON.parse(JSON.stringify(e.v)) : null); },
  setAsync: function (k, v, ttl) { mem.set(k, { v: JSON.parse(JSON.stringify(v)), exp: now + ttl }); return Promise.resolve(); },
};
globalThis.firebase = { firestore: { FieldValue: { serverTimestamp: function () { return 'TS'; }, delete: function () { return null; } } } };

// Firestore giả: where ==, orderBy, limit; đếm lượt đọc như biểu phí. Không orderBy → theo id (như Firestore).
var DOCS = {
  u3: { name: 'Cô Ba', role: 'teacher', approved: true, teacherCode: 'GV03', createdAt: 3 },
  u1: { name: 'Thầy Một', role: 'teacher', approved: true, teacherCode: 'GV01', createdAt: 5 },
  u2: { name: 'Chưa duyệt', role: 'teacher', approved: false, teacherCode: 'GV02', createdAt: 4 },
  a1: { name: 'Admin', role: 'admin', approved: true, createdAt: 9 },
  c1: { name: 'Điều phối', role: 'coordinator', approved: true, createdAt: 1 },
  u4: { name: 'Chưa có mã', role: 'teacher', approved: true, createdAt: 2 },
};
var reads = 0, offline = false;
function query(st) {
  return {
    where: function (f, op, v) { return query(Object.assign({}, st, { where: st.where.concat([[f, v]]) })); },
    orderBy: function (f, dir) { return query(Object.assign({}, st, { orderBy: [f, dir] })); },
    limit: function (n) { return query(Object.assign({}, st, { limit: n })); },
    get: function () {
      var ids = Object.keys(DOCS).sort().filter(function (id) { return st.where.every(function (w) { return DOCS[id][w[0]] === w[1]; }); });
      if (st.orderBy) { var f = st.orderBy[0], s = st.orderBy[1] === 'desc' ? -1 : 1; ids.sort(function (a, b) { return s * (DOCS[a][f] - DOCS[b][f]); }); }
      if (st.limit) ids = ids.slice(0, st.limit);
      if (!offline) reads += Math.max(1, ids.length);
      return Promise.resolve({ metadata: { fromCache: offline }, docs: ids.map(function (id) { return { id: id, data: function () { return Object.assign({}, DOCS[id]); } }; }) });
    },
  };
}
globalThis.EduFirebase = {
  countSnap: function () {},
  db: { collection: function () { var q = query({ where: [] }); q.doc = function (id) { return { set: function (d) { DOCS[id] = Object.assign({}, DOCS[id], d); return Promise.resolve(); }, update: function () { return Promise.resolve(); } }; }; return q; } },
};

require(path.join(__dirname, '..', '..', 'models', 'school.model.js'));
require(path.join(__dirname, '..', 'base-repository.js'));
require(path.join(__dirname, '..', 'user-repository.js'));
var U = globalThis.EduRepositories.user;
var ids = function (l) { return l.map(function (x) { return x.id; }); };
var DAY = 24 * 60 * 60 * 1000;

(async function () {
  // ── Admin: listAll() đã có đủ giáo viên đã duyệt → listApprovedTeachers() không đọc lại ──
  var direct = ids(await U.list({ where: [['role', '==', 'teacher'], ['approved', '==', true]], limit: 1000 }));
  reads = 0;
  var all = await U.listAll();
  assertEq('listAll: đọc mọi tài khoản (6 lượt)', [reads, all.length], [6, 6]);
  var approved = await U.listApprovedTeachers();
  assertEq('ngay sau listAll → listApprovedTeachers 0 lượt đọc', reads, 6);
  assertEq('cùng nội dung + thứ tự như truy vấn thật (theo id)', ids(approved), direct);
  assertEq('đúng dữ liệu từng giáo viên', approved[0], { id: 'u1', name: 'Thầy Một', role: 'teacher', approved: true, teacherCode: 'GV01', createdAt: 5 });

  // Ghi users qua repository (đổi vai trò) → bản mồi cũ bỏ ngay
  await U.setRole('u2', 'teacher');
  reads = 0;
  var afterWrite = await U.listApprovedTeachers();
  assertEq('đổi vai trò/duyệt ở máy này → đọc lại, thấy giáo viên vừa duyệt', [reads > 0, ids(afterWrite)], [true, ['u1', 'u2', 'u3', 'u4']]);

  // listAll chạm trần (có thể thiếu tài khoản) → KHÔNG mồi
  mem.clear(); reads = 0;
  await U.list({ orderBy: 'createdAt', direction: 'desc', limit: 2 }); // không phải listAll → không mồi
  await U.listApprovedTeachers();
  assertEq('list() thường (không phải listAll) không mồi bản đệm', reads, 2 + 4);

  // Mất mạng: listAll lỗi → không mồi gì
  mem.clear(); offline = true;
  var failed = false;
  try { await U.listAll(); } catch (e) { failed = true; }
  offline = false; reads = 0;
  await U.listApprovedTeachers();
  assertEq('listAll lỗi (offline) → không mồi, lần sau đọc máy chủ', [failed, reads], [true, 4]);

  // ── Lịch dạy: Mã NV → uid, bản đệm dài (chỉ để hiện ảnh đại diện) ──
  mem.clear(); reads = 0;
  var map = await U.teacherCodeToUid({ cacheMs: 7 * DAY });
  assertEq('lần đầu: đọc danh sách giáo viên đã duyệt, chỉ giáo viên có mã', [reads, map], [4, { GV01: 'u1', GV02: 'u2', GV03: 'u3' }]);
  now += 13 * 60 * 60 * 1000; // quá bản đệm 10 phút của listApprovedTeachers và quá 12 giờ của bản cũ
  reads = 0;
  var again = await U.teacherCodeToUid({ cacheMs: 7 * DAY });
  assertEq('13 giờ sau (trong 7 ngày) → 0 lượt đọc, cùng bảng', [reads, again], [0, map]);
  assertEq('danh sách giáo viên cho Quản lý lớp KHÔNG bị kéo dài theo (vẫn đọc lại sau 10 phút)', [(await U.listApprovedTeachers()).length, reads], [4, 4]);

  reads = 0;
  await U.update('u4', { teacherCode: 'GV04' });
  DOCS.u4.teacherCode = 'GV04';
  var linked = await U.teacherCodeToUid({ cacheMs: 7 * DAY });
  assertEq('Admin gán mã NV ở máy này → bảng đọc lại ngay, có mã mới', [reads, linked.GV04], [4, 'u4']);
  now += 7 * DAY + 1; reads = 0;
  await U.teacherCodeToUid({ cacheMs: 7 * DAY });
  assertEq('quá 7 ngày → đọc lại', reads, 4);
  reads = 0;
  var plain = await U.teacherCodeToUid();
  assertEq('không truyền cacheMs → như cũ (qua listApprovedTeachers 10 phút)', [reads, plain.GV01], [0, 'u1']);

  console.log(failures ? '\n' + failures + ' FAIL' : '\nTất cả PASS');
  process.exit(failures ? 1 : 0);
})();
