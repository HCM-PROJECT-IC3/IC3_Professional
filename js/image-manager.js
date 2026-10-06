/* ============================================================
   js/image-manager.js
   Công cụ quản lý CÂU HỎI + HÌNH ẢNH cho EduQuiz IC3.

   NGUỒN DỮ LIỆU DUY NHẤT: các file tĩnh data/ic3/ — ĐÚNG những file
   trang học sinh (index.html / js/quiz-engine.js) và mini-game đọc:
     - data/ic3/meta.json                         danh mục/khối/minitest + số câu
     - data/ic3/<cat>__<lvl>.json                 toàn bộ câu hỏi của 1 khối
     - data/ic3/minitests/<cat>_<lvl>/<slug>.json  1 minitest (quiz-engine ƯU TIÊN tải file này)
     - data/ic3/minitests-manifest.json           tên minitest → file ở trên

   VÌ SAO KHÔNG DÙNG FIRESTORE NỮA: collection "questions" được nhập 1 lần
   từ quiz_data.json cũ (04/09, 3.160 mục) với id = uid câu hỏi, nên các
   bản chép cùng uid (Tiết 1–8 dùng lại câu của chủ đề) bị gộp → chỉ còn
   1.102 document, và không có mọi câu thêm sau đó (Spark, Bài 1–35,
   MOS) — trong khi data/ic3/ có 6.071 mục. Mỗi lần mở trang còn tốn tới
   ~6.000 lượt đọc Firestore. Nút "Xuất" cũ đẩy bản Firestore đó ĐÈ lên
   data/ic3/ → học sinh sẽ mất phần lớn câu hỏi.

   QUY TRÌNH MỚI (0 lượt đọc/ghi Firestore cho câu hỏi):
     1. Mở trang: tải data/ic3/ (qua GitHub API nếu đã có token → luôn là
        bản mới nhất; nếu chưa có token thì tải từ chính trang web).
     2. Sửa/thêm/xoá/gắn ảnh: chỉ đổi trong trình duyệt + tự lưu BẢN NHÁP
        (IndexedDB) — đóng tab mở lại vẫn còn.
     3. Bấm "🚀 Đẩy thay đổi cho học sinh": chỉ các file THỰC SỰ đổi được
        commit lên GitHub (kèm ảnh "lưu thành file riêng"), có kiểm tra
        để KHÔNG ghi đè thay đổi người khác/script vừa đẩy.
   ============================================================ */

const COMMON_KEYS = ['id','uid','question','type','image','imageUrl','image_file','image_id','catName','gradeName','minitestName'];
// Field chỉ dùng cho giao diện trang này — bỏ ra trước khi ghi file tĩnh.
const UI_KEYS = ['catName', 'gradeName', 'minitestName', 'updatedAt'];
const TYPE_TEMPLATES = {
  single:    { options: ['', ''], correct: [] },
  multi:     { options: ['', ''], correct: [] },
  matching:  { pairs: [{ left: '', right: '' }] },
  truefalse: { statements: [{ text: '', answer: 'true' }], label_true: 'ĐÚNG', label_false: 'SAI' },
};

/* ============================================================
   STATE
   ============================================================ */
let QUESTIONS = [];       // flat list: { q, docId, fileKey } — q có thêm catName/gradeName/minitestName cho giao diện
let usedPictureNums = new Set();
let nextPictureCounter = 1;

const PAGE_SIZE = 20;
let currentPage = 1;
let filtered = [];

const state = { search: '', grade: '', minitest: '', status: '' };

const DATA_DIR = 'data/ic3/';
let META = null;            // meta.json đã tải
let MANIFEST = null;        // minitests-manifest.json đã tải (null nếu không có)
let ORIG = {};              // fileKey → cấu trúc gốc của file khối (thứ tự field, minitest, nội dung từng minitest)
let SOURCE = {};            // path → nội dung text đã tải (để biết file nào thật sự đổi)
let SOURCE_SHAS = {};       // path → sha git của bản đã tải (chống ghi đè thay đổi của người khác)
let LOADED_FROM = '';       // 'github' | 'site'
let PENDING_IMAGES = {};    // 'img/<tên file>' → base64 (ảnh "lưu thành file riêng", đẩy cùng lần publish)
let changedIds = new Set(); // docId đã sửa/thêm chưa đẩy
let deletedCount = 0;
let docSeq = 0;

const DRAFT_KEY = 'image-manager:draft';
const DRAFT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function newDocId(fileKey) { return `${fileKey}#${++docSeq}`; }

/* ============================================================
   BOOT — chờ auth-guard xác nhận đăng nhập rồi mới tải dữ liệu
   ============================================================ */
window.addEventListener('edu:ready', ({ detail }) => {
  const { user, profile } = detail;
  document.getElementById('whoami').textContent = `${profile.name || user.email} · ${EduAuth.ROLE_LABEL[profile.role]}`;
  loadQuestions();
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
  await EduAuth.logoutUser();
  window.location.href = 'login.html';
});

/* ============================================================
   TẢI DỮ LIỆU TỪ data/ic3/
   ============================================================ */
async function readSourceFile(path) {
  const gh = window.EduGitHubPublish;
  if (LOADED_FROM === 'github') return gh.fetchRaw(path);
  const res = await fetch(path, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Không tải được ${path} (${res.status})`);
  return res.text();
}

function levelsOf(meta) {
  const out = [];
  (meta.categories || []).forEach(cat => (cat.levels || []).forEach(lvl => out.push({ cat, lvl })));
  return out;
}

function fileKeyOf(cat, lvl) { return `${cat.id}__${lvl.id}`; }

/** "Tên danh mục" + "Tên khối" (hiện trên thẻ) → khối trong meta.json. */
function findLevelByNames(catName, gradeName) {
  return levelsOf(META).find(({ cat, lvl }) => cat.name === catName && lvl.name === gradeName) || null;
}

async function loadQuestions() {
  const loadState = document.getElementById('loadState');
  loadState.style.display = 'block';
  document.getElementById('app').style.display = 'none';
  const gh = window.EduGitHubPublish;
  LOADED_FROM = gh && gh.hasToken() ? 'github' : 'site';
  loadState.textContent = LOADED_FROM === 'github'
    ? '⏳ Đang tải ngân hàng câu hỏi mới nhất từ GitHub (data/ic3)…'
    : '⏳ Đang tải ngân hàng câu hỏi (data/ic3)…';
  try {
    let metaText;
    try {
      metaText = await readSourceFile(DATA_DIR + 'meta.json');
    } catch (err) {
      if (LOADED_FROM !== 'github') throw err;
      console.warn('[image-manager] Không đọc được qua GitHub API, dùng bản trên trang web:', err.message);
      LOADED_FROM = 'site';
      metaText = await readSourceFile(DATA_DIR + 'meta.json');
    }
    META = JSON.parse(metaText);
    const levels = levelsOf(META);
    const manifestPath = DATA_DIR + 'minitests-manifest.json';
    const [texts, manifestText] = await Promise.all([
      Promise.all(levels.map(({ lvl }) => readSourceFile(DATA_DIR + lvl.file))),
      readSourceFile(manifestPath).catch(() => null),
    ]);

    SOURCE = { [DATA_DIR + 'meta.json']: metaText };
    MANIFEST = manifestText ? JSON.parse(manifestText) : null;
    if (manifestText) SOURCE[manifestPath] = manifestText;
    ORIG = {};
    QUESTIONS = [];
    docSeq = 0;
    levels.forEach(({ cat, lvl }, i) => {
      const path = DATA_DIR + lvl.file;
      SOURCE[path] = texts[i];
      const data = JSON.parse(texts[i]);
      const fileKey = fileKeyOf(cat, lvl);
      // Ghi nhớ bản gốc TRƯỚC khi gắn field giao diện vào từng câu — để khi đẩy chỉ
      // ghi lại đúng file/minitest thật sự đổi, giữ nguyên thứ tự field như file cũ.
      const head = {};
      Object.keys(data).forEach(k => { if (k !== 'minitests') head[k] = data[k]; });
      const mtStrings = {};
      Object.keys(data.minitests || {}).forEach(n => { mtStrings[n] = JSON.stringify(data.minitests[n]); });
      ORIG[fileKey] = { path, cat, lvl, keys: Object.keys(data), head, mtNames: Object.keys(data.minitests || {}), mtStrings };
      Object.keys(data.minitests || {}).forEach(mtName => {
        (data.minitests[mtName] || []).forEach(q => {
          QUESTIONS.push({
            q: Object.assign(q, { catName: cat.name, gradeName: lvl.name, minitestName: mtName }),
            docId: newDocId(fileKey),
            fileKey,
          });
        });
      });
    });

    SOURCE_SHAS = {};
    await Promise.all(Object.keys(SOURCE).map(async path => {
      SOURCE_SHAS[path] = gh ? await gh.gitBlobSha(SOURCE[path]) : null;
    }));

    changedIds = new Set();
    deletedCount = 0;
    PENDING_IMAGES = {};
    await restoreDraftIfAny();

    scanUsedPictureNumbers();
    loadState.style.display = 'none';
    document.getElementById('app').style.display = 'block';
    buildFilterOptions();
    applyFilters();
    updatePublishButton();
    console.info(`[image-manager] Đã tải ${QUESTIONS.length} mục câu hỏi từ data/ic3 (${LOADED_FROM}) — 0 lượt đọc Firestore.`);
  } catch (err) {
    console.error(err);
    loadState.textContent = '⚠️ Lỗi tải ngân hàng câu hỏi: ' + err.message;
  }
}

/* ============================================================
   BẢN NHÁP (IndexedDB) — giữ thay đổi chưa đẩy qua F5/đóng tab
   ============================================================ */
let draftTimer = null;

function snapshotQuestions() {
  return QUESTIONS.map(({ q, docId, fileKey }) => ({ q, docId, fileKey }));
}

function saveDraftSoon() {
  clearTimeout(draftTimer);
  draftTimer = setTimeout(() => {
    if (!window.EduDataCache) return;
    if (!changedIds.size && !deletedCount && !Object.keys(PENDING_IMAGES).length) {
      window.EduDataCache.clear(DRAFT_KEY, true);
      return;
    }
    window.EduDataCache.setAsync(DRAFT_KEY, {
      baseShas: SOURCE_SHAS,
      questions: snapshotQuestions(),
      changedIds: [...changedIds],
      deletedCount,
      pendingImages: PENDING_IMAGES,
      savedAt: Date.now(),
    }, DRAFT_TTL_MS, true);
  }, 800);
}

/** Đánh dấu thay đổi chưa đẩy (+ lưu nháp, cập nhật nút đẩy). */
function markChanged(item) {
  if (item) changedIds.add(item.docId);
  saveDraftSoon();
  updatePublishButton();
}

async function restoreDraftIfAny() {
  if (!window.EduDataCache) return;
  const draft = await window.EduDataCache.getAsync(DRAFT_KEY, true);
  if (!draft || !Array.isArray(draft.questions)) return;
  const sameBase = Object.keys(SOURCE_SHAS).every(p => !SOURCE_SHAS[p] || !draft.baseShas || draft.baseShas[p] === SOURCE_SHAS[p]);
  if (sameBase) {
    QUESTIONS = draft.questions;
    docSeq = QUESTIONS.reduce((m, x) => Math.max(m, Number(String(x.docId).split('#')[1]) || 0), 0);
    changedIds = new Set(draft.changedIds || []);
    deletedCount = draft.deletedCount || 0;
    PENDING_IMAGES = draft.pendingImages || {};
    toast(`📝 Đã khôi phục bản nháp chưa đẩy (${changedIds.size} câu sửa/thêm, ${deletedCount} câu xoá)`, 6000);
    return;
  }
  // Dữ liệu gốc đã đổi (ai đó vừa đẩy) — không tự áp bản nháp lên dữ liệu mới, cho tải về để không mất.
  if (confirm('Có BẢN NHÁP chưa đẩy, nhưng ngân hàng câu hỏi trên GitHub đã thay đổi kể từ lúc tạo bản nháp.\n\n' +
      'Bấm OK để TẢI bản nháp về máy (file JSON — có thể nhập lại bằng "⬆️ Tải JSON cập nhật"), rồi bỏ bản nháp.\n' +
      'Bấm Huỷ để giữ bản nháp (chưa làm gì).')) {
    downloadJson(buildBackupTree(draft.questions), `ban-nhap-cau-hoi-${new Date().toISOString().slice(0, 10)}.json`);
    window.EduDataCache.clear(DRAFT_KEY, true);
  }
}

/* ============================================================
   GOM CÂY DỮ LIỆU (categories→levels→minitests) THÀNH DANH SÁCH PHẲNG
   ────────────────────────────────────────────────────────────
   Dùng cho "⬆️ Tải JSON cập nhật". Nhận 2 dạng file:
     1. Cây đầy đủ  { categories: [ { levels: [ { minitests: {...} } ] } ] }
        — đúng dạng quiz_data.json / file "Sao lưu JSON" tải xuống.
     2. 1 khối lẻ   { id, name, grade, cat_id, minitests: {...} }
        — đúng dạng từng file data/ic3/<cat>__<lvl>.json.
   ============================================================ */
function flattenQuestionTree(data) {
  let categories;
  if (Array.isArray(data?.categories)) {
    categories = data.categories;
  } else if (data?.minitests && typeof data.minitests === 'object') {
    const catId = data.cat_id || data.catId || '(chưa rõ)';
    const lvlId = data.id || data.grade || '(chưa rõ)';
    const found = levelsOf(META).find(({ cat, lvl }) => cat.id === catId && lvl.id === lvlId);
    categories = [{
      id: catId,
      name: found ? found.cat.name : catId,
      levels: [{ id: lvlId, grade: data.grade || lvlId, name: found ? found.lvl.name : (data.name || lvlId), minitests: data.minitests }],
    }];
  } else {
    throw new Error('Không nhận diện được định dạng file JSON (cần có "categories" hoặc "minitests").');
  }

  const flat = [];
  categories.forEach(cat => {
    (cat.levels || []).forEach(lvl => {
      const mts = lvl.minitests || {};
      Object.keys(mts).forEach(mtName => {
        (mts[mtName] || []).forEach(q => {
          flat.push(Object.assign({}, q, {
            catName: cat.name || cat.id || '',
            gradeName: lvl.name || lvl.grade || lvl.id || '',
            minitestName: mtName,
          }));
        });
      });
    });
  });
  return flat;
}

/* ============================================================
   UPLOAD JSON — THAY nội dung các khối có trong file (bản "Sao lưu JSON"
   đã sửa offline, bản nháp tải về, hoặc 1 file data/ic3/<cat>__<lvl>.json).
   Chỉ đổi trong trình duyệt — bấm "🚀 Đẩy thay đổi" để học sinh thấy.
   ============================================================ */
document.getElementById('uploadJsonBtn').addEventListener('click', () => {
  document.getElementById('uploadJsonInput').click();
});
document.getElementById('uploadJsonInput').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  e.target.value = ''; // cho phép chọn lại đúng file đó lần sau vẫn nổ sự kiện 'change'
  if (!file) return;
  try {
    let data;
    try { data = JSON.parse(await file.text()); } catch { throw new Error('File không phải JSON hợp lệ.'); }
    const flat = flattenQuestionTree(data);
    if (!flat.length) throw new Error('Không tìm thấy câu hỏi nào trong file.');

    // Gom theo khối; khối nào không có trong meta.json thì từ chối (tránh tạo file lạ).
    const byFile = new Map();
    const unknown = new Set();
    flat.forEach(q => {
      const found = findLevelByNames(q.catName, q.gradeName);
      if (!found) { unknown.add(`${q.catName} / ${q.gradeName}`); return; }
      const key = fileKeyOf(found.cat, found.lvl);
      if (!byFile.has(key)) byFile.set(key, []);
      byFile.get(key).push(q);
    });
    if (unknown.size) throw new Error('Khối không có trong data/ic3/meta.json: ' + [...unknown].join(', '));

    const lines = [...byFile.keys()].map(key => {
      const before = QUESTIONS.filter(x => x.fileKey === key).length;
      return `- ${key}: ${before} → ${byFile.get(key).length} mục`;
    });
    if (!confirm(`File "${file.name}" sẽ THAY TOÀN BỘ câu hỏi của ${byFile.size} khối:\n${lines.join('\n')}\n\n` +
        'Chỉ đổi trong trình duyệt (bản nháp) — sau đó bấm "🚀 Đẩy thay đổi" để học sinh thấy. Tiếp tục?')) return;

    byFile.forEach((qs, key) => {
      deletedCount += QUESTIONS.filter(x => x.fileKey === key).length;
      QUESTIONS = QUESTIONS.filter(x => x.fileKey !== key);
      qs.forEach(q => {
        const item = { q, docId: newDocId(key), fileKey: key };
        QUESTIONS.push(item);
        changedIds.add(item.docId);
      });
    });
    markChanged();
    scanUsedPictureNumbers();
    buildFilterOptions();
    applyFilters();
    toast(`✅ Đã nạp ${flat.length} mục vào ${byFile.size} khối (bản nháp) — bấm "🚀 Đẩy thay đổi" khi xong.`, 6000);
  } catch (err) {
    console.error(err);
    toast('❌ Lỗi tải JSON lên: ' + err.message, 6000);
  }
});

function scanUsedPictureNumbers() {
  usedPictureNums = new Set();
  QUESTIONS.forEach(({ q }) => {
    const id = q.image_id || '';
    const m = /^Upload(\d+)$/.exec(id);
    if (m) usedPictureNums.add(parseInt(m[1], 10));
  });
  let n = 1;
  while (usedPictureNums.has(n)) n++;
  nextPictureCounter = n;
}
function claimNextPictureNumber() {
  let n = nextPictureCounter;
  while (usedPictureNums.has(n)) n++;
  usedPictureNums.add(n);
  nextPictureCounter = n + 1;
  return n;
}

/* ============================================================
   FILTER OPTIONS
   ============================================================ */
function buildFilterOptions() {
  const grades = [...new Set(QUESTIONS.map(x => x.q.gradeName).filter(Boolean))];
  const gSel = document.getElementById('gradeFilter');
  gSel.innerHTML = '<option value="">Tất cả khối</option>' +
    grades.map(g => `<option value="${escAttr(g)}">${esc(g)}</option>`).join('');

  const mts = [...new Set(QUESTIONS.map(x => x.q.minitestName).filter(Boolean))];
  const mSel = document.getElementById('minitestFilter');
  mSel.innerHTML = '<option value="">Tất cả Minitest</option>' +
    mts.map(m => `<option value="${escAttr(m)}">${esc(m)}</option>`).join('');
}

function questionStatus(q) {
  if (q.imageUrl) return 'have';
  if (q.image === true) return 'need';
  return 'skip';
}

/* ============================================================
   FILTER + RENDER
   ============================================================ */
function applyFilters() {
  const s = state.search.trim().toLowerCase();
  filtered = QUESTIONS.filter(item => {
    if (state.grade && item.q.gradeName !== state.grade) return false;
    if (state.minitest && item.q.minitestName !== state.minitest) return false;
    if (state.status && questionStatus(item.q) !== state.status) return false;
    if (s && !(item.q.question || '').toLowerCase().includes(s)) return false;
    return true;
  });
  currentPage = 1;
  renderStats();
  renderList();
}

function renderStats() {
  let need = 0, have = 0, skip = 0;
  QUESTIONS.forEach(({ q }) => {
    const st = questionStatus(q);
    if (st === 'need') need++;
    else if (st === 'have') have++;
    else skip++;
  });
  document.getElementById('statTotal').textContent = QUESTIONS.length;
  const uniqueEl = document.getElementById('statUnique');
  if (uniqueEl) uniqueEl.textContent = new Set(QUESTIONS.map(({ q, fileKey }) => fileKey + '|' + (q.uid || q.question))).size;
  document.getElementById('statNeed').textContent = need;
  document.getElementById('statHave').textContent = have;
  document.getElementById('statSkip').textContent = skip;
}

function renderList() {
  const list = document.getElementById('qlist');
  const empty = document.getElementById('emptyState');
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  currentPage = Math.min(currentPage, totalPages);
  const startIdx = (currentPage - 1) * PAGE_SIZE;
  const pageItems = filtered.slice(startIdx, startIdx + PAGE_SIZE);

  document.getElementById('pageInfo').textContent =
    filtered.length ? `Trang ${currentPage}/${totalPages} — ${filtered.length} câu` : 'Không có kết quả';
  document.getElementById('prevPage').disabled = currentPage <= 1;
  document.getElementById('nextPage').disabled = currentPage >= totalPages;

  if (!pageItems.length) {
    list.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  list.innerHTML = pageItems.map(item => renderCard(item)).join('');
  pageItems.forEach(item => wireCard(item));
}

/* ============================================================
   CARD RENDER — chỉnh được toàn bộ dữ liệu, không chỉ ảnh
   ============================================================ */
function extraFieldsOf(q) {
  const out = {};
  Object.keys(q).forEach(k => { if (!COMMON_KEYS.includes(k)) out[k] = q[k]; });
  return out;
}

function renderCard(item) {
  const { q, docId } = item;
  const status = questionStatus(q);
  const tagHtml = status === 'have'
    ? '<span class="qtag have">✅ Đã có ảnh</span>'
    : status === 'need'
      ? '<span class="qtag need">🟡 Cần ảnh</span>'
      : '<span class="qtag skip">— Không cần</span>';

  const imgSrc = PENDING_IMAGES[q.imageUrl] || q.imageUrl;
  const imgHtml = q.imageUrl
    ? `<img src="${escAttr(imgSrc)}" alt="preview">`
    : `<div class="qimg-placeholder">🖼️</div>`;
  const fname = q.image_file ? `<div class="fname">${esc(q.image_file)}</div>` : '';

  const isStructured = q.type === 'single' || q.type === 'multi';
  const options = Array.isArray(q.options) ? q.options : [];
  const correct = Array.isArray(q.correct) ? q.correct : [];

  const optionsHtml = options.map((opt, i) => `
    <div class="opt-row" data-opt-idx="${i}">
      <input type="${q.type === 'multi' ? 'checkbox' : 'radio'}" class="optCorrect" name="correct-${docId}" ${correct.includes(opt) ? 'checked' : ''}>
      <input type="text" class="optText" value="${escAttr(opt)}" placeholder="Nội dung lựa chọn ${i + 1}">
      <button type="button" class="removeOptBtn" title="Xoá lựa chọn">✕</button>
    </div>`).join('');

  const extraObj = extraFieldsOf(q);
  const advJson = esc(JSON.stringify(extraObj, null, 2));

  return `
  <div class="qcard" data-docid="${escAttr(docId)}">
    <div class="qimg-area" id="imgArea-${escAttr(docId)}">
      ${imgHtml}
      ${fname}
    </div>
    <div class="qbody">
      <div class="qmeta-edit">
        <input class="metaInput" data-field="catName" value="${escAttr(q.catName || '')}" placeholder="Danh mục">
        <input class="metaInput" data-field="gradeName" value="${escAttr(q.gradeName || '')}" placeholder="Khối/Lớp">
        <input class="metaInput" data-field="minitestName" value="${escAttr(q.minitestName || '')}" placeholder="Minitest">
      </div>
      <textarea class="questionInput" placeholder="Nội dung câu hỏi...">${esc(q.question || '')}</textarea>
      <select class="typeSelect">
        <option value="single" ${q.type === 'single' ? 'selected' : ''}>Chọn 1 đáp án</option>
        <option value="multi" ${q.type === 'multi' ? 'selected' : ''}>Chọn nhiều đáp án</option>
        <option value="matching" ${q.type === 'matching' ? 'selected' : ''}>Nối cặp (matching)</option>
        <option value="truefalse" ${q.type === 'truefalse' ? 'selected' : ''}>Đúng / Sai</option>
      </select>

      <div class="optionsEditor" style="${isStructured ? '' : 'display:none'}">
        ${optionsHtml}
        <button type="button" class="addOptBtn">➕ Thêm lựa chọn</button>
      </div>

      <button type="button" class="advToggle">${isStructured ? '🛠️ Sửa dữ liệu nâng cao (JSON)' : '🛠️ Sửa dữ liệu (JSON) — loại câu hỏi này chỉnh qua đây'}</button>
      <div class="advBox ${isStructured ? '' : 'open'}">
        <textarea class="advTextarea" spellcheck="false">${advJson}</textarea>
      </div>

      <div class="qbreadcrumb"><span>Câu ${esc(q.id ?? '?')}</span><span>${esc(q.uid || '')}</span>${changedIds.has(docId) ? '<span class="qtag need">✏️ Chưa đẩy</span>' : ''}</div>
      ${tagHtml}

      <div class="qactions">
        <label class="upload-label">
          📤 Tải ảnh lên
          <input type="file" accept="image/*" class="fileInput">
        </label>
        ${q.imageUrl ? `<button type="button" class="btn btn-danger btn-sm removeImgBtn">🗑️ Xoá ảnh</button>` : ''}
        <button type="button" class="btn btn-ghost btn-sm toggleSkipBtn">
          ${status === 'skip' ? '➕ Đánh dấu cần minh hoạ' : '🚫 Không cần minh hoạ'}
        </button>
        <button type="button" class="btn saveBtn btn-sm saveQBtn">💾 Lưu câu hỏi</button>
        <button type="button" class="btn btn-danger btn-sm deleteQBtn">🗑️ Xoá câu hỏi</button>
      </div>
      <div class="url-row">
        <input type="text" class="urlInput" placeholder="...hoặc dán link ảnh (URL) rồi nhấn Enter" value="${q.imageUrl && !q.imageUrl.startsWith('data:') && !q.imageUrl.startsWith('img/') ? escAttr(q.imageUrl) : ''}">
      </div>
      <div class="pending-box" style="display:none"></div>
    </div>
  </div>`;
}

function wireCard(item) {
  const { q, docId } = item;
  const card = document.querySelector(`.qcard[data-docid="${cssEsc(docId)}"]`);
  if (!card) return;

  const fileInput = card.querySelector('.fileInput');
  fileInput.addEventListener('change', (e) => onFilePicked(item, e.target.files[0]));

  const removeImgBtn = card.querySelector('.removeImgBtn');
  if (removeImgBtn) removeImgBtn.addEventListener('click', async () => {
    delete item.q.imageUrl;
    delete item.q.image_file;
    delete item.q.image_id;
    persistQuestion(item);
    renderStats();
    refreshCard(item);
    toast('Đã xoá ảnh của câu ' + (item.q.id ?? ''));
  });

  const toggleBtn = card.querySelector('.toggleSkipBtn');
  toggleBtn.addEventListener('click', async () => {
    const st = questionStatus(item.q);
    if (st === 'skip') {
      item.q.image = true;
    } else {
      item.q.image = false;
      delete item.q.imageUrl; delete item.q.image_file; delete item.q.image_id;
    }
    persistQuestion(item);
    renderStats();
    refreshCard(item);
  });

  const urlInput = card.querySelector('.urlInput');
  urlInput.addEventListener('keydown', async (e) => {
    if (e.key !== 'Enter') return;
    const val = urlInput.value.trim();
    if (!val) return;
    item.q.imageUrl = val;
    item.q.image = true;
    delete item.q.image_file; delete item.q.image_id;
    persistQuestion(item);
    renderStats();
    refreshCard(item);
    toast('Đã gắn ảnh từ URL cho câu ' + (item.q.id ?? ''));
  });

  // Options editor (single/multi)
  const optionsEditor = card.querySelector('.optionsEditor');
  wireOptionsEditor(optionsEditor, card, item.q.type);

  card.querySelector('.addOptBtn').addEventListener('click', () => {
    const row = document.createElement('div');
    row.className = 'opt-row';
    const type = card.querySelector('.typeSelect').value;
    row.innerHTML = `
      <input type="${type === 'multi' ? 'checkbox' : 'radio'}" class="optCorrect" name="correct-${docId}">
      <input type="text" class="optText" placeholder="Nội dung lựa chọn mới">
      <button type="button" class="removeOptBtn" title="Xoá lựa chọn">✕</button>`;
    optionsEditor.insertBefore(row, card.querySelector('.addOptBtn'));
    wireOptRow(row, card);
  });

  // Type select toggles which editor shows
  const typeSelect = card.querySelector('.typeSelect');
  const advBox = card.querySelector('.advBox');
  const advToggleBtn = card.querySelector('.advToggle');
  typeSelect.addEventListener('change', () => {
    const t = typeSelect.value;
    const structured = t === 'single' || t === 'multi';
    optionsEditor.style.display = structured ? '' : 'none';
    if (!structured) {
      advBox.classList.add('open');
      const ta = advBox.querySelector('.advTextarea');
      if (!ta.value.trim() || ta.value.trim() === '{}') {
        ta.value = JSON.stringify(TYPE_TEMPLATES[t] || {}, null, 2);
      }
    }
    advToggleBtn.textContent = structured ? '🛠️ Sửa dữ liệu nâng cao (JSON)' : '🛠️ Sửa dữ liệu (JSON) — loại câu hỏi này chỉnh qua đây';
  });

  advToggleBtn.addEventListener('click', () => advBox.classList.toggle('open'));

  card.querySelector('.saveQBtn').addEventListener('click', () => saveCardData(item, card));
  card.querySelector('.deleteQBtn').addEventListener('click', () => deleteQuestion(item));
}

function wireOptionsEditor(container, card) {
  container.querySelectorAll('.opt-row').forEach(row => wireOptRow(row, card));
}
function wireOptRow(row, card) {
  row.querySelector('.removeOptBtn').addEventListener('click', () => row.remove());
  const typeSelect = card.querySelector('.typeSelect');
  const radioLike = row.querySelector('.optCorrect');
  if (typeSelect.value === 'single') {
    radioLike.addEventListener('change', () => {
      card.querySelectorAll('.optCorrect').forEach(cb => { if (cb !== radioLike) cb.checked = false; });
    });
  }
}

function refreshCard(item) {
  const card = document.querySelector(`.qcard[data-docid="${cssEsc(item.docId)}"]`);
  if (!card) return;
  const wrap = document.createElement('div');
  wrap.innerHTML = renderCard(item).trim();
  card.replaceWith(wrap.firstElementChild);
  wireCard(item);
}

/* ============================================================
   SAVE (Thêm/Sửa) — chỉ đổi trong trình duyệt (bản nháp), bấm
   "🚀 Đẩy thay đổi" để ghi lên data/ic3/ cho học sinh.
   ============================================================ */

/** Các bản chép CÙNG uid trong cùng khối (Tiết 1–8 dùng lại nguyên câu của chủ đề) —
 *  sửa 1 bản thì cập nhật luôn các bản kia để mọi bài thi hiện cùng 1 nội dung. */
function copiesOf(item) {
  if (!item.q.uid) return [];
  return QUESTIONS.filter(x => x !== item && x.fileKey === item.fileKey && x.q.uid === item.q.uid);
}

function syncCopies(item) {
  const copies = copiesOf(item);
  copies.forEach(copy => {
    const keep = { catName: copy.q.catName, gradeName: copy.q.gradeName, minitestName: copy.q.minitestName };
    Object.keys(copy.q).forEach(k => delete copy.q[k]);
    Object.assign(copy.q, JSON.parse(JSON.stringify(item.q)), keep);
    changedIds.add(copy.docId);
  });
  return copies.length;
}

/** Gọi SAU khi đã sửa item.q tại chỗ (ảnh, đánh dấu cần/không cần minh hoạ...). */
function persistQuestion(item) {
  const n = syncCopies(item);
  markChanged(item);
  if (n) toast(`✏️ Đã áp dụng cho cả ${n} bản chép của câu này (cùng mã ${item.q.uid}) — nhớ "🚀 Đẩy thay đổi"`);
}

async function saveCardData(item, card) {
  const btn = card.querySelector('.saveQBtn');
  try {
    const catName = card.querySelector('[data-field="catName"]').value.trim();
    const gradeName = card.querySelector('[data-field="gradeName"]').value.trim();
    const minitestName = card.querySelector('[data-field="minitestName"]').value.trim();
    const question = card.querySelector('.questionInput').value.trim();
    const type = card.querySelector('.typeSelect').value;

    const target = findLevelByNames(catName, gradeName);
    if (!target) {
      throw new Error(`Không có khối "${catName} / ${gradeName}" trong data/ic3. Khối hợp lệ: ` +
        levelsOf(META).map(({ cat, lvl }) => `${cat.name} / ${lvl.name}`).join('; '));
    }
    if (!minitestName) throw new Error('Cần nhập tên Minitest/bài');

    const localPatch = { catName, gradeName, minitestName, question, type };
    const deleteKeys = []; // field cần xoá khỏi câu hỏi

    if (type === 'single' || type === 'multi') {
      const rows = [...card.querySelectorAll('.opt-row')];
      const options = rows.map(r => r.querySelector('.optText').value.trim()).filter(Boolean);
      const correct = rows
        .filter(r => r.querySelector('.optCorrect').checked)
        .map(r => r.querySelector('.optText').value.trim())
        .filter(Boolean);
      if (!options.length) throw new Error('Cần ít nhất 1 lựa chọn');
      if (!correct.length) throw new Error('Chưa chọn đáp án đúng');
      localPatch.options = options;
      localPatch.correct = correct;
      deleteKeys.push('pairs', 'statements', 'label_true', 'label_false');
    } else {
      const raw = card.querySelector('.advTextarea').value.trim() || '{}';
      let extra;
      try { extra = JSON.parse(raw); } catch (e) { throw new Error('JSON nâng cao không hợp lệ: ' + e.message); }
      Object.assign(localPatch, extra);
      deleteKeys.push('options', 'correct');
    }

    deleteKeys.forEach(k => delete item.q[k]);
    Object.assign(item.q, localPatch);
    const newKey = fileKeyOf(target.cat, target.lvl);
    if (newKey !== item.fileKey) {
      // Chuyển sang khối khác: tách khỏi nhóm bản chép cũ bằng uid mới.
      item.q.uid = `${newKey.toLowerCase()}__moved__q${item.q.id ?? ''}_${Date.now().toString(36)}`;
      item.fileKey = newKey;
    }
    const n = syncCopies(item);
    markChanged(item);
    buildFilterOptions();
    toast(`✅ Đã lưu câu ${item.q.id ?? ''}${n ? ` (+ ${n} bản chép)` : ''} vào bản nháp — bấm "🚀 Đẩy thay đổi" để học sinh thấy`);
    refreshCard(item);
  } catch (err) {
    console.error(err);
    toast('❌ ' + err.message, 6000);
    btn.disabled = false;
    btn.textContent = '💾 Lưu câu hỏi';
  }
}

function deleteQuestion(item) {
  const others = copiesOf(item).length;
  if (!confirm(`Xoá câu này khỏi "${item.q.minitestName}"?` +
      (others ? `\n(Câu này còn ${others} bản chép ở bài khác — các bản đó GIỮ NGUYÊN.)` : '') +
      '\n\nChỉ xoá trong bản nháp — bấm "🚀 Đẩy thay đổi" để áp dụng cho học sinh.')) return;
  QUESTIONS = QUESTIONS.filter(x => x.docId !== item.docId);
  if (changedIds.has(item.docId)) changedIds.delete(item.docId);
  deletedCount++;
  markChanged();
  applyFilters();
  toast('🗑️ Đã xoá câu hỏi (bản nháp)');
}

/* ============================================================
   THÊM CÂU HỎI MỚI
   ============================================================ */
document.getElementById('addQuestionBtn').addEventListener('click', () => {
  const box = document.getElementById('newQuestionBox');
  if (box.innerHTML.trim()) { box.innerHTML = ''; return; }
  const levelOptions = levelsOf(META).map(({ cat, lvl }) => {
    const v = `${cat.name}|||${lvl.name}`;
    return `<option value="${escAttr(v)}" ${state.grade === lvl.name ? 'selected' : ''}>${esc(cat.name)} / ${esc(lvl.name)}</option>`;
  }).join('');
  box.innerHTML = `
    <div class="new-q-form">
      <div class="row2">
        <select id="newLevel">${levelOptions}</select>
        <input type="text" id="newMinitest" placeholder="Minitest / bài (vd: 1. Căn bản về công nghệ)" value="${escAttr(state.minitest)}">
      </div>
      <textarea class="questionInput" id="newQuestionText" placeholder="Nội dung câu hỏi mới..."></textarea>
      <select class="typeSelect" id="newType">
        <option value="single">Chọn 1 đáp án</option>
        <option value="multi">Chọn nhiều đáp án</option>
        <option value="matching">Nối cặp (matching)</option>
        <option value="truefalse">Đúng / Sai</option>
      </select>
      <div class="row2">
        <button type="button" class="btn btn-primary btn-sm" id="createQBtn">✅ Tạo câu hỏi (bản nháp)</button>
        <button type="button" class="btn btn-ghost btn-sm" id="cancelQBtn">Huỷ</button>
      </div>
    </div>`;

  document.getElementById('cancelQBtn').addEventListener('click', () => { box.innerHTML = ''; });

  document.getElementById('createQBtn').addEventListener('click', () => {
    const [catName, gradeName] = document.getElementById('newLevel').value.split('|||');
    const minitestName = document.getElementById('newMinitest').value.trim();
    const question = document.getElementById('newQuestionText').value.trim();
    const type = document.getElementById('newType').value;
    if (!question) { toast('❌ Cần nhập nội dung câu hỏi'); return; }
    if (!minitestName) { toast('❌ Cần nhập tên Minitest/bài'); return; }
    const target = findLevelByNames(catName, gradeName);
    if (!target) { toast('❌ Khối không hợp lệ'); return; }

    const fileKey = fileKeyOf(target.cat, target.lvl);
    const nextLocalId = QUESTIONS.reduce((m, x) => x.fileKey === fileKey ? Math.max(m, Number(x.q.id) || 0) : m, 0) + 1;
    const data = Object.assign({
      question,
      type,
      image: false,
      id: nextLocalId,
      uid: `${fileKey.toLowerCase()}__new__q${nextLocalId}_${Date.now().toString(36)}`,
    }, TYPE_TEMPLATES[type] || {}, { catName, gradeName, minitestName });

    const created = { q: data, docId: newDocId(fileKey), fileKey };
    QUESTIONS.push(created);
    markChanged(created);
    scanUsedPictureNumbers();
    buildFilterOptions();
    applyFilters();
    box.innerHTML = '';
    toast('✅ Đã tạo câu hỏi mới (bản nháp) — điền đáp án rồi "💾 Lưu câu hỏi"');
  });
});

/* ============================================================
   FILE UPLOAD → PENDING CHOICE (base64 vs file riêng) → bản nháp
   ============================================================ */
function onFilePicked(item, file) {
  if (!file) return;
  const card = document.querySelector(`.qcard[data-docid="${cssEsc(item.docId)}"]`);
  const reader = new FileReader();
  reader.onload = () => {
    const dataUrl = reader.result;
    const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
    const num = claimNextPictureNumber();
    const suggested = `Upload${num}.${ext}`;

    const box = card.querySelector('.pending-box');
    box.style.display = 'flex';
    box.innerHTML = `
      <div class="row"><img src="${dataUrl}" style="max-height:90px;border-radius:8px" alt="new preview"></div>
      <div class="row" style="font-size:.75rem;color:var(--muted)">Chọn cách lưu ảnh cho câu này:</div>
      <div class="row">
        <button class="btn btn-green btn-sm embedBtn">✅ Nhúng trực tiếp vào câu hỏi (base64)</button>
      </div>
      <div class="row">
        <input class="fname-edit" value="${suggested}">
        <button class="btn btn-primary btn-sm fileRefBtn">💾 Lưu thành file riêng (img/)</button>
      </div>
      <div class="row" style="font-size:.7rem;color:var(--muted)">
        Gợi ý: dùng "Lưu thành file riêng" cho ảnh lớn (file câu hỏi nhẹ hơn, học sinh tải nhanh hơn) — ảnh được đẩy lên <code>img/</code> cùng lần "🚀 Đẩy thay đổi", không cần chép tay.
      </div>
    `;

    box.querySelector('.embedBtn').addEventListener('click', async () => {
      item.q.imageUrl = dataUrl;
      item.q.image = true;
      delete item.q.image_file; delete item.q.image_id;
      persistQuestion(item);
      box.style.display = 'none';
      renderStats();
      refreshCard(item);
      toast('✅ Đã nhúng ảnh (base64) cho câu ' + (item.q.id ?? '') + ' — nhớ "🚀 Đẩy thay đổi"');
    });

    box.querySelector('.fileRefBtn').addEventListener('click', async () => {
      const fnameInput = box.querySelector('.fname-edit');
      let fname = (fnameInput.value || suggested).trim();
      if (!/\.[a-z0-9]+$/i.test(fname)) fname += '.' + ext;
      const idOnly = fname.replace(/\.[a-z0-9]+$/i, '');

      item.q.imageUrl = 'img/' + fname;
      item.q.image_file = fname;
      item.q.image_id = idOnly;
      item.q.image = true;
      PENDING_IMAGES['img/' + fname] = dataUrl;
      persistQuestion(item);

      box.style.display = 'none';
      renderStats();
      refreshCard(item);
      toast(`✅ Ảnh "${fname}" sẽ được đẩy lên img/ cùng lần "🚀 Đẩy thay đổi"`);
    });
  };
  reader.readAsDataURL(file);
}

/* ============================================================
   SAO LƯU JSON (không bắt buộc — chỉ để tải bản dự phòng)
   ============================================================ */
function cleanQuestion(q) {
  const clone = Object.assign({}, q);
  UI_KEYS.forEach(k => delete clone[k]);
  return clone;
}

function buildBackupTree(list) {
  const root = { categories: [] };
  const catMap = new Map();
  list.forEach(({ q }) => {
    const catKey = q.catName || '(Chưa phân loại)';
    if (!catMap.has(catKey)) {
      const cat = { id: catKey, name: catKey, levels: [] };
      catMap.set(catKey, { cat, lvlMap: new Map() });
      root.categories.push(cat);
    }
    const { cat, lvlMap } = catMap.get(catKey);
    const gradeKey = q.gradeName || '(Chưa có khối)';
    if (!lvlMap.has(gradeKey)) {
      const lvl = { id: gradeKey, name: gradeKey, grade: gradeKey, minitests: {} };
      lvlMap.set(gradeKey, lvl);
      cat.levels.push(lvl);
    }
    const lvl = lvlMap.get(gradeKey);
    const mtKey = q.minitestName || 'Minitest 1';
    if (!lvl.minitests[mtKey]) lvl.minitests[mtKey] = [];
    lvl.minitests[mtKey].push(cleanQuestion(q));
  });
  return root;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function downloadJson(obj, filename) {
  downloadBlob(new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' }), filename);
}

document.getElementById('backupBtn').addEventListener('click', () => {
  downloadJson(buildBackupTree(QUESTIONS), 'quiz_data_backup.json');
  toast('✅ Đã tải bản sao lưu JSON');
});

/* ============================================================
   🚀 ĐẨY THAY ĐỔI CHO HỌC SINH (data/ic3/ trên GitHub)
   ────────────────────────────────────────────────────────────
   Dựng lại file từ QUESTIONS rồi CHỈ đẩy file thật sự khác bản đã tải:
     - data/ic3/<cat>__<lvl>.json            khối có câu đổi
     - data/ic3/minitests/<cat>_<lvl>/<slug>.json  minitest có câu đổi
       (quiz-engine ưu tiên file này — nút "Xuất" cũ bỏ sót nên học sinh
       có thể không thấy câu đã sửa)
     - data/ic3/minitests-manifest.json      khi có minitest mới
     - data/ic3/meta.json                    số câu + "version" mới (làm mới cache học sinh)
     - img/<tên file>                        ảnh "lưu thành file riêng"
   Định dạng giống hệt file hiện có (JSON.stringify gọn, cùng thứ tự field)
   nên file không đổi sẽ ra đúng từng byte và không bị ghi lại.
   quiz_data.json (bản dự phòng cũ, chỉ dùng khi không tải được meta.json)
   KHÔNG còn được ghi — tránh đẩy thêm ~3MB mỗi lần.
   ============================================================ */

// Giống slugify() của scripts/split-minitests.py (NFKD rồi bỏ ký tự ngoài ASCII — "đ" bị bỏ).
function slugifyMinitest(name) {
  const s = String(name).normalize('NFKD').replace(/[^\x00-\x7F]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return s || 'mt';
}

function typeCounts(qs) {
  const types = {};
  qs.forEach(q => { types[q.type || 'unknown'] = (types[q.type || 'unknown'] || 0) + 1; });
  return types;
}

function buildPublishFiles() {
  const files = [];
  const changedPaths = [];

  // 1) Gom câu hỏi theo khối → minitest (giữ thứ tự minitest gốc, minitest mới xếp sau).
  const grouped = {};
  Object.keys(ORIG).forEach(fileKey => {
    grouped[fileKey] = new Map(ORIG[fileKey].mtNames.map(n => [n, []]));
  });
  QUESTIONS.forEach(({ q, fileKey }) => {
    const mts = grouped[fileKey];
    if (!mts) return;
    const mt = q.minitestName || 'Minitest 1';
    if (!mts.has(mt)) mts.set(mt, []);
    mts.get(mt).push(cleanQuestion(q));
  });

  const newMeta = JSON.parse(SOURCE[DATA_DIR + 'meta.json']);
  const newManifest = MANIFEST ? JSON.parse(JSON.stringify(MANIFEST)) : null;
  let anyChange = false;

  Object.keys(ORIG).forEach(fileKey => {
    const orig = ORIG[fileKey];
    const mts = grouped[fileKey];
    const minitests = {};
    mts.forEach((qs, name) => { minitests[name] = qs; });

    // File khối: cùng thứ tự field với file gốc.
    const levelObj = {};
    orig.keys.forEach(k => { levelObj[k] = k === 'minitests' ? minitests : orig.head[k]; });
    if (!orig.keys.includes('minitests')) levelObj.minitests = minitests;
    const levelText = JSON.stringify(levelObj);
    if (levelText === SOURCE[orig.path]) return; // khối không đổi
    anyChange = true;
    files.push({ path: orig.path, content: levelText });
    changedPaths.push(orig.path);

    // meta.json: cập nhật số câu/loại câu của khối này.
    const metaLvl = (newMeta.categories || []).flatMap(c => c.levels || []).find(l => l.file === orig.lvl.file);
    if (metaLvl) {
      const metaMts = {};
      mts.forEach((qs, name) => { metaMts[name] = { count: qs.length, types: typeCounts(qs) }; });
      metaLvl.minitests = metaMts;
    }

    // Từng minitest đổi → file tách nhỏ mà quiz-engine ưu tiên tải.
    if (newManifest) {
      const [catId, lvlId] = fileKey.split('__');
      const levelManifest = newManifest[fileKey] = newManifest[fileKey] || {};
      const usedSlugs = new Set(Object.values(levelManifest).map(p => p.split('/').pop().replace(/\.json$/, '')));
      mts.forEach((qs, name) => {
        const text = JSON.stringify(qs);
        if (text === orig.mtStrings[name] && levelManifest[name]) return;
        if (!levelManifest[name]) {
          const base = slugifyMinitest(name);
          let slug = base, n = 2;
          while (usedSlugs.has(slug)) slug = `${base}-${n++}`;
          usedSlugs.add(slug);
          levelManifest[name] = `minitests/${catId}_${lvlId}/${slug}.json`;
        }
        files.push({ path: DATA_DIR + levelManifest[name], content: text });
      });
    }
  });

  if (newManifest) {
    const manifestText = JSON.stringify(newManifest);
    if (manifestText !== SOURCE[DATA_DIR + 'minitests-manifest.json']) {
      files.push({ path: DATA_DIR + 'minitests-manifest.json', content: manifestText });
      changedPaths.push(DATA_DIR + 'minitests-manifest.json');
    }
  }

  if (anyChange) {
    // "version" mới → trang học sinh bỏ cache cũ (xem js/quiz-engine.js § 0b).
    newMeta.version = `${new Date().toISOString().slice(0, 10)}.${Date.now().toString(36)}`;
    files.push({ path: DATA_DIR + 'meta.json', content: JSON.stringify(newMeta) });
    changedPaths.push(DATA_DIR + 'meta.json');
  }

  Object.keys(PENDING_IMAGES).forEach(path => {
    files.push({ path, base64: String(PENDING_IMAGES[path]).replace(/^data:[^,]*,/, '') });
  });

  const expectedShas = {};
  changedPaths.forEach(p => { if (SOURCE_SHAS[p]) expectedShas[p] = SOURCE_SHAS[p]; });
  return { files, expectedShas, levelCount: files.filter(f => /__[^/]+\.json$/.test(f.path) && !f.path.includes('/minitests/')).length };
}

function pendingChangeCount() {
  return changedIds.size + deletedCount;
}

function updatePublishButton() {
  const btn = document.getElementById('exportStaticBtn');
  if (!btn || btn.dataset.busy) return;
  const n = pendingChangeCount();
  btn.textContent = n ? `🚀 Đẩy ${n} thay đổi cho học sinh` : '🚀 Đẩy thay đổi cho học sinh';
  btn.classList.toggle('btn-pulse', n > 0);
}

window.addEventListener('beforeunload', (e) => {
  // Bản nháp đã lưu IndexedDB, nhưng nhắc để khỏi quên đẩy.
  if (pendingChangeCount()) { e.preventDefault(); e.returnValue = ''; }
});

document.getElementById('exportStaticBtn').addEventListener('click', async () => {
  const btn = document.getElementById('exportStaticBtn');
  if (!META) return;
  const { files, expectedShas, levelCount } = buildPublishFiles();
  if (!files.length) {
    toast('Chưa có thay đổi nào so với data/ic3 hiện tại.');
    return;
  }
  const summary = files.map(f => '- ' + f.path).join('\n');
  if (!confirm(`Đẩy ${files.length} file lên GitHub (${levelCount} khối) — học sinh thấy sau khoảng 1–2 phút:\n\n${summary.slice(0, 1500)}${summary.length > 1500 ? '\n…' : ''}\n\nTiếp tục?`)) return;

  btn.dataset.busy = '1';
  btn.disabled = true;
  btn.textContent = '⏳ Đang đẩy lên GitHub…';
  try {
    await window.EduGitHubPublish.publishFiles(
      files,
      `chore(quiz): cập nhật ngân hàng câu hỏi từ trang quản lý (${pendingChangeCount()} thay đổi, ${files.length} file)`,
      undefined,
      { expectedShas }
    );
    if (window.EduDataCache) await window.EduDataCache.clear(DRAFT_KEY, true);
    changedIds = new Set();
    deletedCount = 0;
    PENDING_IMAGES = {};
    toast(`🚀 Đã đẩy ${files.length} file lên GitHub — học sinh thấy sau khoảng 1–2 phút.`, 6000);
    delete btn.dataset.busy;
    loadQuestions(); // tải lại bản mới nhất (qua GitHub API) làm gốc cho lần sửa tiếp
  } catch (err) {
    console.error('[image-manager] Đẩy GitHub thất bại:', err);
    if (err.code === 'conflict') {
      alert('⚠️ KHÔNG đẩy — ' + err.message + '\n\nCó người/script vừa đẩy dữ liệu mới. Bản nháp của bạn vẫn được giữ.\n' +
        'Hãy bấm "⬇️ Sao lưu JSON" để giữ bản của bạn, tải lại trang (sẽ hỏi tải bản nháp về), rồi nhập lại phần đã sửa.');
    } else if (confirm('Đẩy lên GitHub thất bại: ' + err.message + '\n\nTải các file thay đổi về máy (zip) để tự chép vào dự án?')) {
      const zip = new JSZip();
      files.forEach(f => (f.base64 != null ? zip.file(f.path, f.base64, { base64: true }) : zip.file(f.path, f.content)));
      downloadBlob(await zip.generateAsync({ type: 'blob' }), `data-ic3-thay-doi-${new Date().toISOString().slice(0, 10)}.zip`);
    }
  } finally {
    delete btn.dataset.busy;
    btn.disabled = false;
    updatePublishButton();
  }
});

/* ============================================================
   FILTER UI WIRING
   ============================================================ */
document.getElementById('searchBox').addEventListener('input', (e) => {
  state.search = e.target.value;
  applyFilters();
});
document.getElementById('gradeFilter').addEventListener('change', (e) => {
  state.grade = e.target.value;
  applyFilters();
});
document.getElementById('minitestFilter').addEventListener('change', (e) => {
  state.minitest = e.target.value;
  applyFilters();
});
document.querySelectorAll('#statusChips .chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('#statusChips .chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    state.status = chip.dataset.status;
    applyFilters();
  });
});
document.getElementById('prevPage').addEventListener('click', () => { currentPage--; renderList(); });
document.getElementById('nextPage').addEventListener('click', () => { currentPage++; renderList(); });

/* ============================================================
   THEME
   ============================================================ */
// Icon mặt trời/mặt trăng giờ vẽ hoàn toàn bằng CSS (::after theo
// data-theme, xem .theme-toggle trong css/image-manager.css) — JS chỉ
// còn đổi attribute, không set textContent icon nữa.
const themeBtn = document.getElementById('themeToggle');
function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
}
applyTheme(localStorage.getItem('ic3_theme') === 'dark' ? 'dark' : 'light');
themeBtn.addEventListener('click', () => {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  applyTheme(isDark ? 'light' : 'dark');
  localStorage.setItem('ic3_theme', isDark ? 'light' : 'dark');
});

/* ============================================================
   UTIL
   ============================================================ */
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function escAttr(s) { return esc(s); }
function cssEsc(s) { return String(s).replace(/["\\]/g, '\\$&'); }

let toastTimer = null;
function toast(msg, duration) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), duration || 2600);
}
