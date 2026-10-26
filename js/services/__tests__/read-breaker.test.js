/* Test cầu dao chống vòng lặp đọc trong js/firebase-config.js (guardQueries) với Firebase GIẢ —
   không gọi Firebase thật. Chạy: node js/services/__tests__/read-breaker.test.js */
'use strict';
const path = require('path');

let failures = 0;
function eq(label, actual, expected) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  console.log((pass ? 'PASS' : 'FAIL') + '  ' + label + '  =>  ' + JSON.stringify(actual) + (pass ? '' : '  (expected ' + JSON.stringify(expected) + ')'));
  if (!pass) failures++;
}

// ── Trình duyệt + Firebase compat giả ──
const store = new Map();
global.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
global.location = { pathname: '/admin-users.html' };
global.window = global;
let serverCalls = 0;
class Query {
  constructor(size) { this.size = size; }
  get(options) {
    serverCalls++;
    const cache = !!(options && options.source === 'cache');
    return Promise.resolve({ size: this.size, metadata: { fromCache: cache } });
  }
}
const db = { settings() {}, enablePersistence: () => Promise.resolve(), collection: () => new Query(0), doc: () => ({ id: 'x' }) };
const firestore = () => db;
firestore.Query = Query;
firestore.setLogLevel = () => {};
global.firebase = { apps: [], initializeApp() { this.apps.push({}); }, firestore };
const realError = console.error;
const errors = [];
console.error = (m) => errors.push(String(m));
console.info = () => {};

require(path.join(__dirname, '..', '..', 'firebase-config.js'));
const B = global.EduFirebase.readBreaker;

(async () => {
  eq('Query.get đã được bọc', Query.prototype.get.__eduBreaker, true);
  // Nạp file 2 lần (ensure() + thẻ script) không bọc chồng
  const once = Query.prototype.get;
  require.cache[require.resolve(path.join(__dirname, '..', '..', 'firebase-config.js'))] = undefined;
  delete require.cache[require.resolve(path.join(__dirname, '..', '..', 'firebase-config.js'))];
  require(path.join(__dirname, '..', '..', 'firebase-config.js'));
  eq('nạp lại không bọc chồng', Query.prototype.get === once, true);

  await new Query(2800).get();
  eq('đếm lượt đọc tính phí (cả roster)', B.total(), 2800);
  await new Query(0).get();
  eq('truy vấn rỗng vẫn tính 1 lượt', B.total(), 2801);
  await new Query(500).get({ source: 'cache' });
  eq('kết quả từ cache máy không tính', B.total(), 2801);
  await new Query(3300).get();

  const before = serverCalls;
  let err = null;
  try { await new Query(10).get(); } catch (e) { err = e; }
  eq('vượt trần → từ chối, KHÔNG gọi máy chủ', [err && err.code, err && err.breaker, serverCalls - before], ['resource-exhausted', true, 0]);
  eq('EduFirebase.isQuotaOrOffline nhận ra lỗi cầu dao', global.EduFirebase.isQuotaOrOffline(err), true);
  eq('cảnh báo console đúng 1 lần', (await new Query(1).get().catch(() => 0), errors.filter((m) => m.includes('Cầu dao')).length), 1);
  const cached = await new Query(5).get({ source: 'cache' });
  eq('đọc từ cache máy vẫn được khi đã ngắt', cached.size, 5);

  // Đếm chung mọi tab (localStorage) và tự mở lại khi cửa sổ trôi qua
  const log = JSON.parse(store.get('edu_fs_read_burst'));
  eq('lưu chung qua localStorage', log.reduce((s, x) => s + x[1], 0), 6101);
  store.set('edu_fs_read_burst', JSON.stringify(log.map((x) => [x[0] - B.windowMs - 1, x[1]])));
  eq('hết cửa sổ 10 phút → mở lại', B.total(), 0);
  const ok = await new Query(7).get();
  eq('truy vấn chạy lại bình thường', [ok.size, B.total()], [7, 7]);

  // localStorage bị chặn → vẫn đếm trong tab
  global.localStorage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  await new Query(6000).get();
  let err2 = null;
  try { await new Query(1).get(); } catch (e) { err2 = e; }
  eq('storage bị chặn: vẫn ngắt theo bộ đếm trong tab', err2 && err2.code, 'resource-exhausted');

  console.error = realError;
  console.log(failures ? `\n${failures} test FAIL` : '\nTất cả PASS');
  process.exit(failures ? 1 : 0);
})();
