#!/usr/bin/env node
/* scripts/check-architecture.js — giữ QUY TẮC PHỤ THUỘC của Clean Architecture (docs/architecture/CLEAN-ARCHITECTURE.md).
     node scripts/check-architecture.js            → kiểm tra (CI dùng), vi phạm thì exit 1
     node scripts/check-architecture.js --report   → in số lượt gọi Firestore trực tiếp của từng file giao diện

   Luật:
     R1 Domain thuần — js/core/, js/models/, mọi *-core.js và use case thuần (PURE_EXTRA) KHÔNG đụng DOM, mạng,
        bộ nhớ trình duyệt, Firebase, Apps Script, repository. (Bỏ qua chú thích; `window` chỉ dùng để gắn namespace.)
     R2 Repository không đụng giao diện — js/repositories/ không dùng document / innerHTML / alert / confirm.
     R3 Giao diện không gọi thẳng Firestore — ngoài các adapter hạ tầng (FIRESTORE_ADAPTERS), file nào gọi
        db.collection / db.batch / FieldValue... phải đi qua js/repositories/. Nợ cũ ghi ở BASELINE theo kiểu
        "bánh cóc": được GIẢM (khi đó hạ số trong BASELINE), không được TĂNG, không thêm file mới. */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const rel = (f) => path.relative(ROOT, f).split(path.sep).join('/');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) return d.name === '__tests__' || d.name === 'vendor' ? [] : walk(p);
    return d.name.endsWith('.js') ? [p] : [];
  });
}
/** Bỏ chú thích (giữ nguyên số dòng) để chữ trong chú thích không bị tính là vi phạm. */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
}

// ── Phân tầng ──
const PURE_EXTRA = ['js/services/ai-assistant.js'];                  // use case thuần (Application) — luật như Domain
const isDomain = (f) => /^js\/(core|models)\/[^/]+\.js$/.test(f) || /-core\.js$/.test(f) || PURE_EXTRA.includes(f);
const isRepository = (f) => f.startsWith('js/repositories/');
const FIRESTORE_ADAPTERS = [                                          // bộ nối hạ tầng được phép gọi Firestore
  'js/firebase-config.js', 'js/services/firebase-loader.js', 'js/auth.js', 'js/firestore-results.js',
  'js/services/teacher-sync.js', 'js/services/roster-cache-service.js', 'js/arena/arena-relay.js',
];
// Nợ kỹ thuật (03/11/2026): số lượt gọi Firestore trực tiếp còn lại trong file giao diện — chỉ được giảm.
const BASELINE = {
  'js/portfolio.js': 22,
  'js/roster-manager.js': 13,
  'js/admin-users.js': 7,
  'js/dashboard.js': 3,
  'js/teaching-timetable-import.js': 3,
  'js/teaching-timetable.js': 2,
  'js/admin-users-import.js': 1,
  'js/teaching-schedule.js': 1, // chỉ còn nhánh dự phòng đọc gvlab_profiles khi trang thiếu EduProfileCache
};

// alert/confirm/prompt của trình duyệt (gọi trần hoặc window.x) — không bắt phương thức trùng tên như obj.prompt(n)
const DIALOG_RE = /(?:^|[^.\w$]|\bwindow\.)(alert|confirm|prompt)\s*\(/m;
const DOMAIN_BANNED = [
  [/\bdocument\./, 'DOM (document.)'], [/\.innerHTML\b/, 'DOM (innerHTML)'], [/\baddEventListener\s*\(/, 'sự kiện DOM'],
  [/\b(localStorage|sessionStorage|indexedDB)\b/, 'bộ nhớ trình duyệt'], [/\bfetch\s*\(|\bXMLHttpRequest\b/, 'gọi mạng'],
  [/\bfirebase\.|\bEduFirebase\b/, 'Firebase'], [/\bEduAppsScript\b/, 'Apps Script'], [/\bEdu(Repositories|BaseRepository)\b/, 'repository'],
  [/\bnavigator\./, 'navigator'], [DIALOG_RE, 'hộp thoại trình duyệt'],
];
const REPO_BANNED = [[/\bdocument\./, 'DOM (document.)'], [/\.innerHTML\b/, 'DOM (innerHTML)'], [DIALOG_RE, 'hộp thoại trình duyệt']];
const FIRESTORE_RE = /\bdb\.(collection|collectionGroup|batch|doc|runTransaction)\s*\(|\bfirebase\.firestore\s*\(|\bfirebase\.firestore\.FieldValue\b|\.(collection|collectionGroup)\(\s*['"`]/g;

const files = walk(path.join(ROOT, 'js')).map((f) => ({ f: rel(f), src: stripComments(fs.readFileSync(f, 'utf8')) }));
const errors = [];
const lineOf = (src, idx) => src.slice(0, idx).split('\n').length;

files.forEach(({ f, src }) => {
  const banned = isDomain(f) ? DOMAIN_BANNED : isRepository(f) ? REPO_BANNED : null;
  if (banned) {
    banned.forEach(([re, what]) => {
      const m = re.exec(src);
      if (m) errors.push(`R${isDomain(f) ? 1 : 2} ${f}:${lineOf(src, m.index)} — tầng ${isDomain(f) ? 'Domain' : 'Repository'} không được dùng ${what}: "${m[0].trim()}"`);
    });
  }
});

const counts = {};
files.forEach(({ f, src }) => {
  if (isDomain(f) || isRepository(f) || FIRESTORE_ADAPTERS.includes(f)) return;
  const n = (src.match(FIRESTORE_RE) || []).length;
  if (n) counts[f] = n;
});
const improved = [];
Object.keys(counts).forEach((f) => {
  const base = BASELINE[f] || 0;
  if (counts[f] > base) {
    errors.push(`R3 ${f} — gọi Firestore trực tiếp ${counts[f]} lượt (cho phép ${base}). Đi qua js/repositories/ (vd. EduBaseRepository.commitBatch, EduModels.SERVER_TIME).`);
  }
});
Object.keys(BASELINE).forEach((f) => { if ((counts[f] || 0) < BASELINE[f]) improved.push(`${f}: ${BASELINE[f]} → ${counts[f] || 0}`); });

if (process.argv.includes('--report')) {
  console.log('Lượt gọi Firestore trực tiếp ngoài repository/adapter:');
  Object.entries(counts).sort((a, b) => b[1] - a[1]).forEach(([f, n]) => console.log(`  ${String(n).padStart(3)}  ${f}`));
}
if (errors.length) {
  console.error('✖ Vi phạm kiến trúc:\n  ' + errors.join('\n  '));
  process.exit(1);
}
const domainCount = files.filter(({ f }) => isDomain(f)).length;
console.log(`✔ Kiến trúc: ${domainCount} file Domain thuần, repository không đụng giao diện, giao diện không thêm lượt gọi Firestore trực tiếp.`);
if (improved.length) console.log('  Nợ đã giảm — hạ BASELINE trong scripts/check-architecture.js: ' + improved.join(' · '));
