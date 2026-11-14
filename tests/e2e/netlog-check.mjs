#!/usr/bin/env node
// Đọc nhật ký mạng của Chrome (E2E_NETLOG) → liệt kê MỌI host đã kết nối; báo lỗi nếu có host Firebase tính lượt
// (Firestore, Auth REST, token, installations, Realtime DB). gstatic (file SDK) và fonts không tính.
import fs from 'node:fs';

import path from 'node:path';
// Nhận file .json hoặc thư mục (đọc mọi .json trong đó — E2E_NETLOG ghi 1 file/bộ).
const args = process.argv.slice(2);
if (!args.length) { console.error('Dùng: node netlog-check.mjs <thư mục hoặc file .json>…'); process.exit(2); }
const files = args.flatMap((a) => (fs.statSync(a).isDirectory() ? fs.readdirSync(a).filter((f) => f.endsWith('.json')).map((f) => path.join(a, f)) : [a]));
const raw = files.map((f) => fs.readFileSync(f, 'utf8')).join(String.fromCharCode(10));
console.log(`Đọc ${files.length} file nhật ký mạng.`);
const hosts = new Map();
for (const m of raw.matchAll(/"(?:url|host|original_url)":"(?:https?|wss?):\/\/([^/:"]+)/g)) hosts.set(m[1], (hosts.get(m[1]) || 0) + 1);
for (const m of raw.matchAll(/"host":"([a-z0-9.-]+\.[a-z]{2,})(?::\d+)?"/g)) hosts.set(m[1], (hosts.get(m[1]) || 0) + 1);
const FIREBASE = /^(firestore|identitytoolkit|securetoken|firebaseinstallations|firebase|firebasestorage)\.googleapis\.com$|\.firebaseio\.com$|\.firebaseapp\.com$/;
const list = [...hosts.entries()].sort((a, b) => b[1] - a[1]);
console.log('Host đã kết nối (số lần xuất hiện trong nhật ký):');
for (const [h, n] of list) console.log(`  ${FIREBASE.test(h) ? '✗' : ' '} ${h}  ${n}`);
const bad = list.filter(([h]) => FIREBASE.test(h));
console.log(bad.length ? `\n✗ Có kết nối tới Firebase: ${bad.map(([h]) => h).join(', ')}` : '\n✓ Không có kết nối nào tới Firestore / Firebase Auth');
process.exit(bad.length ? 1 : 0);
