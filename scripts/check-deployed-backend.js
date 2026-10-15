#!/usr/bin/env node
/* scripts/check-deployed-backend.js — so phiên bản Apps Script ĐANG CHẠY THẬT với bản trong
   code (apps/src/00-config.gs → BACKEND_VERSION). Chỉ gọi GET ?action=ping (công khai, KHÔNG
   ghi gì vào Sheet). Dùng trước khi push web: bản chạy thật cũ hơn → chưa dán/deploy Code.gs mới.
   Chạy: node scripts/check-deployed-backend.js   (không đưa vào CI: CI không nên gọi máy chủ thật) */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const want = (fs.readFileSync(path.join(ROOT, 'apps/src/00-config.gs'), 'utf8').match(/BACKEND_VERSION\s*=\s*'([^']+)'/) || [])[1];
const cfg = fs.readFileSync(path.join(ROOT, 'js/backend-config.js'), 'utf8');
const urls = [...new Set(cfg.match(/https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec/g) || [])]
  .filter((u) => !/\/s\/X+\//.test(u)); // bỏ URL ví dụ trong chú thích (…/s/XXX/exec)

(async () => {
  if (!want || !urls.length) { console.error('Không đọc được BACKEND_VERSION hoặc URL Apps Script.'); process.exit(2); }
  let stale = 0;
  for (const url of urls) {
    try {
      const res = await fetch(url + '?action=ping', { redirect: 'follow', signal: AbortSignal.timeout(30000) });
      const json = await res.json();
      const got = json && json.data && json.data.version;
      const ok = got === want;
      if (!ok) stale++;
      console.log(`${ok ? '✔' : '✖'} ${url.slice(0, 60)}… đang chạy ${got || '?'} — code ${want}`);
    } catch (e) {
      stale++;
      console.log(`✖ ${url.slice(0, 60)}… không gọi được: ${e.message}`);
    }
  }
  if (stale) console.log('\n→ Dán apps/Code.gs mới, chạy kiemTraSauDeploy (đủ ✅), rồi Deploy → Manage deployments → New version.');
  process.exit(stale ? 1 : 0);
})();
