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

---

## 8. IC3 Gamified Learning Platform — Game Hub (bổ sung)

Nhánh công việc mới, song song với LMAP: nâng cấp `index.html` thành hệ
sinh thái có game hỗ trợ học IC3 (xem yêu cầu gốc — không lặp lại ở đây).
Nguyên tắc additive-only ở mục 2 phía trên áp dụng y hệt.

**Phase 1 (Audit):** đã đọc toàn bộ repo. Phát hiện quan trọng nhất:
`js/gamification.js` (XP/streak/badge) đã tồn tại nhưng chỉ dùng
`localStorage`, không đồng bộ đa thiết bị; "Khu Vui Chơi"
(`js/game-zone-gate.js`) là hub 5 mini-game có sẵn, khóa theo điểm thi
90% (đối chiếu qua tên+lớp+trường trong `localStorage`, không phải uid
thật — hệ thống không có đăng nhập học sinh).

**Phase 2 (Game Hub):** nâng cấp trực tiếp lưới "Khu Vui Chơi" có sẵn
trong `index.html` (không tạo hub thứ hai) — card giàu thông tin hơn
(icon/tên/mô tả/nhãn) cho 5 game hiện có, thêm 3 card "sắp ra mắt"
(Battle Quiz, Cyber Detective, Computer Simulator). Không đổi file JS
nào, giữ nguyên toàn bộ id nút.

**Phase 3 (Shared Game Session + XP):** file MỚI, theo đúng layer
Repository/Model đã có ở mục 5-7:
- `js/models/game-session.model.js` — collection MỚI `game_sessions`,
  1 doc = 1 lượt chơi, **immutable** (giống triết lý `quiz_results`:
  không lưu 1 con số "tổng XP" có thể bị ghi đè, mà TÍNH LẠI từ các
  document qua `summarize()`). Định danh học sinh dùng LẠI
  `EduModels.ExamHistory.keyOf()` (name+class chuẩn hoá) — không tạo
  khoá thứ hai song song với khoá quiz_results đang dùng.
- `js/repositories/game-session-repository.js` — chỉ có create + đọc,
  theo đúng khuôn `base-repository.js`.
- `js/gamification.js` — thêm `recordGameSession(gameId, session)`
  (API mới, không đổi `getState/recordResult/renderInto` đang chạy).
  Vẫn ghi `localStorage` trước tiên (không đổi hành vi cũ); nếu trang
  có nạp `game-session-repository.js` thì ghi thêm (fire-and-forget,
  không chặn UI) lên Firestore để đồng bộ đa thiết bị + phục vụ Teacher/
  Coordinator Dashboard đọc sau này (Phase 11).
- Rule đề xuất cho `game_sessions` đã thêm vào
  `firestore.rules.PROPOSED-ADDITIONS.txt` (create công khai có validate,
  đọc theo `canViewReports()`, không update/delete trừ admin) — **CHƯA
  publish**, theo đúng quy trình review thủ công đã áp dụng cho các
  collection khác ở mục 6.

**Phase 4 (Cyber Defense — reskin "Phòng Thủ Dữ Liệu"):** phát hiện
quan trọng khi đọc kỹ `js/pz-defense.js`: nội dung game (12 tác nhân
mã độc Worm/Virus/Trojan/Adware/Spyware/Ransomware/Phishing/Rootkit/
Logic Bomb/SQL Injection/Botnet/DDoS, mỗi loại có `mechanic` mô phỏng
đúng hành vi thật + `tip` giáo dục IC3) **đã đúng tinh thần "Cyber
Defense"** yêu cầu ban đầu — không phải PvZ nữa. Vấn đề DUY NHẤT là
**asset ảnh của 19 "lá chắn" (defender)** vẫn là sprite gốc của Plants
vs Zombies (`img/pz-defense/plants/*.png`, vd. wallnut.png,
peashooter.png...) — rủi ro bản quyền thật. Đã xử lý:
- Vẽ mới 19 icon SVG gốc (`img/pz-defense/defenders/*.svg`) — badge
  tròn dùng đúng màu `ring` đã khai báo sẵn cho từng lá chắn + glyph/
  monogram đơn giản, không sao chép logo/nhân vật của bên thứ ba.
- Thay 19 đường dẫn `img` trong `DEF_TYPES` (`js/pz-defense.js`) sang
  thư mục mới; không đổi bất kỳ field cơ chế nào (cost/hp/dmg/type...).
  `preloadImages()`/`drawImage()`/shop UI không cần sửa vì vẫn nhận
  đường dẫn ảnh y hệt cách cũ.
- Ảnh 12 tác nhân mã độc (`img/pz-defense/zom_*.png`) là art rời, đã
  tự vẽ theo phong cách riêng (không phải sprite PvZ) — giữ nguyên,
  không cần đổi.
- Nối `endGame()` gọi `EduGamification.recordGameSession('pz-defense',
  ...)` — **lượt gọi thật đầu tiên** của hạ tầng Phase 3. Danh tính học
  sinh được `js/game-zone-gate.js` "gửi" qua `localStorage` key
  `eduquiz_current_student` ngay trước khi mở game (cùng origin nên
  iframe đọc được) — nếu chưa chọn học sinh ở lobby thì bỏ qua, không
  ghi ẩn danh.
- `pz-defense.html` được nạp thêm Firebase SDK + các script Phase 3
  (không bắt buộc — có guard, thiếu mạng/script vẫn chơi bình thường).

**Chưa động tới:** tên gọi/mô tả 12 tác nhân + 19 lá chắn (đã đạt yêu
cầu), core game loop, WAVES, cơ chế Sun/Xe cắt cỏ/cooldown.

**Còn lại cho Phase 5+ (Enemy/Defender metadata → Question Mapping):**
`ZOMBIE_TYPES`/`DEF_TYPES` hiện chưa có field `relatedTopic`/`weakness`
chuẩn hoá để nối sang câu hỏi thật trong Firestore `questions` (mục 8
yêu cầu gốc) — cần 1 bảng mapping riêng, chưa làm ở phase này.

**Phase 5 (Question-Topic Mapping):** phát hiện quan trọng — Phase 1
kết luận nhầm là "không có field topic chuẩn hoá". Thật ra field đó
CÓ tồn tại: khi câu hỏi được `js/image-manager.js` migrate lên
Firestore, mỗi document được gắn phẳng `minitestName` — đúng NGUYÊN
VĂN 1 trong 7 tên minitest có sẵn trong `quiz_data.json` (giống hệt
nhau ở mọi category/level: "1. Căn bản về công nghệ" … "7. An toàn và
bảo mật"). Đây chính là taxonomy 7 chủ đề IC3 GS6 thật, không cần bịa
ra taxonomy mới.

Đã thêm, file MỚI `js/game-engine/question-topic-map.js`:
- 7 `CANONICAL_TOPICS` (nguyên văn `minitestName`).
- `ENEMY_TOPIC_MAP` — 12 tác nhân → đều thuộc "7. An toàn và bảo mật"
  (đúng bản chất nội dung) + `weakness` (1 câu phòng thủ thực tế/tác
  nhân, dùng cho Cyber Detective sau này).
- `DEFENDER_TOPIC_MAP` — 19 lá chắn → gắn theo ĐÚNG vai trò thật
  ngoài đời của app/thiết bị đó (vd. Word/Excel/PowerPoint/Copilot →
  "Sáng tạo nội dung"; Outlook/Gmail/Zoom → "Giao tiếp"; Teams →
  "Hợp tác, cộng tác"; 6 thiết bị phần cứng + Windows → "Căn bản về
  công nghệ"; Scanner/Kill Switch → "An toàn và bảo mật") — không
  gắn tất cả vào 1 chủ đề chỉ vì đây là game bảo mật.
- `filterQuestionsByTopic(questions, topic)` — hàm THUẦN, lọc theo
  `q.minitestName`, không tự fetch Firestore (nơi gọi tự quyết định
  nguồn `questions`) — đúng nguyên tắc không tạo Question Engine mới.

Cũng thêm field `relatedTopic` (12 zombie) + `relatedTopic` (19
defender) trực tiếp vào `js/pz-defense.js` (thuần dữ liệu, đã xác
minh bằng script đối chiếu số lượng — không đụng field cơ chế nào
khác, không đổi game loop).

**Chưa có game nào gọi `question-topic-map.js`** — hạ tầng cho Battle
Quiz (Phase 6) và Cyber Detective (Phase 7).

**Phase 6 (Battle Quiz):** file MỚI hoàn toàn — `battle-quiz.html`,
`css/battle-quiz.css`, `js/battle-quiz.js`, `js/battle-quiz-modal.js`.
Player vs AI theo đúng mục 12 yêu cầu gốc: trả lời đúng = tấn công
(combo 3 → Combo Attack, combo 5 → Critical, combo 10 → Ultimate), trả
lời sai/hết giờ = AI phản công. Chỉ dùng câu hỏi `type: "single"` —
phù hợp nhịp độ nhanh của battle, không cần dựng renderer mới cho
matching/hotspot/truefalse (đã có sẵn trong quiz-engine.js cho trang
thi thật). Nguồn câu hỏi: đọc trực tiếp Firestore `questions` (giống
`image-manager.html`), lọc theo 1 trong 7 chủ đề qua
`question-topic-map.js` (**lượt gọi thật đầu tiên** của module này);
nếu Firestore lỗi/offline, tự rơi về đọc `quiz_data.json` tĩnh — đúng
cơ chế fallback `index.html`/`quiz-engine.js` đã dùng.

Nối vào Game Hub: thay card "🔜 Sắp ra mắt" của Battle Quiz trong
`index.html` thành nút thật (`#openBattleQuizBtn`), thêm markup modal
+ nạp `js/battle-quiz-modal.js`; thêm id này vào `GAME_BTN_IDS` trong
`js/game-zone-gate.js` để `publishCurrentStudent()` (Phase 4) cũng áp
dụng cho game này. Kết thúc ván gọi `EduGamification.recordGameSession
('battle-quiz', ...)` — cùng pattern PZ Defense.

Đã test bằng DOM giả lập (jsdom) **toàn bộ 1 ván đấu thật** ở cả 2
kết cục (thắng/thua), gồm cả đường fallback đọc `quiz_data.json` khi
không có Firestore — phát hiện và sửa 1 lỗi thật trong lúc test: nhãn
"Combo cao nhất" ở màn kết quả từng hiển thị combo hiện tại lúc kết
thúc (thường về 0 khi thua ở câu cuối) thay vì combo cao nhất từng đạt
— đã thêm biến `state.maxCombo` riêng để theo dõi đúng.

**Phase 7 (Cyber Detective):** file MỚI hoàn toàn —
`cyber-detective.html`, `css/cyber-detective.css`,
`js/cyber-detective.js`, `js/cyber-detective-modal.js`. Theo đúng mục
10 yêu cầu gốc: học sinh nhận 1 tình huống mất an toàn thông tin, điều
tra qua 6 hướng (Email/Website/Mật khẩu/Thiết bị/Mạng/Tệp tin — mỗi
hướng có 1 dòng thông tin, một số hướng chứa "manh mối chính"), rồi
kết luận NGUYÊN NHÂN. 6 tình huống (`CASES` trong `cyber-detective.js`)
là nội dung MỚI do trang này tự quản lý (đúng cách `pz-defense.js` tự
quản lý `ZOMBIE_TYPES`) — nhưng **6 nguyên nhân dùng ĐÚNG 6 id tác
nhân đã có** trong `ZOMBIE_TYPES` (phishing/ransom/trojan/worm/
spyware/ddos), tái dùng ảnh `img/pz-defense/zom_*.png` có sẵn (không
tạo asset mới), và câu "gợi ý phòng thủ" hiện sau khi kết luận lấy
**trực tiếp** từ `EduGameEngine.QuestionTopicMap.getWeaknessForEnemy()`
(Phase 5) — **lượt gọi thật đầu tiên** của hàm này.

Chấm điểm: đúng = 60 điểm nền + thưởng hiệu quả (điều tra càng ít
hướng mà vẫn đúng thì điểm càng cao, tối đa 100 khi chỉ mở đúng 2
hướng — vừa đủ thấy 2 manh mối chính mỗi case); sai = 0 điểm nhưng
vẫn ghi nhận lượt chơi đầy đủ (để giáo viên thấy học sinh có luyện
tập, không chỉ thấy điểm cao). Nối Game Hub + `recordGameSession` +
`GAME_BTN_IDS` theo đúng pattern Battle Quiz.

Đã test bằng jsdom: đối chiếu dữ liệu 6 case (id nguyên nhân khớp
thật với `ZOMBIE_TYPES`, ảnh tồn tại, đủ 6/6 category mỗi case, không
ô manh mối nào trống) + mô phỏng chơi trọn luồng ở cả 2 kết cục đúng/
sai (chọn vụ án → mở manh mối, chống đếm trùng khi bấm lại → chọn
nguyên nhân → nộp → khoá tương tác sau khi nộp → gọi `recordGameSession`
đúng payload). Không phát hiện lỗi nào lần này.

**Phase 8 (Computer Simulator):** file MỚI hoàn toàn —
`computer-simulator.html`, `css/computer-simulator.css`,
`js/computer-simulator.js`, `js/computer-simulator-modal.js`. Theo
đúng mục 11 yêu cầu gốc, PHẠM VI có chủ đích: chỉ 6 thao tác quản lý
TỆP TIN (Tạo thư mục/Đổi tên/Di chuyển/Sao chép/Xoá/Tìm kiếm) — đúng
ví dụ mẫu chính xác trong yêu cầu gốc (nhiệm vụ 2: IC3 → Level 1 →
Documents/Images). 4 thao tác còn lại (Download/Upload/Trình duyệt/
Email/Quản lý mật khẩu) cần mô phỏng ứng dụng khác hẳn — để lại cho 1
phase mở rộng sau, không ép vào chung 1 file.

Kiến trúc chia 2 lớp: `FS` (thao tác cây thư mục THUẦN, không đụng
DOM — test độc lập bằng Node thường) và `UI` (state + render + event,
chỉ gọi vào FS). 5 nhiệm vụ (`MISSIONS`), mỗi nhiệm vụ tự dựng cây ban
đầu + tự viết hàm `check()` riêng (không dùng 1 thuật toán so sánh
cây cứng nhắc chung, vì tiêu chí đúng/sai mỗi nhiệm vụ khác nhau — có
nhiệm vụ cần "còn tồn tại", có nhiệm vụ cần "không còn tồn tại nữa").
Di chuyển/Sao chép qua 1 overlay chọn thư mục đích (không dùng drag-
drop, để tương thích rộng + dễ test), có chặn di chuyển 1 thư mục vào
chính nó/con cháu nó.

Đã test 2 tầng: (1) toàn bộ `FS` + `MISSIONS` bằng Node thuần, kể cả
8 tình huống SAI điển hình cho từng nhiệm vụ (tạo nhầm file thay vì
thư mục, thiếu 1 thư mục con, quên di chuyển sau khi đổi tên, xoá
nhầm file khác, di chuyển thay vì sao chép, sót/xoá nhầm file khi dọn
rác...) — mọi trường hợp đều FAIL đúng như kỳ vọng; (2) toàn bộ 5
nhiệm vụ qua **thao tác chuột thật** bằng jsdom (click/dblclick/gõ
phím/Enter), bao gồm double-click để đi vào thư mục lồng nhau, dùng
picker chọn đích cho Di chuyển/Sao chép, tìm kiếm rồi xoá từng kết
quả. Phát hiện và sửa 1 lỗi thật trong lúc test: `FS.searchAll()` có
điều kiện loại trừ root ảo bị viết sai, vô tình loại luôn cả các file/
thư mục Ở CẤP 1 (con trực tiếp của root) ra khỏi kết quả tìm kiếm —
đã viết lại thuật toán cho đúng (chỉ duyệt từ `root.children` trở
xuống, không đặc cách theo độ dài path nữa).

**Phase 9 (Cyber Tower Defense):** quyết định kiến trúc quan trọng —
KHÔNG xây 1 game tower-defense thứ hai. Lý do: `pz-defense.js` (Phase
4) đã LÀ Cyber Tower Defense thật sự — 19 "lá chắn" đã có đủ
`cost/hp/cooldownFrames/type/mechanic`, đúng những gì mục 9 yêu cầu
gốc liệt kê. Xây thêm 1 hệ thống tower-defense song song sẽ vi phạm
trực tiếp nguyên tắc "không tạo game logic thứ hai" (mục 34). Thay
vào đó, Phase 9 CHỈ bổ sung đúng phần còn thiếu so với yêu cầu gốc:
**level/upgrade/specialAbility** cho từng lá chắn đã đặt trên bàn.

Thêm vào `js/pz-defense.js` (không file mới): mỗi lá chắn khi đặt có
thêm `level: 1`, tối đa `MAX_UPGRADE_LEVEL = 3`. Bấm vào 1 lá chắn ĐÃ
ĐẶT (còn sống, không đang bị Phishing "câu", không đang chọn shop) →
mở 1 panel DOM mới (`#pzUpgradePanel` trong `pz-defense.html`, không
vẽ trên canvas — vừa dễ test vừa tránh phải làm hit-test toạ độ cho
nút bấm) hiện Lv hiện tại + thanh HP + nút nâng cấp (giá tăng dần theo
level). Nâng cấp KHÔNG đổi cơ chế chiến đấu riêng của từng loại (giữ
nguyên cân bằng đã test kỹ ở Phase 4) — chỉ tăng HP tối đa 25%/level
(giữ nguyên % máu hiện tại, không tự hồi đầy để tránh "ăn gian"). Ở
Lv tối đa, panel hiện nổi bật mô tả kiến thức IC3 đầy đủ của lá chắn
đó (tái dùng field `desc` có sẵn từ Phase 4) như 1 "specialAbility
được mở khoá" — đúng yêu cầu mục 9 mà không bịa cơ chế chiến đấu mới.

Đã test bằng jsdom (tái dùng polyfill canvas từ Phase 2): luồng đầy
đủ chọn đội hình → vào trận → đặt lá chắn → mở panel → nâng cấp Lv1→
Lv2 (xác nhận Dữ liệu bị trừ đúng số) → nâng tiếp lên Lv3/3 (xác nhận
nút tự khoá + hiện đúng "Kiến thức đã mở khoá") → bấm vào nút đã khoá
không gây lỗi/không tăng thêm level → bấm "Chơi lại" khi panel đang
mở phải tự đóng đúng. Đã xác nhận thứ tự xử lý click không phá vỡ cơ
chế "xác minh Phishing" có từ Phase 4 (vẫn được ưu tiên xử lý trước).
