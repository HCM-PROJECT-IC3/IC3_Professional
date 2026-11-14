#!/usr/bin/env node
/* ============================================================
   tests/e2e/bandwidth.mjs — ĐO DUNG LƯỢNG 1 học sinh tải từ host (Firebase Hosting / GitHub Pages).

   Firebase Hosting gói Spark (miễn phí, 14/11/2026): 10 GB/THÁNG truyền tải (vượt → sau ít ngày ân hạn, trang
   bị TẮT tới hết tháng), 10 GB lưu trữ. Blaze: $0,15/GB vượt. Công cụ trả lời: "N lượt/ngày có vượt không?"

   Máy chủ giả lập ĐÚNG những thứ Firebase Hosting làm ảnh hưởng tới số byte:
     • phục vụ thư mục "public" của firebase.json (dist-hosting → tự chạy scripts/build-hosting.mjs trước);
     • nén brotli (trình duyệt nhận "br") hoặc gzip HTML/JS/CSS/JSON/SVG, như Firebase; --gzip: chỉ gzip;
     • ETag + If-None-Match → 304 (vài trăm byte thay vì cả file);
     • Cache-Control: lấy từ "hosting.headers" trong firebase.json (giống Firebase), không có → mặc định
       Firebase "max-age=3600" (1 giờ).
   Mỗi "học sinh" = 1 hồ sơ Chrome sạch (không có bản lưu cũ), có service worker thật (sw.js).

   Kịch bản:
     1. Lần đầu: mở sảnh index.html → tải câu hỏi 1 bài (kèm ảnh trong bài) → mở app 2.0 (/app/).
     2. Hôm sau quay lại (cùng máy): y như trên. Lần 1 máy chủ gửi "Age: 1 ngày" để Chrome coi như đã
        qua 1 ngày — file nào max-age < 1 ngày phải hỏi lại máy chủ (304 hoặc tải lại nếu bị no-store).
     3. Nút "Tải sẵn để dùng offline" (1 khối Spark LV1) — chỉ khi học sinh tự bấm.

   Chạy:  cd tests/e2e && node bandwidth.mjs            (dùng firebase.json hiện tại)
          node bandwidth.mjs --no-config                 (bỏ qua firebase.json: mặc định Firebase 1 giờ)
          node bandwidth.mjs --students=3000 --days=22   (số lượt vào/ngày, số ngày học/tháng)
   ============================================================ */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { globToRe, build, isIgnored } from '../../scripts/build-hosting.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.split('=')[1] : d; };
const USE_CONFIG = !process.argv.includes('--no-config');
const STUDENTS = Number(arg('students', 2000));   // lượt vào/ngày
const DAYS = Number(arg('days', 22));             // ngày học/tháng
const SPARK_GB_MONTH = 10;                        // firebase.google.com/docs/hosting/usage-quotas-pricing (14/11/2026)

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.mp3': 'audio/mpeg', '.txt': 'text/plain; charset=utf-8',
};
const COMPRESS = /^(text\/|application\/(json|javascript|manifest\+json)|image\/svg)/;

const fb = JSON.parse(fs.readFileSync(path.join(ROOT, 'firebase.json'), 'utf8'));
const hosting = USE_CONFIG ? fb.hosting || null : null;
const rules = (hosting?.headers || []).map((h) => ({ re: h.source ? globToRe(h.source) : new RegExp(h.regex), headers: h.headers }));
const ignore = (hosting?.ignore || ['firebase.json', '**/.*', '**/node_modules/**']).map(globToRe);
// Thư mục Firebase thật sự phục vụ ("public"). dist-hosting = bản rút gọn → build trước rồi mới đo.
const PUBLIC = path.resolve(ROOT, hosting?.public || '.');
if (hosting?.public === 'dist-hosting') build();
// Firebase nén brotli khi trình duyệt nhận "br" (Chrome qua HTTPS luôn nhận) — đo đúng như vậy; --gzip: chỉ gzip.
const FORCE_GZIP = process.argv.includes('--gzip');
const encUsed = new Set();
function headersFor(rel) {
  const out = { 'cache-control': 'max-age=3600' };           // mặc định của Firebase Hosting
  for (const r of rules) if (r.re.test('/' + rel)) for (const h of r.headers) out[h.key.toLowerCase()] = h.value;
  return out;
}

// ── máy chủ đếm byte ──
let bytes = 0, reqs = 0, n304 = 0, ageSec = 0;
const perFile = new Map();
const missing = new Set();               // 404 — file trang cần mà bị "ignore" (hoặc không có)

/** Dung lượng sẽ deploy: mọi file trong ROOT trừ "ignore" (Firebase Spark: tối đa 10 GB lưu trữ). */
function deploySize() {
  let size = 0, count = 0;
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, e.name);
      const rel = path.relative(PUBLIC, abs).split(path.sep).join('/');
      if (e.isDirectory()) { if (!isIgnored(ignore, rel + '/x')) walk(abs); continue; }
      if (isIgnored(ignore, rel)) continue;
      size += fs.statSync(abs).size; count++;
    }
  };
  walk(PUBLIC);
  return { size, count };
}
const etags = new Map();
function startServer() {
  const server = http.createServer((req, res) => {
    let rel;
    try { rel = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400).end(); return; }
    let file = path.join(PUBLIC, rel);
    if (!file.startsWith(PUBLIC)) { res.writeHead(403).end(); return; }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) { file = path.join(file, 'index.html'); rel = rel.replace(/\/?$/, '/index.html'); }
    const relNoSlash = rel.replace(/^\//, '');
    const send = (status, headers, body = Buffer.alloc(0)) => {
      const head = Object.entries(headers).reduce((s, [k, v]) => s + k.length + String(v).length + 4, 120);
      bytes += head + body.length; reqs++;
      perFile.set(relNoSlash, (perFile.get(relNoSlash) || 0) + head + body.length);
      res.writeHead(status, headers).end(body);
    };
    if (isIgnored(ignore, relNoSlash) || !fs.existsSync(file)) { missing.add(relNoSlash); return send(404, { 'content-type': 'text/plain' }, Buffer.from('404')); }
    const raw = fs.readFileSync(file);
    const type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
    let etag = etags.get(file);
    if (!etag) { etag = '"' + crypto.createHash('sha1').update(raw).digest('hex').slice(0, 20) + '"'; etags.set(file, etag); }
    const headers = { 'content-type': type, etag, ...headersFor(relNoSlash) };
    if (ageSec) headers.age = String(ageSec);
    if (req.headers['if-none-match'] === etag) { n304++; return send(304, headers); }
    let body = raw;
    const ae = req.headers['accept-encoding'] || '';
    if (COMPRESS.test(type) && !FORCE_GZIP && /br/.test(ae)) { body = zlib.brotliCompressSync(raw); headers['content-encoding'] = 'br'; }
    else if (COMPRESS.test(type) && /gzip/.test(ae)) { body = zlib.gzipSync(raw, { level: 6 }); headers['content-encoding'] = 'gzip'; }
    if (headers['content-encoding']) { headers.vary = 'Accept-Encoding'; encUsed.add(headers['content-encoding']); }
    send(200, headers, body);
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok({ server, base: `http://127.0.0.1:${server.address().port}/` })));
}

function findChrome() {
  return [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean).find((p) => fs.existsSync(p));
}

const { server, base } = await startServer();
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/ic3/meta.json'), 'utf8'));
const lv1 = meta.categories.find((c) => c.id === 'Spark').levels.find((l) => l.id === 'LV1');
const BAI = Object.keys(lv1.minitests).find((n) => /^Bài \d+/.test(n));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 1 lượt học: sảnh → làm 1 bài (tải câu + ảnh) → app 2.0. */
async function studentVisit(p) {
  await p.goto(base + 'index.html', { waitUntil: 'networkidle0', timeout: 60000 });
  await p.waitForFunction(() => document.getElementById('minitestSelect')?.options.length > 0, { timeout: 20000 });
  await p.waitForFunction(() => navigator.serviceWorker?.controller, { timeout: 10000 }).catch(() => {});
  const nq = await p.evaluate(async (bai) => {
    const qs = await _fetchMinitestQuestions('Spark', 'LV1', bai);           // eslint-disable-line no-undef
    const imgs = [...new Set((JSON.stringify(qs).match(/img\/[A-Za-z0-9_.\-/]+\.(?:png|jpe?g|gif|webp|svg)/g) || []))];
    await Promise.all(imgs.map((src) => new Promise((r) => { const i = new Image(); i.onload = i.onerror = r; i.src = src; })));
    return qs.length;
  }, BAI);
  await sleep(800);
  await p.goto(base + 'app/', { waitUntil: 'networkidle0', timeout: 60000 });
  await sleep(800);
  return nq;
}

function take() { const r = { bytes, reqs, n304, top: [...perFile.entries()].sort((a, b) => b[1] - a[1]).slice(0, Number(arg("top", 8))) }; bytes = reqs = n304 = 0; perFile.clear(); return r; }
const kb = (b) => (b / 1024).toFixed(0).padStart(6) + ' KB';

console.log(`Cấu hình: ${hosting ? `firebase.json "hosting" (public: ${hosting.public})` : 'mặc định Firebase (max-age=3600, không có firebase.json hosting)'}`);
console.log(`Bài thử: Spark LV1 — ${BAI}\n`);

const ctx = await browser.createBrowserContext();
const p = await ctx.newPage();
await p.setViewport({ width: 1366, height: 800 });

ageSec = 86400 + 60;                    // mọi phản hồi lần 1 "đã cũ 1 ngày" khi học sinh quay lại hôm sau
const nq = await studentVisit(p);
await sleep(1500);                       // service worker cập nhật bản lưu
const first = take();
ageSec = 0;
await studentVisit(p);
await sleep(1500);
const again = take();

const ctx2 = await browser.createBrowserContext();
const p2 = await ctx2.newPage();
await p2.goto(base + 'index.html', { waitUntil: 'networkidle0', timeout: 60000 });
await p2.waitForFunction(() => navigator.serviceWorker?.controller && window.EduOffline, { timeout: 15000 }).catch(() => {});
take();
const packed = await p2.evaluate(async () => { try { return await window.EduOffline.pack('Spark', 'LV1'); } catch (e) { return String(e); } });
await sleep(1000);
const pack = take();

await browser.close();
server.close();

function report(label, r) {
  console.log(`${label}: ${kb(r.bytes)} — ${r.reqs} request (${r.n304} lần 304)`);
  for (const [f, b] of r.top) console.log(`      ${kb(b)}  ${f}`);
}
report(`1. Học sinh MỚI (sảnh + 1 bài ${nq} câu + app 2.0)`, first);
report('2. Hôm sau quay lại (cùng máy)', again);
report('3. Bấm "Tải sẵn offline" Spark LV1', pack);
if (typeof packed === 'string') console.log('   (tải sẵn báo: ' + packed + ')');

const mb = (b) => b / 1048576;
console.log(`
Nén: ${[...encUsed].join(', ') || 'không'}`);
if (missing.size) console.log(`\n404 (${missing.size}): ${[...missing].slice(0, 15).join(', ')}`);
const dep = deploySize();
console.log(`\nDeploy: ${dep.count} file, ${mb(dep.size).toFixed(1)} MB${hosting ? '' : ' (chưa có "ignore" — đẩy lên CẢ thư mục)'}`);
const capMB = SPARK_GB_MONTH * 1024;
const perDay = (b) => Math.floor(capMB / DAYS / mb(b));
console.log(`\nQuota Spark ${SPARK_GB_MONTH} GB/tháng (${DAYS} ngày học → ~${(capMB / DAYS).toFixed(0)} MB/ngày):`);
console.log(`  • Mọi lượt là máy MỚI (phòng máy xoá cache/ẩn danh): ${mb(first.bytes).toFixed(2)} MB/lượt → tối đa ~${perDay(first.bytes)} lượt/ngày`);
console.log(`  • Mọi lượt là máy CŨ (giữ cache):                 ${mb(again.bytes).toFixed(3)} MB/lượt → tối đa ~${perDay(again.bytes)} lượt/ngày`);
const line = (label, per) => {
  const month = mb(per * STUDENTS * DAYS) / 1024;
  const over = Math.max(0, month - SPARK_GB_MONTH);
  console.log(`  • ${STUDENTS} lượt/ngày, ${label}: ${month.toFixed(1)} GB/tháng → ${month <= SPARK_GB_MONTH ? 'TRONG quota Spark' : `VƯỢT Spark (trang bị tắt tới hết tháng); gói Blaze ≈ $${(over * 0.15).toFixed(2)}/tháng`}`);
};
line('20% máy mới + 80% quay lại', 0.2 * first.bytes + 0.8 * again.bytes);
line('100% máy mới', first.bytes);

// ── So 5 host (hạn mức miễn phí, kiểm 14/11/2026): Cloudflare Pages file tĩnh không giới hạn (20.000 file, 25 MiB/file), Vercel Hobby đếm request (1 triệu/tháng), Netlify Free đếm
// credit (300/tháng: 20/GB + 2/10.000 request), Firebase Spark 10 GB/tháng, GitHub Pages 100 GB/tháng (mềm).
const visits = STUDENTS * DAYS;
for (const [label, newShare] of [['20% máy mới', 0.2], ['100% máy mới', 1]]) {
  const gb = mb((newShare * first.bytes + (1 - newShare) * again.bytes) * visits) / 1024;
  const rq = (newShare * first.reqs + (1 - newShare) * again.reqs) * visits;
  const credits = gb * 20 + (rq / 1e4) * 2;
  const ok = (v) => (v ? 'ổn' : 'VƯỢT');
  console.log(`\n${STUDENTS} lượt/ngày × ${DAYS} ngày, ${label}: ${gb.toFixed(1)} GB, ${(rq / 1e6).toFixed(2)} triệu request/tháng`);
  console.log(`  Cloudflare Pages (file tĩnh không giới hạn): ổn · GitHub Pages (100 GB): ${ok(gb <= 100)} · Firebase Spark (10 GB): ${ok(gb <= 10)} · Vercel Hobby (100 GB + 1 triệu request): ${ok(gb <= 100 && rq <= 1e6)} · Netlify Free (300 credit): ${ok(credits <= 300)} (${credits.toFixed(0)} credit)`);
}
