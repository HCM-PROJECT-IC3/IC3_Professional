#!/usr/bin/env node
/* scripts/check-html.js — bắt link file HỎNG trước khi deploy (đổi tên/xoá
   1 file JS/CSS/ảnh mà quên sửa trang → trang trắng hoặc mất style trên máy
   học sinh, CI cú pháp không phát hiện được). Kiểm:
     • mọi trang *.html ở gốc + mos/index.html: src/href trỏ file cục bộ phải có thật;
       mỗi trang có <html lang>, <meta viewport>, <title>;
     • url(...) trong mọi file CSS;
     • tên trang "xxx.html" viết trong js/ (vd location.href = 'arena.html').
   Chạy:
     node scripts/check-html.js */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
const SKIP_URL = /^(https?:|mailto:|tel:|data:|javascript:|blob:|about:|\/\/|#)/i;
const problems = [];

function walk(dir, ext, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) { if (name !== 'node_modules' && name !== 'vendor') walk(p, ext, out); }
    else if (name.endsWith(ext)) out.push(p);
  }
  return out;
}

function exists(fromDir, url) {
  const clean = decodeURI(url.split(/[?#]/)[0]);
  if (!clean) return true;
  const p = clean.startsWith('/') ? path.join(ROOT, clean) : path.join(fromDir, clean);
  return fs.existsSync(p);
}

// 1. Trang HTML
const pages = fs.readdirSync(ROOT).filter((f) => f.endsWith('.html')).map((f) => path.join(ROOT, f));
pages.push(path.join(ROOT, 'mos', 'index.html'));
for (const page of pages) {
  const src = fs.readFileSync(page, 'utf8');
  const name = rel(page);
  if (!/<html[^>]*\blang=/i.test(src)) problems.push(`${name}: thiếu <html lang="vi">`);
  if (!/name=["']viewport["']/i.test(src)) problems.push(`${name}: thiếu <meta name="viewport">`);
  if (!/<title>[^<]+<\/title>/i.test(src)) problems.push(`${name}: thiếu <title>`);
  // \s trước src/href: bỏ qua data-src, data-href... (thuộc tính riêng của JS).
  const re = /\s(?:src|href)\s*=\s*(["'])(.*?)\1/gi;
  let m;
  while ((m = re.exec(src))) {
    const url = m[2].trim();
    if (!url || SKIP_URL.test(url) || /\$\{|'\s*\+|\{\{/.test(url)) continue;
    if (!exists(path.dirname(page), url)) problems.push(`${name}: không có file "${url}"`);
  }
}

// 2. url(...) trong CSS
const cssFiles = [path.join(ROOT, 'style.css'), ...walk(path.join(ROOT, 'css'), '.css'),
  ...walk(path.join(ROOT, 'lib'), '.css'), ...walk(path.join(ROOT, 'mos', 'css'), '.css')];
for (const css of cssFiles) {
  const src = fs.readFileSync(css, 'utf8');
  const re = /url\(\s*(["']?)([^"')]+)\1\s*\)/g;
  let m;
  while ((m = re.exec(src))) {
    const url = m[2].trim();
    if (SKIP_URL.test(url)) continue;
    if (!exists(path.dirname(css), url)) problems.push(`${rel(css)}: không có file "${url}"`);
  }
}

// 3. Tên trang viết cứng trong JS
for (const js of walk(path.join(ROOT, 'js'), '.js')) {
  if (js.includes(`${path.sep}__tests__${path.sep}`)) continue;
  const src = fs.readFileSync(js, 'utf8');
  const re = /["'`/]([a-z0-9][a-z0-9-]*\.html)\b/g;
  let m;
  while ((m = re.exec(src))) {
    if (!fs.existsSync(path.join(ROOT, m[1])) && !fs.existsSync(path.join(ROOT, 'mos', m[1]))) {
      problems.push(`${rel(js)}: trỏ tới trang không có "${m[1]}"`);
    }
  }
}

for (const p of problems) console.log('✖ ' + p);
console.log(problems.length
  ? `\n${problems.length} lỗi trong ${pages.length} trang / ${cssFiles.length} file CSS.`
  : `✔ ${pages.length} trang HTML, ${cssFiles.length} file CSS: mọi file được tham chiếu đều có.`);
process.exit(problems.length ? 1 : 0);
