/* Test js/teacher/overview-core.js — số liệu màn Tổng quan. Chạy: node js/teacher/__tests__/overview-core.test.js — dữ liệu giả, không gọi mạng. */
var path = require('path');
var failures = 0;
function assertEq(label, actual, expected) {
  var pass = JSON.stringify(actual) === JSON.stringify(expected);
  console.log((pass ? 'PASS' : 'FAIL') + '  ' + label + '  =>  ' + JSON.stringify(actual) + (pass ? '' : '  (expected ' + JSON.stringify(expected) + ')'));
  if (!pass) failures++;
}
require(path.join(__dirname, '..', '..', 'so-lop', 'so-lop-core.js'));
require(path.join(__dirname, '..', '..', 'so-dau-bai', 'sdb-sources.js'));
require(path.join(__dirname, '..', 'overview-core.js'));
var L = globalThis.EduSoLop, SRC = globalThis.EduSdbSources, O = globalThis.EduOverviewCore;

// Thứ 5, 05/11/2026; thứ 3 cùng tuần là 03/11
var now = new Date(2026, 10, 5, 9, 0);
var csv = function (gv) {
  return ['TRƯỜNG,TiH Phong Phú 2,,,,', 'LỚP:,3A1,,,,', ',,THỨ,x,x,x', ',,NGÀY,03.11,05.11,05.11', ',,ĐÃ HOÀN THÀNH,TRUE,FALSE,FALSE', ',,TÊN GV,' + gv + ',' + gv + ',' + gv, ',,BÀI DẠY,Bài 1,Bài 2,Bài 3',
    ',HỌ & TÊN,TIẾT,1,2,3', ',An Bình,,x,x,x', ',Chi Dũng,,v,v,v', ',Em Giang,,x,x,x'].join('\n');
};
var store = { links: [{ id: 'f', school: 'TiH Phong Phú 2', tabs: [{ name: '3A1', gid: '1' }, { name: '3A2', gid: '2' }] }], cache: { 'f|1': { at: 1, csv: csv('Bảo') }, 'f|2': { at: 1, csv: csv('Hằng').replace('3A1', '3A2') } }, mine: {} };
var build = function (books, teacher, st) { return O.build({ store: st || store, books: books, teacher: teacher, now: now, L: L, SRC: SRC }); };

var r = build([], 'Bảo');
assertEq('chỉ lớp của giáo viên', [r.hasData, r.kpi.classes], [true, 1]);
assertEq('tiết tuần này: đã dạy / tổng', [r.kpi.tietDone, r.kpi.tietWeek], [1, 3]);
assertEq('chuyên cần 6/9', r.kpi.rate, 67);
assertEq('chưa dùng sổ thì không nhắc', r.kpi.unwritten, null);
assertEq('lịch tuần có đánh dấu hôm nay', r.week.map(function (e) { return [e.name, e.today, e.tiet]; }), [['3A1', false, [1]], ['3A1', true, [2, 3]]]);
assertEq('học sinh cần chú ý', r.watch.map(function (w) { return [w.name, w.cls, w.vang]; }), [['Chi Dũng', '3A1', 3]]);
assertEq('tiến độ', [r.progress[0].done, r.progress[0].total, r.progress[0].pct], [1, 3, 33]);

var books = [{ school: 'TiH Phong Phú 2', entries: [{ date: '2026-11-03', cls: '3.1' }, { date: '2026-11-05', cls: '3.1' }] }];
assertEq('buổi chưa ghi đủ tiết tính là chưa ghi', build(books, 'Bảo').kpi.unwritten, 1);
books[0].entries.push({ date: '2026-11-05', cls: '3.1' });
assertEq('ghi đủ rồi', build(books, 'Bảo').kpi.unwritten, 0);

assertEq('không có tên: mọi lớp', build([], '').kpi.classes, 2);
var none = build([], 'Người Khác');
assertEq('có sổ lớp nhưng sai tên: báo để sửa tên', [none.hasData, none.unmatched], [false, true]);
assertEq('lớp gắn sao vẫn tính dù khác tên', build([], 'Người Khác', Object.assign({}, store, { mine: { 'f|2': true } })).kpi.classes, 1);
assertEq('máy chưa có sổ lớp', [build([], 'Bảo', {}).hasData, build([], 'Bảo', {}).unmatched], [false, false]);

console.log(failures ? failures + ' FAIL' : 'Tất cả PASS');
process.exit(failures ? 1 : 0);
