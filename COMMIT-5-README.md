# Commit #5 — Bảng quản lý học sinh đầy đủ + Drawer chi tiết

Theo đúng lộ trình trong `docs/architecture/LMAP-ARCHITECTURE.md` (mục 6, dòng #5).
Đã build trực tiếp trên repo đã gộp sẵn Commit #1–#4.

## File MỚI

```
js/coordinator/student-table.js
js/coordinator/student-detail.js
```

## File CẦN SỬA (đã sửa sẵn trong repo, chỉ 2 chỗ nhỏ trong `coordinator-dashboard.html` + `js/coordinator/dashboard.js`)

- `coordinator-dashboard.html` — thêm section bảng học sinh + drawer chi tiết, thêm 2 `<script>` mới.
- `css/coordinator-dashboard.css` — thêm style cho bảng/phân trang/drawer (nối vào cuối file, không sửa style cũ).
- `js/coordinator/dashboard.js` — thêm 1 dòng gọi `EduCoordinatorStudentTable.render(scoped)` trong `refresh()`,
  thêm 1 listener `edu:toast` để các module mới dùng chung toast, sửa text gợi ý ở watchlist "chưa làm bài".

Không đụng `quiz-engine.js`, `auth.js`, `auth-guard.js`, `firestore.rules`, hay bất kỳ file Commit #1–#4 nào khác.

## Trang có gì mới

**Bảng quản lý học sinh** (ngay dưới 3 danh sách rút gọn cũ):
- Avatar, MSSV, Họ tên, Lớp, Giáo viên, Điểm gần nhất, Điểm TB, Tiến độ học (%), Trạng thái.
- Tìm theo tên/MSSV, lọc theo trạng thái, đổi số dòng/trang — **toàn bộ lọc trong bộ nhớ**, không gọi lại
  Firestore (dùng đúng `scoped` đã tính từ bộ lọc 5 chiều của Commit #4).
- Nút "Xem chi tiết" mở drawer trượt từ phải sang.

**Drawer chi tiết học sinh**:
- 4 KPI nhanh: số lượt làm bài, điểm TB, điểm cao nhất, điểm gần nhất.
- Bảng lịch sử làm bài ĐẦY ĐỦ (không bị giới hạn bởi bộ lọc bài thi/khoảng thời gian đang bật trên dashboard —
  luôn lấy toàn bộ lịch sử thật của học sinh qua `studentResultRepository.listByStudent`).
- Mục "Lịch sử đăng nhập": **có ghi chú thật, không giả lập số liệu**. Học sinh làm bài ẩn danh (không qua
  Firebase Auth), nên `activity_logs` (keyed theo `uid`) không có bản ghi nào của các em — mục này hiện chưa
  có dữ liệu để hiển thị, và trang nói rõ điều đó thay vì bịa ra số liệu trống rỗng.
- Mỗi lần mở drawer tự ghi 1 dòng `activity_logs` (`VIEW_STUDENT_DETAIL`) — phục vụ Audit Log của Admin.

**Nút Xuất Excel / Xuất PDF**: đã có sẵn trên toolbar bảng học sinh nhưng hiện chỉ hiện toast báo "sẽ có ở
Commit #6/#7" — đúng lộ trình, tránh dựng UI export nửa vời trước khi có engine thật.

## Kiểm tra đã chạy trước khi bàn giao

- `node --check` toàn bộ file JS mới/sửa — không lỗi cú pháp.
- Đối chiếu từng `getElementById(...)` trong 2 file JS mới với toàn bộ `id="..."` có trong HTML — khớp 100%.
- Đối chiếu API gọi (`EduRepositories.studentResult.listByStudent`, `EduModels.ExamHistory.buildFromResults`,
  `EduModels.Roster.studentKeyOf`, `EduModels.ActivityLog.ACTIONS`, `EduActivityLog.log`) với đúng chữ ký hàm
  trong các file Commit #1 — khớp 100%.
- `diff -rq` toàn repo gốc vs repo sau khi thêm Commit #5 — chỉ 2 file bị đổi (đúng danh sách "File CẦN SỬA" ở trên).

## Vẫn cần Commit #2 trước khi test thật

Như Commit #3/#4 đã ghi: nếu bạn **chưa publish** `firestore.rules.PROPOSED-ADDITIONS.txt`, bảng học sinh
và drawer chi tiết sẽ báo lỗi `permission-denied` khi đọc `students_roster`/`classes`/`courses`. Publish rules
trước, trang sẽ chạy được ngay — không cần sửa gì thêm ở Commit #5.

## Tiếp theo

Commit #6: Excel export engine (SheetJS) — 7-sheet workbook, KPI card, conditional formatting, pivot table/chart,
dùng lại đúng dữ liệu `scoped` + bảng học sinh đã có ở Commit #5. Báo khi bạn sẵn sàng.
