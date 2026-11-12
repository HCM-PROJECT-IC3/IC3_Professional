#!/usr/bin/env node
/* ============================================================
   scripts/check-legacy-paths.js — chốt chặn khi chuyển dần sang React (2.0).

   1. Mọi trang cũ ở thư mục gốc vẫn còn đúng tên: link đề đã phát cho học sinh,
      bookmark, sw.js và manifest.webmanifest đều dựa vào các đường dẫn này.
      Muốn bỏ 1 trang → để lại trang chuyển hướng cùng tên, KHÔNG xoá.
   2. PWA giữ nguyên: manifest start_url/scope, sw.js ở gốc.
   3. File dữ liệu/bảo mật cốt lõi còn nguyên chỗ.
   4. Bản build React đã commit (app/) đầy đủ: app/index.html chỉ trỏ tới file
      có thật trong app/assets (quên chạy `npm run build` trong web/ → báo lỗi).

   Chạy: node scripts/check-legacy-paths.js   (CI job "check")
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const errors = [];
const exists = (p) => fs.existsSync(path.join(ROOT, p));

const LEGACY_PAGES = [
  'admin-schools.html', 'admin-users.html', 'arena.html', 'battle-quiz.html',
  'computer-simulator.html', 'coordinator-dashboard.html', 'cyber-detective.html',
  'diem-danh.html', 'goi-ten.html', 'gom-ket-qua.html', 'hotspot-editor.html',
  'ic3-dashboard.html', 'image-manager.html', 'index.html', 'live-quiz.html',
  'login.html', 'mario-flappy.html', 'memory-game.html', 'portfolio.html',
  'pz-defense.html', 'quiz-shelf.html', 'roster-manager.html', 'so-dau-bai.html',
  'tai-lieu-nam-hoc.html', 'teacher-dashboard.html', 'teaching-schedule.html',
  'thi-dua.html', 'mos/index.html',
];
const CORE_FILES = [
  'sw.js', 'manifest.webmanifest', 'firestore.rules', 'firestore.indexes.json',
  'js/firebase-config.js', 'js/backend-config.js', 'js/core/rbac.js', 'js/core/grading.js',
];

for (const p of [...LEGACY_PAGES, ...CORE_FILES]) {
  if (!exists(p)) errors.push(`Thiếu ${p} — đường dẫn cũ phải giữ nguyên (đổi thành trang chuyển hướng nếu cần bỏ)`);
}

try {
  const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.webmanifest'), 'utf8'));
  if (m.start_url !== './index.html') errors.push(`manifest.webmanifest: start_url đổi thành "${m.start_url}" (phải là "./index.html")`);
  if (m.scope !== './') errors.push(`manifest.webmanifest: scope đổi thành "${m.scope}" (phải là "./")`);
} catch (e) {
  errors.push(`manifest.webmanifest không đọc được: ${e.message}`);
}

// Bản build React đã commit
if (exists('web/package.json')) {
  const html = path.join(ROOT, 'app', 'index.html');
  if (!fs.existsSync(html)) {
    errors.push('Thiếu app/index.html — chạy `npm run build` trong web/ rồi commit thư mục app/');
  } else {
    const src = fs.readFileSync(html, 'utf8');
    const refs = [...src.matchAll(/(?:src|href)="(\.\/assets\/[^"]+)"/g)].map((m) => m[1]);
    if (!refs.some((r) => r.endsWith('.js'))) errors.push('app/index.html không nạp file JS nào trong ./assets');
    for (const r of refs) {
      if (!fs.existsSync(path.join(ROOT, 'app', r))) errors.push(`app/index.html trỏ tới ${r} nhưng file không có — build lại web/ rồi commit`);
    }
    if (/manifest/i.test(src.replace(/<!--[\s\S]*?-->/g, ''))) {
      errors.push('app/index.html có link manifest — PWA chỉ dùng manifest.webmanifest ở gốc');
    }
  }
}

if (errors.length) {
  console.error('✗ Đường dẫn cũ / bản build 2.0:\n  - ' + errors.join('\n  - '));
  process.exit(1);
}
console.log(`✓ ${LEGACY_PAGES.length} trang cũ + ${CORE_FILES.length} file cốt lõi còn nguyên; manifest không đổi; app/ đầy đủ`);
