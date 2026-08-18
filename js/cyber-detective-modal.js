/* ========================================
   GAME MODAL (Cyber Detective mini-game)
   Nhúng cyber-detective.html qua iframe dạng modal overlay, giống hệt
   js/battle-quiz-modal.js / js/pz-defense-modal.js — chỉ đổi id để
   dùng song song với các mini-game sẵn có.

   Yêu cầu markup có sẵn trong HTML (dùng chung style .game-modal-*
   trong style.css):
     - #openCyberDetectiveBtn        nút mở
     - #cyberDetectiveModalOverlay   lớp phủ + khung modal
     - #closeCyberDetectiveModalBtn  nút đóng bên trong modal
     - #cyberDetectiveModalFrame     <iframe data-src="cyber-detective.html">, lazy-load
   ======================================== */
(function () {
  function init() {
    var openBtn = document.getElementById('openCyberDetectiveBtn');
    var overlay = document.getElementById('cyberDetectiveModalOverlay');
    var closeBtn = document.getElementById('closeCyberDetectiveModalBtn');
    var frame = document.getElementById('cyberDetectiveModalFrame');
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
