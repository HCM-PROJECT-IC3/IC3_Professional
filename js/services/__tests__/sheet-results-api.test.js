/* Test js/services/sheet-results-api.js — chọn nguồn, chia Apps Script theo trường, gộp kết quả.
   Chạy: node js/services/__tests__/sheet-results-api.test.js — fetch giả, không gọi mạng. */
var path = require('path');

var failures = 0;
function assertEq(label, actual, expected) {
  var pass = JSON.stringify(actual) === JSON.stringify(expected);
  console.log((pass ? 'PASS' : 'FAIL') + '  ' + label + '  =>  ' + JSON.stringify(actual) + (pass ? '' : '  (expected ' + JSON.stringify(expected) + ')'));
  if (!pass) failures++;
}

globalThis.window = globalThis;
var calls = [];
globalThis.fetch = function (url, opt) {
  var body = JSON.parse(opt.body);
  calls.push({ url: url, schools: body.schools, action: body.action, token: body.idToken });
  var rows = url === 'B'
    ? [{ id: 'b1', submittedAtMs: 20 }]
    : [{ id: 'a1', submittedAtMs: 30 }, { id: 'a2', submittedAtMs: 10 }];
  var data = body.action === 'deleteResults' ? { deleted: body.ids.length }
    : body.action === 'wrongStats' ? (url === 'B'
      ? { submissions: 3, withData: 2, truncated: true, items: [{ uid: 'q2', count: 5, students: 3, tests: ['T2'] }, { uid: 'q1', count: 1, students: 1, tests: ['T3'] }] }
      : { submissions: 10, withData: 8, truncated: false, items: [{ uid: 'q1', count: 4, students: 4, tests: ['T1'] }, { uid: 'q3', count: 1, students: 1, tests: ['T1'] }] })
    : { rows: rows, truncated: false };
  return Promise.resolve({ json: function () { return Promise.resolve({ ok: true, data: data }); } });
};
globalThis.EduFirebase = { auth: { currentUser: { getIdToken: function () { return Promise.resolve('TOKEN'); } } } };
globalThis.EduBackend = {
  appsScriptUrl: 'A',
  dashboard: { readFrom: 'auto' },
  quizResults: { firestore: 'all', sheetEndpoints: { 'TH B': 'B' } },
};
require(path.join(__dirname, '..', 'apps-script-client.js'));
require(path.join(__dirname, '..', 'sheet-results-api.js'));
var S = globalThis.EduSheetResults;

assertEq("auto + firestore 'all' → đọc Firestore", S.readFrom(), 'firestore');
EduBackend.quizResults.firestore = 'test-only';
assertEq("auto + 'test-only' → đọc Sheet", S.readFrom(), 'sheet');
EduBackend.dashboard.readFrom = 'firestore';
assertEq("ép 'firestore'", S.enabled(), false);
EduBackend.dashboard.readFrom = 'sheet';
assertEq("ép 'sheet'", S.enabled(), true);

assertEq('admin (mọi trường) → hỏi mọi Apps Script', S.endpointGroups(), [{ url: 'A', schools: null }, { url: 'B', schools: null }]);
assertEq('chia trường theo Apps Script', S.endpointGroups(['TH A1', 'TH B', 'TH A2']), [{ url: 'A', schools: ['TH A1', 'TH A2'] }, { url: 'B', schools: ['TH B'] }]);

S.list({ limit: 2 }).then(function (rows) {
  assertEq('gộp + sắp xếp mới nhất trước + limit', rows.map(function (r) { return r.id; }), ['a1', 'b1']);
  assertEq('mỗi lời gọi kèm ID token', calls.every(function (c) { return c.token === 'TOKEN'; }), true);
  calls = [];
  return S.list({ schools: ['TH B'] });
}).then(function () {
  assertEq('giáo viên 1 trường chỉ hỏi đúng Apps Script', calls.map(function (c) { return c.url; }), ['B']);
  return S.remove(['x', 'y']);
}).then(function (n) {
  assertEq('xoá gửi tới mọi Apps Script, cộng số đã xoá', n, 4);
  return S.wrongStats({ testName: 'T1' });
}).then(function (w) {
  assertEq('wrongStats: cộng mẫu số các Apps Script', [w.submissions, w.withData, w.truncated], [13, 10, true]);
  assertEq('wrongStats: gộp cùng uid, sắp nhiều lượt sai trước', w.items.map(function (x) { return [x.uid, x.count, x.students, x.tests]; }),
    [['q1', 5, 5, ['T1', 'T3']], ['q2', 5, 3, ['T2']], ['q3', 1, 1, ['T1']]]);
  globalThis.EduFirebase.auth.currentUser = null;
  return S.list({}).then(function () { return 'ok'; }, function (e) { return 'lỗi'; });
}).then(function (r) {
  assertEq('chưa đăng nhập → báo lỗi, không gọi', r, 'lỗi');
  console.log(failures ? '\n' + failures + ' test FAIL' : '\nTất cả PASS');
  process.exit(failures ? 1 : 0);
});
