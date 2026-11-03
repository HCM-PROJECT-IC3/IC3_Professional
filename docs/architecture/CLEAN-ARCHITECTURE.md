# Clean Architecture trong EduQuiz IC3

> Áp dụng từ 03/11/2026. Máy kiểm tra: `node scripts/check-architecture.js` (chạy trong CI).
> Đọc cùng: [AUDIT-2.0.md](AUDIT-2.0.md) (vì sao **không** viết lại lớn), [BACKEND-MAP.md](BACKEND-MAP.md).

Dự án là web tĩnh (không bundler, mỗi file JS gắn 1 namespace `window.Edu…`), nên Clean Architecture ở đây là
**quy ước thư mục + quy tắc phụ thuộc + máy kiểm tra**, không phải framework. Mục tiêu: luật nghiệp vụ test được
bằng Node, đổi backend (Firestore ↔ Sheet ↔ Apps Script) chỉ sửa 1 tầng, tính năng mới không làm rối thêm.

## 1. Bốn tầng

| Tầng | Chứa gì | Ở đâu | Được phụ thuộc vào |
|---|---|---|---|
| **Domain** (Entities + luật) | Thực thể, luật chấm điểm, luật trò chơi, dựng câu lệnh AI — hàm thuần | `js/core/`, `js/models/`, mọi `*-core.js` (`arena-core`, `name-picker-core`, `thi-dua-core`, `ai-core`…) | Không gì cả (chỉ Domain khác) |
| **Application** (Use case) | Điều phối 1 việc: thứ tự ưu tiên, bản đệm, xử lý lỗi — nhận **cổng** (port) qua tham số | `js/services/ai-assistant.js` (mẫu); các service khác trong `js/services/` | Domain + cổng |
| **Infrastructure** (Adapter) | Nói chuyện với bên ngoài: Firestore, Apps Script, Gemini, localStorage, IndexedDB | `js/repositories/` (Firestore), `js/services/apps-script-client.js`, `sheet-results-api.js`, adapter trong `ai-service.js`… | Domain (model), SDK ngoài |
| **Presentation** | Trang, vẽ DOM, sự kiện, hộp thoại | `*.html`, `js/*.js` của từng trang, phần UI trong `ai-service.js` | Mọi tầng trong |

**Quy tắc phụ thuộc:** mũi tên chỉ đi vào trong — Presentation → Application → Domain; Infrastructure cài đặt
cổng mà Application cần. Domain không bao giờ biết Firestore, DOM hay mạng tồn tại.

```
 Presentation (trang, DOM) ──► Application (use case) ──► Domain (thuần)
          │                         ▲  cổng (port)            ▲
          └──── composition root ───┴── Infrastructure ────────┘
                (nối adapter thật vào use case)   (Firestore, Apps Script, Gemini, localStorage)
```

## 2. Máy kiểm tra giữ luật gì (`scripts/check-architecture.js`)

| Luật | Nội dung | Vi phạm thì |
|---|---|---|
| R1 | File Domain/use case thuần không dùng `document`, `innerHTML`, `addEventListener`, `localStorage`/`sessionStorage`/`indexedDB`, `fetch`, `firebase.`, `EduFirebase`, `EduAppsScript`, `EduRepositories`, `navigator`, `alert/confirm/prompt` (bỏ qua chú thích) | CI đỏ |
| R2 | `js/repositories/` không đụng giao diện (`document`, `innerHTML`, hộp thoại) | CI đỏ |
| R3 | File giao diện không gọi thẳng Firestore (`db.collection/batch/doc`, `FieldValue`…) — trừ adapter trong `FIRESTORE_ADAPTERS` | Nợ cũ: **bánh cóc** (xem §4) |

Thêm 1 use case thuần mới → thêm đường dẫn vào `PURE_EXTRA` để được kiểm như Domain.

## 3. Công thức thêm tính năng (mẫu: Trợ lý AI)

1. **Domain** — `js/services/ai-core.js`: dựng câu lệnh, đọc phản hồi, đọc JSON câu hỏi, định dạng an toàn.
   Thuần, test `js/services/__tests__/ai-core.test.js`. Bản Apps Script (`apps/src/78-ai.gs`) được so khớp bằng test.
2. **Use case** — `js/services/ai-assistant.js`: `create({ keyStore, cache, gemini, school })` → `ask()`, `testKey()`.
   Chỉ có luật "bản đệm → key cá nhân → key trường → báo cần key". Test bằng cổng giả:
   `js/services/__tests__/ai-assistant.test.js` (12 tình huống, không mạng).
3. **Adapter + composition root** — `js/services/ai-service.js`: `localStorage` (key, bản đệm), REST Gemini,
   Apps Script; nối vào use case bằng `EduAIAssistant.create(...)`.
4. **Presentation** — `askInto()`, `openSettings()` và các nút trong `review-detail.js`, `exam-builder.js`,
   `wrong-questions.js`, `name-picker.js`.

Đổi nhà cung cấp AI (vd. sang máy chủ riêng) = viết adapter `gemini`/`school` mới, **không** sửa use case hay giao diện.

### Thời điểm máy chủ (`createdAt`, `updatedAt`)

Model **không** gọi `firebase.firestore.FieldValue.serverTimestamp()`. Model đặt dấu trung lập
`EduModels.SERVER_TIME`; tầng repository (`EduBaseRepository` — `create/createWithId/update/upsert/commitBatch`)
đổi dấu đó thành `serverTimestamp()` lúc ghi. Code trang cũng dùng `window.EduModels.SERVER_TIME`.

### Ghi nhiều tài liệu

Không tự dựng `db.batch()` ở trang. Dùng
`EduBaseRepository.commitBatch([{ repo, id, data, merge? }])` — tự chia lô ≤ 450, đổi dấu thời điểm.
Mẫu: `js/teaching-schedule.js` § `commitImportWrites`, tạo tuần mới có sao chép lịch.

## 4. Nợ kỹ thuật và cách trả (bánh cóc)

`BASELINE` trong `scripts/check-architecture.js` ghi số lượt gọi Firestore trực tiếp còn lại trong file giao diện
(03/11/2026): `portfolio.js` 22 · `roster-manager.js` 13 · `admin-users.js` 7 · `dashboard.js` 3 ·
`teaching-timetable-import.js` 3 · `teaching-timetable.js` 2 · `admin-users-import.js` 1 · `teaching-schedule.js` 1.

- Số này **chỉ được giảm**: thêm lượt gọi mới hoặc file mới gọi thẳng Firestore → CI đỏ.
- Khi chuyển 1 chỗ sang repository, máy kiểm tra nhắc hạ số trong `BASELINE` — hạ luôn để khoá phần đã sạch.
- Thứ tự gợi ý: `teaching-timetable*.js` (ít, cùng mẫu `commitBatch` như `teaching-schedule.js`) →
  `admin-users*.js` (đã có `user-repository.js`) → `roster-manager.js` → `portfolio.js` (cần repository mới cho
  `gvlab_posts`/like — có giao dịch).

## 5. Cố ý KHÔNG làm

- **Không tách `js/quiz-engine.js`** (5.400 dòng) và **không dời trang HTML** sang thư mục con — lý do ở
  [AUDIT-2.0.md §1](AUDIT-2.0.md). Phần mới của quiz đặt ở file riêng theo tầng (như `core/grading.js`,
  `services/result-submitter.js`) rồi để quiz-engine gọi.
- Không thêm bundler/framework DI: namespace `window.Edu…` + `create(ports)` đủ cho quy mô hiện tại và không đổi
  cách deploy (web tĩnh, Apps Script dán tay).
- Không ép mọi `js/services/` thành use case thuần ngay — nhiều service đang là adapter (đọc Sheet, IndexedDB).
  Service mới viết theo mẫu `ai-assistant.js` khi có luật đáng test.
