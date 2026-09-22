/* ============================================================
   js/portfolio.js — Trang Social Media (portfolio.html)

   Trang có 2 phần chính (Certifications on File / Life at Social Media),
   mỗi phần kèm "Teacher Feed", cộng thêm hạ tầng mạng xã hội dùng
   CHUNG cho cả trang: hồ sơ cá nhân (PfProfile), chat nhóm (PfChat),
   và cache ảnh đại diện (avatarCache) — tất cả qua Firestore thật:
     - gvlab_posts     : bài đăng (đọc công khai, ghi cần đăng nhập)
     - gvlab_profiles  : ảnh đại diện/trạng thái/tiểu sử (đọc công khai)
     - gvlab_chat      : chat nhóm (CHỈ đọc/ghi khi đã đăng nhập)
   Xem firestore.rules cùng tên collection để biết đúng quyền hạn.

   Không dùng Cloud Storage cho ảnh (repo chưa có storage.rules quản
   lý) — mọi ảnh (bài đăng/avatar/đính kèm chat) đều nén + mã hoá
   base64 ngay trên trình duyệt trước khi ghi thẳng vào field Firestore
   (xem compressImage()), giới hạn cỡ khác nhau theo mục đích dùng.
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
  // PfCertLightbox — lưới 20 ảnh chứng chỉ + xem đầy đủ khi bấm vào.
  // ════════════════════════════════════════════════════════════
  const certsGrid = document.getElementById('gvCertsGrid');
  const lightboxOverlay = document.getElementById('gvLightboxOverlay');
  const lightboxImg = document.getElementById('gvLightboxImg');
  const lightboxCaption = document.getElementById('gvLightboxCaption');
  const lightboxClose = document.getElementById('gvLightboxClose');

  if (certsGrid) {
    certsGrid.innerHTML = CERTS.map((c, i) => `
      <button type="button" data-cert-index="${i}" aria-label="Xem ${esc(c.title)}">
        <span><img src="img/portfolio/${esc(c.file)}" alt="${esc(c.title)}" loading="lazy" decoding="async"></span>
        <span class="gv-cert-label">${esc(c.title)}</span>
      </button>
    `).join('');
    certsGrid.querySelectorAll('[data-cert-index]').forEach((btn) => {
      btn.addEventListener('click', () => openLightbox(CERTS[Number(btn.dataset.certIndex)]));
    });
  }
  function openLightbox(c) {
    if (!lightboxOverlay) return;
    lightboxImg.src = `img/portfolio/${c.file}`;
    lightboxImg.alt = c.title;
    lightboxCaption.textContent = c.title;
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

  // ════════════════════════════════════════════════════════════
  // Hạ tầng mạng xã hội dùng CHUNG (Firebase, avatar cache, tiện ích) —
  // PfFeed/PfProfile/PfChat bên dưới đều dựa vào đây. Dừng sớm nếu
  // thiếu Firebase/EduAuth (trang vẫn hiện được Certifications/Life
  // tĩnh, chỉ mất phần tương tác).
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
        await db.runTransaction(async (tx) => {
          const likeSnap = await tx.get(likeRef);
          const postSnap = await tx.get(postRef);
          const curCount = (postSnap.data() || {}).likeCount || 0;
          if (likeSnap.exists) {
            tx.delete(likeRef);
            tx.update(postRef, { likeCount: Math.max(0, curCount - 1) });
          } else {
            tx.set(likeRef, { createdAt: firebase.firestore.FieldValue.serverTimestamp() });
            tx.update(postRef, { likeCount: curCount + 1 });
          }
        });
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
      listEl.querySelectorAll('[data-like-btn]').forEach((btn) => {
        btn.disabled = !currentUser;
        if (!currentUser) { btn.classList.remove('is-liked'); return; }
        db.collection('gvlab_posts').doc(btn.dataset.postId).collection('likes').doc(currentUser.uid).get()
          .then((snap) => btn.classList.toggle('is-liked', snap.exists))
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
  // trò/trạng thái người đang đăng nhập. ──
  const profileGuest = document.getElementById('gvProfileGuest');
  const profileUser = document.getElementById('gvProfileUser');
  const profileAvatar = document.getElementById('gvProfileAvatar');
  const profileName = document.getElementById('gvProfileName');
  const profileRole = document.getElementById('gvProfileRole');
  const profileStatus = document.getElementById('gvProfileStatus');
  const ROLE_LABEL_SHORT = { admin: 'Quản trị viên', teacher: 'Giáo viên', coordinator: 'Điều phối đào tạo', teaching_coordinator: 'Điều phối giáo viên', student: 'Học sinh' };

  function refreshProfileBarDisplay() {
    if (!profileGuest || !profileUser) return;
    const signedIn = !!currentUser;
    profileGuest.hidden = signedIn;
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
  // PfChat — chat nhóm nội bộ realtime kiểu Messenger (collection
  // "gvlab_chat"), CHỈ dùng được khi đã đăng nhập Giáo viên/Admin.
  // Nâng cấp thêm: đang-nhập (gvlab_chat_typing), thả cảm xúc (field
  // "reactions" denormalized ngay trên tin nhắn), trả lời trích dẫn
  // (field replyTo* trên tin nhắn), xoá tin của chính mình, và ai đang
  // mở khung chat (gvlab_presence, nhịp tim mỗi 20s).
  // ════════════════════════════════════════════════════════════
  const CHAT_REACTION_EMOJIS = ['👍', '❤️', '😂', '🎉', '😮', '🙏'];
  // Bảng emoji chèn vào Ô NHẬP (khác 6 emoji thả cảm xúc ở trên) — bộ phổ
  // biến gọn cho chat giáo viên, không cần thư viện emoji-picker ngoài.
  const CHAT_INPUT_EMOJIS = [
    '😀', '😄', '😁', '😆', '🥹', '😊', '🙂', '😉', '😍', '🥰',
    '😘', '😜', '🤔', '🤗', '🤝', '👏', '🙌', '👍', '👎', '💪',
    '🙏', '✋', '👋', '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤',
    '🔥', '✨', '🎉', '🎊', '🎓', '📚', '📌', '✅', '❌', '⚠️',
    '😢', '😭', '😅', '😴', '🤯', '🥳', '👀', '💡', '⏰', '☕',
  ];

  /** Suy icon Font Awesome theo phần mở rộng file — chỉ để hiển thị thẻ
   * file trong tin nhắn cho dễ nhận diện, không đọc nội dung file. */
  function fileIconFor(name) {
    const ext = String(name || '').split('.').pop().toLowerCase();
    if (['pdf'].includes(ext)) return 'fa-file-pdf';
    if (['doc', 'docx'].includes(ext)) return 'fa-file-word';
    if (['xls', 'xlsx', 'csv'].includes(ext)) return 'fa-file-excel';
    if (['ppt', 'pptx'].includes(ext)) return 'fa-file-powerpoint';
    if (['zip', 'rar', '7z'].includes(ext)) return 'fa-file-zipper';
    if (['mp4', 'mov', 'webm', 'avi', 'mkv'].includes(ext)) return 'fa-file-video';
    if (['mp3', 'wav', 'ogg'].includes(ext)) return 'fa-file-audio';
    return 'fa-file';
  }
  function humanSize(bytes) {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  (function PfChat() {
    const fab = document.getElementById('gvChatFab');
    const badge = document.getElementById('gvChatBadge');
    const panel = document.getElementById('gvChatPanel');
    const closeBtn = document.getElementById('gvChatCloseBtn');
    const messagesEl = document.getElementById('gvChatMessages');
    const onlineAvatarsEl = document.getElementById('gvChatOnlineAvatars');
    const onlineCountEl = document.getElementById('gvChatOnlineCount');
    const typingEl = document.getElementById('gvChatTyping');
    const replyPreview = document.getElementById('gvChatReplyPreview');
    const replyPreviewText = document.getElementById('gvChatReplyText');
    const replyCancelBtn = document.getElementById('gvChatReplyCancel');
    const attachPreview = document.getElementById('gvChatAttachPreview');
    const attachPreviewLabel = document.getElementById('gvChatAttachPreviewLabel');
    const attachCancelBtn = document.getElementById('gvChatAttachCancel');
    const emojiPanel = document.getElementById('gvChatEmojiPanel');
    const emojiBtn = document.getElementById('gvChatEmojiBtn');
    const micBtn = document.getElementById('gvChatMicBtn');
    const recTimerEl = document.getElementById('gvChatRecTimer');
    const form = document.getElementById('gvChatForm');
    const fileInput = document.getElementById('gvChatFileInput');
    const textInput = document.getElementById('gvChatInput');
    if (!fab || !panel) return;

    // Cỡ tối đa RAW file (trước base64) cho file/ghi âm KHÔNG nén được
    // (không như ảnh, không có cách nén file/PDF/audio phía client) —
    // base64 phồng thêm ~33%, giữ dưới hạn 700 000 ký tự của
    // firestore.rules § gvlab_chat. Video THẬT hầu như luôn vượt mức
    // này (không có hạ tầng nén video phía client) — chat chỉ nhận
    // được video RẤT ngắn/độ phân giải thấp, đây là giới hạn thật của
    // kiến trúc "base64-trong-Firestore, không Cloud Storage".
    const MAX_RAW_FILE_BYTES = 480000;
    const MAX_CHAT_ATTACH_CHARS = 700000;
    const MAX_RECORD_SECONDS = 60;

    const SEEN_KEY = 'gvlab_chat_last_seen';
    let started = false; // chỉ subscribe onSnapshot khi mở panel LẦN ĐẦU (đỡ tốn đọc nếu không ai chat)
    let pendingAttachment = null; // { data, mime, name, size, kind: 'image'|'audio'|'file' }
    let lastMessageTs = 0;
    let lastDocsById = {}; // id -> dữ liệu tin nhắn gần nhất (để lấy nội dung khi trả lời/xoá)
    let replyTarget = null; // { id, authorName, text }
    let typingTimer = null;
    let presenceInterval = null;
    let mediaRecorder = null;
    let recordedChunks = [];
    let recordTimerInterval = null;
    let recordSeconds = 0;

    function lastSeen() { try { return Number(localStorage.getItem(SEEN_KEY)) || 0; } catch (e) { return 0; } }
    function markSeen(ts) { try { localStorage.setItem(SEEN_KEY, String(ts)); } catch (e) { /* ignore */ } badge.hidden = true; }

    function setPendingAttachment(att) {
      pendingAttachment = att;
      if (!att) { attachPreview.hidden = true; return; }
      const label = att.kind === 'audio' ? `🎤 Ghi âm (${att.durationLabel || ''})`
        : att.kind === 'gif' ? `🎞 GIF · ${humanSize(att.size)}`
        : `📎 ${att.name} · ${humanSize(att.size)}`;
      attachPreviewLabel.textContent = label;
      attachPreview.hidden = false;
    }
    attachCancelBtn.addEventListener('click', () => { setPendingAttachment(null); fileInput.value = ''; });

    // ── Emoji cho ô nhập — chèn tại đúng vị trí con trỏ, không phải
    // luôn nối vào cuối (giáo viên có thể đang sửa giữa câu). ──
    if (emojiPanel.childElementCount === 0) {
      emojiPanel.innerHTML = CHAT_INPUT_EMOJIS.map((e) => `<button type="button">${e}</button>`).join('');
      emojiPanel.querySelectorAll('button').forEach((b) => {
        b.addEventListener('click', () => {
          const start = textInput.selectionStart ?? textInput.value.length;
          const end = textInput.selectionEnd ?? textInput.value.length;
          textInput.value = textInput.value.slice(0, start) + b.textContent + textInput.value.slice(end);
          const pos = start + b.textContent.length;
          textInput.setSelectionRange(pos, pos);
          textInput.focus();
          textInput.dispatchEvent(new Event('input')); // để trình "đang nhập" cũng tính chèn emoji là đang gõ
        });
      });
    }
    emojiBtn.addEventListener('click', () => { emojiPanel.hidden = !emojiPanel.hidden; });

    function setReplyTarget(id) {
      const m = lastDocsById[id];
      if (!m) return;
      const attLabel = m.attachmentType === 'audio' ? '🎤 Ghi âm' : m.attachmentType === 'file' ? `📎 ${m.attachmentName || 'File'}` : m.attachment ? '📎 Hình ảnh' : '';
      replyTarget = { id, authorName: m.authorName || 'Giáo viên', text: m.text || attLabel };
      replyPreviewText.textContent = `Trả lời ${replyTarget.authorName}: ${replyTarget.text.slice(0, 60)}`;
      replyPreview.hidden = false;
      textInput.focus();
    }
    function clearReplyTarget() { replyTarget = null; replyPreview.hidden = true; }
    replyCancelBtn.addEventListener('click', clearReplyTarget);

    async function toggleReaction(msgId, emoji) {
      if (!currentUser) return;
      const ref = db.collection('gvlab_chat').doc(msgId);
      const m = lastDocsById[msgId] || {};
      const current = (m.reactions || {})[currentUser.uid];
      const field = `reactions.${currentUser.uid}`;
      try {
        if (current === emoji) {
          await ref.update({ [field]: firebase.firestore.FieldValue.delete() });
        } else {
          await ref.update({ [field]: emoji });
        }
      } catch (err) {
        console.warn('[Trang Social Media] Lỗi thả cảm xúc:', err.message);
      }
    }

    // "Xoá hẳn" — xoá luôn document, không còn dấu vết gì (khác "Thu
    // hồi" bên dưới, chỉ thay nội dung).
    async function deleteMessage(msgId) {
      if (!confirm('Xoá tin nhắn này? Không thể hoàn tác.')) return;
      try { await db.collection('gvlab_chat').doc(msgId).delete(); }
      catch (err) { alert('Xoá thất bại: ' + err.message); }
    }

    // "Thu hồi" (kiểu Messenger) — CHỈ tác giả, chỉ áp dụng cho tin của
    // CHÍNH MÌNH (firestore.rules § gvlab_chat cũng chỉ cho phép đúng
    // tác giả sửa tin của họ). Xoá THẬT nội dung/đính kèm khỏi Firestore
    // (không phải ẩn phía client) — người xem chỉ còn thấy dòng "Tin
    // nhắn đã được thu hồi", giữ đúng vị trí/thời gian trong luồng chat.
    async function recallMessage(msgId) {
      if (!confirm('Thu hồi tin nhắn này? Nội dung sẽ bị xoá khỏi Firestore, chỉ còn hiện "Đã thu hồi".')) return;
      try {
        await db.collection('gvlab_chat').doc(msgId).update({
          recalled: true,
          text: '',
          attachment: firebase.firestore.FieldValue.delete(),
          attachmentType: firebase.firestore.FieldValue.delete(),
          attachmentName: firebase.firestore.FieldValue.delete(),
          attachmentSize: firebase.firestore.FieldValue.delete(),
          replyToId: firebase.firestore.FieldValue.delete(),
          replyToName: firebase.firestore.FieldValue.delete(),
          replyToText: firebase.firestore.FieldValue.delete(),
        });
      } catch (err) {
        alert('Thu hồi thất bại: ' + err.message);
      }
    }

    /** Đính kèm hiện theo đúng loại: ảnh/GIF -> <img> (GIF KHÔNG bị nén
     * qua canvas — xem ghi chú trong fileInput handler — nên hoạt ảnh
     * vẫn chạy), ghi âm -> <audio controls>, file khác -> thẻ tên file +
     * cỡ + link tải (data URI, tải thẳng từ chính nội dung base64 đã
     * lưu, không cần server phục vụ file). */
    function renderAttachment(m) {
      if (!m.attachment) return '';
      if (m.attachmentType === 'audio') {
        return `<audio class="gv-chat-msg-audio" src="${m.attachment}" controls></audio>`;
      }
      if (m.attachmentType === 'file') {
        return `<a class="gv-chat-msg-file" href="${m.attachment}" download="${esc(m.attachmentName || 'file')}">
          <i class="fa-solid ${fileIconFor(m.attachmentName)}"></i>
          <span><span class="gv-chat-msg-file-name">${esc(m.attachmentName || 'File')}</span><span class="gv-chat-msg-file-size">${humanSize(m.attachmentSize)}</span></span>
        </a>`;
      }
      return `<img class="gv-chat-msg-img" src="${m.attachment}" alt="">`;
    }

    function renderReactions(msgId, reactions) {
      const counts = {};
      Object.values(reactions || {}).forEach((e) => { counts[e] = (counts[e] || 0) + 1; });
      const mine = currentUser ? (reactions || {})[currentUser.uid] : null;
      return Object.keys(counts).length
        ? `<div class="gv-chat-reactions">${Object.entries(counts).map(([e, n]) =>
            `<button type="button" class="gv-chat-reaction ${e === mine ? 'is-mine' : ''}" data-react-toggle data-msg-id="${msgId}" data-emoji="${e}">${e} ${n}</button>`
          ).join('')}</div>`
        : '';
    }

    function renderMessages(snap) {
      if (snap.empty) {
        messagesEl.innerHTML = '<p class="gv-chat-empty">Chưa có tin nhắn nào — bắt đầu trò chuyện với team!</p>';
        lastDocsById = {};
        return;
      }
      lastDocsById = {};
      messagesEl.innerHTML = snap.docs.map((doc) => {
        const m = doc.data();
        lastDocsById[doc.id] = m;
        const ms = m.createdAt && m.createdAt.toMillis ? m.createdAt.toMillis() : Date.now();
        const isOwn = currentUser && m.authorUid === currentUser.uid;
        const canDelete = isOwn || (currentProfile && currentProfile.role === 'admin');

        // Tin đã thu hồi — chỉ hiện dòng thông báo, không còn nút
        // trả lời/thả cảm xúc/thu hồi lại lần 2 (không còn gì để thao
        // tác), nhưng canDelete (admin) vẫn xoá hẳn được nếu cần dọn.
        if (m.recalled) {
          return `<div class="gv-chat-msg ${isOwn ? 'is-own' : ''}" data-msg-id="${doc.id}">
            <span class="gv-avatar" data-avatar-uid="${esc(m.authorUid)}">${esc(initials(m.authorName))}</span>
            <div class="gv-chat-msg-col">
              <div class="gv-chat-msg-body gv-chat-msg-recalled">
                ${isOwn ? '' : `<span class="gv-chat-msg-name">${esc(m.authorName || 'Giáo viên')}</span>`}
                <i class="fa-solid fa-rotate-left"></i> Tin nhắn đã được thu hồi
                <span class="gv-chat-msg-time">${relativeTime(ms)}</span>
              </div>
            </div>
            ${canDelete ? `<div class="gv-chat-msg-actions"><button type="button" data-delete-msg data-msg-id="${doc.id}" title="Xoá hẳn"><i class="fa-solid fa-trash"></i></button></div>` : ''}
          </div>`;
        }

        return `<div class="gv-chat-msg ${isOwn ? 'is-own' : ''}" data-msg-id="${doc.id}">
          <span class="gv-avatar" data-avatar-uid="${esc(m.authorUid)}">${esc(initials(m.authorName))}</span>
          <div class="gv-chat-msg-col">
            <div class="gv-chat-msg-body">
              ${isOwn ? '' : `<span class="gv-chat-msg-name">${esc(m.authorName || 'Giáo viên')}</span>`}
              ${m.replyToText ? `<div class="gv-chat-quote"><b>${esc(m.replyToName || '')}</b>: ${esc(String(m.replyToText).slice(0, 80))}</div>` : ''}
              ${m.text ? esc(m.text) : ''}
              ${renderAttachment(m)}
              <span class="gv-chat-msg-time">${relativeTime(ms)}</span>
              <div class="gv-chat-emoji-picker" data-emoji-picker="${doc.id}" hidden>
                ${CHAT_REACTION_EMOJIS.map((e) => `<button type="button" data-react-pick data-msg-id="${doc.id}" data-emoji="${e}">${e}</button>`).join('')}
              </div>
            </div>
            ${renderReactions(doc.id, m.reactions)}
          </div>
          <div class="gv-chat-msg-actions">
            <button type="button" data-reply-btn data-msg-id="${doc.id}" title="Trả lời"><i class="fa-solid fa-reply"></i></button>
            <button type="button" data-emoji-btn data-msg-id="${doc.id}" title="Thả cảm xúc"><i class="fa-regular fa-face-smile"></i></button>
            ${isOwn ? `<button type="button" data-recall-msg data-msg-id="${doc.id}" title="Thu hồi"><i class="fa-solid fa-rotate-left"></i></button>` : ''}
            ${canDelete ? `<button type="button" data-delete-msg data-msg-id="${doc.id}" title="Xoá hẳn"><i class="fa-solid fa-trash"></i></button>` : ''}
          </div>
        </div>`;
      }).join('');
      applyAvatars(messagesEl);
      messagesEl.scrollTop = messagesEl.scrollHeight;

      messagesEl.querySelectorAll('[data-reply-btn]').forEach((b) => b.addEventListener('click', () => setReplyTarget(b.dataset.msgId)));
      messagesEl.querySelectorAll('[data-delete-msg]').forEach((b) => b.addEventListener('click', () => deleteMessage(b.dataset.msgId)));
      messagesEl.querySelectorAll('[data-recall-msg]').forEach((b) => b.addEventListener('click', () => recallMessage(b.dataset.msgId)));
      messagesEl.querySelectorAll('[data-react-toggle]').forEach((b) => b.addEventListener('click', () => toggleReaction(b.dataset.msgId, b.dataset.emoji)));
      messagesEl.querySelectorAll('[data-emoji-btn]').forEach((b) => b.addEventListener('click', () => {
        const picker = messagesEl.querySelector(`[data-emoji-picker="${b.dataset.msgId}"]`);
        const willShow = picker.hidden;
        messagesEl.querySelectorAll('[data-emoji-picker]').forEach((p) => { p.hidden = true; });
        picker.hidden = !willShow;
      }));
      messagesEl.querySelectorAll('[data-react-pick]').forEach((b) => b.addEventListener('click', () => {
        toggleReaction(b.dataset.msgId, b.dataset.emoji);
        messagesEl.querySelectorAll('[data-emoji-picker]').forEach((p) => { p.hidden = true; });
      }));
    }

    function startListening() {
      if (started) return;
      started = true;
      db.collection('gvlab_chat').orderBy('createdAt', 'asc').limitToLast(80)
        .onSnapshot((snap) => {
          renderMessages(snap);
          const docs = snap.docs;
          if (docs.length) {
            const last = docs[docs.length - 1].data();
            lastMessageTs = last.createdAt && last.createdAt.toMillis ? last.createdAt.toMillis() : Date.now();
            if (panel.hidden && lastMessageTs > lastSeen()) {
              badge.hidden = false;
              badge.textContent = '•';
            } else if (!panel.hidden) {
              markSeen(lastMessageTs);
            }
          }
        }, (err) => {
          messagesEl.innerHTML = `<p class="gv-chat-empty">Không tải được chat: ${esc(err.message)}</p>`;
        });

      // "Đang nhập..." — chỉ những document còn "tươi" (< 5s) mới tính,
      // tránh hiện mãi nếu 1 tab bị đóng đột ngột mà chưa kịp tự xoá.
      db.collection('gvlab_chat_typing').onSnapshot((snap) => {
        const now = Date.now();
        const names = snap.docs
          .filter((d) => d.id !== (currentUser && currentUser.uid))
          .map((d) => d.data())
          .filter((t) => t.ts && t.ts.toMillis && (now - t.ts.toMillis()) < 5000)
          .map((t) => t.name || 'Ai đó');
        if (names.length) {
          typingEl.textContent = `${names.join(', ')} đang nhập…`;
          typingEl.hidden = false;
        } else {
          typingEl.hidden = true;
        }
      }, () => {});

      // Ai đang mở khung chat (presence) — chỉ tính "tươi" trong ~45s.
      // Hiện avatar THẬT của từng người (không chỉ đếm số) — data-avatar-uid
      // để applyAvatars() tự thay bằng ảnh đại diện thật khi cache có.
      db.collection('gvlab_presence').onSnapshot((snap) => {
        const now = Date.now();
        const active = snap.docs
          .map((d) => ({ uid: d.id, ...d.data() }))
          .filter((p) => p.lastActive && p.lastActive.toMillis && (now - p.lastActive.toMillis()) < 45000);
        const shown = active.slice(0, 6);
        onlineAvatarsEl.innerHTML = shown.map((p) =>
          `<span class="gv-avatar" data-avatar-uid="${esc(p.uid)}" title="${esc(p.name || 'Giáo viên')}">${esc(initials(p.name))}</span>`
        ).join('');
        applyAvatars(onlineAvatarsEl);
        onlineCountEl.textContent = active.length
          ? `${active.length > 6 ? '+' + (active.length - 6) + ' · ' : ''}Đang hoạt động`
          : '';
      }, () => {});
    }

    function startPresence() {
      if (!currentUser || presenceInterval) return;
      const beat = () => db.collection('gvlab_presence').doc(currentUser.uid).set({
        name: currentProfile.name || currentUser.email || 'Giáo viên',
        lastActive: firebase.firestore.FieldValue.serverTimestamp(),
      }).catch(() => {});
      beat();
      presenceInterval = setInterval(beat, 20000);
    }
    function stopPresence() {
      if (presenceInterval) { clearInterval(presenceInterval); presenceInterval = null; }
      if (currentUser) db.collection('gvlab_presence').doc(currentUser.uid).delete().catch(() => {});
    }
    window.addEventListener('beforeunload', stopPresence);

    function openPanel() {
      panel.hidden = false;
      startListening();
      startPresence();
      if (lastMessageTs) markSeen(lastMessageTs);
      textInput.focus();
    }
    function closePanel() {
      panel.hidden = true;
      stopPresence();
      emojiPanel.hidden = true;
      if (micBtn.classList.contains('is-recording')) stopRecording();
      messagesEl.querySelectorAll('[data-emoji-picker]').forEach((p) => { p.hidden = true; });
    }

    fab.addEventListener('click', () => { panel.hidden ? openPanel() : closePanel(); });
    closeBtn.addEventListener('click', closePanel);

    // "Đang nhập..." — ghi lại document của mình mỗi lần gõ (throttle nhẹ
    // qua debounce 1.2s không gõ tiếp thì tự xoá document, báo đã dừng gõ).
    textInput.addEventListener('input', () => {
      if (!currentUser) return;
      clearTimeout(typingTimer);
      db.collection('gvlab_chat_typing').doc(currentUser.uid).set({
        name: currentProfile.name || currentUser.email || 'Giáo viên',
        ts: firebase.firestore.FieldValue.serverTimestamp(),
      }).catch(() => {});
      typingTimer = setTimeout(() => {
        db.collection('gvlab_chat_typing').doc(currentUser.uid).delete().catch(() => {});
      }, 1200);
    });

    /** Đọc 1 Blob/File RAW (không nén được — không phải ảnh) thành data
     * URL, từ chối thẳng nếu vượt MAX_RAW_FILE_BYTES thay vì cố ghi rồi
     * bị firestore.rules từ chối (báo lỗi rõ ràng ngay trên UI). */
    function readRawFileAsDataUrl(fileOrBlob) {
      return new Promise((resolve, reject) => {
        if (fileOrBlob.size > MAX_RAW_FILE_BYTES) {
          reject(new Error(`File quá lớn (${humanSize(fileOrBlob.size)}) — chat chỉ nhận file/video/ghi âm dưới ${humanSize(MAX_RAW_FILE_BYTES)} (không nén được như ảnh, do chưa có Cloud Storage).`));
          return;
        }
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('Không đọc được file.'));
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(fileOrBlob);
      });
    }

    // Nhận MỌI loại file (ảnh/PDF/Word/Excel/zip/GIF/video ngắn...) —
    // ảnh TĨNH được NÉN qua canvas như trước (nhẹ hơn nhiều). GIF cố
    // tình KHÔNG đi qua compressImage(): vẽ GIF lên <canvas> rồi xuất
    // lại bằng toDataURL('image/jpeg') chỉ giữ đúng 1 khung hình đầu —
    // hoạt ảnh biến mất, gửi ra là ảnh tĩnh (đúng lỗi người dùng báo).
    // GIF vì vậy đi theo nhánh RAW giống file thường, chỉ khác kind
    // ('gif' thay vì 'file') để nhãn xem trước hiện đúng "GIF" thay vì
    // tên file kỹ thuật, và cỡ tối đa cũng nhỏ hơn (GIF động thường
    // nặng hơn ảnh tĩnh nhiều, không nén được nên phải giữ hạn mức thấp).
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      const isGif = file.type === 'image/gif';
      const isImage = !isGif && file.type && file.type.indexOf('image/') === 0;
      try {
        if (isImage) {
          const data = await compressImage(file, 1000, MAX_CHAT_ATTACH_CHARS);
          setPendingAttachment({ data, mime: file.type, name: file.name, size: file.size, kind: 'image' });
        } else if (isGif) {
          const data = await readRawFileAsDataUrl(file);
          setPendingAttachment({ data, mime: file.type, name: file.name, size: file.size, kind: 'gif' });
        } else {
          const data = await readRawFileAsDataUrl(file);
          setPendingAttachment({ data, mime: file.type || 'application/octet-stream', name: file.name, size: file.size, kind: 'file' });
        }
      } catch (err) {
        setPendingAttachment(null);
        alert(err.message);
      }
    });

    // ── Ghi âm giọng nói (MediaRecorder) — bấm micro để bắt đầu, bấm lại
    // (hoặc quá MAX_RECORD_SECONDS) để tự dừng, đính kèm chờ gửi giống
    // file/ảnh (KHÔNG tự gửi ngay — vẫn qua nút Gửi để còn kịp nhập chữ
    // kèm theo hoặc huỷ). ──
    async function startRecording() {
      if (!navigator.mediaDevices || !window.MediaRecorder) {
        alert('Trình duyệt này không hỗ trợ ghi âm.');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        recordedChunks = [];
        mediaRecorder = new MediaRecorder(stream);
        mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunks.push(e.data); };
        mediaRecorder.onstop = async () => {
          stream.getTracks().forEach((t) => t.stop());
          const blob = new Blob(recordedChunks, { type: mediaRecorder.mimeType || 'audio/webm' });
          try {
            const data = await readRawFileAsDataUrl(blob);
            setPendingAttachment({ data, mime: blob.type, name: 'voice-note', size: blob.size, kind: 'audio', durationLabel: `0:${String(recordSeconds).padStart(2, '0')}` });
          } catch (err) {
            alert(err.message);
          }
        };
        mediaRecorder.start();
        recordSeconds = 0;
        micBtn.classList.add('is-recording');
        recTimerEl.hidden = false;
        recTimerEl.textContent = '● 0:00';
        recordTimerInterval = setInterval(() => {
          recordSeconds++;
          recTimerEl.textContent = `● 0:${String(recordSeconds).padStart(2, '0')}`;
          if (recordSeconds >= MAX_RECORD_SECONDS) stopRecording();
        }, 1000);
      } catch (err) {
        alert('Không dùng được micro: ' + err.message);
      }
    }
    function stopRecording() {
      if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
      clearInterval(recordTimerInterval);
      micBtn.classList.remove('is-recording');
      recTimerEl.hidden = true;
    }
    micBtn.addEventListener('click', () => {
      if (!currentUser) { window.location.href = 'login.html'; return; }
      if (micBtn.classList.contains('is-recording')) stopRecording();
      else startRecording();
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!currentUser || !canEditFeed()) { window.location.href = 'login.html'; return; }
      const text = textInput.value.trim();
      if (!text && !pendingAttachment) return;
      const data = {
        authorUid: currentUser.uid,
        authorName: currentProfile.name || currentUser.email || 'Giáo viên',
        text: text.slice(0, 500),
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      };
      if (pendingAttachment) {
        data.attachment = pendingAttachment.data;
        data.attachmentType = pendingAttachment.kind;
        if (pendingAttachment.name) data.attachmentName = pendingAttachment.name;
        if (pendingAttachment.size) data.attachmentSize = pendingAttachment.size;
      }
      if (replyTarget) {
        data.replyToId = replyTarget.id;
        data.replyToName = replyTarget.authorName;
        data.replyToText = replyTarget.text;
      }
      textInput.disabled = true;
      try {
        await db.collection('gvlab_chat').add(data);
        textInput.value = '';
        setPendingAttachment(null);
        fileInput.value = '';
        clearReplyTarget();
        clearTimeout(typingTimer);
        db.collection('gvlab_chat_typing').doc(currentUser.uid).delete().catch(() => {});
      } catch (err) {
        alert('Không gửi được tin nhắn: ' + err.message);
      } finally {
        textInput.disabled = false;
        textInput.focus();
      }
    });

    // Chỉ hiện nút chat nổi khi đã đăng nhập Giáo viên/Admin — expose ra
    // ngoài để callback onAuthReady chung gọi vào.
    window.__gvChatSetVisible = (visible) => {
      fab.hidden = !visible;
      if (!visible) closePanel();
    };
  })();

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
    if (window.__gvChatSetVisible) window.__gvChatSetVisible(editor);
  });

  const yearEl = document.getElementById('gvYear');
  if (yearEl) yearEl.textContent = new Date().getFullYear();
})();
