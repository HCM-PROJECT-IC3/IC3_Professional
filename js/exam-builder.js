/* ============================================================
   js/exam-builder.js — "Soạn đề" kiểu Kahoot / Quizizz
   (ic3-dashboard.html § section-builder)

   Bố cục 3 vùng như trình soạn Kahoot:
     • Trái  — danh sách câu (thumbnail, kéo thả sắp xếp, nhân bản/xoá),
               + Thêm câu hỏi (5 dạng) / Ngân hàng / Nhập nhanh.
     • Giữa  — khung soạn câu đang chọn: câu hỏi, ảnh (tải lên / dán /
               link), ô đáp án 4-6 màu kèm hình, giải thích.
     • Phải  — đổi dạng câu, tình trạng đề (câu lỗi, số câu chơi trực
               tiếp được, độ dài link).
   Cài đặt đề (tên, mô tả, ảnh bìa màu + biểu tượng, cấp học, thời gian,
   trộn câu), Xem trước kiểu Kahoot, Chơi trực tiếp (Phòng cả lớp ở arena.html),
   In đề, Mở đề từ link.

   Dạng câu tự soạn: single (1 đáp án) · multi (nhiều đáp án) · tf
   (Đúng/Sai) · ordering (sắp xếp) · matching (nối cặp). Câu từ ngân hàng
   data/ic3 giữ nguyên mọi dạng, đổi được sang câu tự soạn để sửa.

   FIREBASE: 0 lượt đọc/ghi. Đề nằm gọn trong link (js/custom-exam-codec.js,
   nén deflate); danh sách đề lưu localStorage "ic3_custom_sets"; bản nháp
   "ic3_exam_builder_draft". Sang máy khác: "Mở đề từ link".
   Phụ thuộc js/dashboard.js (refreshSetsFromStorage/showToast/modal).
   ============================================================ */
(function (global) {
  'use strict';

  const DRAFT_KEY = 'ic3_exam_builder_draft';
  const SETS_KEY = 'ic3_custom_sets';
  const BAI_RE = /^Bài \d+[.:]/;
  // Bộ theo tiết PPCT (câu All Key) — "Tiết N" là tên cũ trước 10/2026
  const TIET_RE = /^(Tiết \d+$|Ôn tập\s|Luyện thi\s)/;
  const KT_RE = /^Kiểm tra\s/;
  const FINAL_RE = /^Ôn tập cuối khóa\s/; // 8 tiết ôn cuối khóa (All Key)
  const GROUPS = [
    { id: 'bai', label: 'Theo bài', test: (n) => BAI_RE.test(n) },
    { id: 'tiet', label: 'Ôn tập (theo tiết)', test: (n) => TIET_RE.test(n) && !FINAL_RE.test(n) },
    { id: 'final', label: 'Ôn tập cuối khóa', test: (n) => FINAL_RE.test(n) },
    { id: 'kt', label: 'Kiểm tra (theo tiết)', test: (n) => KT_RE.test(n) },
    { id: 'topic', label: 'Chủ đề', test: (n) => !BAI_RE.test(n) && !TIET_RE.test(n) && !KT_RE.test(n) },
  ];
  const BANK_TYPE_LABEL = {
    single: '1 đáp án', multi: 'Nhiều đáp án', truefalse: 'Đúng/Sai (bảng)', list: 'Chọn theo dòng',
    matching: 'Nối cặp', classify: 'Phân loại', hotspot: 'Chọn vùng ảnh', ordering: 'Sắp xếp',
    dragfill: 'Kéo thả điền', selectfill: 'Chọn điền',
  };
  const CUSTOM_TYPES = [
    { id: 'single', label: 'Trắc nghiệm', hint: '1 đáp án đúng', icon: 'fa-circle-dot' },
    { id: 'multi', label: 'Nhiều đáp án', hint: 'Chọn tất cả đáp án đúng', icon: 'fa-square-check' },
    { id: 'tf', label: 'Đúng / Sai', hint: '2 lựa chọn', icon: 'fa-scale-balanced' },
    { id: 'ordering', label: 'Sắp xếp', hint: 'Xếp đúng thứ tự', icon: 'fa-arrow-down-1-9' },
    { id: 'matching', label: 'Nối cặp', hint: 'Ghép vế trái với vế phải', icon: 'fa-right-left' },
  ];
  const TYPE_BY_ID = Object.fromEntries(CUSTOM_TYPES.map((t) => [t.id, t]));
  // Ô đáp án kiểu Kahoot: màu + hình (người mù màu vẫn phân biệt được).
  const TILE_SHAPES = ['fa-play fa-rotate-270', 'fa-diamond', 'fa-circle', 'fa-square', 'fa-star', 'fa-heart'];
  const COVERS = [
    'linear-gradient(135deg, #CFE3FF 0%, #EAF3FF 100%)',
    'linear-gradient(135deg, #C9F3E6 0%, #E9FBF5 100%)',
    'linear-gradient(135deg, #E4D6FF 0%, #F3EBFF 100%)',
    'linear-gradient(135deg, #D4F5DC 0%, #EEFBF1 100%)',
    'linear-gradient(135deg, #FFECC2 0%, #FFF8E6 100%)',
    'linear-gradient(135deg, #FFDCCF 0%, #FFEFE8 100%)',
  ];
  const COVER_ICONS = ['📝', '💻', '🧠', '🚀', '🎯', '🔐', '🌐', '📚', '🧩', '⭐', '🏆', '🎨', '📊', '🔬', '💡', '🎮'];
  const MAX_OPTIONS = 6;
  const MAX_ROWS = 8;
  const LINK_OK = 8000;
  const LINK_LONG = 30000;

  // ============================================================
  // TRẠNG THÁI
  // ============================================================
  const B = {
    ready: false, meta: null, manifest: null,
    editingId: null, title: '', desc: '', theme: { color: 0, icon: '📝' }, type: '', duration: 0, shuffle: true, deadline: 0,
    slides: [], // [{ id, custom }] | [{ id, mt, uid, q }]
    cur: 0,
    dirty: false,
    linkLen: 0,
    bank: { cat: '', level: '', group: 'bai', mt: '', mtSearch: '', search: '', type: '', src: '', expanded: new Set() },
  };
  const qCache = new Map();
  let slideSeq = 0;
  const newId = () => 's' + Date.now().toString(36) + (slideSeq++);

  const $ = (id) => document.getElementById(id);
  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function stripHtml(s) { const d = document.createElement('div'); d.innerHTML = String(s ?? ''); return (d.textContent || '').trim(); }
  function toast(msg, icon) { global.showToast?.(msg, icon); }
  function shuffled(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  function lsGet(key, fb) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fb; } catch (e) { return fb; } }
  function lsSet(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); return true; } catch (e) { return false; } }
  function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
  const clone = (o) => JSON.parse(JSON.stringify(o));

  // ============================================================
  // DỮ LIỆU NGÂN HÀNG (file tĩnh data/ic3)
  // ============================================================
  async function fetchJson(url) {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`);
    return res.json();
  }
  function levelMeta(cat, level) {
    const c = (B.meta?.categories || []).find((x) => x.id === cat);
    return c?.levels?.find((l) => l.id === level) || null;
  }
  function mtCount(cat, level, name) { const m = levelMeta(cat, level)?.minitests?.[name]; return Array.isArray(m) ? m.length : (m?.count || 0); }
  function fetchMinitest(cat, level, name) {
    const key = `${cat}__${level}__${name}`;
    if (!qCache.has(key)) {
      qCache.set(key, (async () => {
        const rel = B.manifest?.[`${cat}__${level}`]?.[name];
        if (rel) { try { return await fetchJson(`data/ic3/${rel}`); } catch (e) { /* rơi về file khối */ } }
        const lv = levelMeta(cat, level);
        const full = lv?.file ? await fetchJson(`data/ic3/${lv.file}`) : null;
        return full?.minitests?.[name] || [];
      })().catch((e) => { qCache.delete(key); throw e; }));
    }
    return qCache.get(key);
  }
  async function ensureReady() {
    if (B.ready) return;
    const [meta, manifest] = await Promise.all([
      fetchJson('data/ic3/meta.json'),
      fetchJson('data/ic3/minitests-manifest.json').catch(() => ({})),
    ]);
    B.meta = meta; B.manifest = manifest; B.ready = true;
    // Bản đồ câu chủ đề ↔ đề gốc All Key (~36 KB, scripts/build-allkey-map.py). Không tải được
    // thì chỉ mất nhãn nguồn, trình soạn vẫn chạy.
    B.allkey = await fetchJson('data/ic3/allkey-map.json').then((d) => d.map || null).catch(() => null);
  }

  // ── Nguồn dữ liệu của câu ngân hàng ──
  // All Key: đề gốc .quiz (Test1/2/3, OntapSo, BaiOnSo, On Tap, bản 10/04/2026) — chuẩn cho ôn thi/kiểm tra.
  // Bài N: bộ Củng cố trong thư mục Quiz trên Drive — chỉ để dạy & luyện tập theo bài.
  // Ngoài All Key: câu ngân hàng chủ đề cũ (GS6), không vào bộ Ôn tập/Kiểm tra theo tiết.
  const BAI_UID_RE = /__bai(\d+)__/;
  const SOURCES = {
    ak: { label: 'All Key', icon: 'fa-key' },
    bai: { label: 'Theo bài', icon: 'fa-book-open' },
    old: { label: 'Ngoài All Key', icon: 'fa-database' },
  };
  function qSource(uid) {
    const m = BAI_UID_RE.exec(uid || '');
    if (m) return { id: 'bai', label: `Bài ${m[1]}` };
    if (!B.allkey) return { id: '', label: 'Ngân hàng' };
    const papers = B.allkey[uid];
    return papers ? { id: 'ak', label: 'All Key', papers } : { id: 'old', label: 'Ngoài All Key' };
  }
  /** "Test1#10" → "Test1 câu 10" */
  function paperText(papers) { return (papers || []).map((p) => p.replace(/#(\d+)$/, ' câu $1')).join(', '); }

  // ============================================================
  // ĐỀ ↔ SLIDE
  // ============================================================
  function bankSlides() { return B.slides.filter((s) => !s.custom); }
  /** Cấp độ của các câu ngân hàng trong đề (mọi câu ngân hàng cùng 1 cấp độ). */
  function examLevel() { const b = bankSlides()[0]; return b ? { cat: b.cat, level: b.level } : { cat: '', level: '' }; }

  function blankCustom(type) {
    const c = { type, q: '', expl: '' };
    if (type === 'single' || type === 'multi') { c.options = ['', '', '', '']; c.correct = []; }
    if (type === 'tf') c.correct = [0];
    if (type === 'ordering') c.items = ['', '', ''];
    if (type === 'matching') c.pairs = [['', ''], ['', ''], ['', '']];
    return c;
  }

  /** Câu tự soạn sạch để xuất: bỏ đáp án/dòng trống, đánh lại chỉ số đúng. */
  function cleanCustom(c) {
    const o = { type: c.type, q: String(c.q || '').trim() };
    if (c.expl && c.expl.trim()) o.expl = c.expl.trim();
    if (c.img) o.img = c.img;
    if (c.type === 'single' || c.type === 'multi') {
      const keep = [];
      (c.options || []).forEach((t, i) => { if (String(t).trim()) keep.push(i); });
      o.options = keep.map((i) => String(c.options[i]).trim());
      o.correct = (c.correct || []).map((i) => keep.indexOf(i)).filter((i) => i >= 0);
    }
    if (c.type === 'tf') o.correct = [(c.correct || [0])[0] === 1 ? 1 : 0];
    if (c.type === 'ordering') o.items = (c.items || []).map((s) => String(s).trim()).filter(Boolean);
    if (c.type === 'matching') o.pairs = (c.pairs || []).map(([l, r]) => [String(l).trim(), String(r).trim()]).filter(([l, r]) => l && r);
    return o;
  }

  /** Lỗi khiến câu không dùng được (mảng chuỗi, rỗng = hợp lệ). */
  function slideErrors(s) {
    if (!s.custom) return s.q ? [] : ['Câu không còn trong ngân hàng'];
    const c = cleanCustom(s.custom);
    const errs = [];
    if (!c.q) errs.push('Chưa nhập câu hỏi');
    if (c.type === 'single' || c.type === 'multi') {
      if (c.options.length < 2) errs.push('Cần ít nhất 2 đáp án');
      if (!c.correct.length) errs.push('Chưa chọn đáp án đúng');
      if (new Set(c.options.map((o) => o.toLowerCase())).size !== c.options.length) errs.push('Có đáp án bị trùng nhau');
      if (c.type === 'single' && c.correct.length > 1) errs.push('Trắc nghiệm chỉ được 1 đáp án đúng');
    }
    if (c.type === 'ordering' && c.items.length < 2) errs.push('Cần ít nhất 2 mục để sắp xếp');
    if (c.type === 'matching' && c.pairs.length < 2) errs.push('Cần ít nhất 2 cặp đầy đủ 2 vế');
    return errs;
  }

  function liveOk(s) {
    return !!global.EduCustomExam?.toLiveQuestion(s.custom ? { custom: cleanCustom(s.custom) } : { q: s.q });
  }

  function buildExam() {
    const lv = examLevel();
    return {
      title: B.title.trim() || 'Đề chưa đặt tên', desc: B.desc.trim(), cat: lv.cat, level: lv.level,
      duration: B.duration, shuffle: B.shuffle, theme: B.theme, deadline: B.deadline || 0,
      items: B.slides.map((s) => (s.custom ? { custom: cleanCustom(s.custom) } : { mt: s.mt, uid: s.uid })),
    };
  }

  /** Dữ liệu lưu (localStorage): như exam nhưng giữ nguyên bản nháp câu tự soạn. */
  function snapshot() {
    return {
      editingId: B.editingId, title: B.title, desc: B.desc, theme: B.theme, type: B.type, duration: B.duration, shuffle: B.shuffle, deadline: B.deadline || 0,
      dirty: B.dirty, cur: B.cur,
      slides: B.slides.map((s) => (s.custom ? { custom: s.custom } : { cat: s.cat, level: s.level, mt: s.mt, uid: s.uid })),
    };
  }

  /** Nạp đề (bản nháp / đề đã lưu / đề giải mã từ link) vào trình soạn. */
  async function loadInto(data, { editingId = null, dirty = false } = {}) {
    B.editingId = editingId;
    B.title = data.title || '';
    B.desc = data.desc || '';
    B.theme = data.theme && typeof data.theme === 'object' ? { color: data.theme.color || 0, icon: data.theme.icon || '📝' } : { color: 0, icon: '📝' };
    B.type = data.type || '';
    B.duration = data.duration || 0;
    B.shuffle = data.shuffle !== false;
    B.deadline = Number(data.deadline) || 0;
    // Hỗ trợ 3 dạng: slides[] (bản nháp mới), items[] (exam/đề lưu mới), builder v1 (items chỉ có ref).
    const raw = data.slides || data.items || [];
    const slides = raw.map((it) => (it.custom
      ? { id: newId(), custom: Object.assign(blankCustom(it.custom.type), clone(it.custom)) }
      : { id: newId(), cat: it.cat || data.cat, level: it.level || data.level, mt: it.mt, uid: it.uid, q: null }));
    // Tải nội dung câu ngân hàng.
    const refs = slides.filter((s) => !s.custom);
    const groups = new Map();
    refs.forEach((s) => { const k = `${s.cat}__${s.level}__${s.mt}`; if (!groups.has(k)) groups.set(k, s); });
    await Promise.all([...groups.values()].map((s) => fetchMinitest(s.cat, s.level, s.mt).catch(() => [])));
    let missing = 0;
    for (const s of refs) {
      const list = await fetchMinitest(s.cat, s.level, s.mt).catch(() => []);
      s.q = list.find((q) => q.uid === s.uid) || null;
      if (!s.q) missing++;
    }
    B.slides = slides.filter((s) => s.custom || s.q);
    B.cur = Math.min(Math.max(0, data.cur || 0), Math.max(0, B.slides.length - 1));
    B.dirty = dirty;
    histReset();
    if (missing) toast(`${missing} câu ngân hàng không còn tồn tại — đã bỏ khỏi đề.`, 'fa-triangle-exclamation');
  }

  function resetExam() {
    B.editingId = null; B.title = ''; B.desc = ''; B.theme = { color: Math.floor(Math.random() * COVERS.length), icon: '📝' };
    B.type = ''; B.duration = 0; B.shuffle = true; B.deadline = 0;
    B.slides = [{ id: newId(), custom: blankCustom('single') }];
    B.cur = 0; B.dirty = false;
    histReset();
    saveDraft();
  }

  const saveDraft = debounce(() => { lsSet(DRAFT_KEY, snapshot()); }, 400);
  const refreshLinkSize = debounce(async () => {
    try { B.linkLen = (await global.EduCustomExam.encode(buildExam())).length; } catch (e) { B.linkLen = 0; }
    renderHealth();
  }, 700);
  function changed({ rail = true, health = true } = {}) {
    B.dirty = true;
    saveDraft();
    renderTop();
    if (rail) renderRailItem(B.cur);
    if (health) { renderHealth(); refreshLinkSize(); }
    // rail=false = thao tác cấu trúc (thêm/xoá/kéo câu) → ghi lịch sử ngay; gõ chữ → gộp theo đợt.
    if (rail) histCommitSoon(); else histCommit();
  }

  // ============================================================
  // HOÀN TÁC / LÀM LẠI (Ctrl+Z · Ctrl+Y) — chỉ trong bộ nhớ trang
  // H.base = trạng thái đã ghi gần nhất; mỗi lần đổi thì base cũ vào H.past.
  // Gõ liền nhau được gộp thành 1 bước (HIST_IDLE_MS). Câu ngân hàng không
  // bao giờ bị sửa tại chỗ nên giữ nguyên tham chiếu, chỉ sao chép câu tự soạn.
  // ============================================================
  const HIST_MAX = 80;
  const HIST_IDLE_MS = 700;
  const H = { past: [], future: [], base: null, key: '', timer: 0 };
  function histCapture() {
    return {
      title: B.title, desc: B.desc, theme: clone(B.theme), type: B.type, duration: B.duration, shuffle: B.shuffle, deadline: B.deadline, cur: B.cur,
      slides: B.slides.map((s) => (s.custom ? { id: s.id, custom: clone(s.custom) } : s)),
    };
  }
  function histKey(st) {
    return JSON.stringify(Object.assign({}, st, { cur: 0, slides: st.slides.map((s) => (s.custom ? s.custom : s.uid)) }));
  }
  function histReset() {
    clearTimeout(H.timer);
    H.timer = 0;
    H.past = []; H.future = [];
    H.base = histCapture(); H.key = histKey(H.base);
    renderHistButtons();
  }
  function histCommit() {
    clearTimeout(H.timer);
    H.timer = 0;
    if (!H.base) { histReset(); return; }
    const now = histCapture();
    const key = histKey(now);
    if (key === H.key) { H.base = now; return; }
    H.past.push(H.base);
    if (H.past.length > HIST_MAX) H.past.shift();
    H.future = [];
    H.base = now; H.key = key;
    renderHistButtons();
  }
  function histCommitSoon() { clearTimeout(H.timer); H.timer = setTimeout(histCommit, HIST_IDLE_MS); renderHistButtons(); }
  function histApply(st) {
    Object.assign(B, { title: st.title, desc: st.desc, theme: clone(st.theme), type: st.type, duration: st.duration, shuffle: st.shuffle, deadline: st.deadline });
    B.slides = st.slides.map((s) => (s.custom ? { id: s.id, custom: clone(s.custom) } : s));
    B.cur = Math.min(Math.max(0, st.cur), Math.max(0, B.slides.length - 1));
    H.base = st; H.key = histKey(st);
    B.dirty = true;
    saveDraft();
    renderAll();
    renderHistButtons();
  }
  function undo() {
    histCommit(); // đợt gõ đang dở cũng thành 1 bước, hoàn tác được ngay
    if (!H.past.length) { toast('Không còn gì để hoàn tác.', 'fa-rotate-left'); return; }
    H.future.push(H.base);
    histApply(H.past.pop());
  }
  function redo() {
    histCommit();
    if (!H.future.length) { toast('Không còn gì để làm lại.', 'fa-rotate-right'); return; }
    H.past.push(H.base);
    histApply(H.future.pop());
  }
  /** Hoàn tác vẽ lại khung soạn → đặt con trỏ lại đúng ô đang gõ (nếu ô đó còn). */
  function withFocusKept(fn) {
    const a = document.activeElement;
    const f = a?.dataset?.f;
    const i = a?.dataset?.i;
    fn();
    if (!f) return;
    const el = $('ebStage').querySelector(`[data-f="${f}"]${i != null ? `[data-i="${i}"]` : ''}`);
    if (el) { el.focus(); if (typeof el.value === 'string') el.setSelectionRange?.(el.value.length, el.value.length); }
  }
  function openKeys() {
    const row = (keys, what) => `<tr><td>${keys.map((k) => `<kbd>${k}</kbd>`).join(' ')}</td><td>${what}</td></tr>`;
    modal('<i class="fa-regular fa-keyboard"></i> Phím tắt khi soạn đề', `
      <table class="eb-keys"><tbody>
        ${row(['Ctrl', 'Z'], 'Hoàn tác')}
        ${row(['Ctrl', 'Y'], 'Làm lại (hoặc Ctrl + Shift + Z)')}
        ${row(['Ctrl', 'S'], 'Lưu đề')}
        ${row(['Ctrl', 'Enter'], 'Thêm câu mới cùng dạng, ngay sau câu đang soạn')}
        ${row(['Ctrl', 'D'], 'Nhân bản câu đang soạn')}
        ${row(['Alt', '↑ / ↓'], 'Sang câu trước / câu sau')}
        ${row(['Alt', 'Shift', '↑ / ↓'], 'Đưa câu đang soạn lên / xuống')}
        ${row(['Ctrl', 'V'], 'Dán ảnh vào câu đang soạn')}
        ${row(['?'], 'Mở bảng này (khi không đang gõ chữ)')}
      </tbody></table>
      <p class="eb-matrix-hint">Trên máy Mac dùng phím ⌘ thay cho Ctrl.</p>`,
    '<button class="btn-save" onclick="closeModal()">Đóng</button>');
  }
  function renderHistButtons() {
    if ($('ebUndoBtn')) $('ebUndoBtn').disabled = !H.past.length && !H.timer;
    if ($('ebRedoBtn')) $('ebRedoBtn').disabled = !H.future.length;
  }

  // ============================================================
  // RENDER — THANH TRÊN
  // ============================================================
  function renderTop() {
    const cover = $('ebCover');
    cover.textContent = B.theme.icon || '📝';
    cover.style.background = COVERS[B.theme.color] || COVERS[0];
    $('ebTitleText').textContent = B.title.trim() || 'Đề chưa đặt tên';
    const lv = examLevel();
    const bits = [`${B.slides.length} câu`, (B.type || defaultType()) === 'elementary' ? 'Tiểu học' : 'THCS'];
    if (lv.cat) bits.push(levelMeta(lv.cat, lv.level)?.name || lv.level);
    bits.push(B.duration ? `${B.duration} phút` : 'HS tự chọn giờ');
    if (B.deadline) bits.push('hạn ' + fmtDeadline(B.deadline));
    $('ebSubText').textContent = bits.join(' · ');
    const st = $('ebStatus');
    if (B.dirty) { st.textContent = B.editingId ? 'Chưa lưu thay đổi' : 'Bản nháp'; st.className = 'eb-status is-dirty'; }
    else if (B.editingId) { st.textContent = 'Đã lưu'; st.className = 'eb-status is-saved'; }
    else { st.textContent = 'Đề mới'; st.className = 'eb-status'; }
    const n = B.slides.length;
    const live = B.slides.filter(liveOk).length;
    $('ebLiveBtn').disabled = live < 5;
    $('ebArenaBtn').disabled = !live;
    $('ebArenaBtn').title = live ? `Chép link Đấu trường (${live} câu chơi được): học sinh tự chơi kiểu Kahoot/Blooket trên máy mình — 0 lượt Firebase` : 'Cần ít nhất 1 câu trắc nghiệm 1 đáp án / Đúng-Sai';
    $('ebLiveBtn').title = live < 5 ? `Cần ≥ 5 câu trắc nghiệm 1 đáp án / Đúng-Sai để chơi trực tiếp (đang có ${live})` : `Mở phòng thi đấu trực tiếp (${Math.min(15, live)} câu)`;
    $('ebPreviewBtn').disabled = !n;
    $('ebPresentBtn').disabled = !n;
    $('ebCopyLinkBtn').disabled = !n;
  }
  function defaultType() { return examLevel().cat === 'Spark' ? 'elementary' : 'middle'; }
  function fmtDeadline(ms) {
    const d = new Date(ms);
    const p = (n) => String(n).padStart(2, '0');
    return `${p(d.getHours())}:${p(d.getMinutes())} ${p(d.getDate())}/${p(d.getMonth() + 1)}`;
  }
  /** ms → giá trị cho <input type="datetime-local"> (giờ máy). */
  function toLocalInput(ms) {
    if (!ms) return '';
    const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60000);
    return d.toISOString().slice(0, 16);
  }

  // ============================================================
  // RENDER — DANH SÁCH CÂU (trái)
  // ============================================================
  function railItemHtml(s, i) {
    const errs = slideErrors(s);
    const sim = similarGroups().find((g) => g.includes(i));
    const simDot = sim && !errs.length ? ` <i class="fa-regular fa-clone eb-sim-dot" title="Na ná câu ${esc(sim.filter((k) => k !== i).map((k) => k + 1).join(', '))}"></i>` : '';
    let label, icon, text, tiles = '';
    if (s.custom) {
      const t = TYPE_BY_ID[s.custom.type];
      label = t.label; icon = t.icon; text = s.custom.q;
      const n = s.custom.type === 'tf' ? 2 : s.custom.type === 'single' || s.custom.type === 'multi' ? (s.custom.options || []).length : 0;
      if (n) tiles = `<span class="eb-mini-tiles">${Array.from({ length: n }, (_, k) => `<i class="c${k}${(s.custom.correct || []).includes(k) ? ' is-ok' : ''}"></i>`).join('')}</span>`;
    } else {
      const src = qSource(s.uid);
      label = src.label; icon = SOURCES[src.id]?.icon || 'fa-database'; text = stripHtml(s.q?.question);
    }
    return `<li class="eb-slide${i === B.cur ? ' is-active' : ''}${errs.length ? ' has-error' : ''}" data-idx="${i}" draggable="true" tabindex="0" aria-label="Câu ${i + 1}">
      <span class="eb-slide-no">${i + 1}</span>
      <div class="eb-slide-card">
        <div class="eb-slide-type"><i class="fa-solid ${icon}"></i> ${esc(label)}${errs.length ? ' <i class="fa-solid fa-circle-exclamation eb-err-dot" title="' + esc(errs.join('; ')) + '"></i>' : ''}${simDot}</div>
        <div class="eb-slide-text${text ? '' : ' is-empty'}">${esc(text || 'Chưa nhập câu hỏi')}</div>
        ${(s.custom?.img || s.q?.imageUrl || s.q?.image_file) ? '<i class="fa-regular fa-image eb-slide-img"></i>' : ''}${tiles}
      </div>
      <div class="eb-slide-actions">
        <button type="button" data-rail="dup" title="Nhân bản" aria-label="Nhân bản câu ${i + 1}"><i class="fa-regular fa-copy"></i></button>
        <button type="button" data-rail="del" title="Xoá" aria-label="Xoá câu ${i + 1}"><i class="fa-regular fa-trash-can"></i></button>
      </div>
    </li>`;
  }
  function renderRail() {
    $('ebRailList').innerHTML = B.slides.map(railItemHtml).join('');
    $('ebRailList').querySelector('.is-active')?.scrollIntoView({ block: 'nearest' });
  }
  function renderRailItem(i) {
    const li = $('ebRailList').querySelector(`[data-idx="${i}"]`);
    if (!li || !B.slides[i]) { renderRail(); return; }
    li.outerHTML = railItemHtml(B.slides[i], i);
  }
  function select(i) {
    B.cur = Math.max(0, Math.min(i, B.slides.length - 1));
    renderRail(); renderStage(); renderInspector();
    saveDraft();
  }

  // ============================================================
  // RENDER — KHUNG SOẠN (giữa)
  // ============================================================
  function renderStage() {
    const stage = $('ebStage');
    const s = B.slides[B.cur];
    if (!s) {
      stage.innerHTML = `<div class="eb-canvas eb-canvas-empty">
        <i class="fa-solid fa-wand-magic-sparkles"></i>
        <p>Đề chưa có câu nào. Thêm câu tự soạn, lấy từ ngân hàng hoặc dán nhanh nhiều câu.</p>
        <div class="eb-empty-actions">
          <button type="button" class="eb-btn eb-btn-primary" data-act="add-type" data-type="single"><i class="fa-solid fa-plus"></i> Câu trắc nghiệm</button>
          <button type="button" class="eb-btn eb-btn-soft" data-act="open-bank"><i class="fa-solid fa-database"></i> Ngân hàng</button>
          <button type="button" class="eb-btn eb-btn-soft" data-act="open-import"><i class="fa-solid fa-paste"></i> Nhập nhanh</button>
        </div></div>`;
      return;
    }
    stage.innerHTML = s.custom ? customCanvas(s.custom) : bankCanvas(s);
    if (s.custom) autoGrow(stage.querySelector('.eb-qinput'));
    renderStageErrors();
  }

  function mediaHtml(img) {
    if (img) {
      return `<div class="eb-media has-img">
        <img src="${esc(img)}" alt="Ảnh minh hoạ câu hỏi">
        <div class="eb-media-actions">
          <button type="button" class="eb-btn eb-btn-ghost" data-act="img-upload"><i class="fa-solid fa-arrows-rotate"></i> Đổi ảnh</button>
          <button type="button" class="eb-btn eb-btn-danger" data-act="img-remove"><i class="fa-solid fa-trash"></i> Bỏ ảnh</button>
        </div></div>`;
    }
    return `<div class="eb-media" data-act="img-upload" tabindex="0" role="button" aria-label="Thêm ảnh minh hoạ">
      <i class="fa-regular fa-image"></i>
      <b>Thêm ảnh minh hoạ</b>
      <span>Bấm để chọn ảnh, kéo thả hoặc dán (Ctrl+V) — ảnh được nén gọn tự động</span>
      <input type="url" class="eb-input eb-img-url" data-f="imgurl" placeholder="…hoặc dán link ảnh https://" aria-label="Link ảnh">
    </div>`;
  }

  function customCanvas(c) {
    let answers = '';
    if (c.type === 'single' || c.type === 'multi') {
      const opts = c.options || [];
      answers = `<div class="eb-tiles">${opts.map((o, i) => {
        const ok = (c.correct || []).includes(i);
        return `<div class="eb-tile c${i}${ok ? ' is-correct' : ''}${String(o).trim() ? ' has-text' : ''}">
          <span class="eb-tile-shape"><i class="fa-solid ${TILE_SHAPES[i]}"></i></span>
          <textarea rows="2" class="eb-tile-input" data-f="opt" data-i="${i}" maxlength="300" placeholder="Đáp án ${i + 1}${i >= 2 ? ' (tuỳ chọn)' : ''}">${esc(o)}</textarea>
          <button type="button" class="eb-tile-ok" data-act="toggle-correct" data-i="${i}" title="${ok ? 'Đáp án đúng' : 'Đánh dấu là đáp án đúng'}" aria-pressed="${ok}" aria-label="Đáp án ${i + 1} đúng"><i class="fa-solid fa-check"></i></button>
          ${opts.length > 2 ? `<button type="button" class="eb-tile-del" data-act="del-opt" data-i="${i}" title="Bỏ đáp án này" aria-label="Bỏ đáp án ${i + 1}"><i class="fa-solid fa-xmark"></i></button>` : ''}
        </div>`;
      }).join('')}
      ${opts.length < MAX_OPTIONS ? `<button type="button" class="eb-tile-add" data-act="add-opt"><i class="fa-solid fa-plus"></i> Thêm đáp án</button>` : ''}</div>
      <p class="eb-hint"><i class="fa-solid fa-circle-info"></i> ${c.type === 'multi' ? 'Bấm <i class="fa-solid fa-check"></i> ở MỌI đáp án đúng — học sinh phải chọn đủ mới tính đúng.' : 'Bấm <i class="fa-solid fa-check"></i> ở đáp án đúng. Thứ tự đáp án được trộn khi làm bài.'}</p>`;
    } else if (c.type === 'tf') {
      const k = (c.correct || [0])[0];
      answers = `<div class="eb-tiles eb-tiles-tf">
        ${['Đúng', 'Sai'].map((t, i) => `<button type="button" class="eb-tile c${i === 0 ? 1 : 0} eb-tf${k === i ? ' is-correct' : ''}" data-act="tf-pick" data-i="${i}" aria-pressed="${k === i}">
          <span class="eb-tile-shape"><i class="fa-solid ${i === 0 ? 'fa-check' : 'fa-xmark'}"></i></span><b>${t}</b>
          <span class="eb-tile-ok"><i class="fa-solid fa-check"></i></span></button>`).join('')}
      </div><p class="eb-hint"><i class="fa-solid fa-circle-info"></i> Bấm vào ô là đáp án đúng.</p>`;
    } else if (c.type === 'ordering') {
      const items = c.items || [];
      answers = `<ol class="eb-rows">${items.map((t, i) => `<li class="eb-row">
          <span class="eb-row-no c${i % 6}">${i + 1}</span>
          <input class="eb-input" data-f="item" data-i="${i}" maxlength="200" value="${esc(t)}" placeholder="Bước ${i + 1}">
          <button type="button" data-act="item-up" data-i="${i}" ${i === 0 ? 'disabled' : ''} title="Lên" aria-label="Đưa bước ${i + 1} lên"><i class="fa-solid fa-chevron-up"></i></button>
          <button type="button" data-act="item-down" data-i="${i}" ${i === items.length - 1 ? 'disabled' : ''} title="Xuống" aria-label="Đưa bước ${i + 1} xuống"><i class="fa-solid fa-chevron-down"></i></button>
          ${items.length > 2 ? `<button type="button" data-act="del-item" data-i="${i}" class="is-danger" title="Bỏ" aria-label="Bỏ bước ${i + 1}"><i class="fa-solid fa-xmark"></i></button>` : ''}
        </li>`).join('')}</ol>
        ${items.length < MAX_ROWS ? '<button type="button" class="eb-btn eb-btn-soft" data-act="add-item"><i class="fa-solid fa-plus"></i> Thêm bước</button>' : ''}
        <p class="eb-hint"><i class="fa-solid fa-circle-info"></i> Nhập theo <b>đúng thứ tự</b> — học sinh sẽ thấy các bước bị xáo trộn.</p>`;
    } else if (c.type === 'matching') {
      const pairs = c.pairs || [];
      answers = `<div class="eb-pairs">${pairs.map(([l, r], i) => `<div class="eb-pair">
          <input class="eb-input" data-f="pl" data-i="${i}" maxlength="200" value="${esc(l)}" placeholder="Vế trái ${i + 1}">
          <span class="eb-pair-link c${i % 6}"><i class="fa-solid fa-link"></i></span>
          <input class="eb-input" data-f="pr" data-i="${i}" maxlength="200" value="${esc(r)}" placeholder="Vế phải ${i + 1}">
          ${pairs.length > 2 ? `<button type="button" data-act="del-pair" data-i="${i}" class="is-danger" title="Bỏ cặp" aria-label="Bỏ cặp ${i + 1}"><i class="fa-solid fa-xmark"></i></button>` : ''}
        </div>`).join('')}</div>
        ${pairs.length < MAX_ROWS ? '<button type="button" class="eb-btn eb-btn-soft" data-act="add-pair"><i class="fa-solid fa-plus"></i> Thêm cặp</button>' : ''}
        <p class="eb-hint"><i class="fa-solid fa-circle-info"></i> Mỗi dòng là 1 cặp đúng — học sinh nối lại các vế đã bị xáo.</p>`;
    }
    return `<div class="eb-canvas">
      <div class="eb-canvas-type"><i class="fa-solid ${TYPE_BY_ID[c.type].icon}"></i> ${TYPE_BY_ID[c.type].label} · Câu ${B.cur + 1}/${B.slides.length}</div>
      <textarea class="eb-qinput" data-f="q" rows="1" maxlength="600" placeholder="Nhập câu hỏi…" aria-label="Nội dung câu hỏi">${esc(c.q)}</textarea>
      ${mediaHtml(c.img)}
      ${answers}
      <label class="eb-expl-row"><span><i class="fa-regular fa-lightbulb"></i> Giải thích <small>(tuỳ chọn — học sinh xem khi xem lại bài)</small></span>
        <textarea class="eb-input" data-f="expl" rows="2" maxlength="2000" placeholder="Vì sao đáp án này đúng?">${esc(c.expl || '')}</textarea></label>
      <div class="eb-stage-errors" id="ebStageErrors"></div>
    </div>`;
  }

  function bankCanvas(s) {
    const q = s.q;
    const convertible = ['single', 'multi', 'ordering', 'matching'].includes(q.type);
    const src = qSource(s.uid);
    const srcNote = src.id === 'ak' ? `<div class="eb-src-note is-ak"><i class="fa-solid fa-key"></i> Câu đáp án gốc All Key — ${esc(paperText(src.papers))}</div>`
      : src.id === 'bai' ? '<div class="eb-src-note is-bai"><i class="fa-solid fa-book-open"></i> Câu Củng cố theo bài (thư mục Quiz) — để dạy &amp; luyện tập; đề ôn thi/kiểm tra nên dùng câu All Key.</div>'
      : src.id === 'old' ? '<div class="eb-src-note is-old"><i class="fa-solid fa-database"></i> Câu ngân hàng cũ, không có trong đề gốc All Key.</div>' : '';
    return `<div class="eb-canvas eb-canvas-bank">
      <div class="eb-canvas-type"><i class="fa-solid ${SOURCES[src.id]?.icon || 'fa-database'}"></i> ${esc(src.id === 'bai' ? 'Theo bài' : src.label)} · ${esc(levelMeta(s.cat, s.level)?.name || s.level)} · ${esc(s.mt)} · Câu ${B.cur + 1}/${B.slides.length}</div>
      <div class="eb-bank-q">${esc(stripHtml(q.question))} <span class="eb-type eb-type-${esc(q.type)}">${esc(BANK_TYPE_LABEL[q.type] || q.type)}</span></div>
      <div class="eb-q-detail">${renderQuestionDetail(q, { answer: true })}</div>
      ${srcNote}
      <div class="eb-swap-row">
        <button type="button" class="eb-btn eb-btn-ghost" data-act="swap" title="Lấy 1 câu khác cùng bộ &quot;${esc(s.mt)}&quot;, chưa có trong đề${src.id === 'ak' ? ', cũng là câu All Key' : ''}"><i class="fa-solid fa-shuffle"></i> Đổi câu khác</button>
        ${src.id === 'old' ? '<button type="button" class="eb-btn eb-btn-soft" data-act="swap-ak" title="Lấy 1 câu All Key cùng chủ đề thay cho câu này"><i class="fa-solid fa-key"></i> Đổi sang câu All Key</button>' : ''}
      </div>
      <div class="eb-bank-note">
        <i class="fa-solid fa-lock"></i>
        <span>Câu ngân hàng tự cập nhật khi "Quản lý câu hỏi" sửa nội dung.${convertible ? ' Muốn chỉnh riêng cho đề này?' : ' Dạng này chỉ dùng nguyên bản.'}</span>
        ${convertible ? '<button type="button" class="eb-btn eb-btn-soft" data-act="convert"><i class="fa-solid fa-pen"></i> Chuyển thành câu tự soạn</button>' : ''}
      </div>
    </div>`;
  }

  function renderStageErrors() {
    const box = $('ebStageErrors');
    const s = B.slides[B.cur];
    if (!box || !s) return;
    const errs = slideErrors(s);
    box.innerHTML = errs.map((e) => `<span><i class="fa-solid fa-circle-exclamation"></i> ${esc(e)}</span>`).join('');
  }

  function autoGrow(ta) { if (!ta) return; ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 220) + 'px'; }

  // ============================================================
  // RENDER — BẢNG PHẢI
  // ============================================================
  function renderInspector() {
    const s = B.slides[B.cur];
    let typeBox = '';
    if (s?.custom) {
      typeBox = `<div class="eb-insp-sec"><div class="eb-insp-title">Dạng câu hỏi</div>
        <div class="eb-type-grid">${CUSTOM_TYPES.map((t) => `<button type="button" class="eb-type-btn${t.id === s.custom.type ? ' is-active' : ''}" data-insp="type" data-type="${t.id}">
          <i class="fa-solid ${t.icon}"></i><b>${t.label}</b><small>${t.hint}</small></button>`).join('')}</div></div>`;
    } else if (s) {
      typeBox = `<div class="eb-insp-sec"><div class="eb-insp-title">Câu từ ngân hàng</div>
        <p class="eb-insp-p">${esc(BANK_TYPE_LABEL[s.q.type] || s.q.type)} · ${esc(s.mt)}</p>
        ${(() => { const src = qSource(s.uid); return src.id ? `<p class="eb-insp-src is-${src.id}"><i class="fa-solid ${SOURCES[src.id].icon}"></i> ${esc(src.id === 'ak' ? 'All Key: ' + paperText(src.papers) : src.id === 'bai' ? src.label + ' · Củng cố (Quiz)' : src.label)}</p>` : ''; })()}</div>`;
    }
    $('ebInspector').innerHTML = `${typeBox}
      ${s ? `<div class="eb-insp-sec eb-insp-row">
        <button type="button" class="eb-btn eb-btn-ghost" data-insp="dup"><i class="fa-regular fa-copy"></i> Nhân bản</button>
        <button type="button" class="eb-btn eb-btn-danger" data-insp="del"><i class="fa-regular fa-trash-can"></i> Xoá câu</button></div>` : ''}
      <div class="eb-insp-sec"><div class="eb-insp-title">Tình trạng đề</div><div id="ebHealth"></div></div>
      <div class="eb-insp-sec eb-insp-quick">
        <div class="eb-insp-title">Làm bài</div>
        <label class="eb-field"><span>Thời gian Kiểm tra (phút)</span>
          <input type="number" min="0" max="180" id="ebDuration" value="${B.duration || ''}" placeholder="Để trống = HS tự chọn"></label>
        <label class="eb-check"><input type="checkbox" id="ebShuffle" ${B.shuffle ? 'checked' : ''}> Trộn thứ tự câu</label>
      </div>`;
    renderHealth();
  }

  // ── Câu na ná nhau (js/services/question-similarity.js) ──
  // Ngân hàng có nhiều biến thể cùng ý khác uid; chỉ nhắc, không chặn lưu.
  let simMemo = { key: null, groups: [], sig: '' };
  function slideSimText(s) {
    if (s.custom) {
      const c = s.custom;
      return { q: c.q, body: [...(c.options || []), ...(c.items || []), ...(c.pairs || []).flat()].join(' ') };
    }
    return { q: s.q?.question || '', body: global.EduQuestionSimilarity.bodyText(s.q || {}) };
  }
  function similarGroups() {
    const S = global.EduQuestionSimilarity;
    if (!S) return [];
    const key = B.slides.map((s) => (s.custom ? JSON.stringify(slideSimText(s)) : s.uid)).join('\n');
    if (key !== simMemo.key) simMemo = { key, groups: S.groups(B.slides.map(slideSimText)), sig: simMemo.sig };
    return simMemo.groups;
  }

  /** Số câu theo bộ nguồn (bài/chủ đề/tiết) — đề lệch hẳn về 1 bộ thì thấy ngay. */
  function sourceDistHtml() {
    const by = new Map();
    B.slides.forEach((s) => { const k = s.custom ? 'Câu tự soạn' : s.mt; by.set(k, (by.get(k) || 0) + 1); });
    if (by.size < 2) return '';
    let rows = [...by].sort((a, b) => b[1] - a[1]);
    if (rows.length > 6) rows = [...rows.slice(0, 5), ['Bộ khác', rows.slice(5).reduce((t, r) => t + r[1], 0)]];
    const n = B.slides.length;
    return `<div class="eb-dist" aria-label="Phân bố câu theo bộ nguồn">
      <div class="eb-dist-title">Phân bố câu</div>
      ${rows.map(([k, c]) => `<div class="eb-dist-row" title="${esc(k)}: ${c}/${n} câu">
        <span>${esc(k)}</span><b>${c}</b><i style="--w:${Math.max(3, Math.round((c / n) * 100))}%"></i></div>`).join('')}
    </div>`;
  }

  /** Đếm câu theo nguồn dữ liệu; đề có giờ Kiểm tra mà lẫn câu ngoài All Key thì nhắc. */
  function sourceHealthHtml() {
    if (!B.allkey) return '';
    const cnt = { ak: 0, bai: 0, old: 0, custom: 0 };
    const nonAk = [];
    B.slides.forEach((s, i) => {
      if (s.custom) { cnt.custom++; return; }
      const id = qSource(s.uid).id;
      cnt[id]++;
      if (id !== 'ak') nonAk.push(i);
    });
    if (!cnt.ak && !cnt.bai && !cnt.old) return '';
    const chip = (id, label, n) => (n ? `<span class="eb-src-chip is-${id}" title="${esc(label)}: ${n} câu">${SOURCES[id] ? `<i class="fa-solid ${SOURCES[id].icon}"></i> ` : ''}${esc(label)} <b>${n}</b></span>` : '');
    const swappable = B.slides.filter((s) => !s.custom && qSource(s.uid).id === 'old').length;
    const warn = B.duration > 0 && nonAk.length
      ? `<div class="eb-health-row is-warn"><i class="fa-solid fa-key"></i>
          <span>Đề kiểm tra có ${nonAk.length} câu không thuộc All Key</span>
          <button type="button" class="eb-link" data-insp="goto" data-i="${nonAk.find((i) => i > B.cur) ?? nonAk[0]}">Tới câu ${(nonAk.find((i) => i > B.cur) ?? nonAk[0]) + 1}</button></div>
        ${swappable ? `<button type="button" class="eb-btn eb-btn-soft eb-src-fix" data-insp="swap-all-ak"><i class="fa-solid fa-key"></i> Đổi ${swappable} câu ngoài All Key sang All Key</button>` : ''}`
      : '';
    return `<div class="eb-src-chips" aria-label="Nguồn dữ liệu">${chip('ak', 'All Key', cnt.ak)}${chip('bai', 'Theo bài', cnt.bai)}${chip('old', 'Ngoài All Key', cnt.old)}${chip('custom', 'Tự soạn', cnt.custom)}</div>${warn}`;
  }

  function renderHealth() {
    const box = $('ebHealth');
    if (!box) return;
    const n = B.slides.length;
    const sims = similarGroups();
    const sig = JSON.stringify(sims);
    if (sig !== simMemo.sig) { simMemo.sig = sig; renderRail(); } // dấu "na ná" ở các câu khác cũng đổi
    const bad = B.slides.map((s, i) => (slideErrors(s).length ? i : -1)).filter((i) => i >= 0);
    const live = B.slides.filter(liveOk).length;
    const kb = (B.linkLen / 1024).toFixed(1).replace('.', ',');
    const lvl = B.linkLen <= LINK_OK ? 'ok' : B.linkLen <= LINK_LONG ? 'warn' : 'bad';
    const pct = Math.min(100, Math.round((B.linkLen / LINK_LONG) * 100));
    box.innerHTML = `
      <div class="eb-health-row ${bad.length ? 'is-bad' : 'is-ok'}">
        <i class="fa-solid ${bad.length ? 'fa-circle-exclamation' : 'fa-circle-check'}"></i>
        <span>${bad.length ? `${bad.length}/${n} câu cần sửa` : `${n} câu đều hợp lệ`}</span>
        ${bad.length ? `<button type="button" class="eb-link" data-insp="goto-bad" data-i="${bad[0]}">Tới câu ${bad[0] + 1}</button>` : ''}
      </div>
      <div class="eb-health-row ${live >= 5 ? 'is-ok' : 'is-muted'}">
        <i class="fa-solid fa-tower-broadcast"></i>
        <span>${live} câu chơi trực tiếp được${live < 5 ? ' (cần ≥ 5)' : live > 15 ? ' (mỗi phòng tối đa 15)' : ''}</span>
      </div>
      ${sourceHealthHtml()}
      ${sims.length ? `<div class="eb-health-row is-warn">
        <i class="fa-regular fa-clone"></i>
        <span>${sims.reduce((t, g) => t + g.length, 0)} câu na ná nhau (${sims.length} nhóm)</span>
      </div>
      <div class="eb-sim-list">${sims.slice(0, 6).map((g) => `<div class="eb-sim-group">${g.map((i) => `<button type="button" class="eb-sim-no${i === B.cur ? ' is-cur' : ''}" data-insp="goto" data-i="${i}" title="Tới câu ${i + 1}">${i + 1}</button>`).join('')}</div>`).join('')}${sims.length > 6 ? `<small>+${sims.length - 6} nhóm nữa</small>` : ''}</div>
      <p class="eb-sim-hint">Cùng ý hỏi, có thể khác dạng hoặc khác đáp án. Giữ lại nếu muốn ôn kỹ, không thì xoá bớt cho đề đa dạng.</p>` : ''}
      <div class="eb-linkmeter is-${lvl}" title="Đề nằm gọn trong link — không tốn lượt Firebase">
        <div class="eb-linkmeter-top"><span><i class="fa-solid fa-link"></i> Độ dài link</span><b>${B.linkLen ? kb + ' KB' : '…'}</b></div>
        <div class="eb-linkmeter-bar"><i style="width:${pct}%"></i></div>
        <small>${lvl === 'ok' ? 'Gọn — gửi qua Zalo/Messenger thoải mái.' : lvl === 'warn' ? 'Hơi dài (thường do ảnh tải lên) — vẫn mở được; nên dùng link ảnh https:// nếu gửi qua ứng dụng chat.' : 'Quá dài — bớt ảnh tải lên hoặc dùng link ảnh để link không bị cắt khi gửi.'}</small>
      </div>
      ${sourceDistHtml()}`;
  }

  function renderAll() { renderTop(); renderRail(); renderStage(); renderInspector(); refreshLinkSize(); }

  // ============================================================
  // CHI TIẾT CÂU NGÂN HÀNG (xem + in)
  // ============================================================
  function letter(i) { return String.fromCharCode(65 + i); }
  function imgHtml(q) {
    const src = q.imageUrl || (q.image_file ? `img/${q.image_file}` : '');
    return src ? `<img class="eb-qimg" src="${esc(src)}" alt="" loading="lazy">` : '';
  }
  function renderQuestionDetail(q, { answer }) {
    const ok = (cond) => (answer && cond ? ' is-correct' : '');
    const correct = new Set(q.correct || []);
    let body = '';
    switch (q.type) {
      case 'single':
      case 'multi':
        body = `<ol class="eb-opts">${(q.options || []).map((o, i) => `<li class="${ok(correct.has(o))}"><b>${letter(i)}.</b> ${esc(stripHtml(o))}</li>`).join('')}</ol>`;
        break;
      case 'truefalse':
        body = `<table class="eb-tf"><thead><tr><th>Phát biểu</th><th>${esc(q.label_true || 'Đúng')}</th><th>${esc(q.label_false || 'Sai')}</th></tr></thead><tbody>${
          (q.statements || []).map((s) => `<tr><td>${esc(s.text)}</td><td class="${ok(s.answer === 'true')}">${answer && s.answer === 'true' ? '✔' : '☐'}</td><td class="${ok(s.answer === 'false')}">${answer && s.answer === 'false' ? '✔' : '☐'}</td></tr>`).join('')}</tbody></table>`;
        break;
      case 'list':
        body = `<ol class="eb-opts">${(q.items || []).map((it) => `<li>${esc(it.text)} — ${(it.options || []).map((o) => `<span class="eb-pill${ok(o === it.correct)}">${esc(o)}</span>`).join(' ')}</li>`).join('')}</ol>`;
        break;
      case 'matching': {
        const pairs = q.pairs || [];
        const rights = [...new Set(pairs.map((p) => p.right))].sort((a, b) => String(a).localeCompare(String(b), 'vi'));
        body = `<div class="eb-match"><ol>${pairs.map((p) => `<li>${esc(stripHtml(p.left))}</li>`).join('')}</ol><ol type="a">${rights.map((r) => `<li>${esc(stripHtml(r))}</li>`).join('')}</ol></div>`
          + (answer ? `<div class="eb-answer"><b>Đáp án:</b> ${pairs.map((p, i) => `${i + 1}–${letter(rights.indexOf(p.right)).toLowerCase()}`).join(', ')}</div>` : '');
        break;
      }
      case 'classify': {
        const zones = (q.zones || []).map((z) => (typeof z === 'string' ? z : z.label));
        body = `<div class="eb-line"><b>Nhóm:</b> ${zones.map((z) => `<span class="eb-pill">${esc(z)}</span>`).join(' ')}</div>
          <div class="eb-line"><b>Thẻ:</b> ${(q.items || []).map((it) => `<span class="eb-pill">${esc(it.text)}</span>`).join(' ')}</div>`
          + (answer ? `<div class="eb-answer"><b>Đáp án:</b> ${(q.items || []).map((it) => `${esc(it.text)} → ${esc(it.zone)}`).join('; ')}</div>` : '');
        break;
      }
      case 'ordering': {
        const items = q.items || [];
        const disp = items.slice().sort((a, b) => String(a).localeCompare(String(b), 'vi'));
        body = `<ol type="a" class="eb-opts">${disp.map((s) => `<li>${esc(stripHtml(s))}</li>`).join('')}</ol>`
          + (answer ? `<div class="eb-answer"><b>Thứ tự đúng:</b> ${items.map((s) => letter(disp.indexOf(s)).toLowerCase()).join(' → ')}</div>` : '');
        break;
      }
      case 'dragfill':
      case 'selectfill': {
        const segs = q.segments || [];
        const blanks = q.blanks || [];
        const text = segs.map((s, i) => esc(s) + (i < blanks.length ? (answer ? ` <span class="eb-blank is-correct">${esc(blanks[i])}</span> ` : ` <span class="eb-blank">(${i + 1})</span> `) : '')).join('');
        body = `<div class="eb-fill">${text.replace(/\n/g, '<br>')}</div>`
          + (q.wordBank?.length ? `<div class="eb-line"><b>Lựa chọn:</b> ${[...new Set(q.wordBank)].map((w) => `<span class="eb-pill">${esc(w)}</span>`).join(' ')}</div>` : '');
        break;
      }
      case 'hotspot':
        body = `<div class="eb-line eb-muted">Học sinh bấm chọn vùng trên ảnh (${(q.areas || []).filter((a) => a.correct).length} vùng đúng) — làm trên máy.</div>`;
        break;
      default: body = '';
    }
    const expl = answer && q.explanation ? `<div class="eb-expl"><i class="fa-regular fa-lightbulb"></i> ${esc(stripHtml(q.explanation))}</div>` : '';
    return imgHtml(q) + body + expl;
  }

  /** Câu ngân hàng → câu tự soạn (để chỉnh riêng). */
  function bankToCustom(s) {
    const q = s.q;
    const img = q.imageUrl || (q.image_file ? `img/${q.image_file}` : '');
    const base = { q: stripHtml(q.question), expl: stripHtml(q.explanation || '') };
    if (img && global.EduCustomExam.safeImage(img)) base.img = img;
    if (q.type === 'single' || q.type === 'multi') {
      const options = (q.options || []).map(stripHtml).slice(0, MAX_OPTIONS);
      const corr = new Set((q.correct || []).map(stripHtml));
      return Object.assign(base, { type: q.type, options, correct: options.map((o, i) => (corr.has(o) ? i : -1)).filter((i) => i >= 0) });
    }
    if (q.type === 'ordering') return Object.assign(base, { type: 'ordering', items: (q.items || []).map(stripHtml).slice(0, MAX_ROWS) });
    if (q.type === 'matching') return Object.assign(base, { type: 'matching', pairs: (q.pairs || []).map((p) => [stripHtml(p.left), stripHtml(p.right)]).slice(0, MAX_ROWS) });
    return null;
  }

  /** Đổi dạng câu tự soạn, giữ lại nội dung dùng được. */
  function convertType(c, to) {
    if (c.type === to) return c;
    const n = blankCustom(to);
    n.q = c.q; n.expl = c.expl; if (c.img) n.img = c.img;
    // "Đúng"/"Sai" chỉ có nghĩa khi sang trắc nghiệm; sang Sắp xếp/Nối cặp thì để trống
    // (trước đây vế trái Nối cặp bị điền sẵn "Đúng", "Sai").
    const texts = c.type === 'tf' ? (to === 'single' || to === 'multi' ? ['Đúng', 'Sai'] : [])
      : c.type === 'ordering' ? (c.items || [])
      : c.type === 'matching' ? (c.pairs || []).map((p) => p[0])
      : (c.options || []);
    const filled = texts.filter((t) => String(t).trim());
    if (to === 'single' || to === 'multi') {
      if (filled.length) n.options = filled.concat(['', '']).slice(0, Math.max(2, Math.min(MAX_OPTIONS, filled.length)));
      if (c.type === 'single' || c.type === 'multi') n.correct = (c.correct || []).slice(0, to === 'single' ? 1 : MAX_OPTIONS);
      if (c.type === 'tf') n.correct = [(c.correct || [0])[0]];
    } else if (to === 'ordering') {
      if (filled.length >= 2) n.items = filled.slice(0, MAX_ROWS);
    } else if (to === 'matching') {
      if (filled.length >= 2) n.pairs = filled.slice(0, MAX_ROWS).map((t, i) => [t, c.type === 'matching' ? c.pairs[i][1] : '']);
    } else if (to === 'tf' && (c.type === 'single' || c.type === 'multi')) {
      const ci = (c.correct || [])[0];
      const txt = String((c.options || [])[ci] || '').trim().toLowerCase();
      n.correct = [txt === 'sai' ? 1 : 0];
    }
    return n;
  }

  // ============================================================
  // THAO TÁC CÂU
  // ============================================================
  function addSlide(slide, at = B.cur + 1) {
    const i = B.slides.length ? Math.min(at, B.slides.length) : 0;
    B.slides.splice(i, 0, slide);
    B.cur = i;
    changed({ rail: false });
    renderRail(); renderStage(); renderInspector();
  }
  function addCustom(type) {
    addSlide({ id: newId(), custom: blankCustom(type) });
    setTimeout(() => $('ebStage').querySelector('.eb-qinput')?.focus(), 0);
  }
  function dupSlide(i) {
    const s = B.slides[i];
    if (!s) return;
    addSlide(s.custom ? { id: newId(), custom: clone(s.custom) } : { id: newId(), cat: s.cat, level: s.level, mt: s.mt, uid: s.uid, q: s.q }, i + 1);
    toast(`Đã nhân bản câu ${i + 1}.`, 'fa-copy');
  }
  function delSlide(i) {
    const s = B.slides[i];
    if (!s) return;
    const hasContent = s.custom ? (s.custom.q || '').trim() : true;
    if (hasContent && !confirm(`Xoá câu ${i + 1}?`)) return;
    B.slides.splice(i, 1);
    B.cur = Math.min(B.cur, B.slides.length - 1);
    if (B.cur < 0) B.cur = 0;
    changed({ rail: false });
    renderRail(); renderStage(); renderInspector();
  }
  /**
   * Câu thay thế cho câu ngân hàng ở vị trí i: cùng bộ nguồn, chưa có trong đề, không na ná
   * câu nào khác trong đề; câu All Key thì thay bằng câu All Key; ưu tiên cùng dạng câu.
   */
  async function pickReplacement(i, { allKey = false } = {}) {
    const s = B.slides[i];
    const list = await fetchMinitest(s.cat, s.level, s.mt);
    const used = bankUids();
    const wantAk = allKey || qSource(s.uid).id === 'ak';
    const Sim = global.EduQuestionSimilarity;
    const near = Sim ? Sim.matcher(B.slides.filter((_, k) => k !== i).map(slideSimText)) : () => false;
    const pool = list.filter((q) => q.uid && !used.has(q.uid) && (!wantAk || qSource(q.uid).id === 'ak')
      && !near({ q: q.question, body: Sim ? Sim.bodyText(q) : '' }));
    const same = pool.filter((q) => q.type === s.q?.type);
    return shuffled(same.length ? same : pool)[0] || null;
  }
  function replaceSlide(i, q) {
    const s = B.slides[i];
    B.slides[i] = { id: newId(), cat: s.cat, level: s.level, mt: s.mt, uid: q.uid, q };
  }
  async function swapSlide(i, opts) {
    const s = B.slides[i];
    if (!s || s.custom) return;
    let q;
    try { q = await pickReplacement(i, opts); } catch (e) { toast('Không tải được bộ câu: ' + e.message, 'fa-triangle-exclamation'); return; }
    if (!q) {
      toast(`Bộ "${s.mt}" không còn ${opts?.allKey || qSource(s.uid).id === 'ak' ? 'câu All Key ' : 'câu '}nào chưa dùng mà không na ná câu khác trong đề.`, 'fa-circle-info');
      return;
    }
    replaceSlide(i, q);
    changed({ rail: false });
    renderRail(); renderStage(); renderInspector();
    const src = qSource(q.uid);
    toast(`Đã đổi câu ${i + 1}${src.id === 'ak' ? ` — All Key: ${paperText(src.papers)}` : ''}. Ctrl+Z để hoàn tác.`, 'fa-shuffle');
  }
  /** Đổi mọi câu "Ngoài All Key" sang câu All Key cùng bộ (1 bước hoàn tác). */
  async function swapAllToAllKey() {
    const idx = B.slides.map((s, i) => (!s.custom && qSource(s.uid).id === 'old' ? i : -1)).filter((i) => i >= 0);
    let done = 0;
    try {
      for (const i of idx) {
        const q = await pickReplacement(i, { allKey: true });
        if (q) { replaceSlide(i, q); done++; }
      }
    } catch (e) { toast('Không tải được bộ câu: ' + e.message, 'fa-triangle-exclamation'); }
    if (done) { changed({ rail: false }); renderRail(); renderStage(); renderInspector(); }
    const left = idx.length - done;
    toast(left ? `Đã đổi ${done} câu sang All Key — ${left} câu giữ nguyên vì bộ của nó hết câu All Key chưa dùng.` : `Đã đổi ${done} câu sang All Key. Ctrl+Z để hoàn tác.`, left ? 'fa-triangle-exclamation' : 'fa-key');
  }

  function moveSlide(from, to) {
    if (from === to || to < 0 || to >= B.slides.length) return;
    const [s] = B.slides.splice(from, 1);
    B.slides.splice(to, 0, s);
    B.cur = to;
    changed({ rail: false });
    renderRail(); renderStage();
  }

  // ── Ảnh: nén gọn để link không phình (mục tiêu ≤ ~30KB/ảnh) ──
  function loadImage(src) {
    return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('Không đọc được ảnh')); im.src = src; });
  }
  async function compressImage(file) {
    const url = URL.createObjectURL(file);
    try {
      const im = await loadImage(url);
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      let max = 720, q = 0.72, out = '';
      for (let step = 0; step < 7; step++) {
        const k = Math.min(1, max / Math.max(im.naturalWidth, im.naturalHeight));
        canvas.width = Math.max(1, Math.round(im.naturalWidth * k));
        canvas.height = Math.max(1, Math.round(im.naturalHeight * k));
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(im, 0, 0, canvas.width, canvas.height);
        out = canvas.toDataURL('image/webp', q);
        if (!out.startsWith('data:image/webp')) out = canvas.toDataURL('image/jpeg', q);
        if (out.length <= 40000) break;
        if (q > 0.45) q -= 0.12; else max = Math.round(max * 0.78);
      }
      return out;
    } finally { URL.revokeObjectURL(url); }
  }
  async function setImageFromFile(file) {
    const s = B.slides[B.cur];
    if (!s?.custom || !file || !/^image\//.test(file.type)) return;
    try {
      s.custom.img = await compressImage(file);
      changed(); renderStage();
      toast(`Đã thêm ảnh (${Math.round(s.custom.img.length / 1024)} KB sau khi nén).`, 'fa-image');
    } catch (e) { toast(e.message, 'fa-triangle-exclamation'); }
  }
  function pickImage() {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*';
    inp.onchange = () => setImageFromFile(inp.files[0]);
    inp.click();
  }

  // ============================================================
  // LƯU / CHIA SẺ
  // ============================================================
  function firstInvalid() { return B.slides.findIndex((s) => slideErrors(s).length); }
  function ensureValid(action) {
    if (!B.slides.length) { toast('Đề chưa có câu nào.', 'fa-triangle-exclamation'); return false; }
    const bad = firstInvalid();
    if (bad >= 0) {
      select(bad);
      toast(`Câu ${bad + 1} chưa hoàn chỉnh: ${slideErrors(B.slides[bad])[0]} — sửa trước khi ${action}.`, 'fa-triangle-exclamation');
      return false;
    }
    return true;
  }

  async function save() {
    if (!B.title.trim()) { openSettings(true); toast('Đặt tên đề trước khi lưu.', 'fa-triangle-exclamation'); return; }
    if (!ensureValid('lưu')) return;
    const exam = buildExam();
    const link = await global.EduCustomExam.buildLink(exam);
    const type = B.type || defaultType();
    const lv = examLevel();
    const sets = lsGet(SETS_KEY, []);
    const old = B.editingId ? sets.find((s) => s.id === B.editingId) : null;
    const set = Object.assign(old || { id: 'exam_' + Date.now() }, {
      title: exam.title,
      subtitle: (B.deadline ? `Hạn ${fmtDeadline(B.deadline)} · ` : '') + (B.desc.trim() || (lv.cat ? `Đề soạn · ${levelMeta(lv.cat, lv.level)?.name || ''}` : 'Đề tự soạn')),
      questions: exam.items.length, type,
      icon: B.theme.icon || '📝', coverGradient: COVERS[B.theme.color] || COVERS[0],
      link,
      builder: Object.assign({ v: 2, type }, snapshot()),
      updatedAt: Date.now(),
    });
    delete set.builder.dirty; delete set.builder.editingId;
    if (!old) sets.push(set);
    if (!lsSet(SETS_KEY, sets)) { toast('Không lưu được — bộ nhớ trình duyệt đầy (thường do nhiều ảnh tải lên). Thử dùng link ảnh https://.', 'fa-triangle-exclamation'); return; }
    B.editingId = set.id; B.type = type; B.dirty = false;
    saveDraft(); renderTop();
    global.refreshSetsFromStorage?.();
    toast(old ? `Đã cập nhật: ${set.title}` : `Đã lưu "${set.title}" vào Bộ đề của tôi`, 'fa-circle-check');
  }

  async function absLink(page) { return new URL(await global.EduCustomExam.buildLink(buildExam(), page), location.href).href; }
  async function copyLink() {
    if (!ensureValid('chia sẻ')) return;
    const url = await absLink('index.html');
    try { await navigator.clipboard.writeText(url); toast('Đã sao chép link làm bài — gửi cho học sinh.', 'fa-link'); }
    catch (e) { prompt('Sao chép link làm bài:', url); }
  }
  /** Đấu trường (arena.html): học sinh tự chơi đề kiểu Kahoot/Blooket trên máy mình — đề nằm trong link, 0 Firebase. */
  async function copyArenaLink() {
    if (!ensureValid('chia sẻ')) return;
    const url = await absLink('arena.html');
    try { await navigator.clipboard.writeText(url); toast('Đã sao chép link Đấu trường — học sinh chơi Tốc độ / Săn vàng / Đua về đích với đề này.', 'fa-gamepad'); }
    catch (e) { prompt('Sao chép link Đấu trường:', url); }
  }
  async function openLive() {
    if (B.slides.filter(liveOk).length < 5) return;
    const bad = firstInvalid();
    if (bad >= 0 && !confirm(`Có câu chưa hoàn chỉnh (câu ${bad + 1}) — các câu lỗi sẽ bị bỏ qua khi chơi trực tiếp. Tiếp tục?`)) return;
    // Phòng cả lớp của Đấu trường (WebRTC, 0 lượt Firebase) — đề nằm sẵn trong link.
    window.open((await absLink('arena.html')) + '#arRoomCard', '_blank', 'noopener');
  }

  async function openFromLink() {
    const raw = prompt('Dán link đề (index.html?de=… hoặc arena.html?de=…) để mở và chỉnh sửa trên máy này:');
    if (!raw) return;
    let code = '';
    try { code = new URL(raw.trim(), location.href).searchParams.get('de') || ''; } catch (e) { code = ''; }
    if (!code && /^[\w-]+$/.test(raw.trim())) code = raw.trim();
    const exam = code ? await global.EduCustomExam.decode(code) : null;
    if (!exam) { toast('Link không hợp lệ hoặc bị cắt mất 1 phần.', 'fa-triangle-exclamation'); return; }
    if (B.dirty && B.slides.length && !confirm('Bỏ đề đang soạn dở (chưa lưu) để mở đề từ link?')) return;
    await loadInto(exam, { dirty: true });
    saveDraft(); renderAll();
    toast(`Đã mở "${exam.title}" — bấm Lưu để thêm vào Bộ đề của tôi trên máy này.`, 'fa-link');
  }

  // ============================================================
  // HỘP THOẠI: CÀI ĐẶT ĐỀ / NHẬP NHANH / MA TRẬN / IN
  // ============================================================
  function modal(titleHtml, bodyHtml, footerHtml) {
    $('modal-title').innerHTML = titleHtml;
    $('modal-body').innerHTML = bodyHtml;
    $('modal-footer').innerHTML = footerHtml;
    global.openModalEl?.();
    return $('modal-body');
  }

  function openSettings(focusTitle) {
    const body = modal('<i class="fa-solid fa-sliders"></i> Cài đặt đề', `
      <div class="eb-set">
        <div class="eb-set-cover" id="ebSetCover" style="background:${COVERS[B.theme.color] || COVERS[0]}">${esc(B.theme.icon || '📝')}</div>
        <div class="eb-set-fields">
          <label class="eb-field"><span>Tên đề *</span><input id="ebSetTitle" maxlength="120" value="${esc(B.title)}" placeholder="VD: Kiểm tra giữa kỳ – Khối 7"></label>
          <label class="eb-field"><span>Mô tả ngắn</span><input id="ebSetDesc" maxlength="300" value="${esc(B.desc)}" placeholder="VD: Ôn tập chủ đề 1–3, làm trong tiết 2"></label>
        </div>
      </div>
      <div class="eb-field"><span>Màu bìa</span><div class="eb-swatches">${COVERS.map((g, i) => `<button type="button" class="eb-swatch${i === B.theme.color ? ' is-active' : ''}" data-color="${i}" style="background:${g}" aria-label="Màu ${i + 1}"></button>`).join('')}</div></div>
      <div class="eb-field"><span>Biểu tượng</span><div class="eb-icons">${COVER_ICONS.map((ic) => `<button type="button" class="eb-icon-pick${ic === B.theme.icon ? ' is-active' : ''}" data-icon="${ic}">${ic}</button>`).join('')}</div></div>
      <div class="eb-field-row">
        <label class="eb-field"><span>Cấp học</span><select id="ebSetType"><option value="elementary">Tiểu học</option><option value="middle">THCS</option></select></label>
        <label class="eb-field"><span>Thời gian Kiểm tra (phút)</span><input type="number" id="ebSetDur" min="0" max="180" value="${B.duration || ''}" placeholder="Trống = HS tự chọn"></label>
      </div>
      <label class="eb-field"><span>Hạn nộp (giao bài về nhà — tuỳ chọn)</span>
        <input type="datetime-local" id="ebSetDeadline" value="${toLocalInput(B.deadline)}">
        <small class="eb-set-hint">Học sinh thấy hạn ở trang làm bài; làm sau hạn vẫn được nhưng bài ghi "(nộp muộn)" trong Báo cáo kết quả.</small></label>
      <label class="eb-check"><input type="checkbox" id="ebSetShuffle" ${B.shuffle ? 'checked' : ''}> Trộn thứ tự câu khi học sinh làm bài</label>`,
    `<button class="btn-cancel" onclick="closeModal()">Huỷ</button><button class="btn-save" id="ebSetOk"><i class="fa-solid fa-check"></i> Xong</button>`);
    $('ebSetType').value = B.type || defaultType();
    let color = B.theme.color, icon = B.theme.icon;
    const paint = () => {
      $('ebSetCover').style.background = COVERS[color]; $('ebSetCover').textContent = icon;
      body.querySelectorAll('[data-color]').forEach((b) => b.classList.toggle('is-active', +b.dataset.color === color));
      body.querySelectorAll('[data-icon]').forEach((b) => b.classList.toggle('is-active', b.dataset.icon === icon));
    };
    body.querySelectorAll('[data-color]').forEach((b) => b.addEventListener('click', () => { color = +b.dataset.color; paint(); }));
    body.querySelectorAll('[data-icon]').forEach((b) => b.addEventListener('click', () => { icon = b.dataset.icon; paint(); }));
    $('ebSetOk').addEventListener('click', () => {
      B.title = $('ebSetTitle').value.trim();
      B.desc = $('ebSetDesc').value.trim();
      B.theme = { color, icon };
      B.type = $('ebSetType').value;
      B.duration = Math.min(180, Math.max(0, parseInt($('ebSetDur').value, 10) || 0));
      B.shuffle = $('ebSetShuffle').checked;
      const dl = $('ebSetDeadline').value ? new Date($('ebSetDeadline').value).getTime() : 0;
      B.deadline = Number.isFinite(dl) ? dl : 0;
      global.closeModal?.();
      changed({ rail: false });
      renderInspector();
    });
    body.querySelectorAll('input').forEach((i) => i.addEventListener('keydown', (e) => { if (e.key === 'Enter') $('ebSetOk').click(); }));
    setTimeout(() => (focusTitle ? $('ebSetTitle') : null)?.focus(), 50);
  }

  /** Nhập nhanh: dán nhiều câu, mỗi câu cách nhau 1 dòng trống. */
  // ── Nhập từ bảng (Excel / Google Sheets / CSV) ──
  // Mỗi dòng 1 câu: Câu hỏi | Đáp án A | B | C | D (tới F) | Đáp án đúng | Giải thích.
  // "Đáp án đúng" ghi chữ cái (B, AC, "A, C") hoặc Đúng/Sai cho câu Đúng/Sai.
  // Có dòng tiêu đề thì đọc cột theo tên; không có thì cột đáp án đúng là ô
  // cuối cùng (tính từ phải) trông giống đáp án.
  const SHEET_HEADERS = ['Câu hỏi', 'Đáp án A', 'Đáp án B', 'Đáp án C', 'Đáp án D', 'Đáp án E', 'Đáp án F', 'Đáp án đúng', 'Giải thích'];
  function parseDelimited(text) {
    const src = String(text || '').replace(/^\ufeff/, '').replace(/\r\n?/g, '\n');
    const first = src.split('\n').find((l) => l.trim()) || '';
    const delim = first.includes('\t') ? '\t' : (first.split(';').length > first.split(',').length ? ';' : ',');
    const rows = [];
    let row = [], cell = '', quoted = false;
    for (let i = 0; i < src.length; i++) {
      const ch = src[i];
      if (quoted) {
        if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; }
        else if (ch === '"') quoted = false;
        else cell += ch;
      } else if (ch === '"' && cell === '') quoted = true;
      else if (ch === delim) { row.push(cell); cell = ''; }
      else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += ch;
    }
    row.push(cell); rows.push(row);
    return rows;
  }
  function parseAnswerCell(v) {
    const t = String(v || '').trim();
    if (/^(đúng|sai|true|false|đ|s)$/i.test(t)) return { tf: /^(đúng|true|đ)$/i.test(t) ? 0 : 1 };
    const m = t.toUpperCase().replace(/VÀ|[\s,;/&+.]/g, '');
    if (m && /^[A-F]+$/.test(m)) return { idx: [...new Set([...m].map((ch) => ch.charCodeAt(0) - 65))] };
    return null;
  }
  function parseRows(rows0) {
    let rows = rows0.map((r) => r.map((c) => String(c ?? '').replace(/\s+/g, ' ').trim())).filter((r) => r.some(Boolean));
    let map = null;
    if (rows.length && /câu hỏi|cau hoi|question|nội dung/i.test(rows[0][0] || '')) {
      const h = rows[0].map((x) => x.toLowerCase());
      map = {
        q: 0,
        ans: h.findIndex((x) => /đáp án đúng|dap an dung|đúng|answer|key/.test(x)),
        expl: h.findIndex((x) => /giải thích|giai thich|explain/.test(x)),
        opts: h.map((x, i) => (/^(đáp án|dap an|phương án|phuong an|option)?\s*[a-f]$/.test(x) ? i : -1)).filter((i) => i > 0),
      };
      rows = rows.slice(1);
    }
    const out = [];
    let skipped = 0;
    rows.forEach((r) => {
      const q = (r[0] || '').replace(/^(câu|cau)\s*\d+\s*[:.)]\s*/i, '');
      let k = -1;
      if (map && map.ans > 0) k = map.ans;
      else for (let i = r.length - 1; i >= 1; i--) if (parseAnswerCell(r[i])) { k = i; break; }
      const ans = k > 0 ? parseAnswerCell(r[k]) : null;
      const raw = map && map.opts.length ? map.opts.map((i) => r[i] || '') : r.slice(1, Math.max(1, k));
      const expl = map ? (map.expl > 0 ? r[map.expl] || '' : '') : r.slice(k + 1).filter(Boolean).join(' ');
      const filled = raw.filter(Boolean);
      const low = filled.map((o) => o.toLowerCase());
      if (!q || !ans) { skipped++; return; }
      if (ans.tf != null && (!filled.length || (filled.length === 2 && low[0] === 'đúng' && low[1] === 'sai'))) {
        out.push({ type: 'tf', q, correct: [ans.tf], expl }); return;
      }
      if (ans.tf != null) { // "Đúng"/"Sai" ghi trong cột đáp án nhưng có phương án riêng → tìm phương án trùng chữ
        const j = low.indexOf(ans.tf ? 'sai' : 'đúng');
        if (j < 0) { skipped++; return; }
        ans.idx = [raw.indexOf(filled[j])];
      }
      // Bỏ ô phương án trống, đánh lại chỉ số đáp án đúng theo vị trí còn lại.
      const keep = raw.map((o, i) => (o ? i : -1)).filter((i) => i >= 0).slice(0, MAX_OPTIONS);
      const options = keep.map((i) => raw[i]);
      const correct = ans.idx.map((i) => keep.indexOf(i)).filter((i) => i >= 0);
      if (options.length < 2 || !correct.length) { skipped++; return; }
      out.push({ type: correct.length > 1 ? 'multi' : 'single', q, options, correct, expl });
    });
    return { out, skipped };
  }
  function rowsToTsv(rows) {
    return rows.map((r) => r.map((c) => {
      const t = String(c ?? '');
      return /[\t\n"]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
    }).join('\t')).join('\n');
  }
  async function loadExcelJs() {
    if (global.ExcelJS) return global.ExcelJS;
    if (!global.EduLazyLoad) throw new Error('Thiếu bộ tải thư viện.');
    await global.EduLazyLoad.loadScripts(['js/vendor/exceljs.min.js']);
    return global.ExcelJS;
  }
  /** File .xlsx / .csv → các dòng ô (mảng chuỗi). Chỉ đọc trang tính đầu tiên. */
  async function readSheetFile(file) {
    if (/\.(csv|tsv|txt)$/i.test(file.name)) return parseDelimited(await file.text());
    if (!/\.xlsx$/i.test(file.name)) throw new Error('Chỉ đọc được file .xlsx hoặc .csv (file .xls cũ: mở bằng Excel rồi "Lưu thành" .xlsx).');
    const ExcelJS = await loadExcelJs();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await file.arrayBuffer());
    const ws = wb.worksheets[0];
    if (!ws) return [];
    const rows = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const cells = [];
      for (let c = 1; c <= Math.max(row.cellCount, SHEET_HEADERS.length); c++) cells.push(row.getCell(c).text || '');
      rows.push(cells);
    });
    return rows;
  }
  async function downloadSheetTemplate() {
    try {
      const ExcelJS = await loadExcelJs();
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Câu hỏi');
      ws.addRow(SHEET_HEADERS);
      ws.addRow(['Thiết bị nào là thiết bị nhập?', 'Màn hình', 'Bàn phím', 'Loa', 'Máy in', '', '', 'B', 'Bàn phím dùng để nhập dữ liệu vào máy tính.']);
      ws.addRow(['Những thiết bị nào lưu trữ dữ liệu? (Chọn 2)', 'Ổ cứng', 'Chuột', 'USB', 'Loa', '', '', 'A, C', '']);
      ws.addRow(['RAM là bộ nhớ trong.', '', '', '', '', '', '', 'Đúng', 'RAM nằm trên bo mạch chủ, là bộ nhớ trong.']);
      ws.getRow(1).font = { bold: true };
      ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE7EAF6' } };
      ws.columns.forEach((col, i) => { col.width = i === 0 ? 48 : i === 8 ? 44 : i === 7 ? 14 : 18; col.alignment = { wrapText: true, vertical: 'top' }; });
      ws.views = [{ state: 'frozen', ySplit: 1 }];
      const buf = await wb.xlsx.writeBuffer();
      downloadBlob(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'mau-nhap-cau-hoi.xlsx');
    } catch (e) {
      // Không tải được ExcelJS (mất mạng...) → mẫu CSV, Excel vẫn mở được.
      const csv = '\ufeff' + [SHEET_HEADERS, ['Thiết bị nào là thiết bị nhập?', 'Màn hình', 'Bàn phím', 'Loa', 'Máy in', '', '', 'B', '']]
        .map((r) => r.map((c) => `"${c}"`).join(',')).join('\r\n');
      downloadBlob(new Blob([csv], { type: 'text/csv' }), 'mau-nhap-cau-hoi.csv');
    }
  }

  function parseQuick(text) {
    // Dán từ Excel/Google Sheets: các ô cách nhau bằng phím Tab.
    if ((String(text || '').split('\n').find((l) => l.trim()) || '').includes('\t')) return parseRows(parseDelimited(text));
    const blocks = String(text || '').replace(/\r/g, '').split(/\n\s*\n/).map((b) => b.split('\n').map((l) => l.trim()).filter(Boolean)).filter((b) => b.length);
    const out = [];
    let skipped = 0;
    const optRe = /^(\*?)\s*([A-Fa-f])[.)]\s*(.+?)\s*(\*?)$/;
    blocks.forEach((lines) => {
      const qLines = [], opts = [], correct = [];
      let expl = '';
      lines.forEach((l) => {
        const ex = l.match(/^(giải thích|giai thich|gt)\s*[:：]\s*(.*)$/i);
        if (ex) { expl = ex[2]; return; }
        const m = l.match(optRe);
        const star = /^\*/.test(l);
        if (m && (opts.length || qLines.length)) {
          if (m[1] || m[4]) correct.push(opts.length);
          opts.push(m[3]);
        } else if (star && qLines.length) {
          correct.push(opts.length); opts.push(l.replace(/^\*\s*/, ''));
        } else if (opts.length) {
          opts.push(l); // dòng đáp án không có A./B.
        } else qLines.push(l);
      });
      const q = qLines.join(' ').replace(/^(câu|cau)\s*\d+\s*[:.)]\s*/i, '').replace(/^\d+\s*[.)]\s*/, '');
      if (!q || opts.length < 2 || !correct.length) { skipped++; return; }
      const low = opts.map((o) => o.toLowerCase());
      if (opts.length === 2 && low[0] === 'đúng' && low[1] === 'sai') { out.push({ type: 'tf', q, correct: [correct[0]], expl }); return; }
      out.push({ type: correct.length > 1 ? 'multi' : 'single', q, options: opts.slice(0, MAX_OPTIONS), correct: correct.filter((i) => i < MAX_OPTIONS), expl });
    });
    return { out, skipped };
  }
  function openImport() {
    const sample = 'Câu 1: Thiết bị nào là thiết bị nhập?\nA. Màn hình\n*B. Bàn phím\nC. Loa\nD. Máy in\nGiải thích: Bàn phím dùng để nhập dữ liệu vào máy tính.\n\nCâu 2: RAM là bộ nhớ trong.\n*Đúng\nSai';
    const body = modal('<i class="fa-solid fa-paste"></i> Nhập nhanh nhiều câu', `
      <div class="eb-import-tabs">
        <button type="button" class="eb-btn eb-btn-soft" id="ebImportFile"><i class="fa-solid fa-file-excel"></i> Chọn file Excel / CSV</button>
        <button type="button" class="eb-btn eb-btn-ghost" id="ebImportTpl"><i class="fa-solid fa-download"></i> Tải file mẫu</button>
      </div>
      <p class="eb-matrix-hint"><b>Từ Word/Google Docs:</b> mỗi câu cách nhau 1 dòng trống; đánh dấu đáp án đúng bằng <b>*</b> ở đầu dòng (nhiều dấu * = câu nhiều đáp án); 2 đáp án "Đúng/Sai" thành câu Đúng/Sai; dòng "Giải thích:" là phần giải thích.<br>
      <b>Từ Excel/Google Sheets:</b> bôi đen các ô rồi dán vào đây, mỗi dòng 1 câu theo cột: Câu hỏi · Đáp án A–F · Đáp án đúng (B, AC hoặc Đúng/Sai) · Giải thích.</p>
      <textarea id="ebImportText" class="eb-input eb-import-ta" rows="12" placeholder="${esc(sample)}"></textarea>
      <div class="eb-import-status" id="ebImportStatus">Chưa có nội dung.</div>`,
    `<button class="btn-cancel" onclick="closeModal()">Huỷ</button><button class="btn-save" id="ebImportGo" disabled><i class="fa-solid fa-plus"></i> Thêm câu</button>`);
    const ta = $('ebImportText');
    $('ebImportTpl').addEventListener('click', downloadSheetTemplate);
    $('ebImportFile').addEventListener('click', () => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = '.xlsx,.csv,.tsv,.txt';
      inp.onchange = async () => {
        const f = inp.files[0];
        if (!f) return;
        $('ebImportStatus').textContent = `Đang đọc ${f.name}…`;
        try {
          ta.value = rowsToTsv(await readSheetFile(f));
          upd();
        } catch (e) { $('ebImportStatus').innerHTML = `<span class="eb-warn">${esc(e.message)}</span>`; }
      };
      inp.click();
    });
    const upd = () => {
      const { out, skipped } = parseQuick(ta.value);
      const tsv = ta.value.includes('\t');
      ta.classList.toggle('is-table', tsv);
      $('ebImportStatus').innerHTML = ta.value.trim()
        ? `Đọc được <b>${out.length}</b> câu${skipped ? ` · <span class="eb-warn">${skipped} ${tsv ? 'dòng' : 'khối'} bỏ qua (${tsv ? 'thiếu câu hỏi, &lt; 2 đáp án hoặc ô "Đáp án đúng" không phải A–F / Đúng / Sai' : 'thiếu câu hỏi, &lt; 2 đáp án hoặc chưa đánh dấu *'})</span>` : ''}`
        : 'Chưa có nội dung.';
      $('ebImportGo').disabled = !out.length;
      $('ebImportGo').innerHTML = `<i class="fa-solid fa-plus"></i> Thêm ${out.length || ''} câu`;
    };
    ta.addEventListener('input', upd);
    $('ebImportGo').addEventListener('click', () => {
      const { out } = parseQuick(ta.value);
      if (!out.length) return;
      // Bỏ slide trống duy nhất của đề mới để không còn "Câu 1" rỗng.
      if (B.slides.length === 1 && B.slides[0].custom && !slideHasContent(B.slides[0])) B.slides = [];
      const at = B.slides.length;
      out.forEach((c) => B.slides.push({ id: newId(), custom: Object.assign(blankCustom(c.type), c) }));
      B.cur = at;
      global.closeModal?.();
      changed({ rail: false }); renderAll();
      toast(`Đã thêm ${out.length} câu.`, 'fa-circle-check');
    });
    setTimeout(() => ta.focus(), 50);
    return body;
  }
  function slideHasContent(s) {
    if (!s.custom) return true;
    const c = s.custom;
    return !!(String(c.q || '').trim() || c.img || (c.options || []).some((o) => String(o).trim()) || (c.items || []).some((o) => String(o).trim()) || (c.pairs || []).some(([l, r]) => String(l).trim() || String(r).trim()));
  }

  // ============================================================
  // IN ĐỀ · TRỘN MÃ ĐỀ · TẢI WORD
  // Mỗi mã đề trộn thứ tự câu và/hoặc thứ tự đáp án (chỉ câu trắc nghiệm;
  // Đúng/Sai giữ nguyên thứ tự). Trang cuối là bảng đáp án theo từng mã đề.
  // "Tải Word" = cùng nội dung HTML lưu thành .doc — Word mở và sửa được.
  // ============================================================
  const PRINT_PREF_KEY = 'ic3_print_prefs';
  function openPrint() {
    if (!B.slides.length) return;
    const pref = Object.assign({ school: '', first: 101 }, lsGet(PRINT_PREF_KEY, {}));
    const body = modal('<i class="fa-solid fa-print"></i> In đề · trộn mã đề · tải Word', `
      <div class="eb-print-choices" role="radiogroup" aria-label="Loại bản in">
        <button type="button" class="eb-print-choice is-active" data-print="student" role="radio" aria-checked="true"><i class="fa-solid fa-file-lines"></i><b>Đề cho học sinh</b><span>Không có đáp án</span></button>
        <button type="button" class="eb-print-choice" data-print="key" role="radio" aria-checked="false"><i class="fa-solid fa-file-circle-check"></i><b>Đề kèm đáp án</b><span>Đánh dấu đáp án + giải thích</span></button>
      </div>
      <label class="eb-field"><span>Tên trường / đơn vị (in ở góc trên)</span>
        <input class="eb-input" id="ebPrSchool" maxlength="80" placeholder="VD: TRƯỜNG THCS HUỲNH TẤN PHÁT" value="${esc(pref.school)}"></label>
      <div class="eb-field-row">
        <label class="eb-field"><span>Số mã đề</span><input class="eb-input" id="ebPrCodes" type="number" min="1" max="8" value="1"></label>
        <label class="eb-field"><span>Mã đề đầu tiên</span><input class="eb-input" id="ebPrFirst" type="number" min="1" max="9999" value="${esc(pref.first)}"></label>
      </div>
      <div class="eb-print-opts">
        <label class="eb-check"><input type="checkbox" id="ebPrShufQ"> Trộn thứ tự câu</label>
        <label class="eb-check"><input type="checkbox" id="ebPrShufO"> Trộn đáp án A, B, C, D</label>
        <label class="eb-check"><input type="checkbox" id="ebPrKeys" checked> Thêm trang bảng đáp án ở cuối</label>
      </div>
      <p class="eb-matrix-hint" id="ebPrHint"></p>`,
    `<button class="btn-cancel" onclick="closeModal()">Đóng</button>
     <button class="btn-cancel" id="ebPrWord"><i class="fa-solid fa-file-word"></i> Tải Word</button>
     <button class="btn-save" id="ebPrGo"><i class="fa-solid fa-print"></i> In</button>`);
    let mode = 'student';
    const opts = () => ({
      withAnswer: mode === 'key',
      school: $('ebPrSchool').value.trim(),
      codes: Math.min(8, Math.max(1, parseInt($('ebPrCodes').value, 10) || 1)),
      first: Math.min(9999, Math.max(1, parseInt($('ebPrFirst').value, 10) || 101)),
      shufQ: $('ebPrShufQ').checked, shufO: $('ebPrShufO').checked, keys: $('ebPrKeys').checked,
    });
    const bad = B.slides.filter((s) => slideErrors(s).length).length;
    const hint = () => {
      const o = opts();
      $('ebPrHint').innerHTML = (bad ? `<b class="eb-warn">Còn ${bad} câu chưa hoàn chỉnh — sẽ in đúng như đang soạn.</b> ` : '') + esc((o.codes > 1
        ? `Sẽ tạo ${o.codes} mã đề: ${Array.from({ length: o.codes }, (_, k) => o.first + k).join(', ')}, mỗi mã sang trang mới.`
        : 'Một mã đề.') + ' Câu chọn vùng ảnh / kéo thả nên làm trên máy; bản in chỉ để tham khảo cho các dạng này. Ảnh dán từ máy có thể không hiện trong Word.');
    };
    body.querySelectorAll('[data-print]').forEach((b) => b.addEventListener('click', () => {
      mode = b.dataset.print;
      body.querySelectorAll('[data-print]').forEach((x) => { x.classList.toggle('is-active', x === b); x.setAttribute('aria-checked', String(x === b)); });
    }));
    // Nhiều mã đề mà không trộn thì các mã giống hệt nhau → bật sẵn trộn khi tăng số mã (trừ khi thầy cô đã tự bỏ chọn).
    $('ebPrCodes').addEventListener('input', () => {
      ['ebPrShufQ', 'ebPrShufO'].forEach((id) => { if (opts().codes > 1 && !$(id).dataset.touched) $(id).checked = true; });
      hint();
    });
    ['ebPrShufQ', 'ebPrShufO'].forEach((id) => $(id).addEventListener('change', () => { $(id).dataset.touched = '1'; }));
    $('ebPrFirst').addEventListener('input', hint);
    hint();
    const remember = (o) => lsSet(PRINT_PREF_KEY, { school: o.school, first: o.first });
    $('ebPrGo').addEventListener('click', () => { const o = opts(); remember(o); printExam(o); global.closeModal?.(); });
    $('ebPrWord').addEventListener('click', () => { const o = opts(); remember(o); downloadWord(o); });
  }
  /** Câu tự soạn → dạng câu ngân hàng (chưa escape) để dùng chung renderQuestionDetail. */
  function customAsBankQ(c0) {
    const c = cleanCustom(c0);
    const q = { question: c.q, explanation: c.expl, imageUrl: c.img };
    if (c.type === 'single' || c.type === 'multi') return Object.assign(q, { type: c.type, options: c.options, correct: c.correct.map((i) => c.options[i]) });
    if (c.type === 'tf') return Object.assign(q, { type: 'single', options: ['Đúng', 'Sai'], correct: [c.correct[0] === 1 ? 'Sai' : 'Đúng'], isTf: true });
    if (c.type === 'ordering') return Object.assign(q, { type: 'ordering', items: c.items });
    return Object.assign(q, { type: 'matching', pairs: c.pairs.map(([l, r]) => ({ left: l, right: r })) });
  }
  /** Đáp án gọn của 1 câu cho bảng đáp án ("B", "AC", "ĐSĐ", "1b 2a", "c→a→b"). */
  function keyOf(q) {
    const correct = new Set(q.correct || []);
    if (q.isTf) return correct.has('Sai') ? 'S' : 'Đ';
    switch (q.type) {
      case 'single':
      case 'multi': return (q.options || []).map((o, i) => (correct.has(o) ? letter(i) : '')).join('') || '—';
      case 'truefalse': return (q.statements || []).map((st) => (st.answer === 'true' ? 'Đ' : 'S')).join('');
      case 'matching': {
        const pairs = q.pairs || [];
        const rights = [...new Set(pairs.map((p) => p.right))].sort((a, b) => String(a).localeCompare(String(b), 'vi'));
        return pairs.map((p, i) => `${i + 1}${letter(rights.indexOf(p.right)).toLowerCase()}`).join(' ');
      }
      case 'ordering': {
        const items = q.items || [];
        const disp = items.slice().sort((a, b) => String(a).localeCompare(String(b), 'vi'));
        return items.map((x) => letter(disp.indexOf(x)).toLowerCase()).join('→');
      }
      default: return '—';
    }
  }
  /** Các mã đề: mỗi mã là danh sách câu (dạng câu ngân hàng) đã trộn theo tuỳ chọn. */
  function buildPrintCodes({ codes, first, shufQ, shufO }) {
    const base = B.slides.map((s) => ({ q: s.custom ? customAsBankQ(s.custom) : s.q, keepOpts: s.custom?.type === 'tf' }));
    return Array.from({ length: codes }, (_, k) => {
      const order = shufQ ? shuffled(base.map((_, i) => i)) : base.map((_, i) => i);
      const qs = order.map((i) => {
        const { q, keepOpts } = base[i];
        return shufO && !keepOpts && (q.type === 'single' || q.type === 'multi') ? Object.assign({}, q, { options: shuffled(q.options || []) }) : q;
      });
      return { code: first + k, qs };
    });
  }
  function keyTablesHtml(sets) {
    const COLS = 10;
    return sets.map(({ code, qs }) => {
      const chunks = [];
      for (let i = 0; i < qs.length; i += COLS) chunks.push(qs.slice(i, i + COLS).map((q, j) => [i + j + 1, keyOf(q)]));
      return (sets.length > 1 ? `<h3>Mã đề ${code}</h3>` : '') + chunks.map((ch) => `<table class="key"><tr><th>Câu</th>${ch.map(([n]) => `<th>${n}</th>`).join('')}</tr><tr><th>Đáp án</th>${ch.map(([, k]) => `<td>${esc(k)}</td>`).join('')}</tr></table>`).join('');
    }).join('');
  }
  const PRINT_CSS = `
      body{font-family:"Times New Roman",serif;font-size:13pt;color:#000;margin:18mm 16mm;line-height:1.45}
      .head{width:100%;border-collapse:collapse;margin-bottom:6px}.head td{vertical-align:top;text-align:center;font-size:12pt;padding:0}
      .head .school{width:40%;font-weight:bold;text-transform:uppercase}.head .ttl{font-weight:bold;font-size:14pt}
      .sub{font-size:11.5pt;font-weight:normal}
      .info{width:100%;border-collapse:collapse;border-bottom:1px solid #000;margin:6px 0 12px}.info td{padding:2px 0 6px;font-size:12pt}
      .code{border:1px solid #000;padding:1px 8px;font-weight:bold;white-space:nowrap}
      .q{break-inside:avoid;page-break-inside:avoid;margin:0 0 12px}.eb-opts{margin:4px 0 0 18px;padding:0;list-style:none}.eb-opts li{margin:2px 0}
      ol[type=a].eb-opts{list-style:lower-alpha}.is-correct{font-weight:bold;text-decoration:underline}
      .eb-tf{border-collapse:collapse;margin-top:4px;width:100%}.eb-tf td,.eb-tf th{border:1px solid #555;padding:3px 6px;font-size:11.5pt}.eb-tf td+td,.eb-tf th+th{width:44px;text-align:center}
      .eb-match{display:flex;gap:30px}.eb-match ol{flex:1;margin:4px 0}.eb-pill{border:1px solid #777;border-radius:4px;padding:0 5px;margin-right:3px;display:inline-block}
      .eb-blank{border-bottom:1px solid #000;padding:0 14px}.eb-answer,.eb-expl{margin-top:4px;font-size:11.5pt}.eb-expl{font-style:italic;color:#333}
      .eb-qimg{display:block;max-width:60%;max-height:220px;margin:6px 0}.eb-muted{color:#555;font-style:italic}.eb-line{margin-top:4px}.fa-regular{display:none}
      .end{text-align:center;margin-top:14px;font-style:italic}
      h2{text-align:center;font-size:15pt;margin:0 0 10px}h3{font-size:13pt;margin:12px 0 4px}
      .key{border-collapse:collapse;margin:0 0 8px}.key th,.key td{border:1px solid #000;padding:3px 7px;text-align:center;font-size:12pt;min-width:34px}
      .pb{page-break-before:always;break-before:page}
      @media print{body{margin:0}}`;
  function examDocHtml(o, { forWord = false } = {}) {
    const title = B.title.trim() || 'Đề kiểm tra';
    const base = new URL('.', location.href).href;
    const sets = buildPrintCodes(o);
    const multi = o.codes > 1;
    const pages = sets.map(({ code, qs }, k) => {
      const qsHtml = qs.map((q, i) => `<section class="q"><div class="qh"><b>Câu ${i + 1}.</b> ${esc(stripHtml(q.question))}</div>${renderQuestionDetail(q, { answer: o.withAnswer })}</section>`).join('');
      return `<div class="${k ? 'pb' : ''}">
        <table class="head"><tr>
          ${o.school ? `<td class="school">${esc(o.school)}</td>` : ''}
          <td><div class="ttl">${esc(title.toUpperCase())}</div><div class="sub">${esc(B.desc)}${B.desc ? '<br>' : ''}${qs.length} câu${B.duration ? ` · Thời gian làm bài: ${B.duration} phút` : ''}${o.withAnswer ? ' · BẢN CÓ ĐÁP ÁN' : ''}</div></td>
        </tr></table>
        <table class="info"><tr><td>Họ và tên: ......................................................</td><td>Lớp: ..............</td><td>Điểm: ..........</td>${multi ? `<td style="text-align:right"><span class="code">Mã đề ${code}</span></td>` : ''}</tr></table>
        ${qsHtml}<div class="end">— Hết —</div></div>`;
    }).join('');
    const keys = o.keys ? `<div class="pb"><h2>BẢNG ĐÁP ÁN — ${esc(title.toUpperCase())}</h2>${keyTablesHtml(sets)}</div>` : '';
    const wordNs = forWord ? ' xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"' : '';
    const auto = forWord ? '' : '<script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script>';
    return `<!doctype html><html lang="vi"${wordNs}><head><meta charset="utf-8"><base href="${esc(base)}"><title>${esc(title)}</title><style>${PRINT_CSS}</style></head><body>${pages}${keys}${auto}</body></html>`;
  }
  function printExam(o) {
    const w = window.open('', '_blank');
    if (!w) { toast('Trình duyệt chặn cửa sổ in — cho phép popup rồi thử lại.', 'fa-triangle-exclamation'); return; }
    w.document.write(examDocHtml(o));
    w.document.close();
  }
  function fileSlug(t) {
    return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
      .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 60) || 'de-kiem-tra';
  }
  function downloadBlob(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  function downloadWord(o) {
    const name = `${fileSlug(B.title)}${o.withAnswer ? '-dap-an' : ''}${o.codes > 1 ? `-${o.codes}-ma-de` : ''}.doc`;
    downloadBlob(new Blob(['\ufeff', examDocHtml(o, { forWord: true })], { type: 'application/msword' }), name);
    toast('Đã tải file Word. Mở bằng Word để chỉnh sửa hoặc in.', 'fa-file-word');
  }

  // ============================================================
  // XEM TRƯỚC KIỂU KAHOOT (chạy trên máy, không ghi kết quả)
  // ============================================================
  const P = { i: 0, picked: new Set(), revealed: false };
  function openPreview(start = 0) {
    if (!B.slides.length) return;
    P.i = start; P.picked = new Set(); P.revealed = false;
    $('ebPreview').hidden = false;
    document.body.style.overflow = 'hidden';
    renderPreview();
    $('ebPreview').focus?.();
  }
  function closePreview() { $('ebPreview').hidden = true; document.body.style.overflow = ''; }
  function previewQ(s) { return s.custom ? customAsBankQ(s.custom) : s.q; }
  function renderPreview() {
    const s = B.slides[P.i];
    const q = previewQ(s);
    const n = B.slides.length;
    const tiles = (q.type === 'single' || q.type === 'multi') && (q.options || []).length <= MAX_OPTIONS;
    const correct = new Set(q.correct || []);
    let body;
    if (tiles) {
      body = `<div class="eb-pv-tiles${q.options.length <= 2 ? ' is-two' : ''}">${q.options.map((o, i) => {
        const cls = P.revealed ? (correct.has(o) ? ' is-right' : P.picked.has(i) ? ' is-wrong' : ' is-dim') : (P.picked.has(i) ? ' is-picked' : '');
        return `<button type="button" class="eb-pv-tile c${i}${cls}" data-pv="pick" data-i="${i}" ${P.revealed ? 'disabled' : ''}>
          <span class="eb-tile-shape"><i class="fa-solid ${TILE_SHAPES[i]}"></i></span><span>${esc(stripHtml(o))}</span>
          ${P.revealed && correct.has(o) ? '<i class="fa-solid fa-check eb-pv-mark"></i>' : P.revealed && P.picked.has(i) ? '<i class="fa-solid fa-xmark eb-pv-mark"></i>' : ''}</button>`;
      }).join('')}</div>
      ${q.type === 'multi' && !P.revealed ? `<button type="button" class="eb-btn eb-btn-primary eb-pv-check" data-pv="reveal" ${P.picked.size ? '' : 'disabled'}>Kiểm tra (${P.picked.size} đã chọn)</button>` : ''}`;
    } else {
      body = `<div class="eb-pv-static">${renderQuestionDetail(Object.assign({}, q, { explanation: '' }), { answer: P.revealed })}</div>
        ${P.revealed ? '' : '<button type="button" class="eb-btn eb-btn-primary eb-pv-check" data-pv="reveal">Hiện đáp án</button>'}`;
    }
    let verdict = '';
    if (P.revealed && tiles) {
      const right = q.options.every((o, i) => correct.has(o) === P.picked.has(i));
      verdict = P.picked.size ? `<div class="eb-pv-verdict ${right ? 'is-right' : 'is-wrong'}"><i class="fa-solid ${right ? 'fa-circle-check' : 'fa-circle-xmark'}"></i> ${right ? 'Chính xác!' : 'Chưa đúng'}</div>` : '';
    }
    const expl = P.revealed && q.explanation ? `<div class="eb-pv-expl"><i class="fa-regular fa-lightbulb"></i> ${esc(stripHtml(q.explanation))}</div>` : '';
    const img = q.imageUrl || (q.image_file ? `img/${q.image_file}` : '');
    $('ebPreview').innerHTML = `
      <div class="eb-pv-top">
        <span class="eb-pv-count">${P.i + 1} / ${n}</span>
        <span class="eb-pv-title">${esc(B.title || 'Xem trước')}</span>
        <button type="button" class="eb-pv-close" data-pv="close" aria-label="Đóng xem trước"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="eb-pv-progress"><i style="width:${((P.i + 1) / n) * 100}%"></i></div>
      <div class="eb-pv-main">
        <div class="eb-pv-q">${esc(stripHtml(q.question)) || '<i>(Chưa có câu hỏi)</i>'}</div>
        ${img && q.type !== 'hotspot' ? `<img class="eb-pv-img" src="${esc(img)}" alt="">` : ''}
        ${body}${verdict}${expl}
      </div>
      <div class="eb-pv-nav">
        <button type="button" class="eb-btn eb-btn-ghost" data-pv="prev" ${P.i === 0 ? 'disabled' : ''}><i class="fa-solid fa-arrow-left"></i> Câu trước</button>
        <button type="button" class="eb-btn eb-btn-soft" data-pv="edit"><i class="fa-solid fa-pen"></i> Sửa câu này</button>
        <button type="button" class="eb-btn eb-btn-primary" data-pv="next">${P.i === n - 1 ? 'Kết thúc' : 'Câu sau'} <i class="fa-solid fa-arrow-right"></i></button>
      </div>`;
  }
  function previewGo(i) { P.i = i; P.picked = new Set(); P.revealed = false; renderPreview(); }
  function onPreviewAction(act, i) {
    const s = B.slides[P.i];
    const q = previewQ(s);
    if (act === 'close') closePreview();
    else if (act === 'prev' && P.i > 0) previewGo(P.i - 1);
    else if (act === 'next') { if (P.i < B.slides.length - 1) previewGo(P.i + 1); else closePreview(); }
    else if (act === 'edit') { closePreview(); select(P.i); }
    else if (act === 'reveal') { P.revealed = true; renderPreview(); }
    else if (act === 'pick' && !P.revealed) {
      if (q.type === 'multi') { if (P.picked.has(i)) P.picked.delete(i); else P.picked.add(i); }
      else { P.picked = new Set([i]); P.revealed = true; }
      renderPreview();
    }
  }

  // ============================================================
  // TRÌNH CHIẾU LỚP HỌC — kiểu Kahoot trên máy chiếu, 0 lượt Firebase.
  // Học sinh trả lời bằng giơ tay / thẻ màu theo HÌNH của ô đáp án / bảng
  // con; giáo viên chấm điểm theo nhóm. Thay cho phòng "Chơi trực tiếp"
  // khi hạn mức Firebase gần hết (mỗi câu trả lời ở phòng trực tiếp = 1
  // lượt ghi — xem docs/FIREBASE-CHECKLIST.md § 6).
  // ============================================================
  const T = { on: false, order: [], i: 0, secs: 20, endAt: 0, timer: null, revealed: false, teams: [], gained: new Set(), done: false };
  const TEAM_COLORS = ['c0', 'c1', 'c2', 'c3', 'c4', 'c5'];
  function openPresentSetup() {
    if (!ensureValid('trình chiếu')) return;
    const body = modal('<i class="fa-solid fa-chalkboard-user"></i> Trình chiếu lớp học', `
      <p class="eb-matrix-hint">Chiếu đề lên màn hình lớn, đếm giờ từng câu; học sinh trả lời bằng <b>giơ tay / thẻ màu theo hình ▲ ◆ ● ■</b> hoặc bảng con, giáo viên cộng điểm cho nhóm trả lời đúng. <b>Học sinh không cần máy, không tốn lượt Firebase.</b></p>
      <div class="eb-field"><span>Thời gian mỗi câu</span><div class="eb-chips" id="ebPtSecs">
        ${[10, 20, 30, 60, 0].map((v) => `<button type="button" class="eb-chip${v === T.secs ? ' is-active' : ''}" data-secs="${v}">${v ? v + ' giây' : 'Không giới hạn'}</button>`).join('')}</div></div>
      <div class="eb-field"><span>Số nhóm thi đua</span><div class="eb-chips" id="ebPtTeams">
        ${[0, 2, 3, 4, 5, 6].map((v) => `<button type="button" class="eb-chip${v === (T.teams.length || 4) ? ' is-active' : ''}" data-teams="${v}">${v ? v + ' nhóm' : 'Không chia nhóm'}</button>`).join('')}</div></div>
      <div class="eb-pt-names" id="ebPtNames"></div>
      <label class="eb-check"><input type="checkbox" id="ebPtShuffle" ${B.shuffle ? 'checked' : ''}> Trộn thứ tự câu</label>`,
    '<button class="btn-cancel" onclick="closeModal()">Huỷ</button><button class="btn-save" id="ebPtGo"><i class="fa-solid fa-play"></i> Bắt đầu trình chiếu</button>');
    let secs = T.secs;
    let teams = T.teams.length || 4;
    const names = () => {
      const old = T.teams.map((t) => t.name);
      $('ebPtNames').innerHTML = teams ? Array.from({ length: teams }, (_, k) => `<label class="eb-pt-name ${TEAM_COLORS[k]}"><i class="fa-solid ${TILE_SHAPES[k]}"></i><input maxlength="20" data-team="${k}" value="${esc(old[k] || 'Nhóm ' + (k + 1))}" aria-label="Tên nhóm ${k + 1}"></label>`).join('') : '';
    };
    names();
    body.querySelector('#ebPtSecs').addEventListener('click', (e) => { const b = e.target.closest('[data-secs]'); if (!b) return; secs = +b.dataset.secs; body.querySelectorAll('[data-secs]').forEach((x) => x.classList.toggle('is-active', x === b)); });
    body.querySelector('#ebPtTeams').addEventListener('click', (e) => { const b = e.target.closest('[data-teams]'); if (!b) return; teams = +b.dataset.teams; body.querySelectorAll('[data-teams]').forEach((x) => x.classList.toggle('is-active', x === b)); names(); });
    $('ebPtGo').addEventListener('click', () => {
      T.secs = secs;
      T.teams = [...body.querySelectorAll('[data-team]')].map((inp, k) => ({ name: inp.value.trim() || `Nhóm ${k + 1}`, score: 0 }));
      const idx = B.slides.map((_, k) => k);
      T.order = $('ebPtShuffle').checked ? shuffled(idx) : idx;
      T.i = 0; T.done = false; T.on = true;
      global.closeModal?.();
      const ov = $('ebPreview');
      ov.hidden = false; ov.classList.add('is-present');
      document.body.style.overflow = 'hidden';
      try { const r = ov.requestFullscreen?.(); if (r && r.catch) r.catch(() => {}); } catch (e) { /* trình duyệt chặn toàn màn hình — vẫn chiếu được */ }
      ov.focus?.();
      presentStart();
    });
  }
  function presentStart() {
    T.revealed = false; T.gained = new Set();
    T.endAt = T.secs ? Date.now() + T.secs * 1000 : 0;
    renderPresent();
    clearInterval(T.timer);
    if (T.secs) T.timer = setInterval(presentTick, 200);
  }
  function presentTick() {
    const left = Math.max(0, T.endAt - Date.now());
    const bar = $('ebPtBar'), num = $('ebPtNum');
    if (bar) bar.style.width = (left / (T.secs * 1000)) * 100 + '%';
    if (num) { num.textContent = Math.ceil(left / 1000); num.classList.toggle('is-low', left <= 5000); }
    if (!left) presentReveal();
  }
  function presentReveal() { clearInterval(T.timer); T.revealed = true; renderPresent(); }
  function presentNext() {
    T.gained.forEach((k) => { T.teams[k].score += 1; });
    T.gained = new Set();
    if (T.i < T.order.length - 1) { T.i++; presentStart(); }
    else { clearInterval(T.timer); T.done = true; renderPresent(); }
  }
  function closePresent() {
    clearInterval(T.timer);
    T.on = false;
    $('ebPreview').classList.remove('is-present');
    if (document.fullscreenElement) { try { document.exitFullscreen(); } catch (e) { /* bỏ qua */ } }
    closePreview();
  }
  function renderPresent() {
    const ov = $('ebPreview');
    const n = T.order.length;
    if (T.done) {
      const ranked = T.teams.map((t, k) => Object.assign({ k }, t)).sort((a, b) => b.score - a.score);
      ov.innerHTML = `<div class="eb-pv-top"><span class="eb-pv-title">${esc(B.title || 'Trình chiếu')}</span>
          <button type="button" class="eb-pv-close" data-pt="close" aria-label="Thoát trình chiếu"><i class="fa-solid fa-xmark"></i></button></div>
        <div class="eb-pv-main eb-pt-final">
          <div class="eb-pt-trophy"><i class="fa-solid fa-trophy"></i></div>
          <h2>${ranked.length ? 'Bảng xếp hạng' : `Hoàn thành ${n} câu!`}</h2>
          ${ranked.length ? `<ol class="eb-pt-rank">${ranked.map((t, r) => `<li class="${TEAM_COLORS[t.k]}${r === 0 && t.score > 0 ? ' is-first' : ''}">
            <span class="eb-pt-place">${r + 1}</span><span class="eb-tile-shape"><i class="fa-solid ${TILE_SHAPES[t.k]}"></i></span>
            <b>${esc(t.name)}</b><em>${t.score} điểm</em></li>`).join('')}</ol>` : ''}
          <div class="eb-pt-final-actions">
            <button type="button" class="eb-btn eb-btn-ghost" data-pt="again"><i class="fa-solid fa-rotate"></i> Chơi lại</button>
            <button type="button" class="eb-btn eb-btn-primary" data-pt="close">Kết thúc</button>
          </div>
        </div>`;
      return;
    }
    const q = previewQ(B.slides[T.order[T.i]]);
    const tiles = (q.type === 'single' || q.type === 'multi') && (q.options || []).length <= MAX_OPTIONS;
    const correct = new Set(q.correct || []);
    const body = tiles
      ? `<div class="eb-pv-tiles">${q.options.map((o, k) => `<div class="eb-pv-tile c${k}${T.revealed ? (correct.has(o) ? ' is-right' : ' is-dim') : ''}">
          <span class="eb-tile-shape"><i class="fa-solid ${TILE_SHAPES[k]}"></i></span><span>${esc(stripHtml(o))}</span>
          ${T.revealed && correct.has(o) ? '<i class="fa-solid fa-check eb-pv-mark"></i>' : ''}</div>`).join('')}</div>`
      : `<div class="eb-pv-static">${renderQuestionDetail(Object.assign({}, q, { explanation: '' }), { answer: T.revealed })}</div>`;
    const img = q.imageUrl || (q.image_file ? `img/${q.image_file}` : '');
    const expl = T.revealed && q.explanation ? `<div class="eb-pv-expl"><i class="fa-regular fa-lightbulb"></i> ${esc(stripHtml(q.explanation))}</div>` : '';
    const teams = T.teams.length ? `<div class="eb-pt-teams">${T.teams.map((t, k) => `<button type="button" class="eb-pt-team ${TEAM_COLORS[k]}${T.gained.has(k) ? ' is-gain' : ''}" data-pt="team" data-k="${k}" ${T.revealed ? '' : 'disabled'} title="${T.revealed ? 'Bấm (hoặc phím ' + (k + 1) + ') để cộng 1 điểm cho nhóm trả lời đúng' : 'Hiện đáp án rồi mới chấm'}">
        <i class="fa-solid ${TILE_SHAPES[k]}"></i><span>${esc(t.name)}</span><b>${t.score + (T.gained.has(k) ? 1 : 0)}</b>${T.revealed ? `<em>${T.gained.has(k) ? '+1 ✓' : '+1'}</em>` : ''}</button>`).join('')}</div>` : '<span></span>';
    ov.innerHTML = `
      <div class="eb-pv-top">
        <span class="eb-pv-count">${T.i + 1} / ${n}</span>
        <span class="eb-pv-title">${esc(B.title || 'Trình chiếu')}${q.type === 'multi' ? ' · <b>Chọn TẤT CẢ đáp án đúng</b>' : ''}</span>
        ${T.secs && !T.revealed ? `<span class="eb-pt-num" id="ebPtNum">${T.secs}</span>` : ''}
        <button type="button" class="eb-pv-close" data-pt="close" aria-label="Thoát trình chiếu"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="eb-pv-progress eb-pt-progress"><i id="ebPtBar" style="width:${T.secs && !T.revealed ? 100 : 0}%"></i></div>
      <div class="eb-pv-main">
        <div class="eb-pv-q">${esc(stripHtml(q.question))}</div>
        ${img && q.type !== 'hotspot' ? `<img class="eb-pv-img" src="${esc(img)}" alt="">` : ''}
        ${body}${expl}
      </div>
      <div class="eb-pv-nav eb-pt-nav">
        ${teams}
        ${T.revealed
          ? `<button type="button" class="eb-btn eb-btn-primary" data-pt="next">${T.i === n - 1 ? 'Xem kết quả' : 'Câu sau'} <i class="fa-solid fa-arrow-right"></i></button>`
          : `<button type="button" class="eb-btn eb-btn-primary" data-pt="reveal"><i class="fa-solid fa-eye"></i> Hiện đáp án <kbd>Space</kbd></button>`}
      </div>`;
  }
  function onPresentAction(act, k) {
    if (act === 'close') closePresent();
    else if (act === 'reveal' && !T.revealed) presentReveal();
    else if (act === 'next' && T.revealed) presentNext();
    else if (act === 'again') { T.teams.forEach((t) => { t.score = 0; }); T.i = 0; T.done = false; presentStart(); }
    else if (act === 'team' && T.revealed && T.teams[k]) { if (T.gained.has(k)) T.gained.delete(k); else T.gained.add(k); renderPresent(); }
  }

  // ============================================================
  // NGĂN KÉO NGÂN HÀNG
  // ============================================================
  function openBank() {
    const lv = examLevel();
    const bk = B.bank;
    if (lv.cat) { bk.cat = lv.cat; bk.level = lv.level; }
    if (!bk.cat || !levelMeta(bk.cat, bk.level)) {
      const c = B.meta.categories[0];
      bk.cat = c?.id || ''; bk.level = c?.levels?.[0]?.id || '';
    }
    $('ebDrawer').hidden = false;
    document.body.style.overflow = 'hidden';
    renderBankSource(); renderBank();
  }
  function closeBank() { $('ebDrawer').hidden = true; document.body.style.overflow = ''; }
  function bankUids() { return new Set(bankSlides().map((s) => s.uid)); }

  function renderBankSource() {
    const bk = B.bank;
    const locked = !!examLevel().cat;
    const cats = B.meta?.categories || [];
    $('ebCat').innerHTML = cats.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
    $('ebCat').value = bk.cat;
    $('ebLevel').innerHTML = (cats.find((c) => c.id === bk.cat)?.levels || []).map((l) => `<option value="${esc(l.id)}">${esc(l.name)}</option>`).join('');
    $('ebLevel').value = bk.level;
    $('ebCat').disabled = locked; $('ebLevel').disabled = locked;
    $('ebDrawerNote').textContent = locked
      ? `Đề đang dùng câu ngân hàng của ${levelMeta(bk.cat, bk.level)?.name || bk.level} — mỗi đề chỉ lấy từ 1 cấp độ (xoá các câu ngân hàng để đổi).`
      : 'Bấm 1 bài/chủ đề để xem câu, + để thêm vào đề. Câu thêm vào nằm sau câu đang chọn.';
    const names = Object.keys(levelMeta(bk.cat, bk.level)?.minitests || {});
    const avail = GROUPS.filter((g) => names.some(g.test));
    if (!avail.some((g) => g.id === bk.group)) bk.group = avail[0]?.id || 'topic';
    $('ebGroups').innerHTML = avail.map((g) => `<button type="button" class="eb-chip${g.id === bk.group ? ' is-active' : ''}" data-group="${g.id}">${g.label}</button>`).join('');
    renderMtList();
  }
  function renderMtList() {
    const bk = B.bank;
    const g = GROUPS.find((x) => x.id === bk.group);
    const term = bk.mtSearch.toLowerCase();
    let names = Object.keys(levelMeta(bk.cat, bk.level)?.minitests || {}).filter((n) => g && g.test(n));
    if (bk.group === 'bai') names.sort((a, b) => (parseInt(a.match(/\d+/)?.[0], 10) || 0) - (parseInt(b.match(/\d+/)?.[0], 10) || 0));
    if (term) names = names.filter((n) => n.toLowerCase().includes(term));
    const picked = {};
    bankSlides().forEach((s) => { if (s.cat === bk.cat && s.level === bk.level) picked[s.mt] = (picked[s.mt] || 0) + 1; });
    $('ebMtList').innerHTML = names.length ? names.map((n) => `<button type="button" class="eb-mt${n === bk.mt ? ' is-active' : ''}" data-mt="${esc(n)}">
      <span class="eb-mt-name">${esc(n)}</span><span class="eb-mt-count">${picked[n] ? `<b>${picked[n]}</b>/` : ''}${mtCount(bk.cat, bk.level, n)}</span></button>`).join('')
      : '<div class="eb-empty-sm">Không có mục nào.</div>';
  }
  async function renderBank() {
    const bk = B.bank;
    const box = $('ebBankList');
    if (!bk.mt) {
      $('ebBankHead').hidden = true;
      box.innerHTML = `<div class="eb-empty"><i class="fa-solid fa-layer-group"></i>
        <p>Chọn 1 bài / tiết / chủ đề bên trái để xem câu hỏi,<br>hoặc bốc nhanh nhiều câu bằng ma trận.</p>
        <button type="button" class="eb-btn eb-btn-primary" data-bank="matrix"><i class="fa-solid fa-table-cells"></i> Ma trận đề</button></div>`;
      return;
    }
    $('ebBankHead').hidden = false;
    $('ebBankTitle').textContent = bk.mt;
    box.innerHTML = '<div class="eb-empty-sm"><i class="fa-solid fa-spinner fa-spin"></i> Đang tải câu hỏi...</div>';
    const at = bk.mt;
    let qs;
    try { qs = await fetchMinitest(bk.cat, bk.level, bk.mt); } catch (e) { box.innerHTML = `<div class="eb-empty-sm">Không tải được: ${esc(e.message)}</div>`; return; }
    if (at !== bk.mt) return;
    const types = [...new Set(qs.map((q) => q.type))];
    $('ebBankType').innerHTML = '<option value="">Mọi dạng</option>' + types.map((t) => `<option value="${esc(t)}">${esc(BANK_TYPE_LABEL[t] || t)} (${qs.filter((q) => q.type === t).length})</option>`).join('');
    if (!types.includes(bk.type)) bk.type = '';
    $('ebBankType').value = bk.type;
    // Lọc theo nguồn chỉ hiện khi bộ có cả câu All Key lẫn câu ngoài All Key (bộ chủ đề)
    const akN = qs.filter((q) => qSource(q.uid).id === 'ak').length;
    const mixed = akN > 0 && akN < qs.length;
    $('ebBankSrc').hidden = !mixed;
    if (!mixed) bk.src = '';
    $('ebBankSrc').innerHTML = `<option value="">Mọi nguồn</option><option value="ak">Chỉ All Key (${akN})</option><option value="non">Ngoài All Key (${qs.length - akN})</option>`;
    $('ebBankSrc').value = bk.src;
    const sel = bankUids();
    const shown = visibleBank(qs);
    const free = shown.filter((q) => !sel.has(q.uid)).length;
    $('ebBankMeta').textContent = `${shown.length} câu${shown.length !== qs.length ? ` / ${qs.length}` : ''} · ${free} chưa chọn`;
    $('ebAddAllBtn').disabled = !free; $('ebRandomBtn').disabled = !free;
    box.innerHTML = shown.length ? shown.map((q, i) => {
      const added = sel.has(q.uid);
      const open = bk.expanded.has(q.uid);
      return `<article class="eb-q${added ? ' is-added' : ''}${open ? ' is-open' : ''}" data-uid="${esc(q.uid)}">
        <div class="eb-q-row"><span class="eb-q-no">${i + 1}</span>
          <div class="eb-q-main" data-bank="toggle" title="Bấm để xem đáp án">
            <div class="eb-q-meta"><span class="eb-type eb-type-${esc(q.type)}">${esc(BANK_TYPE_LABEL[q.type] || q.type)}</span>${bankSrcTag(q.uid)}${q.image_file || q.imageUrl ? '<span class="eb-tag"><i class="fa-regular fa-image"></i> Ảnh</span>' : ''}</div>
            <div class="eb-q-text">${esc(stripHtml(q.question))}</div></div>
          <button type="button" class="eb-add" data-bank="${added ? 'remove' : 'add'}" title="${added ? 'Bỏ khỏi đề' : 'Thêm vào đề'}" aria-label="${added ? 'Bỏ khỏi đề' : 'Thêm vào đề'}"><i class="fa-solid ${added ? 'fa-check' : 'fa-plus'}"></i></button>
        </div>${open ? `<div class="eb-q-detail">${renderQuestionDetail(q, { answer: true })}</div>` : ''}</article>`;
    }).join('') : '<div class="eb-empty-sm">Không có câu nào khớp bộ lọc.</div>';
  }
  function bankSrcTag(uid) {
    const src = qSource(uid);
    return src.id === 'ak' ? `<span class="eb-tag eb-tag-ak" title="All Key: ${esc(paperText(src.papers))}"><i class="fa-solid fa-key"></i> All Key</span>` : '';
  }
  function visibleBank(qs) {
    const bk = B.bank;
    const term = bk.search.toLowerCase();
    return qs.filter((q) => (!bk.type || q.type === bk.type) && (!term || stripHtml(q.question).toLowerCase().includes(term))
      && (!bk.src || (qSource(q.uid).id === 'ak') === (bk.src === 'ak')));
  }
  function insertBankQs(list, mt) {
    const bk = B.bank;
    const sel = bankUids();
    const fresh = list.filter((q) => q.uid && !sel.has(q.uid));
    if (!fresh.length) return 0;
    if (B.slides.length === 1 && B.slides[0].custom && !slideHasContent(B.slides[0])) { B.slides = []; B.cur = -1; }
    const at = B.slides.length ? B.cur + 1 : 0;
    // q._mt: tên bài nguồn khi bốc nhiều bài cùng lúc (ma trận) — gỡ khỏi object câu.
    B.slides.splice(at, 0, ...fresh.map(({ _mt, ...q }) => ({ id: newId(), cat: bk.cat, level: bk.level, mt: _mt || mt, uid: q.uid, q })));
    B.cur = at + fresh.length - 1;
    changed({ rail: false });
    renderTop(); renderRail(); renderStage(); renderInspector();
    renderBankSource(); renderBank();
    return fresh.length;
  }
  function removeBankUid(uid) {
    const i = B.slides.findIndex((s) => !s.custom && s.uid === uid);
    if (i < 0) return;
    B.slides.splice(i, 1);
    B.cur = Math.max(0, Math.min(B.cur, B.slides.length - 1));
    changed({ rail: false });
    renderTop(); renderRail(); renderStage(); renderInspector(); renderBankSource(); renderBank();
  }

  function openMatrix() {
    const bk = B.bank;
    const names = Object.keys(levelMeta(bk.cat, bk.level)?.minitests || {});
    const groups = GROUPS.filter((g) => names.some(g.test));
    let gid = groups.some((g) => g.id === 'topic') ? 'topic' : groups[0]?.id;
    let akOnly = !!B.allkey; // bộ chủ đề trộn câu All Key + câu cũ; Ôn tập/Kiểm tra vốn toàn All Key, Bài N không có
    const akCounts = {}; // số câu All Key mỗi bộ chủ đề — tải file bộ khi mở (tĩnh, dùng lại lúc bốc)
    const body = modal('<i class="fa-solid fa-table-cells"></i> Ma trận đề — bốc câu ngẫu nhiên', '',
      '<button class="btn-cancel" onclick="closeModal()">Huỷ</button><button class="btn-save" id="ebMatrixGo"><i class="fa-solid fa-shuffle"></i> Bốc câu</button>');
    const draw = () => {
      const g = GROUPS.find((x) => x.id === gid);
      const list = names.filter(g.test);
      if (gid === 'bai') list.sort((a, b) => (parseInt(a.match(/\d+/)?.[0], 10) || 0) - (parseInt(b.match(/\d+/)?.[0], 10) || 0));
      body.innerHTML = `<p class="eb-matrix-hint">${esc(levelMeta(bk.cat, bk.level)?.name || '')} — nhập số câu cho từng mục, hệ thống bốc ngẫu nhiên, không trùng câu đã có.</p>
        <div class="eb-chips">${groups.map((x) => `<button type="button" class="eb-chip${x.id === gid ? ' is-active' : ''}" data-mgroup="${x.id}">${x.label}</button>`).join('')}</div>
        ${B.allkey && gid === 'topic' ? `<label class="eb-check eb-matrix-ak"><input type="checkbox" id="ebMatrixAk"${akOnly ? ' checked' : ''}> <span><i class="fa-solid fa-key"></i> Chỉ bốc câu đáp án gốc All Key</span></label>` : ''}
        <div class="eb-matrix-quick">Chia đều <input type="number" id="ebMatrixTotal" min="1" max="200" value="30"> câu <button type="button" class="eb-link" id="ebMatrixSpread">Áp dụng</button></div>
        <div class="eb-matrix-table">${list.map((n) => `<label class="eb-matrix-row"><span>${esc(n)}</span><small>${mtCount(bk.cat, bk.level, n)} câu</small><input type="number" min="0" max="${mtCount(bk.cat, bk.level, n)}" value="0" data-mname="${esc(n)}"></label>`).join('')}</div>
        <div class="eb-matrix-foot"><span>Tổng: <b id="ebMatrixSum">0</b> câu</span></div>`;
      body.querySelectorAll('[data-mgroup]').forEach((b) => b.addEventListener('click', () => { gid = b.dataset.mgroup; draw(); }));
      const sum = () => { $('ebMatrixSum').textContent = [...body.querySelectorAll('[data-mname]')].reduce((s, i) => s + (parseInt(i.value, 10) || 0), 0); };
      // Bật "Chỉ All Key": số câu tối đa mỗi mục = số câu All Key của bộ đó
      const applyCaps = () => {
        body.querySelectorAll('[data-mname]').forEach((i) => {
          const n = i.dataset.mname;
          const total = mtCount(bk.cat, bk.level, n);
          const ak = akOnly && gid === 'topic' && akCounts[n] != null;
          i.max = ak ? akCounts[n] : total;
          if ((+i.value || 0) > +i.max) i.value = i.max;
          i.closest('label').querySelector('small').textContent = ak ? `${akCounts[n]}/${total} All Key` : `${total} câu`;
        });
        sum();
      };
      $('ebMatrixAk')?.addEventListener('change', (e) => { akOnly = e.target.checked; applyCaps(); });
      if (B.allkey && gid === 'topic' && list.some((n) => akCounts[n] == null)) {
        Promise.all(list.map((n) => fetchMinitest(bk.cat, bk.level, n))).then((ls) => {
          ls.forEach((l, k) => { akCounts[list[k]] = l.filter((q) => qSource(q.uid).id === 'ak').length; });
          if (gid === 'topic' && body.isConnected) applyCaps();
        }).catch(() => {});
      } else applyCaps();
      body.querySelectorAll('[data-mname]').forEach((i) => i.addEventListener('input', sum));
      $('ebMatrixSpread').addEventListener('click', () => {
        const inputs = [...body.querySelectorAll('[data-mname]')];
        let total = Math.max(0, parseInt($('ebMatrixTotal').value, 10) || 0);
        inputs.forEach((i) => { i.value = 0; });
        let progressed = true;
        while (total > 0 && progressed) {
          progressed = false;
          for (const i of inputs) {
            if (total <= 0) break;
            if ((+i.value || 0) < +i.max) { i.value = (+i.value || 0) + 1; total--; progressed = true; }
          }
        }
        sum();
      });
    };
    draw();
    $('ebMatrixGo').addEventListener('click', async (e) => {
      const plan = [...body.querySelectorAll('[data-mname]')].map((i) => ({ name: i.dataset.mname, n: parseInt(i.value, 10) || 0 })).filter((p) => p.n > 0);
      if (!plan.length) { toast('Nhập số câu cho ít nhất 1 mục.', 'fa-triangle-exclamation'); return; }
      const btn = e.currentTarget;
      btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang bốc...';
      try {
        const lists = await Promise.all(plan.map((p) => fetchMinitest(bk.cat, bk.level, p.name)));
        const sel = bankUids();
        const picks = [];
        let short = 0;
        plan.forEach((p, k) => {
          const ak = akOnly && gid === 'topic';
          const take = shuffled(lists[k].filter((q) => q.uid && !sel.has(q.uid) && (!ak || qSource(q.uid).id === 'ak'))).slice(0, p.n);
          short += p.n - take.length;
          take.forEach((q) => { sel.add(q.uid); picks.push(Object.assign({}, q, { _mt: p.name })); });
        });
        global.closeModal?.();
        const n = insertBankQs(picks, '');
        toast(short ? `Đã bốc ${n} câu — thiếu ${short} câu vì mục không đủ câu${akOnly && gid === 'topic' ? ' All Key' : ''} chưa dùng.` : `Đã bốc ${n} câu theo ma trận.`, short ? 'fa-triangle-exclamation' : 'fa-circle-check');
      } catch (err) {
        toast('Không tải được câu hỏi: ' + err.message, 'fa-triangle-exclamation');
        btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-shuffle"></i> Bốc câu';
      }
    });
  }

  // ============================================================
  // SỰ KIỆN
  // ============================================================
  let wired = false;
  function wire() {
    if (wired) return;
    wired = true;
    const stage = $('ebStage');

    // ── Gõ nội dung: cập nhật state, KHÔNG vẽ lại khung (giữ con trỏ) ──
    stage.addEventListener('input', (e) => {
      const t = e.target;
      const f = t.dataset.f;
      const s = B.slides[B.cur];
      if (!f || !s?.custom) return;
      const c = s.custom;
      const i = +t.dataset.i;
      if (f === 'q') { c.q = t.value; autoGrow(t); }
      else if (f === 'opt') { c.options[i] = t.value; t.closest('.eb-tile')?.classList.toggle('has-text', !!t.value.trim()); }
      else if (f === 'item') c.items[i] = t.value;
      else if (f === 'pl') c.pairs[i][0] = t.value;
      else if (f === 'pr') c.pairs[i][1] = t.value;
      else if (f === 'expl') c.expl = t.value;
      else return;
      changed();
      renderStageErrors();
    });
    stage.addEventListener('change', (e) => {
      if (e.target.dataset.f !== 'imgurl') return;
      const url = e.target.value.trim();
      const s = B.slides[B.cur];
      if (!url || !s?.custom) return;
      if (!global.EduCustomExam.safeImage(url)) { toast('Link ảnh phải bắt đầu bằng https://', 'fa-triangle-exclamation'); return; }
      s.custom.img = url; changed(); renderStage();
    });
    stage.addEventListener('keydown', (e) => {
      if (e.target.dataset.f === 'imgurl' && e.key === 'Enter') { e.preventDefault(); e.target.dispatchEvent(new Event('change', { bubbles: true })); }
      if (e.target.closest('.eb-media') && !e.target.dataset.f && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); pickImage(); }
    });
    stage.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b || e.target.closest('input[data-f="imgurl"]')) return;
      const act = b.dataset.act;
      const i = +b.dataset.i;
      if (act === 'add-type') return addCustom(b.dataset.type);
      if (act === 'open-bank') return openBank();
      if (act === 'open-import') return openImport();
      const s = B.slides[B.cur];
      if (!s) return;
      if (act === 'swap' || act === 'swap-ak') { swapSlide(B.cur, { allKey: act === 'swap-ak' }); return; }
      if (act === 'convert') {
        const c = bankToCustom(s);
        if (!c) return;
        B.slides[B.cur] = { id: s.id, custom: c };
        changed(); renderStage(); renderInspector();
        toast('Đã chuyển thành câu tự soạn — giờ có thể chỉnh sửa.', 'fa-pen');
        return;
      }
      const c = s.custom;
      if (!c) return;
      let structural = true;
      if (act === 'toggle-correct') {
        const set = new Set(c.correct || []);
        if (c.type === 'single') c.correct = set.has(i) ? [] : [i];
        else { if (set.has(i)) set.delete(i); else set.add(i); c.correct = [...set].sort((a, b) => a - b); }
      } else if (act === 'del-opt') {
        c.options.splice(i, 1);
        c.correct = (c.correct || []).filter((k) => k !== i).map((k) => (k > i ? k - 1 : k));
      } else if (act === 'add-opt' && c.options.length < MAX_OPTIONS) c.options.push('');
      else if (act === 'tf-pick') c.correct = [i];
      else if (act === 'add-item' && c.items.length < MAX_ROWS) c.items.push('');
      else if (act === 'del-item') c.items.splice(i, 1);
      else if (act === 'item-up' && i > 0) [c.items[i - 1], c.items[i]] = [c.items[i], c.items[i - 1]];
      else if (act === 'item-down' && i < c.items.length - 1) [c.items[i + 1], c.items[i]] = [c.items[i], c.items[i + 1]];
      else if (act === 'add-pair' && c.pairs.length < MAX_ROWS) c.pairs.push(['', '']);
      else if (act === 'del-pair') c.pairs.splice(i, 1);
      else if (act === 'img-upload') { pickImage(); structural = false; }
      else if (act === 'img-remove') delete c.img;
      else structural = false;
      if (!structural) return;
      changed();
      renderStage();
      if (act === 'add-opt') stage.querySelector(`[data-f="opt"][data-i="${c.options.length - 1}"]`)?.focus();
      if (act === 'add-item') stage.querySelector(`[data-f="item"][data-i="${c.items.length - 1}"]`)?.focus();
      if (act === 'add-pair') stage.querySelector(`[data-f="pl"][data-i="${c.pairs.length - 1}"]`)?.focus();
    });
    // Ảnh: kéo thả + dán (Ctrl+V) khi đang ở khung soạn.
    stage.addEventListener('dragover', (e) => { if (e.dataTransfer?.types?.includes('Files')) { e.preventDefault(); stage.classList.add('is-drop'); } });
    stage.addEventListener('dragleave', () => stage.classList.remove('is-drop'));
    stage.addEventListener('drop', (e) => {
      stage.classList.remove('is-drop');
      const f = e.dataTransfer?.files?.[0];
      if (f) { e.preventDefault(); setImageFromFile(f); }
    });
    document.addEventListener('paste', (e) => {
      if ($('section-builder')?.classList.contains('active') !== true || !$('ebDrawer').hidden) return;
      const file = [...(e.clipboardData?.items || [])].find((it) => it.type.startsWith('image/'))?.getAsFile();
      if (file && B.slides[B.cur]?.custom) { e.preventDefault(); setImageFromFile(file); }
    });

    // ── Danh sách câu ──
    const rail = $('ebRailList');
    rail.addEventListener('click', (e) => {
      const li = e.target.closest('[data-idx]');
      if (!li) return;
      const i = +li.dataset.idx;
      const a = e.target.closest('[data-rail]')?.dataset.rail;
      if (a === 'dup') dupSlide(i);
      else if (a === 'del') delSlide(i);
      else if (i !== B.cur) select(i);
    });
    rail.addEventListener('keydown', (e) => {
      const li = e.target.closest('[data-idx]');
      if (!li) return;
      const i = +li.dataset.idx;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const j = i + (e.key === 'ArrowDown' ? 1 : -1);
        if (e.altKey) moveSlide(i, j); else select(j);
        rail.querySelector(`[data-idx="${B.cur}"]`)?.focus();
      } else if (e.key === 'Enter') select(i);
      else if (e.key === 'Delete') delSlide(i);
    });
    let dragFrom = null;
    rail.addEventListener('dragstart', (e) => { const li = e.target.closest('[data-idx]'); if (!li) return; dragFrom = +li.dataset.idx; li.classList.add('is-dragging'); e.dataTransfer.effectAllowed = 'move'; });
    rail.addEventListener('dragover', (e) => {
      if (dragFrom === null) return;
      e.preventDefault();
      rail.querySelectorAll('.is-over').forEach((x) => x.classList.remove('is-over'));
      e.target.closest('[data-idx]')?.classList.add('is-over');
    });
    rail.addEventListener('drop', (e) => {
      const li = e.target.closest('[data-idx]');
      if (dragFrom === null || !li) return;
      e.preventDefault();
      const from = dragFrom; dragFrom = null;
      moveSlide(from, +li.dataset.idx);
    });
    rail.addEventListener('dragend', () => { dragFrom = null; renderRail(); });

    // ── Menu thêm câu ──
    $('ebAddMenu').innerHTML = CUSTOM_TYPES.map((t) => `<button type="button" data-type="${t.id}"><i class="fa-solid ${t.icon}"></i><span><b>${t.label}</b><small>${t.hint}</small></span></button>`).join('');
    const toggleMenu = (menu, show) => { menu.hidden = !(show ?? menu.hidden); };
    $('ebAddBtn').addEventListener('click', (e) => { e.stopPropagation(); toggleMenu($('ebAddMenu')); $('ebMoreMenu').hidden = true; });
    $('ebAddMenu').addEventListener('click', (e) => { const b = e.target.closest('[data-type]'); if (!b) return; $('ebAddMenu').hidden = true; addCustom(b.dataset.type); });
    $('ebMoreBtn').addEventListener('click', (e) => { e.stopPropagation(); toggleMenu($('ebMoreMenu')); $('ebAddMenu').hidden = true; });
    $('ebMoreMenu').addEventListener('click', (e) => {
      const a = e.target.closest('[data-more]')?.dataset.more;
      if (!a) return;
      $('ebMoreMenu').hidden = true;
      if (a === 'new') {
        if (B.dirty && B.slides.some(slideHasContent) && !confirm('Bỏ đề đang soạn dở (chưa lưu) để tạo đề mới?')) return;
        resetExam(); renderAll(); openSettings(true);
      } else if (a === 'open-link') openFromLink();
      else if (a === 'print') openPrint();
      else if (a === 'link-set') global.openModal?.('create');
      else if (a === 'keys') openKeys();
    });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.eb-menu-wrap')) { $('ebAddMenu').hidden = true; $('ebMoreMenu').hidden = true; }
    });

    // ── Bảng phải ──
    $('ebInspector').addEventListener('click', (e) => {
      const b = e.target.closest('[data-insp]');
      if (!b) return;
      const a = b.dataset.insp;
      const s = B.slides[B.cur];
      if (a === 'type' && s?.custom) {
        s.custom = convertType(s.custom, b.dataset.type);
        changed(); renderStage(); renderInspector();
      } else if (a === 'dup') dupSlide(B.cur);
      else if (a === 'del') delSlide(B.cur);
      else if (a === 'goto-bad' || a === 'goto') select(+b.dataset.i);
      else if (a === 'swap-all-ak') swapAllToAllKey();
    });
    $('ebInspector').addEventListener('input', (e) => {
      if (e.target.id === 'ebDuration') { B.duration = Math.min(180, Math.max(0, parseInt(e.target.value, 10) || 0)); changed({ rail: false, health: false }); renderHealth(); }
    });
    $('ebInspector').addEventListener('change', (e) => {
      if (e.target.id === 'ebShuffle') { B.shuffle = e.target.checked; changed({ rail: false }); }
    });

    // ── Thanh trên ──
    $('ebBackBtn').addEventListener('click', () => $('navMySets')?.click());
    $('ebIdentity').addEventListener('click', () => openSettings(false));
    $('ebSaveBtn').addEventListener('click', save);
    $('ebCopyLinkBtn').addEventListener('click', copyLink);
    $('ebLiveBtn').addEventListener('click', openLive);
    $('ebArenaBtn').addEventListener('click', copyArenaLink);
    $('ebPreviewBtn').addEventListener('click', () => openPreview(B.cur));
    $('ebPresentBtn').addEventListener('click', openPresentSetup);
    $('ebBankOpenBtn').addEventListener('click', openBank);
    $('ebImportBtn').addEventListener('click', openImport);
    $('ebUndoBtn').addEventListener('click', () => withFocusKept(undo));
    $('ebRedoBtn').addEventListener('click', () => withFocusKept(redo));

    // ── Phím tắt (chỉ khi đang ở Soạn đề, không mở Xem trước/Ngân hàng/hộp thoại) ──
    document.addEventListener('keydown', (e) => {
      if (!$('section-builder')?.classList.contains('active') || !$('ebPreview').hidden || !$('ebDrawer').hidden) return;
      if ($('modal-overlay')?.classList.contains('open')) return;
      if (e.key.startsWith('Arrow') && e.target.closest?.('#ebRailList')) return; // danh sách câu tự xử lý mũi tên
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '');
      let handled = true;
      if (mod && k === 'z' && !e.shiftKey) withFocusKept(undo);
      else if (mod && (k === 'y' || (k === 'z' && e.shiftKey))) withFocusKept(redo);
      else if (mod && k === 's') save();
      else if (mod && k === 'enter') addCustom(B.slides[B.cur]?.custom?.type || 'single');
      else if (mod && k === 'd') dupSlide(B.cur);
      else if (e.altKey && !mod && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        const j = B.cur + (e.key === 'ArrowDown' ? 1 : -1);
        if (e.shiftKey) moveSlide(B.cur, j); else if (j >= 0 && j < B.slides.length) select(j);
      } else if (e.key === '?' && !typing) openKeys();
      else handled = false;
      if (handled) e.preventDefault();
    });

    // ── Xem trước ──
    const pv = $('ebPreview');
    pv.tabIndex = -1;
    pv.addEventListener('click', (e) => {
      const t = e.target.closest('[data-pt]');
      if (t) { onPresentAction(t.dataset.pt, +t.dataset.k); return; }
      const b = e.target.closest('[data-pv]');
      if (b) onPreviewAction(b.dataset.pv, +b.dataset.i);
    });
    document.addEventListener('keydown', (e) => {
      if (pv.hidden) {
        if (!$('ebDrawer').hidden && e.key === 'Escape') closeBank();
        return;
      }
      if (T.on) {
        // Esc đầu tiên thoát toàn màn hình (trình duyệt tự xử lý), Esc lần 2 thoát trình chiếu.
        if (e.key === 'Escape' && !document.fullscreenElement) closePresent();
        else if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight') { e.preventDefault(); if (!T.done) onPresentAction(T.revealed ? 'next' : 'reveal'); }
        else if (/^[1-6]$/.test(e.key)) onPresentAction('team', +e.key - 1);
        return;
      }
      if (e.key === 'Escape') closePreview();
      else if (e.key === 'ArrowRight') onPreviewAction('next');
      else if (e.key === 'ArrowLeft') onPreviewAction('prev');
      else if (/^[1-6]$/.test(e.key)) onPreviewAction('pick', +e.key - 1);
      else if (e.key === 'Enter') onPreviewAction('reveal');
    });

    // ── Ngân hàng ──
    $('ebDrawerDone').addEventListener('click', closeBank);
    $('ebDrawer').addEventListener('click', (e) => { if (e.target.id === 'ebDrawer') closeBank(); });
    $('ebCat').addEventListener('change', (e) => {
      B.bank.cat = e.target.value;
      B.bank.level = (B.meta.categories.find((c) => c.id === e.target.value)?.levels || [])[0]?.id || '';
      B.bank.mt = ''; renderBankSource(); renderBank();
    });
    $('ebLevel').addEventListener('change', (e) => { B.bank.level = e.target.value; B.bank.mt = ''; renderBankSource(); renderBank(); });
    $('ebGroups').addEventListener('click', (e) => { const b = e.target.closest('[data-group]'); if (!b) return; B.bank.group = b.dataset.group; renderBankSource(); });
    $('ebMtSearch').addEventListener('input', (e) => { B.bank.mtSearch = e.target.value; renderMtList(); });
    $('ebMtList').addEventListener('click', (e) => {
      const b = e.target.closest('[data-mt]');
      if (!b) return;
      Object.assign(B.bank, { mt: b.dataset.mt, search: '', type: '' });
      $('ebBankSearch').value = '';
      renderMtList(); renderBank();
    });
    $('ebBankSearch').addEventListener('input', debounce((e) => { B.bank.search = e.target.value; renderBank(); }, 200));
    $('ebBankType').addEventListener('change', (e) => { B.bank.type = e.target.value; renderBank(); });
    $('ebBankSrc').addEventListener('change', (e) => { B.bank.src = e.target.value; renderBank(); });
    $('ebAddAllBtn').addEventListener('click', async () => {
      const qs = visibleBank(await fetchMinitest(B.bank.cat, B.bank.level, B.bank.mt));
      const n = insertBankQs(qs, B.bank.mt);
      if (n) toast(`Đã thêm ${n} câu.`, 'fa-plus');
    });
    $('ebRandomBtn').addEventListener('click', async () => {
      const want = Math.max(1, parseInt($('ebRandomN').value, 10) || 1);
      const sel = bankUids();
      const qs = shuffled(visibleBank(await fetchMinitest(B.bank.cat, B.bank.level, B.bank.mt)).filter((q) => !sel.has(q.uid))).slice(0, want);
      const n = insertBankQs(qs, B.bank.mt);
      if (n) toast(`Đã thêm ngẫu nhiên ${n} câu.`, 'fa-shuffle');
    });
    $('ebMatrixBtn').addEventListener('click', openMatrix);
    $('ebBankList').addEventListener('click', async (e) => {
      const b = e.target.closest('[data-bank]');
      if (!b) return;
      const a = b.dataset.bank;
      if (a === 'matrix') return openMatrix();
      const uid = b.closest('[data-uid]')?.dataset.uid;
      if (!uid) return;
      if (a === 'toggle') { const ex = B.bank.expanded; if (ex.has(uid)) ex.delete(uid); else ex.add(uid); renderBank(); }
      else if (a === 'remove') removeBankUid(uid);
      else if (a === 'add') {
        const q = (await fetchMinitest(B.bank.cat, B.bank.level, B.bank.mt)).find((x) => x.uid === uid);
        if (q) insertBankQs([q], B.bank.mt);
      }
    });
  }

  // ============================================================
  // API (gọi từ js/dashboard.js)
  // ============================================================
  async function show({ editSetId = null, fresh = false } = {}) {
    wire();
    const root = $('ebRoot');
    root.classList.add('is-loading');
    try {
      await ensureReady();
      if (editSetId) {
        const set = lsGet(SETS_KEY, []).find((s) => s.id === editSetId);
        if (!set?.builder) { toast('Không tìm thấy dữ liệu đề này.', 'fa-triangle-exclamation'); return; }
        if (B.dirty && B.editingId !== editSetId && B.slides.some(slideHasContent) && !confirm('Bỏ đề đang soạn dở (chưa lưu) để mở đề này?')) { renderAll(); return; }
        const data = Object.assign({ title: set.title, type: set.type }, set.builder);
        if (!data.theme) data.theme = { color: Math.max(0, COVERS.indexOf(set.coverGradient)), icon: set.icon || '📝' };
        await loadInto(data, { editingId: set.id });
        saveDraft();
      } else if (fresh) {
        if (!(B.dirty && B.slides.some(slideHasContent)) || confirm('Đang có đề soạn dở chưa lưu. Bỏ nó để tạo đề mới?\n(Huỷ = tiếp tục soạn đề đang dở)')) {
          resetExam();
          renderAll();
          openSettings(true);
          return;
        }
      } else if (!B.slides.length) {
        const d = lsGet(DRAFT_KEY, null);
        if (d && (d.slides || []).length) await loadInto(d, { editingId: d.editingId || null, dirty: !!d.dirty });
        else resetExam();
      }
      renderAll();
    } catch (err) {
      $('ebStage').innerHTML = `<div class="eb-canvas eb-canvas-empty"><p>Không tải được dữ liệu: ${esc(err.message)}</p></div>`;
    } finally {
      root.classList.remove('is-loading');
    }
  }

  /**
   * "Đề có sẵn": lưu 1 bộ Ôn tập / Kiểm tra theo tiết PPCT (toàn câu All Key, data/ic3 tĩnh)
   * thành bộ đề trong "Bộ đề của tôi" — có link làm bài, Đấu trường, in đề, sửa tiếp được.
   * 0 lượt Firebase: chỉ đọc meta.json + 1 file minitest, đề nằm gọn trong link.
   */
  async function quickCreate() {
    try { await ensureReady(); } catch (err) { toast('Không tải được ngân hàng câu hỏi: ' + err.message, 'fa-triangle-exclamation'); return; }
    const isReady = (n) => TIET_RE.test(n) || KT_RE.test(n); // gồm cả Ôn tập cuối khóa
    const levels = [];
    (B.meta.categories || []).forEach((c) => (c.levels || []).forEach((l) => {
      if (Object.keys(l.minitests || {}).some(isReady)) levels.push({ cat: c.id, level: l.id, name: l.name || `${c.id} ${l.id}` });
    }));
    if (!levels.length) { toast('Ngân hàng chưa có bộ Ôn tập / Kiểm tra nào.', 'fa-triangle-exclamation'); return; }
    let pick = levels[0];
    let chosen = '';
    const body = modal('<i class="fa-solid fa-wand-magic-sparkles"></i> Tạo nhanh từ đề có sẵn', '',
      '<button class="btn-cancel" onclick="closeModal()">Huỷ</button><button class="btn-save" id="ebQuickGo" disabled><i class="fa-solid fa-floppy-disk"></i> Lưu vào Bộ đề của tôi</button>');
    const draw = () => {
      const names = Object.keys(levelMeta(pick.cat, pick.level)?.minitests || {}).filter(isReady);
      if (!names.includes(chosen)) chosen = '';
      body.innerHTML = `<p class="eb-matrix-hint">Bộ Ôn tập / Kiểm tra theo tiết PPCT — chỉ gồm câu đáp án gốc All Key. Lưu xong vẫn sửa, đặt hạn nộp, in đề hay mở Đấu trường như đề tự soạn.</p>
        <div class="eb-chips">${levels.map((l, i) => `<button type="button" class="eb-chip${l === pick ? ' is-active' : ''}" data-qlevel="${i}">${esc(l.name)}</button>`).join('')}</div>
        <div class="eb-matrix-table">${names.map((n) => `<label class="eb-matrix-row"><span>${esc(n)}</span><small>${mtCount(pick.cat, pick.level, n)} câu</small><input type="radio" name="ebQuickMt" value="${esc(n)}"${n === chosen ? ' checked' : ''}></label>`).join('')}</div>`;
      body.querySelectorAll('[data-qlevel]').forEach((b) => b.addEventListener('click', () => { pick = levels[+b.dataset.qlevel]; draw(); }));
      body.querySelectorAll('input[name="ebQuickMt"]').forEach((r) => r.addEventListener('change', () => { chosen = r.value; $('ebQuickGo').disabled = false; }));
      $('ebQuickGo').disabled = !chosen;
    };
    draw();
    $('ebQuickGo').addEventListener('click', async (e) => {
      if (!chosen) return;
      const btn = e.currentTarget;
      btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang tạo...';
      try {
        const list = (await fetchMinitest(pick.cat, pick.level, chosen)).filter((q) => q.uid);
        if (!list.length) throw new Error('bộ câu trống');
        const title = `${pick.name} — ${chosen}`.slice(0, 120);
        const theme = { color: Math.floor(Math.random() * COVERS.length), icon: KT_RE.test(chosen) ? '🏆' : '📚' };
        const type = pick.cat === 'Spark' ? 'elementary' : 'middle';
        const duration = KT_RE.test(chosen) ? 45 : 0;
        const exam = { title, desc: '', cat: pick.cat, level: pick.level, duration, shuffle: true, theme, deadline: 0, items: list.map((q) => ({ mt: chosen, uid: q.uid })) };
        const set = {
          id: 'exam_' + Date.now(), title,
          subtitle: `Đề có sẵn · ${pick.name}`,
          questions: list.length, type, icon: theme.icon, coverGradient: COVERS[theme.color],
          link: await global.EduCustomExam.buildLink(exam),
          builder: { v: 2, type, title, desc: '', theme, duration, shuffle: true, deadline: 0, cur: 0,
            slides: list.map((q) => ({ cat: pick.cat, level: pick.level, mt: chosen, uid: q.uid })) },
          updatedAt: Date.now(),
        };
        const sets = lsGet(SETS_KEY, []);
        sets.push(set);
        if (!lsSet(SETS_KEY, sets)) throw new Error('bộ nhớ trình duyệt đầy');
        global.closeModal?.();
        global.refreshSetsFromStorage?.();
        toast(`Đã lưu "${title}" (${list.length} câu) vào Bộ đề của tôi`, 'fa-circle-check');
      } catch (err) {
        toast('Không tạo được đề: ' + err.message, 'fa-triangle-exclamation');
        btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Lưu vào Bộ đề của tôi';
      }
    });
  }

  async function copySetLink(setId) {
    const set = lsGet(SETS_KEY, []).find((s) => s.id === setId);
    if (!set) return;
    const url = new URL(set.link, location.href).href;
    try { await navigator.clipboard.writeText(url); toast('Đã sao chép link làm bài.', 'fa-link'); }
    catch (e) { prompt('Sao chép link làm bài:', url); }
  }

  global.EduExamBuilder = { show, copySetLink, quickCreate, _parseQuick: parseQuick };
})(window);
