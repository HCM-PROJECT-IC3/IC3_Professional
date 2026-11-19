#!/usr/bin/env node
/* scripts/build-apps-script.js — gộp apps/src/*.gs (mỗi file 1 nhiệm vụ, theo thứ tự
   tên file) thành apps/Code.gs để dán 1 lần vào Apps Script editor.
     node scripts/build-apps-script.js           → ghi apps/Code.gs
     node scripts/build-apps-script.js --check   → chỉ kiểm tra apps/Code.gs đã khớp
                                                   nguồn chưa (CI dùng), lệch thì exit 1 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'apps', 'src');
const OUT = path.join(ROOT, 'apps', 'Code.gs');

const files = fs.readdirSync(SRC).filter((f) => f.endsWith('.gs')).sort();
// Domain thuần DÙNG CHUNG với trình duyệt: chép NGUYÊN VĂN (không bản sao tay → không lệch luật).
// File phải là IIFE gắn vào globalThis, không `?.`/`??`, không DOM/mạng (scripts/check-architecture.js R1).
const SHARED = ['js/techrealm/cultivation-core.js', 'js/techrealm/cultivation-service.js', 'js/techrealm/learning-core.js',
  'js/techrealm/challenge-core.js', 'js/techrealm/thanh-pho-mat-dien-core.js', 'js/techrealm/mentor-core.js'];
const banner =
  '// ⚠️ FILE TẠO TỰ ĐỘNG từ ' + SHARED.join(', ') + ' + apps/src/*.gs — đừng sửa tay ở đây.\n' +
  '// Sửa file nguồn tương ứng rồi chạy: node scripts/build-apps-script.js\n' +
  '// Thứ tự: ' + SHARED.map((f) => path.basename(f)).concat(files).join(', ') + '\n';
const shared = SHARED.map((f) => {
  const text = fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\r\n/g, '\n').replace(/\s+$/, '');
  if (/\?\.|\?\?/.test(text.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '').replace(/'(?:[^'\\]|\\.)*'/g, "''"))) {
    console.error('✖ ' + f + ' dùng `?.` hoặc `??` — Apps Script có thể không chạy được, hãy viết lại.');
    process.exit(1);
  }
  return '\n// ──────────────── ' + f + ' (dùng chung với trình duyệt — sửa ở file gốc) ────────────────\n' + text + '\n';
}).join('');
const body = shared + files.map((f) => {
  const text = fs.readFileSync(path.join(SRC, f), 'utf8').replace(/\r\n/g, '\n').replace(/\s+$/, '');
  return '\n// ──────────────── ' + f + ' ────────────────\n' + text + '\n';
}).join('');
const out = banner + body;

// Bắt lỗi cú pháp trước khi đem dán (Apps Script dùng V8, cú pháp như Node).
try {
  new Function(out); // eslint-disable-line no-new-func
} catch (err) {
  console.error('✖ apps/Code.gs gộp ra bị lỗi cú pháp:', err.message);
  process.exit(1);
}

if (process.argv.includes('--check')) {
  const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8').replace(/\r\n/g, '\n') : '';
  if (current !== out) {
    console.error('✖ apps/Code.gs chưa khớp apps/src/*.gs — chạy: node scripts/build-apps-script.js');
    process.exit(1);
  }
  console.log(`apps/Code.gs khớp ${files.length} file nguồn.`);
} else {
  fs.writeFileSync(OUT, out);
  console.log(`Đã gộp ${files.length} file → apps/Code.gs (${out.split('\n').length} dòng).`);
}
