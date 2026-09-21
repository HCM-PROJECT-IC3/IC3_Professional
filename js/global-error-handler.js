/* ============================================================
   js/global-error-handler.js
   Bắt lỗi TOÀN CỤC (window.onerror + unhandledrejection) cho trang
   chính (index.html) — trước đây KHÔNG có gì bắt các lỗi này: 1 lỗi
   JS chưa bắt ở bất kỳ đâu trong quiz-engine.js/gamification.js/...
   có thể để trang ở trạng thái treo/trắng mà học sinh không biết phải
   làm gì (đặc biệt nghiêm trọng nếu xảy ra GIỮA LÚC làm bài kiểm tra).

   KHÔNG ảnh hưởng tới các mini-game/Ribbon simulator chạy trong
   <iframe> (js/game-modal.js) — lỗi bên trong 1 iframe vốn KHÔNG bao
   giờ bubble ra window cha (mỗi iframe có global scope riêng), nên 1
   mini-game hỏng đã sẵn không làm sập được trang chính; file này chỉ
   lo phần code chạy TRỰC TIẾP trên trang chính.

   Nạp file này CÀNG SỚM CÀNG TỐT trong <head>/đầu <body> — để bắt được
   cả lỗi xảy ra trong lúc CÁC SCRIPT KHÁC còn đang khởi tạo.
   ============================================================ */
(function () {
  'use strict';

  var shown = false; // chỉ hiện màn hình lỗi 1 LẦN — nhiều lỗi dồn dập không hiện chồng nhiều overlay

  function showErrorScreen(detail) {
    console.error('[EduQuiz] Lỗi chưa bắt được:', detail);
    if (shown) return;
    shown = true;

    var overlay = document.createElement('div');
    overlay.id = 'eduGlobalErrorOverlay';
    overlay.setAttribute('style', [
      'position:fixed', 'inset:0', 'z-index:2147483647',
      'background:rgba(15,20,30,.92)', 'color:#fff',
      'display:flex', 'align-items:center', 'justify-content:center',
      'padding:24px', 'font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif',
      'text-align:center'
    ].join(';'));

    // Nội dung do CHÍNH code tạo ra (không có input tự do từ học sinh) —
    // vẫn dùng textContent cho phần thông điệp để chắc chắn an toàn.
    var card = document.createElement('div');
    card.setAttribute('style', 'max-width:480px;background:#1b2030;border-radius:16px;padding:28px 24px;box-shadow:0 20px 60px rgba(0,0,0,.5);');

    var title = document.createElement('div');
    title.style.cssText = 'font-size:1.3rem;font-weight:800;margin-bottom:10px;';
    title.textContent = '⚠️ Trang gặp sự cố ngoài ý muốn';
    card.appendChild(title);

    var msg = document.createElement('p');
    msg.style.cssText = 'line-height:1.6;opacity:.9;margin:0 0 20px;';
    msg.textContent = 'Nếu bạn đang làm bài kiểm tra, tiến độ (đáp án, thời gian còn lại) đã được tự động lưu — bấm "Tải lại trang" bên dưới để tiếp tục làm bài từ đúng chỗ đang dở, không cần lo mất bài.';
    card.appendChild(msg);

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = '🔄 Tải lại trang';
    btn.style.cssText = 'background:#4f6bff;color:#fff;border:none;padding:12px 28px;border-radius:10px;font-weight:700;font-size:1rem;cursor:pointer;';
    btn.addEventListener('click', function () { location.reload(); });
    card.appendChild(btn);

    overlay.appendChild(card);
    (document.body || document.documentElement).appendChild(overlay);
  }

  window.addEventListener('error', function (e) {
    // Bỏ qua lỗi tải tài nguyên (ảnh/script 404...) — e.error chỉ tồn tại
    // với lỗi JS thật (ReferenceError, TypeError...), không phải lỗi
    // "resource failed to load" (những lỗi đó cũng bắn 'error' nhưng
    // không có stack/message hữu ích và KHÔNG làm hỏng luồng JS).
    if (!e.error && !e.message) return;
    showErrorScreen({ type: 'error', message: e.message, filename: e.filename, lineno: e.lineno, stack: e.error && e.error.stack });
  });

  window.addEventListener('unhandledrejection', function (e) {
    var reason = e.reason;
    showErrorScreen({ type: 'unhandledrejection', message: reason && reason.message || String(reason), stack: reason && reason.stack });
  });
})();
