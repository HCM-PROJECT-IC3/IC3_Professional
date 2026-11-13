#!/usr/bin/env node
/* ============================================================
   tests/e2e/run.mjs — kiểm thử trình duyệt thật (Chrome headless) cho trang cũ + app 2.0.

   KHÔNG gọi Firebase thật: đăng nhập / tải dữ liệu nhân sự được THAY bằng bản giả ngay trong
   trình duyệt (chặn js/auth.js); học sinh, lộ trình, game chỉ dùng localStorage + file tĩnh.
   Mọi bộ đều kiểm "không request nào tới Firestore/Google" ở chỗ cần.

   Chạy:   cd tests/e2e && npm ci && npm test
           npm test -- learning deeplink        (chỉ chạy vài bộ)
           E2E_SHOTS=../../.e2e-shots npm test  (lưu ảnh chụp màn hình)
   Chrome: tự tìm ở chỗ cài mặc định (Windows/macOS/Linux) hoặc đặt CHROME_PATH.
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { startServer } from './server.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const SUITES = ['foundation', 'offline', 'student', 'learning', 'deeplink', 'plain-text', 'play', 'pages', 'teacher', 'coordinator', 'admin'];

function findChrome() {
  const c = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  ].filter(Boolean);
  const hit = c.find((p) => fs.existsSync(p));
  if (!hit) throw new Error('Không tìm thấy Chrome — đặt biến CHROME_PATH');
  return hit;
}

const only = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const run = only.length ? SUITES.filter((s) => only.includes(s)) : SUITES;
const shots = process.env.E2E_SHOTS ? path.resolve(process.env.E2E_SHOTS) : null;
if (shots) fs.mkdirSync(shots, { recursive: true });

const { server, base } = await startServer(ROOT);
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });

let failed = 0;
let total = 0;
const started = Date.now();
for (const name of run) {
  const results = [];
  const check = (label, ok, info) => {
    results.push(ok);
    total++;
    if (!ok) failed++;
    console.log(`  ${ok ? '✓' : '✗'} ${label}${ok || info === undefined ? '' : '\n      → ' + JSON.stringify(info).slice(0, 400)}`);
  };
  const ctx = {
    base, root: ROOT, browser, check,
    /** Trang mới trong 1 hồ sơ sạch (localStorage/IndexedDB riêng); gom lỗi JS + request ra ngoài. */
    async page({ width = 1366, height = 900 } = {}) {
      // Đóng 1 hồ sơ còn service worker (app 2.0 + sảnh cũ đều đăng ký sw.js) đôi khi làm lệnh tạo hồ sơ kế tiếp
      // báo "Session with given id not found" (phiên SW cũ của CDP) — lỗi của công cụ, thử lại là qua.
      let bc;
      for (let i = 0; ; i++) {
        try { bc = await browser.createBrowserContext(); break; } catch (e) {
          if (i >= 3 || !/Session with given id not found|Target closed/.test(e.message)) throw e;
          await new Promise((r) => setTimeout(r, 300));
        }
      }
      const p = await bc.newPage();
      await p.setViewport({ width, height });
      p.errors = [];
      p.external = new Set();
      p.dialogs = [];
      p.on('pageerror', (e) => p.errors.push(e.message));
      p.on('dialog', (d) => { p.dialogs.push(p.url().replace(base, '')); d.dismiss().catch(() => {}); });
      p.on('request', (r) => {
        const u = r.url();
        if (!u.startsWith(base) && !u.startsWith('data:') && !u.startsWith('blob:')) p.external.add(new URL(u).host);
      });
      p.closeAll = async () => {
        // gỡ service worker trước khi đóng hồ sơ — tránh phiên SW mồ côi ở CDP
        await p.evaluate(async () => {
          for (const r of (await navigator.serviceWorker?.getRegistrations?.()) || []) await r.unregister();
        }).catch(() => {});
        await bc.close().catch(() => {});
      };
      return p;
    },
    shot: async (p, file, opts = {}) => { if (shots) await p.screenshot({ path: path.join(shots, file), fullPage: true, ...opts }); },
    json: async (rel) => (await fetch(base + rel)).json(),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  };
  console.log(`\n▶ ${name}`);
  const t0 = Date.now();
  try {
    const mod = await import(`./suites/${name}.mjs`);
    await mod.default(ctx);
  } catch (e) {
    check(`${name}: chạy hết bộ không lỗi`, false, e.stack || e.message);
  }
  console.log(`  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
}

await browser.close();
server.close();
console.log(`\n${failed ? '✗ FAIL' : '✓ PASS'} — ${total - failed}/${total} kiểm tra, ${run.length} bộ, ${((Date.now() - started) / 1000).toFixed(0)}s`);
process.exit(failed ? 1 : 0);
