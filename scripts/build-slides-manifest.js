#!/usr/bin/env node
/* ============================================================
   scripts/build-slides-manifest.js — quét thư mục Google Drive "Tài Liệu
   Bàn Giao" (đã chia sẻ "Bất kỳ ai có đường liên kết") → ghi
   data/slides-manifest.json cho trang tai-lieu-nam-hoc.html.

     node scripts/build-slides-manifest.js [FOLDER_ID]

   Chạy TAY trên máy giáo viên mỗi khi thêm/đổi file trên Drive (sửa nội dung
   trong cùng file thì giữ nguyên ID, không cần chạy lại).
   Đọc trang công khai drive.google.com/embeddedfolderview — KHÔNG cần API key,
   Apps Script hay Firebase; web chỉ đọc file JSON tĩnh này.

   Chỉ lấy slide bài giảng (.pptx/.ppt/.pdf/Google Slides):
     • IC3 / Spark: file K<khối>_B<số bài> → gắn tên "Bài N. …" từ data/ic3/*.json
     • MOS: file nằm ngay trong thư mục "Bài N …" / "Ôn luyện …/Tiết N";
       bỏ thư mục phụ (Tài liệu, Data, Project, Videos…) — đó là file thực hành.
     • Bỏ thư mục Quiz (đã có trong data/ic3).
   Ghi thêm cỡ file (size) — trang trình chiếu bằng Office Online khi ≤ 50MB.
   File "<tên> (web).pptx" cạnh "<tên>.pptx" (tạo bằng scripts/make-web-slides.py)
   không thành dòng riêng mà gắn vào file gốc (file.web) để trình chiếu file lớn.
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'data', 'slides-manifest.json');
const DEFAULT_FOLDER = '1fC5DKxZWXVbq3C9YYrtA53O4TiC8PDNl';
const CONCURRENCY = 3;

// Tên thư mục cấp 1 → khoá khoá học (trùng category_level trong data/ic3/meta.json)
const COURSES = [
  { re: /^IC3 Level\s*1/i, key: 'IC3_LV1', label: 'IC3 LV1', data: 'IC3__LV1.json' },
  { re: /^IC3 Level\s*2/i, key: 'IC3_LV2', label: 'IC3 LV2', data: 'IC3__LV2.json' },
  { re: /^IC3 Level\s*3/i, key: 'IC3_LV3', label: 'IC3 LV3', data: 'IC3__LV3.json' },
  { re: /^IC3 SPARK Level\s*1/i, key: 'Spark_LV1', label: 'Spark LV1', data: 'Spark__LV1.json' },
  { re: /^IC3 SPARK Level\s*2/i, key: 'Spark_LV2', label: 'Spark LV2', data: 'Spark__LV2.json' },
  { re: /^IC3 SPARK Level\s*3/i, key: 'Spark_LV3', label: 'Spark LV3', data: 'Spark__LV3.json' },
  { re: /^MOS WORD/i, key: 'MOS_Word', label: 'MOS Word', mos: true },
  { re: /^MOS EXCEL/i, key: 'MOS_Excel', label: 'MOS Excel', mos: true },
  { re: /^MOS POWERPOINT/i, key: 'MOS_PowerPoint', label: 'MOS PowerPoint', mos: true },
];
const SLIDE_EXT = /\.(pptx?|pdf)$/i;
const MOS_SKIP_DIR = /t[àa]i\s*li[ệe]u|^data|project|documents|videos|pictures|b[àa]i\s*t[ậa]p|b[àa]i\s*m[ẫa]u|resource|gmetrix|3d objects|v[ậa]n d[ụu]ng|^de\s*\d/i;

const decode = (s) => s
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
  .normalize('NFC').trim();

async function listFolder(id, attempt = 1) {
  // UA mặc định của Node hay bị Drive trả trang rỗng → giả trình duyệt
  const res = await fetch(`https://drive.google.com/embeddedfolderview?id=${id}`, {
    headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36', 'accept-language': 'vi,en' },
  });
  if (!res.ok) {
    if (attempt < 4) { await new Promise((r) => setTimeout(r, 1500 * attempt)); return listFolder(id, attempt + 1); }
    throw new Error(`Không đọc được thư mục ${id} (HTTP ${res.status}) — đã chia sẻ "Bất kỳ ai có đường liên kết" chưa?`);
  }
  const html = await res.text();
  const items = [];
  const re = /<div class="flip-entry" id="entry-([\w-]+)"[\s\S]*?<a href="([^"]+)"[\s\S]*?<div class="flip-entry-title">([^<]*)<\/div>/g;
  let m;
  while ((m = re.exec(html))) {
    const [, itemId, href, title] = m;
    const type = /\/folders\//.test(href) ? 'folder'
      : /docs\.google\.com\/presentation/.test(href) ? 'gslides'
      : 'file';
    items.push({ id: itemId, name: decode(title), type });
  }
  // Drive đôi khi trả trang rỗng khi bị gọi dồn → thử lại vài lần trước khi tin là rỗng thật
  if (!items.length && attempt < 4) {
    await new Promise((r) => setTimeout(r, 2000 * attempt));
    return listFolder(id, attempt + 1);
  }
  return items;
}

/** Duyệt cả cây (song song CONCURRENCY thư mục) → [{ id, name, type, dirs: [...] }] */
async function crawl(rootId) {
  const files = [];
  const queue = [{ id: rootId, dirs: [] }];
  const empty = [];
  let folders = 0;
  let active = 0;
  await new Promise((resolve, reject) => {
    const pump = () => {
      if (!queue.length && !active) return resolve();
      while (queue.length && active < CONCURRENCY) {
        const { id, dirs } = queue.shift();
        active++;
        listFolder(id).then((items) => {
          folders++;
          if (!items.length && dirs.length) empty.push(dirs.join(' / '));
          if (process.stdout.isTTY) process.stdout.write(`\r  đã đọc ${folders} thư mục, ${files.length} file…`);
          for (const it of items) {
            if (it.type !== 'folder') files.push({ ...it, dirs });
            else if (dirs.length === 0 && /^quiz$/i.test(it.name)) continue;
            else if (dirs.length >= 2 && MOS_SKIP_DIR.test(it.name)) continue; // thư mục file thực hành — không có slide
            else queue.push({ id: it.id, dirs: [...dirs, it.name] });
          }
          active--;
          pump();
        }, reject);
      }
    };
    pump();
  });
  if (process.stdout.isTTY) process.stdout.write('\n');
  console.log(`  ${folders} thư mục, ${files.length} file công khai`);
  return { files, empty };
}

/** Tên "Bài N. …" của từng khoá từ ngân hàng câu hỏi (cho tiêu đề slide IC3/Spark) */
function lessonTitles(dataFile) {
  const map = {};
  try {
    const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'ic3', dataFile), 'utf8'));
    for (const k of Object.keys(d.minitests || {})) {
      const m = /^Bài\s+(\d+)\b/.exec(k);
      if (m) map[+m[1]] = k;
    }
  } catch (e) { /* thiếu file: dùng "Bài N" */ }
  return map;
}

const naturalCmp = (a, b) => a.localeCompare(b, 'vi', { numeric: true, sensitivity: 'base' });
const cleanName = (name) => name.replace(SLIDE_EXT, '').replace(/^\d{8}_/, '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();

function buildCourse(def, files) {
  const groups = new Map();
  const add = (key, order, title, file) => {
    if (!groups.has(key)) groups.set(key, { key, order, title, files: [] });
    groups.get(key).files.push(file);
  };
  const titles = def.data ? lessonTitles(def.data) : {};

  // "<tên> (web).pptx" cùng thư mục = bản chiếu nhẹ (scripts/make-web-slides.py) của "<tên>.pptx":
  // không thành 1 dòng riêng, gắn vào file gốc (file.web) để trang trình chiếu bằng bản này
  const WEB_RE = /\s*\(web\)(\.pptx?)$/i;
  const webOf = new Map();
  for (const f of files) {
    if (WEB_RE.test(f.name)) webOf.set(`${f.dirs.join('/')}|${f.name.replace(WEB_RE, '$1').toLowerCase()}`, f);
  }

  for (const f of files) {
    if (f.type !== 'gslides' && !SLIDE_EXT.test(f.name)) continue;
    if (WEB_RE.test(f.name)) continue;
    const kind = f.type === 'gslides' ? 'gslides' : f.name.split('.').pop().toLowerCase();
    const file = { id: f.id, name: cleanName(f.name), kind };
    const web = webOf.get(`${f.dirs.join('/')}|${f.name.toLowerCase()}`);
    if (web) file.web = { id: web.id };
    const sub = f.dirs.slice(1); // bỏ thư mục khoá học

    if (!def.mos) {
      const m = /K\d+_B(\d+)/i.exec(f.name);
      if (!m) continue;
      const n = +m[1];
      add(`B${String(n).padStart(2, '0')}`, n, titles[n] || `Bài ${n}`, file);
      continue;
    }

    if (sub.length === 0 || sub.slice(1).some((d) => MOS_SKIP_DIR.test(d))) continue;
    const top = sub[0];
    const bai = /^B[àa]i\s*\.?\s*(\d+)/i.exec(top);
    if (bai && sub.length === 1) {
      const n = +bai[1];
      const title = top.replace(/^B[àa]i\s*\.?\s*\d+\s*[-_.]?\s*/i, '').replace(/\s*-\s*Done$|_done$/i, '').trim();
      add(`B${String(n).padStart(2, '0')}`, n, `Bài ${n}. ${title}`, file);
    } else if (/[ôo]n[\s_]*(luy[ệe]n|t[ậa]p)/i.test(top) && sub.length === 2) {
      const t = /(\d+)/.exec(sub[1]);
      if (t) file.name = `Tiết ${t[1]} — ${file.name}`;
      add('ON', 1000, 'Ôn luyện cuối khoá', file);
    }
  }

  const lessons = [...groups.values()].sort((a, b) => a.order - b.order);
  // Trong 1 bài: theo số tiết đầu tiên trong tên ("Tiết 13", "Tiet07-08"); file không ghi tiết xếp cuối
  const tiet = (n) => { const m = /ti[ếe]t+\s*(\d+)/i.exec(n); return m ? +m[1] : 1e6; };
  for (const g of lessons) {
    g.files.sort((a, b) => tiet(a.name) - tiet(b.name) || naturalCmp(a.name, b.name));
    delete g.order;
  }
  return { label: def.label, lessons };
}

/** Link tải thẳng file công khai — dùng cho trình chiếu Office Online (tai-lieu-nam-hoc.js) */
const downloadUrl = (id) => `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`;

/** Ghi file.size (byte) bằng HEAD link tải — trang chọn trình xem theo cỡ file */
async function addSizes(list) {
  const queue = list.filter((f) => f.kind !== 'gslides');
  let failed = 0;
  async function worker() {
    for (let f; (f = queue.shift());) {
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const res = await fetch(downloadUrl(f.id), { method: 'HEAD' });
          const len = +res.headers.get('content-length');
          if (res.ok && len) { f.size = len; break; }
        } catch (e) { /* thử lại */ }
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
      if (!f.size) failed++;
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker));
  console.log(`  đã đo cỡ ${list.length - failed} file${failed ? `, ${failed} file không đo được (vẫn xem được bằng Drive)` : ''}`);
}

(async () => {
  const rootId = process.argv[2] || DEFAULT_FOLDER;
  console.log(`Quét Google Drive ${rootId}…`);
  const { files, empty } = await crawl(rootId);

  const courses = {};
  for (const def of COURSES) {
    const mine = files.filter((f) => f.dirs.length && def.re.test(f.dirs[0]));
    if (!mine.length) continue;
    const c = buildCourse(def, mine);
    const n = c.lessons.reduce((s, l) => s + l.files.length, 0);
    console.log(`  ${def.key.padEnd(15)} ${String(c.lessons.length).padStart(3)} bài, ${n} slide`);
    courses[def.key] = c;
  }
  const all = Object.values(courses).flatMap((c) => c.lessons.flatMap((l) => l.files));
  await addSizes([...all, ...all.filter((f) => f.web).map((f) => f.web)]);
  // File quá lớn để Office Online trình chiếu (tai-lieu-nam-hoc.js OFFICE_MAX) mà chưa có bản web
  const heavy = all.filter((f) => f.size > 50e6 && !(f.web && f.web.size <= 50e6));
  if (heavy.length) {
    console.log(`\n⚠ ${heavy.length} file > 50MB chưa có bản chiếu web — chỉ xem dạng trang. Tạo bản nhẹ:`);
    console.log('    python scripts/make-web-slides.py <thư mục tài liệu trên máy>   (rồi tải "(web).pptx" lên cạnh file gốc)');
    for (const f of heavy) console.log(`    ${f.name} (${(f.size / 1e6).toFixed(0)}MB)`);
  }

  const unknown = [...new Set(files.map((f) => f.dirs[0]).filter((d) => d && !COURSES.some((c) => c.re.test(d))))];
  if (unknown.length) console.log(`  (bỏ qua thư mục không nhận ra: ${unknown.join(', ')})`);

  // Thư mục rỗng trên trang công khai = file bên trong CHƯA chia sẻ "Bất kỳ ai có
  // đường liên kết" (vd tải lên bằng tài khoản khác) — hoặc thư mục rỗng thật.
  if (empty.length) {
    console.log(`\n⚠ ${empty.length} thư mục không thấy file nào (chưa chia sẻ công khai?):`);
    for (const d of empty.sort(naturalCmp)) console.log(`    ${d}`);
  }

  const out = { version: 1, generatedAt: new Date().toISOString(), rootFolderId: rootId, courses };
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n');
  console.log(`Đã ghi ${path.relative(ROOT, OUT)}`);
})().catch((e) => { console.error('\n' + e.message); process.exit(1); });
