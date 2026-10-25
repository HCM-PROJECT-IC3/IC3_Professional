/* ============================================================
   js/tai-lieu-nam-hoc.js
   tai-lieu-nam-hoc.html — slide bài giảng năm học 2026-2027 (đã bỏ link
   SharePoint cũ): đọc data/slides-manifest.json (file tĩnh, tạo bằng
   node scripts/build-slides-manifest.js từ thư mục Google Drive chia sẻ công
   khai) → nhúng vào iframe theo 2 chế độ:
     • "Trình chiếu" (mặc định cho .pptx ≤ OFFICE_MAX): Office Online
       (view.officeapps.live.com) đọc link tải công khai của Drive → chiếu
       TỪNG slide, có hiệu ứng chuyển trang/xuất hiện như PowerPoint.
       Đã thử: 38MB chạy, 87MB báo "File not found" → file lớn hơn tự về
       chế độ trang.
     • "Xem dạng trang": trình xem Drive (/preview) — các slide xếp dọc,
       không hiệu ứng, nhưng mở được mọi cỡ file.
   Không gọi Firebase hay Apps Script.
   Link sâu: tai-lieu-nam-hoc.html#IC3_LV1/B05 mở thẳng slide Bài 5 IC3 LV1.
   Phím tắt (khi con trỏ không nằm trong iframe/ô tìm): Shift+← → bài trước/
   sau, F, L, /, M. ← → để dành cho trình chiếu (bút trình chiếu gửi phím này).
   ============================================================ */
(function () {
  'use strict';

  // ---- Nút chuyển sáng/tối (đồng hồ mặt trời neumorphism, xem
  // .theme-toggle trong css/roster-manager.css). ----
  (function initThemeToggle() {
    const saved = localStorage.getItem('ic3_theme');
    if (saved) document.documentElement.setAttribute('data-theme', saved);
    const btn = document.getElementById('themeToggle');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      const next = isDark ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('ic3_theme', next);
    });
  })();

  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await EduAuth.logoutUser();
    window.location.href = 'login.html';
  });

  window.addEventListener('edu:ready', ({ detail }) => {
    const { user, profile } = detail;
    document.getElementById('whoami').textContent = `${profile.name || user.email} · ${EduAuth.ROLE_LABEL[profile.role]}`;
  });

  // ---- Slide bài giảng ----
  const LAST_KEY = 'ic3_slides_last';
  const $ = (id) => document.getElementById(id);
  const viewUrl = (f) => (f.kind === 'gslides'
    ? `https://docs.google.com/presentation/d/${f.id}/edit?usp=sharing`
    : `https://drive.google.com/file/d/${f.id}/view`);
  const OFFICE_MAX = 50e6;
  const MODE_KEY = 'ic3_slides_mode';
  // f.web = bản chiếu nhẹ "(web).pptx" (scripts/make-web-slides.py) — chỉ dùng để trình chiếu;
  // "Mở trên Drive" và chế độ trang vẫn là file gốc
  const showFile = (f) => f.web || f;
  const officeUrl = (f) => `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(
    `https://drive.usercontent.google.com/download?id=${showFile(f).id}&export=download&confirm=t`)}`;
  /** Office Online chỉ chiếu .ppt/.pptx, và không mở được file quá lớn */
  const canShow = (f) => (f.kind === 'pptx' || f.kind === 'ppt') && !(showFile(f).size > OFFICE_MAX);
  let mode = 'show'; // 'show' = trình chiếu, 'pages' = xem dạng trang (lựa chọn của người dùng)
  try { if (localStorage.getItem(MODE_KEY) === 'pages') mode = 'pages'; } catch (e) { /* bỏ qua */ }
  /** Chế độ thật cho 1 file: Google Slides luôn là trình chiếu; file Office không chiếu được → trang */
  const modeFor = (f) => (f.kind === 'gslides' ? 'show' : mode === 'show' && canShow(f) ? 'show' : 'pages');
  const embedUrl = (f) => {
    if (f.kind === 'gslides') return `https://docs.google.com/presentation/d/${f.id}/embed?start=false&loop=false`;
    return modeFor(f) === 'show' ? officeUrl(f) : `https://drive.google.com/file/d/${f.id}/preview`;
  };
  const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();

  let manifest = null;
  let course = null;   // khoá đang chọn
  let flat = [];       // [{ lessonKey, lessonTitle, file }] của khoá đang chọn
  let current = -1;

  function remember(courseKey, lessonKey, fileId) {
    try { localStorage.setItem(LAST_KEY, JSON.stringify({ courseKey, lessonKey, fileId })); } catch (e) { /* ẩn danh/khoá kho: bỏ qua */ }
  }
  function recall() {
    try { return JSON.parse(localStorage.getItem(LAST_KEY) || 'null'); } catch (e) { return null; }
  }

  function renderCourses() {
    const box = $('slidesCourses');
    box.innerHTML = '';
    for (const [key, c] of Object.entries(manifest.courses)) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'slides-course';
      b.textContent = c.label;
      const n = document.createElement('span');
      n.className = 'count';
      n.textContent = c.lessons.length;
      b.appendChild(n);
      b.title = `${c.label}: ${c.lessons.length} bài, ${c.lessons.reduce((s, l) => s + l.files.length, 0)} slide`;
      b.setAttribute('aria-pressed', String(key === course));
      b.addEventListener('click', () => { selectCourse(key); remember(key); });
      box.appendChild(b);
    }
  }

  function renderList() {
    const q = fold($('slidesSearch').value.trim());
    const box = $('slidesItems');
    box.innerHTML = '';
    let lastLesson = null;
    flat.forEach((it, i) => {
      if (q && !fold(`${it.lessonTitle} ${it.file.name}`).includes(q)) return;
      // Bài chỉ 1 slide (IC3/Spark): 1 dòng mang tên bài, không cần tiêu đề nhóm + tên file "K6 B01"
      if (!it.single && it.lessonKey !== lastLesson) {
        const h = document.createElement('div');
        h.className = 'slides-lesson-title';
        h.textContent = it.lessonTitle;
        box.appendChild(h);
      }
      lastLesson = it.lessonKey;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = it.single ? 'slides-file single' : 'slides-file';
      b.textContent = it.single ? it.lessonTitle : it.file.name;
      b.title = it.file.name;
      if (i === current) b.setAttribute('aria-current', 'true');
      b.addEventListener('click', () => show(i));
      box.appendChild(b);
    });
    if (!box.children.length) box.innerHTML = '<div class="slides-lesson-title">Không có bài phù hợp.</div>';
  }

  function selectCourse(key, lessonKey, fileId) {
    course = key;
    flat = [];
    for (const l of manifest.courses[key].lessons) {
      for (const f of l.files) flat.push({ lessonKey: l.key, lessonTitle: l.title, file: f, single: l.files.length === 1 });
    }
    current = -1;
    renderCourses();
    let idx = -1;
    if (fileId) idx = flat.findIndex((it) => it.file.id === fileId);
    if (idx < 0 && lessonKey) idx = flat.findIndex((it) => it.lessonKey === lessonKey);
    // Không có bài cần mở → mở luôn slide đầu tiên thay vì để khung xem trống
    if (idx < 0 && flat.length) idx = 0;
    if (idx >= 0) show(idx, true);
    else { clearViewer(); renderList(); }
  }

  function clearViewer() {
    $('slidesFrame').querySelector('iframe')?.remove();
    $('slidesEmpty').hidden = false;
    $('slidesNow').textContent = 'Chưa chọn slide';
    $('slidesOpen').hidden = true;
    for (const id of ['slidesPrev', 'slidesNext', 'slidesFull']) $(id).disabled = true;
  }

  function show(i, scroll) {
    const it = flat[i];
    if (!it) return;
    current = i;
    const frame = $('slidesFrame');
    let iframe = frame.querySelector('iframe');
    if (!iframe) {
      iframe = document.createElement('iframe');
      iframe.setAttribute('allow', 'autoplay; fullscreen');
      iframe.setAttribute('allowfullscreen', '');
      frame.appendChild(iframe);
    }
    iframe.title = it.file.name;
    const url = embedUrl(it.file);
    if (iframe.src !== url) {
      iframe.src = url;
      $('slidesLoading').hidden = false;
      const done = () => { $('slidesLoading').hidden = true; };
      iframe.onload = done;
      setTimeout(done, 15000); // trình xem lỗi không báo load: không che khung mãi
    }
    renderMode(it.file);
    updateTip();
    $('slidesEmpty').hidden = true;
    $('slidesNow').textContent = it.single ? it.lessonTitle : `${it.lessonTitle} — ${it.file.name}`;
    $('slidesOpen').href = viewUrl(it.file);
    $('slidesOpen').hidden = false;
    $('slidesPrev').disabled = i === 0;
    $('slidesNext').disabled = i === flat.length - 1;
    $('slidesFull').disabled = false;
    remember(course, it.lessonKey, it.file.id);
    history.replaceState(null, '', `#${course}/${it.lessonKey}`);
    renderList();
    // Cuộn riêng khung danh sách (scrollIntoView kéo cả trang theo)
    const row = scroll && $('slidesItems').querySelector('[aria-current="true"]');
    if (row) {
      const list = $('slidesList');
      list.scrollTop = row.offsetTop - list.clientHeight / 2 + row.offsetHeight / 2; // .slides-list là offsetParent
    }
  }

  /** Nút chuyển chế độ: ghi chế độ SẼ chuyển sang; khoá khi file chỉ xem được 1 kiểu */
  function renderMode(f) {
    const b = $('slidesMode');
    const now = modeFor(f);
    b.hidden = false;
    b.innerHTML = now === 'show'
      ? '<i class="fa-regular fa-file-lines"></i> Xem dạng trang'
      : '<i class="fa-solid fa-person-chalkboard"></i> Trình chiếu';
    b.disabled = f.kind === 'gslides' || !canShow(f);
    b.title = f.kind === 'gslides' ? 'Google Slides luôn chiếu từng slide'
      : !canShow(f) ? `File ${(showFile(f).size / 1e6).toFixed(0)}MB quá lớn để trình chiếu trên web — chỉ xem dạng trang. Tạo bản nhẹ bằng scripts/make-web-slides.py`
      : now === 'show' ? 'Xem các slide xếp dọc bằng trình xem của Drive (phím M)'
      : 'Chiếu từng slide, có hiệu ứng như PowerPoint (phím M)';
  }

  function toggleMode() {
    const it = flat[current];
    if (!it || $('slidesMode').disabled) return;
    mode = modeFor(it.file) === 'show' ? 'pages' : 'show';
    try { localStorage.setItem(MODE_KEY, mode); } catch (e) { /* bỏ qua */ }
    show(current);
  }

  /** Đưa bàn phím vào khung trình chiếu để ← → / bút trình chiếu chuyển slide ngay */
  function focusSlideshow() {
    const iframe = $('slidesFrame').querySelector('iframe');
    const it = flat[current];
    if (!iframe || !it || modeFor(it.file) !== 'show') return;
    const a = document.activeElement;
    if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA')) return; // đang gõ tìm bài
    iframe.focus();
  }

  // Office Online chỉ nhận ← → sau khi được bấm chuột 1 lần → nhắc "Bấm vào slide" tới khi khung
  // trình chiếu giữ bàn phím (cửa sổ mất focus vì iframe nhận nó), hiện lại khi quay ra trang
  function slideshowHasFocus() {
    const iframe = $('slidesFrame').querySelector('iframe');
    return !!iframe && document.activeElement === iframe;
  }
  function updateTip() {
    const it = flat[current];
    $('slidesTip').hidden = !it || modeFor(it.file) !== 'show' || slideshowHasFocus();
  }
  window.addEventListener('blur', () => setTimeout(updateTip, 0));
  window.addEventListener('focus', updateTip);

  function openFromHash() {
    const [courseKey, lessonKey] = decodeURIComponent(location.hash.slice(1)).split('/');
    if (courseKey && manifest.courses[courseKey]) { selectCourse(courseKey, lessonKey); return true; }
    return false;
  }

  // Khung slide cao hết phần màn hình dưới topbar (topbar xuống 2 dòng trên màn hẹp)
  const topbar = document.querySelector('.topbar');
  function fitHeight() {
    if (topbar) document.documentElement.style.setProperty('--topbar-h', `${topbar.offsetHeight}px`);
  }
  fitHeight();
  window.addEventListener('resize', fitHeight);
  window.addEventListener('edu:ready', () => requestAnimationFrame(fitHeight)); // tên người dùng làm topbar dài thêm

  // Ẩn danh sách để khung slide rộng hết trang (chiếu lên lớp) — nhớ theo máy
  const LIST_KEY = 'ic3_slides_list_hidden';
  function setListHidden(hidden) {
    $('slidesLayout').classList.toggle('list-hidden', hidden);
    $('slidesToggleList').setAttribute('aria-pressed', String(hidden));
    try { localStorage.setItem(LIST_KEY, hidden ? '1' : ''); } catch (e) { /* bỏ qua */ }
  }
  try { if (localStorage.getItem(LIST_KEY)) setListHidden(true); } catch (e) { /* bỏ qua */ }

  function toggleFullscreen() {
    const el = $('slidesFrame');
    if (document.fullscreenElement) document.exitFullscreen();
    else if (current >= 0 && el.requestFullscreen) el.requestFullscreen().then(focusSlideshow, () => {});
  }

  $('slidesSearch').addEventListener('input', renderList);
  $('slidesPrev').addEventListener('click', () => show(current - 1, true));
  $('slidesNext').addEventListener('click', () => show(current + 1, true));
  $('slidesFull').addEventListener('click', toggleFullscreen);
  $('slidesMode').addEventListener('click', toggleMode);
  $('slidesToggleList').addEventListener('click', () => setListHidden(!$('slidesLayout').classList.contains('list-hidden')));

  document.addEventListener('keydown', (e) => {
    if (!manifest || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) {
      if (e.key === 'Escape' && t.id === 'slidesSearch') { t.value = ''; renderList(); t.blur(); }
      return;
    }
    if (e.shiftKey && e.key === 'ArrowLeft' && current > 0) show(current - 1, true);
    else if (e.shiftKey && e.key === 'ArrowRight' && current >= 0 && current < flat.length - 1) show(current + 1, true);
    // ← → PageUp/PageDown/Space (bút trình chiếu) khi chưa bấm vào slide: thử chuyển bàn phím vào
    // khung trình chiếu. Office Online chỉ nhận phím sau khi được BẤM CHUỘT 1 lần (iframe.focus()
    // chưa đủ — đã thử) nên trang ghi "Bấm vào slide rồi ← →".
    else if (['ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', ' '].includes(e.key) && !e.shiftKey) {
      if (current < 0 || modeFor(flat[current].file) !== 'show') return;
      focusSlideshow();
    } else if (e.key === 'm' || e.key === 'M') toggleMode();
    else if (e.key === 'f' || e.key === 'F') toggleFullscreen();
    else if (e.key === 'l' || e.key === 'L') $('slidesToggleList').click();
    else if (e.key === '/') { setListHidden(false); $('slidesSearch').focus(); }
    else return;
    e.preventDefault();
  });

  // Link sâu dán vào thanh địa chỉ khi trang đang mở (#MOS_Excel/B03)
  window.addEventListener('hashchange', () => { if (manifest) openFromHash(); });

  function notice(text) {
    $('slidesNotice').textContent = text;
    $('slidesNotice').hidden = false;
  }

  fetch('data/slides-manifest.json')
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
    .then((m) => {
      if (!m || !m.courses || !Object.keys(m.courses).length) {
        notice('Chưa có danh sách slide. Chạy node scripts/build-slides-manifest.js để tạo data/slides-manifest.json.');
        return;
      }
      manifest = m;
      $('slidesSection').hidden = false;
      if (openFromHash()) return;
      const last = recall();
      if (last && m.courses[last.courseKey]) selectCourse(last.courseKey, last.lessonKey, last.fileId);
      else selectCourse(Object.keys(m.courses)[0]);
    })
    .catch(() => notice('Không tải được danh sách slide. Kiểm tra kết nối mạng rồi tải lại trang.'));
})();
