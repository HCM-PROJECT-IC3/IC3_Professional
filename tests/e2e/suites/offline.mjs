// Offline / PWA: sau khi mở 1 lần lúc có mạng, TẮT HẲN máy chủ (mất mạng thật, cả service worker cũng không với tới)
// rồi mở lại → trang vẫn chạy nhờ sw.js (network-first + bản lưu).
//  A. Máy CHỈ từng mở app 2.0 (/app/) — app phải tự đăng ký sw.js.
//  B. Máy mở sảnh cũ trước (đăng ký sw.js) rồi mới mở /app/.
import { startServer } from '../server.mjs';

async function scenario({ browser, root, check }, label, warmup) {
  const { server, base } = await startServer(root); // máy chủ RIÊNG để tắt được
  const bc = await browser.createBrowserContext();
  const p = await bc.newPage();
  await p.setViewport({ width: 1280, height: 800 });
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  try {
    await p.goto(base + 'app/', { waitUntil: 'networkidle0' });
    await p.evaluate(() => { localStorage.setItem('ic3v2.previewRole', 'guest'); localStorage.setItem('ic3v2.pathLevel', 'Spark|LV1'); });
    for (const url of warmup) {
      await p.goto(base + url, { waitUntil: 'networkidle0' });
    }
    // chờ service worker kiểm soát trang, rồi mở lại để các file đi qua sw.js và được lưu
    await p.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, { timeout: 15000 }).catch(() => {});
    const controlled = await p.evaluate(() => !!navigator.serviceWorker?.controller);
    if (warmup.includes('index.html')) {
      // sảnh cũ đăng ký 'sw.js' scope './', app đăng ký '../sw.js' scope '../' → phải là CÙNG 1 bản đăng ký
      await p.goto(base + 'app/', { waitUntil: 'networkidle0' });
      await new Promise((r) => setTimeout(r, 500));
      const regs = await p.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).map((r) => r.scope));
      check(`${label}: sảnh cũ + app 2.0 dùng CHUNG 1 service worker (phạm vi gốc)`, regs.length === 1 && regs[0] === base, regs);
    }
    await p.goto(base + 'app/#/lo-trinh', { waitUntil: 'networkidle0' });
    await p.reload({ waitUntil: 'networkidle0' });
    await new Promise((r) => setTimeout(r, 800));

    await new Promise((r) => { server.closeAllConnections?.(); server.close(r); }); // MẤT MẠNG
    let rendered = false;
    try {
      await p.reload({ waitUntil: 'load', timeout: 20000 });
      await p.waitForFunction(() => /Lộ trình học/.test(document.querySelector('main')?.innerText || '') && document.querySelector('main li'), { timeout: 15000 });
      rendered = true;
    } catch { /* không mở được khi mất mạng */ }
    check(`${label}: sw.js kiểm soát trang`, controlled);
    check(`${label}: mất mạng → mở lại /app/#/lo-trinh vẫn chạy (cả mục lục đề)`, rendered, { errs });
  } finally {
    server.close();
    await bc.close();
  }
}

export default async function (ctx) {
  await scenario(ctx, 'A. chỉ mở app 2.0', ['app/#/lo-trinh']);
  await scenario(ctx, 'B. mở sảnh cũ trước', ['index.html', 'app/#/lo-trinh']);
}
