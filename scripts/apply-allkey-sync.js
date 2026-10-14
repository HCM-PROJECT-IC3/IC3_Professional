#!/usr/bin/env node
/* ============================================================
   scripts/apply-allkey-sync.js
   Áp dụng data/ic3/allkey-sync.json — đồng bộ ngân hàng câu hỏi với file đáp án
   gốc "All Key" (iSpring .quiz IC3/Spark LV1–3, NH2025-2026):
     adds    : câu có trong khoá nhưng chưa có trong data → thêm vào minitest chủ đề
               "N. ..." (theo PPCT), uid cố định nên chạy lại không thêm trùng;
     updates : câu đã có nhưng lệch đáp án/phiên bản → ghi đè các field trong "set"
               cho MỌI bản của uid đó (bộ chủ đề, Bài, Tiết). uid giữ nguyên.
   Chạy lại nhiều lần vẫn an toàn. Sau đó: python scripts/split-minitests.py

     node scripts/apply-allkey-sync.js          # áp dụng + cập nhật meta.json
     node scripts/apply-allkey-sync.js --check  # CI: báo lỗi nếu còn thay đổi chưa áp dụng
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');

const DATA = path.join(__dirname, '..', 'data', 'ic3');
const CHECK = process.argv.includes('--check');
const read = (f) => JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8'));
// Giữ đúng định dạng gốc: 1 dòng, không xuống dòng cuối.
const write = (f, o) => fs.writeFileSync(path.join(DATA, f), JSON.stringify(o), 'utf8');
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const plan = read('allkey-sync.json');
const meta = read('meta.json');
const levels = new Map(meta.categories.flatMap((c) => c.levels.map((l) => [`${c.id}__${l.id}`, l])));
const TOPIC_RE = /^(\d)\.\s/;
let pending = 0, errors = 0;
const touched = new Map(); // level key → data

function load(key) {
  if (!touched.has(key)) {
    const lv = levels.get(key);
    if (!lv) throw new Error('Không có cấp ' + key + ' trong meta.json');
    touched.set(key, { lv, data: read(lv.file), changed: false });
  }
  return touched.get(key);
}

// ── updates: ghi đè field cho mọi bản của uid ──
for (const u of plan.updates || []) {
  const t = load(u.level);
  let found = 0;
  Object.values(t.data.minitests).forEach((list) => list.forEach((q) => {
    if (q.uid !== u.uid) return;
    found++;
    const set = Object.assign({}, u.set);
    if (u.correctAllExcept) set.correct = (q.options || []).filter((o) => o !== u.correctAllExcept);
    for (const [f, v] of Object.entries(set)) {
      if (v === null || same(q[f], v)) continue;
      pending++;
      if (!CHECK) { q[f] = v; t.changed = true; }
    }
    if (set.type && set.type !== 'truefalse') { // đổi dạng câu → bỏ field của dạng cũ
      ['statements', 'label_true', 'label_false'].forEach((f) => { if (f in q && !(f in set)) { pending++; if (!CHECK) { delete q[f]; t.changed = true; } } });
    }
  }));
  if (!found) { console.error(`✗ ${u.level} ${u.uid}: không tìm thấy`); errors++; }
}

// ── adds: thêm câu mới vào minitest chủ đề ──
for (const a of plan.adds || []) {
  const t = load(a.level);
  const exists = Object.values(t.data.minitests).some((list) => list.some((q) => q.uid === a.question.uid));
  if (exists) continue;
  const topicName = Object.keys(t.data.minitests).find((n) => (n.match(TOPIC_RE) || [])[1] === String(a.topic));
  if (!topicName) { console.error(`✗ ${a.level}: không có chủ đề số ${a.topic}`); errors++; continue; }
  pending++;
  if (!CHECK) {
    const maxId = Math.max(0, ...Object.values(t.data.minitests).flat().map((q) => (typeof q.id === 'number' ? q.id : 0)));
    t.data.minitests[topicName].push(Object.assign({}, a.question, { id: maxId + 1 }));
    t.changed = true;
  }
}

if (CHECK) {
  if (pending || errors) { console.error(`✗ allkey-sync: ${pending} thay đổi chưa áp dụng, ${errors} lỗi — chạy node scripts/apply-allkey-sync.js`); process.exit(1); }
  console.log('✔ Ngân hàng câu hỏi khớp data/ic3/allkey-sync.json (đồng bộ All Key).');
} else {
  for (const t of touched.values()) {
    if (!t.changed) continue;
    write(t.lv.file, t.data);
    Object.entries(t.data.minitests).forEach(([n, list]) => {
      if (!t.lv.minitests[n]) return;
      const types = {};
      list.forEach((q) => { types[q.type] = (types[q.type] || 0) + 1; });
      t.lv.minitests[n] = { count: list.length, types };
    });
  }
  write('meta.json', meta);
  console.log(`Đã áp dụng ${pending} thay đổi${errors ? `, ${errors} lỗi` : ''}. Tiếp theo: python scripts/split-minitests.py`);
  if (errors) process.exit(1);
}
