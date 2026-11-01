/* Tự cập nhật trang từ GitHub cho máy chủ trường — không cần build lại ảnh Docker.

   Vì sao: ảnh Docker chứa trang ở thời điểm build. Admin đẩy câu hỏi / danh sách học sinh lên
   GitHub (Apps Script githubPublish / publishRoster) thì máy chủ trường cũ đi.
   Cách làm (mỗi SITE_SYNC_MIN phút):
     1. Hỏi commit mới nhất của nhánh (GitHub API, kèm ETag → không đổi thì 304, không tính hạn mức).
     2. Đổi commit → lấy cây tệp (1 lượt API), so mã blob git với tệp đang có trên máy chủ.
     3. Chỉ tải tệp khác từ raw.githubusercontent.com vào thư mục phủ (DATA_DIR/site). Máy chủ
        phát tệp trong thư mục phủ trước, không có thì phát tệp trong ảnh.
   Không đụng mã máy chủ (server/), tệp đề MOS, công cụ — những thứ đó cần build lại ảnh.
   Tệp bị xoá trên GitHub vẫn còn trong ảnh tới lần build sau (không trang nào trỏ tới nên vô hại). */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MAX_FILE = 20 * 1024 * 1024;
const MAX_FILES_PER_SYNC = 3000;
const PARALLEL = 6;

/** Mã blob git của nội dung (giống `git hash-object`). */
function blobSha(buf) {
  return crypto.createHash('sha1').update(`blob ${buf.length}\0`).update(buf).digest('hex');
}

function createSync(opts) {
  const o = Object.assign({
    repo: '',                  // 'owner/name'
    branch: 'main',
    root: '',                  // thư mục trang trong ảnh
    overlay: '',               // DATA_DIR/site
    minutes: 10,
    token: '',                 // tuỳ chọn: repo riêng tư / hạn mức API cao hơn
    isPublic: () => true,      // đường dẫn nào được đồng bộ (server.js truyền vào)
    fetch: global.fetch,
    log: console,
  }, opts || {});
  const stateFile = path.join(o.overlay, '..', 'site-sync.json');
  let state = { commit: '', etag: '' };
  try { state = Object.assign(state, JSON.parse(fs.readFileSync(stateFile, 'utf8'))); } catch (e) { /* lần đầu */ }
  const status = { repo: o.repo, branch: o.branch, commit: state.commit, lastCheck: null, lastChange: null, updated: 0, error: null };
  const shaCache = new Map(); // file → { size, mtimeMs, sha }
  let running = null;
  let timer = null;

  function headers(extra) {
    const h = Object.assign({ 'User-Agent': 'ic3-school-server', 'Accept': 'application/vnd.github+json' }, extra || {});
    if (o.token) h.Authorization = 'Bearer ' + o.token;
    return h;
  }

  function localSha(file) {
    let st;
    try { st = fs.statSync(file); } catch (e) { return null; }
    if (!st.isFile()) return null;
    const hit = shaCache.get(file);
    if (hit && hit.size === st.size && hit.mtimeMs === st.mtimeMs) return hit;
    const buf = fs.readFileSync(file);
    // Bản checkout trên Windows (core.autocrlf) có xuống dòng CRLF, git/GitHub lưu LF → so cả bản LF.
    const crlf = buf.includes('\r\n');
    const v = { size: st.size, mtimeMs: st.mtimeMs, sha: blobSha(buf),
      shaLf: crlf ? blobSha(Buffer.from(buf.toString('latin1').replace(/\r\n/g, '\n'), 'latin1')) : null };
    shaCache.set(file, v);
    return v;
  }

  const safePath = p => typeof p === 'string' && p.length < 400 && !p.split('/').some(s => !s || s === '.' || s === '..') && !/[\\\0]/.test(p);

  async function download(commit, entry) {
    const url = `https://raw.githubusercontent.com/${o.repo}/${commit}/${entry.path.split('/').map(encodeURIComponent).join('/')}`;
    const res = await o.fetch(url, { headers: o.token ? { Authorization: 'Bearer ' + o.token } : {} });
    if (!res.ok) throw new Error(`Tải ${entry.path} lỗi HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (blobSha(buf) !== entry.sha) throw new Error(`Tệp ${entry.path} tải về không khớp mã`);
    const dest = path.join(o.overlay, entry.path);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const tmp = dest + '.' + process.pid + '.tmp';
    fs.writeFileSync(tmp, buf);
    fs.renameSync(tmp, dest); // trang không bao giờ đọc phải tệp ghi dở
  }

  async function syncOnce() {
    status.lastCheck = new Date().toISOString();
    const api = `https://api.github.com/repos/${o.repo}`;
    const head = await o.fetch(`${api}/commits/${encodeURIComponent(o.branch)}`,
      { headers: headers(Object.assign({ Accept: 'application/vnd.github.sha' }, state.etag ? { 'If-None-Match': state.etag } : {})) });
    if (head.status === 304) return;
    if (!head.ok) throw new Error(`GitHub trả HTTP ${head.status} khi hỏi commit mới nhất`);
    const commit = (await head.text()).trim();
    const etag = head.headers.get('etag') || '';
    if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error('GitHub trả mã commit lạ');
    if (commit === state.commit) { state.etag = etag; return save(); }

    const treeRes = await o.fetch(`${api}/git/trees/${commit}?recursive=1`, { headers: headers() });
    if (!treeRes.ok) throw new Error(`GitHub trả HTTP ${treeRes.status} khi lấy cây tệp`);
    const tree = await treeRes.json();
    if (tree.truncated) o.log.warn('Cây tệp GitHub bị cắt bớt — một số tệp có thể chưa đồng bộ.');
    const want = (tree.tree || []).filter(e => e.type === 'blob' && safePath(e.path) && e.size <= MAX_FILE && o.isPublic('/' + e.path));

    const todo = [];
    for (const e of want) {
      const over = path.join(o.overlay, e.path);
      const image = path.join(o.root, e.path);
      const same = f => { const v = localSha(f); return !!v && (v.sha === e.sha || v.shaLf === e.sha); };
      if (same(image)) {
        // GitHub trùng bản trong ảnh (vd vừa build lại) → bỏ bản phủ cũ nếu còn.
        if (fs.existsSync(over)) { fs.unlinkSync(over); shaCache.delete(over); }
        continue;
      }
      if (!same(over)) todo.push(e);
    }
    if (todo.length > MAX_FILES_PER_SYNC) throw new Error(`${todo.length} tệp khác GitHub — quá nhiều, hãy build lại ảnh Docker.`);
    for (let i = 0; i < todo.length; i += PARALLEL) {
      await Promise.all(todo.slice(i, i + PARALLEL).map(e => download(commit, e)));
    }
    status.updated = todo.length;
    if (todo.length) {
      status.lastChange = new Date().toISOString();
      o.log.log(`Đồng bộ GitHub ${commit.slice(0, 7)}: cập nhật ${todo.length} tệp.`);
    }
    // Chỉ ghi nhận commit khi đã tải đủ — lỗi giữa chừng thì lượt sau làm lại.
    state = { commit, etag };
    status.commit = commit;
    save();
  }

  function save() {
    try { fs.writeFileSync(stateFile, JSON.stringify(state)); } catch (e) { /* lượt sau thử lại */ }
  }

  function run() {
    if (!running) {
      running = syncOnce()
        .then(() => { status.error = null; })
        .catch(e => { status.error = e.message; o.log.warn('Đồng bộ GitHub lỗi:', e.message); })
        .finally(() => { running = null; });
    }
    return running;
  }

  fs.mkdirSync(o.overlay, { recursive: true });
  return {
    run,
    status: () => Object.assign({ enabled: !!(o.repo && o.minutes > 0), minutes: o.minutes }, status),
    start() {
      if (!o.repo || !(o.minutes > 0)) return;
      run();
      timer = setInterval(run, o.minutes * 60000);
      timer.unref();
    },
    stop() { clearInterval(timer); },
  };
}

module.exports = { createSync, blobSha };
