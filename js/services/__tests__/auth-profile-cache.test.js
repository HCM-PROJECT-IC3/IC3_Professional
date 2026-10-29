/* Test js/auth.js — hồ sơ users/{uid} không đọc lại khi mở trang quản trị ở tab/cửa sổ mới (máy cá nhân),
   máy dùng chung không để lại hồ sơ, tài khoản chờ duyệt luôn đọc mới, đăng nhập → trang kế tiếp không đọc lần 2.
   Firebase giả, đếm lượt đọc. Chạy: node js/services/__tests__/auth-profile-cache.test.js */
'use strict';
const path = require('path');
const FILE = path.join(__dirname, '..', '..', 'auth.js');

let failures = 0;
function eq(label, actual, expected) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  console.log((pass ? 'PASS' : 'FAIL') + '  ' + label + '  =>  ' + JSON.stringify(actual) + (pass ? '' : '  (expected ' + JSON.stringify(expected) + ')'));
  if (!pass) failures++;
}

function storage(data) {
  return {
    getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); }, removeItem: (k) => { delete data[k]; },
    // Object.keys(storage) trong trình duyệt trả tên khoá — giả lập bằng Proxy bên dưới
    _data: data,
  };
}
const asStore = (data) => new Proxy(storage(data), { ownKeys: () => Object.keys(data), getOwnPropertyDescriptor: (t, k) => (k in data ? { enumerable: true, configurable: true, value: data[k] } : undefined) });

let reads = 0;
const users = { gv1: { name: 'Bảo', role: 'teacher', approved: true }, gv2: { name: 'Mới', role: 'teacher', approved: false } };
const local = {}; // localStorage dùng chung mọi tab của 1 máy

/** Mở 1 "tab" mới (sessionStorage riêng) với người dùng uid đang đăng nhập. */
function tab(uid) {
  global.window = global;
  global.localStorage = asStore(local);
  global.sessionStorage = asStore({});
  let authCb;
  global.EduFirebase = {
    auth: { onAuthStateChanged: (cb) => { authCb = cb; }, currentUser: uid ? { uid } : null, signOut: async () => {} },
    db: { collection: () => ({ doc: (id) => ({ get: async () => { reads++; return { exists: !!users[id], data: () => users[id] }; } }) }) },
  };
  delete require.cache[require.resolve(FILE)];
  require(FILE);
  const A = global.EduAuth;
  return {
    A,
    ready: () => new Promise((res) => { A.onAuthReady((u, p) => res(p)); authCb(uid ? { uid } : null); }),
  };
}

(async () => {
  // Máy cá nhân (tích "ghi nhớ")
  local.edu_idle_remember = '1';
  let r = reads;
  await tab('gv1').ready();
  eq('mở trang quản trị lần đầu: 1 đọc', reads - r, 1);
  r = reads;
  const p = await tab('gv1').ready();
  eq('tab mới (bấm "Gọi tên", "Trang quản lý"): 0 đọc', reads - r, 0);
  eq('vẫn có hồ sơ đúng', p.name, 'Bảo');

  // Hết 15 phút → đọc lại
  const k = 'eduAuthProfile:gv1';
  const e = JSON.parse(local[k]); e.at -= 16 * 60e3; local[k] = JSON.stringify(e);
  r = reads; await tab('gv1').ready();
  eq('quá 15 phút: đọc lại 1 lần', reads - r, 1);

  // Đăng nhập → trang kế tiếp không đọc lần 2
  delete local[k];
  r = reads;
  const t1 = tab('gv1'); await t1.A.getProfile('gv1');           // login.js
  eq('trang đăng nhập: 1 đọc', reads - r, 1);
  await tab('gv1').ready();                                       // trang quản trị vừa chuyển tới (tab mới cũng được)
  eq('trang quản trị ngay sau đăng nhập: 0 đọc thêm', reads - r, 1);

  // Đăng xuất: xoá hồ sơ khỏi máy
  const t2 = tab('gv1'); await t2.A.logoutUser();
  eq('đăng xuất: không còn hồ sơ trong localStorage', Object.keys(local).filter((x) => x.startsWith('eduAuthProfile:')), []);

  // Giáo viên chờ duyệt: không cache dài — admin duyệt xong là vào được ngay
  r = reads; await tab('gv2').ready(); await tab('gv2').ready();
  eq('chờ duyệt: mỗi tab mới đều đọc mới', reads - r, 2);
  eq('chờ duyệt: không lưu localStorage', 'eduAuthProfile:gv2' in local, false);

  // Máy dùng chung (không tích "ghi nhớ"): không để lại hồ sơ, tab mới đọc lại như cũ
  local.edu_idle_remember = '0';
  Object.keys(local).forEach((x) => { if (x.startsWith('eduAuthProfile:')) delete local[x]; });
  r = reads; await tab('gv1').ready(); await tab('gv1').ready();
  eq('máy dùng chung: mỗi tab mới đọc 1 lần (như cũ)', reads - r, 2);
  eq('máy dùng chung: không lưu hồ sơ vào localStorage', Object.keys(local).filter((x) => x.startsWith('eduAuthProfile:')), []);

  console.log(failures ? '\n' + failures + ' test FAIL' : '\nTất cả PASS');
  process.exit(failures ? 1 : 0);
})();
