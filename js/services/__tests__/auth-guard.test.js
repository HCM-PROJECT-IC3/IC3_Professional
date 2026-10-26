/* Test js/auth-guard.js — "edu:ready" chỉ bắn SAU khi mọi script đồng bộ của trang đã chạy
   (DOMContentLoaded). Lỗi cũ: hồ sơ lấy từ cache phiên → onAuthReady xong ngay, "edu:ready" bắn
   trước khi js/coordinator/dashboard.js (nạp sau auth-guard) kịp nghe → trang treo "Đang tải".
   DOM giả tối thiểu, không Firebase thật. Chạy: node js/services/__tests__/auth-guard.test.js */
'use strict';
const path = require('path');
const FILE = path.join(__dirname, '..', '..', 'auth-guard.js');

let failures = 0;
function eq(label, actual, expected) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  console.log((pass ? 'PASS' : 'FAIL') + '  ' + label + '  =>  ' + JSON.stringify(actual) + (pass ? '' : '  (expected ' + JSON.stringify(expected) + ')'));
  if (!pass) failures++;
}

function el() {
  const e = {
    style: {}, dataset: {}, children: [], attached: false, innerHTML: '', textContent: '',
    classList: { set: new Set(), add(c) { this.set.add(c); }, remove(c) { this.set.delete(c); }, contains(c) { return this.set.has(c); } },
    setAttribute() {}, addEventListener() {}, querySelector: () => el(), querySelectorAll: () => [],
    appendChild(c) { e.children.push(c); c.attached = true; return c; },
    remove() { e.attached = false; e.removed = true; },
  };
  return e;
}

/** Nạp auth-guard.js trong "trang" mới. auth = (cb) => gọi cb(user, profile) khi nào tuỳ kịch bản. */
function loadPage({ readyState, roles, auth }) {
  const docListeners = {};
  const winListeners = {};
  const document = {
    readyState,
    documentElement: el(), head: el(), body: el(),
    createElement: () => el(),
    getElementById: () => null,
    querySelector: () => null,
    addEventListener(t, fn) { (docListeners[t] = docListeners[t] || []).push(fn); },
  };
  // Trong trình duyệt window chính là phạm vi toàn cục (auth-guard.js dùng thẳng EduAuth, EduFirebase)
  const window = Object.assign(global, {
    EDU_ALLOWED_ROLES: roles,
    EduFirebase: { db: {} },
    EduAuth: { onAuthReady: auth, ROLE_LABEL: {} },
    location: { pathname: '/coordinator-dashboard.html', search: '', href: '' },
    addEventListener(t, fn) { (winListeners[t] = winListeners[t] || []).push(fn); },
    dispatchEvent(ev) { (winListeners[ev.type] || []).forEach((fn) => fn(ev)); return true; },
    EduCurrentUser: undefined, EduCurrentProfile: undefined,
  });
  global.window = window;
  global.document = document;
  global.location = window.location;
  global.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } };
  global.setTimeout = (fn) => fn();
  delete require.cache[require.resolve(FILE)];
  require(FILE);
  return {
    window, document,
    domContentLoaded() { document.readyState = 'interactive'; (docListeners.DOMContentLoaded || []).slice().forEach((fn) => fn()); },
    locked: () => document.documentElement.classList.contains('edu-guard-locked'),
  };
}

const ADMIN = [{ uid: 'U1', email: 'a@x' }, { role: 'admin', approved: true, name: 'A' }];

// 1) Lỗi cũ: đăng nhập xong NGAY (hồ sơ trong cache phiên) lúc trang còn đang nạp script
{
  const p = loadPage({ readyState: 'loading', roles: ['admin', 'coordinator'], auth: (cb) => cb(...ADMIN) });
  const got = [];
  // js/coordinator/dashboard.js — nạp SAU auth-guard.js, gắn listener lúc này
  p.window.addEventListener('edu:ready', (e) => got.push(e.detail.profile.role));
  eq('chưa DOMContentLoaded: chưa bắn edu:ready, trang vẫn khoá', [got, p.locked()], [[], true]);
  eq('EduCurrentProfile có sẵn ngay (trang nào cần đọc sớm)', p.window.EduCurrentProfile.role, 'admin');
  p.domContentLoaded();
  eq('sau DOMContentLoaded: listener nạp sau vẫn nhận edu:ready đúng 1 lần, trang mở khoá', [got, p.locked()], [['admin'], false]);
  eq('không chèn màn chờ khi đã xác thực xong', p.document.body.children.length, 0);
}

// 2) auth-guard được nạp muộn (trang đã xong DOM) → bắn ngay
{
  const p = loadPage({ readyState: 'complete', roles: ['admin'], auth: (cb) => cb(...ADMIN) });
  eq('trang đã nạp xong: mở khoá ngay', p.locked(), false);
}

// 3) onAuthReady gọi lại 2 lần cùng tài khoản (khôi phục phiên) → chỉ 1 edu:ready
{
  let again = null;
  const p = loadPage({ readyState: 'loading', roles: ['admin'], auth: (cb) => { cb(...ADMIN); again = cb; } });
  let n = 0;
  p.window.addEventListener('edu:ready', () => n++);
  again(...ADMIN);
  p.domContentLoaded();
  again(...ADMIN);
  eq('gọi lại cùng tài khoản: edu:ready đúng 1 lần', n, 1);
}

// 4) Sai vai trò → không bao giờ bắn edu:ready
{
  const p = loadPage({ readyState: 'loading', roles: ['admin'], auth: (cb) => cb({ uid: 'T', email: 't@x' }, { role: 'teacher', approved: true }) });
  let n = 0;
  p.window.addEventListener('edu:ready', () => n++);
  p.domContentLoaded();
  eq('vai trò không được phép: không bắn edu:ready', n, 0);
}

// 5) Xác thực xong SAU DOMContentLoaded (mạng chậm, lần đầu) → bắn ngay khi xong
{
  let later = null;
  const p = loadPage({ readyState: 'loading', roles: ['admin'], auth: (cb) => { later = cb; } });
  let n = 0;
  p.window.addEventListener('edu:ready', () => n++);
  p.domContentLoaded();
  eq('chưa xác thực xong: chưa bắn', n, 0);
  later(...ADMIN);
  eq('xác thực xong sau khi trang nạp: bắn ngay', [n, p.locked()], [1, false]);
}

console.log(failures ? `\n${failures} test FAIL` : '\nTất cả PASS');
process.exit(failures ? 1 : 0);
