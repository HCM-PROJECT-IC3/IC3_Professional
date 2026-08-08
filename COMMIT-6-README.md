# Commit #6 — Giáo viên chỉ xem được trường mình dạy + Dashboard Giáo viên

Gộp 3 việc đã thống nhất trong cùng 1 đợt (đúng lộ trình bảo mật đã bàn:
sửa nền server trước, dựng UI sau), đồng thời **thực hiện sớm hơn dự kiến**
mục "Commit #8 — teacher analytics extension" trong
`docs/architecture/LMAP-ARCHITECTURE.md` vì nó cần đi cùng phần bảo mật này.

## Bối cảnh (vấn đề đã phát hiện trước khi sửa)

- `firestore.rules` bản cũ cho **bất kỳ giáo viên đã duyệt nào đọc TOÀN BỘ**
  `quiz_results` — không lọc theo trường/lớp gì cả.
- `students_roster` chưa mở cho giáo viên đọc.
- Google Sheet (`apps/Code.gs`) ghi chung tất cả trường vào 1 tab — không có
  ranh giới, không nên share thẳng cho giáo viên (giữ nguyên hiện trạng,
  không đổi gì trong `apps/Code.gs` ở commit này).

## File MỚI

```
js/teacher/data-loader.js
js/teacher/dashboard.js
teacher-dashboard.html
```

## File ĐÃ SỬA

- **`js/admin-users.js` + `admin-users.html` + `css/admin-users.css`** — thêm
  cột "Trường được xem" cho giáo viên: multi-select lấy danh sách trường
  CHUẨN từ `students_roster` (không gõ tay), lưu vào field mới `schools`
  (mảng) trên `users/{uid}`. Chỉ Admin gán được, giáo viên không tự chọn.
- **`firestore.rules`**:
  - Thêm `myTeacherSchools()` / `isOwnSchoolField()`.
  - `quiz_results`: giáo viên chỉ đọc được document có `studentSchool`
    nằm trong `schools` của mình (**lỗ hổng đọc-toàn-bộ đã sửa**). Đồng thời
    bắt buộc `studentSchool` khác rỗng lúc tạo (trước đây không bắt buộc).
  - `students_roster`: mở đọc cho giáo viên, scoped theo `school`.
  - `classes`: **giữ nguyên** admin/coordinator-only — không có field
    `school` trên document này nên không scope được, và teacher-dashboard
    không cần đọc trực tiếp collection này (dùng `className` denormalized
    sẵn trên từng document `students_roster`).
  - Xoá hàm `canViewReports()` (không còn nơi nào gọi sau khi tách rule
    `quiz_results` ra riêng).
- **`js/repositories/student-result-repository.js`** — `listRecent()` và
  `listByStudent()` nhận thêm tham số tuỳ chọn `schools` (thêm
  `where('studentSchool','in', schools)`) — bắt buộc dùng khi gọi với vai
  trò giáo viên, vì Firestore sẽ từ chối toàn bộ query nếu không có điều
  kiện lọc khớp rule mới. Coordinator/Admin gọi như cũ, không cần đổi gì.
- **`js/repositories/roster-repository.js`** — thêm `listBySchools(schools)`
  cho `StudentRosterRepository`.
- **`js/coordinator/student-detail.js`** — sửa **1 dòng**: `listByStudent()`
  giờ đọc thêm `global.EduStudentDetailSchoolsScope` (mặc định `undefined`
  = không giới hạn, coordinator/admin không đổi hành vi). Teacher dashboard
  gán biến này trước khi mở drawer. Không sửa gì khác trong file.
- **`ic3-dashboard.html` + `js/dashboard-page.js`** — thêm link sidebar
  "🧑‍🏫 Dashboard của tôi" → `teacher-dashboard.html`, hiện cho vai trò
  `admin`/`teacher`.

**Không sửa**: `quiz-engine.js`, `index.html`, `js/lobby-roster.js` (ô
"Trường" ở form làm bài **vốn đã là dropdown chuẩn hoá** lấy từ
`data/roster/students-active.json`, không phải nhập tay — không cần đổi gì
để khớp với `schools` mới gán cho giáo viên), `apps/Code.gs`,
`js/coordinator/{charts,student-table}.js` (dùng lại nguyên vẹn).

## Trang `teacher-dashboard.html` có gì

Gần như song sinh với `coordinator-dashboard.html` (Commit #4/#5) nhưng:
- **Luôn lọc theo trường ngay từ Firestore** (`js/teacher/data-loader.js`),
  không tải-hết-rồi-ẩn như coordinator.
- Bớt 2 bộ lọc "Khoá học"/"Giáo viên" (không áp dụng — giáo viên chỉ xem
  chính mình), thêm bộ lọc "Trường" (chỉ hiện nếu được gán > 1 trường).
- 6 KPI thay vì 7 (bỏ "Tổng số giáo viên").
- Biểu đồ, bảng học sinh, drawer chi tiết: **dùng lại y hệt** module của
  Coordinator Dashboard, không viết lại.
- Nếu tài khoản giáo viên chưa được Admin gán trường nào (`schools` rỗng),
  trang hiện thông báo rõ ràng, không query Firestore vô ích.

## Việc BẠN cần làm thủ công sau khi merge

1. **Publish lại `firestore.rules`** trên Firebase Console (Rules → dán →
   Publish) — nếu không publish, mọi thay đổi bảo mật ở trên chưa có hiệu
   lực (kể cả khi đã đẩy code lên GitHub Pages).
2. Vào `admin-users.html` → gán "Trường được xem" cho từng giáo viên hiện
   có (mặc định `schools` rỗng → giáo viên chưa gán sẽ **không thấy dữ liệu
   nào** cho tới khi được gán, kể cả dữ liệu hợp lệ của trường họ dạy).
3. Firestore có thể yêu cầu tạo **composite index** cho truy vấn mới
   (`students_roster` where `status` + `school`) — nếu console báo lỗi kèm
   link "Create index", bấm link đó 1 lần là xong (Firebase tự tạo).
