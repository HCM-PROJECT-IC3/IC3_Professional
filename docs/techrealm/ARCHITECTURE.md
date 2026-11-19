# TechRealm 2.0 — Kiến trúc hệ thống

> 16/11/2026 · Trạng thái: **bản đề xuất, chưa triển khai**. Dựa trên [TECHREALM_2.0_AUDIT.md](../../TECHREALM_2.0_AUDIT.md).
> Bộ tài liệu: **ARCHITECTURE** · [DATABASE_SCHEMA](DATABASE_SCHEMA.md) · [FIREBASE_SECURITY](FIREBASE_SECURITY.md) ·
> [MODULE_DEPENDENCIES](MODULE_DEPENDENCIES.md) · [MIGRATION_PLAN](MIGRATION_PLAN.md)

## 0. Giả định đang dùng (chưa được xác nhận)

Câu Q1–Q8 của bản audit chưa được trả lời. Bộ tài liệu này dùng **phương án khuyến nghị** của audit. Mỗi giả định ghi rõ
phần nào phải sửa nếu bạn chọn khác.

| # | Giả định | Nếu chọn khác thì sửa |
|---|---|---|
| A1 (Q1) | Học sinh **không** có tài khoản Firebase. Danh tính là **mã học tập** 8 ký tự do giáo viên phát | Toàn bộ §3 FIREBASE_SECURITY, schema nhóm học sinh chuyển sang Firestore + phải lên Blaze (xem §4 dưới) |
| A2 (Q2) | EXP chia 2 tầng: *Tu vi luyện tập* (trên máy, không xác thực) và *Công huân* (sổ cái do Apps Script ghi) | Module Cultivation |
| A3 (Q4) | File sản phẩm lưu Google Drive qua Apps Script, không dùng Firebase Storage | Module Project Workshop |
| A4 (Q6) | TechRealm là khu riêng `/app/#/the-gioi` trong React 2.0; sảnh cũ `index.html` giữ nguyên làm mặc định | Lớp Presentation |
| A5 | Gói Firebase **Spark**, ngân sách 60% (30.000 đọc / 12.000 ghi mỗi ngày) giữ nguyên | §4 |

## 1. Nguyên tắc kiến trúc

1. **Không viết lại.** TechRealm là lớp mới trên EduQuiz. Trang cũ, `js/quiz-engine.js`, định dạng `data/ic3`, tab Sheet và
   collection đang có **không đổi cấu trúc**; chỉ được *thêm* field tuỳ chọn, tab mới, collection mới.
2. **Dữ liệu ở đúng nơi rẻ nhất** (giữ nguyên BACKEND-MAP):
   - *Nội dung* (khoá học, bài, câu hỏi, danh mục thành tựu/nhiệm vụ/vật phẩm) → **file tĩnh**, 0 chi phí, chạy offline.
   - *Sự kiện của học sinh* (bài làm, giao dịch EXP, bài nộp nhiệm vụ/sản phẩm) → **Google Sheet qua Apps Script**.
   - *Dữ liệu quản trị ít, cần phân quyền chặt* (tài khoản, trường, lớp, phân công, cài đặt) → **Firestore**.
   - *Trạng thái chơi cục bộ* (tu vi luyện tập, linh thạch, vật phẩm trang trí) → **localStorage**.
3. **Tách 3 miền dữ liệu** (yêu cầu Master Prompt §7): Học tập · Trò chơi · Quản trị. Không bản ghi nào chứa field của
   2 miền; liên kết bằng khoá (`learnerId`, `uid` câu hỏi, `classId`).
4. **Máy chủ quyết định mọi phần thưởng có giá trị.** Trình duyệt không bao giờ gửi *số EXP*; chỉ gửi *bằng chứng*
   (câu trả lời, file), Apps Script tính và ghi.
5. **Luật nghiệp vụ là hàm thuần dùng chung.** Cùng một file Domain chạy trong trình duyệt, Node (test) và Apps Script
   (bản sao được test so khớp, như `js/core/grading.js` ↔ `apps/src/77-grading.gs` hiện nay).
6. **Học sinh 0 lượt Firebase.** E2E `netlog-check` giữ luật này.

## 2. Sơ đồ tổng thể

```
                         ┌─────────────────────── Trình duyệt ───────────────────────┐
  Học sinh (mã học tập)  │  /app/#/the-gioi  (React, TechRealm)    index.html (cũ)   │
  ─────────────────────► │      │  đọc                                │ làm bài      │
                         │      ▼                                     ▼              │
                         │  Domain thuần js/techrealm/*   ◄── js/core/grading.js     │
                         │      │                                                    │
                         │  localStorage: techrealm_v1 (tu vi) + khoá eduquiz_* cũ   │
                         └──────┼──────────────────────────────┬─────────────────────┘
                                │ fetch tĩnh                    │ POST (mã học tập / mã phiên)
                                ▼                               ▼
                 GitHub Pages / Cloudflare            Google Apps Script (backend)
                 data/ic3/**  data/techrealm/**        ├─ 77-grading.gs (chấm)
                 (nội dung, 0 chi phí)                 ├─ 79-tr-*.gs (TechRealm, mới)
                                                       ├─ Google Sheet: TR_* tabs, NhatKyNopBai
                                                       └─ Google Drive: sản phẩm học sinh
                                                                ▲
  Giáo viên / Admin (Firebase Auth) ── ID token ────────────────┘
          │
          └── Firestore (Spark): users, schools, classes, students_roster,
                                 teacher_assignments*, system_settings*   (* mới)
```

## 3. Module

Mỗi module: trách nhiệm · dữ liệu sở hữu · nơi đặt mã · trạng thái hiện tại. "Sở hữu" = chỉ module đó được ghi.

| # | Module | Trách nhiệm | Sở hữu dữ liệu | Mã (dự kiến) | Hiện trạng |
|---|---|---|---|---|---|
| M1 | **Authentication** | Đăng nhập nhân sự (Firebase Auth); xác minh **mã học tập** của học sinh; cấp/kiểm **mã phiên** khảo hạch; đăng xuất khi không thao tác | `users` (phần `role`, `approved`); Sheet `TR_HocVien` (cột trạng thái mã) | `js/auth.js`, `js/auth-guard.js` (cũ) · `apps/src/20-auth.gs` (cũ) · `apps/src/79-tr-identity.gs` (mới) | Nhân sự: có. Học sinh: chưa (mã lớp có, tắt) |
| M2 | **User Profile** | Hồ sơ hiển thị: tên, danh hiệu đang đeo, linh vật đại diện. Học sinh chỉ đổi các field cho phép | `users` (`name`, `email`); `TR_HocVien.hienThi` | `web/src/features/techrealm/profile/` | Nhân sự: có |
| M3 | **Student Management** | Danh sách học sinh thật; cấp/thu hồi mã học tập; gắn học sinh ↔ lớp | `students_roster`; `TR_HocVien` | `js/roster-manager.js` (cũ) + màn cấp mã (mới) | Có roster; chưa có mã học tập |
| M4 | **Class Management** | Lớp, trường, phân công giáo viên ↔ lớp | `schools`, `classes`, `teacher_assignments` (mới) | `js/repositories/roster-repository.js`, repository mới | Có lớp; phân công chỉ là `classes.teacherId` (1 GV) |
| M5 | **Cultivation** | Tính cảnh giới, linh căn, tu vi; ghi sổ cái công huân; chống cộng trùng | `TR_SoCai`, `TR_TuVi`; `techrealm_v1` (local) | `js/techrealm/realm-core.js`, `ledger-core.js`, `linh-can-core.js` · `apps/src/79-tr-ledger.gs` | Chưa có (gamification XP cục bộ có sẵn) |
| M6 | **Learning** | Tàng Kinh Các: công pháp → chương → bài, ánh xạ lên `data/ic3`; cây kỹ năng; tiến độ | `data/techrealm/cong-phap.json`, `skill-tree.json` (tĩnh) | `web/src/features/techrealm/tang-kinh-cac/` · `js/techrealm/skill-tree.js` | Nội dung IC3 có; lớp ánh xạ chưa có |
| M7 | **Quiz** | Làm bài luyện/kiểm tra (cũ); **Khảo hạch** đề kín chấm trên máy chủ (mới) | `NhatKyNopBai` (cũ); `TR_DeKhaoHach`, `TR_KhaoHach` (mới) | `js/quiz-engine.js` (cũ, không sửa) · `apps/src/77-grading.gs` · `79-tr-exam.gs` | Luyện/kiểm tra có; khảo hạch chưa |
| M8 | **Quest** | Nhiệm vụ: hệ thống (theo ngày/mùa) và do giáo viên giao; nhận bài nộp; duyệt | `data/techrealm/quests.json`; `TR_NhiemVu`, `TR_NopNhiemVu` | `79-tr-quest.gs`, `features/techrealm/nhiem-vu/` | Nhiệm vụ ngày/mùa thi cục bộ có |
| M9 | **Challenge** | Bí cảnh, câu đố, logic, lập trình, Boss; chấm luyện tập trên máy | `data/techrealm/bi-canh/*.json`; `techrealm_v1.biCanh` | `features/techrealm/bi-canh/` + game cũ qua iframe `?arena=1` | Mini-game, Đấu Boss có |
| M10 | **Inventory** | Linh thạch, pháp bảo trang trí, linh vật | `techrealm_v1.linhThach/phapBao`; đọc `eduquiz_arena_v1` | `js/techrealm/inventory-core.js` | Xu + Linh vật có |
| M11 | **Achievement** | Danh mục thành tựu; xét đạt (luyện tập: trên máy; chính thức: từ sổ cái) | `data/techrealm/achievements.json`; `TR_TuVi.thanhTuu` | `js/techrealm/achievement-core.js` | 12 huy hiệu cục bộ có |
| M12 | **Leaderboard** | Xếp hạng lớp/trường **chỉ từ công huân đã xác nhận** | Không sở hữu — đọc `TR_TuVi` | `79-tr-board.gs` (đệm 10 phút) | Thi đua lớp cục bộ có |
| M13 | **Project Workshop** | Bách Công Phường: dự án, nộp file, chấm rubric, portfolio, chứng nhận | `data/techrealm/projects.json`; `TR_DuAn`, `TR_SanPham`; thư mục Drive | `79-tr-workshop.gs`, `features/techrealm/bach-cong-phuong/` | Chưa có |
| M14 | **Science Lab** | Bài thí nghiệm/mô phỏng khối F; chạy trên máy | `data/techrealm/labs/**` | `features/techrealm/labs/` | Chưa có nội dung |
| M15 | **Teacher Dashboard** | Lớp được phân công: tiến độ, câu hay sai, mở phiên khảo hạch, giao nhiệm vụ, duyệt sản phẩm | Không sở hữu — gọi M4, M5, M7, M8, M13 | `web/src/features/teacher/` (có) + tab TechRealm | Có (bản 2.0 + cũ) |
| M16 | **Admin Dashboard** | Tài khoản, trường, phân công, đề khảo hạch, cài đặt hệ thống, điều chỉnh sổ cái | `system_settings` (mới) | `web/src/features/admin/` (có) | Có phần tài khoản |

Phụ trợ dùng chung (không phải module nghiệp vụ): `apps-script-client.js`, `pending-sync-queue.js` (gửi lại khi mất
mạng), `States.tsx` (loading/empty/error), `rbac.js`.

### 3.1 Ranh giới bắt buộc

- M5 Cultivation là **nơi duy nhất ghi sổ cái**. M7, M8, M13 chỉ *phát sự kiện đã xác minh* (`SourceEvent`) cho M5;
  M5 tra bảng thưởng và ghi giao dịch.
- M12 Leaderboard, M11 Achievement (chính thức) chỉ **đọc** ảnh chụp `TR_TuVi` do M5 tính.
- Module trình bày (`features/techrealm/*`) không gọi Firestore/Apps Script trực tiếp; đi qua service của module.

## 4. Vì sao dữ liệu học sinh không nằm ở Firestore

Prompt 01 liệt kê `quizAttempts`, `experienceTransactions`, `cultivationProfiles`… là collection Firestore. Ước lượng với
quy mô hiện tại (3.000 học sinh hoạt động/ngày, 3 bài/HS — số đo trong ROADMAP):

| Thao tác mỗi ngày | Ghi Firestore |
|---|---|
| `quizAttempts`: 3.000 × 3 | 9.000 |
| `experienceTransactions`: ≥ 1 giao dịch/bài | 9.000 |
| `cultivationProfiles`: cập nhật sau mỗi giao dịch | 9.000 |
| **Tổng** | **27.000** — vượt trần cứng 20.000 ghi/ngày của Spark, gấp 2,25 lần ngân sách 12.000 |

Thêm vào đó: học sinh không có Firebase Auth thì rules không phân biệt được "học sinh này" với "người lạ", nên
collection học sinh tự ghi sẽ phải mở công khai. Vì vậy:

- **Thiết kế logic giữ đủ 20 thực thể** Prompt 01 yêu cầu, cùng tên trường và kiểu dữ liệu (DATABASE_SCHEMA §2).
- **Nơi lưu vật lý** chọn theo khối lượng: thực thể học sinh → Sheet; thực thể quản trị → Firestore; nội dung → file tĩnh.
- Tầng Repository che nơi lưu. Khi lên Blaze (ROADMAP Ngưỡng A), đổi một thực thể từ Sheet sang Firestore chỉ là viết
  adapter mới; schema và mã nghiệp vụ không đổi.

## 5. Luồng chính

### 5.1 Học sinh luyện tập (giữ nguyên, thêm tu vi)
1. Làm bài ở `index.html` như cũ → `eduquiz_records` + `NhatKyNopBai` (không đổi).
2. `/app/#/the-gioi` đọc `eduquiz_records`, `eduquiz_gamestate`, `eduquiz_arena_v1` → `realm-core` tính **tu vi luyện tập**,
   mức nắm vững, linh căn → hiển thị. 0 lượt mạng.

### 5.2 Khảo hạch lên cảnh giới (công huân)
1. Giáo viên mở phiên cho lớp (`trSessionOpen`, ID token) → mã phiên 6 ký tự, hạn 45 phút.
2. Học sinh nhập mã học tập + mã phiên → `trExamOpen` trả đề **đã bỏ đáp án** + `attemptToken` (ký HMAC).
3. Nộp → `trExamSubmit`: kiểm token, hạn, chưa nộp lần nào → chấm bằng `77-grading.gs` → ghi `TR_KhaoHach`
   → phát `SourceEvent{type:'KHAO_HACH', sourceId: attemptId}` → M5 ghi `TR_SoCai` (khoá chống trùng) → tính lại `TR_TuVi`.
4. Trả kết quả + cảnh giới mới. Mất mạng lúc nộp: `pending-sync-queue` gửi lại; khoá chống trùng đảm bảo không cộng 2 lần.

### 5.3 Sản phẩm Bách Công Phường
Học sinh nộp file (`trWorkSubmit`, ≤ 5 MB) → Drive + `TR_SanPham(status=submitted)` → giáo viên chấm rubric
(`trReview`) → `SourceEvent{type:'SAN_PHAM', sourceId: submissionId}` → M5.

## 6. Xử lý lỗi, trạng thái giao diện, responsive

- Mọi màn có 3 trạng thái dùng `web/src/components/shared/States.tsx`: loading (skeleton), empty (hướng dẫn việc tiếp theo),
  error (lời ngắn + nút Thử lại).
- Lỗi mạng: thao tác đọc dùng bản đệm gần nhất kèm nhãn "dữ liệu lúc HH:MM"; thao tác ghi xếp `pending-sync-queue`
  (có sẵn) — riêng khảo hạch báo rõ "Bài đã lưu trên máy, sẽ gửi khi có mạng".
- Apps Script trả mã lỗi chuẩn (`appError_`: `invalid-argument`, `permission-denied`, `not-found`, `resource-exhausted`,
  `already-exists`); client ánh xạ sang lời tiếng Việt ở 1 chỗ.
- Responsive: kiểm 375px trong E2E như bản 2.0 hiện có.

## 7. Công nghệ — không thêm gì mới

React 19 + Vite + Tailwind (đã có trong `web/`), Apps Script, Firestore Spark, Google Sheet/Drive. Không thêm Cloud
Functions, Firebase Storage, máy chủ trả phí hay thư viện state toàn cục. Trạng thái học sinh: hook + localStorage
adapter (mẫu `useStudent.ts`, `useStorageVersion.ts` có sẵn).
