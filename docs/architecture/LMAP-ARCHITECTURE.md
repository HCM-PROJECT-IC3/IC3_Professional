# EduQuiz → LMAP (Learning Management & Assessment Platform)
## Kiến trúc & Lộ trình triển khai

> Tài liệu này được viết SAU KHI đọc trực tiếp source code thật của
> `IC3_Professional-main.zip` (không suy đoán), để đảm bảo mọi đề xuất
> đều khớp với hệ thống đang chạy.

---

## 1. Hiện trạng thật của hệ thống (quan trọng, khác giả định ban đầu)

| Khía cạnh | Thực tế trong code |
|---|---|
| Đăng nhập học sinh | **Không có.** Học sinh làm bài ẩn danh, chỉ nhập `studentName/studentClass/studentSchool` dạng text tự do trước khi làm bài (`quiz-engine.js`). |
| Liên kết học sinh ↔ giáo viên ↔ lớp | **Không tồn tại.** Không có `uid`, không có bảng roster. |
| "Bộ đề" (`QUIZ_SETS`) | Mảng hard-code trong `dashboard.js` + phần thêm lưu ở `localStorage` (`ic3_custom_sets`) — chưa phải entity Firestore. |
| Kết quả bài thi | Collection `quiz_results` (Firestore), ghi bởi `firestore-results.js`, **chỉ lưu điểm tổng hợp** (correct/incorrect/skipped/total), không lưu học sinh chọn gì cho từng câu. |
| Vai trò | Đã có sẵn 4 role đúng yêu cầu: `admin`, `teacher`, `coordinator` (Điều phối đào tạo), `student` — định nghĩa trong `auth.js`, thực thi trong `auth-guard.js` + `firestore.rules`. |
| Coordinator hiện tại | Đã có, nhưng chỉ dùng chung tab "Báo cáo" với admin/teacher trong `ic3-dashboard.html` — chưa có dashboard riêng theo đúng đặc tả (radar/heatmap, học sinh chưa làm bài, MSSV/avatar...). |
| Gamification | Đã có `js/gamification.js` (XP, huy hiệu) — dùng lại được cho Dashboard Học sinh thay vì làm mới. |

**Hệ quả kiến trúc quan trọng nhất:** vì không có roster học sinh thật,
hệ thống hiện tại **không thể biết ai CHƯA làm bài** — `quiz_results`
chỉ biết ai *đã* làm. Đây là lý do Giai đoạn 1 phải bổ sung 3 collection
roster (`courses`, `classes`, `students_roster`) độc lập với luồng làm
bài ẩn danh, đối chiếu qua khoá `studentName + studentClass` chuẩn hoá.

---

## 2. Nguyên tắc kiến trúc

1. **Additive-only ở Giai đoạn 1–2**: mọi file trong `js/core`,
   `js/models`, `js/repositories`, `js/services` là FILE MỚI. Không
   file nào trong danh sách hiện có (`quiz-engine.js`, `dashboard.js`,
   `auth.js`, `auth-guard.js`, `firestore-results.js`, `firestore.rules`)
   bị sửa cho tới khi kiến trúc nền đã ổn định và được bạn duyệt.
2. **Clean layering**: `HTML/UI` → `Service` (tính toán, điều phối) →
   `Repository` (CRUD Firestore) → `Model` (schema + validate). Không
   component UI nào được gọi thẳng `firebase.firestore()`.
3. **RBAC 2 lớp**: `js/core/rbac.js` (client, cho UX) + `firestore.rules`
   (server, cho bảo mật thật). Không bao giờ tin RBAC phía client.
4. **Không phá vỡ luồng học sinh làm bài** — đây là phần nhạy cảm nhất
   hệ thống (chống gian lận, tab-switch detection, lưu Firestore +
   Google Sheet song song). Mọi thay đổi liên quan đến `quiz-engine.js`
   sẽ luôn là 1 commit RIÊNG, có thể bật/tắt qua feature flag, review kỹ.

---

## 3. Sơ đồ tầng (đã triển khai ở Giai đoạn 1)

```
UI (HTML/CSS/JS hiện có + module mới)
        │
        ▼
js/services/          analytics-service.js, activity-log-service.js
        │
        ▼
js/repositories/       student-result-repo, student-answer-repo,
                        question-statistic-repo, learning-progress-repo,
                        activity-log-repo, roster-repo (course/class/student)
        │
        ▼
js/models/              6 model theo yêu cầu + roster.model.js (nền tảng)
        │
        ▼
js/core/rbac.js  +  js/repositories/base-repository.js
        │
        ▼
Firestore (quiz_results — cũ, giữ nguyên | 6 collection mới — đề xuất trong
           firestore.rules.PROPOSED-ADDITIONS.txt, CHƯA áp dụng)
```

---

## 4. Danh sách collection Firestore

| Collection | Trạng thái | Mục đích |
|---|---|---|
| `users` | Đã có | Tài khoản + role |
| `questions` | Đã có | Ngân hàng câu hỏi |
| `quiz_results` | Đã có | Kết quả tổng hợp mỗi lượt làm bài |
| `courses` | **Mới** | Khóa học (THCS/Tiểu học...) |
| `classes` | **Mới** | Lớp học, gắn `teacherId` |
| `students_roster` | **Mới** | Danh sách học sinh thật (MSSV, avatar, lớp, GV phụ trách) |
| `student_answers` | **Mới** | Chi tiết từng câu trả lời (Giai đoạn 2, cần sửa `quiz-engine.js`) |
| `question_statistics` | **Mới** | Độ khó câu hỏi, top câu sai (tính từ `student_answers`) |
| `learning_progress` | **Mới** | Tiến trình tích luỹ theo học sinh (vật chất hoá để đọc nhanh) |
| `activity_logs` | **Mới** | Audit log — đăng nhập, export, xem chi tiết học sinh |

---

## 5. File đã tạo ở Giai đoạn 1 (Commit #1 — nền tảng, an toàn tuyệt đối)

```
js/core/rbac.js
js/repositories/base-repository.js
js/repositories/student-result-repository.js
js/repositories/student-answer-repository.js
js/repositories/question-statistic-repository.js
js/repositories/learning-progress-repository.js
js/repositories/activity-log-repository.js
js/repositories/roster-repository.js
js/models/student-result.model.js
js/models/student-answer.model.js
js/models/exam-history.model.js
js/models/question-statistic.model.js
js/models/learning-progress.model.js
js/models/activity-log.model.js
js/models/roster.model.js
js/services/analytics-service.js
js/services/activity-log-service.js
docs/architecture/LMAP-ARCHITECTURE.md
docs/architecture/firestore.rules.PROPOSED-ADDITIONS.txt
```

**Không file nào trong repo gốc bị sửa.** Dự án chạy y hệt như trước
khi copy các file này vào — vì hiện chưa có trang HTML nào nạp chúng.

---

## 6. Lộ trình các commit tiếp theo

| # | Commit | Việc chính | File cần SỬA (tối thiểu) |
|---|--------|-----------|---------------------------|
| 1 | ✅ `feat: LMAP foundation (models/repos/services)` | Đã xong ở trên | Không sửa file nào |
| 2 | `feat: apply firestore rules additions` | Bạn tự review & publish `firestore.rules.PROPOSED-ADDITIONS.txt` trên project test trước | `firestore.rules` (bạn thao tác thủ công qua Console, có kiểm tra) |
| 3 | `feat: roster management UI` | Trang cho Điều phối đào tạo / Admin thêm lớp, thêm học sinh (MSSV, avatar) | File mới: `roster-manager.html`, `js/roster-manager.js` |
| 4 | `feat: coordinator dashboard` | Dashboard riêng: 7 KPI, 6 loại biểu đồ, bộ lọc 5 chiều | File mới: `coordinator-dashboard.html`, `js/coordinator/*.js`. Sửa: thêm 1 link sidebar trong `ic3-dashboard.html` |
| 5 | `feat: student management table + detail drawer` | Bảng học sinh (avatar/MSSV/điểm/tiến độ), trang chi tiết | File mới trong `js/coordinator/` |
| 6 | `feat: Excel export engine (SheetJS)` | 7-sheet workbook, KPI card, conditional formatting, pivot | File mới: `js/export/excel-exporter.js` |
| 7 | `feat: PDF export engine` | Logo, header/footer, biểu đồ | File mới: `js/export/pdf-exporter.js` |
| 8 | `feat: teacher analytics extension` | Mở rộng dashboard giáo viên (không đổi cấu trúc cũ) | File mới trong `js/teacher/` |
| 9 | `feat: student_answers wiring (có feature flag)` | Ghi chi tiết câu trả lời khi nộp bài | **Sửa `quiz-engine.js`** — review kỹ, có flag bật/tắt |
| 10 | `feat: student gamification dashboard` | Dùng lại `gamification.js`, thêm mục tiêu học | File mới trong `js/student/` |

Mỗi commit đều giữ nguyên tắc: **dự án chạy được ngay sau khi merge**,
vì mọi thứ đều là bổ sung, có thể revert độc lập từng commit mà không
ảnh hưởng các phần khác.

---

## 7. Cách tích hợp file Giai đoạn 1 vào trang mới (ví dụ)

```html
<!-- Sau các thẻ Firebase SDK + firebase-config.js + auth.js + auth-guard.js -->
<script src="js/core/rbac.js"></script>
<script src="js/repositories/base-repository.js"></script>
<script src="js/models/student-result.model.js"></script>
<script src="js/models/exam-history.model.js"></script>
<script src="js/models/roster.model.js"></script>
<!-- ... các model/repository khác tuỳ trang cần dùng ... -->
<script src="js/repositories/student-result-repository.js"></script>
<script src="js/repositories/roster-repository.js"></script>
<script src="js/services/analytics-service.js"></script>
<script src="js/services/activity-log-service.js"></script>
```

Không trang hiện có nào (`ic3-dashboard.html`, `index.html`...) cần đổi
gì ở bước này — các file trên hoàn toàn "ngủ yên" cho tới khi được nạp.
