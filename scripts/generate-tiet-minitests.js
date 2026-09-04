#!/usr/bin/env node
/**
 * scripts/generate-tiet-minitests.js
 * ────────────────────────────────────────────────────────────────────────
 * Sinh thêm 8 minitest "Tiết 1".."Tiết 8" cho MỖI cấp độ (level) của 2
 * chương trình Spark và IC3 (KHÔNG đụng tới MOS).
 *
 * QUAN TRỌNG — nguồn dữ liệu: script này đọc/ghi TRỰC TIẾP
 * data/ic3/meta.json + data/ic3/<level>.json (nguồn front-end THỰC SỰ
 * tải, xem js/quiz-engine.js § _fetchLevelData), KHÔNG dùng
 * quiz_data.json làm nguồn — kiểm tra tại thời điểm viết script này
 * phát hiện quiz_data.json đã CŨ hơn data/ic3/*.json (lệch số câu, có
 * lẽ từ đợt đối chiếu ngân hàng câu hỏi với "All Key" trước đó chỉ sửa
 * data/ic3/*.json mà chưa chạy lại scripts/split-quiz-data.py). Nếu
 * dùng quiz_data.json làm nguồn rồi chạy split-quiz-data.py, sẽ GHI ĐÈ
 * mất phần câu hỏi đã đối chiếu/bổ sung đó. Script này vì vậy KHÔNG
 * đụng tới split-quiz-data.py — thay vào đó tự rebuild luôn
 * quiz_data.json (bản fallback dự phòng) từ chính data/ic3/*.json ở
 * bước cuối, để 2 nguồn khớp lại với nhau.
 *
 * Quy tắc phân bổ (theo yêu cầu):
 *   - Tiết 1-4: PHỦ ĐỦ toàn bộ ngân hàng câu hỏi của level đó — mỗi câu
 *     hỏi gốc xuất hiện ĐÚNG 1 LẦN trong 4 tiết này (không trùng, không
 *     thiếu). Chia đều theo TỪNG CHỦ ĐỀ (round-robin trên bản đã xáo
 *     trộn của mỗi chủ đề) để 4 tiết đều có đủ 7 chủ đề, không tiết nào
 *     dồn hết 1 chủ đề. Cỡ mỗi tiết ≈ tổng số câu / 4 — CÓ THỂ nhỏ hơn
 *     số câu "Tổng hợp" chính thức của level đó (khi ngân hàng câu hỏi
 *     không đủ 4× số câu Tổng hợp) — ưu tiên "làm đủ toàn bộ câu hỏi"
 *     (yêu cầu bắt buộc) hơn là ép đúng bằng số câu Tổng hợp (chỉ là
 *     yêu cầu "phù hợp"/hợp lý).
 *   - Tiết 5-8: random — dùng ĐÚNG thuật toán "Tổng hợp" hiện có
 *     (buildRandomMixQuestions() trong js/quiz-engine.js — chia đều số
 *     câu mong muốn cho từng chủ đề, san sẻ nếu chủ đề nào thiếu), lấy
 *     từ TOÀN BỘ ngân hàng câu hỏi gốc (có thể trùng với câu ở Tiết
 *     1-4 hoặc giữa các Tiết 5-8 với nhau — đúng tinh thần "random" của
 *     bài Tổng hợp), số câu = số câu "Tổng hợp" chính thức của level đó
 *     (RANDOM_MIX_COUNTS, giống hệt bảng trong js/quiz-engine.js).
 *
 * An toàn khi chạy lại nhiều lần: mọi "Tiết N" cũ (nếu có từ lần chạy
 * trước) đều bị bỏ qua khi tính lại "7 chủ đề gốc", nên chạy lại không
 * làm phình to dần dữ liệu.
 *
 * Cách chạy:
 *   node scripts/generate-tiet-minitests.js
 * (không cần chạy thêm split-quiz-data.py — script này tự ghi cả
 * data/ic3/meta.json, data/ic3/<level>.json, VÀ quiz_data.json)
 * ────────────────────────────────────────────────────────────────────────
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data', 'ic3');
const META_FILE = path.join(DATA_DIR, 'meta.json');
const QUIZ_DATA_FILE = path.join(ROOT, 'quiz_data.json');

// Khớp CHÍNH XÁC bảng RANDOM_MIX_COUNTS trong js/quiz-engine.js — số câu
// "Tổng hợp" chuẩn theo đúng đề thi thật của từng khối.
const RANDOM_MIX_COUNTS = {
  'Spark__LV1': 31,
  'Spark__LV2': 36,
  'Spark__LV3': 42,
  'IC3__LV1': 45,
  'IC3__LV2': 45,
  'IC3__LV3': 40,
};

// PRNG có seed (mulberry32) — để mỗi lần chạy lại script cho kết quả
// GIỐNG NHAU (dễ review diff), không phụ thuộc Math.random() không
// kiểm soát được.
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

/** Y HỆT buildRandomMixQuestions() trong js/quiz-engine.js, chỉ đổi
 * nguồn ngẫu nhiên sang rng có seed để tái lập được. */
function buildRandomMixQuestions(minitestsFull, totalWanted, rng) {
  const topics = Object.keys(minitestsFull || {});
  if (topics.length === 0) return [];

  const avail = {};
  topics.forEach(t => { avail[t] = (minitestsFull[t] || []).length; });

  const base = Math.floor(totalWanted / topics.length);
  let remainder = totalWanted - base * topics.length;

  const want = {};
  topics.forEach(t => { want[t] = base; });
  shuffleWithRng(topics, rng).forEach(t => {
    if (remainder > 0) { want[t] += 1; remainder--; }
  });

  let deficit = 0;
  topics.forEach(t => {
    if (want[t] > avail[t]) { deficit += want[t] - avail[t]; want[t] = avail[t]; }
  });
  let guard = 0;
  while (deficit > 0 && guard < 1000) {
    guard++;
    const spare = topics.filter(t => avail[t] > want[t]);
    if (spare.length === 0) break;
    for (const t of shuffleWithRng(spare, rng)) {
      if (deficit <= 0) break;
      want[t] += 1;
      deficit--;
    }
  }

  const picked = [];
  topics.forEach(t => {
    const shuffled = shuffleWithRng(minitestsFull[t] || [], rng);
    picked.push(...shuffled.slice(0, want[t]));
  });
  return shuffleWithRng(picked, rng);
}

/** Tiết 1-4: chia đều — MỖI câu hỏi gốc xuất hiện đúng 1 lần trong 4 tiết. */
function buildFullCoverageBuckets(minitestsFull, numBuckets, rng) {
  const buckets = Array.from({ length: numBuckets }, () => []);
  Object.keys(minitestsFull).forEach(topic => {
    const shuffled = shuffleWithRng(minitestsFull[topic] || [], rng);
    shuffled.forEach((q, i) => buckets[i % numBuckets].push(q));
  });
  return buckets.map(b => shuffleWithRng(b, rng)); // xáo lại để không dồn cục theo chủ đề
}

function typeCounts(qs) {
  const counts = {};
  qs.forEach(q => { counts[q.type] = (counts[q.type] || 0) + 1; });
  return counts;
}

function main() {
  const meta = JSON.parse(fs.readFileSync(META_FILE, 'utf8'));
  const report = [];

  meta.categories.forEach(cat => {
    if (cat.id !== 'IC3' && cat.id !== 'Spark') return; // CHỈ Spark/IC3, không đụng MOS
    cat.levels.forEach(metaLevel => {
      const key = `${cat.id}__${metaLevel.id}`;
      const T = RANDOM_MIX_COUNTS[key];
      if (!T) { console.warn(`⚠ Không có RANDOM_MIX_COUNTS cho ${key}, bỏ qua.`); return; }

      const levelFile = path.join(DATA_DIR, metaLevel.file);
      const levelData = JSON.parse(fs.readFileSync(levelFile, 'utf8'));
      const minitests = levelData.minitests;

      // Chụp lại 7 chủ đề GỐC — lọc bỏ mọi "Tiết N" cũ (nếu chạy lại).
      const originalTopics = {};
      Object.keys(minitests).forEach(t => {
        if (!/^Tiết \d+$/.test(t)) originalTopics[t] = minitests[t];
      });
      Object.keys(minitests).forEach(t => { if (/^Tiết \d+$/.test(t)) delete minitests[t]; });
      const totalN = Object.values(originalTopics).reduce((s, a) => s + a.length, 0);

      // ── Tiết 1-4: phủ đủ toàn bộ, không trùng ──
      const rngFull = mulberry32(seedFromString(key + '__full'));
      const buckets = buildFullCoverageBuckets(originalTopics, 4, rngFull);
      buckets.forEach((bucket, i) => { minitests[`Tiết ${i + 1}`] = bucket; });

      // ── Tiết 5-8: random kiểu "Tổng hợp", 4 lần độc lập ──
      const wanted = Math.min(T, totalN);
      const randomSets = [];
      for (let i = 0; i < 4; i++) {
        const rngRand = mulberry32(seedFromString(key + `__rand${i}`));
        const s = buildRandomMixQuestions(originalTopics, wanted, rngRand);
        randomSets.push(s);
        minitests[`Tiết ${5 + i}`] = s;
      }

      // ── Ghi lại file level (full) ──
      fs.writeFileSync(levelFile, JSON.stringify(levelData), 'utf8');

      // ── Ghi lại TOÀN BỘ thống kê meta (không kèm câu hỏi) từ đúng dữ
      //    liệu thật vừa đọc — KHÔNG chỉ 8 "Tiết" mới, mà cả 7 chủ đề
      //    gốc. Phát hiện khi viết script này: data/ic3/meta.json đang
      //    lệch (đếm thiếu) so với data/ic3/<level>.json thật ở phần lớn
      //    chủ đề (rất có thể từ đợt đối chiếu ngân hàng câu hỏi trước
      //    đó chỉ sửa file level mà quên chạy lại split-quiz-data.py) —
      //    tiện thể sửa luôn cho đúng, tránh dropdown hiện sai số câu. ──
      metaLevel.minitests = {};
      Object.keys(originalTopics).forEach(topic => {
        metaLevel.minitests[topic] = { count: originalTopics[topic].length, types: typeCounts(originalTopics[topic]) };
      });
      for (let i = 0; i < 4; i++) {
        metaLevel.minitests[`Tiết ${i + 1}`] = { count: buckets[i].length, types: typeCounts(buckets[i]) };
      }
      for (let i = 0; i < 4; i++) {
        metaLevel.minitests[`Tiết ${5 + i}`] = { count: randomSets[i].length, types: typeCounts(randomSets[i]) };
      }

      report.push({
        key,
        totalN,
        tongHop: T,
        tiet1_4_sizes: buckets.map(b => b.length),
        tiet5_8_size: wanted,
      });
    });
  });

  // ── version: chỉ để tham khảo, không còn ảnh hưởng cache (localStorage
  // cache theo field này đã bị gỡ — xem comment trong js/quiz-engine.js) ──
  const today = new Date().toISOString().slice(0, 10);
  meta.version = `${today}.tiet-gen`;
  fs.writeFileSync(META_FILE, JSON.stringify(meta), 'utf8');

  // ── Rebuild quiz_data.json (bản fallback dự phòng) từ chính
  //    data/ic3/*.json vừa cập nhật, để 2 nguồn khớp lại với nhau —
  //    ĐÚNG hình dạng gốc của quiz_data.json (chỉ id/name/grade/minitests,
  //    không kèm "file"/"cat_id" là các field chỉ per-level-file mới có). ──
  const quizData = { categories: [] };
  meta.categories.forEach(cat => {
    if (cat.id !== 'IC3' && cat.id !== 'Spark') return; // quiz_data.json gốc chỉ có 2 category này
    const outCat = { id: cat.id, name: cat.name, levels: [] };
    cat.levels.forEach(metaLevel => {
      const levelFile = path.join(DATA_DIR, metaLevel.file);
      const levelData = JSON.parse(fs.readFileSync(levelFile, 'utf8'));
      outCat.levels.push({
        id: metaLevel.id,
        name: metaLevel.name,
        grade: metaLevel.grade ?? null,
        minitests: levelData.minitests,
      });
    });
    quizData.categories.push(outCat);
  });
  fs.writeFileSync(QUIZ_DATA_FILE, JSON.stringify(quizData), 'utf8');

  console.log('✅ Đã ghi data/ic3/meta.json, data/ic3/<level>.json, quiz_data.json');
  console.table(report);
}

main();
