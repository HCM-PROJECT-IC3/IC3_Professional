/* ============================================================
   js/carousel-keyboard-cards.js
   ------------------------------------------------------------
   Dựng lại giao diện "màn hình đang gõ phím tắt" (mac-dots +
   nhãn chương trình + dòng gõ chữ + bàn phím nghiêng 3D) theo
   tinh thần bản demo gốc github.com/HCM-PROJECT-IC3/IC3_Professional
   — trước đây từng có ở lobby-left dưới dạng 1 scene WebGL riêng
   (xem js/keyboard-scene-3d.js, giờ không còn gắn vào trang nữa).

   Lần này áp cho CẢ 6 wallpaper của carousel-3d, nên cố tình dựng
   bằng CSS transform (rotateX nghiêng cả khối bàn phím) thay vì
   WebGL: 6 scene Three.js chạy song song sẽ rất nặng máy, nhất là
   trên điện thoại. Mỗi card có bộ phím tắt + phím "nóng" riêng để
   phân biệt 6 mặt của carousel.

   DOM mỗi card (bơm vào .kb-card[data-kb-card] rỗng có sẵn trong
   index.html) gồm:
     .kb-card-screen  → mac-dots + badge chương trình + dòng gõ chữ
     .kb-card-keys    → bàn phím QWERTY thu nhỏ, phím liên quan
                        "sáng" theo heat (Ctrl = heat-1, phím phụ =
                        heat-2, phím chính đang minh hoạ = heat-active)
                        và "flash" xanh ngọc đúng lúc ký tự đó gõ ra.
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  const cards = Array.from(document.querySelectorAll('.kb-card[data-kb-card]'));
  if (!cards.length) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ── Tự co cỡ chữ dòng gõ (typed line) để KHÔNG BAO GIỜ bị cắt chữ ──
  // Trước đây cỡ chữ cố định bằng clamp() trong CSS nên ở màn hẹp,
  // dòng dài (vd. "Ctrl + F  → Tìm kiếm") có thể tràn ra ngoài card
  // và bị .carousel-3d-cell (overflow:hidden) cắt cụt. Giờ đo bề
  // rộng thật của khối screen bằng canvas rồi tính cỡ chữ vừa khít
  // cho DÒNG DÀI NHẤT trong bộ lines của mỗi card — tính 1 lần khi
  // dựng card + tính lại khi resize (không phụ thuộc viewport nữa).
  const measureCanvas = document.createElement('canvas');
  const measureCtx = measureCanvas.getContext('2d');
  const TYPED_FONT_MAX = 13; // px
  const TYPED_FONT_MIN = 7.5; // px
  function fitTypedFontSize(screenEl, typedEl, lines) {
    const longest = lines.reduce((a, b) => (b.length > a.length ? b : a), '');
    if (!longest) return;
    const cs = getComputedStyle(screenEl);
    const padX = parseFloat(cs.paddingLeft || 0) + parseFloat(cs.paddingRight || 0);
    // Trừ thêm chỗ cho con trỏ nhấp nháy (::after, rộng ~.5em+2px).
    const cursorPx = TYPED_FONT_MAX * 0.5 + 4;
    const avail = screenEl.clientWidth - padX - cursorPx;
    if (avail <= 0) return;
    measureCtx.font = `700 ${TYPED_FONT_MAX}px 'Space Mono', monospace`;
    const fullWidth = measureCtx.measureText(longest).width;
    let size = TYPED_FONT_MAX;
    if (fullWidth > avail) size = Math.max(TYPED_FONT_MIN, TYPED_FONT_MAX * (avail / fullWidth));
    typedEl.style.fontSize = size.toFixed(1) + 'px';
  }

  // Hàng phím QWERTY chuẩn — dùng chung cho mọi card, chỉ khác nhau ở
  // phím nào được tô "nóng" (xem CARD_DEFS bên dưới).
  const ROWS = [
    ['Q','W','E','R','T','Y','U','I','O','P'],
    ['A','S','D','F','G','H','J','K','L'],
    ['Z','X','C','V','B','N','M'],
  ];
  const BOTTOM_ROW = [
    { ch: 'Ctrl', wide: true },
    { ch: 'Alt', wide: true },
    { ch: '␣', wide: true, grow: true },
    { ch: '⏎', wide: true },
  ];

  // Mỗi wallpaper minh hoạ phím tắt của 1 nhóm ứng dụng khác nhau
  // trong nội dung thi IC3 GS6 — badge hiện ở góc màn hình mini,
  // "hot" liệt kê phím cần tô sáng kèm mức độ (1 = Ctrl/Alt, 2 = phím
  // phụ, active = phím minh hoạ chính, có pulse).
  const CARD_DEFS = [
    { badge: 'IC3 · GS6', hot: { Ctrl: 1, C: 'active', V: 2, Z: 2 },
      lines: ['Ctrl + C  → Sao chép', 'Ctrl + V  → Dán', 'Ctrl + Z  → Hoàn tác'] },
    { badge: 'Word', hot: { Ctrl: 1, B: 'active', I: 2, S: 2 },
      lines: ['Ctrl + B  → In đậm', 'Ctrl + I  → In nghiêng', 'Ctrl + S  → Lưu tệp'] },
    { badge: 'Excel', hot: { Ctrl: 1, P: 'active', Alt: 1, S: 2 },
      lines: ['Ctrl + P  → In bảng tính', 'Alt + Enter  → Xuống dòng', 'Ctrl + S  → Lưu tệp'] },
    { badge: 'PowerPoint', hot: { Ctrl: 1, M: 'active', D: 2, S: 2 },
      lines: ['Ctrl + M  → Slide mới', 'Ctrl + D  → Nhân đôi slide', 'Ctrl + S  → Lưu bài'] },
    { badge: 'Windows', hot: { Ctrl: 1, A: 'active', F: 2, N: 2 },
      lines: ['Ctrl + A  → Chọn tất cả', 'Ctrl + F  → Tìm kiếm', 'Ctrl + N  → Cửa sổ mới'] },
    { badge: 'Trình duyệt', hot: { Ctrl: 1, T: 'active', W: 2, R: 2 },
      lines: ['Ctrl + T  → Tab mới', 'Ctrl + W  → Đóng tab', 'Ctrl + R  → Tải lại'] },
  ];

  function buildCard(root, def) {
    const screen = document.createElement('div');
    screen.className = 'kb-card-screen';
    screen.innerHTML =
      '<div class="kb-card-dots"><span></span><span></span><span></span></div>' +
      '<div class="kb-card-badge"></div>' +
      '<div class="kb-card-typed"></div>';
    screen.querySelector('.kb-card-badge').textContent = def.badge;
    const typedEl = screen.querySelector('.kb-card-typed');

    const keysWrap = document.createElement('div');
    keysWrap.className = 'kb-card-keys';
    const inner = document.createElement('div');
    inner.className = 'kb-card-keys-inner';
    keysWrap.appendChild(inner);

    const keyEls = {}; // 'C' -> element, dùng để "flash" đúng lúc gõ ra
    ROWS.forEach((row) => {
      const rowEl = document.createElement('div');
      rowEl.className = 'kb-key-row';
      row.forEach((ch) => {
        const k = document.createElement('div');
        k.className = 'kb-key';
        const heat = def.hot[ch];
        if (heat) k.classList.add('heat-' + heat);
        k.textContent = ch;
        rowEl.appendChild(k);
        keyEls[ch] = k;
      });
      inner.appendChild(rowEl);
    });
    const bottomRowEl = document.createElement('div');
    bottomRowEl.className = 'kb-key-row';
    BOTTOM_ROW.forEach((def2) => {
      const k = document.createElement('div');
      k.className = 'kb-key wide' + (def2.grow ? '' : '');
      if (def2.grow) k.style.flex = '2 1 auto';
      const heat = def.hot[def2.ch === '␣' ? 'Space' : def2.ch === '⏎' ? 'Enter' : def2.ch];
      if (heat) k.classList.add('heat-' + heat);
      k.textContent = def2.ch;
      bottomRowEl.appendChild(k);
      keyEls[def2.ch === '␣' ? 'SPACE' : def2.ch === '⏎' ? 'ENTER' : def2.ch] = k;
    });
    inner.appendChild(bottomRowEl);

    const dotsBottom = document.createElement('div');
    dotsBottom.className = 'kb-card-dotsbottom';
    for (let i = 0; i < 3; i++) {
      const dot = document.createElement('span');
      if (i === 0) dot.classList.add('active');
      dotsBottom.appendChild(dot);
    }

    root.appendChild(screen);
    root.appendChild(keysWrap);
    root.appendChild(dotsBottom);

    return { screen, typedEl, keyEls };
  }

  function flashChar(keyEls, ch) {
    if (!ch) return;
    let rec;
    if (ch === ' ') rec = keyEls.SPACE;
    else rec = keyEls[ch.toUpperCase()];
    if (!rec) return;
    rec.classList.add('is-flash');
    setTimeout(() => rec.classList.remove('is-flash'), 260);
  }

  function startTypewriter(typedEl, keyEls, lines) {
    if (reduceMotion) { typedEl.textContent = lines[0]; return; }
    let lineIndex = 0, charIndex = 0, deleting = false;
    function tick() {
      const full = lines[lineIndex];
      if (!deleting) {
        charIndex++;
        typedEl.textContent = full.slice(0, charIndex);
        flashChar(keyEls, full[charIndex - 1]);
        if (charIndex >= full.length) {
          deleting = true;
          setTimeout(tick, 1400);
          return;
        }
        setTimeout(tick, 55 + Math.random() * 45);
      } else {
        charIndex--;
        typedEl.textContent = full.slice(0, charIndex);
        if (charIndex <= 0) {
          deleting = false;
          lineIndex = (lineIndex + 1) % lines.length;
          setTimeout(tick, 350);
          return;
        }
        setTimeout(tick, 22);
      }
    }
    // Lệch thời điểm bắt đầu mỗi card một chút để 6 card không gõ
    // đồng loạt cùng nhịp, trông tự nhiên hơn.
    setTimeout(tick, Math.random() * 600);
  }

  const built = cards.map((root, i) => {
    const def = CARD_DEFS[i % CARD_DEFS.length];
    const { screen, typedEl, keyEls } = buildCard(root, def);
    fitTypedFontSize(screen, typedEl, def.lines);
    startTypewriter(typedEl, keyEls, def.lines);
    return { screen, typedEl, def };
  });

  // Kích thước card phụ thuộc clamp() theo viewport (xem style.css
  // .carousel-3d-cell) nên phải tính lại cỡ chữ mỗi khi resize màn
  // hình — debounce nhẹ để không tính lại liên tục lúc kéo resize.
  let resizeT = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => {
      built.forEach(({ screen, typedEl, def }) => fitTypedFontSize(screen, typedEl, def.lines));
    }, 120);
  });
});
