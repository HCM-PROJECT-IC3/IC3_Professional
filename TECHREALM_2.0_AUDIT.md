# TECHREALM 2.0 — Báo cáo Audit & Đề xuất kiến trúc

> Ngày: 16/11/2026 · Nhánh: `react-2.0` (commit `e02281c`) · Phạm vi: Bước 1–6 của Master Prompt TECHREALM 2.0.
> **Chưa viết code.** Tài liệu này kế thừa các audit trước, không thay thế chúng:
> [docs/architecture/AUDIT-2.0.md](docs/architecture/AUDIT-2.0.md) (02/11), [BACKEND-MAP.md](docs/architecture/BACKEND-MAP.md),
> [CLEAN-ARCHITECTURE.md](docs/architecture/CLEAN-ARCHITECTURE.md), [SCALING-SPARK.md](docs/architecture/SCALING-SPARK.md),
> [SERVER-GRADING.md](docs/architecture/SERVER-GRADING.md), [NGHIEM-THU-2.0.md](docs/architecture/NGHIEM-THU-2.0.md),
> [docs/ROADMAP-PHAT-TRIEN.md](docs/ROADMAP-PHAT-TRIEN.md).

## 0. Tóm tắt cho người quyết định

1. **Dự án không bắt đầu từ số 0.** EduQuiz đã có React 2.0 (Vite + Tailwind) chạy song song ở `/app/`, lớp
   Domain/Repository/Service, Firestore Rules theo vai trò và theo trường, Apps Script làm backend có xác thực,
   CI 5 job, E2E 148/148, đo hạn mức Spark thật. TECHREALM nên là **một lớp mới đặt trên nền này**, không viết lại.
2. **Master Prompt có 5 yêu cầu va chạm với quyết định đang chạy** (§6.1). Quan trọng nhất:
   - Học sinh hiện **không đăng nhập** (đã chốt 12/11/2026). Đây là lý do hệ thống sống được trong gói Spark.
   - "EXP không cộng từ frontend" cần một máy chủ chấm điểm. Gói Spark **không có Cloud Functions**, nên nơi duy
     nhất làm được việc này miễn phí là **Apps Script**.
   - Phong cách "ánh sáng, năng lượng, vàng kim, tím huyền bí" **trái với hướng giao diện bạn đã chọn**: phẳng,
     tối giản, không glow, không gradient, không "kiểu AI" (15–16/11/2026).
3. **Nút thắt lớn nhất là nội dung, không phải code.** Hiện có ~8.000 câu hỏi IC3/Spark/MOS. Khối F (Vật lý, Hoá,
   Sinh, AI, Robotics, IoT, Tài chính…) chưa có một bài học nào. Mỗi "bí cảnh" hay "phòng thí nghiệm" cần người
   soạn nội dung.
4. **Còn 1 nợ bảo mật mở từ 02/11:** `data/roster/students-active.json` (2.838 học sinh thật) vẫn công khai,
   `roster.mode` vẫn là `'public-json'`. TECHREALM sẽ cho học sinh danh tính lâu dài (mã học tập), nên phải đóng
   nợ này **trước**.
5. Đề xuất: làm theo 8 giai đoạn (§9). Giai đoạn 1–2 **0 lượt Firebase, 0 lượt Apps Script**, có thể bắt đầu ngay
   sau khi chốt các câu hỏi ở §6.1.

---

## 1. Cấu trúc repository

Số liệu: 1.273 file được git theo dõi.

| Thư mục / file | Số file | Nội dung |
|---|---|---|
| `*.html` (gốc) | 25 | Mỗi trang 1 file độc lập: sảnh `index.html`, `arena.html`, các dashboard, mini-game, công cụ giáo viên |
| `js/` | 233 (không tính `vendor/`), ~73.000 dòng | Logic theo tính năng, mỗi file gắn 1 namespace `window.Edu…` |
| `js/core/`, `js/models/`, `*-core.js` | | **Domain** thuần: `grading.js` (luật chấm 10 loại câu), `rbac.js`, model, `arena-core`, `thi-dua-core`… |
| `js/repositories/` | 9 | Truy cập Firestore (`base-repository` + user/roster/school/result/teaching…) |
| `js/services/` | ~25 | Adapter + use case: Apps Script client, hàng đợi gửi lại, cache, result-pack, AI, wrongbook |
| `js/arena/` | 25 | Đấu trường: chế độ chơi, Linh vật, phòng cả lớp WebRTC, mini-game, nhiệm vụ |
| `css/` | 42 | 1 stylesheet/trang + `theme.css` (token dùng chung) |
| `data/ic3/` | ~400 | Ngân hàng câu hỏi JSON: 10 file khối + ~390 minitest nhỏ + `meta.json` + manifest |
| `data/roster/` | 1 | `students-active.json` — **dữ liệu cá nhân công khai** (xem §6.2) |
| `mos/` | 195 | Ôn luyện MOS Word/Excel/PowerPoint: đề, rubric chấm, công cụ |
| `img/` | 177 | Ảnh câu hỏi (webp), tranh tự vẽ (malware SVG), icon PWA |
| `web/` | 60 | **Mã nguồn React 2.0** (TypeScript) — build ra `app/` |
| `app/` | 9 + assets | Bản build React đã commit, phục vụ ở `/app/` |
| `apps/` | 22 | Google Apps Script: `src/*.gs` (19 file) ghép thành `Code.gs` |
| `server/` | 4 | Máy chủ trường (Node, Docker): hàng đợi bài nộp, phát trang qua LAN |
| `scripts/` | 29 | Build, kiểm tra CI, xử lý dữ liệu, đo Firestore |
| `tests/` | 21 | E2E Puppeteer (11 bộ) + kiểm thử Firestore Rules trên emulator |
| `docs/` | 9 | Kiến trúc, hạn mức, roadmap, Docker, nghiệm thu |
| Gốc | | `firestore.rules` (440 dòng), `firestore.indexes.json`, `firebase.json`, `wrangler.jsonc`, `sw.js`, `manifest.webmanifest`, `Dockerfile` |

Unit test: 63 file `*.test.js/mjs` (Domain, service, repository, Apps Script giả lập, server, rubric MOS).

## 2. Công nghệ đang sử dụng

| Lớp | Công nghệ | Ghi chú |
|---|---|---|
| Giao diện cũ (25 trang) | HTML/CSS/JS thuần, **không build** | Mỗi trang nạp `<script>` trực tiếp |
| Giao diện 2.0 | React 19.1, React Router 7 (HashRouter), Vite 7, Tailwind 4, TypeScript 5.9, lucide-react, CVA | `web/` → `app/`; mượn Domain cũ bằng cách import IIFE |
| Xác thực | Firebase Auth (email/mật khẩu cho nhân sự; Anonymous cho đường dự phòng Đấu trường) | Học sinh **không** dùng Auth |
| CSDL | Cloud Firestore, project `data-ic3`, gói **Spark** | Ngân sách tự đặt 60%: 30.000 đọc / 12.000 ghi mỗi ngày |
| Backend xử lý | **Google Apps Script** (~30 route, `apps/src/10-router.gs`) + Google Sheet | Nhận bài nộp, xác thực ID token, giữ bí mật (token GitHub, khoá AI), chấm lại |
| Thời gian thực | WebRTC qua PeerJS (máy giáo viên làm chủ phòng) | 0 lượt Firebase |
| AI | Gemini qua Apps Script (`78-ai.gs`) hoặc khoá cá nhân giáo viên | Có trần lượt |
| Hosting | GitHub Pages (chính) · Cloudflare Static Assets · Firebase Hosting (cấu hình sẵn, bản rút gọn `dist-hosting/`) | Không Worker, không SPA fallback |
| Offline | Service Worker `sw.js`, gói offline, PWA | |
| Thư viện | Chart.js, jsPDF, ExcelJS, JSZip, QRCode, PeerJS (vendor tự chứa) | Nạp theo trang |
| CI | GitHub Actions: `check`, `rules` (emulator), `web` (tsc + build), `e2e` (Puppeteer), Docker | |

## 3. Các chức năng hiện tại

**Học sinh (không đăng nhập — chọn Trường/Lớp/Tên ở sảnh):**
- Làm bài IC3 Spark/LV1–3 và MOS theo chủ đề; 10 loại câu: `single` 4.651, `multi` 1.414, `truefalse` 712,
  `matching` 557, `selectfill` 357, `hotspot` 182, `list` 74, `classify` 52, `ordering` 29, `dragfill` 12.
- Chế độ Ôn luyện / Kiểm tra (tính giờ, phát hiện chuyển tab, nhiều tab, thoát toàn màn hình).
- Ôn MOS trên Office thật, chấm trên trình duyệt; mô phỏng máy tính (`computer-simulator.html`).
- **Góc học tập** (`learning-hub.js`): tiến độ, mức nắm vững từng bài, lộ trình thích ứng, mục tiêu tuần, chứng nhận PNG.
- **Sổ tay câu sai**: hộp Leitner (ngay → 1 → 3 → 7 ngày → thuộc), thẻ lật.
- **Gamification** (`gamification.js`): XP (10/câu đúng, 50/bài, +100 điểm tuyệt đối, 20/lượt game), 10 cấp, streak,
  12 huy hiệu, nhiệm vụ ngày.
- **Đấu trường** (`arena.html`): nhiều chế độ chơi với đối thủ máy, xu, mở hộp **Linh vật**, sự kiện theo mùa, hành
  trình mini-game 5 chặng, Đấu Boss; **Phòng cả lớp** tới 80 học sinh qua WebRTC.
- Thử thách hôm nay (5 câu/ngày), đếm ngược kỳ thi, nhiệm vụ theo mùa thi.
- Nộp kết quả bằng mã `EQR1.…` (offline) hoặc qua Apps Script; hàng đợi gửi lại khi mất mạng.

**Giáo viên / nhân sự (đăng nhập Firebase):**
- Dashboard giáo viên, điều phối, quản trị (bản cũ + bản 2.0); câu cả lớp hay sai; thi đua lớp theo tuần.
- Soạn đề (5 dạng câu, đề nằm gọn trong link `?de=…`), giao bài về nhà có hạn nộp, Trình chiếu lớp học.
- Quản lý học sinh (nạp Excel), mã lớp, tài khoản & duyệt, trường (`schools`).
- Điểm danh, Sổ đầu bài, Gọi tên, Lịch giảng dạy, TKB, tính khoảng cách xăng xe (Maps).
- Gom kết quả từ mã/file; cộng đồng giáo viên (`portfolio.html`, `gvlab_*`); trợ lý AI.
- Quản lý ảnh/câu hỏi và đẩy lên GitHub qua Apps Script.

**Vai trò** (`js/core/rbac.js` + `firestore.rules`): `admin`, `school_admin`, `coordinator`, `teaching_coordinator`,
`teacher`, `student` (chưa dùng thật).

## 4. Cách dữ liệu đang được lưu trữ

Hệ thống chia dữ liệu theo **3 nơi**, mỗi nơi làm việc nó rẻ nhất (chi tiết: BACKEND-MAP.md):

| Nơi | Dữ liệu | Ai ghi → ai đọc |
|---|---|---|
| **File tĩnh** (Pages) | Ngân hàng câu hỏi `data/ic3/**` (**kèm đáp án**), `meta.json`, roster công khai, đề MOS | Admin qua Apps Script → mọi học sinh |
| **localStorage** (máy học sinh) | `eduquiz_records` (lịch sử bài), `eduquiz_gamestate` (XP/cấp/huy hiệu), `eduquiz_arena_v1` (xu, Linh vật theo biệt danh), `eduquiz_wrongbook_v1`, `eduquiz_goals_v1`, `eduquiz_daily`, `eduquiz_current_student`, `eduquiz_pending_sync_v1`… (~60 khoá) | Học sinh → học sinh. **Không đồng bộ giữa máy, chung cho mọi người dùng cùng máy** |
| **Google Sheet** (qua Apps Script) | `NhatKyNopBai` (mọi bài nộp, cột `CauSai`, `ChiTiet`), `NhatKyMOS`, `NhatKyDauTruong`, `NhatKyHoatDong` (audit), `MaLop`, `SoLopTruong` | Học sinh/nhân sự → dashboard |
| **Firestore** | `users`, `schools`, `students_roster`, `classes`, `courses`, `teaching_*` (6), `gvlab_*` (4), `teacher_sync`, `arena_relay`; `quiz_results`/`mos_submissions` **đã đóng ghi** | Nhân sự ↔ nhân sự |

Định dạng câu hỏi (giữ nguyên, không đổi):

```json
{ "id": 182, "uid": "ic3__lv1__bai1__q1", "type": "single", "question": "…",
  "options": ["…"], "correct": ["…"], "explanation": "…", "image": false, "image_file": null, "image_id": null }
```
Loại câu khác thêm `statements`/`pairs`/`segments`+`blanks`+`wordBank`/`areas`/`zones`/`items`. `uid` là khoá ổn định
dùng xuyên suốt (sổ câu sai, `CauSai`, chấm lại).

## 5. Thành phần tái sử dụng được cho TECHREALM

| TECHREALM cần | Đã có | Tái sử dụng thế nào |
|---|---|---|
| Tàng Kinh Các / Công pháp / Bài học / Kiểm tra | Ngân hàng 8.000 câu + `meta.json` (chương trình → cấp → bài) + `quiz-engine.js` | Mỗi cấp IC3 = 1 "bộ công pháp", mỗi bài = 1 "chương". Không đổi file dữ liệu, chỉ thêm file ánh xạ |
| Chấm điểm đáng tin | `js/core/grading.js` + `apps/src/77-grading.gs` (đã test khớp nhau trên toàn ngân hàng), `serverGrading: 'verify'` | Nền cho "Khảo hạch cảnh giới" (§7.3) |
| EXP, cấp, huy hiệu, nhiệm vụ ngày | `gamification.js` | Giữ làm "Tu vi luyện tập" (cục bộ); TECHREALM đọc thêm, không ghi đè |
| Linh thạch | Xu Đấu trường (`eduquiz_arena_v1.coins`) | Đổi tên hiển thị hoặc quy đổi; không đổi khoá lưu |
| Pháp bảo | Linh vật + sự kiện mùa (`arena-core.js`) | Mở rộng bộ sưu tập |
| Bí cảnh / Boss | Hành trình 5 chặng, Đấu Boss, `pz-defense`, `cyber-detective`, `computer-simulator` | Đóng gói lại thành bí cảnh theo chủ đề |
| Cây kỹ năng / tiến độ | Mức nắm vững từng bài + lộ trình thích ứng (`learning-hub.js`) | Cây kỹ năng = đồ thị trên cùng dữ liệu |
| Thành tựu, chứng nhận | Huy hiệu, chứng nhận PNG canvas | Mở rộng |
| Bảng xếp hạng | Thi đua lớp theo tuần, bảng xếp hạng Thử thách hôm nay qua `gom-ket-qua` | Bảng xếp hạng **đã xác thực** (§7.3) |
| Giáo viên giao nhiệm vụ | Soạn đề + giao bài có hạn nộp (link `?de=`, 0 Firebase) | "Nhiệm vụ tông môn" |
| Danh tính học sinh không đăng nhập | Mã lớp qua Apps Script (`75-roster-codes.gs`, đang tắt) | Mở rộng thành **mã học tập** cá nhân |
| Shell giao diện | React 2.0: `AppShell`, `PageHeader`, `StatCard`, `States` (loading/empty/error), `DataTable`, ui/* | Thêm route, giữ component |
| Phân quyền | `rbac.js` + `firestore.rules` + kiểm thử emulator | Thêm quyền `techrealm.*` |
| Kiểm thử | CI, E2E, `check-architecture.js`, `netlog-check` (bắt lượt Firebase ngoài ý muốn) | Mọi module mới phải qua |

## 6. Hạn chế kỹ thuật và các điểm cần chốt

### 6.1 Chỗ Master Prompt va chạm với hệ thống đang chạy — **cần bạn quyết định**

| # | Master Prompt yêu cầu | Thực tế / quyết định trước đó | Đề xuất |
|---|---|---|---|
| Q1 | Đăng nhập & đăng ký, hồ sơ người dùng (cho học sinh) | Học sinh **không đăng nhập** (chốt 12/11/2026). 3.000 HS × Firebase Auth + đọc/ghi hồ sơ sẽ vượt Spark | **Mã học tập** 8 ký tự do giáo viên phát (mở rộng mã lớp), lưu ở Sheet qua Apps Script. Không Firebase Auth cho học sinh. Nhân sự giữ đăng nhập như cũ |
| Q2 | EXP/phần thưởng/cảnh giới "xác thực qua quy trình đáng tin cậy" | Spark không có Cloud Functions. Đáp án nằm công khai trong `data/ic3` → mọi điểm chấm ở trình duyệt đều giả được | **Hai tầng**: *Tu vi luyện tập* (cục bộ, không xác thực, chỉ để vui) và *Cảnh giới chính thức* (chỉ tăng qua **Khảo hạch** chấm trên Apps Script với đề không công khai + giáo viên duyệt sản phẩm). Bảng xếp hạng chỉ dùng tầng 2 |
| Q3 | UI "ánh sáng, năng lượng, vàng kim, tím huyền bí, chiều sâu không gian" | Bạn đã loại bỏ glow, gradient, emoji 3D, tranh AI, thẻ vàng phát sáng (15–16/11/2026); hướng hiện tại là phẳng, tối giản | Giữ **chất tiên hiệp bằng ngôn từ, cấu trúc và hoạ tiết hình học phẳng** (đường mạch, ấn triện, vân mây vẽ tay bằng SVG), bảng màu xanh đêm + một điểm nhấn vàng kim dùng tiết chế, **không** glow/gradient. Cần bạn xác nhận hướng này trước khi vẽ |
| Q4 | Firebase Storage cho file sản phẩm | Cloud Storage for Firebase hiện yêu cầu gói Blaze cho bucket mới (cần kiểm tra lại trên Console trước khi quyết) | Sản phẩm Bách Công Phường lưu **Google Drive qua Apps Script** (đã có quyền Drive), giới hạn dung lượng/HS |
| Q5 | Thử thách lập trình | Chưa có môi trường chạy code; chấm code an toàn cần sandbox | Giai đoạn đầu: lập trình kéo-thả / JS chạy trong Web Worker trên máy, chấm theo test case **luyện tập**; chỉ Khảo hạch mới chấm lại trên Apps Script (giới hạn ngôn ngữ đơn giản) |

Câu hỏi phụ:
- **Q6.** TECHREALM là **giao diện mới thay sảnh cũ**, hay **một khu riêng** trong `/app/` (sảnh cũ vẫn là mặc định)? Đề xuất: khu riêng `/app/#/the-gioi`, sảnh cũ không đổi cho tới khi giáo viên quen.
- **Q7.** Đối tượng: chỉ học sinh tiểu học/THCS đang dùng IC3 Spark/LV1–3, hay mở rộng THPT? Ảnh hưởng tới văn phong (tránh "quá trẻ con" nhưng lớp 3 vẫn phải hiểu).
- **Q8.** Ai soạn nội dung khối F (Khoa học & Đời sống)? Không có người soạn thì nên hoãn khối F.

### 6.2 Nợ kỹ thuật và bảo mật hiện có

| Mức | Vấn đề | Ảnh hưởng tới TECHREALM |
|---|---|---|
| 🔴 | `data/roster/students-active.json`: họ tên + trường + lớp của 2.838 học sinh **công khai**, còn trong lịch sử git | Phải chuyển `roster.mode = 'class-code'`, gỡ file, dọn lịch sử **trước** khi phát mã học tập |
| 🔴 | Đáp án đề nằm công khai, điểm chấm ở trình duyệt; route `submitExam` công khai, giả được | Chặn mọi "phần thưởng thật"; cần SERVER-GRADING bước 2 (đề Kiểm tra không lên Pages) |
| 🟠 | Tiến độ/XP chỉ ở localStorage, **chung cho cả máy** (phòng máy trường nhiều HS dùng 1 máy), mất khi xoá dữ liệu trình duyệt | Hồ sơ tu luyện cần tách theo mã học tập + bản sao trên Sheet |
| 🟠 | `js/quiz-engine.js` 5.484 dòng, `volumes-carousel.js` 4.475 dòng — trộn UI/chấm/nộp | Không tách lớn; TECHREALM chỉ gọi qua `grading.js` và `result-submitter.js` |
| 🟡 | Firestore Spark: trần 20.000 ghi/ngày; ngân sách 12.000 | Mọi tính năng học sinh phải **0 ghi Firestore** |
| 🟡 | Apps Script: 30 lượt chạy song song/tài khoản, 10 triệu ô/file, PropertiesService 50.000 lượt/ngày | Khảo hạch và sổ cái EXP phải gom ghi, chia file theo trường như `sheetEndpoints` |
| 🟡 | Trường định danh bằng tên ở Sheet và một phần Firestore; chuyển `schoolId` chưa xong | Bản ghi mới của TECHREALM dùng `schoolId` ngay từ đầu |
| 🟡 | 25 trang ở gốc không được dời (link đã phát, `sw.js`, bookmark) | Mọi trang mới đặt trong `/app/` |
| 🟡 | Firestore direct-call còn trong 8 file giao diện (`BASELINE` bánh cóc) | Không thêm; TECHREALM chỉ dùng repository |
| ⚪ | Không có nội dung STEM/AI/Robotics/IoT/Tài chính | Khối F = dự án nội dung, không phải dự án code |

## 7. Kiến trúc đề xuất

### 7.1 Nguyên tắc

1. **TECHREALM là một lớp trình bày + một Domain mới**, đặt trong React 2.0 (`web/src/features/techrealm/`).
   Trang cũ, `sw.js`, `firestore.rules`, `js/` dùng chung **không sửa** cho tới giai đoạn cần backend.
2. **Tách 3 miền dữ liệu** như Master Prompt yêu cầu:
   - *Học tập* — nội dung + bài nộp (file tĩnh + Sheet `NhatKyNopBai`, có sẵn).
   - *Trò chơi* — tu vi, linh thạch, pháp bảo, cảnh giới (localStorage + Sheet sổ cái mới).
   - *Quản trị* — tài khoản, lớp, nhiệm vụ giáo viên giao (Firestore, có sẵn + 1 collection nhỏ).
3. **Cảnh giới là hàm thuần** của dữ liệu đã có, không phải con số được cộng dồn. Bất kỳ máy nào (trình duyệt,
   Apps Script) cũng tính ra cùng kết quả từ cùng dữ liệu → test được, không lệch.
4. **0 lượt Firebase cho học sinh** — giữ đúng như hiện tại; `netlog-check` trong E2E bắt vi phạm.

### 7.2 Sơ đồ tầng

```
web/src/features/techrealm/           Presentation (React)
  ├─ world/        Bản đồ thế giới, điều hướng các khu
  ├─ tang-kinh-cac/ Công pháp (khoá học) → chương (bài) → luyện tập (mở quiz cũ bằng deeplink ?ct=&cap=&bai=)
  ├─ tu-luyen/     Hồ sơ: cảnh giới, linh căn, danh hiệu, pháp bảo, cây kỹ năng
  ├─ bi-canh/      Thử thách, Boss (gói lại mini-game/arena có sẵn)
  ├─ khao-hach/    Thi lên cảnh giới (chấm trên máy chủ)
  ├─ bach-cong-phuong/ Dự án, nộp sản phẩm, portfolio
  └─ tong-mon/     (giáo viên) giao nhiệm vụ, duyệt sản phẩm, xem tiến độ lớp

js/techrealm/ (Domain thuần, dùng chung cho React + Apps Script + test Node)
  ├─ realm-core.js     7 cảnh giới, điều kiện mở khoá, tính cảnh giới từ dữ liệu
  ├─ linh-can-core.js  Linh căn = điểm mạnh theo 7 chủ đề IC3 (từ mức nắm vững)
  ├─ ledger-core.js    Quy tắc sự kiện EXP (loại, trần/ngày, chống trùng)
  └─ skill-tree.js     Đồ thị kỹ năng ↔ bài học ↔ uid câu hỏi

Application: web/src/features/techrealm/services/  (use case, nhận port qua tham số — mẫu ai-assistant.js)
Infrastructure:
  ├─ localStorage adapter  (đọc khoá cũ, ghi khoá mới techrealm_v1)
  ├─ apps-script-client.js (có sẵn) → route mới tr*
  └─ repositories/ (có sẵn) → 1 repository mới cho nhiệm vụ giáo viên
```

`scripts/check-architecture.js` thêm `js/techrealm/` vào danh sách Domain thuần (luật R1).

### 7.3 Mô hình tin cậy cho EXP và cảnh giới (trả lời yêu cầu "không cộng từ frontend")

| Tầng | Nguồn | Ai tính | Dùng cho | Giả được? |
|---|---|---|---|---|
| **Tu vi luyện tập** | Bài luyện, game, bí cảnh trên máy | Trình duyệt | Thanh tiến độ, pháp bảo trang trí, linh thạch | Có — chấp nhận, vì không có giá trị so sánh |
| **Công huân xác thực** | Khảo hạch (đề không công khai), bài Kiểm tra có `serverGrading`, sản phẩm được giáo viên duyệt | **Apps Script** ghi vào sổ cái | Cảnh giới chính thức, bảng xếp hạng, chứng nhận | Không (trong giới hạn: học sinh có thể nhờ người khác làm hộ — rủi ro R5) |

Điều kiện lên cảnh giới (ví dụ, sẽ tinh chỉnh với giáo viên):

| Cảnh giới | Điều kiện tri thức | Điều kiện khảo hạch | Điều kiện thực hành |
|---|---|---|---|
| 1. Luyện Khí | Hoàn thành 5 bài bất kỳ (tu vi) | — | — |
| 2. Trúc Cơ | Nắm vững ≥ 60% bài của 1 cấp | Khảo hạch Trúc Cơ ≥ 70% | — |
| 3. Kim Đan | Nắm vững cả 7 chủ đề của 1 cấp ≥ 70% | Khảo hạch Kim Đan ≥ 75% | 1 sản phẩm được duyệt |
| 4. Nguyên Anh | Hoàn thành 1 cấp + 1 bộ MOS | Khảo hạch ≥ 80% | 2 sản phẩm, 1 bí cảnh Boss |
| 5. Hoá Thần | 2 cấp IC3 | Khảo hạch ≥ 80%, đúng giờ | Dự án nhóm được duyệt |
| 6. Độ Kiếp | Lộ trình đủ 3 cấp | "Lôi kiếp": đề tổng hợp có giới hạn thời gian, 1 lượt/tuần | Portfolio ≥ 4 sản phẩm |
| 7. Chân Tiên | Đạt chứng chỉ IC3/MOS thật (giáo viên xác nhận) | — | Hướng dẫn 1 bạn khác (giáo viên xác nhận) |

### 7.4 Danh tính học sinh: mã học tập

- Giáo viên cấp mã 8 ký tự cho từng học sinh (mở rộng `publishRosterCodes`). Học sinh nhập mã 1 lần trên mỗi máy.
- Mã là **khoá giả danh**: Sheet lưu `maHocTap ↔ schoolId/lop/ten`; trình duyệt chỉ giữ mã + tên hiển thị.
- Đổi máy: nhập lại mã → Apps Script trả tóm tắt công huân xác thực (1 lượt). Tu vi luyện tập không đi theo
  (trừ khi bật đồng bộ ở giai đoạn sau — Ngưỡng D của ROADMAP).
- Mất mã: giáo viên cấp lại; mã cũ bị khoá.

## 8. Database schema đề xuất

> Nguyên tắc: **không sửa, không xoá** collection/khoá/tab/file dữ liệu cũ. Mọi thứ mới có tiền tố `tr_` / `techrealm`.

### 8.1 File tĩnh (Pages) — nội dung, 0 chi phí

```
data/techrealm/
  realms.json          7 cảnh giới: id, tên, thứ tự, điều kiện (khai báo, không phải code)
  cong-phap.json       Ánh xạ: công pháp → chương → {ct, cap, bai} của data/ic3 (KHÔNG chép câu hỏi)
  skill-tree.json      Nút kỹ năng: id, tên, cha, bài liên quan, chủ đề IC3
  bi-canh/<id>.json    Thử thách: loại (quiz|logic|code|sim), bộ câu (uid tham chiếu), luật thắng, phần thưởng tu vi
  labs/<mon>/<id>.json Bài thí nghiệm khối F (khi có nội dung)
  phap-bao.json        Danh mục vật phẩm trang trí (id, tên, độ hiếm, nguồn)
```
Đề Khảo hạch **không** nằm ở đây (xem 8.3).

### 8.2 localStorage — miền trò chơi cục bộ

Khoá mới `techrealm_v1`, tách theo mã học tập (sửa đúng lỗi "chung cả máy"):

```ts
{
  version: 1,
  profiles: {
    [maHocTap: string]: {
      displayName: string;
      tuVi: number;                 // tính lại được từ eduquiz_records + gamestate, chỉ là bản đệm
      linhThach: number;            // tiêu cho pháp bảo trang trí
      phapBao: Record<string, number>;
      danhHieuDangDung?: string;
      verified: {                   // bản sao từ Apps Script, chỉ đọc
        realm: 1|2|3|4|5|6|7; congHuan: number; syncedAt: string; sig: string;
      };
      biCanh: Record<string, { best: number; clearedAt?: string }>;
    }
  },
  active?: string                   // mã học tập đang dùng trên máy
}
```
Khoá cũ (`eduquiz_records`, `eduquiz_gamestate`, `eduquiz_arena_v1`, `eduquiz_wrongbook_v1`…) **chỉ đọc**.

### 8.3 Google Sheet (qua Apps Script) — miền xác thực

| Tab | Cột chính | Ghi khi | Ghi chú |
|---|---|---|---|
| `TR_HocVien` | maHocTap, schoolId, lop, ten, trangThai, capLuc | Giáo viên cấp mã | Mở rộng `MaLop` |
| `TR_DeKhaoHach` | deId, realm, cauHoi (JSON đã gồm đáp án), moTu, dongLuc, soLuot | Admin đẩy đề | **Không bao giờ** trả đáp án ra trình duyệt |
| `TR_KhaoHach` | thoiGian, maHocTap, deId, traLoi (dạng câu gốc), diemServer, giay, viPham | Học sinh nộp | Chấm bằng `77-grading.gs` có sẵn |
| `TR_SoCai` | thoiGian, maHocTap, loai, nguon, congHuan, nguoiDuyet | Apps Script/giáo viên | **Chỉ thêm, không sửa** (sổ cái); cảnh giới tính từ đây |
| `TR_SanPham` | id, maHocTap, duAn, driveFileId, trangThai, diem, nhanXet, nguoiDuyet | Học sinh nộp / GV chấm | File trong thư mục Drive theo trường |

Xoay vòng file theo `logTab_` / `FILE_CELL_BUDGET` có sẵn. Chia endpoint theo trường như `sheetEndpoints`.

Route Apps Script mới (đều tự giới hạn tần suất theo mã học tập):

| Route | Quyền | Việc |
|---|---|---|
| `trProfile` | công khai + mã học tập | Trả cảnh giới/công huân xác thực (có bản đệm CacheService 10 phút) |
| `trExamOpen` | công khai + mã học tập | Trả đề Khảo hạch **đã bỏ đáp án** + mã phiên |
| `trExamSubmit` | công khai + mã phiên | Chấm, ghi `TR_KhaoHach` + `TR_SoCai` |
| `trWorkSubmit` | công khai + mã học tập | Nhận file (≤ 5 MB) lên Drive |
| `trCodes` / `trReview` / `trClass` | `teacher`+ (ID token) | Cấp mã, duyệt sản phẩm, xem tiến độ lớp |

### 8.4 Firestore — miền quản trị (thêm tối thiểu)

```
tr_quests/{questId}          // nhiệm vụ giáo viên giao cho lớp
  schoolId: string, classIds: string[], createdBy: uid,
  title, kind: 'cong-phap'|'bi-canh'|'san-pham', ref: string,   // id trong data/techrealm
  openAt, dueAt: Timestamp, createdAt, updatedAt: Timestamp
```
Rules: đọc/ghi chỉ nhân sự cùng trường (tái dùng `isOwnSchoolField`), có `limit` bắt buộc như các collection khác.
**Học sinh không đọc collection này**: giáo viên phát nhiệm vụ bằng link (như đề `?de=`) → 0 lượt cho học sinh.
Chi phí ước tính: 50 GV × ~5 đọc/ngày + vài chục ghi/ngày — dưới 1% ngân sách.

Không thêm `users` cho học sinh, không thêm `attempts`/`exp` trên Firestore.

## 9. Kế hoạch chuyển đổi

Mỗi giai đoạn: có test, E2E, ước lượng hạn mức, CHANGELOG, và **chờ bạn đồng ý** trước khi sang giai đoạn sau.

| GĐ | Nội dung | File chính (dự kiến) | Firebase | Apps Script | Phụ thuộc |
|---|---|---|---|---|---|
| **0** | Chốt Q1–Q8. Bật mã lớp, gỡ roster công khai, dọn lịch sử git | `backend-config.js`, `data/roster/` | 0 | đã có | Quyết định của bạn; phát mã cho lớp |
| **1** | Domain thuần: `realm-core`, `linh-can-core`, `skill-tree`, `data/techrealm/*.json` ánh xạ lên IC3 có sẵn + unit test | `js/techrealm/`, `data/techrealm/` | 0 | 0 | GĐ0 (Q-quyết định) |
| **2** | Giao diện TECHREALM trong `/app/`: Thế giới, Tàng Kinh Các (mở quiz cũ qua deeplink), Hồ sơ tu luyện (tu vi cục bộ), cây kỹ năng, bí cảnh gói lại game có sẵn. Loading/empty/error, 375px, offline | `web/src/features/techrealm/` | 0 | 0 | GĐ1, Q3 (phong cách) |
| **3** | SERVER-GRADING bước 2–3 + Khảo hạch: đề riêng, phiên thi, sổ cái | `apps/src/79-techrealm.gs`, route `trExam*` | 0 | ~1–2 lượt/khảo hạch | GĐ0 |
| **4** | Mã học tập + cảnh giới xác thực + bảng xếp hạng lớp (từ sổ cái) | `trProfile`, `trCodes` | 0 | 1 lượt/HS/lần mở (đệm) | GĐ3 |
| **5** | Bách Công Phường: dự án, nộp file Drive, giáo viên chấm theo rubric, portfolio | `trWorkSubmit`, `trReview` | 0 | 1 lượt/lần nộp | GĐ4 |
| **6** | Tông môn (giáo viên): giao nhiệm vụ, tiến độ lớp, báo cáo | `tr_quests`, repository mới, rules + test emulator | ~ vài trăm/ngày | 1 lượt/lần xem lớp | GĐ4 |
| **7** | Thử thách logic/lập trình (Web Worker), khối F theo từng gói nội dung | `bi-canh/`, `labs/` | 0 | 0 | Có người soạn nội dung (Q8) |
| **8** | Nghiệm thu: E2E toàn bộ, đo hạn mức thật, hướng dẫn giáo viên, PR → `main` | `tests/e2e/suites/techrealm.mjs` | — | — | Tất cả |

Thứ tự deploy giữ như cũ: Apps Script → rules/index → web.

**Bước tiếp theo đề xuất:** bạn trả lời Q1–Q8 (§6.1). Sau đó mình làm **Giai đoạn 1**: chỉ thêm Domain thuần và file
ánh xạ, kèm unit test; không đụng trang cũ, 0 Firebase, 0 Apps Script, rút lại được bằng 1 lần revert.

## 10. Danh sách rủi ro

| # | Rủi ro | Khả năng | Ảnh hưởng | Giảm thiểu |
|---|---|---|---|---|
| R1 | Vượt hạn mức Spark do tính năng mới ghi Firestore từ học sinh | Trung bình | Cao — cả hệ thống ngừng ghi tới hết ngày | Học sinh 0 Firestore; `netlog-check` trong E2E; ước lượng mỗi PR |
| R2 | Quá tải Apps Script (30 lượt song song) khi cả lớp cùng Khảo hạch | Cao vào giờ học | Cao | Mã phiên + rải thời gian nộp; hàng đợi gửi lại có sẵn; chia endpoint theo trường; máy chủ trường gom lô |
| R3 | Gian lận EXP/cảnh giới | Cao | Trung bình | Mô hình 2 tầng (§7.3); chỉ tầng xác thực lên bảng xếp hạng |
| R4 | Lộ dữ liệu cá nhân học sinh (roster công khai, mã học tập) | Đã xảy ra | Cao | GĐ0 bắt buộc; mã là khoá giả danh; không đưa tên lên file tĩnh |
| R5 | Làm hộ Khảo hạch / chia sẻ mã học tập | Trung bình | Trung bình | Khảo hạch chính thức làm trong giờ học, giáo viên mở phiên; khoá mã khi nghi ngờ |
| R6 | Hồi quy chức năng EduQuiz cũ | Thấp nếu giữ nguyên tắc | Cao | Không sửa trang cũ; `check-legacy-paths`; E2E 148 kiểm hiện có phải luôn xanh |
| R7 | Mất tiến độ cục bộ (xoá trình duyệt, máy dùng chung) | Cao ở phòng máy | Trung bình | Công huân xác thực nằm ở Sheet; tu vi cục bộ là "phần thưởng phụ" |
| R8 | Giao diện "kiểu AI" / nặng | Cao với yêu cầu ánh sáng-năng lượng | Trung bình (bạn đã từ chối nhiều lần) | Chốt Q3 bằng bản phác 1 màn trước khi làm cả hệ thống; đo dung lượng bằng `tests/e2e/bandwidth.mjs` |
| R9 | Thiếu nội dung khối F/STEM | Rất cao | Cao — module rỗng làm giảm tin cậy | Chỉ mở khu khi đã có ≥ 1 gói nội dung đầy đủ; khu chưa có hiển thị "sắp mở" thay vì trang rỗng |
| R10 | Phạm vi quá lớn (7 hệ thống × hàng chục module) | Rất cao | Cao | Giai đoạn nhỏ, mỗi giai đoạn tự đứng được và rút lại được |
| R11 | Văn phong tu tiên khó hiểu với học sinh tiểu học / phụ huynh, giáo viên ngại | Trung bình | Trung bình | Kèm tên thường bên cạnh tên tu tiên ("Tàng Kinh Các — Bài học"); giáo viên có chế độ chữ thường |
| R12 | Firebase Storage / dịch vụ trả phí bị bật ngoài ý muốn | Thấp | Cao (chi phí) | Không dùng Storage; nếu lên Blaze phải đặt Budget alert trước (ROADMAP Ngưỡng A) |
| R13 | Lệch luật giữa bản JS và bản Apps Script (chấm, cảnh giới) | Trung bình | Cao | Domain thuần dùng chung + test so khớp như `77-grading.gs` hiện có |
| R14 | Dọn lịch sử git (force-push) làm hỏng bản sao của người khác | Trung bình | Trung bình | Báo trước, tag mốc, hướng dẫn clone lại |

---

### Phụ lục — Cách kiểm chứng số liệu trong báo cáo

- Số file: `git ls-files | wc -l`; số dòng JS: `git ls-files js | grep -v vendor | xargs wc -l`.
- Thống kê loại câu: duyệt mọi object có `question` + `type` trong `data/ic3/*__*.json` (8.040 mục, gồm câu được dùng
  lại ở bộ ôn tập; `meta.json` ghi ~6.071 câu khác nhau).
- Route Apps Script: `apps/src/10-router.gs`. Collection Firestore: `grep "match /" firestore.rules`.
- Khoá localStorage: `grep` `localStorage.getItem/setItem` và các hằng `*_KEY` trong `js/`.
