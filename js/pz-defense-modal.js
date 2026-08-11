/* ========================================
   GAME MODAL (Phòng Thủ Dữ Liệu mini-game)
   Nhúng pz-defense.html qua iframe dạng modal overlay, giống hệt
   js/billiards-modal.js / js/sudoku-modal.js / js/memory-game-modal.js
   / js/prism-cascade-modal.js — chỉ đổi id để dùng song song với
   các mini-game sẵn có.

   Yêu cầu markup có sẵn trong HTML (dùng chung style .game-modal-*
   trong style.css):
     - #openPzDefenseBtn        nút mở
     - #pzDefenseModalOverlay   lớp phủ + khung modal
     - #closePzDefenseModalBtn  nút đóng bên trong modal
     - #pzDefenseModalFrame     <iframe data-src="pz-defense.html">, lazy-load
   ======================================== */
(function () {
  function init() {
    var openBtn = document.getElementById('openPzDefenseBtn');
    var overlay = document.getElementById('pzDefenseModalOverlay');
    var closeBtn = document.getElementById('closePzDefenseModalBtn');
    var frame = document.getElementById('pzDefenseModalFrame');
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
