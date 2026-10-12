/* Test js/services/apps-script-client.js + 2 nơi dùng: github-publish.js, apps-script-map-distance.js.
   Chạy: node js/services/__tests__/apps-script-client.test.js — fetch giả, không gọi mạng. */
var path = require('path');

var failures = 0;
function assertEq(label, actual, expected) {
  var pass = JSON.stringify(actual) === JSON.stringify(expected);
  console.log((pass ? 'PASS' : 'FAIL') + '  ' + label + '  =>  ' + JSON.stringify(actual) + (pass ? '' : '  (expected ' + JSON.stringify(expected) + ')'));
  if (!pass) failures++;
}

globalThis.window = globalThis;
var removed = [];
globalThis.localStorage = { removeItem: function (k) { removed.push(k); } };
var sent = [];
var reply = null;
globalThis.fetch = function (url, opt) {
  sent.push({ url: url, body: JSON.parse(opt.body) });
  if (reply instanceof Error) return Promise.reject(reply);
  return Promise.resolve({ json: function () { return Promise.resolve(reply); } });
};
var signedIn = true;
globalThis.EduFirebase = { auth: { get currentUser() { return signedIn ? { getIdToken: function () { return Promise.resolve('TOK'); } } : null; } } };
globalThis.EduBackend = { appsScriptUrl: 'https://script.example/exec' };
['apps-script-client.js', 'apps-script-map-distance.js'].forEach(function (f) { require(path.join(__dirname, '..', f)); });
require(path.join(__dirname, '..', '..', 'github-publish.js'));

function codeOf(p) { return p.then(function () { return 'ok'; }, function (e) { return e.code; }); }

reply = { ok: true, data: { km: 4.6, matchedSchoolAddress: 'X', approximateHome: false } };
EduMapDistance.computeDistanceKm('12 Lê Lợi', 'Trường A').then(function (r) {
  assertEq('bản đồ: trả đúng dữ liệu', r.km, 4.6);
  assertEq('kèm action + ID token', [sent[0].body.action, sent[0].body.idToken, sent[0].body.origin], ['mapDistance', 'TOK', '12 Lê Lợi']);
  reply = { ok: false, code: 'resource-exhausted', error: 'hết lượt' };
  return codeOf(EduMapDistance.computeDistanceKm('a', 'b'));
}).then(function (code) {
  assertEq('mã lỗi từ Apps Script giữ nguyên', code, 'resource-exhausted');
  reply = new TypeError('Failed to fetch');
  return codeOf(EduAppsScript.call('ping'));
}).then(function (code) {
  assertEq('mất mạng → unavailable', code, 'unavailable');
  reply = { ok: true, data: {} };
  signedIn = false;
  sent = [];
  return codeOf(EduAppsScript.call('listResults'));
}).then(function (code) {
  assertEq('chưa đăng nhập → không gửi gì', [code, sent.length], ['unauthenticated', 0]);
  signedIn = true;
  assertEq('GitHub: xoá token cũ trong trình duyệt', removed, ['ic3_gh_publish_token']);
  assertEq('GitHub: có đường đẩy khi đã cấu hình Apps Script', EduGitHubPublish.hasToken(), true);
  reply = { ok: false, code: 'conflict', error: 'Dữ liệu trên GitHub đã thay đổi' };
  return codeOf(EduGitHubPublish.publishFiles([{ path: 'data/a.json', content: '{}' }], 'msg', undefined, { expectedShas: { 'data/a.json': 's' } }));
}).then(function (code) {
  assertEq('GitHub: xung đột → err.code conflict (image-manager giữ bản nháp)', code, 'conflict');
  var b = sent[sent.length - 1].body;
  assertEq('GitHub: gửi file + sha mong đợi qua Apps Script', [b.action, b.files[0].path, b.expectedShas['data/a.json']], ['githubPublish', 'data/a.json', 's']);
  reply = { ok: true, data: { sha: 'c1' } };
  return EduGitHubPublish.publishFiles([{ path: 'img/x.png', base64: 'AAA' }], 'msg');
}).then(function (sha) {
  assertEq('GitHub: đẩy thành công trả sha commit', sha, 'c1');
  assertEq('GitHub: ảnh gửi dạng base64', sent[sent.length - 1].body.files[0], { path: 'img/x.png', base64: 'AAA' });
  reply = { ok: true, data: { text: '{"x":1}' } };
  return EduGitHubPublish.fetchRaw('data/ic3/meta.json');
}).then(function (text) {
  assertEq('GitHub: đọc file mới nhất', text, '{"x":1}');
  // Kết quả MOS: mặc định chỉ lên Google Sheet, không cần đăng nhập, không chạm Firebase.
  EduBackend.mosResults = { firestore: false, sheet: true };
  require(path.join(__dirname, '..', '..', 'mos-submissions.js'));
  signedIn = false;
  reply = { ok: true, data: { written: true } };
  return saveMosSubmission({ submissionId: 'abc123xyz', studentName: 'A', score: 80, results: [], _retry: true });
}).then(function (res) {
  var b = sent[sent.length - 1].body;
  assertEq('MOS: gửi Sheet không cần đăng nhập', [res.success, b.action, b.idToken, b.payload.submissionId], [true, 'mosSubmit', undefined, 'abc123xyz']);
  assertEq('MOS: không gửi cờ nội bộ _retry', b.payload._retry, undefined);
  reply = { ok: false, code: 'invalid-argument', error: 'sai' };
  return saveMosSubmission({ submissionId: 'abc123xyz', studentName: 'A' });
}).then(function (res) {
  assertEq('MOS: dữ liệu sai → permanent (không xếp hàng gửi lại)', [res.success, res.permanent], [false, true]);
  reply = new TypeError('offline');
  return saveMosSubmission({ submissionId: 'abc123xyz', studentName: 'A' });
}).then(function (res) {
  assertEq('MOS: mất mạng → thất bại tạm (hàng đợi gửi lại)', [res.success, res.permanent], [false, false]);
  console.log(failures ? '\n' + failures + ' test FAIL' : '\nTất cả PASS');
  process.exit(failures ? 1 : 0);
});
