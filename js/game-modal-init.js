/* ============================================================
   js/game-modal-init.js — khai báo các modal iframe của index.html
   (js/game-modal.js). Tách khỏi khối <script> nội tuyến để dùng được
   `defer` (chạy đúng thứ tự, sau game-modal.js).
   7 mini-game của Khu Vui Chơi cũ nay chơi trong Đấu trường
   (arena.html?vai=minigame); ở đây chỉ còn "Giải lao: Chim Vượt Ải" (mở
   bằng openMarioFlappyReward() của quiz-engine.js — không có nút mở riêng,
   chỉ cần nút Đóng). Ôn luyện MOS nay là trang riêng mos/index.html (nút #openMosReviewBtn).
   ============================================================ */
initGameModal({ openBtnId: 'openMarioFlappyBtn', overlayId: 'marioFlappyModalOverlay', closeBtnId: 'closeMarioFlappyModalBtn', frameId: 'marioFlappyModalFrame' });
