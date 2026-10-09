#!/usr/bin/env node
/* scripts/check-js.js — kiểm tra CÚ PHÁP mọi file js/ + sw.js (bắt lỗi gõ
   nhầm làm trắng trang trước khi deploy). File ES module (có "import"/
   "export" ở đầu dòng) được kiểm bằng --input-type=module. Chạy:
     node scripts/check-js.js */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const files = [];
(function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) { if (name !== 'node_modules') walk(p); }
    else if (name.endsWith('.js')) files.push(p);
  }
})(path.join(ROOT, 'js'));
files.push(path.join(ROOT, 'sw.js'));

let bad = 0;
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  const isModule = /^\s*(import|export)\s/m.test(src);
  const r = isModule
    ? spawnSync(process.execPath, ['--input-type=module', '--check'], { input: src, encoding: 'utf8' })
    : spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
  if (r.status !== 0) {
    bad++;
    console.log(`✖ ${path.relative(ROOT, f)}\n${(r.stderr || '').split('\n').slice(0, 5).join('\n')}`);
  }
}
console.log(`${files.length - bad}/${files.length} file JS đúng cú pháp.`);
process.exit(bad ? 1 : 0);
