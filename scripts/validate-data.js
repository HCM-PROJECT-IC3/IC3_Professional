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
     • bộ Ôn tập/Kiểm tra/Luyện thi có câu ngoài All Key, câu "Bài N" hoặc lệch bộ chủ đề
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
// uid câu chủ đề → câu All Key trùng (scripts/build-allkey-map.py) — chỉ những câu này được vào bộ Ôn tập/Kiểm tra
const ALLKEY = (() => { try { return JSON.parse(fs.readFileSync(path.join(DATA, 'allkey-map.json'), 'utf8')).map; } catch (e) { return null; } })();

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
  // Ảnh trong từng ô/thẻ (câu phân loại: zones/items/distractors)
  const embedded = ['zones', 'items', 'distractors'].flatMap((k) => (Array.isArray(q[k]) ? q[k] : [])).map((x) => x && typeof x === 'object' && x.image_file).filter(Boolean);
  embedded.forEach((f) => { checkedImages++; if (!imgExists(f)) err(where, `thiếu ảnh ${f}`); });
  // image:true mà không có ảnh chung → trang làm bài tự vẽ hình minh hoạ chèn lên câu (không liên quan)
  if (q.image === true && !q.imageUrl && !q.image_file && embedded.length) err(where, 'image:true nhưng ảnh nằm trong từng ô — đặt image:false');
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
    // Nhãn đảo (label_true = "Không"/"Sai") làm chỗ nào hiện cứng Đúng/Sai bị ngược đáp án → đổi nhãn + lật answer
    if (/^(không|sai)$/i.test(String(q.label_true || '').trim())) err(where, `nhãn đảo label_true="${q.label_true}" — đổi thành "${q.label_false}" và lật answer từng phát biểu`);
  } else if (q.type === 'matching') {
    if ((q.pairs || []).length < 2) err(where, 'ít hơn 2 cặp nối');
  } else if (q.type === 'ordering') {
    if ((q.items || []).length < 2) err(where, 'ít hơn 2 mục sắp xếp');
  } else if (q.type === 'hotspot') {
    if (!(q.areas || []).some((a) => a.correct)) err(where, 'không có vùng đúng');
    (q.areas || []).forEach((a) => {
      if (a.x < -0.5 || a.y < -0.5 || a.x + a.w > 100.5 || a.y + a.h > 100.5) err(where, `vùng ${a.id} tràn ra ngoài ảnh`);
    });
    // Vùng đúng chồng > 30% lên vùng nhiễu → bấm vào chỗ chồng khó đoán (sửa bằng hotspot-editor.html)
    const A = q.areas || [];
    A.filter((a) => a.correct).forEach((c) => A.filter((x) => !x.correct).forEach((x) => {
      const ix = Math.max(0, Math.min(c.x + c.w, x.x + x.w) - Math.max(c.x, x.x)), iy = Math.max(0, Math.min(c.y + c.h, x.y + x.h) - Math.max(c.y, x.y));
      const small = Math.min(c.w * c.h, x.w * x.h);
      if (small && (ix * iy) / small > 0.3) warn(where, `vùng đúng ${c.id} chồng lên vùng nhiễu ${x.id}`);
    }));
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

  // Bộ "Theo chủ đề" (minitest "N. Tên chủ đề") phải sạch: 1 câu chỉ thuộc 1 chủ đề và không
  // có 2 câu cùng nội dung (kể cả khác dạng câu / đảo thứ tự đáp án) — xem data/ic3/topic-reassign.json.
  const topicOf = new Map(), seen = new Map();
  const words = (s) => String(s || '').replace(/<[^>]+>/g, ' ').toLowerCase().normalize('NFC').split(/[^\p{L}\p{N}]+/u).filter(Boolean).sort().join(' ');
  const answerOf = (q) => [(q.options || []).join(' '), (q.statements || []).map((s) => s.text).join(' '), (q.pairs || []).map((p) => p.left + ' ' + p.right).join(' '),
    (q.items || []).map((x) => (typeof x === 'string' ? x : x.text || '')).join(' ')].join(' ');
  Object.entries(data.minitests || {}).filter(([n]) => /^\d\.\s/.test(n)).forEach(([name, list]) => (list || []).forEach((q) => {
    if (q.uid) {
      if (topicOf.has(q.uid) && topicOf.get(q.uid) !== name) err(`${lv.file}`, `câu ${q.uid} nằm ở 2 chủ đề: "${topicOf.get(q.uid)}" và "${name}"`);
      topicOf.set(q.uid, name);
    }
    const k = words(q.question) + '#' + words(answerOf(q));
    if (k.length > 20 && seen.has(k) && seen.get(k) !== q.uid) err(`${lv.file} › bộ Theo chủ đề`, `câu trùng nội dung: ${seen.get(k)} = ${q.uid}`);
    seen.set(k, q.uid);
  }));

  // Bộ Ôn tập / Kiểm tra / Luyện thi theo tiết PPCT (scripts/generate-review-minitests.js): chỉ câu All Key
  // lấy từ bộ chủ đề (không lẫn câu "Bài N" — câu củng cố bài học chỉ để dạy), nội dung y hệt bộ chủ đề.
  // Không còn bộ "Tiết N" cũ. Lỗi → build-allkey-map.py / generate-review-minitests.js rồi split-minitests.py.
  const review = Object.entries(data.minitests || {}).filter(([n]) => /^(Ôn tập|Kiểm tra|Luyện thi)\s/.test(n));
  Object.keys(data.minitests || {}).filter((n) => /^Tiết \d+$/.test(n)).forEach((n) => err(`${lv.file} › ${n}`, 'bộ "Tiết N" cũ (máy tự chia, lẫn câu ngoài All Key) — chạy node scripts/generate-review-minitests.js'));
  if (topicOf.size && review.length) {
    const byUid = new Map();
    Object.entries(data.minitests).filter(([n]) => /^\d\.\s/.test(n)).forEach(([, list]) => list.forEach((q) => byUid.set(q.uid, JSON.stringify(q))));
    const baiUids = new Set();
    Object.entries(data.minitests).filter(([n]) => /^Bài \d+[.:]/.test(n)).forEach(([, list]) => list.forEach((q) => baiUids.add(q.uid)));
    review.forEach(([name, list]) => list.forEach((q) => {
      if (baiUids.has(q.uid)) err(`${lv.file} › ${name}`, `câu ${q.uid} là câu củng cố "Bài N" — không được trộn vào Ôn tập/Kiểm tra`);
      else if (!byUid.has(q.uid)) err(`${lv.file} › ${name}`, `câu ${q.uid} không còn trong bộ Theo chủ đề`);
      else if (byUid.get(q.uid) !== JSON.stringify(q)) err(`${lv.file} › ${name}`, `câu ${q.uid} lệch nội dung với bộ Theo chủ đề`);
      if (ALLKEY && !ALLKEY[q.uid]) err(`${lv.file} › ${name}`, `câu ${q.uid} không có trong đáp án gốc All Key (data/ic3/allkey-map.json)`);
    }));
    // Ôn tập cuối khóa Tiết 1–4: mỗi câu All Key của ngân hàng chủ đề xuất hiện đúng 1 lần
    const cover = new Map();
    review.filter(([n]) => /^Ôn tập cuối khóa — Tiết [1-4]:/.test(n)).forEach(([, list]) => list.forEach((q) => cover.set(q.uid, (cover.get(q.uid) || 0) + 1)));
    if (ALLKEY && cover.size) {
      topicOf.forEach((_, u) => { if (ALLKEY[u] && cover.get(u) !== 1) err(`${lv.file} › Ôn tập cuối khóa Tiết 1–4`, `câu All Key ${u} xuất hiện ${cover.get(u) || 0} lần (phải đúng 1)`); });
    }
  }
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
