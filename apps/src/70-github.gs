// ====== ĐẨY DỮ LIỆU TĨNH LÊN GITHUB (image-manager.html — chỉ admin) ======
// Router: githubReadFile, githubPublish. Token GitHub nằm ở Script Properties
// (GITHUB_TOKEN) — trước đây mỗi admin dán token vào trình duyệt (localStorage), ai mở
// được máy đó là lấy được quyền ghi repo. Chỉ cho ghi dưới GITHUB_ALLOWED_PREFIXES
// (dữ liệu/ảnh), không ghi được code.

function githubToken_() {
  const token = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  if (!token) {
    throw appError_('failed-precondition',
      'Apps Script chưa có GITHUB_TOKEN (Project Settings → Script Properties).');
  }
  return token;
}

function githubRequest_(method, path, body, accept) {
  const res = UrlFetchApp.fetch('https://api.github.com/repos/' + GITHUB_OWNER + '/' + GITHUB_REPO + '/' + path, {
    method: method,
    contentType: 'application/json',
    payload: body ? JSON.stringify(body) : undefined,
    headers: { Authorization: 'Bearer ' + githubToken_(), Accept: accept || 'application/vnd.github+json' },
    muteHttpExceptions: true,
  });
  const code = res.getResponseCode();
  if (code === 401 || code === 403) throw appError_('failed-precondition', 'GITHUB_TOKEN không hợp lệ/hết quyền (' + code + ').');
  if (code >= 300) throw appError_('internal', 'GitHub API lỗi ' + code + ': ' + res.getContentText().slice(0, 200));
  return res;
}

function checkGithubPath_(path) {
  const p = String(path || '');
  const allowed = GITHUB_ALLOWED_PREFIXES.some(function (prefix) { return p.indexOf(prefix) === 0; });
  if (!allowed || p.indexOf('..') !== -1 || p.length > 300) {
    throw appError_('invalid-argument', 'Không được ghi/đọc đường dẫn: ' + p);
  }
  return p;
}

/** Nội dung MỚI NHẤT của 1 file trên nhánh (không qua cache GitHub Pages ~10 phút). p: { path } */
function githubReadFile_(p) {
  const path = checkGithubPath_(p.path);
  const res = githubRequest_('get', 'contents/' + path.split('/').map(encodeURIComponent).join('/') +
    '?ref=' + GITHUB_BRANCH, null, 'application/vnd.github.raw+json');
  return { text: res.getContentText('UTF-8') };
}

/**
 * Đẩy nhiều file trong ĐÚNG 1 commit.
 * p: { files: [{path, content?|base64?}], message, expectedShas?: {path: sha git bản đã mở} }
 * expectedShas: file trên nhánh đã khác (người khác vừa đẩy) → dừng, mã 'conflict'.
 */
function githubPublish_(p, who) {
  const files = Array.isArray(p.files) ? p.files : [];
  if (!files.length || files.length > 200) throw appError_('invalid-argument', 'Danh sách file rỗng hoặc quá nhiều (tối đa 200).');
  files.forEach(function (f) { checkGithubPath_(f.path); });
  const out = commitFiles_(files, p.message, p.expectedShas, who);
  auditServer_('publish_questions', who, { files: files.length, sha: out.sha });
  return out;
}

/**
 * Cập nhật danh sách học sinh cho trang làm bài (data/roster/students-active.json) —
 * nút "🚀 Cập nhật cho học sinh" ở roster-manager.html. Chỉ ADMIN: file dùng chung cho mọi
 * trường, điều phối chỉ thấy học sinh trường mình → đẩy lên sẽ làm mất học sinh trường khác.
 * Chỉ ghi ĐÚNG file này và chỉ nhận nội dung đúng dạng roster.
 * p: { content: chuỗi JSON { version, generatedAt, count, students:[{school, className, name}] } }
 */
function publishRoster_(p, who) {
  const content = String(p.content || '');
  if (!content || content.length > 5 * 1024 * 1024) throw appError_('invalid-argument', 'Roster rỗng hoặc quá lớn (tối đa 5 MB).');
  let data;
  try { data = JSON.parse(content); } catch (e) { throw appError_('invalid-argument', 'Roster không phải JSON hợp lệ.'); }
  const students = data && data.students;
  const ok = Array.isArray(students) && students.length > 0 && students.every(function (s) {
    return s && typeof s.name === 'string' && typeof s.className === 'string' && typeof s.school === 'string';
  });
  if (!ok) throw appError_('invalid-argument', 'Roster sai cấu trúc (cần students: [{school, className, name}]).');
  const out = commitFiles_([{ path: ROSTER_STATIC_PATH, content: content }],
    'chore(roster): cập nhật danh sách học sinh (' + students.length + ' em)', null, who);
  auditServer_('publish_roster', who, { students: students.length, sha: out.sha });
  return out;
}

/** Ghi nhiều file trong ĐÚNG 1 commit (dùng chung cho câu hỏi + roster). */
function commitFiles_(files, messageText, expectedShas, who) {
  // Khoá RIÊNG (user lock — Web App chạy dưới 1 tài khoản nên dùng chung cho mọi lượt gọi),
  // không dùng script lock của bài nộp: đẩy GitHub mất vài chục giây, học sinh nộp bài
  // lúc đó không được phải chờ. 2 admin bấm đẩy cùng lúc → lần lượt, không ghi đè nhau.
  const lock = LockService.getUserLock();
  lock.waitLock(30000);
  try {
    const ref = JSON.parse(githubRequest_('get', 'git/ref/heads/' + GITHUB_BRANCH).getContentText());
    const baseCommitSha = ref.object.sha;
    const baseTreeSha = JSON.parse(githubRequest_('get', 'git/commits/' + baseCommitSha).getContentText()).tree.sha;

    const expected = expectedShas || {};
    const expectedPaths = Object.keys(expected).filter(function (k) { return expected[k]; });
    if (expectedPaths.length) {
      const tree = JSON.parse(githubRequest_('get', 'git/trees/' + baseTreeSha + '?recursive=1').getContentText());
      const current = {};
      (tree.tree || []).forEach(function (t) { current[t.path] = t.sha; });
      const changed = expectedPaths.filter(function (k) { return current[k] && current[k] !== expected[k]; });
      if (changed.length) throw appError_('conflict', 'Dữ liệu trên GitHub đã thay đổi sau khi bạn mở trang: ' + changed.join(', '));
    }

    const treeItems = files.map(function (f) {
      const blob = f.base64 != null
        ? { content: String(f.base64), encoding: 'base64' }
        : { content: String(f.content || ''), encoding: 'utf-8' };
      const sha = JSON.parse(githubRequest_('post', 'git/blobs', blob).getContentText()).sha;
      return { path: f.path, mode: '100644', type: 'blob', sha: sha };
    });
    const newTree = JSON.parse(githubRequest_('post', 'git/trees', { base_tree: baseTreeSha, tree: treeItems }).getContentText());
    const message = String(messageText || 'chore(data): cập nhật từ trang quản lý').slice(0, 500) +
      '\n\nĐẩy qua Apps Script bởi tài khoản ' + who.uid;
    const commit = JSON.parse(githubRequest_('post', 'git/commits',
      { message: message, tree: newTree.sha, parents: [baseCommitSha] }).getContentText());
    githubRequest_('patch', 'git/refs/heads/' + GITHUB_BRANCH, { sha: commit.sha });
    return { sha: commit.sha };
  } finally {
    lock.releaseLock();
  }
}
