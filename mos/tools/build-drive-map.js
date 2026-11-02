#!/usr/bin/env node
/* Ghép tệp đề MOS với bản trên Google Drive → mos/data/drive.json, để trang tải đề thẳng từ Drive
   (không cần tệp đề trên GitHub/máy chủ). Thư mục Drive phải chia sẻ "Bất kỳ ai có đường liên kết".

     node mos/tools/build-drive-map.js

   Cần có sẵn tệp đề trên máy (python mos/tools/build_catalog.py) để:
     • phân biệt tệp trùng tên trong cùng một tiết (so kích thước tệp tải về);
     • Word: tệp .docx nằm nhúng trong BaiOnN_HoanThien.pptx — tìm đường dẫn nhúng bằng cách so mã băm
       với tệp đã tách trên máy. Trang tải bài giảng từ Drive rồi tự lấy tệp .docx ra.
   Chạy lại mỗi khi thêm/thay tệp trên Drive (ID đổi khi tải tệp mới lên). */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const JSZip = require('../../js/vendor/jszip.min.js');

const MOS = path.join(__dirname, '..');
const ROOTS = {
  excel: '153pxS-HlbCTHOX-zQGn3AfaOigHUGdSh',
  powerpoint: '10OAD6IRWNWrEQRZdebXNTf6EIA108JN4',
  word: '1_dUNYR3p6wvocMM9inOpU4XnRW6PMQph',
};
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const decode = s => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).normalize('NFC').trim();
const download = id => `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`;
const sha = buf => crypto.createHash('sha1').update(buf).digest('hex');

async function listFolder(id, attempt = 1) {
  // UA mặc định của Node hay bị Drive trả trang rỗng → giả trình duyệt, thử lại vài lần.
  const res = await fetch(`https://drive.google.com/embeddedfolderview?id=${id}`, { headers: { 'user-agent': UA, 'accept-language': 'vi,en' } });
  const html = res.ok ? await res.text() : '';
  const out = [];
  const re = /<div class="flip-entry" id="entry-([\w-]+)"[\s\S]*?<a href="([^"]+)"[\s\S]*?<div class="flip-entry-title">([^<]*)<\/div>/g;
  let m;
  while ((m = re.exec(html))) out.push({ id: m[1], name: decode(m[3]), folder: /\/folders\//.test(m[2]) });
  if (!out.length && attempt < 4) { await new Promise(r => setTimeout(r, 1500 * attempt)); return listFolder(id, attempt + 1); }
  return out;
}

async function walk(id, rel, out) {
  for (const it of await listFolder(id)) {
    const p = rel ? rel + '/' + it.name : it.name;
    if (it.folder) await walk(it.id, p, out);
    else out.push({ id: it.id, name: it.name, path: p });
  }
  return out;
}

// "Tiet_3/…", "Tiết 3/…", "On_Tap/Tiet_3/…" → 3
const tietOf = p => { const m = /(?:^|\/)Ti[eế]t[_ ]?(\d+)(?:\/|$)/i.exec(p.normalize('NFC')); return m ? +m[1] : null; };
const projOf = p => { const m = /(?:^|\/)(?:PROJECT|Project)[_ ]?(\d+)(?:\/|$)/.exec(p); return m ? +m[1] : null; };

const cache = {};
async function fetchBuf(id) {
  if (!cache[id]) cache[id] = fetch(download(id)).then(async r => {
    if (!r.ok) throw new Error(`Không tải được tệp Drive ${id} (HTTP ${r.status})`);
    return Buffer.from(await r.arrayBuffer());
  });
  return cache[id];
}

(async () => {
  const index = JSON.parse(fs.readFileSync(path.join(MOS, 'data/index.json'), 'utf8'));
  const map = {};
  const problems = [];
  for (const subj of index.subjects) {
    const drive = await walk(ROOTS[subj.id], '', []);
    console.log(`${subj.name}: ${drive.length} tệp trên Drive`);
    for (const s of subj.sets) {
      const set = JSON.parse(fs.readFileSync(path.join(MOS, 'data/sets', s.id + '.json'), 'utf8'));
      const inTiet = drive.filter(d => tietOf(d.path) === set.no);
      for (const p of set.projects) for (const f of p.files) {
        if (map[f.path]) continue;
        const local = path.join(MOS, f.path);
        let cands = inTiet.filter(d => d.name.normalize('NFC') === f.name.normalize('NFC'));
        if (cands.length > 1) { const byProj = cands.filter(d => projOf(d.path) === p.no); if (byProj.length) cands = byProj; }
        if (cands.length > 1 && fs.existsSync(local)) {
          const want = fs.statSync(local).size;
          const same = [];
          for (const c of cands) if ((await fetchBuf(c.id)).length === want) same.push(c);
          if (same.length) cands = same;
        }
        if (cands.length) { map[f.path] = { id: cands[0].id }; continue; }

        // Tên trên Drive bị đổi (vd "Dublín.jpg" → "Dublisn.jpg.jpg"): so nội dung với tệp cùng đuôi trong tiết.
        if (fs.existsSync(local)) {
          const want = sha(fs.readFileSync(local));
          const ext = path.extname(f.name).toLowerCase();
          let same = null;
          for (const c of inTiet.filter(d => d.name.toLowerCase().endsWith(ext))) {
            if (sha(await fetchBuf(c.id)) === want) { same = c; break; }
          }
          if (same) { map[f.path] = { id: same.id }; continue; }
        }

        // Word: tệp nằm nhúng trong bài giảng BaiOnN_HoanThien.pptx của tiết.
        const deck = subj.id === 'word' && inTiet.find(d => /HoanThien\.pptx$/i.test(d.name));
        if (deck && fs.existsSync(local)) {
          const want = sha(fs.readFileSync(local));
          const zip = await JSZip.loadAsync(await fetchBuf(deck.id));
          let hit = null;
          for (const name of Object.keys(zip.files).filter(n => /^ppt\/embeddings\//.test(n))) {
            if (sha(await zip.file(name).async('nodebuffer')) === want) { hit = name; break; }
          }
          if (hit) { map[f.path] = { id: deck.id, embed: hit }; continue; }
        }
        problems.push(f.path);
      }
    }
  }
  const out = path.join(MOS, 'data/drive.json');
  const sorted = Object.fromEntries(Object.keys(map).sort().map(k => [k, map[k]]));
  fs.writeFileSync(out, JSON.stringify({ roots: ROOTS, files: sorted }, null, 1) + '\n');
  console.log(`Đã ghi ${Object.keys(map).length} tệp vào data/drive.json.`);
  if (problems.length) {
    console.log(`Chưa tìm thấy trên Drive (${problems.length}) — trang sẽ dùng tệp trên máy chủ nếu có:`);
    problems.forEach(p => console.log('  ' + p));
  }
})().catch(e => { console.error(e); process.exit(1); });
