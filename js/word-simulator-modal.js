/* ========================================
   MOS WORD SIMULATOR MODAL
   Nhúng word-simulator.html qua iframe dạng modal overlay, giống hệt
   js/pz-defense-modal.js / js/billiards-modal.js — chỉ đổi id.

   Yêu cầu markup có sẵn trong HTML (dùng chung style .game-modal-*
   trong style.css):
     - #openWordSimBtn        nút mở
     - #wordSimModalOverlay   lớp phủ + khung modal
     - #closeWordSimModalBtn  nút đóng bên trong modal
     - #wordSimModalFrame     <iframe data-src="word-simulator.html">, lazy-load
   ======================================== */
(function () {
  function init() {
    var openBtn = document.getElementById('openWordSimBtn');
    var overlay = document.getElementById('wordSimModalOverlay');
    var closeBtn = document.getElementById('closeWordSimModalBtn');
    var frame = document.getElementById('wordSimModalFrame');
    if (!openBtn || !overlay) return;

    function openTool() {
      // KHÔNG nạp lại iframe nếu đã có src (giữ tiến độ ws_progress_v1 trong
      // localStorage của iframe khi đóng/mở lại trong cùng phiên).
      if (frame && frame.dataset.src && frame.getAttribute('src') === 'about:blank') {
        frame.setAttribute('src', frame.dataset.src);
      }
      overlay.classList.add('show');
      document.body.style.overflow = 'hidden';
    }

    function closeTool() {
      overlay.classList.remove('show');
      document.body.style.overflow = '';
    }

    openBtn.addEventListener('click', openTool);
    if (closeBtn) closeBtn.addEventListener('click', closeTool);

    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeTool();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && overlay.classList.contains('show')) closeTool();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
