#!/usr/bin/env node
/* ============================================================
   tests/e2e/ui-audit.mjs — đo "giao diện kiểu AI" + điểm gây giật trên trang THẬT (Chrome headless).

   Mỗi trang đo (sau khi tải xong, ~1,5 giây):
   - grad   : phần tử ĐANG HIỆN có nền gradient (bỏ qua hình vẽ trong <svg>/<canvas>, tranh bản đồ).
   - anim   : animation CSS chạy vô hạn đang chạy (tốn CPU/GPU liên tục → máy phòng tin giật).
   - blur   : phần tử có backdrop-filter (mờ kính — nặng khi cuộn).
   - glow   : text-shadow / box-shadow toả màu (≥ 12px, không lệch) — "phát sáng".
   - emoji  : emoji màu trong nút/tiêu đề/nhãn (Windows vẽ thành icon 3D bóng).
   - longTask: tổng thời gian tác vụ dài (>50 ms) trên luồng chính lúc mở trang.
   Không gọi Firebase/Google thật: mọi request tới googleapis/gstatic/firebase bị chặn.

   Chạy:  node ui-audit.mjs [tên trang ...]   (in bảng; --strict: thoát mã 1 nếu còn vi phạm)
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { startServer } from './server.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const PAGES = [
  'index.html', 'login.html', 'arena.html', 'quiz-shelf.html', 'portfolio.html', 'thi-dua.html', 'goi-ten.html',
  'battle-quiz.html', 'memory-game.html', 'cyber-detective.html', 'computer-simulator.html', 'mario-flappy.html',
  'pz-defense.html', 'live-quiz.html', 'teacher-dashboard.html', 'coordinator-dashboard.html', 'ic3-dashboard.html',
  'diem-danh.html', 'so-dau-bai.html', 'teaching-schedule.html', 'tai-lieu-nam-hoc.html', 'roster-manager.html',
  'admin-users.html', 'admin-schools.html', 'image-manager.html', 'gom-ket-qua.html', 'hotspot-editor.html',
  'app/', 'app/#/techrealm',
];
const args = process.argv.slice(2);
const strict = args.includes('--strict');
const only = args.filter((a) => !a.startsWith('-'));
const list = only.length ? PAGES.filter((p) => only.some((o) => p.includes(o))) : PAGES;

const chrome = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium']
  .filter(Boolean).find((p) => fs.existsSync(p));
const { server, base } = await startServer(ROOT);
const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });

const PROFILE = { uid: 'u1', role: 'admin', displayName: 'Cô Test', schoolId: 's1', email: 'test@example.test', status: 'active' };

function probe() {
  const vis = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4 || r.bottom < 0 || r.top > innerHeight * 3) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0.05;
  };
  const name = (el) => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') +
    (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '');
  const out = { grad: [], anim: [], blur: [], glow: [], emoji: [] };
  // Ngoại lệ CÓ LÝ DO (không phải "kiểu AI"):
  // - nút đổi giao diện: hình mặt trời/mặt trăng nhỏ vẽ bằng CSS;
  // - gradient chỉ 1 màu (var(--gradient-hero) = tím đặc) hoặc chỉ gồm điểm dừng CẮT CỨNG (vạch 3 màu thương hiệu);
  // - cảnh trò chơi / tranh (kệ sách quiz-shelf, nhân vật Gọi tên): hiệu ứng trong cảnh được giữ (đã chốt 15–16/11/2026).
  const SKIP = '.theme-toggle, .theme-toggle-quick, .experience, .np-stage, .np-scene, .np-sp, .np-hint-pill, [class*="np-"]';
  const smooth = (bg) => {
    const g = bg.match(/gradient\((.*)\)/); if (!g) return false;
    const cols = new Set((g[1].match(/rgba?\([^)]*\)|#[0-9a-f]{3,8}/gi) || []).map((c) => c.replace(/\s/g, '')));
    if (cols.size < 2) return false;
    // Cắt cứng: giữa 2 điểm dừng KHÁC màu luôn cùng vị trí (Chrome tách "màu a% b%" thành 2 điểm dừng).
    const stops = [...g[1].matchAll(/(rgba?\([^)]*\)|#[0-9a-f]{3,8})\s+([\d.]+)%/gi)].map((m) => [m[1].replace(/\s/g, ''), +m[2]]);
    if (stops.length < 2) return true;
    return stops.some((st, i) => i > 0 && st[0] !== stops[i - 1][0] && st[1] !== stops[i - 1][1]);
  };
  const EMO = /\p{Extended_Pictographic}/u;
  for (const el of document.querySelectorAll('body *')) {
    if (el.closest('svg, canvas, [data-art], .np-art, .arena-map, .map-scene')) continue;
    if (el.closest(SKIP)) continue;
    if (!vis(el)) continue;
    const cs = getComputedStyle(el);
    if (smooth(cs.backgroundImage)) out.grad.push(name(el));
    for (const ps of ['::before', '::after']) {
      const pc = getComputedStyle(el, ps);
      if (pc.content === 'none' || pc.content === 'normal' || pc.display === 'none' || +pc.opacity < 0.05) continue;
      // Gradient lớn (nền trang trí). Bỏ qua icon nhỏ (mặt trời/mặt trăng nút giao diện ≤ 40px).
      if (smooth(pc.backgroundImage) && el.getBoundingClientRect().width > 40) out.grad.push(name(el) + ps);
      if (/blur\(/.test(pc.filter) && el.getBoundingClientRect().width > 40) out.blur.push(name(el) + ps + ' (filter)');
    }
    if (/blur\(/.test(cs.filter) && el.getBoundingClientRect().width > 200) out.blur.push(name(el) + ' (filter)');
    if (cs.backdropFilter && cs.backdropFilter !== 'none') out.blur.push(name(el));
    const glowRe = /rgba?\([^)]*\)\s+0px\s+0px\s+(1[2-9]|[2-9]\d|\d{3})px/;
    if ((cs.textShadow !== 'none' && glowRe.test(cs.textShadow)) || (cs.boxShadow !== 'none' && glowRe.test(cs.boxShadow))) out.glow.push(name(el));
    if (/^(button|a|h1|h2|h3|h4|label|summary|th)$/i.test(el.tagName) || el.getAttribute('role') === 'button' || el.classList.contains('btn')) {
      const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('');
      if (EMO.test(own)) out.emoji.push(name(el) + ' «' + own.trim().slice(0, 24) + '»');
    }
  }
  for (const a of document.getAnimations()) {
    const t = a.effect?.getComputedTiming?.();
    const el = a.effect?.target;
    if (t && t.iterations === Infinity && a.playState === 'running' && el && el.isConnected && vis(el) && !el.closest('svg, canvas') && !el.closest(SKIP)) {
      out.anim.push(name(el) + ' (' + (a.animationName || 'anim') + ')');
    }
  }
  return out;
}

const rows = [];
for (const pg of list) {
  const ctx = await browser.createBrowserContext();
  const p = await ctx.newPage();
  await p.setViewport({ width: 1366, height: 768 });
  await p.setBypassServiceWorker(true);
  await p.setRequestInterception(true);
  p.on('request', (r) => {
    const u = r.url();
    if (u === base + 'js/auth.js') {
      return r.respond({ status: 200, contentType: 'text/javascript', body: `window.EduAuth = { ROLE_LABEL: {}, logoutUser: async () => {},
        onAuthReady(cb) { setTimeout(() => cb({ uid: 'u1', email: 'test@example.test' }, ${JSON.stringify(PROFILE)}), 50); } };` });
    }
    // Firebase giả: mọi lời gọi trả lỗi "offline" → trang hiện khung + thông báo lỗi, không đọc Firestore thật.
    if (u === base + 'js/firebase-config.js') {
      return r.respond({ status: 200, contentType: 'text/javascript', body: `(function(){
        const fail = () => Promise.reject(Object.assign(new Error('offline (ui-audit)'), { code: 'unavailable' }));
        const any = new Proxy(function(){}, { get: (t, k) => k === 'then' ? undefined : (k === 'get' || k === 'getDocs' ? fail : any), apply: () => any });
        window.EduFirebase = new Proxy({}, { get: (t, k) => any });
        window.firebase = any; })();` });
    }
    if (!u.startsWith(base) &&!u.startsWith('data:') && !u.startsWith('blob:')) return r.abort();
    r.continue();
  });
  await p.evaluateOnNewDocument(() => {
    window.__lt = 0;
    try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt += e.duration - 50; }).observe({ type: 'longtask', buffered: true }); } catch {}
  });
  let res = null;
  try {
    await p.goto(base + pg, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise((r) => setTimeout(r, 1500));
    // Trang nhân sự: đợi qua màn "Đang kiểm tra đăng nhập" (có hoãn chống F5).
    const guarded = await p.evaluate(() => !!document.getElementById('edu-guard-overlay'));
    if (guarded) {
      await p.waitForFunction(() => { const o = document.getElementById('edu-guard-overlay'); return !o || !o.isConnected || getComputedStyle(o).display === 'none'; }, { timeout: 10000 }).catch(() => {});
      await new Promise((r) => setTimeout(r, 1500));
      res = { guard: await p.evaluate(() => !!document.getElementById('edu-guard-overlay')?.isConnected) };
    }
    res = { ...(await p.evaluate(probe)), ...(res || {}) };
    res.longTask = Math.round(await p.evaluate(() => window.__lt));
  } catch (e) { res = { error: String(e.message).slice(0, 80) }; }
  rows.push([pg, res]);
  await ctx.close();
}
await browser.close();
server.close();

let bad = 0;
for (const [pg, r] of rows) {
  if (r.error) { console.log(`✗ ${pg}: ${r.error}`); bad++; continue; }
  const n = r.grad.length + r.anim.length + r.blur.length + r.glow.length + r.emoji.length;
  bad += n;
  console.log(`${n ? '•' : '✓'} ${pg.padEnd(28)} grad ${r.grad.length} · anim ${r.anim.length} · blur ${r.blur.length} · glow ${r.glow.length} · emoji ${r.emoji.length} · longTask ${r.longTask} ms${r.guard ? ' · (kẹt màn đăng nhập)' : ''}`);
  if (n && !process.env.QUIET) for (const k of ['grad', 'anim', 'blur', 'glow', 'emoji']) {
    const uniq = [...new Set(r[k])];
    if (uniq.length) console.log(`    ${k}: ${uniq.slice(0, 8).join(' | ')}${uniq.length > 8 ? ` …(+${uniq.length - 8})` : ''}`);
  }
}
if (strict && bad) process.exit(1);
