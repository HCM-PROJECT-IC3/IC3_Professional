import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// IC3 Professional 2.0 — build ra ../app/ để GitHub Pages phục vụ tại <site>/app/.
// • base './': đường dẫn tương đối → chạy được ở mọi tiền tố Pages (vd /IC3_Professional/app/)
//   và cả máy chủ trường (server/) mà không cần cấu hình lại.
// • Router dùng HashRouter (Pages không có SPA fallback) — xem src/app/router.tsx.
// • KHÔNG đụng file nào ngoài ../app/: emptyOutDir chỉ xoá trong outDir.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': r('./src'),
      // Domain cũ (IIFE thuần, gắn vào window) — chỉ import dạng side-effect, không sửa file.
      '@legacy': r('../js'),
    },
  },
  server: {
    port: 5173,
    // cho phép dev server đọc ../js (Domain cũ) và ../data (ngân hàng câu hỏi tĩnh)
    fs: { allow: [r('..')] },
  },
  build: {
    outDir: r('../app'),
    emptyOutDir: true,
    target: 'es2020',
    sourcemap: false,
    assetsDir: 'assets',
    chunkSizeWarningLimit: 400,
  },
});
