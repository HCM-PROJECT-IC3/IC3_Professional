/* Theme Light/Dark — dùng CHUNG khoá localStorage "ic3_theme" với giao diện cũ
   (js/theme-toggle-quick.js, js/theme-inherit.js) để 2 giao diện luôn đồng bộ.
   Không đọc/ghi gì ngoài localStorage — 0 lượt Firebase. */
export type Theme = 'light' | 'dark';
const KEY = 'ic3_theme';

export function getTheme(): Theme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

export function setTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  try { localStorage.setItem(KEY, theme); } catch { /* chế độ ẩn danh / bị chặn: vẫn đổi được trong phiên */ }
}
