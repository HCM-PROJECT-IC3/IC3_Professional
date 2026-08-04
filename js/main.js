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

/* ── Tilt nhẹ cho thẻ mockup nổi ở lobby-left theo vị trí chuột
   (chỉ ở #lobby-left, không ảnh hưởng form bên phải). Bỏ qua trên
   thiết bị cảm ứng (không có mousemove liên tục) và khi người dùng
   bật "giảm chuyển động" (prefers-reduced-motion). */
document.addEventListener('DOMContentLoaded', () => {
  const zone = document.querySelector('.lobby-left');
  const card = document.getElementById('lobbyMockup');
  if (!zone || !card) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (window.matchMedia('(hover: none)').matches) return; // thiết bị cảm ứng

  zone.addEventListener('mousemove', (e) => {
    const r = zone.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;   // 0..1
    const py = (e.clientY - r.top) / r.height;   // 0..1
    const rx = (py - .5) * -10;  // rotateX
    const ry = (px - .5) * 14;   // rotateY
    card.style.transform = `rotate(-4deg) rotateX(${rx}deg) rotateY(${ry}deg)`;
  });
  zone.addEventListener('mouseleave', () => {
    card.style.transform = 'rotate(-4deg)';
  });
});

