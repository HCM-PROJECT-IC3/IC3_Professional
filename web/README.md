# IC3 Professional 2.0: mã nguồn React

App React chạy **song song** với giao diện hiện tại. Các trang cũ ở thư mục gốc vẫn chạy như trước. Bản 2.0 nằm ở `<site>/app/`.

| | |
|---|---|
| Mã nguồn | `web/` (Vite + React + TypeScript + Tailwind v4 + quy ước shadcn/ui + Lucide) |
| Bản phục vụ | `app/`, tức bản build **đã commit**. GitHub Pages không có bước build |
| Router | `HashRouter` (`/app/#/…`), vì Pages không có SPA fallback |
| Theme | Dùng chung khoá `localStorage` `ic3_theme` với giao diện cũ |
| Domain | `src/domain/legacy.ts` import `js/core/rbac.js` và `js/core/grading.js` dạng side-effect. **Không sửa, không chép** logic cũ |
| Firebase | Chưa nạp ở Phase 2, nên **0 lượt** đọc/ghi |

## Làm việc

```bash
cd web
npm install
npm run dev          # http://localhost:5173. Trang cũ mở qua link "../xxx.html" chỉ chạy khi phục vụ cả repo
npm run build        # typecheck + build ra ../app/
```

**Sửa `web/` xong thì luôn chạy `npm run build` và commit cả `app/`.**
CI kiểm tra `app/index.html` không trỏ tới file thiếu (`scripts/check-legacy-paths.js`). Job `web` thì kiểm tra kiểu TypeScript và build thử.

Xem thử cả repo như trên Pages:

```bash
npx http-server@14.1.1 -p 8765 -s ..   # rồi mở http://127.0.0.1:8765/app/
```

## Thành phần dùng chung (Phase 3)

Xem trực tiếp ở `/app/#/ui`.

| Thành phần | File |
|---|---|
| Khung trang: sidebar, header, ngăn kéo menu trên điện thoại | `src/app/layouts/` |
| Menu theo vai trò (chép đúng `EDU_ALLOWED_ROLES` của trang cũ) | `src/app/navigation.ts` |
| Thẻ số liệu, bảng dữ liệu (sắp xếp và phân trang trên máy), tiêu đề trang | `src/components/shared/` |
| Trạng thái đang tải / trống / lỗi: **khối dữ liệu nào cũng phải có đủ 3** | `src/components/shared/States.tsx` |
| Linh vật Chip (3 nét mặt). Chỉ dùng ở lời chào, màn hình trống, màn hình lỗi | `src/components/shared/Mascot.tsx` |

Vai trò ở Phase 3 chỉ dùng để **xem thử menu**. Phase 4 mới nối đăng nhập thật. Trang Tổng quan đang dùng dữ liệu mẫu (`src/features/preview/sample.ts`).

## Dashboard học sinh (Phase 4a)

Vai trò Học sinh xem trang `/app/#/` (Góc học tập). Trang **không cần đăng nhập** và gọi **0 lượt mạng**. Dữ liệu là lịch sử làm bài trên chính máy đó.

| Khoá localStorage | Do ai ghi | App 2.0 |
|---|---|---|
| `eduquiz_records` | `quiz-engine.js` | chỉ đọc |
| `eduquiz_wrongbook_v1` | `wrongbook-store.js` | chỉ đọc (import thẳng file cũ) |
| `eduquiz_gamestate` | `gamification.js` | chỉ đọc (import thẳng file cũ) |
| `eduquiz_goals_v1` | `learning-hub.js` | đọc và **ghi cùng định dạng**, nên sảnh cũ thấy ngay mục tiêu mới |
| `ic3v2.student` | app 2.0 | học sinh đang chọn (máy trường dùng chung) |

Công thức thống kê ở `src/features/student/progress.ts` **chép đúng** từ `js/learning-hub.js`. Đổi một bên thì phải đổi bên kia, rồi đối chiếu lại:
1. Nạp cùng một bộ dữ liệu vào localStorage.
2. Ở `index.html`, chọn học sinh rồi chạy `EduLearningHub.studentSummary()`.
3. So `done`, `streak`, `due` với các thẻ "Bài đã làm", "Chuỗi ngày học", "Câu cần ôn hôm nay" trên `/app/`.

XP, cấp và huy hiệu là số liệu **chung của cả máy** (gamification cũ không tách theo học sinh). Giao diện có ghi rõ điều này.

## Cổng nhân sự (Phase 4b: Lớp học của tôi, `/app/#/giao-vien`)

- **Không viết lại tầng dữ liệu.** `src/services/legacy/runtime.ts` nạp **đúng các file `js/` của trang cũ**, theo đúng thứ tự. Firebase compat **10.13.0** phải trùng với các trang cũ.
  - Query, `limit`, bản đệm và cầu dao đếm lượt đọc giống hệt trang cũ, và **dùng chung bản đệm**. Mở cả trang cũ lẫn trang 2.0 không làm đọc gấp đôi.
  - Phiên đăng nhập dùng chung với trang cũ, vì cùng một SDK.
- **Route nạp lười.** Học sinh không tải mã này và không nạp Firebase.
- **`StaffGate`** làm lại đúng luật của `auth-guard.js`: chưa đăng nhập, không có hồ sơ, sai vai trò, giáo viên chờ duyệt. Có cả chống F5 dồn dập. Hồ sơ đọc qua `EduAuth.onAuthReady`, nên tối đa 1 lượt đọc mỗi 5 phút, dùng chung bản đệm.
- **Tự đăng xuất khi không thao tác** (`features/auth/idle.ts`) dùng cùng khoá và cùng giới hạn với `idle-logout.js` (15 phút trên máy dùng chung, 60 phút trên máy cá nhân).
- **Dữ liệu lớp:** `EduTeacherData.loadAll()`, cùng hàm với `teacher-dashboard.html`. Đổi bộ lọc là **0 lượt đọc**. Nút "Làm mới" chỉ đọc bài mới nộp.
- Xuất Excel/PDF, câu hay sai và trợ lý AI vẫn nằm ở trang cũ (nút "Bản đầy đủ").

## Cổng điều phối (Phase 4c: `/app/#/dieu-phoi`)

Dành cho `admin`, `coordinator`, `school_admin`, đúng như `coordinator-dashboard.html`.

- Dùng `EduCoordinatorData.loadRoster` và `loadResults` của trang cũ. Hai hàm được **gọi riêng**: một nguồn lỗi thì trang vẫn hiện nguồn còn lại, và nút "Thử lại" chỉ đọc lại đúng nguồn bị lỗi.
- Bản đệm dùng chung với trang cũ: danh sách học sinh 12 giờ, kết quả 3 phút, khoá học và lớp 10 phút.
- Nhiều trường có lớp trùng tên, nên điểm theo lớp nhóm theo **trường + lớp**. Lớp được xếp điểm thấp trước, hiện tối đa 60 lớp.
- Bảng so sánh giữa các trường dùng `EduAnalytics.schoolComparison`, và bị **ẩn khi chưa tải được kết quả**.

## Luật bắt buộc

1. Không sửa trang cũ, `sw.js`, `manifest.webmanifest`, `firestore.rules`, `js/` chỉ để phục vụ React.
2. Không gắn `<link rel="manifest">` trong `web/index.html`. Vite sẽ chép một bản với `start_url` sai.
3. Gọi Firestore chỉ qua repository có cache và `limit`. Không dùng `onSnapshot` ngoài Arena. Tắt refetch khi focus hoặc reconnect.
4. Luồng làm bài, MOS, Arena và mini-game vẫn là trang cũ. Mở chúng bằng `LegacyLink`.
