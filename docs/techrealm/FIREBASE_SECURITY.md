# TechRealm 2.0 — Phân quyền & Bảo mật

> 16/11/2026 · Bản đề xuất. Rules dưới đây là **bản nháp để duyệt**, chưa sửa `firestore.rules`.
> Liên quan: [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md), `firestore.rules` hiện tại, `apps/src/20-auth.gs`, `js/core/rbac.js`.

## 1. Vai trò

Prompt 01 yêu cầu 4 vai trò. Giá trị `role` đang lưu trong `users` **không đổi tên** (đổi = sửa hàng trăm document, rules,
Apps Script, `rbac.js`, và làm hỏng phiên đang đăng nhập). Ánh xạ:

| Vai trò Prompt 01 | Giá trị `role` | Xác thực | Phạm vi |
|---|---|---|---|
| **Super Admin** | `admin` | Firebase Auth | Toàn hệ thống |
| **Admin** | `school_admin`, `coordinator` | Firebase Auth | Trường trong `users.schools` / `schoolIds` |
| **Teacher** | `teacher` + `approved == true` | Firebase Auth | Lớp có `uid ∈ classes.teacherIds` (mới); kết quả theo trường như cũ |
| **Student** | *(không có tài khoản)* | **Mã học tập** qua Apps Script | Dữ liệu có `learnerId` của chính mình |
| (giữ nguyên) | `teaching_coordinator` | Firebase Auth | Lịch dạy — ngoài TechRealm |

Ghi chú: rules hiện cho phép tự đăng ký `role: 'student', approved: true`. Vai trò này **không có quyền gì** trong rules và
TechRealm **không bao giờ** cấp quyền dựa trên `role == 'student'`. Giữ nguyên để không phá luồng đăng ký cũ.

## 2. Ma trận quyền

✔ = được · 🔸 = trong phạm vi · ✖ = không · "AS" = chỉ qua Apps Script (không chạm Firestore/Sheet trực tiếp)

| Dữ liệu | Student | Teacher | Admin | Super Admin |
|---|---|---|---|---|
| Hồ sơ của mình: tên hiển thị, danh hiệu, linh vật | Đọc/sửa (AS) | Đọc/sửa `name/email` | như Teacher | ✔ |
| Mã học tập | Đổi mã của mình (AS, cần mã cũ) | Cấp/thu hồi 🔸 lớp được phân công | 🔸 trường | ✔ |
| `users` (vai trò, duyệt) | ✖ | ✖ | ✖ | ✔ |
| `schools` | ✖ | Đọc | Đọc; `school_admin` sửa liên hệ trường mình | ✔ |
| `classes` | ✖ | Đọc 🔸 lớp được phân công **(mới)** | Đọc/ghi 🔸 | ✔ |
| `students_roster` | ✖ | Đọc HS có `teacherId` = mình (như cũ) | Đọc/ghi 🔸 | ✔ |
| `teacher_assignments` | ✖ | Đọc của mình | Đọc/ghi 🔸 | ✔ |
| Công huân, cảnh giới (`TR_TuVi`, `TR_SoCai`) | Đọc của mình (AS) | Đọc 🔸 lớp; duyệt `pending` 🔸 | Đọc 🔸; đảo giao dịch 🔸 | ✔ |
| Đề khảo hạch (`TR_DeKhaoHach`) | Nhận đề **không đáp án** trong phiên mở (AS) | Mở phiên 🔸 lớp; không xem đáp án | Mở phiên 🔸 | Tạo/sửa đề |
| Bài khảo hạch (`TR_KhaoHach`) | Nộp; xem của mình (AS) | Xem 🔸; huỷ bài (gian lận) 🔸 | Xem/huỷ 🔸 | ✔ |
| Nhiệm vụ (`TR_NhiemVu`) | Xem nhiệm vụ lớp mình (AS) | Tạo/sửa 🔸 lớp được phân công | 🔸 | ✔ |
| Bài nộp nhiệm vụ / sản phẩm | Nộp; xem của mình (AS) | Xem/duyệt 🔸 | Xem 🔸 | ✔ |
| Bảng xếp hạng | Xem lớp/trường mình (AS, tên hiển thị) | 🔸 | 🔸 | ✔ |
| `system_settings` | ✖ (đọc cấu hình tĩnh) | Đọc | Đọc | Ghi |
| Bí mật (Script Properties) | ✖ | ✖ | ✖ | Qua Apps Script editor |

"Giáo viên chỉ quản lý lớp được phân công" được thực thi ở **2 nơi**: Firestore rules (`classes`, `teacher_assignments`) và
Apps Script (`trClassScope_` lấy danh sách lớp bằng chính ID token của giáo viên → rules quyết định, Apps Script không tự
suy luận quyền).

## 3. Xác thực học sinh bằng mã học tập

### 3.1 Vì sao không dùng Firebase Auth cho học sinh
Xem ARCHITECTURE §4: hạn mức Spark và quyết định "học sinh không đăng nhập" (12/11/2026). Đổi lại, mọi dữ liệu học sinh
đi qua Apps Script, nơi giữ được bí mật và tự kiểm quyền.

### 3.2 Thiết kế mã
- 8 ký tự từ bảng 32 ký tự (bỏ `I O 0 1`) → 32⁸ ≈ 1,1 × 10¹² tổ hợp. Với ~3.000 mã đang dùng, đoán ngẫu nhiên 1 lần trúng
  xác suất ≈ 3 × 10⁻⁹.
- Sinh từ `Utilities.getUuid()` (cùng cách `newRosterCode_` đang dùng).
- Lưu `CodeHash = SHA-256(TR_CODE_PEPPER + code)`; `TR_CODE_PEPPER` ở Script Properties. Lộ Sheet không lộ mã.
- Giáo viên nhận mã **một lần** (phiếu in / CSV lúc cấp). Quên mã → cấp mã mới, mã cũ hết hiệu lực; `learnerId` và toàn bộ
  công huân giữ nguyên.
- Trình duyệt lưu mã trong `localStorage` máy học sinh (như mật khẩu đã nhớ). Có nút "Thoát mã trên máy này" cho máy dùng chung.

### 3.3 Chống dò mã
Apps Script không biết IP người gọi, nên giới hạn theo **mã** và **toàn cục**:
- Sai mã: đếm theo `CacheService` khoá `trbad:<2 ký tự đầu>`; vượt 30 lần/10 phút → trả `resource-exhausted` cho nhóm đó.
- Toàn hệ thống: > 2.000 lần sai/giờ → tạm tắt đăng nhập mã 15 phút + email cảnh báo Admin (cơ chế email đã có).
- Đúng mã nhưng `TrangThai = locked|revoked` → từ chối, không tiết lộ lý do chi tiết.

### 3.4 Phiên khảo hạch và token lượt làm
- Khảo hạch chỉ mở khi giáo viên mở phiên cho lớp (`TR_PhienKhaoHach`, mã phiên 6 ký tự, ≤ 3 giờ). Đây là chốt chặn chính
  chống "nhờ người khác làm hộ ở nhà".
- `trExamOpen` trả `attemptToken = base64url(payload) + '.' + HMAC_SHA256(TR_HMAC_SECRET, payload)` với
  `payload = { aid, lid, sid, deId, seed, iat, exp }`. Trình duyệt không sửa được `iat` (giờ bắt đầu) hay `seed` (thứ tự câu).
- `trExamSubmit` kiểm: chữ ký, `exp`, phiên còn mở, `aid` chưa có trong `TR_KhaoHach`, số lượt của `lid` trong phiên < `SoLuotToiDa`.

### 3.5 Không lộ đáp án
- Đề khảo hạch chỉ nằm trong Sheet. `trExamOpen` xoá các khoá `correct`, `answer`, `pairs` (giữ vế trái, trộn vế phải),
  `areas[].correct`, `blanks[].answer`, `zones` đáp án… bằng một hàm `stripAnswers_()` có test bao phủ **cả 10 loại câu**
  (test lấy mỗi loại từ `data/ic3` thật, kiểm không còn chuỗi đáp án nào trong JSON trả ra).
- Sau khi nộp mới trả lời giải (nếu đề cho phép xem lại).

## 4. Cơ chế cộng EXP an toàn

| Mối đe doạ | Chặn bằng |
|---|---|
| Học sinh tự gửi "cộng 1.000 EXP" | Không có route nào nhận `amount` từ trình duyệt. `Amount` tra từ bảng thưởng phía máy chủ theo `RuleId` |
| Gửi lại 1 bài nộp nhiều lần (cố ý / mạng chập chờn) | `TxId` tất định + `LockService` + `TextFinder` (DATABASE_SCHEMA §3.10) |
| Bịa `SourceId` | AS đọc lại nguồn (`TR_KhaoHach`, `TR_SanPham`…) và kiểm `LearnerId` khớp |
| Sửa điểm luyện tập ở trình duyệt để lên cảnh giới | Cảnh giới chính thức **không** dùng dữ liệu luyện tập; chỉ dùng sổ cái |
| Giáo viên thưởng tuỳ tiện | `GV_KHEN` có trần/tuần; vượt trần → `pending` chờ Admin; mọi lượt ghi `ConfirmedBy = uid` + `NhatKyHoatDong` |
| Giáo viên duyệt bài lớp khác | `trReview` kiểm `ClassId` của bài ∈ lớp được phân công (`trClassScope_`) |
| Sửa/xoá dấu vết | Sổ cái chỉ thêm, không cập nhật dòng nào; huỷ bằng dòng `reversal` có lý do; Sheet chỉ chia sẻ cho tài khoản chủ Apps Script + Super Admin (CULTIVATION_SYSTEM.md §6) |
| Lệch luật giữa trình duyệt và máy chủ | `realm-core`, `ledger-core` thuần, bản Apps Script được test so khớp (mẫu `77-grading.gs`) |

## 5. Bản nháp thay đổi `firestore.rules`

Chỉ **thêm**; không sửa luật đang có ngoài `classes`. Dùng lại hàm sẵn có (`isAdmin`, `isSchoolStaff`, `isApprovedTeacher`,
`inScope`, `mySchoolIds`, `myStaffSchools`).

```
// ---- classes: thêm quyền đọc cho giáo viên được phân công ----
function isAssignedTeacher(data) {
  return isApprovedTeacher() && ('teacherIds' in data) && request.auth.uid in data.teacherIds;
}
match /classes/{classId} {
  allow get: if isAdmin() || isSchoolStaff() || isAssignedTeacher(resource.data);
  // Giáo viên phải query where('teacherIds', 'array-contains', uid).limit(...)
  allow list: if request.query.limit <= 10000
    && (isAdmin() || isSchoolStaff() || isAssignedTeacher(resource.data));
  allow write: if isAdmin() || isSchoolStaff();      // như cũ
}

// ---- teacher_assignments (mới) ----
function validAssignment(d) {
  return d.keys().hasOnly(['teacherUid','classId','schoolId','role','schoolYear','status',
                           'createdBy','createdAt','updatedAt'])
    && d.teacherUid is string && d.classId is string && d.schoolId is string
    && d.role in ['chu-nhiem','bo-mon','tro-giang']
    && d.schoolYear.matches('^[0-9]{4}-[0-9]{4}$')
    && d.status in ['active','ended']
    && d.createdBy == request.auth.uid
    && d.updatedAt == request.time;
}
function canReadAssignment(d) {
  return isAdmin()
    || (isSchoolStaff() && d.schoolId in mySchoolIds())
    || (isApprovedTeacher() && d.teacherUid == request.auth.uid);
}
match /teacher_assignments/{id} {
  allow get: if canReadAssignment(resource.data);
  allow list: if request.query.limit <= 1000 && canReadAssignment(resource.data);
  allow create, update: if validAssignment(request.resource.data)
    && id == request.resource.data.classId + '__' + request.resource.data.teacherUid
             + '__' + request.resource.data.schoolYear
    && (isAdmin() || (isSchoolStaff() && request.resource.data.schoolId in mySchoolIds()));
  allow delete: if isAdmin();
}

// ---- system_settings (mới) ----
match /system_settings/{key} {
  allow get: if isAdmin() || isSchoolStaff() || isApprovedTeacher();
  allow list: if false;
  allow write: if isAdmin() && key in ['techrealm']
    && request.resource.data.updatedAt == request.time;
}
```

Lưu ý khi triển khai:
- `teacher_assignments` dùng `schoolId` (không nhận tên trường) — collection mới không mang nợ chuyển tiếp tên → id.
- Chi phí rules: các hàm trên chỉ gọi `myProfile()` (1 lượt đọc gộp/request như hiện nay), không thêm `get()` nào.
- Phạm vi `isSchoolStaff()` cho `teacher_assignments` dựa vào `schoolIds`; tài khoản AD chưa có `schoolIds` phải được ghi bù
  trước (bước đã có trong Quản lý tài khoản).

## 6. Apps Script — route mới và quyền

| Route | Xác thực | Quyền | Giới hạn |
|---|---|---|---|
| `trLogin` | mã học tập | HS active | chống dò §3.3 |
| `trProfile` | mã học tập | chính HS | đệm 10 phút/HS |
| `trSetDisplay` | mã học tập | chính HS; chỉ `TenHienThi`, `DanhHieu`, `LinhVat` (phải đã đạt) | 10 lần/ngày |
| `trChangeCode` | mã cũ | chính HS | 3 lần/ngày |
| `trQuests`, `trQuestSubmit` | mã học tập | HS lớp đó | 1 bài chờ/nhiệm vụ |
| `trExamOpen`, `trExamSubmit` | mã học tập + mã phiên + token | HS lớp của phiên | §3.4 |
| `trWorkSubmit` | mã học tập | HS | ≤ `maxUploadMB`, MIME cho phép, 5 lần/ngày |
| `trBoard` | mã học tập | lớp/trường của HS | đệm 10 phút/lớp |
| `trCodes` | ID token | GV 🔸 lớp, AD 🔸, SA | ghi `NhatKyHoatDong` |
| `trSessionOpen/Close`, `trClass`, `trPending`, `trReview`, `trQuestAdmin` | ID token | GV 🔸, AD 🔸, SA | ghi `NhatKyHoatDong` |
| `trExamAdmin`, `trLedgerReverse` | ID token | SA (đảo: AD 🔸) | ghi `NhatKyHoatDong` |

Mọi route học sinh: kiểm độ dài/kiểu từng trường; ghi chuỗi vào Sheet dạng văn bản (chặn công thức `=...`, như
`writeSubmissionLog_` đang làm).

## 7. Dữ liệu cá nhân

- Tên học sinh **không** xuất hiện trên file tĩnh nào của TechRealm. Bảng xếp hạng dùng `TenHienThi` (học sinh tự đặt, mặc
  định "Tên + chữ cái đầu họ"), chỉ trả cho người cùng lớp/trường.
- Điều kiện tiên quyết: gỡ `data/roster/students-active.json` (MIGRATION_PLAN GĐ0).
- File sản phẩm trên Drive: không chia sẻ "bất kỳ ai có link"; Apps Script trả file qua route có kiểm quyền hoặc link
  có hạn cho giáo viên.
- Xoá học sinh khỏi hệ thống: `TR_HocVien.TrangThai = revoked`, ẩn khỏi bảng xếp hạng; sổ cái giữ để toàn vẹn (chỉ có
  `learnerId`, không có tên).

## 8. Kiểm thử bảo mật cần thêm

| Bộ | Ca kiểm |
|---|---|
| `tests/firestore-rules` (emulator) | GV đọc lớp được phân công ✔ / lớp khác ✖; GV query `classes` không có `array-contains` ✖; AD ghi `teacher_assignments` trường khác ✖; id sai mẫu ✖; GV tự ghi phân công ✖; `system_settings` chỉ SA ghi |
| `apps/__tests__` (giả lập) | Không route HS nào nhận `amount`; gửi lại cùng bài 2 lần → 1 giao dịch; token sửa `iat` ✖; nộp sau khi phiên đóng ✖; `stripAnswers_` sạch đáp án cả 10 loại câu; GV duyệt bài lớp khác ✖; dò mã vượt ngưỡng → khoá |
| `tests/e2e` | Trang TechRealm của học sinh 0 request Firestore (`netlog-check`); không chuỗi đáp án khảo hạch nào trong mạng trước khi nộp |
