# TechRealm 2.0 — Database Schema

> 16/11/2026 · Bản đề xuất, chưa triển khai. Đọc trước: [ARCHITECTURE.md](ARCHITECTURE.md) §0 (giả định) và §4 (vì sao
> dữ liệu học sinh không ở Firestore). Quyền chi tiết: [FIREBASE_SECURITY.md](FIREBASE_SECURITY.md).

## 1. Bảng đối chiếu: 20 collection yêu cầu ↔ dữ liệu đang có

Ký hiệu nơi lưu: **FS** = Firestore · **SH** = Google Sheet qua Apps Script · **ST** = file tĩnh trên Pages · **LS** = localStorage.

| # | Tên yêu cầu | Nơi lưu | Tên thật | Đối chiếu với dữ liệu cũ | Thay đổi |
|---|---|---|---|---|---|
| 1 | users | FS | `users` | **Đã có**. Giá trị `role` đang lưu trong document | Không đổi |
| 2 | schools | FS | `schools` | **Đã có**, id = slug `schoolIdOf(name)` | Không đổi |
| 3 | classes | FS | `classes` | **Đã có**: `name, school, courseId, teacherId, teacherName, studentCount, schoolId` | Thêm field tuỳ chọn `teacherIds` |
| 4 | enrollments | FS | `students_roster` | **Đã có** — mỗi document đã là 1 "ghi danh" học sinh ↔ lớp (`classId`, `className`, `school`) | Không tạo collection mới |
| 5 | courses | ST | `data/techrealm/cong-phap.json` | ⚠️ **Trùng tên**: Firestore `courses` đang là *khoá roster* `{name, level: thcs|tieu_hoc}` | Không dùng tên `courses` cho khoá học TechRealm |
| 6 | lessons | ST | trong `cong-phap.json` | Mỗi bài trỏ tới minitest có sẵn trong `data/ic3/minitests-manifest.json` | Chỉ thêm file ánh xạ |
| 7 | quizzes | ST + SH | `data/ic3/**` (luyện) · `TR_DeKhaoHach` (khảo hạch) | Đề luyện **đã có**, công khai kèm đáp án — giữ nguyên | Đề khảo hạch mới, không công khai |
| 8 | quizAttempts | SH | `NhatKyNopBai` (cũ) · `TR_KhaoHach` (mới) | `NhatKyNopBai` **đã là** nơi lưu lượt làm bài (`quiz_results` đã đóng) | Thêm khoá `lid` trong JSON cột `ChiTiet` (tuỳ chọn) |
| 9 | cultivationProfiles | SH + LS | `TR_TuVi` · `techrealm_v1` | Không có. XP cũ ở `eduquiz_gamestate` (chung cả máy) | Mới; khoá cũ chỉ đọc |
| 10 | experienceTransactions | SH | `TR_SoCai` | Không có | Mới, chỉ thêm |
| 11 | quests | ST + SH | `data/techrealm/quests.json` · `TR_NhiemVu` | Nhiệm vụ ngày/mùa thi cục bộ có sẵn | Mới |
| 12 | questSubmissions | SH | `TR_NopNhiemVu` | Không có | Mới |
| 13 | inventory | LS | `techrealm_v1.profiles[].phapBao` | Xu + Linh vật ở `eduquiz_arena_v1` | Mới; khoá cũ chỉ đọc |
| 14 | achievements | ST | `data/techrealm/achievements.json` | 12 huy hiệu hard-code trong `gamification.js` | Mới; huy hiệu cũ giữ |
| 15 | studentAchievements | LS + SH | `techrealm_v1` · cột `ThanhTuu` của `TR_TuVi` | `eduquiz_gamestate.badges` | Mới |
| 16 | projects | ST + SH | `data/techrealm/projects.json` · `TR_DuAn` | Không có | Mới |
| 17 | projectSubmissions | SH + Drive | `TR_SanPham` | Không có | Mới |
| 18 | teacherAssignments | FS | `teacher_assignments` | Hiện chỉ có `classes.teacherId` (1 GV/lớp) và `students_roster.teacherId` | Mới, backfill từ dữ liệu cũ |
| 19 | notifications | — | (hoãn) | Không có | Không tạo ở GĐ đầu (§3.19) |
| 20 | systemSettings | FS + ST | `system_settings` · `js/backend-config.js` | Cấu hình đang ở `backend-config.js` (tĩnh) và Script Properties | Mới cho cài đặt nhân sự |

Thực thể **bổ sung** cần có mà Prompt 01 chưa liệt kê: `TR_HocVien` (danh tính học sinh) và `TR_PhienKhaoHach` (phiên thi).

**Quy ước tên:** collection Firestore dùng `snake_case` như các collection đang có (`quiz_results`, `students_roster`), không
dùng `camelCase` của Prompt 01. Tab Sheet mới có tiền tố `TR_`. Cột Sheet = tên field viết hoa chữ đầu (`learnerId` →
`LearnerId`). Thời điểm: Firestore `Timestamp`; Sheet chuỗi ISO 8601 ghi dạng văn bản (như các tab hiện có, tránh Sheet
tự đổi kiểu).

## 2. Khoá định danh

| Khoá | Dạng | Sinh bởi | Ghi chú |
|---|---|---|---|
| `uid` | Firebase UID | Firebase Auth | Chỉ nhân sự |
| `schoolId` | slug, vd `thcs-huynh-tan-phat` | `schoolIdOf()` (có sẵn) | Đổi tên trường giữ id |
| `classId` | id document `classes` | Có sẵn | |
| `rosterId` | id document `students_roster` | Có sẵn | Có thể đổi khi nạp lại Excel → **không** dùng làm khoá lâu dài |
| `learnerId` | `L` + 10 ký tự base32, vd `L7KQ2M9XBTA` | Apps Script, 1 lần/học sinh | **Khoá lâu dài** của mọi dữ liệu học sinh TechRealm. Không bí mật |
| `learnerCode` | 8 ký tự bảng chữ `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, in `XXXX-XXXX` | Apps Script | **Bí mật**, như mật khẩu. Đổi được, `learnerId` giữ nguyên. Chỉ lưu bản băm |
| `questionUid` | `ic3__lv1__bai1__q1` | Có sẵn trong `data/ic3` | |
| `attemptId` | `A-` + UUID | Apps Script | |
| `txId` | 20 ký tự base32 của SHA-256(`learnerId|sourceType|sourceId|ruleId`) | Apps Script | **Tất định** → chống cộng trùng (§3.10) |

## 3. Chi tiết từng thực thể

Kiểu dữ liệu viết theo TypeScript. `?` = tuỳ chọn. Quyền viết tắt: **SA** = Super Admin (`admin`), **AD** = Admin phạm vi
trường (`school_admin`, `coordinator`), **GV** = giáo viên đã duyệt, **HS** = học sinh có mã học tập hợp lệ,
**AS** = Apps Script (máy chủ). Rules đầy đủ: FIREBASE_SECURITY.md.

### 3.1 `users` — FS, đã có, không đổi

Mục đích: tài khoản nhân sự và vai trò.

| Field | Kiểu | Ghi chú |
|---|---|---|
| name | string ≤ 200 | |
| email | string ≤ 320 | |
| role | `'admin'│'school_admin'│'coordinator'│'teaching_coordinator'│'teacher'│'student'` | Giá trị đã lưu — **không đổi tên** |
| approved | boolean | GV cần `true` |
| requestedRole | string | |
| schools | string[] | Tên trường (giai đoạn chuyển tiếp) |
| schoolIds | string[] | |
| teacherCode | string? | Mã NV lịch dạy |
| createdAt | Timestamp | |

Quan hệ: `teacher_assignments.teacherUid`, `classes.teacherIds[]`. Đọc: chính mình, SA; danh sách GV đã duyệt cho nhân
sự. Ghi: tự sửa `name/email`; SA mọi field. Không thêm field phục vụ TechRealm.

### 3.2 `schools` — FS, đã có, không đổi

`{ name: string, status: 'active'|'inactive', address?, phone?, contactName?, note?, createdAt, updatedAt }`, id = `schoolId`.
Đọc: nhân sự. Ghi: SA; `school_admin` sửa liên hệ trường mình.

### 3.3 `classes` — FS, đã có, thêm 1 field

| Field | Kiểu | Trạng thái |
|---|---|---|
| name | string | có |
| school | string (tên) | có |
| schoolId | string | có (đã ghi bù 02/11/2026) |
| courseId | string | có — trỏ `courses` (khoá roster) |
| teacherId / teacherName | string | có — **giữ** cho trang cũ |
| studentCount | number | có |
| **teacherIds** | string[] ≤ 10 | **mới, tuỳ chọn** — bản sao từ `teacher_assignments` đang hiệu lực, để rules kiểm không tốn lượt đọc |
| createdAt / updatedAt | Timestamp | có / mới |

Đọc: SA, AD trong trường; **mới:** GV có `uid ∈ teacherIds`. Ghi: SA, AD (như cũ). `teacherIds` chỉ ghi qua repository
cùng batch với `teacher_assignments`.

### 3.4 enrollments → `students_roster` — FS, đã có, không đổi

`{ mssv, name, className, school, schoolId, classId, teacherId, teacherName, avatarUrl, status: 'active'|'inactive', createdAt }`.
Liên kết TechRealm qua `TR_HocVien.RosterId`. Không thêm mã học tập vào đây (mã là bí mật, Firestore không phải nơi
giữ bí mật cho học sinh).

### 3.5 courses → Công pháp — ST `data/techrealm/cong-phap.json`

```ts
interface CongPhap {            // = "course"
  id: string;                   // 'ic3-lv1'
  ten: string; tenThuong: string; // 'Thiên Cơ Quyết' / 'IC3 Cấp độ 1'
  chuongTrinh: 'IC3'|'Spark'|'MOS'|'STEM';
  capDo: string;                // khớp meta.json: 'LV1'
  canhGioiToiThieu?: RealmId;
  chuong: Chuong[];             // = lessons, theo thứ tự
}
interface Chuong {              // = "lesson"
  id: string;                   // 'ic3-lv1/bai-1'
  ten: string; tenThuong: string;
  nguon: { ct: string; cap: string; bai: string }; // tham chiếu minitest có sẵn — KHÔNG chép câu hỏi
  kyNang: string[];             // id nút trong skill-tree.json
  chuDe: 1|2|3|4|5|6|7;         // 7 chủ đề IC3 → linh căn
}
```
Quyền: công khai đọc; ghi qua PR (CI `validate-data.js` mở rộng kiểm `nguon` trỏ tới minitest tồn tại).

### 3.6 lessons — xem `Chuong` ở 3.5

### 3.7 quizzes

- **Đề luyện:** `data/ic3/**` — **không đổi định dạng** (xem audit §4).
- **Đề khảo hạch:** SH `TR_DeKhaoHach` — không bao giờ phục vụ tĩnh.

| Cột | Kiểu | Ghi chú |
|---|---|---|
| DeId | string | `KH-ic3-lv1-truc-co-01` |
| Realm | 2..7 | Cảnh giới đề này mở |
| CongPhapId | string | |
| CauHoi | JSON string | Mảng câu hỏi **đúng định dạng `data/ic3`** (để `77-grading.gs` chấm được), kèm đáp án |
| SoCau / ThoiGianGiay / DiemDat | number | |
| BocNgauNhien | number? | Số câu bốc từ ngân hàng đề (mỗi lượt khác nhau) |
| TrangThai | `'draft'│'active'│'retired'` | |
| TaoBoi / CapNhat | uid / ISO | |

Đọc: chỉ AS (trả cho HS bản đã bỏ `correct/answer/pairs/areas/…`). Ghi: SA qua `trExamAdmin`.

### 3.8 quizAttempts

**a) `NhatKyNopBai` (đã có):** cột A–P **giữ nguyên**. Thay đổi duy nhất: khi học sinh đã nhập mã học tập, JSON cột
`ChiTiet` có thêm khoá `lid: learnerId`. Khoá thêm vào JSON, không thêm cột → `listResults_`/`wrongStats_` cũ đọc bình
thường (phải kiểm bằng test khi làm).

**b) `TR_KhaoHach` (mới):**

| Cột | Kiểu | Ghi chú |
|---|---|---|
| AttemptId | string | khoá chính |
| LearnerId | string | |
| SessionId | string | → `TR_PhienKhaoHach` |
| DeId | string | |
| BatDau / NopLuc | ISO | `BatDau` lấy từ token do máy chủ ký |
| TraLoi | JSON | dạng câu gốc (`wireAnswerOf` có sẵn) |
| DiemMayChu | number 0–100 | chỉ máy chủ tính |
| Dat | boolean | |
| ViPham | JSON | bộ đếm chuyển tab… (như `ChiTiet` cũ) |
| TrangThai | `'graded'│'void'` | `void` = giáo viên huỷ (gian lận) → kéo theo giao dịch đảo |

Đọc: HS xem bài của mình qua `trProfile`; GV lớp đó; AD trường đó; SA. Ghi: chỉ AS.

### 3.9 cultivationProfiles

**a) `TR_TuVi` — ảnh chụp chính thức (SH), 1 dòng/học sinh, AS tính lại sau mỗi giao dịch:**

| Cột | Kiểu | Ghi chú |
|---|---|---|
| LearnerId | string | khoá |
| SchoolId / ClassId | string | để lọc bảng xếp hạng |
| CongHuan | number | Tổng `TR_SoCai` trạng thái `confirmed` |
| Realm | 1..7 | `realm-core.officialRealm(...)` |
| RealmLuc | ISO | lúc đạt cảnh giới hiện tại |
| LinhCan | JSON `{1..7: 0–100}` | theo bài Kiểm tra/khảo hạch đã xác thực |
| ThanhTuu | JSON string[] | thành tựu chính thức |
| SoDuAnDuyet / SoBiCanhBoss | number | đếm phục vụ điều kiện cảnh giới |
| PhienBanLuat | string | phiên bản `realm-core` đã tính → tính lại khi đổi luật |
| CapNhat | ISO | |

**b) `techrealm_v1` — LS, trên máy học sinh:**

```ts
interface TechRealmLocal {
  version: 1;
  active?: string;                         // learnerId đang dùng trên máy
  profiles: Record<string /*learnerId|'khach'*/, {
    displayName: string;
    tuViLuyenTap: number;                  // bản đệm; tính lại được từ eduquiz_records/gamestate
    linhThach: number;
    phapBao: Record<string, number>;       // inventory (3.13)
    danhHieu?: string;                     // đang đeo
    thanhTuuLuyenTap: string[];
    biCanh: Record<string, { best: number; clearedAt?: string }>;
    official?: { realm: number; congHuan: number; syncedAt: string }; // bản sao chỉ đọc từ TR_TuVi
  }>;
}
```
`'khach'` = máy chưa nhập mã học tập (giữ đúng trải nghiệm không đăng nhập hiện nay).

### 3.10 experienceTransactions → `TR_SoCai` (SH, chỉ thêm, không sửa, không xoá)

> **Cập nhật 16/11/2026 (Prompt 03), đã có mã:** thiết kế chuyển sang **chuỗi sự kiện chỉ thêm**: không dòng nào bị
> sửa, kể cả cột trạng thái. Chi tiết luật, loại dòng, trạng thái hiệu lực: [CULTIVATION_SYSTEM.md](CULTIVATION_SYSTEM.md)
> §6. Mã: `js/techrealm/cultivation-core.js`, adapter `apps/src/79-tr-ledger.gs`.

12 cột, file Sheet riêng (Script Property `TR_LEDGER_SPREADSHEET_ID`):

| Cột | Kiểu | Ghi chú |
|---|---|---|
| TxId | string | Tất định, vd `L7KQ2M9XBTA|LESSON|ic3-lv1/1`, `…|REALM|3`, `<txId>|review`, `<txId>|reversal`. **Khoá chống trùng** |
| LearnerId | string | |
| Kind | `exp │ review │ reversal │ realm │ item │ achievement │ assessment` | |
| Type | `LESSON │ EXERCISE │ TEST │ QUEST │ PROJECT │ TEACHER │ ACTIVITY` | chỉ dòng `exp` |
| SourceId | string | id bài / bài kiểm tra / nhiệm vụ / dự án / lượt thưởng / bài đánh giá |
| Amount | integer | Máy chủ tra bảng thưởng. Âm ở dòng `reversal` |
| Status | `confirmed │ pending` (dòng `exp`), `confirmed │ rejected` (dòng `review`) | Ghi 1 lần lúc tạo, **không cập nhật** |
| RefTxId | string | dòng `review`/`reversal` trỏ về dòng gốc |
| Data | JSON | `itemId`, `qty`, `realm`, `achievementId`, `facts` (điểm, `durationSec`, chủ đề), `rulesVersion` |
| Note | string ≤ 300 | lý do thưởng / huỷ / duyệt |
| By | `system` hoặc uid | người hoặc hệ thống xác nhận |
| CreatedAt | ISO (giờ máy chủ) | |

Trạng thái hiệu lực (`summarize`): `pending` + `review` → `confirmed`/`rejected`; bất kỳ dòng `exp` nào có `reversal`
→ `reversed` (không tính). Nhiều dòng cùng `TxId` (ghi đua) → chỉ dòng đầu có hiệu lực.

Đọc: HS (của mình, qua route), GV lớp, AD trường, SA. Ghi: **chỉ Apps Script** qua `CultivationService`.

### 3.11 quests

**Danh mục hệ thống — ST `data/techrealm/quests.json`:**
`{ id, ten, loai: 'ngay'|'tuan'|'mua'|'cot-truyen', dieuKien: Condition, thuongTuVi: number, thuongLinhThach: number }`
— chỉ thưởng **tu vi luyện tập** (cục bộ).

**Nhiệm vụ giáo viên giao — SH `TR_NhiemVu`:**

| Cột | Kiểu | Ghi chú |
|---|---|---|
| QuestId | string | |
| SchoolId / ClassIds | string / JSON string[] | |
| TaoBoi | uid | GV phải được phân công các lớp đó |
| Ten / MoTa | string ≤ 120 / ≤ 2.000 | |
| Loai | `'bai-hoc'│'bi-canh'│'san-pham'│'tu-do'` | |
| Ref | string? | id trong `data/techrealm` hoặc link đề `?de=` |
| CachNop | `'tu-dong'│'link'│'file'│'van-ban'` | `tu-dong` = AS tự xác nhận từ `NhatKyNopBai`/`TR_KhaoHach` |
| RuleId | string | Mức thưởng công huân (từ bảng thưởng, GV không tự nhập số) |
| MoLuc / HanNop | ISO | |
| TrangThai | `'open'│'closed'│'archived'` | |

Đọc: HS lớp đó (qua `trQuests`), GV/AD phạm vi. Ghi: GV lớp đó, AD, SA.

### 3.12 questSubmissions → `TR_NopNhiemVu` (SH)

`SubmissionId, QuestId, LearnerId, NopLuc, NoiDung (≤ 2.000 ký tự | link | DriveFileId), TrangThai ('submitted'|'approved'|'rejected'|'late'), NguoiDuyet, DuyetLuc, NhanXet, TxId?`
Mỗi (`QuestId`, `LearnerId`) tối đa 1 bài đang chờ; nộp lại ghi đè bài *chưa duyệt*. Duyệt → `SourceEvent(NHIEM_VU)`.

### 3.13 inventory — LS `techrealm_v1.profiles[].phapBao`

Chỉ vật phẩm **trang trí** (khung avatar, linh vật, hoạ tiết), mua bằng linh thạch luyện tập. Không có vật phẩm làm thay
đổi điểm hay cảnh giới → không cần máy chủ, không cần chống gian lận. Xu và Linh vật cũ (`eduquiz_arena_v1`) hiển thị chung,
**không chuyển dữ liệu**. Danh mục: ST `data/techrealm/phap-bao.json` `{ id, ten, doHiem, gia, nguon }`.

### 3.14 achievements — ST `data/techrealm/achievements.json`

`{ id, ten, moTa, tang: 'luyen-tap'|'chinh-thuc', dieuKien: Condition, an?: boolean }`. `Condition` là dữ liệu khai báo
(vd `{ "type": "realm_at_least", "value": 3 }`), được `achievement-core.js` diễn giải — dùng chung cho trình duyệt và AS.

### 3.15 studentAchievements

- Tầng luyện tập: `techrealm_v1.profiles[].thanhTuuLuyenTap` (LS).
- Tầng chính thức: cột `ThanhTuu` của `TR_TuVi` — **suy ra** từ sổ cái mỗi lần tính lại, không ghi riêng. Nhờ vậy không
  thể có thành tựu chính thức mà không có giao dịch tương ứng.

### 3.16 projects

Danh mục mẫu — ST `data/techrealm/projects.json`: `{ id, ten, moTa, mucTieu[], rubric: {tieuChi, diemToiDa}[], dinhDangNop: string[], canhGioiToiThieu }`.
Dự án giáo viên tạo cho lớp — SH `TR_DuAn`: cùng cột như `TR_NhiemVu` + `RubricJson`.

### 3.17 projectSubmissions → `TR_SanPham` (SH) + Drive

| Cột | Kiểu | Ghi chú |
|---|---|---|
| SubmissionId / ProjectId / LearnerId | string | |
| NopLuc / PhienBan | ISO / number | nộp lại tăng phiên bản |
| DriveFileId / TenFile / KichThuoc / MimeType | string / string / number ≤ 5 MB / danh sách cho phép | file trong thư mục Drive `TechRealm/<schoolId>/<projectId>/` — **không chia sẻ công khai** |
| MoTa | string ≤ 1.000 | |
| TrangThai | `'submitted'│'reviewing'│'approved'│'needs-work'│'rejected'` | |
| DiemRubric | JSON | |
| NguoiCham / ChamLuc / NhanXet | | |
| TrongPortfolio | boolean | HS chọn hiển thị |
| TxId | string? | giao dịch khi `approved` |

### 3.18 teacherAssignments → `teacher_assignments` (FS, mới)

Mục đích: ghi nhận **giáo viên nào phụ trách lớp nào, vai trò gì, từ khi nào** — nguồn để giới hạn quyền GV.

| Field | Kiểu | Ghi chú |
|---|---|---|
| teacherUid | string | → `users` |
| classId | string | → `classes` |
| schoolId | string | → `schools` (để rules AD kiểm phạm vi) |
| role | `'chu-nhiem'│'bo-mon'│'tro-giang'` | |
| schoolYear | string `'2026-2027'` | |
| status | `'active'│'ended'` | |
| createdBy | uid | |
| createdAt / updatedAt | Timestamp | |

Id document: `${classId}__${teacherUid}__${schoolYear}` (tất định, không tạo trùng).
Quan hệ: khi `status` đổi, repository cập nhật `classes.teacherIds` **trong cùng batch**.
Đọc: GV (của mình), AD trường, SA. Ghi: AD trường, SA.
Backfill một lần từ `classes.teacherId` (MIGRATION_PLAN §3).
Chi phí: ~150 lớp → ≤ 300 document; đọc khi mở trang quản lý lớp, có bản đệm như roster.

### 3.19 notifications — hoãn

Học sinh không có kênh đẩy (không đăng nhập, không FCM trên Spark một cách hợp lý). Giai đoạn đầu dùng **thông báo suy ra
lúc mở trang**: Teacher Dashboard hỏi `trPending` (số bài chờ duyệt); học sinh thấy nhiệm vụ mới trong `trProfile`.
Khi thật sự cần thông báo cho nhân sự, thiết kế dự phòng: FS `notifications/{id}` `{ toUid, type, refPath, createdAt, readAt?, expireAt }`
có TTL 30 ngày, chỉ người nhận đọc, chỉ AS/SA tạo.

### 3.20 systemSettings → `system_settings` (FS, mới) + `js/backend-config.js`

- Cài đặt **học sinh cần đọc** (bật/tắt khu TechRealm, mùa sự kiện) → giữ ở `js/backend-config.js` (tĩnh, 0 lượt đọc).
- Cài đặt **nhân sự chỉnh trên giao diện** → `system_settings/techrealm`:
  `{ khaoHachEnabled: boolean, maxUploadMB: number ≤ 10, gvKhenWeeklyCap: number, leaderboardScope: 'class'|'school', updatedBy, updatedAt }`.
  Đọc: nhân sự (1 lượt/lần mở trang quản trị, đệm 30 phút). Ghi: SA.
- Bí mật (`TR_HMAC_SECRET`, `TR_CODE_PEPPER`, khoá Drive) → **Script Properties**, không bao giờ ở Firestore hay repo.

### 3.21 Bổ sung: `TR_HocVien` (SH) — danh tính học sinh

| Cột | Kiểu | Ghi chú |
|---|---|---|
| LearnerId | string | khoá lâu dài |
| CodeHash | string | SHA-256(`pepper + learnerCode`) — không lưu mã gốc |
| CodeHint | string(2) | 2 ký tự cuối, để GV đối chiếu khi học sinh hỏi |
| RosterId / SchoolId / ClassId | string | liên kết `students_roster` |
| TenHienThi | string ≤ 60 | HS tự đổi được (lọc từ ngữ) |
| DanhHieu / LinhVat | string? | HS chọn trong số đã đạt |
| TrangThai | `'active'│'locked'│'revoked'` | |
| CapLuc / CapBoi / DoiMaLuc | ISO / uid / ISO | |
| SaiMaGanDay | number | đếm để khoá tạm |

### 3.22 Bổ sung: `TR_PhienKhaoHach` (SH)

`SessionId, SessionCode (6 ký tự), ClassId, DeId, MoBoi (uid), MoLuc, DongLuc (≤ 3 giờ), SoLuotToiDa (mặc định 1), TrangThai ('open'|'closed')`.

## 4. Sơ đồ quan hệ

```
schools 1───* classes 1───* students_roster ......(RosterId)...... TR_HocVien 1───1 TR_TuVi
                │  ▲                                                   │ LearnerId
                │  └── teacherIds[] (bản sao)                          ├───* TR_SoCai ◄──── SourceId ──┐
                *                                                      ├───* TR_KhaoHach ──────────────┤
       teacher_assignments *───1 users(uid)                            ├───* TR_NopNhiemVu ────────────┤
                                                                       ├───* TR_SanPham ───────────────┘
                                                                       └───* NhatKyNopBai (ChiTiet.lid)
TR_PhienKhaoHach *───1 TR_DeKhaoHach        TR_NhiemVu 1───* TR_NopNhiemVu      TR_DuAn 1───* TR_SanPham
data/techrealm/cong-phap.json ──nguon──► data/ic3/minitests/**   (tĩnh → tĩnh)
```

## 5. Dung lượng và hạn mức (ước lượng, 3.000 HS)

| Nơi | Tăng thêm mỗi ngày | So với giới hạn |
|---|---|---|
| Firestore | Đọc: ≤ 1.000 (phân công, cài đặt, nhân sự). Ghi: ≤ 50 | < 4% ngân sách |
| Sheet `TR_SoCai` | ≤ 3.000 dòng/ngày (13 cột) | 10 triệu ô/file → xoay vòng sau ~250 ngày bằng `logTab_` có sẵn |
| Apps Script | `trProfile` ~3.000 lượt (đệm 10 phút) + khảo hạch 2 lượt/bài | Giới hạn thật là **30 lượt chạy song song** → MIGRATION_PLAN rủi ro M3 |
| Drive | 5 MB × số sản phẩm | 15 GB tài khoản Google chứa Apps Script — cần theo dõi |
