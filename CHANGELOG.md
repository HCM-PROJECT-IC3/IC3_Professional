# EduQuiz — Ghi chú nâng cấp (Tháng 7/2026)

## CI tự kiểm tra + lộ trình phát triển (10/2026)

- **`.github/workflows/ci.yml`** (GitHub Actions, mỗi lần push `main` / Pull Request — chỉ kiểm tra, không deploy, không Firebase): `scripts/validate-data.js` (ngân hàng `data/ic3`: JSON hỏng, file thiếu, đáp án đúng không có trong lựa chọn, uid trùng trong minitest, thiếu ảnh, dạng câu lạ... → chặn; số câu meta lệch, chưa có giải thích → cảnh báo) + `scripts/check-js.js` (cú pháp 133 file JS, kể cả ES module) + 7 unit test mô phỏng Word/Excel/PowerPoint. Hiện tại: 6.071 câu / 324 file minitest / 604 ảnh hợp lệ, 133/133 JS, 7/7 test.
- **`docs/ROADMAP-PHAT-TRIEN.md`**: việc cần làm theo từng ngưỡng tăng trưởng (học sinh/ngày, phòng trực tiếp, phân tích câu sai, đồng bộ nhiều thiết bị, đa đơn vị, ngân hàng lớn, lưu trữ dài hạn), chi phí Firebase ước lượng và file cần sửa.

## Dọn dự án nhẹ hơn, chống lag/mất mạng, mục tiêu tuần (10/2026)

**Nhẹ hơn (~5,6 MB):**
- Gỡ `quiz_data.json` (3 MB, bản gộp cũ 04/09 — lỗi thời so với `data/ic3`). Trang làm bài không còn dự phòng tải file này (lỗi meta.json → DEMO_DATA như trước).
- **Phòng thử thách** (`live-quiz.js`) trước đây tải nguyên `quiz_data.json` 3 MB mỗi lần tạo phòng và dùng câu hỏi cũ → giờ chỉ tải đúng file chủ đề nhỏ trong `data/ic3/minitests` (1 chủ đề = 6 file; "Tổng hợp" = 42 file, 452 câu không trùng uid; chủ đề ít nhất 23 câu ≥ 15 câu/phòng).
- Ảnh động màn chờ/từ chối: GIF → WebP động (`loading` 512 KB → 121 KB, `404` 1,37 MB → 424 KB); trang đăng nhập chỉ tải ảnh 404 khi đăng nhập lỗi (trước đây tải 1,3 MB mỗi lần mở).
- 10 ảnh câu hỏi > 1000px thu về 1000px (giữ tỉ lệ → toạ độ % câu "chọn vùng" không đổi; cùng tên file), 3,0 MB → 2,0 MB, đã so chất lượng bằng mắt. Ảnh khác giữ nguyên (lượng tử màu làm xấu ảnh chụp).
- Gỡ file không còn dùng: `data/manual_review/*` (đã gộp), 4 script chỉ chạy trên `quiz_data.json` (`split-quiz-data.py`, `merge_hotspot_questions.py`, `add_hotspot_distractors.py`, `generate_explanations.py`), `tkb-import/*.xlsx` (file nhập TKB 1 lần, chứa tên/lịch giáo viên thật — đang công khai trên GitHub Pages). Tất cả còn trong lịch sử git.

**Bền hơn:** `sw.js` + `js/sw-register.js` (nạp ở `index.html`, `login.html`, `ic3-dashboard.html`) — chỉ xử lý GET cùng tên miền (Firebase/Google/CDN đi thẳng mạng, 0 lượt Firebase thêm). HTML/JS/CSS/JSON: mạng trước, mạng chậm > 4 s (trang) / 2,5 s (file) hoặc mất mạng → dùng bản lưu; ảnh: hiện bản lưu ngay rồi cập nhật ngầm (≤ 400 file). Đo: mất mạng hẳn vẫn mở trang với dữ liệu thật và làm được bài đã mở; mạng 8 s/file → trang hiện sau ~9 s. Đổi `CACHE_VERSION` trong `sw.js` để xoá bản lưu cũ trên mọi máy.

**Hứng thú hơn:** *Mục tiêu tuần* trong Góc học tập (3/5/7/10 bài/tuần, thanh tiến độ ở Góc học tập + ngay trên nút ở sảnh, chúc mừng khi đạt) — `localStorage` `eduquiz_goals_v1`.

## Trình chiếu lớp học, thẻ ghi nhớ, giao bài có hạn nộp (10/2026) — 0 lượt Firebase

- **Trình chiếu lớp học** (Soạn đề → "Trình chiếu", `js/exam-builder.js` § TRÌNH CHIẾU): chiếu đề toàn màn hình kiểu Kahoot, chữ to cho máy chiếu, đếm ngược 10/20/30/60 giây hoặc không giới hạn (hết giờ tự hiện đáp án), 0–6 nhóm thi đua đặt tên được, giáo viên cộng điểm nhóm trả lời đúng (bấm hoặc phím 1–6), Space = hiện đáp án / câu sau, bảng xếp hạng cuối + chơi lại. Thay cho phòng "Chơi trực tiếp" khi hạn mức ghi Firebase đã gần hết — ghi chú ở `docs/FIREBASE-CHECKLIST.md` § 6; thông báo hết lượt ở `live-quiz.js` gợi ý dùng Trình chiếu.
- **Thẻ ghi nhớ** (Góc học tập → Sổ tay câu sai → "Thẻ ghi nhớ"): lật thẻ câu hỏi ↔ đáp án + giải thích cho mọi dạng câu (trắc nghiệm, đúng/sai, nối, sắp xếp, phân loại, điền...), tự đánh giá "Đã nhớ"/"Chưa nhớ" (phím Space, 1, 2) → cập nhật hộp Leitner như khi ôn bằng bài làm.
- **Giao bài có hạn nộp** (Cài đặt đề → "Hạn nộp"): hạn nằm trong link (`custom-exam-codec.js`, trường `h` tính bằng phút); trang làm bài hiện hạn, quá hạn vẫn làm được nhưng tên bài thêm "(nộp muộn)" → giáo viên thấy ngay trong Báo cáo kết quả. Thẻ đề trên carousel hiện hạn.

## Góc học tập cho học sinh + sửa tràn ngang trên điện thoại (10/2026)

- **Góc học tập** (`js/learning-hub.js`, `css/learning-hub.css`, nút ở sảnh `index.html` kèm số câu đến hạn): 3 tab — *Tổng quan* (số bài, điểm TB 10 bài gần nhất, chuỗi ngày học, biểu đồ xu hướng SVG, gợi ý hôm nay), *Theo bài* (TB 3 lần gần nhất, xu hướng ↑↓, yếu → vững, "Ôn ngay" chọn sẵn đúng bài qua `window.lobbySelectMinitest`), *Sổ tay câu sai* (tự gom câu sai qua mọi bài, hộp Leitner 1→4: ngay / 1 / 3 / 7 ngày → thuộc; sai lại về hộp 1; tối đa 200 câu/học sinh). Tách theo Họ tên + Lớp + Trường (máy trường dùng chung). 0 lượt Firebase — localStorage `eduquiz_wrongbook_v1`.
- **`quiz-engine.js`:** phát sự kiện `edu:exam-graded` sau khi chấm; `startWrongbookReview()` (phiên ôn không tính điểm, như "Luyện lại câu sai": không ghi lịch sử/XP/Sheet/Firestore); lịch sử máy lưu thêm `catId`/`levelId`/`mtKey`.
- **Tràn ngang trên điện thoại (390px):** `ic3-dashboard.html` 101px → 0 (thanh trên chỉ còn icon "Xem trang học sinh", nền trang trí `#section-my-sets::before`), `login.html` 39px → 0 (`html { overflow-x: clip }`), `image-manager.html` 138px → 0 (select bộ lọc). Đã quét 21 trang, đều 0px.

## Soạn đề từ ngân hàng câu hỏi + nhập lịch Excel tiết kiệm lượt (10/2026)

- **Soạn đề** (`ic3-dashboard.html` tab mới, `js/exam-builder.js`, `css/exam-builder.css`): duyệt `data/ic3` theo Chương trình → Cấp độ → Bài/Tiết/Chủ đề, xem đáp án + giải thích, thêm từng câu / ngẫu nhiên N câu / ma trận đề (chia đều, không trùng uid), sắp xếp kéo-thả, thời gian Kiểm tra, trộn câu, in đề (có/không đáp án). Lưu thành bộ đề trên carousel (localStorage `ic3_custom_sets`, bản nháp `ic3_exam_builder_draft`); nút "Tạo bộ đề mới" → "Soạn đề mới", tạo bằng link ngoài vẫn còn.
- **Soạn đề kiểu Kahoot** (viết lại `js/exam-builder.js` + `css/exam-builder.css`): danh sách câu bên trái (kéo thả, nhân bản, xoá, phím ↑↓/Alt+↑↓), khung soạn giữa với ô đáp án 6 màu + hình, ảnh minh hoạ (tải lên tự nén ≤ ~30KB / dán Ctrl+V / kéo thả / link https), giải thích; bảng phải đổi dạng câu + tình trạng đề (câu lỗi, số câu chơi trực tiếp được, độ dài link). 5 dạng tự soạn: trắc nghiệm, nhiều đáp án, Đúng/Sai, sắp xếp, nối cặp. Cài đặt đề (tên, mô tả, màu bìa + biểu tượng, cấp học, thời gian, trộn câu), Xem trước kiểu Kahoot, Nhập nhanh từ văn bản (`*` = đáp án đúng), câu ngân hàng → "Chuyển thành câu tự soạn", Mở đề từ link (sửa trên máy khác).
- **Chơi trực tiếp** (`live-quiz.html?de=...`): phòng thi đấu dùng đề tự soạn (câu 1 đáp án / Đúng-Sai, 5–15 câu). Không đổi `firestore.rules`, số lượt Firebase như phòng thường.
- **Link v2** (`js/custom-exam-codec.js`): nén deflate, chứa cả câu tự soạn; link v1 cũ vẫn mở được. Câu tự soạn được escape khi mở rộng cho trang làm bài, ảnh chỉ nhận https/`img/`/data:image.
- **Link làm bài** `index.html?de=...` (`js/custom-exam-codec.js`): link chứa tham chiếu câu (minitest + uid), trang làm bài tải file tĩnh, khoá Chương trình/Cấp độ/thời gian theo đề. **0 lượt đọc/ghi Firestore** cho soạn/mở đề; kết quả vẫn vào `quiz_results` như bài thường.
- **Nhập lịch từ Excel** (`teaching-schedule.js`): chọn tuần cần nhập (mặc định tuần mới + hiện tại), so với dữ liệu hiện có rồi chỉ ghi document thay đổi, hiện ô TKB lớp khác Excel *trước* khi ghi (1 lần ghi, bỏ nút ghi đè riêng), cập nhật màn hình tại chỗ thay vì `loadEverything()`.

## 0000000. Rà soát bảo mật/hạn mức theo `docs/AUDIT-PROMPT.md` (10/2026)

⚠️ Chỉ đổi `firestore.rules` — phải **publish** (`firebase deploy --only firestore:rules --project data-ic3`).

- **Thêm `docs/AUDIT-PROMPT.md`:** prompt kiểm tra chuẩn hoá 3 mảng (bảo mật, lượt đọc/ghi Firebase, UX/UI) kèm bối cảnh dự án, tiêu chí mức độ và mẫu báo cáo — dùng lại mỗi đợt deploy.
- **`questions`:** bỏ đọc công khai (không trang nào còn dùng; trước đây ai cầm apiKey cũng kéo được ~1.100 doc/lần).
- **`gvlab_posts` / `likes` / `comments` / `gvlab_certs`:** query danh sách công khai bắt buộc `limit` (50 / 200 / 200 / 100 — client dùng 12 / — / 200 / 60). `likes` chỉ editor ghi, đúng schema `{createdAt}` (trước đây mọi tài khoản kể cả Anonymous Auth của live-quiz ghi được dữ liệu tuỳ ý). `comments` giới hạn field + 300 ký tự; bài đăng giới hạn caption 500 ký tự; `likeCount` chỉ đổi ±1/lần.
- **`gvlab_chat`:** tính năng đã gỡ khỏi `portfolio.js` → đóng ghi; admin vẫn đọc/xoá để dọn dữ liệu cũ.
- **`quiz_results` / `mos_submissions`:** `expireAt` phải < 400 ngày tới (chặn né TTL để chiếm dung lượng 1 GiB).
- **`courses` / `classes` / 6 collection `teaching_*`:** query danh sách bắt buộc `limit ≤ 10.000` (client đã luôn có limit).
- **A11y:** thêm `aria-label` cho 3 nút chỉ có icon (menu + đóng modal ở `ic3-dashboard.html`, đóng Lịch sử ở `index.html`).

## 000000. Hạn mức Spark cho hàng nghìn học sinh/ngày (10/2026)

⚠️ Phải publish `firestore.rules` + `firestore.indexes.json` cùng lúc deploy code — xem `docs/FIREBASE-CHECKLIST.md` § 1.

- **Phòng thử thách** (`live-quiz.js`): mỗi câu chỉ ghi document phòng 1 lần (lần chốt câu i mang luôn câu i+1 + `phaseAt` giờ máy chủ; máy học sinh tự mở câu sau màn đáp án). Rules câu trả lời bỏ `get()`/`exists()` (2 lượt đọc/câu trả lời) — người dẫn tự kiểm tra người chơi, câu, khung giờ theo giờ máy chủ. 1 listener câu trả lời cả ván; ngừng nghe trước khi xoá; xoá phòng theo id đã biết (không đọc để xoá); học sinh ngừng nghe khi ván xong; tự đóng khi hết hạn; tối đa 60 người/phòng; `expiresAt` trên `players`/`answers` cho TTL. Đo 1 host + 6 HS × 5 câu: 160 → 101 lượt đọc (chưa kể rules); 40 HS × 20 câu ≈ 4.500 → 1.870.
- **Bài nộp** (`firestore-results.js`, `mos-submissions.js`, `pending-sync-queue.js`): mã document tạo ở máy (`EduFirebase.createOnce`) → gửi lại không tạo bài trùng; chờ quá 20 giây (hết lượt ghi/mất mạng) thì vào hàng đợi; hàng đợi **không bỏ bài** sau 8 lần thử nữa (giữ tới 30 ngày). TTL `quiz_results` 365 → **45 ngày** (dung lượng 1 GiB), thêm TTL `mos_submissions`.
- **Dashboard:** cache tải tăng dần giữ 7 ngày (trước 12 giờ → mỗi ngày đọc lại 1.000–10.000 bài); roster giữ 12 giờ ("Làm mới" chỉ đọc lại roster khi bản lưu > 30 phút); giáo viên 1 trường chỉ đọc bài của lớp mình (`studentClass in`); hết lượt/mất mạng → dùng bản lưu kể cả quá hạn, có thông báo; `fromCache` không còn bị lưu nhầm thành dữ liệu rỗng. Báo cáo IC3: xoá bài cập nhật luôn cache.
- **Rules:** query danh sách `quiz_results`/`students_roster`/`mos_submissions` bắt buộc `limit ≤ 10.000`, `users` ≤ 1.000, `gvlab_profiles` ≤ 500; thêm `limit()` cho mọi query còn thiếu. `firestore.indexes.json`: tắt index field không lọc (~5,3 → ~1,9 KB/bài) + khai báo 5 TTL policy; thêm `firebase.json`.
- **Giám sát:** console in `[trang] N lượt đọc Firestore — <nguồn>` mỗi lần tải dữ liệu (`EduFirebase.countReads/countSnap`).

## 00000. Trang làm bài: luyện lại câu sai, kết quả theo chủ đề, phím tắt (0 lượt Firebase thêm)

- **🔁 Luyện lại N câu sai** ở màn kết quả: mở phiên Ôn luyện chỉ gồm các câu sai/bỏ qua (xáo lại đáp án, có "Kiểm tra đáp án", không đếm giờ). Phiên này **không** ghi Firestore, Google Sheet, lịch sử hay XP và không autosave — bài thật vẫn chỉ ghi đúng 1 lần lúc nộp. Làm xong có thể luyện tiếp phần còn sai; về sảnh trả lại chế độ Ôn luyện/Kiểm tra đã chọn.
- **📊 Kết quả theo chủ đề** (bài Tổng hợp): đúng/tổng từng chủ đề, xếp chủ đề yếu nhất lên đầu, gợi ý chủ đề nên ôn (< 70%). Câu bài Tổng hợp được gắn `_topic` lúc trộn.
- **Phím tắt khi làm bài:** ← → chuyển câu, 1–9 / A–E chọn đáp án (câu 1 hoặc nhiều đáp án), F gắn cờ; không chạy khi đang gõ chữ, đang mở ảnh phóng to/mini-game. Gợi ý hiện 1 lần trên máy có chuột.

## 0000. Quản lý câu hỏi: sửa thẳng data/ic3 (đủ 6.071 mục), bỏ Firestore

- **Vì sao trang chỉ hiện 1.102 câu:** collection Firestore `questions` được nhập 1 lần từ `quiz_data.json` cũ (04/09, 3.160 mục) với id = `uid`; các bản chép cùng uid (Tiết 1–8 dùng lại câu của chủ đề) bị gộp → 1.102 doc. Mọi câu thêm sau đó (Spark, Bài 1–35, MOS) không có trên Firestore, trong khi `data/ic3/` (học sinh dùng) có 6.071 mục / 4.013 câu khác nhau.
- **Rủi ro đã chặn:** nút "📤 Xuất ra data/ic3" cũ đẩy bản Firestore đó **đè** lên `data/ic3/` → học sinh mất phần lớn câu hỏi. Nút cũng không ghi `data/ic3/minitests/*.json` (file quiz-engine ưu tiên tải) nên câu đã sửa có thể không tới học sinh.
- `image-manager.js` viết lại phần dữ liệu: đọc thẳng `data/ic3/` (qua GitHub API nếu có token → luôn mới nhất), **0 lượt đọc/ghi Firestore**. Sửa/thêm/xoá/gắn ảnh lưu **bản nháp** IndexedDB (F5/đóng tab vẫn còn). "🚀 Đẩy thay đổi cho học sinh" chỉ commit file thật sự đổi (khối, minitest tách nhỏ, manifest, `meta.json` + version mới, ảnh "file riêng" vào `img/`), định dạng giống hệt file cũ; **từ chối đẩy** nếu GitHub đã đổi kể từ lúc mở trang. Sửa 1 câu cập nhật luôn các bản chép cùng uid trong khối. Thống kê hiện số mục + số câu khác nhau.
- `github-publish.js`: sửa lỗi tràn stack khi mã hoá file ~1MB (mọi lần đẩy data/ic3 trước đây đều rơi về tải zip); thêm `fetchRaw`, `gitBlobSha`, kiểm tra `expectedShas`, hỗ trợ file nhị phân.
- Bỏ `js/services/collection-sync-service.js` (không còn dùng). Collection Firestore `questions` không còn trang nào đọc — có thể xoá trong Console khi muốn.

## 000. Sửa cache bị tràn — nguyên nhân các đỉnh 4K–6K lượt đọc/giờ

- **Quản lý câu hỏi** (`image-manager.js`): ngân hàng ~6.071 câu (~5 triệu ký tự) vượt trần ~5 triệu ký tự của sessionStorage → cache ghi hỏng âm thầm → **mỗi lần mở trang đọc lại ~6.071 lượt** (khớp đỉnh 6K). Giờ giữ bản sao IndexedDB + đồng bộ delta theo `updatedAt` (`js/services/collection-sync-service.js`): mở lại ≈ 1 lượt đọc. Mọi lần ghi câu hỏi đặt `updatedAt`; nhập/tải JSON lên không còn đọc lại toàn bộ; đọc lại toàn bộ mỗi 7 ngày (bắt câu bị xoá ở máy khác) hoặc khi xuất file tĩnh. `updatedAt` không đưa vào file xuất.
- `data-cache-service.js`: thêm `getAsync/setAsync` (IndexedDB, không giới hạn ~5MB); `set()` giờ báo console khi tràn quota thay vì im lặng. Chuyển sang IndexedDB: báo cáo `quiz_results` (tới 10.000 bài ≈ 4,5 triệu ký tự), kết quả gần đây giáo viên/điều phối, roster điều phối/giáo viên, danh sách tài khoản + tra cứu admin, roster-manager (nay dùng chung mọi tab).
- Ghi chú: Battle Quiz bản cũ (trước commit mini-game) đọc tới 300 câu/chủ đề/giờ/học sinh — đã bỏ ở bản trước.
- `auth-guard.js`: sửa lỗi kẹt màn "Đang kiểm tra đăng nhập..." khi auth trả lời trước DOMContentLoaded (`showDenied` tìm `#edu-guard-card` trong overlay chưa gắn vào trang).

## 00. Mini-game: hấp dẫn hơn, không dùng Firebase

- Gỡ Firebase SDK + App Check khỏi `battle-quiz`, `pz-defense`, `cyber-detective`, `computer-simulator`. Trước đây mỗi lượt chơi ghi `game_sessions` nhưng rules chỉ cho admin ghi → luôn bị từ chối, vẫn tốn request. Giờ 7 game = 0 request Firebase.
- `battle-quiz.js`: câu hỏi lấy từ `data/ic3/minitests` (file tĩnh, bỏ đọc collection `questions` và `quiz_data.json` cũ). "Bảng xếp hạng" (học sinh không đọc được) → **Kỷ lục của bạn**: top 10 ván trên máy, báo "Kỷ lục mới". Mỗi ván tối thiểu 10 XP; XP màn kết quả khớp XP thật được cộng.
- `gamification.js`: thẻ phần thưởng cuối ván (+XP, thanh cấp độ chạy, LÊN CẤP + pháo giấy, huy hiệu mới); **nhiệm vụ hằng ngày** chơi 3 ván → +30 XP; 6 huy hiệu mới (10/50 lượt, Nhà thám hiểm 5 game, nhiệm vụ ngày ×1/×7, cấp 5). Không còn ghi Firestore.
- Mọi game cộng XP kể cả khi chưa chọn tên ở sảnh; Memory Game bắt đầu cộng XP (theo số sao). Thêm âm thanh/pháo giấy chung cho các game chưa có.
- `index.html`: thêm dải Cấp/XP/huy hiệu/nhiệm vụ hôm nay ở đầu Khu Vui Chơi (trước đây `#lobbyGameStrip` không tồn tại nên học sinh không thấy XP); tự cập nhật khi đóng game.

## 0. Giảm lượt đọc Firestore: hồ sơ Social, hồ sơ đăng nhập, tra cứu admin

- Mới `js/services/profile-cache-service.js` (`EduProfileCache`): cache `gvlab_profiles` trong IndexedDB + đồng bộ delta theo `updatedAt`. `portfolio.js`, `teaching-schedule.js` không còn đọc lại toàn bộ hồ sơ (kèm avatar base64 ~300KB/hồ sơ) mỗi lần mở trang: trong 2 phút = 0 lượt đọc, sau đó chỉ đọc hồ sơ có thay đổi (~1 lượt), đọc lại toàn bộ mỗi 24 giờ. Avatar trên topbar (`dashboard-page.js`, `teacher/dashboard.js`, `teaching-schedule.js`) dùng chung cache.
- `auth.js`: hồ sơ `users/{uid}` lưu thêm sessionStorage 5 phút — chuyển qua lại giữa các trang quản trị không tốn 1 lượt đọc/trang. Xoá khi đăng xuất.
- `teaching-schedule.js`: map Mã NV → tài khoản cache localStorage 30 phút (admin đổi Mã NV thì tự xoá).
- `admin-users.js`: danh sách trường/lớp/GV (suy từ ~1.466 học sinh) lưu localStorage 30 phút, mở lại trang không đọc lại cả roster. Vòng tự sửa "Trường được xem" chỉ chạy với dữ liệu roster vừa đọc; gán lớp xong thì đọc lại roster.

## 0a. Thử thách cùng lớp: sửa rò timer, hiện kết quả cá nhân

- `js/live-quiz.js`: vòng đếm giờ không còn nhân đôi theo mỗi snapshot (dùng 1 handle, dọn khi rời phòng).
- Màn "Đáp án" báo riêng cho từng học sinh: chính xác / chưa đúng / chưa trả lời kịp.
- Danh sách người chơi tự xếp theo điểm khi phòng đã bắt đầu.

## 0b. Thử thách cùng lớp: chống spam tạo phòng

- `firestore.rules`: thêm `live_hosts/{uid}`; tạo phòng phải kèm ghi `lastCreatedAt` trong cùng batch, cách lần trước ≥ 30 giây. Cần **publish lại rules**.
- `js/live-quiz.js`: tạo phòng bằng batch (host doc + room).

## 0c. Rà soát quota Firestore cho hàng nghìn học sinh/ngày

- Dashboard giáo viên/điều phối: tải kết quả tăng dần (`listRecentCached`), không đọc lại 1.000 bài mỗi lần làm mới.
- `autosave-service.js`: tắt backup Firestore của bài thi MOS (collection `mos_exam_sessions` chưa có rule nên luôn bị từ chối; nếu bật lại dễ ghi ~135 lượt/HS). Khi bật lại: throttle 5 phút + chỉ ghi khi snapshot đổi. IndexedDB vẫn lưu mỗi lần.
- Ước tính 1.000 HS/ngày: ghi ≈ 1 lượt/bài nộp (quiz_results/mos_submissions); đọc phía học sinh ≈ 0 (dữ liệu câu hỏi/roster là file tĩnh).

## 0d. Quản lý học sinh / Lịch giảng dạy: bớt đọc-ghi thừa

- `roster-manager.js`: thêm/sửa/xoá 1 khoá học-lớp-học sinh không còn đọc lại toàn bộ roster (~1.600 lượt đọc/lần) mà chỉ đọc lại 1 bản ghi và cập nhật cache. Nạp Excel bỏ qua học sinh không đổi (trước đây ghi lại tất cả). Cache trang 15 phút.
- `teaching-schedule.js`: lưu lịch của 1 giáo viên chỉ đọc lại đúng document đó, không tải lại lịch cả đội.

## 0e. Rà soát đọc/ghi: báo cáo IC3, quản lý câu hỏi, tài khoản, Social

- `dashboard.js` (Báo cáo IC3): tải tăng dần thay vì đọc lại tới 10.000 `quiz_results` mỗi lần cache hết hạn; cache localStorage.
- `image-manager.js`: sau mỗi lần sửa/xoá/thêm câu hỏi cập nhật cache tại chỗ (trước đây xoá cache → lần mở sau đọc lại cả ngân hàng câu hỏi); TTL 30 phút.
- `admin-users.js`: thao tác ghi chỉ đọc lại danh sách tài khoản, giữ danh sách trường/lớp/GV (suy ra từ ~1.466 học sinh) 30 phút.
- `portfolio.js`: feed Social 30→12 bài, chứng chỉ 200→60 (mỗi bài mang ảnh base64, trang công khai tốn băng thông).

## 0f. Hình ảnh câu hỏi nhẹ hơn, tải ổn định hơn

- 34/46 ảnh câu hỏi trong `img/` được thu về tối đa 1200px rộng và nén lại (11,8MB → 8,1MB). Tên file và tỉ lệ ảnh giữ nguyên nên vùng bấm (`regions`, tính theo %) vẫn đúng. Bản gốc lưu ngoài repo.
- `quiz-engine.js`: tải trước ảnh của câu kế tiếp; ảnh lỗi không còn bị ẩn lặng lẽ mà hiện thông báo + nút "Tải lại hình"; bỏ `loading="lazy"` cho ảnh của câu đang làm.

## 0g. Nén thêm ảnh

- `img/cpu.png`, `mainboard.png`, `ssd.png` → tối đa 900px; 14 ảnh `img/portfolio/*.jpg` → 1280px, chất lượng 80; `img/anim/loading.gif` 1,4MB → 0,5MB (màn "đang kiểm tra đăng nhập" của mọi trang nhân sự). `404.gif` giữ nguyên (chỉ giảm ~15%, không đáng đổi chất lượng).

## 0h. Đăng nhập: hết "tự reload", bớt đọc hồ sơ lặp

- `auth-guard.js`: chỉ bắn `edu:ready` một lần cho mỗi tài khoản (trước đây onAuthStateChanged bắn lại làm dashboard quay về "Đang tải...").
- `auth.js` `onAuthReady()`: không gọi lại callback khi cùng uid; hồ sơ `users/{uid}` dùng chung giữa các nơi trên cùng 1 trang (cache 5 phút, chỉ hồ sơ đã tồn tại) — mỗi lần mở trang giảm 2-3 lượt đọc xuống 1.

## 0i. Khi hết hạn mức Firebase trong ngày

- Dashboard giáo viên/điều phối và Báo cáo IC3: nếu không tải được bài nộp mới (hết lượt đọc, mất mạng) thì vẫn hiện dữ liệu đã lưu kèm thông báo, thay vì lỗi trắng.
- Phòng chơi trực tiếp: báo rõ "hết lượt miễn phí hôm nay, thử lại sau khoảng 14-15h (giờ VN)".
- `teaching-schedule.js`: ảnh đại diện giáo viên đọc 1 lần thay vì listener realtime trên toàn bộ `gvlab_profiles` (mỗi hồ sơ kèm avatar base64 tới ~300KB).
- Đã kiểm tra: bài nộp của học sinh không mất khi hết lượt ghi (SDK giữ trong IndexedDB và tự gửi lại; có thêm bản Google Sheet).

## 0j. Phòng chơi: tải bảng điểm

- Màn kết thúc của người dẫn có nút "Tải bảng điểm (Excel/CSV)": đủ mọi người chơi (không chỉ top 10), xếp hạng theo điểm, mở được bằng Excel (UTF-8 có BOM). Tạo ngay trên máy, không tốn lượt Firebase.
- Âm thanh + pháo giấy (dùng lại `js/game-sfx.js`, `js/game-fx.js`): tiếng bấm khi chọn đáp án, âm đúng/sai khi xem đáp án, pháo giấy khi kết thúc cho top 3 và người dẫn. Phát 1 lần mỗi khoảnh khắc; tôn trọng nút tắt tiếng chung của các mini-game.
- Kết thúc ván: máy người dẫn tự xoá subcollection `answers` (xoá theo uid đã biết, không tốn lượt đọc) vì TTL không dọn subcollection.
- Chuỗi đúng liên tiếp: từ câu đúng thứ 2 liên tiếp thưởng +100/câu (tối đa +500), hiện "🔥 Chuỗi N câu đúng" + âm combo. Lưu trong map `streaks` của document phòng (cần publish lại rules).

## 0 (mới nhất). Click trực tiếp trên ảnh cho câu nối cột (thay vì đọc chữ)

### Tính năng mới: `q.regions` — vùng bấm trên ảnh cho câu "matching"
Thêm khả năng: với câu nối cột (`type: "matching"`) có ảnh, cột trái có
thể hiển thị dưới dạng **ảnh + vùng bấm** thay vì danh sách chữ — học
sinh bấm thẳng vào đúng vị trí trên ảnh (vd. bấm vào đầu cắm USB-C)
thay vì đọc tên rồi tìm trong danh sách.

**Cách bật cho 1 câu hỏi**: thêm field `regions` vào object câu hỏi
trong `quiz_data.json` (rồi chạy `python3 scripts/split-quiz-data.py`
để đồng bộ ra `data/ic3/*.json`):
```json
{
  "uid": "thcs__k6__mt1__q35",
  "type": "matching",
  "imageUrl": "img/Picture38.png",
  "pairs": [...],
  "regions": [
    { "value": "USB",       "x": 1,  "y": 3, "w": 18, "h": 93 },
    { "value": "Micro USB", "x": 23, "y": 3, "w": 15, "h": 93 },
    { "value": "LIGHTNING", "x": 63, "y": 3, "w": 14, "h": 93 },
    { "value": "USB-C",     "x": 83, "y": 3, "w": 16, "h": 93 }
  ]
}
```
- `x, y, w, h`: % theo **kích thước ảnh gốc** (0-100), góc trên-trái.
- `value`: phải khớp **chính xác** 1 chuỗi trong `pairs[].left`.
- Item nào trong `pairs[].left` KHÔNG có `value` tương ứng trong
  `regions` vẫn tự động hiện dạng chữ bên dưới ảnh (không mất đáp án).
- Không có `regions` → câu hỏi hiện dạng chữ như cũ, không đổi gì.

**Cách click hoạt động**: giống hệt cơ chế đang có (nhấn chip đáp án
bên phải → nhấn vào vùng trên ảnh để đặt đáp án) — không đổi cách chấm
điểm, chỉ đổi cách chọn "ô đích" bên trái từ đọc-chữ sang bấm-ảnh.

### Đã áp dụng cho: `thcs__k6__mt1__q35` (câu đầu nối USB — Khối 6)
Toạ độ được đo **bằng phân tích pixel thật** (không ước lượng bằng
mắt): dùng Python phát hiện 5 cụm điểm ảnh tối màu (5 đầu cắm) trên
nền trắng, ra đúng 5 khoảng cột tách biệt rõ ràng, rồi ánh xạ 4/5 đầu
cắm khớp với 4 đáp án theo hình dạng chuẩn (USB-A hình chữ nhật to,
Micro USB hình thang nhỏ, Lightning dẹt bo tròn, USB-C oval đối xứng).
Đầu cắm còn lại (Mini USB, cột "C") không khớp đáp án nào — đây là
**nhiễu có chủ đích** trong ảnh gốc, không gán vùng bấm cho nó.

### CHƯA áp dụng cho 7 câu còn lại — lý do cụ thể từng câu:

| Câu | Ảnh | Vấn đề |
|---|---|---|
| `thcs__k6__mt1__q3` | Picture56.png | **Ảnh sai hoàn toàn với nội dung câu hỏi** — ảnh là màn hình Windows Settings (System/Accounts/Personalization/Ease of Access), còn câu hỏi hỏi về Android/iOS/MacOS/Windows/Chrome OS → hãng phát triển. Khả năng cao bị gán nhầm ảnh từ lúc trích xuất dữ liệu gốc (Word/PDF → ảnh rời). **Cần bạn kiểm tra và gán lại đúng ảnh trong `image-manager.html`.** |
| `thcs__k6__mt1__q4`, `thcs__k6__mt3__q10` | Picture18.jpg | Ảnh có 6 icon (Edge/Word/Excel/PowerPoint/Mail/Calendar) nhưng câu hỏi có đáp án "Hệ thống quản lý cơ sở dữ liệu" — **không có icon nào trong ảnh khớp** (thiếu icon Access). Nếu ép chọn 1 icon bất kỳ sẽ dạy sai. |
| `thcs__k7__mt1__q3`, `thcs__k7__mt4__q12` | Picture29.png | Ảnh chỉ **63×60px** (kích thước 1 icon đơn) — không đủ lớn để tách 4 vùng bấm riêng biệt cho 4 đáp án. |
| `tih__k4__mt1__q35`, `tih__k4__mt4__q13` | Picture50.png | Ảnh là ảnh chụp màn hình Word (Track Changes) với 4 mũi tên A/B/C/D trỏ vào các nút — **nội dung không khớp** với đáp án của câu (câu hỏi về cấu trúc đoạn văn giới thiệu con vật). Cùng loại vấn đề như Picture56 — nhiều khả năng gán nhầm ảnh. |

→ Cả 7 câu này **vẫn hoạt động bình thường ở dạng chữ** (không bị hỏng
gì), chỉ là chưa có trải nghiệm "bấm trên ảnh". Muốn làm thêm câu nào,
gửi mình: câu nào + ảnh nào + đáp án nào tương ứng vùng nào trên ảnh
(hoặc xác nhận lại ảnh đúng nếu là ảnh bị gán nhầm) — mình sẽ đo toạ độ
bằng phân tích pixel như đã làm với câu USB.

---

## 0b. Câu có ảnh (loại 1 đáp án / nhiều đáp án): ẩn nhãn A/B/C/D

Với câu hỏi loại `single` (1 đáp án) và `multi` (nhiều đáp án) **có ảnh
minh hoạ** (`imageUrl`/`image_file`), nút đáp án giờ **không hiện vòng
tròn chữ cái A/B/C/D** nữa — chỉ còn nội dung đáp án, học sinh click
thẳng vào nội dung để chọn (hành vi click/chấm điểm không đổi, chỉ ẩn
nhãn chữ). Câu hỏi **không có ảnh** vẫn hiện A/B/C/D như cũ.

Lưu ý: ngân hàng câu hỏi hiện tại không có câu nào dùng ảnh làm **đáp
án** (ảnh chỉ minh hoạ ngữ cảnh, đáp án luôn là văn bản) — nên đây là
thay đổi giao diện (ẩn nhãn chữ), không phải đổi cách chấm điểm.

Loại `truefalse` (Đúng/Sai) và `matching` (nối cột) không dùng nhãn
A/B/C/D nên không bị ảnh hưởng.

---

## 0b. Dọn trùng lặp còn sót + sửa lỗi HTML thật (validate bằng công cụ)

Sau khi soát lại toàn bộ project bằng `node --check` (JS), `json.load`
(tất cả file JSON), đối chiếu ID giữa từng cặp JS ↔ HTML, và
`html-validate` (bộ validate HTML thật, không đoán):

**🗑️ Xoá 6 file dữ liệu trùng lặp 100% ở `data/` gốc** — đã đối chiếu
md5 từng cặp và xác nhận **giống hệt byte-by-byte** với bản đã tổ chức
trong `data/ic3/raw/`: `minitest_K3_questions.xlsx/csv`,
`minitest_k4_question_bank.xlsx`, `minitest_k5_questions.xlsx`,
`Minitest_K6_QuestionBank.xlsx`, `QuizData_K7_4Minitests.xlsx`,
`QuizData_K8_4Minitest.xlsx`. Đây là hậu quả của việc merge zip cũ +
zip mới vào cùng 1 thư mục — giờ `data/` chỉ còn duy nhất `data/ic3/`.

**✅ Sửa 49/68 lỗi HTML thật** (chạy `html-validate index.html
ic3-dashboard.html image-manager.html`), gồm 3 nhóm lặp lại nhiều lần:
- Thêm `type="button"` cho **32 thẻ `<button>`** thiếu (mặc định trình
  duyệt coi là `type="submit"`, có thể vô tình submit form/reload trang).
- Thêm `scope="col"` cho 5 thẻ `<th>` trong bảng báo cáo (dashboard) —
  yêu cầu WCAG cho accessibility (screen reader đọc đúng cột).
- Mã hoá ký tự `&` thô thành `&amp;` (2 chỗ) và thêm `aria-label` cho
  9 nút toggle chỉ có icon, không có chữ (dùng đúng text của `<label>`
  đứng cạnh, vd. `aria-label="Chặn tự sửa điểm"`).

**⚠️ 19 lỗi còn lại (`no-inline-style`) — CỐ Ý CHƯA SỬA:** đây là các
thuộc tính `style="..."` viết trực tiếp trên thẻ HTML (chủ yếu ở
`ic3-dashboard.html`). Đây là **quy tắc phong cách** (nhiều dự án không
bật rule này), không phải lỗi làm hỏng chức năng. Chuyển hết sang class
CSS cần thời gian kiểm thử kỹ (một số style là layout 1 lần, tách ra
class mới có thể tạo thêm rủi ro). Nếu bạn muốn dọn nốt, nhắn mình làm
tiếp — nhưng ưu tiên thấp hơn các lỗi chức năng đã sửa ở trên.

**🔗 Đã xác minh liên kết JS ↔ HTML bằng script đối chiếu ID** (không
đoán): `js/quiz-engine.js` ↔ `index.html`, `js/dashboard.js` ↔
`ic3-dashboard.html`, `js/image-manager.js` ↔ `image-manager.html` —
**khớp 100%**, kể cả các ID tưởng như "thiếu" (`newSetName`,
`newSetLink`...) thực chất được `dashboard.js` tự tạo động qua
`innerHTML` khi mở modal "Tạo bộ đề mới", không phải lỗi.

---

## 0b. Cập nhật trước đó: sửa lỗi nghiêm trọng + gắn kết các trang

**🔴 Lỗi nghiêm trọng đã sửa:** `index.html` và `ic3-dashboard.html` có
dấu xung đột merge Git chưa giải quyết (`<<<<<<< HEAD ... =======
... >>>>>>>`) — khiến 2 file này không phải HTML hợp lệ (bản code cũ
monolithic và bản refactor mới nằm chồng lên nhau). Đây là nguyên nhân
VS Code báo lỗi đỏ trên 2 file. Đã resolve bằng cách giữ đúng nhánh
HEAD (bản refactor mới, khớp mục 1-5 bên dưới), loại bỏ hoàn toàn bản
code cũ trùng lặp.

**📁 Tách hoàn toàn HTML / CSS / JS (MỚI):** trước đây `ic3-dashboard.html`
và `image-manager.html` mỗi file có ~700-1500 dòng CSS/JS viết thẳng
trong `<style>`/`<script>` nội tuyến. Đã tách ra:
- `css/dashboard.css` + `js/dashboard.js` ← từ `ic3-dashboard.html`
- `css/image-manager.css` + `js/image-manager.js` ← từ `image-manager.html`
- `js/main.js` ← đoạn script khởi tạo nhỏ còn lại trong `index.html`

Giờ cả 3 trang `.html` chỉ còn phần khung (markup), không còn CSS/JS
viết tay bên trong — sửa giao diện thì vào `css/`, sửa hành vi thì vào
`js/`, không phải kéo lên xuống trong 1 file HTML dài cả nghìn dòng nữa.

**🧹 Dọn file rác trùng lặp ở gốc dự án:** phát hiện `googleSheet.js`,
`quiz-engine-upgrade.js`, `Code.gs` ở thư mục gốc là **bản cũ, không
còn được bất kỳ trang nào gọi tới** (bản đang dùng thật nằm ở
`js/googleSheet.js`, `js/quiz-engine.js`, `apps/Code.gs`) — đã chuyển
vào `legacy/` để đối chiếu khi cần, không xóa hẳn. Riêng `quiz_schema.sql`
ở gốc trùng **y hệt** `docs/quiz_schema.sql` (chỉ khác xuống dòng
CRLF/LF) nên đã xóa bản trùng, giữ lại bản trong `docs/`.

**🎨 Gắn kết giao diện — `css/theme.css` (MỚI):** Trước đây 3 trang
`index.html` (qua `style.css`), `ic3-dashboard.html`, `image-manager.html`
mỗi trang tự khai báo bộ biến màu `:root` riêng — `ic3-dashboard.html`
dùng tông tím khác hẳn (`#6366f1`) so với 2 trang kia (`#6c63ff`), tên
biến cũng khác (`--bg-main` vs `--bg`). Đã gộp thành 1 file
`css/theme.css` là **nguồn duy nhất** cho màu thương hiệu, bo góc, đổ
bóng dùng chung. `ic3-dashboard.html` giữ lại vài token riêng của nó
(đổ bóng thẻ 3D, màu tag khối lớp) vì đặc thù layout, còn lại đều tham
chiếu `css/theme.css`.
→ **Muốn đổi màu thương hiệu toàn nền tảng: chỉ sửa `css/theme.css`.**

**🔗 Liên kết điều hướng:** `image-manager.html` có nút "← Dashboard"
quay về `ic3-dashboard.html`; `ic3-dashboard.html` có nút "🎓 Xem trang
học sinh" mở `index.html` ở tab mới. `index.html` (trang học sinh) cố
tình KHÔNG có link sang khu quản trị, tránh học sinh vô tình mở nhầm.

**Cấu trúc file/thư mục mới nhất:**
```
EduQuiz/
├─ index.html              (chỉ markup — trang học sinh)
├─ ic3-dashboard.html       (chỉ markup — dashboard giáo viên)
├─ image-manager.html       (chỉ markup — công cụ quản lý ảnh)
├─ quiz_data.json
│
├─ css/
│  ├─ theme.css              (★ token màu/bo góc/đổ bóng DÙNG CHUNG)
│  ├─ dashboard.css          (★ MỚI — CSS riêng dashboard)
│  └─ image-manager.css      (★ MỚI — CSS riêng image-manager)
├─ style.css                 (CSS riêng của index.html, nạp SAU theme.css)
│
├─ js/
│  ├─ quiz-engine.js         (engine DUY NHẤT cho index.html)
│  ├─ gamification.js        (XP / streak / huy hiệu)
│  ├─ googleSheet.js         (gửi kết quả lên Google Sheet)
│  ├─ main.js                (★ MỚI — khởi tạo index.html)
│  ├─ dashboard.js           (★ MỚI — hành vi ic3-dashboard.html)
│  └─ image-manager.js       (★ MỚI — hành vi image-manager.html)
│
├─ legacy/                   (bản cũ giữ để đối chiếu/rollback — KHÔNG dùng)
│  ├─ quiz-engine.old.js
│  ├─ googleSheet.old.js
│  ├─ quiz-engine-upgrade.old.js
│  └─ Code.old.gs
│
└─ (data/, img/, apps/, docs/, scripts/ — không đổi, xem mục 1 gốc)
```

---

File này ghi lại **những gì đã thay đổi** so với bản gốc, **vì sao**, và
**những việc cần làm tiếp** — dựa trên bản phân tích 4 khía cạnh
(UX, Content, Storage, Maintainability) đã trao đổi trước đó.

> ⚠️ Đây là bản refactor có kiểm chứng logic + syntax-check kỹ, nhưng
> **chưa được test trên trình duyệt thật** (môi trường build không có
> GUI browser). Trước khi đưa lên GitHub Pages, hãy mở `index.html`
> bằng 1 local server (vd. `npx serve .` hoặc VS Code Live Server) và
> thử làm hết 1 bài thi để chắc chắn mọi thứ chạy đúng như log console
> mô tả bên dưới.

---

## 1. Cấu trúc thư mục mới

```
EduQuiz/
├─ index.html              (trang làm bài — học sinh)
├─ ic3-dashboard.html       (dashboard — không đổi, chưa có dữ liệu động)
├─ image-manager.html       (công cụ quản lý ảnh — vẫn chỉnh quiz_data.json)
├─ style.css
├─ quiz_data.json           (★ vẫn giữ — xem mục 3 "Vì sao giữ file này")
│
├─ js/
│  ├─ quiz-engine.js         (★ engine DUY NHẤT — hợp nhất từ bản "upgrade")
│  ├─ gamification.js        (★ MỚI — XP / streak / huy hiệu)
│  └─ googleSheet.js         (gửi kết quả lên Google Sheet, không đổi logic)
│
├─ apps/
│  └─ Code.gs                (Google Apps Script — thêm LockService + doGet leaderboard)
│
├─ data/
│  └─ ic3/
│     ├─ meta.json           (★ MỚI — nhẹ, chỉ số lượng câu hỏi, cho lobby)
│     ├─ THCS__LV1.json      (★ MỚI — câu hỏi đầy đủ Khối 6)
│     ├─ THCS__LV2.json      (Khối 7) · THCS__LV3.json (Khối 8)
│     ├─ TIH__LV1.json       (Khối 3) · TIH__LV2.json (Khối 4) · TIH__LV3.json (Khối 5)
│     └─ raw/                (file Excel/CSV gốc, đổi tên thống nhất k3..k8)
│
├─ img/                      (giữ nguyên, phẳng — xem mục 4)
│
├─ scripts/
│  └─ split-quiz-data.py     (★ MỚI — sinh lại data/ic3/*.json từ quiz_data.json)
│
├─ legacy/
│  └─ quiz-engine.old.js     (bản engine cũ, giữ lại để đối chiếu/rollback)
│
└─ docs/
   └─ quiz_schema.sql        (schema tham khảo, không đổi)
```

## 2. Đã làm gì, theo đúng 4 mục đã phân tích

### (A) Hợp nhất 2 bản engine trùng lặp
Dự án gốc có `quiz-engine.js` (bản cũ, đang được `index.html` dùng) và
`quiz-engine-upgrade.js` (bản mới hơn, nhiều tính năng hơn nhưng
**chưa từng được gắn vào `index.html`**). Hai file này trùng lặp phần lớn
logic (anti-cheat, lưu lịch sử, theme...).

→ Đã chọn bản "upgrade" làm nền (nhiều tính năng hơn, tách bạch rõ với
`googleSheet.js`), đặt tên lại thành `js/quiz-engine.js` duy nhất, và
**gắn nó vào `index.html`** — đây là lần đầu tiên các cải tiến trong bản
upgrade thực sự chạy trên trang. Bản cũ được giữ ở `legacy/` để đối chiếu,
không xoá hẳn để có thể rollback.

### (B) Tải dữ liệu theo khối (lazy-load) — tối ưu tốc độ
Trước đây `fetch('quiz_data.json')` tải nguyên **~1MB** ngay khi mở trang,
dù học sinh chỉ làm 1 khối/1 minitest.

→ `js/quiz-engine.js` giờ tải `data/ic3/meta.json` (~3KB) trước để dựng
3 dropdown ở lobby. Chỉ khi bấm "Bắt đầu thi", nó mới tải đúng 1 file
của khối đang chọn (`data/ic3/THCS__LV1.json` ≈ 70-140KB) — nhỏ hơn
7-15 lần so với trước.

Có **3 lớp fallback** để không bao giờ làm trang trắng:
`meta.json` lỗi → tự tải nguyên `quiz_data.json` như cũ → vẫn lỗi →
dùng `DEMO_DATA` có sẵn trong code.

### (C) Gamification cơ bản (không cần backend mới)
`js/gamification.js` là module độc lập, tự quản lý state riêng trong
`localStorage['eduquiz_gamestate']`, không đụng vào logic chấm điểm/anti-cheat
hiện có:
- **XP**: +10/câu đúng, +50/bài hoàn thành, +100 nếu đạt điểm tuyệt đối.
- **Cấp độ**: tính theo ngưỡng XP (10 cấp).
- **Streak**: số ngày làm bài liên tiếp (dựa theo ngày hệ thống của máy học sinh).
- **Huy hiệu**: "Bài đầu tiên", "3/7 ngày liên tiếp", "Điểm tuyệt đối", "10 bài đã làm".

Hiển thị ở lobby (`#lobbyGameStrip`) và có toast báo khi mở khoá huy hiệu mới.
Đây là bản MVP — xem mục 5 để mở rộng lên bảng xếp hạng thật.

### (D) Bảng xếp hạng (leaderboard) — endpoint mới trong Apps Script
`apps/Code.gs` thêm hàm `doGet(e)`: gọi `APPS_SCRIPT_URL + '?action=leaderboard&limit=10'`
(có thể thêm `&class=6A1`) để lấy top điểm cao từ chính Sheet đang lưu kết quả —
**không cần thêm database mới**. Đây mới là *backend endpoint*; front-end
hiển thị bảng xếp hạng (vd. trên `ic3-dashboard.html`) là bước tiếp theo,
xem mục 5.

Cũng đã thêm `LockService` vào `doPost()` để tránh mất dữ liệu khi
nhiều học sinh nộp bài cùng lúc (bản gốc chưa có khoá ghi).

### (E) Chuẩn hoá nguồn dữ liệu thô
File Excel/CSV gốc (`Minitest_K6_QuestionBank.xlsx`, `QuizData_K7_4Minitests.xlsx`...)
được copy và **đổi tên** vào `data/ic3/raw/k3_questions.xlsx` ... `k8_questions.xlsx`
— quy ước tên thống nhất. **Lưu ý quan trọng**: các file này hiện chỉ mang tính
lưu trữ/tham khảo — ứng dụng KHÔNG đọc trực tiếp từ Excel (xem mục 3), vì
cấu trúc cột giữa các khối khác nhau hoàn toàn (đã kiểm tra thực tế, K5 có
1 sheet/câu hỏi kiểu bảng, còn K6/K7/K8 chỉ có sheet tổng hợp thống kê).
Chuẩn hoá triệt để cấu trúc cột cần làm thủ công cho từng khối — xem mục 5.

---

## 3. Vì sao vẫn giữ `quiz_data.json` ở gốc?

`image-manager.html` (công cụ quản lý ảnh) đọc/ghi trực tiếp file này và
đã hoạt động tốt. Việc bẻ nó ra nhiều file nhỏ sẽ đòi hỏi viết lại toàn bộ
tool đó (615+ dòng) — rủi ro cao hơn lợi ích trong lần refactor này.
→ Quyết định: **giữ `quiz_data.json` làm "nguồn sự thật" mà admin chỉnh sửa**,
còn `data/ic3/*.json` là **bản build phái sinh** để app học sinh tải nhanh hơn.

### Quy trình cập nhật câu hỏi/ảnh (không cần sửa code)
1. Mở `image-manager.html` → sửa câu hỏi/ảnh như bình thường → "Xuất quiz_data.json".
2. Thay file `quiz_data.json` ở gốc dự án bằng file vừa xuất.
3. Chạy: `python3 scripts/split-quiz-data.py`
4. Commit cả `quiz_data.json` lẫn toàn bộ `data/ic3/*.json` mới sinh ra.

Nếu quên bước 3, học sinh vẫn thấy dữ liệu **cũ** (vì app đọc từ `data/ic3/`,
không đọc trực tiếp `quiz_data.json` nữa) — image-manager.html giờ tự nhắc
điều này ngay trong toast lúc xuất file.

---

## 4. Vì sao KHÔNG tách `img/` thành thư mục con theo khối?

Đã cân nhắc, nhưng `image-manager.html` build đường dẫn ảnh dạng phẳng
(`img/<filename>`) ở nhiều chỗ trong code. Tách thư mục sẽ phải sửa tool
đó + toàn bộ `image_file` trong `quiz_data.json` cùng lúc — dễ gây lệch
dữ liệu nếu làm vội. Việc này để ở mục 5 (bước tiếp theo) khi có thời gian
kiểm thử kỹ hơn.

Việc **đã làm ngay** được: không tải ảnh thừa — quiz chỉ tải ảnh của câu
đang hiển thị (`loading="lazy"` sẵn có ở thẻ `<img>` do engine sinh ra
qua `_buildImageBlock`) — nếu chưa có, kiểm tra và thêm `loading="lazy"`
là việc nhỏ, nên làm sớm.

---

## 5. Việc nên làm tiếp (chưa làm trong lần này, để tránh phá vỡ hệ thống đang chạy)

| Việc | Vì sao chưa làm | Độ ưu tiên |
|---|---|---|
| Nén ảnh trong `img/` (4.8MB → ~1-1.5MB) | Cần công cụ nén ảnh (sharp/imagemin), không có sẵn trong môi trường build này | Cao |
| Hiển thị bảng xếp hạng trên `ic3-dashboard.html` bằng endpoint `doGet` mới | Cần `SHEET_ID` thật của bạn để test được — hiện `Code.gs` vẫn để placeholder | Cao |
| Chuẩn hoá cột Excel nguồn theo đúng `docs/quiz_schema.sql` cho cả 6 khối | Cấu trúc 5 file Excel gốc khác nhau hoàn toàn, cần bạn xác nhận layout chuẩn muốn dùng trước khi viết parser | Trung bình |
| Tổ chức lại `img/` theo khối | Phụ thuộc việc sửa `image-manager.html` cùng lúc | Trung bình |
| Đưa vào Vite, giữ vanilla JS | An toàn để làm độc lập, không phụ thuộc các việc trên | Trung bình |
| Cá nhân hoá "ôn lại phần yếu" dựa trên lịch sử `localStorage` | Cần thêm thống kê chi tiết theo dạng câu hỏi vào `saveRecord()` | Thấp |

---

## 6. Kiểm thử trước khi deploy

```bash
# Chạy local server ở thư mục gốc EduQuiz/ rồi mở http://localhost:5000
npx serve . -l 5000
```

Checklist thủ công:
- [ ] Mở `index.html`, console không có lỗi đỏ, thấy log
      `[EduQuiz] ✅ meta.json nạp thành công (lazy-load câu hỏi theo khối)!`
- [ ] Chọn Category → Level → Minitest, số câu hiện đúng ở khung thống kê
- [ ] Bấm "Bắt đầu thi": nút chuyển sang "⏳ Đang tải câu hỏi..." rồi vào bài
      đúng minitest đã chọn (kiểm tra vài câu đầu khớp với `data/ic3/*.json`)
- [ ] Làm hết bài, nộp bài, thấy toast huy hiệu "🎉 Bài đầu tiên"
- [ ] Bấm "Về Lobby", dải XP/Streak ở góc trái cập nhật số mới
- [ ] Mở lại `image-manager.html`, vẫn tải và sửa `quiz_data.json` bình thường
- [ ] Dán `SHEET_ID` thật + deploy lại `apps/Code.gs`, chạy `testDoPost()` để
      chắc chắn `LockService` không làm hỏng luồng ghi cũ
