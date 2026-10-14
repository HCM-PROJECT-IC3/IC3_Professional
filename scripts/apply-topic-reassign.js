#!/usr/bin/env node
/* ============================================================
   scripts/apply-topic-reassign.js
   Áp dụng data/ic3/topic-reassign.json lên bộ "Theo chủ đề" (7 minitest
   "N. Tên chủ đề" của mỗi cấp) trong data/ic3/<cat>__<level>.json:
     { "IC3__LV1": { "<uid>": { "to": 3, "reason": "..." },          // chuyển sang chủ đề 3
                     "<uid>": { "remove": true, "keep": "<uid>", ... } } } // bỏ vì trùng câu "keep"
   Chỉ đụng tới 7 minitest chủ đề — bộ "Bài N" và "Tiết N" giữ nguyên.
   Chạy lại nhiều lần vẫn an toàn (câu đã ở đúng chỗ / đã bỏ thì bỏ qua).
   Sau đó: python scripts/split-minitests.py  (đồng bộ data/ic3/minitests/ + manifest)

   Cách dùng:
     node scripts/apply-topic-reassign.js          # áp dụng + cập nhật meta.json
     node scripts/apply-topic-reassign.js --check  # chỉ kiểm tra (CI): báo lỗi nếu còn câu chưa áp dụng
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');

const DATA = path.join(__dirname, '..', 'data', 'ic3');
const CHECK = process.argv.includes('--check');
const read = (f) => JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8'));
// Giữ đúng định dạng gốc: 1 dòng, không xuống dòng cuối (diff chỉ chứa thay đổi thật).
const write = (f, o) => fs.writeFileSync(path.join(DATA, f), JSON.stringify(o), 'utf8');

const plan = read('topic-reassign.json');
const meta = read('meta.json');
const TOPIC_RE = /^(\d)\.\s/;
let pending = 0, moved = 0, removed = 0, missing = 0;

for (const cat of meta.categories) for (const lv of cat.levels) {
  const key = `${cat.id}__${lv.id}`;
  const entries = plan[key];
  if (!entries) continue;
  const data = read(lv.file);
  const topicName = {};
  Object.keys(data.minitests).forEach((n) => { const m = n.match(TOPIC_RE); if (m) topicName[+m[1]] = n; });
  const find = (uid) => {
    for (const [n, list] of Object.entries(data.minitests)) {
      if (!TOPIC_RE.test(n)) continue;
      const i = list.findIndex((q) => q.uid === uid);
      if (i >= 0) return { n, i };
    }
    return null;
  };
  let changed = false;
  for (const [uid, e] of Object.entries(entries)) {
    const at = find(uid);
    if (e.remove) {
      if (!at) continue; // đã bỏ
      if (!find(e.keep)) { console.error(`✗ ${key} ${uid}: câu giữ lại "${e.keep}" không có trong bộ chủ đề — không bỏ`); missing++; continue; }
      pending++;
      if (!CHECK) { data.minitests[at.n].splice(at.i, 1); removed++; changed = true; }
      continue;
    }
    const target = topicName[e.to];
    if (!target) { console.error(`✗ ${key} ${uid}: không có chủ đề số ${e.to}`); missing++; continue; }
    if (!at) { console.error(`✗ ${key} ${uid}: không tìm thấy trong bộ chủ đề`); missing++; continue; }
    if (at.n === target) continue; // đã đúng chỗ
    pending++;
    if (!CHECK) {
      const [q] = data.minitests[at.n].splice(at.i, 1);
      data.minitests[target].push(q);
      moved++; changed = true;
    }
  }
  if (changed) {
    write(lv.file, data);
    // meta.json: số câu + phân bố dạng câu của 7 chủ đề (lobby hiển thị "(N câu)")
    Object.values(topicName).forEach((n) => {
      const types = {};
      data.minitests[n].forEach((q) => { types[q.type] = (types[q.type] || 0) + 1; });
      lv.minitests[n] = { count: data.minitests[n].length, types };
    });
  }
}

if (CHECK) {
  if (pending || missing) { console.error(`✗ topic-reassign: ${pending} thay đổi chưa áp dụng, ${missing} mục lỗi — chạy node scripts/apply-topic-reassign.js`); process.exit(1); }
  console.log('✔ Bộ "Theo chủ đề" khớp data/ic3/topic-reassign.json.');
} else {
  write('meta.json', meta);
  console.log(`Đã chuyển ${moved} câu, bỏ ${removed} câu trùng${missing ? `, ${missing} mục lỗi` : ''}. Tiếp theo: python scripts/split-minitests.py`);
  if (missing) process.exit(1);
}
