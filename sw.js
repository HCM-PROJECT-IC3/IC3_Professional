/* ============================================================
   sw.js — Service Worker: chống lag / mất mạng chập chờn ở trường.

   CHỈ xử lý request GET CÙNG TÊN MIỀN (file tĩnh của chính web). Mọi
   request Firebase / Google Sheet / CDN (khác tên miền) đi thẳng mạng,
   SW không chạm tới → không ảnh hưởng dữ liệu, không thêm lượt Firebase.

   • HTML / JS / CSS / JSON (câu hỏi data/ic3...): MẠNG TRƯỚC. Mạng trả
     lời chậm quá NET_TIMEOUT_MS hoặc mất mạng → dùng bản đã lưu (nếu có),
     vẫn để request mạng chạy tiếp để cập nhật bản lưu. Bản deploy mới
     tới ngay khi mạng bình thường — không kẹt bản cũ.
   • Ảnh / font tĩnh: hiện NGAY từ bản lưu, cập nhật ngầm (stale-while-
     revalidate); tối đa MAX_ASSETS file để không phình bộ nhớ máy trường.
   • VERSION / sw.js: luôn đi mạng (không lưu).

   • TẢI SẴN THEO YÊU CẦU (offline-first): trang gửi message
     { type: 'PRECACHE', urls: [...] } (js/offline-pack.js, nút "Tải sẵn để
     dùng offline" ở sảnh). SW tải từng file CÙNG TÊN MIỀN vào đúng kho
     (HTML/JS/CSS/JSON → PAGES, ảnh/font → ASSETS), báo tiến độ qua message
     { type: 'PRECACHE_PROGRESS' | 'PRECACHE_DONE', done, total, failed }.
     Chỉ nhận đường dẫn cùng tên miền, tối đa MAX_PRECACHE file/lần.

   Đổi CACHE_VERSION khi muốn xoá sạch bản lưu cũ trên mọi máy.
   ============================================================ */
const CACHE_VERSION = 'v2';
const PAGES = `eduquiz-pages-${CACHE_VERSION}`;
const ASSETS = `eduquiz-assets-${CACHE_VERSION}`;
const NET_TIMEOUT_MS = 4000;      // trang HTML
const SUB_TIMEOUT_MS = 2500;      // CSS/JS/JSON (đã có bản lưu thì không chờ lâu)
const MAX_ASSETS = 600;           // đủ chứa ảnh của 1 khối câu hỏi đã tải sẵn
const MAX_PRECACHE = 1500;        // trần số file mỗi lần tải sẵn
const ASSET_RE = /\.(png|jpe?g|webp|gif|svg|ico|woff2?|ttf|mp3|wav|ogg)$/i;
const NEVER_RE = /(^|\/)(VERSION|sw\.js)$/;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = new Set([PAGES, ASSETS]);
    for (const key of await caches.keys()) {
      if (key.startsWith('eduquiz-') && !keep.has(key)) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;       // Firebase, Google, CDN: không đụng
  if (NEVER_RE.test(url.pathname)) return;
  if (req.headers.has('range')) return;                   // media cắt đoạn: để trình duyệt tự lo
  if (ASSET_RE.test(url.pathname)) event.respondWith(staleWhileRevalidate(event, req));
  else event.respondWith(networkFirst(event, req));
});

function cacheable(res) { return res && res.ok && res.type === 'basic'; }

async function networkFirst(event, req) {
  const cache = await caches.open(PAGES);
  // Bỏ query khi tra bản lưu (vd index.html?de=… vẫn dùng được bản index.html đã lưu).
  const cacheKey = req.mode === 'navigate' ? new Request(new URL(req.url).pathname) : req;
  const network = fetch(req).then((res) => {
    if (cacheable(res)) event.waitUntil(cache.put(cacheKey, res.clone()).catch(() => {}));
    return res;
  });
  const wait = req.mode === 'navigate' ? NET_TIMEOUT_MS : SUB_TIMEOUT_MS;
  const timeout = new Promise((resolve) => setTimeout(resolve, wait, 'timeout'));
  try {
    const first = await Promise.race([network, timeout]);
    if (first !== 'timeout') return first;
    const cached = await cache.match(cacheKey);
    if (cached) { event.waitUntil(network.catch(() => {})); return cached; }
    return await network;                                  // chưa có bản lưu → chờ mạng tiếp
  } catch (err) {
    const cached = await cache.match(cacheKey, { ignoreSearch: req.mode === 'navigate' });
    if (cached) return cached;
    throw err;
  }
}

async function staleWhileRevalidate(event, req) {
  const cache = await caches.open(ASSETS);
  const cached = await cache.match(req);
  const network = fetch(req).then(async (res) => {
    if (cacheable(res)) { await cache.put(req, res.clone()); trim(cache); }
    return res;
  });
  if (cached) { event.waitUntil(network.catch(() => {})); return cached; }
  return network;
}

async function trim(cache) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - MAX_ASSETS; i++) await cache.delete(keys[i]);
}

/* ── Tải sẵn theo yêu cầu ─────────────────────────────────────────────
   Khóa lưu phải GIỐNG hệt khóa mà networkFirst/staleWhileRevalidate dùng khi
   tra bản lưu: trang HTML → Request(pathname) (bỏ query), file khác → URL đầy đủ. */
self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || data.type !== 'PRECACHE' || !Array.isArray(data.urls)) return;
  event.waitUntil(precache(data.urls, event.source));
});

function normalizeUrls(list) {
  const seen = new Set();
  const out = [];
  for (const raw of list) {
    if (typeof raw !== 'string') continue;
    let u;
    try { u = new URL(raw, self.location.href); } catch (e) { continue; }
    if (u.origin !== self.location.origin) continue;       // chỉ file của chính web
    if (NEVER_RE.test(u.pathname)) continue;
    u.hash = '';
    if (seen.has(u.href)) continue;
    seen.add(u.href);
    out.push(u);
    if (out.length >= MAX_PRECACHE) break;
  }
  return out;
}

async function precache(list, client) {
  const urls = normalizeUrls(list);
  const total = urls.length;
  let done = 0, failed = 0;
  const say = (type) => { try { client && client.postMessage({ type, done, total, failed }); } catch (e) { /* trang đã đóng */ } };
  const pages = await caches.open(PAGES);
  const assets = await caches.open(ASSETS);
  say('PRECACHE_PROGRESS');
  let next = 0;
  async function worker() {
    while (next < total) {
      const u = urls[next++];
      try {
        const res = await fetch(u.href, { cache: 'reload' });
        if (!cacheable(res)) throw new Error('HTTP ' + res.status);
        if (ASSET_RE.test(u.pathname)) await assets.put(u.href, res);
        else if (/\.html?$/i.test(u.pathname) || u.pathname.endsWith('/')) await pages.put(new Request(u.pathname), res);
        else await pages.put(u.href, res);
      } catch (e) { failed++; }
      done++;
      if (done % 5 === 0 || done === total) say('PRECACHE_PROGRESS');
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()]);   // 4 luồng: đủ nhanh, không nghẽn mạng trường
  say('PRECACHE_DONE');
}
