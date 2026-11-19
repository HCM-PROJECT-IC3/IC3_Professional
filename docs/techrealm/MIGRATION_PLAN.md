# TechRealm 2.0 — Kế hoạch chuyển đổi

> 16/11/2026 · Bản đề xuất. Mỗi giai đoạn chỉ bắt đầu khi bạn đồng ý. Thứ tự deploy giữ như cũ:
> **Apps Script → `firestore.rules`/index → web**.

## 1. Cam kết không phá dữ liệu cũ

| Dữ liệu cũ | Cam kết |
|---|---|
| `data/ic3/**`, `meta.json`, manifest | Không sửa định dạng; TechRealm chỉ tham chiếu |
| Tab `NhatKyNopBai`, `NhatKyMOS`, `NhatKyDauTruong`, `NhatKyHoatDong`, `MaLop` | Không thêm/đổi cột. Duy nhất: khoá `lid` tuỳ chọn trong JSON cột `ChiTiet` |
| Firestore `users`, `schools`, `students_roster`, `courses`, `teaching_*`, `gvlab_*` | Không đổi |
| Firestore `classes` | Chỉ thêm field tuỳ chọn `teacherIds`, `updatedAt` |
| localStorage `eduquiz_*`, `ic3_*`, `sodaubai_*` | Chỉ đọc |
| 25 trang gốc, `sw.js`, `manifest.webmanifest` | Không sửa (trừ khi một giai đoạn nêu rõ và được duyệt) |
| Giá trị `role` | Không đổi tên |

Kiểm chứng tự động: `check-legacy-paths.js`, E2E 148 kiểm hiện có phải xanh ở mọi giai đoạn.

## 2. Các giai đoạn

| GĐ | Nội dung | Tạo mới | Sửa | Firebase thêm/ngày | Apps Script thêm/ngày | Rút lại |
|---|---|---|---|---|---|---|
| **0** | Chốt Q1–Q8. Bật `roster.mode = 'class-code'`, phát mã lớp, gỡ `data/roster/students-active.json`, dọn lịch sử git | — | `js/backend-config.js`; xoá file roster | 0 | ~1/HS/6 giờ (đã có) | Đặt lại `'public-json'` (trước khi dọn git) |
| **1** | Domain thuần + nội dung ánh xạ | `js/techrealm/{realm,ledger,linh-can,achievement,inventory}-core.js`, `skill-tree.js`, `data/techrealm/*.json`, test | `scripts/check-architecture.js` (`PURE_EXTRA`), `scripts/validate-data.js` (kiểm `nguon`) | 0 | 0 | Revert |
| **2** | Giao diện tầng luyện tập: Thế giới, Tàng Kinh Các, Hồ sơ (khách), Bí cảnh, Kho đồ, Thành tựu | `web/src/features/techrealm/**`, E2E `techrealm.mjs` | `web/src/app/router.tsx`, `navigation.ts`; build `app/` | 0 | 0 | Ẩn route |
| **3** | Phân công giáo viên | `teacher_assignments`, `teacher-assignment-repository.js`, màn phân công trong Admin 2.0, test rules | `firestore.rules` (§5 FIREBASE_SECURITY), `classes.teacherIds` | Đọc ≤ 500, ghi ≤ 50 | 0 | Rules cũ + bỏ đọc field |
| **4** | Mã học tập | `apps/src/79-tr-identity.gs`, tab `TR_HocVien`, màn cấp mã (GV/AD), nhập mã (HS) | `10-router.gs`, `BACKEND_VERSION` | 0 (AS dùng token GV: ~5 đọc/GV/giờ) | ≤ 3.000 | Tắt cờ `techrealm.learnerCodes` |
| **5** | Khảo hạch + sổ cái + cảnh giới chính thức | `79-tr-exam.gs`, `79-tr-ledger.gs`, `79-tr-core.gs`, tab `TR_DeKhaoHach`, `TR_PhienKhaoHach`, `TR_KhaoHach`, `TR_SoCai`, `TR_TuVi`; Script Properties `TR_HMAC_SECRET`, `TR_CODE_PEPPER` | `serverGrading` dùng lại | 0 | ~2/lượt khảo hạch | Tắt `khaoHachEnabled`; sổ cái giữ nguyên |
| **6** | Bảng xếp hạng + thành tựu chính thức | `79-tr-board.gs`, UI | — | 0 | ≤ 1/lớp/10 phút | Ẩn |
| **7** | Nhiệm vụ GV + Bách Công Phường | `79-tr-quest.gs`, `79-tr-workshop.gs`, tab `TR_NhiemVu`, `TR_NopNhiemVu`, `TR_DuAn`, `TR_SanPham`, thư mục Drive | Teacher Dashboard 2.0 | 0 | ≤ 1/lần nộp, ≤ 1/lần duyệt | Tắt cờ |
| **8** | Science Lab + thử thách logic/lập trình | `data/techrealm/labs/**`, `bi-canh/**`, Web Worker chạy code | — | 0 | 0 | Ẩn |
| **9** | Nghiệm thu, hướng dẫn giáo viên, PR → `main` | `docs/techrealm/NGHIEM-THU.md` | `CHANGELOG.md` | — | — | Revert commit gộp |

Mỗi giai đoạn bàn giao đúng mẫu Master Prompt §8: file tạo, file sửa, chức năng xong / chưa xong, kết quả test, lỗi còn lại,
cách chạy.

## 3. Di trú dữ liệu

### 3.1 Phân công giáo viên (GĐ 3) — backfill một lần
1. Đọc `classes` (≈ 150 document, Admin, 1 lần).
2. Mỗi lớp có `teacherId` → tạo `teacher_assignments/{classId}__{teacherId}__2026-2027`
   `{ role: 'bo-mon', status: 'active', schoolId: classes.schoolId }` và đặt `classes.teacherIds = [teacherId]`.
3. Lớp thiếu `schoolId` → bỏ qua, liệt kê để Admin xử lý tay (không đoán).
4. Chạy thử (dry-run) in báo cáo trước; ghi bằng `EduBaseRepository.commitBatch` (lô ≤ 450).
5. Chi phí: ~150 đọc + ~300 ghi, một lần.
6. `teacherId` cũ **giữ nguyên**; trang cũ không bị ảnh hưởng.

### 3.2 Mã học tập (GĐ 4)
1. Nguồn: `students_roster` đang `active` (Admin xuất từ Quản lý học sinh, cùng nội dung đẩy `publishRosterCodes`).
2. Apps Script tạo `learnerId` + mã cho từng học sinh chưa có dòng trong `TR_HocVien` (khớp theo `RosterId`; nếu roster
   được nạp lại với id mới, khớp phụ theo `schoolId + className + name` và **cảnh báo**, không tự gộp).
3. Trả CSV/phiếu in mã cho giáo viên **một lần**; Sheet chỉ giữ bản băm.
4. Học sinh chưa nhập mã vẫn dùng mọi thứ như cũ (chế độ khách).

### 3.3 Tu vi luyện tập (GĐ 2) — không di trú
Tính tại chỗ từ `eduquiz_records` + `eduquiz_gamestate` trên máy. Không ghi đè khoá cũ. Lần đầu học sinh nhập mã trên một
máy, hỏi "Gắn tiến độ luyện tập trên máy này cho em?" — vì máy dùng chung có thể chứa bài của bạn khác.

### 3.4 Công huân lịch sử — không truy thưởng tự động
Bài nộp cũ trong `NhatKyNopBai` không có `learnerId` và không được chấm lại trên máy chủ → **không** chuyển thành công
huân. Mọi học sinh bắt đầu Cảnh giới chính thức từ Luyện Khí. Nếu bạn muốn ghi nhận quá khứ, phương án an toàn: giáo
viên cho bài **Khảo hạch xếp cấp** đầu năm.

## 4. Rủi ro riêng của việc chuyển đổi

| # | Rủi ro | Giảm thiểu |
|---|---|---|
| M1 | Dọn lịch sử git (GĐ0) làm hỏng bản clone của người khác, mất commit | Tag mốc, báo trước, chỉ làm sau khi mã lớp chạy ổn ≥ 1 tuần |
| M2 | Roster nạp lại đổi `rosterId` → mất liên kết mã học tập | `learnerId` độc lập; khớp phụ có cảnh báo (§3.2) |
| M3 | Cả lớp 40 em mở khảo hạch cùng lúc → chạm 30 lượt Apps Script song song | Client rải 0–20 giây khi mở đề; `trExamOpen` đệm đề theo phiên; khảo hạch một lớp/thời điểm/trường; máy chủ trường gom lô nếu có |
| M4 | `TextFinder` chậm khi `TR_SoCai` lớn | Xoay vòng tab theo năm học; bản đệm `TxId` 6 giờ; đo ở GĐ5 với 300.000 dòng giả lập |
| M5 | Lệch phiên bản Apps Script và web | `BACKEND_VERSION` + `check-deployed-backend.js` có sẵn; web ẩn tính năng khi backend cũ |
| M6 | Đổi luật cảnh giới sau khi đã chạy | `PhienBanLuat` trong `TR_TuVi`; tính lại toàn bộ bằng 1 hàm admin; không bao giờ hạ cảnh giới đã đạt trừ khi có giao dịch `DAO` |
| M7 | Giả định A1–A5 bị bác bỏ | Mỗi giả định ghi rõ phần phải sửa (ARCHITECTURE §0). A1 bị bác bỏ = phải lên Blaze trước GĐ4 |

## 5. Cách chạy dự án (không đổi so với hiện tại)

```bash
# Trang cũ + app 2.0 đã build
npx http-server@14.1.1 -p 8770 -c-1 -s .        # mở http://127.0.0.1:8770/app/
# Phát triển app 2.0
cd web && npm ci && npm run dev
# Kiểm tra trước khi đẩy
node scripts/validate-data.js && node scripts/check-js.js && node scripts/check-architecture.js
cd web && npm run typecheck && cd ../tests/e2e && npm test
```

## 6. Việc cần bạn quyết định trước GĐ0

1. Trả lời Q1–Q8 trong `TECHREALM_2.0_AUDIT.md` §6.1, hoặc xác nhận dùng giả định A1–A5.
2. Thời điểm phát mã lớp và gỡ roster công khai (nên tránh tuần thi).
3. Năm học dùng làm `schoolYear` cho phân công (`2026-2027`?).
4. Ai giữ vai trò Super Admin (người được tạo đề khảo hạch và đảo giao dịch).
