/* ========================================
   GAME MODAL (Prism Cascade mini-game)
   Nhúng game.html qua iframe dạng modal overlay, cùng pattern với
   js/shelf-modal.js (Kệ sách 3D) — không đụng vào layout sẵn có
   của trang.

   Yêu cầu markup có sẵn trong HTML (xem style.css phần "GAME
   MODAL" để biết style tương ứng):
     - #openGameBtn        nút mở
     - #gameModalOverlay   lớp phủ + khung modal
     - #closeGameModalBtn  nút đóng bên trong modal
     - #gameModalFrame     <iframe data-src="game.html">, lazy-load
   ======================================== */
(function () {
  function init() {
    var openBtn = document.getElementById('openGameBtn');
    var overlay = document.getElementById('gameModalOverlay');
    var closeBtn = document.getElementById('closeGameModalBtn');
    var frame = document.getElementById('gameModalFrame');
    if (!openBtn || !overlay) return;

    function openGame() {
      // Nạp lại iframe mỗi lần mở để ván chơi luôn bắt đầu mới
      // (khác Shelf Modal — game thì nên "chơi lại từ đầu" mỗi lần mở).
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
