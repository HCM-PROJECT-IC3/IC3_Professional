/* Nén ảnh trước khi đẩy GitHub (js/services/image-compress.js) — phần tính toán, không cần trình duyệt.
   Chạy: node js/services/__tests__/image-compress.test.js */
'use strict';
require('../image-compress.js');
const C = globalThis.EduImageCompress;

let fails = 0;
const eq = (label, a, b) => {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  if (!ok) fails++;
  console.log((ok ? 'PASS  ' : 'FAIL  ') + label + (ok ? '' : '  got ' + JSON.stringify(a) + ' want ' + JSON.stringify(b)));
};

eq('ảnh chụp màn hình 2560×1440 → cạnh dài 1600, giữ tỉ lệ', C.fitSize(2560, 1440), { width: 1600, height: 900 });
eq('ảnh dọc', C.fitSize(1200, 3000), { width: 640, height: 1600 });
eq('ảnh nhỏ không phóng to', C.fitSize(800, 600), { width: 800, height: 600 });
eq('ảnh rất dẹt không về 0 px', C.fitSize(10000, 2), { width: 1600, height: 1 });
eq('nén bớt nhiều → dùng bản nén', C.useCompressed(2000000, 300000, 'image/webp'), true);
eq('bớt < 10% → giữ gốc', C.useCompressed(100000, 95000, 'image/webp'), false);
eq('nén to hơn gốc → giữ gốc', C.useCompressed(50000, 60000, 'image/webp'), false);
eq('trình duyệt không mã hoá WebP (trả PNG) → giữ gốc', C.useCompressed(2000000, 300000, 'image/png'), false);
eq('hiển thị dung lượng', [C.fmtBytes(2516582), C.fmtBytes(317440), C.fmtBytes(10)], ['2,4 MB', '310 KB', '1 KB']);

console.log(fails ? `\n${fails} FAIL` : '\nTất cả PASS');
process.exit(fails ? 1 : 0);
