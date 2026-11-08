/* Test dùng chung danh sách học sinh THEO PHẠM VI giữa Dashboard điều phối và Quản lý lớp (Điều phối / Quản trị trường).
   Đo trên Firestore giả (scripts/measure-firestore/multi.py): điều phối 3 trường mở Dashboard (210 HS đang học) rồi Quản lý lớp
   đọc lại cả 225 HS các trường đó (mọi trạng thái) — và ngược lại. Mỗi máy đọc trùng ~210 lượt.
   Chạy: node js/services/__tests__/roster-scoped-seed.test.js — không gọi mạng thật. */
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
globalThis.EduDataCache = { getAsync: function () { return Promise.resolve(null); }, setAsync: function () { return Promise.resolve(); }, clear: function () {} };
function Ts(s, ns) { this.seconds = s; this.nanoseconds = ns; }
Ts.fromMillis = function (ms) { return new Ts(Math.floor(ms / 1000), (ms % 1000) * 1e6); };
globalThis.firebase = { firestore: { Timestamp: Ts, FieldValue: { serverTimestamp: function () { return 'SERVER_TS'; } } } };

// Firestore giả tổng quát: where ==/in, đếm lượt đọc như biểu phí (max(1, số doc)) và ghi lại từng truy vấn
var DOCS = [
  { id: 'a1', school: 'T1', status: 'active' },
  { id: 'a2', school: 'T2', status: 'active' },
  { id: 'n1', school: 'T1', status: 'inactive' },
  { id: 'n2', school: 'T2', status: 'inactive' },
  { id: 'nx', school: 'TX', status: 'inactive' }, // trường khác — không được đọc
];
var reads = 0, queries = [], offline = false, failWith = null;
function query(filters) {
  return {
    where: function (f, op, v) { return query(filters.concat([[f, op, v]])); },
    limit: function () { return this; },
    get: function () {
      if (failWith) return Promise.reject(failWith);
      queries.push(filters.map(function (x) { return x[0] + x[1] + JSON.stringify(x[2]); }).join('&'));
      var list = DOCS.filter(function (d) {
        return filters.every(function (x) { return x[1] === 'in' ? x[2].indexOf(d[x[0]]) >= 0 : d[x[0]] === x[2]; });
      });
      reads += Math.max(1, list.length);
      return Promise.resolve({ metadata: { fromCache: offline }, docs: list.map(function (d) { var c = Object.assign({}, d); delete c.id; return { id: d.id, data: function () { return c; } }; }) });
    },
  };
}
globalThis.EduFirebase = { countSnap: function () {}, db: { collection: function () { return query([]); } } };

require(path.join(__dirname, '..', '..', 'models', 'school.model.js'));
require(path.join(__dirname, '..', 'roster-cache-service.js'));
var R = globalThis.EduRosterCache;
var ids = function (list) { return list.map(function (s) { return s.id; }).sort(); };

(async function () {
  // ── Khoá bản đệm 2 trang: cùng 1 hàm, cùng chuỗi như trước (không làm mất bản đệm đang có trên máy người dùng) ──
  assertEq('khoá phạm vi = uid + trường đã sắp xếp',
    R.scopeKeyOf({ uid: 'co1', schools: ['T2', '', 'T1'] }), 'co1:T1|T2');
  assertEq('khoá Dashboard điều phối / Quản lý lớp giữ nguyên định dạng cũ',
    [R.SCOPED_KEYS.dashboard + 'co1:T1|T2', R.SCOPED_KEYS.manager + 'co1:T1|T2'], ['coordinator:roster:co1:T1|T2', 'roster-manager:co1:T1|T2']);

  // ── Quản lý lớp → Dashboard: lọc HS đang học từ bản đệm Quản lý lớp (0 lượt đọc) ──
  var mgr = { students: [{ id: 'a1', status: 'active' }, { id: 'n1', status: 'inactive' }], fullAt: now - 1000, watermark: [5, 0], courses: [] };
  var act = R.scopedActiveFrom(mgr);
  assertEq('Quản lý lớp → Dashboard: chỉ HS đang học, giữ mốc fullAt/watermark, 0 lượt đọc',
    [ids(act.students), act.fullAt, act.watermark, reads], [['a1'], now - 1000, [5, 0], 0]);
  assertEq('không có bản đệm Quản lý lớp → null', R.scopedActiveFrom(null), null);
  assertEq('bản đệm Quản lý lớp quá SCOPED_FULL_MS → null (Dashboard đọc toàn bộ như cũ)',
    R.scopedActiveFrom({ students: [], fullAt: now - R.SCOPED_FULL_MS - 1, watermark: null }), null);
  assertEq('bản đệm định dạng cũ (thiếu fullAt) → null', R.scopedActiveFrom({ students: [] }), null);

  // ── Dashboard → Quản lý lớp: HS đang học (đệm) + chỉ đọc HS đã nghỉ trong đúng các trường ──
  var dash = { students: [{ id: 'a1', school: 'T1', status: 'active' }, { id: 'a2', school: 'T2', status: 'active' }], fullAt: now - 5000, watermark: [7, 0] };
  reads = 0; queries = [];
  var seed = await R.seedScopedAllStatuses(dash, ['T1', 'T2']);
  assertEq('Dashboard → Quản lý lớp: đủ HS mọi trạng thái của đúng phạm vi',
    ids(seed.students), ['a1', 'a2', 'n1', 'n2']);
  assertEq('chỉ đọc HS đã nghỉ (status == inactive, school in ...) — không đọc lại HS đang học',
    [reads, queries], [2, ['status=="inactive"&schoolin["T1","T2"]']]);
  assertEq('nền giữ mốc của Dashboard để hỏi tiếp phần thay đổi', [seed.fullAt, seed.watermark], [now - 5000, [7, 0]]);

  // HS trong bản đệm Dashboard vừa nghỉ học: bản mới (inactive) thay bản cũ, không nhân đôi
  dash.students.push({ id: 'n1', school: 'T1', status: 'active' });
  seed = await R.seedScopedAllStatuses(dash, ['T1', 'T2']);
  assertEq('HS có ở cả 2 nguồn → 1 bản, lấy bản mới đọc', [ids(seed.students), seed.students.filter(function (s) { return s.id === 'n1'; })[0].status], [['a1', 'a2', 'n1', 'n2'], 'inactive']);
  dash.students.pop();

  // > 10 trường: chia nhóm ≤ 10 như các truy vấn 'in' khác
  queries = [];
  var many = Array.from({ length: 12 }, function (_, i) { return 'S' + i; });
  await R.seedScopedAllStatuses(dash, many);
  assertEq('12 trường → 2 truy vấn (10 + 2)', queries.length, 2);

  reads = 0;
  assertEq('không có bản đệm Dashboard → null, 0 lượt đọc', [await R.seedScopedAllStatuses(null, ['T1']), reads], [null, 0]);
  assertEq('bản đệm Dashboard quá SCOPED_FULL_MS → null, 0 lượt đọc',
    [await R.seedScopedAllStatuses({ students: [], fullAt: now - R.SCOPED_FULL_MS - 1 }, ['T1']), reads], [null, 0]);
  assertEq('chưa có trường → null', await R.seedScopedAllStatuses(dash, []), null);
  offline = true;
  assertEq('mất mạng / hết lượt (fromCache) → null, không dựng nền thiếu HS đã nghỉ', await R.seedScopedAllStatuses(dash, ['T1']), null);
  offline = false;
  failWith = Object.assign(new Error('denied'), { code: 'permission-denied' });
  assertEq('rules/index từ chối → null (trang đọc toàn bộ như cũ)', await R.seedScopedAllStatuses(dash, ['T1']), null);
  failWith = null;
  globalThis.EduBackend = { rosterDeltaSync: false };
  assertEq('tắt rosterDeltaSync → cả 2 hướng null',
    [R.scopedActiveFrom(mgr), await R.seedScopedAllStatuses(dash, ['T1'])], [null, null]);
  globalThis.EduBackend = { rosterDeltaSync: true };

  console.log(failures ? '\n' + failures + ' FAIL' : '\nTất cả PASS');
  process.exit(failures ? 1 : 0);
})();
