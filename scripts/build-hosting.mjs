#!/usr/bin/env node
/* ============================================================
   scripts/build-hosting.mjs — bản RÚT GỌN cho Firebase Hosting (dist-hosting/, không đưa lên git).

   Vì sao: Firebase Hosting gói Spark chỉ 10 GB/THÁNG truyền tải (vượt → trang tắt tới hết tháng).
   Mã JS/CSS cũ để nguyên chú thích tiếng Việt cho dễ sửa → rút gọn (minify) bớt ~45% byte học sinh tải
   (sảnh: ~317 KB → ~196 KB sau brotli). GitHub Pages và mã nguồn KHÔNG đổi gì.

   • Chép mọi file trừ hosting.ignore trong firebase.json.
   • .js / .css tự viết → esbuild minify (KHÔNG keepNames: nó chèn biến toàn cục var F/l vào mọi file; tên cấp cao nhất không bị đổi
     vì đây là script thường, không bundle). Kèm .map để F12 vẫn thấy mã gốc (chỉ tải khi mở DevTools).
   • Không đụng: app/assets (Vite đã rút gọn), *.min.js/css, js/vendor, JSON (image-manager.js đọc JSON
     trên web rồi ghi ngược lên GitHub — rút gọn sẽ làm diff khổng lồ), HTML.
   • File nào esbuild không đọc được → chép nguyên và báo.

   Chạy:  node scripts/build-hosting.mjs        (firebase.json "predeploy" tự chạy trước firebase deploy)
          node scripts/build-hosting.mjs --strict  (CI: lỗi nếu có file không rút gọn được)
   Cần:   esbuild trong web/node_modules  →  cd web && npm ci
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const OUT_DIR = 'dist-hosting';

/** Glob kiểu Firebase (**, *, ?, @(a|b), {a,b}) → RegExp, so với đường dẫn tương đối (có hoặc không "/" đầu). */
export function globToRe(glob) {
  const esc = (s) => s.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') { i++; if (glob[i + 1] === '/') { re += '(?:.*/)?'; i++; } else re += '.*'; }
    else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else if (c === '@' && glob[i + 1] === '(') { const end = glob.indexOf(')', i); re += '(?:' + glob.slice(i + 2, end).split('|').map(esc).join('|') + ')'; i = end; }
    else if (c === '{') { const end = glob.indexOf('}', i); re += '(?:' + glob.slice(i + 1, end).split(',').map(esc).join('|') + ')'; i = end; }
    else re += esc(c);
  }
  return new RegExp('^/?' + re + '$');
}

// File bị bỏ nếu CHÍNH NÓ hoặc BẤT KỲ thư mục cha nào khớp 1 mẫu ignore (như Firebase: mẫu "**/.*" bỏ cả cây .git/,
// mẫu "tests/**" bỏ cả cây tests/). Trước 14/11/2026 chỉ xét từng file → .git/, .github/ lọt vào dist-hosting.
export function isIgnored(res, rel) {
  const parts = rel.split('/');
  for (let i = 1; i <= parts.length; i++) {
    const sub = parts.slice(0, i).join('/');
    if (res.some((re) => re.test(sub) || (i < parts.length && re.test(sub + '/x') && re.test(sub + '/x/y')))) return true;
  }
  return false;
}

const SKIP_MINIFY = [/^app\/assets\//, /\.min\.(js|css)$/, /^js\/vendor\//, /(^|\/)lib\/fontawesome\/css\//];

function loadEsbuild() {
  try { return createRequire(path.join(ROOT, 'web', 'package.json'))('esbuild'); } catch {
    console.error('Thiếu esbuild — chạy: cd web && npm ci');
    process.exit(1);
  }
}

export function build({ quiet = false } = {}) {
  const esbuild = loadEsbuild();
  const fb = JSON.parse(fs.readFileSync(path.join(ROOT, 'firebase.json'), 'utf8'));
  // LUÔN bỏ (dù firebase.json thiếu "hosting"): dotfile/thư mục chấm (.git = lịch sử repo, .env…), node_modules, chính dist.
  // Cloudflare Pages / máy build khác KHÔNG tự bỏ .git như Firebase CLI → thiếu dòng này là lộ cả lịch sử mã nguồn.
  // backups/ (scripts/backup-before-deploy.mjs) = TOÀN BỘ repo + Code.gs — không bao giờ được phát (Prompt 08).
  const ignore = ['**/.*', '**/node_modules/**', OUT_DIR + '/**', 'backups/**', ...(fb.hosting?.ignore || [])].map(globToRe);
  const out = path.join(ROOT, OUT_DIR);
  fs.rmSync(out, { recursive: true, force: true });

  const st = { files: 0, minified: 0, before: 0, after: 0, failed: [] };
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, e.name);
      const rel = path.relative(ROOT, abs).split(path.sep).join('/');
      if (e.isDirectory()) {
        // thư mục bị bỏ cả cây (vd "tests/**") → khỏi đi vào
        if (isIgnored(ignore, rel + '/x')) continue;
        walk(abs);
        continue;
      }
      if (isIgnored(ignore, rel)) continue;
      const dest = path.join(out, rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      st.files++;
      const ext = path.extname(rel).toLowerCase();
      if ((ext === '.js' || ext === '.css') && !SKIP_MINIFY.some((re) => re.test(rel))) {
        const src = fs.readFileSync(abs, 'utf8');
        try {
          const r = esbuild.transformSync(src, {
            loader: ext.slice(1), minify: true, legalComments: 'inline',
            sourcemap: 'external', sourcefile: path.basename(rel), charset: 'utf8',
          });
          const code = r.code.replace(/\n?$/, '\n') + (ext === '.js' ? `//# sourceMappingURL=${path.basename(rel)}.map\n` : `/*# sourceMappingURL=${path.basename(rel)}.map */\n`);
          fs.writeFileSync(dest, code);
          fs.writeFileSync(dest + '.map', r.map);
          st.minified++; st.before += Buffer.byteLength(src); st.after += Buffer.byteLength(code);
          continue;
        } catch (err) {
          st.failed.push(rel + ': ' + String(err.message).split('\n')[0]);
        }
      }
      fs.copyFileSync(abs, dest);
    }
  };
  walk(ROOT);
  const b = bundlePages(out);
  st.pages = b.pages; st.tagsBefore = b.tagsBefore; st.tagsAfter = b.tagsAfter;
  fs.writeFileSync(path.join(out, '_headers'), CLOUDFLARE_HEADERS);
  fs.writeFileSync(path.join(out, '_redirects'), cloudflareRedirects(out));
  if (!fs.existsSync(path.join(out, '404.html'))) fs.writeFileSync(path.join(out, '404.html'), NOT_FOUND_HTML);
  const lim = checkLimits(out);
  st.failed.push(...lim.problems);
  if (!quiet) {
    console.log(`dist-hosting/: ${st.files} file, rút gọn ${st.minified} JS/CSS: ${(st.before / 1024).toFixed(0)} KB → ${(st.after / 1024).toFixed(0)} KB`);
    console.log(`Gộp file: ${b.pages} trang HTML, thẻ <script>/<link> cùng nguồn ${b.tagsBefore} → ${b.tagsAfter} (bundles/, lưu 1 năm)`);
    console.log(`Tổng: ${lim.count} file, ${(lim.size / 1048576).toFixed(1)} MB, file lớn nhất ${(lim.max / 1048576).toFixed(1)} MB (${lim.maxPath})`);
    if (st.failed.length) console.log(`CẢNH BÁO ${st.failed.length}:\n  ` + st.failed.join('\n  '));
  }
  return st;
}

/* Cloudflare Pages đọc file _headers ở gốc bản deploy (Firebase đọc firebase.json; _headers bị Firebase bỏ qua
   nhờ "ignore"). Cloudflare GỘP mọi luật khớp (cùng header → nối bằng dấu phẩy) → chỉ ghi luật cho đường dẫn
   lưu lâu, KHÔNG chồng nhau; còn lại để mặc định Cloudflare "public, max-age=0, must-revalidate" (= luôn hỏi
   lại, không đổi → 304), tương đương "no-cache" trong firebase.json. */
const CLOUDFLARE_HEADERS = `# Sinh bởi scripts/build-hosting.mjs — đừng sửa tay (sửa trong script).
# Bảo mật (Prompt 08, SECURITY_REPORT.md §5): tên header khác Cache-Control → gộp không xung đột. KHÔNG đặt
# X-Frame-Options / frame-ancestors: thầy cô nhúng trang làm bài vào Google Sites / LMS.
/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
/bundles/*
  Cache-Control: public, max-age=31536000, immutable
/app/assets/*
  Cache-Control: public, max-age=31536000, immutable
/img/*
  Cache-Control: public, max-age=604800
/lib/fonts/*.woff2
  Cache-Control: public, max-age=604800
/lib/fontawesome/webfonts/*
  Cache-Control: public, max-age=604800
`;

/* Cloudflare (Workers Static Assets, wrangler.jsonc) KHÔNG cần Worker (15/11/2026). Trước đó scripts/cloudflare-worker.js
   lo "/", "/app/", "/mos/" vì html_handling "none" không tự tìm index.html → MỖI lần mở trang chủ / app 2.0 + MỌI đường
   dẫn sai (bot dò /wp-login.php, /favicon.ico...) tốn 1 lượt Worker. Gói Free 100.000 lượt/ngày; vượt → Worker lỗi 1027,
   trang chủ "/" chết với MỌI người tới hết ngày. Giờ: luật tĩnh trong _redirects (Cloudflare xử lý trước khi tìm file,
   không tính lượt Worker) + not_found_handling "404-page" (404.html dưới đây). Đã thử bằng "wrangler dev".
   Cloudflare Pages cũng đọc _redirects (luật thừa vô hại); Firebase bỏ qua (firebase.json "ignore"), tự dùng 404.html. */
export function cloudflareRedirects(out) {
  const dirs = [];
  const walk = (dir, rel) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      const r = rel + e.name + '/';
      if (fs.existsSync(path.join(dir, e.name, 'index.html'))) dirs.push(r);
      walk(path.join(dir, e.name), r);
    }
  };
  walk(out, '/');
  dirs.sort();
  const lines = ['# Sinh bởi scripts/build-hosting.mjs — đừng sửa tay (sửa trong script).', '/ /index.html 200'];
  dirs.forEach((d) => lines.push(`${d} ${d}index.html 200`, `${d.slice(0, -1)} ${d} 301`));
  return lines.join('\n') + '\n';
}

const NOT_FOUND_HTML = '<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
  + '<link rel="icon" href="/favicon.svg" type="image/svg+xml">' // không có thẻ này trình duyệt tự xin /favicon.ico → thêm 1 lần 404
  + '<title>Không tìm thấy trang</title><body style="font-family:system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 16px">'
  + '<h1>Không tìm thấy trang</h1><p>Đường dẫn này không có. <a href="/">Về trang chủ</a></p></body></html>\n';

/** Giới hạn host miễn phí: Cloudflare Pages 20.000 file + 25 MiB/file; Firebase 10 GB lưu trữ; GitHub Pages 1 GB. */
function checkLimits(out) {
  const r = { count: 0, size: 0, max: 0, maxPath: '', problems: [] };
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) { walk(abs); continue; }
      const sz = fs.statSync(abs).size;
      const rel = path.relative(out, abs).split(path.sep).join('/');
      r.count++; r.size += sz;
      if (sz > r.max) { r.max = sz; r.maxPath = rel; }
      if (sz > 25 * 1048576) r.problems.push(`${rel}: ${(sz / 1048576).toFixed(1)} MB > 25 MiB (Cloudflare Pages)`);
      // Chốt chặn (Prompt 08): mã máy chủ / sao lưu / bí mật KHÔNG bao giờ được phát, dù firebase.json quên bỏ.
      if (/\.(gs|bundle|patch|pem|key)$|(^|\/)(\.env[^/]*|firestore\.rules|untracked\.tar|MANIFEST\.txt)$/.test(rel)) r.problems.push(`${rel}: file không được phát công khai`);
    }
  };
  walk(out);
  if (r.count > 20000) r.problems.push(`${r.count} file > 20.000 (Cloudflare Pages)`);
  if (r.size > 1024 * 1048576) r.problems.push(`${(r.size / 1048576).toFixed(0)} MB > 1 GB (GitHub Pages)`);
  return r;
}

/* ── GỘP FILE + TÊN THEO NỘI DUNG (giảm request, máy quay lại không phải hỏi lại máy chủ) ──────────────
   Mỗi trang HTML (trừ app/ — Vite đã làm):
   • <script src defer> cùng nguồn → 1 file bundles/<băm>.js. File gộp KHÔNG nối chuỗi mã: nó chứa mã từng
     file và chèn lần lượt thành <script> riêng ngay sau chính nó → mỗi file vẫn là 1 script độc lập như cũ
     ("use strict" riêng, biến toàn cục cấp cao nhất như cũ, 1 file ném lỗi lúc khởi động — vd localStorage
     bị chặn ở máy trường — KHÔNG kéo các file sau chết theo). Thứ tự chạy giữ nguyên: script defer chạy theo
     thứ tự tài liệu; chỉ gộp các script defer liền mạch, gặp script defer/module không gộp được thì cắt nhóm.
   • <script src> thường (không defer): chỉ gộp các thẻ KỀ NHAU (giữa chỉ có khoảng trắng).
   • <link rel=stylesheet> kề nhau, cùng thuộc tính (media, onload…) → 1 file CSS, sửa url() theo chỗ mới.
   • Tên theo băm nội dung → Cache-Control 1 năm (firebase.json "/bundles/**"); đổi mã = đổi tên = tải mới.
   KHÔNG đụng: thẻ có thuộc tính khác (data-auto, type=module, async, id…), đường dẫn tuyệt đối/khác tên miền
   hoặc có "?", file vendor/*.min.*, js/auth.js, và script THƯỜNG / CSS có đường dẫn xuất hiện dạng chuỗi trong mã
   (được tải động — lazy-script-loader dò script[src=…]:not([defer]) để khỏi tải 2 lần; đổi tên sẽ làm nó chạy 2 lần). */
const BUNDLE_DIR = 'bundles';
const hash8 = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 10);
const posix = path.posix;

function dynamicRefs() {
  const set = new Set();
  const re = /['"`]((?:\.{1,2}\/)*(?:[\w.-]+\/)*[\w.-]+\.(?:js|css))['"`]/g;
  const scanFile = (abs) => {
    if (!/\.(js|mjs|html)$/.test(abs)) return;
    const txt = fs.readFileSync(abs, 'utf8');
    // .html: chỉ chuỗi trong mã <script> nội tuyến (thuộc tính src/href của thẻ là nạp tĩnh, không tính)
    const code = abs.endsWith('.html') ? [...txt.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]).join('\n') : txt;
    for (const m of code.matchAll(re)) set.add(m[1].replace(/^(\.{1,2}\/)+/, ''));
  };
  const scanDir = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === '__tests__' || e.name.startsWith('.')) continue;   // __tests__: unit test đọc mã nguồn theo tên, không phải tải động
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) scanDir(abs); else scanFile(abs);
    }
  };
  for (const d of ['js', 'mos/js', 'mos/index.html', 'lib', 'css']) {
    const abs = path.join(ROOT, d);
    if (fs.existsSync(abs)) (fs.statSync(abs).isDirectory() ? scanDir : scanFile)(abs);
  }
  for (const f of fs.readdirSync(ROOT)) if (/\.(js|html)$/.test(f)) scanFile(path.join(ROOT, f));
  return set;
}

function parseAttrs(s) {
  const out = {};
  for (const m of s.matchAll(/([^\s=/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) out[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? '';
  return out;
}

function bundlePages(out) {
  const dyn = dynamicRefs();
  const isDyn = (p) => dyn.has(p) || [...dyn].some((d) => p.endsWith('/' + d));
  const NOT_TOUCH = [/^js\/vendor\//, /\.min\.(js|css)$/, /^app\//, /^bundles\//];
  fs.mkdirSync(path.join(out, BUNDLE_DIR), { recursive: true });
  const stat = { pages: 0, tagsBefore: 0, tagsAfter: 0 };

  const htmls = [];
  const find = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, e.name);
      const rel = path.relative(out, abs).split(path.sep).join('/');
      if (e.isDirectory()) { if (!/^(app|bundles)$/.test(rel)) find(abs); continue; }
      if (rel.endsWith('.html')) htmls.push(rel);
    }
  };
  find(out);

  const written = new Map(); // nội dung → đường dẫn bundles/… (trang khác dùng chung file giống hệt)
  const emit = (content, ext) => {
    const name = `${BUNDLE_DIR}/${hash8(content)}.${ext}`;
    if (!written.has(name)) { fs.writeFileSync(path.join(out, name), content); written.set(name, true); }
    return name;
  };
  // js/auth.js: cổng Firebase Auth — để riêng (dễ dò lỗi đăng nhập; E2E thay nó bằng bản giả theo đúng đường dẫn).
  const NO_BUNDLE = new Set(['js/auth.js']);
  /** allowDyn: script defer — lazy-script-loader chỉ coi script TĨNH KHÔNG defer là "đã tải" (:not([defer])),
   *  nên với script defer, tải động vẫn tải lại y như trên GitHub Pages → gộp không đổi hành vi. */
  const local = (htmlDir, url, allowDyn = false) => {
    if (!url || /^(?:[a-z]+:|\/\/|\/|#)/i.test(url) || url.includes('?')) return null;
    const p = posix.normalize(posix.join(htmlDir, url));
    if (p.startsWith('..') || NOT_TOUCH.some((re) => re.test(p)) || NO_BUNDLE.has(p) || (!allowDyn && isDyn(p))) return null;
    return fs.existsSync(path.join(out, p)) ? p : null;
  };
  const stripMap = (s) => s.replace(/\n?\/\/# sourceMappingURL=\S+\s*$/, '').replace(/\n?\/\*# sourceMappingURL=\S+ \*\/\s*$/, '');
  /** CSS: url() tương đối viết lại theo vị trí mới (bundles/). */
  const cssFor = (p) => {
    const dir = posix.dirname(p);
    return stripMap(fs.readFileSync(path.join(out, p), 'utf8')).replace(/@charset\s+"[^"]*";/gi, '')
      .replace(/url\(\s*(['"]?)([^'")]+?)\1\s*\)/g, (m, q, u) => (/^(?:[a-z]+:|\/\/|\/|#)/i.test(u) ? m
        : `url(${q}${posix.relative(BUNDLE_DIR, posix.normalize(posix.join(dir, u)))}${q})`));
  };
  const mapRef = (p, fromDir) => (fs.existsSync(path.join(out, p + '.map')) ? posix.relative(fromDir, p + '.map') : null);

  for (const rel of htmls) {
    const htmlDir = posix.dirname(rel) === '.' ? '' : posix.dirname(rel);
    let html = fs.readFileSync(path.join(out, rel), 'utf8');
    const blank = (s) => s.replace(/[^\n]/g, ' ');
    let masked = html.replace(/<!--[\s\S]*?-->/g, blank).replace(/<noscript\b[\s\S]*?<\/noscript>/gi, blank);
    const tokens = [];
    for (const m of masked.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
      const innerStart = m.index + m[0].indexOf('>') + 1;
      tokens.push({ kind: 'script', start: m.index, end: m.index + m[0].length, innerStart, innerEnd: innerStart + m[2].length,
        raw: html.slice(m.index, m.index + m[0].length), attrs: parseAttrs(m[1]), inline: m[2].trim() !== '' });
    }
    // che nội dung script nội tuyến (chuỗi "<link" trong mã không phải thẻ thật); thẻ mở/đóng vẫn còn → không "kề nhau"
    for (const t of tokens) masked = masked.slice(0, t.innerStart) + blank(masked.slice(t.innerStart, t.innerEnd)) + masked.slice(t.innerEnd);
    for (const m of masked.matchAll(/<link\b([^>]*)>/gi)) {
      tokens.push({ kind: 'link', start: m.index, end: m.index + m[0].length, raw: html.slice(m.index, m.index + m[0].length), attrs: parseAttrs(m[1]) });
    }
    tokens.sort((a, b) => a.start - b.start);

    // phân loại từng thẻ
    for (const t of tokens) {
      const a = t.attrs;
      const keys = Object.keys(a).filter((k) => k !== 'src' && k !== 'href');
      if (t.kind === 'script') {
        t.path = !t.inline && a.src ? local(htmlDir, a.src, 'defer' in a) : null;
        t.ok = !!t.path && keys.every((k) => k === 'defer');
        t.mode = 'defer' in a ? 'defer' : (a.type === 'module' ? 'module' : ('async' in a ? 'async' : (a.src ? 'sync' : 'inline')));
      } else {
        t.path = (a.rel || '').toLowerCase() === 'stylesheet' ? local(htmlDir, a.href) : null;
        t.ok = !!t.path;
        t.sig = keys.sort().map((k) => k + '=' + a[k]).join('&');
      }
    }
    const gapEmpty = (x, y) => /^\s*$/.test(masked.slice(x.end, y.start));
    const groups = [];
    // script defer: liền mạch theo thứ tự, cắt khi gặp defer/module không gộp được
    let cur = null;
    for (const t of tokens) {
      if (t.kind !== 'script') continue;
      if (t.ok && t.mode === 'defer') { (cur ||= (groups.push([]), groups[groups.length - 1])).push(t); continue; }
      if (t.mode === 'defer' || t.mode === 'module') cur = null;
    }
    // script thường & link: chỉ thẻ kề nhau
    let prev = null;
    for (const t of tokens) {
      const can = (t.kind === 'script' && t.ok && t.mode === 'sync') || (t.kind === 'link' && t.ok);
      if (!can) { prev = null; continue; }
      if (prev && prev.kind === t.kind && (t.kind === 'script' || prev.sig === t.sig) && gapEmpty(prev, t)) groups[groups.length - 1].push(t);
      else groups.push([t]);
      prev = t;
    }
    if (!groups.length) continue;

    const edits = [];
    for (const g of groups) {
      stat.tagsBefore += g.length; stat.tagsAfter += 1;
      const first = g[0];
      let target;
      if (first.kind === 'link') {
        const css = g.map((t) => cssFor(t.path)).join('\n');
        target = emit(g.length === 1 && mapRef(first.path, BUNDLE_DIR) ? css + `\n/*# sourceMappingURL=${mapRef(first.path, BUNDLE_DIR)} */\n` : css, 'css');
      } else if (g.length === 1) {
        const code = stripMap(fs.readFileSync(path.join(out, first.path), 'utf8'));
        const m = mapRef(first.path, BUNDLE_DIR);
        target = emit(code + (m ? `\n//# sourceMappingURL=${m}\n` : '\n'), 'js');
      } else {
        // mỗi phần chạy như 1 <script> riêng; sourceURL/sourceMappingURL (tương đối với trang) để F12 thấy đúng file gốc
        const parts = g.map((t) => {
          const m = mapRef(t.path, htmlDir || '.');
          return stripMap(fs.readFileSync(path.join(out, t.path), 'utf8')) + `\n//# sourceURL=${posix.relative(htmlDir || '.', t.path)}` + (m ? `\n//# sourceMappingURL=${m}` : '');
        });
        target = emit(`(function(d){var a=d.currentScript,F=${JSON.stringify(parts)};for(var i=0;i<F.length;i++){var s=d.createElement("script");s.text=F[i];a.parentNode.insertBefore(s,a.nextSibling);a=s}})(document);\n`, 'js');
      }
      const href = posix.relative(htmlDir || '.', target);
      const attr = first.kind === 'link' ? 'href' : 'src';
      edits.push({ start: first.start, end: first.end, text: first.raw.replace(new RegExp(`${attr}\\s*=\\s*("[^"]*"|'[^']*'|[^\\s>]+)`, 'i'), `${attr}="${href}"`) });
      for (const t of g.slice(1)) edits.push({ start: t.start, end: t.end, text: '' });
    }
    edits.sort((x, y) => y.start - x.start);
    for (const e of edits) html = html.slice(0, e.start) + e.text + html.slice(e.end);
    fs.writeFileSync(path.join(out, rel), html);
    stat.pages++;
  }
  return stat;
}

/* ── STAGING (Prompt 08, docs/techrealm/DEPLOYMENT_GUIDE.md §3) ──
   Bản thử nghiệm phát ở 1 địa chỉ RIÊNG, bản thật giữ nguyên tới khi nghiệm thu. Khác bản thật đúng 2 điểm:
   • URL Apps Script → 1 deployment THỬ NGHIỆM (Apps Script → Deploy → New deployment: URL /exec mới chạy mã mới; deployment
     cũ của bản thật KHÔNG đổi). URL được thay ở MỌI file .js/.html của dist-hosting (kể cả gói app/ đã build sẵn).
   • Chặn máy tìm kiếm: robots.txt "Disallow: /" + header X-Robots-Tag: noindex.
   Mã nguồn và bản thật không đổi gì. */
export function applyStaging(out, stagingUrl) {
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{20,}\/exec$/.test(stagingUrl)) {
    throw new Error('URL Apps Script thử nghiệm không hợp lệ (dạng https://script.google.com/macros/s/…/exec): ' + stagingUrl);
  }
  const prod = fs.readFileSync(path.join(ROOT, 'js', 'backend-config.js'), 'utf8').match(/appsScriptUrl:\s*'([^']+)'/)?.[1];
  if (!prod) throw new Error('Không đọc được appsScriptUrl trong js/backend-config.js');
  let files = 0;
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) { walk(abs); continue; }
      if (!/\.(js|html)$/.test(e.name)) continue;
      const s = fs.readFileSync(abs, 'utf8');
      if (!s.includes(prod)) continue;
      fs.writeFileSync(abs, s.split(prod).join(stagingUrl));
      files++;
    }
  };
  walk(out);
  if (!files) throw new Error('Không tìm thấy URL Apps Script của bản thật trong dist-hosting — không thay được.');
  fs.writeFileSync(path.join(out, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
  fs.appendFileSync(path.join(out, '_headers'), '/*\n  X-Robots-Tag: noindex\n');
  return { files };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const st = build();
  // --staging=<URL /exec thử nghiệm> (hoặc biến STAGING_APPS_SCRIPT_URL): bản thử nghiệm, xem applyStaging.
  const stArg = process.argv.find((a) => a.startsWith('--staging'));
  if (stArg) {
    const url = stArg.includes('=') ? stArg.slice(stArg.indexOf('=') + 1) : process.env.STAGING_APPS_SCRIPT_URL || '';
    try {
      const r = applyStaging(path.join(ROOT, OUT_DIR), url);
      console.log(`STAGING: đã trỏ ${r.files} file sang Apps Script thử nghiệm, chặn máy tìm kiếm.`);
    } catch (e) { console.error('STAGING lỗi: ' + e.message); process.exit(1); }
  }
  // --strict (CI): file nào không rút gọn được là lỗi — tránh âm thầm phát bản đầy đủ.
  if (process.argv.includes('--strict') && st.failed.length) process.exit(1);
}
