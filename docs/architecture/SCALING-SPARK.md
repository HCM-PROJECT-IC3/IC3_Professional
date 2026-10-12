# Mùa ôn thi: hàng chục – hàng trăm nghìn bài nộp/ngày trên gói Spark

Tài liệu trả lời 2 câu hỏi: **(1) có thể chia website để không vượt hạn mức Firebase
Spark không**, và **(2) code đã được tách để mỗi tác vụ ghi đúng 1 nơi chưa**. Số liệu đo
10/2026; các con số ước lượng được ghi rõ là ước lượng.

## 1. Kết luận ngắn

- **Không thể** giữ mọi bài nộp trên Firestore gói Spark khi có hàng trăm nghìn bài/ngày:
  mỗi bài = 1 lượt ghi, trần là 20.000 lượt/ngày (ngân sách an toàn 12.000). Tối ưu code
  phía dashboard không thay đổi được con số này.
- **Có thể** chia hệ thống theo **chức năng**, không chia theo bản sao:
  - **Trang học sinh** (làm bài, game, mô phỏng, MOS) thành web tĩnh, mở trang **không nạp
    Firebase**. Bài nộp lưu vào **Google Sheet** (không tính hạn mức Firebase) và chỉ ghi
    Firestore theo chế độ chọn trong `js/backend-config.js`.
  - **Trang quản trị** (tài khoản, roster, lịch dạy, dashboard, phòng thử thách) vẫn dùng
    project Firebase `data-ic3` như hiện tại.
  - Google Sheet có thể chia tiếp **theo trường**: mỗi trường hoặc cụm trường có một Apps
    Script và một file Sheet riêng.
- **Không nên** nhân bản thành nhiều project Firebase miễn phí chỉ để "lách" hạn mức (xem §4A).

## 2. Mỗi tác vụ ghi vào đâu (sau đợt này)

| Tác vụ | File | Ghi vào | Firebase |
|---|---|---|---|
| Chọn đích cho bài nộp | `js/backend-config.js` | — (cấu hình) | — |
| Dựng payload + gửi + xếp hàng gửi lại | `js/services/result-submitter.js` | gọi 2 module dưới | — |
| Ghi Google Sheet | `js/googleSheet.js` → `apps/Code.gs` | Sheet theo trường (`sheetEndpoints`) | 0 |
| Ghi Firestore | `js/firestore-results.js` | `quiz_results` | 1 ghi/bài (nếu chế độ cho phép) |
| Nạp Firebase khi cần | `js/services/firebase-loader.js` | — | SDK chỉ tải khi ghi hoặc khi máy có phiên giáo viên |
| Gửi lại khi lỗi | `js/services/pending-sync-queue.js` | đích ban đầu | — |
| Chấm điểm, hiện kết quả | `js/quiz-engine.js` | localStorage | 0 |
| Kết quả MOS | `js/mos-submissions.js` | `mos_submissions` | 1 ghi/bài, SDK nạp lúc lưu |

`quiz-engine.js` không còn tự dựng payload hay gọi Sheet/Firestore (đã bỏ khoảng 90 dòng),
mà chỉ gọi `EduResultSubmitter.submitQuiz(...)`. Google Sheet và Firestore dùng **chung một mã
bài**, nên gửi lại (kể cả sau khi tải lại trang) không tạo bản trùng ở cả hai nơi.

## 3. Chế độ ghi Firestore cho bài nộp (`EduBackend.quizResults.firestore`)

| Chế độ | Firestore ghi | Dashboard giáo viên thấy | Dùng khi |
|---|---|---|---|
| `'all'` (mặc định, như cũ) | mọi bài | mọi bài | ≤ ~9.000 bài/ngày |
| `'test-only'` | chỉ bài "Kiểm tra" | bài Kiểm tra; bài Ôn luyện xem ở Sheet | số bài Kiểm tra ≤ ~9.000/ngày |
| `'off'` | 0 | không có bài mới, xem ở Sheet | ngày cao điểm lớn hơn nữa |

Mốc ~9.000 lấy từ docs/FIREBASE-CHECKLIST.md §6: sau bài nộp còn phải chừa chỗ cho phòng
thử thách. Đổi chế độ = sửa 1 dòng rồi deploy; bài đã nộp không bị ảnh hưởng.

Ở mọi chế độ, Google Sheet luôn nhận đủ mọi bài (`sheet: true`). Nếu ai đó tắt Sheet trong
khi Firestore cũng không nhận bài thì code vẫn gửi Sheet, để bài không bị mất.

### Ước lượng theo số bài/ngày (N)

| N bài/ngày | `'all'`: ghi Firestore | TTL xoá/ngày (trần 20.000) | Dung lượng 45 ngày (trần 1 GiB) | Gợi ý |
|---|---|---|---|---|
| 9.000 | 9.000 (45%) | 9.000 | ~0,75 GB | `'all'` |
| 30.000 | 30.000 (150%) ✗ | 30.000 ✗ | ~2,5 GB ✗ | `'test-only'` |
| 100.000 | 100.000 (500%) ✗ | 100.000 ✗ | ~8,5 GB ✗ | `'off'` hoặc `'test-only'` nếu ít bài Kiểm tra |
| 300.000 | 300.000 (1500%) ✗ | ✗ | ✗ | `'off'` + chia Sheet theo trường |

(Mỗi `quiz_results` ~1,9 KB sau khi tắt index, theo `js/firestore-results.js`. TTL xoá cũng
tính vào hạn mức **20.000 lượt xoá/ngày**, đây là trần thứ hai mà trước đây chưa tính.)

## 4. Các cách "chia" đã cân nhắc

### A. Nhiều project Firebase (chia theo trường) — không khuyến nghị
- Rules của project B không đọc được tài khoản đăng nhập ở project A. Giáo viên phải có tài
  khoản riêng ở từng project, và `admin-users.html` phải tạo tài khoản N lần.
- Báo cáo admin phải gộp N project; mỗi project phải tự publish rules/indexes/TTL và cấu hình App Check.
- Điều khoản Google API cấm cố tình lách giới hạn sử dụng. Nhân bản một hệ thống ra nhiều
  project miễn phí chỉ để cộng dồn hạn mức có nguy cơ bị khoá.
- Chỉ hợp lý khi mỗi đơn vị (Sở/Phòng/trường) **thật sự tự sở hữu và vận hành** bản riêng của mình.

### B. Chia theo chức năng — **đã làm phần code** (§2, §3)

### C. Realtime Database cho bài nộp — không khuyến nghị làm nguồn chính
Gói Spark của RTDB không giới hạn số lượt ghi, nhưng chỉ cho 100 kết nối đồng thời, 1 GB lưu
trữ và 10 GB tải xuống/tháng. Báo cáo admin đọc toàn bộ bài sẽ hết 10 GB rất nhanh, và mọi
dashboard đều phải viết lại.

### D. Lên gói Blaze (trả theo dùng)
Blaze vẫn giữ phần miễn phí như Spark, chỉ tính tiền phần vượt. Theo bảng giá Firestore
(cần xem lại giá hiện hành theo region của `data-ic3`), 200.000 ghi/ngày ≈ 180.000 ghi vượt
× ~0,18 USD/100.000 ≈ **0,3 USD/ngày (~10 USD/tháng)**, chưa tính lưu trữ vượt 1 GB. Nếu đơn
vị chi được khoản này, Blaze kèm budget alert là cách ít rủi ro nhất để giữ mọi bài trên
dashboard (vẫn nên để mặc định `'all'`).

## 5. Các điểm nghẽn ngoài Firestore (phải xử lý cùng lúc)

### 5.1 App Check / reCAPTCHA — 10.000 lượt xác minh/THÁNG
Khi project chưa bật thanh toán, reCAPTCHA chỉ có gói Essentials miễn phí 10.000 lượt/tháng.
Vượt mức thì reCAPTCHA trả lỗi cho mọi request mới. Mỗi phiên trang khởi tạo App Check tốn
1 lượt.
- Trước đợt này, mọi học sinh mở `index.html` đều tốn 1 lượt. Nay chỉ phiên **thật sự ghi
  Firestore** mới tốn (Firebase nạp theo yêu cầu).
- Dù vậy, `'all'` hoặc `'test-only'` với vài nghìn bài/ngày vẫn vượt 10.000 lượt/tháng.
  **Đừng bấm Enforce App Check cho Firestore** khi học sinh còn ghi Firestore ở quy mô này:
  token hỏng thì bài nộp bị từ chối và nằm mãi trong hàng đợi. Muốn Enforce thì phải bật
  thanh toán hoặc chuyển sang `'off'`.
- Nếu không Enforce, có thể đặt `firebaseSdk.appCheck: false` trong `js/backend-config.js` để
  trang học sinh khỏi tốn lượt reCAPTCHA. Rules vẫn kiểm tra dữ liệu như cũ.

### 5.2 Apps Script / Google Sheet
- **Đã sửa** `apps/Code.gs`: trước đây mỗi bài nộp đọc lại **toàn bộ** cột mã bài trong lúc
  giữ khoá chung. Ở 100.000 dòng, mỗi bài phải đọc 100.000 ô, nên các lượt nộp xếp hàng rồi
  hết giờ. Nay chống trùng bằng CacheService (6 giờ), khoá chỉ bao quanh `appendRow`.
- **Đã sửa:** một file Sheet tối đa 10 triệu ô. Khi tab nhật ký vượt 300.000 dòng, script tự
  tạo file mới `NhatKyNopBai <ngày giờ>` và ghi đường dẫn vào tab `DanhMucNhatKy` của file chính.
  Tab `ThongKe` (công thức QUERY) chỉ thống kê file chính; muốn thống kê file mới thì chạy lại
  `setupThongKeSheet_` trên file đó.
- **Giới hạn còn lại:** mỗi tài khoản Google chỉ chạy song song 30 lượt Apps Script. Ước lượng
  (chưa đo tải thật) mỗi script ghi được khoảng 3–10 bài/giây, tức chừng vài chục nghìn đến
  ~100.000 bài/ngày nếu nộp rải đều trong giờ học. Đã giảm dồn cục bằng 2 cách: rải ngẫu nhiên
  0–4 giây trước khi gửi (`sheetJitterMs`), và hàng đợi giữ bài tới khi gửi được (bài có mã cố định).
- **Chia theo trường:** `EduBackend.quizResults.sheetEndpoints = { 'Tên trường': 'URL Apps Script' }`.
  Mỗi URL là một bản `apps/Code.gs` deploy từ **tài khoản Google riêng**, vì giới hạn 30 lượt
  tính theo tài khoản. Gợi ý: một script cho mỗi ~50.000 bài/ngày. Trước mùa thi nên thử tải
  thật bằng một bản deploy thử.

### 5.3 Băng thông hosting (GitHub Pages: 100 GB/tháng, giới hạn mềm)
Đo bằng Chrome headless: lần đầu mở `index.html` tải **~1,16 MB chưa nén**. GitHub Pages có
gzip nên thực tế ước chừng 0,4–0,5 MB, chưa tính ảnh câu hỏi và file đề. 100.000 máy mới/ngày
≈ 45 GB/ngày, tức hết 100 GB/tháng trong khoảng 2 ngày, và GitHub có thể ngừng phục vụ trang.
- **Khuyến nghị:** đưa trang học sinh lên host tĩnh không giới hạn băng thông (ví dụ
  Cloudflare Pages gói Free) với một tên miền riêng; trang quản trị có thể ở lại GitHub Pages.
  Đây chính là cách "chia website" có lợi nhất.
- Khi đổi tên miền, phải thêm tên miền mới vào: key reCAPTCHA (App Check), Firebase
  Authentication → Authorized domains, và `robots.txt`/link chia sẻ nếu có.
- Không dùng Firebase Hosting cho trang học sinh: gói Spark chỉ cho 10 GB/tháng.

## 6. Việc cần làm khi deploy đợt này

1. **Apps Script:** dán `apps/Code.gs` mới → Deploy → *Manage deployments* → Edit → *New
   version* (giữ nguyên URL). Lần chạy đầu sẽ xin quyền tạo file Sheet (`SpreadsheetApp.create`).
2. Deploy web như thường lệ. Mặc định `firestore: 'all'` nên dashboard hoạt động như cũ.
3. Trước mùa ôn thi: chọn chế độ theo §3, cân nhắc chia Sheet theo trường (§5.2) và chuyển
   host trang học sinh (§5.3).
4. Thử: làm 1 bài ở `index.html`, F12 → Network. Lúc mở trang **không** có request
   `firebasejs`; sau khi nộp có POST tới `script.google.com` (và Firestore nếu chế độ cho phép).

## 7. Kiểm thử đã chạy

- `node js/services/__tests__/result-submitter.test.js`: 21/21 PASS (chính sách định tuyến,
  payload, cùng mã bài, xếp hàng khi Firestore chưa phản hồi). CI tự chạy test này.
- `scripts/check-js.js` (137 file), `scripts/validate-data.js`, toàn bộ unit test cũ: đạt.
- Chrome headless, **chặn mọi host Google/Firebase** (không ghi dữ liệu thật): mở `index.html`
  không tải SDK Firebase, không lỗi JS; nộp ở `'all'` thì nạp SDK lúc nộp, gửi 2 đích cùng mã
  và xếp hàng khi lỗi; `'off'` không nạp SDK, chỉ gửi Sheet; máy có phiên đăng nhập thì tự nạp
  Firebase Auth (vào thẳng Khu Vui Chơi như cũ); `mos-practice.html` không nạp SDK lúc mở.
- **Chưa kiểm** trên Firebase/Apps Script thật: phần `Code.gs` mới (chống trùng bằng cache,
  xoay vòng file) cần chạy thử sau khi deploy.
