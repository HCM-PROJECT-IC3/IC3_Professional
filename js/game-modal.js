/* ========================================
   GAME MODAL (factory dùng chung)
   Thay thế 10 file js/*-modal.js cũ (battle-quiz, billiards,
   computer-simulator, cyber-detective, memory-game, prism-cascade,
   pz-defense, shelf, sudoku, word-simulator) — tất cả đều nhúng 1 trang
   con qua <iframe> dạng modal overlay và chỉ khác nhau ở id DOM +
   hành vi "reset mỗi lần mở" hay "giữ nguyên trạng thái" (persist).

   Cách dùng — gọi initGameModal(...) một lần cho mỗi modal, truyền vào
   4 id DOM (giống hệt id đã dùng trong các file cũ) + tuỳ chọn persist:

     initGameModal({
       openBtnId:  'openBattleQuizBtn',
       overlayId:  'battleQuizModalOverlay',
       closeBtnId: 'closeBattleQuizModalBtn',
       frameId:    'battleQuizModalFrame'
       // persist: true  → KHÔNG nạp lại iframe nếu đã có src, và KHÔNG
       //   trả về about:blank khi đóng (giữ tiến độ/localStorage của
       //   iframe). Dùng cho "Kệ sách 3D" (shelf) & MOS Word Simulator.
       // persist: false (mặc định) → nạp lại iframe mỗi lần mở (ván
       //   chơi luôn bắt đầu mới) và giải phóng iframe khi đóng.
     });

   Yêu cầu markup có sẵn trong HTML (dùng chung style .game-modal-*
   trong style.css / css tương ứng của từng trang):
     - #<openBtnId>    nút mở
     - #<overlayId>    lớp phủ + khung modal
     - #<closeBtnId>   nút đóng bên trong modal
     - #<frameId>      <iframe data-src="...">, lazy-load
   ======================================== */
(function (global) {
  function initGameModal(opts) {
    function run() {
      var openBtn = document.getElementById(opts.openBtnId);
      var overlay = document.getElementById(opts.overlayId);
      var closeBtn = document.getElementById(opts.closeBtnId);
      var frame = document.getElementById(opts.frameId);
      if (!openBtn || !overlay) return;

      function openModal() {
        if (frame && frame.dataset.src) {
          if (opts.persist) {
            // Chỉ nạp iframe ở lần mở đầu tiên (lazy) để giữ tiến độ.
            if (frame.getAttribute('src') === 'about:blank' || !frame.getAttribute('src')) {
              frame.setAttribute('src', frame.dataset.src);
            }
          } else {
            // Nạp lại iframe mỗi lần mở để ván chơi luôn bắt đầu mới.
            frame.setAttribute('src', frame.dataset.src);
          }
        }
        overlay.classList.add('show');
        document.body.style.overflow = 'hidden';
      }

      function closeModal() {
        overlay.classList.remove('show');
        document.body.style.overflow = '';
        if (frame && !opts.persist) {
          // Giải phóng iframe khi đóng để dừng hẳn game (không chạy ngầm).
          frame.setAttribute('src', 'about:blank');
        }
      }

      openBtn.addEventListener('click', openModal);
      if (closeBtn) closeBtn.addEventListener('click', closeModal);

      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) closeModal();
      });

      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && overlay.classList.contains('show')) closeModal();
      });
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', run);
    } else {
      run();
    }
  }

  global.initGameModal = initGameModal;
})(window);
