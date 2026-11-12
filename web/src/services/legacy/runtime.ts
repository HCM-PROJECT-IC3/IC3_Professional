/* ============================================================
   Nạp "runtime" cũ cho các cổng NHÂN SỰ (giáo viên, điều phối, admin).

   Không viết lại tầng dữ liệu bằng SDK mới: nạp ĐÚNG các file js/ mà trang cũ
   đang dùng, theo ĐÚNG thứ tự trong teacher-dashboard.html. Nhờ vậy:
     • Query, limit, bản đệm (EduDataCache), cầu dao đếm lượt đọc (firebase-config.js)
       giống hệt trang cũ — và DÙNG CHUNG bản đệm với trang cũ (mở cả 2 không đọc gấp đôi).
     • Cùng SDK compat 10.13 → phiên đăng nhập dùng chung tự nhiên, không có 2 bản SDK.
     • Trang HỌC SINH không bao giờ gọi file này → 0 Firebase cho học sinh.

   KHÔNG nạp: auth-guard.js, idle-logout.js (chuyển hướng "login.html" tương đối → sai
   khi chạy ở /app/; React làm lại ở features/auth), backend-version-check.js, các file vẽ DOM.
   ============================================================ */

const FIREBASE_SDK = '10.13.0'; // PHẢI trùng các trang cũ (teacher-dashboard.html, coordinator-dashboard.html…)
const GSTATIC = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK}`;

/** Lõi chung: Firebase + cấu hình + đăng nhập + bản đệm + repository. */
const CORE = [
  `${GSTATIC}/firebase-app-compat.js`,
  `${GSTATIC}/firebase-auth-compat.js`,
  `${GSTATIC}/firebase-firestore-compat.js`,
  'js/firebase-config.js',
  'js/backend-config.js',
  'js/services/apps-script-client.js',
  'js/services/sheet-results-api.js',
  'js/auth.js',
  'js/services/data-cache-service.js',
  'js/models/school.model.js',
  'js/services/roster-cache-service.js',
  'js/repositories/base-repository.js',
  'js/models/roster.model.js',
  'js/models/student-result.model.js',
  'js/models/exam-history.model.js',
  'js/repositories/roster-repository.js',
  'js/repositories/student-result-repository.js',
  'js/services/analytics-service.js',
];

export const BUNDLES = {
  auth: CORE.slice(0, 8),
  teacher: [...CORE, 'js/teacher/data-loader.js'],
  // Quản trị 2.0 CHỈ ĐỌC bản đệm của admin-users.js — chỉ cần đăng nhập + data-cache-service, không nạp repository nào
  admin: [...CORE.slice(0, 8), 'js/services/data-cache-service.js'],
  // thứ tự theo coordinator-dashboard.html (user-repository: danh sách giáo viên đã duyệt)
  coordinator: [...CORE, 'js/repositories/user-repository.js', 'js/coordinator/data-loader.js'],
} as const;

const loaded = new Map<string, Promise<void>>();

function resolve(src: string) {
  // app chạy ở <site>/app/ → file cũ ở thư mục cha
  return /^https?:/.test(src) ? src : `../${src}`;
}

function loadOne(src: string): Promise<void> {
  const url = resolve(src);
  let p = loaded.get(url);
  if (!p) {
    p = new Promise<void>((ok, fail) => {
      const s = document.createElement('script');
      s.src = url;
      s.async = false; // giữ đúng thứ tự thực thi như <script> tuần tự ở trang cũ
      s.onload = () => ok();
      s.onerror = () => {
        loaded.delete(url);
        fail(new Error(`Không tải được ${src}`));
      };
      document.head.appendChild(s);
    });
    loaded.set(url, p);
  }
  return p;
}

/** Nạp tuần tự (file sau phụ thuộc global của file trước). Gọi lại nhiều lần an toàn. */
export async function loadLegacy(list: readonly string[]) {
  for (const src of list) await loadOne(src);
}
