/* ============================================================
   js/github-publish.js
   Tiện ích DÙNG CHUNG để đẩy trực tiếp 1 hoặc nhiều file tĩnh lên
   GitHub qua REST API (Git Data API), thay cho quy trình thủ công
   "tải file → giải nén/chép đè → git commit → git push" mà
   roster-manager.html (data/roster/students-active.json) và
   image-manager.html (data/ic3/*.json + quiz_data.json) đang yêu cầu
   Điều phối đào tạo / Admin tự làm tay mỗi lần đổi dữ liệu.

   VÌ SAO CẦN FILE TĨNH (không đổi): index.html là trang công khai,
   không đăng nhập — firestore.rules CHỦ Ý không cho đọc thẳng
   "students_roster"/"questions" công khai nữa (vừa tránh nổ quota đọc
   Firestore free tier, vừa tránh lộ dữ liệu học sinh cho người lạ).
   File này KHÔNG đổi kiến trúc đó — chỉ tự động hoá bước "đẩy file
   tĩnh lên GitHub" bằng API thay vì thao tác tay, nên bảo mật/quota
   giữ nguyên như thiết kế ban đầu.

   Dùng Git Data API (không phải Contents API) để commit ĐƯỢC NHIỀU
   FILE CÙNG LÚC trong 1 commit duy nhất (Contents API mỗi lần gọi chỉ
   sửa được 1 file — image-manager.html cần ghi nhiều file data/ic3/*.json
   cùng lúc cho nhất quán).

   Cần 1 GitHub Personal Access Token (fine-grained, quyền "Contents:
   Read and write" TRÊN ĐÚNG REPO NÀY) — hỏi 1 lần qua prompt(), lưu ở
   localStorage trình duyệt (KHÔNG gửi đi đâu ngoài api.github.com,
   KHÔNG BAO GIỜ được commit vào repo).
   ============================================================ */
(function (global) {
  'use strict';

  const GH_OWNER = 'HCM-PROJECT-IC3';
  const GH_REPO = 'IC3_Professional';
  const GH_BRANCH = 'main';
  const GH_TOKEN_KEY = 'ic3_gh_publish_token';
  const API_BASE = `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}`;

  function getToken(forcePrompt) {
    let token = !forcePrompt && localStorage.getItem(GH_TOKEN_KEY);
    if (!token) {
      token = (prompt(
        'Dán GitHub Personal Access Token (fine-grained, quyền "Contents: Read and write" ' +
        `trên repo ${GH_OWNER}/${GH_REPO}).\n\n` +
        'Tạo tại: GitHub → Settings → Developer settings → Fine-grained tokens → ' +
        'Generate new token → Repository access: chỉ chọn repo này → Repository permissions → ' +
        'Contents: Read and write.\n\n' +
        'Token chỉ lưu trong trình duyệt này (localStorage), không gửi đi đâu ngoài GitHub.'
      ) || '').trim();
      if (token) localStorage.setItem(GH_TOKEN_KEY, token);
    }
    return token;
  }

  function forgetToken() {
    localStorage.removeItem(GH_TOKEN_KEY);
  }

  async function call(path, token, options) {
    const res = await fetch(`${API_BASE}/${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        ...(options && options.headers),
      },
    });
    if (res.status === 401 || res.status === 403) {
      forgetToken();
      const body = await res.json().catch(() => ({}));
      throw new Error(`Token GitHub không hợp lệ/hết quyền (${res.status}): ${body.message || ''}`);
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(`GitHub API lỗi ${res.status}: ${body.message || ''}`);
    }
    return res.json();
  }

  // Mã hoá theo từng đoạn: String.fromCharCode(...bytes) với file ~1MB (data/ic3/*.json)
  // vượt giới hạn số tham số của hàm → "Maximum call stack size exceeded".
  function bytesToBase64(bytes) {
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(bin);
  }

  function utf8ToBase64(str) {
    return bytesToBase64(new TextEncoder().encode(str));
  }

  /** SHA git của 1 blob ("blob <độ dài>\0<nội dung>") — so được với sha GitHub trả về
   *  mà KHÔNG cần token, để biết file đang mở có còn khớp bản trên GitHub không. */
  async function gitBlobSha(text) {
    const body = new TextEncoder().encode(text);
    const head = new TextEncoder().encode(`blob ${body.length}\0`);
    const all = new Uint8Array(head.length + body.length);
    all.set(head, 0);
    all.set(body, head.length);
    const digest = await crypto.subtle.digest('SHA-1', all);
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  function hasToken() {
    try { return !!localStorage.getItem(GH_TOKEN_KEY); } catch (e) { return false; }
  }

  /** Nội dung MỚI NHẤT của 1 file trên nhánh (không qua cache GitHub Pages ~10 phút). */
  async function fetchRaw(path, token) {
    const tok = token || getToken(false);
    if (!tok) throw new Error('Cần token GitHub.');
    const res = await fetch(`${API_BASE}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${GH_BRANCH}`, {
      headers: { Authorization: `Bearer ${tok}`, Accept: 'application/vnd.github.raw+json' },
      cache: 'no-store',
    });
    if (res.status === 401 || res.status === 403) { forgetToken(); throw new Error(`Token GitHub không hợp lệ/hết quyền (${res.status})`); }
    if (!res.ok) throw new Error(`GitHub API lỗi ${res.status} khi đọc ${path}`);
    return res.text();
  }

  /**
   * Đẩy 1 hoặc nhiều file lên GitHub trong ĐÚNG 1 commit.
   * @param {Array<{path: string, content?: string, base64?: string}>} files path tương đối gốc repo;
   *   `content` cho file text, `base64` cho file nhị phân (ảnh).
   * @param {string} message nội dung commit message
   * @param {string} [token] truyền sẵn nếu đã có (tránh hỏi lại), mặc định tự lấy/hỏi
   * @param {{expectedShas?: Object<string,string>}} [opts] path → sha git của bản đã mở; nếu
   *   file trên nhánh đã khác (ai đó vừa đẩy bằng script/máy khác) thì DỪNG, không ghi đè.
   */
  async function publishFiles(files, message, token, opts) {
    const tok = token || getToken(false);
    if (!tok) throw new Error('Đã huỷ — cần token GitHub để tự động cập nhật.');

    const ref = await call(`git/ref/heads/${GH_BRANCH}`, tok);
    const baseCommitSha = ref.object.sha;
    const baseCommit = await call(`git/commits/${baseCommitSha}`, tok);
    const baseTreeSha = baseCommit.tree.sha;

    const expected = (opts && opts.expectedShas) || {};
    const expectedPaths = Object.keys(expected);
    if (expectedPaths.length) {
      const tree = await call(`git/trees/${baseTreeSha}?recursive=1`, tok);
      const current = {};
      (tree.tree || []).forEach((t) => { current[t.path] = t.sha; });
      const changed = expectedPaths.filter((p) => expected[p] && current[p] && current[p] !== expected[p]);
      if (changed.length) {
        const err = new Error('Dữ liệu trên GitHub đã thay đổi sau khi bạn mở trang: ' + changed.join(', '));
        err.code = 'conflict';
        err.paths = changed;
        throw err;
      }
    }

    const blobs = await Promise.all(files.map(async (f) => {
      const blob = await call('git/blobs', tok, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: f.base64 != null ? f.base64 : utf8ToBase64(f.content), encoding: 'base64' }),
      });
      return { path: f.path, mode: '100644', type: 'blob', sha: blob.sha };
    }));
    const newTree = await call('git/trees', tok, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base_tree: baseTreeSha, tree: blobs }),
    });

    const newCommit = await call('git/commits', tok, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, tree: newTree.sha, parents: [baseCommitSha] }),
    });

    await call(`git/refs/heads/${GH_BRANCH}`, tok, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sha: newCommit.sha }),
    });

    return newCommit.sha;
  }

  global.EduGitHubPublish = { publishFiles, fetchRaw, gitBlobSha, hasToken, getToken, forgetToken, OWNER: GH_OWNER, REPO: GH_REPO, BRANCH: GH_BRANCH };
})(window);
