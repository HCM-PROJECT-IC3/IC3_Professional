# Báo cáo Audit — Sprint 0 (EduQuiz 2.0)

> Ngày audit: 02/11/2026 · Phạm vi: AUD-01 → AUD-06 của kế hoạch EduQuiz 2.0.
> Đọc cùng: [BACKEND-MAP.md](BACKEND-MAP.md), [SCALING-SPARK.md](SCALING-SPARK.md),
> [../ROADMAP-PHAT-TRIEN.md](../ROADMAP-PHAT-TRIEN.md).

## 0. Tóm tắt

Hệ thống hiện tại **không phải điểm xuất phát trống**: đã có Repository/Service layer, Firestore Rules
theo vai trò + theo trường, CI kiểm tra dữ liệu/JS/HTML/Apps Script, Service Worker offline và chiến
lược hạn mức Spark được đo đạc. Kế hoạch 2.0 có **4 giả định mâu thuẫn với thiết kế đang chạy** (§6) —
cần chốt trước khi bắt đầu Sprint 1, nếu không sẽ viết lại những phần đang tốt.

Việc cần làm ngay, không phụ thuộc quyết định nào: **§5.1 — danh sách 2.838 học sinh thật đang công khai.**

## 1. AUD-01 — Kiểm kê mã nguồn

| Hạng mục | Hiện trạng |
|---|---|
| Trang HTML | 25 trang ở thư mục gốc (học sinh, giáo viên, điều phối, trò chơi) + `mos/` |
| JavaScript | `js/` ~63 file gốc + thư mục con `arena/`, `coordinator/`, `teacher/`, `services/` (21), `repositories/` (7), `models/` (7), `export/`, `vendor/` |
| Backend | `apps/src/*.gs` (16 file, build bằng `scripts/build-apps-script.js`); `server/` (Node relay + Docker cho máy chủ trường) |
| Dữ liệu tĩnh | `data/ic3/` — ~6.071 câu, minitest theo IC3/Spark LV1–3 + MOS; `mos/data/sets` |
| Kiểm thử | 35 file test (services, arena, models, Apps Script, server) + `mos/tools/test-rubrics.js` |
| CI | `.github/workflows/ci.yml`: validate-data, check-js, check-html, build Apps Script --check, test, Docker build |

Điểm nợ kỹ thuật:
- `js/quiz-engine.js` **5.429 dòng** — module lớn nhất, chứa cả UI, chấm điểm, nộp bài. Không tách lúc này
  (rủi ro hồi quy cao nhất), chỉ trích dần phần nộp bài sang `services/result-submitter.js` khi cần.
- 25 trang nằm phẳng ở gốc. **Không nên di chuyển** sang `student/`, `teacher/`, `admin/` như cấu trúc đích
  của kế hoạch: link đề đã phát cho học sinh, bookmark, `sw.js` precache và `manifest.webmanifest` đều dựa
  trên đường dẫn hiện tại. Nếu buộc phải đổi, để lại trang chuyển hướng ở đường dẫn cũ.

## 2. AUD-02 — Firebase

- **Một project chính:** `data-ic3` (`js/firebase-config.js`). Nạp lười qua `js/services/firebase-loader.js`;
  trang học sinh không nạp Firebase trừ khi bật `quizResults.firestore`.
- `initializeApp` xuất hiện thêm ở `js/admin-users-import.js` (app phụ để Admin tạo tài khoản hàng loạt
  mà không đăng xuất chính mình) — hợp lệ, giữ nguyên.
- Firebase web `apiKey` trong mã là **công khai theo thiết kế**, không phải lỗ hổng; bảo vệ nằm ở Rules.
- App Check: **không bật Enforce** (ghi chú trong `firebase-config.js`).
- Gói **Spark**; Cloud Functions không dùng — khớp nguyên tắc 0đ của kế hoạch.

## 3. AUD-03 — Firestore Collections đang dùng

| Collection | Vai trò | Ghi chú |
|---|---|---|
| `users` | Tài khoản, `role`, `approved`, `schools[]` | Định danh = Firebase UID ✅ |
| `quiz_results` | Kết quả IC3/Spark | **Đang tắt** (`quizResultsOpen() = false`); bài nộp đi Google Sheet. TTL 45 ngày |
| `mos_submissions` | Kết quả MOS | Ghi công khai (xem §5.3) |
| `students_roster`, `classes`, `courses` | Roster quản lý | Theo trường |
| `teaching_*` (6 collection) | Lịch dạy, TKB, khoảng cách | Vai trò `teaching_coordinator` |
| `gvlab_*` (posts, certs, profiles, chat) | Cộng đồng giáo viên | |
| `teacher_sync` | Đồng bộ cài đặt giáo viên | 1 doc/UID |
| `arena_relay`, `live_hosts`, `live_rooms` | Phòng thi đấu | Dữ liệu tạm, TTL |
| `questions` | Ngân hàng câu hỏi cũ | Không trang học sinh nào đọc — ứng viên dọn |

So với 16 collection dự kiến của kế hoạch: **chưa có** `schools`, `enrollments`, `exams`, `assignments`,
`attempts`, `attendance`, `achievements`, `notifications`, `analytics`, `auditLogs`. Điểm danh, XP/streak,
câu sai, tiến độ học tập hiện ở `localStorage` hoặc Google Sheet — có chủ đích để tiết kiệm hạn mức.

**Trường được định danh bằng tên** (vd `"THCS Huỳnh Tấn Phát"`), không có `schoolId`. Rules so khớp
`studentSchool in myProfile().schools`. Chuyển sang `schoolId` là migration dữ liệu + rules + Sheet, không
chỉ thêm field (xem §6, quyết định 4).

## 4. AUD-04 — Security Rules (`firestore.rules`, 423 dòng)

Đã đạt so với tiêu chí kế hoạch:
- ✅ Phân quyền theo vai trò: `admin`, `teacher` (cần `approved`), `coordinator`, `teaching_coordinator`.
- ✅ Không tự nâng quyền: tự đăng ký chỉ được `student`/`teacher` chưa duyệt; tự sửa chỉ `name`/`email`.
- ✅ Cách ly theo trường cho kết quả và roster (`isOwnSchoolField`), query bắt buộc có `limit`.
- ✅ Chỉ Admin sửa điểm (`quiz_results`, `mos_submissions` update).
- ✅ Kiểm tra schema/kiểu/khoảng giá trị khi tạo bản ghi; chặn né TTL.

Chưa đạt:
- ✅ Vai trò `school_admin` (02/11/2026): phạm vi như `coordinator` + sửa thông tin liên hệ trường mình.
- ℹ️ Đã có ma trận quyền theo hành động phía client: `js/core/rbac.js` (`EduRBAC.can(role, 'module.action')`).
  Thêm vai trò mới phải sửa cả file này lẫn `firestore.rules` và `js/auth.js` § `ROLE_LABEL`.
- ⚠️ Audit log: ghi qua Apps Script (`logActivity`, người làm lấy từ token) vào Sheet `NhatKyHoatDong`. Xoá bài và đẩy
  GitHub ghi phía server (`auditServer_`); roster và (từ 03/11/2026) Quản lý tài khoản ghi từ trang. Ghi từ trang
  vẫn bỏ qua được nếu người dùng tự gọi Firestore — muốn chặn hẳn phải chuyển thao tác đổi quyền sang Apps Script.
- ✅ `myProfile()` gọi `get()` nhiều lần mỗi request nhưng luôn cùng 1 document `users/{uid}` — Firestore gộp
  các lần đọc cùng document trong 1 request, tính **1 lượt đọc/request** (rà lại 03/11/2026). Không cần sửa.
- ⚠️ Chuyển tiếp tên → `schoolId` (03/11/2026): rule GHI roster chấp nhận tên **hoặc** `schoolId` trong phạm vi,
  nhưng chưa bắt 2 field khớp nhau → nhân sự có `schoolIds` gồm trường A sửa được `school` của học sinh thành
  "THCS B" mà giữ `schoolId` A, khiến em đó hiện trong danh sách trường B (chèn dữ liệu, không đọc được trường B).
  Sửa theo 2 bước: (1) ✅ Quản lý tài khoản ghi bù `schoolIds` cho mọi tài khoản; (2) sau khi (1) chạy trên bản
  thật: `canWriteRosterStudent` bắt `request.resource.data.schoolId in mySchoolIds()` (bỏ nhánh so tên khi ghi).
- ✅ Kiểm thử rules trên emulator: `tests/firestore-rules/` (CI job `rules`).

## 5. AUD-05 — Dữ liệu nhạy cảm

### 5.1 🔴 Danh sách học sinh công khai
> 03/11/2026: phương án 2 (mã lớp qua Apps Script) đã làm xong, **mặc định tắt** — `EduBackend.roster.mode`,
> `apps/src/75-roster-codes.gs`, quy trình bật trong CHANGELOG 03/11/2026. Còn lại (không hoàn tác được):
> gỡ file JSON + dọn lịch sử git sau khi đã phát mã lớp.

`data/roster/students-active.json` — **2.838 học sinh** (họ tên + trường + lớp) nằm trong git và được
phục vụ công khai qua GitHub Pages để sảnh chọn tên. Đây là dữ liệu cá nhân của trẻ vị thành niên, ai có
URL cũng tải được, và còn nằm trong lịch sử git kể cả khi xoá file.
Phương án (cần quyết định):
1. Giữ file tĩnh nhưng chỉ lưu **tên viết tắt / mã lớp**, học sinh chọn trong lớp mình (giảm mức lộ).
2. Chuyển roster sau một **mã lớp** do giáo viên phát: Apps Script trả danh sách theo mã (0 lượt Firebase).
3. Sau khi chọn, dọn lịch sử git (`scripts/shrink-git-history.py` đã có tiền lệ) và force-push.

### 5.2 Khoá API
| Khoá | Vị trí | Đánh giá |
|---|---|---|
| Firebase web apiKey | `js/firebase-config.js` | Công khai theo thiết kế — OK |
| Google Drive API key | `mos/js/config.js` | **Kiểm tra trong Google Cloud Console** đã giới hạn HTTP referrer + chỉ bật Drive API chưa. Nếu chưa → đặt giới hạn hoặc xoay khoá |
| Apps Script `/exec` URL | `backend-config.js`, `googleSheet.js`, `mos/js/config.js` | URL công khai; route quản trị có xác thực Firebase ID token (`20-auth.gs`) — OK. Route công khai (`submitExam`, `mosSubmit`) giả mạo được |
| Token GitHub | Trong Apps Script Properties, không trong repo | OK |

Không tìm thấy private key, `sk-…`, AWS key trong repo.

### 5.3 Toàn vẹn kết quả thi
> 02/11/2026: đã đóng ghi công khai `mos_submissions` (web không còn dùng) và ghi `questions`.
> 03/11/2026: lộ trình chấm điểm phía máy chủ + bước 0 (luật chấm dùng chung) — [SERVER-GRADING.md](SERVER-GRADING.md).

- **Đáp án nằm trong file JSON công khai** (`data/ic3/**`, field `correct`) và **điểm tính ở trình duyệt**.
  Học sinh có thể đọc đáp án hoặc gửi điểm tuỳ ý tới `submitExam` / `mos_submissions`.
- Với *ôn luyện* đây là đánh đổi chấp nhận được (offline, 0 lượt). Với *kiểm tra chính thức* thì không đạt
  tiêu chí "không lộ đáp án / chấm phía server" của kế hoạch.

## 6. Những chỗ kế hoạch 2.0 mâu thuẫn với hệ thống hiện tại — cần chốt

| # | Kế hoạch giả định | Thực tế | Đề xuất |
|---|---|---|---|
| 1 | Học sinh có tài khoản (role `student`, `studentProfiles` theo UID, Student Dashboard) | Học sinh **không đăng nhập**, chọn tên ở sảnh; đây là lý do hệ thống chạy được trong hạn mức Spark | Giữ không đăng nhập cho ôn luyện. Nếu cần hồ sơ đa thiết bị → "mã học tập" như Ngưỡng D của ROADMAP, không bắt buộc Google login |
| 2 | Kết quả lưu Firestore (`attempts`, `results`) | Bài nộp đi **Google Sheet** (`NhatKyNopBai`); `quiz_results` đã tắt để tiết kiệm lượt ghi | Dashboard đọc qua Repository, nguồn là Sheet (`sheet-results-api.js`). Không mở lại Firestore khi chưa lên Blaze |
| 3 | Chấm server bằng Cloudflare Workers | Apps Script đã là backend có xác thực, giữ bí mật được | Chấm server **trong Apps Script** chỉ cho đề *Kiểm tra*: đáp án đề kiểm tra để ở Sheet/Properties, không đưa lên Pages. Không thêm Cloudflare ở giai đoạn này |
| 4 | `schoolId` trên mọi bản ghi + collection `schools` | Trường định danh bằng tên chuỗi ở Firestore, Sheet, roster JSON | ✅ **Đã chốt + làm bước 1 (02/11/2026):** `schools/{schoolId}`, `users.schoolIds`, rules nhận tên hoặc `schoolId`. `students_roster`/`classes` tự ghi + ghi bù `schoolId` (02/11/2026). Bài nộp trên Sheet: Apps Script so theo `schoolId` suy từ tên (02/11/2026). Còn lại: `mos_submissions`/`quiz_results` (Firestore, vẫn so theo tên), rồi bỏ nhánh so theo tên. Rủi ro: 2 trường tên chỉ khác dấu ra cùng `schoolId` — Quản lý tài khoản đã cảnh báo |

Vai trò — ánh xạ đề xuất: `super_admin` = `admin` hiện có; thêm `school_admin`; giữ `coordinator`,
`teacher`; **giữ `teaching_coordinator`** (kế hoạch bỏ sót, đang dùng cho lịch dạy); `student` chỉ dùng khi
chốt quyết định 1.

## 7. AUD-06 — Module giữ lại

| Module | File chính | Quyết định |
|---|---|---|
| Quiz Engine | `js/quiz-engine.js`, `index.html` | Giữ, không tách lớn |
| IC3 Learning / Góc học tập | `js/learning-hub.js`, `data/ic3` | Giữ, mở rộng nội dung |
| MOS Simulator | `mos/`, `computer-simulator.html` | Giữ — có test rubric riêng |
| Hotspot | `hotspot-editor.html` | Giữ |
| Arena / Gamification | `js/arena/`, `arena.html`, `js/gamification.js` | Giữ — có test |
| Offline | `sw.js`, `js/offline-pack.js`, `pending-sync-queue.js` | Giữ |
| Teacher Dashboard | `teacher-dashboard.html`, `js/teacher/` | Nâng cấp dần |
| Coordinator Dashboard | `coordinator-dashboard.html`, `js/coordinator/` | Nền tảng tốt nhất để mở rộng thành Admin/School Dashboard |
| Admin | `admin-users.html`, `ic3-dashboard.html` | Gộp vào Dashboard 2.0 |
| Repository/Service | `js/repositories/`, `js/services/` | **Đã có** — mở rộng thay vì tạo `firebase/repositories/` mới. `users` đã đi qua `user-repository.js` (02/11/2026), chỉ còn `js/auth.js` đọc hồ sơ của chính mình |
| Firestore `questions` | — | Ứng viên dọn (không ai đọc) |

## 8. Đề xuất thứ tự Sprint 1

1. Xử lý §5.1 (roster công khai) và kiểm tra §5.2 (Drive key) — trước mọi tính năng mới.
2. Chốt 4 quyết định ở §6.
3. Dashboard 2.0 xây trên `coordinator-dashboard` + `js/repositories` có sẵn, nguồn dữ liệu kết quả là Sheet.
4. `user-repository.js` + collection `schools` (song song tên trường) + vai trò `school_admin` trong rules.
5. Chấm server cho đề Kiểm tra trong Apps Script.
