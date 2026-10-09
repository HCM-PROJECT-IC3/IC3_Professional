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
   trộn câu), Xem trước kiểu Kahoot, Chơi trực tiếp (live-quiz.html),
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
  const TIET_RE = /^Tiết \d+$/;
  const GROUPS = [
    { id: 'bai', label: 'Theo bài', test: (n) => BAI_RE.test(n) },
    { id: 'tiet', label: 'Ôn tập (Tiết)', test: (n) => TIET_RE.test(n) },
    { id: 'topic', label: 'Chủ đề', test: (n) => !BAI_RE.test(n) && !TIET_RE.test(n) },
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
    bank: { cat: '', level: '', group: 'bai', mt: '', mtSearch: '', search: '', type: '', expanded: new Set() },
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
  }

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
    if (missing) toast(`${missing} câu ngân hàng không còn tồn tại — đã bỏ khỏi đề.`, 'fa-triangle-exclamation');
  }

  function resetExam() {
    B.editingId = null; B.title = ''; B.desc = ''; B.theme = { color: Math.floor(Math.random() * COVERS.length), icon: '📝' };
    B.type = ''; B.duration = 0; B.shuffle = true; B.deadline = 0;
    B.slides = [{ id: newId(), custom: blankCustom('single') }];
    B.cur = 0; B.dirty = false;
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
    let label, icon, text, tiles = '';
    if (s.custom) {
      const t = TYPE_BY_ID[s.custom.type];
      label = t.label; icon = t.icon; text = s.custom.q;
      const n = s.custom.type === 'tf' ? 2 : s.custom.type === 'single' || s.custom.type === 'multi' ? (s.custom.options || []).length : 0;
      if (n) tiles = `<span class="eb-mini-tiles">${Array.from({ length: n }, (_, k) => `<i class="c${k}${(s.custom.correct || []).includes(k) ? ' is-ok' : ''}"></i>`).join('')}</span>`;
    } else {
      label = 'Ngân hàng'; icon = 'fa-database'; text = stripHtml(s.q?.question);
    }
    return `<li class="eb-slide${i === B.cur ? ' is-active' : ''}${errs.length ? ' has-error' : ''}" data-idx="${i}" draggable="true" tabindex="0" aria-label="Câu ${i + 1}">
      <span class="eb-slide-no">${i + 1}</span>
      <div class="eb-slide-card">
        <div class="eb-slide-type"><i class="fa-solid ${icon}"></i> ${esc(label)}${errs.length ? ' <i class="fa-solid fa-circle-exclamation eb-err-dot" title="' + esc(errs.join('; ')) + '"></i>' : ''}</div>
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
    return `<div class="eb-canvas eb-canvas-bank">
      <div class="eb-canvas-type"><i class="fa-solid fa-database"></i> Ngân hàng · ${esc(levelMeta(s.cat, s.level)?.name || s.level)} · ${esc(s.mt)} · Câu ${B.cur + 1}/${B.slides.length}</div>
      <div class="eb-bank-q">${esc(stripHtml(q.question))} <span class="eb-type eb-type-${esc(q.type)}">${esc(BANK_TYPE_LABEL[q.type] || q.type)}</span></div>
      <div class="eb-q-detail">${renderQuestionDetail(q, { answer: true })}</div>
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
        <p class="eb-insp-p">${esc(BANK_TYPE_LABEL[s.q.type] || s.q.type)} · ${esc(s.mt)}</p></div>`;
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

  function renderHealth() {
    const box = $('ebHealth');
    if (!box) return;
    const n = B.slides.length;
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
      <div class="eb-linkmeter is-${lvl}" title="Đề nằm gọn trong link — không tốn lượt Firebase">
        <div class="eb-linkmeter-top"><span><i class="fa-solid fa-link"></i> Độ dài link</span><b>${B.linkLen ? kb + ' KB' : '…'}</b></div>
        <div class="eb-linkmeter-bar"><i style="width:${pct}%"></i></div>
        <small>${lvl === 'ok' ? 'Gọn — gửi qua Zalo/Messenger thoải mái.' : lvl === 'warn' ? 'Hơi dài (thường do ảnh tải lên) — vẫn mở được; nên dùng link ảnh https:// nếu gửi qua ứng dụng chat.' : 'Quá dài — bớt ảnh tải lên hoặc dùng link ảnh để link không bị cắt khi gửi.'}</small>
      </div>`;
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
    const texts = c.type === 'tf' ? ['Đúng', 'Sai']
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
  async function openLive() {
    if (B.slides.filter(liveOk).length < 5) return;
    const bad = firstInvalid();
    if (bad >= 0 && !confirm(`Có câu chưa hoàn chỉnh (câu ${bad + 1}) — các câu lỗi sẽ bị bỏ qua khi chơi trực tiếp. Tiếp tục?`)) return;
    window.open(await absLink('live-quiz.html'), '_blank', 'noopener');
  }

  async function openFromLink() {
    const raw = prompt('Dán link đề (index.html?de=… hoặc live-quiz.html?de=…) để mở và chỉnh sửa trên máy này:');
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
  function parseQuick(text) {
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
      <p class="eb-matrix-hint">Dán câu hỏi từ Word/Google Docs. Mỗi câu cách nhau <b>1 dòng trống</b>; đánh dấu đáp án đúng bằng <b>*</b> ở đầu dòng (nhiều dấu * = câu nhiều đáp án); 2 đáp án "Đúng/Sai" thành câu Đúng/Sai; dòng "Giải thích:" là phần giải thích.</p>
      <textarea id="ebImportText" class="eb-input eb-import-ta" rows="12" placeholder="${esc(sample)}"></textarea>
      <div class="eb-import-status" id="ebImportStatus">Chưa có nội dung.</div>`,
    `<button class="btn-cancel" onclick="closeModal()">Huỷ</button><button class="btn-save" id="ebImportGo" disabled><i class="fa-solid fa-plus"></i> Thêm câu</button>`);
    const ta = $('ebImportText');
    const upd = () => {
      const { out, skipped } = parseQuick(ta.value);
      $('ebImportStatus').innerHTML = ta.value.trim()
        ? `Đọc được <b>${out.length}</b> câu${skipped ? ` · <span class="eb-warn">${skipped} khối bỏ qua (thiếu câu hỏi, &lt; 2 đáp án hoặc chưa đánh dấu *)</span>` : ''}`
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

  function openPrint() {
    if (!B.slides.length) return;
    const body = modal('<i class="fa-solid fa-print"></i> In đề', `
      <div class="eb-print-choices">
        <button type="button" class="eb-print-choice" data-print="student"><i class="fa-solid fa-file-lines"></i><b>Đề cho học sinh</b><span>Không có đáp án</span></button>
        <button type="button" class="eb-print-choice" data-print="key"><i class="fa-solid fa-file-circle-check"></i><b>Đề kèm đáp án</b><span>Đánh dấu đáp án + giải thích</span></button>
      </div>
      <p class="eb-matrix-hint">Câu chọn vùng ảnh / kéo thả nên làm trên máy — bản in chỉ để tham khảo cho các dạng này.</p>`,
    '<button class="btn-cancel" onclick="closeModal()">Đóng</button>');
    body.querySelectorAll('[data-print]').forEach((b) => b.addEventListener('click', () => { printExam(b.dataset.print === 'key'); global.closeModal?.(); }));
  }
  /** Câu tự soạn → dạng câu ngân hàng (chưa escape) để dùng chung renderQuestionDetail. */
  function customAsBankQ(c0) {
    const c = cleanCustom(c0);
    const q = { question: c.q, explanation: c.expl, imageUrl: c.img };
    if (c.type === 'single' || c.type === 'multi') return Object.assign(q, { type: c.type, options: c.options, correct: c.correct.map((i) => c.options[i]) });
    if (c.type === 'tf') return Object.assign(q, { type: 'single', options: ['Đúng', 'Sai'], correct: [c.correct[0] === 1 ? 'Sai' : 'Đúng'] });
    if (c.type === 'ordering') return Object.assign(q, { type: 'ordering', items: c.items });
    return Object.assign(q, { type: 'matching', pairs: c.pairs.map(([l, r]) => ({ left: l, right: r })) });
  }
  function printExam(withAnswer) {
    const title = B.title.trim() || 'Đề kiểm tra';
    const w = window.open('', '_blank');
    if (!w) { toast('Trình duyệt chặn cửa sổ in — cho phép popup rồi thử lại.', 'fa-triangle-exclamation'); return; }
    const base = new URL('.', location.href).href;
    const qsHtml = B.slides.map((s, i) => {
      const q = s.custom ? customAsBankQ(s.custom) : s.q;
      return `<section class="q"><div class="qh"><b>Câu ${i + 1}.</b> ${esc(stripHtml(q.question))}</div>${renderQuestionDetail(q, { answer: withAnswer })}</section>`;
    }).join('');
    w.document.write(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><base href="${esc(base)}"><title>${esc(title)}</title><style>
      body{font-family:"Times New Roman",serif;font-size:13pt;color:#000;margin:18mm 16mm;line-height:1.45}
      h1{font-size:16pt;text-align:center;margin:0 0 4px}.sub{text-align:center;font-size:11pt;margin-bottom:10px}
      .info{display:flex;gap:24px;border-bottom:1px solid #000;padding-bottom:8px;margin-bottom:12px;font-size:12pt}.info span{flex:1}
      .q{break-inside:avoid;margin:0 0 12px}.eb-opts{margin:4px 0 0 18px;padding:0;list-style:none}.eb-opts li{margin:2px 0}
      ol[type=a].eb-opts{list-style:lower-alpha}.is-correct{font-weight:bold;text-decoration:underline}
      .eb-tf{border-collapse:collapse;margin-top:4px;width:100%}.eb-tf td,.eb-tf th{border:1px solid #555;padding:3px 6px;font-size:11.5pt}.eb-tf td+td,.eb-tf th+th{width:44px;text-align:center}
      .eb-match{display:flex;gap:30px}.eb-match ol{flex:1;margin:4px 0}.eb-pill{border:1px solid #777;border-radius:4px;padding:0 5px;margin-right:3px;display:inline-block}
      .eb-blank{border-bottom:1px solid #000;padding:0 14px}.eb-answer,.eb-expl{margin-top:4px;font-size:11.5pt}.eb-expl{font-style:italic;color:#333}
      .eb-qimg{display:block;max-width:60%;max-height:220px;margin:6px 0}.eb-muted{color:#555;font-style:italic}.eb-line{margin-top:4px}.fa-regular{display:none}@media print{body{margin:0}}
      </style></head><body><h1>${esc(title)}</h1>
      <div class="sub">${esc(B.desc)}${B.desc ? ' · ' : ''}${B.slides.length} câu${B.duration ? ` · Thời gian: ${B.duration} phút` : ''}${withAnswer ? ' · BẢN CÓ ĐÁP ÁN' : ''}</div>
      <div class="info"><span>Họ và tên: ..............................................</span><span>Lớp: ..............</span><span>Điểm: ..........</span></div>
      ${qsHtml}<script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script></body></html>`);
    w.document.close();
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
    if (bk.group !== 'topic') names.sort((a, b) => (parseInt(a.match(/\d+/)?.[0], 10) || 0) - (parseInt(b.match(/\d+/)?.[0], 10) || 0));
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
            <div class="eb-q-meta"><span class="eb-type eb-type-${esc(q.type)}">${esc(BANK_TYPE_LABEL[q.type] || q.type)}</span>${q.image_file || q.imageUrl ? '<span class="eb-tag"><i class="fa-regular fa-image"></i> Ảnh</span>' : ''}</div>
            <div class="eb-q-text">${esc(stripHtml(q.question))}</div></div>
          <button type="button" class="eb-add" data-bank="${added ? 'remove' : 'add'}" title="${added ? 'Bỏ khỏi đề' : 'Thêm vào đề'}" aria-label="${added ? 'Bỏ khỏi đề' : 'Thêm vào đề'}"><i class="fa-solid ${added ? 'fa-check' : 'fa-plus'}"></i></button>
        </div>${open ? `<div class="eb-q-detail">${renderQuestionDetail(q, { answer: true })}</div>` : ''}</article>`;
    }).join('') : '<div class="eb-empty-sm">Không có câu nào khớp bộ lọc.</div>';
  }
  function visibleBank(qs) {
    const bk = B.bank;
    const term = bk.search.toLowerCase();
    return qs.filter((q) => (!bk.type || q.type === bk.type) && (!term || stripHtml(q.question).toLowerCase().includes(term)));
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
    const body = modal('<i class="fa-solid fa-table-cells"></i> Ma trận đề — bốc câu ngẫu nhiên', '',
      '<button class="btn-cancel" onclick="closeModal()">Huỷ</button><button class="btn-save" id="ebMatrixGo"><i class="fa-solid fa-shuffle"></i> Bốc câu</button>');
    const draw = () => {
      const g = GROUPS.find((x) => x.id === gid);
      const list = names.filter(g.test);
      if (gid !== 'topic') list.sort((a, b) => (parseInt(a.match(/\d+/)?.[0], 10) || 0) - (parseInt(b.match(/\d+/)?.[0], 10) || 0));
      body.innerHTML = `<p class="eb-matrix-hint">${esc(levelMeta(bk.cat, bk.level)?.name || '')} — nhập số câu cho từng mục, hệ thống bốc ngẫu nhiên, không trùng câu đã có.</p>
        <div class="eb-chips">${groups.map((x) => `<button type="button" class="eb-chip${x.id === gid ? ' is-active' : ''}" data-mgroup="${x.id}">${x.label}</button>`).join('')}</div>
        <div class="eb-matrix-quick">Chia đều <input type="number" id="ebMatrixTotal" min="1" max="200" value="30"> câu <button type="button" class="eb-link" id="ebMatrixSpread">Áp dụng</button></div>
        <div class="eb-matrix-table">${list.map((n) => `<label class="eb-matrix-row"><span>${esc(n)}</span><small>${mtCount(bk.cat, bk.level, n)} câu</small><input type="number" min="0" max="${mtCount(bk.cat, bk.level, n)}" value="0" data-mname="${esc(n)}"></label>`).join('')}</div>
        <div class="eb-matrix-foot"><span>Tổng: <b id="ebMatrixSum">0</b> câu</span></div>`;
      body.querySelectorAll('[data-mgroup]').forEach((b) => b.addEventListener('click', () => { gid = b.dataset.mgroup; draw(); }));
      const sum = () => { $('ebMatrixSum').textContent = [...body.querySelectorAll('[data-mname]')].reduce((s, i) => s + (parseInt(i.value, 10) || 0), 0); };
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
          const take = shuffled(lists[k].filter((q) => q.uid && !sel.has(q.uid))).slice(0, p.n);
          short += p.n - take.length;
          take.forEach((q) => { sel.add(q.uid); picks.push(Object.assign({}, q, { _mt: p.name })); });
        });
        global.closeModal?.();
        const n = insertBankQs(picks, '');
        toast(short ? `Đã bốc ${n} câu — thiếu ${short} câu vì mục không đủ câu chưa dùng.` : `Đã bốc ${n} câu theo ma trận.`, short ? 'fa-triangle-exclamation' : 'fa-circle-check');
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
      else if (a === 'goto-bad') select(+b.dataset.i);
    });
    $('ebInspector').addEventListener('input', (e) => {
      if (e.target.id === 'ebDuration') { B.duration = Math.min(180, Math.max(0, parseInt(e.target.value, 10) || 0)); changed({ rail: false, health: false }); }
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
    $('ebPreviewBtn').addEventListener('click', () => openPreview(B.cur));
    $('ebPresentBtn').addEventListener('click', openPresentSetup);
    $('ebBankOpenBtn').addEventListener('click', openBank);
    $('ebImportBtn').addEventListener('click', openImport);

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

  async function copySetLink(setId) {
    const set = lsGet(SETS_KEY, []).find((s) => s.id === setId);
    if (!set) return;
    const url = new URL(set.link, location.href).href;
    try { await navigator.clipboard.writeText(url); toast('Đã sao chép link làm bài.', 'fa-link'); }
    catch (e) { prompt('Sao chép link làm bài:', url); }
  }

  global.EduExamBuilder = { show, copySetLink, _parseQuick: parseQuick };
})(window);
