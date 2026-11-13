// Tiện ích chung cho các bộ E2E.

/** Ghi localStorage cho origin của app (mở /app/ trước để có đúng origin). */
export async function seed(p, base, data, { clear = true } = {}) {
  await p.goto(base + 'app/', { waitUntil: 'networkidle0' });
  await p.evaluate((d, c) => {
    if (c) localStorage.clear();
    for (const [k, v] of Object.entries(d)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
  }, data, clear);
}

/** Mở 1 route của app (nạp lại trang để index.html áp theme + đọc localStorage từ đầu). */
export async function openApp(p, base, hash) {
  await p.goto(base + 'app/' + hash, { waitUntil: 'networkidle0' });
  await p.reload({ waitUntil: 'networkidle0' });
}

/** Giá trị số của 1 thẻ số liệu theo nhãn (StatCard: <p>nhãn</p><p>giá trị</p>). */
export function stat(p, label) {
  return p.evaluate((l) => [...document.querySelectorAll('main p')].find((e) => e.textContent === l)?.nextElementSibling?.textContent ?? null, label);
}

export const mainText = (p) => p.evaluate(() => document.querySelector('main')?.innerText.replace(/\s+/g, ' ') || '');
export const overflow = (p) => p.evaluate(() => document.documentElement.scrollWidth > innerWidth);

/** Host Firebase có tính lượt / dữ liệu (Firestore, Auth REST, token, installations).
 *  KHÔNG tính: www.gstatic.com (file SDK tĩnh), fonts.googleapis.com (phông chữ). */
export const firebaseHosts = (p) =>
  [...p.external].filter((h) => /^(firestore|identitytoolkit|securetoken|firebaseinstallations|firebase)\.googleapis\.com$|\.firebaseio\.com$/.test(h));

/**
 * Thay js/auth.js bằng bản giả: EduAuth.onAuthReady trả user/profile cho sẵn, KHÔNG đọc users/{uid}.
 * `patch` chạy ngay trước callback (sau khi mọi file js/ cũ đã nạp) — dùng để thay hàm tải dữ liệu bằng dữ liệu giả.
 */
export async function stubAuth(p, base, profile, patch = '') {
  // app 2.0 đăng ký sw.js → request js/auth.js đi QUA service worker, chặn ở tầng trang không bắt được.
  // Bỏ qua SW chỉ trong các kịch bản đăng nhập giả; sw.js thật được kiểm ở suites/offline.mjs.
  await p.setBypassServiceWorker(true);
  await p.setRequestInterception(true);
  p.on('request', (r) => {
    if (r.isInterceptResolutionHandled()) return;
    if (r.url() === base + 'js/auth.js') {
      return r.respond({
        status: 200,
        contentType: 'text/javascript',
        body: `window.EduAuth = { ROLE_LABEL: {}, logoutUser: async () => { window.__loggedOut = true; },
          onAuthReady(cb) { setTimeout(() => { ${patch}
            cb(${profile ? `{ uid: ${JSON.stringify(profile.uid || 'u1')}, email: 'test@example.test' }, ${JSON.stringify(profile)}` : 'null, null'}); }, 50); } };`,
      });
    }
    r.continue();
  });
}

/** Đợi cổng nhân sự xong (gồm hoãn 1,5 giây chống F5 dồn dập khi mở lại trang < 4 giây). */
export async function waitStaff(p) {
  await p.waitForFunction(() => {
    const t = document.querySelector('main')?.innerText || '';
    return t && !/Đang kiểm tra đăng nhập/.test(t);
  }, { timeout: 20000 });
  await new Promise((r) => setTimeout(r, 300));
}
