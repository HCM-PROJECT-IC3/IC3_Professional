# TechRealm — Hệ thống tu luyện (Cultivation Engine)

> 16/11/2026 · Mã: [js/techrealm/cultivation-core.js](../../js/techrealm/cultivation-core.js) (luật),
> [js/techrealm/cultivation-service.js](../../js/techrealm/cultivation-service.js) (CultivationService),
> [apps/src/79-tr-ledger.gs](../../apps/src/79-tr-ledger.gs) (sổ cái trên Google Sheet).
> Bối cảnh: [ARCHITECTURE.md](ARCHITECTURE.md) §3 (M5), [FIREBASE_SECURITY.md](FIREBASE_SECURITY.md) §4.

## 0. Tóm tắt

- **Một bộ luật, ba nơi chạy.** `cultivation-core.js` và `cultivation-service.js` là JS thuần. Trình duyệt import để
  hiển thị, Node chạy unit test, và `scripts/build-apps-script.js` chép **nguyên văn** hai file vào `apps/Code.gs`.
  Không có bản viết tay thứ hai nên không thể lệch luật. Bản dựng tự chặn cú pháp `?.`/`??` có thể không chạy được
  trên Apps Script.
- **Chỉ máy chủ ghi phần thưởng.** Trình duyệt không bao giờ gửi số EXP. Apps Script tra bảng thưởng theo loại hoạt
  động và bằng chứng (điểm do máy chủ chấm, quyết định của giáo viên đã đăng nhập).
- **Sổ cái chỉ thêm, không sửa.** Duyệt, huỷ, đột phá, nhận vật phẩm, thành tựu đều là **dòng mới**. Trạng thái hiện
  tại được tính lại từ toàn bộ dòng.
- **Chống ghi nhận trùng bằng 2 lớp:** mã giao dịch tất định + tính tổng chỉ đếm 1 lần mỗi mã. Thêm khoá ghi để trần
  ngày/tuần không bị vượt khi có 2 yêu cầu cùng lúc.
- **Trạng thái:** luật, service, adapter Sheet và unit test xong. **Chưa có route web nào gọi tới**: học sinh cần mã
  học tập trước (MIGRATION_PLAN GĐ4–5). Giao diện xem thử đã dùng luật thật trên dữ liệu mẫu.

Thuật ngữ trên giao diện: **công huân** = EXP đã xác thực (tính cảnh giới, trong tài liệu này gọi là EXP). **Tu vi
luyện tập** là điểm trên máy học sinh (`gamification.js` cũ), không vào sổ cái và không ảnh hưởng cảnh giới.

## 1. Cảnh giới và tiểu cảnh giới

| # | Cảnh giới | Tên thường | EXP tối thiểu để đột phá lên |
|---|---|---|---|
| 1 | Luyện Khí | Làm quen | — (khởi đầu) |
| 2 | Trúc Cơ | Nền tảng | 300 |
| 3 | Kim Đan | Vững vàng | 900 |
| 4 | Nguyên Anh | Thành thạo | 2.000 |
| 5 | Hóa Thần | Vận dụng | 4.000 |
| 6 | Độ Kiếp | Vượt thử thách | 7.000 |
| 7 | Chân Tiên | Chứng chỉ thật | 11.000 |

- **Tiểu cảnh giới** (`stageOf`): đoạn EXP từ ngưỡng của cảnh giới hiện tại tới ngưỡng cảnh giới sau được chia đều
  làm 3 kỳ: **Sơ kỳ · Trung kỳ · Hậu kỳ**. Chân Tiên chỉ có **Viên mãn**.
- **Cảnh giới do đột phá quyết định, không do EXP.** Đủ EXP mà chưa đủ điều kiện khác thì dừng ở *Hậu kỳ · đỉnh
  phong*. Cảnh giới đã đạt **không bị hạ tự động**, kể cả khi sau đó một giao dịch bị huỷ (tránh cảnh học sinh "tụt
  cảnh giới" vì lỗi chấm). Muốn hạ phải có quyết định riêng của Admin (chưa làm, cần chốt chính sách).

## 2. EXP

### 2.1 Nguồn và mức thưởng mặc định

| Nguồn (`type`) | Hoạt động | Ai được ghi | Bằng chứng bắt buộc | Mức mặc định | Chống lặp |
|---|---|---|---|---|---|
| `LESSON` | Hoàn thành bài học | máy chủ | `lessonId`, `score` do máy chủ chấm ≥ 70 | 20 | 1 lần/bài · tối đa 200/ngày |
| `EXERCISE` | Hoàn thành bài tập | máy chủ | `exerciseId`, `score` ≥ 60 | 10 | 1 lần/bài · tối đa 100/ngày |
| `TEST` | Vượt qua bài kiểm tra | máy chủ | `testId`, `score` ≥ 70 | 60, +20 nếu 100 điểm | 1 lần/bài |
| `QUEST` | Hoàn thành nhiệm vụ | máy chủ / GV / Admin | `questId` | 40 | 1 lần/nhiệm vụ |
| `PROJECT` | Hoàn thành dự án | GV / Admin | `projectId`, `pct` (điểm tiêu chí) | ≥ 90%: 180 · ≥ 75%: 150 · ≥ 50%: 120 | 1 lần/dự án |
| `TEACHER` | Giáo viên xác nhận | GV / Admin | `awardId`, `note` (lý do 5–300 ký tự), `amount` 1–30 | 10 | trên 50/tuần → **chờ Admin duyệt** |
| `ACTIVITY` | Tham gia hoạt động học tập (vd. Phòng cả lớp) | máy chủ / GV / Admin | `activityId` | 15 | 1 lần/hoạt động · tối đa 30/ngày |

- **Không có nguồn nào cho "mở trang", "đăng nhập", "xem bài".** Loại hoạt động lạ bị từ chối. Làm lại cùng một bài
  không cộng thêm (`once`).
- Ngày và tuần tính theo **giờ Việt Nam** (UTC+7, tuần bắt đầu thứ Hai). Có test cho mốc 23:59 / 00:00.
- Chạm trần ngày giữa chừng thì chỉ cộng phần còn lại (ví dụ 20, 20, 10 khi trần là 50).
- Linh thạch **không** phải EXP. Linh thạch là vật phẩm, nhận khi đột phá, dùng để đổi đồ trang trí.

### 2.2 Admin cấu hình mức thưởng

- Mặc định nằm trong `DEFAULT_CONFIG` (`cultivation-core.js`). Admin **chỉ ghi phần muốn đổi**, dạng JSON, vào Script
  Property `TR_CONFIG`. Ví dụ: `{"rewards":{"LESSON":{"amount":25}},"breakthrough":{"3":{"minExp":1000}}}`.
- `mergeConfig` ghép phần ghi đè vào mặc định, rồi `validateConfig` kiểm: đủ 7 nguồn, mức thưởng là số nguyên 0–1000,
  `minScore`/`minPct` trong 0–100, ngưỡng EXP tăng dần qua 7 cảnh giới, công pháp được nhắc tới phải tồn tại.
  **Sai thì service không khởi tạo** (báo lỗi rõ), tuyệt đối không âm thầm dùng cấu hình hỏng.
- Mỗi dòng sổ cái ghi `rulesVersion` (`config.version`) để biết lúc đó áp dụng luật nào.
- Đổi `TR_CONFIG` có hiệu lực sau khi bản đệm hết hạn (tới 6 giờ, theo `cachedProp_`). Màn cấu hình cho Admin (GĐ6)
  sẽ ghi qua `setCachedProp_` nên có hiệu lực ngay.

### 2.3 Quy trình tính 1 sự kiện (`evaluateEvent`)

```
sự kiện { type, learnerId, evidence } + actor (do MÁY CHỦ xác định từ token / mã phiên)
  1. type có trong SOURCES?                     không → invalid
  2. learnerId đúng dạng L + 10 ký tự?           không → invalid
  3. actor được phép ghi loại này?               không → forbidden   (vd. GV không tự ghi "đạt bài kiểm tra")
  4. đủ bằng chứng, đúng kiểu, đúng khoảng?      không → invalid
  5. txId = learnerId|type|idNguồn đã có?        có    → { duplicate: true }, không ghi gì
  6. đạt ngưỡng điểm / mức tiêu chí?             không → below-threshold (làm lại khi sẵn sàng)
  7. mức thưởng = tra bảng (số bên gửi kèm bị bỏ qua, trừ TEACHER trong 1–30)
  8. trần ngày/tuần                              hết → cap-reached; TEACHER vượt tuần → status 'pending'
  9. → dòng { txId, kind:'exp', type, sourceId, amount, status, facts, by, createdAt, rulesVersion }
```

## 3. Linh căn

- 5 linh căn, gộp từ 7 chủ đề IC3: **Kim** (1 Căn bản công nghệ), **Mộc** (4 Sáng tạo nội dung), **Thủy** (5 Giao tiếp,
  6 Hợp tác), **Hỏa** (7 An toàn bảo mật), **Thổ** (2 Công dân số, 3 Quản lý thông tin).
- Nguồn dữ liệu: dòng `assessment` do **máy chủ** ghi sau mỗi bài đánh giá đã chấm (`recordAssessment`, điểm từng chủ
  đề 0–100). Dữ liệu luyện tập trên máy không dùng.
- Cách tính (`elementScores`): trung bình có trọng số theo thời gian. Bài cũ giảm nửa trọng số sau **45 ngày**, nên
  linh căn theo kịp sự tiến bộ. Một bài đánh giá chỉ ghi 1 lần (`attemptId`).
- **Không gán nhãn cố định, không hạn chế lộ trình:**
  - Chưa có bài cho một linh căn thì trả `null`, giao diện ghi "chưa đánh giá" (không phải 0, không phải "yếu").
  - Linh căn **không** xuất hiện trong bất kỳ điều kiện đột phá, khoá nội dung hay quyền truy cập nào. Giao diện chỉ
    dùng nó để gợi ý ("Nên làm tiếp: linh căn Mộc đang thấp nhất").
  - Giá trị luôn thay đổi theo bài mới. Không có "linh căn bẩm sinh".

## 4. Vật phẩm

| Loại (`kind`) | Ví dụ | Chức năng (`effect`) |
|---|---|---|
| `linh-thach` | Linh thạch | `currency`: đổi vật phẩm trang trí |
| `cong-phap` | Số Toán Kinh | `unlock-course`: mở công pháp (khoá học) |
| `phap-bao` | Thanh Phong Kiếm, Ấn Hộ Pháp | `cosmetic` |
| `dan-duoc` | Hồi Xuân Đan, Ngộ Đạo Đan | `streak-freeze` (giữ chuỗi ngày) hoặc `practice-hint` (gợi ý **chỉ khi luyện tập**) |
| `danh-hieu` | Kim Đan chân nhân, Chân Tiên | `title` |
| `trang-tri` | Khung Vân Mây, Khung Kim Ấn | `cosmetic` |

- Mỗi vật phẩm bắt buộc có: `id`, `name`, `desc`, `kind`, `rarity` 1–5 (Phàm, Linh, Huyền, Địa, Thiên), `obtain`
  (`realm` | `achievement` | `shop` + `price` | `event` | `start`) và `effect`. `validateItems` kiểm tất cả.
- **Không vật phẩm nào cộng EXP, đổi điểm hay đổi cảnh giới.** Danh sách `effect` hợp lệ không có loại đó, và đan dược
  chỉ được hỗ trợ luyện tập. Vì vậy không thể "mua" thành tích.
- Thưởng khi đột phá: `realmRewards` (cấu hình được). Ví dụ lên Trúc Cơ nhận Khung Vân Mây + 100 linh thạch.

## 5. Đột phá

Điều kiện mặc định (`breakthrough`, cấu hình được). Phải đạt **đủ cả 4 nhóm**:

| Lên | EXP | Hoàn thành công pháp | Vượt qua kiểm tra | Thực hành |
|---|---|---|---|---|
| Trúc Cơ | 300 | — | `khao-hach-2` | — |
| Kim Đan | 900 | IC3 cấp 1 (7 bài) | `khao-hach-3` | 1 dự án được duyệt |
| Nguyên Anh | 2.000 | IC3 cấp 1, MOS Word | `khao-hach-4` | 2 dự án, 1 nhiệm vụ |
| Hóa Thần | 4.000 | IC3 cấp 2 | `khao-hach-5` | 3 dự án, 2 nhiệm vụ |
| Độ Kiếp | 7.000 | IC3 cấp 3 | `khao-hach-6` | 4 dự án, 3 nhiệm vụ |
| Chân Tiên | 11.000 | IC3 cấp 3 | `khao-hach-7` | 4 dự án, 3 nhiệm vụ + **chứng chỉ thật** (nhiệm vụ do GV ghi kèm `certified`) |

- "Hoàn thành công pháp" = mọi bài (`lessonId`) của công pháp có giao dịch `LESSON` đã xác nhận và chưa bị huỷ.
- Quy trình: học sinh bấm **Đột phá** → máy chủ gọi `breakthrough()` → **tự kiểm lại** mọi điều kiện trên sổ cái (không
  tin trạng thái nút bấm ở trình duyệt) → đủ thì ghi dòng `realm` + các dòng `item` thưởng + thành tựu mới, **trong
  cùng một giao dịch**. Chưa đủ thì trả danh sách điều kiện còn thiếu.
- Mã giao dịch `learnerId|REALM|n` nên bấm 2 lần cũng chỉ nhận thưởng 1 lần.
- **Hiệu ứng** (`web/src/features/techrealm/ui/BreakthroughDialog.tsx`), phẳng, khoảng 1,3 giây, chạy 1 lần: ấn cũ
  mờ đi, vòng ấn vàng tự vẽ, ấn mới hiện, tên cảnh giới và vật phẩm thưởng hiện lần lượt. Máy bật "giảm chuyển động"
  thì thấy ngay khung cuối. Xem thử: chân trang TechRealm → **"Xem thử hiệu ứng đột phá"** (chạy `breakthrough()`
  thật trên một học viên mẫu vừa đủ điều kiện).

## 6. Sổ cái và lịch sử

### 6.1 Loại dòng (`kind`)

| kind | Ghi khi | Trường riêng |
|---|---|---|
| `exp` | Nhận EXP | `type`, `sourceId`, `amount`, `status` (`confirmed` \| `pending`), `facts` (điểm, `durationSec`, chủ đề) |
| `review` | Admin duyệt giao dịch chờ | `refTxId`, `status` (`confirmed` \| `rejected`) |
| `reversal` | GV/Admin huỷ giao dịch (gian lận, chấm nhầm), **bắt buộc lý do** | `refTxId`, `amount` âm, `note` |
| `realm` | Đột phá | `realm` |
| `item` | Nhận vật phẩm | `itemId`, `qty` |
| `achievement` | Đạt thành tựu (tự đánh giá sau mỗi thay đổi) | `achievementId` |
| `assessment` | Bài đánh giá năng lực đã chấm | `facts.topics` |

Mọi dòng có `txId`, `learnerId`, `by` (người hoặc `system`), `createdAt` (giờ máy chủ), `rulesVersion`.

### 6.2 Trạng thái hiệu lực (`summarize`)

```
exp 'confirmed' ──────────────────────────────► tính vào EXP
exp 'pending' ── có review confirmed ──────────► tính vào EXP (người xác nhận = Admin duyệt)
              └─ có review rejected ───────────► không tính
mọi exp ──────── có reversal ──────────────────► 'reversed', không tính (người xác nhận = người huỷ, kèm lý do)
```

### 6.3 Lịch sử mà Prompt 03 yêu cầu lưu

| Yêu cầu | Có trong sổ cái ở |
|---|---|
| EXP nhận được | dòng `exp` (+ `review`/`reversal`) |
| Vật phẩm nhận được | dòng `item` |
| Cảnh giới | dòng `realm` |
| Thành tựu | dòng `achievement` |
| Nhiệm vụ | dòng `exp` có `type: 'QUEST'` |
| Thời gian hoạt động | `facts.durationSec` của bài học/bài tập/kiểm tra → `profile().activityMinutes` |

`profile(learnerId).history` trả toàn bộ, mới nhất trước. Trang **Hồ sơ nhân vật** hiển thị và lọc theo loại.

### 6.4 Lưu trên Google Sheet (`79-tr-ledger.gs`)

- Tab `TR_SoCai` trong **file Sheet riêng** (Script Property `TR_LEDGER_SPREADSHEET_ID`). 12 cột: `TxId, LearnerId,
  Kind, Type, SourceId, Amount, Status, RefTxId, Data (JSON), Note, By, CreatedAt`.
- Mọi ô chữ ghi kèm dấu `'`, nên Sheet không đổi thời điểm ISO thành ngày giờ hay chuỗi `=…` thành công thức.
- Đọc dòng của 1 học sinh bằng `TextFinder` (khớp cả ô) trên cột LearnerId, không quét cả tab.
- Sức chứa: khoảng 800.000 dòng/file (trần 10 triệu ô). Với chỉ các sự kiện **đã xác thực** (không gồm luyện tập),
  ước 300–1.000 dòng/ngày cho 3.000 học sinh, tức 2–7 năm/file. Khi gần đầy, chuyển sang file theo năm học kèm dòng
  "kết chuyển" (chưa làm, ghi trong Rủi ro).

## 7. Chống ghi nhận trùng — chi tiết

| Tình huống | Cơ chế | Test |
|---|---|---|
| Học sinh bấm nộp 2 lần / mạng chập chờn gửi lại | `txId` tất định → lần 2 trả `duplicate`, không ghi | service, tr-ledger |
| Làm lại cùng bài để cày EXP | `once`: `txId` theo id bài, không theo lượt làm | core |
| 2 lượt Apps Script ghi cùng lúc trước khi kịp thấy nhau | `summarize` chỉ tính dòng đầu tiên của mỗi `txId` (test ghi 2 dòng giống hệt vào Sheet → EXP không đổi) | core, tr-ledger |
| 2 sự kiện khác nhau cùng lúc làm vượt trần ngày | `transact` chạy trong `LockService` (đọc–tính–ghi liền khối); khoá bận quá 15 giây → lỗi `resource-exhausted`, web gửi lại sau | tr-ledger |
| Duyệt / huỷ / đột phá bấm 2 lần | `txId` = `ref|review`, `ref|reversal`, `learner|REALM|n` | service |
| Sửa số EXP trong gói tin | Bị bỏ qua, mức thưởng tra bảng | core |

## 8. Bảo mật

| Mối đe doạ | Chặn bằng |
|---|---|
| Học sinh tự gửi "cộng EXP" | Học sinh chỉ gửi bằng chứng; `actor` do máy chủ xác định; `LESSON/EXERCISE/TEST` chỉ nhận `actor: system` (sau khi Apps Script tự chấm) |
| Giáo viên thưởng tuỳ tiện | Trần 30/lần, 50/tuần; vượt thì chờ Admin; bắt buộc lý do; ghi `uid` |
| Giáo viên duyệt bài lớp khác | Route (GĐ5) kiểm `classId` của học sinh nằm trong `classes.teacherIds`, đọc bằng chính ID token của giáo viên (FIREBASE_SECURITY §2) |
| Vật phẩm "mua" thành tích | `validateItems` cấm mọi chức năng ngoài danh sách cho phép |
| Cấu hình Admin hỏng | `validateConfig`; sai thì service không chạy |
| Sửa dấu vết | Sổ cái chỉ thêm; file Sheet chỉ chia sẻ cho chủ Apps Script + Super Admin |

## 9. API

```js
// Apps Script (sau GĐ4): const svc = trService_();
// Trình duyệt / test:    const svc = EduCultivationService.create({ store: EduCultivationService.createMemoryStore(), clock });
svc.recordEvent({ type, learnerId, evidence }, actor)      // → { ok, duplicate?, tx?, code?, reason? }
svc.recordAssessment(learnerId, attemptId, topics, actor)  // chỉ actor.kind === 'system'
svc.review(learnerId, refTxId, 'confirmed'|'rejected', actor, note)   // chỉ admin
svc.reverse(learnerId, refTxId, actor, note)               // teacher | admin, note ≥ 5 ký tự
svc.breakthrough(learnerId, actor)                         // → { ok, to, items } | { ok:false, conditions }
svc.profile(learnerId)                                     // → { exp, pendingExp, realm, stage, next, elements, items, achievements, activityMinutes, history }
```
Mã lỗi: `invalid`, `forbidden`, `below-threshold`, `cap-reached`, `not-eligible`, `not-found`. Adapter Sheet thêm
`failed-precondition` (chưa cấu hình) và `resource-exhausted` (khoá bận).

Cổng lưu trữ (port) duy nhất: `store.transact(learnerId, fn)`. Thay Sheet bằng Firestore (khi lên Blaze) chỉ cần viết
adapter mới, không sửa luật hay service.

## 10. Kiểm thử

| File | Nội dung | Số kiểm tra |
|---|---|---|
| `js/techrealm/__tests__/cultivation-core.test.js` | 7 cảnh giới, tiểu cảnh giới, cấu hình, vật phẩm, từng nguồn EXP, trần ngày/tuần theo giờ VN, trùng, duyệt, huỷ, đột phá, linh căn, thành tựu | 62 |
| `js/techrealm/__tests__/cultivation-service.test.js` | Idempotent qua kho, đột phá trọn quy trình, quyền, duyệt/huỷ, linh căn, tách học sinh, cấu hình sai | 30 |
| `apps/__tests__/tr-ledger.test.js` | Chạy `apps/Code.gs` thật trên Sheet giả: tạo tab, ghi/đọc lại, trùng giữa 2 lượt chạy, ghi đua, khoá bận, đột phá, `TR_CONFIG` | 17 |
| `tests/e2e/suites/techrealm.mjs` | Giao diện hiển thị đúng số do luật tính, nút Đột phá khoá khi chưa đủ, hiệu ứng đột phá, lịch sử, lọc | 36 (cả bộ) |

Các test luật đã được thử "cài lỗi": bỏ khử trùng, bỏ trần ngày, bỏ điều kiện công pháp. Cả 3 lần test đều báo lỗi
đúng chỗ.

Chạy: `node js/techrealm/__tests__/cultivation-core.test.js`, `node js/techrealm/__tests__/cultivation-service.test.js`,
`node scripts/build-apps-script.js && node apps/__tests__/tr-ledger.test.js` (CI chạy cả 3).

## 11. Chưa làm / rủi ro

| # | Việc | Ghi chú |
|---|---|---|
| 1 | Route Apps Script cho học sinh và giáo viên | Cần mã học tập (GĐ4) và phiên khảo hạch (GĐ5). Adapter đã sẵn sàng |
| 2 | Đề khảo hạch kín + chấm máy chủ để sinh sự kiện `TEST`/`LESSON` | SERVER-GRADING bước 2–3 |
| 3 | Màn cấu hình mức thưởng cho Admin | Hiện sửa JSON trong Script Property |
| 4 | Kết chuyển sổ cái sang file năm học mới | Khi file gần 800.000 dòng |
| 5 | Khoá ScriptLock dùng chung mọi học sinh | Cuối tiết, 40 em cùng nộp có thể phải chờ; đã có lỗi "bận" + gửi lại. Đo thật ở GĐ5 |
| 6 | Chính sách hạ cảnh giới khi phát hiện gian lận nặng | Hiện không tự hạ; cần bạn quyết |
| 7 | Mức thưởng và ngưỡng là đề xuất | Cần giáo viên thử 1 lớp rồi chỉnh qua `TR_CONFIG` |
