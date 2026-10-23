/* Test mã kết quả học sinh → giáo viên gom (js/services/result-pack.js).
   Chạy: node js/services/__tests__/result-pack.test.js — thuần, không mạng. */
var path = require('path');
var failures = 0;
function assertEq(label, actual, expected) {
  var pass = JSON.stringify(actual) === JSON.stringify(expected);
  console.log((pass ? 'PASS' : 'FAIL') + '  ' + label + (pass ? '' : '  =>  ' + JSON.stringify(actual) + '  (expected ' + JSON.stringify(expected) + ')'));
  if (!pass) failures++;
}

// localStorage giả cho remember()/list()
var mem = {};
globalThis.window = globalThis;
globalThis.localStorage = { getItem: function (k) { return k in mem ? mem[k] : null; }, setItem: function (k, v) { mem[k] = String(v); } };
var P = require(path.join(__dirname, '..', 'result-pack.js'));

var sheet = {
  submissionId: 'abc123DEF456ghi789JK', studentName: 'Nguyễn Văn Ánh', studentClass: '10A1', studentSchool: 'THPT Đoàn Thị Điểm',
  testName: 'IC3 › LV1 › 1. Căn bản về công nghệ', score: 85, correct: '17/20', time: '12:34', status: 'OK',
  timestamp: '19/10/2026 11:41:02', examMode: 'test', tabSwitch: 1, wrong: 'ic3__lv1__t1__q3,ic3__lv1__t1__q9',
};

// ── Vòng mã hóa/giải mã giữ nguyên tiếng Việt ──
var code = P.encode(sheet);
assertEq('mã bắt đầu bằng EQR1.', code.indexOf('EQR1.'), 0);
assertEq('mã chỉ gồm ký tự an toàn khi chép', /^EQR1\.[A-Za-z0-9_-]+\.[0-9a-f]{8}$/.test(code), true);
var d = P.decode(code);
assertEq('giải mã ok', d.ok, true);
assertEq('giữ nguyên tên có dấu', d.rec.n, 'Nguyễn Văn Ánh');
assertEq('giữ nguyên điểm/đúng/thời gian', [d.rec.p, d.rec.k, d.rec.tm], [85, '17/20', '12:34']);
assertEq('giữ nguyên uid câu sai', d.rec.w, 'ic3__lv1__t1__q3,ic3__lv1__t1__q9');

// ── Mã bị chép sai phải bị phát hiện ──
var tampered = code.replace(/\.[0-9a-f]{8}$/, '.00000000');
assertEq('sai mã kiểm tra → lỗi', P.decode(tampered).ok, false);
var body = code.split('.')[1];
var flipped = 'EQR1.' + body.slice(0, 10) + (body[10] === 'A' ? 'B' : 'A') + body.slice(11) + '.' + code.split('.')[2];
assertEq('đổi 1 ký tự dữ liệu → lỗi', P.decode(flipped).ok, false);
assertEq('chép thiếu đuôi → lỗi', P.decode(code.slice(0, -3)).ok, false);
assertEq('chuỗi lạ → lỗi, không throw', P.decode('xin chao').ok, false);
assertEq('rỗng → lỗi, không throw', P.decode('').ok, false);

// ── Điểm bị ép về 0..100, chuỗi bị cắt, ký tự điều khiển bị bỏ ──
var weird = P.decode(P.encode(Object.assign({}, sheet, { score: 9999, studentName: 'A\nB\u0000C' + 'x'.repeat(200) })));
assertEq('điểm kẹp ≤ 100', weird.rec.p, 100);
assertEq('tên không còn ký tự điều khiển', /[\u0000-\u001f]/.test(weird.rec.n), false);
assertEq('tên bị cắt ≤ 80 ký tự', weird.rec.n.length <= 80, true);

// ── Gom nhiều văn bản: loại trùng, báo mã lỗi, tìm mã trong văn bản lẫn tạp ──
var sheet2 = Object.assign({}, sheet, { submissionId: 'zzz999YYY888xxx777WW', studentName: 'Trần Thị Bình', score: 40 });
var text1 = 'Em nộp ạ:\n' + code + '\nCảm ơn thầy';
var text2 = P.encode(sheet2) + '\n' + code + '\n' + tampered;
var many = P.parseMany([text1, text2]);
assertEq('gom được 2 học sinh khác nhau', many.rows.map(function (r) { return r.n; }), ['Nguyễn Văn Ánh', 'Trần Thị Bình']);
assertEq('đếm 1 mã trùng', many.dup, 1);
assertEq('codes khớp từng dòng (để lưu/nạp lại)', many.codes.map(function (c) { return P.decode(c).rec.n; }), many.rows.map(function (r) { return r.n; }));
assertEq('đếm 1 mã lỗi', many.bad.length, 1);

// ── CSV ──
var csv = P.toCsv(many.rows);
assertEq('CSV có BOM cho Excel', csv.charCodeAt(0), 0xFEFF);
assertEq('CSV: 1 dòng tiêu đề + 2 dòng dữ liệu', csv.split('\r\n').length, 3);
var evil = P.toCsv([Object.assign(P.toRecord(sheet), { n: '=HYPERLINK("http://x")' })]);
assertEq('CSV chặn công thức độc (ô bắt đầu bằng =)', evil.indexOf('"\'=HYPERLINK') > -1, true);

// ── Thống kê ──
assertEq('thống kê', P.summary(many.rows), { count: 2, avg: 63, min: 40, max: 85, below50: 1 });
assertEq('thống kê rỗng', P.summary([]).count, 0);

// ── Câu cả lớp hay sai ──
var R = function (n, c, w, t) { return { n: n, c: c, s: 'THPT A', t: t || 'IC3 › LV1 › Bài 1', w: w }; };
var ws = P.wrongStats([
  R('An', '10A1', 'u1,u2,u2'),            // uid lặp trong 1 bài chỉ tính 1 lượt
  R('An', '10A1', 'u1'),                  // cùng em nộp lại: +1 lượt, vẫn 1 HS
  R('Bình', '10A1', 'u2, u3', 'IC3 › LV1 › Bài 2'),
  R('Chi', '10A2', ''),                   // không sai câu nào
]);
assertEq('wrongStats: đếm bài, bài có câu sai', [ws.submissions, ws.withWrong], [4, 3]);
assertEq('wrongStats: xếp theo lượt sai, rồi số HS, rồi uid', ws.items.map(function (i) { return [i.uid, i.count, i.students]; }), [['u2', 2, 2], ['u1', 2, 1], ['u3', 1, 1]]);
assertEq('wrongStats: gom tên bài chứa câu', ws.items.find(function (i) { return i.uid === 'u2'; }).tests, ['IC3 › LV1 › Bài 1', 'IC3 › LV1 › Bài 2']);
assertEq('wrongStats rỗng', P.wrongStats([]), { submissions: 0, withWrong: 0, items: [] });
assertEq('wrongStats đọc được trường w của mã đã giải', P.wrongStats([d.rec]).items.map(function (i) { return i.uid; }), ['ic3__lv1__t1__q3', 'ic3__lv1__t1__q9']);

// ── Lưu trên máy học sinh ──
var c1 = P.remember(sheet);
assertEq('remember trả mã', c1, code);
P.remember(sheet2);
P.remember(sheet);   // nộp lại cùng id → không nhân đôi
assertEq('không lưu trùng cùng id bài', P.list().length, 2);
assertEq('bài mới nhất đứng đầu', P.last().id, 'abc123DEF456ghi789JK');
for (var i = 0; i < 80; i++) P.remember(Object.assign({}, sheet, { submissionId: 'id' + String(i).padStart(18, '0') }));
assertEq('chỉ giữ 60 bài gần nhất', P.list().length, 60);
assertEq('tên file an toàn', P.safeName('Nguyễn Đức Hải'), 'nguyen-duc-hai');

if (failures) { console.log('\n' + failures + ' kiểm tra THẤT BẠI'); process.exit(1); }
console.log('\nTất cả kiểm tra đạt.');
