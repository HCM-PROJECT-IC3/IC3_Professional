/* ============================================================
   js/services/backend-version-check.js
   Báo cho ADMIN khi Apps Script đang chạy thật CŨ HƠN bản web cần
   (EduBackend.expectedBackendVersion = BACKEND_VERSION trong apps/src/00-config.gs,
   test js/services/__tests__/backend-consistency.test.js giữ 2 số khớp nhau).

   Lỗi hay gặp nhất khi đổi cả 2 phía: push web nhưng quên dán apps/Code.gs + Deploy
   New version → API mới trả 'not-found', tính năng mới hỏng âm thầm (bài nộp vẫn nằm
   trong hàng đợi máy học sinh nên không ai thấy lỗi). Trước đây chỉ phát hiện được bằng
   tay: node scripts/check-deployed-backend.js.

   Chỉ admin, mỗi máy tối đa 1 lần/6 giờ (đang lệch: 30 phút để thanh báo tự tắt
   sau khi deploy) — GET ?action=ping công khai, không đọc/ghi Sheet, 0 lượt Firebase.
   Nạp SAU js/backend-config.js, trước khi auth-guard bắn "edu:ready".
   ============================================================ */
(function (global) {
  'use strict';

  const KEY = 'edu_backend_version_check';
  const OK_EVERY_MS = 6 * 60 * 60 * 1000;
  const STALE_EVERY_MS = 30 * 60 * 1000;

  function urls() {
    const b = global.EduBackend || {};
    const list = [b.appsScriptUrl].concat(Object.values((b.quizResults && b.quizResults.sheetEndpoints) || {}));
    return [...new Set(list.filter((u) => typeof u === 'string' && /^https:\/\/script\.google\.com\//.test(u)))];
  }

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; }
  }
  function save(v) {
    try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) { /* ẩn danh/khoá kho: lần sau kiểm lại */ }
  }

  async function ping(url) {
    try {
      const res = await fetch(url + '?action=ping', { signal: AbortSignal.timeout(20000) });
      const json = await res.json();
      return (json && json.data && json.data.version) || '?';
    } catch (e) {
      return null; // mạng lỗi: không kết luận gì, không báo nhầm
    }
  }

  /** Bản đang chạy cũ hơn bản web cần? (BACKEND_VERSION dạng "YYYY-MM-DD" → so chuỗi được) */
  const isStale = (got, want) => got !== null && (got === '?' || got < want);

  async function check() {
    const want = global.EduBackend && global.EduBackend.expectedBackendVersion;
    const list = urls();
    if (!want || !list.length) return;
    const last = load();
    const fresh = last && last.want === want && Array.isArray(last.stale)
      && Date.now() - last.at < (last.stale.length ? STALE_EVERY_MS : OK_EVERY_MS);
    let stale = fresh ? last.stale : null;
    if (!stale) {
      const got = await Promise.all(list.map(ping));
      stale = list.map((u, i) => ({ url: u, got: got[i] })).filter((r) => isStale(r.got, want));
      save({ at: Date.now(), want, stale });
    }
    if (stale.length) showBanner(stale, want);
  }

  function showBanner(stale, want) {
    if (sessionStorage.getItem(KEY + ':hidden') === want) return;
    const bar = document.createElement('div');
    bar.setAttribute('role', 'alert');
    bar.style.cssText = 'position:sticky;top:0;z-index:1000;display:flex;gap:.8rem;align-items:flex-start;'
      + 'padding:.7rem 1rem;background:#fff6e3;color:#5b4100;border-bottom:1px solid #f6a723;font-size:.88rem;line-height:1.45';
    const text = document.createElement('div');
    text.style.flex = '1';
    const which = stale.map((r) => `${r.url.slice(0, 58)}… đang chạy ${r.got === '?' ? 'bản quá cũ' : r.got}`).join('; ');
    text.innerHTML = '<strong>Apps Script chưa cập nhật.</strong> Web cần bản <b></b>, nhưng ' + '<span></span>. '
      + 'Tính năng mới có thể hỏng âm thầm. Cách sửa: mở Apps Script → dán <code>apps/Code.gs</code> → Save → '
      + 'chạy hàm <code>kiemTraSauDeploy</code> (đủ ✅) → Deploy → Manage deployments → ✏️ → <i>New version</i> (giữ URL).';
    text.querySelector('b').textContent = want;
    text.querySelector('span').textContent = which;
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = 'Ẩn';
    close.style.cssText = 'border:1px solid #c98a12;background:transparent;color:inherit;border-radius:6px;padding:.2rem .7rem;cursor:pointer;font:inherit';
    close.addEventListener('click', () => {
      try { sessionStorage.setItem(KEY + ':hidden', want); } catch (e) { /* bỏ qua */ }
      bar.remove();
    });
    bar.append(text, close);
    document.body.prepend(bar);
  }

  global.addEventListener('edu:ready', ({ detail }) => {
    if (!detail || !detail.profile || detail.profile.role !== 'admin') return;
    check().catch(() => { /* không bao giờ làm hỏng trang quản trị */ });
  });

  global.EduBackendVersionCheck = { check, isStale };
})(window);
