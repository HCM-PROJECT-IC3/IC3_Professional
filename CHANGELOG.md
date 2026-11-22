# Nhật ký thay đổi — EduQuiz IC3

Ghi những thay đổi người dùng thấy được và việc cần làm khi triển khai.
Chi tiết kỹ thuật từng đợt: xem lịch sử git của file này và commit tương ứng.

## Khi triển khai bản mới

Thứ tự: Apps Script → `firestore.rules`/index → đẩy web.

1. `node scripts/check-deployed-backend.js` — Apps Script đang chạy phải khớp `BACKEND_VERSION`.
   Lệch thì dán `apps/Code.gs`, chạy `kiemTraSauDeploy`, Deploy → New version.
2. Publish rules (cần nếu chưa làm từ đợt 26/10 và 29/10: `teacher_sync`,
   giáo viên tự nhập lịch, `arena_relay`): `firebase deploy --only firestore:rules --project data-ic3`.
   Index: **đọc cảnh báo ở `docs/FIREBASE-CHECKLIST.md` §1 trước**. Deploy `firestore:indexes` từ file trong repo
   sẽ bật cả TTL (tự xoá vĩnh viễn dữ liệu quá hạn).
3. Firebase Console → Authentication → Anonymous: **Enabled** (đường dự phòng Phòng cả lớp).
   App Check: không Enforce.
4. Kiểm tra nhanh trên bản thật:
   - Điểm danh → Cài đặt → "Đồng bộ ngay" báo đã lưu; đăng nhập máy khác thấy đủ link.
   - Tài khoản Điều phối mở Báo cáo kết quả: chỉ thấy trường của mình.
   - Giáo viên nhập lịch từ Excel tổ sau khi đồng nghiệp vừa nhập: không báo lỗi quyền.
   - F12 → Console, lọc "lượt đọc Firestore": danh sách học sinh chỉ vài lượt mỗi lần mở.
     Lệch dữ liệu thì đặt `rosterDeltaSync: false` trong `js/backend-config.js`.


## 22/11/2026 (37) — Rà soát toàn dự án: chống xoá nhầm bài nộp, bớt lượt đọc Portfolio, huy hiệu không mất

Apps Script lên `2026-11-22a` (dán `apps/Code.gs`, Deploy → New version). Firestore **không đổi** (rules, index).
Lượt Firebase: **giảm** (Portfolio); Apps Script: không thêm lượt gọi.

- **Xoá bài nộp (Báo cáo kết quả) chắc chắn không xoá nhầm dòng:** trước đây chỉ dùng khoá theo người dùng (`getUserLock`)
  và xoá theo số dòng đã tìm, không kiểm tra lại. Nay dùng khoá chung (không chặn bài nộp) và đọc lại mã bài ở đúng
  dòng ngay trước khi xoá — dòng đã đổi thì bỏ qua (`apps/src/40-results.gs`).
- **Xuất báo cáo tổng hợp (tab TongHop):** 2 lượt xuất cùng lúc không còn ghi đè lên nhau (`50-reports.gs`).
- **Email cảnh báo gian lận:** dừng khi hạn mức email trong ngày sắp hết (trước chỉ giới hạn theo giờ).
- **Portfolio:** đóng khung bình luận thì ngắt nghe realtime (trước nghe mãi — mỗi bình luận mới tốn 1 lượt đọc);
  mở lại khung không còn gửi trùng bình luận.
- **Sảnh — huy hiệu:** "Đạt từ 80%", "Điểm tuyệt đối", "Học 3 ngày liền" tính trên toàn bộ lịch sử trên máy
  (trước chỉ 4 bài gần nhất / chuỗi hiện tại nên huy hiệu đã đạt bị mất).
- **Sổ đầu bài — Xuất Excel bảng tuần:** dùng ExcelJS có sẵn trong web (mạng trường chặn CDN vẫn xuất được);
  tuần có tiết Thứ 7 ghi đúng "đến ngày" Thứ 7.
- **Đấu trường — thẻ luật có tranh sân đấu (đợt 21/11) vỡ trên điện thoại:** trang rộng ~2.700px ở màn 375px.
  Class `.ar-stage` của tranh trùng tên khung sân chơi trong trận (nền tối, `overflow:hidden`, `aspect-ratio` áp nhầm
  vào trận) và quy tắc 1 cột cho màn hẹp thua độ ưu tiên của `:has()`. Đổi tên thành `.ar-rstage`, sửa media query.
- **Đấu trường — màn trong trận vừa 1 màn hình, phẳng hơn:** màn 1366–1536×650–700 trước bị mất đáp án 3–4 dưới mép.
  Sân thấp theo chiều cao màn hình; ô đáp án là thẻ phẳng có nhãn **A B C D** (bỏ ô 4 màu đậm + ▲◆●■ + bóng cứng);
  hai bên sân là màu phẳng của từng sân (bỏ bản tranh làm nhoè — nhẹ máy hơn); bảng xếp hạng dùng chữ cái đầu thay
  emoji 3D; tên trên sân không còn emoji; thanh thời gian 1 màu. 0 Firebase.
- **Sao lưu tất cả dữ liệu trên máy:** thêm Bản nháp Soạn đề.
- `nghi-phep.html` thêm thẻ viewport (CI `check-html` đang báo lỗi).

## 18/11/2026 (36) — Giao diện phẳng hơn, nhẹ hơn cho máy phòng tin; Portfolio tốn ít lượt đọc hơn

- **Bỏ mờ kính (backdrop-filter) ở mọi trang** (18 chỗ: sảnh, thanh trên Đấu trường / Sổ đầu bài / app 2.0, lớp phủ
  hộp thoại ở trang quản trị, Thử thách hôm nay, kệ sách). Mờ kính bắt trình duyệt vẽ lại phần nền phía sau mỗi khi
  cuộn — nguyên nhân chính gây giật trên máy yếu. Nay là nền đặc, nhìn gần như cũ.
- **Tắt animation trang trí chạy mãi** trên nền đã phẳng (`gradientShift`, ánh sáng quét thanh tiến độ, nút câu đang
  làm nhấp nháy, emoji kết quả lơ lửng, chấm "ping"). Không thấy khác biệt nhưng trước đây vẫn vẽ lại từng khung hình.
  Giữ: đồng hồ nhấp nháy lúc sắp hết giờ, vòng quay đang tải, hiệu ứng trong cảnh trò chơi.
- **Gradient → 1 màu:** nút tím/xanh ở màn làm bài và dashboard, nút Bắt đầu (bỏ bóng cam toả), avatar Lịch dạy,
  thanh máu/giờ Battle Quiz, **chữ tiêu đề cầu vồng** ở 5 mini-game, nền sảnh.
- **Nền sảnh vẽ lại phẳng** (`img/lobby-network.svg`): vẫn bản đồ + mạng lưới, nhưng lục địa không làm mờ, nút mạng là
  chấm tròn có viền thay cho đốm "phát sáng". Nền mini-game bỏ blur toàn màn hình.
- **Chuyển trang nhanh hơn ~0,6 s** (`css/motion.css`, `js/motion.js`): trước đây cả trang trượt ra 0,32 s rồi trượt
  vào 0,45 s từ bên phải (lúc trượt, trang rộng hơn màn hình → tablet nháy thanh cuộn ngang). Nay chỉ mờ nhẹ 0,12 s / 0,18 s.
- **App 2.0 mở nhanh hơn:** Lộ trình, Sổ tay, Trò chơi, Thành tích, Bộ sưu tập UI tải khi mở (gói đầu 413 → 383 KB).
- **Portfolio — ít lượt đọc Firestore hơn** (`js/portfolio.js` § `liveQuery`): feed bài đăng + chứng chỉ vẫn cập nhật
  trực tiếp, nhưng **tab ẩn quá 60 giây thì tạm ngắt**, hiện lại thì nghe lại. Trước đây tab để mở cả ngày vẫn tốn
  1 lượt đọc cho mỗi lượt thích/bình luận/bài mới của người khác. Nghe lại trong 30 phút chỉ tính tài liệu đã đổi
  (bộ đệm offline đã bật). Mở trang, xem bình thường: **không đổi** số lượt. 0 Apps Script.
- **Kiểm thử:**
  - Mới `tests/e2e/ui-audit.mjs` (`npm run ui-audit`, thêm vào CI job e2e): mở 29 trang bằng Chrome thật, báo
    gradient chuyển màu, mờ kính, animation chạy mãi, glow, emoji màu trên nút/tiêu đề, tác vụ dài. Hiện **29/29 sạch**.
  - E2E `pages` +5: Portfolio ẩn tab ngắn không ngắt, ẩn lâu ngắt hết, hiện lại nghe lại đúng số truy vấn (thử bỏ
    đoạn ngắt thì bị bắt).
  - Sửa `fa-subset.test.js` khi bản build cũ đã xoá khỏi ổ đĩa nhưng git chưa ghi nhận.

## 18/11/2026 (35) — Đấu trường: bạn máy chơi "như người", Hành trình IC3 nhập vai, hết giật

- **Bạn máy có tính cách** (`arena-core.js` § `botPlan`, `PERSONAS`): Cẩn thận / Hấp tấp / Đều tay / Bùng nổ.
  - Đọc đề mất thời gian: câu dài, nhiều phương án → nghĩ lâu hơn và dễ sai hơn.
  - Thời gian nghĩ không đều nhịp (đa số vừa, thỉnh thoảng rất lâu, có khi quá giờ). Bấm quá vội dễ sai.
  - Đang chuỗi đúng thì tự tin, sai liên tiếp thì cuống. Trận cách biệt xa thì bạn máy hăng hoặc đuối nhẹ (±6 %) để trận vẫn gay cấn.
- **Sửa lỗi "giả":** lúc em nghĩ, bạn máy "chốt" ở một thời điểm, nhưng lúc chấm lại tung xúc xắc lần nữa (chốt giây thứ 2 mà
  điểm tốc độ như trả lời giây thứ 9). Nay mỗi câu chỉ có **1 kế hoạch**, dùng cho cả lúc chốt lẫn lúc chấm. Bạn nào nghĩ quá giờ thì không chốt.
- **Bạn máy nói theo tính cách** (`arena-hype.js` § `VOICE`): mỗi tính cách 4 loại câu (vượt em, bị em vượt, quá giờ,
  đứt chuỗi). Không lặp liền một câu, không nói mỗi câu.
- **Đối thủ nhớ em** (`arena-core.js` § `settleRivals`, `featuredRival`, `rivalTalk`; lưu `players[biệt danh].rivals`):
  - Mỗi bạn máy nhớ thắng/thua với em qua các trận đối kháng (trừ Kéo co, Diệt Virus).
  - **Màn mở trận** giới thiệu đối thủ hôm nay, kèm tính cách và thành tích đối đầu (em thắng–thua). Bạn gặp em nhiều nhất nhắc chuyện cũ ("Lần trước em thắng tớ. Hôm nay tớ phục thù!", "Tớ thắng em 4/4 ván rồi đấy…"), rồi nói lại trên sân.
  - **Hết trận**, bạn sát hạng em nói một câu theo kết quả.
- **Bạn máy "đang nghĩ" trên sân** (`arena-scene.js` § `think`): bong bóng ba chấm cho tới khi chốt. Bạn nào nghĩ quá giờ thì hiện dấu hỏi.
- **Hành trình IC3 nhập vai** (`arena-quest.js`):
  - Mỗi vùng có **người dẫn đường** (hình phẳng tự vẽ). Chỉ người dẫn đường của vùng em đang đi lên tiếng, lời thoại theo tiến độ (mới tới / còn N chặng / đã xong).
  - Vùng phía trước phủ **sương "Chưa khám phá"** (vẫn bấm được).
  - **Nhân vật đi bộ** từ chặng vừa chơi sang chặng kế, thay vì dịch chuyển tức thời.
  - Lúc tải câu hỏi có màn **"Đang lên đường tới…"** (thay dòng thông báo nhỏ + bản đồ mờ). Màn này tắt ngay khi trận bắt đầu.
- **Hết giật khi về bản đồ:** trước đây bản đồ vẽ lại 2 lần liền, mỗi lần dựng lại 8 cảnh SVG lớn (id đổi theo bộ đếm).
  - Nay các lần vẽ trong cùng một nhịp được gộp làm một, id cố định, nội dung không đổi thì không đụng DOM.
  - Vùng ngoài màn hình không vẽ (`content-visibility`).
  - Có "giảm chuyển động" thì không đi bộ, không hiệu ứng.
- 0 Firebase, 0 Apps Script (như trước).
- **Kiểm thử:**
  - `arena-core` +17: độ khó → thời gian và đúng/sai, không đều nhịp, tính cách, cuống, chuỗi, giữ trận gay cấn, lặp lại được, đối thủ nhớ em (7).
  - `arena-hype` +5.
  - E2E `play` +19 (29 → 48): điểm bạn máy = kế hoạch đã chốt (thử đột biến kiểu cũ thì bị bắt), giới thiệu đối thủ + nhắc chuyện cũ, đang nghĩ trên sân, trận 3 câu trọn vẹn lưu thắng/thua + lời sau trận, người dẫn đường, sương, 0 lần dựng lại, màn lên đường, đi bộ, 375 px.

## 17/11/2026 (34) — TechRealm 2.0: QA, bảo mật, staging, sao lưu (Prompt 08)

- **Khi triển khai:** làm theo `docs/techrealm/DEPLOYMENT_GUIDE.md`: sao lưu → staging → nghiệm thu → production.
  Apps Script lên `2026-11-17a` (dán `apps/Code.gs`; bản đang chạy hiện là `2026-11-04c`). Firestore **không đổi**.
- **Bảo mật (sửa):**
  - `react-router` 7.9.1 → 7.18.5 (lỗ hổng chuyển hướng mở); Vite 7.1.7 → 7.3.8 (chỉ dùng khi phát triển). `npm audit` web: 0.
  - Thêm header `X-Content-Type-Options: nosniff` + `Referrer-Policy` (Cloudflare `_headers`, `firebase.json`).
  - `build-hosting` **luôn bỏ** `backups/`, và `--strict` dừng nếu bản phát hành có `*.gs`, `*.bundle`, `*.patch`, khoá,
    `.env`, `firestore.rules`.
- **Staging:** `node scripts/build-hosting.mjs --staging=<URL /exec thử nghiệm>` (thay URL Apps Script, chặn máy tìm kiếm)
  + `npx wrangler deploy --env staging` (Worker riêng `ic3-professional-staging`, bản thật không bị đụng).
  `check-deployed-backend.js <URL>` kiểm được deployment staging.
- **Sao lưu:** `node scripts/backup-before-deploy.mjs` → `backups/<thời điểm>/` (bundle git, việc chưa commit,
  Code.gs đang chạy, SHA-256). Đã thử khôi phục: khớp 142/142 file.
- **Kiểm thử mới:**
  - Bộ E2E `responsive`: 51 trang × tablet dọc / tablet ngang / 1920 px, kiểm tràn ngang, lỗi JS, console.error, Firebase.
  - Bộ `teacher` thêm 6 kiểm tra Báo cáo năng lực (quyền, số liệu, lỗ hổng, lọc lớp, 375 px).
  - Toàn bộ E2E chạy trên Chrome và Edge.
- Tài liệu: `docs/techrealm/QA_REPORT.md`, `SECURITY_REPORT.md`, `DEPLOYMENT_GUIDE.md`, `USER_GUIDE.md`.

## 17/11/2026 (33) — TechRealm: AI Sư Phụ + Báo cáo năng lực + Tông môn (giáo viên)

- **Khi triển khai: phải dán lại `apps/Code.gs`** (thêm việc AI Sư Phụ, `aiReport`, nhật ký `NhatKyAI`). Chưa dán thì AI Sư Phụ
  vẫn chạy bằng key cá nhân; key trường sẽ báo "việc không hợp lệ".
- **AI Sư Phụ** (`/app/#/the-gioi/su-phu`, `js/techrealm/mentor-core.js`): hỏi kiến thức, gợi ý bài tập 3 mức (không nêu đáp án),
  hướng dẫn và phân tích lỗi code, gợi ý nhiệm vụ (luật trên máy, không dùng AI), chấm theo rubric cho giáo viên (`aiAskStaff`).
  Dùng lại Trợ lý AI có sẵn (bản đệm, key cá nhân, key trường, trần lượt).
- **Chế độ kiểm tra:** máy đang có bài Kiểm tra chưa nộp → mọi việc AI của học sinh bị chặn (cả giải thích câu sai cũ).
- **Bảo vệ dữ liệu:** lọc email / SĐT / địa chỉ / mật khẩu ở cả trình duyệt và máy chủ; nhật ký `NhatKyAI` không lưu nội dung,
  người dùng ghi bằng mã băm; nút "Báo câu trả lời có vấn đề" (10/ngày/máy).
- **Báo cáo năng lực học viên + báo cáo lớp** (`/app/#/giao-vien/nang-luc`, `js/techrealm/analytics-core.js`): tỷ lệ hoàn thành,
  kết quả kiểm tra, năng lực theo lĩnh vực / chủ đề, lỗ hổng, học sinh cần chú ý, bài khó nhất lớp, CSV, in. Dùng lại dữ liệu
  và bản đệm của trang giáo viên → **không thêm lượt đọc** ngoài lần tải kết quả vốn có.
- **Tông môn** (`/app/#/the-gioi/tong-mon`): mục lục việc của giáo viên và quản trị, trạng thái thật từng việc. 0 lượt mạng.
- Tài liệu: `docs/techrealm/AI_MENTOR.md`, `docs/techrealm/HUONG_DAN_GIAO_VIEN.md`.
- **Firebase 0.** Apps Script: 1 lượt mỗi câu hỏi bằng key trường (như trước), ghi nhật ký trong cùng lượt.
- **Kiểm thử:** mentor-core, analytics-core (dữ liệu meta/courses thật), code-gs khối "AI Sư Phụ", E2E techrealm 91.

## 17/11/2026 (32) — TechRealm: Vạn Tượng Giới + Thành phố thông minh (mô hình tương tác)

- **Thành phố thông minh** (`js/techrealm/smart-city-core.js` + `city/SmartCityPage.tsx`): bản đồ 6×6, 8 công trình mẫu
  (trạm năng lượng mặt trời / than), 6 chỉ số có công thức rõ và bảng "vì sao". Mỗi công trình (trừ Khu dân cư) mở khoá
  bằng bài đã đạt, sao Bí cảnh 1 hoặc nhiệm vụ đời sống. Lưu trên máy (`tr.city.v1`).
- **Nhiệm vụ đời sống mới** (`life-missions-core.js`): Tính tiền điện (kWh, bậc thang, **giá minh hoạ** — ghi rõ không
  phải biểu giá hiện hành), Phân loại rác (17 món, nhóm theo Luật BVMT 2020 + nguy hại thu gom riêng, có giải thích).
- **Vạn Tượng Giới** chia 3 khu (khoa học · công nghệ · đời sống), mục nào cũng trỏ nội dung thật hoặc ghi "Sắp mở".
- Gói lười riêng (thành phố 5,2 KB + luật 6,3 KB + nhiệm vụ 3 KB gzip). **Firebase 0, Apps Script 0.** Sân tập, không sinh EXP.
- **Kiểm thử:** smart-city 33, E2E techrealm 79 (2 nhiệm vụ qua giao diện → mở công trình → xây → chỉ số đổi đúng công thức).

## 17/11/2026 (31) — TechRealm: Bí cảnh (Challenge System) + Bí cảnh 1 "Thành phố mất điện"

- **Khung bí cảnh** `js/techrealm/challenge-core.js`: màn chơi là máy trạng thái thuần, tất định theo hạt giống;
  chấm 6 tiêu chí (hoàn thành, chính xác 40, giải quyết vấn đề 25, vận dụng 20, thời gian 10, số lần thử 5); kiểm nhật ký.
- **Bí cảnh 1 hoàn chỉnh** (`thanh-pho-mat-dien-core.js` + `PowerCityGame.tsx`): cốt truyện, NPC Kỹ sư Lam, bản đồ
  4 địa điểm, 3 màn (mạch điện, chia điện, dữ liệu) + Boss "Cơn bão quá tải", câu vận dụng, kết quả, kỷ lục trên máy.
  Bí cảnh 2–5 mới ở mức thiết kế (`docs/techrealm/GAME_DESIGN.md`).
- **Xác nhận phần thưởng bằng chạy lại:** gửi `{seed, actions}`, máy chủ chạy lại bằng cùng mã (chép vào `apps/Code.gs`)
  và tự chấm. Nguồn EXP mới `CHALLENGE` (≥85: 30, ≥65: 20, ≥50: 10, Boss +40, 1 lần/màn). Hook `trRewardChallenge_`
  **chưa nối, công tắc `TR_REWARDS` tắt**.
- **Gói lười riêng** cho trò chơi (14 KB gzip), không nằm trong gói TechRealm/gói chung. SVG phẳng tự vẽ, không dùng
  Phaser. **Firebase 0, Apps Script 0.**
- **Kiểm thử:** challenge 31 (gồm quét 200 hạt giống × 4 màn), cultivation 65, tr-ledger 27, E2E techrealm 60 (chơi màn 1
  qua giao diện, điểm màn hình = điểm Node chạy lại). Test phát hiện và đã sửa 1 lỗi nội dung: chỗ rò điện không đủ nổi
  bật ở 9/200 đề.

## 16/11/2026 (30) — TechRealm: Learning System (Tàng Kinh Các + Luyện Công Đường)

- **Kho học liệu sinh từ dữ liệu có sẵn:** `scripts/build-techrealm-courses.mjs` → `data/techrealm/courses.json`
  (12 lĩnh vực, 13 khoá, 259 bài, 18 bài kiểm tra, bài giảng từ `slides-manifest.json`). CI thêm bước `--check`.
  6 lĩnh vực chưa có nội dung ghi "Sắp mở".
- **Luật học tập** `js/techrealm/learning-core.js` (chép vào `apps/Code.gs`): nối bài làm → bài học, cây kỹ năng
  tuần tự/tự do, cấu hình giáo viên (làm sạch), tiến độ, hoàn thành, sự kiện EXP từ bài đã chấm lại trên máy chủ.
- **Trang:** Tàng Kinh Các (12 lĩnh vực, tiến độ thật từ lịch sử trên máy), trang công pháp (cây bài, chi tiết, tài
  liệu, video, điều kiện, EXP), **Quản lý công pháp** cho giáo viên (cấu hình → link lớp `?lop=`), tab **Tiến độ &
  lịch sử** (xuất CSV). Làm bài vẫn ở sảnh: `quiz-engine.js` và cách chấm không đổi.
- **EXP:** hook `trRewardSubmission_` (chỉ bài Kiểm tra máy chủ chấm lại và khớp điểm), **chưa nối, công tắc
  `TR_REWARDS` tắt**: Apps Script đang chạy không đổi hành vi.
- **Firebase 0, Apps Script 0.** Thêm 1 file tĩnh 24 KB gzip (chỉ khi mở Tàng Kinh Các). Gói TechRealm 48,9 KB gzip;
  CSS/JS chung không đổi.
- **Kiểm thử:** learning-core 30, tr-ledger 23, E2E 12 bộ 330 kiểm tra (bộ techrealm 49). Lượt chạy toàn bộ đầu tiên có
  1 lỗi chập chờn ở `pages` (tai-lieu-nam-hoc, không liên quan); chạy lại bộ đó 2 lần đều 150/150.

## 16/11/2026 (29) — TechRealm: Cultivation Engine (luật tu luyện + sổ cái chỉ thêm)

- **Luật** `js/techrealm/cultivation-core.js` + **CultivationService** `js/techrealm/cultivation-service.js`: 7 cảnh giới
  × 3 tiểu cảnh giới, 7 nguồn EXP có bằng chứng (không thưởng "mở trang"/làm lại), mức thưởng Admin cấu hình
  (`TR_CONFIG`, có kiểm hợp lệ), 5 linh căn từ bài đánh giá đã chấm (không khoá lộ trình), 6 loại vật phẩm (cấm cộng EXP),
  đột phá 4 nhóm điều kiện, thành tựu tự xét. Tài liệu: `docs/techrealm/CULTIVATION_SYSTEM.md`.
- **Một nguồn luật cho trình duyệt + Apps Script:** `scripts/build-apps-script.js` chép nguyên văn 2 file trên vào
  `apps/Code.gs` (chặn `?.`/`??`). Adapter `apps/src/79-tr-ledger.gs`: tab `TR_SoCai` trong file Sheet riêng, ScriptLock,
  TextFinder. **Chưa đăng ký route nào**: chưa thay đổi hành vi Apps Script đang chạy. Dán `Code.gs` mới lúc này là
  an toàn nhưng chưa cần.
- **Chống trùng:** txId tất định + tính tổng chỉ đếm dòng đầu mỗi txId (chịu được ghi đua) + khoá cho trần ngày/tuần.
- **Giao diện xem thử** dùng luật thật trên dữ liệu mẫu: cảnh giới, tiểu cảnh giới, điều kiện đột phá, linh căn,
  linh thạch, lịch sử (EXP, đột phá, vật phẩm, thành tựu, huỷ, chờ duyệt, thời gian tu luyện). Hiệu ứng đột phá phẳng
  khoảng 1,3 giây, tôn trọng "giảm chuyển động" (chân trang → "Xem thử hiệu ứng đột phá").
- **Firebase: 0 lượt.** Apps Script: 0 lượt (chưa có route). Gói TechRealm +9,6 KB gzip; CSS và JS chung không đổi.
- **Kiểm thử:** core 62, service 30, Sheet giả lập 17 (CI thêm bước `apps/__tests__/tr-ledger.test.js`), E2E bộ
  techrealm 36. Đã cài lỗi thử (bỏ khử trùng / bỏ trần ngày / bỏ điều kiện công pháp): test bắt cả 3.

## 16/11/2026 (28) — TechRealm 2.0: audit, kiến trúc, giao diện xem thử (dữ liệu mẫu)

- **Tài liệu:** `TECHREALM_2.0_AUDIT.md` và `docs/techrealm/` (ARCHITECTURE, DATABASE_SCHEMA, FIREBASE_SECURITY,
  MODULE_DEPENDENCIES, MIGRATION_PLAN, UI_DESIGN_SYSTEM, COMPONENT_GUIDE). Kiến trúc, schema và rules mới **chỉ là đề
  xuất**: chưa đổi `firestore.rules`, Apps Script hay dữ liệu.
- **Giao diện xem thử** ở `/app/#/the-gioi`: 11 trang (Tổng quan, Thế giới tu luyện, Tàng Kinh Các, Luyện Công Đường,
  Bí Cảnh, Bách Công Phường, Vạn Tượng Giới, Đấu Trường, Túi Càn Khôn, Thành tựu, Hồ sơ nhân vật), thông báo, menu hồ sơ,
  công tắc 4 trạng thái dữ liệu ở chân trang. Dữ liệu mẫu nằm trong gói. Link "Luyện" mở đúng bài ở sảnh cũ.
  Chưa có mục menu nào trỏ tới khu này; vào bằng đường dẫn trực tiếp cho tới khi nghiệm thu.
- **Firebase: 0 lượt đọc/ghi, 0 lượt Apps Script, 0 request ra ngoài** (E2E `techrealm` kiểm từng trang).
- **Dung lượng:** khu TechRealm là gói nạp lười riêng: JS 28,7 KB gzip + CSS 5,8 KB gzip, chỉ tải khi mở `/the-gioi`.
  CSS chung của app 2.0 **giữ nguyên** (cùng mã băm; `globals.css` có `@source not` thư mục techrealm). JS chung +1,9 KB
  (+0,03 KB gzip).
- **Kiểm thử:** E2E 12 bộ / 310 kiểm tra đạt (thêm bộ `techrealm`: 29 kiểm tra); `tsc`, `check-*`, `validate-data`,
  `build-hosting --strict` đạt.
- Không sửa trang cũ, `js/`, `sw.js`, `firestore.rules`, Apps Script.

## 15/11/2026 (27) — Rà soát toàn dự án; Cloudflare bỏ hẳn Worker (0 lượt Worker/ngày)

- **Kiểm thử trước khi sửa** (đều đạt): 66 file unit test, kiểm tra dữ liệu/JS/HTML/kiến trúc/đường dẫn cũ, Apps Script,
  MOS, máy chủ trường, `tsc`, `build-hosting --strict`, E2E 148/148 trên cả mã nguồn lẫn `dist-hosting`.
  (`tests/firestore-rules` cần Java — chỉ chạy trên CI.)
- **Firestore** (đo bằng `scripts/measure-firestore/flow.py`, dữ liệu cỡ thật 2.800 HS/150 lớp/121 tài khoản):
  trang học sinh 0 lượt; trang nhân sự mở lại sau 2 giờ chỉ đọc phần thay đổi (Quản lý tài khoản 122, Lịch giảng 2,
  Điểm danh 1). Lần đầu trên máy mới vẫn đọc toàn bộ 1 lần (Quản lý tài khoản ~3.170) như thiết kế. Đường dự phòng
  Đấu trường: tối đa 25 em/phòng, gom ghi ≤ 1 lần/giây, không phát tin cả lớp mỗi lượt trả lời. **Không đổi gì.**
- **Cloudflare — sửa**: `scripts/cloudflare-worker.js` chạy cho MỌI lần mở `/`, `/app/`, `/mos/` và MỌI đường dẫn
  sai (bot dò `/wp-login.php`, `/favicon.ico`…). Gói Free 100.000 lượt Worker/ngày; vượt → lỗi 1027, trang chủ chết
  với mọi người tới hết ngày. Giờ `build-hosting.mjs` sinh `dist-hosting/_redirects` (`/` → `index.html`, `/app` → `/app/`…,
  luật tĩnh, không tính lượt) + `404.html`; `wrangler.jsonc` bỏ `main`, thêm `not_found_handling: "404-page"`.
  Đã thử bằng `wrangler dev` (cấu hình thật) và `wrangler pages dev`: `/` 200 không chuyển hướng, `/app` 301 → `/app/`,
  đường sai 404. File tĩnh vẫn không giới hạn request. Firebase Hosting bỏ qua `_redirects`, tự dùng `404.html`.
  Firestore/Apps Script: không đổi (0 lượt thêm).
- **E2E `pages` mở rộng** (148 → 234 kiểm tra): tự mở MỌI trang `.html` ở gốc (11 trang trước chưa từng được kiểm:
  Điểm danh, Sổ đầu bài, Lịch giảng, Thi đua, Quản lý trường/lớp, Portfolio…), thêm 2 phép kiểm cho mỗi trang:
  không file cùng nguồn nào lỗi 404, thu về 375px không tràn ngang. Bắt được và đã sửa:
  - **Quản lý trường trên điện thoại** rộng 1115px (cả trang trượt ngang): `admin-users.css` tắt cuộn của
    `.table-scroll` ≤ 760px cho bảng tài khoản dạng thẻ, bảng trường không đổi dạng → `admin-schools.css` giữ cuộn ngang.
  - **Hotspot editor** ≤ 980px: nút trên thanh tiêu đề xuống dòng (trước đẩy trang rộng 760px).
  - `404.html` mới sinh thiếu icon → trình duyệt xin thêm `/favicon.ico` (1 lần 404 nữa).
  Cả bộ đạt trên mã nguồn và trên `dist-hosting`. Firestore: không đổi.
- **Mới — Linh vật theo mùa** (Đấu trường → Linh vật; ROADMAP §4.5): hộp đặc biệt chỉ mở được trong khung ngày —
  💐 Tri ân 20/11 (10–30/11), 🎄 Giáng sinh (15/12–5/1), 🧧 Tết (15/1–28/2, phủ Tết âm mọi năm), 🏖️ Mùa hè (1/6–15/8).
  Mỗi hộp 9 linh vật đủ 5 độ hiếm, cùng giá, bảo hiểm Sử thi, thưởng đủ bộ như hộp thường. Đang mùa: hộp mùa trải
  hàng đầu với nhãn "Còn N ngày" + dải sự kiện. Hết mùa: không mở được (kể cả vé miễn phí), linh vật đã có **giữ mãi**,
  vẫn làm ảnh đại diện. Emoji chọn loại hiện được trên Windows 10 (phòng máy). Logic thuần trong `arena-core.js`
  (`SEASONS`, `seasonOn`, `packsOn`, `seasonDaysLeft`), 15 unit test (từng ngày trong năm thuộc ≤ 1 mùa, vắt năm mới,
  hết mùa từ chối không trừ xu) + 7 kiểm tra E2E với đồng hồ trình duyệt cố định (20/11 và 5/12).
  **0 Firebase, 0 Apps Script** (chỉ localStorage `eduquiz_arena_v1` như cũ).
  E2E: 242/242 trên mã nguồn, 246/246 trên `dist-hosting`.
- **Đấu trường bỏ dấu vết "giao diện AI"** (trước đây cố ý chừa lại). Chỉ đổi khung giao diện; tranh bản đồ/thẻ chế độ,
  linh vật sưu tập, hiệu ứng và câu chúc mừng trong trận giữ nguyên.
  - Emoji màu (Windows hiện kiểu 3D bóng) làm icon → Font Awesome phẳng: thanh vai, ví xu, nút Linh vật, 13 icon chế độ,
    3 ô nhiệm vụ, icon 8 hộp, giá/vé/đủ bộ, màn mở hộp, cổng giáo viên, "Luyện lại câu sai". Tiêu đề tab bỏ emoji.
  - Bỏ tên sản phẩm khác ("Kiểu Kahoot/Blooket/WayArena/Wayground/Battle Royale…") khỏi mô tả chế độ và thẻ meta;
    câu chữ bớt chấm than, nói thẳng luật chơi.
  - Thẻ "Danh hiệu": nền nâu + chữ vàng + vương miện trong vòng tròn vàng → thẻ phẳng như thẻ khác. Chip cấp độ đang
    chọn: nền vàng + bóng khối → viền tím mảnh. Hộp mùa: bỏ nền chuyển màu.
  - Dòng nhắc Sổ tay: link "Ôn ngay" màu xanh mặc định trình duyệt trên nền vàng → cùng màu chữ, gạch chân.
  - Cổng giáo viên ghi "3 chế độ cả lớp" (cũ) → đúng 6 chế độ phòng cả lớp + Bảng điểm.
  - Bộ icon rút gọn dựng lại (`scripts/build-fa-subset.py`): thêm egg, fish, futbol, vault, paw, snowflake…; bỏ 42 icon
    không còn dùng. Icon hộp lưu tên đầy đủ (`fa-paw`) — ghép `'fa-' + tên` thì script không dò thấy (đã gặp: paw,
    snowflake thiếu). Unit test mới kiểm icon mọi hộp có trong bộ rút gọn.
  0 Firebase. Unit test + kiểm tra tĩnh + E2E 242/242 đạt.
- **Mới — Thẻ "Luật chơi" + màn mở trận 3‑2‑1** (Đấu trường; học cách trình bày "chọn trò + luật 3 bước" của các nền
  tảng quiz, KHÔNG chép tên/nhân vật/hình). `js/arena/arena-rules.js` (dữ liệu thuần):
  - Chọn chế độ → thẻ hiện 2–3 nhãn tính chất (Phản xạ, Chiến thuật, May rủi, Đối đầu, Đồng đội, Bền bỉ, Thư giãn),
    **3 bước chơi** có icon và **"Cao trào"** — khoảnh khắc lật kèo riêng của chế độ (vd Sinh tồn: còn 2 người là đấu
    tay đôi; Kéo co: dây sát vạch vẫn kéo ngược được). Thay dòng mô tả 1 câu. Có cho cả vai Giáo viên.
  - Bấm Vào trận → màn mở trận: tên chế độ, điều kiện thắng, cao trào, đếm 3‑2‑1 rồi mới vào câu 1. Chưa tính giờ,
    phím đáp án bị chặn; bấm/Enter/Space để vào ngay. Luyện câu sai vào thẳng. Giảm chuyển động: số đổi không hiệu ứng.
  - Số liệu luật lấy từ hằng số `arena-core.js` (số tim, 384 nghìn km, 100 vạch, phạt 40%...) → đổi luật là thẻ tự đúng.
    Đã đối chiếu từng câu với code (vd Đua về đích: câu đúng liền thứ 3 tiến 2 bước; Virus sắp gục thì chí mạng dễ hơn).
  - Test: `arena-rules.test.js` (mọi chế độ trên trang có luật, 3 bước, nhãn hợp lệ, không tên sản phẩm khác, không chấm
    than, icon có trong bộ rút gọn, số liệu khớp core) + 9 kiểm tra E2E (đổi chế độ đổi luật, phím 1 không trả lời lúc
    đếm, Enter vào ngay, tự vào sau đếm, 375px). 0 Firebase. E2E 251/251.
- **Rà "giao diện AI" toàn dự án bằng máy** (Chrome thật, 31 điểm vào): đếm emoji trong chữ hiển thị, tên sản phẩm khác,
  chữ chuyển màu (`background-clip: text`), nền gradient, phát sáng. 22 trang đã sạch; còn nặng ở **5 trò nhỏ** (trước đây
  cố ý chừa): Battle Quiz, Cyber Detective, Chim Vượt Ải, Trí Nhớ, Phòng Thủ Dữ Liệu. Đã sửa phần KHUNG:
  - Tiêu đề tab bỏ emoji; tiêu đề trang chữ 3 màu → 1 màu + icon; nút chính chuyển màu → phẳng; thanh máu/giờ → 1 màu.
  - Emoji làm icon (HUD, nút Chơi lại/Kỷ lục/Đổi độ khó, biểu tượng lớn trên hộp thoại mở đầu/kết quả, nút chủ đề 🎲,
    nút vụ án 📁, chấm 🟢🟡🔴 chọn độ khó, icon chủ đề Trí Nhớ, ✅ chọn đội hình, huy chương 🥇🥈🥉 bảng kỷ lục) → Font
    Awesome 1 màu. 5 trang nạp thêm `lib/fontawesome/css/fa.min.css` (dùng chung site, đã có trong bộ nhớ đệm).
  - Phần làm phẳng gom ở cuối `css/game-backdrop.css` (5 trò cùng nạp, nạp sau cùng).
  - Giữ nguyên có chủ đích: tranh nền, nhân vật, hình vẽ trên canvas, tim/sao/nhãn combo và thông báo trong trận,
    ảnh đại diện mặc định của người chơi.
  - Kết quả quét sau sửa: 5 trò 0 chữ gradient, 0 nền gradient, emoji còn lại chỉ là nội dung trò chơi.
  - Chơi thử bằng Chrome: Battle Quiz vào trận có 4 đáp án; Cyber Detective mở vụ án; Phòng Thủ chọn đủ 7 → Bắt đầu;
    0 lỗi JS. E2E 251/251 (mã nguồn), 255/255 (`dist-hosting`). 0 Firebase.
  - Giữ không tái phát: bộ E2E `pages` thêm 1 kiểm tra/trang — tiêu đề tab không emoji, không chữ gradient, không tên
    sản phẩm khác (Kahoot, Blooket, Quizizz, Gimkit, Wayground…). 150/150.
- **Tranh vẽ phẳng** (người dùng duyệt ảnh trước/sau: "tranh vẽ cũng phải đổi"):
  - **12 nhân vật mã độc vẽ lại** — ảnh raster `img/pz-defense/zom_*.png` (zombie chi tiết, nét bẩn, vải rách — kiểu ảnh AI
    tạo, lại mang dáng zombie của một trò thủ thành nổi tiếng) → họ nhân vật tự thiết kế `img/malware/<id>.svg`, sinh bằng
    `scripts/build-malware-art.mjs`: thân khối 1 màu, mắt tròn, biểu tượng đúng cách tấn công (Ransomware = ổ khoá,
    Phishing = cá + móc câu + thư, Worm = thân đốt, Logic Bomb = bom đếm giờ…). Đọc rõ ở ô 48px. Dùng ở Phòng Thủ (canvas +
    thẻ), Battle Quiz (đối thủ), Cyber Detective. Xoá 12 PNG cũ (−522 KB bản deploy). CI: `build-malware-art.mjs --check`.
    Bỏ hẳn thư mục `img/pz-defense/`: 19 icon lá chắn (SVG phẳng, vẫn dùng) chuyển sang `img/defenders/`.
  - **`np-art.js` § FLAT** (nguồn chung của bản đồ Hành trình, thẻ chế độ, cảnh trong trận, nền trò nhỏ, Gọi tên): bỏ lớp
    "khối 3D" phủ mọi hình, bỏ lớp chất liệu (vân giấy, nét cọ, ánh sáng phủ, viền tối 4 góc), trời/tán lá 1 màu, viền
    mảnh 60%, mắt nhân vật 1 chấm (bỏ đốm sáng "long lanh"). `FLAT = false` là về tranh cũ.
  - **`arena-mini-art.js` § FLAT**: mỗi mặt khối 1 màu (giữ 3 sắc độ), cầu phẳng, bỏ vệt bóng loáng.
  - **Khung bản đồ + thẻ chế độ**: bỏ viền nâu đen 3–4px và bóng cứng "0 6px 0"; vòng chặng 1 viền + bóng mềm.
  - Battle Quiz: ô "Bạn" emoji 🧑 → icon phẳng. Phòng Thủ: "zombie mã độc" → "mã độc".
  - Chơi thử: Battle Quiz hiện đối thủ mới; Phòng Thủ chơi 28 giây, canvas vẽ mã độc mới; 0 lỗi tải, 0 lỗi JS.
    E2E 281/281. 0 Firebase.

## 14/11/2026 (26) — Sẵn sàng cho Firebase Hosting: cấu hình `hosting`, bản rút gọn, đo dung lượng mỗi học sinh

- `firebase.json` có phần `hosting` (chưa deploy; GitHub Pages vẫn là bản chính). `ignore` bỏ tệp đề PowerPoint/Word,
  mã nguồn, tài liệu, kiểm thử → deploy **77 MB** thay vì 716 MB. Header cache: `app/assets/**` lưu 1 năm (tên có mã băm);
  ảnh/font lưu 7 ngày; HTML/JS/CSS/JSON `no-cache` (luôn hỏi lại, không đổi thì 304 vài trăm byte, bản mới thấy ngay).
- `quiz-engine.js`, `volumes-carousel.js`: `meta.json`, `minitests-manifest.json`, file khối đổi `no-store` → `no-cache`.
  Vẫn luôn lấy bản mới, nhưng học sinh quay lại không phải tải lại cả file (cũng đỡ trên GitHub Pages).
- `tests/e2e/bandwidth.mjs`: đo byte thật bằng Chrome (gzip, ETag/304, header lấy từ `firebase.json`).
  Kết quả: máy mới **653 KB/lượt**, máy quay lại **15 KB/lượt** (trước sửa 32 KB), "Tải sẵn offline" 1 khối 1,7 MB.
- **Bản rút gọn cho Firebase** (`scripts/build-hosting.mjs` → `dist-hosting/`, không lên git; `firebase.json` "predeploy"
  tự chạy, `public: dist-hosting`): 285 file JS/CSS rút gọn bằng esbuild, kèm `.map`. JSON/HTML/ảnh giữ nguyên.
  Mã nguồn và GitHub Pages không đổi. Máy mới **653 → 507 KB/lượt** (đo gzip; Firebase dùng brotli qua HTTPS nên còn ít hơn),
  "Tải sẵn offline" 1,7 → 1,4 MB. Cả 11 bộ E2E (148 kiểm tra) đạt trên bản rút gọn: `E2E_ROOT=../../dist-hosting npm test`.
  CI job "web" build thử `--strict`.
- **Gộp file + tên theo nội dung** (cũng trong `build-hosting.mjs`, chỉ bản Firebase): 27 trang HTML, thẻ script/link
  cùng nguồn 501 → 156, ghi vào `bundles/<băm>.js|css` lưu 1 năm (`firebase.json`). File gộp chèn mã từng file thành
  `<script>` riêng → "use strict", biến toàn cục, lỗi của từng file vẫn tách biệt như cũ (đã thử: phần 1 ném lỗi, phần 2–3 vẫn chạy).
  Không gộp: script thường/CSS được tải động, `js/auth.js`, thẻ có thuộc tính riêng (`ui-select.js` data-auto), vendor.
  `sw.js`: giữ tối đa 120 file `bundles/` trong kho (đổi tên mỗi lần deploy; GitHub Pages không có thư mục này → không đổi gì).
  Kết quả mỗi lượt: máy mới **75 → 28 request**, 507 → 473 KB; máy quay lại **65 → 11 request**, 15 → 3 KB.
  `**/__tests__/**` không còn bị deploy.
- Quota Spark hiện là **10 GB/tháng** (vượt → trang bị tắt tới hết tháng): khoảng 1000 lượt máy mới/ngày.
  Phòng máy xoá cache khi khởi động lại thì 2000 lượt/ngày ≈ 20 GB/tháng → phải dùng Blaze (≈ $1,5/tháng) hoặc giữ GitHub Pages.
  So 4 host (`bandwidth.mjs` in cuối báo cáo), 2000 lượt/ngày: máy giữ cache → cả 4 đều ổn (0,63 triệu request/tháng);
  phòng máy xoá cache → chỉ GitHub Pages ổn (Vercel vượt 1 triệu request, Netlify vượt 300 credit, Firebase vượt 10 GB).
  Firestore: không đổi (0 lượt đọc/ghi thêm).
- **Sửa lỗi build**: bộ lọc `ignore` chỉ xét từng file nên `.git/` (lịch sử repo), `.github/`, `.e2e-shots/` lọt vào
  `dist-hosting/`. Giờ thư mục khớp mẫu thì bỏ cả cây. Bản deploy còn **1.283 file, 49 MB** (trước báo 86 MB là tính thừa).
- **Cloudflare Pages** (khuyên dùng nếu không dùng GitHub Pages): file tĩnh không giới hạn băng thông/request.
  Build sinh `_headers` (cache 1 năm cho `bundles/`, `app/assets/`; 7 ngày cho ảnh, font) và kiểm giới hạn
  20.000 file / 25 MiB mỗi file. Cài đặt khi nối repo GitHub: Build command
  `cd web && npm ci && cd .. && node scripts/build-hosting.mjs --strict`, Build output `dist-hosting`.
- **Cloudflare Workers** (dự án tạo kiểu Worker, lệnh deploy `npx wrangler deploy`): thêm `wrangler.jsonc` +
  `scripts/cloudflare-worker.js`. Thiếu file này wrangler tự phát CẢ thư mục repo (đã thấy `apps/Code.gs`,
  `firestore.rules`, `scripts/` tải được công khai). Giờ chỉ phát `dist-hosting/`; `html_handling: none` → `arena.html`
  phục vụ thẳng, không chuyển 307 sang `/arena` (đỡ 1 vòng mạng, service worker mở offline được). Worker chỉ chạy khi
  không có file tĩnh: `/`, `/app/` → index.html; `/app` → `/app/`; còn lại 404. Đã thử bằng `wrangler dev` + Chrome:
  sảnh, Đấu trường, app 2.0 không lỗi; tắt mạng vẫn mở được sảnh và Đấu trường.
- Deploy Firebase: `cd web && npm ci` (một lần, để có esbuild) rồi `firebase deploy --only hosting`.

## 12/11/2026 (25) — Vá lỗi hiện chữ câu hỏi chạy được mã; link mở thẳng 1 bài ở sảnh

(0 Firebase / Apps Script. Không đổi chấm điểm, nộp bài, ngân hàng đề.)
- An toàn: 6 hàm lấy "chữ thuần" từ HTML câu hỏi (Góc học tập, Thử thách hôm nay, chế độ trẻ em, thẻ trí nhớ,
  tra câu hỏi ở dashboard, Soạn đề) dùng `div.innerHTML` → `<img src=x onerror=…>` trong nội dung CHẠY được dù
  không hiện ra (đo thật: bật hộp thoại ở index.html khi mở Sổ tay). Nay dùng `DOMParser` (tài liệu trơ: không tải
  ảnh, không chạy gì). Chữ hiện ra GIỐNG HỆT: so 91/91 chuỗi HTML của data/ic3 trên cả 6 hàm.
  Rủi ro trước đây thấp (nội dung đến từ ngân hàng đề trong repo), vá để không phụ thuộc điều đó.
  CI: `scripts/check-plain-text.js` chặn mẫu cũ quay lại.
- Link mở thẳng 1 bài: `index.html?ct=<Chương trình>&cap=<Cấp độ>&bai=<tên bài>` — chỉ CHỌN SẴN trên sảnh (như bấm
  tay / nút "Ôn ngay" của Góc học tập), em vẫn chọn tên và bấm Bắt đầu. Link đề giáo viên (`?de=`) được ưu tiên.
  Đọc xong xoá khỏi URL. Link hỏng → sảnh như bình thường. Dùng ở app 2.0 → Lộ trình học → "Làm bài".
- Kiểm thử (Chrome thật): 10/10 trường hợp link (kể cả có `?de=`, tên bài có ngoặc, bài không còn, chọn lớp cùng cấp
  giữ nguyên bài); 6 trang nạp các file sửa mở không lỗi.

## 11/11/2026 (24) — Trang chủ: tiêu đề 1 dòng chào học sinh; "Kết quả của em" có bài gần đây; danh sách lỗi chỉ thử lại phần đó

(0 Firebase / Apps Script — trang chủ không gọi Firebase; số liệu đọc localStorage của máy này.)
- Thanh tiêu đề (màn ≥ 1100px): bỏ chữ "EduQuiz IC3" cỡ lớn + khẩu hiệu (đã có ở thanh trái; h1 vẫn giữ cho trình đọc màn
  hình). Thay bằng lời chào "Chào Khánh! Lớp 8A1 · Trường … — không phải em? Đổi họ tên ở bước 1" → máy dùng chung không
  làm bài nhầm dưới tên bạn khác. Chú thích 3 mảng kỹ năng chỉ hiện từ 1500px, 1 hàng, bỏ cụm 3 chấm chồng nhau.
- Thanh trái "Kết quả của em": thêm 4 bài gần đây (tên bài, %, Ôn luyện/Kiểm tra, hôm nay/hôm qua/N ngày trước), nút
  "Ôn N câu đến hạn" (mở Góc học tập) và "Xem tất cả bài làm" — thay khoảng trống.
  Hiệu năng: trước mỗi cú bấm/gõ trong form đọc + parse lại toàn bộ lịch sử (kèm chi tiết từng câu); nay chỉ tính lại khi
  đổi học sinh, vừa nộp bài, đóng Góc học tập, quay lại tab hoặc tab khác lưu bài.
- Danh sách học sinh (js/lobby-roster.js): tải lỗi trước đây ghi "Chưa có danh sách — liên hệ Điều phối đào tạo" (sai — do
  mạng) và chỉ còn cách tải lại cả trang (tải lại cả ngân hàng câu hỏi). Nay báo đúng lỗi + nút "Thử lại" CHỈ tải lại
  danh sách (bấm liên tục = 1 lượt), giữ trường/lớp/tên đã chọn. Lưu bản danh sách gần nhất trên máy (gọn [trường, lớp,
  tên]) → mạng lỗi vẫn chọn được tên để làm bài, có dòng báo "đang dùng danh sách lưu trên máy" + Thử lại.
- E2E 42/42 (sáng + tối, không gọi mạng ngoài); 59 file test PASS (1 lần chạy có 1 test lỗi ngẫu nhiên, 4 lần chạy lại đều
  PASS), check-js/html/architecture PASS.

## 11/11/2026 (23) — Đấu trường › Giáo viên: gọn kiểu macOS; đường dự phòng Firebase không mở 2 lần, lỗi chỉ thử lại phần lỗi

- Firebase (js/arena/arena-room.js startRelay): tạo phòng gọi mở đường dự phòng 2 lần (ngay khi tạo + khi PeerJS mở).
  Firebase tải chậm hơn PeerJS (thường gặp) → trước mở 2 đường: thêm 1 lượt ghi, và listener onSnapshot của đường 1 không
  bao giờ đóng — kể cả sau khi Thoát phòng — nên mỗi tin của em dự phòng bị tính đọc 2 lần tới khi đóng tab. Đo bằng E2E
  với code cũ: mở 2, thoát phòng còn 1 listener sống; bản mới: mở 1, thoát phòng đóng hết, PeerJS nối lại không mở thêm.
- Đường dự phòng lỗi mạng: thêm nút "Thử mở lại đường dự phòng" ở sảnh chờ — chỉ mở lại đường đó (1 lượt ghi), phòng/mã/
  học sinh đã vào giữ nguyên (trước phải Thoát phòng tạo lại = mất mã + ghi lại). Bấm liên tiếp chỉ 1 lượt. Lỗi sai quyền /
  chưa đăng nhập thì không hiện nút (thử lại vẫn hỏng). Chỉ vẽ lại dòng trạng thái, không vẽ lại cả sảnh chờ.
- Lưu Google Sheet: bấm ở màn kết quả rồi bấm tiếp ở "Lịch sử phòng" (hoặc bấm 2 lần lúc mạng chậm) → trước 2 lượt Apps
  Script; nay 1 lượt mỗi phòng, đã lưu thì không gọi lại.
- Giao diện tab Giáo viên (chỉ vai Giáo viên; màn chơi, Học sinh, Chơi một mình giữ nguyên):
  - Thẻ chế độ: bỏ tranh bìa to + bóng khối → hàng gọn (ảnh nhỏ + tên + 1 dòng), 4 cột; điện thoại 2 cột.
  - Số câu / Giây mỗi câu / Học sinh tối đa: segmented control 1 hàng. "Học sinh tối đa" chuyển lên cùng hàng (ẩn khi chọn
    Bảng điểm).
  - Bỏ nút "Tạo phòng và lấy mã" thứ 2 ở thẻ 3 (trùng thanh dính đáy) và dòng ghi chú lặp tóm tắt; thẻ 3 còn: phòng đang
    dở, cách tổ chức, lịch sử. Nút phẳng, không nổi 3D. Dòng tài khoản 1 hàng phẳng (bỏ khung xanh + emoji).
  - Toàn bộ thiết lập vừa 1 màn hình 1440×900 (trước phải cuộn ~1,7 màn).
- E2E 40/40 (sáng + tối, PeerJS/Firebase/Apps Script giả, không gọi mạng ngoài); 59 file test, check-js/html/architecture PASS.

## 11/11/2026 (22) — Đấu trường › Hành trình IC3: không chấm sai sao/xu do bất đồng bộ; bấm chặng ăn ngay lần đầu

(0 Firebase / Apps Script — xu, sao, nhiệm vụ lưu localStorage theo biệt danh.)
- Vào chặng (js/arena/arena.js playQuest, arena-quest.js go): bấm 2 chặng lúc đang tải câu → trước đây start() chạy 2 lần,
  đồng hồ trận cũ chạy ngầm trên trận mới; trận mới là Săn vàng (không giới hạn giờ) thì đồng hồ cũ chia 0 → mọi câu bị
  chấm hết giờ → sai sao/xu lưu vào hồ sơ. Nay chỉ 1 lượt tải một lúc (lượt sau báo "Đang tải chặng trước"), bản đồ khoá
  trong lúc tải, start() dừng hẳn trận đang dở trước khi vào trận mới.
- Mini-game (arena-mini.js onResult): trò gửi "result" 2 lần (vd Chơi lại trong khung trò) → trước cộng xu + sao 2 lần.
  Nay đã chốt ván thì bỏ qua.
- Gõ biệt danh rồi bấm ngay 1 chặng: ô biệt danh mất focus bắn "change" → vẽ lại cả bản đồ (id SVG cảnh nền đổi mỗi lần)
  giữa lúc nhấn chuột → mất cú bấm, phải bấm 2 lần. Nay chỉ vẽ lại khi biệt danh đổi thật.
- Tối: số sao trên chip cấp đang chọn đủ tương phản (trước 2,6:1). E2E 10/10 (sáng + tối, không gọi mạng ngoài), 59 file test PASS.

## 11/11/2026 (21) — Quản lý câu hỏi & hình ảnh: 2 tab không ghi đè nháp, lỗi 1 file chỉ thử lại file đó

- Nhiều tab (js/image-manager.js): bản nháp chung 1 khoá IndexedDB → trước đây tab lưu sau ghi đè mất bản sửa của tab kia.
  Nay nháp ghi kèm id tab; tab khác vừa lưu bản mới hơn thì KHÔNG ghi đè, báo "Sao lưu JSON rồi đóng tab này".
  BroadcastChannel báo ngay khi trang đang mở ở tab khác.
- Tải ngân hàng câu hỏi: từng file khối riêng, tự thử lại 1 lần; còn lỗi thì báo đúng file + nút "Thử lại N file lỗi" chỉ đọc
  lại file đó (file đã tải giữ trong bộ nhớ — đọc qua Apps Script là mỗi file 1 lượt). Thiếu file thì chưa mở vùng sửa
  (đẩy lúc đó sẽ ghi sai số câu của khối thiếu trong meta.json).
- Đang "Đẩy thay đổi": khoá vùng sửa + "Tải JSON cập nhật" (đẩy xong trang tải lại từ GitHub — sửa thêm lúc đẩy sẽ mất).
- Tìm câu hỏi: chờ gõ xong 200 ms (trước gom ~8.000 câu mỗi phím), gõ không dấu cũng tìm được.
- Giao diện: khung giới thiệu 6 dòng → 1 dòng + gập; nút "Đẩy N thay đổi" thôi nhấp nháy (viền vàng tĩnh).
- E2E 14/14 (sáng + tối, 2 tab thật cùng lúc), 59 file test PASS. Không thêm lượt Firebase/Apps Script.

## 11/11/2026 (20) — Tài liệu năm học: khung slide không còn "đen im lặng" khi Office Online mở chậm

- Đo thật (IC3 LV3 › Bài 1, pptx 10 MB): trình chiếu Office Online lần đầu mở 1 file > 40 giây chỉ thấy nền đen
  "SLIDE – OF –" (khung Office báo load ngay nên chữ "Đang mở bài…" tắt sớm); trình xem Drive (Xem dạng trang) 3–6 giây.
  Mở lại file đó sau: Office có sẵn bản chuyển đổi, ~4 giây. Link tải Drive vẫn trả đúng file.
- Thêm thanh trạng thái trên khung slide khi trình chiếu: cỡ file + đếm giây, sau 20 giây ghi "lần đầu thường 30–60
  giây", nút "Xem ngay dạng trang" (nhớ lựa chọn; phím M để quay lại). Không che slide; tự ẩn khi bấm vào slide, đổi
  bài/chế độ, bấm × hoặc sau 60 giây. Chỉ đổi giao diện — trang này không dùng Firebase/Apps Script.
- E2E (Office/Drive thật, sáng + tối) PASS; 59 file test PASS.

## 11/11/2026 (19) — Quản lý danh sách học sinh: không ghi trùng, lỗi phụ không báo "lỗi tải", bảng nhẹ

- Ghi dữ liệu (js/roster-manager.js):
  - Nút Lưu khoá khi đang ghi ("Đang lưu...") — trước bấm 2 lần lúc mạng chậm = 2 lệnh create → học sinh/lớp/khoá học
    TRÙNG. Đang ghi thì ×/Huỷ/bấm nền không đóng hộp thoại.
  - Lưu xong mà đọc lại bản ghi lỗi → báo "Đã lưu… KHÔNG cần lưu lại" (trước chung 1 try, báo như lưu thất bại → lưu lại).
  - 4 bước sửa dữ liệu cũ sau khi tải chạy riêng từng bước: 1 bước lỗi không còn báo "Lỗi tải dữ liệu" (khiến bấm Tải lại
    đọc lại cả nghìn học sinh vô ích).
  - Đọc toàn bộ học sinh qua repository (`studentRoster.col()`) thay `EduFirebase.db.collection` — check-architecture
    hết lỗi R3 (14/13) tồn tại từ trước.
- Bảng học sinh: vẽ 200 dòng + "Hiện thêm" (trước mỗi phím gõ vẽ lại ~2.800 dòng + ~5.600 listener; nay 1 listener cho cả
  bảng, gõ tìm chờ 160 ms); tìm không dấu ("au dinh an" ra "Âu Dĩnh Ân"); thêm lọc Trạng thái. Không thêm lượt đọc nào.
- Giao diện: 1 hàng lọc + 1 hàng thao tác (trước rải 3 hàng), hướng dẫn "Cập nhật cho học sinh" gập lại, bỏ cột avatar
  chữ cái; huy hiệu Đang học/Ngừng học đủ tương phản (trước 2,5:1). E2E 21/21 (sáng + tối), 59 file test PASS.

## 11/11/2026 (18) — Tổng quan điều phối: lỗi 1 nguồn không trắng cả trang; biểu đồ đọc được thay kiểu "mẫu"

- Tải theo TỪNG PHẦN (js/coordinator/dashboard.js, data-loader.js tách `loadRoster` / `loadResults`): trước roster +
  kết quả bài nộp chung 1 try — Google Sheet bận là trắng cả trang, thử lại đọc lại hết. Nay phần nào lỗi chỉ phần đó
  báo (kèm lý do), nút "Thử lại phần này" đọc lại ĐÚNG nguồn đó; phần đã có giữ nguyên (KPI phần thiếu hiện "—").
  Mỗi lượt tải có số thứ tự: lượt cũ về muộn không đè lượt mới. `loadAll` giữ nguyên cho nơi gọi cũ.
- Biểu đồ (js/coordinator/charts.js): bỏ nhãn (Bar)/(Line)/(Pie)/(Radar). Điểm TB theo lớp → cột ngang xếp lớp yếu
  trước, lớp < 70% màu cảnh báo, vạch đạt 70%, tooltip số bài. Xu hướng → theo tuần (dữ liệu < 3 tuần thì theo ngày),
  đường thẳng không làm mượt/không tô nền. Pie Đạt/Chưa đạt (trùng KPI) → Phân bố điểm 4 mức. Radar (trùng biểu đồ 1)
  → % học sinh đã làm bài theo lớp, lớp ít nhất trước. Màu lấy theo theme, đổi sáng/tối tự vẽ lại (không tải lại).
  Bảng Lớp × Bài thi: tô cả ô nền nhạt + chữ đậm (trước chữ trắng trên vàng/xanh nhạt ~1,5:1).
- KPI: "Chưa làm bài" thêm % sĩ số; bỏ nhấc ô khi rê chuột, hiện so le, icon nhấp nhô.
- analytics-service.js: thêm `trendByWeek`, `scoreBands`, `classStats` (test: analytics-coordinator.test.js);
  `trendByDay` tính ngày theo giờ máy (trước giờ UTC → bài nộp 0h–7h sáng bị tính sang hôm trước).
- Không thêm lượt đọc Firestore/Apps Script nào: lọc, đổi theme, vẽ lại đều dùng dữ liệu đã tải. E2E 20/20, 59 file test PASS.

## 11/11/2026 (17) — Làm bài: màu "Đã làm" không lẫn với Đúng/Sai; "Kiểm tra đáp án" mỗi câu 1 lần

- Màu (css/quiz-play.css): "Đã làm" trước dùng xanh lá — trùng màu "Đúng" khi kiểm tra; thanh tiến độ xanh lá có sọc.
  Nay ô đã làm TÔ ĐẶC màu mực như phiếu trắc nghiệm (`--done`: sáng navy/chữ trắng 14:1, tối nền sáng/chữ đậm 13:1),
  thanh tiến độ + chấm chú thích cùng màu, bỏ sọc. Xanh lá/đỏ chỉ còn cho Đúng/Sai: dấu ✓/✕ nhỏ ở góc ô câu đã kiểm tra.
  Đáp án đang chọn giữ xanh dương nhạt, câu đang xem giữ vòng viền xanh.
- Ôn luyện (js/quiz-engine.js): "Kiểm tra đáp án" mỗi câu CHỈ 1 LẦN. Trước bấm lại được ("Ẩn kết quả" → đổi đáp án →
  kiểm tra tiếp) nên thử dần tới khi đúng. Nay kiểm tra xong: ghi `State.checked[câu]`, khoá phần trả lời (inert + chặn
  click/chạm/kéo/phím ở pha capture, cả phím tắt 1–9/A–E), nút thành "🔒 Đã kiểm tra". Quay lại câu vẫn khoá và vẫn
  thấy giải thích. Chưa chọn đáp án mà bấm thì chỉ nhắc, không tính lượt. `checked` lưu cùng bài làm dở (autosave
  localStorage) nên tải lại trang vẫn khoá. Chế độ "Kiểm tra" không đổi (vốn không có nút này).
- Không đổi chấm điểm, kết quả gửi lên Firestore/Sheet. E2E 30/30 (sáng + tối), 58 file test PASS.

## 11/11/2026 (16) — Rà nốt 11 trang còn lại (học sinh, trò chơi, Đấu trường, đăng nhập, Hotspot)

- Đấu trường / Live quiz: nút "Vào phòng" chữ trắng trên `--green` chỉ 2,7:1 (cả 2 chế độ) → xanh đậm `#15803d` (5:1);
  chữ navy trên nền tối (2,27:1: "Đấu trường", "Chơi Hành trình IC3") → `--purple-ink` (arena.css, 13 chỗ, sáng không đổi).
- Bỏ gradient kiểu "mẫu AI" ở luồng học sinh: thẻ ghi nhớ + thanh mục tiêu tím→ngọc (learning-hub.css), nút trợ lý AI
  (ai-assist.css) → màu phẳng.
- Giữ nguyên có chủ đích: tiêu đề chữ gradient + emoji của 6 trò chơi (Battle Quiz, Cyber Detective, Trí nhớ, Chim Vượt Ải,
  PZ Defense, Mô phỏng máy tính), sảnh học sinh (đã chốt thiết kế; chữ logo "IC3" màu cam là logo), hoạ tiết giấy ở màn
  làm bài, lớp mờ 3px sau hộp thoại.
- Sau sửa: 0 chỗ < 3:1 ở cả 2 chế độ trên 28/28 trang (trừ chữ logo và báo nhầm của chữ gradient / lớp phủ đang ẩn).
  Chỉ CSS — không đổi Firebase/dữ liệu. 58 file test PASS.

## 11/11/2026 (15) — Độ tương phản chữ ở chế độ tối/sáng (đo tự động)

Đo tỉ lệ tương phản chữ/nền thực tế của mọi phần tử hiển thị trên 17 trang quản lý (Playwright, cả 2 chế độ).
- Tối: 19 chỗ chữ `#2f40b2` (`--purple`) trên nền tối chỉ 1,8–2,3:1 (Bộ đề, Danh sách HS, Quản lý hình ảnh, Tài liệu).
  Thêm token **`--purple-ink`** cho MÀU CHỮ nhấn: sáng = `--purple` (không đổi gì), tối = `#9fadff` (≥ 6:1). 112 chỗ
  `color: var(--purple|--accent-purple)` chuyển sang token này (chỉ thuộc tính `color`, không đụng nền/viền; bỏ qua arena.css).
- Sáng: `--text-muted` `#9ca3af` (2,5:1) → `#6b7280` (4,8:1); số liệu xanh/vàng ở Quản lý hình ảnh dùng sắc đậm khi sáng.
- Chip lọc đang chọn ở Bộ đề: bóng lõm neumorphic (tối gần như không thấy) → nền tím nhạt + viền mảnh.
- Sau sửa: 0 chỗ < 3:1 ở cả 2 chế độ trên các trang đo. Chỉ CSS/màu — không đổi Firebase/dữ liệu. 58 file test PASS.

## 11/11/2026 (14) — Bỏ dấu vết "giao diện mẫu AI" còn sót ở trang quản lý (chỉ đổi hiển thị)

Rà 17 trang quản lý bằng ảnh chụp (đăng nhập giả, Firestore giả, chặn mạng). Đa số đã phẳng từ các đợt trước; sửa phần còn sót:
- Thanh trên Bộ đề / Tổng quan điều phối: dải gradient chạy animation và chữ tiêu đề gradient → 1 màu, đứng yên.
- Avatar gradient cam→đỏ kèm bóng đỏ, thanh tiến độ / avatar học sinh gradient "kẹo" (teacher-insights) → màu phẳng.
- Bìa thẻ bộ đề: vẽ 1 màu (màu đầu của `coverGradient`) và bỏ hoạ tiết chấm bi. **Giá trị `coverGradient`/`icon`
  lưu trong bộ đề không đổi** (`coverColor()` ở dashboard.js, `flatCover()` ở exam-builder.js chỉ dùng lúc vẽ).
- Icon ✨ (`wand-magic-sparkles`) và 🚀 → icon đúng nghĩa: "Đề có sẵn" `layer-group`, "Bắt đầu làm bài" `play`,
  thông báo `circle-info`, nút AI soạn câu `pen-to-square`. Nút dùng Gemini vẫn ghi rõ "AI"/"Gemini".
- Giữ nguyên có chủ đích: trò chơi học sinh (Arena, Gọi tên, PZ Defense…), sảnh học sinh, vòng focus bàn phím,
  emoji trong tin nhắn Zalo của Thi đua, emoji bìa bộ đề GV tự chọn (là dữ liệu).
- Không đổi Firestore/Apps Script/localStorage. 58 file test + check-js/html/fa-subset đều PASS.

## 10/11/2026 (13) — Điểm danh › Lịch dạy: lịch tuần kiểu TKB Sáng/Chiều, hết khoảng trống 2 bên

- Trang dùng hết bề ngang màn hình (bỏ giới hạn 1320px). Màn rộng: "Hôm nay" + "Việc cần làm" thành cột trái,
  lịch tuần chiếm phần còn lại; màn dưới 1180px xếp chồng như cũ.
- Lịch tuần kẻ bảng như thời khoá biểu: cột Thứ 2 → Thứ 7, hàng **Sáng / Chiều**. Sheet không ghi giờ học nên
  GV bấm "Sáng"/"Chiều" trên lớp ở hàng "Chưa xếp buổi" (⇅ để đổi). Xếp theo lớp + thứ, các tuần sau tự theo;
  "Hôm nay" xếp lớp sáng trước, "Sao chép lịch" ghi rõ buổi.
- Lớp của tôi chưa đọc được thì báo ngay trên lịch, nút "Đọc lại lớp này" chỉ đọc đúng các lớp đó
  (không phải bấm "Cập nhật tất cả").
- **Tự xếp theo Lịch giảng dạy + hiện giờ dạy** (sửa 11/11: bản 10/11 chỉ đọc `teaching_timetable` — thường trống vì lưới TKB lớp
  tự điền từ Lịch tuần lúc mở, không lưu — và tra GV bằng `where active + orderBy name` cần index ghép → không xếp được gì).
  Nay đọc như tab TKB lớp: mã lớp ở Lịch tuần (`teaching_schedule.periods`, `effectivePeriods`), thiếu mới lấy TKB lớp;
  trường theo `location`/`periodSchools`; giờ ở Giờ tiết (`teaching_timetable_periods`, chưa đặt → khung mặc định).
  Mọi truy vấn chỉ `where` 1 trường hoặc `orderBy` 1 trường (không cần index ghép). Thẻ lớp hiện giờ "08:10–08:45";
  lớp dạy cả sáng lẫn chiều cùng ngày (vd 4/1 tiết 3 + tiết 7) tách 2 thẻ. Tuần chưa nhập TKB dùng TKB gần nhất
  (TKB bàn giao). Lớp không có trong TKB (dạy bù) mới phải xếp tay.
- Chi phí Firestore (`js/so-lop/tkb-source.js`, lưu `eduquiz_tkb_v2`, tự xoá v1): 2 get/tuần đang xem (Lịch tuần + TKB lớp),
  giữ 6 giờ (tuần đã qua 30 ngày, kể cả tuần trống); Giờ tiết 1 get/3 ngày; máy chưa có tuần nào → 1 lần đọc các tuần
  Lịch tuần của GV (≤ 1 lần/3 ngày); Admin không có `teacherCode` → 1 lần danh sách GV (giữ 3 ngày). Đo bằng test E2E:
  mở lần đầu 5 lượt, đổi tuần qua lại thêm 2 lượt/tuần mới, tải lại trang 0 lượt. Lỗi: không thử lại trong 30 phút,
  in `[Lịch dạy · TKB]` ra Console, dòng dưới lịch nói rõ lý do.
- Xếp tay chỉ lưu localStorage (`eduquiz_solop_v1.slots`), không Firebase, không `teacher_sync`.
  Test: `so-lop-core.test.js` (buoiOf, buoiGrid, classKey, tkbCells, tkbFor), `tkb-source.test.js` (đếm lượt đọc).

## 10/11/2026 (12) — Điền bảng tuần: tạo tab tuần sau tự động từ sổ lớp của điều phối (K3/K4/K5)

**Vấn đề:** "Tạo bảng tuần mới" chỉ lấy lớp có ô NGÀY trên sổ lớp. Điều phối thường chỉ ghi ngày tới tuần hiện tại, nên ở tuần 11 có 10/18 lớp bị thiếu: 8 lớp chưa có ngày sau tuần 10, còn 4A5 và 5A6 bỏ trống ngày từ 27/10. Ngoài ra phải đọc tab tuần trước mỗi lần, số tuần không tự chuyển sang tuần mới, và khối báo giảng K8:M12 phải gõ tay.

**Đã sửa (js/so-dau-bai/sdb-weekly.js, sdb-app.js, css/so-dau-bai.css):**
- `weekSessions`: tiết có NGÀY giữ đúng ngày. Tiết sau tiết có ngày cuối cùng, kể cả tiết đã tick hoàn thành, được xếp tiếp theo lịch hằng tuần của lớp: số tiết mỗi tuần và các thứ dạy lấy từ sổ lớp, ô THỨ được ưu tiên. Bảng đánh dấu các tiết này là "dự kiến". Khi điều phối ghi NGÀY, ngày thật sẽ thay cho ngày dự kiến.
- Tiết TKB của tab tuần đã đọc được lưu trên máy (`sodaubai_solop.tkb`), nên các tuần sau chỉ cần bấm **Đọc sổ lớp**. Lớp đổi thứ dạy thì lấy theo tiết thứ mấy trong tuần và đánh dấu "?" để kiểm tra.
- Tuần 01 tự chỉnh theo tiêu đề tab ("Tuần: 10 (Từ ngày 09/11/2026…)"). Bảng tạo tuần tự chọn tuần kế tiếp.
- Thêm nút sao chép **khối báo giảng K8:M12**: ngày đầu tuần, tiết PPCT và 2 bài của mỗi khối.
- Tab lớp bị lỗi mạng có nút **Đọc lại N tab lỗi**, chỉ đọc lại các tab đó.

**Test với dữ liệu thật của 3 sổ điều phối (route giả, không gọi Google):**

| | Trước | Sau |
|---|---|---|
| Tuần 10 | 36 tiết | 36 tiết; khối K8:M12 trùng bảng trường |
| Tuần 11 / 12 | thiếu 10 lớp | 36 / 36 tiết, 20 tiết "dự kiến" |
| Bắt buộc đọc tab tuần mỗi lần | có | không (TKB đã lưu) |
| 1 tab lỗi | đọc lại 21 tab | đọc lại 1 tab |

Firebase: 0. Apps Script: 0. Chỉ đọc CSV công khai của Google Sheet như trước.

## 10/11/2026 (11) — Sổ đầu bài: tự điền buổi/tiết khi TKB chưa có lớp; gợi ý nhận xét Ưu điểm/Hạn chế ngay khi ghi tiết

Thầy cô thấy (so-dau-bai.html, khung Ghi tiết dạy — nhất là khi mở từ nút "Ghi sổ" của Điểm danh):
- Lớp có buổi trên sổ lớp nhưng **TKB của sổ chưa có lớp đó hôm đó**: trước luôn điền "Tiết 1 buổi sáng" (mọi lớp như vậy
  cùng chồng lên Sáng 1). Nay đoán theo thứ tự, chỉ từ dữ liệu trên máy:
  1. lần gần nhất (8 tuần) đã ghi lớp đó **cùng thứ** — gồm cả tiết lưu từ "Điền bảng tuần" của trường;
  2. **giờ điểm danh** ở trang Điểm danh (cùng ngày): trước 13:15 là Sáng, sau là Chiều; tiết theo giờ vào tiết
     (Cài đặt → mới: "Vào tiết 1 buổi sáng/chiều", "Phút mỗi tiết", "Ra chơi sau tiết 2"; mặc định 7:15 · 14:00 · 35 · 20);
  3. không có gì thì như cũ, nhưng chọn tiết còn trống (không chồng lên lớp khác).
  Khung ghi hiện dòng "Buổi, tiết theo giờ điểm danh 14:50 — kiểm tra lại" và mở sẵn ô buổi/tiết; danh sách hiện "Tiết 2?".
- **Nhận xét gợi ý**: tiết mới tự điền Ưu điểm + Hạn chế theo bài (ngân hàng nhận xét IC3 + "Kiến thức cần đạt" của bài nếu
  đã đọc bảng tuần trước đó), có nhắc vắng nhiều. Nút **Gợi ý khác** đổi câu. Đổi bài / đổi danh sách vắng thì gợi ý theo;
  ô thầy cô đã tự gõ không bị ghi đè. Tiết đã ghi trước đây không tự đổi.
- Điểm danh ghi lại giờ bắt đầu điểm danh của từng buổi (chỉ trên máy, xoá sau 14 ngày) để Sổ đầu bài dùng.

Test (Playwright, sổ lớp giả 3 lớp dạy thứ 3 + TKB chỉ có 4.4; bản cũ → mới):
| Lớp | Bản cũ | Bản mới |
|---|---|---|
| 5.2 (thứ 3 tuần trước ghi Chiều tiết 3) | Sáng 1 | Chiều 3 (theo lần trước) |
| 5.5 (điểm danh lúc 14:50) | Sáng 1 | Chiều 2 (theo giờ) |
| 4.1 (không có dữ liệu) | Sáng 1 (chồng 2 lớp kia) | Sáng 1, ghi "chưa rõ tiết" |
| Nhận xét khi mở từ Điểm danh | trống | điền sẵn, "Gợi ý khác" đổi được, chữ tự gõ giữ nguyên khi đổi bài |

Firebase: 0 (sổ, TKB, sổ lớp, ngân hàng nhận xét đều trên máy / file tĩnh). Apps Script: 0. Không đọc mạng thêm khi mở khung ghi.

## 10/11/2026 (10) — Đấu trường, Chơi một mình: lỗi mạng báo đúng + Thử lại phần lỗi; 2 tab không mất xu; giao diện phẳng

Học sinh thấy (arena.html, thẻ Chơi một mình):
- Công tắc Hành trình IC3 | Đấu tự do thành thanh chọn phẳng cùng kiểu thanh vai (bỏ viền nâu dày, bóng khối, vòng tròn icon).
  Nút Linh vật và ô ảnh đại diện bỏ khối nổi; icon tiêu đề thẻ nhạt đi. Thẻ chế độ có tranh giữ nguyên.
- Tải bộ câu lỗi mạng: báo "Không tải được bộ câu này" + nút **Thử lại**. Bộ "Trộn mọi chủ đề" thiếu vài phần thì vẫn chơi
  được phần đã tải, có báo thiếu.

Lỗi đã sửa (Playwright, chặn data/ic3 giả lỗi mạng; bản cũ đều tái hiện được):
| Tình huống | Trước | Sau |
|---|---|---|
| Mạng lỗi khi tải bộ câu | báo nhầm "không có câu thuộc dạng đã chọn", tự mở mục Dạng câu, không có cách tải lại ngoài F5 | báo lỗi mạng + Thử lại (chỉ tải phần lỗi) |
| Đổi bài → Trộn mọi chủ đề → bài cũ (3 lần đổi) | 9 lượt tải file | 1 (file đã tải nhớ trong phiên) |
| Hành trình: chặng tải lỗi | "Chủ đề này chưa có câu hỏi" | báo lỗi mạng, bấm lại chỉ tải phần lỗi |
| 2 tab Đấu trường: tab 1 được +25 xu, tab 2 đổi cài đặt | xu về 8 (mất 25) | 33 ở cả 2 tab |
| Giáo viên: tài khoản bị từ chối, đổi tab rồi quay lại | kẹt "Đang kiểm tra tài khoản..." | giữ đúng thông báo |

Firebase: không thêm lượt nào. Chơi một mình vẫn 0 Firebase; cổng Giáo viên vẫn chỉ nghe đăng nhập 1 lần.
Apps Script: không đổi.

## 10/11/2026 (9) — Điểm danh: 1 lớp lỗi chỉ đọc lại lớp đó; nháp không còn ghi nhầm lớp/nhầm bạn; giao diện gọn

Thầy cô thấy (diem-danh.html):
- "Hôm nay": mỗi lớp 1 dòng mảnh, kèm nhãn **chưa điểm danh / nháp chưa ghi / đã điểm danh**; hết thanh cuộn lồng trong thẻ.
  Nút chữ nhỏ "Ghi sổ" · "Điểm danh" (lớp đã điểm danh thì nút nhạt đi). Bỏ icon trước tiêu đề mục, nút góc 8px, viền 1px.
- Thẻ Các lớp: lớp đọc lỗi có chữ đỏ + nút **Đọc lại lớp này** (chỉ đọc đúng lớp đó). Dòng trên báo "N lớp lỗi" riêng.
- Đang mở lớp khác (còn tải): danh sách lớp cũ mờ đi.
- Ghi vào Sheet mà trong lúc chờ có sửa thêm: phần sửa thêm vẫn là nháp, có nhắc "bấm Ghi lần nữa".
- "Đồng bộ ngay" khoá 20 giây sau mỗi lần bấm.

Lỗi dữ liệu / bất đồng bộ đã sửa (Playwright, Sheet + Apps Script giả; bản cũ đều tái hiện được):
| Tình huống | Trước | Sau |
|---|---|---|
| Bản đọc trên máy bị dọn (bộ nhớ đầy / Sổ đầu bài dọn) rồi mở trang | đọc lại **cả 6/6 lớp** (sổ riêng tư: mỗi lượt là Apps Script) | chỉ 4 lớp của tôi |
| Chọn lớp B (đang tải) rồi bấm tên ở danh sách lớp A còn hiện | nháp ghi vào **lớp B** theo dòng của lớp A | vào lớp A (lớp đang hiện) |
| Sửa thêm 1 bạn trong lúc đang ghi vào Sheet | mất phần sửa thêm | còn trong nháp |
| Điều phối chèn 1 dòng học sinh, nháp cũ còn | **bạn mới chèn bị đánh vắng** | nháp dòng lệch tên bị bỏ |
| 2 tab Điểm danh: tab 1 điểm danh, tab 2 bấm ★ | nháp tab 1 mất | còn |
- 2 tab: tab cũ lưu đè cả link sổ cũ → teacher-sync coi là "thay đổi" và ghi đè lên `teacher_sync/{uid}` (1 lượt ghi
  Firestore + mất link mới). Nay tab nhận bản lưu của tab kia (sự kiện storage) trước khi lưu.
- Cùng 1 lớp đang đọc (mở lớp + "Cập nhật tất cả" + tự đọc lại) → dùng chung 1 lượt, không đọc trùng.
- Lần mở lớp cũ về muộn (chờ tên bài) không đè lớp mới; bảng Các lớp vẽ lần cũ về muộn cũng bỏ.
- Bản CSV lưu trên máy bỏ ô trống cuối dòng (giữ số dòng): lớp mẫu 3.176 → 562 ký tự, ít bị dọn vì đầy bộ nhớ.
  Sổ đầu bài, Trang quản lý đọc bản này như cũ.
- Nháp lưu thêm tên học sinh theo dòng; Sổ đầu bài (vắng lấy từ nháp) cũng bỏ dòng lệch tên.

Firebase: không thêm lượt nào (đọc Sheet là link Google; teacher-sync vẫn 1 lượt đọc/2 giờ). Bớt: ghi đè `teacher_sync` từ tab cũ.
Apps Script: không đổi máy chủ; sổ riêng tư bớt lượt khi bản đọc bị dọn hoặc 1 lớp lỗi.

## 10/11/2026 (8) — Đấu trường: màn vào phòng gọn; đường dự phòng không còn sót listener Firestore

Học sinh thấy (arena.html):
- Thanh chọn vai thành 3 nút phẳng trong 1 khung (vai đang chọn: nền trắng + gạch màu dưới), bỏ nền chuyển màu,
  bóng khối và biểu tượng nhún. Điện thoại: chỉ chữ, không xuống dòng.
- Thẻ vào phòng: bỏ cảnh lớp học vẽ phía sau (không còn dựng SVG), bỏ mặt cười tròn nổi trên thẻ, bỏ nút phập phồng.
  Tiêu đề "Vào phòng của lớp" (kèm Linh vật nhỏ), 1 dòng dẫn. 3 bước cách chơi thành 1 dòng chữ (ẩn trên điện thoại).
  "Chưa có mã phòng? Chơi Hành trình IC3" thành dòng liên kết (trước: khung vàng viền dày, điện thoại bị chia 3 cột).
- Gõ 0, 1, O, I, L vào ô mã: trước bị xoá âm thầm; nay dòng nhắc "Mã không có số 0, 1 và chữ O, I, L." đổi màu cam.

Firebase — đường dự phòng (học sinh không nối thẳng được máy giáo viên, js/arena/arena-relay.js):
- `close()` bỏ qua khi kết nối CHƯA mở → gõ sai mã / hết giờ chờ / lỗi rồi bấm Thử lại: mỗi lần sót 1 listener trên
  arena_relay/{mã}. Phòng mở sau bằng mã đó (hoặc giáo viên mở lại phòng cũ) thì MỖI listener sót bị tính 1 lượt đọc
  ở mọi lần máy giáo viên ghi (~1 lần/giây trong trận). Phòng đóng (document xoá) cũng không huỷ listener.
  Nay đóng luôn huỷ listener; phòng đóng tự đóng hẳn; arena-room.js đóng kết nối hỏng trước khi nối lại.
  Test (Firestore giả): 3 lần thử mã sai → trước 4 listener sót, phòng mở thì 3 kết nối đã bỏ vẫn nhận tin; nay 0.
- Đã rà: câu hỏi là file tĩnh (data/ic3), chọn bộ khác không gọi Firebase; học sinh nối thẳng 0 lượt Firebase.
Phòng/trận không đổi giao thức. Apps Script: không đổi.

## 10/11/2026 (7) — Lịch giảng dạy: xuất của 1 GV không đọc cả đội; đổi tuần nhanh / 2 người cùng sửa không hỏng dữ liệu

Thầy cô thấy (teaching-schedule.html, tab Lịch tuần):
- Cạnh ô Tuần: nút ‹ › và "Tuần này" (phím ← → khi không gõ chữ). Tuần đã xem mở lại không tốn lượt đọc.
- Ô tìm: gõ không dấu vẫn ra ("dang thi" → ĐẶNG THỊ…), nhiều từ thì khớp đủ các từ; dòng nhỏ "12/60 giáo viên khớp".
- Lưu lịch mà máy khác vừa sửa đúng lịch đó sau khi mình mở: hỏi lại (OK = ghi đè, Huỷ = giữ bản kia và hiện lên bảng).

Lỗi dữ liệu / bất đồng bộ đã sửa (đã thử lại trên bản cũ: đều tái hiện được):
- Chọn tuần A rồi tuần B thật nhanh: A về sau B → bảng hiện lịch tuần A dưới nhãn tuần B; bấm Sửa rồi Lưu là ghi lịch
  tuần A vào tuần B. Nay lần chọn cũ về muộn bị bỏ.
- Đang lưu thì đổi tuần: lượt đọc lại sau khi lưu gắn lịch tuần cũ vào bảng tuần mới. Nay không đụng bảng tuần khác.
- 2 người cùng sửa lịch 1 giáo viên: người lưu sau ghi đè mất phần của người trước mà không biết.
- 1 giáo viên thiếu tên/mã (doc nhập dở) → ô tìm + "Xuất PDF tất cả" báo lỗi `toLowerCase`.

Firebase (Firebase giả cỡ thật: 60 GV × 12 tuần, scratchpad ts_test.py / ts_ct.py; cũ → mới):
| Thao tác | Trước | Sau |
|---|---|---|
| Phiếu công tác 1 GV, khoảng ngày 4 tuần chưa mở | 180 (lịch cả đội 3 tuần) | 3 (đúng doc của GV đó) |
| PDF lịch 1 GV có trang "cuối tháng" chưa mở | 60 | 1 |
| Lưu lịch 1 GV | 1 đọc lại sau khi ghi | 1 đọc trước khi ghi (kiểm tra xung đột), 0 sau |
| Sau khi lưu, đổi tuần rồi quay lại tuần đó (mỗi lần) | 60 (tuần đó đọc thẳng máy chủ tới khi đóng tab) | 0 |
Mở trang / mở lại / tìm / chuyển tab không đổi (cold 504 do ảnh đại diện + GV, mở lại 0). Apps Script: không đổi.
js/services/schedule-read-cache.js: thêm `put` (ghi bản đúng vào bản đệm sau khi lưu, bỏ cờ "đọc thẳng máy chủ" của
đúng khoá đó; lệnh ghi kế tiếp lại bỏ) và `peek` (xem bản đệm, không đọc máy chủ) — có test. Bộ Firebase giả: thêm
`window.__FS_SEED` để kịch bản đo tự nạp dữ liệu riêng.

## 10/11/2026 (6) — Quản lý tài khoản: bảng gọn, tìm/lọc, sửa từng người trong 1 bảng; lưu không đọc lại cả danh sách

Admin thấy (admin-users.html):
- Ô tìm (tên, email, trường, lớp, Mã NV; phím `/`) + các tab lọc có số đếm: Tất cả · Cần xử lý · Chờ duyệt · Giáo viên ·
  Điều phối/QT trường · Quản trị viên · Học sinh. "Cần xử lý" gom tài khoản chờ duyệt, điều phối chưa gán trường,
  giáo viên chưa gán lớp / thiếu trường của lớp đang dạy / chưa liên kết Mã NV — dòng có nhãn cảnh báo vàng.
  Tìm và lọc chạy trên dữ liệu đã có: 0 lượt đọc. Mở thẳng `admin-users.html?q=<email>` là lọc sẵn 1 người.
- Mỗi dòng chỉ tóm tắt (thẻ trường, thẻ lớp, Mã NV); 60 dòng/lần, "Xem thêm". Điện thoại: mỗi tài khoản 1 thẻ.
- Bấm "Sửa" (hoặc nhấp đúp dòng) → bảng trượt bên phải: vai trò, trường (tìm + tích, thẻ bỏ được), lớp theo trường
  (tìm, "Chỉ trường đã chọn", lớp của GV khác ghi tên GV), Mã NV (ô chọn có tìm, ghi rõ mã đã gán cho ai).
  Chọn lớp là trường tự thêm theo (đến khi sửa tay ô trường). Chân bảng ghi "Sẽ lưu: …"; 1 nút Lưu cho tất cả.
- Đổi vai trò không còn ghi ngay khi chọn nhầm trong danh sách; cấp/bỏ quyền Quản trị viên phải xác nhận.

Lỗi dữ liệu / bất đồng bộ đã sửa:
- Ô chọn nhiều giữ Ctrl: bấm không giữ Ctrl là mất hết trường/lớp đã chọn rồi lỡ tay Lưu → nay là ô tích từng mục.
- Bỏ gán lớp theo danh sách lớp cũ (đệm tới 12 giờ) xoá mất giáo viên mà máy khác vừa gán. Nay trước khi ghi đọc lại
  đúng các lớp sắp đổi; lớp đã đổi ở máy khác → không ghi gì, cập nhật danh sách và báo xem lại.
- Lưu nhanh 2 người liên tiếp: 2 lần sửa bản đệm chen nhau làm mất lần trước (mở lại trang thấy dữ liệu cũ). Nay ghi
  bản đệm tuần tự từ bộ nhớ. Lần tải cũ về muộn không vẽ đè lần tải mới.
- Vai trò + trường + Mã NV gộp 1 lệnh ghi (trước 3 nút, lỗi giữa chừng là lệch nửa vời). Giáo viên bị chuyển lớp đi
  được đặt lại "Trường được xem" theo lớp còn lại ngay.

Firebase (đo bằng Firebase giả cỡ thật, 121 tài khoản / 150 lớp / 3.000 học sinh):
| Thao tác | Trước | Sau |
|---|---|---|
| Lưu lớp cho 1 giáo viên (chuyển 1 lớp) | 396 đọc (đọc lại users, classes, teaching_teachers) | 20 đọc (1 lớp + 19 học sinh của lớp đó) |
| Đổi vai trò / trường / Mã NV | 0 đọc, mỗi mục 1 lệnh ghi | 0 đọc, 1 lệnh ghi |
| Nút "Cập nhật" mới / sau Nhập GV từ Excel | đọc lại 121 tài khoản | 2 lượt (chỉ tài khoản mới tạo / vừa sửa) |
| Tìm, lọc, mở bảng sửa | — | 0 |
| Phần tử trong bảng | ~38.800 (31.097 `<option>`) | ~1.000 |
Mở trang lần đầu / mở lại không đổi (3.172 / 0). Apps Script: không đổi (mỗi mục đổi vẫn 1 dòng nhật ký như trước).
Bộ Firebase giả (scripts/measure-firestore/fake-firebase.js): doc trả về từ truy vấn nay có `ref` ghi được (batch.set(d.ref)).

## 10/11/2026 (5) — Sảnh gọn kiểu macOS: tiêu đề 1 hàng, bỏ robot, bỏ khoảng trống

Học sinh thấy (index.html — vẫn nền trời xanh, 3 màu 3 bước):
- Tiêu đề thành 1 hàng thấp như thanh công cụ: "EduQuiz IC3" + khẩu hiệu bên trái; bên phải 3 mảng kỹ năng (chấm màu +
  tên: Máy tính căn bản · Ứng dụng chính · Cuộc sống số, 3 chấm chồng nhau thay sơ đồ 3 vòng tròn to) và "Dành cho thầy cô".
  Bỏ chữ in hoa cỡ lớn.
- Màn rộng: nội dung bám lên trên thay vì canh giữa theo chiều dọc → hết dải trống trên tiêu đề; khung 3 bước lên cao ~50px.
- Thanh trái: bỏ robot hoạt hình; "Kết quả của em" thành nhóm thứ 2 ngay dưới menu (tiêu đề nhóm chữ nhỏ màu xám, không
  đóng khung) thay vì bị đẩy xuống đáy.
- Điện thoại: tiêu đề + nút Dành cho thầy cô, ẩn hàng 3 mảng kỹ năng để nhường chỗ cho các bước.
Bản trước nằm ở commit ef6824c (css/lobby-skin.css, index.html) nếu cần quay lại sơ đồ 3 vòng tròn.

## 10/11/2026 (4) — Lịch chọn ngày tiếng Việt; ô chọn đẹp ở Đấu trường, Góc học tập, Thi đua

Học sinh thấy:
- **Đặt ngày thi** (sảnh): bấm bút chì không còn hiện ô "mm/dd/yyyy" lơ lửng và lịch tiếng Anh bật ra góc màn hình. Nay là lịch
  tiếng Việt (`js/ui-date.js`) mở ngay dưới nút: tuần bắt đầu Thứ Hai, T7/CN màu cam, ngày đã qua bị gạch, hôm nay có vòng
  tròn, dòng dưới "Thứ Sáu, 20/11/2026 · còn 11 ngày", nút **Xoá ngày thi**; điện thoại là tấm trượt; dùng được phím mũi tên.
- Ô chọn có tìm kiếm (như sảnh) ở: **Đấu trường** (Chương trình, Cấp độ, Bài/chủ đề), **Góc học tập** (chọn học sinh, cấp độ
  lộ trình — có ảnh chữ cái), **Thi đua** (lớp, loại lớp, số tổ, trường/lớp có sẵn, học sinh đổi quà). Các trang này giữ nguyên
  màu/viền của trang (chế độ `ss-keep`: nút mang class của `<select>` gốc), chỉ thay bảng chọn; ô nhỏ trong bảng học sinh
  của Thi đua giữ kiểu cũ cho gọn.
Kỹ thuật: trang bật bằng `<script src="js/ui-select.js" data-auto="select.ar-input">`; ô vẽ thêm sau (Góc học tập, Thi đua)
tự được bọc. Chế độ tối: màu nhấn sáng hơn cho đủ tương phản trên nền tối.
Đã thử trên Chrome (1366px và 390px, tối): đổi Chương trình ở Đấu trường → Cấp độ đổi theo; Thi đua đổi Loại lớp → giá trị
đúng; đặt/đổi/xoá ngày thi; không lỗi JS, không cuộn ngang. Test: `ui-date.test.js` (9 ca), `ui-select.test.js` thêm ca chữ cái.
Chưa làm: ô ngày ở trang giáo viên (Sổ đầu bài, Lịch giảng dạy) vẫn dùng lịch của trình duyệt; ô chọn trang quản lý giữ nguyên.

## 10/11/2026 (3) — Sảnh học sinh: ô chọn Trường / Lớp / Họ và tên đẹp hơn, có tìm kiếm

Học sinh thấy (index.html, giữ nguyên giao diện sảnh xanh da trời):
- 6 ô chọn (Trường, Lớp, Họ và tên, Chương trình, Cấp độ, Bài luyện tập) không còn danh sách xám của hệ điều hành: bảng chọn
  theo màu của bước (xanh dương · xanh lá · cam), mục đang chọn có ✓, nhóm bài có tiêu đề, có chế độ tối.
- **Tìm tên không dấu**: gõ "khoa", "nguyen van an" hoặc chữ đầu "nva"; chữ khớp được tô; chân bảng "2/36 học sinh".
  Tên học sinh có ảnh chữ cái đầu (họ + tên). Ô chưa chọn hiện số mục ("36 học sinh", "18 lớp").
- **Tự sang bước sau**: chọn Trường xong tự mở danh sách Lớp, chọn Lớp xong tự mở Họ và tên.
- Bàn phím: ↑ ↓ Enter Esc Home End, gõ chữ trên ô để tìm ngay. Điện thoại: bảng chọn thành tấm trượt từ dưới lên, chữ to.
  Chữ to (kid-mode) và giảm chuyển động được tôn trọng.
Kỹ thuật: `js/ui-select.js` + `css/ui-select.css` bọc ngoài `<select>` gốc — `<select>` vẫn giữ giá trị, code cũ (lobby-roster,
quiz-engine, main, Mã lớp gán `.value`) không đổi; bảng tự cập nhật khi option/khoá/ô cần chọn đổi. 0 Firebase, 0 Apps Script.
Đã thử trên Chrome (sáng/tối, 1530px và 390px): chọn Trường → Lớp tự mở → Họ và tên tự mở → bước 1 ✓; gõ "khoa" ra 2/36;
gán `.value` bằng code vẫn hiện đúng. Test: `node js/services/__tests__/ui-select.test.js` (18 ca).

## 10/11/2026 (2) — Điều phối / Quản trị trường chỉ đọc lớp của trường mình

Đo: mỗi nhân sự trường mở Quản lý lớp (và Dashboard điều phối) đọc **cả 150 lớp mọi trường** mỗi ngày, trong khi chỉ dùng
~4 lớp của trường mình; Quản lý lớp còn hiện lớp trường khác kèm nút Sửa/Xoá.
- `EduRepositories.class.listForSchools(schools)`: nhân sự trường → `where school in [trường được gán]` (≤ 10/truy vấn, không
  orderBy → không cần index, sắp tên ở máy); Admin → mọi lớp như cũ; chưa gán trường → 0 lớp. Dùng ở Quản lý lớp + Dashboard điều phối.
- Đo lại (điều phối 1 trường): lớp **150 → 4 lượt** mỗi lần tải; Quản lý lớp lần đầu 333 → 187, hôm sau 267 → 121.
  Giao diện: bảng Lớp chỉ còn lớp Trường 9. Admin không đổi (150 lớp).
- Test thêm 4 ca trong `js/repositories/__tests__/admin-delta.test.js`.
Còn lại: rules `classes` vẫn cho Điều phối/Quản trị trường GHI lớp của mọi trường (giao diện đã không còn hiện) — nên siết theo
`schoolId` khi cập nhật rules (docs/architecture/AUDIT-2.0.md §4); danh sách 106 giáo viên đã duyệt vẫn đọc 1 lần/ngày/người
(thu hẹp cần composite index).

## 10/11/2026 — Admin: Quản lý tài khoản + Danh mục trường chỉ đọc phần thay đổi

Đo (Firebase giả cỡ thật, 121 tài khoản, 40 trường; mở lại nhiều mốc trên cùng 1 máy):

| Admin mở lại | Trước | Sau |
|---|---|---|
| Quản lý tài khoản, tab mới / sau 15 phút | 122 lượt (đọc lại cả `users`) | **3 lượt** |
| Quản lý tài khoản, bản tra cứu trường/lớp hết hạn 12 giờ | 366 (đọc lại cả `users` kèm tra cứu) | 247 (chỉ tra cứu; `users` vẫn phần thay đổi) |
| Danh mục trường, sau 5 phút / tab mới | 41 | **1** (bản đệm 6 giờ dùng chung) |
| Danh mục trường ngay sau Quản lý tài khoản | 41 | **1** |

- `users`: bản đệm bền IndexedDB (mọi tab), đọc đủ 24 giờ/lần (bắt tài khoản bị xoá, người dùng tự đổi tên/email — rules
  không cho họ ghi `updatedAt`); giữa các lần chỉ hỏi `createdAt >` (tự đăng ký) + `updatedAt >` (Admin vừa sửa) = 2 lượt.
  Mọi lệnh ghi qua `EduRepositories.user` và 2 lô tự đồng bộ trường trên trang đóng dấu `updatedAt`.
  Đã thử: tài khoản tự đăng ký + Admin máy khác đổi vai trò → mở lại sau 2 giờ thấy cả hai, 3 lượt đọc.
  Đường phần thay đổi vẫn mồi bản đệm "giáo viên đã duyệt" (`UserRepository.primeApproved`) như khi đọc đủ: mở Quản lý lớp
  ngay sau đó không đọc lại ~106 tài khoản (đo bằng flow.py: admin-users → +2h → admin-users → roster-manager).
- `schools`: `listAll()` qua bản đệm dùng chung 6 giờ (BaseRepository cacheMs); sửa/ngừng/tạo trường trên máy này bỏ bản đệm
  ngay (`ensureFromNames` nay cũng bỏ); trường do máy Admin khác tạo hiện sau ≤ 6 giờ.
- Test: `node js/repositories/__tests__/admin-delta.test.js` (9 ca); `user-repository.test.js` cập nhật theo `updatedAt`.
Không đổi rules/index (Admin được ghi mọi field `users`/`schools`/`teaching_teachers`; truy vấn 1 trường dùng index tự động).

## 09/11/2026 (8) — Dò hạn mức Firestore toàn dự án; Lịch giảng dạy: danh sách giáo viên chỉ đọc phần thay đổi

Đo bằng Firebase giả cỡ thật (`scripts/measure-firestore/fake-firebase.js`: 3.000 HS, 120 tài khoản GV, 60 GV lịch dạy),
mở 28 trang theo vai admin / giáo viên / điều phối, mỗi trang mở lần đầu rồi mở lại sau 30 phút, 2 giờ, 1 ngày:
- Phần lớn trang: 0–2 lượt/lần mở. Trang học sinh (index, arena, trò chơi…): 0.
- Trang admin (admin-users, roster-manager, admin-schools) máy mới đọc ~3.000 HS 1 lần rồi chỉ hỏi phần thay đổi — đúng thiết kế.
- **Rò lớn nhất: Lịch giảng dạy (giáo viên mở nhiều nhất)** — bản đệm danh sách giáo viên hết hạn 1 giờ nên mở lại sau 1 giờ
  hoặc hôm sau đọc lại đủ 60 doc: **63 lượt/lần mở**. 50 GV × 3 lần/ngày ≈ 9.000 lượt/ngày (~30% ngân sách 60%).

Sửa:
- `EduScheduleReadCache.teachers()` (js/services/schedule-read-cache.js): đọc đủ 7 ngày/lần (bắt GV bị xoá), giữa các lần
  quá 1 giờ chỉ hỏi `teaching_teachers where updatedAt > mốc` (không ai sửa = 1 lượt). Dùng chung Lịch tuần, TKB, Xăng xe.
- Mọi lệnh ghi giáo viên đóng dấu `updatedAt` (EduRepositories.teachingTeacher create/update/upsert + nhập lịch từ Excel).
  Ghi ở máy này → bỏ bản đệm, đọc đủ ngay (thấy liền GV vừa thêm/sửa).
- Kết quả đo giáo viên: mở lại sau 2 giờ **63 → 4 lượt**, hôm sau **63 → 4 lượt**; mở lần đầu không đổi (253).
  Ước tính tiết kiệm ~8.000 lượt đọc/ngày. Thêm/sửa GV ở máy khác thấy sau ≤ 1 giờ; GV bị xoá hẳn có thể còn hiện ≤ 7 ngày
  ở máy khác (máy admin thấy ngay).
- Công cụ đo: Firebase giả có thêm `DocumentReference`/`CollectionReference` như SDK thật, nên đo được cả việc xoá bản đệm khi ghi.
- Test: `node js/services/__tests__/schedule-teachers-delta.test.js` (10 ca: đọc đủ, 0 lượt trong 1 giờ, phần thay đổi,
  mốc, 7 ngày, doc chưa có dấu, mất mạng, ghi ở máy này).

Còn lại (chưa sửa, chi phí thấp): admin-users mở lại sau 2 giờ đọc lại 121 tài khoản (chỉ admin); admin-schools đọc 40 trường
mỗi 5 phút (chỉ admin); điều phối mở Quản lý lớp lần đầu đọc cả 150 lớp mọi trường.
Không đổi rules/index — triển khai chỉ cần đẩy web.

## 09/11/2026 (7) — Sổ đầu bài: In/PDF có ngay tiết của bảng tuần (không cần bấm Sao chép)

Sửa: trước đây tiết chỉ vào sổ khi bấm "Sao chép để dán vào Sheet", nên mở In & xuất file thấy "Không có tiết dạy" và tên ký cũ.
- Đọc bảng tuần là lưu luôn các tiết đã qua (vắng + nhận xét) vào sổ; sửa ô vắng/nhận xét, Đổi câu cũng lưu ngay.
- In & xuất file: nút **Lấy từ bảng tuần** (dùng link đã dán ở Điền bảng tuần); tuần đang xem trống thì tự lấy 1 lần khi mở trang.
- Đầu bản in lấy theo tab tuần: dòng UBND (vd UBND XÃ BÌNH HƯNG) + tên trường đầy đủ (TRƯỜNG TIỂU HỌC PHONG PHÚ 2).
- "Từ ngày … đến ngày …" tính tới ngày dạy cuối theo Cài đặt (T2–T6 → thứ Sáu), như mẫu trường. Bản in không còn dòng
  chú thích "Bản in đúng mẫu…" và thông báo nổi.
Đã thử trên Chrome: sổ trống, tên GV Nguyễn Hoài Bảo → mở In → tự lấy 16 tiết tuần 10, ký Nguyễn Văn Hùng · Trần Văn Diện ·
Trần Hoàng Minh. 0 Firebase, 0 Apps Script.

## 09/11/2026 (6) — Sổ đầu bài: tên ký bản in lấy theo bảng tuần của trường

- Đọc tab tuần ở "Điền bảng tuần" → lấy 3 tên dưới dòng GVBM · TỔ TRƯỞNG · PHÓ HIỆU TRƯỞNG (vd Nguyễn Văn Hùng · Trần Văn Diện ·
  Trần Hoàng Minh) ghi vào Cài đặt của sổ (Giáo viên bộ môn, Tổ trưởng, Phó hiệu trưởng) → bản in PDF và Excel ký đúng 3 tên.
  Có thông báo khi tên đổi; vẫn sửa tay được ở Cài đặt (lần đọc bảng tuần sau sẽ lấy lại tên trên Sheet). 0 Firebase, 0 Apps Script.

## 09/11/2026 (5) — Điền bảng tuần: tự đọc sổ lớp của Điều phối, nhận xét theo Kiến thức cần đạt, tạo bảng tuần mới

Giáo viên thấy (so-dau-bai.html → Điền bảng tuần):
- Khung **Sổ lớp của Điều phối**: dùng luôn link sổ đã có ở trang Điểm danh (cùng trường), hoặc dán link các file
  FORM QUẢN LÝ LỚP 3/4/5 ngay tại đây (trình duyệt không đọc được thư mục Drive — chép link từng file). Bấm Đọc bảng tuần
  là đọc luôn mọi tab lớp + tab BÁO GIẢNG, không cần mở Điểm danh trước.
- **Vắng lấy thẳng từ sổ lớp** (ký hiệu V của buổi đó; bản nháp chưa ghi của Điểm danh được tính trước). Sổ lớp chưa ghi ô
  NGÀY thì khớp theo tiết PPCT.
- **Nhận xét theo "Kiến thức cần đạt"** của bài (tab BÁO GIẢNG): Ưu = 1 mục tiêu ("HS trình bày được …"), Hạn chế = mục tiêu
  khác ("Một số HS chưa phân biệt được …"); ôn tập / luyện thi / bài không có mục tiêu vẫn dùng bộ câu chung. Tab tuần ghi
  sai bài thì nhận xét theo bài sổ lớp ghi đã dạy.
- **Đối chiếu tab tuần với sổ lớp**: báo tiết ghi sai PPCT (vd 3.4 – 12/11: PPCT ghi 8, sổ lớp là tiết 12), sai bài
  (3.2 – 11/11: ghi Bài 10, sổ lớp là Bài 9), buổi sổ lớp không có; riêng 1 dòng các lớp sổ lớp chưa ghi ô NGÀY.
- **Tạo bảng tuần mới từ sổ lớp** (chọn tuần): mọi lớp có ngày dạy trong tuần → dòng A:J (ngày, lớp, tiết TKB theo tab tuần
  vừa đọc, PPCT, tên bài như BÁO GIẢNG, vắng + nhận xét nếu đã qua, GV). Sao chép → tạo bản sao tab tuần trước → bấm A9 →
  Ctrl+Shift+V; kèm dòng tiêu đề tuần + số tiết từng GV để dán. Lớp chưa có ngày dạy trong tuần được liệt kê để điền tay.

Chi phí: **0 Firestore, 0 Apps Script.** Mỗi lần đọc: tối đa 1 lượt `htmlview` mỗi sổ (nhớ 7 ngày), 1 lượt CSV mỗi tab lớp
(dùng lại bản Điểm danh nếu mới hơn 30 phút), 1 lượt tab BÁO GIẢNG mỗi sổ (nhớ 7 ngày) — đều là link công khai của Google.
Bảng lớp (có ngày sinh HS) chỉ giữ trong bộ nhớ trang, không lưu thêm; localStorage `sodaubai_solop` chỉ có danh sách tab
và Kiến thức cần đạt. Đã thử trên Chrome với 3 sổ thật của TiH Phong Phú 2: đọc 18 lớp, 13/16 tiết có vắng từ sổ lớp,
bảng tuần 11 có 16 dòng. Test: `node js/so-dau-bai/__tests__/sdb-weekly.test.js`.

## 09/11/2026 (4) — Sổ đầu bài: "Điền bảng tuần" của trường (vắng + nhận xét, sao chép dán vào Sheet)

Giáo viên thấy (so-dau-bai.html → mục mới **Điền bảng tuần**):
- Dán link tab tuần của trường ("BẢNG THEO DÕI, NHẬN XÉT…", vd tab Tuần 10) → **Đọc bảng tuần**. Trang tự chọn các tiết
  có tên mình ở cột GV (đổi được ở ô Giáo viên).
- Mỗi tiết đã qua tự có **vắng** (ưu tiên Điểm danh trên sổ lớp, rồi sổ đầu bài, rồi ô đã có trên Sheet) và **nhận xét chung**
  Ưu điểm / Hạn chế theo chủ đề PPCT của bài (ôn tập, luyện thi, giới thiệu có bộ câu riêng; vắng ≥ 3 thêm câu sĩ số).
  Các lớp cùng bài ra câu khác nhau, mở lại vẫn đúng câu cũ; nút **↻ Đổi câu**, sửa tay được.
- **Sao chép để dán vào Sheet** → bấm ô F đầu tiên (vd F9) → **Ctrl+Shift+V**. Một khối F:H; dòng của đồng nghiệp
  giữ nguyên chữ đang có lúc đọc (bấm Đọc lại trước khi sao chép nếu họ vừa điền). Đồng thời lưu các tiết vào sổ đầu bài.
- Sheet không mở công khai: trên Sheet Ctrl+A, Ctrl+C → dán cả bảng vào ô link. Không cần chia sẻ file cho ai.
- Cảnh báo khi đọc: tiêu đề "Tuần: …" không khớp ngày dạy; tiết PPCT của 1 lớp không tăng dần.
- Câu nhận xét chung sửa ở `js/so-dau-bai/nhan-xet-ic3.js`.

Chi phí: **0 Firestore, 0 Apps Script** — trình duyệt tự tải CSV từ docs.google.com (như trang Điểm danh), dữ liệu ở localStorage.
Test: `node js/so-dau-bai/__tests__/sdb-weekly.test.js`. Đã thử trên Chrome với tab Tuần 10 thật (16 tiết, vùng F9:H40).

## 09/11/2026 (3) — MOS: tải đề xong mở luôn bằng Office (không cần máy chủ trường)

Học sinh thấy (mở trang không qua máy chủ trường, vd Live Server / GitHub Pages, trên Chrome/Edge):
- Nút **"Tải đề & mở bằng Excel/PowerPoint/Word"**: trang lưu đề vào **thư mục làm bài** rồi mở ngay bằng Office,
  song song với trang / thanh làm bài thu gọn. Có nút **"Mở bằng …"** để mở lại; "Tải cả bộ đề" cũng lưu vào thư mục này.
- Lần đầu em chọn thư mục làm bài (gợi ý tạo `C:\MOS`) và dán đường dẫn của nó 1 lần (trình duyệt không cho trang biết đường dẫn).
  Đường dẫn phải **không dấu**; tên thư mục/tệp trang tạo cũng không dấu (vd `MOS Excel - Bo de Tiet 3\P1_Project_1.xlsx`).
- Office có thể hỏi "Do you trust this content?" → bấm **Yes**; thanh vàng Protected View → **Enable Editing** (đã ghi trong hướng dẫn).

Đã thử: mở bằng giao thức `ms-powerpoint:ofe|u|file:///…` với PowerPoint thật → mở được và sửa được (không chỉ đọc);
đường dẫn có dấu tiếng Việt thì không mở được (nên trang chặn). Excel/Word cùng cách, có thêm hộp hỏi "Do you trust…".
Thử tự động trên Chrome (thư mục giả OPFS, Drive giả): 17/17 bước đạt — hỏi/kiểm tra đường dẫn, lưu tệp, gửi đúng lệnh mở,
mở lại trang không hỏi lại, Ctrl+S tự chấm, tải cả bộ đề không hỏi lại thư mục, tải hỏng thì báo đúng lỗi.

Sửa kèm:
- **Lỗi cũ**: ở trang làm bài đầy đủ, mở lại / F5 trang thì Ctrl+S không còn tự chấm (vẽ trang huỷ mất việc theo dõi tệp vừa bật).
- Tải đề hỏng giữa chừng để lại tệp rỗng 0 byte, lần sau trang giữ luôn tệp rỗng đó — nay tải xong mới tạo tệp.
- Báo lỗi tải đề sai hướng ("kiểm tra định dạng .xlsx") — nay báo mất mạng / Drive tạm chặn.

Lưu ý: Google Drive tạm chặn IP khi tải dồn dập ("Sorry…", gặp khi chạy thử nhiều lần) — cả phòng máy chung 1 IP cũng có thể gặp;
phòng máy nên dùng máy chủ trường (không phụ thuộc Drive). Firebase 0, Apps Script không đổi.

## 09/11/2026 (2) — MOS: nâng cấp giao diện

Học sinh thấy:
- Trang chủ có mục **Làm tiếp**: bài thi thử chưa kết thúc (còn bao nhiêu phút, luôn đứng đầu) và các project luyện tập đang làm dở.
- Ô môn ghi **Thi thử tốt nhất**; danh sách bộ đề có thanh tiến độ "Đã làm x/y task".
- **Bảng điểm** (đổi tên thống nhất, trước lẫn lộn "Lịch sử"): lọc Thi thử / Luyện tập / theo môn, số liệu lượt làm, điểm cao nhất, trung bình, số lượt đạt.
- Trang kết quả có thẻ tóm tắt từng project ở đầu, bấm để tới chi tiết.
- Bỏ chip "Tự chấm" lặp lại ở mọi task (chỉ còn chip "Tự kiểm" ở task không chấm tự động).
- Sửa: nút đổi giao diện luôn ghi "Chế độ tối" kể cả khi đang tối (nay ghi đúng + biểu tượng mặt trời/mặt trăng);
  thanh làm bài hẹp bị bóp méo các tab task (nay cuộn ngang); nút "Task sau" gần như vô hình ở chế độ tối;
  đường kẻ hàng bảng bộ đề bị đứt ở cột nút.

Kiểm tra: chụp màn hình mọi trang ở máy tính / điện thoại 390px / chế độ tối, không tràn ngang, không lỗi JS;
11 phép thử thao tác (đổi giao diện, Làm tiếp, lọc Bảng điểm, thẻ kết quả) đạt; chạy lại thử Ctrl+S → chấm qua máy chủ đạt.
Tải hệ thống: chỉ đọc localStorage trên máy — Firebase 0, Apps Script không đổi.
Lưu ý: một lần chạy thử (dùng lại hồ sơ trình duyệt cũ) đã gửi 1 bài thi thử giả "Test · lớp 1 · Thi thử Excel · Bộ đề Tiết 3" vào tab NhatKyMOS — xoá dòng đó.
Các script thử nay chặn mọi request tới Google nên không gửi lại nữa.

## 09/11/2026 — MOS: bổ sung chấm tự động 53 task (Excel 350/354, PowerPoint 312/320, Word 243/275)

Học sinh thấy: 53 task trước ghi "Tự kiểm" nay được chấm tự động, ví dụ Inspect Document, Go To tên vùng (Excel);
3D Model Views + kích thước, crop ảnh/video, logo trên Slide Master, Cube, hiệu ứng From Bottom-Right, ghi thời gian từ trang 3,
mã hoá mật khẩu (PowerPoint); Whisp/Facet footer, Banded Quote, bộ kiểu Casual/Lines (Simple)/Minimalist/Centered,
Continue Numbering / Set Numbering Value, I. II. III., Format Painter, Convert Text to Table, xoá bình luận, Accept/Reject,
AutoFit Contents, Bevel SmartArt, chuyển SmartArt, Clear Formatting, mã hoá mật khẩu (Word).
Task chỉ kiểm được một phần có ghi chú "em tự đối chiếu" (vd đúng tên kiểu 3D view, Turntable).

Cách kiểm chứng: mỗi tiêu chí mới phải trượt trên tệp đề gốc và đạt trên tệp làm bằng Excel/PowerPoint/Word thật qua COM
(`mos/tools/fixtures-com-*.ps1`, bài mẫu ở `mos/tools/fixtures-com/`). `node mos/tools/test-rubrics.js`: 905 tiêu chí, 0 lỗi.
Không thêm được (để Tự kiểm): tệp đề đã đúng sẵn (Excel t7-p3#2, t8-p3#3; PowerPoint t4-p1#1; Word t1-p2#4, t3-p5#2, t10-p4#1),
Company bị xoá do tệp bật "xoá thông tin cá nhân khi lưu" (PowerPoint t7-p6#2, Word t10-p4#2), task trên tệp khác (Word t6-p3#1 word18.docx),
tệp đề không có tracked changes (Word t7-p4#5), thao tác chưa tạo được bài mẫu thật (Always Open Read-Only, Hide Comments, Change Picture,
bullet trong hộp văn bản Word t8-p4#4, Decrease Indent Word t4-p1#10).

Tải hệ thống: chấm vẫn chạy trên trình duyệt — Firebase 0, Apps Script không đổi.

## 08/11/2026 (3) — MOS: tải cả bộ đề, mở song song kiểu GMetrix, chấm không giật

Học sinh thấy:
- **Tải cả bộ đề vào một thư mục** (Chrome/Edge, khi mở trang không qua máy chủ trường): 1 lần chọn thư mục → mọi project
  có sẵn (`P1_…xlsx`, `P2_…`, kèm tệp dữ liệu). Mở song song bao nhiêu tệp cũng được, lưu tệp nào trang chấm tệp đó.
  Thi thử: tải bản gốc trước khi bấm Bắt đầu (đồng hồ chưa chạy). Mở lại trang chỉ cần cho phép đọc **1 lần cho cả thư mục**.
- Tệp đề tải từ Drive được giữ trong trình duyệt (Cache Storage): lần sau mở/thi lại không tải lại; đề Word tách từ bài giảng
  chỉ tải bài giảng 1 lần.
- Chấm bài chạy trong Web Worker (`mos/js/grade-worker.js`): Ctrl+S trên tệp lớn không còn làm đứng trang/thanh làm bài.
  Tệp đề gốc chỉ phân tích 1 lần mỗi project; thi thử tải sẵn tệp gốc lúc rảnh → lần chấm đầu nhanh.
- Máy chủ phòng máy: bắt đầu thi thử tạo sẵn bản làm bài cả bộ trong 1 lượt gọi → chuyển project là mở Office ngay.

Tải hệ thống:
- **Firebase: 0** (MOS không dùng Firebase). **Apps Script: không đổi** (1 lượt/bài thi thử, luyện tập không gửi).
- Máy chủ trường: theo dõi Ctrl+S gộp thành 1 request `POST /mos/api/stat` mỗi 1,5 giây cho mọi project
  (trước: 1 HEAD/project/1,5 giây — 40 em × 6 project ≈ 160 request/giây, nay ≈ 27). Project không đang mở hỏi thưa 3 lần,
  trang bị thu nhỏ thưa 4 lần.
- Drive API: mỗi tệp đề tải 1 lần/máy thay vì mỗi lần bấm.

Triển khai: chép lại `mos/` lên máy chủ trường (cần `mos/server.js` mới cho `api/stat` và tạo bản làm bài theo lô;
máy chủ cũ vẫn chạy được, trang tự quay về HEAD từng tệp).

## 08/11/2026 (2) — Mở dồn: NetSupport, nhiều tab cùng lúc, F5 liên tục, bấm nút liên tục

Đo bằng `scripts/measure-firestore/burst.py` (mới; Firestore giả có độ trễ giống thật, máy chủ tự đếm lượt nên không mất
số khi trang tải lại; `FS_BASELINE=1` = đối chứng tắt các sửa đổi dưới đây; `serve.py` thay `http.server` khi mở dồn).
- **Trang học sinh** (index, arena, portfolio, battle-quiz, live-quiz, thi-dua): 30 máy cùng mở = 0 lượt Firebase,
  0 lần gọi Apps Script — không cần sửa.
- **Nhiều tab cùng lúc** (cùng máy): bản đệm trống thì tab nào cũng tự đọc toàn bộ. Nay chỉ 1 tab đọc, tab khác đợi rồi
  lấy bản vừa lưu (`EduDataCache.exclusive`, Web Locks; tab giữ khoá bị F5/đóng thì tự nhả, chờ quá 20 giây thì tự chạy).
  Áp cho bản đệm học sinh chung, danh sách nhỏ của repository, Quản lý lớp, Dashboard điều phối/giáo viên, Lịch dạy, hồ sơ ảnh.
- **F5 liên tục**: trang mở lại trong cùng tab cách < 4 giây thì hoãn bắt đầu đọc 1,5 giây (`auth-guard.js`) — F5 dồn dập
  không tốn lượt, chỉ lần cuối đọc. Đọc toàn bộ học sinh (Admin) theo từng phần 1.000 em và lưu tiến độ
  (`EduRosterCache.pagedRead`): bị tải lại giữa chừng thì lần sau đọc tiếp, không đọc lại từ đầu.
- **Nút "Làm mới dữ liệu"** (Dashboard điều phối/giáo viên): tối đa 1 lần / 20 giây mỗi máy (tính chung các tab).

Không cần deploy rules/index/Apps Script: truy vấn theo phần (`status == active` / không lọc, sắp theo mã doc) không cần index ghép.

## 08/11/2026 — Giảm đọc trùng giữa các trang theo từng vai trò, nhiều máy cùng tài khoản

Đo bằng Firestore giả (`scripts/measure-firestore/multi.py`, nay nhận `schools` cho từng máy để thử Giáo viên / Điều phối /
Quản trị trường / Điều phối giáo viên / Admin, và in chi tiết từng truy vấn với `FS_DETAIL=1`). Ba chỗ còn đọc trùng:
- **Điều phối / Quản trị trường**: Dashboard điều phối và Quản lý lớp lấy nền của nhau theo cùng phạm vi trường
  (`EduRosterCache.scopedActiveFrom` / `seedScopedAllStatuses`). Mở Dashboard rồi Quản lý lớp: 225 → 16 lượt
  (chỉ đọc học sinh đã nghỉ + phần thay đổi); mở theo thứ tự ngược lại: Dashboard 210 → 1 lượt.
- **Admin**: Quản lý tài khoản đọc lớp qua bản đệm dùng chung 10 phút và mồi sẵn danh sách giáo viên đã duyệt từ danh sách
  tài khoản vừa đọc → mở Quản lý lớp ngay sau: 463 → 207 lượt.
- **Lịch dạy**: bảng Mã NV → tài khoản (chỉ để hiện ảnh đại diện) giữ 7 ngày thay vì 12 giờ: mỗi máy giáo viên bớt ~100
  lượt/ngày (mở lại hôm sau: 167 → 61). Admin gán Mã NV trên máy này thì bảng tự đọc lại ngay; máy khác thấy ảnh của giáo
  viên vừa liên kết sau tối đa 7 ngày (trong lúc đó hiện chữ viết tắt).

Kịch bản 7 máy (giáo viên 3 máy, admin 2, điều phối 2; có ghi xen giữa, tua +30 phút, +1 ngày): 9.124 → 8.194 lượt đọc, lượt
ghi không đổi. Đã kiểm dữ liệu: học sinh bị máy khác cho nghỉ giữa chừng vẫn hiện đúng trạng thái ở cả 2 trang.
Không cần deploy rules/index/Apps Script (truy vấn mới `status == inactive` + `school in` cùng dạng truy vấn Dashboard đang dùng).

## 07/11/2026 — Giảm lượt đọc Firebase khi Admin mở nhiều trang quản trị

Đo bằng Firestore giả (`scripts/measure-firestore/`, dữ liệu cỡ thật ~3.000 học sinh): mỗi trình duyệt chưa có bản đệm
tốn ~3.000 lượt cho lần mở trang quản trị đầu tiên; mở `Quản lý tài khoản` rồi `Quản lý lớp` trong cùng trình duyệt
tốn gấp đôi (~6.400) vì `Quản lý lớp` đọc lại cả roster. Từ bản này:
- `Quản lý lớp` (Admin) dựng nền từ bản đệm roster dùng chung + chỉ đọc học sinh đã nghỉ: ~3.260 → ~500 lượt.
- `Quản lý trường`: danh mục trường có bản đệm 5 phút theo tab (tải lại: 40 → 0 lượt).
Đo thêm nhiều máy dùng chung 1 tài khoản (`multi.py`): chi phí chỉ tăng theo số máy CHƯA có bản đệm (Admin ~3.200–3.700 lượt/máy
ở lần mở đầu, giáo viên ~280/máy); thao tác sau đó rẻ (đổi vai trò = 1 ghi, 0 đọc; sửa học sinh ở máy này, máy khác chỉ đọc đúng
doc đổi khi bản đệm hết hạn); đồng bộ `teacher_sync` giữa 3 máy hội tụ sau 2 lần ghi, không ghi qua lại.
Dùng chung danh sách nhỏ giữa các trang (`BaseRepository.list({ cacheMs })`, bản đệm 10 phút trong IndexedDB): khoá học, lớp và giáo viên
đã duyệt chỉ đọc 1 lần cho Dashboard điều phối + Quản lý lớp + Lịch dạy. Đo: điều phối mở 2 trang 660 → 403 lượt; admin cả buổi
(7 trang) 5.791 → 5.428. Mọi lệnh ghi qua repository bỏ bản đệm ngay (cả tab khác); nạp Excel/gán lớp cho giáo viên (ghi thẳng
Firestore) cũng gọi invalidate(); nút "Tải lại" luôn đọc mới. Giáo viên vừa được duyệt ở máy khác hiện sau tối đa 10 phút.
Tuỳ chọn mới, MẶC ĐỊNH TẮT: `EduBackend.adminUsers.lazyRoster` trong `js/backend-config.js`. Bật (`true`) thì mở `Quản lý tài khoản`
chỉ tốn ~370 lượt/máy (thay vì ~3.170): danh sách trường lấy từ danh mục `schools`, không tự sửa "Trường được xem" lúc mở trang;
bấm nút đồng bộ trường của 1 giáo viên mới đọc roster. Đã đo cả hai chế độ. Chỉ bật khi chấp nhận việc không tự sửa quyền xem trường.
Không cần deploy Apps Script/rules/index. Học sinh không có field `status` (doc cũ) chỉ hiện sau lần đọc toàn bộ kế tiếp.

## 05/11/2026

- **Trang chủ học sinh giao diện mới:** nền trời nhạt có bản đồ và mạng lưới, 3 vòng tròn kỹ năng số ở tiêu đề (tự vẽ, không dùng logo Certiport/IC3), 3 bước mang 3 màu xanh dương, xanh lá, cam, nút Bắt đầu màu cam, thanh trái trên màn rộng (Trang chủ, Tiến độ của em, Lịch sử bài làm). Thẻ "Kết quả của em" ở thanh trái hiện số bài, chuỗi ngày học, câu đến hạn ôn của học sinh đang chọn, đọc từ máy này. Dấu ✓ hiện lần lượt từng bước. Nhóm Bài học khoá chế độ Kiểm tra thì hiện dòng lý do ngay dưới nút. "Dành cho thầy cô" thành 1 nút ở tiêu đề. Đủ thông tin thì hiện "Cố lên nhé!". 0 lượt Firebase.
- **Trang quản lý có màn Tổng quan** cho giáo viên, Admin: số lớp, tiết tuần này, chuyên cần, buổi chưa ghi sổ, lịch tuần, học sinh cần chú ý, tiến độ các lớp, thao tác nhanh. Đọc từ sổ lớp và sổ đầu bài trên máy: 0 lượt Firebase, 0 lượt Apps Script; số liệu mới như lần cuối mở Điểm danh. Máy chưa có sổ lớp thì vẫn mở Bộ đề của tôi như cũ.
- **Trang chủ học sinh bớt nút (11 còn 5):** ngoài chỉ còn Thử thách hôm nay, Góc học tập, Đấu trường, nút **Thêm** (Đặt ngày thi, Lịch sử bài làm, Tải offline). Đã có ngày thi thì đếm ngược vẫn hiện ngoài. 5 nút của thầy cô thu vào 1 dòng "Dành cho thầy cô", bấm mới mở, để học sinh không bấm nhầm. Không bỏ chức năng nào, 0 lượt Firebase.
- Console không còn cảnh báo `enableMultiTabIndexedDbPersistence` trên các trang có Firestore (đặt mức log trước khi bật cache offline). Cache offline giữ nguyên, 0 lượt Firebase.
- **Điểm danh và Sổ đầu bài nối thành một việc, bớt nhập lại:**
  - Điểm danh có nút **Ghi sổ đầu bài**: mở khung ghi tiết với lớp, bài, danh sách vắng của buổi đó (kể cả điểm danh chưa ghi vào Sheet), chỉ cần thêm nhận xét. Lớp 2 tiết/buổi lưu xong có nút "Ghi tiết tiếp".
  - Sổ đầu bài không còn bắt buộc nhập TKB: tiết của giáo viên có ngày trên sổ lớp tự hiện ở Hôm nay và Sổ tuần (cần đúng tên trường và tên GV như trên Sheet). Sheet không có giờ học nên thẻ ghi "Sổ lớp · chưa rõ tiết", khung ghi mở sẵn ô đổi tiết.
  - Bài gợi ý lấy theo Sheet ngày đó, khớp theo "Bài N" với PPCT; danh sách lớp tự lấy khi ghi tiết đầu tiên.
  - Lịch dạy của Điểm danh báo buổi đã/chưa ghi sổ đầu bài; "Việc cần làm" thêm điểm danh nháp chưa ghi vào Sheet và buổi đã qua trong tuần chưa ghi sổ (chỉ nhắc khi thầy/cô đang dùng sổ).
  - Sổ đầu bài có nút sang Điểm danh, menu chia Hằng ngày/Thiết lập, bảng 3 bước cho sổ mới, nút **Nghỉ cả ngày**, nhắc sao lưu sau 7 ngày.
- **Sổ đầu bài tách theo trường và theo tài khoản:**
  - Dạy nhiều trường: mỗi trường 1 sổ, đổi ở ô trên cùng (trước: lớp 3.1 của 2 trường dùng chung 1 danh sách, bản in chung 1 tiêu đề). Tạo ở Cài đặt, hoặc tự tạo khi Ghi sổ từ lớp của trường chưa có sổ. Sao lưu theo từng sổ.
  - Máy dùng chung: người khác đăng nhập có sổ riêng, không thấy sổ của người trước; sổ cũ giữ nguyên. **Sổ từ bản trước chưa có chủ nên thuộc về tài khoản mở đầu tiên sau bản này.**
  - "Xóa toàn bộ" đổi thành "Xóa sổ này".
- **Sửa lỗi:**
  - Sổ đầu bài báo không lưu được khi bộ nhớ trình duyệt đầy bản CSV của Điểm danh: nay tự bỏ bản đọc cũ (đọc lại được) rồi lưu.
  - 2 tab Sổ đầu bài: tab sau không còn đè tiết tab trước vừa ghi.
  - Bấm 1 lớp ở lịch tuần mở đúng buổi đó (trước luôn nhảy về buổi hôm nay/tiếp theo).
  - Học sinh ký hiệu "Mới": có nút Mới được chọn; "Tất cả có mặt", bấm tên không đổi thành X.
  - "Tất cả có mặt" lưu 1 lần thay vì lưu lại vài MB theo từng học sinh.
  - Dùng cho Gọi tên nhận lớp khi tên trường viết khác nhau ("TiH" và "TRƯỜNG TIỂU HỌC"), dùng chung hàm với Sổ đầu bài.
- Điểm danh gọn hơn: "Sao chép cột", "Mở Sheet ở ô" chuyển vào mục "Không ghi được vào Sheet?".
- **Hạn mức:** 0 lượt Firestore, 0 lượt Apps Script thêm; mọi trao đổi giữa 2 trang qua localStorage cùng máy. Không đổi rules, index, Apps Script. **Triển khai:** chỉ cần đẩy web. Sổ đầu bài vẫn chỉ ở máy giáo viên, tên học sinh không đưa lên URL.
- **Rà soát đỉnh 3,1K đọc lúc ~0h (24 giờ: 3,1K đọc / 5 ghi / 2 xoá):** cỡ đỉnh khớp 1 lần đọc toàn bộ `students_roster` (~2.800) + khoá học/lớp/giáo viên trên 1 máy Admin, không thấy vòng lặp hay tác vụ nền nào đọc đều. Chỉ bằng ~6% trần 50.000/ngày. Bản web có đồng hồ trang nặng từ 23:48 ngày 04/11: tra tab NhatKyHoatDong, `firestore_heavy`, để biết đúng trang.
- **Bấm làm mới, cập nhật liên tục không còn đốt lượt đọc:**
  - Quản lý lớp, nút "Tải lại": bấm lại trong 3 phút không đọc gì; trong 6 giờ từ lần đọc toàn bộ chỉ hỏi phần thay đổi (cùng khoá học/lớp/giáo viên, ~300 lượt thay vì ~3.100). Quá 6 giờ mới hỏi rồi đọc toàn bộ.
  - Dashboard giáo viên, điều phối, nút "Làm mới dữ liệu": đọc toàn bộ danh sách học sinh tối đa 6 giờ/lần, còn lại chỉ hỏi phần thay đổi. Thêm/sửa vẫn thấy ngay; học sinh bị xoá hẳn hoặc chuyển đi có thể còn hiện tới 6 giờ.
  - Điều phối ở Quản lý lớp: hết hạn chỉ hỏi phần thay đổi trong trường của mình, đọc toàn bộ 3 ngày/lần (trước đọc trọn 6 giờ/lần và sau mỗi lần nạp Excel). Dùng chung index `school` + `updatedAt`, chưa deploy thì tự đọc toàn bộ như cũ.
  - Ghi bù `schoolId`: hỏi Admin trước khi đọc toàn bộ, lưu lại kết quả đã đọc; Huỷ hoặc ghi lỗi thì 7 ngày sau mới thử lại (trước: Huỷ xong lần mở sau đọc lại ~2.800 lượt).
  - Quản lý tài khoản: bản đệm 15 phút thay vì 3 phút. Tài khoản mới đăng ký ở nơi khác hiện chậm tối đa 15 phút trong tab đang mở; tải lại tab là thấy.
  - Cầu dao đọc thêm trần **15.000 lượt/máy/ngày** (`DAY_MAX_READS`, `js/firebase-config.js`). Quá trần thì truy vấn danh sách bị chặn tới khi Firebase đặt lại lượt (14-15h chiều giờ VN), trang dùng bản đã lưu; ghi không bị ảnh hưởng.
  - **Triển khai:** chỉ cần đẩy web, không đổi Apps Script hay rules. 2 index `students_roster` (`teacherId`/`school` + `updatedAt`) **chưa có trên Firebase** (đối chiếu 05/11): thiếu thì giáo viên, điều phối vẫn đọc toàn bộ.
  - **Cẩn thận khi deploy `firestore.indexes.json`:** file còn 33 `fieldOverrides` chưa lên Firebase, gồm TTL ở 7 collection (Firestore tự xoá vĩnh viễn bản ghi quá hạn, kể cả `quiz_results` cũ) và tắt index 26 trường. `firebase deploy --only firestore:indexes` áp dụng cả các mục này, cần quyết định riêng trước khi chạy nguyên file. Hướng dẫn: `docs/FIREBASE-CHECKLIST.md` §1.
  - `firestore.indexes.json` bổ sung 2 index đã có trên Firebase mà file còn thiếu (`quiz_results` theo `studentClass` + `submittedAt`, `gvlab_posts` theo `category` + `createdAt`): sau này chọn xoá index "không có trong file" không làm hỏng truy vấn của 2 collection này.

## 04/11/2026

- **Rà soát lượt Firebase toàn dự án** (đỉnh 10K đọc + 3K ghi trong 1 giờ, sau khi đẩy bản có ghi bù `schoolId`):
  - Ghi bù `schoolId`: máy Admin khác chỉ đọc 5 bản mẫu thay vì ~2.800 học sinh; hơn 300 bản ghi thì hỏi Admin trước; 2 tab không chạy đôi.
  - Danh sách học sinh ở trang Admin đọc lại toàn bộ 14 ngày/lần (trước 3 ngày): bớt ~750 lượt đọc/ngày mỗi máy Admin. Học sinh bị **xoá hẳn** ở máy khác có thể còn hiện tới 14 ngày; bấm "Tải lại" để thấy ngay. Thêm/sửa vẫn tự cập nhật.
  - Gán lớp ở Quản lý tài khoản không ghi lại học sinh không đổi (trước còn đẩy `updatedAt`, mọi máy phải đọc lại phần đó).
  - Lịch dạy: xuất nhiều tuần dùng bản đệm, tuần đã xem không đọc lại.
  - Lịch dạy: lưu lịch chỉ xoá bản đệm của đúng tuần vừa sửa (trước xoá sạch cả giáo viên + tuần cũ, tab đó đọc thẳng máy chủ tới khi đóng). Đợt lưu rồi mở Báo cáo/Xăng xe không còn đọc lại hàng trăm lượt.
  - Lịch dạy: bảng mã NV → tài khoản (chỉ để hiện ảnh đại diện) giữ 12 giờ thay vì 30 phút; gợi ý từ lịch cũ giữ 1 giờ thay vì 10 phút.
  - Hồ sơ Trang Social Media đọc lại toàn bộ 7 ngày/lần thay vì mỗi ngày (sửa hồ sơ vẫn thấy qua phần thay đổi).
  - Quản lý lớp của Điều phối: giữ danh sách 6 giờ thay vì 2 giờ. Điều phối khác sửa cùng trường thì bấm "Tải lại" để thấy ngay.
  - Lịch dạy: xuất PDF kèm tuần cuối tháng cũng dùng bản đệm.
  - **Giáo viên, Điều phối chỉ đọc phần thay đổi của danh sách học sinh:** trước đây mỗi người đọc lại cả danh sách 12 giờ/lần, nay ~1 lượt/lần và đọc toàn bộ 3 ngày/lần. Học sinh chuyển sang giáo viên/trường khác có thể còn hiện ở người cũ tới 3 ngày; "Làm mới dữ liệu" đọc toàn bộ để thấy ngay. Cần `firebase deploy --only firestore:indexes --project data-ic3` (2 index mới của `students_roster`); chưa deploy thì tự đọc như cũ.
  - **Đồng hồ trang nặng:** trang đọc vượt 500/2.000/5.000 lượt hoặc ghi vượt 300/1.000/3.000 lượt trong 1 lần mở thì tự ghi 1 dòng `firestore_heavy` vào tab `NhatKyHoatDong` (trang, người, số lượt, truy vấn tốn nhất). Lần sau có đỉnh, mở tab đó lọc `firestore_heavy` là biết ngay. 0 lượt Firebase.
  - Triển khai: đẩy web là các sửa ở trên có hiệu lực (trừ phần thay đổi của giáo viên cần index như trên); riêng đồng hồ cần deploy Apps Script `BACKEND_VERSION` 2026-11-04c (chưa deploy thì dòng nhật ký bị bỏ qua, trang không lỗi). Không đổi rules.

- **Sổ lớp dùng chung theo trường (Điểm danh).** 1 giáo viên dán link điều phối gửi, mọi giáo viên được Admin gán trường đó tự có sổ trên mọi máy.
  - Giáo viên trường khác không nhận được mã file; máy chủ chỉ cho "Ghi vào Sheet" vào sổ của trường được gán (Admin: mọi sổ).
  - Sổ dán từ trước nằm ở "Sổ chờ đưa lên trường" (thẻ Cài đặt): chọn trường, bấm "Đưa lên trường" 1 lần. Chưa đưa thì không hiện ở lịch/lớp.
  - Gỡ sổ: người đã thêm hoặc Admin. Máy dùng chung: người khác đăng nhập thì sổ và bản đọc của người trước bị xoá khỏi máy.
  - Máy mới chưa đọc lớp nào tự đọc các lớp ngay (Google CSV, không tốn Firebase).
  - Hạn mức: 0 lượt Firestore thêm; Apps Script 1 lượt/giáo viên/30 phút khi mở trang, đọc tab SoLopTruong qua bản đệm. Không đổi `firestore.rules`.
  - **Triển khai:** deploy Apps Script (`BACKEND_VERSION` 2026-11-04c) rồi đẩy web. Từ lúc deploy, giáo viên chỉ ghi được sổ đã đưa lên trường; kiểm tra `schools` của giáo viên ở trang Tài khoản trước.
- **Sổ lớp riêng tư.** Điều phối tắt được link công khai (Sheet có ngày sinh học sinh), chỉ chia sẻ cho tài khoản deploy Apps Script. Trang tự chuyển sang đọc qua Apps Script (`classSheetRead`, `classSheetInfo`), kiểm trường như khi ghi.
  - Chỉ trả tab đúng mẫu FORM QUẢN LÝ LỚP và từ chối file dữ liệu của hệ thống, vì tài khoản deploy mở được các file đó.
  - Hạn mức: sổ còn link công khai không tốn thêm gì. Sổ riêng tư: 1 lượt Apps Script/lần mở lớp, 1 lượt/sổ khi "Cập nhật tất cả", lớp đang mở đọc lại 10 phút/lần (thay vì 2 phút). 0 lượt Firestore thêm.
- Sổ đầu bài: lớp của sổ đang chờ đưa lên trường không còn hiện (trước đọc thẳng bản lưu).

## 02/11/2026

- **Dashboard Điều phối có thẻ "Câu học sinh hay sai"** (dùng chung `js/teacher/wrong-questions.js` với dashboard giáo viên).
  - Theo đúng bộ lọc Khoá học / Giáo viên / Lớp / Bài thi / Thời gian đang chọn, chỉ trong các trường được gán.
  - Bấm "Phân tích" mới gọi Apps Script `wrongStats` (đã cho vai trò Điều phối từ trước). 0 lượt Firestore.
  - "Tạo đề ôn" chép link đề từ các câu sai nhiều nhất, như ở dashboard giáo viên.
  - Không cần deploy lại Apps Script hay rules.
- CI kiểm thêm:
  - `scripts/check-html.js` (mới): trang HTML/CSS không trỏ tới file JS/CSS/ảnh/font đã xoá hoặc đổi tên; trang nào cũng có `lang`, `viewport`, `<title>`.
  - `scripts/check-js.js` kiểm cú pháp cả `mos/`, `server/`, `scripts/` (trước chỉ `js/` và `sw.js`).
  - `mos/tools/test-rubrics.js`: tiêu chí chấm MOS không "đạt sẵn" trên tệp đề gốc.
- Các trang quản lý (đăng nhập, dashboard, sổ đầu bài, lịch dạy…) có `theme-color` như trang chính: thanh trình duyệt điện thoại cùng màu.
- EduQuiz 2.0 — Sprint 0:
  - Báo cáo audit kiến trúc + bảo mật: `docs/architecture/AUDIT-2.0.md`.
  - `js/repositories/user-repository.js` (mới): mọi truy cập collection `users` của trang quản lý đi qua
    repository (trừ `js/auth.js`). Quản lý tài khoản, Quản lý lớp, Dashboard Điều phối, Lịch giảng dạy
    không đổi giao diện, không đổi số lượt đọc. Không cần deploy lại rules hay Apps Script.
  - Khi máy offline/hết lượt đọc, danh sách giáo viên báo lỗi như các danh sách khác thay vì hiện rỗng.
- **Danh mục trường + vai trò "Quản trị trường"** (EduQuiz 2.0, bước chuẩn hoá đa trường):
  - Collection mới `schools`, id = `schoolId` suy từ tên ("THCS Huỳnh Tấn Phát" → `thcs-huynh-tan-phat`,
    `js/models/school.model.js`). Trang Quản lý tài khoản tự thêm trường còn thiếu theo roster (chỉ thêm, không sửa).
  - Gán "Trường được xem" giờ ghi thêm `schoolIds` lên hồ sơ. Rules nhận bản ghi theo tên trường **hoặc**
    `schoolId` — dữ liệu cũ chỉ có tên vẫn chạy như trước.
  - Vai trò `school_admin` (Quản trị trường): Admin gán ở Quản lý tài khoản, kèm "Trường được xem". Dùng
    Dashboard Điều phối, Quản lý lớp, Báo cáo kết quả như Điều phối đào tạo nhưng chỉ trong trường được gán;
    sửa được địa chỉ/điện thoại/người liên hệ của trường mình. Không tự đăng ký được.
  - **Cần triển khai theo thứ tự:** (1) dán `apps/Code.gs` → Deploy → New version (`BACKEND_VERSION` 2026-11-02 —
    thiếu bước này `school_admin` bị Apps Script từ chối); (2) publish `firestore.rules`; (3) đẩy web.
  - Kiểm tra sau triển khai: tài khoản `school_admin` chỉ thấy học sinh/kết quả của trường được gán; Admin mở
    Quản lý tài khoản thấy collection `schools` có đủ trường trong Firebase Console.
- **Gắn `schoolId` cho học sinh và lớp** (tiếp bước chuẩn hoá đa trường):
  - Mọi lần thêm/sửa học sinh, lớp (tay, Nạp Excel, đổi giáo viên) tự ghi `schoolId` khớp tên trường.
  - Dữ liệu cũ: lần đầu **Admin** mở Quản lý lớp sau khi cập nhật, trang tự ghi bù `schoolId` cho học sinh/lớp
    còn thiếu (1 lần mỗi máy, ~1 lượt ghi/bản ghi — vài nghìn lượt, trong hạn mức 20k ghi/ngày) và báo số bản ghi.
    Không đổi `updatedAt` nên các máy khác **không** phải đọc lại danh sách học sinh.
  - Chỉ cần đẩy web — không đổi rules, không đổi Apps Script.
  - Kiểm tra: Firebase Console → `students_roster`/`classes` có field `schoolId`.
- **Kết quả bài nộp (Google Sheet) lọc theo `schoolId`:**
  - Apps Script so trường theo `schoolId` suy từ cột Trường — tên gõ khác hoa/thường/dấu cách
    (vd "THCS Lê Lợi" / "thcs  lê lợi") giờ vẫn khớp; không thêm cột, không sửa dữ liệu Sheet cũ.
  - Tài khoản chỉ có `schoolIds` (không có tên trường) vẫn xem được kết quả/roster trường mình.
  - Quản lý tài khoản cảnh báo nếu có 2 trường tên chỉ khác dấu (vd "TH Ân" / "TH An") — hai trường này
    sẽ bị coi là một, cần đổi tên cho khác hẳn.
  - **Cần triển khai:** dán `apps/Code.gs` → Deploy → New version (`BACKEND_VERSION` 2026-11-02b), rồi đẩy web.
    Không đổi rules.
- **Siết rules — đóng 2 chỗ ghi không còn ai dùng** (audit §5.3, §3):
  - `mos_submissions`: trước ai cũng ghi được không cần đăng nhập (đốt hạn mức). Web đã bỏ từ 02/11 — bài MOS
    chỉ gửi Apps Script (tab `NhatKyMOS`). Bản ghi cũ vẫn đọc được tới khi TTL tự xoá.
  - `questions` (ngân hàng câu hỏi cũ trên Firestore): giáo viên không ghi được nữa; Admin còn đọc/xoá để dọn.
  - **Cần triển khai:** `firebase deploy --only firestore:rules --project data-ic3`.

## 03/11/2026

- **Dashboard giáo viên: "Tổng quan lớp" kiểu thẻ + Giao bài · So sánh 2 đợt · Chuyên cần — 0 lượt Firebase thêm**
  (`js/teacher/insights.js`, logic thuần `js/teacher/teacher-insights-core.js` + test, `css/teacher-insights.css`):
  - **Thống kê lớp** (tổng học sinh, cần hỗ trợ < 60%, xuất sắc ≥ 85%, thanh "% học sinh đã làm bài") ·
    **Năng lực cả lớp** (vòng tròn Giỏi/Khá/TB/Yếu theo điểm TB từng em + 4 em tiêu biểu kèm nhãn Tiến bộ/Sa sút/Ổn định)
    · **Cần hỗ trợ & Xuất sắc** (3 + 3 em, nút "Xem" mở lịch sử làm bài) · **Tổng kết tiến độ** (đồng hồ Chưa làm /
    Chưa đạt / Đạt / Vượt trội). Theo đúng bộ lọc trường/lớp/bài/thời gian; sáng/tối, điện thoại.
  - **Giao bài theo lớp:** chọn đề đã soạn (Soạn đề trên cùng máy) → hạn nộp → các lớp → "Giao bài". Mỗi bài hiện
    đã nộp/sĩ số từng lớp, số em nộp muộn, điểm TB; "Chép lời giao bài" (tên đề, hạn, link) và "Chép tên chưa nộp" để
    dán nhóm lớp. Lưu trên máy (`eduquiz_assign_v1`).
  - **So sánh 2 đợt kiểm tra:** chọn đợt A/B → điểm TB từng lớp (2 thanh), chênh lệch, số em tiến bộ/sa sút (±5).
  - **Chuyên cần:** tỉ lệ có mặt từng lớp + em vắng ≥ 3 buổi / vắng liền ≥ 2, lấy từ sổ lớp trang Điểm danh đã đọc
    trên cùng máy (Google Sheet, không Firebase). Chưa có thì hướng dẫn mở Điểm danh → "Cập nhật tất cả".
  - Tính trên bài nộp dashboard đã tải + localStorage → **0 lượt đọc/ghi Firestore, 0 lượt Apps Script thêm**.
    Các phần sẵn có giữ nguyên (KPI, 6 biểu đồ, danh sách cần chú ý, câu hay sai, bảng học sinh, xuất Excel/PDF).
  - Chỉ cần đẩy web.
- **Clean Architecture — quy ước + máy kiểm tra** (`docs/architecture/CLEAN-ARCHITECTURE.md`). Người dùng không thấy khác:
  - 4 tầng gắn vào thư mục sẵn có: Domain (`js/core`, `js/models`, `*-core.js`) · Use case · Adapter
    (`js/repositories`, Apps Script, Gemini, localStorage) · Giao diện. Phụ thuộc chỉ hướng vào trong.
  - CI thêm bước `node scripts/check-architecture.js`: Domain không đụng DOM/mạng/Firebase/bộ nhớ trình duyệt;
    repository không đụng giao diện; trang không thêm lượt gọi Firestore trực tiếp (nợ cũ ghi số, chỉ được giảm).
  - Model không còn gọi `firebase.firestore.FieldValue` — đặt dấu `EduModels.SERVER_TIME`, repository đổi thành
    `serverTimestamp()`; chạy được trong Node. Ghi theo lô qua `EduBaseRepository.commitBatch` (tự chia lô 450).
  - Lịch giảng dạy (nhập lịch từ Excel, tạo tuần có sao chép lịch, lưu lịch tuần) ghi qua repository thay vì tự dựng
    `db.batch()` — số lượt ghi Firestore **không đổi**.
  - Trợ lý AI tách use case `js/services/ai-assistant.js` (luật key 2 lớp, test bằng cổng giả) khỏi adapter/giao diện
    trong `ai-service.js`. Các trang AI nạp thêm `ai-assistant.js`.
  - Test mới: `js/repositories/__tests__/base-repository.test.js`, `js/services/__tests__/ai-assistant.test.js`.
  - Chỉ cần đẩy web. Không đổi Apps Script, không đổi rules.
- **Trợ lý AI (Gemini) — 0 lượt Firebase** (theo giáo trình "Web App", phần API key Gemini: key hệ thống + key cá nhân):
  - **Học sinh — "Hỏi AI: vì sao em sai?"** ở màn xem lại bài (cả chế độ Ôn luyện): giải thích vì sao lựa chọn của em
    chưa đúng, vì sao đáp án đúng, 1 mẹo nhớ. Chỉ câu sai/bỏ trống, chỉ khi em bấm.
  - **Giáo viên — "AI soạn câu"** ở Soạn đề: chủ đề hoặc đoạn bài học → 3–15 câu (độ khó, lớp, có thể xen Đúng/Sai và
    nhiều đáp án), đổ vào hộp "Nhập nhanh" để duyệt/sửa rồi mới thêm.
  - **Giáo viên — "Gợi ý dạy lại (AI)"** trong thẻ "Câu học sinh hay sai" (dashboard giáo viên / điều phối / ic3-dashboard):
    vì sao hay sai, cách giảng lại trong 3 phút, 1 câu củng cố.
  - **Gọi tên — "AI soạn thêm câu hỏi cho bài này"**: câu hỏi miệng theo bài đang chọn, trộn vào xấp "Bốc thử thách";
    lưu trên máy (`eduquiz_goiten_ai_v1`), xoá được.
  - **Key 2 lớp:** (1) key cá nhân trong localStorage → gọi thẳng Gemini, không gửi lên máy chủ; (2) không có / hết hạn
    mức / key sai → Apps Script gọi bằng **key của trường** cất trong Script Properties (học sinh F12 không thấy);
    (3) cả 2 không được → báo lý do + nút "Cài đặt AI". Hộp "Cài đặt AI" có "Kết nối thử" trước khi lưu; Admin cài key
    trường ngay trên web (Apps Script gọi thử, sai thì không lưu).
  - **Chống hao phí:** câu lệnh do code dựng (không ai mượn key trường hỏi việc khác); lời giải lưu đệm trên máy + 6 giờ ở
    máy chủ (nhiều em hỏi cùng câu → 1 lượt Gemini); trần 30 lượt/máy học sinh/ngày, 150/tài khoản giáo viên/ngày,
    800 lượt/ngày cả trường (đổi được). Không gửi tên học sinh. Lượt học sinh **không đọc Firestore** (đã test).
  - Mã: `js/services/ai-core.js` (+ test), `js/services/ai-service.js`, `css/ai-assist.css`, `apps/src/78-ai.gs`
    (câu lệnh giống hệt bản web — `apps/__tests__/code-gs.test.js` so 2 bản).
  - **Cần triển khai:** (1) dán `apps/Code.gs` → Deploy → New version (`BACKEND_VERSION` 2026-11-03c);
    (2) đẩy web; (3) Admin mở Soạn đề hoặc dashboard → bấm "AI soạn câu"/"Gợi ý dạy lại" → "Cài đặt AI" → "Key hệ thống
    của trường" → dán key từ aistudio.google.com/apikey → "Kiểm tra & lưu". Chưa cài key trường thì ai có key cá nhân
    vẫn dùng được. Không cần sửa rules.
- **Gọi tên: thẻ "Chia nhóm" + đọc to tên** (`goi-ten.html`):
  - Chọn 2–8 nhóm, tuỳ chọn mỗi nhóm 1 nhóm trưởng ngẫu nhiên (★). Chỉ chia các bạn có mặt; nhóm lệch nhau tối đa 1 bạn.
  - "Gọi một nhóm": đèn chạy qua các nhóm rồi dừng ở 1 nhóm. "Sao chép kết quả" để dán vào Zalo/Word.
  - Kết quả chia nhóm lưu theo từng danh sách trong localStorage (`eduquiz_goiten_v1`); "Xoá hết tên" xoá luôn nhóm của danh sách dán.
  - Tuỳ chọn "Đọc to tên người được gọi" (giọng có sẵn trên máy qua Web Speech; không có giọng Việt thì dùng giọng mặc định).
  - 0 Firebase / Apps Script. Test: `js/name-picker/__tests__/name-picker-core.test.js` (`makeGroups`). Chỉ cần đẩy web.
- **Gọi tên: 17 trò (thêm 6) + kịch tính hơn ở mọi trò** (`js/name-picker/np-games-extra.js`, tranh SVG tự vẽ):
  - Trò mới: **Ong tìm hoa** (tới 40 bạn) · **Mèo bắt chuột** · **Thả diều** (gió lớn giữa chừng) · **Sút luân lưu**
    (thủ môn bắt, trúng cột, dội xà... bàn thắng vàng ở cú cuối) · **Đèn xanh đèn đỏ** (đèn đỏ cuối rơi đúng lúc hết giờ) ·
    **Bịt mắt bắt dê** (dưới gốc đa). Đều có Lật kèo và "Mỗi lượt đổi trò ngẫu nhiên".
  - Mọi trò dùng khung "người bắt": vòng ngắm đỏ nhấp nháy dưới chân bạn sắp bị bắt; máy quay cận cảnh lúc bắt thật
    (tắt khi máy bật "giảm chuyển động"); 3 giây cuối có 2 dải đen kiểu phim.
  - Đã chạy thử trên Chrome cả 6 trò mới + Trộm trứng, Đèn pin, Thẻ đỏ, UFO: đủ lượt, hiện khung tên, không lỗi console.
  - 0 Firebase / Apps Script. Chỉ cần đẩy web.
- **Tranh "3D": nhân vật có khối** (Gọi tên + Đấu trường + mọi trang dùng `np-art.js`):
  - Đầu, tóc, bóng bay, trứng, cá… đổ sáng/tối kiểu khối cầu; áo, tay chân, tên lửa, hộp quà kiểu khối trụ — ánh sáng
    từ trên-trái, cảnh nền có thêm vệt nắng. Gradient dùng chung gắn 1 lần vào trang (`#npShadeDefs`), không dùng filter
    → máy chiếu yếu vẫn mượt.
  - Gọi tên: phối cảnh xa–gần (bạn đứng xa nhỏ hơn) và bóng đổ mềm dưới chân; trò xếp làn (Đua, Tên lửa, Diều) giữ cỡ đều.
  - Tranh 6 trò thêm tách sang `js/name-picker/np-art-extra.js` (Đấu trường dùng chung sân bóng, thủ môn, quả bóng).
- **Đấu trường: chế độ mới "⚽ Sút luân lưu"** (Chơi một mình — chưa có ở phòng giáo viên):
  - Mỗi câu đúng = 1 quả penalty; trả lời càng nhanh càng dễ vào (50% sát giờ → 95% tức thì); đúng liền 3 câu =
    "cú sút sấm sét" chắc chắn vào; sai = mất lượt sút. Nhiều bàn nhất thắng (bằng bàn → ít cú sút hơn).
  - Sân khấu: khung thành có thủ môn nhún nhảy; mỗi cú sút của em và bạn máy diễn lần lượt — vào lưới, thủ môn cản phá,
    trúng cột, dội xà, vọt xà. Bảng xếp hạng hiện số cú sút và tỉ lệ vào; thẻ chọn chế độ có tranh bìa riêng.
  - Logic thuần `C.penaltyKick` / `C.kickOrder` + test trong `js/arena/__tests__/arena-core.test.js`.
  - 0 Firebase / Apps Script. Chỉ cần đẩy web.

- **Rà soát hạn mức Firebase + Apps Script** (sửa trước khi triển khai đợt này):
  - Quản lý lớp — ghi bù `schoolId`: máy Admin thứ hai trở đi dùng bản đệm delta (không thấy `schoolId` vừa ghi
    bù vì cố ý không đổi `updatedAt`) nên sẽ ghi lại **toàn bộ** ~2.800 học sinh (~2.800 lượt ghi mỗi máy).
    Nay máy nào thấy học sinh "thiếu" `schoolId` trong bản đệm thì đọc lại toàn bộ 1 lần (~2.800 lượt đọc)
    và chỉ ghi bản ghi thật sự thiếu.
  - Danh mục trường: Quản lý tài khoản không đọc lại cả collection `schools` mỗi lần tải danh sách trường —
    chỉ đọc khi roster có trường máy này chưa thấy.
  - Chấm lại trên máy chủ: bài có câu ngoài ngân hàng không còn làm Apps Script tải lại file khối (~1 MB,
    UrlFetch ~20.000 lượt/ngày) cho **mỗi** bài nộp — tối đa 1 lần/10 phút/file khối.
  - Đã rà: Apps Script xác thực nhớ 1 giờ; nhật ký gộp lặp; sảnh mã lớp nhớ trên máy + bản đệm 10 phút trên
    máy chủ; `firestore.rules` chỉ tốn 1 lượt đọc hồ sơ/request; trang Danh mục trường đọc vài chục lượt.
- **ic3-dashboard → tab Báo cáo có thẻ "Câu học sinh hay sai"** (như 2 dashboard kia, theo bộ lọc Lớp / Bài thi /
  Khoảng thời gian). Bấm "Phân tích" mới gọi Apps Script `wrongStats`; 0 lượt Firestore. CSS của thẻ tách ra
  `css/wrong-questions.css` dùng chung 3 trang. Chỉ cần đẩy web.
- **Bảng xếp hạng "Thử thách hôm nay" cho cả lớp** (0 Firebase, 0 Apps Script):
  - Học sinh đã chọn tên ở sảnh: "Chép kết quả" chép thêm dòng `Mã cho thầy cô: EQR1…` (cùng định dạng mã kết quả
    bài làm). Chỉ lượt đầu trong ngày (lượt tính điểm) có mã; mã cũng nằm trong danh sách kết quả đã lưu trên máy em.
  - Giáo viên bôi đen cả đoạn chat nhóm lớp → dán vào **Gom kết quả** → mục mới "Bảng xếp hạng Thử thách hôm nay":
    mỗi đề (số thử thách + cấp độ) 1 bảng, mỗi em giữ lượt cao nhất, bằng điểm thì ai nhanh hơn xếp trên; theo bộ
    lọc lớp; nút **Trình chiếu** toàn màn hình. Dán trùng không tính 2 lần (mã cố định theo ngày + cấp độ + học sinh).
  - Mã kết quả có thêm trường tuỳ chọn `pt` (điểm tốc độ). Mã cũ và mã bài làm thường không đổi.
  - Lưu ý như mọi mã kết quả: chỉ bắt lỗi chép, không chống tự dựng mã giả — đây là trò thi đua, không phải điểm thi.
  - Chỉ cần đẩy web.
- **Sảnh "Mã lớp" chịu được cả trường vào cùng lúc** (Apps Script `rosterByCode`, chế độ `class-code`):
  - Trước: bản đệm mỗi mã chỉ 10 phút; hết hạn thì MỖI lượt nhập mã mở file Sheet (~1–2 giây). Đầu giờ vài lớp cùng
    nhập mã có thể chiếm hết 30 lượt chạy song song của Apps Script → bài nộp của lớp khác bị từ chối đúng lúc đó.
  - Nay: "Cập nhật cho học sinh" nạp sẵn bản đệm mọi lớp (6 giờ — tối đa của CacheService); hết hạn thì 1 lượt đọc
    Sheet nạp lại cả bảng; mã gõ sai nhớ 10 phút (không mở Sheet lại). Test: 45 lượt nhập mã sau khi đẩy roster =
    0 lần mở Sheet; bản đệm hết hạn = 1 lần.
  - Triển khai cùng `apps/Code.gs` đợt 2026-11-03b (chưa dán thì chưa có tác dụng, không lỗi).
- **"Nhiệm vụ hôm nay" theo mùa thi** ở sảnh, ngay dưới đếm ngược (khi đã có ngày thi):
  - Còn hơn 14 ngày: bài nên làm tiếp trong Lộ trình của chính em + nhịp cần đạt (bài/tuần) để kịp nước rút; nhịp
    quá dày (> 5 bài/tuần) thì nhắc tăng tốc. 4–14 ngày: 1 bài Tổng hợp chế độ Kiểm tra mỗi ngày. 1–3 ngày: ôn Sổ tay
    câu sai. Ngày thi: không giao bài. Đạt cả lộ trình: Tổng hợp để giữ phong độ.
  - "Làm ngay" chọn sẵn bài (nước rút: bật luôn chế độ Kiểm tra), em tự bấm Bắt đầu. Làm xong hiện "đã xong".
  - Chỉ đọc lịch sử trên máy + danh mục đề đã tải — đã đo trên Chrome: 0 request Firebase / Apps Script.
    Chỉ cần đẩy web.
- **Dashboard giáo viên: 3 thẻ mới + nút nhắc bài** (theo đúng bộ lọc Trường / Lớp / Bài / Thời gian):
  - **Tiến bộ rõ / Đang sa sút:** so điểm TB các bài gần đây với các bài trước đó của từng em (từ 3 bài, chênh
    ≥ 10 điểm), vd "48% → 85% · +37". Bài bị cảnh báo sửa điểm không được tính.
  - **Bài nộp cần xem lại:** điểm gửi lên khác điểm máy chủ chấm (khi bật `serverGrading: 'verify'`), rời trang làm
    bài ≥ 3 lần, hoặc điểm ≥ 80% mà dưới 4 giây/câu. Ghi rõ lý do; chỉ là gợi ý để hỏi lại học sinh.
  - **"Chép danh sách"** ở thẻ Học sinh chưa làm bài: chép tên theo từng lớp (kèm tên bài nếu đang lọc) để dán
    nhắc trong nhóm lớp.
  - Tính trên bài nộp dashboard đã tải — 0 lượt đọc Firestore / Apps Script thêm, không đổi rules. Chỉ cần đẩy web.
  - **Bấm vào tên** ở mọi thẻ danh sách (chưa làm bài, cần hỗ trợ, xuất sắc, tiến bộ, sa sút, cần xem lại) → mở
    chi tiết lịch sử làm bài của em đó, như nút "Xem" ở bảng học sinh (dùng được bằng bàn phím: Tab + Enter).
    Chi phí như nút "Xem": chỉ khi bấm, bài của cả lớp tải 1 lần rồi nhớ lại cho các em cùng lớp.
- **Trang mới "Thi đua lớp học"** (`thi-dua.html` — sảnh → Dành cho thầy cô; nút cúp ở trang Gọi tên). Dùng trên máy
  chiếu trong giờ học, không cần đăng nhập:
  - **Bảng điểm:** mỗi lớp thầy cô dạy 1 bảng riêng. Bấm tên (hoặc Cả lớp / 1 tổ) rồi bấm tiêu chí thưởng / nhắc nhở;
    Hoàn tác (Ctrl+Z); "Ngôi sao tuần này" và hoạt động gần đây.
  - **Thi đua tổ:** xếp theo điểm TB mỗi em (tổ đông không tự thắng), cộng/trừ cả tổ.
  - **Đổi quà:** trừ vào điểm còn lại, KHÔNG trừ điểm thi đua (em vẫn giữ hạng); không đủ điểm thì báo rõ.
  - **Công cụ:** đo tiếng ồn bằng micro (chỉ đo âm lượng trên máy, không ghi âm; ẩn tab là tự tắt micro) với ngưỡng
    nhắc chỉnh được; đồng hồ đếm ngược (6 mốc nhanh, đếm 5 giây cuối, báo hết giờ). Nút toàn màn hình / phím F.
  - **Cài đặt:** thêm/xoá học sinh, đổi tổ, chia lại tổ, sửa tiêu chí và phần thưởng; xuất CSV; sao lưu / khôi phục
    mọi lớp (.json); bắt đầu đợt thi đua mới.
  - Danh sách học sinh: dán từ Excel/Word/Zalo (cùng bộ tách tên với Gọi tên) hoặc chọn lớp có sẵn.
  - Dữ liệu chỉ ở localStorage máy giáo viên (`eduquiz_thidua_v1`) — đã đo trên Chrome: 0 request Firebase /
    Apps Script, 0 request ra ngoài. Test: `js/thi-dua/__tests__/thi-dua-core.test.js`. Chỉ cần đẩy web.
  - Ý tưởng lấy từ app GVCN "Lớp học hạnh phúc"; viết lại theo cấu trúc dự án và cho giáo viên dạy nhiều lớp.
  - **Thẻ "Hoa điểm 10" — nối kết quả IC3 với điểm thi đua:** "Lấy từ trang Gom kết quả" đọc thẳng các mã kết quả
    giáo viên đã gom trên cùng trình duyệt (hoặc dán mã). Bài 100%: +3 điểm và lên bảng Hoa điểm 10; từ 90%: +2.
    - Xem trước trước khi cộng: số bài / điểm sẽ cộng, bài đã nhập, bài dưới mốc, tên không khớp bảng.
    - Chỉ nhận bài của **lớp ghi trong mã** (tự đoán theo tên bảng, đổi được) — 2 em trùng họ tên ở 2 lớp không bị
      cộng nhầm. Bỏ qua mã "Thử thách hôm nay".
    - Mỗi bài chỉ cộng 1 lần (nhớ mã bài, cả sau sao lưu/khôi phục và sau "Bắt đầu đợt thi đua mới").
    - Bảng vinh danh: số bài điểm 10 của từng em, bài gần nhất; trình chiếu toàn màn hình.
    - 0 Firebase / Apps Script (đã đo trên Chrome). Chỉ cần đẩy web.
  - **Lớp chủ nhiệm (GVCN) và lớp bộ môn (GVBM):** chọn loại lớp khi tạo bảng (đổi được ở Cài đặt; bảng cũ mặc định
    là lớp bộ môn, không mất dữ liệu).
    - Mỗi loại 1 bộ tiêu chí dùng chung: bộ môn = học tập trong giờ (như trước); chủ nhiệm = nề nếp (đi học muộn,
      đồng phục, bài tập về nhà, trực nhật, phong trào…). Sửa ở Cài đặt.
    - Lớp chủ nhiệm: **tổ trực nhật tuần này** trên Bảng điểm, tự xoay vòng mỗi thứ Hai; "Đổi tổ" để dời lượt.
  - **Thẻ "Sơ kết tuần"** (tuần này / tuần trước): tổ trong tuần, tuyên dương, cần nhắc nhở (bị trừ từ 2 điểm), ghi
    nhận nhiều nhất.
    - "Chép tin nhắn sơ kết cho lớp" — dán nhóm lớp; KHÔNG nêu tên em bị nhắc nhở (nhắc riêng).
    - Lớp chủ nhiệm: **tin nhắn riêng cho từng phụ huynh** nêu đúng việc được khen / cần nhắc trong tuần + điểm tích
      luỹ + chữ ký giáo viên; Chép từng em hoặc Chép tất cả.
    - Lớp bộ môn: **so sánh các lớp bộ môn** trong tuần (em được khen, điểm cộng/trừ, TB/em), không lẫn lớp chủ nhiệm.
  - Tạo lớp mới thì mở thẳng Bảng điểm.
- **File Excel từ Dashboard giáo viên và Dashboard Điều phối** có thêm 2 sheet (chỉ khi có dữ liệu):
  "Tiến bộ & sa sút" (điểm TB trước → gần đây, chênh lệch tô xanh/đỏ) và "Bài nộp cần xem lại" (giờ nộp, bài,
  điểm, lý do). Tính trên dữ liệu đã tải — 0 lượt đọc thêm.

- **Nhật ký thao tác Quản lý tài khoản** (audit log — kế hoạch 2.0 §VI.2):
  - Đổi vai trò (ghi cả vai trò cũ → mới), duyệt tài khoản, gán/đồng bộ "Trường được xem", gán lớp đang dạy,
    liên kết Mã NV, nhập giáo viên từ Excel (chỉ số lượng — không ghi email/CCCD/mật khẩu) → tab
    `NhatKyHoatDong` trên Google Sheet, hành động `update_user`, chi tiết ở cột ChiTiet (`userAction`).
  - Ai làm lấy từ tài khoản đã xác thực trên Apps Script, không tin tên web gửi lên. 0 lượt Firebase.
  - **Cần triển khai:** dán `apps/Code.gs` → Deploy → New version (`BACKEND_VERSION` 2026-11-03), rồi đẩy web.
    Thiếu bước Apps Script thì nhật ký `update_user` bị từ chối (thao tác tài khoản vẫn chạy bình thường).
- **Trang mới "Danh mục trường"** (`admin-schools.html`, menu Trang quản lý → Danh mục trường):
  - Admin: mọi trường, số học sinh đang học từng trường (từ bản đệm roster dùng chung), đổi trạng thái
    Đang hoạt động / Ngừng (chỉ đánh dấu, không xoá dữ liệu).
  - Quản trị trường: chỉ trường được gán; sửa địa chỉ, điện thoại, người liên hệ, ghi chú.
  - Không đổi tên trường ở đây — tên vẫn là khoá nối roster, Sheet kết quả và quyền.
  - Mọi lần sửa ghi nhật ký `update_school` (tab `NhatKyHoatDong`).
  - Rules: Quản trị trường sửa được trường của mình theo tên **hoặc** `schoolId`.
  - Triển khai cùng đợt trên (Apps Script 2026-11-03 + rules + web).
- **Dashboard Điều phối: thẻ "So sánh giữa các trường"** (kế hoạch 2.0 §VII.3):
  - Mỗi trường: số học sinh, số em đã làm bài, % tham gia, lượt nộp, điểm TB, tỷ lệ đạt (≥ 70%), sắp theo điểm TB.
  - Theo đúng bộ lọc đang chọn; chỉ hiện khi phạm vi xem có từ 2 trường (Admin, Điều phối nhiều trường).
  - Tên trường gõ lệch giữa danh sách và bài nộp vẫn gộp đúng 1 trường (theo `schoolId`).
  - File Excel xuất từ dashboard có thêm sheet "So sánh trường" (cùng điều kiện ≥ 2 trường, tô màu cột Điểm TB).
  - Tính trên dữ liệu dashboard đã tải — 0 lượt Firebase/Apps Script thêm. Chỉ cần đẩy web.
- **Kiểm thử phân quyền trên Firestore emulator** (kế hoạch 2.0 TEST-01/TEST-02): `tests/firestore-rules/`
  chạy `firestore.rules` thật — 23 tình huống: không truy cập chéo trường, không tự nâng quyền / tự gán
  trường, Quản trị trường, chuyển tiếp tên → `schoolId`, chỉ Admin sửa điểm, `schools`, `mos_submissions`,
  `questions`. CI: job **rules** (Node 24 + Java 21, project giả `demo-ic3` — không đụng Firebase thật).
  Chạy tay: `cd tests/firestore-rules && npm install && npm test` (cần Java 21).
- Quản lý tài khoản tự ghi bù `schoolIds` cho mọi tài khoản đã có "Trường được xem" (Điều phối/Quản trị
  trường gán trước 02/11/2026 chưa có) — chuẩn bị siết rules ghi roster theo `schoolId`.
- **Chế độ "Mã lớp" cho sảnh làm bài** (sẵn sàng, **mặc định TẮT** — chưa đổi gì với học sinh):
  - Vì sao: `data/roster/students-active.json` công khai tên 2.838 học sinh (audit §5.1).
  - Bật: `js/backend-config.js` → `roster: { mode: 'class-code' }`. Khi đó:
    - Quản lý lớp → "Cập nhật cho học sinh": KHÔNG đẩy tên lên file công khai; Apps Script cấp mỗi lớp 1 mã
      6 ký tự (giữ nguyên mã cũ khi đẩy lại), lưu tab `MaLop`, trang tải file `ma-lop-<ngày>.csv` để phát.
    - Sảnh: học sinh nhập mã lớp → thấy tên ĐÚNG lớp đó (Trường/Lớp tự điền). Máy nhớ lớp vừa mở (mở lại
      trang / mất mạng vẫn chọn được tên).
  - Quy trình đề xuất: (1) triển khai Apps Script 2026-11-03b; (2) bật `class-code`, bấm "Cập nhật cho học sinh",
    phát mã cho giáo viên; (3) khi các lớp đã quen, gỡ `data/roster/students-active.json` và dọn lịch sử git —
    bước này không hoàn tác được, làm khi đã chốt. "Gọi tên" khi đó dùng "Dán danh sách".
  - **Cần triển khai:** dán `apps/Code.gs` → New version (`BACKEND_VERSION` 2026-11-03b), rồi đẩy web.
- **Luật chấm điểm dùng chung web ↔ Apps Script** (bước 0 của chấm điểm phía máy chủ —
  `docs/architecture/SERVER-GRADING.md`):
  - Luật chấm 10 loại câu tách khỏi `js/quiz-engine.js` sang `js/core/grading.js` (quiz-engine gọi lại);
    bản Apps Script `apps/src/77-grading.gs` (chưa route nào dùng).
  - Kiểm chứng: so hàm chấm CŨ với bản mới trên 4.005 câu / 12.614 trường hợp (đúng, bỏ trống, sai lệch 1 chỗ)
    — kết quả + dữ liệu xem lại bài trùng khớp 100%; test CI so bản Apps Script với bản web trên cùng bộ đó
    và kiểm mọi câu trong ngân hàng được chấm đúng với chính đáp án của nó.
  - Học sinh không thấy khác biệt. Chỉ cần đẩy web (Apps Script đi cùng đợt 2026-11-03b).
- **Chấm lại bài Kiểm tra trên máy chủ** (bước 1, **mặc định TẮT**): `js/backend-config.js` →
  `serverGrading: { mode: 'verify' }`. Bài Kiểm tra (đề ngân hàng) gửi kèm câu trả lời; Apps Script chấm lại,
  ghi điểm máy chủ vào ChiTiet và gắn ⚠️ "Điểm gửi lên … khác điểm máy chủ chấm …" nếu học sinh sửa điểm.
  Lỗi tải đề không làm mất bài. Chi tiết + cách đọc cột: `docs/architecture/SERVER-GRADING.md` §5.
  Lưu ý: chặn được sửa điểm, CHƯA chặn được đọc đáp án (đề vẫn công khai) — đó là bước 2.
- An toàn khi cập nhật: nếu máy học sinh dùng trang HTML cũ trong bản lưu (Service Worker, mạng chậm) cùng
  `quiz-engine.js` mới, trang tự nạp bộ chấm `js/core/grading.js`; bấm Nộp bài lúc bộ chấm chưa tải xong thì
  bài KHÔNG bị khoá — báo "bấm Nộp bài lại sau vài giây". Dựng câu trả lời cho máy chủ lỗi → bài vẫn nộp.
  Test: `js/core/__tests__/grading-guard.test.js`.

## 01/11/2026

- **Giao diện làm bài mới cho học sinh cấp 1, 2** (`css/quiz-play.css`, chỉ áp dụng ở màn làm bài).
  - Thẻ viền đậm có bóng cứng, nền giấy kem chấm bi. Không dùng gradient hay hiệu ứng phát sáng.
  - Ô "Câu x/y" và thanh tiến độ sọc. Danh sách câu là thẻ nổi, câu đang làm có vòng xanh.
  - Đáp án là nút to, nhấn xuống khi bấm. Câu phân loại tô màu đầu từng nhóm. Nút "Câu tiếp" màu vàng.
  - Chế độ tối và giao diện điện thoại đều đã kiểm tra. Chế độ "Chữ to" vẫn giữ kiểu chọn đáp án riêng.
  - Câu "Bấm vào hình": ảnh rộng hết thẻ theo đúng tỉ lệ ảnh, không còn bị ép co theo chiều cao màn hình.
    Trước đây trên màn thấp ảnh chỉ còn vài chục px, học sinh phải phóng to mới bấm được.
    Ảnh minh hoạ của các câu khác cũng được hiển thị to hơn.
  - Thanh nút cố định ở đáy: Câu trước · Đánh dấu · Kiểm tra đáp án · Câu tiếp luôn ở cùng một chỗ, không bị cuộn mất.
    Kết quả kiểm tra hiện cuối thẻ, trang tự cuộn tới. Trên điện thoại, nút phụ chỉ còn biểu tượng.
  - Câu "Bấm vào hình" tự co ảnh vừa phần trống phía trên thanh nút: thấy trọn ảnh và các nút cùng lúc, không phải cuộn.
  - Responsive theo cả chiều cao: màn thấp (laptop 1366×768, máy chiếu) tự thu gọn phần đầu trang.
    Máy tính bảng dọc dùng dải số câu cuộn ngang như điện thoại. Điện thoại xoay ngang bỏ hàng tiến độ.
    Thanh nút tự gọn theo bề rộng thật của khu câu hỏi. Đã đo ở 11 cỡ màn hình, không tràn ngang.
  - Câu chọn điền có 2–5 lựa chọn ngắn (Có/Không, Đúng/Sai…) hiện thẳng các nút bấm, không còn dropdown che dòng bên dưới.
    Gần như toàn bộ 296 câu chọn điền thuộc dạng này. Câu có lựa chọn dài vẫn dùng dropdown, nhưng ô to và viền rõ hơn.
  - Câu nhiều dòng (Đúng/Sai, chọn từng dòng, chọn/kéo điền, nối, phân loại): thanh nút đáy báo "Còn N dòng chưa chọn".
    Bấm vào chip thì trang cuộn tới dòng còn thiếu và nháy viền dòng đó.
    Bấm "Câu tiếp" khi mới làm dở một câu thì có nhắc một lần; bấm lần nữa thì đi tiếp.
  - Nút trợ năng nằm trong hàng "Câu x/y" khi đang làm bài, không còn đè lên đáp án.
  - Vừa một khung hình, không phải cuộn: đáp án ngắn (≤ 70 ký tự) xếp 2 cột khi khu câu hỏi đủ rộng.
    Đáp án rất ngắn (vd Crop/Trim) giữ 2 cột cả trên điện thoại. Màn thấp ẩn nhãn "Một lựa chọn" để nhường chỗ.
    Đã đo: màn 1535×650, 1366×657, 1920×960, máy tính bảng và điện thoại dọc đều thấy đủ câu hỏi và 4 đáp án.
  - Chú thích "Đã làm / Đánh dấu / Chưa làm" có kèm số đếm, nằm dính ở đầu danh sách câu.
    Danh sách tự cuộn tới câu đang làm. Nút "Quay lại trang chọn bài" lên thanh trên cùng, thành nút "Chọn bài khác".
  - Câu Sắp xếp thứ tự: có tay nắm kéo-thả, dùng được cả chuột và cảm ứng. Mũi tên lên/xuống vẫn giữ, hàng gọn hơn.
    Câu 6 bước vừa một màn hình 1535×700. Gợi ý chung trong dữ liệu được thay bằng một câu ngắn khớp với nút trên màn hình.
  - Gọn chữ: dòng gợi ý thành dải mỏng. Bỏ dòng đếm "Đã điền 1/4" vì đã trùng với chip "Còn N dòng".
    Khu câu hỏi hẹp (điện thoại): đề bài dùng hết bề ngang, ô số và nhãn dạng câu nằm chung một hàng.
  - Bỏ nhãn dạng câu ("Nối cột", "Một lựa chọn"…) và mọi dòng gợi ý chữ trên tất cả dạng câu, để học sinh đỡ rối mắt.
    Chip ở thanh đáy thay cho các dòng đó, ví dụ "Chọn 2 đáp án", "Bấm 3 chỗ đúng trên hình", "Còn 4 mục chưa nối".
    Lúc mới vào câu chip màu trung tính, chỉ chuyển đỏ khi đã làm dở.
  - Giao diện tự chỉ cách làm: bấm chọn 1 thẻ hoặc 1 ô thì mọi chỗ còn trống để đặt vào sáng viền xanh nét đứt.
    Áp dụng cho phân loại, kéo điền, nối trên ảnh và nối 2 cột.
  - Nối 2 cột: ô phải đã nối có màu "đã nối" (trước đây trông như bị khoá), đường nối dày và rõ cả ở nền tối.
    Trên điện thoại, cột mô tả rộng hơn cột đáp án.
  - Không thêm lệnh Firebase/Apps Script nào. Chỉ thêm 1 file CSS (~33 KB, chưa nén), không thêm ảnh hay font.
- **Máy chủ trường bằng Docker** (`Dockerfile`, `docker-compose.yml`, `server/`). Hướng dẫn ở [docs/DOCKER.md](docs/DOCKER.md).
  - Một container phát cả dự án qua LAN. MOS chạy ở `/mos/`.
  - Bài nộp được ghi vào hàng đợi trên đĩa rồi gửi Apps Script theo lô.
  - Trên GitHub Pages trang vẫn chạy như cũ.
- Apps Script `2026-11-01` có thêm `submitBatch`: 1 lượt chạy ghi tới 100 bài.
  - Route này chỉ bật khi Script Properties có `RELAY_TOKEN`.
  - Triển khai: đặt `RELAY_TOKEN` → dán `apps/Code.gs` → New version → đặt `GAS_RELAY_TOKEN` trong `.env` của máy chủ.
  - Chưa làm các bước này thì máy chủ gửi từng bài.
- Tệp đề MOS Word (~21 MB trên git) và bài mẫu Word được đưa khỏi git, giống PowerPoint.
  - Từ nay các tệp này chỉ phát qua máy chủ trường.
  - Sinh lại bằng `mos/tools/build_catalog.py`.
  - Trên GitHub Pages, đề Word báo "tệp đề chưa có trên máy chủ này".
- Máy chủ trường **tự cập nhật trang từ GitHub** mỗi 10 phút (`server/sync.js`).
  - Chỉ tải tệp đã đổi. Không có commit mới thì không tốn hạn mức API.
  - Câu hỏi hoặc danh sách học sinh admin vừa đẩy lên GitHub có trên máy chủ trường mà không cần build lại.
  - Tắt bằng `SITE_SYNC_MIN=0`.
- `submitBatch` mở Sheet một lần cho cả lô, thay vì mở lại cho mỗi bài.
- **Nén ảnh trước khi đẩy lên GitHub** (`js/services/image-compress.js`, trang Quản lý ảnh).
  - Ảnh tải lên được thu cạnh dài về ≤ 1600 px và chuyển sang WebP trước khi nhúng hoặc đẩy.
  - Lý do: 92 MB trong ~142 MB lịch sử git là các bản ảnh cũ chưa nén, và lịch sử giữ mọi ảnh đã commit mãi mãi.
  - GIF, SVG, và ảnh nén không bớt được ≥ 10% thì giữ nguyên ảnh gốc.
- **77 ảnh PNG trong `img/` chuyển sang WebP** (9,2 MB → 3,0 MB) bằng `scripts/convert-images-webp.py`.
  - Đường dẫn trong 104 tệp (`data/ic3`, css, trang) đã được sửa theo.
  - Không phát sinh đường dẫn gãy mới. 77 ảnh đều mở được trên Chrome.
  - Giữ PNG cho: icon PWA, 2 ảnh trùng tên, và 26 ảnh nén bớt < 15%.
- `scripts/shrink-git-history.py` dọn bản cũ của ảnh/tệp đề khỏi lịch sử git trên một bản sao riêng.
  - Đo thử: 146 MB → 46 MB, bản mới nhất giữ nguyên.
  - Script không tự đẩy. Force-push do người quản lý repo tự chạy, rồi mọi máy clone lại.
- Có `/api/status` (hàng đợi + đồng bộ). Workflow `docker-publish.yml` đẩy ảnh lên GHCR để trường khác chỉ cần `docker compose pull`.

## 31/10/2026

- **Bộ "Theo chủ đề" đối chiếu với `IC3 Review_All.docx`** (cột "Bài" của từng câu → chủ đề theo PPCT 2026-2027):
  chuyển 117 câu về đúng chủ đề ở 6 cấp, ghi lý do + nguồn từng câu trong `data/ic3/topic-reassign.json`. Chỉ chuyển khi
  PPCT của Bài và đề chứa câu trong file Word cùng chỉ một chủ đề (hoặc giáo viên ghi rõ "CDn"). Không thêm/bỏ câu nào,
  bộ "Bài N" giữ nguyên, không trùng câu. Bộ Ôn tập/Kiểm tra sinh lại theo chủ đề mới.
- `scripts/build-allkey-map.py`: khi hoà điểm (đề bài chung "Em hãy di chuyển từng thuật ngữ...") ưu tiên câu trùng nhiều
  chữ hơn — sửa 11 câu All Key trước đây bị ghép nhầm sang câu khác (bộ Ôn tập lấy đúng câu hơn).

- **Sổ đầu bài** (`so-dau-bai.html`, chỉ giáo viên/admin; lối vào ở Trang quản lý và Điểm danh): ghi tiết dạy,
  học sinh vắng (P/K), nhận xét, thời khóa biểu, tiến độ PPCT, in/xuất Excel. Mục Học sinh có nút
  **"Lấy từ dữ liệu trường"**: lấy lớp + học sinh từ sổ lớp Điều phối đã đọc ở Điểm danh (có mã HS, ngày sinh,
  bỏ học sinh nghỉ luôn) hoặc danh sách học sinh của hệ thống — không phải nhập lại.
  Tiết đã ghi hôm nay có nút **Gọi tên**: mở Gọi tên đúng lớp, bỏ qua bạn vắng, câu hỏi theo bài vừa dạy.
- Dữ liệu sổ chỉ nằm trên máy (localStorage) + file sao lưu: **0 lượt Firebase, 0 lượt Apps Script**
  (ngoài lượt đọc hồ sơ đăng nhập đã lưu đệm như mọi trang giáo viên). Không cần deploy Apps Script/rules.
  Ai đã dùng bản Sổ đầu bài riêng trước đây: "Tải bản sao lưu" ở bản cũ → "Khôi phục từ bản sao lưu" ở trang mới.
- **Điểm danh 1 lần**: ghi tiết mới trong Sổ đầu bài tự điền học sinh vắng từ Điểm danh (cùng lớp, cùng ngày,
  tính cả điểm danh chưa ghi vào Sheet), có dòng ghi rõ lấy lúc nào; bấm tên để sửa.
- **Menu Trang quản lý** gom thành 3 nhóm: Đề & kết quả · Lớp học · Khác; tên mục ngắn lại.
- **Sổ đầu bài cùng giao diện web**: nút navy phẳng, sáng/tối dùng chung công tắc với các trang khác, có Đăng xuất.

## 30/10/2026

- **Đấu trường gọn còn 3 thẻ vai**: Học sinh · Giáo viên · Chơi một mình. "Chơi một mình" có công tắc
  **Hành trình IC3 | Đấu tự do**, nhớ lựa chọn lần trước (mặc định Hành trình). `?vai=minigame` / `?vai=solo` vẫn dùng được.
- **Học sinh**: thẻ vào phòng đặt trên cảnh lớp học vẽ tay (bỏ nền tím loang và các hình bay), viền mực cùng kiểu
  bản đồ; thêm nút "Chưa có mã phòng? Chơi Hành trình IC3 trong lúc chờ" (ẩn khi mở bằng link phòng).
- **Giáo viên**: thanh dính đáy tóm tắt phòng sắp tạo (bộ câu · chế độ · số câu · giây · sĩ số) + nút Tạo phòng,
  khỏi cuộn xuống cuối trang; ô "Dùng gần đây" (4 bộ câu đã tạo phòng/vào trận) để dạy nhiều lớp cùng bài;
  thẻ chế độ 4 cột, tranh thấp hơn. Cách tạo phòng không đổi (WebRTC, Firebase chỉ cho đường dự phòng như cũ).
- **Hành trình IC3** (Đấu trường, vai thứ 4 — `arena.html?vai=minigame`): ghép Chơi một mình và Mini-game
  thành 1 bản đồ 7 vùng theo 7 chủ đề IC3 + Trùm cuối. Mỗi vùng 1 trận quiz 10 câu đúng bộ "Theo chủ đề"
  (mỗi vùng 1 chế độ: Tốc độ, Đua về đích, Săn vàng, Câu cá, Kéo co, Đấu phép, Sinh tồn; Trùm cuối: Diệt Virus
  trộn 7 chủ đề); 5 mini-game nằm ở vùng cùng chủ đề. Sao 1–3 mỗi chặng (quiz theo tỉ lệ đúng, mini-game theo
  mốc thang đối thủ), rương vùng +20 xu / rương vàng +30 xu, 5 danh hiệu theo tổng sao, 3 nhiệm vụ mỗi ngày
  (+10 xu). Bản đồ riêng cho từng cấp Spark/IC3. Không khoá chặng; ảnh đại diện đứng ở chặng gợi ý.
  Mỗi vùng có cảnh nền riêng; màn kết thúc trận và bảng kết quả mini-game hiện sao bật lần lượt + "Về bản đồ".
  Chơi một mình có lối vào bản đồ. Logic: `js/arena/arena-quest-core.js` (có test), giao diện `js/arena/arena-quest.js`.
  0 lượt Firebase/Apps Script; lưu trong hồ sơ biệt danh trên máy.
- Bỏ phần không dùng: Thi thử MOS (Beta, mỗi môn 1 bài mẫu) cùng 4 thư mục engine, trò Phân loại thần tốc
  (đã gỡ khỏi menu), băng chuyền 3D cũ và ~380 dòng CSS của nó, 6 ảnh chủ đề không còn hiện, tài liệu LMAP cũ.
- Trang học sinh dễ đọc hơn (giữ kiểu phần mềm thi): chữ phụ tối thiểu ~14px, nhãn chữ thường thay chữ hoa nhỏ,
  đáp án A/B/C/D to rõ; sửa các chỗ tương phản thấp (dòng nhắc dưới nút Bắt đầu, nút Bắt đầu khi chưa đủ thông tin,
  nút Nộp bài, nhãn "Bài làm hợp lệ", số câu bỏ qua). Nút Đấu trường dùng icon, bỏ nhãn "Kahoot · Blooket";
  nút Thực hành MOS ghi tiếng Việt.
- Nộp bài trống (chưa trả lời câu nào) không còn được XP, huy hiệu và chuỗi ngày.
- Báo cáo kết quả: tài khoản Điều phối không còn bị Firestore từ chối khi báo cáo đọc từ Firestore.
- Lịch giảng dạy: giáo viên tự nhập lịch không còn hỏng cả lượt khi tuần đã được người khác tạo.
- Tài liệu: giữ Anonymous Auth bật; bỏ hướng dẫn App Check cũ.
- Mini-game chuyển vào Đấu trường (`arena.html?vai=minigame`): 5 chặng theo thứ tự học IC3,
  đối thủ máy theo hạng, xu thưởng (tối đa 120 xu/ngày). Bỏ Khu Vui Chơi và khoá 90% ở trang chủ.
- Dọn mã: bỏ emoji, nhãn nội bộ và ghi chú về quá trình làm trong chú thích; rút gọn chú thích
  `firestore.rules` và các trang HTML (luật, markup, code không đổi); trang quản trị thay emoji
  còn sót bằng icon. Nhật ký này rút gọn — bản chi tiết cũ xem lịch sử git.

## 29/10/2026

- Danh sách học sinh chỉ tải phần thay đổi (`updatedAt`), đọc lại toàn bộ 3 ngày/lần.
- Điểm danh: link sổ lớp lưu lên tài khoản (`teacher_sync/{uid}`); sửa lỗi có thể gửi bản trống đè link.
- Cài đặt hệ thống: sao lưu/khôi phục bộ đề, thông tin phiên bản; giáo viên cũng xem được.
- Báo cáo kết quả: bản đệm tách theo tài khoản (trước đó điều phối dùng chung máy có thể thấy bài trường khác).
- Màn làm bài: báo đúng câu còn trống/đánh dấu trước khi nộp; làm quá nhanh không tính XP.
- Bớt lượt Apps Script (chi tiết học sinh tải 1 lần cho cả lớp, nhật ký đăng nhập 6 giờ/lần).
- Icon và font tự lưu trong `lib/` (trang học sinh lần đầu 731 KB → 459 KB).
- Hồ sơ đăng nhập dùng chung giữa các tab trên máy cá nhân.
- Lưu mà không sửa gì: không ghi Firestore/Apps Script (danh sách lớp, tài khoản, lịch dạy, điểm danh).

## 28/10/2026

- Điểm danh & tiến độ đọc sổ lớp Google Sheet của Điều phối: nhiều trường, nhiều lớp, ghi thẳng vào Sheet,
  bảng công tháng, tin nhắn báo vắng; chia 4 thẻ.
- Gọi tên: "Bốc thử thách" theo bài hôm nay và khối lớp.
- Giao diện quản trị phẳng hơn, icon thay emoji.

## 26–27/10/2026

- Đấu trường: Phòng cả lớp kiểu gameshow, đường dự phòng qua Firestore cho học sinh khác mạng,
  giới hạn chỗ dự phòng theo phòng, "Đấu lại câu sai", câu sai vào Sổ tay ôn tập.
- Giáo viên tự nhập lịch của mình từ file Excel tổ.
- Apps Script bỏ khoá chung khi nộp bài (nhiều lớp nộp cùng lúc không xếp hàng); cảnh báo khi bản chạy thật cũ hơn web.
- Chống đốt hạn mức: cầu dao đọc 6.000 lượt/10 phút mỗi máy, siết rules, TTL cho `arena_relay`.
- Soạn đề theo nguồn (All Key / theo bài / ngoài All Key), báo câu trùng gần giống.
- Sửa: tự đăng xuất khi đang làm; "Tổng quan" lịch dạy hiện tiết cũ sau khi sửa.

## 23–25/10/2026

- Tài liệu năm học: xem slide bài giảng từ Google Drive.
- Ngân hàng câu hỏi đủ 830/830 câu All Key; tách 3 nhóm bộ câu (Bài học · Chủ đề · Ôn tập/Kiểm tra theo PPCT).
- Trình chỉnh vùng bấm (`hotspot-editor.html`) mở thẳng từ dự án.
- Gọi tên học sinh (`goi-ten.html`) với 11 trò có tranh minh hoạ.
- Đấu trường: 10 chế độ chơi một mình, 4 chế độ cả lớp, thẻ bài, Linh vật.
- Giao diện phẳng kiểu phần mềm thi; chế độ Chữ to cho tiểu học; Thử thách hôm nay.
- Soạn đề: hoàn tác, in nhiều mã đề, xuất Word, nhập từ Excel.
- Bản đệm danh sách học sinh dùng chung cho 4 trang quản lý.

## 10/2026 (trước 23/10)

- Bài nộp chỉ lưu Google Sheet; trang học sinh không dùng Firebase. Dashboard đọc kết quả từ Sheet.
- Backend gom về Apps Script + Firebase; mọi API Apps Script cần ID token (trừ nộp bài).
- Phòng thi P2P, cài như ứng dụng (PWA), trang gom kết quả chạy offline.
- "Câu cả lớp hay sai" tổng hợp trên Sheet.
- Đối chiếu ngân hàng câu hỏi với đáp án All Key; bộ "Theo chủ đề" bám PPCT.
- Lộ trình học thích ứng, giấy chứng nhận, thi đua lớp theo tuần, thẻ ghi nhớ.
- CI kiểm tra dữ liệu, cú pháp, unit test (`.github/workflows/ci.yml`).
- Rà soát bảo mật: đóng đọc công khai `questions`, bắt buộc `limit()` cho query danh sách, TTL bài nộp 45 ngày.

## Trước 10/2026

- Tổ chức lại thư mục (`js/`, `css/`, `data/ic3/` theo khối), tải câu hỏi theo khối.
- Câu nối cột bấm trực tiếp trên ảnh; ảnh câu hỏi nén nhẹ.
- Dashboard điều phối/giáo viên, quản lý danh sách học sinh, xuất Excel/PDF.
- Mô phỏng Word/Excel/PowerPoint, Thực hành MOS chấm trong trình duyệt.
