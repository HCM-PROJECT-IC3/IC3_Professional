/* Máy chủ phòng máy cho trang Ôn luyện MOS — chỉ dùng Node có sẵn, không cần cài gói.
     node mos/server.js            (cổng 8080)      PORT=9000 node mos/server.js
   - Phát trang + tệp đề như máy chủ tĩnh.
   - Bản làm bài riêng của từng học sinh ở work/<sid>/<slot>/<tệp>, mở/lưu thẳng bằng Office qua WebDAV:
     trình duyệt gọi ms-excel:ofe|u|http://<máy chủ>/work/... → Office mở tệp → Ctrl+S gửi PUT về đây
     → trang thấy tệp đổi và chấm ngay trên trình duyệt (máy chủ không chấm, không lưu điểm).
   - Bản làm bài không ai đụng tới sau WORK_DAYS ngày thì tự xoá. */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const FILES = path.join(ROOT, 'files');
const WORK = process.env.MOS_WORK || path.join(ROOT, 'work');
const PORT = +process.env.PORT || 8080;
const WORK_DAYS = +process.env.MOS_WORK_DAYS || 3;
const MAX_PUT = 200 * 1024 * 1024;

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.txt': 'text/plain; charset=utf-8', '.csv': 'text/csv; charset=utf-8', '.pdf': 'application/pdf',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.wmv': 'video/x-ms-wmv', '.glb': 'model/gltf-binary',
};
const DAV = { 'DAV': '1,2', 'MS-Author-Via': 'DAV', 'Allow': 'OPTIONS, GET, HEAD, PUT, PROPFIND, PROPPATCH, LOCK, UNLOCK' };
// Không cho phát mã máy chủ, công cụ, bài mẫu.
const PRIVATE = /^\/(server\.js|tools\/|work\/\.|node_modules\/|Dockerfile|docker-compose)/;

const inside = (base, p) => { const r = path.relative(base, p); return r && !r.startsWith('..') && !path.isAbsolute(r); };
const esc = s => String(s).replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));

function send(res, code, headers, body) {
  res.writeHead(code, headers);
  res.end(body);
}
function json(res, code, obj) {
  send(res, code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, JSON.stringify(obj));
}
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const parts = [];
    let size = 0;
    req.on('data', d => { size += d.length; if (size > limit) { reject(Object.assign(new Error('too large'), { code: 413 })); req.destroy(); } else parts.push(d); });
    req.on('end', () => resolve(Buffer.concat(parts)));
    req.on('error', reject);
  });
}

function serveFile(req, res, file, extra) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, extra || {}, '');
    const headers = Object.assign({
      'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': st.size, 'Last-Modified': st.mtime.toUTCString(), 'ETag': `"${st.size.toString(36)}-${st.mtimeMs.toString(36)}"`,
      'Cache-Control': file.startsWith(WORK) ? 'no-store' : /\.(json|js|css|html)$/.test(file) ? 'no-cache' : 'public, max-age=86400',
    }, extra || {});
    if (req.headers['if-none-match'] === headers.ETag) return send(res, 304, headers, '');
    res.writeHead(200, headers);
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

// ---------------------------------------------------------------- API: tạo bản làm bài

async function apiWork(req, res) {
  let body;
  try { body = JSON.parse((await readBody(req, 4096)).toString('utf8')); } catch (e) { return json(res, 400, { error: 'Dữ liệu không hợp lệ' }); }
  const { sid, slot, file, reset } = body || {};
  if (!/^[a-z0-9]{8,40}$/i.test(sid || '') || !/^[a-z0-9-]{1,100}$/i.test(slot || '')) return json(res, 400, { error: 'Mã phiên không hợp lệ' });
  const src = path.join(ROOT, String(file || ''));
  if (!inside(FILES, src) || !fs.existsSync(src)) return json(res, 404, { error: 'Không có tệp đề này trên máy chủ' });
  const dir = path.join(WORK, sid, slot);
  const dest = path.join(dir, path.basename(src));
  fs.mkdirSync(dir, { recursive: true });
  if (reset || !fs.existsSync(dest)) fs.copyFileSync(src, dest);
  fs.utimesSync(dir, new Date(), new Date());
  const url = '/work/' + [sid, slot, path.basename(src)].map(encodeURIComponent).join('/');
  json(res, 200, { url, mtime: fs.statSync(dest).mtimeMs });
}

// ---------------------------------------------------------------- WebDAV tối thiểu cho Office (đã thử với Excel 365)

const locks = new Map();

async function dav(req, res, file) {
  const m = req.method;
  if (m === 'GET' || m === 'HEAD') return serveFile(req, res, file, DAV);
  if (m === 'PUT') {
    // Chỉ ghi đè tệp đã có trong thư mục làm bài — không tạo tệp mới tuỳ ý.
    if (!fs.existsSync(file)) return send(res, 403, DAV, '');
    let buf;
    try { buf = await readBody(req, MAX_PUT); } catch (e) { return send(res, e.code || 400, DAV, ''); }
    const tmp = file + '.' + crypto.randomBytes(4).toString('hex') + '.tmp';
    fs.writeFileSync(tmp, buf);
    fs.renameSync(tmp, file); // đổi tên một lần: trang không bao giờ đọc phải tệp ghi dở
    return send(res, 204, DAV, '');
  }
  if (m === 'PROPFIND') {
    await readBody(req, 65536).catch(() => null);
    const st = fs.existsSync(file) && fs.statSync(file);
    if (!st) return send(res, 404, DAV, '');
    const href = esc(req.url.split('?')[0]);
    const xml = `<?xml version="1.0" encoding="utf-8"?><D:multistatus xmlns:D="DAV:"><D:response><D:href>${href}</D:href><D:propstat><D:prop>`
      + `<D:displayname>${esc(path.basename(file))}</D:displayname><D:getcontentlength>${st.isFile() ? st.size : 0}</D:getcontentlength>`
      + `<D:getlastmodified>${st.mtime.toUTCString()}</D:getlastmodified><D:creationdate>${st.birthtime.toISOString()}</D:creationdate>`
      + `<D:resourcetype>${st.isDirectory() ? '<D:collection/>' : ''}</D:resourcetype>`
      + '<D:supportedlock><D:lockentry><D:lockscope><D:exclusive/></D:lockscope><D:locktype><D:write/></D:locktype></D:lockentry></D:supportedlock>'
      + '</D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response></D:multistatus>';
    return send(res, 207, Object.assign({ 'Content-Type': 'application/xml; charset=utf-8' }, DAV), xml);
  }
  if (m === 'PROPPATCH') {
    await readBody(req, 65536).catch(() => null);
    return send(res, 207, Object.assign({ 'Content-Type': 'application/xml; charset=utf-8' }, DAV),
      `<?xml version="1.0" encoding="utf-8"?><D:multistatus xmlns:D="DAV:"><D:response><D:href>${esc(req.url)}</D:href><D:propstat><D:prop/><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response></D:multistatus>`);
  }
  if (m === 'LOCK') {
    await readBody(req, 65536).catch(() => null);
    const tok = 'opaquelocktoken:' + crypto.randomUUID();
    locks.set(file, tok);
    return send(res, 200, Object.assign({ 'Content-Type': 'application/xml; charset=utf-8', 'Lock-Token': `<${tok}>` }, DAV),
      `<?xml version="1.0" encoding="utf-8"?><D:prop xmlns:D="DAV:"><D:lockdiscovery><D:activelock><D:locktype><D:write/></D:locktype><D:lockscope><D:exclusive/></D:lockscope><D:depth>0</D:depth><D:timeout>Second-3600</D:timeout><D:locktoken><D:href>${tok}</D:href></D:locktoken></D:activelock></D:lockdiscovery></D:prop>`);
  }
  if (m === 'UNLOCK') { locks.delete(file); return send(res, 204, DAV, ''); }
  send(res, 405, DAV, '');
}

// ---------------------------------------------------------------- dọn bản làm bài cũ

function cleanup() {
  const limit = Date.now() - WORK_DAYS * 86400000;
  for (const sid of fs.existsSync(WORK) ? fs.readdirSync(WORK) : []) {
    const sdir = path.join(WORK, sid);
    for (const slot of fs.readdirSync(sdir)) {
      const dir = path.join(sdir, slot);
      const newest = Math.max(fs.statSync(dir).mtimeMs, ...fs.readdirSync(dir).map(f => fs.statSync(path.join(dir, f)).mtimeMs));
      if (newest < limit) fs.rmSync(dir, { recursive: true, force: true });
    }
    if (!fs.readdirSync(sdir).length) fs.rmdirSync(sdir);
  }
}

// ---------------------------------------------------------------- định tuyến

const server = http.createServer(async (req, res) => {
  let url;
  try { url = decodeURIComponent(req.url.split('?')[0]); } catch (e) { return send(res, 400, {}, ''); }
  try {
    if (req.method === 'OPTIONS') return send(res, 200, DAV, '');
    if (url === '/api/info') return json(res, 200, { server: 'mos', workDays: WORK_DAYS });
    if (url === '/api/work' && req.method === 'POST') return await apiWork(req, res);
    if (url.startsWith('/work/')) {
      const file = path.join(WORK, url.slice(6));
      if (!inside(WORK, file) || file.split(path.sep).length - WORK.split(path.sep).length !== 3) return send(res, 403, DAV, '');
      return await dav(req, res, file);
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 404, {}, ''); // vd Office dò /_api của SharePoint
    if (PRIVATE.test(url)) return send(res, 404, {}, '');
    const file = path.join(ROOT, url.endsWith('/') ? url + 'index.html' : url);
    if (file !== path.join(ROOT, 'index.html') && !inside(ROOT, file)) return send(res, 403, {}, '');
    serveFile(req, res, file);
  } catch (e) {
    console.error(req.method, url, e);
    if (!res.headersSent) send(res, 500, {}, '');
  }
});

if (require.main === module) {
  fs.mkdirSync(WORK, { recursive: true });
  cleanup();
  setInterval(cleanup, 6 * 3600000).unref();
  server.listen(PORT, () => {
    const ips = Object.values(require('os').networkInterfaces()).flat().filter(i => i.family === 'IPv4' && !i.internal).map(i => i.address);
    console.log(`Ôn luyện MOS đang chạy: http://localhost:${PORT}`);
    ips.forEach(ip => console.log(`  Học sinh mở: http://${ip}:${PORT}`));
  });
}
module.exports = { server, cleanup };
