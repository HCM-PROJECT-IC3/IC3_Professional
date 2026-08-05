/* index.html — script khởi tạo trang (tách từ inline <script>) */

// Hiển thị dải XP/Streak/Huy hiệu ngay khi trang tải xong
document.addEventListener('DOMContentLoaded', () => {
  if (window.EduGamification) EduGamification.renderInto('#lobbyGameStrip');
});

/* ── Toggle Giới thiệu ⇄ Form (chỉ có tác dụng thấy được khi #lobby
   thu về 1 cột ở màn hẹp ≤900px — xem media query trong style.css).
   Ở màn rộng, cả 2 khối luôn hiện song song nên toggle bị ẩn và hàm
   này chỉ đổi class/aria, không ảnh hưởng gì tới layout. Trạng thái
   được nhớ lại bằng localStorage để khỏi phải bấm lại mỗi lần quay
   lại trang (theo đúng khuôn mẫu try/catch của ic3_sidebar_collapsed
   trong js/quiz-engine.js). */
function setLobbyView(view) {
  const lobby = document.getElementById('lobby');
  if (!lobby) return;
  const showIntro = view === 'intro';
  lobby.classList.toggle('show-intro', showIntro);

  const introBtn = document.getElementById('toggleIntroBtn');
  const formBtn  = document.getElementById('toggleFormBtn');
  introBtn?.classList.toggle('active', showIntro);
  formBtn?.classList.toggle('active', !showIntro);
  introBtn?.setAttribute('aria-selected', String(showIntro));
  formBtn?.setAttribute('aria-selected', String(!showIntro));

  try { localStorage.setItem('ic3_lobby_view', showIntro ? 'intro' : 'form'); }
  catch (e) { /* localStorage có thể bị chặn — bỏ qua, không ảnh hưởng chức năng */ }
}

document.addEventListener('DOMContentLoaded', () => {
  let saved = 'form';
  try { saved = localStorage.getItem('ic3_lobby_view') || 'form'; }
  catch (e) { /* ignore */ }
  setLobbyView(saved);
});

/* ── Bàn phím 3D nổi ở lobby-left: nghiêng nhẹ theo vị trí chuột +
   KÉO (pointerdown/move) để xoay quanh trục Z không giới hạn, giống
   hint "Kéo để xoay · di chuột để nghiêng" hiển thị dưới bàn phím.
   Bỏ qua khi người dùng bật "giảm chuyển động" (prefers-reduced-motion) —
   góc nghỉ mặc định (khớp với style.css) vẫn giữ nguyên, chỉ tắt phần
   tương tác động. */
document.addEventListener('DOMContentLoaded', () => {
  const scene = document.getElementById('kbScene');
  const board = document.getElementById('kbBoard');
  if (!scene || !board) return;

  const BASE_RX = 54, BASE_RZ = -36; // khớp giá trị rotateX/rotateZ mặc định trong CSS (.kb-board)
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) return;

  let hoverRX = 0, hoverRY = 0;
  let dragZ = 0;
  let dragging = false;
  let lastX = 0;

  function render() {
    board.style.transform =
      `rotateX(${BASE_RX + hoverRX}deg) rotateZ(${BASE_RZ + dragZ}deg) rotateY(${hoverRY}deg)`;
  }

  if (window.matchMedia('(hover: hover)').matches) {
    scene.addEventListener('mousemove', (e) => {
      if (dragging) return;
      const r = scene.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width;  // 0..1
      const py = (e.clientY - r.top) / r.height;  // 0..1
      hoverRX = (py - .5) * -10;
      hoverRY = (px - .5) * 16;
      render();
    });
    scene.addEventListener('mouseleave', () => {
      hoverRX = 0; hoverRY = 0;
      render();
    });
  }

  scene.addEventListener('pointerdown', (e) => {
    dragging = true;
    lastX = e.clientX;
    scene.classList.add('is-dragging');
    try { scene.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  });
  scene.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    dragZ += (e.clientX - lastX) * .35;
    lastX = e.clientX;
    render();
  });
  function stopDrag(e) {
    if (!dragging) return;
    dragging = false;
    scene.classList.remove('is-dragging');
    try { scene.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  }
  scene.addEventListener('pointerup', stopDrag);
  scene.addEventListener('pointercancel', stopDrag);
});

/* ── Hiệu ứng "đang gõ" trên màn hình mini phía trên bàn phím: lặp
   qua các dòng code ngắn/phím tắt, gõ dần từng ký tự rồi xoá đi gõ
   dòng tiếp theo (typewriter loop). Nếu người dùng bật "giảm chuyển
   động" thì chỉ hiện tĩnh dòng đầu tiên, không chạy hiệu ứng. */
document.addEventListener('DOMContentLoaded', () => {
  const el = document.getElementById('kbTyped');
  if (!el) return;

  const LINES = [
    'Ctrl + C  → Sao chép',
    'Ctrl + V  → Dán',
    'Ctrl + Z  → Hoàn tác',
    'Ctrl + S  → Lưu tệp',
    'print("Xin chào IC3!")',
    'function hocTot() { return true; }',
    'Ctrl + A  → Chọn tất cả',
    'Ctrl + P  → In tài liệu',
  ];

  // Map mỗi ký tự (chữ cái) sang đúng phím vật lý trên bàn phím 3D để
  // flash neon theo — xem flashKey() bên dưới. Phím khoảng trắng (dài,
  // đang ghi "IC3 · GS6") dùng riêng cho ký tự dấu cách.
  const keyEls = {};
  document.querySelectorAll('#kbBoard .kb-key').forEach((k) => {
    const label = (k.textContent || '').trim();
    if (label.length === 1) keyEls[label.toUpperCase()] = k;
  });
  const spaceKeyEl = document.querySelector('#kbBoard .kb-space');
  const flashTimers = new WeakMap();

  function flashKey(ch) {
    if (!ch) return;
    const targetEl = ch === ' ' ? spaceKeyEl : keyEls[ch.toUpperCase()];
    if (!targetEl) return; // ký tự không có trên bàn phím rút gọn (số, dấu câu...) → bỏ qua
    targetEl.classList.add('kb-key-press');
    clearTimeout(flashTimers.get(targetEl));
    flashTimers.set(targetEl, setTimeout(() => targetEl.classList.remove('kb-key-press'), 170));
  }

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    el.textContent = LINES[0];
    return;
  }

  let lineIndex = 0, charIndex = 0, deleting = false;

  function tick() {
    const full = LINES[lineIndex];
    if (!deleting) {
      charIndex++;
      el.textContent = full.slice(0, charIndex);
      flashKey(full[charIndex - 1]); // đúng ký tự vừa gõ ra màn hình
      if (charIndex >= full.length) {
        deleting = true;
        setTimeout(tick, 1400); // dừng lại cho đọc trước khi xoá
        return;
      }
      setTimeout(tick, 55 + Math.random() * 45);
    } else {
      charIndex--;
      el.textContent = full.slice(0, charIndex);
      if (charIndex <= 0) {
        deleting = false;
        lineIndex = (lineIndex + 1) % LINES.length;
        setTimeout(tick, 350);
        return;
      }
      setTimeout(tick, 22);
    }
  }
  tick();
});

