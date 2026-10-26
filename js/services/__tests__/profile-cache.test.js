/* Test js/services/profile-cache-service.js — get(uid) với Firestore GIẢ (đếm lượt đọc),
   không IndexedDB (cache trong RAM). Chạy: node js/services/__tests__/profile-cache.test.js */
'use strict';
const path = require('path');

let failures = 0;
function eq(label, actual, expected) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  console.log((pass ? 'PASS' : 'FAIL') + '  ' + label + '  =>  ' + JSON.stringify(actual) + (pass ? '' : '  (expected ' + JSON.stringify(expected) + ')'));
  if (!pass) failures++;
}

const PROFILES = { B: { avatar: 'data:image/png;base64,AAA', status: 'hi' } };
let reads = 0;
global.window = global;
global.EduFirebase = {
  db: {
    collection: () => ({
      doc: (uid) => ({ get: async () => { reads++; return { exists: !!PROFILES[uid], data: () => PROFILES[uid] }; } }),
    }),
  },
};
let now = 1_000_000_000_000;
Date.now = () => now;
require(path.join(__dirname, '..', 'profile-cache-service.js'));
const C = global.EduProfileCache;
const MIN = 60 * 1000;

(async () => {
  eq('chưa có hồ sơ: lần đầu đọc 1 lượt', [await C.get('A'), reads], [null, 1]);
  eq('chưa có hồ sơ: mở lại trang → 0 lượt (trước đây mỗi lần 1 lượt)', [await C.get('A'), reads], [null, 1]);
  now += 3 * 60 * MIN;
  eq('chưa có hồ sơ: sau 3 giờ vẫn dùng cache', [await C.get('A'), reads], [null, 1]);
  now += 3 * 60 * MIN + 1;
  eq('chưa có hồ sơ: quá 6 giờ → hỏi lại', [await C.get('A'), reads], [null, 2]);

  eq('có hồ sơ: lần đầu 1 lượt', [(await C.get('B')).status, reads], ['hi', 3]);
  eq('có hồ sơ: trong 10 phút → 0 lượt', [(await C.get('B')).status, reads], ['hi', 3]);
  now += 11 * MIN;
  eq('có hồ sơ: quá 10 phút → hỏi lại (đổi ảnh ở máy khác vẫn cập nhật)', [(await C.get('B')).status, reads], ['hi', 4]);

  await C.put('A', { avatar: 'data:image/png;base64,BBB' });
  eq('chính người đó vừa tạo hồ sơ (put) → hiện ngay, 0 lượt', [(await C.get('A')).avatar, reads], ['data:image/png;base64,BBB', 4]);

  console.log(failures ? `\n${failures} test FAIL` : '\nTất cả PASS');
  process.exit(failures ? 1 : 0);
})();
