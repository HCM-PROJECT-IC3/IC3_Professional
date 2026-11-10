/* Test js/so-lop/tkb-source.js — đếm lượt đọc Firestore (repo giả), không gọi mạng.
   Chạy: node js/so-lop/__tests__/tkb-source.test.js */
var path = require('path');
var failures = 0;
function assertEq(label, actual, expected) {
  var pass = JSON.stringify(actual) === JSON.stringify(expected);
  console.log((pass ? 'PASS' : 'FAIL') + '  ' + label + '  =>  ' + JSON.stringify(actual) + (pass ? '' : '  (expected ' + JSON.stringify(expected) + ')'));
  if (!pass) failures++;
}
require(path.join(__dirname, '..', 'tkb-source.js'));
var create = globalThis.EduSoLopTkb.create;

function mem() { var d = {}; return { getItem: function (k) { return k in d ? d[k] : null; }, setItem: function (k, v) { d[k] = String(v); }, _d: d }; }
var DAYS = { '3': { morning: ['', '4/1'], afternoon: ['5/2'] } };
function fakeRepos(docs, opts) {
  var n = { get: 0, list: 0, teachers: 0 };
  var R = {
    n: n,
    teachingTimetable: {
      getById: function (id) { n.get++; if (opts && opts.fail) return Promise.reject(new Error('offline')); return Promise.resolve(docs[id] ? { id: id, days: docs[id] } : null); },
      listByTeacher: function (code) { n.list++; return Promise.resolve(Object.keys(docs).filter(function (k) { return k.indexOf(code + '__') === 0; }).map(function (k) { return { id: k, weekKey: k.split('__')[1], days: docs[k] }; })); },
    },
    teachingTeacher: { listActive: function () { n.teachers++; return Promise.resolve([{ id: 'HCM0328', name: 'Nguyễn Hoài Bảo' }, { id: 'PT222', name: 'Nguyễn Văn Hùng' }]); } },
  };
  return R;
}

(async function () {
  var t = Date.UTC(2026, 10, 10, 3); // Thứ 3 10/11/2026
  var clock = function () { return t; };
  var mon = new Date(2026, 10, 9), prev = new Date(2026, 10, 2), old = new Date(2026, 9, 5);

  // 1. Tuần có TKB: 1 lượt get, mở lại / vẽ lại không đọc thêm
  var R = fakeRepos({ 'HCM0328__2026-11-09': DAYS });
  var st = mem(), T = create({ repos: R, storage: st, now: clock });
  var a = await T.week('HCM0328', mon);
  var b = await T.week('HCM0328', mon);
  var T2 = create({ repos: R, storage: st, now: clock }); // tải lại trang
  await T2.week('HCM0328', mon);
  assertEq('tuần có TKB: 1 lượt đọc cho 3 lần xem (cả tải lại trang)', [a.from, a.fallback, b.from, R.n.get], ['2026-11-09', false, '2026-11-09', 1]);

  // 2. Gọi đồng thời → dùng chung 1 lượt
  var R2 = fakeRepos({ 'X__2026-11-09': DAYS }), T3 = create({ repos: R2, storage: mem(), now: clock });
  await Promise.all([T3.week('X', mon), T3.week('X', mon), T3.week('X', mon)]);
  assertEq('3 lần gọi cùng lúc = 1 lượt đọc', R2.n.get, 1);

  // 3. Tuần chưa nhập TKB → TKB gần nhất (bàn giao), list tối đa 1 lần
  var R3 = fakeRepos({ 'HCM0328__2026-10-05': DAYS }), s3 = mem(), T4 = create({ repos: R3, storage: s3, now: clock });
  var c = await T4.week('HCM0328', mon);
  var d = await T4.week('HCM0328', prev);
  assertEq('tuần chưa có TKB dùng TKB bàn giao gần nhất', [c.from, c.fallback, d.from], ['2026-10-05', true, '2026-10-05']);
  assertEq('lượt đọc: 2 get (2 tuần) + 1 list', [R3.n.get, R3.n.list], [2, 1]);
  await T4.week('HCM0328', mon); await T4.week('HCM0328', prev);
  assertEq('xem lại 2 tuần đó: không đọc thêm (đã nhớ cả tuần trống)', [R3.n.get, R3.n.list], [2, 1]);

  // 4. Hết hạn: tuần hiện tại 6 giờ; tuần đã qua 30 ngày
  t += 7 * 3600e3;
  await T4.week('HCM0328', mon); await T4.week('HCM0328', old);
  assertEq('sau 7 giờ: chỉ hỏi lại tuần hiện tại, tuần cũ giữ nguyên', R3.n.get, 3);
  t -= 7 * 3600e3;

  // 5. Lỗi mạng: không thử lại trong 30 phút, dùng bản cũ nếu có
  var s5 = mem(), R5 = fakeRepos({}, { fail: true }), T5 = create({ repos: R5, storage: s5, now: clock });
  var e = await T5.week('HCM0328', mon); await T5.week('HCM0328', mon); await T5.week('HCM0328', mon);
  assertEq('lỗi mạng: 1 lượt rồi thôi, trả null', [e, R5.n.get], [null, 1]);

  // 6. Mã GV: hồ sơ có teacherCode → 0 lượt; admin → 1 lượt danh sách, giữ 3 ngày
  var R6 = fakeRepos({}), T6 = create({ repos: R6, storage: mem(), now: clock });
  var c1 = await T6.codeOf('Nguyễn Hoài Bảo', { name: 'Nguyễn Hoài Bảo', teacherCode: 'HCM0328' });
  var c2 = await T6.codeOf('nguyen hoai bao', { name: 'Nguyễn Hoài Bảo', role: 'admin' });
  var c3 = await T6.codeOf('Nguyễn Văn Hùng', { name: 'Nguyễn Hoài Bảo', teacherCode: 'HCM0328' });
  var c4 = await T6.codeOf('Người Lạ', null);
  assertEq('mã GV: hồ sơ / tra tên (không dấu cũng khớp) / GV khác / không có', [c1, c2, c3, c4], ['HCM0328', 'HCM0328', 'PT222', '']);
  assertEq('tra tên chỉ đọc danh sách GV 1 lần', R6.n.teachers, 1);

  // 7. Không có repository (trang chưa nạp Firestore) → null, không lỗi
  var T7 = create({ repos: null, storage: mem(), now: clock });
  assertEq('không có Firestore → null (trang báo "không đọc được", không báo nhầm "không thấy GV")', [await T7.week('A', mon), await T7.codeOf('A', null)], [null, null]);
  var R8 = fakeRepos({}); R8.teachingTeacher.listActive = function () { return Promise.reject(new Error('offline')); };
  assertEq('đọc danh sách GV lỗi → null', await create({ repos: R8, storage: mem(), now: clock }).codeOf('A', null), null);

  console.log(failures ? failures + ' FAIL' : 'Tất cả PASS');
  process.exit(failures ? 1 : 0);
})();
