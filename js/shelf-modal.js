/* ========================================
   3D SHELF MODAL (Kệ sách 3D) — dùng chung cho Dashboard Giáo viên
   (teacher-dashboard.html) & Dashboard Điều phối đào tạo
   (coordinator-dashboard.html).

   Mang trải nghiệm "Chế độ kệ sách 3D" (vốn chỉ có ở trang "Bộ đề của
   tôi" — ic3-dashboard.html, xem js/dashboard.js#toggleShelfView) ra
   thành 1 module độc lập, mở dạng modal overlay (không đụng tới layout
   KPI/biểu đồ/bảng sẵn có của 2 trang Dashboard).

   Yêu cầu markup có sẵn trong HTML (xem css/coordinator-dashboard.css
   phần "3D SHELF MODAL" để biết style tương ứng):
     - #openShelfBtn        nút mở (đặt trong .topbar)
     - #shelfModalOverlay   lớp phủ + khung modal
     - #closeShelfModalBtn  nút đóng bên trong modal
     - #shelfModalFrame     <iframe data-src="quiz-shelf.html">, lazy-load
   ======================================== */
(function () {
  function init() {
    var openBtn = document.getElementById('openShelfBtn');
    var overlay = document.getElementById('shelfModalOverlay');
    var closeBtn = document.getElementById('closeShelfModalBtn');
    var frame = document.getElementById('shelfModalFrame');
    if (!openBtn || !overlay) return;

    function openShelf() {
      // Chỉ nạp iframe ở lần mở đầu tiên (lazy) để không ảnh hưởng
      // tốc độ tải trang Dashboard.
      if (frame && frame.dataset.src && frame.getAttribute('src') === 'about:blank') {
        frame.setAttribute('src', frame.dataset.src);
      }
      overlay.classList.add('show');
      document.body.style.overflow = 'hidden';
    }

    function closeShelf() {
      overlay.classList.remove('show');
      document.body.style.overflow = '';
    }

    openBtn.addEventListener('click', openShelf);
    if (closeBtn) closeBtn.addEventListener('click', closeShelf);

    // Bấm ra ngoài khung modal (lên nền overlay) để đóng.
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeShelf();
    });

    // Phím Esc để đóng.
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && overlay.classList.contains('show')) closeShelf();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
