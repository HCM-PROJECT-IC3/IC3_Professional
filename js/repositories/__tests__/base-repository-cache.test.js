/* Test bản đệm dùng chung của BaseRepository.list({ cacheMs }) — js/repositories/base-repository.js.
   Cùng 1 danh sách nhỏ (lớp, giáo viên đã duyệt...) bị nhiều trang quản lý đọc lại từng trang một: đo trên Firestore giả,
   coordinator mở 2 trang tốn 656 lượt trong đó 256 là đọc trùng. Chạy: node js/repositories/__tests__/base-repository-cache.test.js */
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
// localStorage giả (chung mọi "tab" trong test)
var ls = {};
globalThis.localStorage = { getItem: function (k) { return k in ls ? ls[k] : null; }, setItem: function (k, v) { ls[k] = String(v); }, removeItem: function (k) { delete ls[k]; } };
// EduDataCache giả: hết hạn theo đồng hồ giả, structured clone qua JSON (Timestamp mất prototype như IndexedDB)
var mem = new Map();
globalThis.EduDataCache = {
  getAsync: function (k) { var e = mem.get(k); return Promise.resolve(e && now <= e.exp ? JSON.parse(JSON.stringify(e.v)) : null); },
  setAsync: function (k, v, ttl) { mem.set(k, { v: v, exp: now + ttl }); return Promise.resolve(); },
};
// Firestore giả: đếm lượt đọc (số doc, tối thiểu 1) và lần ghi
var reads = 0, queries = 0, offline = false, DATA = { classes: [{ id: 'c1', name: 'A' }, { id: 'c2', name: 'B' }], users: [{ id: 'u1', role: 'teacher' }] };
function snapOf(col) {
  var list = DATA[col];
  return { metadata: { fromCache: offline }, docs: list.map(function (d) { var c = Object.assign({}, d); delete c.id; return { id: d.id, data: function () { return c; } }; }) };
}
function query(col, state) {
  var q = {
    where: function (f, o, v) { return query(col, Object.assign({}, state, { where: (state.where || []).concat([[f, o, v]]) })); },
    orderBy: function (f) { return query(col, Object.assign({}, state, { orderBy: f })); },
    limit: function () { return q; },
    get: function () { queries++; var s = snapOf(col); if (!offline) reads += Math.max(1, s.docs.length); return Promise.resolve(s); },
  };
  return q;
}
var writes = 0;
globalThis.EduFirebase = {
  countSnap: function () {},
  db: {
    collection: function (col) {
      var q = query(col, {});
      q.doc = function (id) { return { col: col, id: id, set: function () { writes++; return Promise.resolve(); }, update: function () { writes++; return Promise.resolve(); }, delete: function () { writes++; return Promise.resolve(); } }; };
      q.add = function () { writes++; return Promise.resolve({ id: 'x' }); };
      return q;
    },
    batch: function () { return { set: function () {}, commit: function () { writes++; return Promise.resolve(); } }; },
  },
};
globalThis.firebase = { firestore: { FieldValue: { serverTimestamp: function () { return 'TS'; } } } };
require(path.join(__dirname, '..', 'base-repository.js'));
var B = globalThis.EduBaseRepository;
var TTL = 10 * 60 * 1000;
var ids = function (l) { return l.map(function (x) { return x.id; }); };

(async function () {
  var classesA = new B('classes'), classesB = new B('classes'); // 2 trang = 2 đối tượng cùng collection
  var a1 = await classesA.list({ orderBy: 'name', cacheMs: TTL });
  assertEq('lần đầu: đọc máy chủ', [reads, ids(a1)], [2, ['c1', 'c2']]);
  var b1 = await classesB.list({ orderBy: 'name', cacheMs: TTL });
  assertEq('trang khác cùng điều kiện trong hạn → 0 lượt đọc, cùng dữ liệu', [reads, ids(b1)], [2, ['c1', 'c2']]);

  await classesA.list({ orderBy: 'name' });
  assertEq('không truyền cacheMs → luôn đọc máy chủ (hành vi cũ giữ nguyên)', reads, 4);
  await classesA.list({ cacheMs: TTL });
  assertEq('điều kiện khác (không orderBy) → bản đệm riêng, đọc máy chủ', reads, 6);

  var both = await Promise.all([classesA.list({ orderBy: 'name', cacheMs: TTL, refresh: true }), classesB.list({ orderBy: 'name', cacheMs: TTL, refresh: true })]);
  assertEq('2 nơi hỏi cùng lúc (refresh) → chỉ 1 lần đọc', [reads, ids(both[0]).length, ids(both[1]).length], [8, 2, 2]);
  var q0 = queries;
  await classesB.list({ orderBy: 'name', cacheMs: TTL });
  assertEq('refresh vẫn lưu bản mới cho nơi khác dùng → 0 lượt đọc', queries - q0, 0);

  now += TTL + 1;
  var r0 = reads;
  await classesA.list({ orderBy: 'name', cacheMs: TTL });
  assertEq('quá hạn → đọc lại máy chủ', reads - r0, 2);

  // Ghi qua repository → bản đệm cũ bỏ ngay (cả ở đối tượng repository khác cùng collection)
  var warm = reads;
  await classesB.list({ orderBy: 'name', cacheMs: TTL });
  assertEq('(đang có bản đệm)', reads - warm, 0);
  DATA.classes = DATA.classes.concat([{ id: 'c3', name: 'C' }]);
  await classesA.create({ name: 'C' });
  var afterCreate = await classesB.list({ orderBy: 'name', cacheMs: TTL });
  assertEq('create() ở trang này → trang khác thấy lớp mới ngay (không chờ hết hạn)', ids(afterCreate), ['c1', 'c2', 'c3']);
  var steps = [['update', function () { return classesA.update('c1', { name: 'A2' }); }], ['upsert', function () { return classesA.upsert('c1', { name: 'A3' }); }],
    ['createWithId', function () { return classesA.createWithId('c9', { name: 'Z' }); }], ['remove', function () { return classesA.remove('c9'); }]];
  for (var i = 0; i < steps.length; i++) {
    await classesB.list({ orderBy: 'name', cacheMs: TTL }); // dựng bản đệm
    var before = queries;
    await steps[i][1]();
    await classesB.list({ orderBy: 'name', cacheMs: TTL });
    assertEq(steps[i][0] + '() bỏ bản đệm → lần đọc sau hỏi máy chủ', queries - before, 1);
  }
  var users = new B('users');
  await users.list({ where: [['role', '==', 'teacher']], cacheMs: TTL });
  await classesB.list({ orderBy: 'name', cacheMs: TTL });
  var uq = queries;
  await classesA.update('c1', { name: 'A4' });
  await users.list({ where: [['role', '==', 'teacher']], cacheMs: TTL });
  assertEq('ghi collection này không làm mất bản đệm collection khác', queries - uq, 0);

  // commitBatch: bỏ bản đệm của MỌI collection có trong lô
  await classesB.list({ orderBy: 'name', cacheMs: TTL });
  await users.list({ where: [['role', '==', 'teacher']], cacheMs: TTL });
  var cb = queries;
  await B.commitBatch([{ repo: classesA, id: 'c1', data: { name: 'x' } }, { repo: users, id: 'u1', data: { role: 'teacher' } }]);
  await classesB.list({ orderBy: 'name', cacheMs: TTL });
  await users.list({ where: [['role', '==', 'teacher']], cacheMs: TTL });
  assertEq('commitBatch bỏ bản đệm cả 2 collection trong lô', queries - cb, 2);

  // Ghi trực tiếp (ngoài repository) gọi invalidate() thủ công
  await classesB.list({ orderBy: 'name', cacheMs: TTL });
  var iv = queries;
  classesA.invalidate();
  await classesB.list({ orderBy: 'name', cacheMs: TTL });
  assertEq('invalidate() thủ công cho nơi ghi thẳng Firestore (vd admin-users gán giáo viên cho lớp)', queries - iv, 1);

  // Mất mạng / hết lượt đọc: lỗi, KHÔNG lưu bản rỗng/thiếu vào bản đệm
  now += TTL + 1;
  offline = true;
  var failed = false;
  try { await classesA.list({ orderBy: 'name', cacheMs: TTL }); } catch (e) { failed = e.code === 'unavailable'; }
  offline = false;
  var q1 = queries;
  var fresh = await classesA.list({ orderBy: 'name', cacheMs: TTL });
  assertEq('mất mạng → báo lỗi và không lưu đệm; có mạng lại đọc bình thường', [failed, queries - q1, ids(fresh).length], [true, 1, 3]);

  // Bản đệm lệch phiên bản (tab khác vừa ghi) không dùng
  await classesA.list({ orderBy: 'name', cacheMs: TTL });
  ls['edu_repo_ver:classes'] = 'tab-khac-vua-ghi';
  var q2 = queries;
  await classesB.list({ orderBy: 'name', cacheMs: TTL });
  assertEq('tab khác vừa ghi (phiên bản đổi trong localStorage) → đọc lại', queries - q2, 1);

  // Không có EduDataCache (trình duyệt chặn lưu) → vẫn chạy như cũ
  var saved = globalThis.EduDataCache; globalThis.EduDataCache = undefined;
  var q3 = queries;
  await classesA.list({ orderBy: 'name', cacheMs: TTL }); await classesA.list({ orderBy: 'name', cacheMs: TTL });
  assertEq('không có bộ nhớ đệm → mỗi lần đọc máy chủ, không lỗi', queries - q3, 2);
  globalThis.EduDataCache = saved;

  console.log(failures ? '\n' + failures + ' test FAIL' : '\nTất cả test PASS');
  process.exit(failures ? 1 : 0);
})();
