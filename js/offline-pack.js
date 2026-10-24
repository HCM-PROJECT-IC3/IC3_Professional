/* ============================================================
   js/offline-pack.js — "Tải sẵn để dùng offline" (offline-first).

   Học sinh bấm 1 nút ở sảnh → tải trọn ngân hàng câu hỏi của khối đang chọn
   (file khối + từng bài minitest + ảnh trong câu hỏi) và khung trang (index /
   arena + JS/CSS) vào Cache Storage qua sw.js. Sau đó mở trang, làm bài, chơi
   Đấu trường tự chơi kể cả khi mất mạng. Điểm/tiến độ vốn đã lưu trên máy
   (localStorage), bài nộp lỗi mạng đã có hàng đợi gửi lại (pending-sync-queue).

   • Không đụng Firebase / Google Sheet: chỉ GET file tĩnh cùng tên miền.
   • Font Google + icon Font Awesome ở CDN khác tên miền nên KHÔNG lưu được:
     offline chữ dùng font hệ thống, icon có thể không hiện — nội dung vẫn đủ.
   • Mở bằng file:// hoặc trình duyệt không có Service Worker → ẩn nút.

   API: window.EduOffline = { pack(catId, lvlId), collectUrls(catId, lvlId), isSupported() }
   ============================================================ */
(function (global) {
  'use strict';

  const STORE_KEY = 'eduquiz_offline_pack_v1';
  const IMG_RE = /img\/[A-Za-z0-9_.\-/]+\.(?:png|jpe?g|gif|webp|svg)/g;
  const SHELL_PAGES = ['index.html', 'arena.html', 'gom-ket-qua.html'];   // gom-ket-qua: giáo viên gom kết quả được cả khi mất mạng
  const EXTRA = ['data/ic3/meta.json', 'data/ic3/minitests-manifest.json', 'data/roster/students-active.json', 'favicon.svg', 'manifest.webmanifest', 'img/pwa/icon-192.png', 'img/pwa/icon-512.png'];

  const $ = (id) => document.getElementById(id);

  function isSupported() {
    return 'serviceWorker' in navigator && 'caches' in global && /^https?:$/.test(location.protocol);
  }

  function getJson(url) {
    return fetch(url).then((r) => { if (!r.ok) throw new Error(url + ' ' + r.status); return r.text(); });
  }

  /** Lấy các đường dẫn script/css/ảnh cùng tên miền trong 1 trang HTML. */
  function shellFromHtml(html) {
    const out = new Set();
    const re = /(?:src|href)\s*=\s*"([^"#]+)"/g;
    let m;
    while ((m = re.exec(html))) {
      const u = m[1].trim();
      if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|data:|mailto:|javascript:)/i.test(u)) continue;   // CDN, data:, mailto...
      const clean = u.split('?')[0];
      if (/\.(?:js|css|svg|png|jpe?g|webp|gif|json|woff2?)$/i.test(clean)) out.add(clean);
    }
    return out;
  }

  function imagesFromText(text, into) {
    const found = text.match(IMG_RE);
    if (found) for (const f of found) into.add(f);
  }

  /**
   * Gom danh sách file cần lưu cho 1 khối. Các file JSON dữ liệu được tải bằng
   * fetch thường (sw.js tự lưu vào kho khi nhận được), nên chỉ phần còn lại
   * (khung trang + ảnh) mới đưa vào danh sách PRECACHE.
   */
  async function collectUrls(catId, lvlId, onStep) {
    const step = onStep || function () {};
    const urls = new Set(EXTRA);

    step('Đang đọc khung trang…');
    for (const page of SHELL_PAGES) {
      urls.add(page);
      try { shellFromHtml(await getJson(page)).forEach((u) => urls.add(u)); } catch (e) { /* trang không đọc được: bỏ qua */ }
    }

    step('Đang đọc danh mục câu hỏi…');
    const meta = JSON.parse(await getJson('data/ic3/meta.json'));
    const cat = (meta.categories || []).find((c) => c.id === catId);
    const lvl = cat && (cat.levels || []).find((l) => l.id === lvlId);
    if (!lvl || !lvl.file) throw new Error('Chưa chọn Chương trình/Cấp độ');

    const images = new Set();
    step('Đang tải ngân hàng câu hỏi…');
    imagesFromText(await getJson('data/ic3/' + lvl.file), images);

    const manifest = JSON.parse(await getJson('data/ic3/minitests-manifest.json'));
    const files = manifest[catId + '__' + lvlId] || {};
    const rels = Object.keys(files).map((k) => files[k]);
    let n = 0;
    for (const rel of rels) {
      n++;
      step('Đang tải bài ' + n + '/' + rels.length + '…');
      try { imagesFromText(await getJson('data/ic3/' + rel), images); } catch (e) { /* bài lỗi: bỏ qua, các bài còn lại vẫn lưu */ }
    }
    images.forEach((u) => urls.add(u));
    return { urls: Array.from(urls), levelName: lvl.name || (catId + ' ' + lvlId), images: images.size, tests: rels.length };
  }

  function sendToSw(urls, onProgress) {
    return navigator.serviceWorker.ready.then((reg) => new Promise((resolve, reject) => {
      const sw = reg.active || navigator.serviceWorker.controller;
      if (!sw) { reject(new Error('Service Worker chưa sẵn sàng — tải lại trang rồi thử lại')); return; }
      let timer = setTimeout(() => { cleanup(); reject(new Error('Quá thời gian chờ — mạng quá chậm')); }, 5 * 60 * 1000);
      function cleanup() { clearTimeout(timer); navigator.serviceWorker.removeEventListener('message', onMsg); }
      function onMsg(ev) {
        const d = ev.data;
        if (!d || (d.type !== 'PRECACHE_PROGRESS' && d.type !== 'PRECACHE_DONE')) return;
        onProgress && onProgress(d);
        clearTimeout(timer);
        timer = setTimeout(() => { cleanup(); reject(new Error('Mất kết nối giữa chừng')); }, 60 * 1000);   // có tiến độ → gia hạn
        if (d.type === 'PRECACHE_DONE') { cleanup(); resolve(d); }
      }
      navigator.serviceWorker.addEventListener('message', onMsg);
      sw.postMessage({ type: 'PRECACHE', urls });
    }));
  }

  async function pack(catId, lvlId, onStatus) {
    const say = onStatus || function () {};
    if (!isSupported()) throw new Error('Trình duyệt này không hỗ trợ dùng offline');
    if (!navigator.onLine) throw new Error('Đang mất mạng — cần có mạng để tải sẵn');
    const info = await collectUrls(catId, lvlId, say);
    say('Đang lưu ' + info.urls.length + ' file…');
    const res = await sendToSw(info.urls, (d) => say('Đang lưu ' + d.done + '/' + d.total + ' file…'));
    const rec = { cat: catId, lvl: lvlId, name: info.levelName, at: Date.now(), total: res.total, failed: res.failed };
    try {
      const all = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
      all[catId + '__' + lvlId] = rec;
      localStorage.setItem(STORE_KEY, JSON.stringify(all));
    } catch (e) { /* localStorage đầy/bị chặn: vẫn đã lưu cache */ }
    return rec;
  }

  function lastPack(catId, lvlId) {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}')[catId + '__' + lvlId] || null; } catch (e) { return null; }
  }

  function fmtTime(ts) {
    try { return new Date(ts).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }); } catch (e) { return ''; }
  }

  function wireButton() {
    const btn = $('btnOfflinePack');
    const status = $('offlinePackStatus');
    if (!btn || !status) return;
    if (!isSupported()) { btn.hidden = true; return; }

    const sel = () => ({ cat: $('categorySelect') && $('categorySelect').value, lvl: $('levelSelect') && $('levelSelect').value });
    function refreshStatus() {
      const s = sel();
      if (!s.cat || !s.lvl) { status.textContent = ''; status.classList.remove('is-ready'); return; }
      const rec = lastPack(s.cat, s.lvl);
      status.classList.toggle('is-ready', !!rec && !rec.failed);
      status.textContent = rec
        ? '✓ Đã tải sẵn ' + rec.name + ' lúc ' + fmtTime(rec.at) + (rec.failed ? ' (thiếu ' + rec.failed + ' file — thử tải lại khi có mạng tốt)' : ' — dùng được khi mất mạng')
        : '';
    }

    let busy = false;
    btn.addEventListener('click', async () => {
      if (busy) return;
      const s = sel();
      if (!s.cat || !s.lvl) { status.textContent = 'Chọn Chương trình và Cấp độ trước đã.'; return; }
      busy = true; btn.disabled = true;
      try {
        const rec = await pack(s.cat, s.lvl, (t) => { status.textContent = t; });
        refreshStatus();
        if (rec.failed) status.textContent = '⚠ Đã lưu ' + (rec.total - rec.failed) + '/' + rec.total + ' file. ' + status.textContent;
      } catch (e) {
        status.textContent = 'Chưa tải được: ' + (e && e.message ? e.message : e);
      } finally { busy = false; btn.disabled = false; }
    });
    ['categorySelect', 'levelSelect'].forEach((id) => { const el = $(id); if (el) el.addEventListener('change', refreshStatus); });
    refreshStatus();
    setTimeout(refreshStatus, 1500);   // dropdown đổ dữ liệu bất đồng bộ
  }

  global.EduOffline = { pack, collectUrls, isSupported, lastPack };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wireButton);
  else wireButton();
})(window);
