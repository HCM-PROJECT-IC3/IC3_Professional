/* ========================================
   GAME MODAL (Battle Quiz mini-game)
   Nhúng battle-quiz.html qua iframe dạng modal overlay, giống hệt
   js/billiards-modal.js / js/pz-defense-modal.js — chỉ đổi id để
   dùng song song với các mini-game sẵn có.

   Yêu cầu markup có sẵn trong HTML (dùng chung style .game-modal-*
   trong style.css):
     - #openBattleQuizBtn        nút mở
     - #battleQuizModalOverlay   lớp phủ + khung modal
     - #closeBattleQuizModalBtn  nút đóng bên trong modal
     - #battleQuizModalFrame     <iframe data-src="battle-quiz.html">, lazy-load
   ======================================== */
(function () {
  function init() {
    var openBtn = document.getElementById('openBattleQuizBtn');
    var overlay = document.getElementById('battleQuizModalOverlay');
    var closeBtn = document.getElementById('closeBattleQuizModalBtn');
    var frame = document.getElementById('battleQuizModalFrame');
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
