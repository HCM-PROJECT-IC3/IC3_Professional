/* index.html — script khởi tạo trang (tách từ inline <script>) */

// Hiển thị dải XP/Streak/Huy hiệu ngay khi trang tải xong
document.addEventListener('DOMContentLoaded', () => {
  if (window.EduGamification) EduGamification.renderInto('#lobbyGameStrip');
});

/* ── MOS Word/Excel/PowerPoint — nút luyện tập THẬT (Ribbon simulator hoặc
   nộp file chấm điểm) gắn NGAY TRONG form chọn bài, không phải trong Khu
   Vui Chơi (mini-game, có khoá điểm) — vì đây là nội dung ôn luyện chính,
   không phải giải trí. Chỉ hiện đúng 1 nút phù hợp với Cấp độ đang chọn khi
   Chương trình = MOS; các trường hợp khác ẩn cả 2. Gọi từ
   js/quiz-engine.js § refreshMeta() (chạy lại mỗi khi đổi Chương
   trình/Cấp độ, và ngay lần tải trang đầu tiên). */
function updateMosInlinePractice(catId, levelId) {
  const wordBtn = document.getElementById('openWordSimBtn');
  const practiceBtn = document.getElementById('openMosPracticeBtn');
  if (!wordBtn || !practiceBtn) return;

  const isMos = catId === 'MOS';
  wordBtn.hidden = !(isMos && levelId === 'Word');

  const practiceSubject = isMos && levelId === 'Excel' ? 'excel'
    : isMos && levelId === 'PowerPoint' ? 'powerpoint'
    : null;
  practiceBtn.hidden = !practiceSubject;
  if (practiceSubject) {
    // Truyền ?subject= để mos-practice.html tự cuộn/lọc đúng dự án của môn
    // đang chọn thay vì học sinh phải tự tìm trong danh sách — xem
    // js/mos-practice.js đọc URLSearchParams lúc khởi tạo.
    practiceBtn.href = `mos-practice.html?subject=${practiceSubject}`;
    practiceBtn.textContent = practiceSubject === 'excel'
      ? '📤 MOS Practice — Nộp bài Excel chấm điểm thật'
      : '📤 MOS Practice — Nộp bài PowerPoint chấm điểm thật';
  }
}
window.updateMosInlinePractice = updateMosInlinePractice;

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

/* ── Bàn phím 3D nổi ở lobby-left: từ bản này trở đi là scene WebGL
   thật (Three.js) sống trong js/keyboard-scene-3d.js — chuyện nghiêng
   theo chuột, KÉO để xoay, và "flash" phím theo ký tự gõ đều do module
   đó tự quản lý (nó tự nghe pointerdown/move trên #kbScene). File này
   chỉ còn giữ vòng lặp gõ chữ trên màn hình mini bên dưới. ── */

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

  // Bàn phím giờ là mesh WebGL (js/keyboard-scene-3d.js), không còn
  // phần tử DOM theo từng phím nữa, nên "flash" một ký tự = gọi API
  // window.KB3D.flashKey(ch) mà module đó gắn lên window sau khi dựng
  // xong scene. Nếu WebGL chưa kịp khởi tạo (hoặc lỗi/không hỗ trợ)
  // thì bỏ qua trong im lặng — không ảnh hưởng gì tới việc gõ chữ trên
  // màn hình mini bên trên.
  function flashKey(ch) {
    if (!ch) return;
    window.KB3D?.flashKey(ch);
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

