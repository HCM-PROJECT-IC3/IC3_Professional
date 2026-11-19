# TechRealm 2.0 — Phụ thuộc giữa các module

> 16/11/2026 · Bản đề xuất. Module M1–M16 định nghĩa ở [ARCHITECTURE.md](ARCHITECTURE.md) §3.
> Quy tắc tầng giữ đúng [CLEAN-ARCHITECTURE.md](../architecture/CLEAN-ARCHITECTURE.md): Presentation → Application → Domain;
> Infrastructure cài đặt cổng (port).

## 1. Đồ thị phụ thuộc

Mũi tên `A ──► B` = A gọi/đọc B. Không có vòng.

```
                    ┌────────────────── Nền tảng ──────────────────┐
                    │  M1 Authentication     M4 Class Management   │
                    │        ▲    ▲               ▲     ▲          │
                    │        │    └── M3 Student Management ──┘    │
                    │        │                    ▲                │
                    │   M2 User Profile ──────────┘                │
                    └────────▲──────────────▲──────────────────────┘
                             │              │
        ┌────────────────────┼──────────────┼──────────── Nội dung (tĩnh) ───────┐
        │    M6 Learning ◄── M14 Science Lab        M9 Challenge ──► M6          │
        │       ▲                                     ▲                           │
        └───────┼─────────────────────────────────────┼───────────────────────────┘
                │                                     │
   M7 Quiz ─────┤        M8 Quest ──► M6, M9          │      M13 Project Workshop
     │          │          │                          │             │
     │ SourceEvent         │ SourceEvent              │ SourceEvent │ SourceEvent
     ▼                     ▼                          ▼             ▼
   ┌──────────────────────────── M5 Cultivation (sổ cái, cảnh giới) ────────────┐
   └───────▲──────────────────────▲─────────────────────────▲───────────────────┘
           │ đọc ảnh chụp          │ đọc ảnh chụp             │ đọc (tu vi cục bộ)
     M12 Leaderboard        M11 Achievement            M10 Inventory

   M15 Teacher Dashboard ──► M4, M3, M5, M7, M8, M13, M12   (chỉ đọc + lệnh duyệt)
   M16 Admin Dashboard   ──► M1, M4, M3, M5, M7, M13, system_settings
```

Mọi module dưới tầng Nền tảng đều phụ thuộc M1 (biết "ai đang gọi"), không vẽ hết để đồ thị dễ đọc.

## 2. Bảng phụ thuộc

| Module | Phụ thuộc trực tiếp | Không được phụ thuộc | Cổng (port) nó cung cấp |
|---|---|---|---|
| M1 Authentication | Firebase Auth, Apps Script `20-auth.gs` | mọi module nghiệp vụ | `currentViewer(): Viewer` (`{kind:'staff', uid, role, schoolIds}` \| `{kind:'learner', learnerId, classId}` \| `{kind:'guest'}`) |
| M2 User Profile | M1 | M5 (chỉ hiển thị, nhận dữ liệu qua props) | `getProfile()`, `setDisplay()` |
| M3 Student Management | M1, M4 | M5 | `issueCodes(classId)`, `revokeCode(learnerId)` |
| M4 Class Management | M1 | M3, M5 | `classesInScope(viewer)`, `assignTeacher()` |
| M5 Cultivation | M1; **Domain**: `realm-core`, `ledger-core`, `linh-can-core`, bảng thưởng | M7, M8, M13 (đảo chiều qua `SourceEvent`), mọi UI | `recordEvent(SourceEvent)` (chỉ AS), `officialProfile(learnerId)`, `practiceProfile(localData)` |
| M6 Learning | `data/techrealm/cong-phap.json`, `skill-tree.json`, `data/ic3/meta.json` | M5 | `courses()`, `lessonLink(lessonId)` (deeplink `?ct=&cap=&bai=` có sẵn), `mastery(records)` |
| M7 Quiz | `js/core/grading.js` / `77-grading.gs`; M1 | M5 trực tiếp — chỉ phát `SourceEvent` | `openExam()`, `submitExam()` |
| M8 Quest | M1, M4, M6, M9 | M13 | `questsFor(viewer)`, `submitQuest()`, `reviewQuest()` |
| M9 Challenge | M6; game cũ (`arena-*`, `pz-defense`, `cyber-detective`) qua iframe `?arena=1` | M5 trực tiếp | `challenges()`, `recordLocalRun()` |
| M10 Inventory | M5 (`practiceProfile`), `eduquiz_arena_v1` (chỉ đọc) | Apps Script | `items()`, `buy()`, `equip()` |
| M11 Achievement | M5 (cả 2 tầng), `achievements.json` | ghi bất kỳ đâu ngoài LS | `evaluate(profile)` |
| M12 Leaderboard | M5 (`TR_TuVi`), M4 | dữ liệu luyện tập | `board(scope)` |
| M13 Project Workshop | M1, M4, Drive | M5 trực tiếp | `submitWork()`, `review()`, `portfolio(learnerId)` |
| M14 Science Lab | M6 | Apps Script, Firestore | `labs()`, `runLab()` (chạy trên máy) |
| M15 Teacher Dashboard | M3, M4, M5, M7, M8, M12, M13 | Firestore trực tiếp (chỉ qua repository) | — |
| M16 Admin Dashboard | M1, M3, M4, M5, M7, M13 | Firestore trực tiếp | — |

## 3. Hợp đồng `SourceEvent`

Cách duy nhất để module khác làm thay đổi công huân. Chỉ tồn tại **phía Apps Script** (trình duyệt không tạo được):

```ts
interface SourceEvent {
  type: 'KHAO_HACH' | 'KIEM_TRA_XAC_THUC' | 'NHIEM_VU' | 'SAN_PHAM' | 'BI_CANH_BOSS' | 'GV_KHEN';
  sourceId: string;          // attemptId / submissionId / questId…
  learnerId: string;
  facts: Record<string, number | string | boolean>; // vd { score: 85, passed: true, deId: '…', realm: 2 }
  actor: 'system:grader' | 'system:rule' | string /* uid */;
}
// M5.recordEvent(e): kiểm nguồn → tra rewards theo (type, facts) → TxId tất định → ghi/khớp → tính lại TR_TuVi
```

## 4. Vị trí mã và luật kiểm tra

| Tầng | Thư mục | Luật (`scripts/check-architecture.js`) |
|---|---|---|
| Domain | `js/techrealm/*-core.js`, `js/techrealm/skill-tree.js` | Thêm vào `PURE_EXTRA` → R1: không DOM, không `fetch`, không `localStorage`, không Firebase |
| Domain (bản Apps Script) | `apps/src/79-tr-core.gs` | Test so khớp với bản JS trên bộ ca chung (mẫu `77-grading.gs`) |
| Application | `web/src/features/techrealm/services/*.ts` | Nhận port qua tham số; test bằng port giả |
| Infrastructure | `web/src/services/techrealm/` (localStorage, Apps Script), `js/repositories/teacher-assignment-repository.js` | R2: repository không đụng giao diện |
| Presentation | `web/src/features/techrealm/**` (React) | Không import Firestore SDK; không gọi `fetch` trực tiếp |

Luật mới đề xuất thêm vào máy kiểm tra:
- **R4:** file trong `web/src/features/techrealm/` (trừ `services/`) không chứa `apps-script`, `firestore`, `fetch(`.
- **R5:** không file trình duyệt nào chứa chuỗi gửi đi khoá `amount` tới route `tr*` (chặn "tự cộng EXP" từ sớm).

## 5. Thứ tự xây dựng (theo phụ thuộc)

```
1. Domain M5/M6/M11 (thuần, test Node)                ← không phụ thuộc backend
2. M6 Learning UI, M9 Challenge UI, M10, M11 (tầng luyện tập), M2 (khách)   ← chỉ tĩnh + LS
3. M4 teacher_assignments + rules                    ← Firestore nhỏ
4. M1 mã học tập + M3 cấp mã                          ← Apps Script
5. M7 khảo hạch + M5 sổ cái                           ← Apps Script
6. M12, M11 (tầng chính thức)                         ← cần 5
7. M8 Quest, M13 Workshop                             ← cần 4, 5
8. M15/M16 tab TechRealm                              ← cần tất cả trên
9. M14 Science Lab                                    ← cần nội dung
```

## 6. Phụ thuộc vào mã cũ (chỉ đọc, không sửa)

| Mã cũ | Dùng bởi | Cách dùng |
|---|---|---|
| `js/core/grading.js`, `apps/src/77-grading.gs` | M7 | Gọi hàm chấm |
| `js/learning-hub.js` (`studentSummary`, `seasonInfo`) | M6 | Import như side-effect IIFE (cách app 2.0 đang làm) |
| `eduquiz_records`, `eduquiz_gamestate`, `eduquiz_arena_v1`, `eduquiz_wrongbook_v1` | M5 (tầng luyện tập), M10 | Chỉ đọc |
| `index.html?ct=&cap=&bai=` | M6 | Deeplink mở bài |
| `js/services/pending-sync-queue.js` | M7, M8, M13 | Gửi lại khi mất mạng |
| `apps/src/75-roster-codes.gs` | M3 | Mở rộng thành mã học tập |
| `logTab_`, `appError_`, `withRareLock_`, `authenticate_`, `requireRole_` | Mọi route `tr*` | Dùng lại |
