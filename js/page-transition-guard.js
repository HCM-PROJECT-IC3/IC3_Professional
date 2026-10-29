/* ============================================================
   js/page-transition-guard.js — nạp ĐẦU <head> mọi trang có css/theme.css
   Hiệu ứng chuyển trang (@view-transition trong css/theme.css) hay bị trình duyệt huỷ giữa
   chừng — trang quản trị ẩn <body> tới khi đăng nhập xong, trang tự chuyển hướng ngay khi
   mở... → Promise của nó bị từ chối mà không ai bắt: console báo "InvalidStateError:
   Transition was aborted", còn index.html / mos-practice.html (js/global-error-handler.js)
   từng hiện cả màn hình "Trang gặp sự cố" cho học sinh (Chrome headless, 29/10/2026).
   Phải chạy TRƯỚC lần vẽ đầu tiên (sự kiện pagereveal) nên là script đồng bộ trong <head>.
   ============================================================ */
window.addEventListener('pagereveal', function (e) {
  var vt = e.viewTransition;
  if (!vt) return;
  ['ready', 'finished', 'updateCallbackDone'].forEach(function (k) {
    if (vt[k] && vt[k].catch) vt[k].catch(function () { /* huỷ hiệu ứng: vô hại */ });
  });
});
