import { useEffect, useState } from 'react';

/** Tăng số phiên bản khi 1 trong các khoá localStorage đổi ở TAB KHÁC (sự kiện "storage")
 *  hoặc khi học sinh quay lại tab này — để dashboard tính lại số liệu. 0 lượt mạng. */
export function useStorageVersion(keys: string[]) {
  const [version, setVersion] = useState(0);
  const watch = keys.join('|');
  useEffect(() => {
    const set = new Set(watch.split('|'));
    const bump = () => setVersion((v) => v + 1);
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || set.has(e.key)) bump();
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') bump();
    };
    window.addEventListener('storage', onStorage);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('storage', onStorage);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [watch]);
  return version;
}
