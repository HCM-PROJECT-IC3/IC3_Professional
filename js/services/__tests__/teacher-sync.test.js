/* Test: js/services/teacher-sync.js — lưu link sổ lớp (links, folders, me, mine) lên 1 document / giáo viên,
   ít lượt Firestore. Nhiều "máy"/"tab" dùng chung 1 Firestore giả; đếm lượt đọc/ghi.
   Chạy: node js/services/__tests__/teacher-sync.test.js */
var path = require('path');

var failures = 0;
function assertEq(label, actual, expected) {
  var pass = JSON.stringify(actual) === JSON.stringify(expected);
  console.log((pass ? 'PASS' : 'FAIL') + '  ' + label + '  =>  ' + JSON.stringify(actual) + (pass ? '' : '  (expected ' + JSON.stringify(expected) + ')'));
  if (!pass) failures++;
}

// Firestore giả (1 doc / uid, set merge sâu như thật cho map items)
var store = {}, reads = 0, writes = 0, failNext = false;
var db = { collection: function (c) { return { doc: function (id) { var key = c + '/' + id; return {
  get: function () { reads++; var d = store[key]; return Promise.resolve({ exists: !!d, data: function () { return JSON.parse(JSON.stringify(d)); } }); },
  set: function (v) { writes++; if (failNext) { failNext = false; return Promise.reject({ code: 'permission-denied' }); }
    var d = store[key] || {}; var items = Object.assign({}, d.items || {}, v.items || {}); store[key] = Object.assign({}, d, v, { items: items }); return Promise.resolve(); },
}; } }; } };

/** 1 "tab" mới. Truyền data của tab khác = 2 tab cùng máy (chung localStorage). */
function machine(shared) {
  var data = shared || {};
  var ls = { getItem: function (k) { return k in data ? data[k] : null; }, setItem: function (k, v) { data[k] = String(v); }, removeItem: function (k) { delete data[k]; } };
  globalThis.window = globalThis;
  globalThis.localStorage = ls;
  globalThis.document = { visibilityState: 'visible', addEventListener: function () {} };
  globalThis.addEventListener = function () {};
  globalThis.firebase = { firestore: { FieldValue: { serverTimestamp: function () { return 'ts'; } } } };
  globalThis.EduFirebase = { db: db, auth: { currentUser: { uid: 'gv1' } } };
  delete require.cache[require.resolve(path.join(__dirname, '..', 'teacher-sync.js'))];
  require(path.join(__dirname, '..', 'teacher-sync.js'));
  return { ls: ls, api: globalThis.EduTeacherSync, data: data };
}
var KEY = 'eduquiz_solop_v1';
var get = function (m, k) { return JSON.parse(m.ls.getItem(k || KEY)); };
var put = function (m, v) { m.ls.setItem(KEY, JSON.stringify(v)); };

(async function () {
  // Máy A có sổ lớp, chưa từng đồng bộ → mở trang: 1 đọc; lưu: 1 ghi; chỉ gửi link/thư mục/tên/lớp của tôi
  var A = machine();
  put(A, { links: [{ id: 's1', title: 'FORM 5', school: 'TiH Phong Phú 2', tabs: [{ gid: '0', name: '5A1' }] }], folders: [{ id: 'f1', url: 'https://drive.google.com/drive/folders/f1' }],
    me: 'Nguyễn Hoài Bảo', mine: { 's1|0': true }, cache: { 's1|0': { csv: 'x'.repeat(5000) } }, drafts: { a: 1 }, sel: 's1|0', tab: 'setup', fSchool: 'x' });
  A.ls.setItem('eduquiz_goiten_v1', JSON.stringify({ called: { 'class:5A1': [{ name: 'An' }] } }));
  await A.api.autoStart({});
  assertEq('A mở trang: 1 lượt đọc', reads, 1);
  assertEq('A lưu: 1 lượt ghi', await A.api.saveNow(), true);
  var sent = JSON.parse(store['teacher_sync/gv1'].items[KEY].v);
  assertEq('chỉ gửi link, thư mục, tên, lớp của tôi', Object.keys(sent).sort(), ['folders', 'links', 'me', 'mine']);
  assertEq('Gọi tên không lên tài khoản', Object.keys(store['teacher_sync/gv1'].items), [KEY]);
  assertEq('không đổi gì → không ghi (null = đã lưu hết)', await A.api.saveNow(), null);
  assertEq('vẫn 1 lượt ghi', writes, 1);

  // Điểm danh nháp / đọc lại Sheet (cache) / đổi thẻ, bộ lọc → không ghi
  var a = get(A); a.drafts = { b: 2 }; a.cache.more = 1; a.tab = 'week'; a.fSchool = 'y'; put(A, a);
  assertEq('nháp, CSV, bộ lọc đổi: không ghi', await A.api.saveNow(), null);

  // Máy B mới, có sẵn 1 sổ riêng + tên trống → gộp link, giữ CSV/nháp của B, ô tên trống không đè
  var B = machine();
  put(B, { links: [{ id: 's2', title: 'FORM 8', school: 'THCS Huỳnh Tấn Phát' }], folders: [], me: '', mine: {}, cache: { mine: 1 }, drafts: { x: 1 } });
  var appliedB;
  await B.api.autoStart({ onApplied: function (k) { appliedB = k; } });
  assertEq('B tải về sổ lớp', appliedB, [KEY]);
  assertEq('B có cả 2 sổ (gộp theo mã file)', get(B).links.map(function (l) { return l.id; }), ['s1', 's2']);
  assertEq('B có thư mục Drive + tên + lớp của tôi', [get(B).folders.length, get(B).me, get(B).mine], [1, 'Nguyễn Hoài Bảo', { 's1|0': true }]);
  assertEq('B giữ CSV và nháp của máy mình', [get(B).cache, get(B).drafts], [{ mine: 1 }, { x: 1 }]);
  assertEq('B có bản dự phòng trước khi gộp', !!get(B, 'edu_sync_backup_v1')[KEY], true);
  await B.api.saveNow();
  assertEq('tài khoản có 2 sổ sau khi B gửi', JSON.parse(store['teacher_sync/gv1'].items[KEY].v).links.length, 2);

  // Máy C trắng (đăng nhập máy khác lần đầu) → có lại đủ link
  var C = machine();
  await C.api.autoStart({});
  assertEq('máy trắng: có lại đủ link', get(C).links.map(function (l) { return l.id; }), ['s1', 's2']);

  // A mở lại sau > 30 phút: nhận bản mới (đã đồng bộ → thay, không gộp); mở lại trong 30 phút: 0 lượt đọc
  var r0 = reads, w0 = writes;
  var keep = Object.assign({}, A.data);
  var m = JSON.parse(keep.edu_sync_meta_v1); m.pulledAt = Date.now() - 31 * 60e3; keep.edu_sync_meta_v1 = JSON.stringify(m);
  A = machine(keep); await A.api.autoStart({});
  assertEq('A đọc lại đúng 1 lượt', reads - r0, 1);
  assertEq('A nhận sổ của B', get(A).links.length, 2);
  assertEq('A giữ CSV của máy mình', !!get(A).cache['s1|0'], true);
  var A2 = machine(A.data); await A2.api.autoStart({});
  assertEq('mở lại trong 30 phút: 0 lượt đọc', reads - r0, 1);
  assertEq('không ghi thêm', writes - w0, 0);

  // 2 tab cùng máy: 1 thay đổi chỉ ghi 1 lần
  var T1 = machine(A.data); await T1.api.autoStart({});
  var T2 = machine(A.data); await T2.api.autoStart({});
  var w2 = writes;
  var t = get(T1); t.links.push({ id: 's3', title: 'FORM 6' }); put(T1, t);
  assertEq('tab 1 thêm sổ: ghi', await T1.api.saveNow(), true);
  assertEq('tab 2: không ghi lại', await T2.api.saveNow(), null);
  assertEq('2 tab: 1 ghi', writes - w2, 1);

  // Ghi lỗi (rule chưa publish): báo lỗi, link vẫn trong máy, bấm lại ghi được
  failNext = true;
  t = get(T1); t.me = 'Thu'; put(T1, t);
  assertEq('ghi lỗi → false', await T1.api.saveNow(), false);
  assertEq('lỗi hiện ra ở status', T1.api.status().err, 'permission-denied');
  assertEq('dữ liệu vẫn còn trong máy', get(T1).me, 'Thu');
  assertEq('bấm lại: ghi được', await T1.api.saveNow(), true);

  // Tệp sao lưu: chỉ phần link; nhập vào máy trắng
  var txt = T1.api.exportText();
  assertEq('tệp sao lưu không chứa CSV', /csv/.test(txt), false);
  var D = machine();
  assertEq('nhập tệp sao lưu', D.api.importText(txt), 1);
  assertEq('nhập xong có 3 sổ', get(D).links.length, 3);

  console.log(failures ? '\n' + failures + ' test FAIL' : '\nTất cả PASS');
  process.exit(failures ? 1 : 0);
})();
