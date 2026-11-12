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

## Quản trị (Phase 4d: `/app/#/quan-tri`, chỉ xem)

Chỉ dành cho `admin`, đúng như `admin-users.html`. Trang **chỉ xem, 0 lượt đọc và 0 lượt ghi Firebase**.

- **Không gọi Firestore.** Trang chỉ đọc hai bản đệm mà `admin-users.js` đã lưu trên máy (IndexedDB qua `EduDataCache`), kể cả khi bản đệm đã quá hạn:
  - `admin-users:delta`: danh sách tài khoản, giữ 30 ngày.
  - `admin-users:lookups`: lớp, trường, mã nhân viên, giữ 12 giờ.
- Nếu máy chưa có bản đệm, trang hướng dẫn mở Quản lý tài khoản (trang cũ) một lần.
- Luật "Chờ duyệt" và "Cần xử lý" **chép đúng** từ `admin-users.js` (`isPending`, `issuesOf`). Sửa bên đó thì phải sửa cả bên này.
- Mọi thao tác ghi (duyệt, đổi vai trò, gán trường, danh mục trường) vẫn nằm ở trang cũ.

## Học tập (Phase 5a: Lộ trình học `/app/#/lo-trinh`, Sổ tay câu sai `/app/#/so-tay`)

Cả hai trang **không cần đăng nhập và không tốn lượt Firebase**.

- **Mục lục đề:** `data/ic3/meta.json`, cũng là file mà `quiz-engine.js` dùng làm `quizRepository`. Đây là file tĩnh 44 KB, `sw.js` lưu sẵn để dùng offline.
- **Lộ trình học:** `progress.ts § buildPath` chép đúng `learning-hub.js § buildPath`.
  - Đã đối chiếu với `EduLearningHub.seasonInfo()` trên cùng dữ liệu, kể cả bản ghi kiểu cũ chỉ có tên.
  - Khác bản cũ đúng một điểm: khi em chưa làm bài nào, danh sách cấp độ hiện mọi cấp. Lý do: trang 2.0 không có ô chọn cấp ở sảnh.
- **Sổ tay câu sai:** chỉ đọc `eduquiz_wrongbook_v1`.
  - Câu hỏi hiện dưới dạng **chữ thuần**: tách bằng `DOMParser` và không chèn HTML vào trang, nên HTML lạ trong câu hỏi không chạy được.
  - Nút "Ôn ngay" dùng link có sẵn `index.html?goc=sotay&hs=<khoá>`. Chấm điểm và chuyển hộp vẫn do code cũ làm.
- **Làm bài vẫn ở trang cũ.** Nút "Làm bài" dùng link `index.html?ct=&cap=&bai=` (`quiz-engine.js § _selectMinitestFromUrl`, thêm ngày 12/11/2026) để chọn sẵn đúng bài trên sảnh. Em vẫn chọn tên và bấm Bắt đầu như thường.

## Trò chơi & thành tích (Phase 6: Khu vui chơi `/app/#/tro-choi`, Thành tích `/app/#/thanh-tich`)

Hai trang này không cần đăng nhập, không tốn lượt Firebase và không sửa file cũ nào.

- **Khu vui chơi** gom Đấu trường, 5 mini-game và 3 trang mô phỏng/thư viện. Mỗi thẻ mở trang cũ, nên game vẫn chạy và ghi XP như trước.
  - Đấu trường mở bằng tham số có sẵn `arena.html?vai=minigame|solo|student`.
  - Ngày 12/11/2026 đã thử từng trang game mở trực tiếp: không lỗi, không gọi Firebase hay Google.
- **Thành tích** chỉ đọc `eduquiz_gamestate` qua `gamification.js` (`getState`, `levelForXp`, `xpToNextLevel`, `BADGE_DEFS`).
  - XP và huy hiệu tính chung cho cả máy, đúng như hệ thống cũ. Trang có ghi rõ điều này.
  - Nhiệm vụ ngày tính theo ngày UTC, giống `gamification.js § _today()`.
- Danh mục game nằm ở `src/features/play/games.ts`. Mô tả game được đối chiếu với nội dung thật của từng file game. `gameId` phải trùng với khoá mà game ghi qua `recordGameSession`.

## Luật bắt buộc

1. Không sửa trang cũ, `sw.js`, `manifest.webmanifest`, `firestore.rules`, `js/` chỉ để phục vụ React.
2. Không gắn `<link rel="manifest">` trong `web/index.html`. Vite sẽ chép một bản với `start_url` sai.
3. Gọi Firestore chỉ qua repository có cache và `limit`. Không dùng `onSnapshot` ngoài Arena. Tắt refetch khi focus hoặc reconnect.
4. Luồng làm bài, MOS, Arena và mini-game vẫn là trang cũ. Mở chúng bằng `LegacyLink`.
