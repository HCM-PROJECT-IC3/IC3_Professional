import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { router } from '@/app/router';
import '@/styles/globals.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);

/* Offline: đăng ký CHÍNH sw.js của trang cũ, CÙNG phạm vi gốc (như js/sw-register.js: 'sw.js' + scope './'
   tính từ gốc) — trình duyệt coi là 1 service worker duy nhất, không tạo bản thứ 2. Nhờ vậy máy CHỈ mở app 2.0
   (chưa từng mở sảnh cũ) vẫn dùng được khi mất mạng sau lần mở đầu. Đăng ký sau 'load' để không tranh băng thông.
   Kiểm thử: tests/e2e/suites/offline.mjs (tắt hẳn máy chủ rồi mở lại). */
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('../sw.js', { scope: '../' }).catch((err: Error) => {
      console.warn('[IC3 2.0] Không đăng ký được Service Worker (trang vẫn chạy bình thường):', err?.message);
    });
  });
}
