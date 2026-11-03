/* Test sảnh làm bài chế độ mã lớp (js/lobby-roster.js, EduBackend.roster.mode = 'class-code').
   Chạy: node js/services/__tests__/lobby-class-code.test.js — DOM + Apps Script giả, không gọi mạng. */
var path = require('path');

var failures = 0;
function assertEq(label, actual, expected) {
  var pass = JSON.stringify(actual) === JSON.stringify(expected);
  console.log((pass ? 'PASS' : 'FAIL') + '  ' + label + '  =>  ' + JSON.stringify(actual) + (pass ? '' : '  (expected ' + JSON.stringify(expected) + ')'));
  if (!pass) failures++;
}

// DOM giả: <select> giữ danh sách option từ innerHTML để .value chỉ nhận giá trị có thật
function el(id) {
  var e = {
    id: id, hidden: id === 'classCodeGroup', disabled: false, textContent: '', _v: '', _opts: [''], listeners: {},
    classList: { toggle: function () {} },
    addEventListener: function (t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); },
    fire: function (t, ev) { (this.listeners[t] || []).forEach(function (fn) { fn(ev || { key: '', preventDefault: function () {} }); }); },
  };
  Object.defineProperty(e, 'innerHTML', {
    get: function () { return this._html || ''; },
    set: function (h) {
      this._html = h;
      this._opts = (h.match(/value="([^"]*)"/g) || []).map(function (m) { return m.slice(7, -1).replace(/&amp;/g, '&'); });
      this._v = '';
    },
  });
  Object.defineProperty(e, 'value', {
    get: function () { return this._v; },
    set: function (v) { this._v = id === 'classCode' || this._opts.indexOf(v) !== -1 ? v : ''; },
  });
  return e;
}
var els = {};
['classCodeGroup', 'classCode', 'classCodeStatus', 'studentSchool', 'studentClass', 'studentName'].forEach(function (id) { els[id] = el(id); });
var ready = [];
globalThis.window = globalThis;
globalThis.document = {
  getElementById: function (id) { return els[id] || null; },
  addEventListener: function (t, fn) { if (t === 'DOMContentLoaded') ready.push(fn); },
};
var store = {};
globalThis.localStorage = { getItem: function (k) { return store[k] || null; }, setItem: function (k, v) { store[k] = String(v); } };
var fetched = [];
globalThis.fetch = function (u) { fetched.push(u); return Promise.reject(new Error('không được tải file JSON')); };
var calls = [];
var CLASSES = { K7P2QX: { school: 'THCS Lê Lợi', className: '6A', names: ['An', 'Bình'] } };
globalThis.EduAppsScript = {
  call: function (action, body, opts) {
    calls.push({ action: action, body: body, auth: opts && opts.auth });
    if (CLASSES[body.code]) return Promise.resolve(JSON.parse(JSON.stringify(CLASSES[body.code])));
    return Promise.reject(Object.assign(new Error('Không tìm thấy'), { code: 'not-found' }));
  },
};
globalThis.EduBackend = { roster: { mode: 'class-code' } };
var tick = function () { return new Promise(function (r) { setTimeout(r, 0); }); };

require(path.join(__dirname, '..', '..', 'lobby-roster.js'));

(async function () {
  ready.forEach(function (fn) { fn(); });
  await tick();
  assertEq('hiện ô Mã lớp', els.classCodeGroup.hidden, false);
  assertEq('không tải file danh sách công khai', fetched, []);
  assertEq('chưa có mã: chưa chọn được trường', els.studentSchool.disabled, true);

  els.classCode.value = 'k7p2q';
  els.classCode.fire('input');
  assertEq('chưa đủ 6 ký tự: chưa hỏi máy chủ', calls.length, 0);
  els.classCode.value = 'k7p2qx';
  els.classCode.fire('input');
  await tick(); await tick();
  assertEq('đủ 6 ký tự: hỏi rosterByCode không cần đăng nhập', calls.map(function (c) { return [c.action, c.body.code, c.auth]; }), [['rosterByCode', 'K7P2QX', false]]);
  assertEq('điền sẵn trường + lớp', [els.studentSchool.value, els.studentClass.value], ['THCS Lê Lợi', '6A']);
  assertEq('chỉ có tên của lớp đó', els.studentName._opts.filter(Boolean), ['An', 'Bình']);
  assertEq('nhớ lớp trên máy', JSON.parse(store.eduquiz_class_code_v1).code, 'K7P2QX');

  els.classCode.fire('input');
  await tick();
  assertEq('mã không đổi: không hỏi lại', calls.length, 1);

  els.classCode.value = 'ZZZZZZ';
  els.classCode.fire('input');
  await tick(); await tick();
  assertEq('mã sai: báo lỗi dễ hiểu', /Không tìm thấy lớp/.test(els.classCodeStatus.textContent), true);

  console.log(failures ? '\n' + failures + ' FAIL' : '\nTất cả PASS');
  process.exit(failures ? 1 : 0);
})();
