/* Máy chủ trường (Docker) cho cả dự án — chỉ dùng Node có sẵn, không cần cài gói.
     node server/server.js                 (cổng 8080)
     docker compose up -d --build          (xem docker-compose.yml ở thư mục gốc)

   - Phát toàn bộ trang web (như GitHub Pages) qua mạng LAN của trường, có nén gzip:
     học sinh trong trường không tốn băng thông GitHub Pages.
   - /mos/...  → máy chủ phòng máy MOS (mos/server.js): tệp đề nặng + Office mở/lưu bài qua WebDAV.
     Tệp đề Word/PowerPoint KHÔNG nằm trên git — gắn thư mục mos/files từ máy chủ vào container.
   - /api/gas  → hàng đợi bài nộp (server/relay.js): ghi ra đĩa, gửi Apps Script theo lô.
   - Tự cập nhật trang từ GitHub (server/sync.js): chỉ tải tệp đã đổi vào DATA_DIR/site, phát
     tệp ở đó trước tệp trong ảnh → admin đẩy câu hỏi mới là máy chủ trường có, không build lại.
   - /api/status → tình trạng hàng đợi bài nộp + đồng bộ GitHub (chỉ số đếm, không có dữ liệu học sinh).
   - Khi phát js/backend-config.js và mos/js/config.js, nối thêm vài dòng cho trang biết đang chạy
     trên máy chủ trường (gửi bài qua /api/gas, PeerServer riêng cho Phòng cả lớp nếu có).
     Trên GitHub Pages các tệp đó giữ nguyên → trang chạy y như cũ.
   Biến môi trường: xem docker-compose.yml. */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { createRelay } = require('./relay');
const { createSync } = require('./sync');

const ROOT = path.resolve(process.env.SITE_ROOT || path.join(__dirname, '..'));
const PORT = +process.env.PORT || 8080;
const PEER_PORT = +process.env.PEER_PUBLIC_PORT || 0;
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'server-data'));
const OVERLAY = path.join(DATA_DIR, 'site'); // tệp mới hơn ảnh, tải từ GitHub (server/sync.js)

let mos = null;
try { mos = require(path.join(ROOT, 'mos', 'server.js')); } catch (e) { console.warn('Không nạp được mos/server.js:', e.message); }

const relay = createRelay({
  dir: DATA_DIR,
  token: process.env.GAS_RELAY_TOKEN || '',
  batch: +process.env.GAS_BATCH || 50,
  flushSec: +process.env.GAS_FLUSH_SEC || 15,
  ratePerMin: +process.env.RELAY_RATE_PER_MIN || 120,
});

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8', '.csv': 'text/csv; charset=utf-8', '.pdf': 'application/pdf',
  '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.webm': 'video/webm', '.xml': 'application/xml; charset=utf-8',
};
const COMPRESS = /^(text\/|application\/(json|javascript|manifest\+json|xml)|image\/svg)/;
// Mã máy chủ, mã Apps Script, công cụ, dữ liệu hàng đợi: không phát ra ngoài.
const PRIVATE = /^\/(\.|server\/|server-data\/|apps\/|scripts\/|docs\/|node_modules\/|Dockerfile|docker-compose|firestore\.|firebase\.json|mos\/(server\.js|tools\/|work\/|Dockerfile|docker-compose))|\/__tests__\/|\/\./;

const sync = createSync({
  repo: process.env.SITE_SYNC_REPO || '',
  branch: process.env.SITE_SYNC_BRANCH || 'main',
  minutes: process.env.SITE_SYNC_MIN === undefined ? 10 : +process.env.SITE_SYNC_MIN,
  token: process.env.SITE_SYNC_TOKEN || '',
  root: ROOT,
  overlay: OVERLAY,
  // Tệp đề MOS lấy từ thư mục gắn vào (mos/files) — không đồng bộ.
  isPublic: url => !PRIVATE.test(url) && !url.startsWith('/mos/files/'),
});

// Nối vào cuối tệp cấu hình khi phát từ máy chủ trường (GitHub Pages không có đoạn này).
function configTail(rel) {
  if (rel === '/js/backend-config.js') {
    const peer = PEER_PORT
      ? `B.arenaRoom = B.arenaRoom || {}; B.arenaRoom.peer = { host: location.hostname, port: ${PEER_PORT}, path: '/', secure: location.protocol === 'https:' };`
      : '';
    return `\n;(function () { var B = window.EduBackend; if (!B) return; // thêm bởi máy chủ trường (server/server.js)
  B.schoolServer = { relayUrl: '/api/gas' }; ${peer}
})();\n`;
  }
  if (rel === '/mos/js/config.js') return `\n;if (window.MosConfig) window.MosConfig.relayUrl = '/api/gas'; // thêm bởi máy chủ trường\n`;
  return '';
}

const gzCache = new Map(); // tệp tĩnh đã nén: path → { key, buf }

function send(res, code, headers, body) { res.writeHead(code, headers); res.end(body); }
function json(res, code, obj) {
  send(res, code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' }, JSON.stringify(obj));
}
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const parts = [];
    let size = 0;
    req.on('data', d => { size += d.length; if (size > limit) { reject(Object.assign(new Error('too large'), { status: 413 })); req.destroy(); } else parts.push(d); });
    req.on('end', () => resolve(Buffer.concat(parts).toString('utf8')));
    req.on('error', reject);
  });
}

const statFile = f => { try { const st = fs.statSync(f); return st.isFile() ? st : null; } catch (e) { return null; } };
const isDir = f => { try { return fs.statSync(f).isDirectory(); } catch (e) { return false; } };

/** Tệp cần phát cho đường dẫn: bản phủ (GitHub mới hơn) trước, rồi bản trong ảnh. */
function locate(rel) {
  for (const base of [OVERLAY, ROOT]) {
    const file = path.join(base, rel);
    const r = path.relative(base, file);
    if (r.startsWith('..') || path.isAbsolute(r)) return { forbidden: true };
    if (rel.endsWith('/')) {
      const idx = path.join(file, 'index.html');
      const st = statFile(idx);
      if (st) return { file: idx, st };
    } else {
      const st = statFile(file);
      if (st) return { file, st };
      if (isDir(file)) return { redirect: rel + '/' };
    }
  }
  return {};
}

function serveStatic(req, res, rel) {
  const found = locate(rel);
  if (found.forbidden) return send(res, 403, {}, '');
  if (found.redirect) return send(res, 301, { Location: found.redirect }, '');
  const { file, st } = found;
  if (!file) return send(res, 404, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Không có trang này.');
  const type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
  const tail = configTail(rel);
  const etag = `"${st.size.toString(36)}-${Math.floor(st.mtimeMs).toString(36)}${tail ? '-s' : ''}"`;
  const headers = {
    'Content-Type': type, 'ETag': etag, 'Last-Modified': st.mtime.toUTCString(), 'Vary': 'Accept-Encoding',
    // Như GitHub Pages: mã/trang hỏi lại mỗi lần (304 rất nhẹ), ảnh/phông giữ 1 ngày.
    'Cache-Control': /\.(html|js|mjs|css|json|webmanifest)$/.test(file) ? 'no-cache' : 'public, max-age=86400',
  };
  if (path.basename(file) === 'sw.js') headers['Service-Worker-Allowed'] = '/';
  if (req.headers['if-none-match'] === etag) return send(res, 304, headers, '');
  const gzip = COMPRESS.test(type) && /\bgzip\b/.test(req.headers['accept-encoding'] || '') && st.size > 1024 && st.size < 20 * 1024 * 1024;
  if (!gzip && !tail) {
    headers['Content-Length'] = st.size;
    res.writeHead(200, headers);
    if (req.method === 'HEAD') return res.end();
    return fs.createReadStream(file).pipe(res);
  }
  let body;
  const hit = gzCache.get(file);
  if (gzip && hit && hit.key === etag) body = hit.buf;
  else {
    body = Buffer.concat([fs.readFileSync(file), Buffer.from(tail)]);
    if (gzip) {
      body = zlib.gzipSync(body, { level: 9 });
      gzCache.set(file, { key: etag, buf: body });
    }
  }
  if (gzip) headers['Content-Encoding'] = 'gzip';
  headers['Content-Length'] = body.length;
  send(res, 200, headers, req.method === 'HEAD' ? '' : body);
}

async function handle(req, res) {
  let url;
  try { url = decodeURIComponent(req.url.split('?')[0]); } catch (e) { return send(res, 400, {}, ''); }
  try {
    if (url === '/api/gas') {
      if (req.method === 'OPTIONS') return send(res, 204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type' }, '');
      if (req.method !== 'POST') return json(res, 405, { ok: false, code: 'not-found', error: 'Chỉ nhận POST' });
      let raw;
      try { raw = await readBody(req, 64 * 1024); } catch (e) { return json(res, e.status || 400, { ok: false, code: 'invalid-argument', error: 'Bài nộp quá lớn' }); }
      const r = relay.accept(raw, req.socket.remoteAddress || '');
      return json(res, r.status, r.body);
    }
    if (url === '/api/gas/status') return json(res, 200, relay.status());
    if (url === '/api/status') return json(res, 200, { submissions: relay.status(), siteSync: sync.status() });
    if (url === '/api/health') return json(res, 200, { ok: true, server: 'ic3-school', mos: !!mos });

    // MOS: API ở /mos/api/..., bản làm bài (WebDAV cho Office) ở /work/... như máy chủ MOS riêng.
    // Trang + tệp đề MOS phát như mọi tệp tĩnh khác (có nén, có bản cập nhật từ GitHub).
    if (mos && (url.startsWith('/mos/api/') || (url.startsWith('/mos/') && req.method !== 'GET' && req.method !== 'HEAD'))) {
      req.url = req.url.slice(4);
      return await mos.handle(req, res);
    }
    if (mos && (url.startsWith('/work/') || req.method === 'OPTIONS')) return await mos.handle(req, res);

    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, {}, '');
    if (PRIVATE.test(url)) return send(res, 404, {}, '');
    serveStatic(req, res, url);
  } catch (e) {
    console.error(req.method, url, e);
    if (!res.headersSent) send(res, 500, {}, '');
  }
}

const server = http.createServer(handle);

if (require.main === module) {
  if (mos) {
    fs.mkdirSync(mos.WORK, { recursive: true });
    mos.cleanup();
    setInterval(mos.cleanup, 6 * 3600000).unref();
  }
  relay.start();
  sync.start();
  server.listen(PORT, () => {
    const ips = Object.values(require('os').networkInterfaces()).flat().filter(i => i.family === 'IPv4' && !i.internal).map(i => i.address);
    console.log(`Máy chủ trường IC3 đang chạy: http://localhost:${PORT}`);
    ips.forEach(ip => console.log(`  Học sinh mở: http://${ip}:${PORT}   (MOS: http://${ip}:${PORT}/mos/)`));
    console.log(relay.status().batchMode ? '  Bài nộp: gửi Apps Script theo lô (RELAY_TOKEN).' : '  Bài nộp: gửi Apps Script từng bài (chưa đặt GAS_RELAY_TOKEN).');
  });
  const stop = () => { server.close(); relay.stop().finally(() => process.exit(0)); setTimeout(() => process.exit(0), 5000).unref(); };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

module.exports = { server, handle, relay, sync };
