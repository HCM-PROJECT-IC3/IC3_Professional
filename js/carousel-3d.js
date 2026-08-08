/* index.html — Animated 3D Carousel ở lobby-left (thay cho bàn phím
   3D WebGL cũ). Thuần vanilla JS, không phụ thuộc thư viện ngoài:
     • Xếp N panel đều quanh 1 vòng tròn bằng rotateY(i*step) translateZ(radius)
       — radius tính theo bề rộng thật của panel để không bị chồng mép,
       tự tính lại khi resize màn hình.
     • Kéo chuột/chạm (pointer events) để xoay tự do quanh trục Y;
       thả tay ra thì "trôi" tiếp theo quán tính rồi tắt dần (damping)
       giống tinh thần easing của khối bàn phím 3D cũ, không dừng khựng.
     • Khi rảnh tay (không kéo, không hover) tự xoay chậm — dừng ngay
       khi người dùng bắt đầu tương tác hoặc di chuột vào, tôn trọng
       prefers-reduced-motion (tắt hẳn auto-rotate + trôi quán tính). */

document.addEventListener('DOMContentLoaded', () => {
  const root  = document.getElementById('carousel3d');
  const stage = document.getElementById('carouselStage');
  const ring  = document.getElementById('carouselRing');
  if (!root || !stage || !ring) return;

  const cells = Array.from(ring.querySelectorAll('.carousel-3d-cell'));
  const n = cells.length;
  if (!n) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const step = 360 / n;

  let radius = 0;
  let angle = 0;          // góc hiện tại của vòng (độ)
  let velocity = 0;       // độ/khung hình — dùng cho quán tính khi thả tay
  let dragging = false;
  let hovering = false;
  let lastX = 0;
  let lastMoveT = 0;

  // Bề rộng panel phụ thuộc clamp() trong CSS nên phải đo thật, không
  // hard-code — tính radius theo công thức đa giác đều N cạnh để các
  // panel liền cạnh nhau vừa khít, không hở cũng không chồng mép.
  function computeRadius() {
    if (!cells[0]) return;
    // offsetWidth = kích thước layout gốc (border-box), KHÔNG bị ảnh
    // hưởng bởi transform 3D đang áp lên chính cell (rotateY/translateZ).
    // getBoundingClientRect() thì ngược lại — nó đo hình chiếu sau khi
    // phối cảnh 'perspective' đã bóp méo theo góc xoay + translateZ hiện
    // tại, nên mỗi lần đo lại (vd. lúc resize) ra một trị số khác nhau
    // dù panel không đổi kích thước thật → radius lệch → panel xen kẽ.
    const w = cells[0].offsetWidth;
    radius = Math.round((w / 2) / Math.tan(Math.PI / n));
    layoutCells();
  }

  function layoutCells() {
    cells.forEach((cell, i) => {
      cell.style.transform = `rotateY(${i * step}deg) translateZ(${radius}px)`;
    });
  }

  // Panel nào đang "quay mặt" ra người xem gần nhất (góc hiệu dụng gần
  // 0° nhất, có xét vòng lặp 360°) thì gắn class is-front để nổi bật.
  function markFrontCell() {
    let bestI = 0, bestDiff = Infinity;
    cells.forEach((cell, i) => {
      const eff = ((i * step + angle) % 360 + 360) % 360;
      const diff = Math.min(eff, 360 - eff);
      if (diff < bestDiff) { bestDiff = diff; bestI = i; }
      cell.classList.remove('is-front');
    });
    cells[bestI].classList.add('is-front');
  }

  function render() {
    ring.style.transform = `rotateY(${angle}deg)`;
    markFrontCell();
  }

  // ── Auto-rotate khi rảnh tay (rAF loop) ──
  const AUTO_SPEED = 0.045; // độ/khung hình — chậm rãi, không gây rối mắt
  const FRICTION = 0.94;    // hệ số giảm dần quán tính sau khi thả tay

  function tick() {
    if (!dragging) {
      if (Math.abs(velocity) > 0.01) {
        angle += velocity;
        velocity *= FRICTION;
      } else if (!hovering && !reduceMotion) {
        angle += AUTO_SPEED;
      }
      render();
    }
    requestAnimationFrame(tick);
  }

  // ── Kéo để xoay (Pointer Events — dùng chung chuột + cảm ứng) ──
  function onPointerDown(e) {
    dragging = true;
    velocity = 0;
    lastX = e.clientX;
    lastMoveT = performance.now();
    root.classList.add('is-dragging');
    stage.setPointerCapture?.(e.pointerId);
  }
  function onPointerMove(e) {
    if (!dragging) return;
    const now = performance.now();
    const dx = e.clientX - lastX;
    const dt = Math.max(1, now - lastMoveT);
    const dAngle = dx * 0.35; // độ nhạy kéo
    angle += dAngle;
    velocity = dAngle * (16 / dt); // quy về ~độ/khung hình 60fps để quán tính mượt
    lastX = e.clientX;
    lastMoveT = now;
    render();
  }
  function onPointerUp(e) {
    if (!dragging) return;
    dragging = false;
    root.classList.remove('is-dragging');
    stage.releasePointerCapture?.(e.pointerId);
  }

  stage.addEventListener('pointerdown', onPointerDown);
  stage.addEventListener('pointermove', onPointerMove);
  stage.addEventListener('pointerup', onPointerUp);
  stage.addEventListener('pointercancel', onPointerUp);
  stage.addEventListener('pointerleave', () => { hovering = false });
  stage.addEventListener('pointerenter', () => { hovering = true });

  window.addEventListener('resize', computeRadius);

  // ── QUAN TRỌNG (bug màn hẹp): ở ≤900px, #lobby-left mặc định
  // display:none (chỉ hiện khi bấm tab "🎓 Giới thiệu" — xem
  // setLobbyView() trong js/main.js), nên lúc DOMContentLoaded chạy
  // computeRadius() lần đầu, cells[0] có bề rộng = 0 (đang ẩn) →
  // radius tính ra = 0 → CẢ 6 panel chồng khít lên đúng 1 điểm giữa
  // (không hở ra theo vòng tròn), nhìn như chữ nhiều card "lem" đè
  // lên nhau. window 'resize' không bắn khi displayːnone→flex (đâu
  // có đổi kích thước viewport), nên phải dùng ResizeObserver theo
  // dõi thẳng chính ô carousel — nó bắn lại đúng lúc ô đổi từ 0 sang
  // kích thước thật khi panel được hiện ra, và cả khi resize/xoay
  // màn hình sau đó.
  if (window.ResizeObserver) {
    const ro = new ResizeObserver(() => computeRadius());
    ro.observe(cells[0]);
  } else {
    // Trình duyệt cũ không có ResizeObserver: tính lại mỗi khi người
    // dùng chuyển tab Giới thiệu ⇄ Làm bài (đủ cho trường hợp phổ
    // biến nhất gây ra bug, dù không bắt hết mọi thay đổi kích thước).
    document.getElementById('toggleIntroBtn')?.addEventListener('click', () => {
      requestAnimationFrame(computeRadius);
    });
  }

  computeRadius();
  render();
  requestAnimationFrame(tick);
});
