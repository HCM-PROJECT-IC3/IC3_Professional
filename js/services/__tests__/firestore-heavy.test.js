/* Test đồng hồ trang nặng (js/firebase-config.js + js/services/apps-script-client.js).
   Chạy: node js/services/__tests__/firestore-heavy.test.js — không gọi mạng thật. */
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var failures = 0;
function assertEq(label, actual, expected) {
  var pass = JSON.stringify(actual) === JSON.stringify(expected);
  console.log((pass ? 'PASS' : 'FAIL') + '  ' + label + '  =>  ' + JSON.stringify(actual) + (pass ? '' : '  (expected ' + JSON.stringify(expected) + ')'));
  if (!pass) failures++;
}

function Query() {}
Query.prototype.get = function () { return Promise.resolve({ size: this.n, metadata: { fromCache: !!this.cached } }); };
function WriteBatch() {}
WriteBatch.prototype.set = function () { return this; };
WriteBatch.prototype.update = function () { return this; };
WriteBatch.prototype.delete = function () { return this; };

var firestore = function () { return { settings: function () {}, enablePersistence: function () { return Promise.resolve(); } }; };
firestore.Query = Query;
firestore.WriteBatch = WriteBatch;
firestore.setLogLevel = function () {};

// Đồng hồ giả: chạy tay các hẹn giờ
var timers = [];
var listeners = {};
var events = [];
var win = {
  addEventListener: function (t, f) { (listeners[t] = listeners[t] || []).push(f); },
  dispatchEvent: function (e) { events.push(e.detail); (listeners[e.type] || []).forEach(function (f) { f(e); }); },
};
var calls = [];
var ctx = vm.createContext({
  window: win, console: { info: function () {}, warn: function () {}, error: function () {}, log: function () {} },
  location: { pathname: '/roster-manager.html', hostname: 'localhost' },
  localStorage: { getItem: function () { return null; }, setItem: function () {} },
  setTimeout: function (f) { timers.push(f); return timers.length; }, clearTimeout: function () {},
  CustomEvent: function (type, o) { this.type = type; this.detail = o.detail; },
  firebase: { apps: [], initializeApp: function () {}, firestore: firestore, auth: function () { return {}; } },
  Promise: Promise, Date: Date, Math: Math, JSON: JSON, Object: Object, Array: Array, Number: Number, Map: Map, Set: Set,
  AbortController: function () { this.abort = function () {}; },
  fetch: function (url, o) {
    calls.push(JSON.parse(o.body));
    return Promise.resolve({ json: function () { return Promise.resolve({ ok: true, data: {} }); } });
  },
});
win.firebase = ctx.firebase;
var read = function (f) { return fs.readFileSync(path.join(__dirname, '..', '..', f), 'utf8'); };
vm.runInContext(read('firebase-config.js'), ctx);
win.EduBackend = { appsScriptUrl: 'https://x.test/exec' };
win.EduFirebase.auth = { currentUser: { getIdToken: function () { return Promise.resolve('tok'); } } };
vm.runInContext(read('services/apps-script-client.js'), ctx);

function q(n, cached) { var x = new Query(); x.n = n; x.cached = cached; return x.get(); }
function flush() { var t = timers; timers = []; t.forEach(function (f) { f(); }); return new Promise(function (r) { setImmediate(r); }); }

(async function () {
  await q(300);
  await q(150);
  await q(5000, true);
  assertEq('chưa tới mốc (bản lấy từ máy không tính): không báo', [timers.length, events.length], [0, 0]);

  win.EduFirebase.countSnap('students_roster (toàn bộ)', { size: 100 });
  await q(100);
  assertEq('qua mốc 500: chờ 2 giây rồi mới báo', [timers.length, events.length], [1, 0]);
  await flush();
  assertEq('báo đúng trang, số lượt, truy vấn tốn nhất', events[0], { page: 'roster-manager', reads: 550, writes: 0, top: ['students_roster (toàn bộ): 100'] });
  assertEq('gửi 1 dòng firestore_heavy qua Apps Script', [calls.length, calls[0].action, calls[0].activity, calls[0].page, calls[0].meta.reads], [1, 'logActivity', 'firestore_heavy', 'roster-manager', 550]);

  await q(50);
  await flush();
  assertEq('trong cùng mốc: không báo lại', events.length, 1);

  var b = new WriteBatch();
  for (var i = 0; i < 300; i++) b.set({}, {});
  assertEq('ghi theo lô qua mốc 300: lô liền nhau gom 1 lần', timers.length, 1);
  for (var j = 0; j < 800; j++) b.update({}, {});
  assertEq('đang chờ thì không hẹn thêm', timers.length, 1);
  await flush();
  assertEq('báo số lượt ghi', [events.length, events[1].writes], [2, 1100]);

  await q(100000);
  await flush();
  assertEq('tối đa 6 mốc cho 1 lần mở trang', [events.length, calls.length <= 6], [3, true]);
  await q(100).catch(function (e) { assertEq('cầu dao đọc vẫn chặn sau khi đo', e.code, 'resource-exhausted'); });
  await flush();
  assertEq('đã qua mốc cuối: không báo thêm', events.length, 3);

  console.log(failures ? '\n' + failures + ' test FAIL' : '\nTất cả PASS');
  process.exit(failures ? 1 : 0);
})();
