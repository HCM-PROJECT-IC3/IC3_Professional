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

   Đổi CACHE_VERSION khi muốn xoá sạch bản lưu cũ trên mọi máy.
   ============================================================ */
const CACHE_VERSION = 'v1';
const PAGES = `eduquiz-pages-${CACHE_VERSION}`;
const ASSETS = `eduquiz-assets-${CACHE_VERSION}`;
const NET_TIMEOUT_MS = 4000;      // trang HTML
const SUB_TIMEOUT_MS = 2500;      // CSS/JS/JSON (đã có bản lưu thì không chờ lâu)
const MAX_ASSETS = 400;
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
