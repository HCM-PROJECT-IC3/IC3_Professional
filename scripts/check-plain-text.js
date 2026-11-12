#!/usr/bin/env node
/* ============================================================
   scripts/check-plain-text.js — chặn lại lỗi "lấy chữ thuần bằng innerHTML".

   Mẫu: const d = document.createElement('div'); d.innerHTML = html; d.textContent
   → trình duyệt TẢI ẢNH và CHẠY onerror/onload ngay cả khi div chưa gắn vào trang
   (đã đo 12/11/2026: <img src=x onerror=…> trong nội dung câu hỏi chạy được ở 5 file).
   Cách đúng: new DOMParser().parseFromString(html, 'text/html').body.textContent —
   tài liệu trơ, không tải gì, không chạy gì, chữ ra giống hệt (đã so 91 chuỗi HTML của data/ic3).

   Chạy: node scripts/check-plain-text.js   (CI job "check")
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIRS = ['js', 'mos/js'];
// innerHTML gán vào 1 phần tử vừa tạo, rồi đọc textContent/innerText của CHÍNH phần tử đó trên cùng dòng/hàm ngắn.
const BAD = /createElement\(\s*['"`](?:div|span|p|template)['"`]\s*\)\s*;?\s*(\w+)\.innerHTML\s*=[^;]+;\s*return\s*\(?\s*\1\.(?:textContent|innerText)/;

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) {
      if (!['node_modules', 'vendor', '__tests__'].includes(name)) walk(p, out);
    } else if (name.endsWith('.js')) out.push(p);
  }
  return out;
}

const hits = [];
for (const d of DIRS) {
  const abs = path.join(ROOT, d);
  if (!fs.existsSync(abs)) continue;
  for (const f of walk(abs)) {
    fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      if (BAD.test(line)) hits.push(`${path.relative(ROOT, f).split(path.sep).join('/')}:${i + 1}`);
    });
  }
}

if (hits.length) {
  console.error('✗ Lấy chữ thuần bằng innerHTML (chạy được onerror trong nội dung):\n  - ' + hits.join('\n  - ') +
    "\n  Dùng: new DOMParser().parseFromString(html, 'text/html').body.textContent");
  process.exit(1);
}
console.log('✓ Không còn chỗ lấy chữ thuần bằng innerHTML');
