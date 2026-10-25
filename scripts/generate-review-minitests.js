#!/usr/bin/env node
/**
 * scripts/generate-review-minitests.js
 * ────────────────────────────────────────────────────────────────────────
 * Sinh các bộ ÔN TẬP / KIỂM TRA / LUYỆN THI của 6 cấp Spark/IC3 theo đúng
 * tiết ôn trong PPCT từng khối (data/ic3/ppct-review.json), CHỈ bằng câu
 * hỏi của đáp án gốc All Key (data/ic3/allkey-map.json — sinh bằng
 * scripts/build-allkey-map.py). Thay cho 8 bộ "Tiết 1–8" cũ (máy tự chia
 * ngẫu nhiên, lẫn cả câu ngoài All Key).
 *
 * 3 nhóm bộ câu hỏi của mỗi cấp tách bạch, không trộn:
 *   • "Bài N. …"      — câu Củng cố theo bài học (dạy trên lớp) — KHÔNG đụng tới
 *   • "N. Tên chủ đề" — ngân hàng chủ đề (nguồn để lấy câu)       — KHÔNG đụng tới
 *   • Ôn tập / Kiểm tra / Luyện thi — sinh lại ở đây:
 *       - Ôn tập  (kind "on"): MỌI câu All Key thuộc các chủ đề của tiết ôn đó
 *         (thêm lọc theo đề All Key khi PPCT ghi "Test 1"/"Test 2").
 *       - Kiểm tra (kind "kt"): số câu = số câu đề thi thật của khối
 *         (RANDOM_MIX_COUNTS, giống js/quiz-engine.js), rút đều các chủ đề đã học tới
 *         tiết đó, có seed nên chạy lại ra y hệt.
 *       - Luyện thi (kind "lt"): nguyên 1 đề All Key, giữ đúng thứ tự câu của đề.
 *
 * Thêm 8 bộ "Ôn tập cuối khóa — Tiết 1…8" (cũng chỉ câu All Key): Tiết 1–4 phủ đủ mọi câu All Key
 * mỗi câu 1 lần (chia đều theo chủ đề), Tiết 5–8 là 4 đề tổng hợp đúng số câu đề thi thật.
 *
 * Tên bộ: "Ôn tập 1 (Tiết 11): Căn bản về công nghệ — Test 1", "Kiểm tra HK1 (Tiết 24)",
 * "Luyện thi — Bài ôn số 1 (Tiết 36–45)". Thứ tự trong file: Chủ đề → Ôn tập/Kiểm tra
 * theo tiết → Bài N.
 *
 * Cách chạy (sau mỗi lần sửa chủ đề / đồng bộ All Key):
 *   python scripts/build-allkey-map.py "<thư mục All Key>"   (khi ngân hàng chủ đề đổi)
 *   node scripts/generate-review-minitests.js
 *   python scripts/split-minitests.py
 * ────────────────────────────────────────────────────────────────────────
 */
'use strict';
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data', 'ic3');
const META_FILE = path.join(DATA_DIR, 'meta.json');
const PLAN = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'ppct-review.json'), 'utf8'));
const AK = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'allkey-map.json'), 'utf8')).map;

// Khớp CHÍNH XÁC bảng RANDOM_MIX_COUNTS trong js/quiz-engine.js — số câu đề thi thật từng khối.
const RANDOM_MIX_COUNTS = { Spark__LV1: 31, Spark__LV2: 36, Spark__LV3: 42, IC3__LV1: 45, IC3__LV2: 45, IC3__LV3: 40 };
const TOPIC_RE = /^(\d+)\.\s/;
/** Mọi bộ do script này (hoặc script "Tiết 1–8" cũ) sinh ra — xoá đi rồi dựng lại. */
const GENERATED_RE = /^(Tiết \d+|Ôn tập|Kiểm tra|Luyện thi)\b/;

// PRNG có seed (mulberry32) — chạy lại script ra y hệt (dễ review diff).
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function seedFromString(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = (Math.imul(31, h) + s.charCodeAt(i)) | 0; }
  return h;
}
function shuffleWithRng(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
/** Chia đều totalWanted câu cho các chủ đề, chủ đề nào thiếu thì san sẻ sang chủ đề khác. */
function evenPick(byTopic, totalWanted, rng) {
  const topics = Object.keys(byTopic).filter((t) => byTopic[t].length);
  const want = {};
  topics.forEach((t) => { want[t] = 0; });
  let left = Math.min(totalWanted, topics.reduce((s, t) => s + byTopic[t].length, 0));
  while (left > 0) {
    for (const t of shuffleWithRng(topics, rng)) {
      if (left > 0 && want[t] < byTopic[t].length) { want[t]++; left--; }
    }
  }
  const picked = [];
  topics.forEach((t) => picked.push(...shuffleWithRng(byTopic[t], rng).slice(0, want[t])));
  return shuffleWithRng(picked, rng);
}

/** Như evenPick nhưng lấy câu ĐẦU danh sách mỗi chủ đề (danh sách đã sắp ưu tiên sẵn). */
function evenPickOrdered(byTopic, totalWanted, rng) {
  const topics = Object.keys(byTopic).filter((t) => byTopic[t].length);
  const want = {};
  topics.forEach((t) => { want[t] = 0; });
  let left = Math.min(totalWanted, topics.reduce((s, t) => s + byTopic[t].length, 0));
  while (left > 0) {
    for (const t of shuffleWithRng(topics, rng)) {
      if (left > 0 && want[t] < byTopic[t].length) { want[t]++; left--; }
    }
  }
  return shuffleWithRng(topics.flatMap((t) => byTopic[t].slice(0, want[t])), rng);
}
const FINAL_PREFIX = 'Ôn tập cuối khóa';

const firstPaper = (uid) => String((AK[uid] || [''])[0]).split('#')[0];
const order = (uid) => { const [p, n] = String((AK[uid] || ['~#0'])[0]).split('#'); return [p, +n]; };
const byAllKeyOrder = (a, b) => { const [pa, na] = order(a.uid), [pb, nb] = order(b.uid); return pa.localeCompare(pb) || na - nb; };

function setName(p) {
  const t = String(p.tiet);
  if (p.kind === 'lt') return `${p.title} (Tiết ${t})`;
  return `${p.title} (Tiết ${t})${p.sub ? `: ${p.sub}` : ''}`;
}

function typeCounts(qs) {
  const counts = {};
  qs.forEach((q) => { counts[q.type] = (counts[q.type] || 0) + 1; });
  return counts;
}

function main() {
  const meta = JSON.parse(fs.readFileSync(META_FILE, 'utf8'));
  const report = [];
  meta.categories.forEach((cat) => {
    if (cat.id !== 'IC3' && cat.id !== 'Spark') return; // MOS không có tiết ôn All Key
    cat.levels.forEach((metaLevel) => {
      const key = `${cat.id}__${metaLevel.id}`;
      const plan = PLAN[key];
      if (!plan) { console.warn(`⚠ ppct-review.json chưa có ${key}, bỏ qua.`); return; }
      const levelFile = path.join(DATA_DIR, metaLevel.file);
      const levelData = JSON.parse(fs.readFileSync(levelFile, 'utf8'));
      const mts = levelData.minitests;

      // Ngân hàng: câu All Key trong 7 chủ đề, theo số thứ tự chủ đề
      const topics = {}, bai = {}, topicByNum = {};
      Object.keys(mts).forEach((n) => {
        const m = n.match(TOPIC_RE);
        if (m) { topics[n] = mts[n]; topicByNum[+m[1]] = mts[n].filter((q) => AK[q.uid]); }
        else if (!GENERATED_RE.test(n)) bai[n] = mts[n];
      });
      const byLabel = new Map(); // "Đề#số" → câu (Luyện thi)
      Object.values(topics).forEach((list) => list.forEach((q) => (AK[q.uid] || []).forEach((l) => byLabel.set(l, q))));

      const review = {};
      const T = RANDOM_MIX_COUNTS[key];
      plan.forEach((p, k) => {
        let qs;
        if (p.kind === 'lt') {
          const labels = [...byLabel.keys()].filter((l) => l.split('#')[0] === p.paper).sort((a, b) => +a.split('#')[1] - +b.split('#')[1]);
          const seen = new Set();
          qs = labels.map((l) => byLabel.get(l)).filter((q) => !seen.has(q.uid) && seen.add(q.uid));
        } else {
          const parts = p.parts || [{ topics: p.topics, test: p.test }];
          const pool = {};
          parts.forEach((part) => part.topics.forEach((t) => {
            const list = (topicByNum[t] || []).filter((q) => !part.test || (part.test === 'Test1' ? firstPaper(q.uid) === 'Test1' : firstPaper(q.uid) !== 'Test1'));
            pool[t] = (pool[t] || []).concat(list);
          }));
          if (p.kind === 'kt') qs = evenPick(pool, T, mulberry32(seedFromString(`${key}__kt${k}`)));
          else qs = Object.keys(pool).flatMap((t) => pool[t].slice().sort(byAllKeyOrder));
        }
        const name = setName(p);
        if (!qs.length) { console.warn(`⚠ ${key} › ${name}: không có câu All Key nào — bỏ qua bộ này.`); return; }
        review[name] = qs;
      });

      // ── 8 tiết Ôn tập cuối khóa (chỉ câu All Key) ──
      //   Tiết 1–4: phủ đủ MỌI câu All Key của cấp, mỗi câu đúng 1 lần, chia vòng nối tiếp theo từng chủ đề
      //             (4 tiết lệch nhau tối đa 1 câu, tiết nào cũng có đủ các chủ đề).
      //   Tiết 5–8: 4 đề tổng hợp đúng số câu đề thi thật của khối, rút đều 7 chủ đề; ưu tiên câu
      //             ít xuất hiện ở các tiết 5–8 trước đó để 4 đề khác nhau nhiều nhất.
      const final = {};
      const rngFull = mulberry32(seedFromString(`${key}__final`));
      const buckets = [[], [], [], []];
      let r = 0;
      Object.keys(topicByNum).sort((a, b) => a - b).forEach((t) => {
        shuffleWithRng(topicByNum[t], rngFull).forEach((q) => buckets[r++ % 4].push(q));
      });
      buckets.forEach((b, i) => { final[`${FINAL_PREFIX} — Tiết ${i + 1}: phủ đủ câu All Key (phần ${i + 1}/4)`] = shuffleWithRng(b, rngFull); });
      const uses = new Map();
      for (let i = 0; i < 4; i++) {
        const rng = mulberry32(seedFromString(`${key}__final${5 + i}`));
        const pool = {};
        Object.keys(topicByNum).forEach((t) => {
          // ít dùng trước, cùng số lần thì ngẫu nhiên (evenPick xáo lại nhưng chỉ lấy đầu danh sách đã sắp)
          pool[t] = shuffleWithRng(topicByNum[t], rng).sort((a, b) => (uses.get(a.uid) || 0) - (uses.get(b.uid) || 0));
        });
        const qs = evenPickOrdered(pool, Math.min(T, Object.values(pool).reduce((s, l) => s + l.length, 0)), rng);
        qs.forEach((q) => uses.set(q.uid, (uses.get(q.uid) || 0) + 1));
        final[`${FINAL_PREFIX} — Tiết ${5 + i}: đề tổng hợp ${qs.length} câu`] = qs;
      }

      // Ghi lại theo thứ tự Chủ đề → Ôn tập/Kiểm tra/Luyện thi theo tiết → Ôn tập cuối khóa → Bài N
      Object.keys(mts).forEach((n) => { delete mts[n]; });
      Object.assign(mts, topics, review, final, bai);
      fs.writeFileSync(levelFile, JSON.stringify(levelData), 'utf8');

      const metaOld = metaLevel.minitests || {};
      metaLevel.minitests = {};
      Object.keys(mts).forEach((n) => {
        metaLevel.minitests[n] = { ...(metaOld[n] || {}), count: mts[n].length, types: typeCounts(mts[n]) };
      });
      report.push({ key, onTap: plan.filter((p) => p.kind === 'on').length, kiemTra: plan.filter((p) => p.kind === 'kt').length,
        luyenThi: plan.filter((p) => p.kind === 'lt').length, cuoiKhoa: buckets.map((b) => b.length).join('/'), cauAllKey: Object.values(topicByNum).reduce((s, l) => s + l.length, 0) });
    });
  });
  meta.version = `${new Date().toISOString().slice(0, 10)}.review-gen`;
  fs.writeFileSync(META_FILE, JSON.stringify(meta), 'utf8');
  console.log('✅ Đã ghi data/ic3/meta.json, data/ic3/<cấp>.json — chạy tiếp: python scripts/split-minitests.py');
  console.table(report);
}

main();
