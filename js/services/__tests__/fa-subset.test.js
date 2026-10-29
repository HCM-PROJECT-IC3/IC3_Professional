/* Test: bộ icon Font Awesome RÚT GỌN tự lưu (lib/fontawesome/, scripts/build-fa-subset.py) phải có ĐỦ
   mọi icon code đang dùng — thêm icon mới mà quên chạy lại script thì icon hiện thành ô trống.
   Cùng cách quét với script: "fa-<tên>" trong *.html/*.js/*.css + bảng EMOJI_FA (ghép tên động).
   Chạy: node js/services/__tests__/fa-subset.test.js */
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

let failures = 0;
function eq(label, actual, expected) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  console.log((pass ? 'PASS' : 'FAIL') + '  ' + label + '  =>  ' + JSON.stringify(actual) + (pass ? '' : '  (expected ' + JSON.stringify(expected) + ')'));
  if (!pass) failures++;
}

const ROOT = path.join(__dirname, '..', '..', '..');
const NOT_ICON = /^((solid|regular|brands)-\d+|solid|regular|brands|light|thin|duotone|sharp|classic|fw|lg|sm|xs|2xs|xl|2xl|[1-9]0?x|spin|spin-pulse|spin-reverse|pulse|beat|beat-fade|bounce|fade|flip|shake|rotate-\d+|rotate-by|flip-horizontal|flip-vertical|flip-both|inverse|border|pull-left|pull-right|pull-start|pull-end|stack|stack-1x|stack-2x|ul|li|width-auto|layers|sr-only|sr-only-focusable|swap-opacity)$/;

const files = execSync('git ls-files "*.html" "*.js" "*.css"', { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean)
  .filter((f) => !f.includes('__tests__') && !f.startsWith('lib/') && !f.startsWith('apps/'));
const used = new Map(); // tên → file đầu tiên dùng
let cdn = [];
files.forEach((f) => {
  const txt = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const add = (n) => { if (!NOT_ICON.test(n) && !used.has(n)) used.set(n, f); };
  for (const m of txt.matchAll(/(?<![\w-])fa-([a-z0-9]+(?:-[a-z0-9]+)*)/g)) add(m[1]);
  const emo = txt.match(/EMOJI_FA\s*=\s*\{([\s\S]*?)\};/);
  if (emo) for (const m of emo[1].matchAll(/:\s*'([a-z0-9-]+)'/g)) add(m[1]);
  if (f.endsWith('.html') && /cdnjs\.cloudflare\.com\/ajax\/libs\/font-awesome/.test(txt)) cdn.push(f);
});

const css = fs.readFileSync(path.join(ROOT, 'lib/fontawesome/css/fa.min.css'), 'utf8');
const inCss = new Set([...css.matchAll(/\.fa-([a-z0-9-]+)(?=[,{:])/g)].map((m) => m[1]));
const missing = [...used.keys()].filter((n) => !inCss.has(n)).map((n) => `${n} (${used.get(n)})`);

eq('quét được icon trong code', used.size > 100, true);
eq('mọi icon code dùng đều có trong lib/fontawesome (thiếu → chạy: python scripts/build-fa-subset.py)', missing, []);
eq('không trang nào còn nạp Font Awesome từ cdnjs', cdn, []);
['fa-solid-900', 'fa-regular-400', 'fa-brands-400'].forEach((f) => {
  const p = path.join(ROOT, 'lib/fontawesome/webfonts', f + '.woff2');
  eq(`có font ${f}.woff2 (rút gọn < 60 KB)`, fs.existsSync(p) && fs.statSync(p).size < 60000, true);
});

console.log(failures ? '\n' + failures + ' test FAIL' : '\nTất cả PASS');
process.exit(failures ? 1 : 0);
