/* ============================================================
   js/portfolio.js — Trang Social Media (portfolio.html)

   Trang có 2 phần chính (Certifications / Life at Social Media), mỗi
   phần kèm "Teacher Feed", cộng thêm hạ tầng mạng xã hội dùng CHUNG cho
   cả trang: hồ sơ cá nhân (PfProfile) và cache ảnh đại diện
   (avatarCache) — qua Firestore thật:
     - gvlab_posts     : bài đăng (đọc công khai, ghi cần đăng nhập)
     - gvlab_profiles  : ảnh đại diện/trạng thái/tiểu sử (đọc công khai)
   Xem firestore.rules cùng tên collection để biết đúng quyền hạn.
   (Chat nhóm nội bộ "gvlab_chat" đã được thay bằng A11yAssistant — trợ
   lý trợ năng chạy hoàn toàn phía trình duyệt, không còn dùng Firestore
   — xem § A11yAssistant bên dưới.)

   Không dùng Cloud Storage cho ảnh (repo chưa có storage.rules quản
   lý) — mọi ảnh bài đăng/avatar đều nén + mã hoá base64 ngay trên trình
   duyệt trước khi ghi thẳng vào field Firestore (xem compressImage()),
   giới hạn cỡ khác nhau theo mục đích dùng.
   ============================================================ */
(function () {
  'use strict';

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ── Chứng chỉ thật — chuyển từ PDF gốc trong thư mục bàn giao
  // "Certiport" sang ảnh (PyMuPDF), đứng tên Nguyễn Hoài Bảo. Đủ
  // 20/20 file có trong dữ liệu bàn giao (19 PDF + 1 ảnh chụp "Giấy
  // chứng nhận Train-the-Trainer"), không chọn lọc bớt. ──
  const CERTS = [
    { file: 'cert-genai-tot.jpg', title: 'Train-the-Trainer — Generative AI' },
    { file: 'certs/genai-foundations.jpg', title: 'Generative AI Foundations (Pearson)' },
    { file: 'certs/ic3-gs6-level1.jpg', title: 'IC3 GS6 — Level 1' },
    { file: 'certs/ic3-gs6-level2.jpg', title: 'IC3 GS6 — Level 2' },
    { file: 'certs/ic3-gs6-level3.jpg', title: 'IC3 GS6 — Level 3' },
    { file: 'certs/ic3-gs6-spark-level1.jpg', title: 'IC3 GS6 Spark — Level 1' },
    { file: 'certs/ic3-gs6-spark-level2.jpg', title: 'IC3 GS6 Spark — Level 2' },
    { file: 'certs/ic3-gs6-spark-level3.jpg', title: 'IC3 GS6 Spark — Level 3' },
    { file: 'certs/ic3-level-master.jpg', title: 'IC3 Level Master' },
    { file: 'certs/mos-word-associate.jpg', title: 'MOS Word — Associate' },
    { file: 'certs/mos-word-2019-associate.jpg', title: 'MOS Word 2019 — Associate' },
    { file: 'certs/mos-word-2019-expert.jpg', title: 'MOS Word 2019 — Expert' },
    { file: 'certs/mos-excel-associate.jpg', title: 'MOS Excel — Associate' },
    { file: 'certs/mos-excel-2019-associate.jpg', title: 'MOS Excel 2019 — Associate' },
    { file: 'certs/mos-excel-2019-expert.jpg', title: 'MOS Excel 2019 — Expert' },
    { file: 'certs/mos-powerpoint-associate.jpg', title: 'MOS PowerPoint — Associate' },
    { file: 'certs/mos-powerpoint-2019-associate.jpg', title: 'MOS PowerPoint 2019 — Associate' },
    { file: 'certs/mos-associate.jpg', title: 'Microsoft Office Specialist — Associate' },
    { file: 'certs/mos-associate-office2019.jpg', title: 'MOS Associate — Office 2019' },
    { file: 'certs/mos-expert-office2019.jpg', title: 'MOS Expert — Office 2019' },
  ];
  const LEGACY_TEACHER_NAME = 'Nguyễn Hoài Bảo';

  // ── Nav: chỉ lo toggle menu mobile. ──
  const nav = document.getElementById('gvNav');
  const burger = document.getElementById('gvBurger');
  if (burger && nav) {
    burger.addEventListener('click', () => nav.classList.toggle('is-open'));
    nav.querySelectorAll('.gv-nav-links a').forEach((a) =>
      a.addEventListener('click', () => nav.classList.remove('is-open'))
    );
  }

  // ════════════════════════════════════════════════════════════
  // PfDragScroll — kéo-trượt dải "Life at Social Media" bằng chuột/chạm
  // (thay vì lướt thanh cuộn ngang). Có QUÁN TÍNH nhẹ sau khi thả tay.
  // ════════════════════════════════════════════════════════════
  function initDragScroll(el) {
    if (!el) return;
    let isDown = false;
    let startX = 0, startScroll = 0;
    let lastX = 0, lastT = 0, velocity = 0;
    let momentumId = null;

    function stopMomentum() {
      if (momentumId) { cancelAnimationFrame(momentumId); momentumId = null; }
    }
    function onDown(clientX) {
      stopMomentum();
      isDown = true;
      el.classList.add('is-dragging');
      startX = clientX;
      startScroll = el.scrollLeft;
      lastX = clientX;
      lastT = performance.now();
      velocity = 0;
    }
    function onMove(clientX) {
      if (!isDown) return;
      const now = performance.now();
      const dt = now - lastT || 16;
      el.scrollLeft = startScroll - (clientX - startX);
      velocity = (clientX - lastX) / dt;
      lastX = clientX;
      lastT = now;
    }
    function onUp() {
      if (!isDown) return;
      isDown = false;
      el.classList.remove('is-dragging');
      function step() {
        velocity *= 0.94;
        if (Math.abs(velocity) < 0.02) { momentumId = null; return; }
        el.scrollLeft -= velocity * 16;
        momentumId = requestAnimationFrame(step);
      }
      if (Math.abs(velocity) > 0.05) momentumId = requestAnimationFrame(step);
    }

    el.addEventListener('mousedown', (e) => { if (e.button === 0) onDown(e.clientX); });
    window.addEventListener('mousemove', (e) => onMove(e.clientX));
    window.addEventListener('mouseup', onUp);
    el.addEventListener('dragstart', (e) => e.preventDefault());
    el.addEventListener('touchstart', (e) => onDown(e.touches[0].clientX), { passive: true });
    el.addEventListener('touchmove', (e) => { onMove(e.touches[0].clientX); if (isDown) e.preventDefault(); }, { passive: false });
    el.addEventListener('touchend', onUp);
  }
  initDragScroll(document.querySelector('.gv-life-gallery'));

  (function initLifeReveal() {
    const figures = document.querySelectorAll('.gv-life-gallery figure');
    if (!figures.length) return;
    if (!('IntersectionObserver' in window)) {
      figures.forEach((f) => f.classList.add('is-visible'));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add('is-visible'); io.unobserve(e.target); }
      });
    }, { threshold: 0.15, root: null, rootMargin: '0px 120px' });
    figures.forEach((f) => io.observe(f));
  })();

  // ════════════════════════════════════════════════════════════
  // PfCertLightbox — lưới ảnh chứng chỉ + xem đầy đủ khi bấm vào. Dùng
  // event delegation (1 listener trên chính lưới, đọc data-src/data-
  // title trên nút bấm) thay vì gắn listener theo index cố định — lưới
  // này giờ RENDER LẠI nhiều lần khi dữ liệu Firestore của PfCerts về
  // (mỗi giáo viên/chứng chỉ riêng), nên không thể dựa vào 1 mảng tĩnh.
  // ════════════════════════════════════════════════════════════
  const certsGrid = document.getElementById('gvCertsGrid');
  const lightboxOverlay = document.getElementById('gvLightboxOverlay');
  const lightboxImg = document.getElementById('gvLightboxImg');
  const lightboxCaption = document.getElementById('gvLightboxCaption');
  const lightboxClose = document.getElementById('gvLightboxClose');

  // sub (tên giáo viên) đặt vào title="" (tooltip khi rê chuột) thay vì
  // hiện luôn trong thẻ — giữ lưới GỌN, 1 dòng/thẻ; xem đủ tên qua bộ
  // lọc "Xem chứng chỉ của" hoặc rê chuột vào ảnh.
  function certCardHtml(src, title, sub, extraAttrs) {
    const full = sub ? `${title} — ${sub}` : title;
    return `
      <button type="button" data-cert-src="${esc(src)}" data-cert-title="${esc(title)}" aria-label="Xem ${esc(full)}" title="${esc(full)}" ${extraAttrs || ''}>
        <span><img src="${esc(src)}" alt="${esc(title)}" loading="lazy" decoding="async"></span>
        <span class="gv-cert-label">${esc(title)}</span>
      </button>
    `;
  }
  if (certsGrid) {
    certsGrid.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-cert-src]');
      if (btn) openLightbox(btn.dataset.certSrc, btn.dataset.certTitle);
    });
  }
  function openLightbox(src, title) {
    if (!lightboxOverlay) return;
    lightboxImg.src = src;
    lightboxImg.alt = title;
    lightboxCaption.textContent = title;
    lightboxOverlay.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }
  function closeLightbox() {
    lightboxOverlay.classList.remove('is-open');
    document.body.style.overflow = '';
  }
  if (lightboxClose) lightboxClose.addEventListener('click', closeLightbox);
  if (lightboxOverlay) lightboxOverlay.addEventListener('click', (e) => { if (e.target === lightboxOverlay) closeLightbox(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeLightbox(); });

  // Hiện ngay bộ chứng chỉ "sẵn có" (tĩnh, không cần Firestore) — nếu
  // Firebase lỗi/chưa tải xong thì trang vẫn không trống trơn. PfCerts
  // bên dưới (trong khối phụ thuộc Firebase) sẽ RENDER LẠI, gộp thêm
  // chứng chỉ riêng của từng giáo viên khác khi tải xong.
  if (certsGrid) {
    certsGrid.innerHTML = CERTS.map((c) => certCardHtml(`img/portfolio/${c.file}`, c.title, LEGACY_TEACHER_NAME)).join('');
  }

  // ════════════════════════════════════════════════════════════
  // A11yAssistant — trợ lý trợ năng nổi góc phải: đọc to nội dung,
  // phóng/thu chữ, tăng tương phản, trả lời nhanh vài câu hỏi thường gặp
  // (rule-based, khớp từ khoá). Đặt TRƯỚC guard Firebase bên dưới và
  // KHÔNG phụ thuộc db/currentUser — chạy được cho MỌI người xem trang,
  // kể cả khi Firebase lỗi/chưa tải xong, và không tốn bất kỳ lượt đọc/
  // ghi Firestore nào (xem chú thích dài hơn ngay tại HTML của khối này
  // trong portfolio.html — lý do cố tình KHÔNG lưu hội thoại lên server).
  // ════════════════════════════════════════════════════════════
  (function A11yAssistant() {
    const fab = document.getElementById('gvA11yFab');
    const panel = document.getElementById('gvA11yPanel');
    const closeBtn = document.getElementById('gvA11yCloseBtn');
    const messagesEl = document.getElementById('gvA11yMessages');
    const chipsEl = document.getElementById('gvA11yChips');
    const form = document.getElementById('gvA11yForm');
    const input = document.getElementById('gvA11yInput');
    if (!fab || !panel) return;

    const FONT_KEY = 'gv_a11y_font_scale';
    const CONTRAST_KEY = 'gv_a11y_contrast';
    const FONT_STEPS = [87.5, 100, 112.5, 125, 137.5];
    let fontStepIdx = FONT_STEPS.indexOf(100);

    function loadPrefs() {
      try {
        const savedFont = Number(localStorage.getItem(FONT_KEY));
        const idx = FONT_STEPS.indexOf(savedFont);
        if (idx >= 0) { fontStepIdx = idx; document.documentElement.style.fontSize = savedFont + '%'; }
        if (localStorage.getItem(CONTRAST_KEY) === '1') document.body.classList.add('gv-a11y-contrast');
      } catch (e) { /* localStorage có thể bị chặn — bỏ qua, dùng mặc định */ }
    }
    loadPrefs();

    function addMsg(text, isBot) {
      const div = document.createElement('div');
      div.className = 'gv-chat-msg' + (isBot ? '' : ' is-own');
      div.innerHTML = `<div class="gv-chat-msg-col"><div class="gv-chat-msg-body"></div></div>`;
      div.querySelector('.gv-chat-msg-body').textContent = text;
      messagesEl.appendChild(div);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      return div;
    }

    function speak(text) {
      if (!('speechSynthesis' in window)) { addMsg('Trình duyệt này không hỗ trợ đọc to.', true); return; }
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'vi-VN';
      window.speechSynthesis.speak(u);
    }

    function setFontStep(idx) {
      fontStepIdx = Math.max(0, Math.min(FONT_STEPS.length - 1, idx));
      const pct = FONT_STEPS[fontStepIdx];
      document.documentElement.style.fontSize = pct + '%';
      try { localStorage.setItem(FONT_KEY, String(pct)); } catch (e) { /* ignore */ }
      addMsg(`Đã đặt cỡ chữ ${pct}%.`, true);
    }

    function toggleContrast() {
      const on = document.body.classList.toggle('gv-a11y-contrast');
      try { localStorage.setItem(CONTRAST_KEY, on ? '1' : '0'); } catch (e) { /* ignore */ }
      addMsg(on ? 'Đã bật độ tương phản cao.' : 'Đã tắt độ tương phản cao.', true);
    }

    function readPageSummary() {
      const parts = [document.title];
      document.querySelectorAll('main h2, section h2').forEach((h) => parts.push(h.textContent.trim()));
      const text = parts.filter(Boolean).join('. ');
      addMsg('Đang đọc tóm tắt trang…', true);
      speak(text);
    }

    // ── Bộ câu hỏi thường gặp — khớp từ khoá đơn giản, không cần API/AI
    // ngoài nào. Mở rộng bảng này nếu cần thêm chủ đề. ──
    const FAQ = [
      { keys: ['ôn luyện', 'làm bài', 'thi', 'dashboard'], reply: 'Bấm nút "Dashboard" ở góc trên bên phải để vào khu vực ôn luyện/làm bài.' },
      { keys: ['đăng nhập', 'login', 'tài khoản'], reply: 'Chỉ Giáo viên/Admin mới đăng nhập được, qua trang "login.html" — bấm liên kết Đăng nhập ở đầu trang.' },
      { keys: ['đăng bài', 'feed', 'bình luận', 'thích'], reply: 'Đăng nhập bằng tài khoản Giáo viên/Admin, sau đó dùng ô soạn bài trong mục Certifications hoặc Life để đăng ảnh kèm chú thích, thích và bình luận.' },
      { keys: ['hồ sơ', 'ảnh đại diện', 'avatar'], reply: 'Sau khi đăng nhập, bấm nút "Hồ sơ" cạnh tên bạn để đổi ảnh đại diện, trạng thái, tiểu sử.' },
      { keys: ['chứng chỉ', 'certification', 'cert'], reply: 'Xem đầy đủ chứng chỉ ở mục "Certifications" — bấm vào từng ảnh để xem cỡ đầy đủ.' },
      { keys: ['cỡ chữ', 'phóng to', 'to chữ', 'font'], reply: null, action: () => setFontStep(fontStepIdx + 1) },
      { keys: ['thu nhỏ chữ', 'giảm cỡ chữ', 'nhỏ chữ'], reply: null, action: () => setFontStep(fontStepIdx - 1) },
      { keys: ['tương phản', 'contrast'], reply: null, action: toggleContrast },
      { keys: ['đọc', 'nghe', 'text to speech'], reply: null, action: readPageSummary },
    ];

    function handleQuestion(raw) {
      const q = raw.trim();
      if (!q) return;
      addMsg(q, false);
      const norm = q.toLowerCase();
      const hit = FAQ.find((f) => f.keys.some((k) => norm.includes(k)));
      if (hit) {
        if (hit.action) hit.action();
        else addMsg(hit.reply, true);
      } else {
        addMsg('Mình chưa hiểu câu này. Thử hỏi về: ôn luyện, đăng nhập, đăng bài, hồ sơ, chứng chỉ, cỡ chữ, tương phản — hoặc bấm 1 gợi ý bên dưới.', true);
      }
    }

    const QUICK_CHIPS = [
      { label: '🔠 Cỡ chữ to hơn', run: () => setFontStep(fontStepIdx + 1) },
      { label: '🔡 Cỡ chữ nhỏ hơn', run: () => setFontStep(fontStepIdx - 1) },
      { label: '🌓 Tương phản cao', run: toggleContrast },
      { label: '🔊 Đọc tóm tắt trang', run: readPageSummary },
      { label: '⏹ Dừng đọc', run: () => window.speechSynthesis && window.speechSynthesis.cancel() },
      { label: 'Cách vào ôn luyện?', run: () => handleQuestion('ôn luyện') },
      { label: 'Cách đăng bài?', run: () => handleQuestion('đăng bài') },
    ];
    if (chipsEl) {
      chipsEl.innerHTML = QUICK_CHIPS.map((c, i) => `<button type="button" class="gv-a11y-chip" data-chip="${i}">${esc(c.label)}</button>`).join('');
      chipsEl.querySelectorAll('[data-chip]').forEach((btn) => {
        btn.addEventListener('click', () => QUICK_CHIPS[Number(btn.dataset.chip)].run());
      });
    }

    let greeted = false;
    function openPanel() {
      panel.hidden = false;
      if (!greeted) {
        greeted = true;
        addMsg('Chào bạn! Mình là trợ lý trợ năng — có thể đọc to nội dung, chỉnh cỡ chữ/độ tương phản, và trả lời vài câu hỏi thường gặp về trang này. Bấm 1 gợi ý bên dưới hoặc gõ câu hỏi.', true);
      }
      input.focus();
    }
    function closePanel() { panel.hidden = true; }

    fab.addEventListener('click', () => { panel.hidden ? openPanel() : closePanel(); });
    closeBtn.addEventListener('click', closePanel);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const q = input.value;
      input.value = '';
      handleQuestion(q);
    });
  })();

  // ════════════════════════════════════════════════════════════
  // Hạ tầng mạng xã hội dùng CHUNG (Firebase, avatar cache, tiện ích) —
  // PfFeed/PfProfile bên dưới đều dựa vào đây. Dừng sớm nếu thiếu
  // Firebase/EduAuth (trang vẫn hiện được Certifications/Life tĩnh +
  // trợ lý trợ năng, chỉ mất phần tương tác mạng xã hội).
  // ════════════════════════════════════════════════════════════
  if (!window.EduFirebase || !window.EduAuth) {
    console.warn('[Trang Social Media] Thiếu Firebase/EduAuth — feed/hồ sơ/chat sẽ không hoạt động trên trang này.');
    const yearEl0 = document.getElementById('gvYear');
    if (yearEl0) yearEl0.textContent = new Date().getFullYear();
    return;
  }
  const db = window.EduFirebase.db;

  let currentUser = null;
  let currentProfile = null; // users/{uid} — role/approved/name (hồ sơ gốc toàn nền tảng)
  function canEditFeed() {
    return !!currentProfile && (currentProfile.role === 'admin' || (currentProfile.role === 'teacher' && currentProfile.approved !== false));
  }

  function initials(name) {
    const s = String(name || '').trim();
    return s ? s.charAt(0).toUpperCase() : '?';
  }

  function relativeTime(ms) {
    if (!ms) return 'vừa xong';
    const diff = Date.now() - ms;
    const min = Math.floor(diff / 60000);
    if (min < 1) return 'vừa xong';
    if (min < 60) return `${min} phút trước`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr} giờ trước`;
    const day = Math.floor(hr / 24);
    if (day < 30) return `${day} ngày trước`;
    return new Date(ms).toLocaleDateString('vi-VN');
  }

  /** Đọc file ảnh → resize tối đa maxDim px → nén JPEG, giảm dần chất
   * lượng tới khi vừa hạn mức maxChars. Trả về data URL (base64). Dùng
   * chung cho ảnh bài đăng (maxDim lớn) VÀ avatar/đính kèm chat (maxDim
   * nhỏ hơn nhiều — avatar không cần nét cao). */
  function compressImage(file, maxDim, maxChars) {
    return new Promise((resolve, reject) => {
      if (!file.type || file.type.indexOf('image/') !== 0) { reject(new Error('File không phải ảnh.')); return; }
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Không đọc được file.'));
      reader.onload = (ev) => {
        const img = new Image();
        img.onerror = () => reject(new Error('File ảnh hỏng hoặc không hỗ trợ.'));
        img.onload = () => {
          let w = img.naturalWidth, h = img.naturalHeight;
          if (w > maxDim || h > maxDim) {
            if (w > h) { h = Math.round(h * maxDim / w); w = maxDim; }
            else { w = Math.round(w * maxDim / h); h = maxDim; }
          }
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          let quality = 0.75;
          let dataUrl = canvas.toDataURL('image/jpeg', quality);
          while (dataUrl.length > maxChars && quality > 0.3) {
            quality -= 0.1;
            dataUrl = canvas.toDataURL('image/jpeg', quality);
          }
          if (dataUrl.length > maxChars) { reject(new Error('Ảnh vẫn quá lớn sau khi nén — thử ảnh khác đơn giản hơn.')); return; }
          resolve(dataUrl);
        };
        img.src = ev.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  // ── Cache ảnh đại diện: uid -> { avatar, status, bio } (collection
  // gvlab_profiles, đọc công khai) — subscribe LIVE 1 lần, dùng chung
  // cho mọi nơi hiện avatar (thanh hồ sơ, ô soạn bài, bài đăng, bình
  // luận, chat). Mỗi chỗ hiện avatar đánh dấu data-avatar-uid="{uid}" +
  // sẵn initials làm nội dung mặc định — applyAvatars() chỉ CẦN GHI ĐÈ
  // đúng những phần tử đã có ảnh thật trong cache, không phải chờ cache
  // tải xong mới render được initials. ──
  const avatarCache = {};

  // ── Cache trạng thái "đã thích" của NGƯỜI DÙNG HIỆN TẠI theo postId —
  // tránh gọi lại likes/{uid}.get() mỗi lần feed onSnapshot dội lại (bài
  // đăng bất kỳ trong feed được thích/bình luận bởi AI CŨNG làm listener
  // dội lại toàn bộ danh sách, và trước đây refreshAuthState() sẽ đọc lại
  // TỪNG document likes/{uid} của mọi bài đang hiển thị mỗi lần như vậy —
  // đây là nguồn đọc Firestore lớn nhất của trang). uid đổi (đăng nhập
  // tài khoản khác) thì xoá cache vì trạng thái thích gắn với uid cũ. ──
  const likeStatusCache = new Map(); // postId -> boolean
  let likeStatusCacheUid = null;
  function resetLikeStatusCacheIfNeeded(uid) {
    if (likeStatusCacheUid !== uid) {
      likeStatusCache.clear();
      likeStatusCacheUid = uid;
    }
  }
  function applyAvatars(root) {
    (root || document).querySelectorAll('[data-avatar-uid]').forEach((el) => {
      const p = avatarCache[el.dataset.avatarUid];
      if (p && p.avatar) el.innerHTML = `<img src="${p.avatar}" alt="">`;
    });
  }
  db.collection('gvlab_profiles').onSnapshot((snap) => {
    snap.docChanges().forEach((chg) => {
      if (chg.type === 'removed') delete avatarCache[chg.doc.id];
      else avatarCache[chg.doc.id] = chg.doc.data();
    });
    applyAvatars(document);
    if (typeof refreshProfileBarDisplay === 'function') refreshProfileBarDisplay();
  }, (err) => console.warn('[Trang Social Media] Không tải được hồ sơ (gvlab_profiles):', err.message));

  // ════════════════════════════════════════════════════════════
  // PfFeed — feed kiểu blog/mạng xã hội: đăng bài/thích/bình luận/xoá/
  // chia sẻ THẬT qua Firestore (collection "gvlab_posts").
  // ════════════════════════════════════════════════════════════
  const MAX_POST_IMAGE_CHARS = 700000;
  const MAX_POST_IMAGE_DIM = 1000;

  function renderPost(doc) {
    const d = doc.data();
    const ms = d.createdAt && d.createdAt.toMillis ? d.createdAt.toMillis() : null;
    const canDelete = !!currentUser && (currentUser.uid === d.authorUid || (currentProfile && currentProfile.role === 'admin'));
    return `
      <article class="gv-feed-post" data-post-id="${doc.id}">
        <div class="gv-feed-post-media"><img src="${d.image}" alt="" loading="lazy"></div>
        <div class="gv-feed-post-body">
          <div class="gv-feed-post-top">
            <span class="gv-avatar" data-avatar-uid="${esc(d.authorUid)}">${esc(initials(d.authorName))}</span>
            <div class="gv-feed-post-who"><b>${esc(d.authorName || 'Giáo viên')}</b><span>${relativeTime(ms)}</span></div>
            ${canDelete ? `<button type="button" class="gv-feed-delete" data-delete-post data-post-id="${doc.id}" title="Xoá bài đăng"><i class="fa-solid fa-trash"></i></button>` : ''}
          </div>
          ${d.caption ? `<p class="gv-feed-post-caption">${esc(d.caption)}</p>` : ''}
          <div class="gv-feed-post-actions">
            <button type="button" class="gv-feed-like" data-like-btn data-post-id="${doc.id}"><i class="fa-regular fa-heart"></i> <span>${d.likeCount || 0}</span></button>
            <button type="button" class="gv-feed-comment-toggle" data-comment-toggle data-post-id="${doc.id}"><i class="fa-regular fa-comment"></i> <span>Bình luận</span></button>
            <button type="button" class="gv-feed-share" data-share-post data-post-id="${doc.id}" data-caption="${esc(d.caption || '')}"><i class="fa-solid fa-share-nodes"></i> <span>Chia sẻ</span></button>
          </div>
          <div class="gv-feed-comments" data-comments-panel data-post-id="${doc.id}" hidden>
            <div class="gv-feed-comments-list" data-comments-list></div>
            <form class="gv-feed-comment-form" data-comment-form>
              <input type="text" placeholder="Viết bình luận…" maxlength="300" data-comment-input>
              <button type="submit">Gửi</button>
            </form>
          </div>
        </div>
      </article>
    `;
  }

  /** Chia sẻ 1 bài đăng — Web Share API nếu trình duyệt hỗ trợ (đa số
   * điện thoại), fallback copy nội dung + link vào clipboard trên máy
   * tính. Không tạo link riêng cho từng bài (trang không có routing
   * theo id) — chia sẻ thẳng link trang + trích đoạn caption. */
  async function sharePost(caption) {
    const url = location.href.split('#')[0];
    const text = caption ? `"${caption}" — Trang Social Media` : 'Xem bài đăng trên Trang Social Media';
    if (navigator.share) {
      try { await navigator.share({ title: 'Trang Social Media', text, url }); } catch (e) { /* người dùng tự huỷ hộp thoại chia sẻ — bỏ qua */ }
      return;
    }
    try {
      await navigator.clipboard.writeText(`${text}\n${url}`);
      alert('Đã sao chép nội dung + link để chia sẻ.');
    } catch (e) {
      alert('Không chia sẻ tự động được — copy link thủ công: ' + url);
    }
  }

  function initFeed(root) {
    const category = root.dataset.feed;
    const composer = root.querySelector('[data-feed-composer]');
    const loginHint = root.querySelector('[data-feed-login-hint]');
    const fileInput = root.querySelector('[data-feed-file]');
    const fileNameEl = root.querySelector('[data-feed-file-name]');
    const captionEl = root.querySelector('[data-feed-caption]');
    const submitBtn = root.querySelector('[data-feed-submit]');
    const errorEl = root.querySelector('[data-feed-error]');
    const listEl = root.querySelector('[data-feed-list]');
    let pendingImage = null;
    const commentUnsubs = new Map();

    function showError(msg) { errorEl.textContent = msg; errorEl.hidden = false; }
    function updateSubmitState() { submitBtn.disabled = !pendingImage || !canEditFeed(); }

    fileInput.addEventListener('change', async () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      errorEl.hidden = true;
      fileNameEl.textContent = 'Đang nén ảnh…';
      try {
        pendingImage = await compressImage(file, MAX_POST_IMAGE_DIM, MAX_POST_IMAGE_CHARS);
        fileNameEl.textContent = file.name;
      } catch (err) {
        pendingImage = null;
        fileNameEl.textContent = 'Chưa chọn ảnh';
        showError(err.message);
      }
      updateSubmitState();
    });

    submitBtn.addEventListener('click', async () => {
      if (!pendingImage || !currentUser || !canEditFeed()) return;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Đang đăng…';
      try {
        await db.collection('gvlab_posts').add({
          category,
          image: pendingImage,
          caption: (captionEl.value || '').trim().slice(0, 500),
          authorUid: currentUser.uid,
          authorName: currentProfile.name || currentUser.email || 'Giáo viên',
          authorRole: currentProfile.role,
          likeCount: 0,
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
        captionEl.value = '';
        pendingImage = null;
        fileInput.value = '';
        fileNameEl.textContent = 'Chưa chọn ảnh';
        errorEl.hidden = true;
      } catch (err) {
        showError('Đăng bài thất bại: ' + err.message);
      } finally {
        submitBtn.textContent = 'Đăng bài';
        updateSubmitState();
      }
    });

    async function toggleLike(postId, btn) {
      if (!currentUser) { window.location.href = 'login.html'; return; }
      const postRef = db.collection('gvlab_posts').doc(postId);
      const likeRef = postRef.collection('likes').doc(currentUser.uid);
      btn.disabled = true;
      try {
        let nowLiked = false;
        await db.runTransaction(async (tx) => {
          const likeSnap = await tx.get(likeRef);
          const postSnap = await tx.get(postRef);
          const curCount = (postSnap.data() || {}).likeCount || 0;
          if (likeSnap.exists) {
            tx.delete(likeRef);
            tx.update(postRef, { likeCount: Math.max(0, curCount - 1) });
            nowLiked = false;
          } else {
            tx.set(likeRef, { createdAt: firebase.firestore.FieldValue.serverTimestamp() });
            tx.update(postRef, { likeCount: curCount + 1 });
            nowLiked = true;
          }
        });
        // Biết ngay kết quả từ transaction — ghi thẳng vào cache thay vì
        // để refreshAuthState() (chạy lại khi listener dội) phải get() lại.
        likeStatusCache.set(postId, nowLiked);
      } catch (err) {
        console.warn('[Trang Social Media] Lỗi thích bài:', err.message);
      } finally {
        btn.disabled = false;
      }
    }

    // Xoá bài — CHỈ xoá document chính, subcollection likes/comments của
    // nó trở thành "mồ côi" (Firestore không tự cascade-delete). Chấp
    // nhận được ở quy mô nhỏ (feed nội bộ team).
    async function deletePost(postId, btn) {
      if (!currentUser) return;
      if (!confirm('Xoá bài đăng này? Không thể hoàn tác.')) return;
      btn.disabled = true;
      try {
        await db.collection('gvlab_posts').doc(postId).delete();
      } catch (err) {
        showError('Xoá bài thất bại: ' + err.message);
        btn.disabled = false;
      }
    }

    function toggleComments(postId) {
      const panel = listEl.querySelector(`[data-comments-panel][data-post-id="${postId}"]`);
      if (!panel) return;
      const show = panel.hidden;
      panel.hidden = !show;
      if (show && !commentUnsubs.has(postId)) {
        const commentsList = panel.querySelector('[data-comments-list]');
        const unsub = db.collection('gvlab_posts').doc(postId).collection('comments')
          .orderBy('createdAt', 'asc').limit(200)
          .onSnapshot((snap) => {
            commentsList.innerHTML = snap.empty
              ? '<p class="gv-feed-empty">Chưa có bình luận nào.</p>'
              : snap.docs.map((d) => {
                  const c = d.data();
                  const cms = c.createdAt && c.createdAt.toMillis ? c.createdAt.toMillis() : null;
                  return `<div class="gv-feed-comment">
                    <span class="gv-avatar" data-avatar-uid="${esc(c.authorUid)}">${esc(initials(c.authorName))}</span>
                    <div class="gv-feed-comment-body"><b>${esc(c.authorName || 'Giáo viên')}</b>${esc(c.text)} <span>${relativeTime(cms)}</span></div>
                  </div>`;
                }).join('');
            applyAvatars(commentsList);
          }, (err) => { commentsList.innerHTML = `<p class="gv-feed-empty">Lỗi tải bình luận: ${esc(err.message)}</p>`; });
        commentUnsubs.set(postId, unsub);
        const form = panel.querySelector('[data-comment-form]');
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          if (!currentUser || !canEditFeed()) { window.location.href = 'login.html'; return; }
          const input = form.querySelector('[data-comment-input]');
          const text = input.value.trim();
          if (!text) return;
          input.disabled = true;
          db.collection('gvlab_posts').doc(postId).collection('comments').add({
            text: text.slice(0, 300),
            authorUid: currentUser.uid,
            authorName: currentProfile.name || currentUser.email || 'Giáo viên',
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          }).then(() => { input.value = ''; }).catch((err) => showError('Không gửi được bình luận: ' + err.message))
            .finally(() => { input.disabled = false; });
        });
      }
    }

    function refreshAuthState() {
      updateSubmitState();
      if (!currentUser) {
        listEl.querySelectorAll('[data-like-btn]').forEach((btn) => {
          btn.disabled = true;
          btn.classList.remove('is-liked');
        });
        return;
      }
      resetLikeStatusCacheIfNeeded(currentUser.uid);
      listEl.querySelectorAll('[data-like-btn]').forEach((btn) => {
        btn.disabled = false;
        const postId = btn.dataset.postId;
        if (likeStatusCache.has(postId)) {
          // Đã biết trạng thái (từ lần get() trước hoặc từ toggleLike vừa
          // chạy) — dùng thẳng, KHÔNG gọi lại Firestore. Đây là trường hợp
          // phổ biến nhất: feed dội lại vì bài đăng KHÁC thay đổi.
          btn.classList.toggle('is-liked', likeStatusCache.get(postId));
          return;
        }
        db.collection('gvlab_posts').doc(postId).collection('likes').doc(currentUser.uid).get()
          .then((snap) => {
            likeStatusCache.set(postId, snap.exists);
            btn.classList.toggle('is-liked', snap.exists);
          })
          .catch(() => {});
      });
    }

    db.collection('gvlab_posts')
      .where('category', '==', category)
      .orderBy('createdAt', 'desc')
      .limit(30)
      .onSnapshot((snap) => {
        commentUnsubs.forEach((unsub) => unsub());
        commentUnsubs.clear();
        listEl.innerHTML = snap.empty
          ? '<p class="gv-feed-empty">Chưa có bài đăng nào — hãy là người đầu tiên chia sẻ.</p>'
          : snap.docs.map(renderPost).join('');
        applyAvatars(listEl);
        listEl.querySelectorAll('[data-like-btn]').forEach((btn) => btn.addEventListener('click', () => toggleLike(btn.dataset.postId, btn)));
        listEl.querySelectorAll('[data-comment-toggle]').forEach((btn) => btn.addEventListener('click', () => toggleComments(btn.dataset.postId)));
        listEl.querySelectorAll('[data-delete-post]').forEach((btn) => btn.addEventListener('click', () => deletePost(btn.dataset.postId, btn)));
        listEl.querySelectorAll('[data-share-post]').forEach((btn) => btn.addEventListener('click', () => sharePost(btn.dataset.caption)));
        refreshAuthState();
      }, (err) => {
        listEl.innerHTML = `<p class="gv-feed-empty">Không tải được feed: ${esc(err.message)}</p>`;
      });

    return { composer, loginHint, updateSubmitState: refreshAuthState };
  }

  const feedInstances = Array.from(document.querySelectorAll('[data-feed]')).map(initFeed);

  // ════════════════════════════════════════════════════════════
  // PfCerts — mỗi Giáo viên/Admin tự đăng/xoá chứng chỉ CỦA RIÊNG MÌNH
  // (collection "gvlab_certs", đọc công khai — ai cũng xem được cả
  // trang, chỉ đăng nhập mới đăng/xoá được, và chỉ xoá được của chính
  // mình hoặc admin). Gộp hiển thị cùng bộ chứng chỉ tĩnh ban đầu
  // (CERTS/LEGACY_TEACHER_NAME) trong CÙNG 1 lưới — lọc theo giáo viên
  // qua <select> dựng từ chính dữ liệu đã tải (không query thêm).
  // 1 onSnapshot có limit(), giống hệt cơ chế đã tối ưu của PfFeed.
  // ════════════════════════════════════════════════════════════
  const MAX_CERT_IMAGE_CHARS = 700000;
  const MAX_CERT_IMAGE_DIM = 1000;
  const certsInstance = (function PfCerts() {
    const teacherFilter = document.getElementById('gvCertsTeacherFilter');
    const composer = document.getElementById('gvCertsComposer');
    const loginHint = document.getElementById('gvCertsLoginHint');
    const titleInput = document.getElementById('gvCertsTitleInput');
    const fileInput = document.getElementById('gvCertsFileInput');
    const fileNameEl = document.getElementById('gvCertsFileName');
    const submitBtn = document.getElementById('gvCertsSubmitBtn');
    const errorEl = document.getElementById('gvCertsError');
    if (!certsGrid || !teacherFilter) return;

    let pendingImage = null;
    let dynamicCerts = []; // [{ id, teacherUid, teacherName, title, image }]

    function showError(msg) { errorEl.textContent = msg; errorEl.hidden = false; }
    function updateComposerState() {
      const editor = canEditFeed();
      composer.hidden = !editor;
      loginHint.hidden = editor;
      submitBtn.disabled = !pendingImage;
    }

    function allCertItems() {
      const legacy = CERTS.map((c) => ({
        id: 'legacy:' + c.file,
        teacherName: LEGACY_TEACHER_NAME,
        title: c.title,
        src: `img/portfolio/${c.file}`,
        canDelete: false,
      }));
      const dynamic = dynamicCerts.map((c) => ({
        id: c.id,
        teacherName: c.teacherName || 'Giáo viên',
        title: c.title,
        src: c.image,
        canDelete: !!currentUser && (currentUser.uid === c.teacherUid || (currentProfile && currentProfile.role === 'admin')),
      }));
      return legacy.concat(dynamic);
    }

    function renderTeacherFilterOptions(items) {
      const names = [...new Set(items.map((c) => c.teacherName))].sort((a, b) => a.localeCompare(b, 'vi'));
      const current = teacherFilter.value;
      teacherFilter.innerHTML = '<option value="">Tất cả giáo viên</option>' +
        names.map((n) => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
      if (names.includes(current)) teacherFilter.value = current;
    }

    function renderGrid() {
      const items = allCertItems();
      renderTeacherFilterOptions(items);
      const wanted = teacherFilter.value;
      const shown = wanted ? items.filter((c) => c.teacherName === wanted) : items;
      certsGrid.innerHTML = shown.length
        ? shown.map((c) => certCardHtml(
            c.src, c.title, c.teacherName,
            c.canDelete ? `data-cert-delete="${esc(c.id)}"` : ''
          )).join('')
        : '<p class="gv-feed-empty">Chưa có chứng chỉ nào của giáo viên này.</p>';
      // Nút xoá nằm TRONG nút xem ảnh (data-cert-src) — chặn nổi bọt để
      // bấm xoá không mở nhầm lightbox. Vì certCardHtml không có sẵn ô
      // nút xoá riêng, dùng phím giữ (dbl bấm) là không thân thiện — nên
      // thêm hẳn 1 nút xoá nhỏ đè lên góc thẻ bằng cách chèn qua DOM sau
      // khi render (đơn giản hơn sửa lại template dùng chung với lightbox).
      shown.forEach((c) => {
        if (!c.canDelete) return;
        const btn = certsGrid.querySelector(`[data-cert-src][data-cert-delete="${CSS.escape(c.id)}"]`);
        if (!btn) return;
        const del = document.createElement('span');
        del.className = 'gv-cert-delete';
        del.title = 'Xoá chứng chỉ này';
        del.innerHTML = '<i class="fa-solid fa-trash"></i>';
        del.addEventListener('click', (e) => {
          e.stopPropagation();
          deleteCert(c.id);
        });
        btn.appendChild(del);
      });
    }

    async function deleteCert(id) {
      if (!confirm('Xoá chứng chỉ này? Không thể hoàn tác.')) return;
      try {
        await db.collection('gvlab_certs').doc(id).delete();
      } catch (err) {
        alert('Xoá chứng chỉ thất bại: ' + err.message);
      }
    }

    teacherFilter.addEventListener('change', renderGrid);

    fileInput.addEventListener('change', async () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      errorEl.hidden = true;
      fileNameEl.textContent = 'Đang nén ảnh…';
      try {
        pendingImage = await compressImage(file, MAX_CERT_IMAGE_DIM, MAX_CERT_IMAGE_CHARS);
        fileNameEl.textContent = file.name;
      } catch (err) {
        pendingImage = null;
        fileNameEl.textContent = 'Chưa chọn ảnh';
        showError(err.message);
      }
      updateComposerState();
    });

    submitBtn.addEventListener('click', async () => {
      const title = titleInput.value.trim();
      if (!pendingImage || !title || !currentUser || !canEditFeed()) {
        if (!title) showError('Nhập tên chứng chỉ trước khi thêm.');
        return;
      }
      submitBtn.disabled = true;
      submitBtn.textContent = 'Đang thêm…';
      try {
        await db.collection('gvlab_certs').add({
          teacherUid: currentUser.uid,
          teacherName: currentProfile.name || currentUser.email || 'Giáo viên',
          title: title.slice(0, 120),
          image: pendingImage,
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
        titleInput.value = '';
        pendingImage = null;
        fileInput.value = '';
        fileNameEl.textContent = 'Chưa chọn ảnh';
        errorEl.hidden = true;
      } catch (err) {
        showError('Thêm chứng chỉ thất bại: ' + err.message);
      } finally {
        submitBtn.textContent = 'Thêm chứng chỉ';
        updateComposerState();
      }
    });

    db.collection('gvlab_certs').orderBy('createdAt', 'desc').limit(200)
      .onSnapshot((snap) => {
        dynamicCerts = snap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
        renderGrid();
      }, (err) => {
        console.warn('[Trang Social Media] Không tải được chứng chỉ theo giáo viên (gvlab_certs):', err.message);
      });

    function refreshAuthState() {
      updateComposerState();
      renderGrid(); // canDelete phụ thuộc currentUser — vẽ lại để hiện/ẩn đúng nút xoá
    }
    return { refreshAuthState };
  })();

  // ════════════════════════════════════════════════════════════
  // PfProfile — chỉnh sửa hồ sơ Trang Social Media (ảnh đại diện/trạng thái/tiểu
  // sử), lưu vào collection RIÊNG "gvlab_profiles" (KHÔNG đụng "users"
  // dùng chung toàn nền tảng) — xem firestore.rules § gvlab_profiles.
  // ════════════════════════════════════════════════════════════
  const MAX_AVATAR_CHARS = 250000;
  const MAX_AVATAR_DIM = 300;
  (function PfProfile() {
    const editBtn = document.getElementById('gvEditProfileBtn');
    const overlay = document.getElementById('gvProfileModalOverlay');
    const closeBtn = document.getElementById('gvProfileModalClose');
    const avatarPreview = document.getElementById('gvProfileFormAvatarPreview');
    const avatarInput = document.getElementById('gvProfileAvatarInput');
    const statusInput = document.getElementById('gvProfileStatusInput');
    const bioInput = document.getElementById('gvProfileBioInput');
    const formError = document.getElementById('gvProfileFormError');
    const saveBtn = document.getElementById('gvProfileSaveBtn');
    if (!editBtn || !overlay) return;

    let pendingAvatar = null; // data URL mới chọn, chờ lưu

    function openModal() {
      if (!currentUser) return;
      const p = avatarCache[currentUser.uid] || {};
      pendingAvatar = null;
      avatarPreview.innerHTML = p.avatar ? `<img src="${p.avatar}" alt="">` : esc(initials(currentProfile && currentProfile.name));
      statusInput.value = p.status || '';
      bioInput.value = p.bio || '';
      formError.hidden = true;
      overlay.classList.add('is-open');
      document.body.style.overflow = 'hidden';
    }
    function closeModal() {
      overlay.classList.remove('is-open');
      document.body.style.overflow = '';
    }
    editBtn.addEventListener('click', openModal);
    closeBtn.addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

    avatarInput.addEventListener('change', async () => {
      const file = avatarInput.files && avatarInput.files[0];
      if (!file) return;
      try {
        pendingAvatar = await compressImage(file, MAX_AVATAR_DIM, MAX_AVATAR_CHARS);
        avatarPreview.innerHTML = `<img src="${pendingAvatar}" alt="">`;
      } catch (err) {
        formError.textContent = err.message;
        formError.hidden = false;
      }
    });

    saveBtn.addEventListener('click', async () => {
      if (!currentUser) return;
      saveBtn.disabled = true;
      saveBtn.textContent = 'Đang lưu…';
      const data = {
        status: statusInput.value.trim().slice(0, 60),
        bio: bioInput.value.trim().slice(0, 220),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      };
      if (pendingAvatar) data.avatar = pendingAvatar;
      try {
        await db.collection('gvlab_profiles').doc(currentUser.uid).set(data, { merge: true });
        // Cập nhật cache cục bộ NGAY (không cần đợi onSnapshot dội lại) để
        // avatar/trạng thái mới thấy liền trên thanh hồ sơ + ô soạn bài.
        avatarCache[currentUser.uid] = Object.assign({}, avatarCache[currentUser.uid], data, pendingAvatar ? { avatar: pendingAvatar } : {});
        applyAvatars(document);
        refreshProfileBarDisplay();
        closeModal();
      } catch (err) {
        formError.textContent = 'Lưu hồ sơ thất bại: ' + err.message;
        formError.hidden = false;
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Lưu hồ sơ';
      }
    });
  })();

  // ── PfProfileBar — thanh "mạng lưới Trang Social Media" dưới nav: avatar/tên/vai
  // trò/trạng thái người đang đăng nhập. Không đăng nhập thì ẩn hẳn cả
  // thanh (trước đây có banner mời đăng nhập ở trạng thái guest — đã bỏ). ──
  const profileBar = document.getElementById('gvProfileBar');
  const profileUser = document.getElementById('gvProfileUser');
  const profileAvatar = document.getElementById('gvProfileAvatar');
  const profileName = document.getElementById('gvProfileName');
  const profileRole = document.getElementById('gvProfileRole');
  const profileStatus = document.getElementById('gvProfileStatus');
  const ROLE_LABEL_SHORT = { admin: 'Quản trị viên', teacher: 'Giáo viên', coordinator: 'Điều phối đào tạo', teaching_coordinator: 'Điều phối giáo viên', student: 'Học sinh' };

  function refreshProfileBarDisplay() {
    if (!profileBar || !profileUser) return;
    const signedIn = !!currentUser;
    profileBar.hidden = !signedIn;
    profileUser.hidden = !signedIn;
    if (!signedIn) return;
    const displayName = (currentProfile && currentProfile.name) || currentUser.email || '';
    const p = avatarCache[currentUser.uid] || {};
    profileAvatar.innerHTML = p.avatar ? `<img src="${p.avatar}" alt="">` : esc(initials(displayName));
    profileName.textContent = displayName || 'Người dùng';
    profileRole.textContent = (currentProfile && ROLE_LABEL_SHORT[currentProfile.role]) || '—';
    if (p.status) { profileStatus.textContent = p.status; profileStatus.hidden = false; }
    else { profileStatus.hidden = true; }
  }


  // ════════════════════════════════════════════════════════════
  // Auth state dùng CHUNG cho Feed/Profile/Chat — 1 listener duy nhất.
  // ════════════════════════════════════════════════════════════
  window.EduAuth.onAuthReady((user, profile) => {
    currentUser = user;
    currentProfile = profile;
    const editor = canEditFeed();

    feedInstances.forEach((f) => {
      if (!f) return;
      f.composer.hidden = !editor;
      f.loginHint.hidden = editor;
      f.updateSubmitState();
    });
    document.querySelectorAll('[data-composer-avatar]').forEach((el) => {
      const p = user && avatarCache[user.uid];
      el.innerHTML = p && p.avatar ? `<img src="${p.avatar}" alt="">` : esc(initials((profile && profile.name) || (user && user.email)));
    });
    refreshProfileBarDisplay();
    if (certsInstance) certsInstance.refreshAuthState();
  });

  const yearEl = document.getElementById('gvYear');
  if (yearEl) yearEl.textContent = new Date().getFullYear();
})();
