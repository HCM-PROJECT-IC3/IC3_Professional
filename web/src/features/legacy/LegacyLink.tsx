import * as React from 'react';
import { legacyUrl } from '@/lib/utils';

/**
 * Mở 1 trang giao diện cũ (quiz-engine, MOS, Arena, mini-game…) — chuyển hẳn trang,
 * không iframe, để giữ nguyên service worker, tự lưu bài và hàng đợi nộp bài của trang cũ.
 * Đường dẫn cũ (vd "arena.html") giữ nguyên → link đề đã phát vẫn chạy.
 */
export function LegacyLink({
  page,
  ...props
}: { page: string } & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>) {
  return <a href={legacyUrl(page)} {...props} />;
}
