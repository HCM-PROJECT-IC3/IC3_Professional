/* ========================================
   GAME MODAL (Computer Simulator mini-game)
   Nhúng computer-simulator.html qua iframe dạng modal overlay, giống
   hệt js/cyber-detective-modal.js / js/battle-quiz-modal.js — chỉ đổi
   id để dùng song song với các mini-game sẵn có.

   Yêu cầu markup có sẵn trong HTML (dùng chung style .game-modal-*
   trong style.css):
     - #openComputerSimBtn        nút mở
     - #computerSimModalOverlay   lớp phủ + khung modal
     - #closeComputerSimModalBtn  nút đóng bên trong modal
     - #computerSimModalFrame     <iframe data-src="computer-simulator.html">, lazy-load
   ======================================== */
(function () {
  function init() {
    var openBtn = document.getElementById('openComputerSimBtn');
    var overlay = document.getElementById('computerSimModalOverlay');
    var closeBtn = document.getElementById('closeComputerSimModalBtn');
    var frame = document.getElementById('computerSimModalFrame');
    if (!openBtn || !overlay) return;

    function openGame() {
      if (frame && frame.dataset.src) {
        frame.setAttribute('src', frame.dataset.src);
      }
      overlay.classList.add('show');
      document.body.style.overflow = 'hidden';
    }

    function closeGame() {
      overlay.classList.remove('show');
      document.body.style.overflow = '';
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
