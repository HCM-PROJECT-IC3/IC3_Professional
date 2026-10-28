/* Test js/name-picker/np-lessons.js — Bốc thử thách theo tiết/bài hôm nay (khối → cấp độ, PPCT → bài, lọc câu hỏi miệng).
   Chạy: node js/name-picker/__tests__/np-lessons.test.js — fetch giả đọc file data/ trong repo, không gọi mạng. */
var path = require('path');
var fs = require('fs');

var failures = 0;
function assertEq(label, actual, expected) {
  var pass = JSON.stringify(actual) === JSON.stringify(expected);
  console.log((pass ? 'PASS' : 'FAIL') + '  ' + label + '  =>  ' + JSON.stringify(actual) + (pass ? '' : '  (expected ' + JSON.stringify(expected) + ')'));
  if (!pass) failures++;
}

var ROOT = path.join(__dirname, '..', '..', '..');
globalThis.fetch = function (url) {
  return new Promise(function (resolve) {
    var f = path.join(ROOT, url);
    var ok = fs.existsSync(f);
    resolve({ ok: ok, status: ok ? 200 : 404, json: function () { return Promise.resolve(JSON.parse(fs.readFileSync(f, 'utf8'))); } });
  });
};
require(path.join(__dirname, '..', 'np-lessons.js'));
var LS = globalThis.EduNamePickerLessons;

// ── Khối lớp → cấp độ (giống sảnh thi) ──
assertEq('lớp 3 → Spark LV1', LS.levelForClass('3A1'), 'Spark__LV1');
assertEq('lớp 4/1 → Spark LV2', LS.levelForClass('4/1'), 'Spark__LV2');
assertEq('lớp 5A5 → Spark LV3', LS.levelForClass('5A5'), 'Spark__LV3');
assertEq('lớp 6 → IC3 LV1', LS.levelForClass('6A2'), 'IC3__LV1');
assertEq('lớp 8A13 → IC3 LV3', LS.levelForClass('8A13'), 'IC3__LV3');
assertEq('lớp 9 / không có số → không đoán', [LS.levelForClass('9A1'), LS.levelForClass('Lớp chiều')], ['', '']);

// ── PPCT → tiết ──
var ps = LS.periodsOf([
  { tiet: '1-2', bai: 1 }, { tiet: '3', bai: 2 }, { tiet: '3', bai: 3 },
  { tiet: '4', kind: 'on', title: 'Ôn tập 1' }, { tiet: '5', kind: 'kt', title: 'Kiểm tra giữa HK1' },
  { tiet: '6', bai: 4 }, { tiet: '44+45', kind: 'on', title: 'Ôn tập tổng hợp' },
]);
assertEq('tiết "1-2" tách thành tiết 1 và 2 cùng Bài 1', ps.slice(0, 2).map(function (p) { return [p.tiet, p.bai]; }), [[1, [1]], [2, [1]]]);
assertEq('1 tiết 2 bài', ps[2].bai, [2, 3]);
assertEq('tiết Ôn tập hỏi lại các bài từ đầu tới đó', ps[3].bai, [1, 2, 3]);
assertEq('Kiểm tra ngay sau Ôn tập hỏi lại đúng các bài đó', ps[4].bai, [1, 2, 3]);
assertEq('Ôn tập sau chỉ hỏi bài học sau tiết kiểm tra', ps[6].bai, [4]);
assertEq('tiết "44+45"', ps.slice(6).map(function (p) { return p.tiet; }), [44, 45]);

// ── Lọc câu hỏi miệng ──
var base = { type: 'single', question: 'Thiết bị nào dùng để nhập dữ liệu?', options: ['Bàn phím', 'Loa', 'Máy in'], correct: ['Bàn phím'], image: false };
function q(over) { return Object.assign({}, base, over); }
assertEq('câu rõ ràng → nhận', LS.suitable(base, 3), true);
assertEq('câu có hình → bỏ', LS.suitable(q({ image: true }), 6), false);
assertEq('nhắc "hình dưới đây" → bỏ', LS.suitable(q({ question: 'Biểu tượng trong hình dưới đây là gì?' }), 6), false);
assertEq('nhắc "câu trên" → bỏ', LS.suitable(q({ question: 'Đáp án ở câu trên dùng để làm gì?' }), 6), false);
assertEq('kéo thả / ghép cặp → bỏ', LS.suitable(q({ type: 'matching' }), 6), false);
assertEq('đáp án không có trong phương án → bỏ', LS.suitable(q({ correct: ['Chuột'] }), 6), false);
assertEq('phương án trùng nhau → bỏ', LS.suitable(q({ options: ['Loa', 'loa', 'Bàn phím'] }), 6), false);
assertEq('1 đáp án nhưng ghi 2 đáp án đúng → bỏ', LS.suitable(q({ correct: ['Bàn phím', 'Loa'] }), 6), false);
var long = 'Theo em, ' + 'khi sử dụng máy tính ở trường cùng các bạn trong lớp, '.repeat(2) + 'ở nhà và ở thư viện, em cần làm gì?';
assertEq('câu dài: tiểu học bỏ, THCS nhận (' + long.length + ' ký tự)', [LS.suitable(q({ question: long }), 3), LS.suitable(q({ question: long }), 7)], [false, true]);
var card = LS.toCard(q({ type: 'multi', options: ['Bàn phím', 'Loa', 'Chuột'], correct: ['Bàn phím', 'Chuột'], uid: 'x1', explanation: 'Bàn phím và chuột là thiết bị nhập.' }), 'Bài 2');
assertEq('thẻ nhiều đáp án ghi số đáp án + chữ cái', [card.n, card.ok, card.a, card.src], [2, [0, 2], 'A. Bàn phím · C. Chuột', 'Bài 2']);

// ── Dữ liệu thật: mọi cấp đủ 35 bài, mọi tiết có bài đều bốc được câu, không lấy bài chưa học ──
(async function () {
  var ppct = await LS.load();
  for (var i = 0; i < LS.LEVELS.length; i++) {
    var lv = LS.LEVELS[i].id, P = ppct[lv];
    var bai = new Set();
    P.periods.forEach(function (p) { p.bai.forEach(function (b) { bai.add(b); }); });
    var thin = [], future = [];
    for (var k = 0; k < P.periods.length; k++) {
      var p = P.periods[k];
      if (!p.bai.length) continue;
      var cards = await LS.pool(lv, p.tiet);
      if (cards.length < 2) thin.push(p.tiet);
      var later = P.periods.filter(function (x) { return x.tiet > p.tiet && x.items.length && x.items.every(function (it) { return /^Bài \d+$/.test(it); }); })
        .reduce(function (a, x) { return a.concat(x.bai.filter(function (b) { return p.bai.indexOf(b) < 0; })); }, []);
      cards.forEach(function (c) { if (later.indexOf(+c.src.slice(4)) >= 0 && P.periods.every(function (x) { return x.tiet > p.tiet || x.bai.indexOf(+c.src.slice(4)) < 0; })) future.push(p.tiet + ':' + c.src); });
    }
    assertEq(lv + ': PPCT phủ đủ Bài 1–35', bai.size, 35);
    assertEq(lv + ': tiết nào cũng có ≥ 2 câu hỏi', thin, []);
    assertEq(lv + ': không hỏi bài chưa học', future, []);
  }
  console.log(failures ? failures + ' FAIL' : 'Tất cả PASS');
  process.exit(failures ? 1 : 0);
})();
