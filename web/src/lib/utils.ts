import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Gộp class Tailwind (quy ước shadcn/ui). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Đường dẫn tới trang giao diện cũ (app chạy ở <site>/app/ → trang cũ ở thư mục cha). */
export function legacyUrl(page: string) {
  return `../${page.replace(/^\/+/, '')}`;
}
