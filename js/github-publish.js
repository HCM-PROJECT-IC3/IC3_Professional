/* ============================================================
   js/github-publish.js
   Đẩy 1 hoặc nhiều file tĩnh (data/ic3/*.json, ảnh câu hỏi...) lên GitHub
   trong ĐÚNG 1 commit — nút "📤 Xuất ra data/ic3" ở image-manager.html.

   VÌ SAO CẦN FILE TĨNH (không đổi): index.html là trang công khai, không
   đăng nhập — học sinh đọc câu hỏi/roster từ file tĩnh (0 lượt Firebase),
   firestore.rules CHỦ Ý không cho đọc thẳng các collection này.

   ĐI QUA APPS SCRIPT (apps/src/70-github.gs): token GitHub nằm trong Script
   Properties (GITHUB_TOKEN) của Apps Script, KHÔNG còn nằm trong trình duyệt
   (trước đây mỗi admin dán token vào localStorage — ai dùng được máy đó là có
   quyền ghi repo). Apps Script kiểm tra người gọi là admin (Firebase ID token)
   và chỉ cho ghi dưới data/ và img/.

   Nạp SAU js/backend-config.js, js/firebase-config.js,
   js/services/apps-script-client.js.
   ============================================================ */
(function (global) {
  'use strict';

  const GH_OWNER = 'HCM-PROJECT-IC3';
  const GH_REPO = 'IC3_Professional';
  const GH_BRANCH = 'main';
  // Token cũ còn sót trong trình duyệt từ trước đợt này — xoá đi, không dùng nữa.
  try { localStorage.removeItem('ic3_gh_publish_token'); } catch (e) { /* storage bị chặn */ }

  function apps() {
    if (!global.EduAppsScript) throw new Error('Thiếu js/services/apps-script-client.js');
    return global.EduAppsScript;
  }

  /** SHA git của 1 blob ("blob <độ dài>\0<nội dung>") — so được với sha GitHub trả về
   *  để biết file đang mở có còn khớp bản trên GitHub không (tính ở máy, không gọi mạng). */
  async function gitBlobSha(text) {
    const body = new TextEncoder().encode(text);
    const head = new TextEncoder().encode(`blob ${body.length}\0`);
    const all = new Uint8Array(head.length + body.length);
    all.set(head, 0);
    all.set(body, head.length);
    const digest = await crypto.subtle.digest('SHA-1', all);
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  /** Có đường đẩy GitHub không (Apps Script đã cấu hình). Token thật nằm ở Apps Script —
   *  nếu Apps Script chưa có GITHUB_TOKEN, fetchRaw()/publishFiles() báo lỗi rõ ràng và
   *  image-manager tự dùng bản trên trang web. */
  function hasToken() {
    return !!(global.EduBackend && global.EduBackend.appsScriptUrl);
  }

  /** Nội dung MỚI NHẤT của 1 file trên nhánh (không qua cache GitHub Pages ~10 phút). */
  async function fetchRaw(path) {
    const data = await apps().call('githubReadFile', { path });
    return data.text;
  }

  /**
   * Đẩy 1 hoặc nhiều file lên GitHub trong ĐÚNG 1 commit.
   * @param {Array<{path: string, content?: string, base64?: string}>} files path tương đối gốc repo;
   *   `content` cho file text, `base64` cho file nhị phân (ảnh).
   * @param {string} message nội dung commit message
   * @param {*} [_unused] giữ chỗ tham số token cũ (không còn dùng)
   * @param {{expectedShas?: Object<string,string>}} [opts] path → sha git của bản đã mở; nếu
   *   file trên nhánh đã khác (ai đó vừa đẩy bằng script/máy khác) thì DỪNG (err.code = 'conflict').
   * @returns {Promise<string>} sha commit mới
   */
  async function publishFiles(files, message, _unused, opts) {
    const payload = {
      files: files.map((f) => (f.base64 != null ? { path: f.path, base64: f.base64 } : { path: f.path, content: f.content })),
      message,
      expectedShas: (opts && opts.expectedShas) || {},
    };
    const data = await apps().call('githubPublish', payload, { timeoutMs: 5 * 60 * 1000 });
    return data.sha;
  }

  // Giữ tên cũ cho nơi gọi trước đây (không còn token ở trình duyệt).
  function getToken() { return null; }
  function forgetToken() { /* token nằm ở Apps Script */ }

  global.EduGitHubPublish = { publishFiles, fetchRaw, gitBlobSha, hasToken, getToken, forgetToken, OWNER: GH_OWNER, REPO: GH_REPO, BRANCH: GH_BRANCH };
})(window);
