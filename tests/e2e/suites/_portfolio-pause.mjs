// Portfolio: feed/chứng chỉ nghe realtime nhưng TẠM NGẮT khi tab ẩn > 60 giây, nghe lại khi hiện (js/portfolio.js § liveQuery).
// Firebase giả đếm số lần đăng ký/huỷ nghe — không request nào tới Firebase thật.
export async function portfolioPause({ base, page, check }) {
  const p = await page({ width: 1280, height: 800 });
  await p.setRequestInterception(true);
  p.on('request', (r) => {
    if (r.isInterceptResolutionHandled()) return;
    const u = r.url();
    if (u === base + 'js/services/firebase-loader.js') {
      return r.respond({ status: 200, contentType: 'text/javascript', body: `(function(){
        const snap = { empty: true, docs: [], size: 0, exists: false, forEach() {}, data: () => ({}), docChanges: () => [] };
        const chain = new Proxy(function(){}, {
          get(t, k) {
            if (k === 'then') return undefined;
            if (k === 'onSnapshot') return (next) => { window.__subs = (window.__subs || 0) + 1; setTimeout(() => next(snap), 0); return () => { window.__unsubs = (window.__unsubs || 0) + 1; }; };
            if (k === 'get') return () => Promise.resolve(snap);
            return chain;
          },
          apply() { return chain; },
        });
        window.EduFirebaseLoader = {
          ensure() { window.EduFirebase = { db: chain, auth: chain }; window.firebase = chain; return Promise.resolve(window.EduFirebase); },
          hasStoredSession: () => Promise.resolve(false), newDocId: () => 'x'.repeat(20) };
      })();` });
    }
    if (u === base + 'js/auth.js') {
      return r.respond({ status: 200, contentType: 'text/javascript', body: 'window.EduAuth = { ROLE_LABEL: {}, onAuthReady(cb) { setTimeout(() => cb(null, null), 0); }, logoutUser: async () => {} };' });
    }
    if (!u.startsWith(base)) return r.abort();
    r.continue();
  });
  await p.evaluateOnNewDocument(() => {
    // Rút 60 giây xuống 80 ms; điều khiển trạng thái ẩn/hiện của tab.
    const st = window.setTimeout;
    window.setTimeout = (fn, ms, ...a) => st(fn, ms === 60e3 ? 80 : ms, ...a);
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => window.__vis || 'visible' });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => window.__vis === 'hidden' });
  });
  await p.goto(base + 'portfolio.html', { waitUntil: 'networkidle0' });
  await p.evaluate(() => document.querySelector('.gv-social-gate button')?.click());
  await new Promise((r) => setTimeout(r, 600));
  const subs0 = await p.evaluate(() => window.__subs || 0);
  const setVis = (v) => p.evaluate((x) => { window.__vis = x; document.dispatchEvent(new Event('visibilitychange')); }, v);
  await setVis('hidden');
  await new Promise((r) => setTimeout(r, 30));
  await setVis('visible'); // ẩn rất ngắn (chuyển tab rồi quay lại ngay) → KHÔNG ngắt
  await new Promise((r) => setTimeout(r, 200));
  const brief = await p.evaluate(() => ({ subs: window.__subs || 0, unsubs: window.__unsubs || 0 }));
  await setVis('hidden');
  await new Promise((r) => setTimeout(r, 300));
  const hidden = await p.evaluate(() => ({ subs: window.__subs || 0, unsubs: window.__unsubs || 0 }));
  await setVis('visible');
  await new Promise((r) => setTimeout(r, 100));
  const back = await p.evaluate(() => ({ subs: window.__subs || 0, unsubs: window.__unsubs || 0 }));
  check('portfolio: bấm "Xem bài đăng" → nghe feed + chứng chỉ (≥ 3 truy vấn)', subs0 >= 3, { subs0 });
  check('portfolio: ẩn tab rất ngắn → không ngắt, không nghe lại', brief.subs === subs0 && brief.unsubs === 0, brief);
  check('portfolio: ẩn tab lâu → ngắt mọi truy vấn đang nghe (0 lượt đọc khi người khác thích/bình luận)', hidden.unsubs === subs0, hidden);
  check('portfolio: hiện lại → nghe lại đúng số truy vấn, không nhân đôi', back.subs === subs0 * 2 && back.unsubs === subs0, back);
  check('portfolio: không lỗi JS', !p.errors.length, p.errors);
  await p.closeAll();
}
