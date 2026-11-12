import { useEffect, useState } from 'react';
import type { MetaCategory } from '@/features/student/progress';

/* Mục lục ngân hàng câu hỏi — data/ic3/meta.json (44 KB, file TĨNH cùng tên miền, sw.js lưu sẵn để
   dùng offline). 0 Firebase, 0 Apps Script. Chính file quiz-engine.js nạp làm window.quizRepository. */

let cache: Promise<MetaCategory[]> | null = null;

function loadMeta(): Promise<MetaCategory[]> {
  if (!cache) {
    cache = fetch('../data/ic3/meta.json')
      .then((r) => {
        if (!r.ok) throw new Error(`Không tải được mục lục đề (${r.status})`);
        return r.json();
      })
      .then((m: { categories?: MetaCategory[] }) => m.categories || [])
      .catch((e) => {
        cache = null; // cho phép thử lại
        throw e;
      });
  }
  return cache;
}

export function useMeta() {
  const [state, setState] = useState<{ cats: MetaCategory[] | null; error: string | null }>({ cats: null, error: null });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    loadMeta().then(
      (cats) => alive && setState({ cats, error: null }),
      (e: Error) => alive && setState({ cats: null, error: e.message }),
    );
    return () => {
      alive = false;
    };
  }, [tick]);
  return { ...state, retry: () => setTick((t) => t + 1) };
}

/** Chữ thuần từ HTML câu hỏi — DOMParser không chạy script, không tải ảnh; KHÔNG chèn HTML vào trang. */
export function plainText(html?: string) {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
}
