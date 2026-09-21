/* ============================================================
   js/game-modal-init.js
   Trước đây là 1 khối <script> NỘI TUYẾN (inline) ngay sau
   js/game-modal.js trong index.html — tách ra thành file NGOÀI riêng để
   có thể đánh dấu `defer` giống mọi script khác (đợt tối ưu Lighthouse
   Performance).

   LÝ DO PHẢI TÁCH RA (không thể chỉ bọc inline bằng DOMContentLoaded):
   script `defer` chạy THEO ĐÚNG THỨ TỰ khai báo, nhưng CHỈ SAU KHI toàn
   bộ document parse xong — và tất cả script defer đều chạy XONG HẾT rồi
   `DOMContentLoaded` MỚI bắn. Nếu để nguyên dạng inline (không có `src`
   nên trình duyệt bỏ qua `defer`, luôn chạy NGAY tại vị trí lúc parse)
   rồi bọc nó trong `document.addEventListener('DOMContentLoaded', ...)`,
   thứ tự sẽ bị ĐẢO NGƯỢC: js/game-zone-gate.js (defer, chạy TRƯỚC khi
   DOMContentLoaded bắn) sẽ chạy TRƯỚC initGameModal() ở đây (giờ mới
   chạy SAU khi DOMContentLoaded bắn) — trong khi game-zone-gate.js cần
   các listener mở-game riêng (do initGameModal gắn) đã tồn tại SẴN để
   nó gắn thêm listener "đóng hub khi chọn 1 game" lên trên. Tách thành
   file ngoài + defer thì thứ tự tương đối với game-modal.js (trước) và
   game-zone-gate.js (sau) được giữ ĐÚNG như bản gốc.
   ============================================================ */
initGameModal({ openBtnId: 'openGameBtn', overlayId: 'gameModalOverlay', closeBtnId: 'closeGameModalBtn', frameId: 'gameModalFrame' }); // Prism Cascade
initGameModal({ openBtnId: 'openMemoryGameBtn', overlayId: 'memoryGameModalOverlay', closeBtnId: 'closeMemoryGameModalBtn', frameId: 'memoryGameModalFrame' });
initGameModal({ openBtnId: 'openSudokuBtn', overlayId: 'sudokuModalOverlay', closeBtnId: 'closeSudokuModalBtn', frameId: 'sudokuModalFrame' });
initGameModal({ openBtnId: 'openBilliardsBtn', overlayId: 'billiardsModalOverlay', closeBtnId: 'closeBilliardsModalBtn', frameId: 'billiardsModalFrame' });
initGameModal({ openBtnId: 'openPzDefenseBtn', overlayId: 'pzDefenseModalOverlay', closeBtnId: 'closePzDefenseModalBtn', frameId: 'pzDefenseModalFrame' });
initGameModal({ openBtnId: 'openBattleQuizBtn', overlayId: 'battleQuizModalOverlay', closeBtnId: 'closeBattleQuizModalBtn', frameId: 'battleQuizModalFrame' });
initGameModal({ openBtnId: 'openCyberDetectiveBtn', overlayId: 'cyberDetectiveModalOverlay', closeBtnId: 'closeCyberDetectiveModalBtn', frameId: 'cyberDetectiveModalFrame' });
initGameModal({ openBtnId: 'openComputerSimBtn', overlayId: 'computerSimModalOverlay', closeBtnId: 'closeComputerSimModalBtn', frameId: 'computerSimModalFrame' });
initGameModal({ openBtnId: 'openWordSimBtn', overlayId: 'wordSimModalOverlay', closeBtnId: 'closeWordSimModalBtn', frameId: 'wordSimModalFrame', persist: true }); // giữ tiến độ ws_progress_v1
initGameModal({ openBtnId: 'openExcelSimBtn', overlayId: 'excelSimModalOverlay', closeBtnId: 'closeExcelSimModalBtn', frameId: 'excelSimModalFrame', persist: true }); // giữ tiến độ xs_progress_v1
initGameModal({ openBtnId: 'openPptSimBtn', overlayId: 'pptSimModalOverlay', closeBtnId: 'closePptSimModalBtn', frameId: 'pptSimModalFrame', persist: true }); // giữ tiến độ ps_progress_v1
