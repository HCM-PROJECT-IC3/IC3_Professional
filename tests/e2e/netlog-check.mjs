#!/usr/bin/env node
// Đọc nhật ký mạng của Chrome (E2E_NETLOG) → liệt kê MỌI host đã kết nối; báo lỗi nếu có host Firebase tính lượt
// (Firestore, Auth REST, token, installations, Realtime DB). gstatic (file SDK) và fonts không tính.
import fs from 'node:fs';

const file = process.argv[2];
if (!file) { console.error('Dùng: node netlog-check.mjs <netlog.json>'); process.exit(2); }
const raw = fs.readFileSync(file, 'utf8');
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
