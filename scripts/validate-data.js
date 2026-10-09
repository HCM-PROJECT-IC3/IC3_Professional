#!/usr/bin/env node
/* ============================================================
   scripts/validate-data.js — kiểm tra ngân hàng câu hỏi data/ic3
   trước khi deploy (chạy tay hoặc trong CI .github/workflows/ci.yml):

     node scripts/validate-data.js

   LỖI (exit 1 — chặn deploy):
     • file JSON hỏng / thiếu file mà meta.json hoặc manifest trỏ tới
     • câu thiếu "question"/"type", dạng câu lạ
     • trắc nghiệm: đáp án đúng KHÔNG nằm trong danh sách lựa chọn,
       hoặc chưa có đáp án đúng
     • uid trùng trong CÙNG 1 minitest
     • ảnh image_file / imageUrl (img/...) không tồn tại
   CẢNH BÁO (không chặn): số câu trong meta.json lệch file thật, câu
   chưa có giải thích, lựa chọn bị trùng chữ.
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DATA = path.join(ROOT, 'data', 'ic3');
const TYPES = new Set(['single', 'multi', 'truefalse', 'matching', 'classify', 'hotspot', 'ordering', 'dragfill', 'selectfill', 'list']);
const errors = [];
const warnings = [];
const err = (where, msg) => errors.push(`${where}: ${msg}`);
const warn = (where, msg) => warnings.push(`${where}: ${msg}`);

function readJson(rel) {
  const p = path.join(DATA, rel);
  if (!fs.existsSync(p)) { err(rel, 'không tồn tại'); return null; }
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { err(rel, 'JSON hỏng — ' + e.message); return null; }
}
function imgExists(src) {
  if (!src || /^(https?:|data:)/.test(src)) return true;
  const rel = src.startsWith('img/') ? src : 'img/' + src;
  return fs.existsSync(path.join(ROOT, rel));
}

let checkedImages = 0;
function checkQuestion(q, where) {
  if (!q || typeof q !== 'object') return err(where, 'không phải object');
  if (!q.question || !String(q.question).trim()) err(where, 'thiếu nội dung câu hỏi');
  if (!TYPES.has(q.type)) return err(where, `dạng câu lạ "${q.type}"`);
  for (const src of [q.image_file, q.imageUrl]) {
    if (src) { checkedImages++; if (!imgExists(src)) err(where, `thiếu ảnh ${src}`); }
  }
  if (q.type === 'single' || q.type === 'multi') {
    const opts = (q.options || []).map(String);
    const corr = (q.correct || []).map(String);
    if (opts.length < 2) err(where, 'ít hơn 2 lựa chọn');
    if (!corr.length) err(where, 'chưa có đáp án đúng');
    corr.forEach((c) => { if (!opts.includes(c)) err(where, `đáp án đúng "${c.slice(0, 40)}" không có trong lựa chọn`); });
    if (new Set(opts).size !== opts.length) warn(where, 'lựa chọn bị trùng chữ');
  } else if (q.type === 'truefalse') {
    if (!(q.statements || []).length) err(where, 'không có phát biểu');
    (q.statements || []).forEach((s, i) => { if (s.answer !== 'true' && s.answer !== 'false') err(where, `phát biểu ${i + 1} thiếu answer true/false`); });
  } else if (q.type === 'matching') {
    if ((q.pairs || []).length < 2) err(where, 'ít hơn 2 cặp nối');
  } else if (q.type === 'ordering') {
    if ((q.items || []).length < 2) err(where, 'ít hơn 2 mục sắp xếp');
  } else if (q.type === 'hotspot') {
    if (!(q.areas || []).some((a) => a.correct)) err(where, 'không có vùng đúng');
  } else if (q.type === 'dragfill' || q.type === 'selectfill') {
    if (!(q.blanks || []).length) err(where, 'không có chỗ trống');
  }
  if (!q.explanation) warnings.noExpl = (warnings.noExpl || 0) + 1;
}

// ── 1. meta.json + file khối ──
const meta = readJson('meta.json');
let levelFiles = 0, questions = 0;
(meta && meta.categories || []).forEach((cat) => (cat.levels || []).forEach((lv) => {
  if (!lv.file) return;
  const data = readJson(lv.file);
  if (!data) return;
  levelFiles++;
  Object.entries(data.minitests || {}).forEach(([name, list]) => {
    if (!Array.isArray(list)) return err(`${lv.file} › ${name}`, 'không phải mảng câu hỏi');
    const metaCount = lv.minitests && lv.minitests[name] && lv.minitests[name].count;
    if (metaCount !== undefined && metaCount !== list.length) warn(`meta.json › ${cat.id} ${lv.id} › ${name}`, `ghi ${metaCount} câu, file thật có ${list.length}`);
    const uids = new Set();
    list.forEach((q, i) => {
      questions++;
      checkQuestion(q, `${lv.file} › ${name} › câu ${i + 1}`);
      if (q.uid) { if (uids.has(q.uid)) err(`${lv.file} › ${name}`, `uid trùng ${q.uid}`); uids.add(q.uid); }
    });
  });
}));

// ── 2. manifest + file minitest nhỏ (nguồn trang làm bài ưu tiên dùng) ──
const manifest = readJson('minitests-manifest.json');
let mtFiles = 0;
Object.entries(manifest || {}).forEach(([lvKey, map]) => Object.entries(map).forEach(([name, rel]) => {
  const list = readJson(rel);
  if (!list) return;
  mtFiles++;
  if (!Array.isArray(list)) return err(rel, 'không phải mảng câu hỏi');
  const uids = new Set();
  list.forEach((q, i) => {
    checkQuestion(q, `${rel} › câu ${i + 1}`);
    if (q.uid) { if (uids.has(q.uid)) err(rel, `uid trùng ${q.uid}`); uids.add(q.uid); }
  });
}));

// ── Báo cáo ──
const noExpl = warnings.noExpl || 0;
console.log(`Đã kiểm tra: ${levelFiles} file khối (${questions} câu), ${mtFiles} file minitest, ${checkedImages} lượt tham chiếu ảnh.`);
if (warnings.length) {
  console.log(`\n⚠ ${warnings.length} cảnh báo (không chặn deploy):`);
  warnings.slice(0, 20).forEach((w) => console.log('  - ' + w));
  if (warnings.length > 20) console.log(`  … và ${warnings.length - 20} cảnh báo khác`);
}
if (noExpl) console.log(`ℹ ${noExpl} lượt câu chưa có giải thích (nên bổ sung để học sinh hiểu vì sao sai).`);
if (errors.length) {
  console.log(`\n✖ ${errors.length} LỖI:`);
  errors.slice(0, 50).forEach((e) => console.log('  - ' + e));
  if (errors.length > 50) console.log(`  … và ${errors.length - 50} lỗi khác`);
  process.exit(1);
}
console.log('\n✔ Ngân hàng câu hỏi hợp lệ.');
