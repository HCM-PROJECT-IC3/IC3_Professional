/* ========================================
   GAME MODAL (Trí Nhớ Thiết Bị & Phần Mềm mini-game)
   Nhúng memory-game.html qua iframe dạng modal overlay, giống
   hệt js/prism-cascade-modal.js — chỉ đổi id để dùng song song
   với mini-game Prism Cascade sẵn có.

   Yêu cầu markup có sẵn trong HTML (dùng chung style .game-modal-*
   trong style.css):
     - #openMemoryGameBtn        nút mở
     - #memoryGameModalOverlay   lớp phủ + khung modal
     - #closeMemoryGameModalBtn  nút đóng bên trong modal
     - #memoryGameModalFrame     <iframe data-src="memory-game.html">, lazy-load
   ======================================== */
(function () {
  function init() {
    var openBtn = document.getElementById('openMemoryGameBtn');
    var overlay = document.getElementById('memoryGameModalOverlay');
    var closeBtn = document.getElementById('closeMemoryGameModalBtn');
    var frame = document.getElementById('memoryGameModalFrame');
    if (!openBtn || !overlay) return;

    function openGame() {
      // Nạp lại iframe mỗi lần mở để ván chơi luôn bắt đầu mới.
      if (frame && frame.dataset.src) {
        frame.setAttribute('src', frame.dataset.src);
      }
      overlay.classList.add('show');
      document.body.style.overflow = 'hidden';
    }

    function closeGame() {
      overlay.classList.remove('show');
      document.body.style.overflow = '';
      // Giải phóng iframe khi đóng để dừng hẳn game (không chạy ngầm).
      if (frame) frame.setAttribute('src', 'about:blank');
    }

    openBtn.addEventListener('click', openGame);
    if (closeBtn) closeBtn.addEventListener('click', closeGame);

    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeGame();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && overlay.classList.contains('show')) closeGame();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
