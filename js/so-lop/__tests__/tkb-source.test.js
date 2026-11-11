/* Test js/so-lop/tkb-source.js — nguồn TKB (Lịch tuần + TKB lớp) và số lượt đọc Firestore (repo giả), không gọi mạng.
   Chạy: node js/so-lop/__tests__/tkb-source.test.js */
var path = require('path');
var failures = 0;
function assertEq(label, actual, expected) {
  var pass = JSON.stringify(actual) === JSON.stringify(expected);
  console.log((pass ? 'PASS' : 'FAIL') + '  ' + label + '  =>  ' + JSON.stringify(actual) + (pass ? '' : '  (expected ' + JSON.stringify(expected) + ')'));
  if (!pass) failures++;
}
require(path.join(__dirname, '..', 'tkb-source.js'));
var create = globalThis.EduSoLopTkb.create, mergeWeek = globalThis.EduSoLopTkb.mergeWeek;
var quiet = function () {};

function mem() { var d = {}; return { getItem: function (k) { return k in d ? d[k] : null; }, setItem: function (k, v) { d[k] = String(v); }, removeItem: function (k) { delete d[k]; }, _d: d }; }
function sess(periods, location, periodSchools) { return { type: 'Dạy chính', location: location || '', periods: periods, periodSchools: periodSchools }; }
// Lịch tuần của GV HCM0328 (theo ảnh TKB TiH Phong Phú 2): Thứ 3 sáng tiết 2,3,4; chiều tiết 1,2,3
var SCHED = { days: { '3': { morning: sess(['', '5/5', '4/1', '3/3', ''], 'TiH Phong Phú 2'), afternoon: sess(['5/2', '4/6', '4/1', '', ''], 'TiH Phong Phú 2') } } };

function fakeRepos(data, opts) {
  var n = { sched: 0, tt: 0, list: 0, teachers: 0, periods: 0 };
  var fail = opts && opts.fail;
  var get = function (col, key) { return function (id) { n[key]++; if (fail) return Promise.reject(new Error('offline')); var d = (data[col] || {})[id]; return Promise.resolve(d ? Object.assign({ id: id }, d) : null); }; };
  return {
    n: n,
    teachingSchedule: {
      getById: get('sched', 'sched'),
      listByTeacher: function () { return Promise.reject(new Error('không được dùng: orderBy weekKey cần index ghép')); },
      list: function (o) { n.list++; if (o.orderBy) return Promise.reject(new Error('cần index')); var code = o.where[0][2]; return Promise.resolve(Object.keys(data.sched || {}).filter(function (k) { return k.indexOf(code + '__') === 0; }).map(function (k) { return Object.assign({ id: k, weekKey: k.split('__')[1] }, data.sched[k]); })); },
    },
    teachingTimetable: { getById: get('tt', 'tt') },
    teachingPeriodTimes: { getById: get('periods', 'periods') },
    teachingTeacher: {
      list: function (o) { n.teachers++; if (o && o.where) return Promise.reject(new Error('cần index')); return Promise.resolve([{ id: 'OLD1', name: 'Nguyễn Hoài Bảo', active: false }, { id: 'HCM0328', name: 'Nguyễn Hoài Bảo', active: true }, { id: 'PT222', name: 'Nguyễn Văn Hùng' }]); },
      listActive: function () { return Promise.reject(new Error('không được dùng: cần index ghép')); },
    },
  };
}
var classesOf = function (days, d, s) { return days[d][s].map(function (c) { return c.maLop; }); };

(async function () {
  // ── Gộp Lịch tuần + TKB lớp (giống applyScheduleAutoFill / effectivePeriods) ──
  var m1 = mergeWeek(SCHED, { days: { '3': { morning: ['9/9', '9/9', '9/9', '9/9', '9/9', '4/9'], afternoon: [] }, '5': { morning: [], afternoon: [{ maLop: '3/5', truong: 'TiH X' }] } } });
  assertEq('Lịch tuần có mã lớp → thắng TKB lớp ở tiết 1–5; tiết 6+ lấy TKB lớp', classesOf(m1, '3', 'morning'), ['', '5/5', '4/1', '3/3', '', '4/9']);
  assertEq('buổi Lịch tuần trống → lấy TKB lớp (kèm trường của ô)', [classesOf(m1, '5', 'afternoon')[0], m1['5'].afternoon[0].truong], ['3/5', 'TiH X']);
  assertEq('trường = location của buổi', m1['3'].afternoon[1], { maLop: '4/6', truong: 'TiH Phong Phú 2' });
  var m2 = mergeWeek({ days: { '2': { morning: sess(['3/1', '6/2', '', '', ''], 'TiH A + THCS B', ['TiH A', 'THCS B']) } } }, null);
  assertEq('buổi 2 trường → trường theo từng tiết (periodSchools)', [m2['2'].morning[0].truong, m2['2'].morning[1].truong], ['TiH A', 'THCS B']);
  assertEq('không có lớp nào → null', [mergeWeek(null, null), mergeWeek({ days: { '2': { morning: sess(['', '', '', '', '']) } } }, null)], [null, null]);

  var t = Date.UTC(2026, 10, 11, 3); // Thứ 4 11/11/2026
  var clock = function () { return t; };
  var mon = new Date(2026, 10, 9), prev = new Date(2026, 10, 2), old = new Date(2026, 9, 5);

  // 1. Tuần có Lịch tuần: 2 get (Lịch tuần + TKB lớp) cho cả 3 lần xem (kể cả tải lại trang)
  var R = fakeRepos({ sched: { 'HCM0328__2026-11-09': SCHED } });
  var st = mem(), T = create({ repos: R, storage: st, now: clock, log: quiet });
  var a = await T.week('HCM0328', mon); await T.week('HCM0328', mon);
  await create({ repos: R, storage: st, now: clock, log: quiet }).week('HCM0328', mon);
  assertEq('tuần có Lịch tuần: lớp Thứ 3 sáng', [a.from, a.fallback, classesOf(a.days, '3', 'morning').filter(Boolean)], ['2026-11-09', false, ['5/5', '4/1', '3/3']]);
  assertEq('lượt đọc: 1 Lịch tuần + 1 TKB lớp cho 3 lần xem', [R.n.sched, R.n.tt], [1, 1]);

  // 2. Gọi đồng thời → dùng chung 1 lượt
  var R2 = fakeRepos({ sched: { 'X__2026-11-09': SCHED } }), T2 = create({ repos: R2, storage: mem(), now: clock, log: quiet });
  await Promise.all([T2.week('X', mon), T2.week('X', mon), T2.week('X', mon)]);
  assertEq('3 lần gọi cùng lúc = 1 lượt mỗi nguồn', [R2.n.sched, R2.n.tt], [1, 1]);

  // 3. Tuần chưa nhập → tuần gần nhất (list Lịch tuần tối đa 1 lần)
  var R3 = fakeRepos({ sched: { 'HCM0328__2026-10-05': SCHED } }), T3 = create({ repos: R3, storage: mem(), now: clock, log: quiet });
  var c = await T3.week('HCM0328', mon), d = await T3.week('HCM0328', prev);
  assertEq('tuần chưa nhập dùng tuần gần nhất (TKB bàn giao)', [c.from, c.fallback, d.from], ['2026-10-05', true, '2026-10-05']);
  assertEq('lượt đọc: 2 tuần × 2 nguồn + 1 list', [R3.n.sched, R3.n.tt, R3.n.list], [2, 2, 1]);
  await T3.week('HCM0328', mon); await T3.week('HCM0328', prev);
  assertEq('xem lại: không đọc thêm (nhớ cả tuần trống)', [R3.n.sched, R3.n.list], [2, 1]);

  // 4. Hết hạn: tuần hiện tại 6 giờ; tuần cũ 30 ngày
  t += 7 * 3600e3;
  await T3.week('HCM0328', mon); await T3.week('HCM0328', old);
  assertEq('sau 7 giờ chỉ hỏi lại tuần hiện tại', R3.n.sched, 3);
  t -= 7 * 3600e3;

  // 5. Lỗi mạng: 1 lượt rồi thôi trong 30 phút
  var R5 = fakeRepos({}, { fail: true }), T5 = create({ repos: R5, storage: mem(), now: clock, log: quiet });
  var e = await T5.week('HCM0328', mon); await T5.week('HCM0328', mon);
  assertEq('lỗi mạng: không thử lại liên tục', [e, R5.n.sched], [null, 1]);

  // 6. Mã GV: hồ sơ → 0 lượt; Admin → danh sách GV KHÔNG dùng where (khỏi index ghép), ưu tiên GV đang dạy
  var R6 = fakeRepos({}), T6 = create({ repos: R6, storage: mem(), now: clock, log: quiet });
  var c1 = await T6.codeOf('Nguyễn Hoài Bảo', { name: 'Nguyễn Hoài Bảo', teacherCode: 'HCM0328' });
  var c2 = await T6.codeOf('nguyen hoai bao', { name: 'Nguyễn Hoài Bảo', role: 'admin' });
  var c3 = await T6.codeOf('Nguyễn Văn Hùng', { name: 'Nguyễn Hoài Bảo', teacherCode: 'HCM0328' });
  var c4 = await T6.codeOf('Người Lạ', null);
  assertEq('mã GV: hồ sơ / tra tên (bỏ GV đã nghỉ trùng tên) / GV khác / không có', [c1, c2, c3, c4], ['HCM0328', 'HCM0328', 'PT222', '']);
  assertEq('danh sách GV đọc 1 lần', R6.n.teachers, 1);

  // 7. Giờ tiết: 1 get, giữ 3 ngày; chưa đặt → null (trang dùng khung mặc định)
  var R7 = fakeRepos({ periods: { HCM0328: { byDay: { '3': { morning: [{ start: '07:30', end: '08:05' }], afternoon: [] } } } } }), T7 = create({ repos: R7, storage: mem(), now: clock, log: quiet });
  var p1 = await T7.periods('HCM0328'); await T7.periods('HCM0328'); var p2 = await T7.periods('PT222');
  assertEq('giờ tiết: đọc 1 lần/GV, chưa đặt → null', [p1.byDay['3'].morning[0].start, p2, R7.n.periods], ['07:30', null, 2]);

  // 8. Không có Firestore / lỗi danh sách GV → null (trang báo "không đọc được", không báo nhầm "không thấy GV")
  var T8 = create({ repos: null, storage: mem(), now: clock, log: quiet });
  assertEq('không có Firestore → null', [await T8.week('A', mon), await T8.codeOf('A', null), await T8.periods('A')], [null, null, null]);

  // 9. Bỏ cache bản cũ (đọc nhầm teaching_timetable)
  var s9 = mem(); s9.setItem('eduquiz_tkb_v1', '{"w":{}}'); create({ repos: null, storage: s9, now: clock, log: quiet });
  assertEq('xoá eduquiz_tkb_v1', s9.getItem('eduquiz_tkb_v1'), null);

  console.log(failures ? failures + ' FAIL' : 'Tất cả PASS');
  process.exit(failures ? 1 : 0);
})();
