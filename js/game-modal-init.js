/* ============================================================
   js/game-modal-init.js — khai báo các modal iframe của index.html
   (js/game-modal.js). Tách khỏi khối <script> nội tuyến để dùng được
   `defer` (chạy đúng thứ tự, sau game-modal.js).
   7 mini-game của Khu Vui Chơi cũ nay chơi trong Đấu trường
   (arena.html?vai=minigame); ở đây chỉ còn "Giải lao: Chim Vượt Ải" (mở
   bằng openMarioFlappyReward() của quiz-engine.js — không có nút mở riêng,
   chỉ cần nút Đóng) và 3 trình mô phỏng Word/Excel/PowerPoint.
   ============================================================ */
initGameModal({ openBtnId: 'openMarioFlappyBtn', overlayId: 'marioFlappyModalOverlay', closeBtnId: 'closeMarioFlappyModalBtn', frameId: 'marioFlappyModalFrame' });
initGameModal({ openBtnId: 'openWordSimBtn', overlayId: 'wordSimModalOverlay', closeBtnId: 'closeWordSimModalBtn', frameId: 'wordSimModalFrame', persist: true }); // giữ tiến độ ws_progress_v1
initGameModal({ openBtnId: 'openExcelSimBtn', overlayId: 'excelSimModalOverlay', closeBtnId: 'closeExcelSimModalBtn', frameId: 'excelSimModalFrame', persist: true }); // giữ tiến độ xs_progress_v1
initGameModal({ openBtnId: 'openPptSimBtn', overlayId: 'pptSimModalOverlay', closeBtnId: 'closePptSimModalBtn', frameId: 'pptSimModalFrame', persist: true }); // giữ tiến độ ps_progress_v1
