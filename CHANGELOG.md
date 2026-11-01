# Nhật ký thay đổi — EduQuiz IC3

Ghi những thay đổi người dùng thấy được và việc cần làm khi triển khai.
Chi tiết kỹ thuật từng đợt: xem lịch sử git của file này và commit tương ứng.

## Khi triển khai bản mới

Thứ tự: Apps Script → `firestore.rules`/index → đẩy web.

1. `node scripts/check-deployed-backend.js` — Apps Script đang chạy phải khớp `BACKEND_VERSION`.
   Lệch thì dán `apps/Code.gs`, chạy `kiemTraSauDeploy`, Deploy → New version.
2. Publish rules và index (cần nếu chưa làm từ đợt 26/10 và 29/10: `teacher_sync`,
   giáo viên tự nhập lịch, `arena_relay`):
   `firebase deploy --only firestore:rules,firestore:indexes --project data-ic3`
3. Firebase Console → Authentication → Anonymous: **Enabled** (đường dự phòng Phòng cả lớp).
   App Check: không Enforce.
4. Kiểm tra nhanh trên bản thật:
   - Điểm danh → Cài đặt → "Đồng bộ ngay" báo đã lưu; đăng nhập máy khác thấy đủ link.
   - Tài khoản Điều phối mở Báo cáo kết quả: chỉ thấy trường của mình.
   - Giáo viên nhập lịch từ Excel tổ sau khi đồng nghiệp vừa nhập: không báo lỗi quyền.
   - F12 → Console, lọc "lượt đọc Firestore": danh sách học sinh chỉ vài lượt mỗi lần mở.
     Lệch dữ liệu thì đặt `rosterDeltaSync: false` trong `js/backend-config.js`.

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
