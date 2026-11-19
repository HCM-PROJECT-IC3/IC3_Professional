#!/usr/bin/env node
/* ============================================================
   scripts/backup-before-deploy.mjs — SAO LƯU trước khi triển khai (Prompt 08, docs/techrealm/DEPLOYMENT_GUIDE.md §2).

   Ghi vào backups/<thời điểm>/ (đã .gitignore, KHÔNG đưa lên git):
     repo.bundle          toàn bộ lịch sử git mọi nhánh (khôi phục: git clone repo.bundle)
     uncommitted.patch    thay đổi CHƯA commit (file đã theo dõi) — khôi phục: git apply uncommitted.patch
     untracked.tar        file mới CHƯA commit (trừ node_modules, dist-hosting, backups)
     live-Code.gs         apps/Code.gs ở nhánh main trên origin (= bản đang chạy nếu đã deploy theo main)
     MANIFEST.txt         commit, nhánh, BACKEND_VERSION, SHA-256 từng file
   KHÔNG sao lưu được bằng script (làm tay, xem hướng dẫn): Google Sheet kết quả (File → Tạo bản sao),
   phiên bản Apps Script (tự lưu trong Manage deployments), Firestore (gói Spark không có export — đợt này
   KHÔNG đổi rules / collection nào).

   Chạy:  node scripts/backup-before-deploy.mjs
   0 lượt Firebase, 0 lượt Apps Script, không gửi gì ra mạng.
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const git = (args, opts = {}) => execFileSync('git', args, { cwd: ROOT, maxBuffer: 1 << 30, stdio: ['ignore', 'pipe', 'ignore'], ...opts });
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const out = path.join(ROOT, 'backups', stamp);
fs.mkdirSync(out, { recursive: true });

git(['bundle', 'create', path.join(out, 'repo.bundle'), '--all'], { stdio: 'ignore' });
fs.writeFileSync(path.join(out, 'uncommitted.patch'), git(['diff', '--binary', 'HEAD']));

const untracked = git(['ls-files', '--others', '--exclude-standard', '-z']).toString().split('\0')
  .filter((f) => f && !/^(backups|dist-hosting)\/|node_modules\//.test(f));
if (untracked.length) {
  const list = path.join(out, 'untracked-list.txt');
  fs.writeFileSync(list, untracked.join('\n') + '\n');
  // đường dẫn TƯƠNG ĐỐI: tar của Git Bash hiểu "C:…" là máy từ xa
  const rel = (f) => path.relative(ROOT, f).split(path.sep).join('/');
  execFileSync('tar', ['-cf', rel(path.join(out, 'untracked.tar')), '-T', rel(list)], { cwd: ROOT });
}

let live = '';
try { live = git(['show', 'origin/main:apps/Code.gs']).toString(); fs.writeFileSync(path.join(out, 'live-Code.gs'), live); } catch { /* chưa fetch origin */ }

const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(path.join(out, f))).digest('hex');
const files = fs.readdirSync(out).filter((f) => f !== 'MANIFEST.txt');
const ver = (s) => (s.match(/const BACKEND_VERSION = '([^']+)'/) || [])[1] || '?';
fs.writeFileSync(path.join(out, 'MANIFEST.txt'), [
  `Thời điểm: ${new Date().toISOString()}`,
  `Nhánh: ${git(['rev-parse', '--abbrev-ref', 'HEAD']).toString().trim()}  commit: ${git(['rev-parse', 'HEAD']).toString().trim()}`,
  `origin/main: ${(() => { try { return git(['rev-parse', 'origin/main']).toString().trim(); } catch { return '?'; } })()}`,
  `BACKEND_VERSION bản đang chạy (origin/main): ${live ? ver(live) : '?'}  → bản mới: ${ver(fs.readFileSync(path.join(ROOT, 'apps/src/00-config.gs'), 'utf8'))}`,
  `File chưa commit: ${untracked.length} mới + patch ${fs.statSync(path.join(out, 'uncommitted.patch')).size} byte`,
  '', 'SHA-256:', ...files.map((f) => `  ${sha(f)}  ${f}`), '',
].join('\n'));

console.log(`Đã sao lưu vào ${path.relative(ROOT, out)}/`);
for (const f of files) console.log(`  ${f.padEnd(20)} ${(fs.statSync(path.join(out, f)).size / 1048576).toFixed(1)} MB`);
