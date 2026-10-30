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
