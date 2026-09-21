/* ============================================================
   js/services/lazy-script-loader.js
   Tải <script> theo yêu cầu (khi người dùng thật sự bấm 1 nút cần đến
   nó), thay vì chặn render trang ngay từ đầu — dùng cho các thư viện
   NẶNG chỉ cần khi xuất file (ExcelJS ~950KB, jsPDF+font ~1.3MB...):
   trước đây các trang Dashboard nạp tất cả các file này ngay trong
   <head>/cuối <body> KHÔNG có "defer", chặn render ngay cả khi người
   dùng chỉ vào xem KPI/biểu đồ, không bấm "Xuất Excel/PDF" bao giờ.

   Tải TUẦN TỰ đúng theo thứ tự mảng truyền vào (1 số thư viện phụ
   thuộc thứ tự, vd jspdf.plugin.autotable.min.js cần jspdf load trước)
   — và CACHE lại theo src để gọi lại nhiều lần (vd bấm Xuất Excel 2
   lần) không tải lại/không chèn trùng thẻ <script>.
   ============================================================ */
(function (global) {
  'use strict';

  const loaded = new Set();  // src đã tải xong
  const pending = new Map(); // src -> Promise đang tải dở

  function loadOne(src) {
    if (loaded.has(src)) return Promise.resolve();
    if (pending.has(src)) return pending.get(src);
    const p = new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = src;
      el.onload = () => { loaded.add(src); pending.delete(src); resolve(); };
      el.onerror = () => { pending.delete(src); reject(new Error('Không tải được: ' + src)); };
      document.body.appendChild(el);
    });
    pending.set(src, p);
    return p;
  }

  /** Tải tuần tự từng src trong mảng (giữ đúng thứ tự phụ thuộc). */
  async function loadScripts(srcs) {
    for (const src of srcs) await loadOne(src);
  }

  global.EduLazyLoad = { loadScripts };
})(window);
