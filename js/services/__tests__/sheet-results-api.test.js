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
  var data = body.action === 'deleteResults' ? { deleted: body.ids.length } : { rows: rows, truncated: false };
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
  globalThis.EduFirebase.auth.currentUser = null;
  return S.list({}).then(function () { return 'ok'; }, function (e) { return 'lỗi'; });
}).then(function (r) {
  assertEq('chưa đăng nhập → báo lỗi, không gọi', r, 'lỗi');
  console.log(failures ? '\n' + failures + ' test FAIL' : '\nTất cả PASS');
  process.exit(failures ? 1 : 0);
});
